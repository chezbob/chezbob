import { dollars } from "../../js/money.js";

const REFRESH_INTERVAL = 60000; //ms

async function display_wall() {
  let response = await fetch("/api/wos/users");
  let content = document.getElementById("content");
  try {
    let users_data = await response.json();
    if (users_data.length == 0) throw "No user in debt";
    let table =
      `<table>
        <tr>
          <th>Name</th>
          <th>Debt($)</th>
        </tr>` +
      users_data
        .map(
          (users) =>
            `<tr>
                <td>${users.username}</td>
                <td class="balance">${dollars(users.balance)}</td>
                </tr>`
        )
        .join("") +
      `</table>`;
    content.innerHTML = table;
  } catch (e) {
    content.innerHTML = `<div id="message">No one's on the Wall of Shame.
                            <br>
                            You should still pay your debts! </div>`;
  }
}

async function display_debt() {
  let response = await fetch("/api/wos/totaldebt");
  let debt_element = document.getElementById("debt");
  try {
    let debt = await response.json();
    console.log(debt)
    debt_element.innerHTML = `Total Debt: $${debt.total_debt}`;
  } catch (e) {
    debt_element.innerHTML = `<div id="message">Total debt can't be displayed today!</div>`;
  }
}

async function display_assets() {
  let response = await fetch("/api/wos/totalassets");
  let asset_element = document.getElementById("assets");
  try {
    let debt = await response.json();
    console.log(debt)
    asset_element.innerHTML = `Total Assets: $${debt.total_assets}`;
  } catch (e) {
    asset_element.innerHTML = `<div id="message">Total assets can't be displayed today!</div>`;
  }
}

async function display_balance() {
  let response = await fetch("/api/wos/totalbalance");
  let balance_element = document.getElementById("balance");
  try {
    let debt = await response.json();
    console.log(debt)
    balance_element.innerHTML = `Overall Balance: $${debt.total_balance}`;
  } catch (e) {
    balance_element.innerHTML = `<div id="message">Total balance can't be displayed today!</div>`;
  }
}

// display wall info when loading the page
display_wall();
display_debt();
display_assets();
display_balance();

// refresh the wall
setInterval(display_wall, REFRESH_INTERVAL); //ms
setInterval(display_debt, REFRESH_INTERVAL); //ms
setInterval(display_assets, REFRESH_INTERVAL); //ms
setInterval(display_balance, REFRESH_INTERVAL); //ms
