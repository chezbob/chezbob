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
`pos`, as above). This means, it's possible to have duplicates of any service
so long as it has a unique logical name. Typically, these names are configured
using environment variables or query parameters.

#### Design Philosophy

1. We try to avoid dependence on libraries and frameworks wherever possible.
   Past experience has shown that chezbob will outlive whatever what's hot today,
   and even if it doesn't, the library/framework will have changed enough to be
   unrecognizable.

   That's why we don't use React, or Django, or anything that could force us to rewrite
   Chezbob as was done for this iteration. For those curious, Prior to this incarnation,
   Chezbob was written in a hodgepodge of python frameworks including django and crossbar,
   all at versions that are now unsupported.

   Of course, we cannot entirely avoid dependencies, especially when it comes to
   hardware and databases. For hardware, we always try to pick dependencies that
   operate as close to the protocol layer as possible. These libraries tend to be
   well-supported and stable. For databases, we've chosen knex which is essentially
   an ORM + query builder. It saves us from database-specific dependence but otherwise
   is very unopinionated.

2. If you can, write in Javascript.
   Having the entire repo in one language makes it easy to develop features that span
   multiple services. Furthermore, `reconnecting-socket` is a battletested implementation
   of Chezbob's communication protocol. It provides good behavior in the presence of disconnects
   and convenience wrappers for request/response-style APIs on top of the relay protocol.

3. If you can't write it in Javascript, that's fine.
   Chezbob is designed as a distributed system. This lets students hack up all sorts of projects
   with all sorts of hardware. Definitely try to go the JS route, but if you can't, that's okay.
   Just know you'll have to reimplement the relay protocol.

#### Why?

Chez bob uses a web frontend, but needs to accept input from various devices
like barcode scanners and bill acceptors. It also has odd outputs like the
coffee grinder. Web pages cannot directly access these kinds of peripherals.

To circumvent the limitations of web pages, we use websockets. A small server
with direct hardware access can communicate with the POS over those websockets.

The `inventory` service is unique because it _could_ be a web server. It uses a
very standard request/response flow. However for the sake of traceability and
consistency we use the same websocket protocol to communicate with it.

#### Deployment

This repo contains all the necessary pieces to develop and run chezbob but it does
not contain any details of the specific deployment at UCSD CSE. There is a separate
private repo available at [chezbob/cse-deployment](https://github.com/chezbob/cse-deployment)
which contains all the relevant configuration and information.
