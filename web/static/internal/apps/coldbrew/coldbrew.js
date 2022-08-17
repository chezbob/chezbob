import { ReconnectingSocket } from "/js/reconnecting-socket.js";
import barcodes from "../../../js/known-barcodes.js";

// Set up the socket. Note that this await blocks the app from setting anything up
// until the socket connection is established. The socket may disconnect later, but at least
// we get confirmation that successfully connceted in the first place.
const socket = await (async () => {
  // Allow URL parameters to configure the location of the relay server.
  const params = new URLSearchParams(window.location.search);
  const host = params.get("relay_host") ?? window.location.hostname;
  const port = params.get("relay_port") ?? window.location.port;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";

  return await ReconnectingSocket.connect(
    `${protocol}://${host}:${port}/`,
    "coldbrew"
  );
})();

await update_price();

async function update_price() {
  let info = await socket.request({
    header: {
      to: "inventory",
      type: "info_req",
    },
    body: {
      barcode: barcodes["Cold Brew Coffee (1oz)"],
    },
  });
}
