import logging
import evdev
import asyncio



class BarcodeScanner():
    def __init__(self):
        self.dev = evdev.InputDevice("/dev/input/by-id/usb-ID_Innovations_Inc._Input_Device-event-kbd")
        self.dev.grab()
        self.loop = asyncio.get_event_loop()

    def __del__(self):
        self.dev.ungrab()

    def get_barcode()
        await read_barcdoe

    async def read_barcode(self):
        shifted = False
        buf = []
        print("hello")
        async for event in self.dev.async_read_loop():
            if event.type != evdev.events.EV_KEY:
                continue
    
            name = evdev.events.keys[event.code]
    
            if not name.startswith("KEY_"):
                LOGGER.error("Received unknown event: %s", name)
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
                print(short_name)
                break
    
            if len(short_name) > 1:
                LOGGER.info("Ignoring long-named key: %s", short_name)
                continue
    
            if shifted:
                buf.append(short_name)
            else:
                buf.append(short_name.lower())

            print(buf)
    
        barcode = ''.join(buf)
        if not barcode:
            barcode = None
        print(barcode)


scanner = BarcodeScanner()
