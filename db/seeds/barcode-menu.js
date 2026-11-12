import { legacyMenu, ensureMenuSchema } from "../no-barcode-menu.js";

export async function seed(knex) {
  await ensureMenuSchema(knex);
  for (const details of legacyMenu) {
    await knex.transaction(async (trx) => {
      // Re-running seeds must preserve edited prices and hidden menu choices.
      if (await trx("barcodes").where({ barcode: details.barcode }).first()) return;
      const [item_id] = await trx("inventory").insert({
        name: details.name, cents: details.defaultCents,
      });
      await trx("barcodes").insert({ barcode: details.barcode, item_id });
      await trx("no_barcode_menu").insert({ item_id, category: details.category });
    });
  }
}
