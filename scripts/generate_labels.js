/*
    The add_transaction script reads a list of pairs of emails + item_ids
    (one per line) from stdin and creates transactions for all of them.

    Common usage:   cat transactions.txt | node scripts/add_transactions.js

    In this example, the transactions.txt file should have each line look
    like this:

      abc@ucsd.edu,1234
      xyz@ucsd.edu,420

    to add transactions where the user associated with email abc@ucsd.edu
    purchased the item with ID 1234, and so on.

*/

import { db } from "db";

const ids = await db("board_game_inventory")
      .select(["id"]);
