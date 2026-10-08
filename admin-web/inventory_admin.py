from datetime import timedelta
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from admin_common import (
    TRANSACTION_SELECT,
    date_filters,
    escape_like,
    page_payload,
    pagination_args,
    parse_date,
    rolling_month_window,
    search_value,
    transaction_dict,
)
from database import connect_database
from errors import ValidationError


inventory_admin_api = Blueprint("inventory_admin_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@inventory_admin_api.get("/inventory/items")
@inventory_admin_api.get("/inventory/<int:_item_id>")
def inventory_admin_page(_item_id: int | None = None):
    return send_from_directory(STATIC_ROOT, "admin.html")


def item_dict(row) -> dict[str, object]:
    whole_price_cents = row["whole_price_cents"]
    unit_count = row["unit_count"]
    taxable = bool(row["taxable"])
    crv = bool(row["crv"])
    return {
        "id": row["id"],
        "name": row["name"],
        "whole_price_cents": whole_price_cents,
        "unit_count": unit_count,
        "taxable": taxable,
        "crv": crv,
        "price_cents": row["price_cents"],
        "last_purchased_at": row["last_purchased_at"],
        "purchase_count": row["purchase_count"],
    }


@inventory_admin_api.get("/api/inventory-items")
def inventory_items():
    page, page_size = pagination_args()
    query = search_value("q")
    sort = request.args.get("sort", "last_purchased_desc")
    valid_sorts = {
        "last_purchased_desc",
        "last_purchased_asc",
        "price_desc",
        "price_asc",
    }
    if sort not in valid_sorts:
        raise ValidationError(
            "Sort must be last_purchased_desc, last_purchased_asc, price_desc, or price_asc."
        )
    parameters: list[object] = []
    where = ""
    if query:
        where = " WHERE LOWER(i.name) LIKE LOWER(?) ESCAPE '\\'"
        parameters.append(f"%{escape_like(query)}%")
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        rows = connection.execute(
            """
            SELECT i.id, i.name,
                   COALESCE(i.whole_price_cents, i.cents) AS whole_price_cents,
                   i.cents AS price_cents,
                   COALESCE(i.unit_count, 1) AS unit_count,
                   COALESCE(i.taxable, 0) AS taxable,
                   COALESCE(i.crv, 0) AS crv,
                   MAX(CASE WHEN t.cents < 0 THEN t.created_at END) AS last_purchased_at,
                   COUNT(CASE WHEN t.cents < 0 THEN 1 END) AS purchase_count
              FROM inventory AS i
              LEFT JOIN transactions AS t ON t.item_id = i.id
            """
            + where
            + " GROUP BY i.id, i.name, i.whole_price_cents, i.cents, "
              "i.unit_count, i.taxable, i.crv",
            parameters,
        ).fetchall()
    items = [item_dict(row) for row in rows]
    items.sort(key=lambda item: (str(item["name"]).casefold(), item["id"]))
    if sort.startswith("price_"):
        items.sort(
            key=lambda item: item["price_cents"],
            reverse=sort.endswith("desc"),
        )
    else:
        dated = [item for item in items if item["last_purchased_at"] is not None]
        undated = [item for item in items if item["last_purchased_at"] is None]
        dated.sort(
            key=lambda item: item["last_purchased_at"],
            reverse=sort.endswith("desc"),
        )
        items = dated + undated
    total = len(items)
    offset = (page - 1) * page_size
    payload = page_payload(items[offset : offset + page_size], total, page, page_size)
    payload["sort"] = sort
    return jsonify(payload)


@inventory_admin_api.get("/api/inventory-items/<int:item_id>")
def inventory_item_detail(item_id: int):
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        row = connection.execute(
            """
            SELECT i.id, i.name,
                   COALESCE(i.whole_price_cents, i.cents) AS whole_price_cents,
                   i.cents AS price_cents,
                   COALESCE(i.unit_count, 1) AS unit_count,
                   COALESCE(i.taxable, 0) AS taxable,
                   COALESCE(i.crv, 0) AS crv,
                   MAX(CASE WHEN t.cents < 0 THEN t.created_at END) AS last_purchased_at,
                   COUNT(CASE WHEN t.cents < 0 THEN 1 END) AS purchase_count
              FROM inventory AS i
              LEFT JOIN transactions AS t ON t.item_id = i.id
             WHERE i.id = ?
             GROUP BY i.id, i.name, i.whole_price_cents, i.cents,
                      i.unit_count, i.taxable, i.crv
            """,
            (item_id,),
        ).fetchone()
        if row is None:
            return jsonify(error="Item not found."), 404
        barcodes = [
            barcode["barcode"]
            for barcode in connection.execute(
                """
                SELECT barcode FROM barcodes
                 WHERE item_id = ? AND barcode IS NOT NULL AND barcode != ''
                 ORDER BY barcode
                """,
                (item_id,),
            ).fetchall()
        ]
    item = item_dict(row)
    item["barcodes"] = barcodes
    return jsonify(item=item)


@inventory_admin_api.get("/api/inventory-items/<int:item_id>/purchases")
def inventory_item_purchases(item_id: int):
    page, page_size = pagination_args()
    clauses, parameters = date_filters()
    clauses.extend(("t.item_id = ?", "t.cents < 0"))
    parameters.append(item_id)
    where = " WHERE " + " AND ".join(clauses)
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        if connection.execute(
            "SELECT 1 FROM inventory WHERE id = ?", (item_id,)
        ).fetchone() is None:
            return jsonify(error="Item not found."), 404
        total = connection.execute(
            "SELECT COUNT(*) FROM transactions AS t" + where, parameters
        ).fetchone()[0]
        rows = connection.execute(
            TRANSACTION_SELECT
            + where
            + " ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
            (*parameters, page_size, (page - 1) * page_size),
        ).fetchall()
    return jsonify(
        page_payload(
            [transaction_dict(row) for row in rows], total, page, page_size
        )
    )


@inventory_admin_api.get("/api/inventory-items/sales")
def inventory_item_sales():
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        window = rolling_month_window(connection)
        default_start = parse_date(window["start"][:10], "Start")
        default_end = parse_date(window["end"][:10], "End")
        start = parse_date(request.args.get("start"), "Start") or default_start
        end = parse_date(request.args.get("end"), "End") or default_end
        if start > end:
            raise ValidationError("Start date cannot be after end date.")
        if (end - start).days > 3660:
            raise ValidationError("The chart range cannot exceed 10 years.")

        requested_item = request.args.get("item_id")
        if requested_item in (None, ""):
            raise ValidationError("Item is required.")
        try:
            item_id = int(requested_item)
        except ValueError:
            raise ValidationError("Item must be a whole number.") from None
        selected = connection.execute(
            "SELECT id, name FROM inventory WHERE id = ?", (item_id,)
        ).fetchone()
        if selected is None:
            return jsonify(error="Item not found."), 404

        totals: dict[str, int] = {}
        rows = connection.execute(
            """
            SELECT date(t.created_at) AS day, COUNT(*) AS units_sold
              FROM transactions AS t
             WHERE t.item_id = ? AND t.cents < 0
               AND date(t.created_at) >= ? AND date(t.created_at) <= ?
             GROUP BY date(t.created_at)
             ORDER BY day
            """,
            (item_id, start.isoformat(), end.isoformat()),
        ).fetchall()
        totals = {row["day"]: row["units_sold"] for row in rows}

    series = []
    day = start
    while day <= end:
        date_value = day.isoformat()
        series.append({"date": date_value, "units_sold": totals.get(date_value, 0)})
        if day == end:
            break
        day += timedelta(days=1)
    return jsonify(
        start=start.isoformat(),
        end=end.isoformat(),
        item={"id": selected["id"], "name": selected["name"]},
        series=series,
    )
