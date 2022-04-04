import express from "express";
import https from "https";
import http from "http";
import { readFileSync } from "fs";

// Chezbob can be served over either HTTP or HTTPS or both
const { HTTP_PORT, HTTPS_PORT } = process.env;

if (!HTTP_PORT && !HTTPS_PORT) {
  console.error(
    "Must provide one or both of HTTP_PORT HTTPS_PORT environment variable"
  ) || process.exit(1);
}

let cert;
let key;

if (HTTPS_PORT) {
  const CERT_PATH =
    process.env.CERT_PATH ||
    console.error("Must provide CERT_PATH if using HTTPS_PORT") ||
    process.exit(1);

  const KEY_PATH =
    process.env.KEY_PATH ||
    console.error("Must provide KEY_PATH if using HTTPS_PORT") ||
    process.exit(1);

  cert = readFileSync(CERT_PATH);
  key = readFileSync(KEY_PATH);
}

const app = express();

// HTTP Redirect
app.use(function (req, res, next) {
  if (HTTPS_PORT && !req.secure) {
    res.redirect(301, "https://" + req.hostname + ":port" + req.originalUrl);
  } else {
    next();
  }
});

// Static file serving
const __dirname = new URL(".", import.meta.url).pathname;
app.use(express.static(__dirname + "/static"));

HTTP_PORT && http.createServer(app).listen(HTTP_PORT);
HTTPS_PORT && https.createServer(app, { key, cert }).listen(HTTPS_PORT);
