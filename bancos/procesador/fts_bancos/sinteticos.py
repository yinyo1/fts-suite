"""Valores SINTÉTICOS para fixtures y /ensayo, armados por código.

El repo es público: aquí no hay ni un literal con forma de cuenta, CLABE, RFC o
monto grande. Todo se compone en tiempo de ejecución, así el chequeo anti-datos
(bancos/scripts/chequeo_datos.py) puede ser estricto sin excepciones."""
from decimal import Decimal

PREFIJO = "0" + "999"


def cuenta(n: int) -> str:
    """10 dígitos inventados: 0999 + seis dígitos."""
    return PREFIJO + str(n).zfill(6)


def clabe(numero: str) -> str:
    """18 dígitos inventados con forma de CLABE."""
    return "012" + "580" + numero + "17"


def rfc(tag: str = "Z") -> str:
    """RFC con forma válida y claramente inventado."""
    return tag * 3 + "01" + "01" + "01" + tag * 2 + "9"


def monto(entero: int, centavos: int = 0) -> Decimal:
    return Decimal(entero) + Decimal(centavos) / 100


def cuentas_falsas(carpeta_raiz: str = "01 Estados de cuenta originales - Servicios FTS SA de CV/BBVA") -> list[dict]:
    out = []
    for i, (clave, alias, moneda, journal) in enumerate((("general", "General", "MXN", 8), ("nomina", "Nomina", "MXN", 96),
                                                        ("usd", "USD", "USD", 75)), start=1):
        num = cuenta(i * 11)
        etiqueta = f"BBVA {alias} {moneda}" if alias != moneda else "BBVA USD"
        out.append({"clave": clave, "banco": "BBVA", "alias": alias, "numero": num, "clabe": clabe(num),
                    "moneda": moneda, "journal_odoo": journal, "carpeta": f"{carpeta_raiz}/{etiqueta} {num}"})
    return out
