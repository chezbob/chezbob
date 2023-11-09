/*
    The reset_password script reads a list of emails (one per line) from stdin
    and resets the password (to blank) for all of them.

    Common usage:   cat user.txt | node scripts/reset_password.js


    The usernames of the generated users are pulled from the email:
        
        foo@email.com

    results in:

        | username |        foo       |
        -------------------------------
        |    foo   |  foo@email.com   |

*/

import { db } from "db";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "readline/promises";

const BATCH_SIZE = 100;
const rl = readline.createInterface({ input, output });
const emails = [];

rl.on("line", (line) => {
  const email = line.trim();
  const split = email.split("@");
  if (split.length !== 2) {
    console.error(`Invalid email: '${email}'`);
    return;
  }
  const username = split[0];
  emails.push({ email, username });
});

rl.on("close", async () => {
  let conflicts = [];
  let inserted_count = 0;

  // We need to process the list of emails in chunks because sqlite will get mad
  // Technically we could do this as the emails come in through STDOUT. This would
  // allow us to not have to hold the whole list in JS memory but eh, it's fine.
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, Math.min(emails.length, i + BATCH_SIZE));
    const existing = await db("users")
      .select(["username", "email"])
      .whereIn(
        "username",
        batch.map((e) => e.username)
      )
      .orWhereIn(
        "email",
        batch.map((e) => e.email)
      );

    const existingEmails = new Set(existing.map((c) => c.email));
    const existingUsernames = new Set(existing.map((c) => c.username));
    const validExisting = batch.filter((e) =>
      existingEmails.has(e.email) || existingUsernames.has(e.username)
    );
    users = users.concat(validExisting);

    if (users.length > 0) {
      console.log(`Resetting batch of ${validEmails.length} emails.`);
      await db("users").update(password_hash: '', password_salt: '').where("username", users.map(e) => e.username);
      inserted_count += users.length;
    }
  }

  console.log(`Inserted ${inserted_count} emails!`);
  process.exit(0);
});
