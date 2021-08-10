import uuid as uuid
from django.db import models
from django.utils.safestring import mark_safe
from django.utils.translation import gettext_lazy as _


class Appliance(models.Model):
    uuid = models.UUIDField(_('appliance uuid'), primary_key=True, default=uuid.uuid4)
    name = models.CharField(_('appliance name'), max_length=256, unique=True)

    consumer_path = models.CharField(_('consumer class'), max_length=256)

    STATUS_UP = 'UP'
    STATUS_DOWN = 'DOWN'
    STATUS_UNRESPONSIVE = 'UNRESPONSIVE'
    STATUS_NA = 'NOT_APPLICABLE'

    STATUS_CHOICES = (
        (STATUS_UP, 'Up'),
        (STATUS_DOWN, 'Down'),
        (STATUS_UNRESPONSIVE, 'Unresponsive'),
        (STATUS_NA, "N/A")
    )

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=STATUS_DOWN)

    last_connected_at = models.DateTimeField(_('last connected at'), blank=True, null=True)
    last_heartbeat_at = models.DateTimeField(_('last heartbeat at'), blank=True, null=True)

    config = models.JSONField(_('configuration'), default=dict)

    @property
    def status_icon(self):
        if self.status == Appliance.STATUS_UP:
            return mark_safe('<span style="color: green;">▲</span>')
        if self.status == Appliance.STATUS_UNRESPONSIVE:
            return mark_safe('<span style="color: gold;">▼</span>')
        if self.status == Appliance.STATUS_DOWN:
            return mark_safe('<span style="color: red;">▼</span>')

    status_icon.fget.short_description = _('status')

    def status_up(self):
        self.status = Appliance.STATUS_UP

    def status_unresponsive(self):
        self.status = Appliance.STATUS_UNRESPONSIVE

    def status_down(self):
        self.status = Appliance.STATUS_DOWN

    def __str__(self):
        return f"{self.name} ({self.uuid})"


class ApplianceLink(models.Model):
    key = models.CharField(_('link key'), max_length=255)

    src = models.ForeignKey(to=Appliance,
                            verbose_name=_('source appliance'),
                            on_delete=models.PROTECT,
                            related_name='src_links', )

    dst = models.ForeignKey(to=Appliance,
                            verbose_name=_('destination appliance'),
                            on_delete=models.PROTECT,
                            related_name='dst_links')
