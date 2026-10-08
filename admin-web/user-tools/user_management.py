from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import config as settings
from audit import log_audit
from errors import ValidationError


def normalize_username(value: object) -> str:
    username = str(value or "").strip()
    if not username:
        raise ValidationError("Username is required.")
    if len(username) > 255:
        raise ValidationError("Username must be 255 characters or fewer.")
    if any(ord(character) < 32 for character in username):
        raise ValidationError("Username contains invalid control characters.")
    return username


def normalize_email(value: object) -> str:
    email = str(value or "").strip().lower()
    if (
        not email
        or len(email) > 255
        or email.count("@") != 1
        or any(character.isspace() or ord(character) < 32 for character in email)
    ):
        raise ValidationError("Enter a valid email address.")
    local, domain = email.split("@")
    if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
        raise ValidationError("Enter a valid email address.")
    return email


def parse_amount_cents(value: object) -> int:
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise ValidationError("Amount must be a valid dollar amount.") from None
    if not amount.is_finite() or amount <= 0:
        raise ValidationError("Amount must be greater than zero.")
    if amount.as_tuple().exponent < -2:
        raise ValidationError("Amount can have at most two decimal places.")
    cents = int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if cents > settings.MAX_WHOLE_PRICE_CENTS:
        raise ValidationError("Amount is too large.")
    return cents


def ensure_unique_user(
    connection: sqlite3.Connection,
    username: str,
    email: str,
    exclude_id: int | None = None,
) -> None:
    row = connection.execute(
        """
        SELECT id, username, email FROM users
         WHERE (username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)
           AND (? IS NULL OR id != ?)
         LIMIT 1
        """,
        (username, email, exclude_id, exclude_id),
    ).fetchone()
    if row:
        field = "username" if row["username"].lower() == username.lower() else "email"
        raise ValidationError(f"That {field} is already in use.")


def create_user(
    connection: sqlite3.Connection, username: object, email: object, actor: str
) -> int:
    normalized_username = normalize_username(username)
    normalized_email = normalize_email(email)
    with connection:
        ensure_unique_user(connection, normalized_username, normalized_email)
        cursor = connection.execute(
            """
            INSERT INTO users (username, email, password_hash, password_salt)
            VALUES (?, ?, '', '')
            """,
            (normalized_username, normalized_email),
        )
        log_audit(
            connection,
            "user.create",
            "user",
            cursor.lastrowid,
            details={
                "after": {"username": normalized_username, "email": normalized_email}
            },
            actor=actor,
        )
    return cursor.lastrowid


def update_user(
    connection: sqlite3.Connection,
    user_id: int,
    username: object,
    email: object,
    actor: str,
) -> None:
    normalized_username = normalize_username(username)
    normalized_email = normalize_email(email)
    with connection:
        before = connection.execute(
            "SELECT id, username, email FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if before is None:
            raise ValidationError("User not found.")
        ensure_unique_user(connection, normalized_username, normalized_email, user_id)
        connection.execute(
            "UPDATE users SET username = ?, email = ? WHERE id = ?",
            (normalized_username, normalized_email, user_id),
        )
        log_audit(
            connection,
            "user.update",
            "user",
            user_id,
            details={
                "before": {"username": before["username"], "email": before["email"]},
                "after": {"username": normalized_username, "email": normalized_email},
            },
            actor=actor,
        )


def reset_password(
    connection: sqlite3.Connection, user_id: int, actor: str
) -> None:
    with connection:
        user = connection.execute(
            "SELECT id, username, email FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if user is None:
            raise ValidationError("User not found.")
        connection.execute(
            "UPDATE users SET password_hash = '', password_salt = '' WHERE id = ?",
            (user_id,),
        )
        log_audit(
            connection,
            "user.password_reset",
            "user",
            user_id,
            details={"username": user["username"], "email": user["email"]},
            actor=actor,
        )


def adjust_balance(
    connection: sqlite3.Connection,
    user_id: int,
    direction: str,
    amount: object,
    note: object,
    actor: str,
) -> tuple[int, int]:
    if direction not in {"add", "subtract"}:
        raise ValidationError("Direction must be add or subtract.")
    cents = parse_amount_cents(amount)
    if direction == "subtract":
        cents = -cents
    normalized_note = str(note or "").strip()
    if len(normalized_note) > 500:
        raise ValidationError("Note must be 500 characters or fewer.")
    with connection:
        user = connection.execute(
            "SELECT id, username, email FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if user is None:
            raise ValidationError("User not found.")
        cursor = connection.execute(
            "INSERT INTO transactions (user_id, cents, item_id) VALUES (?, ?, NULL)",
            (user_id, cents),
        )
        connection.execute(
            """
            INSERT INTO admin_adjustments
                (transaction_id, user_id, cents, note, actor)
            VALUES (?, ?, ?, ?, ?)
            """,
            (cursor.lastrowid, user_id, cents, normalized_note, actor),
        )
        log_audit(
            connection,
            "user.balance_adjustment",
            "user",
            user_id,
            details={
                "transaction_id": cursor.lastrowid,
                "cents": cents,
                "note": normalized_note,
            },
            actor=actor,
        )
        balance = connection.execute(
            "SELECT balance FROM balances WHERE id = ?", (user_id,)
        ).fetchone()[0]
    return cursor.lastrowid, balance
