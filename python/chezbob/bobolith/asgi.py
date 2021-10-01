"""
ASGI config for bobolith project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.2/howto/deployment/asgi/
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from django.urls import path

from chezbob.bobolith.apps.appliances.routing import websocket_router as appliances_router
from chezbob.bobolith.echo import EchoConsumer

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bobolith.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    # (http->django views is added by default)
    'websocket': AuthMiddlewareStack(
        URLRouter([
            path(r'ws/echo/', EchoConsumer.as_asgi()),
            path(r'ws/appliances/', appliances_router),
        ])
    )
})
