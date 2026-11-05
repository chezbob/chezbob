"""Review and confirm Costco invoice price updates to existing inventory."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import unicodedata
from difflib import SequenceMatcher

from flask import Blueprint, current_app, jsonify, render_template, request
from werkzeug.utils import secure_filename

import config as settings
from audit import log_audit
from costco_invoice import invoice_unit_cents, read_invoice_pdf
from database import connect_database
from errors import ValidationError
from inventory import json_payload, parse_count


invoice_import_api = Blueprint("invoice_import_api", __name__)
CATALOG_SELECT = """
    SELECT id, name, cents, whole_price_cents, unit_count, taxable, crv
      FROM inventory WHERE cents >= 0
     ORDER BY name COLLATE NOCASE, id
"""
IGNORED_WORDS = {
    "fl", "oz", "ct", "count", "pk", "pack", "variety", "varietypack",
    "size", "full", "and", "with", "the", "signature", "organic", "kirkland",
}


class InvoiceConflict(ValidationError):
    pass


@invoice_import_api.errorhandler(InvoiceConflict)
def invoice_conflict(error):
    return jsonify(error=str(error)), 409


@invoice_import_api.before_request
def invoice_upload_limit():
    if request.endpoint == "invoice_import_api.preview_invoice":
        request.max_content_length = settings.MAX_INVOICE_BYTES + settings.MAX_REQUEST_BYTES


@invoice_import_api.get("/inventory/costco")
def invoice_page():
    return render_template("costco_import.html", max_unit_count=settings.MAX_UNIT_COUNT)


def name_tokens(name: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    normalized = normalized.replace("'", "").replace("coca-cola", "cocacola")
    normalized = re.sub(r"\bcoke\b", "cocacola", normalized)
    return [word for word in re.findall(r"[a-z]+", normalized) if word not in IGNORED_WORDS]


def match_candidates(line: dict, catalog: list[dict], remembered: dict) -> dict:
    source = name_tokens(line["description"])
    source_set = set(source)
    ranked = []
    exact = []
    for item in catalog:
        tokens = name_tokens(item["name"])
        token_set = set(tokens)
        common = source_set & token_set
        if not common:
            continue
        coverage = len(common) / max(len(token_set), 1)
        overlap = len(common) / max(len(source_set | token_set), 1)
        similarity = SequenceMatcher(None, " ".join(source), " ".join(tokens)).ratio()
        score = .65 * coverage + .2 * overlap + .15 * similarity
        ranked.append((score, item["id"], coverage, len(token_set)))
        if tokens == source or (token_set == source_set and len(token_set) >= 2):
            exact.append(item["id"])
    ranked.sort(key=lambda value: (-value[0], value[1]))
    available = {item["id"] for item in catalog}
    selected = [item_id for item_id in remembered.get(line["sku"], []) if item_id in available]
    reason = "Remembered match" if selected else "Choose inventory items"
    if not selected and len(exact) == 1:
        selected, reason = exact, "Name match — review before updating"
    if not selected and ranked:
        best = ranked[0]
        gap = best[0] - ranked[1][0] if len(ranked) > 1 else best[0]
        if best[0] >= .75 and best[2] == 1 and best[3] >= 2 and gap >= .12:
            selected, reason = [best[1]], "Suggested match — review before updating"
    return {
        "suggested_item_ids": [row[1] for row in ranked[:6]],
        "selected_item_ids": selected,
        "match_reason": reason,
    }


@invoice_import_api.post("/api/inventory/costco/preview")
def preview_invoice():
    upload = request.files.get("invoice")
    if upload is None or not upload.filename or not upload.filename.lower().endswith(".pdf"):
        raise ValidationError("Choose a Costco invoice PDF to upload.")
    document = upload.read(settings.MAX_INVOICE_BYTES + 1)
    if len(document) > settings.MAX_INVOICE_BYTES:
        raise ValidationError("The invoice PDF cannot exceed 10 MB.")
    invoice = read_invoice_pdf(document)
    pricing = {
        "sales_tax_rate": str(settings.SALES_TAX_RATE),
        "profit_rate": str(settings.PROFIT_RATE),
    }
    preview_id = secrets.token_urlsafe(24)
    filename = secure_filename(upload.filename)[:255] or "invoice.pdf"
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        catalog = [dict(row) for row in connection.execute(CATALOG_SELECT)]
        remembered = {}
        for row in connection.execute("SELECT sku, item_id FROM costco_inventory_matches ORDER BY item_id"):
            remembered.setdefault(row["sku"], []).append(row["item_id"])
        for line in invoice["items"]:
            line.update(match_candidates(line, catalog, remembered))
            if line["unit_count"] is None and line["selected_item_ids"]:
                selected = next(item for item in catalog if item["id"] == line["selected_item_ids"][0])
                line["unit_count"] = selected["unit_count"]
            line["calculated_unit_price_cents"] = (
                invoice_unit_cents(line, line["unit_count"], pricing) if line["unit_count"] else None
            )
        data = {"invoice": invoice, "catalog": catalog, "pricing": pricing}
        with connection:
            connection.execute("DELETE FROM costco_invoice_previews WHERE created_at < datetime('now', '-1 day')")
            connection.execute(
                "INSERT INTO costco_invoice_previews (id, filename, document_hash, data) VALUES (?, ?, ?, ?)",
                (preview_id, filename, hashlib.sha256(document).hexdigest(), json.dumps(data)),
            )
    return jsonify(preview_id=preview_id, filename=filename, **data)


def load_preview(connection, preview_id: str):
    row = connection.execute(
        """SELECT * FROM costco_invoice_previews
             WHERE id = ? AND created_at >= datetime('now', '-1 day')""",
        (preview_id,),
    ).fetchone()
    if row is None:
        raise ValidationError("This invoice review has expired. Upload the PDF again.")
    if row["applied_at"]:
        raise InvoiceConflict("These invoice updates have already been applied.")
    return row, json.loads(row["data"])


def proposed_updates(connection, data: dict, payload: object) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("updates"), list):
        raise ValidationError("Choose invoice lines and inventory matches to update.")
    updates = payload["updates"]
    if not updates or len(updates) > settings.MAX_INVOICE_ITEMS:
        raise ValidationError("Select at least one matched invoice line to update.")
    lines = {line["line_id"]: line for line in data["invoice"]["items"]}
    snapshot = {item["id"]: item for item in data["catalog"]}
    selected_items, selected_lines = set(), set()
    proposals = []
    for update in updates:
        if not isinstance(update, dict) or type(update.get("line_id")) is not int:
            raise ValidationError("An invoice line is invalid.")
        line_id = update["line_id"]
        if line_id not in lines or line_id in selected_lines:
            raise ValidationError("An invoice line is invalid or selected more than once.")
        selected_lines.add(line_id)
        line = lines[line_id]
        count = parse_count(update.get("unit_count"))
        item_ids = update.get("item_ids")
        if not isinstance(item_ids, list) or not item_ids or len(item_ids) > 100:
            raise ValidationError(f"Choose an inventory match for Costco item {line['sku']}.")
        unit_price = invoice_unit_cents(line, count, data["pricing"])
        for item_id in item_ids:
            if type(item_id) is not int or item_id not in snapshot:
                raise ValidationError("Only existing inventory items from this review can be updated.")
            if item_id in selected_items:
                raise ValidationError(f"{snapshot[item_id]['name']} is matched more than once. Keep one invoice line for it.")
            selected_items.add(item_id)
            if len(selected_items) > 500:
                raise ValidationError("Choose at most 500 inventory items per import.")
            current = connection.execute(
                "SELECT id, name, cents, whole_price_cents, unit_count, taxable, crv FROM inventory WHERE id = ?",
                (item_id,),
            ).fetchone()
            if current is None or dict(current) != snapshot[item_id]:
                raise InvoiceConflict(f"{snapshot[item_id]['name']} changed since upload. Upload the invoice again to review its current price.")
            proposals.append({
                "item_id": item_id, "name": current["name"],
                "current_price_cents": current["cents"], "unit_price_cents": unit_price,
                "unit_count": count, "line": line, "before": dict(current),
            })
    return proposals


@invoice_import_api.post("/api/inventory/costco/<preview_id>/calculate")
def calculate_invoice_item(preview_id: str):
    payload = json_payload()
    if not isinstance(payload, dict) or type(payload.get("line_id")) is not int:
        raise ValidationError("Choose a valid invoice item.")
    count = parse_count(payload.get("unit_count"))
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        _row, data = load_preview(connection, preview_id)
    line = next((item for item in data["invoice"]["items"] if item["line_id"] == payload["line_id"]), None)
    if line is None:
        raise ValidationError("Choose a valid invoice item.")
    return jsonify(line_id=line["line_id"], unit_count=count,
                   unit_price_cents=invoice_unit_cents(line, count, data["pricing"]))


@invoice_import_api.post("/api/inventory/costco/<preview_id>/review")
def review_invoice(preview_id: str):
    payload = json_payload()
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        _row, data = load_preview(connection, preview_id)
        proposals = proposed_updates(connection, data, payload)
    return jsonify(updates=proposals)


@invoice_import_api.post("/api/inventory/costco/<preview_id>/apply")
def apply_invoice(preview_id: str):
    payload = json_payload()
    if not isinstance(payload, dict) or payload.get("confirmed") is not True:
        raise ValidationError("Confirm the reviewed price updates before applying them.")
    with connect_database(current_app.config["DATABASE_PATH"]) as connection:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            preview, data = load_preview(connection, preview_id)
            proposals = proposed_updates(connection, data, payload)
            matches = {}
            for proposal in proposals:
                line = proposal["line"]
                connection.execute(
                    """UPDATE inventory SET cents = ?, whole_price_cents = ?, unit_count = ?,
                              taxable = ?, crv = ? WHERE id = ?""",
                    (proposal["unit_price_cents"], line["package_price_cents"], proposal["unit_count"],
                     int(line["taxable"]), int(line["crv_package_cents"] > 0), proposal["item_id"]),
                )
                matches.setdefault(line["sku"], set()).add(proposal["item_id"])
                log_audit(connection, "inventory.invoice_price_update", "inventory", proposal["item_id"],
                    actor="costco-invoice", details={
                        "before": proposal["before"],
                        "after": {
                            "name": proposal["name"], "unit_price_cents": proposal["unit_price_cents"],
                            "whole_price_cents": line["package_price_cents"], "unit_count": proposal["unit_count"],
                            "taxable": line["taxable"], "crv": line["crv_package_cents"] > 0,
                            "crv_package_cents": line["crv_package_cents"], "crv_taxable": line["crv_taxable"],
                            "profit_rate": float(data["pricing"]["profit_rate"]),
                            "sales_tax_rate": float(data["pricing"]["sales_tax_rate"]),
                            "invoice_number": data["invoice"]["number"], "costco_item_number": line["sku"],
                            "invoice_filename": preview["filename"],
                        },
                    })
            for sku, item_ids in matches.items():
                connection.execute("DELETE FROM costco_inventory_matches WHERE sku = ?", (sku,))
                connection.executemany("INSERT INTO costco_inventory_matches (sku, item_id) VALUES (?, ?)",
                    [(sku, item_id) for item_id in sorted(item_ids)])
            connection.execute("UPDATE costco_invoice_previews SET applied_at = CURRENT_TIMESTAMP WHERE id = ?", (preview_id,))
    return jsonify(updated_count=len(proposals), message=f"Updated pricing for {len(proposals)} inventory items.")
