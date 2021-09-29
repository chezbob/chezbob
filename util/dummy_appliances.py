"""
This script checks various aspects of the appliance connection process.

NOTE: The UUID's used here will be loaded from chezbob/bobolith/apps/appliances/fixtures/dummy_appliances.json.
      The command to do this is `python manage.py loaddata dummy`, or provide the full path instead of dummy.

The appliances are linked POS1 -> Scanner1, POS2 -> Scanner2.

"""

import asyncio
import json

import websockets
from string import Template

URI_TEMPLATE = 'ws://127.0.0.1:8000/ws/appliances/{uuid}/'

DUMMY_POS1_UUID = 'd11ee641-f1f2-4044-9f80-d4679ee7977f'
DUMMY_POS2_UUID = 'cc87231e-e56b-4267-a8ab-cb19ad4d79af'
DUMMY_SCANNER1_UUID = 'b03b4a62-57a8-4cb2-bf5d-ff4a42e7ab0d'
DUMMY_SCANNER2_UUID = '53ac89d1-0272-4a57-bb21-d20d121a5ee1'


async def connect_and_ping():
    # uri = URI_TEMPLATE.format(uuid=DUMMY_POS1_UUID)
    uri = 'ws://127.0.0.1:8000/ws/echo/'
    print(f"Connecting to: {uri}")

    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"version": 0, "msg_type": "ping", "ping": "Gautam"}))
        greeting = await ws.recv()
        print(greeting)


asyncio.get_event_loop().run_until_complete(connect_and_ping())