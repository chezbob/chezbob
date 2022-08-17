/**
 * The base mode class supports rendering and error messages
 */
class Mode {
  error_timeout;
  // error;
  // color;
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
      content.innerHTML = new_content ?? "";
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