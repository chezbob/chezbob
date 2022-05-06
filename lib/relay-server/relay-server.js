import { WebSocketServer } from "ws";
import { parse } from "url";
import { clearInterval } from "timers";

const HEARTBEAT_INTERVAL = 3000; // ms

export default class RelayServer {
  constructor() {
    this.wss = new WebSocketServer({
      noServer: true,
    });

    this.wss.on("connection", (...args) => this.#handleConnect(...args));

    let interval = setInterval(() => this.#pingAll(), HEARTBEAT_INTERVAL);
    this.wss.on("close", () => clearInterval(interval));
  }

  handleUpgrade(req, socket) {
    const { pathname } = parse(req.url);
    const head = req.headers;

    // skip the leading slash
    const name = pathname.substring(1);
    let name_taken = false;
    for (const c of this.wss.clients) {
      if (c.name === name) {
        name_taken = true;
        break;
      }
    }

    if (name_taken) {
      socket.write("HTTP/1.1 409 Conflict\r\n\r\n");
      console.log(
        `Rejected client because name is taken: ${name}`,
        req.rawHeaders
      );
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      ws.name = name;
      this.wss.emit("connection", ws, req);
    });
  }

  #handleConnect(ws, req) {
    console.log(`New connection: ${req.url}`);
    ws.on("message", (data, isBinary) =>
      this.#handleMessage(ws, data, isBinary)
    );
    ws.on("close", () => this.#handleClose());

    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
  }

  #handleMessage(ws, data, isBinary) {
    let msg;
    try {
      msg = validate_message(data);
    } catch (e) {
      console.error(`${e}: ${data}`);
      return;
    }

    let to = msg.header.to;
    msg.header.from = ws.name;

    for (let client of this.wss.clients) {
      if (client.name === to) {
        client.send(JSON.stringify(msg));
      }
    }

    // Filter out any contents we shoudln't log
    if (is_sensitive(msg)) {
      msg.body = {};
    }
    console.log(msg);
  }

  #handleClose() {
    console.log(`Client disconnected ${this.name}`);
  }

  #pingAll() {
    this.wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();

      ws.isAlive = false;
      ws.ping();
    });
  }
}

function validate_message(data) {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch (e) {
    throw "Message not valid JSON";
  }
  if (typeof msg.header !== "object") {
    throw "Missing header";
  }

  if (typeof msg.header.to !== "string") {
    throw "Missing or malformed 'to' field";
  }

  if (typeof msg.header.id !== "string") {
    throw "Missing or malformed 'id' field";
  }

  if (typeof msg.header.type !== "string") {
    throw "Missing or malformed 'type' field";
  }

  if (typeof msg.body !== "object" && msg.error === undefined) {
    throw "Must have either a body or an error";
  }

  return msg;
}

function is_sensitive(msg) {
  return msg.header.type === "login";
}
