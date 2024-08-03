/*
    App Server is responsible for hosting web apps for internal use within chezbob.
    This includes such things as the POS interface. The full list can be found in `app-server/static/apps`.

    The App Server also hosts the websocket relay server that enables devices and applications
    within chezbob to communicate with each other.
*/

import { get_user_by_email, create_user, search_inventory, reset_password_by_id } from "db"; // TODO order these
import express from "express";
import RelayServer from "relay-server";
import { hybridServer } from "hybrid-http-server";

const app = express();
const relay = new RelayServer();
const api = express.Router();

// Redirect to the internal landing page.
app.get("/", (_, res) => {
  res.redirect(302, "/internal/");
});

// Static file serving
const __dirname = new URL(".", import.meta.url).pathname;
app.use(express.static(__dirname + "/static"));

api.get("/addusers", async (req, res) => {
    const reqUsers = req.query.emails.split(',');
   
    var conflictsArr = [];
    var addedArr = [];  

    for (var u of reqUsers) {
        let confUser = await get_user_by_email(u);
        if (confUser.length > 0) {
            conflictsArr.push(u);
        } else {
            let id = await create_user(u);
            addedArr.push(u);
        }
    }
    res.json({added: addedArr, conflicts: conflictsArr});
});

api.get("/resetpassword", async (req, res) => {
    const email = req.query.email;
   
    // TODO separate query to get id from email
    let retval = await reset_password_by_id(email);
    res.json({returned: retval});
});

api.get("/searchinventory", async (req, res) => {
    const query = req.query.query;
   
    let searchResults = await search_inventory(query);
    res.send(searchResults);
});

app.use("/api", api);

let server = hybridServer(app);
server.on("upgrade", (...args) => relay.handleUpgrade(...args));
