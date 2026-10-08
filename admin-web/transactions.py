from pathlib import Path

from flask import Blueprint, current_app, jsonify, send_from_directory

from admin_common import (
    TRANSACTION_SELECT,
    date_filters,
    escape_like,
    page_payload,
    pagination_args,
    search_value,
    transaction_dict,
)
from database import connect_database


transactions_api = Blueprint("transactions_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@transactions_api.get("/transactions")
def transactions_page():
    return send_from_directory(STATIC_ROOT, "admin.html")


@transactions_api.get("/api/transactions")
def transactions_list():
    page, page_size = pagination_args()
    clauses, parameters = date_filters()
    item = search_value("item")
    if item:
        clauses.append("LOWER(i.name) LIKE LOWER(?) ESCAPE '\\'")
        parameters.append(f"%{escape_like(item)}%")
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        total = connection.execute(
            """
            SELECT COUNT(*)
              FROM transactions AS t
              LEFT JOIN inventory AS i ON i.id = t.item_id
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
