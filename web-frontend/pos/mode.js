import { price_row, dollars } from "./money.js";

// Determines how long the user has after any interaction before the session gets reset
const SESSION_TIME = 30000;
const ERROR_TIME = 3000;

/**
 * The base mode class supports rendering and error messages
 */
class Mode {
  error_timeout;
  // error;
  // color;
  // header;
  // title;
  // content;
  // hint;

  // The render function is the only routine that updates the DOM. This means our UI is a function
  // from mode to UI.
  render() {
    if (window.mode != this) {
      return;
    }
    // Set color
    document.body.style.setProperty("--bob-color", this.color);

    // Set Header
    document.getElementsByTagName("header")[0].innerHTML = this.header;

    // Set title
    if (this.title === null) {
      delete document.getElementById("content").dataset.title;
    } else {
      document.getElementById("content").dataset.title = this.title;
    }

    // Set content
    const content = document.getElementById("content");
    const new_content = this.content;
    if (content.innerHTML != new_content) {
      content.innerHTML = new_content ?? '';
    }

    // Set hint
    const hint = document.getElementById("hint");
    const new_hint = this.hint;
    if (hint.innerHTML != new_hint) {
      hint.innerHTML = new_hint;
    }

    // Set error
    const error = document.getElementById("error");
    const new_error = this.error || "&nbsp;";
    if (error.innerHTML != new_error) {
      error.innerHTML = new_error;
    }
  }

  /**
   * Be sure to use set_error for error messages so that the text and timeout are kept in sync
   * @param {string} txt
   */
  set_error(txt) {
    this.error = txt;
    this.error_timeout = Date.now() + ERROR_TIME;
    this.render();
  }
}

export class DefaultMode extends Mode {
  color = "var(--chez-blue)";
  title = null;
  hint = `
      - Scan your ID to sign in
      <br />
      - Scan an item to price-check
      <br />
      <div style="align-self: center; margin: 1em;">or</div>
      <button style="align-self: center" onclick="window.mode.manualLogin()">Manual Login</button>
    `;
  get header() {
    return `
        <div id="logo">Chez Bob</div>
    `;
  }

  async on_scan(msg) {
    let info = await socket.request({
      header: {
        to: "inventory",
        type: "info_req",
      },
      body: {
        barcode: msg.body.barcode,
      },
    });

    switch (info.header.type) {
      case "item_info":
        set_mode(new PriceCheck(info.body));
        break;
      case "user_info":
        set_mode(new LoggedIn(info.body));
        break;
    }
  }

  async on_deposit() {
    // Set the user visible error
    this.set_error("Must be logged in to deposit money");

    // Throw the error so the bill acceptor returns the money
    throw new Error("Not logged in");
  }

  manualLogin() {
    set_mode(new ManualLogin());
  }
}

export class Session extends DefaultMode {
  timeout;

  constructor() {
    super();
    this.bump_timeout();
  }

  bump_timeout() {
    this.timeout = Date.now() + SESSION_TIME;
  }

  millis_remaining() {
    return this.timeout - Date.now();
  }
}

export class PriceCheck extends Session {
  item;
  constructor(item) {
    super();
    this.item = item;
  }
  title = `Price Check`;

  get content() {
	 return  price_row(this.item);
  }
}

/**
 * LoggedIn is distinct from Purchasing in case we want to specify some other
 * more interesting extensions for User management, where we would want to react
 * to scanned barcodes differently.
 */
export class LoggedIn extends Session {
  user;
  rerender = true;
  title = null;
  color = "var(--chez-green)";
  hint = `
    - Scan an item to purchase<br>
    <div style="align-self: center; margin: 1em;">or</div>
    <button onclick="window.mode.manage_account()">Manage Account</button>   
  `;

  constructor(user) {
    super();
    this.user = user;
  }

  get header() {
    return `
          <div id="balance" class=${
            this.user.balance > 0 ? "positive" : "negative"
          } data-balance=${dollars(this.user.balance)}>
            <div>Balance</div>
          </div>

          <button id="logout" class="glow" onclick="window.mode.logout()">Sign Out(${Math.floor(
            this.millis_remaining() / 1000
          )})</button>
        `;
  }

  async on_scan(msg) {
    this.error = null;
    let info = await socket.request({
      header: {
        to: "inventory",
        type: "info_req",
      },
      body: {
        barcode: msg.body.barcode,
      },
    });

    switch (info.header.type) {
      case "item_info":
        await this.purchase(info.body);
        break;
      case "user_info":
        this.set_error("Already signed in");
        break;
    }
  }

  async purchase(item) {
    const mode = new Purchasing(this.user);
    await mode.purchase(item);
    set_mode(mode);
  }

