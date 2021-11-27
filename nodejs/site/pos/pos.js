
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


let STATE = {
    user: null, // the id of the currently signed in user. null if none
    user_timeout: null // the time at which the user gets signed out
};

const SESSION_TIME = 30000;

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
            if(curr_user() === null) {
                price_check(info.body);
            } else {
                purchase(info.body);
            }
            break;
        case "user_info":
            login(info.body)
            break;
        default:
            console.error("Unknown response: ", info);
    }
});

/** User management */

function login(user_info) {
    STATE.user = user_info.id;
    start_logout_timer();
    document.getElementById('user').innerHTML = curr_user();

    // Set the timer text immediately so it appears at the same time as the user
    set_timer_text();
    document.getElementById('price-check').innerHTML = "";
}

function logout() {
    STATE.user = null;
    document.getElementById('user').innerHTML = '';
    document.getElementById('timer').innerHTML = '';
}

function curr_user() {
    return STATE.user;
}

function purchase(item_info) {
    console.log("TODO: implement purchasing");
}

function start_logout_timer() {
    STATE.user_timeout = Date.now() + SESSION_TIME;
}

function set_timer_text() {
    if (curr_user() !== null) {
        const millis_remaining = STATE.user_timeout - Date.now();
        if (millis_remaining <= 0) {
            logout();
        } else {
            document.getElementById('timer').innerText = `(${Math.floor(millis_remaining / 1000)})`;
        }
    }
}

// It's just easier to leave the signout timer always running and have it do nothing
// if no user is signed in
setInterval(set_timer_text, 1000);

function price_check(item_info) {
    let pc = document.getElementById('price-check');
    pc.innerHTML += `<div>${item_info.name}</div><div class="dots"></div><div>${
            Math.floor(item_info.cents/100)
        }.${item_info.cents % 100
        }</div>`;

}