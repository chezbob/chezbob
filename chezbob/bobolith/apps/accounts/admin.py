from django.contrib.admin import AdminSite
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin, GroupAdmin as BaseGroupAdmin
from django.utils.translation import gettext_lazy as _

from .models import User, Group


class UserAdmin(BaseUserAdmin):
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'nickname', 'email')}),
        (_('Chez Bob'), {'fields': ('notes',)}),
        (_('Permissions'), {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
        }),
        (_('Important dates'), {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2'),
        }),
        (_('Personal info'), {
            'classes': ('wide',),
            'fields': ('nickname', 'first_name', 'last_name')
        }),
        (_('Notes'), {
            'classes': ('wide',),
            'fields': ('notes',)
        })
    )

    list_display = ('username', 'email', 'nickname', 'first_name', 'last_name', 'is_staff')

    pass


class GroupAdmin(BaseGroupAdmin):
    pass


def register_default(admin_site: AdminSite):
    admin_site.register(User, UserAdmin)
    admin_site.register(Group, GroupAdmin)
