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

from .catalogo import (EQUIVALENCIAS_DE_PUESTO, grupo_de_puesto,
                       _plano as _plano_puesto)

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
    # Las tres vias de M3 comparten raiz A PROPOSITO: que la camara y el comite
    # de normalizacion digan lo mismo son dos documentos oficiales, no dos
    # mundos independientes. Separarlas en el agotado -- para obligar a
    # recorrer las tres-- no es lo mismo que separarlas en la confianza.
    "camara": "documento_oficial",
    "normalizacion": "documento_oficial",
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
    "camara",             # idem, en un directorio de camara
    "normalizacion",      # idem, en la lista de un comite de normalizacion
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

# Campos cuya naturaleza es ACUMULATIVA: dos observaciones distintas no se
# contradicen, se suman. Un expediente laboral no es una afirmacion sobre un
# hecho unico -- es una lista de tramos, y cada fuente ve un pedazo.
#
# La corrida de #295 marco TRES conflictos de este tipo, y los tres eran
# carrera y no contradiccion: la misma persona con dos titulos que resultaron
# ser puestos SUCESIVOS en la misma casa. La compuerta hizo lo unico que podia
# hacer -- marcarlos, porque no puede saberlo-- y la vuelta individual los
# resolvio. Es ruido evitable, y evitarlo NO afloja nada: `puesto` y `entidad`
# siguen chocando igual, que son los campos donde equivocarse cuesta.
CAMPOS_ACUMULATIVOS = ("trayectoria",)

# Cuerpo minimo para que un valor corto cuente como "la misma cosa, mas corta".
# Cuatro caracteres: "jefe" si, "GM" no -- dos letras contenidas en otra cadena
# son coincidencia, no redaccion--.
LARGO_MINIMO_CONTENCION = 4

# En QUE CAMPOS la contencion vale como "la misma cosa, mas corta". Lista corta a
# proposito, y `entidad` NO esta: la encontro una prueba propia al implementar
# B2. "Casa" esta contenido en "Otra Casa" como palabra completa, y son dos
# EMPRESAS DISTINTAS que comparten una palabra. El metodo ya lo decia de
# `entidad` y `empleador` (§ de C1-bis): un empleador equivocado le atribuye una
# persona a la empresa que no es, y eso NO REBOTA -- se manda el correo y se
# queda ahi--. Un puesto redactado con mas o menos detalle no tiene ese costo.
#
# B2 pedia exactamente esto: "si un valor normalizado de PUESTO contiene al
# otro". Ampliarlo a entidad habria sido pasarse de la peticion y abrir un modo
# de falla peor que el que cierra.
CAMPOS_CON_CONTENCION = ("puesto",)

# En que campos vale la EQUIVALENCIA POR TABLA ES-EN. Aprobada por Esteban sobre
# #302, y es el ultimo de los falsos conflictos que #300 midio: en Durango
# "Director General" contra "General Manager" son la misma persona con el titulo
# en dos idiomas. La contencion no los alcanza -- ninguno contiene al otro-- y
# sin tabla siguen yendo a revision humana sin nada que decidir.
#
# Mismo campo que la contencion, y por la misma razon: un PUESTO redactado o
# traducido distinto no cuesta nada equivocado; una ENTIDAD si.
CAMPOS_CON_EQUIVALENCIA = ("puesto",)

# En que campos un literal ANCLA a la PERSONA.
#
# `tiene_ancla` miraba la FUENTE y no el campo, asi que una observacion de
# PUESTO hecha por una fuente de ancla marcaba al contacto como anclado aunque
# nunca se hubiera visto un correo suyo. En #295 no produjo falsos positivos
# -- los seis casos ya eran de valor por cercania-- pero la regla decia una
# cosa y hacia otra: el argumento de `de_valor` es "un comprador con CORREO
# REAL es accionable", y un puesto impreso en una memoria de congreso no es un
# correo.
#
# `patron_correo` no entra: un patron es una afirmacion sobre una POBLACION de
# direcciones, no la direccion de esta persona.
CAMPOS_DE_ANCLA = ("correo",)

