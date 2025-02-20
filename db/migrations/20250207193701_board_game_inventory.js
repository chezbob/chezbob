export async function up(knex) {
  await knex.schema.createTable("board_game_inventory", (table) => {
    table.increments("id");
    table.string("name", 255).notNullable();
  });

  await knex.schema.alterTable("barcodes", (table) => {
    table
      .integer("game_id")
      .references("id")
      .inTable("board_game_inventory")
      .nullable();
  });
}

export async function down(knex) {
  await knex.schema.dropTable("board_game_inventory");

  await knex.schema.alterTable("barcodes", (table) => {
    table.dropColumn("game_id");
  });
}
