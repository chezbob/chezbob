// This transaction adds a quantity field to the transactions table.
// For most transactions, this is trivially 1, but when we deal with
// continuous values like ounces of coldbrew, we don't want to create
// a new transaction for each ounce, so we use the count field.
//
// Technically, this isn't required, we could just set the transaction
// cost and forget about it, but that wouldn't be compatible with future
// efforts to track inventory.
//
// Note, this does not require us to update balances because the
// transaction cost is still stored directly on the transaction.
// If we wanted to work backwards and find the price of the item at
// transaction time we could to: trx.cents / trx.count.
// (we really never need to do that.)

export async function up(knex) {
  await knex.schema.alterTable("transactions", (t) => {
    t.smallint("count").unsigned().defaultTo(1);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("transactions", (t) => {
    t.dropColumn("count");
  });
}
