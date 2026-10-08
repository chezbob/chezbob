from datetime import date, timedelta
from pathlib import Path

from flask import Blueprint, current_app, jsonify, send_from_directory

from admin_common import TRANSACTION_SELECT, rolling_month_window, transaction_dict
from database import connect_database


dashboard_api = Blueprint("dashboard_api", __name__)
STATIC_ROOT = Path(__file__).resolve().parent / "static"


@dashboard_api.get("/dashboard")
def dashboard_page():
    return send_from_directory(STATIC_ROOT, "admin.html")


@dashboard_api.get("/api/dashboard")
def dashboard():
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        window = rolling_month_window(connection)
        start, end = window["start"], window["end"]
        activity = connection.execute(
            """
            SELECT COUNT(DISTINCT t.user_id) AS active_users,
                   COUNT(CASE WHEN t.cents < 0 AND t.item_id IS NOT NULL THEN 1 END)
                       AS purchases,
                   COALESCE(SUM(CASE WHEN t.cents < 0 AND t.item_id IS NOT NULL
                                     THEN -t.cents ELSE 0 END), 0)
                       AS purchase_value_cents,
                   COUNT(CASE WHEN t.cents > 0
                                   AND LOWER(i.name) LIKE '%restock%credit%'
                              THEN 1 END) AS restock_credits
              FROM transactions AS t
              LEFT JOIN inventory AS i ON i.id = t.item_id
             WHERE t.created_at >= ? AND t.created_at <= ?
            """,
            (start, end),
        ).fetchone()
        debt = connection.execute(
            """
            WITH running AS (
                SELECT t.id, t.user_id, t.created_at,
                       SUM(t.cents) OVER (
                           PARTITION BY t.user_id
                           ORDER BY COALESCE(t.created_at, '0001-01-01'), t.id
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                       ) AS balance_after
                  FROM transactions AS t
            ), marked AS (
                SELECT *, LAG(balance_after, 1, 0) OVER (
                    PARTITION BY user_id
                    ORDER BY COALESCE(created_at, '0001-01-01'), id
                ) AS balance_before
                  FROM running
            ), debt_dates AS (
                SELECT user_id,
                       MAX(CASE WHEN balance_before >= 0 AND balance_after < 0
                                THEN created_at END) AS debt_started_at
                  FROM marked
                 GROUP BY user_id
            )
            SELECT COALESCE(SUM(CASE WHEN b.balance < 0 THEN -b.balance ELSE 0 END), 0)
                       AS total_debt_cents,
                   COALESCE(SUM(CASE WHEN b.balance < 0
                                         AND d.debt_started_at >= ?
                                         AND d.debt_started_at <= ?
                                    THEN -b.balance ELSE 0 END), 0)
                       AS new_debt_cents,
                   COUNT(CASE WHEN b.balance < 0
                                   AND d.debt_started_at >= ?
                                   AND d.debt_started_at <= ?
                              THEN 1 END) AS newly_indebted_users
              FROM balances AS b
              LEFT JOIN debt_dates AS d ON d.user_id = b.id
            """,
            (start, end, start, end),
        ).fetchone()
        popular = connection.execute(
            """
            SELECT i.id, i.name, COUNT(*) AS scan_count
              FROM transactions AS t
              JOIN inventory AS i ON i.id = t.item_id
             WHERE t.created_at >= ? AND t.created_at <= ?
               AND t.cents < 0
               AND LOWER(i.name) NOT LIKE '%restock%'
             GROUP BY i.id, i.name
             ORDER BY scan_count DESC, i.name COLLATE NOCASE, i.id
             LIMIT 5
            """,
            (start, end),
        ).fetchall()
        recent = connection.execute(
            TRANSACTION_SELECT
            + " WHERE t.created_at >= ? AND t.created_at <= ?"
              " ORDER BY t.created_at DESC, t.id DESC LIMIT 6",
            (start, end),
        ).fetchall()
        daily_rows = connection.execute(
            """
            SELECT date(t.created_at) AS day, COUNT(*) AS purchases
              FROM transactions AS t
             WHERE t.created_at >= ? AND t.created_at <= ?
               AND t.cents < 0 AND t.item_id IS NOT NULL
             GROUP BY date(t.created_at)
             ORDER BY day
            """,
            (start, end),
        ).fetchall()
        daily_totals = {row["day"]: row["purchases"] for row in daily_rows}
    purchase_series = []
    day = date.fromisoformat(window["start"][:10])
    last_day = date.fromisoformat(window["end"][:10])
    while day <= last_day:
        date_value = day.isoformat()
        purchase_series.append(
            {"date": date_value, "units_sold": daily_totals.get(date_value, 0)}
        )
        if day == last_day:
            break
        day += timedelta(days=1)
    return jsonify(
        window=window,
        metrics={**dict(activity), **dict(debt)},
        popular_items=[dict(row) for row in popular],
        recent_transactions=[transaction_dict(row) for row in recent],
        purchase_series=purchase_series,
    )
