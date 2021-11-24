import { v4 as uuidv4 } from "uuid";
import { ReconnectingSocket } from "../../common/reconnecting-socket.js";
import { stdin as input, stdout as output } from "process";
import * as readline from "readline/promises";

const rl = readline.createInterface({ input, output });
let socket = await ReconnectingSocket.connect("barcode");

while (true) {
  let input = await rl.question("*barcode* ");
  if (socket.readyState === socket.OPEN) {
    socket.send(
      JSON.stringify({
        header: {
          to: "/pos",
          id: uuidv4(),
          type: "scan_event",
        },
        body: {
          barcode: input,
        },
      })
    );
  }
}
