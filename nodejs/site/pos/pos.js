
import { ReconnectingSocket } from "/common/reconnecting-socket.js";
import { setText } from "./terminal.js";

//#Source https://bit.ly/2neWfJ2
const uuid = () =>
    ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        (
            c ^
            (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16)
    );

let socket = await ReconnectingSocket.connect("pos");

socket.on("scan_event", async (msg) => {
    let item_info = await socket.request({
        header: {
            to: "/inventory",
            id: uuid(),
            type: "info_req",
        },
        body: {
            barcode: msg.body.barcode,
        },
    });

    price_check(item_info);
});


function price_check(item_info) {
    let pc = document.getElementById('price-check');
    pc.innerHTML += `<div>${item_info.body.name}</div><div class="dots"></div><div>${
            Math.floor(item_info.body.cents/100)
        }.${item_info.body.cents % 100
        }</div>`;

}