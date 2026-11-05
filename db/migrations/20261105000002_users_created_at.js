// Records when each user account is created.
//
// sqlite can't ADD COLUMN with a CURRENT_TIMESTAMP default, so a trigger fills it
// in on insert instead. That covers every place that creates users (web/api.js,
// scripts/add_users.js, admin-web user tools) without changing them.
//
// Accounts that existed before this migration keep created_at = NULL (unknown).
export async function up(knex) {
  if (!(await knex.schema.hasColumn("users", "created_at"))) {
    await knex.schema.alterTable("users", (table) => {
      table.timestamp("created_at").nullable();
    });
  }
  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS users_set_created_at
    AFTER INSERT ON users
    FOR EACH ROW WHEN NEW.created_at IS NULL
    BEGIN
      UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `);
}

export async function down(knex) {
  await knex.raw("DROP TRIGGER IF EXISTS users_set_created_at");
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("created_at");
  });
}
