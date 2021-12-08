/**
 * This migration creates a users_view VIEW which automatically calculates the user's balance
 * and will house any other such calculated fields in the future
 */

export function up(knex) {
    return knex.raw(`
        CREATE VIEW balances(id, balance) AS
            SELECT user_id as id, SUM(cents) as balance
            FROM transactions 
            GROUP BY user_id
    `)
};

export function down(knex) {
    return knex.raw(`DROP VIEW balances`);
};
