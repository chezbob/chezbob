/*
  This chezbob server implements barcode scanning for barcode readers
  that act as keyboards.

  It is distinct from the hid-based service which operates on devices
  that use the USB HID barcode spec. This service establishes exclusive
  access to the keyboard using ioctl so make sure that the user running the service has permissions to claim exclusive access.

  This can be done like:

  sudo setfacl -m u:username:r /dev/input/by-id/usb-Logitech_Logitech_USB_Keyboard-event-kbd


*/

import { ReconnectingSocket } from "../shared/reconnecting-socket.js";
import ExclusiveKeyboard from "exclusive-keyboard";

// We only respond to numeric keys
const KEY_REGEX = /^KEY_(\d)$/;

let barcode = "";

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

const keyboard = new ExclusiveKeyboard(
  "by-id/usb-Totinfo_TOT2D_PRODUCT_HID_KBW_APP-000000000-event-kbd",
  true
);

// Barcode readers in "automatic" mode will sometimes scan the same item twice
// in rapid succession. This is almost always a mistake so we'll manually debounce
// this for them.
//
// This timeout is a heuristic, we picked it cuz it feels good.
const DEBOUNCE_TIMEOUT = 750;
let last_scan_time = 0;

keyboard.on("keypress", (event) => {
  const match = event.keyId.match(KEY_REGEX);
  if (match) {
    // push the letter onto the buffer
    barcode += match[1];
    return;
  }

  if (event.keyId === "KEY_ENTER" && barcode !== "") {
    console.log({ barcode });

    // Ignore the scan if it happened too fast
    if (Date.now() - last_scan_time > DEBOUNCE_TIMEOUT) {
      // Reset the debounce timer
      last_scan_time = Date.now();

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
    barcode = "";
  }
});
