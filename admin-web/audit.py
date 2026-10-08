from __future__ import annotations

import json
import sqlite3
from typing import Any

from flask import has_request_context, request


def client_ip() -> str | None:
    if not has_request_context():
        return None
    forwarded = request.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
    return forwarded or request.remote_addr


def log_audit(
    connection: sqlite3.Connection,
    action: str,
    entity_type: str,
    entity_id: object = None,
    *,
    details: dict[str, Any] | None = None,
    actor: str | None = None,
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO audit_logs
            (actor, action, entity_type, entity_id, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            actor or "inventory-scanner",
            action,
            entity_type,
            None if entity_id is None else str(entity_id),
            json.dumps(details or {}, sort_keys=True, separators=(",", ":")),
            client_ip(),
        ),
    )
    return cursor.lastrowid
