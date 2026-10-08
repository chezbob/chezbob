# Chez Bob admin panel

An internal Flask admin panel backed by the SQLite database specified in
`config.py`. The root opens a monthly dashboard and the navigation provides:

- headline activity, debt, purchase, restocking, and popularity metrics;
- per-item daily sales charts on inventory detail pages, sharing the purchase-history date range;
- paginated transaction and debt reports;
- rolling one-month popular-item and volunteer rankings with their exact date ranges;
- date-filterable restock history;
- searchable, balance-sortable, read-only user accounts, balances, funding activity, and history;
- searchable inventory with price/last-purchase sorting and per-item purchase history;
- an audit log for SSH user administration and inventory changes, exportable in full as CSV; and
- the phone-friendly item scanner at `/item-scanner`.

Balance adjustments are normal transactions, so the existing `balances` view
updates automatically. They are also linked to an `admin_adjustments` audit
record, including the optional note. The table and index are created
automatically when the application starts.

## Backend layout

Each system owns its page and API routes:

- `inventory.py` — barcode lookup and product intake;
- `inventory_admin.py` — searchable inventory reporting and item purchase history;
- `transactions.py` — complete transaction reporting;
- `popular_items.py` — monthly item rankings;
- `volunteers.py` — restocker rankings;
- `debt.py` — paginated debt reporting;
- `users.py` — read-only user search, balances, and history;
- `user-tools/user_management.py` — audited user mutation operations;
- `user-tools/manage_users.py` — the interactive SSH administration entry point; and
- `logs.py` — audit history.

Shared database/schema work is in `database.py`, and reusable admin query
helpers are in `admin_common.py`. `main.py` is limited to application wiring,
shared static assets and error handling, command-line configuration, and server
startup.

## SSH user administration

The web panel treats user records as read-only. SSH into the server and start
the interactive utility for user creation, identity edits, blank-password
resets, or balance adjustments:

```bash
python3 user-tools/manage_users.py
```

Use `--database PATH` to override the database from `config.py`. The utility
shows an action menu and asks for confirmation before each change. Every write
is stored in `audit_logs` with the invoking Unix/SSH username. If invoked with
`sudo`, it records `SUDO_USER` rather than `root` when that variable is present.

Inventory creates and updates are also audited, using `inventory-scanner` as
the actor. Schema migrations are system startup operations and are not added to
the audit log. The obsolete OAuth `admin_access` table is removed on startup;
restore it from a database backup only if its historical allowlist is needed.

## Item scanner

The scanner handles common barcodes (EAN-8, EAN-13, UPC-A, UPC-E, and QR Code),
looks up the product, and creates or updates the inventory item.

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
specified in `config.py`. Open `https://localhost:8443` locally for the admin
panel, or `https://localhost:8443/item-scanner` for scanning. From another device,
use the computer's LAN address, such as `https://192.168.1.3:8443/item-scanner`.

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

Other settings include sales tax, CRV, profit rate, field limits, and request
size. Unit prices are calculated from the package price and quantity. Tax and
CRV are added when selected, then `PROFIT_RATE` is applied to that final cost.
The resulting unit price is stored in `inventory.cents`; reporting and existing
item lookups read that final price without applying the surcharge again. The
configured profit rate in `config.py` is 20%.

## Test

After installing the dependencies, run the regression suite with:

```bash
python3 -m unittest discover -s tests
```
