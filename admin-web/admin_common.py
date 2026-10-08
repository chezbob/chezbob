from __future__ import annotations

import sqlite3
from datetime import date, timedelta

from flask import request

from errors import ValidationError


DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
MAX_SEARCH_LENGTH = 255

TRANSACTION_SELECT = """
    SELECT t.id, t.user_id, u.username, u.email, t.cents, t.item_id,
           i.name AS item_name, t.created_at,
           a.id AS adjustment_id, a.note AS adjustment_note
      FROM transactions AS t
      JOIN users AS u ON u.id = t.user_id
      LEFT JOIN inventory AS i ON i.id = t.item_id
      LEFT JOIN admin_adjustments AS a ON a.transaction_id = t.id
"""


def parse_positive_int(value: object, label: str, default: int, maximum: int) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(str(value))
    except (TypeError, ValueError):
        raise ValidationError(f"{label} must be a whole number.") from None
    if parsed < 1 or parsed > maximum:
        raise ValidationError(f"{label} must be between 1 and {maximum}.")
    return parsed


def pagination_args() -> tuple[int, int]:
    return (
        parse_positive_int(request.args.get("page"), "Page", 1, 1_000_000),
        parse_positive_int(
            request.args.get("page_size"), "Page size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
        ),
    )


def parse_date(value: str | None, label: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError(f"{label} must be a date in YYYY-MM-DD format.") from None


def date_filters(alias: str = "t") -> tuple[list[str], list[object]]:
    start = parse_date(request.args.get("start"), "Start")
    end = parse_date(request.args.get("end"), "End")
    if start and end and start > end:
        raise ValidationError("Start date cannot be after end date.")
    clauses: list[str] = []
    parameters: list[object] = []
    if start:
        clauses.append(f"{alias}.created_at >= ?")
        parameters.append(start.isoformat())
    if end:
        clauses.append(f"{alias}.created_at < ?")
        parameters.append((end + timedelta(days=1)).isoformat())
    return clauses, parameters


def search_value(name: str) -> str:
    value = str(request.args.get(name, "")).strip()
    if len(value) > MAX_SEARCH_LENGTH:
        raise ValidationError(f"{name.replace('_', ' ').title()} is too long.")
    return value


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def rolling_month_window(connection: sqlite3.Connection) -> dict[str, str]:
    row = connection.execute(
        """
        SELECT datetime('now', '-1 month') AS start,
               datetime('now') AS end
        """
    ).fetchone()
    return {"start": row["start"], "end": row["end"]}


def page_payload(
    rows: list[dict[str, object]], total: int, page: int, page_size: int
) -> dict[str, object]:
    return {
        "items": rows,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": (total + page_size - 1) // page_size,
        },
    }


def transaction_dict(row: sqlite3.Row) -> dict[str, object]:
    item_name = row["item_name"]
    if item_name is None:
        item_name = (
            "Admin balance adjustment"
            if row["adjustment_id"]
            else "Account deposit or credit"
        )
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "username": row["username"],
        "email": row["email"],
        "cents": row["cents"],
        "item_id": row["item_id"],
        "item_name": item_name,
        "created_at": row["created_at"],
        "is_adjustment": bool(row["adjustment_id"]),
        "note": row["adjustment_note"] or "",
    }
