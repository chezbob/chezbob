function addToday() {
  let hc = document.getElementById("history-content");
  let now = new Date();
  // Get the full month name of today, e.g. "February".
  // From https://stackoverflow.com/a/18648314
  let month = now.toLocaleString("default", {month: "long"})
  let today = month + " " + now.getDate() + ", " + now.getFullYear();
  let todayDiv =
    `<div id="today">
      <h4>` + today + `</h4>
      <p>Somehow, you found your way to this history page. Good job!</p>
    </div>`;
  // createElement() gave me a headache, but this seems more convenient.
  // From https://stackoverflow.com/a/56624274
  hc.insertAdjacentHTML("beforeend", todayDiv);
}

addToday();
