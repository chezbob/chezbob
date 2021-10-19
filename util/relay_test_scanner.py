"""
This script checks various aspects of the appliance connection process.

NOTE: The UUID's used here will be loaded from chezbob/bobolith/apps/appliances/fixtures/dummy_appliances.json.
      The command to do this is `python manage.py loaddata dummy`, or provide the full path instead of dummy.

The appliances are linked POS1 -> Scanner1, POS2 -> Scanner2.

"""

import asyncio
import json
import uuid

import websockets
from string import Template

URI_TEMPLATE = 'ws://0.0.0.0:8000/ws/appliances/{uuid}/'

DUMMY_SCANNER1_UUID = 'b03b4a62-57a8-4cb2-bf5d-ff4a42e7ab0d'


async def connect_and_ping():
    uri = URI_TEMPLATE.format(uuid=DUMMY_SCANNER1_UUID)
    print(f"Connecting to: {uri} ")
    # Send 3 messages to relay
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "relay",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "link_key": "pos",
                "payload": {
                    "msg": "Hello POS!"
                },
            }
        }))
        #greeting = await ws.recv()
        #print(greeting)
        print("Sent message to my POS!")
        await ws.send(json.dumps({
            "header": {
                "version": 0,
                "msg_type": "relay",
                "msg_id": str(uuid.uuid4())[:8],
            },
            "body": {
                "link_key": "pos",
                "payload": {
                    "msg": "Hello again!"
                }
            }
        }))
        print("Sent a second message!")
        #greeting = await ws.recv()
        #print(greeting)


asyncio.get_event_loop().run_until_complete(connect_and_ping())
