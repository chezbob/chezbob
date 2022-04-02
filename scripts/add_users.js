/*
    The add_users script reads a list of emails (one per line) from stdin
    and creates users for all of them.

    Common usage:   cat new_user.txt | npm run add_users


    The usernames of the generated users are pulled from the email:
        
        foo@email.com

    results in:

        | username |        foo       |
        -------------------------------
        |    foo   |  foo@email.com   |

    If the username or email exists, the conflict will be printed to stderr
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
    const batch_conflicts = await db("users")
      .select(["username", "email"])
      .whereIn(
        "username",
        batch.map((e) => e.username)
      )
      .orWhereIn(
        "email",
        batch.map((e) => e.email)
      );

    conflicts = conflicts.concat(batch_conflicts);

    const conflictingEmails = new Set(batch_conflicts.map((c) => c.email));
    const conflictingUsernames = new Set(
      batch_conflicts.map((c) => c.username)
    );
    const validEmails = batch.filter(
      (e) =>
        !conflictingEmails.has(e.email) && !conflictingUsernames.has(e.username)
    );

    if (validEmails.length > 0) {
      console.log(`Inserting batch of ${validEmails.length} emails.`);
      await db("users").insert(validEmails);
      inserted_count += validEmails.length;
    }
  }

  for (var c of conflicts) {
    console.log(`CONFLICT SKIPPED: ${c.username}`);
  }
  console.log(`Inserted ${inserted_count} emails!`);
  console.log(`Skipped ${conflicts.length} emails!`);
  process.exit(0);
});
