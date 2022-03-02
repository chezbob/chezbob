export async function up(knex) {
  return knex.schema.createTable("transactions", (table) => {
    table.increments("id");
    table.integer("user_id").references("id").inTable("users").notNullable();
    // You may be thinking, why record the amount when we have a reference to the inventory item?
    // Two reasons:
    //   1. This table also tracks deposits
    //   2. The price could have changed since the transaction
    table.integer("cents").notNullable();
    table.integer("item_id").references("id").inTable("inventory");
  });
}

export async function down(knex) {
  return knex.schema.dropTable("transactions");
}
