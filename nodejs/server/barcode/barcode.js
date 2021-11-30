import { v4 as uuidv4 } from "uuid";
import { ReconnectingSocket } from "../../common/reconnecting-socket.js";
import { stdin as input, stdout as output } from "process";
import * as readline from "readline/promises";
import {HID} from 'node-hid';
const rl = readline.createInterface({ input, output });
let socket = await ReconnectingSocket.connect("barcode");


function connect() {
    try {
        var handle = new HID("/dev/hidraw1");
    } catch (e) {
        console.log(e);
        setTimeout(connect, 1000);
        return;
    }

    handle.on('error', connect);
    handle.on('data', d => {
        let len = d.readUInt8(1);
        let code = d.slice(5, 5 + len);
        send(code.toString());
    })
}


function send(barcode) {
  console.log(`\n${barcode}`);
  socket.send(
    JSON.stringify({
      header: {
        to: "/pos",
        id: uuidv4(),
        type: "scan_event",
      },
      body: {
        barcode,
      },
    })
  );
}

connect();
while (true) {
  let input = await rl.question("*barcode* ");
  if (socket.readyState === socket.OPEN) {
    send(input);
  }
}
