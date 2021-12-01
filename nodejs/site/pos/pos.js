import { ReconnectingSocket } from "/common/reconnecting-socket.js";

//#Source https://bit.ly/2neWfJ2

let socket = await ReconnectingSocket.connect("pos");

let STATE = {
  user: null, // the id of the currently signed in user. null if none
  user_timeout: null, // the time at which the user gets signed out
  purchases: [], // all purchased items
};

const SESSION_TIME = 30000;

socket.on("scan_event", async (msg) => {
  try {
    let info = await socket.request({
      header: {
        to: "/inventory",
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
    }
  } catch (e) {
    console.error("Unknown response: ", e);
  }
});

/** User management */

function login(user_info) {
  STATE.user = user_info.id;
  STATE.purchases = [];

  document.getElementById("logout").disabled = false;
  start_logout_timer();
  document.documentElement.style.setProperty("--bob-color", "lime");
  setTitle(null);
  setContent("");
  setHint("Scan item to purchase");
}

function logout() {
  STATE.user = null;
  document.documentElement.style.setProperty("--bob-color", "var(--chez-blue)");
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
      type: "purchase",
    },
    body: {
      user_id: curr_user(),
      item_id: item_info.id,
    },
  });

  STATE.purchases.push(resp.body.item);
  setTitle("Purchases");
  setContent(
    STATE.purchases.map(price_row).join("") + totals(resp.body.balance)
  );
}

function totals(balance) {
  const sum = STATE.purchases.reduce((sum, i) => sum + i.cents, 0);
  return `<br><div class='totals'>
      <div>Total: </div>
      <div>${dollars(sum)}</div>
      <div>Balance: </div>
      <div>${dollars(balance)}</div>
    </div>`;
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
  let d = Math.floor(cents / 100);
  let c = Math.abs(cents) % 100;
  return `${d}.${c < 10 ? '0' + c : c}`;
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
  setTitle(null);
  setContent("");
  setHint(`
    - Scan your ID to sign in
    <br />
    - Scan an item to price-check
  `);
}

function setTitle(title) {
  if (title === null) {
    delete document.getElementById("content").dataset.title;
  } else {
    document.getElementById("content").dataset.title = title;
  }
}

function setContent(content) {
  document.getElementById("content").innerHTML = content;
}

function setHint(content) {
  document.getElementById("hint").innerHTML = content;
}

function appendContent(content) {
  document.getElementById("content").innerHTML += content;
}
