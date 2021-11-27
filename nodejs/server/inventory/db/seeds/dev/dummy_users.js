export async function seed(knex) {
  // Deletes ALL existing entries
  return knex("users")
    .del()
    .then(function () {
      // Inserts seed entries
      return knex("users").insert([{ id: 1, barcode: "1111" }]);
    });
}
