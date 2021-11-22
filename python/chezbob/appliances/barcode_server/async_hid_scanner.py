import asyncio
import evdev
import json
import uuid
import websockets

class HIDBarcodeScanner(object):

    supported_device_types = ['Innovation Inc', 'Hand Held Products', 'Totinfo']

    """A simple non-threaded HID barcode scanner interface."""
    def __init__(self, uuid, device_type, host, port, *args, **kwargs):
        super(HIDBarcodeScanner, self).__init__(*args, **kwargs)
        self.hid_scanner = self.discover_hid_device(device_type)
        self.ws_endpoint = f"ws://{host}:{port}/ws/appliances/{uuid}/"
        self.loop = asyncio.get_event_loop()
        self.loop.create_task(self.hid_keep_scanning())
        self.loop.run_forever()

    def discover_hid_device(self, device_type):
        devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
        if device_type not in self.supported_device_types:
            raise Exception("Device type not supported")

        for device in devices:
            if device_type in device.name:
                return device

        raise Exception("No supported HID device found")

    async def _read_barcode(self):
        shifted = False
        buf = []
        for event in self.hid_scanner.read_loop():
            if event.type != evdev.events.EV_KEY:
                continue

            name = evdev.events.keys[event.code]

            if not name.startswith("KEY_"):
                #LOGGER.error("Received unknown event: %s", name)
                continue

            if event.value != evdev.events.KeyEvent.key_down:
                continue

            short_name = name[4:]

            if short_name == "SHIFT" or short_name == "LEFTSHIFT":
                if event.value == 1:
                    shifted = True
                    continue
                elif event.value == 0:
                    shifted = False
                    continue

            if short_name == "ENTER" or short_name == "KPENTER":
                break

            if len(short_name) > 1:
                #LOGGER.info("Ignoring long-named key: %s", short_name)
                continue

            if shifted:
                buf.append(short_name)
            else:
                buf.append(short_name.lower())

        barcode = ''.join(buf)
        if not barcode:
            barcode = None

        return barcode

    async def get_barcode(self):
        """Retrieve a barcode."""
        try:
            return await self._read_barcode()
        except OSError:
            pass

    async def send_barcode(self, barcode):
        async with websockets.connect(self.ws_endpoint) as ws:
            msg = {
                "header": {
                    "version": 0,
                    "msg_type": "scan_event",
                    "msg_id": str(uuid.uuid4())[:8],
                },
                "body": {
                    "barcode": f"{barcode}"
                }
            }
            await ws.send(json.dumps({
                "header": {
                    "version": 0,
                    "msg_type": "relay",
                    "msg_id": str(uuid.uuid4())[:8],
                },
                "body": {
                    "link_key": "pos",
                    "payload": msg,
                }
            }))

    async def hid_keep_scanning(self):
        if not self.hid_scanner:
            raise Exception("Hid Device None")

        while True:
            barcode = await self.get_barcode()
            if barcode == None:
                continue
            else:
                # Send to server
                await asyncio.wait_for(self.send_barcode(barcode), timeout=5)

if __name__ == "__main__":
    host = "192.168.1.3"
    port = "8000"
    ep_uuid = 'b03b4a62-57a8-4cb2-bf5d-ff4a42e7ab0d'
    scanner = HIDBarcodeScanner(ep_uuid, "Hand Held Products", host, port)
