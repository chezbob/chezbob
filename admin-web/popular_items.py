from pathlib import Path

from flask import Blueprint, current_app, jsonify, redirect, send_from_directory

from admin_common import rolling_month_window
from database import connect_database


popular_items_api = Blueprint("popular_items_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@popular_items_api.get("/inventory")
def popular_items_page():
    return send_from_directory(STATIC_ROOT, "admin.html")


@popular_items_api.get("/popular-items")
def legacy_popular_items_page():
    return redirect("/inventory")


@popular_items_api.get("/inventory/popular")
def legacy_inventory_popular_page():
    return redirect("/inventory")


@popular_items_api.get("/api/popular-items")
def popular_items():
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        window = rolling_month_window(connection)
        rows = connection.execute(
            """
            SELECT i.id, i.name, COUNT(*) AS scan_count,
                   SUM(-t.cents) AS revenue_cents
              FROM transactions AS t
              JOIN inventory AS i ON i.id = t.item_id
             WHERE t.created_at >= ? AND t.created_at <= ?
               AND t.cents < 0
               AND LOWER(i.name) NOT LIKE '%restock%'
             GROUP BY i.id, i.name
             ORDER BY scan_count DESC, i.name COLLATE NOCASE, i.id
             LIMIT 20
            """,
            (window["start"], window["end"]),
        ).fetchall()
    return jsonify(items=[dict(row) for row in rows], window=window)
