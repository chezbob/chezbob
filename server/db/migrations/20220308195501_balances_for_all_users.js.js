/**
 * This migration fixes a bug in the implementation of the balances view.
 * Previously, users would only have a balance if they also had a transaction in the system.
 * This meant new users had an undefined balance rather than 0.
 *
 * We fix this problem by basing balances off a join of users and transactions
 * rather than just transaction
 */

export async function up(knex) {
  await knex.raw(`DROP VIEW IF EXISTS balances`);
  await knex.raw(`
        CREATE VIEW balances(id, balance) AS
            SELECT users.id as id, COALESCE(SUM(cents), 0) as balance
            FROM users LEFT JOIN transactions ON transactions.user_id = users.id
            GROUP BY users.id
    `);
}

export async function down(knex) {}
