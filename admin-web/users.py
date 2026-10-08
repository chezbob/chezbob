from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_from_directory

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
from errors import ValidationError


users_api = Blueprint("users_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@users_api.get("/users")
@users_api.get("/users/<int:_user_id>")
def users_page(_user_id: int | None = None):
    return send_from_directory(STATIC_ROOT, "admin.html")


@users_api.get("/api/users")
def users_list():
    page, page_size = pagination_args()
    query = search_value("q")
    sort = request.args.get("sort", "name")
    order_by = {
        "name": "u.username COLLATE NOCASE, u.id",
        "balance_desc": "b.balance DESC, u.username COLLATE NOCASE, u.id",
        "balance_asc": "b.balance ASC, u.username COLLATE NOCASE, u.id",
    }.get(sort)
    if order_by is None:
        raise ValidationError("Sort must be name, balance_desc, or balance_asc.")
    parameters: list[object] = []
    where = ""
    if query:
        pattern = f"%{escape_like(query)}%"
        where = (
            " WHERE LOWER(u.username) LIKE LOWER(?) ESCAPE '\\'"
            " OR LOWER(u.email) LIKE LOWER(?) ESCAPE '\\'"
        )
        parameters.extend((pattern, pattern))
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        total = connection.execute(
            "SELECT COUNT(*) FROM users AS u" + where, parameters
        ).fetchone()[0]
        rows = connection.execute(
            """
            SELECT u.id, u.username, u.email, b.balance
              FROM users AS u
              JOIN balances AS b ON b.id = u.id
            """
            + where
            + f" ORDER BY {order_by} LIMIT ? OFFSET ?",
            (*parameters, page_size, (page - 1) * page_size),
        ).fetchall()
    payload = page_payload([dict(row) for row in rows], total, page, page_size)
    payload["sort"] = sort
    return jsonify(payload)


@users_api.get("/api/users/<int:user_id>")
def user_detail(user_id: int):
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        row = connection.execute(
            """
            SELECT u.id, u.username, u.email, b.balance,
                   MAX(CASE WHEN t.cents > 0 THEN t.created_at END) AS last_charge_at
              FROM users AS u
              JOIN balances AS b ON b.id = u.id
              LEFT JOIN transactions AS t ON t.user_id = u.id
             WHERE u.id = ?
             GROUP BY u.id, u.username, u.email, b.balance
            """,
            (user_id,),
        ).fetchone()
    if row is None:
        return jsonify(error="User not found."), 404
    return jsonify(user=dict(row))


@users_api.get("/api/users/<int:user_id>/transactions")
def user_transactions(user_id: int):
    page, page_size = pagination_args()
    clauses, parameters = date_filters()
    clauses.append("t.user_id = ?")
    parameters.append(user_id)
    where = " WHERE " + " AND ".join(clauses)
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        exists = connection.execute(
            "SELECT 1 FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if exists is None:
            return jsonify(error="User not found."), 404
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
