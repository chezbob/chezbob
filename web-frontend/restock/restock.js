import { ReconnectingSocket } from "/shared/reconnecting-socket.js";

// We claim to be POS so that we receive scan events
let socket = await ReconnectingSocket.connect("ws://localhost:8080/", "pos");

socket.on("scan_event", async (msg) => {
  report("");

  try {
    let info = await socket.request({
      header: {
        to: "/inventory",
        type: "info_req",
      },
      body: {
        barcode: msg.body.barcode,
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
    render({ barcode: msg.body.barcode });
  }
});

function render(obj) {
  let html = `
            <fieldset name="fields" id="fields">
            <input type="hidden" name="id" value="${obj?.id ?? ""}"/>
            <br />
            <label for="barcode">Barcode: </label> 
            <input disabled type="text" name="barcode" value="${
              obj?.barcode ?? ""
            }"/>
            <br />
            <label for="name">Name: </label> 
            <input required minlength=1 title="Cannot be empty" type="text" name="name" value="${
              obj?.name ?? ""
            }"/>
            <br />
            <label for="cents">Cost: </label> 
            <input required type="number" name="cents" value="${
              obj?.cents ?? ""
            }"/>
            <button id="submit" type="submit">${
              obj?.id === undefined ? "Create" : "Update"
            }</button>
            </fieldset>
    `;

  document.getElementById("form").innerHTML = html;
  document.getElementById("fields").disabled = false;
}

async function submit(ev) {
  ev.preventDefault();
  document.getElementById("fields").disabled = true;

  let form_values = {};
  document.querySelectorAll("#fields > input").forEach((el) => {
    form_values[el.name] = el.value;
  });

  try {
    await socket.request({
      header: {
        to: "/inventory",
        type: "update_info",
      },
      body: {
        id: form_values["id"] === "" ? null : form_values["id"],
        name: form_values["name"],
        cents: form_values["cents"],
        barcode: form_values["barcode"],
      },
    });
    report("Success!");
  } catch (e) {
    report(e.error);
  }
}

function report(msg) {
  document.getElementById("error").innerHTML = msg;
}

document.getElementById("form").addEventListener("submit", submit);
