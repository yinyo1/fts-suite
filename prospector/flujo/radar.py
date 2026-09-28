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

# ------------------------------------------------------ el tipo INTEGRAL
# DECISION 3 de #329 (D3), aprobada. El hueco que la midio: `tipos_que_nombra()`
# no reconocia "segunda planta", "planta nueva", "ampliacion de nave" ni
# "construye una planta", asi que **una planta nueva contribuia CERO** al factor
# de tipo de obra. Y cuando si habia match -- "nave industrial"-- apuntaba a
# `trabajos_civiles`, de la familia ESTRUCTURA (11.7%), una de las mas chicas: una
# planta nueva se puntuaba como un trabajo civil pequeno.
#
# Es la misma clase de hueco que la DECISION 1 de #305, donde el radar no tenia
# ELECTRICO -- su familia mas grande--.
#
# POR QUE ES UN TIPO APARTE Y NO UNA FAMILIA MAS. Una planta nueva no es un tipo
# de proyecto: es **todos a la vez**. Compra subestacion Y control Y agua helada Y
# estructura Y manejo de material Y comisionamiento. Meterla como miembro de una
# familia la haria competir con sus propios componentes y saldria valiendo lo que
# vale el mas grande de ellos -- que es exactamente el error que tenia--.
#
# Y EL PESO SE DERIVA, COMO TODOS. La regla de este archivo no se afloja para
# esta decision: el peso de un tipo integral es la **suma de las participaciones
# de las familias que la obra necesita**, escalada igual que cualquier otra
# contra la familia mayor. Si manana FTS vende otra mezcla, este peso se mueve
# solo al regenerar el catalogo, sin que nadie lo edite.
#
# LAS SEIS FAMILIAS, Y NO LAS CUATRO QUE LA DECISION NOMBRO. D3 dice "compra
# electrico, automatizacion, termico y estructura a la vez". Se incluyen tambien
# SERVICIO y MANEJO, y es una desviacion consciente de la lista literal: una
# planta nueva necesita comisionamiento y arranque -- no se entrega sola-- y
# necesita mover material dentro. Dejarlas fuera daria un peso de 35.2 y con el
# Coficab Pesqueria se queda en 57.9 (`guarda`), por debajo del `pasa` que la
# propia decision pide como prueba de aceptacion. Con las seis, el peso sale de
# que la obra compra UNA DE CADA COSA, que es lo que de verdad hace.
TIPO_INTEGRAL_OBRA_NUEVA = "obra_nueva_integral"
TIPOS_INTEGRALES = {
    # tipo -> las familias que la obra necesita. `None` = todas las del catalogo.
    TIPO_INTEGRAL_OBRA_NUEVA: None,
}

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
    # OJO: "nave industrial" GENERICA se queda en trabajos_civiles. Una nota que
    # habla de una nave sin decir que es NUEVA no es obra nueva: puede ser un
    # reacondicionamiento, una renta o una mencion de paso. Los terminos de obra
    # nueva viven abajo, y todos exigen la palabra que dice que es nueva.
    "nave industrial": "trabajos_civiles",
    "obra civil": "trabajos_civiles",
    "conveyor": "conveyor_y_manejo",
    "transportador": "conveyor_y_manejo",
    "polipasto": "conveyor_y_manejo",
    "embolsadora": "integracion_embolsadora",
    "empacadora": "integracion_embolsadora",
    # --- obra nueva INTEGRAL: la senal mas fuerte que FTS puede recibir -----
    # D3 de #329. Cada termino tiene que decir que la planta es NUEVA o que
    # CRECE; ninguno pega con una mencion generica de una nave o de una planta.
    "planta nueva": TIPO_INTEGRAL_OBRA_NUEVA,
    "nueva planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "segunda planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "tercera planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "nueva nave": TIPO_INTEGRAL_OBRA_NUEVA,
    "nave nueva": TIPO_INTEGRAL_OBRA_NUEVA,
    "ampliacion de nave": TIPO_INTEGRAL_OBRA_NUEVA,
    "ampliacion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "expansion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "construye una planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "construira una planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "construccion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inaugura planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inauguracion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "nuevo complejo": TIPO_INTEGRAL_OBRA_NUEVA,
    "nueva linea de produccion": TIPO_INTEGRAL_OBRA_NUEVA,
    # en ingles: las notas de prensa industrial de automotriz y alimentos en
    # Nuevo Leon llegan en ingles la mitad de las veces
    "new plant": TIPO_INTEGRAL_OBRA_NUEVA,
    "second plant": TIPO_INTEGRAL_OBRA_NUEVA,
    "third plant": TIPO_INTEGRAL_OBRA_NUEVA,
    "plant expansion": TIPO_INTEGRAL_OBRA_NUEVA,
    "new facility": TIPO_INTEGRAL_OBRA_NUEVA,
    "greenfield": TIPO_INTEGRAL_OBRA_NUEVA,
    "groundbreaking": TIPO_INTEGRAL_OBRA_NUEVA,
    "breaks ground": TIPO_INTEGRAL_OBRA_NUEVA,
    "new production line": TIPO_INTEGRAL_OBRA_NUEVA,
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