  async on_deposit(deposit_money) {
    this.bump_timeout();
    const cents = deposit_money.body?.cents;
    if (typeof cents !== "number") {
      throw new Error("Invalid deposit_money request");
    }

    const deposit_success = await socket.request({
      header: {
        to: "inventory",
        type: "deposit_money",
      },
      body: {
        user_id: this.user.id,
        cents,
      },
    });

    this.user.balance = deposit_success.body.balance;

    // Don't put rendering on the hotpath for accepting cash
    setTimeout(() => this.render, 0);

    return {
      header: {
        type: "deposit_success",
      },
      body: {},
    };
  }

  manage_account() {
    set_mode(new ManageAccount(this.user));
  }

  logout() {
    set_mode(new DefaultMode());
  }
}

export class Purchasing extends LoggedIn {
  purchases = [];
  title = "Purchases";

  get content() {
    return this.purchases.map(price_row).join("") + this.totals();
  }

  async purchase(item_info) {
    this.bump_timeout();
    let resp = await socket.request({
      header: {
        to: "inventory",
        type: "purchase",
      },
      body: {
        user_id: this.user.id,
        item_id: item_info.id,
      },
    });
    console.log("RESP", resp);
    this.purchases.push(resp.body.item);
    this.user.balance = resp.body.balance;
    this.render();
  }

  totals() {
    const sum = this.purchases.reduce((sum, i) => sum + i.cents, 0);
    return `<br><div class='totals'>
        <div>Total: </div>
        <div>${dollars(sum)}</div>
        </div>`;
  }
}

class ManualLogin extends DefaultMode {
  title = `Sign In`;
  hint = `
      - Scan your ID to sign in
      <br>
      - Scan an item to price-check
    `;

  content = `
        <form onsubmit="window.mode.attemptLogin(event)" style="align-self: center">
            <input type="text" placeholder="username" name="username" class="glow"><br><br>
            <input type="password" placeholder="password" name="password" class="glow"><br><br>
            <button type="submit">Sign In</button>
            <button onclick="window.mode.cancel()" style="float: right">Cancel</button>
        </form>
    `;

  async attemptLogin(event) {
    event.preventDefault();
    const username = document.querySelector("input[name=username]").value;
    const password = document.querySelector("input[name=password]").value;
    this.set_error("");
    try {
      const user = await socket.request({
        header: {
          to: "inventory",
          type: "login",
        },
        body: {
          username,
          password,
        },
      });
      set_mode(new LoggedIn(user.body));
    } catch (e) {
      console.error(e);
      this.set_error(e.error);
    }
  }

  cancel() {
    set_mode(new DefaultMode());
  }
}

class ManageAccount extends LoggedIn {
  title = `Manage Account`;
  hint = `<button onclick=window.mode.goBack()>Go Back</button>`;
  content = `
        <button onclick="window.mode.setPassword()">Set Password</button>
        <button onclick="window.mode.addCard()">Add Card</button>
    `;

  setPassword() {
    set_mode(new SetPassword(this.user));
  }

  addCard() {
    set_mode(new AddCard(this.user));
  }

  goBack() {
    set_mode(new LoggedIn(this.user));
  }

  on_scan() {}
}

class SetPassword extends ManageAccount {
  title = `Set Password`;
  hint = `
        <button onclick="window.mode.goBack()">Go Back</button>
    `;
  content = `
        <form onsubmit="window.mode.setPassword(event)" style="align-self: center">
            <input type="password" placeholder="New Password" name="password" oninput="window.mode.bump_timeout()" class="glow"><br><br>
            <input type="password" placeholder="Confirm Password" name="confirmation" oninput="window.mode.bump_timeout()" class="glow"><br><br>
            <button type="submit">Set Password</button>
        </form>
    `;

  async setPassword(event) {
    event.preventDefault();
    const password = document.querySelector("input[name=password]").value;
    const confirmation = document.querySelector(
      "input[name=confirmation]"
    ).value;

    if (password !== confirmation) {
      console.log(password, confirmation);
      return this.set_error("Passwords do not match");
    }

    await socket.request({
      header: {
        type: "set_password",
        to: "inventory",
      },
      body: {
        user_id: this.user.id,
        password,
      },
    });

    set_mode(new LoggedIn(this.user));
  }
}

export class AddCard extends ManageAccount {
  title = `Add Card`;
  content = `Scan the card you wish to add to your account.`;
  hint = `<button onclick=window.mode.goBack()>Go Back</button>`;

  async on_scan(msg) {
    this.bump_timeout();

    await socket.request({
      header: {
        to: "inventory",
        type: "add_user_card",
      },
      body: {
        user_id: this.user.id,
        barcode: msg.body.barcode,
      },
    });

    set_mode(new CardAdded(this.user));
  }
}

class CardAdded extends ManageAccount {
  title = `Add Card`;
  content = `Card successfully added!`;
  hint = `
    <button onclick="window.mode.addAnother()">Add Another</button>
    <button onclick="window.mode.done()">Done</button>
    `;

  addAnother() {
    set_mode(new AddCard(this.user));
  }

  done() {
    set_mode(new LoggedIn(this.user));
  }
}
