"""
This script checks various aspects of the appliance inventory-querying process.
Specifically, its tests the get_price, get_name, and get_quantity messages.

NOTE: This script expects you to have loaded the fixture from chezbob/bobolith/apps/inventory/fixtures/dumb_products.json

NOTE: The UUID's used here will be loaded from chezbob/bobolith/apps/appliances/fixtures/dummy_appliances.json.
      The command to do this is `python manage.py loaddata dummy`, or provide the full path instead of dummy.


"""

import asyncio
import json
import uuid

import websockets
from string import Template

URI_TEMPLATE = 'ws://127.0.0.1:8000/ws/appliances/{uuid}/'

DUMMY_POS1_UUID = 'd11ee641-f1f2-4044-9f80-d4679ee7977f'


async def connect_and_ping():
    uri = URI_TEMPLATE.format(uuid=DUMMY_POS1_UUID)
    print(f"Connecting to: {uri}")

    async with websockets.connect(uri) as ws:
        # 1. Get and print the price
        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "get_price",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "sku": "BARREL_FUNYUN"
            }
        }))
        price_response = await ws.recv()
        print(price_response)

        # 2. Get and print the name
        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "get_name",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "sku": "BARREL_FUNYUN"
            }
        }))
        name_response = await ws.recv()
        print(name_response)

        # 3. Get and print the quantity
        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "get_quantity",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "sku": "BARREL_FUNYUN"
            }
        }))
        quantity_response = await ws.recv()
        print(quantity_response)

        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "add_quantity",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "sku": "BARREL_FUNYUN",
                "quantity_to_add": 3
            }
        }))
        quantity_response = await ws.recv()
        print(quantity_response)

        # 5. Print the new quantity
        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "get_quantity",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "sku": "BARREL_FUNYUN"
            }
        }))
        quantity_response = await ws.recv()
        print(quantity_response)



asyncio.get_event_loop().run_until_complete(connect_and_ping())