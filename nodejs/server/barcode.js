/*
  This chezbob server implements barcode scanning.
  It does so through the node-hid package which reads directly from device events.
  On linux, this means the user running the service must have permissions on the devices.

  You either need to run as root or configure your system to give the user access.
*/

import { ReconnectingSocket } from "../common/reconnecting-socket.js";
import { stdin as input, stdout as output } from "process";
import * as readline from "readline/promises";
import { devices, HID } from "node-hid";

const rl = readline.createInterface({ input, output });


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

let socket = await ReconnectingSocket.connect(
  RELAY_SERVER,
  SERVICE_IDENT 
);

// Connect will try to find an attached barcode scanner, retrying every second
function connect() {
  try {
    var hid_devices = devices();

    // Find the first device to match our criteria.
    // This criteria is specific to actual hardware we're using (Honeywell 3800G)
    var scanner = hid_devices.find((d) => {
      return d.product.includes("3800");
    });
    var handle = new HID(scanner.path);
  } catch (e) {
    setTimeout(connect, 1000);
    return;
  }

  console.log("Connected to scanner");

  // On any kind of error, just initiate a reconnect
  handle.on("error", connect);


  handle.on("data", (d) => {
    // This code manually parses the HID data.
    let len = d.readUInt8(1);
    let code = d.slice(5, 5 + len).toString();


    console.log(code);

    send(code.toString());
  });
}

function send(barcode) {
  socket.send({
    header: {
      to: DESTINATION_IDENT,
      type: "scan_event",
    },
    body: {
      barcode,
    },
  });
}

// The physical scanner operates asynchronously
connect();

// Set up a debug prompt for manual entry
while (true) {
  let input = await rl.question("*barcode* ");
  if (socket.readyState === socket.OPEN) {
    send(input);
  }
}
