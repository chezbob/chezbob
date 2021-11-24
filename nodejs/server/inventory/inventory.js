import { ReconnectingSocket } from "../../common/reconnecting-socket.js";
import { v4 as uuidv4 } from "uuid";
import knex from "knex";
import config from "./db/knexfile.js";

let db = knex(config.development);
let inventory = await ReconnectingSocket.connect("inventory");

inventory.on("info_req", async (msg) => {
  console.log(msg);
  let src = msg.header.from;
  let response_to = msg.header.id;
  let barcode = msg.body.barcode;

  let items = await db("inventory").select().where({ barcode });
  console.log(items);

  if (items.length === 0) {
    inventory.send(
      JSON.stringify({
        header: {
          id: uuidv4(),
          response_to,
          to: src,
          type: "item_info_not_found",
        },
        body: {},
      })
    );
  } else {
    inventory.send(
      JSON.stringify({
        header: {
          id: uuidv4(),
          response_to,
          to: src,
          type: "item_info",
        },
        body: items[0],
      })
    );
  }
});
