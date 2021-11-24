import {WebSocketServer, WebSocket} from 'ws';
import {debug} from '../../common/reconnecting-socket.js';


const wss = new WebSocketServer({
    port: 8080,
});


wss.on('connection', handleConnect);

function handleConnect(ws, req) {
    debug(() => console.log(`New connection: ${req.url}`))

    ws.name = req.url
    ws.on('message', handleMessage.bind(ws));
    ws.on('close', handleClose.bind(ws));
}

function handleMessage(data, isBinary) {
    let msg;
    try {
        msg = validate_message(data);
    } catch (e) {
        console.error(`${e}: ${data}`);
        return;
    }

    debug(() => console.log(msg));

    let to = msg.header.to;
    msg.header.from = this.name;

    for (let client of wss.clients) {
        if (client.name === to) {
            client.send(JSON.stringify(msg))
        }
    }
}

function validate_message(data) {
    let msg;
    try {
        msg = JSON.parse(data.toString())
    } catch(e) {
        throw "Message not valid JSON";
    }
    if (typeof msg.header !== 'object') {
        throw "Missing header";
    }

    if (typeof msg.header.to !== 'string') {
        throw "Missing or malformed 'to' field";
    }

    if (typeof msg.header.id !== 'string') {
        throw "Missing or malformed 'id' field";
    }

    if (typeof msg.header.type !== 'string') {
        throw "Missing or malformed 'type' field";
    }

    return msg;
} 

function handleClose() {
    console.log(`Client disconnected ${this.name}`);
}

let alice = new WebSocket('ws://localhost:8080/alice');
alice.on('open', () => {
    alice.send(JSON.stringify({
        header: {
            to: '/bob'
        },
        body: {
            barcode: 1234
        }
    }));
})

let bob = new WebSocket('ws://localhost:8080/bob');
bob.on('message', (data) => {
    console.log(JSON.parse(data.toString()));
})