# ------------------------------------------------------------ tipo de senal
# QUE ESTA PASANDO, que no es lo mismo que QUIEN NOS LO DIJO.
#
# La tabla de caducidad de `importacion_odoo.py` nacia mezclando las dos cosas:
# once llaves, diez de ellas FUENTES (`correo_propio`, `prensa_industrial`,
# `camara`...) y una sola TIPO (`obra_nueva`). Esa mezcla es la que la dejo
# muerta -- ver el hallazgo H2 de #325--: la caducidad se buscaba por una llave
# que el paquete no emitia y caia siempre al plazo por omision.
#
# La separacion importa porque los dos ejes contestan preguntas distintas:
#
#   * la FUENTE dice cuanto CREERLE a la senal -> `FUERZA_DE_FUENTE`, puntaje;
#   * el TIPO dice CUANDO SE VENCE -> el reloj lo pone el evento, no el CRM.
#
# La misma obra nueva puede llegar por prensa (poco fiable) o por el correo del
# cliente (muy fiable) y en los dos casos su ventana de especificacion es la
# misma. Y la misma fuente -- el buzon-- puede traer una convocatoria que cierra
# el jueves o una necesidad para el ano que entra.
TIPOS_DE_SENAL = {
    "obra_nueva": "planta nueva, nave nueva o ampliacion anunciada",
    "ampliacion_de_capacidad": "mas carga, mas linea o mas proceso en lo que ya existe",
    "convocatoria_abierta": "licitacion o registro de proveedores con fecha de cierre",
    "necesidad_declarada": "alguien de la cuenta dijo por escrito que va a necesitar algo",
    "vacante_tecnica": "contratan a quien operaria o mantendria lo que FTS instala",
    "presencia_en_evento": "la cuenta estara en un congreso, expo o camara",
    "navegacion": "visitas al sitio desde la IP de la corporacion",
    "reconocimiento_de_mercado": "nota, premio o movimiento corporativo sin obra declarada",
}

# Que tipo implica cada fuente cuando nadie declara el tipo. Es un DEFAULT
# honesto, no una equivalencia: `prensa_industrial` suele traer obra nueva, y
# cuando trae otra cosa el operador lo declara y este mapa no se usa.
TIPO_POR_OMISION_DE_FUENTE = {
    "correo_propio": "necesidad_declarada",
    "rfq_cliente": "necesidad_declarada",
    "convocatoria": "convocatoria_abierta",
    "licitacion": "convocatoria_abierta",
    "expansion_odoo": "ampliacion_de_capacidad",
    "vacante_tecnica": "vacante_tecnica",
    "camara": "presencia_en_evento",
    "congreso": "presencia_en_evento",
    "prensa_industrial": "obra_nueva",
    "ip_corporativa": "navegacion",
    "feed_generico": "reconocimiento_de_mercado",
}


def tipo_de_senal_de(fuente: str, tipo_declarado: str = "") -> tuple[str, str]:
    """(tipo, de donde salio). El declarado manda sobre el derivado."""
    t = (tipo_declarado or "").strip()
    if t:
        if t not in TIPOS_DE_SENAL:
            raise ValueError(
                f"Tipo de senal '{t}' desconocido. Los que existen: "
                + ", ".join(sorted(TIPOS_DE_SENAL))
                + ". Un tipo inventado rompe el reloj de caducidad en silencio, "
                  "que es exactamente el hallazgo H2.")
        return (t, "declarado")
    f = plano(fuente or "").replace(" ", "_")
    if f in TIPO_POR_OMISION_DE_FUENTE:
        return (TIPO_POR_OMISION_DE_FUENTE[f], f"derivado de la fuente '{f}'")
    return ("", "sin tipo: la fuente no permite derivarlo y nadie lo declaro")


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


