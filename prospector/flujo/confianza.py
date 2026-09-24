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
    # `search_people` es la MISMA raiz que Outlook: las dos salen del historial
    # de comunicacion de FTS. Que las dos coincidan NO son dos confirmaciones
    # independientes -es la trampa de la independencia del #4-, y darle raiz
    # propia habria sido inflar el n_raices con la misma casa dos veces.
    "outlook_personas": "fts_interno",
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
    # Publica jerarquia en vez de correos, pero sigue siendo un agregador de
    # perfiles de terceros: MISMA raiz que los demas directorios.
    "theorg": "directorio",
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


# ------------------------------------------------- regla C1-bis: informar vs vaciar
# Medido en Hershey (#287): el patron de correo tuvo CUATRO fuentes. Tres decian
# `FLast` -y una de esas tres era un correo literal real visto en un hilo de
# Outlook- y solo SignalHire decia lo contrario. La compuerta marco conflicto y
# VACIO el campo.
#
#     Sin patron de correo, Rissia no le puede escribir a nadie.
#
# Y el campo vacio tiraba informacion buena: que 3 de 4 apuntaban al mismo lado,
# y que una de esas 3 no era una estadistica de directorio sino un correo que
# alguien mando de verdad.
#
#     NO ELEGIR NO ES LO MISMO QUE NO INFORMAR.
#
# Pero relajar la regla entera seria volver al Caso F. La linea va aqui:
#
#     MAYORIA CLARA + ANCLA DURA  -> informa el valor, con la disidencia al lado
#     empate, o desacuerdo sin ancla -> se abstiene: EN CONFLICTO y campo vacio

# Cuantas fuentes tiene que juntar la mayoria. TRES, y no es un numero al azar:
# es el mismo que el metodo ya exige en M1 -"MINIMO TRES directorios DISTINTOS
# consultados y contrastados"- porque con dos no hay con que contrastar. Si dos
# no alcanzan para agotar un modulo, tampoco alcanzan para ganarle a una
# disidencia.
#
# Y es la linea que separa los dos casos reales:
#   Hershey  3 contra 1  -> informa
#   Cuprum   2 contra 1  -> se abstiene, aunque tenga ancla
MINIMO_MAYORIA = 3

# Y ademas la mayoria tiene que ser al menos TRES VECES la disidencia. Con 3
# contra 1 se informa; con 3 contra 2 no. Una disidencia que junta dos fuentes
# ya no es ruido.
RAZON_MAYORIA = 3.0

# Fuentes cuyo valor es un dato LITERAL OBSERVADO, no una estimacion.
#
# Un directorio dice "el 68.78% de las direcciones se ven asi": es una
# estadistica sobre una poblacion, y puede estar sesgada por la muestra que ese
# directorio junto. Un correo visto en un hilo de Outlook, o impreso en un PDF
# indexado, es una direccion que EXISTIO. Son dos clases de evidencia distintas
# y la segunda es la que ancla.
FUENTES_ANCLA = {
    "outlook",            # una direccion real en un hilo
    "outlook_personas",   # un CONTACTO IMPLICITO: alguien que de verdad escribio
                          # a FTS desde ese dominio. Es la clase mas fuerte de
                          # ancla que hay, porque no es una direccion citada
                          # dentro de un texto: es una con la que hubo trafico.
    "odoo",               # una direccion real en el CRM
    "pdf_publico",        # una direccion impresa en un documento indexado
    "padron_gobierno",    # idem, en un padron oficial
    "congreso",           # idem, en un programa o memoria
}

