"""Clasificación por reglas (sin IA) y emparejamiento de traspasos internos.

Orden de decisión:
  0. Cuenta propia mencionada en la descripción (BNET / número / CLABE) → traspaso interno.
  1. Reglas de la tabla bancos.reglas, por prioridad (sembradas de REGLAS_BASE).
  2. Respaldo por código SPEI: abono = cobro de cliente, cargo = pago a proveedor.
  3. 'sin_clasificar'.
Los traspasos internos se marcan en PAREJA y se excluyen del gasto.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from .cuentas import Catalogo

VERSION_CLASIFICADOR = 1

# (prioridad, nombre, codigo_regex, patron_regex, sentido, categoria, subcategoria, contraparte)
REGLAS_BASE = [
    (10, "comision_s39_s40", r"^(S39|S40)$", None, "cargo", "comision_bancaria", "banca_internet", "BBVA"),
    (11, "comision_texto", None, r"\bCOMISI[OÓ]N|\bCOM\.|IVA\s+COM", "cargo", "comision_bancaria", None, "BBVA"),
    (20, "plataforma_payana", None, r"PAYANA", None, "traspaso_interno", "payana", "Payana"),
    (21, "plataforma_jeeves", None, r"JEEVES", None, "traspaso_interno", "jeeves", "Jeeves"),
    (22, "divisas", None, r"COMPRA\s+(DE\s+)?(DOLARES|DIVISAS)|VENTA\s+(DE\s+)?(DOLARES|DIVISAS)|CAMBIO\s+DE\s+DIVISAS", None,
     "traspaso_interno", "divisas_usd", "BBVA USD"),
    (30, "credito_banregio", None, r"BANREGIO.*(PRESTAMO|CREDITO|AMORTIZ|DISPOSICI)|(PRESTAMO|CREDITO|AMORTIZ).*BANREGIO", None,
     "credito_financiamiento", "banregio", "Banregio"),
    (31, "credito_texto", None, r"\b(PRESTAMO|DISPOSICION\s+DE\s+CREDITO|AMORTIZACION|PAGO\s+DE\s+CREDITO|INTERESES\s+CREDITO)\b", None,
     "credito_financiamiento", None, None),
    (40, "imss_sipare", None, r"\bIMSS\b|SIPARE|CUOTAS\s+OBRERO", "cargo", "seguridad_social", "imss", "IMSS"),
    (41, "infonavit", None, r"INFONAVIT", "cargo", "seguridad_social", "infonavit", "INFONAVIT"),
    (42, "isn", None, r"\bISN\b|IMPUESTO\s+SOBRE\s+NOMINA|TESORERIA.*ESTADO|GOBIERNO\s+DEL\s+ESTADO", "cargo",
     "seguridad_social", "isn", "Gobierno del Estado"),
    (45, "sat", None, r"\bSAT\b|SERVICIO\s+DE\s+ADMINISTRACION\s+TRIBUTARIA|DECLARACION|PAGO\s+REFERENCIADO|IMPUESTOS\s+FEDERALES",
     "cargo", "impuestos_sat", None, "SAT"),
    (50, "nomina_codigo", r"^P14$", None, "cargo", "nomina", "dispersion", None),
    (51, "nomina_texto", None, r"N[OÓ]MINA|DISPERSI[OÓ]N|PAGO\s+DE\s+SUELDOS", "cargo", "nomina", "dispersion", None),
    (90, "cobro_spei", r"^(T20|T22|C02|AA7)$", r"SPEI\s+RECIBIDO|DEPOSITO|DEP\.|RECIBIDO", "abono", "cobro_cliente", None, None),
    (91, "pago_spei", r"^(T17|N06|T22)$", r"SPEI\s+ENVIADO|PAGO\s+CUENTA\s+DE\s+TERCERO|TRANSFERENCIA\s+ENVIADA", "cargo",
     "pago_proveedor", None, None),
]


@dataclass
class Regla:
    prioridad: int
    nombre: str
    codigo: str | None
    patron: str | None
    sentido: str | None
    categoria: str
    subcategoria: str | None
    contraparte: str | None
    origen: str = "base"

    def aplica(self, codigo: str | None, texto: str, sentido: str) -> bool:
        if self.sentido and self.sentido != sentido:
            return False
        ok_cod = bool(self.codigo and codigo and re.search(self.codigo, codigo))
        ok_pat = bool(self.patron and re.search(self.patron, texto, re.I))
        if self.codigo and self.patron:
            return ok_cod or ok_pat
        return ok_cod if self.codigo else ok_pat


def reglas_base() -> list[Regla]:
    return [Regla(*r) for r in REGLAS_BASE]


@dataclass
class Clasif:
    categoria: str
    subcategoria: str | None
    contraparte: str | None
    es_traspaso_interno: bool
    regla: str | None
    origen_regla: str | None
    confianza: Decimal
    destino_propio: str | None = None     # clave de la cuenta propia contraria
    par: object | None = None


def clasificar(mov, cuenta_propia, catalogo: Catalogo, reglas: list[Regla], externas_fin: list[str]) -> Clasif:
    texto = f"{mov.descripcion} {mov.referencia or ''}"
    sentido = "cargo" if mov.cargo > 0 else "abono"
    compacto = re.sub(r"\s", "", texto)
    for ext in externas_fin:
        if ext and ext in compacto:
            return Clasif("credito_financiamiento", "cuenta_externa_financiamiento", "…" + ext[-4:], False,
                          "cuenta_financiamiento", "entorno", Decimal("0.950"))
    otras = [c for c in catalogo.propias_en_texto(texto) if c.numero != cuenta_propia.numero]
    if otras:
        o = otras[0]
        sub = (f"{cuenta_propia.alias}→{o.alias}" if sentido == "cargo" else f"{o.alias}→{cuenta_propia.alias}")
        return Clasif("traspaso_interno", sub, f"{o.banco} {o.alias} {o.mask}", True,
                      "cuenta_propia_en_descripcion", "base", Decimal("0.990"), destino_propio=o.clave)
    for r in sorted(reglas, key=lambda r: r.prioridad):
        if r.aplica(mov.codigo, texto, sentido):
            conf = Decimal("0.900") if (r.codigo and r.patron) else Decimal("0.800")
            if r.origen == "semilla_xlsx":
                conf = Decimal("0.600")
            if r.prioridad >= 90:
                conf = Decimal("0.500")
            return Clasif(r.categoria, r.subcategoria, r.contraparte, r.categoria == "traspaso_interno",
                          r.nombre, r.origen, conf)
    return Clasif("sin_clasificar", None, None, False, None, None, Decimal("0.000"))


def emparejar(items: list[tuple]) -> int:
    """items: [(mov_obj, cuenta_obj, clasif)]. Empareja traspasos entre cuentas propias:
    cargo en A ↔ abono en B, mismo monto, |Δfecha| ≤ 1 día (prefiere 0), uno a uno.
    Devuelve el número de parejas."""
    pend = [(m, c, k) for m, c, k in items if k.es_traspaso_interno and k.destino_propio and k.par is None]
    por_cuenta: dict[str, list] = {}
    for t in pend:
        por_cuenta.setdefault(t[1].clave, []).append(t)
    n = 0
    for m, c, k in sorted(pend, key=lambda t: (t[0].fecha_operacion, t[1].clave, t[0].renglon)):
        if k.par is not None or m.cargo <= 0:
            continue
        candidatos = []
        for m2, c2, k2 in por_cuenta.get(k.destino_propio, []):
            if k2.par is not None or m2.abono != m.cargo or k2.destino_propio != c.clave:
                continue
            dd = abs((m2.fecha_operacion - m.fecha_operacion).days)
            if dd <= 1:
                ref_ok = bool(m.referencia and m2.referencia and m.referencia == m2.referencia)
                candidatos.append((dd, 0 if ref_ok else 1, m2.renglon, (m2, c2, k2)))
        if candidatos:
            candidatos.sort(key=lambda x: x[:3])
            m2, c2, k2 = candidatos[0][3]
            k.par, k2.par = m2, m
            k.confianza = k2.confianza = Decimal("1.000")
            n += 1
    return n


def dia(d, n):
    return d + timedelta(days=n)
