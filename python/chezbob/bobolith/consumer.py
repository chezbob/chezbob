import json
import logging
import websockets
from abc import ABCMeta
from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer
from django.utils import timezone
from uuid import UUID

from chezbob.bobolith.apps.appliances.models import Appliance, ApplianceLink
from chezbob.bobolith.apps.appliances.protocol import MessageEncoder, MessageDecoder, PingMessage, PongMessage, \
    RelayMessage, DeliverMessage
from chezbob.bobolith.apps.inventory.models import Product, Inventory
from chezbob.bobolith.apps.inventory.protocol import GetNameMessage, GetPriceMessage, GetQuantityMessage, NameResponse, \
    PriceResponse, QuantityResponse, SetPriceMessage, AddQuantityMessage

logger = logging.getLogger(__name__)


class ApplianceConsumer(JsonWebsocketConsumer):
    appliance_uuid: UUID

    @classmethod
    def encode_json(cls, content):
        return MessageEncoder.encode(content)

    @classmethod
    def decode_json(cls, text_data):
        return MessageDecoder.decode(text_data)

    def __init__(self, uuid):
        super().__init__()
        self.appliance_uuid = uuid
        self.groups.append(f"appliance.{str(uuid)}")

    # Websocket Lifecycle
    # -------------------

    def connect(self):
        logger.info(f"[{self.appliance_uuid}] Connecting...")
        self.accept()
        logger.info(f"[{self.appliance_uuid}] Connected!")
        self.status_up()

    def disconnect(self, code):
        logger.info(f"[{self.appliance_uuid}] Disconnected!")
        self.status_down()

    # Protocol Message Handlers
    # -------------------------

    def receive_json(self, msg, **kwargs):
        if isinstance(msg, PingMessage):
            self.receive_ping(msg)
        if isinstance(msg, GetNameMessage):
            self.receive_get_name(msg)
        if isinstance(msg, GetPriceMessage):
            self.receive_get_price(msg)
        if isinstance(msg, GetQuantityMessage):
            self.receive_get_quantity(msg)
        if isinstance(msg, RelayMessage):
            self.receive_relay(msg)

    def receive_ping(self, ping_msg: PingMessage):
        pong_msg = ping_msg.reply(message=ping_msg.message)
        self.send_json(pong_msg)

    def receive_relay(self, relay_msg: RelayMessage):
        link_key, payload = relay_msg.link_key, relay_msg.payload

        dst_id = ApplianceLink.objects \
            .values_list('dst_id', flat=True) \
            .get(key=link_key, src_id=self.appliance_uuid)

        dst_group = f"appliance.{dst_id}"
        async_to_sync(self.channel_layer.group_send)(dst_group, {
            "type": "appliance.deliver",
            "payload": self.encode_json(payload)
        })

    # Channel Layer Handlers
    # ----------------------

    def appliance_deliver(self, event):
        """Handler for the `appliance.deliver` channel layer message."""
        self.send(text_data=event['payload'])

    # Database Actions
    # ----------------

    def status_up(self):
        appliance = Appliance.objects.get(pk=self.appliance_uuid)
        appliance.status_up()
        appliance.last_connected_at = timezone.now()
        appliance.save()
        logger.info(f"Appliance UP {self.appliance_uuid}")

    def status_unresponsive(self):
        appliance = Appliance.objects.get(pk=self.appliance_uuid)
        appliance.status_unresponsive()
        appliance.save()
        logger.info(f"Appliance UNRESPONSIVE {self.appliance_uuid}")

    def status_down(self):
        appliance = Appliance.objects.get(pk=self.appliance_uuid)
        appliance.status_down()
        appliance.save()
        logger.info(f"Appliance DOWN {self.appliance_uuid}")

    # Inventory Messages
    # ----------------------------
    
    # Get the price for an sku
    def receive_get_price(self, get_price_msg: GetPriceMessage):
        sku = get_price_msg.sku
        product = Product.objects.get(pk = sku)
        # Serialize Money
        price = {'amount': str(product.price.amount), 'currency':product.price.currency.name}
        response = PriceResponse.make_reply(reply_to=get_price_msg, price=price)
        self.send_json(response)
    
    # Get the name for an sku
    def receive_get_name(self, get_name_msg: GetNameMessage):
        sku = get_name_msg.sku
        product = Product.objects.get(pk = sku)
        name = product.name
        response = NameResponse.make_reply(reply_to=get_name_msg, name=name)
        self.send_json(response)

    # Get the quantity for an sku
    def receive_get_quantity(self, get_quantity_msg: GetQuantityMessage):
        sku = get_quantity_msg.sku
        product = Product.objects.get(pk = sku)
        inventory = Inventory.objects.get(product = product)
        quantity = inventory.quantity
        response = QuantityResponse.make_reply(reply_to=get_quantity_msg, quantity=quantity)
        self.send_json(response)

    # Update to a new price. This will only be done manually by admins,
    # so I'm not concerned with race conditions
    def receive_set_price(self, set_price_msg: SetPriceMessage):
        sku = set_price_msg.sku
        new_price = set_price_msg.new_price

        product = Product.objects.get(pk = sku)
        new_Money(Decimal(new_price['amount']), new_price['currency'])
        product.price = new_price
        
        response = SetPriceResponse.make_reply(reply_to=set_price_msg, success=true)
        self.send_json(response)


    # TODO: should this prevent people from making item quantity go negative?
    def receive_add_quantity(self, add_quantity_msg: AddQuantityMessage):
        sku = add_quantity_msg.sku
        quantity_to_add = add_quantity_msg.quantity_to_add
        # Get the product to update
        product = Product.objects.get(pk = sku)
        inventory = Inventory.objects.get(product = product)
        # Update it
        inventory.quantity += quantity_to_add
        inventory.save()
        response = AddQuantityResponse(reply_to=add_quantity_msg, success=True)
        self.send_json(response)
        

class DefaultConsumer(ApplianceConsumer):
    pass