# En QUE CAMPOS se permite informar pese al desacuerdo. Es una lista corta a
# proposito: admitir un campo aqui es una decision, no un descuido.
#
# El criterio para admitir uno:
#
#   1. Es un hecho de la CUENTA, no de una PERSONA. El patron de correo es una
#      estadistica sobre una poblacion de direcciones; que las fuentes difieran
#      es ruido de muestreo esperado, y la mayoria significa algo.
#
#   2. La disidencia NO puede ser "la fuente mas fresca". Un patron de correo
#      no cambia de un mes a otro. Un PUESTO si: si tres fuentes dicen que
#      alguien es Jefe de Mantenimiento y una dice que es Gerente de Planta, la
#      disidente puede ser la que se entero del ascenso. Ahi la mayoria no es
#      la verdad, es la inercia.
#
#   3. Equivocarse es barato y visible. Un patron de correo equivocado rebota;
#      un EMPLEADOR equivocado le atribuye una persona a la empresa que no es,
#      y eso no rebota: se manda el correo y se queda ahi.
#
# `puesto` y `empleador` fallan (2) y (3). No entran, y no deben entrar.
CAMPOS_CON_MAYORIA = ("patron_correo",)

# Cuantas anclas DISTINTAS hacen falta para que un campo con disidencia viva
# llegue a CONFIRMADO en vez de topar en SOLIDO.
#
# Dos, y la razon es la regla del #24 leida con cuidado:
#
#     "El correo real de Outlook prueba que el dominio vive. NO prueba con que
#      frecuencia se usa: son preguntas distintas."
#
# UNA direccion literal es evidencia de EXISTENCIA. No dice nada sobre el patron,
# que es una afirmacion sobre una poblacion -y Hershey usa OCHO patrones segun
# LeadIQ, asi que una direccion suelta no desempata nada-.
#
# DOS O MAS literales que coinciden en la forma ya no son existencia: son una
# MEDICION directa de la poblacion, pequena pero real. Ahi el patron deja de
# inferirse y pasa a observarse, y por eso puede llegar a CONFIRMADO aunque un
# directorio siga diciendo lo contrario.
#
# Es la diferencia entre "existe una direccion asi" y "las direcciones que he
# visto son asi".
ANCLAS_PARA_CONFIRMAR = 2


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

    @property
    def es_ancla(self) -> bool:
        """Esta observacion es un dato literal observado, no una estimacion."""
        return self.fuente.strip().lower() in FUENTES_ANCLA


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
        if self.informa_pese_al_conflicto:
            return self.disidencia
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

    # --- regla C1-bis: mayoria clara con ancla INFORMA; el resto se abstiene ---
    @property
    def _grupos(self) -> list[tuple[Any, list["Observacion"]]]:
        """Las observaciones agrupadas por valor, de mas apoyada a menos."""
        grupos: dict[str, list[Observacion]] = {}
        for o in self.observaciones:
            grupos.setdefault(_normaliza(o.valor), []).append(o)
        return sorted(((g[0].valor, g) for g in grupos.values()),
                      key=lambda par: -len(par[1]))

    @property
    def mayoria(self):
        """(valor, observaciones_a_favor, observaciones_disidentes), o None.

        Solo existe cuando hay DOS O MAS valores distintos: si todas dicen lo
        mismo no hay disidencia que aislar, y si chocan por FORMA o por brecha
        de certeza sobre el MISMO valor, no hay un valor mayoritario que
        reportar -- justo lo que hay que decidir es cual de las dos lecturas
        del mismo literal vale, y eso la mayoria no lo contesta.
        """
        grupos = self._grupos
        if len(grupos) < 2:
            return None
        valor, a_favor = grupos[0]
        disidentes = [o for _v, g in grupos[1:] for o in g]
        return valor, a_favor, disidentes

    @property
    def ancla_en_la_mayoria(self) -> bool:
        """Al menos una de las fuentes de la mayoria vio un dato LITERAL."""
        m = self.mayoria
        return bool(m) and any(o.es_ancla for o in m[1])

    @property
    def anclas_en_la_mayoria(self) -> int:
        """Cuantas fuentes DISTINTAS de ancla sostienen a la mayoria."""
        m = self.mayoria
        if not m:
            return sum(1 for o in self.observaciones if o.es_ancla) if not self.choca else 0
        return len({o.fuente for o in m[1] if o.es_ancla})

    @property
    def medido_no_inferido(self) -> bool:
        """La mayoria se apoya en VARIOS literales, no en uno suelto.

        Una direccion literal dice que el dominio vive; varias que coinciden
        dicen como se ven las direcciones. Lo segundo es una medicion.
        """
        return self.anclas_en_la_mayoria >= ANCLAS_PARA_CONFIRMAR

    @property
    def informa_pese_al_conflicto(self) -> bool:
        """MAYORIA CLARA + ANCLA DURA. Las tres condiciones, conjuntivas.

        Si falta una sola, el campo se vacia como siempre. La que mas trabaja es
        `MINIMO_MAYORIA`: es la que separa Hershey -3 contra 1, informa- de
        Cuprum -2 contra 1, se abstiene AUNQUE tenga el ancla de Outlook-.
        """
        if self.campo not in CAMPOS_CON_MAYORIA:
            return False
        m = self.mayoria
        if not m:
            return False
        _valor, a_favor, disidentes = m
        if len(a_favor) < MINIMO_MAYORIA:
            return False
        if len(a_favor) < RAZON_MAYORIA * len(disidentes):
            return False
        return self.ancla_en_la_mayoria

    @property
    def disidencia(self) -> str:
        """Lo que dice la minoria. Va VISIBLE en la ficha, junto al valor.

        Informar la mayoria y callar la disidencia seria elegir en silencio con
        otro nombre.
        """
        if not self.informa_pese_al_conflicto:
            return ""
        _valor, a_favor, disidentes = self.mayoria
        quien = ", ".join(sorted({o.fuente for o in disidentes}))
        dicen = " / ".join(sorted({str(o.valor) for o in disidentes}))
        anclas = sorted({o.fuente for o in a_favor if o.es_ancla})
        return (f"{len(a_favor)} de {self.n_fuentes} fuentes coinciden, y "
                f"{'/'.join(anclas)} lo vio literal. "
                f"{quien} disiente y dice {dicen} -- confirmalo antes de usarlo.")

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
            if not self.informa_pese_al_conflicto:
                return EN_CONFLICTO
            if self.certeza_declarada_baja:
                return CANDIDATO
            # Con VARIOS literales de acuerdo, el patron deja de inferirse y pasa
            # a observarse: eso si llega a CONFIRMADO, aunque un directorio siga
            # diciendo lo contrario. Con UNO solo topa en SOLIDO, porque una
            # direccion prueba que existe, no con que frecuencia se usa (#24).
            if self.medido_no_inferido and self.n_raices >= 2:
                return CONFIRMADO
            return SOLIDO
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
        """El valor a reportar.

        En conflicto NO elige -- salvo cuando hay MAYORIA CLARA + ANCLA DURA, y
        entonces no esta eligiendo en silencio: reporta el valor de la mayoria
        Y la disidencia al lado, las dos cosas visibles.
        """
        if self.choca:
            if self.informa_pese_al_conflicto:
                return self.mayoria[0]
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
            "informa_pese_al_conflicto": self.informa_pese_al_conflicto,
            "disidencia": self.disidencia,
            "ancla_en_la_mayoria": self.ancla_en_la_mayoria,
            "anclas_en_la_mayoria": self.anclas_en_la_mayoria,
            "medido_no_inferido": self.medido_no_inferido,
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


