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

URI = 'ws://127.0.0.1:8000/ws/echo/'


async def echo():
    # uri = URI_TEMPLATE.format(uuid=DUMMY_POS1_UUID)
    uri = 'ws://127.0.0.1:8000/ws/echo/'
    print(f"Connecting to: {uri}")

    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"message": "Hello world!"}))
        greeting = await ws.recv()
        print(greeting)


asyncio.get_event_loop().run_until_complete(echo())
