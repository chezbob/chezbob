import menu from "../../web/static/js/known-barcodes.js";

export async function seed(knex) {
  for (let [name, details] of Object.entries(menu)) {
    await knex.transaction(async (trx) => {
      let item_id = (
        await trx("inventory").insert([{ name, cents: details.defaultCents }])
      )[0];
      console.log(item_id, name, details.barcode);
      try {
        await trx("barcodes").insert([{ barcode: details.barcode, item_id }]);
      } catch (e) {
        console.log("Already present");
        await trx.rollback();
      }
    });
  }
}