# ------------------------------------------------ DONDE ESTA SENTADA LA PERSONA
#
# El arreglo del DOBLE CONTEO que #300 midio: compras MRO, compras regionales de
# Americas, EHS corporativo y una gerencia de mantenimiento sin planta
# aparecieron en 2 a 4 de las cuatro corridas de Coficab, y CADA Chao1 las sumo a
# SU poblacion. Los cuatro Chao1 estimaron sobre una poblacion que no existe. Y
# la ficha de Pesqueria traia como unico contacto a uno de JUAREZ.
#
# LA REGLA, Y SU LIMITE, SON LO MISMO: la ubicacion sale de la EVIDENCIA, nunca
# del titulo. "Compras = corporativo" perderia a la gerencia de compras DE LA
# PLANTA, que si es target -- en Silao era uno de los cuatro de valor--. Asi que
# se lee del campo de ubicacion que las fuentes llenaron, y si no hay nada, NO SE
# EXCLUYE A NADIE: ausencia de evidencia no es evidencia de ausencia, y excluir
# por silencio seria exactamente la heuristica que esto evita.
CAMPOS_DE_UBICACION = ("planta", "sitio", "ubicacion", "ubicación")

# Palabras que dicen "esto no es una planta, es el grupo": las que aparecieron de
# verdad en las cuatro corridas ("COFICAB Group", compras regionales de
# Americas, EHS corporativo) mas las formas equivalentes.
MARCAS_CORPORATIVAS = (
    "group", "grupo", "corporate", "corporativo", "corporativa",
    "headquarters", "hq", "matriz", "global", "worldwide",
    "regional", "region", "americas", "america del norte", "north america",
    "latam", "latinoamerica", "latinoamérica", "emea", "apac",
)

# Donde puede quedar una persona respecto de la corrida que la encontro.
EN_ESTA_PLANTA = "esta_planta"
EN_OTRA_PLANTA = "otra_planta"
EN_CORPORATIVO = "corporativo"
SIN_UBICACION = "sin_ubicacion"


def _es_corporativa(valor: str) -> bool:
    v = f" {_plano_puesto(valor)} "
    return any(f" {m} " in v or v.strip().startswith(m) or v.strip().endswith(m)
               for m in MARCAS_CORPORATIVAS)


