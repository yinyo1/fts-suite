"""Cuentas FALSAS para /ensayo (mismo largo que las reales, números inventados)."""
import json

CUENTAS_FALSAS_JSON = json.dumps([
    {"clave": "general", "banco": "BBVA", "alias": "General", "numero": "0999000011", "clabe": "012580009990000117",
     "moneda": "MXN", "journal_odoo": None, "carpeta": "ENSAYO/BBVA General MXN 0999000011"},
    {"clave": "nomina", "banco": "BBVA", "alias": "Nomina", "numero": "0999000022", "clabe": "012580009990000228",
     "moneda": "MXN", "journal_odoo": None, "carpeta": "ENSAYO/BBVA Nomina MXN 0999000022"},
    {"clave": "usd", "banco": "BBVA", "alias": "USD", "numero": "0999000033", "clabe": "012580009990000339",
     "moneda": "USD", "journal_odoo": None, "carpeta": "ENSAYO/BBVA USD 0999000033"},
])
