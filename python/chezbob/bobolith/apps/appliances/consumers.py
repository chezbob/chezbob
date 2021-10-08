import logging
from abc import ABCMeta

from channels.generic.websocket import JsonWebsocketConsumer
from django.utils import timezone

from chezbob.bobolith.apps.appliances.models import Appliance, ApplianceLink
from chezbob.bobolith.apps.appliances.protocol import MessageEncoder, MessageDecoder, PingMessage, PongMessage, RelayMessage

import websockets
import json

from chezbob.bobolith.apps.inventory.models import Product, Inventory
from chezbob.bobolith.apps.inventory.protocol import GetNameMessage, GetPriceMessage, GetQuantityMessage, NameResponse, PriceResponse, QuantityResponse



logger = logging.getLogger(__name__)


class ApplianceConsumer(JsonWebsocketConsumer):
    appliance_uuid: str

    @classmethod
    def encode_json(cls, content):
        return MessageEncoder.encode(content)

    @classmethod
    def decode_json(cls, text_data):
        return MessageDecoder.decode(text_data)

    def __init__(self, uuid):
        super().__init__()
        self.appliance_uuid = uuid

    # Websocket Lifecycle
    # -------------------

    def connect(self):
        logger.info(f"[{self.appliance_uuid}] Connecting...")
        # Adding a custom group lets you address channels by a custom name
        # https://stackoverflow.com/questions/59789894/django-channels-setting-custom-channel-name
        self.groups.append(f"{self.appliance_uuid}") 
        super().connect()
        logger.info(f"[{self.appliance_uuid}] Connected!")
        self.status_up()

    def disconnect(self, code):
        logger.info(f"[{self.appliance_uuid}] Disconnected!")
        super().disconnect(code)
        self.status_down()

    # Message Handling
    # ----------------

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
        payload = relay_msg.payload
        dst = relay_msg.dst
        # Get source application
        src_appliance =  Appliance.objects.get(pk = self.appliance_uuid)
        # Get the specific application link so that we can get the destination's UUID
        link = ApplianceLink.objects.get(key = dst, src = src_appliance ) 
        dst_uuid = link.dst.uuid
        # Relay message to that UUID
        self.channel_layer.group_send(
            f"{dst_uuid}",
            json.dumps(payload),
        )

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

    # Inventory Querying Messages
    # ----------------------------
    def receive_get_price(self, get_price_msg: GetPriceMessage):
        sku = get_price_msg.sku
        product = Product.objects.get(pk = sku)
        # Serialize Money
        price = {'amount': str(product.price.amount), 'currency':product.price.currency.name}
        response = PriceResponse.make_reply(reply_to=get_price_msg, price=price)
        self.send_json(response)

    def receive_get_name(self, get_name_msg: GetNameMessage):
        sku = get_name_msg.sku
        product = Product.objects.get(pk = sku)
        name = product.name
        response = NameResponse.make_reply(reply_to=get_name_msg, name=name)
        self.send_json(response)

    def receive_get_quantity(self, get_quantity_msg: GetQuantityMessage):
        sku = get_quantity_msg.sku
        product = Product.objects.get(pk = sku)
        inventory = Inventory.objects.get(product = product)
        quantity = inventory.quantity
        response = QuantityResponse.make_reply(reply_to=get_quantity_msg, quantity=quantity)
        self.send_json(response)



class DefaultConsumer(ApplianceConsumer):
    pass
