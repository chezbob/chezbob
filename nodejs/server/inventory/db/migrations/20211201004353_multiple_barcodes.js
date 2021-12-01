export async function up(knex) {
  await knex.schema.createTable("barcodes", (table) => {
    table.increments("id");
    table.string("barcode");
    table.integer("user_id").references("id").inTable("users").nullable();
    table.integer("item_id").references("id").inTable("inventory").nullable();
  });

  await knex
    .insert(
      knex("users").select(
        knex.raw("NULL as id, id as user_id, barcode, NULL as item_id")
      )
    )
    .into("barcodes");
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("barcode");
  });

  await knex("barcodes").insert(
    knex("inventory").select(
      knex.raw("NULL as id, id as item_id, NULL as user_id, barcode")
    )
  );
  await knex.schema.alterTable("inventory", (table) => {
    table.dropColumn("barcode");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.string("barcode").unique();
  });
  await knex("users").update({
    barcode: knex("barcodes")
      .select("barcode")
      .where({ user_id: knex.raw("users.id") }),
  });

  await knex.schema.alterTable("inventory", (table) => {
    table.string("barcode").unique();
  });
  await knex("inventory").update({
    barcode: knex("barcodes")
      .select("barcode")
      .where({ item_id: knex.raw("inventory.id") }),
  });
  await knex.schema.dropTable("barcodes");
}
