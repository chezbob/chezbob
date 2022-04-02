export async function seed(knex) {
  // Deletes ALL existing entries
  let [reeses_id, redbull_id] = await knex("inventory").insert([
    {
      name: "Reese's Peanutbutter Cup",
      cents: 110,
    },
    { name: "Red Bull", cents: 50 },
  ]);
  let [user_id] = await knex("users").insert({
    email: "chez@bob.com",
    username: "bob",
  });
  await knex("transactions").insert([{ user_id, cents: 1337 }]);

  await knex("barcodes").insert({ item_id: reeses_id, barcode: "1234" });
  await knex("barcodes").insert({ item_id: redbull_id, barcode: "0000" });
  await knex("barcodes").insert({ user_id, barcode: "1111" });
}
