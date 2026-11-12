import { ensureMenuSchema } from "../no-barcode-menu.js";

export async function up(knex) {
  await ensureMenuSchema(knex);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("no_barcode_menu");
}
