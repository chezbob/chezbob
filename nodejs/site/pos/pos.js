import { ReconnectingSocket } from "/common/reconnecting-socket.js";

//#Source https://bit.ly/2neWfJ2
const uuid = () =>
  ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );

let socket = await ReconnectingSocket.connect("pos");

let STATE = {
  user: null, // the id of the currently signed in user. null if none
  user_timeout: null, // the time at which the user gets signed out
  purchases: [], // all purchased items
};

const SESSION_TIME = 30000;

socket.on("scan_event", async (msg) => {
  let info = await socket.request({
    header: {
      to: "/inventory",
      id: uuid(),
      type: "info_req",
    },
    body: {
      barcode: msg.body.barcode,
    },
  });

  switch (info.header.type) {
    case "item_info":
      if (curr_user() === null) {
        price_check(info.body);
      } else {
        await purchase(info.body);
      }
      break;
    case "user_info":
      login(info.body);
      break;
    default:
      console.error("Unknown response: ", info);
  }
});

/** User management */

function login(user_info) {
  STATE.user = user_info.id;
  STATE.purchases = [];

  document.getElementById("logout").disabled = false;
  start_logout_timer();

  setTitle("");
  setContent("");
  setHint("Scan item to purchase");
}

function logout() {
  STATE.user = null;

  document.getElementById("logout").disabled = true;
  reset();
}

logout();
document.getElementById("logout").addEventListener("click", logout);

function curr_user() {
  return STATE.user;
}

async function purchase(item_info) {
  start_logout_timer();
  let resp = await socket.request({
    header: {
      to: "/inventory",
      id: uuid(),
      type: "purchase",
    },
    body: {
      user_id: curr_user(),
      item_id: item_info.id,
    },
  });

  STATE.purchases.push(resp.body.item);
  const sum = STATE.purchases.reduce((sum, i) => sum + i.cents, 0);
  setTitle("Purchases");
  setContent(
    STATE.purchases.map(price_row).join("") +
      `<br><div class='totals'>
      <div>Total: </div>
      <div>${dollars(sum)}</div>
      <div>Balance: </div>
      <div>${dollars(resp.body.balance)}</div>
    </div>`
  );
}

function price_row(item) {
  return `<div class='price-row'>
        <span class='price-name'>
            ${item.name}
        </span>
        <span class="dots"></span>
        <span class='price-cost'>
            ${dollars(item.cents)}
        </span>
    </div>`;
}

function dollars(cents) {
  return `${Math.floor(cents / 100)}.${Math.abs(cents) % 100}`;
}

function start_logout_timer() {
  STATE.user_timeout = Date.now() + SESSION_TIME;

  // Set the timer text immediately so it appears at the same time as the user
  set_timer_text();
}

function set_timer_text() {
  if (curr_user() !== null) {
    const millis_remaining = STATE.user_timeout - Date.now();
    if (millis_remaining <= 0) {
      logout();
    } else {
      document.getElementById("logout").innerText = `Sign Out(${Math.floor(
        millis_remaining / 1000
      )})`;
    }
  }
}

// It's just easier to leave the signout timer always running and have it do nothing
// if no user is signed in
setInterval(set_timer_text, 1000);

function price_check(item_info) {
  setTitle("Price Check");
  setContent(price_row(item_info));
}

function reset() {
  setTitle("");
  setContent("");
  setHint(`
    - Scan your ID to sign in
    <br />
    - Scan an item to price-check
  `);
}

function setTitle(title) {
  document.getElementById("title-text").innerHTML = title;
}

function setContent(content) {
  document.getElementById("price-check").innerHTML = content;
}

function setHint(content) {
  document.getElementById("hint").innerHTML = content;
}

function appendContent(content) {
  document.getElementById("price-check").innerHTML += content;
}
