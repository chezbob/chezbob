from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils.translation import gettext_lazy as _

"""
Notes:
    - See "primary key type compatibility" here:
        - https://docs.djangoproject.com/en/3.2/ref/contrib/contenttypes/
    - This is why object_id must be a CharField. It must be a type such that
      all of the possible PKs it encodes can be coerced to it. 
    - Product SKUs are 64-character CharFields, and User IDs can be coerced to strings.
"""


class BOI(models.Model):
    KIND_BARCODE = 'BARCODE'
    KIND_NFC = 'NFC'

    KIND_CHOICES = (
        (KIND_BARCODE, 'Barcode'),
        (KIND_NFC, 'NFC')
    )

    identifier = models.CharField(_('identifier'), max_length=64)
    kind = models.CharField(_('kind'), max_length=16, choices=KIND_CHOICES)

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(_('Object ID'), max_length=64)

    content_object = GenericForeignKey('content_type', 'object_id')

    def __str__(self):
        return f"{self.kind}:{self.identifier}"

    class Meta:
        verbose_name = 'BOI'
        verbose_name_plural = 'BOIs'
        constraints = [
            models.UniqueConstraint(fields=['identifier', 'kind'], name='unique_identifier_by_kind')
        ]
