import { readFileSync } from "node:fs";

// Keep this snapshot for migration only. Runtime menus come from the database.
export const legacyMenu = JSON.parse(
  readFileSync(new URL("./legacy-no-barcode-menu.json", import.meta.url), "utf8")
);

export async function ensureMenuSchema(db) {
  await db.transaction(async (trx) => {
    if (await trx.schema.hasTable("no_barcode_menu")) return;
    await trx.schema.createTable("no_barcode_menu", (table) => {
      table.integer("item_id").primary().references("id").inTable("inventory");
      table.text("category").notNullable();
    });
    // Resolve by barcode, never by name: preserve existing prices and history.
    for (const entry of legacyMenu) {
      const barcode = await trx("barcodes").where({ barcode: entry.barcode }).first();
      if (barcode?.item_id != null) {
        await trx("no_barcode_menu")
          .insert({ item_id: barcode.item_id, category: entry.category })
          .onConflict("item_id").ignore();
      }
    }
  });
}

export function menuItems(db) {
  return db("no_barcode_menu as m")
    .join("inventory as i", "i.id", "m.item_id")
    .select("i.id", "i.name", "i.cents", "m.category")
    .orderBy("m.category").orderBy("i.name").orderBy("i.id");
}

export async function menuItem(db, itemId) {
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    throw new Error("Invalid item ID");
  }
  const item = await menuItems(db).where("i.id", itemId).first();
  if (!item) throw new Error("Item is no longer in the No Barcode menu");
  return item;
}
