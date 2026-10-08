from __future__ import annotations

import sqlite3
from pathlib import Path


def connect_database(path: Path | str) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def ensure_schema(connection: sqlite3.Connection) -> None:
    """Apply schema extensions required by inventory and admin tools."""
    inventory_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(inventory)")
    }
    additions = (
        ("whole_price_cents", "INTEGER"),
        ("unit_count", "INTEGER NOT NULL DEFAULT 1 CHECK (unit_count > 0)"),
        ("taxable", "INTEGER NOT NULL DEFAULT 0 CHECK (taxable IN (0, 1))"),
        ("crv", "INTEGER NOT NULL DEFAULT 0 CHECK (crv IN (0, 1))"),
        ("price_is_whole", "INTEGER NOT NULL DEFAULT 1 CHECK (price_is_whole = 1)"),
    )
    with connection:
        # OAuth administration was removed; discard its obsolete allowlist.
        connection.execute("DROP TABLE IF EXISTS admin_access")
        for name, declaration in additions:
            if name not in inventory_columns:
                connection.execute(
                    f'ALTER TABLE inventory ADD COLUMN "{name}" {declaration}'
                )
        connection.execute(
            "UPDATE inventory SET whole_price_cents = cents WHERE whole_price_cents IS NULL"
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id INTEGER NOT NULL UNIQUE,
                user_id INTEGER NOT NULL,
                cents INTEGER NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                actor TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        adjustment_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(admin_adjustments)")
        }
        if "admin_email" in adjustment_columns:
            connection.execute(
                "ALTER TABLE admin_adjustments RENAME TO admin_adjustments_legacy"
            )
            connection.execute(
                """
                CREATE TABLE admin_adjustments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transaction_id INTEGER NOT NULL UNIQUE,
                    user_id INTEGER NOT NULL,
                    cents INTEGER NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    actor TEXT,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """
            )
            actor_source = (
                "COALESCE(actor, admin_email)"
                if "actor" in adjustment_columns
                else "admin_email"
            )
            connection.execute(
                f"""
                INSERT INTO admin_adjustments
                    (id, transaction_id, user_id, cents, note, actor, created_at)
                SELECT id, transaction_id, user_id, cents, note,
                       {actor_source}, created_at
                  FROM admin_adjustments_legacy
                """
            )
            connection.execute("DROP TABLE admin_adjustments_legacy")
        elif "actor" not in adjustment_columns:
            connection.execute("ALTER TABLE admin_adjustments ADD COLUMN actor TEXT")
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS admin_adjustments_user_id_index
                ON admin_adjustments(user_id)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT,
                details TEXT NOT NULL DEFAULT '{}',
                ip_address TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        audit_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(audit_logs)")
        }
        if "admin_email" in audit_columns:
            connection.execute("ALTER TABLE audit_logs RENAME TO audit_logs_legacy")
            connection.execute(
                """
                CREATE TABLE audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT,
                    details TEXT NOT NULL DEFAULT '{}',
                    ip_address TEXT,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            actor_source = (
                "COALESCE(actor, admin_email)"
                if "actor" in audit_columns
                else "admin_email"
            )
            connection.execute(
                f"""
                INSERT INTO audit_logs
                    (id, actor, action, entity_type, entity_id, details,
                     ip_address, created_at)
                SELECT id, {actor_source}, action, entity_type, entity_id,
                       details, ip_address, created_at
                  FROM audit_logs_legacy
                """
            )
            connection.execute("DROP TABLE audit_logs_legacy")
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS audit_logs_created_at_index
                ON audit_logs(created_at DESC, id DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS audit_logs_actor_index
                ON audit_logs(actor)
            """
        )
