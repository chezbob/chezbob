import { ReconnectingSocket } from "/common/reconnecting-socket.js";

let socket = await ReconnectingSocket.connect("ws://localhost:8080/", "pos");

// Chez bob's UI is reasonably dynamic so we manage the state using this state object
//   routines can call setState({...}) to update the state and trigger a rerender
//
// We attach it to the window for easy debugging but it should only be accessed through get_state()
// to prevent awkward closure capture nonsense.
const DEFAULT_STATE = {
  user_info: null, // The info for the currently signed_in user
  reset_timeout: null, // the time at which the session gets reset
  purchases: [], // all purchased items
  hint: null,
  price_check: null, // item_info for a price check
  error: null, // error text to display
};

window.STATE = DEFAULT_STATE;

// Weird things can happen if you bind directly to the STATE object, so use get_state instead
function get_state() {
  return window.STATE;
}

// The render function is the only routine that updates the DOM. This means our UI is a function
// from state to UI. This makes extending the UI much easier. This pattern is similar to those found
// in React.
window.render = (state) => {
  if (state.user_info) {
    document.getElementById("logout").disabled = false;
    document.body.style.setProperty("--bob-color", "var(--chez-green");
    setBalance(state.user_info?.balance);
    setHint(state.user_info?.hint ?? "- Scan an item to purchase");
    if (state.purchases.length > 0) {
      setTitle("Purchases");
      setContent(state.purchases.map(price_row).join("") + totals());
    } else {
      setTitle(null);
      setContent(null);
    }
    set_timer_text();
  } else {
    document.getElementById("logout").disabled = true;
    document.body.style.setProperty("--bob-color", "var(--chez-blue");
    setBalance(null);
    setHint(`
      - Scan your ID to sign in
      <br />
      - Scan an item to price-check
    `);
    if (state.price_check) {
      setTitle("Price Check");
      setContent(price_row(state.price_check));
    } else {
      setTitle(null);
      setContent(null);
    }
  }

  document.getElementById("error").innerHTML = state.error;
};

// We need to render immediately because browsers are weird and will cache our data attributes
render(get_state());

// Use setState to trigger a rerender.
// Note: rendering is asynchronous so that multiple calls to
// setState don't cost too much
let rendering = false;
function setState(new_state) {
  STATE = new_state;
  if (!rendering) {
    setTimeout(() => render(STATE), 0);
  }
  rendering = true;
  render(STATE);
}

// Determines how long the user has after any interaction before the session gets reset
const SESSION_TIME = 30000;

socket.on("scan_event", async (msg) => {
  try {
    // prolong the session
    add_session_time();

    // Remove any old error messages for the sake of clarity
    clear_error();

    let info = await socket.request({
      header: {
        to: "inventory",
        type: "info_req",
      },
      body: {
        barcode: msg.body.barcode,
      },
    });

    let state = get_state();

    switch (info.header.type) {
      case "item_info":
        if (state.user_info) {
          await purchase(info.body);
        } else {
          setState({
            ...state,
            price_check: info.body,
          });
        }
        break;
      case "user_info":
        if (state.user_info) {
          set_error("Already signed in");
        } else {
          login(info.body);
        }
        break;
    }
  } catch (e) {
    // If it has an `error` member, then it's an error from the socket request
    // and should be displayed
    if (e.error) {
      set_error(e.error);
    } else {
      console.error(e);
    }
  }
});

/** User management */

function login(user_info) {
  console.log("LOGIN", user_info);
  setState({
    ...get_state(),
    user_info,
    purchases: [],
    price_check: null,
  });
}

function reset() {
  setState(DEFAULT_STATE);
}

document.getElementById("logout").addEventListener("click", reset);

function curr_user() {
  return get_state().user_info;
}

async function purchase(item_info) {
  let resp = await socket.request({
    header: {
      to: "inventory",
      type: "purchase",
    },
    body: {
      user_id: curr_user().id,
      item_id: item_info.id,
    },
  });

  setState({
    ...get_state(),
    purchases: [...get_state().purchases, resp.body.item],
    user_info: {
      ...get_state().user_info,
      balance: resp.body.balance,
    },
  });
}

function add_session_time() {
  setState({
    ...get_state(),
    reset_timeout: Date.now() + SESSION_TIME,
  });
}

function totals() {
  const sum = get_state().purchases.reduce((sum, i) => sum + i.cents, 0);
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

function set_timer_text() {
  if (curr_user() !== null) {
    const millis_remaining = get_state().reset_timeout - Date.now();
    console.log("MILLIS REMAINING", millis_remaining);
    document.getElementById("logout").innerText = `Sign Out(${Math.floor(
      millis_remaining / 1000
    )})`;
  }
}

// It's just easier to leave the reset timer always running and have it do nothing
// if the timeout isn't set
setInterval(() => {
  if (get_state().reset_timeout !== null) {
    const millis_remaining = get_state().reset_timeout - Date.now();
    if (millis_remaining <= 0) {
      reset();
    }
  }
  render(get_state());
}, 1000);

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
      elem.classList.add("positive");
      elem.classList.remove("negative");
    } else {
      elem.classList.add("negative");
      elem.classList.remove("positive");
    }
  } else {
    delete document.getElementById("balance").dataset.balance;
  }
}


let error_timeout = null;
function set_error(txt) {
  setState({
    ...get_state(),
    error: txt,
  });
  if (error_timeout) {
    clearTimeout(error_timeout);
  }
  error_timeout = setTimeout(clear_error, 5000);
}

function clear_error() {
  setState({
    ...get_state(),
    error: null,
  });
}
