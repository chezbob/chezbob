import { ReconnectingSocket } from "/common/reconnecting-socket.js";
import { DefaultMode } from "./mode.js";

// Chez-bob is organized into "modes" which govern how the app behaves and looks.
// These modes are defined in modes.js and account for most of the impelementation
window.set_mode = (mode) => {
  window.mode = mode;
  window.mode.render();
};

// We need to render immediately because browsers are weird and will cache our data attributes
set_mode(new DefaultMode());

// Rather than using Modes to control the socket, we put it directly on the window
// and set up handlers that invoke mode methods like `on_scan`. This keeps us from having
// to thread the socket object through all mode transitions, and from having to add and remove
// handlers to the socket on the fly.
window.socket = await ReconnectingSocket.connect("ws://localhost:8080/", "pos");

// The downside to the global socket system is that we have to establish these passthrough
// handlers which invoke methods on the mode in response to a socket event. It's a small price to pay
// for the simplicity we get by having modes be cheap and dumb.
socket.on("scan_event", async (msg) => {
  try {
    window.mode.on_scan && (await window.mode.on_scan(msg));
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

socket.handle("cash_deposit", async (cash_deposit) => {
  if (!window.mode.on_deposit) {
    throw new Error("POS in incorrect mode");
  }

  return await window.mode.on_deposit;
});

//
// IMPORTANT!
//
// Some modes have timing-specific properties, this could be a session that needs to timeout
// or an error that needs to disappear at some point. Rather than making modes set up and teardown
// interval handlers, we just do that globally.
//
// This is a little funky because some modes need to render every second (e.g. to show session-time remainig).
// To solve this problem inelegantly, but succinctly, we just rerender every second.
// Typically, updates to the mode should not wait for this cycle, but should explicitly render immediately.
// If you notice that the app is seemingly slow to update, it's likely that you forgot to explicitly render
// and were saved by this per-second-reload
setInterval(() => {
  // If the session times out, reset it
  if (window.mode.timeout && Date.now() > window.mode.timeout) {
    set_mode(new DefaultMode());
  }

  // If the error times out, clear it
  if (window.mode.error_timeout && Date.now() > window.mode.error_timeout) {
    window.mode.error = window.mode.error_timeout = undefined;
  }

  // Rerender
  window.mode.render();
}, 1000);
