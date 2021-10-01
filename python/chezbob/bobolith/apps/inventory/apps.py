from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chezbob.bobolith.apps.inventory'
    verbose_name = 'Inventory'
    label = 'inventory'
