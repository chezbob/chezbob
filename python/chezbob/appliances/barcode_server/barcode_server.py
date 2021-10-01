#!/usr/bin/env python
"""A bob2k14-compliant barcode server."""

from __future__ import print_function

import argparse
import json
import logging

try:
    from queue import Queue
except ImportError:
    from Queue import Queue
import sys

from threaded_barcode_scanner import ThreadedBarcodeScanner
from hid_scanner import HIDBarcodeScanner
from serial_scanner import SerialBarcodeScanner

from bob_send import Bob2k14Api

# Bullshit nfcpy only handles python 2 - :-P
if (sys.version_info < (3, 0)):
    from nfc_scanner import NFCScanner

# Default config file disabled so that we can still run without.
#DEFAULT_CONFIG_FILE = "/etc/chezbob.json"

DEFAULT_ENDPOINT = "http://127.0.0.1:8080/api"


logger = logging.getLogger("barcoded")


def get_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('-c', '--config_file', type=argparse.FileType(),
                        help="Configuration file to use.")
    parser.add_argument('--type', type=int, default=0,
                        help="Client type (0 == normal, 1 == soda)")
    parser.add_argument('--id', type=int,
                        help="Client ID")
    parser.add_argument('-i', '--hid_device', action='append',
                        help="HID device to open")
    parser.add_argument('-s', '--serial_device', action='append',
                        help="Serial device to open")
    parser.add_argument('-e', '--endpoint', default=DEFAULT_ENDPOINT,
                        help="Sodad endpoint to connect to.")

    if (sys.version_info < (3, 0)):
        parser.add_argument('-n', '--nfc_device', action='append',
                            help="NFC device to open")

    return parser.parse_args(), parser


def get_list_with_precedence(items, merge=False):
    results = []
    for x in items:
        if not isinstance(x, list):
            x = [x]
        if merge:
            results.extend(x)
        else:
            return x
    return results


def get_enqueuer(q):
    def enqueue_barcode(scanner, barcode):
        q.put((barcode, scanner))
    return enqueue_barcode


def get_running_scanner(scanner, cb):
    tscanner = ThreadedBarcodeScanner(scanner)
    tscanner.start()
    tscanner.get_barcode(callback=cb)
    return tscanner


def main():
    args, _ = get_args()

    config = {}
    if args.config_file:
        config = json.load(args.config_file)['barcoded']

    q = Queue()
    enqueuer = get_enqueuer(q)

    scanners = []
    if args.serial_device + config.get("serial_devices", []):
        for name in args.serial_device:
            sscanner = SerialBarcodeScanner(name)
            scanners.append(get_running_scanner(sscanner, enqueuer))

    if args.hid_device:
        for name in args.hid_device + config.get("hid_devices", []):
            iscanner = HIDBarcodeScanner(name)
            scanners.append(get_running_scanner(iscanner, enqueuer))

    if (sys.version_info < (3, 0)):
        if args.nfc_device + config.get("nfc_devices", []):
            for name in args.nfc_device:
                nscanner = NFCScanner(name)
                scanners.append(get_running_scanner(nscanner, enqueuer))
    elif "nfc_devices" in config:
        logger.warning("No NFC is available under python3")

    api = Bob2k14Api(config.get('endpoint', args.endpoint),
                     config.get('type', args.type),
                     config.get('id', args.id))

    while True:
        bc, scanner = q.get()
        logger.info("Scanned %s with %s", bc, scanner)
        api.send_barcode(bc)


if __name__ == "__main__":
    sys.exit(main())
