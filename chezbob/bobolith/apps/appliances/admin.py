from django.contrib import admin
from django.contrib.admin import AdminSite

from chezbob.bobolith.apps.appliances.models import Appliance


class ApplianceAdmin(admin.ModelAdmin):
    fields = (
        'uuid',
        'name',
        'consumer',
        'status',
        'last_connected_at',
        'last_heartbeat_at'
    )
    readonly_fields = ('uuid',)
    list_display = (
        'name',
        'uuid',
        'consumer',
        'status_icon',
        'last_connected_at',
        'last_heartbeat_at')


def register_default(admin_site: AdminSite):
    admin_site.register(Appliance, ApplianceAdmin)
