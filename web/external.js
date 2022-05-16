/*
    external is chezbob's public internet presence.
*/

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

hybridServer(app);
