// This migration adds the created_at column to transactions
// It's kinda gnarly because sqlite support for altering columns is kinda wack
//
// Basically, the problem is:
//    1. We can't add a column with a non-const default (NOW())
//    2. We can insert the column with a default NULL then populate
//    3. But then we want to change the default to be NOW(),
//       sqlite does this by replacing the table, which brakes the balances view
//
// So this migration re-declares the balances view
export async function up(knex) {
  await knex.schema.dropViewIfExists("balances");
  await knex.schema.alterTable("transactions", (t) => {
    t.timestamp("created_at").nullable();
  });

  await knex("transactions").update("created_at", null);

  await knex.schema.alterTable("transactions", (t) => {
    t.timestamp("created_at").defaultTo(knex.fn.now()).alter();
  });

  await knex.schema.createView("balances", (view) => {
    view.columns(["id", "balance"]);
    view.as(
      knex
        .select(
          "users.id as id",
          knex.raw("COALESCE(SUM(cents), 0) as balance")
        )
        .from("users")
        .leftJoin("transactions", "transactions.user_id", "users.id")
        .groupBy("users.id")
    );
  });
}

export async function down(knex) {
  await knex.schema.alterTable("transactions", (t) => {
    t.dropColumn("created_at");
  });
}