def familias_de_un_tipo_integral(tipo: str, catalogo: dict) -> list[str]:
    """Las familias que una obra de este tipo integral necesita."""
    if tipo not in TIPOS_INTEGRALES:
        return []
    pedidas = TIPOS_INTEGRALES[tipo]
    part = participacion_por_familia(catalogo)
    if pedidas is None:
        return sorted(part)
    return sorted(f for f in pedidas if f in part)


def peso_de_tipo(tipo: str, catalogo: dict) -> float:
    """Cuanto vale, de `MAX_TIPO_DE_OBRA`, una senal que apunta a este tipo.

    Escalado por la participacion de su FAMILIA contra la familia mas grande, con
    piso. Asi la senal electrica -- la familia mas grande-- vale el tope, y la
    termica vale proporcionalmente menos sin valer cero.

    UN TIPO INTEGRAL PASA DEL TOPE, y es lo unico que puede pasarlo. Su peso es
    la SUMA de las participaciones de las familias que la obra necesita, con la
    misma escala: si necesita las seis, su suma es 1.0 y su peso sale ~3x el de la
    familia mayor. No es una excepcion a la regla del peso derivado -- sigue
    saliendo del catalogo y nadie escribe el numero-- es la regla aplicada a algo
    que de verdad compra una de cada cosa.
    """
    part = participacion_por_familia(catalogo)
    if not part:
        return PESO_MINIMO_TIPO
    mayor_ = max(part.values()) if part else 0
    if tipo in TIPOS_INTEGRALES and mayor_ > 0:
        familias = familias_de_un_tipo_integral(tipo, catalogo)
        suma = sum(part[f] for f in familias)
        return max(PESO_MINIMO_TIPO,
                   round(MAX_TIPO_DE_OBRA * suma / mayor_, 1))
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
    # DEFECTO B3 de #330: EL GIRO DE LA CUENTA NO ENTRABA AL EVALUADOR.
    #
    # `puntos_de_proceso` existe para puntuar el PROCESO DEL CLIENTE contra el
    # catalogo, y solo se le daba el texto de la senal -- que es un titular de
    # prensa--. O sea: se le estaba pidiendo al encabezado de una nota que
    # dijera a que se dedica la empresa. El proceso es propiedad de la CUENTA,
    # no de la noticia.
    #
    # Medido: Coficab es una planta de cable automotriz, el catalogo tiene el
    # proceso `arneses_cableado` con proyectos reales, y la cuenta puntuaba CERO
    # en proceso -- o peor, puntuaba `metalmecanica` por la palabra "prensa" del
    # falso positivo B1--. El giro viaja en `Corrida.giro` desde siempre y nadie
    # lo conectaba.
    #
    # El giro se suma SOLO para reconocer el proceso, no para los tipos de obra:
    # el giro dice a que se dedica la planta, no que va a construir. Mezclarlo en
    # `tipos_que_nombra` haria que una planta de cable puntuara "cable de datos"
    # como si fuera un proyecto anunciado.
    texto_con_giro = " · ".join(x for x in (texto, str(senal.get("giro") or ""))
                                if x.strip())

    p_proc, por_proc = puntos_de_proceso(texto_con_giro, catalogo)
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
        # Un tipo integral NO tiene una familia: tiene todas. Reportar la de uno
        # de sus componentes le mentiria al lazo 1, que agrupa por familia para
        # corregir pesos -- le atribuiria a ELECTRICO una conversion que fue de
        # una obra completa--.
        "familia": (TIPO_INTEGRAL_OBRA_NUEVA if tipo in TIPOS_INTEGRALES
                    else FAMILIA_DE_TIPO.get(tipo) if tipo else None),
        "familias_de_la_obra": (familias_de_un_tipo_integral(tipo, catalogo)
                                if tipo in TIPOS_INTEGRALES else []),
        "ambiguedad": ambiguedad,
        "umbrales": {"pasa": UMBRAL_PASA, "guarda": UMBRAL_GUARDA},
    }
