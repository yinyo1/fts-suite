"""Cuentas FALSAS para /ensayo (se construyen por código, ver sinteticos.py)."""
import json

from .sinteticos import cuentas_falsas

_c = cuentas_falsas("ENSAYO")
for x in _c:
    x["journal_odoo"] = None
CUENTAS_FALSAS_JSON = json.dumps(_c)
