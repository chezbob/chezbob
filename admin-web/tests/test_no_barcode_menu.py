import json
import unittest
from concurrent.futures import ThreadPoolExecutor

import test_admin
from database import connect_database, ensure_schema


class NoBarcodeMenuTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_admin.AdminApplicationTests()
        self.fixture.setUp()
        self.client = self.fixture.client
        self.database = self.fixture.database
        self.payload = {
            "name": "Kahiki Chicken Rice Bowl", "whole_price": "18.09",
            "count": "6", "taxable": False, "crv": False,
            "show_in_menu": True, "menu_category": "Freezer", "request_id": "capture-1",
        }

    def tearDown(self):
        self.fixture.tearDown()

    def create(self, **changes):
        return self.client.post("/api/unbarcoded-products", json=self.payload | changes)

    def test_create_retry_update_and_hide_preserve_identity(self):
        created = self.create()
        self.assertEqual(created.status_code, 201)
        product = created.get_json()["product"]
        item_id = product["id"]
        self.assertEqual(product["unit_price"], "3.62")
        self.assertTrue(product["show_in_menu"])
        self.assertEqual(self.create().get_json()["product"]["id"], item_id)
        self.assertEqual(self.create(whole_price="20.00").status_code, 400)
        with connect_database(self.database) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM barcodes WHERE item_id = ?", (item_id,)).fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_logs WHERE entity_id = ?", (str(item_id),)).fetchone()[0], 1)
            db.execute("INSERT INTO transactions (user_id, item_id, cents) VALUES (1, ?, -362)", (item_id,))
            db.commit()
        updated = self.client.put(f"/api/unbarcoded-products/{item_id}", json=self.payload | {
            "show_in_menu": False, "whole_price": "20.00",
        })
        self.assertEqual(updated.status_code, 200)
        self.assertFalse(updated.get_json()["product"]["show_in_menu"])
        with connect_database(self.database) as db:
            ensure_schema(db)
            self.assertIsNone(db.execute("SELECT 1 FROM no_barcode_menu WHERE item_id = ?", (item_id,)).fetchone())
            self.assertEqual(db.execute("SELECT item_id FROM transactions WHERE item_id = ?", (item_id,)).fetchone()[0], item_id)
            audit = json.loads(db.execute(
                "SELECT details FROM audit_logs WHERE entity_id = ? AND action = 'inventory.update'",
                (str(item_id),),
            ).fetchone()[0])
            self.assertEqual(audit["before"]["menu_category"], "Freezer")
            self.assertTrue(audit["before"]["show_in_menu"])
            self.assertFalse(audit["after"]["show_in_menu"])

    def test_duplicates_offer_existing_or_explicit_separate_creation(self):
        first = self.create().get_json()["product"]
        conflict = self.create(request_id="capture-2", name="  kahiki chicken rice bowl  ")
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.get_json()["matches"][0]["id"], first["id"])
        search = self.client.get("/api/unbarcoded-products?q=Kahiki").get_json()["items"]
        self.assertEqual([item["id"] for item in search], [first["id"]])
        lookup = self.client.get(f'/api/unbarcoded-products/{first["id"]}').get_json()["product"]
        self.assertEqual(lookup["count"], 6)
        separate = self.create(request_id="capture-2", allow_duplicate=True)
        self.assertEqual(separate.status_code, 201)
        self.assertNotEqual(separate.get_json()["product"]["id"], first["id"])

    def test_parallel_creates_and_retries(self):
        app = self.client.application
        def post(request_id):
            with app.test_client() as client:
                response = client.post("/api/unbarcoded-products", json=self.payload | {"request_id": request_id})
                return response.status_code, response.get_json()
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(post, ["one", "two"]))
        self.assertEqual(sorted(code for code, _ in responses), [201, 409])
        winner = next(request_id for request_id, result in zip(["one", "two"], responses) if result[0] == 201)
        with ThreadPoolExecutor(max_workers=2) as pool:
            retries = list(pool.map(post, [winner, winner]))
        self.assertTrue(all(code == 201 for code, _ in retries))
        self.assertEqual(retries[0][1]["product"]["id"], retries[1][1]["product"]["id"])

    def test_invalid_options_leave_no_partial_item(self):
        for changes in ({"show_in_menu": "yes"}, {"menu_category": " "}, {"allow_duplicate": 1}, {"request_id": None}):
            with self.subTest(changes=changes):
                self.assertEqual(self.create(**changes).status_code, 400)
        with connect_database(self.database) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM inventory WHERE name LIKE 'Kahiki%'").fetchone()[0], 0)
        self.assertEqual(self.client.put("/api/unbarcoded-products/99999", json=self.payload).status_code, 400)

    def test_migration_preserves_legacy_links_prices_and_hidden_choices(self):
        with connect_database(self.database) as db:
            # Simulate an existing deployment before the menu migration.
            db.execute("DROP TABLE no_barcode_menu")
            db.execute("INSERT INTO barcodes (barcode, item_id) VALUES ('072554870262', 1)")
            db.commit()
            ensure_schema(db)
            row = db.execute("SELECT i.id, i.cents, m.category FROM no_barcode_menu m JOIN inventory i ON i.id=m.item_id").fetchone()
            self.assertEqual(tuple(row), (1, 100, "Freezer"))
            db.execute("DELETE FROM no_barcode_menu WHERE item_id = 1")
            db.commit()
            ensure_schema(db)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM no_barcode_menu").fetchone()[0], 0)

    def test_legacy_barcoded_item_can_be_edited_without_breaking_scans(self):
        with connect_database(self.database) as db:
            db.execute("INSERT INTO barcodes (barcode, item_id) VALUES ('072554870262', 1)")
            db.commit()
        response = self.client.put("/api/unbarcoded-products/1", json=self.payload)
        self.assertEqual(response.status_code, 200)
        scanned = self.client.get("/api/products/072554870262").get_json()["product"]
        self.assertEqual((scanned["id"], scanned["unit_price"]), (1, "3.62"))
