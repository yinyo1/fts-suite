"""Utilidades puras: dinero, fechas, hashes, enmascarado."""
from __future__ import annotations

import hashlib
import re
from decimal import Decimal, ROUND_HALF_UP

CERO = Decimal("0.00")
MESES = {
    "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6, "JUL": 7,
    "AGO": 8, "SEP": 9, "SET": 9, "OCT": 10, "NOV": 11, "DIC": 12,
}
MESES_LARGOS = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6, "JULIO": 7,
    "AGOSTO": 8, "SEPTIEMBRE": 9, "SETIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12,
}
NOMBRE_MES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
              "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

RE_MONTO = re.compile(r"^-?\$?\d{1,3}(?:,\d{3})*\.\d{2}-?$")


def dinero(texto: str) -> Decimal:
    """'1,234.56' -> Decimal('1234.56'). Acepta '-' al inicio o al final y '$'."""
    t = texto.strip().replace("$", "").replace(",", "")
    neg = t.startswith("-") or t.endswith("-")
    t = t.strip("-")
    v = Decimal(t).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return -v if neg else v


def es_monto(texto: str) -> bool:
    return bool(RE_MONTO.match(texto.strip()))


def fmt(v: Decimal | None) -> str:
    if v is None:
        return ""
    return f"{v:,.2f}"


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_texto(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def mascara(numero: str | None) -> str:
    """Nunca se imprime un número de cuenta completo en logs, docs o correos."""
    if not numero:
        return ""
    d = re.sub(r"\D", "", numero)
    return "…" + d[-4:] if len(d) >= 4 else "…"


def enmascarar_texto(texto: str) -> str:
    """Reemplaza cualquier secuencia de 8+ dígitos por …NNNN (logs y reportes)."""
    return re.sub(r"\d{8,}", lambda m: mascara(m.group(0)), texto or "")


def periodo_str(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def periodo_siguiente(p: str) -> str:
    a, m = int(p[:4]), int(p[5:7])
    return periodo_str(a + (m // 12), (m % 12) + 1)


def periodo_anterior(p: str) -> str:
    a, m = int(p[:4]), int(p[5:7])
    return periodo_str(a - 1, 12) if m == 1 else periodo_str(a, m - 1)


def rango_periodos(desde: str, hasta: str) -> list[str]:
    out, p = [], desde
    while p <= hasta:
        out.append(p)
        p = periodo_siguiente(p)
    return out
