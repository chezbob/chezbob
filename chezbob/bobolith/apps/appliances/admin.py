from django.contrib import admin
from django.contrib.admin import AdminSite

from chezbob.bobolith.apps.appliances.models import Appliance, ApplianceLink


class ApplianceAdmin(admin.ModelAdmin):
    fields = (
        'uuid',
        'name',
        'consumer_path',
        'status',
        'last_connected_at',
        'last_heartbeat_at',
        'config'
    )
    readonly_fields = ('uuid',)
    list_display = (
        'name',
        'uuid',
        'consumer_path',
        'status_icon',
        'last_connected_at',
        'last_heartbeat_at')


class ApplianceLinkAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'key',
        'src',
        'dst'
    )


def register_default(admin_site: AdminSite):
    admin_site.register(Appliance, ApplianceAdmin)
    admin_site.register(ApplianceLink, ApplianceLinkAdmin)
