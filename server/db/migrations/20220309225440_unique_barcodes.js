export async function up(knex) {
  await knex.schema.alterTable("barcodes", function (t) {
    t.unique("barcode");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("barcodes", function (t) {
    t.dropUnique("barcode");
  });
}
