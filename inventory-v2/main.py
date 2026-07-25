#!/usr/bin/env python3
"""Flask application for the Chez Bob barcode editor."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

import config as settings


ROOT = Path(__file__).resolve().parent
STATIC_ROOT = ROOT / "static"


class ValidationError(ValueError):
    """An error that can safely be shown to an API caller."""


@dataclass(frozen=True)
class Product:
    id: int
    barcode: str
    name: str
    whole_price_cents: int
    count: int
    taxable: bool
    crv: bool
    unit_price_cents: int


def connect_database(path: Path | str) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def ensure_schema(connection: sqlite3.Connection) -> None:
    """Add package fields and keep legacy inventory.cents as the whole price."""
    inventory_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(inventory)")
    }
    requires_whole_price_repair = "price_is_whole" not in inventory_columns
    additions = (
        ("whole_price_cents", "INTEGER"),
        ("unit_count", "INTEGER NOT NULL DEFAULT 1 CHECK (unit_count > 0)"),
        ("taxable", "INTEGER NOT NULL DEFAULT 0 CHECK (taxable IN (0, 1))"),
        ("crv", "INTEGER NOT NULL DEFAULT 0 CHECK (crv IN (0, 1))"),
        ("price_is_whole", "INTEGER NOT NULL DEFAULT 1 CHECK (price_is_whole = 1)"),
    )
    with connection:
        for name, declaration in additions:
            if name not in inventory_columns:
                connection.execute(
                    f'ALTER TABLE inventory ADD COLUMN "{name}" {declaration}'
                )
        # Releases before the whole-price clarification wrote the derived unit
        # price to cents but retained the submitted whole price in this column.
        if requires_whole_price_repair and "whole_price_cents" in inventory_columns:
            connection.execute(
                """
                UPDATE inventory
                   SET cents = whole_price_cents
                 WHERE whole_price_cents IS NOT NULL
                """
            )
        connection.execute(
            """
            UPDATE inventory
               SET whole_price_cents = cents
            """
        )


def normalize_barcode(value: object) -> str:
    barcode = str(value or "").strip()
    if not barcode:
        raise ValidationError("Scan or enter a barcode.")
    if len(barcode) > settings.MAX_BARCODE_LENGTH:
        raise ValidationError(
            f"Barcode must be {settings.MAX_BARCODE_LENGTH} characters or fewer."
        )
    if any(ord(character) < 32 for character in barcode):
        raise ValidationError("Barcode contains invalid control characters.")
    return barcode


def expand_upce(barcode: str) -> str | None:
    """Return the UPC-A equivalent of a valid UPC-E code."""
    if (
        len(barcode) != 8
        or not barcode.isascii()
        or not barcode.isdigit()
        or barcode[0] not in {"0", "1"}
    ):
        return None

    number_system = barcode[0]
    first, second, third, fourth, fifth, compression, check_digit = barcode[1:]
    if compression in {"0", "1", "2"}:
        body = (
            number_system
            + first
            + second
            + compression
            + "0000"
            + third
            + fourth
            + fifth
        )
    elif compression == "3":
        body = number_system + first + second + third + "00000" + fourth + fifth
    elif compression == "4":
        body = (
            number_system
            + first
            + second
            + third
            + fourth
            + "00000"
            + fifth
        )
    else:
        body = (
            number_system
            + first
            + second
            + third
            + fourth
            + fifth
            + "0000"
            + compression
        )

    if not has_valid_gtin_checksum(body + check_digit):
        return None
    return body + check_digit


def has_valid_gtin_checksum(barcode: str) -> bool:
    if (
        len(barcode) < 2
        or not barcode.isascii()
        or not barcode.isdigit()
    ):
        return False
    body, check_digit = barcode[:-1], barcode[-1]
    weighted_sum = sum(
        int(digit) * (3 if offset % 2 == 0 else 1)
        for offset, digit in enumerate(reversed(body))
    )
    return check_digit == str((-weighted_sum) % 10)


def barcode_lookup_candidates(barcode: str) -> tuple[str, ...]:
    candidates = [barcode]
    expanded = expand_upce(barcode)
    if expanded is not None:
        candidates.extend((expanded, "00" + expanded))
    elif len(barcode) == 13 and barcode.startswith("0") and has_valid_gtin_checksum(barcode):
        candidates.append(barcode[1:])
    elif len(barcode) == 12 and has_valid_gtin_checksum(barcode):
        candidates.append("0" + barcode)
    return tuple(candidates)


def find_barcode_row(
    connection: sqlite3.Connection, barcode: str
) -> sqlite3.Row | None:
    candidates = barcode_lookup_candidates(barcode)
    placeholders = ", ".join("?" for _ in candidates)
    ordering = " ".join(
        f"WHEN ? THEN {position}" for position in range(len(candidates))
    )
    return connection.execute(
        f"""
        SELECT id, barcode, item_id
          FROM barcodes
         WHERE barcode IN ({placeholders})
         ORDER BY CASE barcode {ordering} ELSE {len(candidates)} END
         LIMIT 1
        """,
        (*candidates, *candidates),
    ).fetchone()


def normalize_product_name(value: object) -> str:
    name = str(value or "").strip()
    if not name:
        raise ValidationError("Product name is required.")
    if len(name) > settings.MAX_PRODUCT_NAME_LENGTH:
        raise ValidationError(
            "Product name must be "
            f"{settings.MAX_PRODUCT_NAME_LENGTH} characters or fewer."
        )
    if any(ord(character) < 32 for character in name):
        raise ValidationError("Product name contains invalid control characters.")
    return name


def parse_price_to_cents(value: object) -> int:
    try:
        price = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise ValidationError("Whole price must be a valid dollar amount.") from None
    if not price.is_finite() or price < 0:
        raise ValidationError("Whole price must be zero or greater.")
    if price.as_tuple().exponent < -2:
        raise ValidationError("Whole price can have at most two decimal places.")
    cents = int((price * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if cents > settings.MAX_WHOLE_PRICE_CENTS:
        raise ValidationError("Whole price is too large.")
    return cents


def parse_count(value: object) -> int:
    if isinstance(value, bool):
        raise ValidationError("Count must be a whole number.")
    try:
        count = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValidationError("Count must be a whole number.") from None
    if str(count) != str(value).strip() or count < 1:
        raise ValidationError("Count must be a whole number of at least 1.")
    if count > settings.MAX_UNIT_COUNT:
        raise ValidationError("Count is too large.")
    return count


def parse_taxable(value: object) -> bool:
    if not isinstance(value, bool):
        raise ValidationError("Taxable must be true or false.")
    return value


def rounded_unit_cents(
    whole_price_cents: int,
    count: int,
    taxable: bool = False,
    crv: bool = False,
) -> int:
    tax_multiplier = (
        Decimal("1") + settings.SALES_TAX_RATE if taxable else Decimal("1")
    )
    crv_cents_per_unit = (
        Decimal(settings.CRV_CENTS_PER_UNIT) if crv else Decimal("0")
    )
    return int(
        (
            Decimal(whole_price_cents) * tax_multiplier / Decimal(count)
            + crv_cents_per_unit
        ).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def lookup_product(connection: sqlite3.Connection, barcode: object) -> Product | None:
    normalized = normalize_barcode(barcode)
    barcode_row = find_barcode_row(connection, normalized)
    if barcode_row is None or barcode_row["item_id"] is None:
        return None
    row = connection.execute(
        """
        SELECT inventory.id,
               barcodes.barcode,
               inventory.name,
               COALESCE(inventory.whole_price_cents, inventory.cents)
                   AS whole_price_cents,
               COALESCE(inventory.unit_count, 1) AS unit_count,
               COALESCE(inventory.taxable, 0) AS taxable,
               COALESCE(inventory.crv, 0) AS crv,
               inventory.cents AS stored_whole_price_cents
          FROM barcodes
          JOIN inventory ON inventory.id = barcodes.item_id
         WHERE barcodes.id = ?
        """,
        (barcode_row["id"],),
    ).fetchone()
    if row is None:
        return None
    whole_price_cents = row["whole_price_cents"]
    count = row["unit_count"]
    taxable = bool(row["taxable"])
    crv = bool(row["crv"])
    return Product(
        id=row["id"],
        barcode=row["barcode"],
        name=row["name"],
        whole_price_cents=whole_price_cents,
        count=count,
        taxable=taxable,
        crv=crv,
        unit_price_cents=rounded_unit_cents(
            whole_price_cents, count, taxable, crv
        ),
    )


def parse_product_payload(payload: object) -> tuple[str, int, int, bool, bool]:
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    name = normalize_product_name(payload.get("name"))
    whole_price_cents = parse_price_to_cents(payload.get("whole_price"))
    count = parse_count(payload.get("count"))
    taxable = parse_taxable(payload.get("taxable"))
    crv = parse_taxable(payload.get("crv", False))
    return name, whole_price_cents, count, taxable, crv


def save_product(
    connection: sqlite3.Connection, barcode: object, payload: object
) -> Product:
    normalized = normalize_barcode(barcode)
    name, whole_price_cents, count, taxable, crv = parse_product_payload(payload)

    with connection:
        barcode_row = connection.execute(
            "SELECT id, item_id FROM barcodes WHERE barcode = ?", (normalized,)
        ).fetchone()
        matched_row = barcode_row or find_barcode_row(connection, normalized)
        if matched_row is not None and matched_row["item_id"] is not None:
            item_id = matched_row["item_id"]
            connection.execute(
                """
                UPDATE inventory
                   SET name = ?,
                       cents = ?,
                       whole_price_cents = ?,
                       unit_count = ?,
                       taxable = ?,
                       crv = ?
                 WHERE id = ?
                """,
                (
                    name,
                    whole_price_cents,
                    whole_price_cents,
                    count,
                    int(taxable),
                    int(crv),
                    item_id,
                ),
            )
            if barcode_row is None:
                connection.execute(
                    "INSERT INTO barcodes (barcode, item_id) VALUES (?, ?)",
                    (normalized, item_id),
                )
            elif barcode_row["item_id"] is None:
                connection.execute(
                    "UPDATE barcodes SET item_id = ? WHERE id = ?",
                    (item_id, barcode_row["id"]),
                )
        else:
            cursor = connection.execute(
                """
                INSERT INTO inventory
                    (name, cents, whole_price_cents, unit_count, taxable, crv)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    whole_price_cents,
                    whole_price_cents,
                    count,
                    int(taxable),
                    int(crv),
                ),
            )
            item_id = cursor.lastrowid
            if barcode_row is None:
                connection.execute(
                    "INSERT INTO barcodes (barcode, item_id) VALUES (?, ?)",
                    (normalized, item_id),
                )
            else:
                connection.execute(
                    "UPDATE barcodes SET item_id = ? WHERE id = ?",
                    (item_id, barcode_row["id"]),
                )

    product = lookup_product(connection, normalized)
    if product is None:  # Defensive: the transaction above must create the mapping.
        raise RuntimeError("Product was saved but could not be read back.")
    return product


