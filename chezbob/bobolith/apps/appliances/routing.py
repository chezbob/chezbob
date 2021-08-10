import importlib

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from django.db import close_old_connections
from django.urls import path, re_path

from .models import Appliance


class ApplianceUUIDRouter:
    """
    Routes to different appliance consumers based on UUIDs.
    """

    def __init__(self, appliances_qs):
        self.queryset = appliances_qs

    @database_sync_to_async
    def get_consumer_path(self, uuid):
        [consumer_path] = self.queryset.values_list('consumer_path').get(pk=uuid)
        return consumer_path

    async def __call__(self, scope, receive, send):
        kwargs = scope['url_route']['kwargs']
        uuid = kwargs['appliance_uuid']

        try:
            consumer_path = await self.get_consumer_path(uuid)
        except Appliance.DoesNotExist:
            raise ValueError(f"No appliance found for UUID ${uuid}.")

        # Ensure we have the most recent version (even if we have hot-reloading).
        importlib.invalidate_caches()

        [module_name, klass_name] = consumer_path.rsplit('.', 1)
        try:
            module = importlib.import_module(module_name)
        except ModuleNotFoundError:
            raise ValueError(f"Consumer module not found for appliance with UUID: ${uuid}")

        klass = getattr(module, klass_name)
        if klass is None:
            raise ValueError(f"Consumer class not found in module ${module} for appliance with UUID ${uuid}.")

        return klass(scope)


websocket_router = URLRouter([
    path('ws/<uuid:appliance_uuid>/', ApplianceUUIDRouter(Appliance.objects.all()))
])

"""
Note to self:

Schema of scope is:

cookies: Dict[str, str]
headers: List[Tuple[str, str]]
path: str
path_remaining: str
query_string: bytes
server: Tuple[str, int] (but it's actually a list)
session: LazyObject[Session]
subprotocols: List[?]
type: str
url_route: {
    args: ...
    kwargs: ...
}
user: UserLazyObject

"""