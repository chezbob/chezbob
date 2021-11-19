from django.db import models
from django.utils.safestring import mark_safe
from django.utils.translation import gettext_lazy as _

from djmoney.models.fields import MoneyField
from moneyed import Money

'''
NOTE: sku stands for Stock Keeping Unit - this is what the scanner reads from a barcode
'''


class Product(models.Model):
    sku = models.CharField(_('SKU'), max_length=64, primary_key=True)
    name = models.CharField(_('name'), max_length=255)

    price_base = MoneyField(_('price base'), max_digits=14, decimal_places=2, default_currency='USD')
    margin_adj = models.DecimalField(_('margin adjustment'), max_digits=3, decimal_places=2, default=1.15)

    notes = models.TextField(_('notes'))

    @property
    def price(self) -> Money:
        return self.price_base * self.margin_adj

    def __str__(self):
        return f"{self.name} [{self.sku}]"


class Inventory(models.Model):
    product = models.OneToOneField(to=Product,
                                   verbose_name=_('product'),
                                   on_delete=models.PROTECT,
                                   related_name='inventory')

    quantity = models.IntegerField(_('quantity in stock'), default=0)

    last_updated_at = models.DateTimeField(_('last updated at'), blank=True, null=True)
    last_restocked_at = models.DateTimeField(_('last restocked at'), blank=True, null=True)

    class Meta:
        verbose_name_plural = 'Inventory'
