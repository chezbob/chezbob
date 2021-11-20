#!/bin/bash

sudo python3.8 driver.py

# In case device busy: `ps ax` and then kill the process
# In case device busy for nfc: sudo python3.8 -m nfc --search-tty