/*
  This chezbob server implements cash scanning for money deposits.
  It requires an attached NV9 or NV10 cash reader.
*/
import { ReconnectingSocket } from "reconnecting-socket";
import sspLib from "encrypted-smiley-secure-protocol";

// Required config options to specify the location of the relay server, what to call this instance of the the service, and where to send its data
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

let eSSP = new sspLib({
  timeout: 3000,
  // It's important that polling be set to false. When money is scanned, it first
  // emits an event stating that a bill has been seen, followed by an event with the value of the bill.
  polling: false,
});

const channels = [];

eSSP.on("OPEN", async () => {
  console.log("open");

  await eSSP.command("SYNC");
  await eSSP.command("HOST_PROTOCOL_VERSION", { version: 6 });
  const serial = await eSSP.command("GET_SERIAL_NUMBER");
  console.log("SERIAL NUMBER:", serial.info.serial_number);

  const result = await eSSP.command("SETUP_REQUEST");
  const channel_mask = [];
  // The reader is configured to handle USD. Each denomination (1, 5, 20, etc.)
  // is assigned a channel. While these ought to never change, it's best to pull
  // them from the reader just in case. Note that this whole app comes crumbling down
  // if the reader is not set to USD, but at least the console log below will let you know what happened
  for (let i = 0; i < result.info.channel_value.length; i++) {
    channel_mask.push(1);
    // Channels are 1 indexed so we need to increment one. This means that channels is a sparse array where
    // index 0 is undefined
    channels[i + 1] = {
      value: result.info.expanded_channel_value[i],
      country_code: result.info.expanded_channel_country_code[i],
    };
  }

  console.log(channels);

  // Enable receviing all denominations
  await eSSP.command("SET_CHANNEL_INHIBITS", {
    channels: channel_mask,
  });

  // Make it glow red. In an ideal world, we'd set this dynamically based on the POS, but that
  // complicates the protocol so we just leave it always on.
  await eSSP.command("DISPLAY_ON");

  // Note, we do not use the library's provided enable function, because it starts a polling loop.
  const enable = await eSSP.command("ENABLE");

  if (enable.status == "OK") {
    console.log("Device is active");
  }

  loop();
});

// We use our own polling loop so we can issue "HOLD" events properly.
async function loop() {
  while (true) {
    let evs = await eSSP.command("POLL");

    // If there are no events, the info field is of type object.
    // So we handle this annoying quirk of the library.
    if (!(evs.info instanceof Array)) {
      continue;
    }

    for (const ev of evs.info) {
      console.log("EVENT", ev);
      // If anything has gone wrong let's just start the scanner back up again
      // This service is basically stateless so this should be fine.
      if (ev.name === "DISABLED") {
        await eSSP.command("ENABLE");
        // It's unclear what we should do if we ever
        // see queued events after a 'DISABLED' event.
        // It's not even clear if the protocol allows
        // this. So lets just ignore them and break
        // instead.
        break;
      }

      // If a bill was rejected, we want to know why (for logging purposes)
      if (ev.name === "NOTE_REJECTED") {
        const reason = await eSSP.command("LAST_REJECT_CODE");
        console.log("REJECTED_REASON: ", reason);
      }

      // The READ_NOTE event is fired several times for a single bill insertion.
      // The first several firings indicate that some unknown bill has entered
      // the system. These are indicated by a channel value of 0.
      //
      // We wait till the first contentful read event which tells us the denomination
      // of the bill. If we were to then fire a POLL event, the bill collector would
      // accept the bill. But we shouldn't take money until the POS has recognized it...
      if (ev.name === "READ_NOTE" && ev.channel > 0) {
        const cents = channels[ev.channel].value * 100;
        console.log("ATTEMPTING DEPOSIT", cents);

        // ... so we run a HOLD command which gives us
        // 10 seconds to either accept or reject the
        // bill. If we exhaust this timeout, the reader will be disabled.
        await eSSP.command("HOLD");

        // Request permission from POS to continue
        try {
          console.log("ATTEMPTING DEPOSIT");
          await socket.request({
            header: {
              to: DESTINATION_IDENT,
              type: "deposit_preflight",
            },
            body: {}
          });

          // Now we know we're allowed to continue, so we'll pass through to the
          // next iteration of the poll loop, which will attempt to accept the
          // bill. The bill could still fail to accept (see issue#5).
          console.log("PREFLIGHT PASSED");
        } catch (e) {
          // If the POS fails to accept our request,
          // either explicitly or by timeout, we give
          // the user back their cash
          console.log("Did not accept bill: ", e, "Issuing rejection");
          await eSSP.command("REJECT_BANKNOTE");
        }
      }
    }

    if (ev.name === "CREDIT_NOTE") {
      const cents = channels[ev.channel].value * 100;
      // Fire away and hope whoever's listening knows what to do
      socket.send({
        header: {
          to: DESTINATION_IDENT,
          type: "deposit"
        },
        body: { cents }
      })
    }
    console.log("POLLING");
  }
}

eSSP.open("/dev/ttyS0");
