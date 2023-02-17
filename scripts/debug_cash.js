/*
    debug_cash creates a readline-based prompt to allow manual entry of
    deposit values. This should only be used in development.
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

async function send(cents) {
  try {
    await socket.request({
      header: {
        to: DESTINATION_IDENT,
        type: "deposit_preflight",
      },
      body: {},
    });

    socket.send({
      header: {
        to: DESTINATION_IDENT,
        type: "deposit",
      },
      body: {
        cents,
      },
    });
    console.log("SUCCEEDED DEPOSIT");
  } catch (e) {
    console.error(`Error processing deposit: `, e);
  }
}

// Set up a debug prompt for manual entry
while (true) {
  let input = await rl.question("*cents* ");
  if (socket.readyState === socket.OPEN) {
    // We can't just use Number.parseInt because parseInt parses
    // the *first* occurrence of an integer so things like 1.5 become 1
    // so first we validate that the whole input is an integer...
    const is_int = /^-?\d+$/.test(input);
    if (!is_int) {
      console.error(`Input '${input}' is not a valid integer`);
      continue;
    }

    // ...*then* we parse it
    const cents = Number.parseInt(input);

    await send(cents);
  }
}
