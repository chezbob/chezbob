/*
    The mark_inactive_users script sets users.inactive for every user.

    A user is ACTIVE if any of these is true, and INACTIVE otherwise:
      1. they have a transaction in the past year
      2. their account was created in the past year (users.created_at)
      3. their created_at is unknown (accounts made before it was recorded),
         but their account may still be less than a year old. User ids only go
         up, so an account is definitely over a year old if any user with the
         same or a higher id has a transaction older than a year.

    Rule 3 stops mattering a year after the created_at migration ran, since
    every account without a created_at will be over a year old by then.

    Transactions without a created_at (recorded before timestamps were added
    in 2022) count as older than a year.

    The `inactive` and `created_at` columns come from db migrations, so run
    them first:
        npm run knex --workspace=db -- migrate:latest --env production

    Common usage:   DEPLOYMENT_MODE=production node scripts/mark_inactive_users.js
    Preview only:   DEPLOYMENT_MODE=production node scripts/mark_inactive_users.js --dry-run

    Safe to re-run at any time, e.g. from a cron job.
*/

import { db } from "db";

const dryRun = process.argv.includes("--dry-run");

const CUTOFF = "datetime('now', '-1 year')";
const RECENT_TRANSACTION = `id IN (
  SELECT user_id FROM transactions WHERE created_at >= ${CUTOFF})`;
// Each part is written so it is never NULL, so NOT (...) below is reliable.
const ACTIVE = `(
  ${RECENT_TRANSACTION}
  OR (created_at IS NOT NULL AND created_at >= ${CUTOFF})
  OR (created_at IS NULL AND id > COALESCE(
        (SELECT MAX(user_id) FROM transactions
          WHERE created_at IS NULL OR created_at < ${CUTOFF}),
        9e18))
)`;

try {
  const columns = await db("users").columnInfo();
  if (!("inactive" in columns) || !("created_at" in columns)) {
    console.error(
      "users.inactive or users.created_at is missing. Run the db migrations first:\n" +
        "  npm run knex --workspace=db -- migrate:latest --env production"
    );
    process.exit(1);
  }

  const [stats] = await db.raw(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(NOT ${ACTIVE}), 0) AS inactive,
           COALESCE(SUM(NOT ${ACTIVE} AND NOT inactive), 0) AS newly_inactive,
           COALESCE(SUM(${ACTIVE} AND inactive), 0) AS reactivated,
           COALESCE(SUM(${ACTIVE} AND NOT ${RECENT_TRANSACTION}), 0) AS new_accounts
      FROM users`);

  console.log(`${stats.inactive} of ${stats.total} users are inactive.`);
  console.log(
    `  ${stats.new_accounts} active only because their account is less than a year old`
  );
  console.log(`  ${stats.newly_inactive} newly marked inactive`);
  console.log(`  ${stats.reactivated} reactivated`);

  if (dryRun) {
    const changes = await db.raw(`
      SELECT username, ${ACTIVE} AS active FROM users
       WHERE inactive = ${ACTIVE}
       ORDER BY username`);
    for (const u of changes) {
      console.log(`  ${u.active ? "+ active:  " : "- inactive:"} ${u.username}`);
    }
    console.log("Dry run, no changes made.");
  } else {
    await db.raw(`UPDATE users SET inactive = NOT ${ACTIVE}`);
    console.log("Updated users.inactive.");
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
