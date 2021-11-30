export async function seed(knex) {
  // Deletes ALL existing entries
  await knex("users").del();
  await knex("transactions").del();
  await knex("users").insert([{ id: 1, barcode: "21822057499743" }]);
  await knex("transactions").insert([{ id: 1, user_id: 1, cents: 1337 }]);
}
