export async function seed(knex) {
  // Deletes ALL existing entries
  await knex("users").del();
  await knex("inventory").del();
  await knex("transactions").del();
  await knex("barcodes").del();

  await knex("inventory").insert([
    {
      id: 1,
      name: "Reese's Peanutbutter Cup",
      cents: 110,
    },
    { id: 2, name: "Red Bull", cents: 50 },
  ]);
  await knex("users").insert({ id: 1, email: "chez@bob.com" });
  await knex("transactions").insert([{ id: 1, user_id: 1, cents: 1337 }]);

  await knex("barcodes").insert({ item_id: 1, barcode: "1234" });
  await knex("barcodes").insert({ item_id: 2, barcode: "0000" });
  await knex("barcodes").insert({ user_id: 1, barcode: "1111" });
}
