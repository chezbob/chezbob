const REFRESH_INTERVAL = 60000; //ms

function dollars(cents) {
    let d = Math.abs(Math.trunc(cents / 100));
    let c = Math.abs(cents) % 100;
    return `${cents < 0 ? "-" : ""}${d}.${c < 10 ? "0" + c : c}`;
}

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
    content.innerHTML = `<div id="message">No one on the Wall Of Shame
                            <br>
                            You should still pay your debts! </div>`;
  }
}

// display wall info when loading the page
display_wall();

// refresh the wall
setInterval(display_wall, REFRESH_INTERVAL); //ms
