export async function up(knex) {
  return knex.schema.createTable("users", (table) => {
    table.increments("id");
    table.string("email").notNullable().unique();
    table.string("barcode").notNullable().unique();
  });
}

export async function down(knex) {
  return knex.schema.dropTable("users");
}
