"""Catálogo de cuentas propias.

Los números COMPLETOS nunca viven en git (el repo es público). Llegan por la
variable de entorno BANCOS_CUENTAS_JSON, una lista como:

  [{"clave":"general","banco":"BBVA","alias":"General","numero":"...","clabe":"...",
    "moneda":"MXN","journal_odoo":8,"carpeta":"BBVA/BBVA General MXN ..."}]

y se siembran en bancos.cuentas. El RFC y la entidad sí son públicos (van en
cualquier factura).
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

ENTIDAD = "Servicios FTS SA de CV"
RFC_FTS = "SFT170905L43"


@dataclass
class Cuenta:
    clave: str
    banco: str
    alias: str
    numero: str
    moneda: str
    clabe: str | None = None
    journal_odoo: int | None = None
    carpeta: str | None = None
    tipo: str = "cuenta"
    id: int | None = None
    extras: dict = field(default_factory=dict)

    @property
    def mask(self) -> str:
        return "…" + self.numero[-4:]

    @property
    def etiqueta_archivo(self) -> str:
        """General-MXN, Nomina-MXN, USD."""
        a = re.sub(r"[^A-Za-z0-9]", "", self.alias.replace("ó", "o").replace("Ó", "O"))
        return a if a.upper().endswith(self.moneda) or a.upper() == self.moneda else f"{a}-{self.moneda}"

    def nombre_canonico(self, periodo: str, ext: str = "pdf") -> str:
        return f"{self.banco}_{self.etiqueta_archivo}_{self.numero}_{periodo}.{ext}"

    def carpeta_anio(self, periodo: str) -> str:
        return f"{self.carpeta}/{periodo[:4]}" if self.carpeta else f"Otras cuentas por identificar/{periodo[:4]}"


def cargar_de_entorno(texto: str | None = None) -> list[Cuenta]:
    raw = texto if texto is not None else os.environ.get("BANCOS_CUENTAS_JSON", "[]")
    datos = json.loads(raw or "[]")
    out = []
    for d in datos:
        numero = re.sub(r"\D", "", str(d["numero"]))
        clabe = re.sub(r"\D", "", str(d.get("clabe") or "")) or None
        out.append(Cuenta(
            clave=d["clave"], banco=d.get("banco", "BBVA"), alias=d["alias"], numero=numero,
            moneda=d.get("moneda", "MXN"), clabe=clabe, journal_odoo=d.get("journal_odoo"),
            carpeta=d.get("carpeta"), tipo=d.get("tipo", "cuenta"),
            extras={k: v for k, v in d.items() if k.startswith("x_")},
        ))
    return out


class Catalogo:
    def __init__(self, cuentas: list[Cuenta], externas_financiamiento: list[str] | None = None):
        self.cuentas = cuentas
        self.externas_financiamiento = externas_financiamiento or []

    def por_clave(self, clave: str) -> Cuenta | None:
        return next((c for c in self.cuentas if c.clave == clave), None)

    def identificar(self, texto: str) -> Cuenta | None:
        """Busca número de cuenta o CLABE en el texto del encabezado."""
        digitos = set(re.findall(r"\d{10,18}", texto.replace(" ", "")))
        solo = set(re.findall(r"(?<!\d)\d{10,18}(?!\d)", texto))
        todos = digitos | solo
        for c in self.cuentas:
            if c.clabe and c.clabe in todos:
                return c
        for c in self.cuentas:
            if c.numero in todos or ("0" + c.numero) in todos:
                return c
        return None

    def propias_en_texto(self, texto: str) -> list[Cuenta]:
        """Cuentas propias mencionadas en una descripción (traspasos)."""
        t = re.sub(r"\s", "", texto or "")
        out = []
        for c in self.cuentas:
            if c.numero and c.numero in t:
                out.append(c)
            elif c.clabe and c.clabe in t:
                out.append(c)
        return out
