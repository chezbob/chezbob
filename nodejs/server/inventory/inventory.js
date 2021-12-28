import { ReconnectingSocket } from "../../common/reconnecting-socket.js";
import knex from "knex";
import config from "./db/knexfile.js";

const MIN_BALANCE = -10_00; // Minimum balance a user can hold

let db = knex(config.development);
let inventory = await ReconnectingSocket.connect(
  process.env.RELAY_SERVER,
  "inventory"
);

inventory.handle("info_req", async (msg) => {
  console.log(msg);
  let src = msg.header.from;
  let response_to = msg.header.id;
  let barcode = msg.body.barcode;

  let items = await db("inventory")
    .join("barcodes", "barcodes.item_id", "=", "inventory.id")
    .select(["inventory.id as id", "name", "barcode", "cents"])
    .where({ barcode })
    .limit(1);

  if (items.length === 1) {
    return {
      header: {
        response_to,
        to: src,
        type: "item_info",
      },
      body: items[0],
    };
  }

  let users = await db("users")
    .select(["users.id as id", "balance"])
    .join("barcodes", "barcodes.user_id", "=", "users.id")
    .join("balances", "balances.id", "=", "users.id")
    .where({ barcode })
    .limit(1);
  if (users.length === 1) {
    return {
      header: {
        response_to,
        to: src,
        type: "user_info",
      },
      body: users[0],
    };
  }
  return {
    header: {
      response_to,
      to: src,
      type: "item_not_found",
    },
    error: "Unknown barcode",
  };
});

inventory.handle("purchase", async (purchase) => {
  const user_id = purchase.body?.user_id;
  const item_id = purchase.body?.item_id;

  if (!user_id || !item_id) {
    return console.error("Invalid request: ", purchase);
  }

  // First, confirm the item exists
  let items = await db("inventory")
    .select(["id", "name", "cents"])
    .where({ id: item_id })
    .limit(1);
  if (items.length === 0) {
    throw new Error("Unknown item");
  }

  let cents = items[0].cents;

  // TODO: Evaluate the perf of this. Might need to denormalize
  let balance = (await db("balances").where({ id: user_id }))[0].balance;
  let new_balance = balance - cents;
  if (new_balance < MIN_BALANCE) {
    throw new Error("Balance too low");
  }

  // Then insert the transaction
  await db("transactions").insert([{ user_id, item_id, cents: -cents }]);

  return {
    header: {
      to: purchase.header.from,
      type: "purchase_success",
    },
    body: {
      item: items[0],
      balance: new_balance,
    },
  };
});

inventory.handle("update_info", async (item_info) => {
  // If an id is not provided, we need to insert
  let id = item_info.body.id;
  if (id === null) {
    console.log("Creating new item");
    await db.transaction(async (trx) => {
      let item_id = (
        await trx("inventory").insert([
          {
            name: item_info.body.name,
            cents: item_info.body.cents,
          },
        ])
      )[0];

      await trx("barcodes").insert({
        barcode: item_info.body.barcode,
        item_id,
      });
    });
  } else {
    await db("inventory").where("id", "=", id).update({
      name: item_info.body.name,
      cents: item_info.body.cents,
    });
  }

  return {
    header: {
      type: "update_success",
    },
    body: {},
  };
});
