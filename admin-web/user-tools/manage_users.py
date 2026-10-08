#!/usr/bin/env python3
"""Interactive SSH-only user administration utility."""

from __future__ import annotations

import argparse
import getpass
import os
import pwd
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import config as settings
from database import connect_database, ensure_schema
from errors import ValidationError
from user_management import adjust_balance, create_user, reset_password, update_user


def ssh_username() -> str:
    return os.environ.get("SUDO_USER") or pwd.getpwuid(os.geteuid()).pw_name or getpass.getuser()


def select_user(connection):
    identifier = input("User ID, username, or email: ").strip()
    if not identifier:
        raise ValidationError("A user identifier is required.")
    row = connection.execute(
        """
        SELECT u.id, u.username, u.email, b.balance
          FROM users AS u JOIN balances AS b ON b.id = u.id
         WHERE (CAST(u.id AS TEXT) = ?)
            OR (u.username = ? COLLATE NOCASE)
            OR (u.email = ? COLLATE NOCASE)
         LIMIT 1
        """,
        (identifier, identifier, identifier),
    ).fetchone()
    if row is None:
        raise ValidationError("User not found.")
    print(f"Selected: {row['username']} <{row['email']}> (ID {row['id']}, balance ${row['balance'] / 100:.2f})")
    return row


def confirmed(prompt: str) -> bool:
    return input(f"{prompt} [y/N]: ").strip().lower() in {"y", "yes"}


def run_action(connection, choice: str, actor: str) -> None:
    if choice == "1":
        username = input("Username: ")
        email = input("Email: ")
        if confirmed(f"Create {username.strip()} <{email.strip()}>?"):
            user_id = create_user(connection, username, email, actor)
            print(f"Created user ID {user_id}.")
    elif choice == "2":
        user = select_user(connection)
        username = input(f"Username [{user['username']}]: ").strip() or user["username"]
        email = input(f"Email [{user['email']}]: ").strip() or user["email"]
        if confirmed("Save these user details?"):
            update_user(connection, user["id"], username, email, actor)
            print("User details updated.")
    elif choice == "3":
        user = select_user(connection)
        if confirmed(f"Reset {user['username']}'s password to blank?"):
            reset_password(connection, user["id"], actor)
            print("Password reset to blank.")
    elif choice == "4":
        user = select_user(connection)
        direction_choice = input("1) Add funds  2) Subtract funds: ").strip()
        direction = {"1": "add", "2": "subtract"}.get(direction_choice)
        if direction is None:
            raise ValidationError("Choose 1 or 2.")
        amount = input("Dollar amount: $")
        note = input("Audit note (optional): ")
        if confirmed(f"{direction.title()} ${amount.strip()} for {user['username']}?"):
            transaction_id, balance = adjust_balance(
                connection, user["id"], direction, amount, note, actor
            )
            print(f"Recorded transaction {transaction_id}; new balance ${balance / 100:.2f}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Interactively manage Chez Bob users.")
    parser.add_argument(
        "--database", type=Path, default=settings.DEFAULT_DATABASE_PATH
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.database.is_file():
        raise SystemExit(f"Database does not exist: {args.database}")
    actor = ssh_username()
    print(f"Chez Bob user administration · SSH user: {actor}")
    with connect_database(args.database) as connection:
        ensure_schema(connection)
        while True:
            print("\n1) Create user\n2) Edit user information\n3) Reset password\n4) Adjust balance\n5) Exit")
            choice = input("Choose an action: ").strip()
            if choice == "5":
                return
            if choice not in {"1", "2", "3", "4"}:
                print("Choose a number from 1 through 5.")
                continue
            try:
                run_action(connection, choice, actor)
            except ValidationError as error:
                print(f"Error: {error}")


if __name__ == "__main__":
    main()
