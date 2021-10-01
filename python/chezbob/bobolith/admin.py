import random

from django.contrib.admin import AdminSite as BaseAdminSite
from django.utils.translation import gettext_lazy as _

from chezbob.bobolith.apps.accounts.admin import register_default as register_accounts
from chezbob.bobolith.apps.appliances.admin import register_default as register_appliances

"""
Some Notes on Admin:

 - We are not using the usual auto-admin registration provided by Django (for various reasons).
 - Instead, declare a function register[_default] in your admin module, and then import it here
   and hook it in at the bottom of the file explicitly as shown.
"""


class AdminSite(BaseAdminSite):
    WELCOME_MESSAGES = [
        # Monty Python
        _('“We interrupt this program to annoy you and make things generally more irritating.”'),
        _('“He’s not the Messiah—he’s a very naughty boy!”'),
        _('“Strange women lying in ponds, distributing swords, is no basis for a system of government!”'),
        _('“And finally…”'),
        _('“We use only the finest baby frogs…”'),
        _('“Blessed are the cheesemakers.”'),
        _('“Are you suggesting that coconuts migrate?”'),
        _('“There’s nothing wrong with you that an expensive operation can’t prolong.”'),
        _('“When you’re walking home tonight and some great homicidal maniac '
          'comes after you with a bunch of loganberries, don’t come crying to me!“'),
        _('“Oh! Now we see the violence inherent in the system! Help, help, I’m being repressed!”'),

        # Brass Eye
        _('“This is the one thing we didn’t want to happen.”'),
        _('“In an airjam there’s a 3D gridlock in the air and no way out: the planes just slow down and stop.”'),

        # Clark and Dawe
        _('“Well the front’s not supposed to fall off, for a start.”')
    ]

    # Text to put at the end of each page's <title>.
    site_title = _('Chez Bob admin')

    # Text to put in each page's <h1> (and above login form).
    site_header = _('The Chez Bobolith')

    # Text to put at the top of the admin index page.
    @property
    def index_title(self):
        return random.choice(AdminSite.WELCOME_MESSAGES)


site = AdminSite()
register_accounts(site)
register_appliances(site)

