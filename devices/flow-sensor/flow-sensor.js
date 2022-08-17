/*
  This chezbob server implements barcode scanning for barcode readers
  that act as keyboards.

  It is distinct from the hid-based service which operates on devices
  that use the USB HID barcode spec. This service establishes exclusive
  access to the keyboard using ioctl so make sure that the user running the service has permissions to claim exclusive access.

  This can be done like:

  sudo setfacl -m u:username:r /dev/input/by-id/usb-Logitech_Logitech_USB_Keyboard-event-kbd
*/

import { ReconnectingSocket } from "reconnecting-socket";

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

// TODO: Interface with a device