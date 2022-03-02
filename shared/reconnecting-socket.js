// isomorphic baybee
let CustomEvent =
  global.CustomEvent ||
  class extends Event {
    constructor(type, data) {
      super(type);
      Object.assign(this, data);
    }
  };

let WebSocket = global.WebSocket || (await import("ws")).WebSocket;

let crypto = global.crypto || (await import("crypto")).webcrypto;

const REQUEST_TIMEOUT = 1000;

export class ReconnectingSocket extends EventTarget {
  // `#pending is a map:  msg_id -> {resolve, reject, timeout}
  //
  // Every time a message is sent with `request` we add that message to `#pending`,
  // and return a Promise. The resolve/reject functions for that promise are stored here.
  // We also set a timeout (to detect failures to respond) and store its id here.
  // See `request(...)` for more details
  #pending;

  // Never call this constructor! Use `connect` which will invoke this constructor internally
  // See `connect` for why.
  constructor() {
    super();
    this.#pending = {};
  }

  // Constructs a ReconnectingSocket asynchronously. This ensures that if you `await connect(...)`
  // you will be returned an actively connected socket. If it disconnects later, it will auto-reconnect
  // but sends will fail while it is disconnected.
  //
  //
  // Why is this function insane:
  // The native WebSocket constructor returns a socket that is not yet connected.
  // Instead you have to wait for a 'open' event before you can send and receive messages
  // This function allows us to treat socket connection as a promise rather than an evented architecture
  //
  // Beyond that, the native websocket object cannot reconnect. This means on disconnect, all handlers are lost.
  // On ReconnectingSocket, handlers are maintained across reconnects which are handled transparently.
  static async connect(server, role) {
    const path = server + role;

    debug(() => console.log(`Attempting to connect to ${path}`));

    let rs = new ReconnectingSocket();

    // connect will:
    //    1. Establish a websocket
    //    2. Wait for a connection or error
    //        - on error, set a timeout to invoke connect again with the same cb
    //    3. On connection, attach handlers to the new webocket
    const connect = (cb) => {
      // Assign the websocket to the private field. We don't know if it has succeeded yet
      rs.ws = new WebSocket(path);

      // Perfect! The websocket has connected
      rs.ws.addEventListener("open", () => {
        debug(() => console.log(`Connection successful`));
        if (cb) {
          cb(rs);
        }
      });

      // Every time a message comes into the websocket we do the following:
      //      1. If it is a response, fulfill the approprate promise
      //      2. If not, forward the event from `ws` to ReconnectingSocket, where the durable handlers live
      //         (note these handlers use msg.header.type as their event type)
      rs.ws.addEventListener("message", (msg) => {
        let obj = JSON.parse(msg.data);

        // If the message contains an error field, we consider it a failure on requests
        let is_err = obj.error !== undefined;

        // This message is a response, so don't trigger handlers
        if (obj.header.response_to) {
          let promise = rs.#pending[obj.header.response_to];

          // The response came before the timeout was triggered, so cancel the timeout
          if (promise) {
            clearTimeout(promise.timeout);
            delete rs.#pending[obj.header.response_to];

            is_err ? promise.reject(obj) : promise.resolve(obj);
          } else {
            console.error(
              "Reponse to unknown message received, perhaps it timed out?",
              obj
            );
          }

          return;
        }

        // Dispatch the event on the ReconnectingSocket (rather than the WebSocket)
        // where our durable handlers live
        rs.dispatchEvent(
          new CustomEvent(obj.header.type, {
            detail: obj,
          })
        );
      });

      // Both error and close are emitted when a socket unexpectedly closes
      // So we log the error and reconnect
      rs.ws.addEventListener("error", (e) => {
        console.error(`Socket error: ${e.message}`);
      });

      rs.ws.addEventListener("close", (e) => {
        console.error("Disconnected from server... Reconnecting...");
        setTimeout(() => connect(cb), 1000);
      });
    };

    return new Promise((resolve, _reject) => connect(resolve));
  }

  // Registers a handler message types. If your handler is intended to respond,
  // consider using `handle` rather than `on`.
  on(msg_type, cb) {
    this.addEventListener(msg_type, async (ev) => {
      // Any exceptions thrown during handling the response
      // should be sent to the
      try {
        await cb(ev.detail);
      } catch (e) {
        console.error("Error handling request: ", e, "\non\n", ev.detail);
      }
    });
  }

  // A suped up version of 'on' that allows handlers to return a response object.
  // It automatically provides headers (except type) and reports errors
  handle(msg_type, cb) {
    this.on(msg_type, async (msg) => {
      return cb(msg)
        .catch((e) => {
          console.error(e);
          this.send({
            header: {
              to: msg.header.from,
              type: "internal_error",
              response_to: msg.header.id,
            },
            error: e.message,
          });
        })
        .then((resp) => {
          this.send({
            header: {
              to: msg.header.from,
              response_to: msg.header.id,
              ...resp.header,
            },
            body: resp.body,
            error: resp.error,
          });
        });
    });
  }

  // Accepts a message object and sends it over the wire.
  // It handles stringification and assigning an id for you.
  send(msg) {
    this.ws.send(
      JSON.stringify({
        header: {
          id: uuid(),
          ...msg.header,
        },
        body: msg.body,
        error: msg.error,
      })
    );
  }

  // Sends a message over the wire but returns a promise for an expected response.
  // This means the typical usage of request is:
  //      let response = await request(my_msg)
  //
  // All requests can fail if:
  //    1. The server returns a message with an error field
  //    2. The request times out
  async request(msg) {
    const id = (msg.header.id ||= uuid());
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        delete this.#pending[id];
        reject("Request timed out");
      }, REQUEST_TIMEOUT);
      this.#pending[id] = { resolve, reject, timeout };
      this.send(msg);
    });
  }
}

// Ship our own implementation of uuid so that we can run on the browser
// and on node. Also saves us a dependency
export const uuid = () =>
  ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );

export function debug(code) {
  if (global.process && process.env?.DEBUG) {
    code();
  }
}
