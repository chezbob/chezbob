"""A simple HID-reading scanner interface."""

import logging
import sys
import time
import traceback

import evdev


LOGGER = logging.getLogger(__name__)


# Type: e.g. key. See evdev.events.EV_*
# Code: e.g. 11 == '0'. See evdev.events.keys
# Value: e.g. 1 (down), 0 (up), 2 (hold). evdev.events.KeyEvent

def _get_device(device):
    """Create the device object and grab exclusive use of it."""
    dev = evdev.InputDevice(device)
    dev.grab()
    return dev


class NotAvailableException(Exception):
    """Thrown by trying to do something that HID scanners don't support."""
    pass

# hid_scanner.HIDBarcodeScanner('/dev/input/event4')
class HIDBarcodeScanner(object):
    """A simple non-threaded HID barcode scanner interface."""
    def __init__(self, device, *args, **kwargs):
        super(HIDBarcodeScanner, self).__init__(*args, **kwargs)
        self.device_name = device
        self._try_connect()

    def _try_connect(self):
        self.dev = _get_device(self.device_name)

    def _try_reconnect(self):
        LOGGER.info("Attempting reconnect...")
        delay = 1
        for i in range(10):
            try:
                self._try_connect()
            except Exception:
                LOGGER.error("Couldn't reconnect %d...", i)
                time.sleep(delay)
                delay = 2 * delay if i < 6 else delay
            else:
                return True
        LOGGER.info("Giving up on reconnect attempts.")

        return False

    def _read_barcode(self):
        shifted = False
        buf = []
        for event in self.dev.read_loop():
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
                break

            if len(short_name) > 1:
                LOGGER.info("Ignoring long-named key: %s", short_name)
                continue

            if shifted:
                buf.append(short_name)
            else:
                buf.append(short_name.lower())

        barcode = ''.join(buf)
        if not barcode:
            barcode = None

        return 0, barcode

    def get_barcode(self):
        """Retrieve a barcode."""
        try:
            return self._read_barcode()
        except OSError:
            LOGGER.error("Caught OSError... trying to reconnect.")
            if self._try_reconnect():
                LOGGER.info("Reconnect succeeded.")
                return self.get_barcode()
            LOGGER.error("Reconnect failed. Exiting.")
            traceback.print_exc()
            sys.exit(1)

    def simple_beep(self, _=None):  # pylint: disable=no-self-use
        """Beeping isn't supported on HID scanners."""
        raise NotAvailableException("HID devices can't beep")

    def good_beep(self, _=None):  # pylint: disable=no-self-use
        """Beeping isn't supported on HID scanners."""
        raise NotAvailableException("HID devices can't beep")

    def bad_beep(self, _=None):  # pylint: disable=no-self-use
        """Beeping isn't supported on HID scanners."""
        raise NotAvailableException("HID devices can't bad_beep")

    def supports_beep(self):  # pylint: disable=no-self-use
        """Whether or not we support beeping (we don't)."""
        return False


if __name__ == "__main__":
    sys.exit(1)

