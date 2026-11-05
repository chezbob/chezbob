from flask import Blueprint, current_app, jsonify, render_template, request

from admin_common import page_payload, pagination_args
from database import connect_database


debt_api = Blueprint("debt_api", __name__)


@debt_api.get("/debt")
def debt_page():
    return render_template("admin.html")


@debt_api.get("/api/debts")
def debts():
    page, page_size = pagination_args()
    hide_inactive = request.args.get("hide_inactive") == "1"
    # Total debt always covers everyone; hiding only affects the listed users.
    listed = "NOT u.inactive" if hide_inactive else "1"
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        summary = connection.execute(
            f"""
            SELECT COALESCE(SUM({listed}), 0) AS user_count,
                   COALESCE(SUM(-b.balance), 0) AS total_debt_cents
              FROM balances AS b
              JOIN users AS u ON u.id = b.id
             WHERE b.balance < 0
            """
        ).fetchone()
        rows = connection.execute(
            f"""
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
                  FROM marked GROUP BY user_id
            ), payments AS (
                SELECT t.user_id, MAX(t.created_at) AS last_payment_at
                  FROM transactions AS t
                  LEFT JOIN admin_adjustments AS a ON a.transaction_id = t.id
                 WHERE t.cents > 0 AND t.item_id IS NULL AND a.id IS NULL
                 GROUP BY t.user_id
            )
            SELECT u.id AS user_id, u.username, u.email,
                   b.balance, -b.balance AS debt_cents,
                   d.debt_started_at, p.last_payment_at
              FROM balances AS b
              JOIN users AS u ON u.id = b.id
              LEFT JOIN debt_dates AS d ON d.user_id = u.id
              LEFT JOIN payments AS p ON p.user_id = u.id
             WHERE b.balance < 0 AND {listed}
             ORDER BY b.balance ASC, u.username COLLATE NOCASE
             LIMIT ? OFFSET ?
            """,
            (page_size, (page - 1) * page_size),
        ).fetchall()
    payload = page_payload(
        [dict(row) for row in rows], summary["user_count"], page, page_size
    )
    payload["total_debt_cents"] = summary["total_debt_cents"]
    return jsonify(payload)
