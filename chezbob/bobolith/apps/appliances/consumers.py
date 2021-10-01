import logging
from abc import ABCMeta

from channels.generic.websocket import JsonWebsocketConsumer
from django.utils import timezone

from chezbob.bobolith.apps.appliances.models import Appliance
from chezbob.bobolith.apps.appliances.protocol import MessageEncoder, MessageDecoder, PingMessage, PongMessage

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

    def receive_ping(self, ping_msg: PingMessage):
        pong_msg = ping_msg.reply(message=ping_msg.message)
        self.send_json(pong_msg)

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


class DefaultConsumer(ApplianceConsumer):
    pass