def _nombra_la_ciudad(valor: str, ciudad: str) -> bool:
    """La ciudad de la corrida aparece en el valor de ubicacion.

    Se compara sin acentos y por PALABRA, igual que la contencion: sin la
    frontera, "leon" emparejaria dentro de cualquier cadena que la contenga.
    Y se prueba tambien sin las abreviaturas que la geografia mexicana arrastra
    ("Cd. Juarez" contra "Ciudad Juarez" contra "Juarez").
    """
    v, c = _plano_puesto(valor), _plano_puesto(ciudad)
    if not v or not c:
        return False
    nucleo = [t for t in c.split()
              if t not in ("cd", "ciudad", "de", "del", "la", "las", "los",
                           "san", "santa", "villa")]
    if not nucleo:
        nucleo = c.split()
    return all(re.search(r"(?<!\w)" + re.escape(t) + r"(?!\w)", v)
               for t in nucleo)

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
    # SEMBRADA de otra corrida, no observada en esta. Ver `sembrar` en el
    # orquestador y el §4 de metodo/propuestas-de-metodo-300.md.
    #
    # ESTE CAMPO ES EL QUE IMPIDE QUE SEMBRAR INVENTE CONFIRMACIONES. El patron
    # de correo de Coficab tiene UNA sola ancla, en Juarez. Si sembrarla contara
    # como fuente, esa unica observacion produciria CONFIRMADO en las cuatro
    # corridas, y el estado reportaria cuatro confirmaciones de un solo hecho --
    # indistinguible, leyendo el estado, de cuatro observaciones
    # independientes--. Es la misma familia de error que la regla de RAICES
    # previene, y una semilla comparte origen con su corrida POR DEFINICION.
    sembrado: bool = False
    de_corrida: str = ""            # de que corrida vino la semilla

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
        if self.sembrado:
            return False       # una semilla no es un literal de ESTA corrida
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
        """Raices de observaciones PROPIAS. Las sembradas no cuentan.

        Es la linea que impide que sembrar invente confirmaciones. Ver el
        comentario de `Observacion.sembrado`.
        """
        return len({o.raiz for o in self.observaciones if not o.sembrado})

    @property
    def es_derivado_de_patron(self) -> bool:
        """Derivado de un patron, leido de la EVIDENCIA y no de una bandera.

        `derivado_de_patron` es un booleano que pone quien construye el Dato, y
        un booleano que alguien pone es la familia de defecto que este proyecto
        lleva cuatro issues cerrando: lo encontro una prueba del paquete del
        motor 3, donde un correo con una sola observacion de `patron_derivado`
        salia SOLIDO porque nadie habia puesto la bandera. La fuente ya lo dice.
        """
        return self.derivado_de_patron or any(
            o.fuente.strip().lower() == "patron_derivado"
            for o in self.observaciones)

    @property
    def solo_sembrado(self) -> bool:
        """Todo lo que sostiene este dato vino de otra corrida."""
        return bool(self.observaciones) and all(o.sembrado
                                                for o in self.observaciones)

    @property
    def corridas_que_lo_sembraron(self) -> list[str]:
        return sorted({o.de_corrida for o in self.observaciones
                       if o.sembrado and o.de_corrida})

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
        if self.contencion:
            return self.salvedad_por_contencion
        if self.equivalencia:
            return self.salvedad_por_equivalencia
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
    def contencion(self) -> tuple | None:
        """Los valores no se contradicen: uno CONTIENE a los otros.

        B2 de #300, y fue la compuerta que mas estorbo: el challenge marcaba
        CONFLICTO entre "Gerente" y "Gerente COFICAB LEON, Silao Gto". No es una
        contradiccion, es la misma cosa redactada con mas o menos detalle -- en
        Silao fueron 7 de 7 falsos conflictos, siete contactos mandados a
        revision humana sin nada que decidir--.

        Devuelve (el_mas_especifico, los_mas_cortos) o None.

        Dos salvaguardas para que esto NO tape un choque de verdad:

          * la contencion es POR PALABRA COMPLETA. "ventas" no esta contenido en
            "inventas", y "GM" no lo esta en "GMT". Sin esto la regla taparia
            cosas distintas que comparten letras.
          * el valor corto tiene que tener cuerpo (>= LARGO_MINIMO_CONTENCION).
            Un "1" contenido en "12" no es una redaccion mas detallada.

        Y lo que NO tapa, medido en la misma corrida: "Director General" contra
        "General Manager" -- Durango, 2 de 3-- no es contencion, es TRADUCCION.
        Ninguno contiene al otro y sigue saliendo CONFLICTO, que es lo correcto
        mientras nadie decida una regla de traduccion.
        """
        if self.campo not in CAMPOS_CON_CONTENCION:
            return None
        vals = [v for v in self.valores if isinstance(v, str)]
        if len(vals) < 2 or len(vals) != len(self.valores):
            return None
        # Se COMPARA normalizado -- mayusculas y acentos no hacen una redaccion
        # distinta-- y se DEVUELVE el original, que es lo que la ficha imprime.
        norm = {v: _normaliza(v) for v in vals}
        largo = max(vals, key=lambda v: len(norm[v]))
        cortos = [v for v in vals if v != largo]
        if any(len(norm[v]) < LARGO_MINIMO_CONTENCION for v in cortos):
            return None
        if not all(_contiene_palabras(norm[largo], norm[v]) for v in cortos):
            return None
        return (largo, cortos)

    @property
    def salvedad_por_contencion(self) -> str:
        c = self.contencion
        if not c:
            return ""
        largo, cortos = c
        n_cortos = {_normaliza(v) for v in cortos}
        quien = ", ".join(sorted({o.fuente for o in self.observaciones
                                  if _normaliza(o.valor) in n_cortos}))
        return (f"se reporta la redaccion mas especifica ({largo}); "
                f"{quien or 'otra fuente'} lo dice mas corto "
                f"({' / '.join(cortos)}). No es contradiccion: una redaccion "
                "contiene a la otra.")

    @property
    def equivalencia(self) -> tuple | None:
        """Los valores son el MISMO puesto en dos idiomas, por tabla.

        Devuelve (el_termino_en_espanol, los_demas) o None.

        Es el caso de Durango -- 2 de los 3 conflictos de puesto de esa corrida--
        y la contencion no lo alcanza: "Director General" no contiene a "General
        Manager" ni al reves. Lo unico que los une es que significan lo mismo, y
        eso no se deduce de las cadenas: se declara en una tabla que Esteban
        aprueba (`catalogo.EQUIVALENCIAS_DE_PUESTO`).

        TODOS los valores tienen que caer en el MISMO grupo. Con
        "Director General" / "General Manager" / "Gerente de Ventas" no hay
        equivalencia: el tercero es otra persona u otro dato, y ahi el conflicto
        es de verdad.

        LIMITE DECLARADO: la tabla empareja el valor COMPLETO, no un nucleo
        dentro de una cadena larga. "Gerente de Planta" contra "Plant Manager
        COFICAB Silao" NO es equivalencia y sigue chocando. Aflojarlo pedia un
        tokenizador de titulos, y el modo de falla de aflojarlo es fusionar a dos
        personas distintas -- el mismo riesgo que hizo que la contencion se
        quedara fuera de `entidad`--.
        """
        if self.campo not in CAMPOS_CON_EQUIVALENCIA:
            return None
        vals = [v for v in self.valores if isinstance(v, str)]
        if len(vals) < 2 or len(vals) != len(self.valores):
            return None
        grupos = {grupo_de_puesto(v) for v in vals}
        if len(grupos) != 1 or None in grupos:
            return None
        g = EQUIVALENCIAS_DE_PUESTO[grupos.pop()]
        # El termino en ESPANOL es el primero del grupo, y es el que se reporta:
        # la ficha la lee un operador mexicano. Si varios valores caen del lado
        # espanol, gana el que la tabla lista primero.
        en_espanol = [v for v in vals if _plano_puesto(v) == _plano_puesto(g[0])]
        principal = en_espanol[0] if en_espanol else vals[0]
        return (principal, [v for v in vals if v != principal])

    @property
    def salvedad_por_equivalencia(self) -> str:
        e = self.equivalencia
        if not e:
            return ""
        principal, otros = e
        quien = ", ".join(sorted({o.fuente for o in self.observaciones
                                  if o.valor in otros}))
        return (f"se reporta {principal}; {quien or 'otra fuente'} lo dice "
                f"{' / '.join(str(o) for o in otros)}. No es contradiccion: son "
                "el mismo puesto en dos idiomas, por la tabla de equivalencias "
                "que Esteban aprobo.")

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
        if self.campo in CAMPOS_ACUMULATIVOS:
            return False
        if self.contencion:
            return False          # B2: contencion no es contradiccion
        if self.equivalencia:
            return False          # el mismo puesto en dos idiomas, por tabla
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
        if self.solo_sembrado:
            # TOPA EN CANDIDATO, y no es prudencia: es lo que se observo. Aqui
            # nadie miro nada -- el dato viene de otra corrida-- y sin `n_raices`
            # propias no hay con que subirlo. Cuando esta corrida lo observe por
            # su cuenta, deja de ser solo sembrado y sube con sus propias raices.
            return CANDIDATO
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
        if self.equivalencia:
            # Igual que la contencion, y por una razon propia: las fuentes
            # coinciden en el PUESTO y no en como se escribe. Y la tabla es una
            # decision humana, no una observacion: llamar CONFIRMADO a un
            # acuerdo que depende de una tabla seria acreditarle a la evidencia
            # algo que puso el catalogo.
            return SOLIDO
        if self.contencion:
            # Coinciden en el TRONCO, no en el todo: una lo dice mas corto. Dos
            # fuentes que dicen "Gerente" y "Gerente COFICAB LEON, Silao Gto"
            # corroboran el puesto, no la redaccion completa. Llamarlo
            # CONFIRMADO seria afirmar mas de lo que se observo.
            return SOLIDO
        if self.n_raices >= 2:
            return CONFIRMADO
        # una sola raiz: TOPA aqui. No es conflicto, es techo.
        if self.es_derivado_de_patron and not self.ancla_dura:
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
        e = self.equivalencia
        if e:
            return e[0]          # el termino en espanol, y la salvedad da el otro
        c = self.contencion
        if c:
            # El MAS ESPECIFICO, no el primero que llego: "Gerente COFICAB LEON,
            # Silao Gto" dice la planta y "Gerente" no. Y no se elige en
            # silencio -- la salvedad dice que la otra fuente lo dice mas corto--.
            return c[0]          # ya es el valor ORIGINAL mas especifico
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


