const data = {
  "Cold Brew Coffee": {
    cents: 100,
    barcode: "488348702402",
  },

  "Madeline Cookie": {
    cents: 100,
    barcode: "697941861007",
  },

  "Kirkland Ice Cream Bars": {
    cents: 100,
    barcode: "482573882311",
  },

  "Nestle Ice Cream": {
    cents: 100,
    barcode: "411337930531",
  },

  "York Peppermint Pattie": {
    cents: 10,
    barcode: "034000066421",
  },
};

export async function seed(knex) {
  for (let [name, details] of Object.entries(data)) {
    try {
      await knex.transaction(async (trx) => {
        let item_id = (
          await trx("inventory").insert([{ name, cents: details.cents }])
        )[0];
        await trx("barcodes").insert([{ barcode: details.barcode, item_id }]);
      });
    } catch (e) {
      console.log(e);
    }
  }
}
