import { dollars } from "../../js/money.js";

const REFRESH_INTERVAL = 60000; //ms
const USERS_PER_TABLE = 10;

async function display_wall(n = 20) {
  let response = await fetch(`/api/wos/users?n=${n}`);
  let content = document.getElementById("content");
  try {
    let users_data = await response.json();
    if (users_data.length == 0) throw "No user in debt";

    let tables = "";
    for (let i = 0; i < users_data.length; i += USERS_PER_TABLE) {
      let chunk = users_data.slice(i, i + USERS_PER_TABLE);
      tables +=
        `<table>
            <tr>
              <th class="username">Name</th>
              <th class="balance">Debt($)</th>
            </tr>` +
          chunk
            .map(
              (users) =>
                `<tr>
                    <td class="username">${users.username}</td>
                    <td class="balance">${dollars(users.balance)}</td>
                    </tr>`
            )
            .join("") +
          `</table>`;
    }
    content.innerHTML = `<div id="wall-of-shame">${tables}</div>`;
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
    console.log(debt);
    debt.total_debt = debt.total_debt * 100;  // API internally already converts total debt from cents to dollars
    debt_element.innerHTML = `Total Debt: ${dollars(debt.total_debt, true)}`;
  } catch (e) {
    debt_element.innerHTML = `<div id="message">Total debt can't be displayed today!</div>`;
  }
}

// display wall info when loading the page
display_wall();
display_debt();

// refresh the wall
setInterval(display_wall, REFRESH_INTERVAL); //ms
setInterval(display_debt, REFRESH_INTERVAL); //ms
