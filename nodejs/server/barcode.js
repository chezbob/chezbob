import { ReconnectingSocket } from "../common/reconnecting-socket.js";
import { stdin as input, stdout as output } from "process";
import * as readline from "readline/promises";
import { HID } from "node-hid";
const rl = readline.createInterface({ input, output });

let socket = await ReconnectingSocket.connect(
  process.env.RELAY_SERVER,
  "barcode"
);

function connect() {
  try {
    var handle = new HID("/dev/hidraw1");
  } catch (e) {
    setTimeout(connect, 1000);
    return;
  }

  console.log("Connected to scanner");

  handle.on("error", connect);
  handle.on("data", (d) => {
    let len = d.readUInt8(1);
    let code = d.slice(5, 5 + len).toString();

    console.log(code);
    send(code.toString());
  });
}

function send(barcode) {
  socket.send({
    header: {
      to: "/pos",
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
