from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from flask import Blueprint, Response, current_app, jsonify, send_from_directory

from admin_common import page_payload, pagination_args
from database import connect_database


logs_api = Blueprint("logs_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@logs_api.get("/logs")
def logs_page():
    return send_from_directory(STATIC_ROOT, "admin.html")


@logs_api.get("/api/logs")
def logs_list():
    page, page_size = pagination_args()
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        total = connection.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
        rows = connection.execute(
            """
            SELECT id, actor, action, entity_type, entity_id,
                   details, ip_address, created_at
              FROM audit_logs
             ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
            """,
            (page_size, (page - 1) * page_size),
        ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        try:
            item["details"] = json.loads(item["details"])
        except (TypeError, json.JSONDecodeError):
            item["details"] = {"raw": item["details"]}
        items.append(item)
    return jsonify(page_payload(items, total, page, page_size))


def csv_cell(value: object) -> object:
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


@logs_api.get("/api/logs/export.csv")
def logs_export():
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        rows = connection.execute(
            """
            SELECT id, created_at, actor, action, entity_type, entity_id,
                   details, ip_address
              FROM audit_logs
             ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        ("id", "created_at", "actor", "action", "entity_type", "entity_id", "details", "ip_address")
    )
    for row in rows:
        writer.writerow(csv_cell(row[key]) for key in row.keys())
    return Response(
        output.getvalue(),
        content_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=chezbob-audit-logs.csv"},
    )
