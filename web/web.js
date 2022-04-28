/*
    Web is chezbob's public internet presence.
*/

import express from "express";
import { hybridServer } from "hybrid-http-server";

const app = express();

// Static file serving
const __dirname = new URL(".", import.meta.url).pathname;
app.use(express.static(__dirname + "/static"));

hybridServer(app);
