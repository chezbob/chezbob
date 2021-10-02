from django.contrib import admin
from django.contrib.admin import AdminSite

from chezbob.bobolith.apps.inventory.models import Product, Inventory


class ProductAdmin(admin.ModelAdmin):
    fields = (
        'name',
        'sku',
        'price_base',
        'margin_adj',
        'notes'
    )

    list_display = (
        'name',
        'sku',
        'price',
        'price_base',
        'margin_adj',
        'notes'
    )


class InventoryAdmin(admin.ModelAdmin):
    fields = (
        'product',
        'quantity',
        'last_updated_at',
        'last_restocked_at'
    )

    list_display = (
        'product',
        'quantity',
        'last_updated_at',
        'last_restocked_at'
    )


def register_default(admin_site: AdminSite):
    admin_site.register(Product, ProductAdmin)
    admin_site.register(Inventory, InventoryAdmin)
