import { price_row, dollars } from "./money.js";

// Determines how long the user has after any interaction before the session gets reset
const SESSION_TIME = 30000;
const ERROR_TIME = SESSION_TIME;

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
    document.getElementById("content").innerHTML = this.content;

    // Set hint
    document.getElementById("hint").innerHTML = this.hint;

    // Set error
    document.getElementById("error").innerHTML = this.error || "";
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
    console.log(this.item);
    return price_row(this.item);
  }
}

/**
 * LoggedIn is distinct from Purchasing in case we want to specify some other
 * more interesting extensions for User management, where we would want to react
 * to scanned barcodes differently.
 */
export class LoggedIn extends Session {
  user;
  title = null;
  color = "green";
  hint = `- Scan an item to purchase`;

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
    const mode = new Purchasing(item);
    await mode.purchase(item);
    set_mode(mode);
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
