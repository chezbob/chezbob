/*
    external is chezbob's public internet presence.
*/

import { item_purchase_info, user_info } from "db";
import express from "express";
import { hybridServer } from "hybrid-http-server";

const app = express();

// Disallow access to the internal apps
app.use("/internal", (req, res) => {
  res.status(403).end("403 Forbidden");
});

// Static file serving
const __dirname = new URL(".", import.meta.url).pathname;
app.use(express.static(__dirname + "/static"));

// We need to serve the .well-known directory for LetsEncrypt renewals
// We could have allowed all dotfiles on the previous middleware but
// this feel safer
app.use('/.well-known', express.static(__dirname + "/static/.well-known"));

// REST APIs
const api = express.Router();
/**
 * /wos/users:
 *      get:
 *          list of 10 users with most debt and more than -5$ with the following format:
 *           [
 *             {
 *               "id": 2,
 *               "username": "visitday",
 *               "balance": 0
 *             },
 *             {
 *               "id": 1,
 *               "username": "bob",
 *               "balance": 1337
 *             }
 *           ]
 */
api.get("/wos/users", async (req, res) => {
  // first 10 users with a debt greater than $5
  let users = await user_info()
    .where("balance", "<=", -500)
    .orderBy("balance")
    .limit(10);
  res.send(users);
});

/**
 * GET /popular?from=YYYY-MM-DD&to=YYYY-MM-DD:
 *  [
 *    {item_count: int, name: string},
 *    ...
 *    <up to 20 items>
 * ]
 */
api.get("/popular", async (req, res) => {
  // the accepts a `from` and `to` argument, each in YYYY-MM-DD format.
  const reqFrom = req.query.from;
  const reqTo = req.query.to;
  console.log("external.js", reqFrom, reqTo);
  // Check the format of the dates
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (
    (reqFrom && !dateRegex.test(reqFrom)) ||
    (reqTo && !dateRegex.test(reqTo))
  ) {
    res.status(400).send("Invalid date format, must be YYYY-MM-DD.");
    return;
  }
  let items = await item_purchase_info({
    isoDateFrom: reqFrom,
    isoDateTo: reqTo,
  });
  res.send(items);
});

app.use("/api", api);

hybridServer(app);
