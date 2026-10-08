/**
 * The inventory service that powers all of chezbob's persisted state
 */

import { ReconnectingSocket } from "reconnecting-socket";
import { db } from "db";
import { pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const MIN_BALANCE = -Infinity; // Minimum balance a user can hold (currently disabled)

let inventory = await ReconnectingSocket.connect(
  process.env.RELAY_SERVER,
  "inventory"
);

function user_info() {
  return db("users")
    .select(["users.id as id", "username", "balance"])
    .join("balances", "balances.id", "=", "users.id");
}

// `info_req` is a request for information about a barcode or nfc code
// The inventory service will return either a `user_info` or an `item_info`
// object so callers should handle both cases. If it is neither,
// expect an `item_not_found` error.
inventory.handle("info_req", async (msg) => {
  console.log(msg);
  let src = msg.header.from;
  let response_to = msg.header.id;
  let barcode = msg.body.barcode;

  // To keep things simple, let's just do two queries. Remember, chez bob has an
  // incredibly low QPS and is hosted on a single network so it's okay to be a little
  // wasteful in the name of being clear.

  // First up: is it an item?
  let items = await db("inventory")
    .join("barcodes", "barcodes.item_id", "=", "inventory.id")
    .select(["inventory.id as id", "name", "barcode", "cents"])
    .where({ barcode })
    .limit(1);

  if (items.length === 1) {
    return {
      header: {
        type: "item_info",
      },
      body: items[0],
    };
  }

  // Okay, not an item... is it a user?
  let users = await user_info()
    .join("barcodes", "barcodes.user_id", "=", "users.id")
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
      type: "item_not_found",
    },
    error: "Unknown barcode",
  };
});

inventory.handle("deposit_money", async (deposit_money) => {
  const user_id = deposit_money.body?.user_id;
  const cents = deposit_money.body?.cents;

  if (typeof user_id !== "number" || typeof cents !== "number") {
    throw new Error(" Invalid deposit_money request: ", deposit_money);
  }

  // TODO: Evaluate the perf of this. Might need to denormalize
  let balance = (await db("balances").where({ id: user_id }))[0].balance;
  let new_balance = balance + cents;

  // Then insert the transaction
  await db("transactions").insert([{ user_id, cents: cents }]);

  return {
    header: {
      type: "deposit_money_success",
    },
    body: {
      balance: new_balance,
    },
  };
});

inventory.handle("add_user_card", async (add_user_card) => {
  const user_id = add_user_card.body?.user_id;
  const barcode = add_user_card.body?.barcode;
  console.log(typeof user_id);
  if (typeof user_id !== "number" || typeof barcode !== "string") {
    throw new Error("Invalid add_user_card request: ", add_user_card);
  }

  await db.transaction(async (trx) => {
    // Check to make sure this barcode isn't already registered
    const existing = await trx("barcodes").where({ barcode }).limit(1);
    if (existing.length !== 0) {
      if (existing[0].user_id === user_id) {
        throw new Error("Card already registered to your account");
      } else {
        throw new Error("Card already registered to another account");
      }
    }

    await trx("barcodes").insert({
      barcode,
      user_id,
    });
  });

  return {
    header: {
      type: "add_user_card_success",
    },
    body: {},
  };
});

inventory.handle("login", async (attempt) => {
  const username = attempt.body?.username;
  const password = attempt.body?.password;

  if (typeof username !== "string") {
    throw new Error("Invalid request: ", attempt);
  }

  let users = await db("users").where({ username }).limit(1);
  users
  if (users.length !== 1) {
    throw new Error("Invalid username/password");
  }

  const user = users[0];

  console.log(user);

  if (user.password_hash) {
    const hashed = await perform_hash(password, user.password_salt);
    if (hashed !== user.password_hash) {
      throw new Error("Invalid username/password");
    }
  } else {
    if (password !== "") {
      throw new Error("Invalid username/password");
    }
  }

  const balance = (await db("balances").where({ id: user.id }).limit(1))[0]
    .balance;

  return {
    header: {
      type: "user_info",
    },
    body: {
      id: user.id,
      username,
      balance,
    },
  };
});

async function perform_hash(pwd, salt) {
  return (await promisify(pbkdf2)(pwd, salt, 1000, 64, "sha512")).toString(
    "hex"
  );
}

inventory.handle("set_password", async (set_password) => {
  const user_id = set_password.body?.user_id;
  const password = set_password.body?.password;

  if (!user_id || !password) {
    return console.error("Invalid set_password request: ", set_password);
  }

  const password_salt = randomBytes(64).toString("hex");
  const password_hash = await perform_hash(password, password_salt);

  await db("users").where({ id: user_id }).update({
    password_hash,
    password_salt,
  });

  return {
    header: {
      type: "set_password_success",
    },
    body: {},
  };
});

// Purchasing
inventory.handle("purchase", async (purchase) => {
  const user_id = purchase.body?.user_id;
  const item_id = purchase.body?.item_id;

  if (!user_id || !item_id) {
    return console.error("Invalid request: ", purchase);
  }

  // First, confirm the item exists. Ultimately this would be unncesary
  // if we fully trusted the client to call info_req first, but better
  // safe than sorry.
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

// `update_info` is an administration endpoint for editing the set of
// known items in chezbob. It functions as an "upsert", so if the item_info
// comes with an id, we'll update the record, otherwise we'll create a new one.
inventory.handle("update_info", async (item_info) => {
  console.log(item_info);
  // If an id is not provided, we need to insert
  let id = item_info.body.id;
  if (id === null) {
    console.log("Creating new item");

    // Be sure to use a transaction since we have to update both the inventory
    // and the barcode tables together. This ensures consistency.
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

inventory.handle("view_transactions", async (request) => {
  const { body: { user_id } = {} } = request;
  if (!user_id) {
    return console.error("Invalid request: ", request);
  }
  const transactions = await db("transactions")
    // left join preserves null item_id
    .leftJoin("inventory", "transactions.item_id", "inventory.id")
    .select(["inventory.name", "transactions.cents", "transactions.created_at"])
    .where({ user_id });
  return {
    header: {
      type: "transaction_history",
    },
    body: {
      transactions: transactions.map(({ name, cents, created_at }) => ({
        name,
        cents,
        created_at,
      })),
    },
  };
});