def _contiene_palabras(largo: str, corto: str) -> bool:
    """`corto` aparece dentro de `largo` como PALABRAS COMPLETAS.

    Sin la frontera de palabra, "ventas" quedaria contenido en "inventas" y la
    regla de contencion taparia un choque de verdad.
    """
    if corto == largo:
        return False
    patron = r"(?<!\w)" + re.escape(corto) + r"(?!\w)"
    return re.search(patron, largo) is not None


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

# La ESCALA, y la compuerta que la defiende. En Silao un agente la capturo
# INVERTIDA -- creyo que 100 = decide-- y marco a un contacto de reclutamiento
# como comprador con correo solido: el unico "de valor + correo" de esa corrida
# era falso. La herramienta no lo detecto en el momento.
#
# La escala es: 0 = DECIDE la obra · 100 = contexto. Se defiende de dos formas:
#
#   1. rango: fuera de 0-100 no es una cercania, es un error de captura;
#   2. coherencia con el PUESTO: hay puestos que, por definicion del metodo, no
#      compran ni deciden infraestructura. RH, reclutamiento, atraccion de
#      talento, prensa, recepcion. Si el puesto dice eso y la cercania dice
#      "decide", una de las dos esta mal -- y la que se puede leer es el puesto--.
CERCANIA_DECIDE = 0
CERCANIA_CONTEXTO = 100

