"""El evaluador del radar: cuánto vale una señal, y por qué.

Aprobado sobre #305. Tres factores, y el desglose viaja con el puntaje -- un
numero sin su cuenta no se puede discutir, y este numero decide si se gastan 60
consultas--.

    puntaje = match_catalogo(0-50) + frescura(0-25) + fuerza_de_fuente(0-25)
              + padron(0 u 8)

LO QUE EL CATALOGO CORRIGIO, y es la razon de ser de este archivo (DECISION 1 de
#305). El catalogo real de proyectos midio que FTS es, por volumen de lineas:

    ELECTRICO 33.8% · AUTOMATIZACION/TI 18.8% · TERMICO/FLUIDOS 14.9% ·
    SERVICIO 13.6% · ESTRUCTURA 11.7% · MANEJO 7.1%

`chiller` + `sistema_agua_helada` son SEIS de 154 lineas. Los terminos de alto
valor que `consultas_senal.json` traia -- PTAR, caldera, torre de enfriamiento--
cubren el 15% del negocio. Un radar montado sobre esas palabras encuentra
sistematicamente la minoria.

EL PESO DE CADA TERMINO SE DERIVA, NO SE ESCRIBE. Es la misma regla que gobierna
todo lo demas aqui: un peso escrito a mano al lado de un catalogo se separa del
catalogo en la segunda actualizacion. El peso sale de la PARTICIPACION de su
familia en el catalogo, y si manana FTS vende otra cosa, los pesos se mueven
solos al regenerar el catalogo.
"""
from __future__ import annotations
import json
import os
from datetime import date, datetime

from .catalogo_proyectos import plano, proceso_de, magnitudes

RUTA_CATALOGO = os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "datos", "catalogo-de-proyectos-fts.json")

# --------------------------------------------------------------------- familias
# Tipo de proyecto -> familia. La familia es la unidad que tiene sentido para el
# radar: una senal de "ampliacion de carga" no dice si va a ser un tablero o un
# electroducto, dice que va a ser ELECTRICO.
FAMILIAS = {
    "electrico": ("transformador", "electroducto_busway", "tablero_electrico",
                  "subestacion", "instalacion_electrica", "puesta_a_tierra",
                  "ups_respaldo"),
    "automatizacion": ("integracion_control", "red_industrial",
                       "medicion_y_calibracion"),
    "termico_fluidos": ("sistema_agua_helada", "circuito_cerrado",
                        "torre_de_enfriamiento", "intercambiador", "chiller",
                        "clima_de_tablero", "caldera_vapor",
                        "tratamiento_de_agua", "bombeo", "tuberia_y_montaje"),
    "estructura": ("mezzanine", "estructura_metalica", "trabajos_civiles"),
    "manejo": ("conveyor_y_manejo", "integracion_embolsadora"),
    "servicio": ("comisionamiento_y_arranque", "maniobras_y_montaje",
                 "mantenimiento_servicio", "refaccion"),
}
FAMILIA_DE_TIPO = {t: f for f, ts in FAMILIAS.items() for t in ts}

