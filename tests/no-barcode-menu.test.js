// Run with: node --experimental-vm-modules --test tests/no-barcode-menu.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as crypto from "node:crypto";
import * as util from "node:util";
import * as menuDatabase from "../db/no-barcode-menu.js";
import * as menuView from "../web/static/internal/apps/pos/no-barcode-menu.js";
import * as money from "../web/static/js/money.js";
import { seed } from "../db/seeds/barcode-menu.js";

// Optional external dependency directory keeps isolated test installs out of the repo.
const require = createRequire(process.env.CHEZBOB_TEST_DEPS
  ? `${process.env.CHEZBOB_TEST_DEPS}/package.json` : import.meta.url);
const knex = require("knex");

async function sourceModule(path, context, dependencies) {
  const module = new vm.SourceTextModule(readFileSync(new URL(path, import.meta.url), "utf8"), { context });
  await module.link((name) => {
    const values = dependencies[name];
    assert.ok(values, `Unexpected import ${name}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

async function inventoryService(db) {
  const handlers = new Map();
  const service = { handle: (name, handler) => handlers.set(name, handler) };
  await sourceModule("../inventory/inventory.js", vm.createContext({
    process: { env: { RELAY_SERVER: "test" } }, console: { log() {}, error() {} },
  }), {
    "reconnecting-socket": { ReconnectingSocket: { connect: async () => service } },
    db: { db }, "node:crypto": crypto, "node:util": util,
    "../db/no-barcode-menu.js": menuDatabase,
  });
  return { request: (message) => handlers.get(message.header.type)(message) };
}

async function database(t) {
  const db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
  t.after(() => db.destroy());
  await db.schema.createTable("inventory", (table) => {
    table.increments("id"); table.text("name"); table.integer("cents");
  });
  await db.schema.createTable("barcodes", (table) => {
    table.increments("id"); table.text("barcode").unique();
    table.integer("item_id"); table.integer("user_id");
  });
  await db.schema.createTable("transactions", (table) => {
    table.increments("id"); table.integer("user_id"); table.integer("item_id"); table.integer("cents");
  });
  await db.schema.createTable("users", (table) => {
    table.increments("id"); table.text("username");
  });
  await db("users").insert({ id: 1, username: "tester" });
  await db.raw("CREATE VIEW balances AS SELECT users.id, COALESCE(SUM(transactions.cents), 0) AS balance FROM users LEFT JOIN transactions ON transactions.user_id = users.id GROUP BY users.id");
  return db;
}

test("migration preserves legacy item IDs and prices, and runs only once", async (t) => {
  const db = await database(t);
  await db("inventory").insert({ id: 41, name: "Existing Drumstick", cents: 245 });
  await db("barcodes").insert({ barcode: "072554870262", item_id: 41 });
  await menuDatabase.ensureMenuSchema(db);
  assert.deepEqual(await menuDatabase.menuItems(db), [{ id: 41, name: "Existing Drumstick", cents: 245, category: "Freezer" }]);
  await db("no_barcode_menu").delete();
  await menuDatabase.ensureMenuSchema(db);
  assert.deepEqual(await menuDatabase.menuItems(db), []);
  assert.equal((await db("inventory").first()).cents, 245);
});

test("fresh database seeds create the menu, while reruns preserve hidden choices", async (t) => {
  const db = await database(t);
  await seed(db);
  assert.equal((await menuDatabase.menuItems(db)).length, menuDatabase.legacyMenu.length);
  const item = await db("inventory").first();
  await db("inventory").where({ id: item.id }).update({ cents: 987 });
  await db("no_barcode_menu").where({ item_id: item.id }).delete();
  await seed(db);
  assert.equal((await db("inventory")).length, menuDatabase.legacyMenu.length);
  assert.equal((await db("inventory").where({ id: item.id }).first()).cents, 987);
  assert.equal((await menuDatabase.menuItems(db)).length, menuDatabase.legacyMenu.length - 1);
});

test("price check, purchase and restock work by ID without a barcode", async (t) => {
  const db = await database(t);
  const socket = await inventoryService(db);
  await db("inventory").insert({ id: 1367, name: "Kahiki Chicken Rice Bowl", cents: 362 });
  await db("no_barcode_menu").insert({ item_id: 1367, category: "Freezer" });
  const items = await menuView.loadMenu(socket);
  assert.equal(items[0].id, 1367);
  const info = await socket.request({ header: { type: "info_req" }, body: { item_id: 1367 } });
  assert.equal(info.header.type, "item_info");
  assert.equal(info.body.cents, 362);
  const receipt = await socket.request({ header: { type: "purchase" }, body: { user_id: 1, item_id: 1367 } });
  assert.equal(receipt.body.balance, -362);
  assert.equal((await db("transactions").first()).cents, -362);
  await socket.request({ header: { type: "update_info" }, body: { id: 1367, name: "Kahiki Chicken Rice Bowl", cents: 400, barcode: "" } });
  assert.equal((await menuView.loadMenu(socket))[0].cents, 400);
  assert.equal((await db("barcodes")).length, 0);
  await db("no_barcode_menu").delete();
  assert.deepEqual(await menuView.loadMenu(socket), []);
  await assert.rejects(() => socket.request({ header: { type: "info_req" }, body: { item_id: 1367 } }), /no longer/);
  await assert.rejects(() => menuDatabase.menuItem(db, "1367"), /Invalid item/);
});

test("menu escapes names/categories and supports an empty menu", () => {
  const html = menuView.menuContent([{ id: 1, name: '<img src=x onerror="alert(1)">', category: "Coffee & Drinks" }]);
  assert.match(html, /Coffee &amp; Drinks/);
  assert.ok(!html.includes("<img"));
  assert.match(html, /data-item-id="1"/);
  assert.match(menuView.menuContent([]), /No items/);
});

test("actual POS modes load current menu, check price and purchase by ID", async (t) => {
  const db = await database(t);
  const socket = await inventoryService(db);
  await db("inventory").insert({ id: 1, name: "Kahiki", cents: 362 });
  await db("no_barcode_menu").insert({ item_id: 1, category: "Freezer" });
  const window = {};
  const context = vm.createContext({ window, socket, console: { log() {} }, set_mode: (mode) => { window.mode = mode; } });
  const modes = await sourceModule("../web/static/internal/apps/pos/mode.js", context, {
    "../../../js/money.js": money, "./no-barcode-menu.js": menuView,
  });
  modes.NoBarcodePriceCheck.prototype.render = () => {};
  modes.Purchases.prototype.render = () => {};
  const priceCheck = new modes.NoBarcodePriceCheck();
  await new Promise(setImmediate);
  assert.match(priceCheck.content, /Kahiki/);
  await priceCheck.select_item({ currentTarget: { dataset: { itemId: "1" } } });
  assert.equal(window.mode.item.cents, 362);
  const purchase = new modes.ManualPurchase({ id: 1, username: "tester", balance: 0 }, []);
  await new Promise(setImmediate);
  await purchase.select_item({ currentTarget: { dataset: { itemId: "1" } } });
  assert.equal(window.mode.user.balance, -362);
  assert.equal(window.mode.purchases[0].id, 1);
  await db("no_barcode_menu").delete();
  const refreshed = new modes.ManualPurchase({ id: 1, balance: -362 }, []);
  await new Promise(setImmediate);
  assert.match(refreshed.content, /No items/);
  window.mode = refreshed;
  await refreshed.select_item({ currentTarget: { dataset: { itemId: "1" } } });
  assert.equal(window.mode, refreshed);
  assert.match(refreshed.error.message, /no longer/);
  assert.equal((await db("transactions")).length, 1);
});
