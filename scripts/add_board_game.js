/*
    The add_transaction script reads a list of pairs of emails + item_ids
    (one per line) from stdin and creates transactions for all of them.

    Common usage:   cat transactions.txt | node scripts/add_transactions.js

    In this example, the transactions.txt file should have each line look
    like this:

        Terraforming Mars
        Settlers of Catan
        Mancala

    to add transactions where the user associated with email abc@ucsd.edu
    purchased the item with ID 1234, and so on.

*/

import { db } from "db";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "readline/promises";

const BATCH_SIZE = 100;
const rl = readline.createInterface({ input, output });
const games = [];

rl.on("line", (line) => {
  const name = line.trim();
  games.push(name);
});

rl.on("close", async () => {
  for (let i = 0; i < games.length; i += 1) {
    const name = games[i];

    const id_ = await db("board_game_inventory")
      .select(["id"])
      .orderBy("id", "desc")
      .limit(1);

    const id = id_[0]["id"] + 1;
    const barcode = String(id).padStart(6, '0');

    const full_entry = { id, name, barcode };

    console.log(`Inserting entry for ${name}.`);
    await db("board_game_inventory").insert(full_entry);
  }

  process.exit(0);
});
