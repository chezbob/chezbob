export function up(knex) {
  return knex.schema.createTable("board_game_transactions", (table) => {
    table.increments("id");
    table.integer("user_id").references("id").inTable("users").notNullable();
    table.enum("status", ["check_out", "check_in"]).notNullable();
    table
      .integer("item_id")
      .references("id")
      .inTable("board_game_inventory")
      .notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now()).notNullable();
  });
}

export function down(knex) {
  return knex.schema.dropTable("board_game_transactions");
}
