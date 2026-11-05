"""Password reset operation shared by the web and SSH administration tools."""

import sqlite3

from audit import log_audit
from errors import ValidationError


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
