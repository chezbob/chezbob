/*
    The refund script reads a list of pairs of emails + item_ids
    (one per line) from stdin and creates refunds for all of them.

    Common usage:   cat transactions.txt | node scripts/refund.js

    In this example, the transactions.txt file should have each line look
    like this:

      abc@ucsd.edu,1234
      xyz@ucsd.edu,420

    to add transactions where the user associated with email abc@ucsd.edu
    wants a refund for the item with ID 1234, and so on.

*/

import { db } from "db";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "readline/promises";

const BATCH_SIZE = 100;
const rl = readline.createInterface({ input, output });
const transactions = [];

rl.on("line", (line) => {
  const entry = line.trim();
  const split = line.split(",");
  if (split.length !== 2) {
    console.error(`Incorrect number of arguments`);
    return;
  }
  const email = split[0];
  const item_id = split[1];
  transactions.push({ email, item_id });
});

rl.on("close", async () => {
  for (let i = 0; i < transactions.length; i += 1) {
    const entry = transactions[i];

    const user_id_ = await db("users")
      .select(["id"])
      .where("email", "=", entry.email);

    const cents_ = await db("inventory")
      .select(["cents"])
      .where("id", "=", entry.item_id);

    const id_ = await db("transactions")
      .select(["id"])
      .orderBy("id", "desc")
      .limit(1);

    const id = id_[0]["id"] + 1;
    const user_id = user_id_[0]["id"];
    const cents = cents_[0]["cents"];
    const item_id = parseInt(entry.item_id);

    const full_entry = { id, user_id, cents, item_id };

    console.log(`Inserting transaction for ${entry.email}.`);
    await db("transactions").insert(full_entry);
  }

  process.exit(0);
});