# Puestos que NO compran ni deciden la infraestructura que vende FTS. El metodo
# ya los nombraba contexto en prosa (§5: "IT o RH que solo mencionan la palabra
# son contexto, no target"); aqui pasan a ser una compuerta.
PUESTOS_NUNCA_DECISORES = (
    "reclutad", "reclutamiento", "atraccion de talento", "atracción de talento",
    "recursos humanos", "capital humano", "rh ", "talent acquisition",
    "recruiter", "recruiting", "headhunt",
    "recepcion", "recepción", "receptionist",
    "prensa", "comunicacion social", "comunicación social",
    "community manager", "redes sociales",
    "becario", "practicante", "intern ",
    # --- IT CORPORATIVO, que entra por la DECISION 2 de #305 ---------------
    # El metodo ya decia en prosa que "IT o RH que solo mencionan la palabra son
    # contexto", y esa regla NO estaba en el codigo: solo en el texto. Aqui pasa a
    # ser compuerta, y a la vez se abre la excepcion de abajo -- que es la mitad
    # que Esteban aprobo--.
    "mesa de ayuda", "help desk", "helpdesk", "soporte a usuarios",
    "infraestructura de ti", "infraestructura it", "administrador de red",
    "administrador de sistemas", "sysadmin", "seguridad informatica",
    "ciberseguridad", "director de sistemas", "gerente de sistemas",
    "gerente de ti", "it manager", "it director", "cio",
)

# ------------------------------------------- IT INDUSTRIAL: la excepcion medida
#
# DECISION 2 de #305, aprobada, y la razon es un numero: el catalogo real de
# proyectos midio que AUTOMATIZACION Y TI INDUSTRIAL es el 18.8% del negocio de
# FTS -- `integracion_control` es el tipo MAS GRANDE de los 29--. La regla de que
# "IT es contexto" es correcta para el IT que administra correo y laptops, y es un
# FALSO NEGATIVO SISTEMATICO sobre la segunda familia mas grande cuando el puesto
# es de OT, de sistemas de manufactura o de ingenieria de control: ahi esa persona
# SI compra, y a veces es quien firma.
#
# ACOTADO A TRES TIPOS, y eso es lo que impide que se abra de mas: para un
# proyecto ELECTRICO o TERMICO, un puesto de IT sigue siendo contexto. Un gerente
# de sistemas no compra una subestacion.
PUESTOS_IT_INDUSTRIAL = (
    "ot ", " ot", "operational technology", "tecnologia operativa",
    "sistemas de manufactura", "manufacturing systems", "mes ",
    "industrial it", "ti industrial", "it/ot", "it ot",
    "ingenieria de control", "ingeniero de control", "control engineer",
    "automatizacion", "automation", "controls",
    "scada", "instrumentacion y control", "digitalizacion industrial",
    "industria 4.0", "smart factory", "planta digital",
)

