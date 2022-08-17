/*
    debug_flow creates a readline-based prompt to allow manual entry of
    flow values. This should only be used in development.
*/

import { ReconnectingSocket } from "reconnecting-socket";
import { stdin as input, stdout as output } from "process";
import * as readline from "readline/promises";

// Required config options to specify the location of the relay server, what to call this instance of the nfc service, and where to send its data
const RELAY_SERVER =
  process.env.RELAY_SERVER ||
  console.error("Must provide RELAY_SERVER environment variable") ||
  process.exit(1);
const SERVICE_IDENT =
  process.env.SERVICE_IDENT ||
  console.error("Must provide SERVICE_IDENT environment variable") ||
  process.exit(1);
const DESTINATION_IDENT =
  process.env.DESTINATION_IDENT ||
  console.error("Must provide DESTINATION_IDENT environment variable") ||
  process.exit(1);

let socket = await ReconnectingSocket.connect(RELAY_SERVER, SERVICE_IDENT);
const rl = readline.createInterface({ input, output });

function send(ounces) {
  socket.send({
    header: {
      to: DESTINATION_IDENT,
      type: "flow",
    },
    body: {
      ounces: Number.parseInt(ounces),
    },
  });
}

// Set up a debug prompt for manual entry
while (true) {
  let input = await rl.question("*ounces* ");
  if (socket.readyState === socket.OPEN) {
    send(input);
  }
}
