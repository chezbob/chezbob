export function up(knex) {
    return knex.schema.createTable('inventory', (table) => {
        table.increments('id');
        table.string('name', 255).notNullable();
        table.integer('cents').notNullable();
        table.integer('stock').notNullable();
        table.string('barcode').notNullable().unique();
    });
}


export function down(knex) {
    return knex.schema.dropTable('inventory');
}
