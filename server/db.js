import knex from "knex";
import config from "./db/knexfile.js";

// Required config options to specify the location of the relay server, what to call this instance of the nfc service, and where to send its data
const DEPLOYMENT_MODE =
  process.env.DEPLOYMENT_MODE ||
  console.error("Must provide DEPLOYMENT_MODE environment variable") ||
  process.exit(1);

if (!["production", "development"].includes(DEPLOYMENT_MODE)) {
  console.error("DEPLOYMENT_MODE must be either 'production' or 'development'");
}

export const db = knex(config[DEPLOYMENT_MODE]);