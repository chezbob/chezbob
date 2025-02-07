export async function up(knex) {
  return knex.schema.createTable("game_transactions", (table) => {
    table.increments("id");
    table.integer("user_id").references("id").inTable("users").notNullable();
    table.enum("action", ["check_out", "check_in"]).notNullable();
    table
      .integer("item_id")
      .references("id")
      .inTable("game_inventory")
      .notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex) {
  return knex.schema.dropTable("game_transactions");
}
