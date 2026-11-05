import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

import config as settings
from costco_invoice import invoice_unit_cents, parse_invoice_text
from database import connect_database
from errors import ValidationError
from invoice_import import match_candidates
from main import create_app


INVOICE_PAGES = [
    """Order Number 1234567890
Ordered Shipped Item Description Unit Price Tax Resale/Exempt Instant Savings Amount
1.00 1.00 1758990 MISS VICKIE'S POTATO CHIPS, VARIETY PACK, 30 CT $21.69 N N $5.00 $16.69
3.00 3.00 891742 COCA-COLA ZERO SUGAR, 12 FL OZ, 35 CT $24.89 Y N $74.67
""",
    """Order No: 1234567890 Page 2 of 2
3.00 3.00 996900000000 CA REDEMP VAL T EE $1.75 Y N $5.25
Total Due $99.99
""",
]


def invoice_pdf(pages=INVOICE_PAGES, padding=0, encrypted=False):
    writer = PdfWriter()
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    for text in pages:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        })
        commands = ["BT /F1 8 Tf 12 TL 20 750 Td"]
        for line in text.splitlines():
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"({escaped}) Tj T*")
        commands.append("ET")
        stream = DecodedStreamObject()
        stream.set_data("\n".join(commands).encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    if padding:
        writer.add_metadata({"/TestPadding": "x" * padding})
    if encrypted:
        writer.encrypt("test-password")
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


class InvoiceParsingTests(unittest.TestCase):
    def test_full_package_costs_and_cross_page_crv(self):
        invoice = parse_invoice_text("\n".join(INVOICE_PAGES))
        self.assertEqual(invoice["number"], "1234567890")
        self.assertEqual(len(invoice["items"]), 2)
        chips, soda = invoice["items"]
        self.assertEqual(chips["package_price_cents"], 2169)
        self.assertEqual(chips["unit_count"], 30)
        self.assertEqual(invoice["ignored_savings_cents"], 500)
        self.assertEqual(soda["package_price_cents"], 2489)
        self.assertEqual(soda["crv_package_cents"], 175)
        self.assertTrue(soda["crv_taxable"])
        pricing = {"sales_tax_rate": "0.08", "profit_rate": "0.20"}
        self.assertEqual(invoice_unit_cents(chips, 30, pricing), 87)
        self.assertEqual(invoice_unit_cents(soda, 35, pricing), 99)

    def test_fee_tax_is_independent_of_product_tax_and_discounts_are_ignored(self):
        invoice = parse_invoice_text("""1.00 1.00 1797499 HUMM KOMBUCHA, 18 CT $26.69 N N $26.69
1.00 1.00 999999 INSTANT SAVINGS -$2.00 N N -$2.00
1.00 1.00 996900000000 CA REDEMP VAL T EE $0.90 Y N $0.90
""")
        self.assertEqual(len(invoice["items"]), 1)
        item = invoice["items"][0]
        self.assertFalse(item["taxable"])
        self.assertTrue(item["crv_taxable"])
        self.assertEqual(item["crv_package_cents"], 90)
        with self.assertRaises(ValidationError):
            parse_invoice_text("1.00 1.00 996900000000 CA REDEMP VAL N EE $1.20 N N $1.20")

    def test_ambiguous_flavors_are_suggestions_until_confirmed(self):
        line = {"sku": "12345", "description": "POCKY BISCUIT STICKS, VARIETY PACK, 20 CT"}
        catalog = [{"id": 1, "name": "Pocky chocolate"}, {"id": 2, "name": "Pocky strawberry"}]
        matches = match_candidates(line, catalog, {})
        self.assertEqual(matches["selected_item_ids"], [])
        self.assertEqual(set(matches["suggested_item_ids"]), {1, 2})
        self.assertEqual(match_candidates(line, catalog, {"12345": [1, 2]})["selected_item_ids"], [1, 2])

    def test_unshipped_products_and_their_redemption_fees_are_skipped(self):
        text = "\n".join(INVOICE_PAGES) + """
1.00 0.00 654321 UNSHIPPED SODA, 12 CT $10.00 Y N $0.00
1.00 0.00 996900000000 CA REDEMP VAL T EE $0.60 Y N $0.00
"""
        invoice = parse_invoice_text(text)
        self.assertEqual(len(invoice["items"]), 2)
        self.assertEqual(len(invoice["warnings"]), 1)


class InvoiceImportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "test.sqlite3"
        with sqlite3.connect(self.database) as connection:
            connection.executescript("""
                CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, email TEXT);
                CREATE TABLE inventory (id INTEGER PRIMARY KEY, name TEXT, cents INTEGER);
                CREATE TABLE barcodes (id INTEGER PRIMARY KEY, barcode TEXT, user_id INTEGER, item_id INTEGER);
                CREATE TABLE transactions (id INTEGER PRIMARY KEY, user_id INTEGER, item_id INTEGER, cents INTEGER, created_at TEXT);
                CREATE VIEW balances AS SELECT id, 0 AS balance FROM users;
                INSERT INTO inventory VALUES (1, 'Coke Zero', 200),
                    (2, 'Miss Vickies Original Chips', 120),
                    (3, 'Miss Vickies Jalapeno Chips', 125),
                    (4, 'Unrelated item', 199), (5, 'Restocker Credit', -150);
                INSERT INTO barcodes VALUES (1, '012345678905', NULL, 1);
            """)
        self.client = create_app(self.database, {"TESTING": True}).test_client()

    def tearDown(self):
        self.directory.cleanup()

    def upload(self, document=None):
        response = self.client.post("/api/inventory/costco/preview", data={
            "invoice": (io.BytesIO(document if document is not None else invoice_pdf()), "invoice.pdf"),
        })
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()

    def payload(self):
        return {"confirmed": True, "updates": [
            {"line_id": 1, "item_ids": [2, 3], "unit_count": "30"},
            {"line_id": 2, "item_ids": [1], "unit_count": "35"},
        ]}

    def prices(self):
        with connect_database(self.database) as connection:
            return [row[0] for row in connection.execute("SELECT cents FROM inventory ORDER BY id")]

    def test_upload_review_and_confirm_are_separate_and_audited(self):
        preview = self.upload()
        self.assertEqual(len(preview["invoice"]["items"]), 2)
        self.assertEqual([item["calculated_unit_price_cents"] for item in preview["invoice"]["items"]], [87, 99])
        self.assertNotIn(5, [item["id"] for item in preview["catalog"]])
        self.assertEqual(self.prices(), [200, 120, 125, 199, -150])
        path = f"/api/inventory/costco/{preview['preview_id']}"
        review = self.client.post(path + "/review", json=self.payload())
        self.assertEqual(review.status_code, 200)
        self.assertEqual([row["unit_price_cents"] for row in review.get_json()["updates"]], [87, 87, 99])
        self.assertEqual(self.prices(), [200, 120, 125, 199, -150])
        unconfirmed = {**self.payload(), "confirmed": False}
        self.assertEqual(self.client.post(path + "/apply", json=unconfirmed).status_code, 400)
        response = self.client.post(path + "/apply", json=self.payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["updated_count"], 3)
        self.assertEqual(self.prices(), [99, 87, 87, 199, -150])
        with connect_database(self.database) as connection:
            soda = connection.execute("SELECT * FROM inventory WHERE id = 1").fetchone()
            self.assertEqual((soda["whole_price_cents"], soda["unit_count"], soda["taxable"], soda["crv"]), (2489, 35, 1, 1))
            self.assertEqual(connection.execute("SELECT barcode FROM barcodes WHERE item_id = 1").fetchone()[0], "012345678905")
            logs = connection.execute("SELECT * FROM audit_logs ORDER BY id").fetchall()
            self.assertEqual(len(logs), 3)
            self.assertTrue(all(row["actor"] == "costco-invoice" for row in logs))
            self.assertEqual(json.loads(logs[0]["details"])["after"]["invoice_number"], "1234567890")
        self.assertEqual(self.client.post(path + "/apply", json=self.payload()).status_code, 409)
        next_preview = self.upload()
        self.assertEqual(next_preview["invoice"]["items"][0]["selected_item_ids"], [2, 3])
        self.assertEqual(next_preview["invoice"]["items"][1]["selected_item_ids"], [1])

    def test_item_price_can_be_recalculated_without_matching_or_changing_inventory(self):
        preview = self.upload()
        path = f"/api/inventory/costco/{preview['preview_id']}/calculate"
        response = self.client.post(path, json={"line_id": 1, "unit_count": 60, "package_price_cents": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"line_id": 1, "unit_count": 60, "unit_price_cents": 43})
        self.assertEqual(self.prices(), [200, 120, 125, 199, -150])
        for payload in ({"line_id": 999, "unit_count": 30}, {"line_id": True, "unit_count": 30},
                        {"line_id": 1, "unit_count": 0}, {"line_id": 1, "unit_count": "1.5"}):
            self.assertEqual(self.client.post(path, json=payload).status_code, 400)
        with connect_database(self.database) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0], 0)
            self.assertIsNone(connection.execute("SELECT applied_at FROM costco_invoice_previews").fetchone()[0])

    def test_stale_review_and_duplicate_targets_cannot_partially_update(self):
        preview = self.upload()
        path = f"/api/inventory/costco/{preview['preview_id']}/apply"
        duplicate = self.payload()
        duplicate["updates"][1]["item_ids"] = [2]
        self.assertEqual(self.client.post(path, json=duplicate).status_code, 400)
        self.assertEqual(self.prices(), [200, 120, 125, 199, -150])
        with connect_database(self.database) as connection:
            with connection:
                connection.execute("UPDATE inventory SET cents = 201 WHERE id = 1")
        self.assertEqual(self.client.post(path, json=self.payload()).status_code, 409)
        self.assertEqual(self.prices(), [201, 120, 125, 199, -150])
        with connect_database(self.database) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0], 0)

    def test_invalid_pack_counts_and_unknown_items_are_rejected(self):
        preview = self.upload()
        path = f"/api/inventory/costco/{preview['preview_id']}/review"
        for value in ("0", "1.5", "-1", "1000001"):
            payload = self.payload()
            payload["updates"][0]["unit_count"] = value
            self.assertEqual(self.client.post(path, json=payload).status_code, 400)
        payload = self.payload()
        payload["updates"][0]["item_ids"] = [999]
        self.assertEqual(self.client.post(path, json=payload).status_code, 400)
        self.assertEqual(self.prices(), [200, 120, 125, 199, -150])

    def test_pdf_upload_can_exceed_json_request_limit_and_rejects_bad_pdfs(self):
        document = invoice_pdf(padding=settings.MAX_REQUEST_BYTES + 1000)
        self.assertGreater(len(document), settings.MAX_REQUEST_BYTES)
        self.upload(document)
        for document in (b"not a PDF", b"%PDF-1.4\ninvalid", invoice_pdf(encrypted=True)):
            response = self.client.post("/api/inventory/costco/preview", data={
                "invoice": (io.BytesIO(document), "bad.pdf"),
            })
            self.assertEqual(response.status_code, 400)
        with patch.object(settings, "MAX_INVOICE_PAGES", 1):
            response = self.client.post("/api/inventory/costco/preview", data={
                "invoice": (io.BytesIO(invoice_pdf()), "large.pdf"),
            })
            self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
