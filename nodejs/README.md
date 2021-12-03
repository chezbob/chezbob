## Getting Started
Install node v17 with npm. I recommend using nvm since distro packages can fall behind.

Run:

- `npm run setup` (might take a bit, builds sqlite3)
- `npm run debug` (make sure you have tmux installed)

Open `http://localhost:8081/pos` in the browser.
You can manually input barcode values using the barcode panel.


## Architecture

#### What
Chez bob consists of:
    - Web frontends (see `site/`)
    - Hardware-managing servers (see `server/barcode/`)
    - The inventory server (see `server/inventory/`)
    - A relay server which routes data between chez bob's various servers and clients

#### Why?
Chez bob uses a web frontend, but needs to accept input from various devices
like barcode scanners and money machines. It also has odd outputs like the
coffee grinder. Web pages cannot directly access these kinds of peripherals.

To circumvent the limitations of web pages, we use websockets. A small server
with direct hardware access can communicate with the POS over those websockets.

The `inventory` service is unique because it *could* be a web server. It uses a very standard request/response flow. However for the sake of traceability and consistency we use the same websocket protocol to communicate with it.
