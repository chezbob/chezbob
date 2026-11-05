"""Extract Costco Business Delivery invoice lines without using discounted totals."""

from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO

from pypdf import PdfReader

import config as settings
from errors import ValidationError


ROW_START = re.compile(r"(?m)^\s*(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d{4,15})\b")
MONEY = r"\$\s*([\d,]+\.\d{2})"
PRICE_COLUMNS = re.compile(
    MONEY + r"\s+([YN])\s+([YN])\s+" + r"(?:" + MONEY + r"\s+)?" + MONEY
)


def cents(value: str) -> int:
    return int(Decimal(value.replace(",", "")) * 100)


def infer_pack_count(description: str) -> int | None:
    counts = re.findall(r"\b(\d+)\s*(?:CT|COUNT)\b", description, re.I)
    if not counts:
        counts = re.findall(r"\b(\d+)\s*(?:PK|PACK)\b", description, re.I)
    if counts and 0 < int(counts[-1]) <= settings.MAX_UNIT_COUNT:
        return int(counts[-1])
    return None


def parse_invoice_text(text: str) -> dict:
    starts = list(ROW_START.finditer(text))
    if not starts:
        raise ValidationError("No Costco invoice items were found. Upload a text-based invoice PDF.")
    if len(starts) > settings.MAX_INVOICE_ITEMS * 2:
        raise ValidationError("This invoice contains too many lines.")
    items = []
    warnings = []
    ignored_savings = 0
    previous_product = None
    for position, match in enumerate(starts):
        end = starts[position + 1].start() if position + 1 < len(starts) else len(text)
        content = text[match.end():end]
        raw_description = content.split("$", 1)[0]
        if re.search(r"\b(?:DISCOUNT|COUPON|INSTANT\s+SAVINGS)\b", raw_description, re.I):
            continue
        price = PRICE_COLUMNS.search(content)
        if price is None:
            raise ValidationError(f"Could not read the price columns for Costco item {match[3]}.")
        description = " ".join(content[:price.start()].split())
        if not description:
            raise ValidationError(f"The description for Costco item {match[3]} is missing.")
        package_cents = cents(price[1])
        shipped = Decimal(match[2])
        is_redemption = re.search(r"\bCA\s+REDEMP(?:TION)?\b", description, re.I)
        if shipped <= 0:
            if not is_redemption:
                warnings.append(f"Skipped unshipped item {match[3]}: {description}.")
            previous_product = None
            continue
        if is_redemption:
            if previous_product is None:
                raise ValidationError("A CA redemption fee has no preceding product to attach it to.")
            if shipped != Decimal(previous_product["shipped"]):
                raise ValidationError("A CA redemption fee quantity does not match its preceding product.")
            if previous_product["crv_package_cents"]:
                raise ValidationError("More than one CA redemption fee follows the same product.")
            previous_product["crv_package_cents"] = package_cents
            previous_product["crv_taxable"] = price[2] == "Y" and price[3] != "Y"
            previous_product = None
            continue
        if package_cents <= 0 or package_cents > settings.MAX_WHOLE_PRICE_CENTS:
            raise ValidationError(f"Costco item {match[3]} has an invalid package price.")
        ignored_savings += cents(price[4]) if price[4] else 0
        item = {
            "line_id": len(items) + 1,
            "sku": match[3],
            "description": description,
            "shipped": str(shipped),
            "package_price_cents": package_cents,
            "unit_count": infer_pack_count(description),
            "taxable": price[2] == "Y" and price[3] != "Y",
            "crv_package_cents": 0,
            "crv_taxable": False,
        }
        items.append(item)
        previous_product = item
    if not items:
        raise ValidationError("This invoice has no shipped products to import.")
    if len(items) > settings.MAX_INVOICE_ITEMS:
        raise ValidationError("This invoice contains too many products.")
    number = re.search(r"Order\s+(?:Number|No[:.]?)\s*(\d+)", text, re.I)
    return {
        "number": number[1] if number else None,
        "items": items,
        "warnings": warnings,
        "ignored_savings_cents": ignored_savings,
    }


def read_invoice_pdf(data: bytes) -> dict:
    if not data.startswith(b"%PDF-"):
        raise ValidationError("Choose a valid PDF invoice.")
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ValidationError("Upload an unlocked invoice PDF.")
        if len(reader.pages) > settings.MAX_INVOICE_PAGES:
            raise ValidationError(f"Invoices can contain at most {settings.MAX_INVOICE_PAGES} pages.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except ValidationError:
        raise
    except Exception as error:
        raise ValidationError("This PDF could not be read. Try downloading the invoice again.") from error
    if len(text) > 500_000:
        raise ValidationError("This invoice contains too much text.")
    return parse_invoice_text(text)


def invoice_unit_cents(item: dict, unit_count: int, pricing: dict) -> int:
    tax = Decimal(pricing["sales_tax_rate"])
    package = Decimal(item["package_price_cents"])
    crv = Decimal(item["crv_package_cents"])
    if item["taxable"]:
        package *= 1 + tax
    if item["crv_taxable"]:
        crv *= 1 + tax
    result = (package + crv) / unit_count * (1 + Decimal(pricing["profit_rate"]))
    value = int(result.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if value > settings.MAX_WHOLE_PRICE_CENTS:
        raise ValidationError("The calculated unit price is too large.")
    return value
