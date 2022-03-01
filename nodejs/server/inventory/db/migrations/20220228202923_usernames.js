export async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.string("username").notNullable().unique().index();
    table.string("password_hash");
    table.string("password_salt");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropIndex("username");
    table.dropColumn("username");
    table.dropColumn("password_hash");
    table.dropColumn("password_salt");
  });
}
