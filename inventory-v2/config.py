"""Editable configuration values for the Chez Bob scanner."""

from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parent


# Pricing
SALES_TAX_RATE = Decimal("0.08")
CRV_CENTS_PER_UNIT = 5

# Validation and request limits
MAX_BARCODE_LENGTH = 255
MAX_PRODUCT_NAME_LENGTH = 255
MAX_WHOLE_PRICE_CENTS = 2_147_483_647
MAX_UNIT_COUNT = 1_000_000
MAX_REQUEST_BYTES = 64 * 1024

# Development server defaults (environment variables and CLI flags override these)
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8443
DEFAULT_DATABASE_PATH = ROOT / "test-files" / "prod.sqlite3"
DEFAULT_CERT_PATH = ROOT / "test-files" / "certs" / "chezbob-cert.pem"
DEFAULT_KEY_PATH = ROOT / "test-files" / "certs" / "chezbob-key.pem"


def browser_settings() -> dict[str, int | float]:
    """Return the subset of settings needed by the browser UI."""
    return {
        "salesTaxRate": float(SALES_TAX_RATE),
        "crvCentsPerUnit": CRV_CENTS_PER_UNIT,
        "maxBarcodeLength": MAX_BARCODE_LENGTH,
        "maxProductNameLength": MAX_PRODUCT_NAME_LENGTH,
        "maxWholePriceCents": MAX_WHOLE_PRICE_CENTS,
        "maxUnitCount": MAX_UNIT_COUNT,
    }
