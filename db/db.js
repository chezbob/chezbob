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

export function user_info() {
  return db("users")
    .select(["users.id as id", "username", "balance"])
    .join("balances", "balances.id", "=", "users.id");
}

export function total_debt() {
  return db("balances")
    .where("balance", "<", 0)
    .sum("balance as total_debt")
    .first();
}

export function total_balance() {
  return db("balances")
    .sum("balance as total_balance")
    .first();
}

export function item_purchase_info({isoDateFrom, isoDateTo}) {
  // the isoDates must be a string in the format of YYYY-MM-DD
  // if no dates are provided, the query will return over all transactions
  let partialQuery = db("transactions as t")
    .count('t.item_id', { as: "item_count" })
    .select(["i.name"])
    .join("inventory as i", "i.id", "=", "t.item_id");
  if (isoDateFrom) {
    partialQuery = partialQuery.where("t.created_at", ">=", isoDateFrom);
  }
  if (isoDateTo) {
    partialQuery = partialQuery.where("t.created_at", "<=", isoDateTo);
  }
  return partialQuery
    .groupBy("t.item_id")
    .orderBy("item_count", "desc")
    .limit(20);
}

export const db = knex(config[DEPLOYMENT_MODE]);
