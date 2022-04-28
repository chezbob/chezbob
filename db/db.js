/*
  The db module provides a convenient way for services in chezbob to directly access the database.
  Note, that any service which does so, must be co-located on the server with the database.

  The db module selects which database to provide based on the DEPLOYMENT_MODE environment variable.

  As more services interface with the database, this module serves as a convenient place to implement
  shared functionality and common queries
*/

import knex from "knex";
import config from "./knexfile.js";

// Required config options to specify the location of the relay server, what to call this instance of the nfc service, and where to send its data
const DEPLOYMENT_MODE =
  process.env.DEPLOYMENT_MODE ||
  console.error("Must provide DEPLOYMENT_MODE environment variable") ||
  process.exit(1);

if (!["production", "development"].includes(DEPLOYMENT_MODE)) {
  console.error("DEPLOYMENT_MODE must be either 'production' or 'development'");
}

export const db = knex(config[DEPLOYMENT_MODE]);
