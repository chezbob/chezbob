import { WebSocketServer } from "ws";
import { hybridServer } from "hybrid-http-server";
import { parse } from "url";

const wss = new WebSocketServer({
  noServer: true,
});

const httpApp = ((req, res) => {
  const socket = req.socket;
  const { pathname } = parse(req.url);
  const head = req.headers;

  if (!req.headers.hasOwnProperty('upgrade')) {
    console.log(req.headers);
    res.statusCode = "101";
    res.statusMessage = 'Switching Protocols';
    res.end();
    socket.destroy();
    return;
  }

  // skip the leading slash
  const name = pathname.substring(1);
  let name_taken = false;
  for (const c of wss.clients) {
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

  wss.handleUpgrade(req, socket, head, function done(ws) {
    ws.name = name;
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", handleConnect);

function handleConnect(ws, req) {
  console.log(`New connection: ${req.url}`);

  ws.on("message", handleMessage.bind(ws));
  ws.on("close", handleClose.bind(ws));
}

function handleMessage(data, isBinary) {
  let msg;
  try {
    msg = validate_message(data);
  } catch (e) {
    console.error(`${e}: ${data}`);
    return;
  }

  let to = msg.header.to;
  msg.header.from = this.name;

  for (let client of wss.clients) {
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

function handleClose() {
  console.log(`Client disconnected ${this.name}`);
}

hybridServer(httpApp);