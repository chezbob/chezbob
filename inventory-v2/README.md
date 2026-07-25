# Chez Bob barcode scanner

A phone-friendly product intake page backed by the SQLite database specified
in `config.py`. It scans common barcodes (EAN-8, EAN-13, UPC-A, UPC-E, and QR
Code), looks up the product, and creates or updates the inventory item.

The interface has two steps: capture the barcode, then review and save the
product details. Existing products show their name and current unit price as
**Original Price** for comparison. If a lookup fails, the form remains
editable and can retry without replacing the user's changes.

Active camera scanning requires HTTPS due to browser-level security and accepts a barcode after detecting
the same code in two frames. Users can also upload an image, enter a barcode
manually, or add an item without a barcode.

Both ZXing JavaScript bundles are pinned and served from `static/vendor`; the
application makes no CDN requests. License and checksum details are in
`static/vendor/README.md`.

## Run

Install the dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Create a self-signed certificate for the computer running Chez Bob. Replace
`192.168.1.3` with that computer's LAN IP address:

```bash
mkdir -p test-files/certs
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 \
  -keyout test-files/certs/chezbob-key.pem \
  -out test-files/certs/chezbob-cert.pem \
  -subj "/CN=Chez Bob Local Scanner" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.3"
chmod 600 test-files/certs/chezbob-key.pem
```

Start the server:

```bash
python3 main.py
```

The server uses the database, certificate, private key, host, and HTTPS port
specified in `config.py`. Open `https://localhost:8443` locally or
`https://192.168.1.3:8443` from a device on the same network.

Because the certificate is self-signed, each device must install and trust
`test-files/certs/chezbob-cert.pem` before active camera scanning will work.
Keep `test-files/certs/chezbob-key.pem` private. Regenerate the certificate if
the server's LAN IP address changes or the certificate expires.

Configuration defaults live in `config.py`. Environment variables and command
line options can override them when needed:

```bash
python3 main.py --host 0.0.0.0 --port 9443 --database prod.sqlite3 \
  --cert path/to/cert.pem --key path/to/key.pem
```

Other settings include sales tax, CRV, field limits, and request size. Unit
prices are calculated from the package price and quantity, with tax and CRV
applied when selected.
