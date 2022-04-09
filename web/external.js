/*
    external is chezbob's public internet presence.
*/

import { user_info } from "db";
import express from "express";
import { hybridServer } from "hybrid-http-server";

const app = express();

// Disallow access to the internal apps
app.use("/internal", (req, res) => {
    res.status(403).end('403 Forbidden');
});

// Static file serving
const __dirname = new URL(".", import.meta.url).pathname;
app.use(express.static(__dirname + "/static"));

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
  // first 10 users with a debt superior to $5
  let users = await user_info()
    .where("balance", "<", -5)
    .orWhere("balance", -5)
    .orderBy("balance")
    .limit(10);
  res.send(users);
});

app.use("/api", api);

hybridServer(app);
