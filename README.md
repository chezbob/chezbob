## Getting Started

Install node v17 with npm. For development I recommend using nvm, but for
deployment you should use official packages (since nvm just installs for the user)

Run:

- `npm run setup` (might take a bit, builds sqlite3)
- `npm run debug` (make sure you have tmux installed)

Open `http://localhost:8081/pos` in the browser.
You can manually input barcode values using the barcode panel.

#### Architecture

Chez bob consists of:

    - Web frontends (see `web-frontend/`)
    - Hardware-managing servers (see `devices`)
    - The inventory server (see `server/inventory/`)
    - A relay server which routes data between chez bob's various servers and clients (see `server/relay.js`)

All of these components communicate through the relay server, using WebSockets.
For example, when a barcode is scanned, the barcode server sends a notification
to the `pos` by sending a message to the relay server that looks like so:

```
{
    "header": {
        "to": "pos",
        "type": "scan_event",
    },
    "body": {
        "barcode": "xxxxxxxxxxxx"
    }
}
```

The relay server inspects the `header` and forwards the message on to the `pos`.

When a service connects to the relay server, it picks a logical name (e.g.
`pos`, as above).  This means, it's possible to have duplicates of any service
so long as it has a unique logical name. Typically, these names are configured
using environment variables or query parameters.


#### Why?

Chez bob uses a web frontend, but needs to accept input from various devices
like barcode scanners and bill acceptors. It also has odd outputs like the
coffee grinder. Web pages cannot directly access these kinds of peripherals.

To circumvent the limitations of web pages, we use websockets. A small server
with direct hardware access can communicate with the POS over those websockets.

The `inventory` service is unique because it _could_ be a web server. It uses a very standard request/response flow. However for the sake of traceability and consistency we use the same websocket protocol to communicate with it.
