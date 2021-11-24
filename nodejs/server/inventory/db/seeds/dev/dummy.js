export async function seed(knex) {
  await knex('inventory').del();
  return knex('inventory').insert([
    {id: 1, name: 'Reeses Peanutbutter Cup', barcode: '1234', cents: 110, stock: 0},
    {id: 2, name: 'Red Bull', barcode: '0000', cents: 50, stock: 1}
  ])
}