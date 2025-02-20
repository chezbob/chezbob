# Database

## Migrations

### When should I create a migration?

If you are making any structural change to the database, like adding/changing a column, creating a table, etc.

### How do I create a migration?

1. In `chezbob/`, `cd` to the `db/` directory
2. `knex migrate:make <name_of_migration>`, this will create a migration file in the `migrations/` directory with the name `<timestamp>_<name_of_migration>.js`
3. Edit that file to add the migrations you want to perform (look at the other files in `migrations/` to see what it should look like)
4. Once you are done with the migration, push it to the repository
5. On the `bobolith`, run `npm run -C /home/chezbob-admin/chezbob knex --workspace=db -- --env production migrate:latest` to apply the migrations to the production database

