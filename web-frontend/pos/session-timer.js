/**
 * SessionTimer is a convenient way to display the seconds remaining in a session.
 * we use this to get around some annoyances that come from using `innerHTML = ...`
 * in mode.js. Specifically, if the contents of an element changes, that element is rerendered.
 * If that element is a button, this means its "pressed" state is reset which can cause responsiveness
 * issues. By using <session-timer>, the contents remain the same so the button stays responsive
 *  */
export class SessionTimer extends HTMLElement {
  interval; // The handle for the interval which updates the timer
  root; // Handle to the shadow DOM
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.render();
  }

  connectedCallback() {
    this.interval = setInterval(() => this.render(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this.interval);
  }

  render() {
    this.root.innerHTML = window.mode.millis_remaining
      ? Math.round(window.mode.millis_remaining() / 1000)
      : "???";
  }
}

customElements.define("session-timer", SessionTimer);
