// Update with your config settings.

const __dirname = new URL(".", import.meta.url).pathname;
export default {
  development: {
    client: "better-sqlite3",
    useNullAsDefault: true,
    connection: {
      filename: __dirname + "/dev.sqlite3",
    },
    seeds: {
      directory: [__dirname + "/seeds", __dirname + "/seeds/dev"],
      recursive: false,
    },
  },

  migrations: {
    directory: __dirname + "/migrations",
  },

  seeds: {
    directory: __dirname + "/seeds",

    // We have development specific seeds  in seeds/dev
    recursive: false,
  },

  production: {
    client: "better-sqlite3",
    useNullAsDefault: true,
    connection: {
      filename: __dirname + "/prod.sqlite3",
    },
    seeds: {
      directory: [__dirname + "/seeds", __dirname + "/seeds/prod"],
      recursive: false,
    },
  },
};
