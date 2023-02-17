import { ReconnectingSocket } from "/js/reconnecting-socket.js";

// Rather than using Modes to control the socket, we put it directly on the window
// and set up handlers that invoke mode methods like `on_scan`. This keeps us from having
// to thread the socket object through all mode transitions, and from having to add and remove
// handlers to the socket on the fly.
let socket = await (async () => {
  // Allow URL parameters to configure the location of the relay server.
  const params = new URLSearchParams(window.location.search);
  const host = params.get("relay_host") ?? window.location.hostname;
  const port = params.get("relay_port") ?? window.location.port;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";

  return await ReconnectingSocket.connect(`${protocol}://${host}:${port}/`);
})();

let buffer = "";

// Since we're just listening for any keypress, we'll want to clear spurious keypresses.
// We'll say that all barcode scanners should emit their letters less than 1 second apart
// This is super generous. If a fully barcode has not been read after 1 second, start over.
let timeout;
document.onkeydown = ({ key }) => {
  if (key === "Enter" && buffer !== "") {
    scan(buffer);
    buffer = "";
  }
  // Only accept input if no input element is selected
  if (window.activeElement === undefined && key.match(/^[0-9]$/)) {
    clearTimeout(timeout);
    buffer += key;
    timeout = setTimeout(() => (buffer = ""), 1000);
  }
};

// Check whether a UPC(-A) is valid, as sometimes the barcode scanners will not process
// all 12 digits of the code. This function checks whether
// 3 * (sum of odd-indexed numbers) + (sum of even-indexed numbers) = 0 mod 10
// (assuming the code is 1-indexed), according to the UPC-A check digit specification
// https://en.wikipedia.org/wiki/Universal_Product_Code#Check_digit_calculation
async function valid_upc(upc) {
  if (upc.length != 12) return false;

  check = parseInt(upc[upc.length - 1]);
  odd_sum = 0;
  even_sum = 0;

  for (let i = 0; i < upc.length - 1; i++) {
    if (i % 2) {
      even_sum += parseInt(upc[i]);
    } else {
      odd_sum += parseInt(upc[i]);
    }
  }
  sum = 3 * odd_sum + even_sum;

  return (sum + check) % 10 == 0;
}

async function scan(upc) {
  // All commercial products should have valid UPC barcodes so a failure to validate
  // is likely caused by the scanner reading the barcode improperly.
  
  
  if (!valid_upc(upc)) {
    report("Invalid UPC detected. Try again");
    return; 
  }
  

  report("");

  try {
    let info = await socket.request({
      header: {
        to: "inventory",
        type: "info_req",
      },
      body: {
        barcode: upc,
      },
    });
    switch (info.header.type) {
      case "item_info":
        render(info.body);
        break;

      case "user_info":
        report("Scanned user id");
        break;
    }
  } catch (e) {
    render({ barcode: upc });
  }
}

function render(obj) {
  let html = `
            <fieldset name="fields" id="fields" oninput="display_cost()">
            <input type="hidden" name="id" value="${obj?.id ?? ""}"/>
            <br />
            <label for="barcode">Barcode: </label> 
            <input disabled type="text" name="barcode" value="${
              obj?.barcode ?? ""
            }"/> ${
    obj.cents !== undefined ? `Current Cost: ${dollars(obj.cents)}` : ""
  }
            <br />
            <label for="name">Name: </label> 
            <input required minlength=1 title="Cannot be empty" type="text" name="name" value="${
              obj?.name ?? ""
            }"/>
            <br />
            <label for="bulk_cost">Bulk Count: </label> 
            <input required type="number" name="bulk_count" value=""/>
            <br />
            <label for="bulk_cost">Bulk Cost: </label> 
            <input required type="text" pattern="\\d+\.\\d\\d" name="bulk_cost" value=""/>
            <br />
            <label for="bulk_cost">Tax?: </label> 
            <input type="checkbox" name="tax" />
            <br />

            <div>Calculated Cost: <span id="cost"></span></div>

            <button id="submit" type="submit">${
              obj?.id === undefined ? "Create" : "Update"
            }</button>
            </fieldset>
    `;

  document.getElementById("form").innerHTML = html;
  document.getElementById("fields").disabled = false;
}

function form_values() {
  let values = {};
  document.querySelectorAll("#fields > input").forEach((el) => {
    if (el.type === "checkbox") {
      values[el.name] = el.checked;
    } else {
      values[el.name] = el.value;
    }
  });
  return values;
}

function calculate_cost_in_cents() {
  const form = form_values();
  const bulk_cost = Number.parseFloat(form.bulk_cost);
  const tax_cost = form.tax ? bulk_cost * 1.077 : bulk_cost;
  const overhead_cost = tax_cost * 1.2;
  const unit_price = overhead_cost / Number.parseInt(form.bulk_count);
  return Math.ceil(unit_price * 100);
}

window.display_cost = () => {
  document.getElementById("cost").innerHTML =
    "$" + dollars(calculate_cost_in_cents());
};

function dollars(cents) {
  let d = Math.floor(cents / 100);
  let c = Math.abs(cents) % 100;
  return `${d}.${c < 10 ? "0" + c : c}`;
}

async function submit(ev) {
  ev.preventDefault();
  document.getElementById("fields").disabled = true;

  let form = form_values();

  try {
    await socket.request({
      header: {
        to: "inventory",
        type: "update_info",
      },
      body: {
        id: form["id"] === "" ? null : form["id"],
        name: form["name"],
        cents: calculate_cost_in_cents(),
        barcode: form["barcode"],
      },
    });
    report("Success!");
  } catch (e) {
    console.log(e);
    report(e);
  }
}

function report(msg) {
  document.getElementById("error").innerHTML = msg;
}

document.getElementById("form").addEventListener("submit", submit);
document
  .getElementById("no_barcode")
  .addEventListener("input", (ev) => scan(ev.target.value));
