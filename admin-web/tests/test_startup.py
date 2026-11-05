import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from main import main


class ServerStartupTests(unittest.TestCase):
    def test_missing_tls_files_use_http_on_port_8000(self) -> None:
        for has_cert, has_key in ((False, False), (True, False), (False, True)):
            with self.subTest(cert=has_cert, key=has_key), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                database, cert, key = (root / name for name in ("db.sqlite3", "cert.pem", "key.pem"))
                database.touch()
                if has_cert:
                    cert.touch()
                if has_key:
                    key.touch()
                argv = [
                    "main.py", "--host", "127.0.0.1", "--port", "19443",
                    "--database", str(database), "--cert", str(cert), "--key", str(key),
                ]
                output = io.StringIO()
                with patch.dict(os.environ, {}, clear=True), patch.object(sys, "argv", argv), \
                        patch("main.create_app") as create_app, redirect_stdout(output):
                    main()
                create_app.assert_called_once_with(database)
                create_app.return_value.run.assert_called_once_with(
                    host="127.0.0.1", port=8000, ssl_context=None,
                )
                self.assertIn("falling back to HTTP", output.getvalue())
                self.assertIn("http://127.0.0.1:8000", output.getvalue())

    def test_existing_tls_files_keep_https_and_configured_port(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database, cert, key = (root / name for name in ("db.sqlite3", "cert.pem", "key.pem"))
            for path in (database, cert, key):
                path.touch()
            environment = {
                "CHEZBOB_HOST": "127.0.0.1", "CHEZBOB_PORT": "19443",
                "CHEZBOB_DATABASE": str(database), "CHEZBOB_CERT": str(cert),
                "CHEZBOB_KEY": str(key),
            }
            output = io.StringIO()
            with patch.dict(os.environ, environment, clear=True), patch.object(sys, "argv", ["main.py"]), \
                    patch("main.create_app") as create_app, redirect_stdout(output):
                main()
            create_app.return_value.run.assert_called_once_with(
                host="127.0.0.1", port=19443, ssl_context=(str(cert), str(key)),
            )
            self.assertIn("https://127.0.0.1:19443", output.getvalue())
            self.assertNotIn("falling back", output.getvalue())


if __name__ == "__main__":
    unittest.main()
