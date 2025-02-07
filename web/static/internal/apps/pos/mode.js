import { price_row, dollars } from "../../../js/money.js";
import menu from "./barcode-menu.js";

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
  // pinScrollToBottom

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
      content.innerHTML = new_content ?? "";
      if (this.pinScrollToBottom) {
        content.scrollTop = content.scrollHeight;
      }
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
  get hint() {
    return `
      - Tap your ID to sign in
      <br>
      - Scan an item to price-check
      <br>
      <div style="align-self: center; margin-top: 1em;">or</div>
      <button style="align-self: center" onclick="window.mode.manualLogin()">Manual Login</button>
      <button style="align-self: center" onclick="window.mode.noBarcodePriceCheck()">No Barcode Price Check</button>
    `;
  }

  get header() {
    return `
        <div id="logo" class="left">Chez Bob</div>
        <button class="right" onclick="window.mode.helpMode()">Help</button>
    `;
  }

  async on_scan(barcode) {
    let info = await socket.request({
      header: {
        to: "inventory",
        type: "info_req",
      },
      body: {
        barcode,
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

  async on_deposit_preflight() {
    // Set the user visible error
    this.set_error("Must be logged in to deposit money");

    // Throw the error so the bill acceptor returns the money
    throw new Error("Not logged in");
  }

  noBarcodePriceCheck() {
    set_mode(new NoBarcodePriceCheck());
  }

  manualLogin() {
    set_mode(new ManualLogin());
  }

  helpMode() {
    set_mode(new HelpMode());
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
    return price_row(this.item);
  }
}

const menu_content = Object.entries(menu)
  .map(
    ([category, items]) =>
      `<h1>${category}</h1>
     <section>
      ${Object.entries(items)
        .map(
          ([item, details]) => `
        <button data-barcode="${details.barcode}" onclick="window.mode.select_item(event)">${item}</button>
      `
        )
        .join("")}
     </section>
    `
  )
  .join("");
export class NoBarcodePriceCheck extends Session {
  title = "Manual Price Check";

  content = menu_content;

  hint = `
      <button onclick="window.mode.back()" style="float: center">Back</button>
    `;

  back() {
    set_mode(new DefaultMode());
  }

  async select_item(event) {
    try {
      await this.on_scan(event.target.dataset.barcode);
    } catch (e) {
      this.set_error(e.error ?? e);
    }
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
  get hint() {
    return `
      - Scan an item to purchase<br>
      - Deposit money using bill acceptor<br>
      <button onclick="window.mode.manual_purchase()">No Barcode?</button>
      <div style="align-self: center; margin: 1em;">or</div>
      <button onclick="window.mode.manage_account()">Manage Account</button>
    `;
  }

  constructor(user) {
    super();
    this.user = user;
  }

  get header() {
    return `
          <div id="balance" class="left header-value ${
            this.user.balance > 0 ? "positive" : "negative"
          }" data-value=${dollars(this.user.balance)}>
            <div>Balance</div>
          </div>

          <div id="user" class="header-value"
            data-value=${this.user.username}>
            <div>Username</div>
          </div>

          <button id="logout" class="glow right" onclick="window.mode.logout()">Sign Out(<session-timer></session-timer>)</button>
        `;
  }

  async on_scan(barcode) {
    this.error = null;
    let info = await socket.request({
      header: {
        to: "inventory",
        type: "info_req",
      },
      body: {
        barcode,
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
    const mode = new Purchases(this.user, []);
    await mode.purchase(item);
    set_mode(mode);
  }

  async on_deposit_preflight() {
    this.bump_timeout();
    return {
      header: {
        type: "deposit_preflight_success",
      },
      body: {},
    };
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

    this.render();
  }

  manage_account() {
    set_mode(new ManageAccount(this.user));
  }

  manual_purchase() {
    set_mode(new ManualPurchase(this.user, []));
  }

  logout() {
    set_mode(new DefaultMode());
  }
}

export class Purchases extends LoggedIn {
  purchases;
  title = "Purchases";
  pinScrollToBottom = true;

  constructor(user, purchases) {
    super(user);
    this.purchases = purchases;
  }

  get content() {
    return (
      this.purchases.map(price_row).join("") +
      this.totals() +
      "<div id='scrollAnchor'></div>"
    );
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
    return `<br><div class="totals">
        <div>Total: </div>
        <div>${dollars(sum)}</div>
        </div>`;
  }

  manual_purchase() {
    set_mode(new ManualPurchase(this.user, this.purchases));
  }
}

export class ManualPurchase extends Purchases {
  title = "Manual Purchase";
  content = menu_content;
  get hint() {
    return `
      <button onclick="window.mode.back()" style="float: center">Back</button>
    `;
  }

  back() {
    if (this.purchases.length === 0) {
      set_mode(new LoggedIn(this.user));
    } else {
      set_mode(new Purchases(this.user, this.purchases));
    }
  }

  async select_item(event) {
    const barcode = event.target.dataset.barcode;
    const mode = new Purchases(this.user, this.purchases);
    try {
      await mode.on_scan(barcode);
    } catch (e) {
      this.set_error(e.error ?? e);
    }
    set_mode(mode);
  }
}

class ManualLogin extends DefaultMode {
  title = `Sign In`;
  get hint() {
    return `
      - Tap your ID to sign in
      <br>
      - Scan an item to price-check
    `;
  }

  content = `
        <form onsubmit="window.mode.attemptLogin(event)" style="align-self: center">
            <input type="text" placeholder="username" name="username" class="glow" autocomplete="off"><br><br>
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

class HelpMode extends DefaultMode {
  color = "var(--chez-purple)";
  title = `Chez Bob Help`;
  get header() {
    return `
        <div id="logo" class="left">Chez Bob</div>
    `;
  }
  get hint() {
    return `
      <button onclick="window.mode.back()" style="float: center">Back</button>
    `;
  }

  content = `
      - Chez Bob food is not free.
      <br>
      - Chez Bob runs on the honor system<br>
      - Use your account to pay
      <br><br>
      <h1>How do I sign in?</h1>
      <section>
      Your account is automatically created<br>
      Try manually logging in:
      <div style="margin-top: 1em;">
      username: [your active directory]<br>
      password: <br>
      </div>
      </section>

      <h1>How do I pay?</h1>
      <section>
        Once you log in, you can deposit cash
      </section>

      <h1>I still have questions</h1>
      <section>
        <p>Email <span style="color: var(--bob-color)">chezbob@cs.ucsd.edu</span> for any help.
      </section>
    `;

  back() {
    set_mode(new DefaultMode());
  }
}

/*

      - There is no password by default
      <div class="faq-container">
        What is Chez Bob?
        <div class="faq-body">
          - Chez Bob is our snack co-op run by grad students, located in the grad
          student lounge.
          <br>
          - We buy food and drinks from Costco and sell them to grad
          students, faculty, staff and visitors roughly at cost.
        </div>
      </div>
      <br>
      <div class="faq-container">
        How do I use Chez Bob?
        <div class="faq-body">
          - We automatically create Chez Bob accounts with the same username as your usual UCSD
          username, with no password.
          <br>
          - You can login at the kiosk.
          <br>
          - After your first login, you can also register your _new_ ID card or any NFC card under "Manage Account"
          <br>
          - If you do not have account, email chezbob@cs.ucsd.edu.
        </div>
      </div>
      <br>
      <div class="faq-container">
        How do I pay for the food?
        <div class="faq-body">
        - After login, you can use the bill acceptor on the kiosk to add money to your account.
        <br>
        - We are working on other means of adding money to your account.
        </div>
      </div>
      <br>
      Email chezbob@cs.ucsd.edu for any unanswered questions.
*/

class ManageAccount extends LoggedIn {
  title = `Manage Account`;
  hint = `<button onclick=window.mode.goBack()>Go Back</button>`;
  content = `
        <button onclick="window.mode.setPassword()">Set Password</button>
        <button onclick="window.mode.addCard()">Add NFC Login Card</button>
        <button onclick="window.mode.viewTransactions()">View Transactions</button>
    `;

  setPassword() {
    set_mode(new SetPassword(this.user));
  }

  addCard() {
    set_mode(new AddCard(this.user));
  }

  async viewTransactions() {
    const {
      body: { transactions },
    } = await socket.request({
      header: {
        to: "inventory",
        type: "view_transactions",
      },
      body: {
        user_id: this.user.id,
      },
    });
    set_mode(new ViewTransactions(this.user, transactions));
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
  content = `Tap the card you wish to use to log in to your account (this card is not for payment, Chez Bob only accepts cash).`;
  hint = `<button onclick=window.mode.goBack()>Go Back</button>`;

  async on_scan(barcode) {
    this.bump_timeout();

    await socket.request({
      header: {
        to: "inventory",
        type: "add_user_card",
      },
      body: {
        user_id: this.user.id,
        barcode,
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

class ViewTransactions extends ManageAccount {
  static #currencyFormat = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    signDisplay: "exceptZero",
  });
  static #dateFormat = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  title = `View Transactions`;
  hint = `
        <button onclick="window.mode.goBack()">Go Back</button>
    `;

  constructor(user, transactions) {
    super(user);
    this.content = `
      <div>
        ${transactions
          .toReversed()
          .map(
            ({ name, cents, created_at }) => `
              <div class="price-row">
                <div class="price-name">
                  ${ViewTransactions.#currencyFormat.format(cents / 100)}
                  ${name ?? ""}
                </div>
                <div class="dots"></div>
                <div class="price-cost">${ViewTransactions.#dateFormat
                  .format(new Date(created_at))
                  .replace(",", "")}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }
}
