from django.db import models
from django.utils.safestring import mark_safe
from django.utils.translation import gettext_lazy as _

from djmoney.models.fields import MoneyField

# class Product(models.Model):
#     sku = models.CharField(_('SKU'), max_length=64)
#     name = models.CharField(_('name'), max_length=256)
#
#     price_base = MoneyField(_('price base'), max_digits=14, decimal_places=2, default_currency='USD')
#     margin_adj = models.DecimalField(_('margin adjustment'), default=1.0)
#
#     notes = models.TextField(_('notes'))
#
#     @property
#     def price(self) -> :
#         return self.price_base *