# --------------------------------------------------------- terminos de la senal
# Lo que una senal dice que va a pasar, apuntando al TIPO de proyecto de FTS que
# implicaria. Los de electrico y automatizacion entraron por la DECISION 1; los
# termicos ya estaban en `consultas_senal.json` y se conservan.
#
# El termino apunta al tipo, y el tipo determina el peso via su familia. Nadie
# escribe un numero aqui.
TERMINOS_DE_TIPO = {
    # --- electrico: 33.8% del negocio, y no estaba en el radar -------------
    "subestacion": "subestacion",
    "media tension": "subestacion",
    "alta tension": "subestacion",
    "acometida": "subestacion",
    "ampliacion de carga": "subestacion",
    "aumento de carga": "subestacion",
    "tablero": "tablero_electrico",
    "switchgear": "tablero_electrico",
    "centro de control de motores": "tablero_electrico",
    "ccm": "tablero_electrico",
    "transformador": "transformador",
    "electroducto": "electroducto_busway",
    "busway": "electroducto_busway",
    "barras de cobre": "electroducto_busway",
    "puesta a tierra": "puesta_a_tierra",
    "sistema de tierras": "puesta_a_tierra",
    "ups": "ups_respaldo",
    "respaldo de energia": "ups_respaldo",
    "no break": "ups_respaldo",
    "instalacion electrica": "instalacion_electrica",
    "obra electrica": "instalacion_electrica",
    "canalizacion electrica": "instalacion_electrica",
    # --- automatizacion y TI industrial: 18.8% ----------------------------
    "automatizacion de linea": "integracion_control",
    "automatizacion": "integracion_control",
    "plc": "integracion_control",
    "hmi": "integracion_control",
    "scada": "integracion_control",
    "retrofit": "integracion_control",
    "migracion de control": "integracion_control",
    "integracion de control": "integracion_control",
    "sistema de control": "integracion_control",
    "variador": "integracion_control",
    "red industrial": "red_industrial",
    "red de planta": "red_industrial",
    "ot industrial": "red_industrial",
    "industria 4.0": "red_industrial",
    "trazabilidad": "red_industrial",
    "medicion": "medicion_y_calibracion",
    "instrumentacion": "medicion_y_calibracion",
    "calibracion": "medicion_y_calibracion",
    "metrologia": "medicion_y_calibracion",
    # --- termico y fluidos: los que ya estaban ---------------------------
    "chiller": "chiller",
    "agua helada": "sistema_agua_helada",
    "sistema de enfriamiento": "sistema_agua_helada",
    "torre de enfriamiento": "torre_de_enfriamiento",
    "intercambiador": "intercambiador",
    "caldera": "caldera_vapor",
    "vapor": "caldera_vapor",
    "cogeneracion": "caldera_vapor",
    "ptar": "tratamiento_de_agua",
    "planta de tratamiento": "tratamiento_de_agua",
    "tratamiento de agua": "tratamiento_de_agua",
    "reuso de agua": "tratamiento_de_agua",
    "agua residual": "tratamiento_de_agua",
    "bombeo": "bombeo",
    "tuberia de proceso": "tuberia_y_montaje",
    "circuito cerrado": "circuito_cerrado",
    # --- estructura y manejo --------------------------------------------
    "mezanine": "mezzanine",
    "mezzanine": "mezzanine",
    "entrepiso": "mezzanine",
    "estructura metalica": "estructura_metalica",
    "nave industrial": "trabajos_civiles",
    "obra civil": "trabajos_civiles",
    "conveyor": "conveyor_y_manejo",
    "transportador": "conveyor_y_manejo",
    "polipasto": "conveyor_y_manejo",
    "embolsadora": "integracion_embolsadora",
    "empacadora": "integracion_embolsadora",
}

# --------------------------------------------------------------- los tres topes
MAX_PROCESO = 25
MAX_TIPO_DE_OBRA = 15
MAX_CAPACIDAD = 10
MAX_FRESCURA = 25
MAX_FUENTE = 25

# Piso del peso de un termino. Una familia chica no vale CERO: un proyecto de
# chiller sigue siendo un proyecto de FTS. Lo que el peso expresa es "que tan
# probable es que este sea el tipo de trabajo que FTS gana", y eso lo mide la
# participacion -- no la anula--.
PESO_MINIMO_TIPO = 4

# DECISION 3 · el padron es FACTOR, no requisito.
#
# Antes, una senal cuya cuenta no estaba en el corte del DENUE se guardaba como
# "candidata a entrar al padron" y se quedaba esperando un corte que tarda meses.
# El corte es de mayo: las plantas NUEVAS -- las de obra nueva, las de presupuesto
# abierto, las que mas valen-- eran sistematicamente las que el radar no podia
# detonar. Era un sesgo contra el mejor prospecto que existe.
#
# Ahora suma cuando empata y NO RESTA cuando no. El no-empate viaja como
# ambiguedad declarada, no como descuento.
PADRON_EMPATA = 8
PADRON_NO_EMPATA = 0

# --------------------------------------------------------- fuerza de la fuente
# El orden salio del diseno de #305 y la medicion de #302/#305 lo sostiene: el
# correo propio es el cliente diciendolo por escrito, y la prensa generica pega
# 0 de 22 veces con el padron.
FUERZA_DE_FUENTE = {
    "correo_propio": 25,
    "rfq_cliente": 25,
    "convocatoria": 23,
    "licitacion": 20,
    "expansion_odoo": 22,
    "vacante_tecnica": 16,
    "camara": 12,
    "congreso": 12,
    "prensa_industrial": 8,
    "ip_corporativa": 6,
    "feed_generico": 3,
}

# --------------------------------------------------------------- los umbrales
UMBRAL_PASA = 60
UMBRAL_GUARDA = 40

PASA = "pasa"
GUARDA = "guarda"
ARCHIVA = "archiva"

# Frescura: dias de antiguedad -> puntos.
ESCALA_FRESCURA = ((30, 25), (90, 18), (180, 10), (365, 4))
# Una senal SIN FECHA no vale cero: vale el minimo y se marca. Poner cero
# equivale a descartarla, y `fecha_de()` se arreglo en #302 justo porque no
# reconocer la fecha ESCONDIA la antiguedad.
FRESCURA_SIN_FECHA = 2


