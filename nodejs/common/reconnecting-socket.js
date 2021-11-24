const server = "ws://localhost:8080/";

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

const REQUEST_TIMEOUT = 1000;

export class ReconnectingSocket extends EventTarget {
  #pending;

  constructor() {
    super();
    this.#pending = {};
  }

  static async connect(role) {
    const path = server + role;

    debug(() => console.log(`Attempting to connect to ${path}`));

    let rs = new ReconnectingSocket();

    // We will call this again on disconnect
    const connect = (cb) => {
      rs.ws = new WebSocket(path);

      rs.ws.addEventListener("open", () => {
        debug(() => console.log(`Connection successful`));
        if (cb) {
          cb(rs);
        }
      });

      rs.ws.addEventListener("message", (msg) => {
        let obj = JSON.parse(msg.data);
        if (obj.header.response_to) {
          let promise = rs.#pending[obj.header.response_to];
          if (promise) {
            clearTimeout(promise.timeout);
            promise.resolve(obj);
          } else {
            console.error(
              "Reponse to unknown message received, perhaps it timed out?",
              obj
            );
          }
          return;
        }

        rs.dispatchEvent(
          new CustomEvent(obj.header.type, {
            detail: obj,
          })
        );
      });

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

  on(msg_type, cb) {
    this.addEventListener(msg_type, (ev) => {
      cb(ev.detail);
    });
  }
  send() {
    this.ws.send(...arguments);
  }

  async request(msg) {
    const id = msg.header.id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        delete this.#pending[id];
        reject("Request timed out");
      }, REQUEST_TIMEOUT);
      this.#pending[id] = { resolve, reject, timeout };
      this.ws.send(JSON.stringify(msg));
    });
  }
}

export function debug(code) {
  if (global.process && process.env?.DEBUG) {
    code();
  }
}
