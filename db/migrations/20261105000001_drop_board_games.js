// Removes the unused board game tables added by the 20250207 board game migrations
// (those files stay because production's migration history references them).
//
// Refuses to run if any board game data exists, so nothing is silently lost.
export async function up(knex) {
  const tables = ["board_game_transactions", "board_game_inventory"];
  for (const table of tables) {
    if (await knex.schema.hasTable(table)) {
      const { count } = await knex(table).count("* as count").first();
      if (count > 0) {
        throw new Error(`${table} has ${count} rows; not dropping it.`);
      }
    }
  }
  const hasGameId = await knex.schema.hasColumn("barcodes", "game_id");
  if (hasGameId) {
    const { count } = await knex("barcodes")
      .whereNotNull("game_id")
      .count("* as count")
      .first();
    if (count > 0) {
      throw new Error(`${count} barcodes have a game_id; not dropping it.`);
    }
    await knex.schema.alterTable("barcodes", (table) => {
      table.dropColumn("game_id");
    });
  }
  await knex.schema.dropTableIfExists("board_game_transactions");
  await knex.schema.dropTableIfExists("board_game_inventory");
}

// Recreates the tables as the original board game migrations defined them.
export async function down(knex) {
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
  await knex.schema.createTable("board_game_transactions", (table) => {
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