# ------------------------------------------------- el filtro de valor (§5)
# `de_valor` = el puesto COMPRA, DECIDE o INFLUYE la infraestructura que vende
# FTS. No es una medida de confianza ni de completitud: es de CORRECTITUD.
# IT o RH que solo mencionan la palabra son contexto, no target.
#
# Se DERIVA, no se declara -misma leccion que los contadores de agotado-:
#   * `cercania_decision <= CERCANIA_DE_VALOR`, que es la escala que ya ordena la
#     ficha (0 = decide la obra, 100 = contexto);
#   * o tiene un correo LITERAL de una fuente de ancla Y NADIE le estimo la
#     cercania todavia, porque un correo real vuelve accionable a quien aun
#     podria ser comprador.
#
# El ancla NO asciende a nadie. Si la cercania SI se estimo y dio contexto, un
# correo literal no lo vuelve target. Lo encontro la corrida real de Cuprum del
# 24-sep-2026: un directorio sectorial devolvio un correo literal de cuprum.com
# de difusion comercial. Con la regla vieja entraba como "de valor" -- y el
# filtro de valor es de CORRECTITUD, no de accionabilidad: contarlo habria
# inflado justo la cifra que ordena las prioridades del metodo.
#
# El umbral 20 no es nuevo: es el corte que la ficha de LEGO ya usaba para
# separar a los seis que deciden de los que son contexto.
CERCANIA_DE_VALOR = 20
# El default del campo. "50" no significa "a medio camino": significa que nadie
# la estimo. Por eso es la unica cercania que el ancla puede desempatar.
CERCANIA_SIN_ESTIMAR = 50


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
    modulo_origen: str = ""       # de que modulo salio, para la tabla de rendimiento
    # VIGENCIA. Se apaga cuando alguna fuente muestra que la persona ya no esta
    # en la casa, y NO se vuelve a encender: que un perfil viejo siga diciendo
    # que trabaja ahi no prueba que siga ahi. Lo forzo la corrida de Cuprum del
    # 24-sep-2026 en la consulta ~100: el asiento de mas valor de toda la lista
    # -- un director de proyectos estrategicos que la prensa citaba dando
    # toneladas y prensas -- resulto ser DIRECTOR GENERAL DE OTRA EMPRESA. Sin
    # este campo seguia contando como contacto de valor, y habria llegado a la
    # ficha de Rissia.
    sigue_en_la_casa: bool = True

    @property
    def tiene_ancla(self) -> bool:
        """Algun campo suyo lo vio una fuente que observa literales."""
        return any(o.es_ancla for d in self.datos.values() for o in d.observaciones)

    @property
    def de_valor(self) -> bool:
        """Comprador tecnico o decisor de CAPEX. Derivado, no declarado."""
        if not self.sigue_en_la_casa:
            return False          # el mejor puesto del mundo en otra empresa
        if self.cercania_decision <= CERCANIA_DE_VALOR:
            return True
        return self.tiene_ancla and self.cercania_decision == CERCANIA_SIN_ESTIMAR

    @property
    def por_que_de_valor(self) -> str:
        if not self.sigue_en_la_casa:
            return ("YA NO ESTA EN LA CASA: el puesto era de valor y la persona "
                    "ya no lo ocupa. No cuenta, y no se imprime.")
        if self.cercania_decision <= CERCANIA_DE_VALOR:
            return (f"cercania {self.cercania_decision} <= {CERCANIA_DE_VALOR}: "
                    "decide o influye la obra")
        if self.tiene_ancla and self.cercania_decision == CERCANIA_SIN_ESTIMAR:
            fs = sorted({o.fuente for d in self.datos.values()
                         for o in d.observaciones if o.es_ancla})
            return (f"correo literal de {', '.join(fs)} y cercania sin estimar: "
                    "accionable, queda a revision de puesto")
        if self.tiene_ancla:
            return (f"cercania {self.cercania_decision}: contexto. Tiene correo "
                    "literal, y aun asi no es target: el ancla sirve al patron, "
                    "no al filtro de valor")
        return f"cercania {self.cercania_decision}: contexto, no target"

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
            "modulo_origen": self.modulo_origen,
            "sigue_en_la_casa": self.sigue_en_la_casa,
            "de_valor": self.de_valor,
            "por_que_de_valor": self.por_que_de_valor,
            "datos": {k: d.a_dict() for k, d in self.datos.items()},
        }