# Los tipos de proyecto donde un puesto de IT INDUSTRIAL puede ser decisor. Es la
# lista de la DECISION 2, y es corta a proposito.
TIPOS_DONDE_IT_DECIDE = ("red_industrial", "integracion_control",
                         "medicion_y_calibracion", "medicion")


def es_it_industrial(puesto: str | None) -> str:
    """La palabra que lo vuelve IT INDUSTRIAL, o "" si es IT de oficina.

    La diferencia no es de grado: el IT industrial responde por la linea, el
    corporativo por el correo. El primero compra integracion; el segundo no.
    """
    p = f" {_normaliza(puesto or '')} "
    for marca in PUESTOS_IT_INDUSTRIAL:
        if marca.strip() and marca in p:
            return marca.strip()
    return ""
# Hasta donde puede acercarse un puesto de esa lista. 41 = fuera del filtro de
# valor (que corta en 20) y fuera del "sin estimar" (50), asi que ni cuenta como
# de valor ni se confunde con no haberlo estimado.
CERCANIA_TOPE_NO_DECISOR = 41


def puesto_nunca_decisor(puesto: str | None) -> str:
    """Devuelve la palabra que lo delata, o "" si el puesto puede decidir."""
    p = f" {_normaliza(puesto or '')} "
    for marca in PUESTOS_NUNCA_DECISORES:
        if marca.strip() and marca in p:
            return marca.strip()
    return ""