def save_unbarcoded_product(
    connection: sqlite3.Connection,
    payload: object,
    item_id: int | None = None,
) -> Product:
    name, whole_price_cents, count, taxable, crv = parse_product_payload(payload)
    with connection:
        if item_id is None:
            cursor = connection.execute(
                """
                INSERT INTO inventory
                    (name, cents, whole_price_cents, unit_count, taxable, crv)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    whole_price_cents,
                    whole_price_cents,
                    count,
                    int(taxable),
                    int(crv),
                ),
            )
            item_id = cursor.lastrowid
        else:
            cursor = connection.execute(
                """
                UPDATE inventory
                   SET name = ?,
                       cents = ?,
                       whole_price_cents = ?,
                       unit_count = ?,
                       taxable = ?,
                       crv = ?
                 WHERE id = ?
                   AND NOT EXISTS (
                       SELECT 1 FROM barcodes WHERE barcodes.item_id = inventory.id
                   )
                """,
                (
                    name,
                    whole_price_cents,
                    whole_price_cents,
                    count,
                    int(taxable),
                    int(crv),
                    item_id,
                ),
            )
            if cursor.rowcount != 1:
                raise ValidationError("The unbarcoded product no longer exists.")

    return Product(
        id=item_id,
        barcode="",
        name=name,
        whole_price_cents=whole_price_cents,
        count=count,
        taxable=taxable,
        crv=crv,
        unit_price_cents=rounded_unit_cents(
            whole_price_cents, count, taxable, crv
        ),
    )


def product_response(product: Product | None, barcode: str) -> dict[str, object]:
    if product is None:
        return {"found": False, "barcode": barcode, "product": None}
    data = asdict(product)
    data["whole_price"] = f"{product.whole_price_cents / 100:.2f}"
    data["unit_price"] = f"{product.unit_price_cents / 100:.2f}"
    return {"found": True, "barcode": barcode, "product": data}


def create_app(
    database_path: Path | str = settings.DEFAULT_DATABASE_PATH,
) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE_PATH=Path(database_path),
        MAX_CONTENT_LENGTH=settings.MAX_REQUEST_BYTES,
        JSON_SORT_KEYS=False,
    )

    database = app.config["DATABASE_PATH"]
    if not database.is_file():
        raise FileNotFoundError(f"Database does not exist: {database}")
    with connect_database(database) as connection:
        ensure_schema(connection)

    @app.get("/")
    @app.get("/index.html")
    def index():
        return send_from_directory(STATIC_ROOT, "index.html")

    @app.get("/app.js")
    def javascript():
        return send_from_directory(STATIC_ROOT, "app.js")

    @app.get("/config.js")
    def browser_configuration():
        payload = json.dumps(settings.browser_settings(), separators=(",", ":"))
        return Response(
            f"window.CHEZBOB_CONFIG = Object.freeze({payload});\n",
            content_type="application/javascript; charset=utf-8",
        )

    @app.get("/styles.css")
    def stylesheet():
        return send_from_directory(STATIC_ROOT, "styles.css")

    @app.get("/vendor/<path:filename>")
    def vendor_file(filename: str):
        return send_from_directory(STATIC_ROOT / "vendor", filename)

    @app.get("/api/products/<path:barcode>")
    def product_lookup(barcode: str):
        normalized = normalize_barcode(barcode)
        with connect_database(app.config["DATABASE_PATH"]) as connection:
            product = lookup_product(connection, normalized)
        return jsonify(product_response(product, normalized))

    @app.put("/api/products/<path:barcode>")
    def product_save(barcode: str):
        if not request.is_json:
            raise ValidationError("Request body must be JSON.")
        payload = request.get_json(silent=True)
        if payload is None:
            raise ValidationError("Request body must be valid JSON.")
        with connect_database(app.config["DATABASE_PATH"]) as connection:
            product = save_product(connection, barcode, payload)
        return jsonify(product_response(product, product.barcode))

    @app.post("/api/unbarcoded-products")
    def unbarcoded_product_create():
        if not request.is_json:
            raise ValidationError("Request body must be JSON.")
        payload = request.get_json(silent=True)
        if payload is None:
            raise ValidationError("Request body must be valid JSON.")
        with connect_database(app.config["DATABASE_PATH"]) as connection:
            product = save_unbarcoded_product(connection, payload)
        return jsonify(product_response(product, "")), 201

    @app.put("/api/unbarcoded-products/<int:item_id>")
    def unbarcoded_product_update(item_id: int):
        if not request.is_json:
            raise ValidationError("Request body must be JSON.")
        payload = request.get_json(silent=True)
        if payload is None:
            raise ValidationError("Request body must be valid JSON.")
        with connect_database(app.config["DATABASE_PATH"]) as connection:
            product = save_unbarcoded_product(connection, payload, item_id)
        return jsonify(product_response(product, ""))

    @app.errorhandler(ValidationError)
    def validation_error(error: ValidationError):
        return jsonify(error=str(error)), 400

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify(error="Not found."), 404

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify(error="Request body is too large."), 413

    @app.errorhandler(sqlite3.Error)
    def database_error(error: sqlite3.Error):
        app.logger.error("Database operation failed: %s", error)
        return jsonify(error="The database operation could not be completed."), 500

    @app.after_request
    def security_headers(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        else:
            response.headers["Cache-Control"] = "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; "
            "style-src 'self'; img-src 'self' blob: data:; "
            "media-src 'self' blob:; connect-src 'self'; object-src 'none'; "
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        )
        return response

    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Chez Bob barcode scanner.")
    parser.add_argument(
        "--host", default=os.environ.get("CHEZBOB_HOST", settings.DEFAULT_HOST)
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("CHEZBOB_PORT", str(settings.DEFAULT_PORT))),
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=os.environ.get(
            "CHEZBOB_DATABASE",
            settings.DEFAULT_DATABASE_PATH,
        ),
    )
    parser.add_argument(
        "--cert",
        type=Path,
        default=os.environ.get("CHEZBOB_CERT", settings.DEFAULT_CERT_PATH),
        help="TLS certificate file for direct HTTPS",
    )
    parser.add_argument(
        "--key",
        type=Path,
        default=os.environ.get("CHEZBOB_KEY", settings.DEFAULT_KEY_PATH),
        help="TLS private-key file for direct HTTPS",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.database.is_file():
        raise SystemExit(f"Database does not exist: {args.database}")
    if bool(args.cert) != bool(args.key):
        raise SystemExit("--cert and --key must be supplied together.")
    for label, path in (("Certificate", args.cert), ("Private key", args.key)):
        if path and not path.is_file():
            raise SystemExit(f"{label} does not exist: {path}")
    scheme = "https" if args.cert else "http"
    print(f"Chez Bob scanner: {scheme}://{args.host}:{args.port}")
    print(f"Database: {args.database.resolve()}")
    ssl_context = (str(args.cert), str(args.key)) if args.cert else None
    create_app(args.database).run(
        host=args.host,
        port=args.port,
        ssl_context=ssl_context,
    )


if __name__ == "__main__":
    main()
