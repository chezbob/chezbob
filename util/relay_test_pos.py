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

URI_TEMPLATE = 'ws://0.0.0.0:8000/ws/appliances/{uuid}/'
DUMMY_POS1_UUID = 'd11ee641-f1f2-4044-9f80-d4679ee7977f'


async def echo():
    uri = URI_TEMPLATE.format(uuid=DUMMY_POS1_UUID)
    print(f"Connecting to: {uri}")

    async with websockets.connect(uri) as ws:
        while True:
            msg = await ws.recv()
            print(msg)


asyncio.get_event_loop().run_until_complete(echo())
