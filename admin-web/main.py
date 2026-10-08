#!/usr/bin/env python3
"""Application factory and runtime entry point for Chez Bob Admin."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from pathlib import Path

from flask import Flask, Response, jsonify, redirect, request, send_from_directory

import config as settings
from database import connect_database, ensure_schema
from dashboard import dashboard_api
from debt import debt_api
from errors import ValidationError
from inventory import inventory_api
from inventory_admin import inventory_admin_api
from logs import logs_api
from popular_items import popular_items_api
from transactions import transactions_api
from users import users_api
from volunteers import volunteers_api


ROOT = Path(__file__).resolve().parent
STATIC_ROOT = ROOT / "static"


def create_app(
    database_path: Path | str = settings.DEFAULT_DATABASE_PATH,
    test_config: dict[str, object] | None = None,
) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE_PATH=Path(database_path),
        MAX_CONTENT_LENGTH=settings.MAX_REQUEST_BYTES,
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)

    database = app.config["DATABASE_PATH"]
    if not database.is_file():
        raise FileNotFoundError(f"Database does not exist: {database}")
    with connect_database(database) as connection:
        ensure_schema(connection)

    app.register_blueprint(inventory_api)
    app.register_blueprint(inventory_admin_api)
    app.register_blueprint(dashboard_api)
    app.register_blueprint(transactions_api)
    app.register_blueprint(popular_items_api)
    app.register_blueprint(volunteers_api)
    app.register_blueprint(debt_api)
    app.register_blueprint(users_api)
    app.register_blueprint(logs_api)

    @app.get("/")
    def root():
        return redirect("/dashboard")

    @app.get("/index.html")
    def legacy_index():
        return redirect("/item-scanner")

    @app.get("/app.js")
    def inventory_javascript():
        return send_from_directory(STATIC_ROOT, "app.js")

    @app.get("/admin.js")
    def admin_javascript():
        return send_from_directory(STATIC_ROOT, "admin.js")

    @app.get("/config.js")
    def browser_configuration():
        payload = json.dumps(settings.browser_settings(), separators=(",", ":"))
        return Response(
            f"window.CHEZBOB_CONFIG = Object.freeze({payload});\n",
            content_type="application/javascript; charset=utf-8",
        )

    @app.get("/styles.css")
    def inventory_stylesheet():
        return send_from_directory(STATIC_ROOT, "styles.css")

    @app.get("/admin.css")
    def admin_stylesheet():
        return send_from_directory(STATIC_ROOT, "admin.css")

    @app.get("/chezbob-logo.png")
    def chezbob_logo():
        return send_from_directory(STATIC_ROOT, "chezbob-logo.png")

    @app.get("/vendor/<path:filename>")
    def vendor_file(filename: str):
        return send_from_directory(STATIC_ROOT / "vendor", filename)

    @app.errorhandler(ValidationError)
    def validation_error(error: ValidationError):
        return jsonify(error=str(error)), 400

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify(error="Not found."), 404

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify(error="Request body is too large."), 413

    @app.errorhandler(sqlite3.Error)
    def database_error(error: sqlite3.Error):
        app.logger.error("Database operation failed: %s", error)
        return jsonify(error="The database operation could not be completed."), 500

    @app.after_request
    def security_headers(response):
        response.headers["Cache-Control"] = (
            "no-store" if request.path.startswith("/api/") else "no-cache"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; "
            "style-src 'self'; img-src 'self' blob: data:; "
            "media-src 'self' blob:; connect-src 'self'; object-src 'none'; "
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        )
        return response

    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Chez Bob admin panel.")
    parser.add_argument(
        "--host", default=os.environ.get("CHEZBOB_HOST", settings.DEFAULT_HOST)
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("CHEZBOB_PORT", str(settings.DEFAULT_PORT))),
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=os.environ.get("CHEZBOB_DATABASE", settings.DEFAULT_DATABASE_PATH),
    )
    parser.add_argument(
        "--cert",
        type=Path,
        default=os.environ.get("CHEZBOB_CERT", settings.DEFAULT_CERT_PATH),
        help="TLS certificate file for direct HTTPS",
    )
    parser.add_argument(
        "--key",
        type=Path,
        default=os.environ.get("CHEZBOB_KEY", settings.DEFAULT_KEY_PATH),
        help="TLS private-key file for direct HTTPS",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.database.is_file():
        raise SystemExit(f"Database does not exist: {args.database}")
    if bool(args.cert) != bool(args.key):
        raise SystemExit("--cert and --key must be supplied together.")
    for label, path in (("Certificate", args.cert), ("Private key", args.key)):
        if path and not path.is_file():
            raise SystemExit(f"{label} does not exist: {path}")
    scheme = "https" if args.cert else "http"
    print(f"Chez Bob Admin: {scheme}://{args.host}:{args.port}")
    print(f"Database: {args.database.resolve()}")
    ssl_context = (str(args.cert), str(args.key)) if args.cert else None
    create_app(args.database).run(
        host=args.host,
        port=args.port,
        ssl_context=ssl_context,
    )


if __name__ == "__main__":
    main()
