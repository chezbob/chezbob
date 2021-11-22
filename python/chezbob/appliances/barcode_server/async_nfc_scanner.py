import asyncio
import binascii
import nfc
import json
import re
import subprocess
import time
import uuid
import websockets

class NFCReader(object):

    supported_device_types = ['Sony', 'ACS']
    DEBOUNCE_TIME = 1

    """A simple non-threaded NFC Reader interface."""
    def __init__(self, uuid, device_type, host, port, *args, **kwargs):
        super(NFCReader, self).__init__(*args, **kwargs)
        device = self.discover_nfc_device(device_type)
        self.clf = nfc.ContactlessFrontend(device)
        self.last_s = None
        self.last_t = time.time()
        self.ws_endpoint = f"ws://{host}:{port}/ws/appliances/{uuid}/"
        self.loop = asyncio.get_event_loop()
        self.loop.create_task(self.nfc_keep_scanning())
        self.loop.run_forever()

    def discover_nfc_device(self, device_type):
        if device_type not in self.supported_device_types:
            raise Exception("Device type not supported")
        
        try:
            lsusb_output = subprocess.check_output("lsusb").splitlines()
            device_re = re.compile(b"Bus\s+(?P<bus>\d+)\s+Device\s+(?P<device>\d+).+ID\s(?P<id>\w+:\w+)\s(?P<tag>.+)$", re.I)
            for i in lsusb_output:
                if i:
                    info = device_re.match(i)
                    if info:
                        dinfo = info.groupdict()
                        tag = dinfo.pop('tag').decode('utf-8').strip()
                        bus = dinfo.pop('bus').decode('utf-8').strip()
                        device = dinfo.pop('device').decode('utf-8').strip()
                        device_name = tag
                        device_path = ('/dev/bus/usb/%s/%s' % (bus,device))
                        nfc_required_device_path = 'usb:{}:{}'.format(bus, device)
                        if device_type in device_name:
                            return nfc_required_device_path
            
        except Exception as e:
            print("Error Occurred during auto discovering nfc device: {}".format(e))
            if "Device or resource busy" in str(e):
                print("Try: sudo modprobe -r port100")

        return None
    
    async def get_barcode(self):
        """Retrieve a barcode."""

        barcode = None
        while not barcode:
            tag = self.clf.connect(rdwr={'on-connect': lambda tag: False})
            #print(tag)
            #print(binascii.hexlify(tag.identifier))
            try:
                barcode = binascii.hexlify(tag.identifier).decode('ascii')
            except Exception as e:
                print("Error get tag",e )
                barcode = None
            #if not barcode:
                #barcode = None

            #if tag.product == 'Type4Tag':
                #print("Ignoring type4tag")
                #barcode = None

            now = time.time()
            cutoff = now - self.DEBOUNCE_TIME
            if self.last_s and self.last_t > cutoff:
                barcode = None
            else:
                self.last_s = barcode

            self.last_t = now

        return barcode

    def simple_beep(self, _=None):  # pylint: disable=no-self-use
        """Beeping isn't supported on HID scanners."""
        raise NotAvailableException("NFC devices can't beep")

    def good_beep(self, _=None):  # pylint: disable=no-self-use
        """Beeping isn't supported on HID scanners."""
        raise NotAvailableException("NFC devices can't beep")

    def bad_beep(self, _=None):  # pylint: disable=no-self-use
        """Beeping isn't supported on HID scanners."""
        raise NotAvailableException("NFC devices can't bad_beep")

    def supports_beep(self):  # pylint: disable=no-self-use
        """Whether or not we support beeping (we don't)."""
        return False

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

    async def nfc_keep_scanning(self):
        if not self.clf:
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
    scanner = NFCReader(ep_uuid, "Sony", host, port)
