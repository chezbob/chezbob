// Adds an `inactive` flag to users. It is filled in by scripts/mark_inactive_users.js
// (users with no transactions in the past year).
//
// ADD COLUMN in sqlite doesn't rebuild the table, so the balances view is unaffected.
export async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.boolean("inactive").notNullable().defaultTo(false);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("inactive");
  });
}
