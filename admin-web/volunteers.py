from pathlib import Path

from flask import Blueprint, current_app, jsonify, send_from_directory

from admin_common import (
    TRANSACTION_SELECT,
    date_filters,
    page_payload,
    pagination_args,
    rolling_month_window,
    transaction_dict,
)
from database import connect_database


volunteers_api = Blueprint("volunteers_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@volunteers_api.get("/volunteers")
@volunteers_api.get("/volunteers/history")
def volunteers_page():
    return send_from_directory(STATIC_ROOT, "admin.html")


@volunteers_api.get("/api/volunteers")
def volunteers():
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        window = rolling_month_window(connection)
        rows = connection.execute(
            """
            SELECT u.id AS user_id, u.username, u.email,
                   COUNT(*) AS scan_count, SUM(t.cents) AS credit_cents,
                   MAX(t.created_at) AS last_scan_at
              FROM transactions AS t
              JOIN users AS u ON u.id = t.user_id
              JOIN inventory AS i ON i.id = t.item_id
             WHERE t.created_at >= ? AND t.created_at <= ?
               AND t.cents > 0
               AND LOWER(i.name) LIKE '%restock%credit%'
             GROUP BY u.id, u.username, u.email
             ORDER BY scan_count DESC, last_scan_at DESC, u.username COLLATE NOCASE
            """,
            (window["start"], window["end"]),
        ).fetchall()
    items = []
    previous_count = None
    rank = 0
    for position, row in enumerate(rows, 1):
        if row["scan_count"] != previous_count:
            rank = position
            previous_count = row["scan_count"]
        item = dict(row)
        item["rank"] = rank
        items.append(item)
    return jsonify(items=items, window=window)


@volunteers_api.get("/api/restocks")
def restock_history():
    page, page_size = pagination_args()
    clauses, parameters = date_filters()
    clauses.extend(("t.cents > 0", "LOWER(i.name) LIKE '%restock%credit%'"))
    where = " WHERE " + " AND ".join(clauses)
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        total = connection.execute(
            """
            SELECT COUNT(*) FROM transactions AS t
              JOIN inventory AS i ON i.id = t.item_id
            """ + where,
            parameters,
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