def cargar_catalogo(ruta: str = RUTA_CATALOGO) -> dict:
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def participacion_por_familia(catalogo: dict) -> dict[str, float]:
    """Que fraccion de las lineas clasificadas aporta cada familia."""
    tipos = catalogo.get("tipos_de_proyecto") or {}
    por_familia: dict[str, int] = {}
    total = 0
    for tipo, d in tipos.items():
        n = int(d.get("n") or 0)
        total += n
        f = FAMILIA_DE_TIPO.get(tipo)
        if f:
            por_familia[f] = por_familia.get(f, 0) + n
    if not total:
        return {}
    return {f: n / total for f, n in por_familia.items()}


def peso_de_tipo(tipo: str, catalogo: dict) -> float:
    """Cuanto vale, de `MAX_TIPO_DE_OBRA`, una senal que apunta a este tipo.

    Escalado por la participacion de su FAMILIA contra la familia mas grande, con
    piso. Asi la senal electrica -- la familia mas grande-- vale el tope, y la
    termica vale proporcionalmente menos sin valer cero.
    """
    part = participacion_por_familia(catalogo)
    if not part:
        return PESO_MINIMO_TIPO
    f = FAMILIA_DE_TIPO.get(tipo)
    if not f or f not in part:
        return PESO_MINIMO_TIPO
    mayor = max(part.values())
    if mayor <= 0:
        return PESO_MINIMO_TIPO
    return max(PESO_MINIMO_TIPO,
               round(MAX_TIPO_DE_OBRA * part[f] / mayor, 1))


def tipos_que_nombra(texto: str) -> list[tuple[str, str]]:
    """(termino, tipo) de cada termino de tipo que el texto nombra."""
    p = f" {plano(texto)} "
    out, vistos = [], set()
    for termino, tipo in TERMINOS_DE_TIPO.items():
        if f" {plano(termino)}" in p and tipo not in vistos:
            vistos.add(tipo)
            out.append((termino, tipo))
    return out


def puntos_de_proceso(texto: str, catalogo: dict) -> tuple[float, str]:
    """El proceso del cliente que la senal nombra, contra el catalogo.

    Dos escalones a proposito. RECONOCER el proceso ya es informacion -- el
    vocabulario sabe que "funde cobre" es una fundicion, y una fundicion es
    industria de carga termica y electrica--; que ADEMAS haya producido proyectos
    en el historial es mas fuerte. Sin los dos escalones, un proceso que el
    catalogo todavia no ha visto puntuaria cero, y la cobertura de proceso del
    catalogo es justo el hueco que #305 declaro.
    """
    pr = proceso_de(texto)
    if not pr["proceso"]:
        return (0.0, "ningun proceso reconocido")
    proc = pr["proceso"]
    base = 10.0
    procesos = catalogo.get("procesos_del_cliente") or {}
    d = procesos.get(proc)
    if not d:
        return (base, f"proceso '{proc}' reconocido (por '{pr['por']}'), "
                      "sin proyectos en el catalogo todavia")
    n = int(d.get("n") or 0)
    mayor = max((int(x.get("n") or 0) for x in procesos.values()), default=0) or 1
    extra = (MAX_PROCESO - base) * min(1.0, n / mayor)
    tipos = ", ".join(list(d.get("proyectos_que_produjo") or {})[:3])
    return (round(base + extra, 1),
            f"proceso '{proc}' con {n} proyecto(s) en el catalogo ({tipos})")


def puntos_de_capacidad(texto: str, catalogo: dict) -> tuple[float, str]:
    """La magnitud de la senal contra el rango donde FTS SI ha vendido.

    CORTA POR ARRIBA, no solo por abajo: una senal de 1,500 TR no es mejor que
    una de 200, es de otro tamano de empresa y otro competidor.
    """
    mags = magnitudes(texto)
    if not mags:
        return (0.0, "sin magnitud declarada")
    cap = catalogo.get("capacidad_por_tipo") or {}
    for m in mags:
        for tipo, d in cap.items():
            if "min_TR" not in d or m["unidad"] != "TR":
                continue
            lo, hi = d["min_TR"], d["max_TR"]
            if lo <= m["valor"] <= hi:
                return (MAX_CAPACIDAD,
                        f"{m['valor']:g} {m['unidad']} cae en el rango de "
                        f"{tipo} ({lo:g}-{hi:g})")
            fuera = "por encima" if m["valor"] > hi else "por debajo"
            return (MAX_CAPACIDAD / 4,
                    f"{m['valor']:g} {m['unidad']} queda {fuera} del rango de "
                    f"{tipo} ({lo:g}-{hi:g}): otro tamano de empresa")
    return (MAX_CAPACIDAD / 2,
            f"magnitud declarada ({mags[0]['valor']:g} {mags[0]['unidad']}) sin "
            "rango comparable en el catalogo")


