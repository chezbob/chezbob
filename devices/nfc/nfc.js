/*
    This chezbob service listens for NFC card scans and reports them
    to the POS.

    This service relies on the nfc-pcsc package which relies on several native components
    including the pcscd daemon and some associated libs. Without these set up, this
    service will likely hang.
*/

import { ReconnectingSocket } from "reconnecting-socket";
import { NFC } from "nfc-pcsc";

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

const nfc = new NFC(); // optionally you can pass logger

nfc.on("reader", (reader) => {
  // By default nfc-pcsc tries to do all sorts of card interactions.
  // If we were lucky, this would extract a unique id for the card.
  // We are not lucky, so we disable this.
  //
  // The issue is that the card reports as an ISO-14443-4 card
  // but nfc-pcsc only fetches the uid for ISO-14443-3 cards.
  reader.autoProcessing = false;

  reader.on("card", async (card) => {
    console.log(`${reader.reader.name}  card detected`, card);

    // This an APDU command that requests the unique identifier from the card
    let packet = Buffer.from([
      0xff, // Class
      0xca, // Ins
      0x00, // P1: Get current card UID
      0x00, // P2
      0x00, // Le
    ]);

    const barcode = await reader.transmit(packet, 40, 2);
    console.log("NFC SCAN: " + barcode.toString("hex", 0, barcode.length - 1));

    // Check command processing status indicates success
    if (!barcode.subarray(-2).equals(Buffer.from("9000", "hex"))) {
      console.log(
        "BAD NFC SCAN: " + barcode.toString("hex", 0, barcode.length - 1)
      );
      socket.send({
        header: {
          to: DESTINATION_IDENT,
          type: "nfc_scan_error",
        },
        body: {},
      });
      return;
    }

    socket.send({
      header: {
        to: DESTINATION_IDENT,
        type: "scan_event",
      },
      body: {
        // Shave off the last byte which is a null terminator
        barcode: barcode.toString("hex", 0, barcode.length - 1),
      },
    });
  });
});

nfc.on("error", (err) => {
  console.log("an error occurred", err);
});

console.log("NFC service started");
