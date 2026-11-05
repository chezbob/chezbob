/*
    The mark_inactive_users script sets users.inactive for every user:

      inactive = 1  if the user has no transactions in the past year
      inactive = 0  otherwise (so users who come back are reactivated)

    Users with no transactions at all are marked inactive. Transactions without
    a created_at (recorded before timestamps were added in 2022) count as old.

    The `inactive` column comes from the 20261105000000_users_inactive migration,
    so run `npm run knex --workspace=db -- migrate:latest` first.

    Common usage:   DEPLOYMENT_MODE=production node scripts/mark_inactive_users.js
    Preview only:   DEPLOYMENT_MODE=production node scripts/mark_inactive_users.js --dry-run

    Safe to re-run at any time, e.g. from a cron job.
*/

import { db } from "db";

const dryRun = process.argv.includes("--dry-run");

// Users with at least one transaction in the past year
const recentlyActive = db("transactions")
  .distinct("user_id")
  .where("created_at", ">=", db.raw("datetime('now', '-1 year')"));

try {
  const columns = await db("users").columnInfo();
  if (!("inactive" in columns)) {
    console.error(
      "users.inactive column is missing. Run the db migrations first:\n" +
        "  npm run knex --workspace=db -- migrate:latest"
    );
    process.exit(1);
  }

  const inactiveUsers = await db("users")
    .select(["id", "username", "inactive"])
    .whereNotIn("id", recentlyActive);
  const total = (await db("users").count("id as count").first()).count;

  const newlyInactive = inactiveUsers.filter((u) => !u.inactive);
  const reactivated = await db("users")
    .select(["id", "username"])
    .where("inactive", true)
    .whereIn("id", recentlyActive);

  console.log(`${inactiveUsers.length} of ${total} users are inactive.`);
  console.log(`  ${newlyInactive.length} newly marked inactive`);
  console.log(`  ${reactivated.length} reactivated`);

  if (dryRun) {
    for (const u of newlyInactive) console.log(`  - inactive: ${u.username}`);
    for (const u of reactivated) console.log(`  + active:   ${u.username}`);
    console.log("Dry run, no changes made.");
  } else {
    await db.transaction(async (trx) => {
      await trx("users")
        .whereNotIn("id", recentlyActive)
        .update({ inactive: true });
      await trx("users").whereIn("id", recentlyActive).update({ inactive: false });
    });
    console.log("Updated users.inactive.");
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
