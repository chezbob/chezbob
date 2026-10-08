from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

import config as settings
from audit import log_audit
from database import connect_database
from errors import ValidationError


inventory_api = Blueprint("inventory_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@inventory_api.get("/item-scanner")
@inventory_api.get("/item-scanner/")
def inventory_page():
    return send_from_directory(STATIC_ROOT, "index.html")


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


def has_valid_gtin_checksum(barcode: str) -> bool:
    if len(barcode) < 2 or not barcode.isascii() or not barcode.isdigit():
        return False
    body, check_digit = barcode[:-1], barcode[-1]
    weighted_sum = sum(
        int(digit) * (3 if offset % 2 == 0 else 1)
        for offset, digit in enumerate(reversed(body))
    )
    return check_digit == str((-weighted_sum) % 10)


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
        body = number_system + first + second + compression + "0000" + third + fourth + fifth
    elif compression == "3":
        body = number_system + first + second + third + "00000" + fourth + fifth
    elif compression == "4":
        body = number_system + first + second + third + fourth + "00000" + fifth
    else:
        body = number_system + first + second + third + fourth + fifth + "0000" + compression

    if not has_valid_gtin_checksum(body + check_digit):
        return None
    return body + check_digit


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


def find_barcode_row(connection, barcode: str):
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
            f"Product name must be {settings.MAX_PRODUCT_NAME_LENGTH} characters or fewer."
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
    tax_multiplier = Decimal("1") + settings.SALES_TAX_RATE if taxable else Decimal("1")
    crv_cents_per_unit = Decimal(settings.CRV_CENTS_PER_UNIT) if crv else Decimal("0")
    final_cost_cents = (
        Decimal(whole_price_cents) * tax_multiplier / Decimal(count)
        + crv_cents_per_unit
    )
    return int(
        (final_cost_cents * (Decimal("1") + settings.PROFIT_RATE)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def lookup_product(connection, barcode: object) -> Product | None:
    normalized = normalize_barcode(barcode)
    barcode_row = find_barcode_row(connection, normalized)
    if barcode_row is None or barcode_row["item_id"] is None:
        return None
    row = connection.execute(
        """
        SELECT inventory.id, barcodes.barcode, inventory.name,
               COALESCE(inventory.whole_price_cents, inventory.cents) AS whole_price_cents,
               inventory.cents AS unit_price_cents,
               COALESCE(inventory.unit_count, 1) AS unit_count,
               COALESCE(inventory.taxable, 0) AS taxable,
               COALESCE(inventory.crv, 0) AS crv
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
        id=row["id"], barcode=row["barcode"], name=row["name"],
        whole_price_cents=whole_price_cents, count=count, taxable=taxable, crv=crv,
        unit_price_cents=row["unit_price_cents"],
    )


def parse_product_payload(payload: object) -> tuple[str, int, int, bool, bool]:
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object.")
    return (
        normalize_product_name(payload.get("name")),
        parse_price_to_cents(payload.get("whole_price")),
        parse_count(payload.get("count")),
        parse_taxable(payload.get("taxable")),
        parse_taxable(payload.get("crv", False)),
    )


def save_product(connection, barcode: object, payload: object) -> Product:
    normalized = normalize_barcode(barcode)
    name, whole_price_cents, count, taxable, crv = parse_product_payload(payload)
    unit_price_cents = rounded_unit_cents(
        whole_price_cents, count, taxable, crv
    )
    with connection:
        barcode_row = connection.execute(
            "SELECT id, item_id FROM barcodes WHERE barcode = ?", (normalized,)
        ).fetchone()
        matched_row = barcode_row or find_barcode_row(connection, normalized)
        if matched_row is not None and matched_row["item_id"] is not None:
            item_id = matched_row["item_id"]
            before = dict(
                connection.execute(
                    """
                    SELECT name, cents, whole_price_cents, unit_count, taxable, crv
                      FROM inventory WHERE id = ?
                    """,
                    (item_id,),
                ).fetchone()
            )
            connection.execute(
                """
                UPDATE inventory
                   SET name = ?, cents = ?, whole_price_cents = ?, unit_count = ?,
                       taxable = ?, crv = ?
                 WHERE id = ?
                """,
                (name, unit_price_cents, whole_price_cents, count, int(taxable), int(crv), item_id),
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
            action = "inventory.update"
        else:
            before = None
            cursor = connection.execute(
                """
                INSERT INTO inventory
                    (name, cents, whole_price_cents, unit_count, taxable, crv)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (name, unit_price_cents, whole_price_cents, count, int(taxable), int(crv)),
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
            action = "inventory.create"
        after = {
            "name": name,
            "whole_price_cents": whole_price_cents,
            "unit_count": count,
            "taxable": taxable,
            "crv": crv,
            "profit_rate": float(settings.PROFIT_RATE),
            "unit_price_cents": unit_price_cents,
        }
        log_audit(
            connection,
            action,
            "inventory",
            item_id,
            details={"barcode": normalized, "before": before, "after": after},
        )
    product = lookup_product(connection, normalized)
    if product is None:
        raise RuntimeError("Product was saved but could not be read back.")
    return product


def save_unbarcoded_product(
    connection, payload: object, item_id: int | None = None
) -> Product:
    name, whole_price_cents, count, taxable, crv = parse_product_payload(payload)
    unit_price_cents = rounded_unit_cents(
        whole_price_cents, count, taxable, crv
    )
    with connection:
        if item_id is None:
            before = None
            cursor = connection.execute(
                """
                INSERT INTO inventory
                    (name, cents, whole_price_cents, unit_count, taxable, crv)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (name, unit_price_cents, whole_price_cents, count, int(taxable), int(crv)),
            )
            item_id = cursor.lastrowid
            action = "inventory.create"
        else:
            existing = connection.execute(
                """
                SELECT name, cents, whole_price_cents, unit_count, taxable, crv
                  FROM inventory WHERE id = ?
                """,
                (item_id,),
            ).fetchone()
            before = dict(existing) if existing else None
            cursor = connection.execute(
                """
                UPDATE inventory
                   SET name = ?, cents = ?, whole_price_cents = ?, unit_count = ?,
                       taxable = ?, crv = ?
                 WHERE id = ?
                   AND NOT EXISTS (
                       SELECT 1 FROM barcodes WHERE barcodes.item_id = inventory.id
                   )
                """,
                (name, unit_price_cents, whole_price_cents, count, int(taxable), int(crv), item_id),
            )
            if cursor.rowcount != 1:
                raise ValidationError("The unbarcoded product no longer exists.")
            action = "inventory.update"
        after = {
            "name": name,
            "whole_price_cents": whole_price_cents,
            "unit_count": count,
            "taxable": taxable,
            "crv": crv,
            "profit_rate": float(settings.PROFIT_RATE),
            "unit_price_cents": unit_price_cents,
        }
        log_audit(
            connection,
            action,
            "inventory",
            item_id,
            details={"barcode": None, "before": before, "after": after},
        )
    return Product(
        id=item_id, barcode="", name=name, whole_price_cents=whole_price_cents,
        count=count, taxable=taxable, crv=crv,
        unit_price_cents=unit_price_cents,
    )


def product_response(product: Product | None, barcode: str) -> dict[str, object]:
    if product is None:
        return {"found": False, "barcode": barcode, "product": None}
    data = asdict(product)
    data["whole_price"] = f"{product.whole_price_cents / 100:.2f}"
    data["unit_price"] = f"{product.unit_price_cents / 100:.2f}"
    return {"found": True, "barcode": barcode, "product": data}


def json_payload() -> object:
    if not request.is_json:
        raise ValidationError("Request body must be JSON.")
    payload = request.get_json(silent=True)
    if payload is None:
        raise ValidationError("Request body must be valid JSON.")
    return payload


@inventory_api.get("/api/products/<path:barcode>")
def product_lookup(barcode: str):
    normalized = normalize_barcode(barcode)
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        product = lookup_product(connection, normalized)
    return jsonify(product_response(product, normalized))


@inventory_api.put("/api/products/<path:barcode>")
def product_save(barcode: str):
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        product = save_product(connection, barcode, json_payload())
    return jsonify(product_response(product, product.barcode))


@inventory_api.post("/api/unbarcoded-products")
def unbarcoded_product_create():
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        product = save_unbarcoded_product(connection, json_payload())
    return jsonify(product_response(product, "")), 201


@inventory_api.put("/api/unbarcoded-products/<int:item_id>")
def unbarcoded_product_update(item_id: int):
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        product = save_unbarcoded_product(connection, json_payload(), item_id)
    return jsonify(product_response(product, ""))
