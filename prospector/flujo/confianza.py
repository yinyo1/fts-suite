"""Niveles de confianza e instrumentacion de fuentes por dato.

La regla que este modulo existe para hacer cumplir, y que en prosa no se
cumplio (ver Caso F, el patron de Cuprum reportado al 100% desde una sola
fuente):

    Un dato de UNA sola fuente topa en SOLIDO. Nunca es CONFIRMADO.
    UNA sola fuente NO es conflicto: el conflicto es cuando DOS chocan.

Esa segunda linea importa tanto como la primera. Marcar como conflicto todo
lo de una sola fuente manda la mayor parte de cada ficha a revision humana y
vuelve la herramienta inoperable por exceso de celo.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any

# --- niveles, alineados con el modelo de procedencia del orquestador ---
CONFIRMADO = "confirmado"      # >=2 fuentes de RAIZ distinta   -> verificado
SOLIDO = "solido"              # 1 fuente confiable              -> supuesto
CANDIDATO = "candidato"        # derivado de patron, sin ancla   -> supuesto
EN_CONFLICTO = "en_conflicto"  # dos fuentes chocan              -> contradicho
NO_ENCONTRADO = "no_encontrado"

A_PROCEDENCIA = {
    CONFIRMADO: "verificado",
    SOLIDO: "supuesto",
    CANDIDATO: "supuesto",
    EN_CONFLICTO: "contradicho",
    NO_ENCONTRADO: "no_encontrado",
}

# Raices de fuente. Dos fuentes de la MISMA raiz no confirman nada:
# que Odoo y Outlook digan lo mismo no es confirmacion independiente.
RAICES = {
    "odoo": "fts_interno",
    "outlook": "fts_interno",
    "leadiq": "directorio",
    "rocketreach": "directorio",
    "zoominfo": "directorio",
    "contactout": "directorio",
    "signalhire": "directorio",
    "prospeo": "directorio",
    "finalscout": "directorio",
    "aeroleads": "directorio",
    "seamless": "directorio",
    "clay": "directorio",
    "tomba": "directorio",
    "datanyze": "directorio",
    "linkedin_publico": "web_perfil",
    "buscador": "web_abierta",
    "prensa": "web_abierta",
    "pdf_publico": "documento_oficial",
    "padron_gobierno": "documento_oficial",
    "congreso": "documento_oficial",
    "vacante": "bolsa_trabajo",
    # Los agregadores de vacantes comparten raiz: que Indeed y OCC digan lo
    # mismo NO son dos confirmaciones -- suelen republicar el mismo anuncio.
    "vacante_indeed": "bolsa_trabajo",
    "vacante_glassdoor": "bolsa_trabajo",
    "vacante_occ": "bolsa_trabajo",
    "vacante_simplyhired": "bolsa_trabajo",
    "vacante_computrabajo": "bolsa_trabajo",
    "vacante_linkedin_publico": "bolsa_trabajo",
    # La bolsa PROPIA si es otra raiz: es la empresa hablando de si misma.
    "vacante_propia": "sitio_empresa",
    "denue": "padron_oficial",
    "dnb": "dnb",
    "patron_derivado": "derivacion",
}


def raiz_de(fuente: str) -> str:
    """Raiz de una fuente. Una desconocida se trata como raiz propia."""
    return RAICES.get(fuente.strip().lower(), f"desconocida:{fuente.strip().lower()}")


# ---------------------------------------------------------------- regla C1
# Dos fuentes que dan el MISMO valor pero con confianzas muy distintas tambien
# chocan. Medido en Cuprum, corrida real: tres directorios dieron el mismo
# formato al 44%, al 45.45% y al 100%.
#
# El valor coincide. La certeza no. Y la certeza es parte del dato.
BRECHA_MAGNITUD = 20.0

# El otro lado de la misma regla, que faltaba: una fuente SOLA que declara poca
# certeza no puede sostener un SOLIDO. Un directorio que dice 44% esta diciendo
# que se equivoca mas de la mitad de las veces. Eso es un CANDIDATO, y tratarlo
# igual que un 100% de una sola fuente es el mismo bug del Caso F sin el
# segundo testigo que lo delate.
MAGNITUD_PISO = 60.0


@dataclass
class Observacion:
    """Una fuente diciendo algo sobre un campo. La unidad de instrumentacion."""
    fuente: str
    valor: Any
    fecha_dato: str | None = None   # la del documento, no la de la consulta
    nota: str = ""
    magnitud: float | None = None   # el % que el directorio declara, si lo da
    forma: str | None = None        # la FORMA del patron, si la fuente la nombra
                                    # ("first.last", "first_lastinitial", ...)

    def __post_init__(self) -> None:
        if self.magnitud is None and self.nota:
            m = re.search(r"(\d{1,3}(?:[.,]\d+)?)\s*%", self.nota)
            if m:
                self.magnitud = float(m.group(1).replace(",", "."))

    @property
    def raiz(self) -> str:
        return raiz_de(self.fuente)


@dataclass
class Dato:
    """Un campo con TODAS las observaciones que lo sostienen.

    Guardar las observaciones y no solo el valor es la instrumentacion que
    faltaba: sin ella no hay challenge posible y Chao1 no se puede calcular.
    """
    campo: str
    observaciones: list[Observacion] = field(default_factory=list)
    derivado_de_patron: bool = False
    ancla_dura: bool = False        # correo literal: pesa mas que un derivado

    def observar(self, fuente: str, valor: Any, **kw) -> "Dato":
        self.observaciones.append(Observacion(fuente=fuente, valor=valor, **kw))
        return self

    # --- lo que el challenge necesita saber ---
    @property
    def n_fuentes(self) -> int:
        return len(self.observaciones)

    @property
    def n_raices(self) -> int:
        return len({o.raiz for o in self.observaciones})

    @property
    def valores(self) -> list[Any]:
        vistos, out = set(), []
        for o in self.observaciones:
            clave = _normaliza(o.valor)
            if clave not in vistos:
                vistos.add(clave)
                out.append(o.valor)
        return out

    @property
    def brecha_magnitud(self) -> float:
        """Distancia entre la confianza mayor y la menor que declaran las fuentes."""
        ms = [o.magnitud for o in self.observaciones if o.magnitud is not None]
        return max(ms) - min(ms) if len(ms) >= 2 else 0.0

    @property
    def formas(self) -> list[str]:
        """Las FORMAS distintas que nombran las fuentes, si las nombran."""
        vistas, out = set(), []
        for o in self.observaciones:
            if o.forma:
                f = o.forma.strip().lower()
                if f not in vistas:
                    vistas.add(f); out.append(o.forma)
        return out

    @property
    def magnitud_maxima(self) -> float | None:
        ms = [o.magnitud for o in self.observaciones if o.magnitud is not None]
        return max(ms) if ms else None

    # --- regla C1, en sus tres caras ---
    @property
    def motivo_conflicto(self) -> str:
        """Por que chocan. Vacio si no chocan.

        Decir 'chocan' sin decir en que es casi tan inutil como callarlo: el
        aviso que llega a revision humana tiene que decir si son dos valores
        distintos o el mismo valor con dos certezas distintas.
        """
        if len(self.valores) > 1:
            return ("valores distintos: " +
                    " / ".join(str(v) for v in self.valores))
        if len(self.formas) > 1:
            return ("mismo valor, FORMAS distintas: " +
                    " / ".join(self.formas) +
                    " -- el formato alterno no es el mismo patron")
        if self.brecha_magnitud > BRECHA_MAGNITUD:
            partes = [f"{o.fuente} {o.magnitud:.4g}%"
                      for o in self.observaciones if o.magnitud is not None]
            return (f"mismo valor, certezas separadas por "
                    f"{self.brecha_magnitud:.4g} puntos: " + " / ".join(partes))
        return ""

    @property
    def choca(self) -> bool:
        """Chocan por cualquiera de las TRES caras de la regla C1:

        1. dan valores distintos;
        2. dan el mismo valor pero nombran FORMAS distintas -- el caso de
           SignalHire con `first_lastinitial` frente a `first.last`;
        3. dan el mismo valor con certezas separadas por mas de
           BRECHA_MAGNITUD puntos.

        La tercera la encontro la corrida real de Cuprum: tres directorios
        decian first.last@cuprum.com, uno al 44%, otro al 45.45%, otro al 100%.
        El valor coincide; la certeza no. Reportar el 100% porque una fuente lo
        dijo es exactamente el bug del Caso F con otro disfraz.
        """
        if len(self.valores) > 1:
            return True
        if len(self.formas) > 1:
            return True
        return self.brecha_magnitud > BRECHA_MAGNITUD

    @property
    def certeza_declarada_baja(self) -> bool:
        """La fuente misma admite que se equivoca mas que acierta.

        Sin esto, un solo directorio al 44% quedaba indistinguible de un solo
        directorio al 100%: los dos salian SOLIDO. El techo por fuente unica
        atrapa 'cuantos lo dijeron'; esto atrapa 'que tan seguros dijeron'.
        """
        m = self.magnitud_maxima
        return m is not None and m < MAGNITUD_PISO

    @property
    def nivel(self) -> str:
        if not self.observaciones:
            return NO_ENCONTRADO
        if self.choca:
            return EN_CONFLICTO
        if self.n_raices >= 2:
            return CONFIRMADO
        # una sola raiz: TOPA aqui. No es conflicto, es techo.
        if self.derivado_de_patron and not self.ancla_dura:
            return CANDIDATO
        if self.certeza_declarada_baja:
            return CANDIDATO
        return SOLIDO

    @property
    def valor(self) -> Any:
        """El valor a reportar. En conflicto NO elige: devuelve None."""
        if self.choca:
            return None          # elegir en silencio es el bug del Caso F
        return self.observaciones[0].valor if self.observaciones else None

    def a_dict(self) -> dict:
        return {
            "campo": self.campo,
            "valor": self.valor,
            "nivel": self.nivel,
            "procedencia": A_PROCEDENCIA[self.nivel],
            "n_fuentes": self.n_fuentes,
            "n_raices": self.n_raices,
            "choca": self.choca,
            "motivo_conflicto": self.motivo_conflicto,
            "brecha_magnitud": self.brecha_magnitud,
            "formas": self.formas,
            "certeza_declarada_baja": self.certeza_declarada_baja,
            "valores_en_conflicto": self.valores if self.choca else [],
            "observaciones": [asdict(o) | {"raiz": o.raiz} for o in self.observaciones],
        }


def _normaliza(v: Any) -> str:
    if isinstance(v, str):
        return " ".join(v.lower().split())
    return str(v)


# --- niveles de la FICHA: completitud, eje distinto de la confianza ---
N1_CONFIRMADO = "n1_nombre_completo"
N2_PARCIAL = "n2_parcial"
N3_PUESTO = "n3_puesto_sin_persona"


@dataclass
class Contacto:
    nombre: str | None
    puesto: str | None
    empresa: str
    nivel_ficha: str = N2_PARCIAL
    datos: dict[str, Dato] = field(default_factory=dict)
    cercania_decision: int = 50   # 0 = decide la obra; 100 = contexto
    revision_humana: bool = False
    motivo_revision: str = ""
    hits: int = 0                 # cuantas consultas distintas lo trajeron

    def dato(self, campo: str, **kw) -> Dato:
        if campo not in self.datos:
            self.datos[campo] = Dato(campo=campo, **kw)
        return self.datos[campo]

    @property
    def clave(self) -> str:
        return f"{_normaliza(self.nombre or self.puesto or '')}|{_normaliza(self.empresa)}"

    def a_dict(self) -> dict:
        return {
            "nombre": self.nombre,
            "puesto": self.puesto,
            "empresa": self.empresa,
            "nivel_ficha": self.nivel_ficha,
            "cercania_decision": self.cercania_decision,
            "revision_humana": self.revision_humana,
            "motivo_revision": self.motivo_revision,
            "hits": self.hits,
            "datos": {k: d.a_dict() for k, d in self.datos.items()},
        }
