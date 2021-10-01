from django.db import models
from django.utils.safestring import mark_safe
from django.utils.translation import gettext_lazy as _

from djmoney.models.fields import MoneyField
from moneyed import Money


class Product(models.Model):
    sku = models.CharField(_('SKU'), max_length=64)
    name = models.CharField(_('name'), max_length=256)

    price_base = MoneyField(_('price base'), max_digits=14, decimal_places=2, default_currency='USD')
    margin_adj = models.DecimalField(_('margin adjustment'), max_digits=3, decimal_places=2, default=1.00)

    notes = models.TextField(_('notes'))

    @property
    def price(self) -> Money:
        return self.price_base * self.margin_adj