def exigir_cercania_coherente(cercania, puesto: str | None,
                              tipos_del_proyecto=()) -> int:
    """Compuerta de escala. Lanza si la cercania no puede ser esa.

    Vive aqui y no en el orquestador porque es una regla del METODO, no del CLI:
    cualquier via que cree un Contacto tiene que pasar por ella.

    `tipos_del_proyecto` son los tipos del catalogo que esta corrida persigue. Si
    incluyen `red_industrial`, `integracion_control` o `medicion`, un puesto de IT
    INDUSTRIAL deja de ser contexto y puede ser decisor (DECISION 2 de #305). Para
    los demas tipos -- electrico, termico, estructura-- IT sigue siendo contexto.
    """
    from .compuertas import CompuertaCerrada
    if isinstance(cercania, bool) or not isinstance(cercania, (int, float)):
        raise CompuertaCerrada(
            f"Cercania {cercania!r}: tiene que ser un numero de "
            f"{CERCANIA_DECIDE} a {CERCANIA_CONTEXTO}.")
    if float(cercania) != int(cercania):
        raise CompuertaCerrada(
            f"Cercania {cercania!r}: la escala es de ENTEROS. Un 100.5 es un "
            "error de captura, no media posicion mas lejos de la decision.")
    cercania = int(cercania)
    if not (CERCANIA_DECIDE <= cercania <= CERCANIA_CONTEXTO):
        raise CompuertaCerrada(
            f"Cercania {cercania} fuera de rango. La escala va de "
            f"{CERCANIA_DECIDE} a {CERCANIA_CONTEXTO}, y OJO CON EL SENTIDO: "
            f"{CERCANIA_DECIDE} = DECIDE la obra, {CERCANIA_CONTEXTO} = "
            "contexto. Es al reves de lo que la intuicion dice.")
    marca = puesto_nunca_decisor(puesto)
    # LA EXCEPCION DE IT INDUSTRIAL, acotada a los tipos donde de verdad compra.
    if marca:
        industrial = es_it_industrial(puesto)
        pertinente = any(_normaliza(t) in TIPOS_DONDE_IT_DECIDE
                         for t in (tipos_del_proyecto or ()))
        if industrial and pertinente:
            return cercania      # OT / control / sistemas de manufactura: decide
    if marca and cercania <= CERCANIA_TOPE_NO_DECISOR:
        raise CompuertaCerrada(
            f"Cercania {cercania} para el puesto {puesto!r}: '{marca}' no compra "
            "ni decide la infraestructura que vende FTS, asi que no puede estar "
            f"a {cercania} de la decision.\n"
            f"  RECUERDA EL SENTIDO DE LA ESCALA: {CERCANIA_DECIDE} = DECIDE, "
            f"{CERCANIA_CONTEXTO} = contexto. Si querias decir 'es contexto', el "
            f"numero es alto, no bajo.\n"
            f"  En la corrida de Silao (#300) este error dejo a un contacto de "
            "reclutamiento marcado como comprador con correo solido: el unico "
            "'de valor + correo' de esa corrida era falso.\n"
            f"  Si de verdad decide, usa un puesto que lo diga; si es contexto, "
            f"usa > {CERCANIA_TOPE_NO_DECISOR}.\n"
            + (f"  OJO: '{es_it_industrial(puesto)}' SI puede decidir, pero solo "
               f"en proyectos de {', '.join(TIPOS_DONDE_IT_DECIDE[:3])}. Esta "
               f"corrida persigue {list(tipos_del_proyecto) or 'nada declarado'}. "
               "Declara el tipo con `--tipos` si es de automatizacion o red."
               if es_it_industrial(puesto) else ""))
    return cercania


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
        """Una fuente de ancla vio un CORREO suyo. No cualquier campo.

        Antes bastaba con que cualquier observacion viniera de una fuente de
        ancla -- un puesto leido en una memoria de congreso marcaba a la
        persona como anclada--. El campo importa tanto como la fuente: lo que
        vuelve accionable a alguien es su direccion, no que su cargo aparezca
        impreso.
        """
        return any(o.es_ancla
                   for campo, d in self.datos.items()
                   if campo in CAMPOS_DE_ANCLA
                   for o in d.observaciones)

    @property
    def ubicaciones_observadas(self) -> list[str]:
        """Lo que las fuentes dijeron de DONDE esta, sin inventar nada."""
        out = []
        for campo in CAMPOS_DE_UBICACION:
            d = self.datos.get(campo)
            if not d:
                continue
            for o in d.observaciones:
                if isinstance(o.valor, str) and o.valor.strip():
                    out.append(o.valor)
        return out

    def ubicacion_respecto_a(self, ciudad: str | None) -> str:
        """Donde esta esta persona respecto de la corrida que la encontro.

        Cuatro respuestas, y la cuarta es la que mantiene la regla honesta:

          EN_ESTA_PLANTA  alguna fuente nombra la ciudad de la corrida
          EN_OTRA_PLANTA  nombran una planta, y ninguna es esta
          EN_CORPORATIVO  lo que nombran es el grupo o una region, no una planta
          SIN_UBICACION   nadie dijo donde esta -- y entonces NO SE EXCLUYE--

        El orden importa: **basta UNA fuente que nombre esta ciudad** para que la
        persona sea de aqui. Es el caso de Juarez en #300, donde un contacto
        tenia "COFICAB Group" y "planta Cd. Juarez" a la vez y el challenge lo
        marco como CONFLICTO de planta: no hay conflicto, la persona es de Juarez
        y una fuente la nombro por el grupo.
        """
        vals = self.ubicaciones_observadas
        if not vals:
            return SIN_UBICACION
        if ciudad and any(_nombra_la_ciudad(v, ciudad) for v in vals):
            return EN_ESTA_PLANTA
        if all(_es_corporativa(v) for v in vals):
            return EN_CORPORATIVO
        if not ciudad:
            # Una corrida sin ciudad -- la corporativa-- no tiene con que decir
            # "otra planta": no hay esta. Ver `completitud` en estado.py.
            return SIN_UBICACION
        return EN_OTRA_PLANTA

    def cuenta_en_la_poblacion_de(self, ciudad: str | None) -> bool:
        """Si esta persona pertenece a la poblacion que Chao1 esta estimando."""
        return self.ubicacion_respecto_a(ciudad) not in (EN_OTRA_PLANTA,
                                                         EN_CORPORATIVO)

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
