from dataclasses import dataclass, asdict, field
from chezbob.bobolith.apps.appliances.protocol import Message

'''
NOTE: these messages are used in chezbob.bobolith.apps.appliances.consumers
'''


# Inventory Querying Messages
# -----------------------------

# Appliance sends GetPriceMessage to server
# Server responds with PriceResponse
@dataclass(frozen=True)
class GetPriceMessage(Message, msg_type='get_price'):
    sku: str


@dataclass(frozen=True)
class PriceResponse(Message, msg_type='price_response'):
    # price is a dict because Money can't otherwise be serialized
    price: dict


# Appliance sends GetNameMessage to server
# Server responds with NameResponse
@dataclass(frozen=True)
class GetNameMessage(Message, msg_type='get_name'):
    sku: str


@dataclass(frozen=True)
class NameResponse(Message, msg_type='name_response'):
    name: str


# Appliance sends GetQuantityMessage to server
# Server responds with QuantityResponse
@dataclass(frozen=True)
class GetQuantityMessage(Message, msg_type='get_quantity'):
    sku: str


@dataclass(frozen=True)
class QuantityResponse(Message, msg_type='quantity_response'):
    quantity: int


# Appliance sends GetProductInfoMessage to server
# Server responds with ProductInfoResponse
@dataclass(frozen=True)
class GetProductInfoMessage(Message, msg_type='get_product_info'):
    sku: str

@dataclass(frozen=True)
class ProductInfoResponse(Message, msg_type='product_info_response'):
    name: str
    quantity: int
    price: dict


# Appliance sends AddQuantityMessage
# server responds with AddQuantityResponse
@dataclass(frozen=True)
class AddQuantityMessage(Message, msg_type='add_quantity'):
    sku: str
    quantity_to_add: int

@dataclass(frozen=True)
class AddQuantityResponse(Message, msg_type='add_quantity_response'):
    success: bool

@dataclass(frozen=True)
class BarcodeScanEvent(Message, msg_type='barcode_scan_event'):
    barcode: str

@dataclass(frozen=True)
class NfcScanEvent(Message, msg_type='nfc_scan_event'):
    nfc: str
