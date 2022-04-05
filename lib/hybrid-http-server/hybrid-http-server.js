/**
    Hybrid HTTP server is an abstraction over node's HTTP and HTTPS implementation
    that allows them to be configured via environment variables.

    It's used in both the relay server, and the main web server
 */

import http from 'http';
import https from 'https';
import { readFileSync } from 'fs';

export function hybridServer(app) {
    const { HTTP_PORT, HTTPS_PORT, DEPLOYMENT_MODE, SET_UID } = process.env;

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

    // If an HTTPS version is available and we're not running in development, always redirect to HTTPS
    // It can be pain to develop locally with HTTPS so we'll allow HTTP only deployments
    const http_app = HTTPS_PORT && DEPLOYMENT_MODE !== 'development' ? function (req, res) {
        res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
        res.end();
    } : app;


    if (HTTP_PORT) {
        http.createServer(http_app).listen(HTTP_PORT);
        console.log(`Listening for HTTP traffic on port ${HTTP_PORT}`);
    } 

    if (HTTPS_PORT) {
        https.createServer(app, { key, cert }).listen(HTTPS_PORT);
        console.log(`Listening for HTTPS traffic on port ${HTTPS_PORT}`);
    }

    // It's common that we want to bind to priveleged ports, or read
    // certificates with elevated permission, but we don't want to handle web
    // requests with those permissions. SET_UID lets us lower those permissions
    // before we handle any requests.
    if (SET_UID) {
        console.log(`Attempting to setuid ${SET_UID}`);
        process.setuid(SET_UID);
        console.log("Successfully setuid.")
    }

}
