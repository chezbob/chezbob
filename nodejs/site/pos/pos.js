import { ReconnectingSocket } from "/common/reconnecting-socket.js";

let socket = await ReconnectingSocket.connect("ws://localhost:8080/", "pos");

let STATE = {
  user_info: null, // The info for the currently signed_in user
  user_timeout: null, // the time at which the user gets signed out
  purchases: [], // all purchased items
  hint: null,
  price_check: null // item_info for a price check
};


function render() {
  let user = curr_user();
  console.log("render");
  if (user) {
    document.getElementById("logout").disabled = false;
    document.body.style.setProperty('--bob-color', "var(--chez-green");
    setBalance(STATE.user_info?.balance);
    setHint(STATE.user_info?.hint ?? "- Scan an item to purchase");
    if (STATE.purchases.length > 0) {
      setTitle("Purchases");
      setContent(
        STATE.purchases.map(price_row).join("") + totals()
      );
    } else {
      setTitle(null);
      setContent(null);
    }
  } else {
    document.getElementById("logout").disabled = true;
    document.body.style.setProperty('--bob-color', "var(--chez-blue");
    setBalance(null);
    setHint(`
      - Scan your ID to sign in
      <br />
      - Scan an item to price-check
    `);
    if (STATE.price_check) {
      setTitle("Price Check");
      setContent(price_row(STATE.price_check));
    } else {
      setTitle(null);
      setContent(null);
    }
  }
}


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
          STATE.price_check = info.body;
        } else {
          await purchase(info.body);
        }
        break;
      case "user_info":
        if (curr_user() !== null) {
          speak("Already signed in");
        }
        login(info.body);
        break;
    }
  } catch (e) {
    if (e.error) {
      speak(e.error);
    } else {
      console.error(e);
    }
  }
  render();
});

/** User management */

function login(user_info) {
  STATE.user_info = user_info;
  STATE.purchases = [];

  start_logout_timer();
}

function logout() {
  STATE.user_info = null;
  render();
}

logout();
document.getElementById("logout").addEventListener("click", logout);

function curr_user() {
  return STATE.user_info;
}

async function purchase(item_info) {
  start_logout_timer();
  let resp = await socket.request({
    header: {
      to: "/inventory",
      type: "purchase",
    },
    body: {
      user_id: curr_user().id,
      item_id: item_info.id,
    },
  });
  
  STATE.purchases.push(resp.body.item);
}

function totals() {
  const sum = STATE.purchases.reduce((sum, i) => sum + i.cents, 0);
  return `<br><div class='totals'>
      <div>Total: </div>
      <div>${dollars(sum)}</div>
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
  return `${d}.${c < 10 ? "0" + c : c}`;
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

function setBalance(cents) {
  const elem = document.getElementById("balance");
  if (cents) {
    elem.dataset.balance = dollars(cents);
    if (cents > 0) {
      elem.classList.add('positive');
      elem.classList.remove('negative');
    } else {
      elem.classList.add('negative');
      elem.classList.remove('positive');
    }
  } else {
    delete document.getElementById("balance").dataset.balance;
  }
}


let speech_timeout = null;
function speak(txt) {
  document.getElementById('error').innerHTML = txt;
  if (speech_timeout) {
    clearTimeout(speech_timeout);
  }
  speech_timeout = setTimeout(clear_alert, 5000)
}

function clear_alert() {
    document.getElementById('error').innerHTML = "&nbsp;";
}
