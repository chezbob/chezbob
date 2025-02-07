export function up(knex) {
  return knex.schema.createTable("board_game_transactions", (table) => {
    table.increments("id");
    table.integer("user_id").references("id").inTable("users").notNullable();
    // Checking out = -1
    // Checking in  =  1
    table.integer("status").notNullable();
    table.integer("item_id").references("id").inTable("inventory");
  });  
};

export function down(knex) {
    return knex.schema.dropTable("board_game_transactions");
};
