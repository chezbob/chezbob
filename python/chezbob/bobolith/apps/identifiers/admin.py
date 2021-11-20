from django.contrib import admin
from django.contrib.admin import AdminSite

from chezbob.bobolith.apps.identifiers.models import BOI


class BOIAdmin(admin.ModelAdmin):
    fields = (
        'identifier',
        'kind',
        'content_type',
        'object_id'
    )
    list_display = (
        'identifier',
        'kind',
        'content_type',
        'content_object'
    )


def register_default(admin_site: AdminSite):
    admin_site.register(BOI, BOIAdmin)
