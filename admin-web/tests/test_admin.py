from __future__ import annotations

import os
import csv
import io
import sqlite3
import sys
import tempfile
import unittest
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

USER_TOOLS = Path(__file__).resolve().parent.parent / "user-tools"
if str(USER_TOOLS) not in sys.path:
    sys.path.insert(0, str(USER_TOOLS))

from audit import log_audit
import config as settings
from database import connect_database, ensure_schema
from main import create_app
from inventory import rounded_unit_cents
from user_management import adjust_balance, create_user, reset_password, update_user


class AdminApplicationTests(unittest.TestCase):
    def setUp(self) -> None:
        handle, path = tempfile.mkstemp(suffix=".sqlite3")
        os.close(handle)
        self.database = Path(path)
        connection = sqlite3.connect(self.database)
        connection.executescript(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY, email TEXT NOT NULL, username TEXT NOT NULL,
                password_hash TEXT DEFAULT '', password_salt TEXT DEFAULT ''
            );
            CREATE TABLE inventory (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, cents INTEGER NOT NULL
            );
            CREATE TABLE barcodes (
                id INTEGER PRIMARY KEY, barcode TEXT, user_id INTEGER, item_id INTEGER
            );
            CREATE TABLE transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                cents INTEGER NOT NULL,
                item_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE VIEW balances(id, balance) AS
                SELECT users.id, COALESCE(SUM(transactions.cents), 0)
                  FROM users LEFT JOIN transactions ON transactions.user_id = users.id
                 GROUP BY users.id;
            INSERT INTO users (id, email, username) VALUES
                (1, 'alice@example.com', 'alice'),
                (2, 'bob@example.com', 'bob');
            INSERT INTO inventory VALUES
                (1, 'Sparkling Water', 100),
                (2, 'Restocker Credit', -150),
                (3, 'Chocolate Bar', 125);
            INSERT INTO transactions(user_id, cents, item_id, created_at) VALUES
                (1, -100, 1, CURRENT_TIMESTAMP),
                (1, -100, 1, CURRENT_TIMESTAMP),
                (2, -125, 3, CURRENT_TIMESTAMP),
                (2, 150, 2, CURRENT_TIMESTAMP),
                (2, 150, 2, CURRENT_TIMESTAMP);
            """
        )
        connection.close()
        self.client = create_app(
            self.database,
            {
                "TESTING": True,
            },
        ).test_client()

    def tearDown(self) -> None:
        self.database.unlink(missing_ok=True)

    def test_admin_routes_and_inventory_location(self) -> None:
        self.assertEqual(self.client.get("/").location, "/dashboard")
        response = self.client.get("/inventory")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Chez Bob Admin", response.data)
        response.close()
        response = self.client.get("/item-scanner")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Chez Bob Item Scanner", response.data)
        response.close()
        response = self.client.get("/chezbob-logo.png")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/png")
        response.close()
        response = self.client.get("/vendor/chart-4.5.1.umd.min.js")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "text/javascript")
        response.close()
        for path in (
            "/dashboard", "/transactions", "/inventory", "/inventory/items",
            "/volunteers", "/debt", "/users", "/users/1", "/inventory/1",
        ):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            response.close()
        self.assertEqual(
            self.client.get("/popular-items").location, "/inventory"
        )
        self.assertEqual(
            self.client.get("/inventory/popular").location, "/inventory"
        )

    def test_dashboard_summarizes_monthly_activity_and_debt(self) -> None:
        body = self.client.get("/api/dashboard").get_json()
        self.assertEqual(body["metrics"]["active_users"], 2)
        self.assertEqual(body["metrics"]["purchases"], 3)
        self.assertEqual(body["metrics"]["purchase_value_cents"], 325)
        self.assertEqual(body["metrics"]["restock_credits"], 2)
        self.assertEqual(body["metrics"]["total_debt_cents"], 200)
        self.assertEqual(body["metrics"]["new_debt_cents"], 200)
        self.assertEqual(body["metrics"]["newly_indebted_users"], 1)
        self.assertEqual(body["popular_items"][0]["name"], "Sparkling Water")
        self.assertLess(body["window"]["start"], body["window"]["end"])
        self.assertEqual(
            sum(point["units_sold"] for point in body["purchase_series"]), 3
        )

        item_sales = self.client.get(
            "/api/inventory-items/sales?item_id=1"
        ).get_json()
        self.assertEqual(item_sales["item"]["name"], "Sparkling Water")
        self.assertEqual(
            sum(point["units_sold"] for point in item_sales["series"]), 2
        )
        self.assertTrue(
            all("date" in point and "units_sold" in point for point in item_sales["series"])
        )
        empty_range = self.client.get(
            "/api/inventory-items/sales?item_id=1&start=2999-01-01&end=2999-01-02"
        ).get_json()
        self.assertEqual([point["units_sold"] for point in empty_range["series"]], [0, 0])
        self.assertEqual(
            self.client.get(
                "/api/inventory-items/sales?start=2026-02-02&end=2026-02-01"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.get("/api/inventory-items/sales").status_code, 400
        )

    def test_inventory_admin_search_sort_detail_and_history(self) -> None:
        connection = sqlite3.connect(self.database)
        connection.execute(
            "UPDATE transactions SET created_at = '2026-02-01 10:00:00' WHERE item_id = 1"
        )
        connection.execute(
            "UPDATE transactions SET created_at = '2026-01-01 10:00:00' WHERE item_id = 3"
        )
        connection.commit()
        connection.close()

        recent = self.client.get("/api/inventory-items").get_json()
        self.assertEqual(
            [item["name"] for item in recent["items"]],
            ["Sparkling Water", "Chocolate Bar", "Restocker Credit"],
        )
        searched = self.client.get("/api/inventory-items?q=chocolate").get_json()
        self.assertEqual([item["id"] for item in searched["items"]], [3])
        prices = self.client.get("/api/inventory-items?sort=price_asc").get_json()
        self.assertEqual(
            [item["name"] for item in prices["items"]],
            ["Restocker Credit", "Sparkling Water", "Chocolate Bar"],
        )
        detail = self.client.get("/api/inventory-items/1").get_json()["item"]
        self.assertEqual(detail["price_cents"], 100)
        self.assertEqual(detail["purchase_count"], 2)
        history = self.client.get(
            "/api/inventory-items/1/purchases?page_size=1"
        ).get_json()
        self.assertEqual(history["pagination"]["total"], 2)
        self.assertLess(history["items"][0]["cents"], 0)
        self.assertEqual(
            self.client.get("/api/inventory-items?sort=invalid").status_code, 400
        )

    def test_popular_items_exclude_restocker_credit(self) -> None:
        body = self.client.get("/api/popular-items").get_json()
        items = body["items"]
        self.assertEqual([item["name"] for item in items], ["Sparkling Water", "Chocolate Bar"])
        self.assertEqual(items[0]["scan_count"], 2)
        self.assertLess(body["window"]["start"], body["window"]["end"])

    def test_volunteers_are_ranked_by_credit_scans(self) -> None:
        body = self.client.get("/api/volunteers").get_json()
        items = body["items"]
        self.assertEqual(items[0]["username"], "bob")
        self.assertEqual(items[0]["scan_count"], 2)
        self.assertEqual(items[0]["rank"], 1)
        self.assertLess(body["window"]["start"], body["window"]["end"])

    def test_transactions_filter_and_paginate(self) -> None:
        body = self.client.get("/api/transactions?item=water&page_size=1").get_json()
        self.assertEqual(body["pagination"]["total"], 2)
        self.assertEqual(body["pagination"]["pages"], 2)
        self.assertEqual(body["items"][0]["item_name"], "Sparkling Water")

    def test_balance_adjustment_is_audited(self) -> None:
        before = self.client.get("/api/users/1").get_json()["user"]["balance"]
        with connect_database(self.database) as connection:
            _transaction_id, balance = adjust_balance(
                connection, 1, "add", "2.50", "Cash correction", "sshuser"
            )
        self.assertEqual(balance, before + 250)
        latest = self.client.get("/api/users/1/transactions?page_size=1").get_json()["items"][0]
        self.assertTrue(latest["is_adjustment"])
        self.assertEqual(latest["note"], "Cash correction")
        self.assertEqual(latest["cents"], 250)

    def test_profit_is_applied_after_tax_and_crv(self) -> None:
        # $10 / 4 = $2.50; +8% tax = $2.70; +$0.05 CRV = $2.75.
        multiplier = Decimal("1") + settings.PROFIT_RATE
        expected_with_fees = int(
            (Decimal(275) * multiplier).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )
        expected_without_fees = int(
            (Decimal(250) * multiplier).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )
        self.assertEqual(
            rounded_unit_cents(1000, 4, taxable=True, crv=True), expected_with_fees
        )
        self.assertEqual(rounded_unit_cents(1000, 4), expected_without_fees)

    def test_browser_config_includes_profit_rate(self) -> None:
        response = self.client.get("/config.js")
        self.assertIn(
            f'"profitRate":{float(settings.PROFIT_RATE)}'.encode(), response.data
        )

    def test_user_management_and_balance_changes_are_audited(self) -> None:
        with connect_database(self.database) as connection:
            user_id = create_user(connection, "charlie", "charlie@example.com", "sshuser")
            update_user(connection, user_id, "charles", "charles@example.com", "sshuser")
            reset_password(connection, user_id, "sshuser")
            adjust_balance(connection, user_id, "add", "5.00", "Test", "sshuser")
        logs = self.client.get("/api/logs?actor=sshuser&page_size=100").get_json()["items"]
        self.assertEqual(
            {entry["action"] for entry in logs},
            {"user.create", "user.update", "user.password_reset", "user.balance_adjustment"},
        )
        self.assertTrue(all(entry["actor"] == "sshuser" for entry in logs))
        exported = self.client.get("/api/logs/export.csv")
        self.assertEqual(exported.status_code, 200)
        self.assertIn("attachment;", exported.headers["Content-Disposition"])
        csv_rows = list(csv.DictReader(io.StringIO(exported.get_data(as_text=True))))
        self.assertEqual(len(csv_rows), 4)
        self.assertTrue(all(row["actor"] == "sshuser" for row in csv_rows))
        update_details = next(
            row["details"] for row in csv_rows if row["action"] == "user.update"
        )
        self.assertIn('"before"', update_details)
        self.assertIn('"after"', update_details)

    def test_email_based_audit_schema_migrates_without_losing_records(self) -> None:
        with connect_database(self.database) as connection:
            with connection:
                connection.execute("DROP TABLE admin_adjustments")
                connection.execute("DROP TABLE audit_logs")
                connection.executescript(
                    """
                    CREATE TABLE admin_adjustments (
                        id INTEGER PRIMARY KEY, transaction_id INTEGER UNIQUE,
                        user_id INTEGER, cents INTEGER, note TEXT,
                        created_at DATETIME, admin_email TEXT
                    );
                    CREATE TABLE audit_logs (
                        id INTEGER PRIMARY KEY, admin_email TEXT NOT NULL,
                        action TEXT NOT NULL, entity_type TEXT NOT NULL,
                        entity_id TEXT, details TEXT NOT NULL,
                        ip_address TEXT, created_at DATETIME
                    );
                    INSERT INTO audit_logs VALUES
                        (1, 'old@example.com', 'user.update', 'user', '1', '{}', NULL, CURRENT_TIMESTAMP);
                    CREATE TABLE admin_access (id INTEGER PRIMARY KEY, email TEXT);
                    INSERT INTO admin_access VALUES (1, 'old@example.com');
                    """
                )
            ensure_schema(connection)
            columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(audit_logs)")
            }
            self.assertIn("actor", columns)
            self.assertNotIn("admin_email", columns)
            self.assertIsNone(
                connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'admin_access'"
                ).fetchone()
            )
            self.assertEqual(
                connection.execute("SELECT actor FROM audit_logs WHERE id = 1").fetchone()[0],
                "old@example.com",
            )
            with connection:
                log_audit(connection, "inventory.update", "inventory", 1)

    def test_inventory_changes_are_audited(self) -> None:
        payload = {
            "name": "New Chips",
            "whole_price": "10.00",
            "count": "10",
            "taxable": True,
            "crv": False,
        }
        response = self.client.put("/api/products/123456", json=payload)
        self.assertEqual(response.status_code, 200)
        expected_price = rounded_unit_cents(1000, 10, taxable=True, crv=False)
        self.assertEqual(
            response.get_json()["product"]["unit_price_cents"], expected_price
        )
        payload["name"] = "Updated Chips"
        response = self.client.put("/api/products/123456", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["product"]["unit_price_cents"], expected_price
        )
        with connect_database(self.database) as connection:
            stored = connection.execute(
                "SELECT cents, whole_price_cents FROM inventory WHERE name = ?",
                ("Updated Chips",),
            ).fetchone()
            self.assertEqual(stored["cents"], expected_price)
            self.assertEqual(stored["whole_price_cents"], 1000)
            ensure_schema(connection)
            self.assertEqual(
                connection.execute(
                    "SELECT whole_price_cents FROM inventory WHERE name = ?",
                    ("Updated Chips",),
                ).fetchone()[0],
                1000,
            )
        actions = [
            entry["action"]
            for entry in self.client.get("/api/logs?action=inventory&page_size=100").get_json()["items"]
        ]
        self.assertEqual(actions, ["inventory.update", "inventory.create"])
        logs = self.client.get("/api/logs?action=inventory&page_size=100").get_json()["items"]
        self.assertTrue(all(entry["actor"] == "inventory-scanner" for entry in logs))
        self.assertTrue(
            all(
                entry["details"]["after"]["profit_rate"]
                == float(settings.PROFIT_RATE)
                for entry in logs
            )
        )

    def test_debt_dates_and_restock_history(self) -> None:
        connection = sqlite3.connect(self.database)
        connection.execute("DELETE FROM transactions WHERE user_id = 1")
        connection.executemany(
            "INSERT INTO transactions (user_id, cents, item_id, created_at) VALUES (1, ?, NULL, ?)",
            ((-100, "2026-01-01 10:00:00"), (200, "2026-01-02 10:00:00"), (-150, "2026-02-01 10:00:00")),
        )
        connection.commit()
        connection.close()
        with connect_database(self.database) as connection:
            adjust_balance(connection, 1, "add", "0.25", "Not a payment", "sshuser")
        debt_response = self.client.get("/api/debts").get_json()
        debt = debt_response["items"][0]
        self.assertEqual(debt["debt_started_at"], "2026-02-01 10:00:00")
        self.assertEqual(debt["last_payment_at"], "2026-01-02 10:00:00")
        self.assertEqual(debt_response["total_debt_cents"], 25)
        restocks = self.client.get("/api/restocks").get_json()
        self.assertEqual(restocks["pagination"]["total"], 2)
        self.assertEqual(restocks["items"][0]["username"], "bob")
        filtered = self.client.get("/api/restocks?start=2999-01-01").get_json()
        self.assertEqual(filtered["pagination"]["total"], 0)

    def test_users_can_be_sorted_by_balance(self) -> None:
        descending = self.client.get("/api/users?sort=balance_desc").get_json()["items"]
        ascending = self.client.get("/api/users?sort=balance_asc").get_json()["items"]
        self.assertEqual([row["username"] for row in descending], ["bob", "alice"])
        self.assertEqual([row["username"] for row in ascending], ["alice", "bob"])
        self.assertEqual(self.client.get("/api/users?sort=invalid").status_code, 400)



if __name__ == "__main__":
    unittest.main()