def dias_de_antiguedad(fecha: str | None, hoy: date | None = None) -> int | None:
    if not fecha:
        return None
    hoy = hoy or date.today()
    for forma in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            d = datetime.strptime(str(fecha).strip()[:len(
                datetime.now().strftime(forma))], forma).date()
            return max(0, (hoy - d).days)
        except ValueError:
            continue
    return None


def puntos_de_frescura(fecha: str | None,
                       hoy: date | None = None) -> tuple[float, str]:
    dias = dias_de_antiguedad(fecha, hoy)
    if dias is None:
        return (FRESCURA_SIN_FECHA,
                "SIN FECHA: vale el minimo y queda marcado. Poner cero "
                "equivale a descartarla")
    for tope, puntos in ESCALA_FRESCURA:
        if dias <= tope:
            return (float(puntos), f"{dias} dias")
    return (0.0, f"{dias} dias: ya no es senal, es historia")


def puntos_de_fuente(fuente: str) -> tuple[float, str]:
    f = plano(fuente).replace(" ", "_")
    if f in FUERZA_DE_FUENTE:
        return (float(FUERZA_DE_FUENTE[f]), f"fuente '{f}'")
    return (0.0, f"fuente '{fuente}' sin peso declarado: cuenta CERO, no un "
                 "promedio. Un peso inventado es peor que un hueco")


def evaluar(senal: dict, catalogo: dict | None = None,
            hoy: date | None = None) -> dict:
    """Puntua una senal. `senal` lleva texto, fuente, fecha y si empata el padron.

    Devuelve el puntaje CON SU DESGLOSE y su `por_que`. Un numero sin su cuenta
    no se puede discutir, y este numero decide si se gastan 60 consultas.
    """
    catalogo = catalogo if catalogo is not None else cargar_catalogo()
    texto = " · ".join(str(senal.get(k) or "") for k in
                       ("texto", "requerimiento", "asunto", "nota"))

    p_proc, por_proc = puntos_de_proceso(texto, catalogo)
    nombra = tipos_que_nombra(texto)
    if nombra:
        pesos = [(t, tipo, peso_de_tipo(tipo, catalogo)) for t, tipo in nombra]
        pesos.sort(key=lambda x: -x[2])
        termino, tipo, p_tipo = pesos[0]
        por_tipo = (f"'{termino}' -> {tipo} "
                    f"({FAMILIA_DE_TIPO.get(tipo, '?')}, peso {p_tipo:g} de "
                    f"{MAX_TIPO_DE_OBRA})")
        tipos_nombrados = [x[1] for x in pesos]
    else:
        termino, tipo, p_tipo = "", None, 0.0
        por_tipo = "no nombra ningun tipo de proyecto de FTS"
        tipos_nombrados = []
    p_cap, por_cap = puntos_de_capacidad(texto, catalogo)
    p_fresca, por_fresca = puntos_de_frescura(senal.get("fecha"), hoy)
    p_fuente, por_fuente = puntos_de_fuente(senal.get("fuente", ""))
    empata = bool(senal.get("empata_padron"))
    p_padron = PADRON_EMPATA if empata else PADRON_NO_EMPATA

    match = round(p_proc + p_tipo + p_cap, 1)
    total = round(match + p_fresca + p_fuente + p_padron, 1)
    veredicto = (PASA if total >= UMBRAL_PASA
                 else GUARDA if total >= UMBRAL_GUARDA else ARCHIVA)

    ambiguedad = list(senal.get("ambiguedad") or [])
    if not empata:
        ambiguedad.append(
            "no empata con el corte vigente del DENUE. NO se descuenta: el "
            "corte es semestral y una planta nueva no existe ahi todavia")
    if p_fresca == FRESCURA_SIN_FECHA:
        ambiguedad.append("sin fecha en el registro")

    return {
        "puntaje": total,
        "veredicto": veredicto,
        "desglose": {
            "match_catalogo": match,
            "proceso": p_proc, "tipo_de_obra": p_tipo, "capacidad": p_cap,
            "frescura": p_fresca, "fuerza_de_fuente": p_fuente,
            "padron": p_padron,
        },
        "por_que": " · ".join([por_proc, por_tipo, por_cap,
                               f"frescura: {por_fresca}", por_fuente,
                               f"padron: {'empata (+8)' if empata else 'no empata (0)'}"]),
        "tipos_que_nombra": tipos_nombrados,
        "familia": FAMILIA_DE_TIPO.get(tipo) if tipo else None,
        "ambiguedad": ambiguedad,
        "umbrales": {"pasa": UMBRAL_PASA, "guarda": UMBRAL_GUARDA},
    }
