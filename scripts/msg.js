/*
    msg.js allows sending manual messages to the relay server.
    This is useful for debugging or other admin purposes such as refreshing the
    kiosk.

    Usage:

        node scripts/msg.js [destination] [type] [body?]

    Body is optional but it must be a valid JSON object string
*/
import { ReconnectingSocket } from "reconnecting-socket";

// Required config options to specify the location of the relay server
const RELAY_SERVER =
  process.env.RELAY_SERVER ||
  console.error("Must provide RELAY_SERVER environment variable") ||
  process.exit(1);

const socket = await ReconnectingSocket.connect(RELAY_SERVER, "msg");

const args = process.argv.slice(2);

if (args.length > 3 || args.length < 2) {
  console.error("Usage:\n  npm run msg -- [destination] [type] [body?]");
  process.exit(1);
}

const [to, type, body] = args;
// The message we will populate with the command line args
const message = {
  header: {
    to,
    type,
  },
  body: body ? JSON.parse(body) : {},
};

console.log(message);
socket.send(message);
process.exit(1);
