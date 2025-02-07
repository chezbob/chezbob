export function up(knex) {
  return knex.schema.createTable("board_game_inventory", (table) => {
    table.increments("id");
    table.string("name", 255).notNullable();
    table.string("barcode").notNullable().unique();
  });
};

export function down(knex) {
    return knex.schema.dropTable("board_game_inventory");
};
