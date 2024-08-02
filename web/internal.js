/*
    App Server is responsible for hosting web apps for internal use within chezbob.
    This includes such things as the POS interface. The full list can be found in `app-server/static/apps`.

    The App Server also hosts the websocket relay server that enables devices and applications
    within chezbob to communicate with each other.
*/

import { create_user } from "db"; 
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
   
    var conflicts = [];
    var added = [];  

    for (var u of reqUsers) {
        console.log(u);
        let id = await create_user(u);
        if (id == -1) {
            conflicts.push(u);
        } else {
            added.push(u);
        }
    }
    res.send('{"added": ' + added.toString() + ', "conflicts": ' + conflicts.toString() + '}');
});

app.use("/api", api);

let server = hybridServer(app);
server.on("upgrade", (...args) => relay.handleUpgrade(...args));
