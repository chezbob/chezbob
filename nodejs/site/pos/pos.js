
import { ReconnectingSocket } from "/common/reconnecting-socket.js";

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
    let info = await socket.request({
        header: {
            to: "/inventory",
            id: uuid(),
            type: "info_req",
        },
        body: {
            barcode: msg.body.barcode,
        },
    });

    switch (info.header.type) {
        case "item_info":
            price_check(info);
            break;
        case "user_info":
            login(info)
            break;
        default:
            console.error("Unknown response: ", info);
    }
});

function login(user_info) {
    console.log("LOGIN: ", user_info);
}

function price_check(item_info) {
    let pc = document.getElementById('price-check');
    pc.innerHTML += `<div>${item_info.body.name}</div><div class="dots"></div><div>${
            Math.floor(item_info.body.cents/100)
        }.${item_info.body.cents % 100
        }</div>`;

}