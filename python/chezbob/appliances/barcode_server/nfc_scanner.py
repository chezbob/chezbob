"""A simple HID-reading scanner interface."""

import binascii
import logging
import sys
import time

import nfc


LOGGER = logging.getLogger(__name__)

DEBOUNCE_TIME = 1


class NotAvailableException(Exception):
    """Thrown by trying to do something that NFC scanners don't support."""
    pass

# 'usb:054c:06c3' 
class NFCScanner(object):
    """A simple non-threaded HID barcode scanner interface."""
    def __init__(self, device, *args, **kwargs):
        super(NFCScanner, self).__init__(*args, **kwargs)
        self.clf = nfc.ContactlessFrontend(device)
        self.last_s = None
        self.last_t = time.time()

    def get_barcode(self, verify=True):
        """Retrieve a barcode."""

        barcode = None
        while not barcode:
            tag = self.clf.connect(rdwr={'on-connect': lambda tag: False})

            barcode = "NFC:" + binascii.hexlify(tag.identifier)
            if not barcode:
                barcode = None

            if tag.product == 'Type4Tag':
                print("Ignoring type4tag")
                barcode = None

            now = time.time()
            cutoff = now - DEBOUNCE_TIME
            if self.last_s and self.last_t > cutoff:
                barcode = None
            else:
                self.last_s = barcode

            self.last_t = now

        return 0, barcode

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


if __name__ == "__main__":
    sys.exit(1)
