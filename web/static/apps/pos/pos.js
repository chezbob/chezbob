import { ReconnectingSocket } from "/shared/reconnecting-socket.js";
import "./session-timer.js";
import { DefaultMode } from "./mode.js";

// Chez-bob is organized into "modes" which govern how the app behaves and looks.
// These modes are defined in modes.js and account for most of the impelementation
window.set_mode = (mode) => {
  window.mode = mode;
  window.mode.render();
};

// Rather than using Modes to control the socket, we put it directly on the window
// and set up handlers that invoke mode methods like `on_scan`. This keeps us from having
// to thread the socket object through all mode transitions, and from having to add and remove
// handlers to the socket on the fly.
window.socket = await (async () => {
  // Allow URL parameters to configure the location of the relay server.
  const params = new URLSearchParams(window.location.search);
  const host = params.get("relay_host") ?? window.location.hostname;
  const port = params.get("relay_port") ?? "8080";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";

  return await ReconnectingSocket.connect(`${protocol}://${host}:${port}/`, "pos");
})();

// We need to render immediately because browsers are weird and will cache our data attributes
set_mode(new DefaultMode());

// The downside to the global socket system is that we have to establish these passthrough
// handlers which invoke methods on the mode in response to a socket event. It's a small price to pay
// for the simplicity we get by having modes be cheap and dumb.
socket.on("scan_event", async (msg) => {
  try {
    window.mode.on_scan && (await window.mode.on_scan(msg.body.barcode));
  } catch (e) {
    // If it has an `error` member, then it's an error from the socket request
    // and should be displayed
    if (e.error) {
      window.mode.set_error(e.error);
    } else {
      console.error(e);
    }
  }
});

socket.on("refresh", () => {
  window.location.reload();
});

socket.handle("cash_deposit", async (cash_deposit) => {
  if (!window.mode.on_deposit) {
    throw new Error("POS in incorrect mode");
  }

  return await window.mode.on_deposit(cash_deposit);
});

//
// IMPORTANT!
//
// Some modes have timing-specific properties, this could be a session that needs to timeout
// or an error that needs to disappear at some point. Rather than making modes set up and teardown
// interval handlers, we just do that globally.
setInterval(() => {
  // If the session times out, reset it
  if (window.mode.timeout && Date.now() > window.mode.timeout) {
    set_mode(new DefaultMode());
  }

  // If the error times out, clear it
  if (window.mode.error_timeout && Date.now() > window.mode.error_timeout) {
    window.mode.error = window.mode.error_timeout = undefined;
    window.mode.render();
  }
}, 1000);
