"""Que ha hecho FTS de verdad: el catalogo de proyectos.

Es el corazon del motor 1. Sin el, el evaluador del radar no puede puntuar nada:
"planta nueva en Durango" no dice si es un prospecto de FTS o de un fabricante de
racks. Con el, "el piso superior funde cobre" se convierte en "fundicion, y
fundicion produjo N proyectos de chiller en el historial".

QUE NO LLEVA, y es la regla: **ni una persona**. Ni nombres, ni correos, ni
telefonos. Lo que viaja es EMPRESA + PROYECTO + PROCESO + MONTO, y por eso el
catalogo SI puede vivir en el repo -- que es publico-- mientras los contactos no.

COMO SE CONSTRUYE: triangulando tres fuentes que dicen cosas distintas.

  Odoo        que se VENDIO: la orden, sus lineas, el monto, el cliente
  Outlook     de que se HABLO: el hilo del proyecto trae el proceso del cliente,
              que la orden casi nunca nombra ("para la linea de extrusion")
  SharePoint  que se PROPUSO: la propuesta trae capacidades y alcance

Ninguna sola alcanza. La orden dice "SUMINISTRO E INSTALACION DE CHILLER 30 TR" y
no dice para que proceso; el hilo dice "para el horno de fundicion" y no dice
cuanto se vendio. El catalogo necesita las dos mitades.

LA CLASIFICACION ES POR VOCABULARIO EXPLICITO, no por un modelo. Dos razones: se
puede auditar -- Esteban lee la lista y corrige-- y una linea que no clasifica sale
como `sin_clasificar` en vez de caer en el cajon mas parecido. Un catalogo que
clasifica el 100% miente sobre su propia cobertura.
"""
from __future__ import annotations
import re
import unicodedata


def plano(v) -> str:
    """Minusculas, sin acentos, un solo espacio. Igual que en el catalogo de
    puestos: los datos de Odoo traen acentos inconsistentes."""
    v = unicodedata.normalize("NFD", str(v or "").lower())
    v = "".join(c for c in v if unicodedata.category(c) != "Mn")
    return " ".join(v.split())


# ---------------------------------------------------------------------------
# TIPOS DE PROYECTO. La lista que Esteban nombro, cada uno con las palabras con
# las que APARECE ESCRITO en una linea de venta o en una propuesta.
#
# El orden importa: se evalua de arriba a abajo y gana el primero que pega, asi
# que lo MAS ESPECIFICO va primero. "sistema de agua helada" tiene que ganarle a
# "chiller" cuando la linea dice las dos cosas, porque el sistema es el proyecto
# y el chiller es un componente suyo.
TIPOS_DE_PROYECTO = (
    # --- MANEJO DE MATERIAL E INTEGRACION A LINEA -------------------------
    ("integracion_embolsadora", (
        "embolsadora", "enfardadora", "empacadora", "integracion de linea",
        "integrar a la linea", "bagger")),
    ("conveyor_y_manejo", (
        "conveyor", "polipasto", "seleccionadora", "vertical warehouse",
        "artesa", "parrilla magnetica", "soplador", "banda transportadora",
        "elevador de cangilones", "tolva")),
    # --- ESTRUCTURA Y OBRA ------------------------------------------------
    ("mezzanine", (
        "mezzanine", "mezanine", "entrepiso", "plataforma estructural")),
    ("estructura_metalica", (
        "estructura metalica", "barandal", "escalera", "pasillo elevado",
        "guardas", "cuarto metalico", "caseta", "ampliacion de techo",
        "instalacion de techo", "ducto metalico", "encofrado",
        "base para tanque", "bases de tanques", "base para tablero",
        "plataforma", "soporteria")),
    ("trabajos_civiles", ("trabajos civiles", "obra civil", "cimentacion")),
    # --- ELECTRICO: la familia que el dato destapo -------------------------
    ("transformador", ("transformador", "geafol")),
    ("electroducto_busway", (
        "electroducto", "busway", "barras de cobre", "barra de cobre",
        "unidad de expansion termica", "codo horizontal", "codo vertical")),
    ("tablero_electrico", (
        "tablero", "interruptor de potencia", "relevador", "siprotec",
        "unidad de disparo", "gabinete de proteccion", "switchgear",
        "centro de carga", "arrancador", "interruptor")),
    ("subestacion", (
        "subestacion", "acometida", "media tension", "34.5 kv", "13.8 kv")),
    ("instalacion_electrica", (
        "instalacion electrica", "bajadas electricas", "canalizacion",
        "alimentacion electrica", "cable cal", "mcm", "xlpe", "luminaria",
        "pruebas electricas", "cableado", "conduit", "tuberia conduit",
        "instalacion electromecanica", "electromecanico",
        "sistema electrico", "suministro electrico", "integracion electrica",
        "electrical migration", "integracion electrica/mecanica")),
    ("puesta_a_tierra", ("puesta a tierra", "sistema de tierras",
                         "red de tierras")),
    ("ups_respaldo", ("ups", "no break", "respaldo de energia")),
    # --- AUTOMATIZACION, CONTROL Y RED INDUSTRIAL --------------------------
    ("integracion_control", (
        "integracion de sistema de control", "sistema de control",
        "tablero de control", "instrumentacion", "plc", "hmi", "scada",
        "variador", "vfd", "automatizacion", "retrofit", "recetas",
        "senales y tablero", "integracion de senales", "lazo de control",
        "integracion de valvulas", "control de proceso", "programacion",
        "integracion de control", "integracion de sistema mecanico",
        "sistema obsoleto e integracion", "integracion de resistencias")),
    ("red_industrial", (
        "nodos de red", "switches de red", "switches", "idf", "firewall",
        "thinclient", "thin client", "pantalla", "label verification",
        "label identification", "nodo electrico")),
    ("medicion_y_calibracion", (
        "calibracion", "bascula", "medidores de flujo", "rayos x",
        "medidor de flujo", "verificacion metrologica")),
    # --- TERMICO Y FLUIDOS: el nucleo historico ---------------------------
    ("sistema_agua_helada", (
        "agua helada", "chilled water", "sistema de enfriamiento de proceso",
        "circuito de agua helada", "sistema de enfriamiento")),
    ("circuito_cerrado", (
        "circuito cerrado", "closed loop", "circuito de recirculacion")),
    ("torre_de_enfriamiento", (
        "torre de enfriamiento", "cooling tower", "torre de enfriam")),
    ("intercambiador", (
        "intercambiador", "heat exchanger", "placas", "shell and tube",
        "casco y tubo")),
    ("chiller", (
        "chiller", "enfriador de agua", "unidad enfriadora",
        "planta de agua helada", "rtu")),
    ("clima_de_tablero", (
        "clima", "rittal", "ac unit", "aire acondicionado", "condensadora",
        "deshumidificador", "minisplit")),
    ("caldera_vapor", (
        "caldera", "vapor", "generador de vapor", "boiler", "marmita")),
    ("tratamiento_de_agua", (
        "ptar", "tratamiento de agua", "osmosis", "suavizador",
        "planta de tratamiento", "desmineraliz", "filtros ultra sand",
        "filtro de arena")),
    ("bombeo", (
        "bombeo", "carcamo", "estacion de bombas", "sistema de bombeo",
        "skid de bombas", "skid bombeo")),
    ("tuberia_y_montaje", (
        "tuberia", "piping", "montaje mecanico", "interconexion",
        "racks de tuberia", "valvulas y conexiones", "cedula 80",
        "cedula 40", "soporte de tuberias", "ducteria")),
    # --- SERVICIO ---------------------------------------------------------
    ("comisionamiento_y_arranque", (
        "comisionamiento", "puesta en marcha", "puesta en servicio",
        "supervision de ingenieria", "ingeniero supervisor",
        "soporte de ingenieria", "pruebas previas", "ingenieria de "
        "refrigeracion", "servicio de 2 tecnicos", "soporte tecnico")),
    ("maniobras_y_montaje", (
        "maniobras", "desmontaje", "traslado y montaje", "descarga de equipo",
        "desinstalacion", "grua", "montaje de equipo", "desconexion")),
    ("mantenimiento_servicio", (
        "mantenimiento", "servicio preventivo", "correctivo",
        "limpieza quimica", "reparacion", "modificacion de", "mejoras al "
        "sistema")),
    ("refaccion", (
        "refaccion", "repuesto", "spare", "kit de", "sello", "impulsor",
        "controlador cbe", "rejillas")),
)


# ---------------------------------------------------------------------------
# PROCESOS DEL CLIENTE. No es la industria: es QUE HACE la planta, que es lo que
# genera la carga termica. Dos plantas "automotrices" con procesos distintos son
# dos prospectos distintos -- una fundicion de cobre y un ensamble de arneses no
# compran lo mismo--.
PROCESOS_DEL_CLIENTE = (
    # "funde" entra por la nota de Coficab Durango de #300, que dice "el piso
    # superior FUNDE cobre (OFC)". Sin el verbo, la senal que la validacion de
    # #302 uso como caso de prueba no habria puntuado.
    ("fundicion", ("fundicion", "fundir", "funde", "fundidora", "colada",
                   "horno de induccion", "crisol", "melting", "foundry",
                   "cobre ofc", "aluminio liquido")),
    ("extrusion", ("extrusion", "extrusora", "extruder", "husillo",
                   "perfileria")),
    ("inyeccion", ("inyeccion", "inyectora", "molde", "injection molding")),
    ("arneses_cableado", ("arnes", "arneses", "wire harness",
                          "trefilado", "alambre magneto", "magnet wire",
                          "esmaltado de alambre", "conductor de cobre")),
    ("envasado_bebidas", ("envasado", "embotellado", "llenadora", "bebida",
                          "refresco", "cerveza", "bottling", "topo chico",
                          "agua purificada", "purificadora")),
    # El vocabulario de ALIMENTOS crecio con lo que las lineas de Odoo dicen de
    # verdad, no con lo que yo suponia: amasadora, marmita, artesa, tunel de
    # enfriamiento, tolva de sal, te. Ese es el rendimiento alto -- la descripcion
    # de la linea nombra el equipo, y el equipo nombra el proceso-- contra la
    # busqueda generica en el buzon, que devolvio casi puro hilo interno.
    ("alimentos", ("alimento", "lacteo", "carnico", "panificacion", "harina",
                   "boteana", "snack", "chocolate", "confiteria",
                   "amasadora", "marmita", "artesa", "cooling tunel",
                   "cooling tunnel", "tunel de enfriamiento", "tolva de sal",
                   " te y ", "galleta", "masa", "tortilla", "molino",
                   "rayos x", "deteccion de metales", "detector de metales",
                   "flow master", "empaque de producto")),
    ("quimica", ("quimica", "quimico", "reactor", "formulacion", "resina",
                 "polimero", "fosfato", "tratamiento quimico", "dosificacion",
                 "condensados", "skid de bombas", "tanque de proceso")),
    # `maquinado de hierro` entra por la firma de un cliente en su propio correo
    # ("Iron Machining Manager"), que es la unica evidencia directa de proceso que
    # la busqueda dirigida en el buzon produjo. Se deja anotada la procedencia
    # porque es de una fuente distinta a las demas.
    ("metalmecanica", ("metalmecanica", "maquinado", "cnc", "estampado",
                       "troquelado", "soldadura", "prensa", "machining",
                       "iron machining", "rueda", "wheel", "maquinados")),
    ("tratamiento_termico", ("tratamiento termico", "temple", "recocido",
                             "horno de temple", "austenizado")),
    ("galvanoplastia", ("galvan", "anodizado", "recubrimiento", "electrolitic",
                        "plating", "pintura", "fosfatiz")),
    ("datacenter", ("data center", "datacenter", "sitio de computo", "ups",
                    "crac", "cuarto de telecom")),
    ("farmaceutica", ("farmaceutic", "pharma", "gmp", "area limpia")),
    ("papel_carton", ("papel", "carton", "corrugado", "celulosa")),
    ("vidrio_ceramica", ("vidrio", "ceramica", "horno de vidrio")),
)

# Palabras que descalifican una linea como PROYECTO. Una orden de venta trae
# fletes, viaticos y anticipos, y contarlos como proyectos infla el catalogo con
# cosas que no dicen nada del alcance tecnico de FTS.
# Lo que NO es un proyecto. La segunda mitad de esta lista salio del dato real de
# Odoo, no de imaginarla: una orden de proyecto trae fianzas, diesel, renta de
# equipo y lineas administrativas que reemplazan a otra orden.
NO_ES_PROYECTO = (
    "flete", "viatico", "viaje", "hospedaje", "anticipo", "descuento",
    "redondeo", "iva", "comision", "penalizacion", "nota de credito",
    "gastos de envio", "maniobra de descarga",
    # --- del dato real ---
    "fianza", "diesel", "renta de equipo", "renta de :", "transportacion",
    "expeditacion", "ajuste por modificacion de alcance", "sustituye a la so",
    "reemplazara a la so", "esta so", "generales", "total trabajos",
    "fletes", "seguro de obra",
)

# Magnitudes: lo que dice QUE TAMANO fue el proyecto. Es la tercera capa del
# match del evaluador, y la que corta por ARRIBA: una senal de 1,500 TR no es
# mejor que una de 200, es de otro tamano de empresa y otro competidor.
_MAGNITUD = re.compile(
    r"(\d{1,5}(?:[.,]\d{1,2})?)\s*"
    r"(tr\b|ton(?:elada)?s?\s+de\s+refrigeracion|hp\b|kw\b|kva\b|"
    r"m3\s*/\s*h|m3\b|gpm\b|lpm\b|bhp\b|kg\s*/\s*h|lb\s*/\s*h)", re.I)

_UNIDAD_CANONICA = {
    "tr": "TR", "hp": "HP", "kw": "kW", "kva": "kVA",
    "m3/h": "m3/h", "m3": "m3", "gpm": "GPM", "lpm": "LPM", "bhp": "BHP",
    "kg/h": "kg/h", "lb/h": "lb/h",
}


def _canon(u: str) -> str:
    u = plano(u).replace(" ", "")
    if u.startswith("ton"):
        return "TR"
    return _UNIDAD_CANONICA.get(u, u.upper())


def magnitudes(texto: str) -> list[dict]:
    """Las capacidades que el texto nombra, con su unidad normalizada."""
    out, vistas = [], set()
    for valor, unidad in _MAGNITUD.findall(texto or ""):
        try:
            v = float(valor.replace(",", "."))
        except ValueError:
            continue
        u = _canon(unidad)
        if (v, u) in vistas:
            continue
        vistas.add((v, u))
        out.append({"valor": v, "unidad": u})
    return out


def _pega(texto_plano: str, palabras) -> str:
    """La primera palabra de la lista que aparece en el texto, o "".

    El match exige FRONTERA IZQUIERDA y deja la derecha libre, y las dos mitades
    de esa decision son deliberadas:

      * sin la frontera izquierda, "cobre" pegaria dentro de cualquier palabra
        que lo contenga y "tr" dentro de "tres". Es la misma leccion que la
        contencion de puestos (#300, B2): un substring no es una coincidencia.
      * con frontera DERECHA se romperian los TRONCOS que la lista usa a
        proposito -- "galvan" tiene que pegar con "galvanizado", "desmineraliz"
        con "desmineralizacion", "farmaceutic" con "farmaceutica"--.
    """
    for p in palabras:
        if re.search(r"(?<!\w)" + re.escape(plano(p)), texto_plano):
            return p
    return ""


# Verbos de SUMINISTRO. Distinguen "vender un chiller" de "darle mantenimiento a
# un chiller", que es la ambiguedad que encontro la primera prueba del
# clasificador: "Mantenimiento preventivo semestral de chiller" salia como
# proyecto de chiller, y contarlo asi infla el catalogo de equipo con ventas
# recurrentes de servicio -- y esas dos familias las compra gente distinta--.
VERBOS_DE_SUMINISTRO = (
    "suministro", "suministra", "venta de", "fabricacion", "fabricar",
    "instalacion de", "instalar", "construccion", "diseno y construccion",
    "llave en mano", "adquisicion", "compra de", "equipo nuevo",
)


def clasificar_linea(texto: str) -> dict:
    """Que tipo de proyecto es esta linea de venta, y con que palabra se decidio.

    Devuelve `tipo: None` cuando no pega con nada. **Eso es una respuesta**, no un
    hueco que rellenar con el cajon mas parecido: un catalogo que clasifica el
    100% miente sobre su propia cobertura.
    """
    p = plano(texto)
    if not p:
        return {"tipo": None, "por": "", "descartada": "vacia"}
    fuera = _pega(p, NO_ES_PROYECTO)
    if fuera:
        return {"tipo": None, "por": "", "descartada": fuera}
    # PRECEDENCIA · servicio contra equipo. Si la linea habla de mantenimiento o
    # de refaccion Y NO trae un verbo de suministro, es una venta de SERVICIO
    # aunque nombre el equipo. Con verbo de suministro es la venta del equipo,
    # aunque incluya su puesta en marcha.
    servicio = _pega(p, dict(TIPOS_DE_PROYECTO)["mantenimiento_servicio"])
    refaccion = _pega(p, dict(TIPOS_DE_PROYECTO)["refaccion"])
    suministro = _pega(p, VERBOS_DE_SUMINISTRO)
    if (servicio or refaccion) and not suministro:
        return {"tipo": "refaccion" if refaccion and not servicio
                        else "mantenimiento_servicio",
                "por": refaccion if (refaccion and not servicio) else servicio,
                "descartada": ""}
    for tipo, palabras in TIPOS_DE_PROYECTO:
        marca = _pega(p, palabras)
        if marca:
            return {"tipo": tipo, "por": marca, "descartada": ""}
    return {"tipo": None, "por": "", "descartada": ""}


def proceso_de(texto: str) -> dict:
    """El proceso del cliente que este texto nombra, si nombra alguno."""
    p = plano(texto)
    for proceso, palabras in PROCESOS_DEL_CLIENTE:
        marca = _pega(p, palabras)
        if marca:
            return {"proceso": proceso, "por": marca}
    return {"proceso": None, "por": ""}


# ---------------------------------------------------------------------------
# LO QUE EL CATALOGO DERIVA, y es para lo que existe
def palabras_de_capacidad(entradas: list[dict]) -> dict:
    """Por tipo de proyecto, el rango de capacidad donde FTS SI ha vendido.

    Es la tercera capa del match del evaluador. Con esto, una senal de 1,500 TR
    se puede puntuar por lo que es: fuera del rango donde FTS gana.
    """
    por_tipo: dict[str, list[float]] = {}
    unidades: dict[str, dict[str, int]] = {}
    for e in entradas:
        t = e.get("tipo")
        if not t:
            continue
        for m in e.get("magnitudes", []):
            unidades.setdefault(t, {}).setdefault(m["unidad"], 0)
            unidades[t][m["unidad"]] += 1
            if m["unidad"] == "TR":
                por_tipo.setdefault(t, []).append(m["valor"])
    out = {}
    for t, vals in sorted(por_tipo.items()):
        vals.sort()
        out[t] = {"n": len(vals), "min_TR": vals[0], "max_TR": vals[-1],
                  "mediana_TR": vals[len(vals) // 2]}
    for t, u in unidades.items():
        out.setdefault(t, {})["unidades_vistas"] = dict(
            sorted(u.items(), key=lambda kv: -kv[1]))
    return out


# Quien compra cada tipo de proyecto. NO sale de los datos -- eso exigiria mirar
# personas, y el catalogo no las lleva-- sale del METODO, y se declara asi para
# que nadie lo confunda con una medicion.
PERFIL_DE_QUIEN_COMPRA = {
    "chiller": ("mantenimiento y servicios auxiliares; la especificacion la "
                "firma ingenieria de planta"),
    "sistema_agua_helada": ("ingenieria de proyectos con mantenimiento; en obra "
                            "nueva manda direccion de planta"),
    "circuito_cerrado": ("mantenimiento, y es la venta que menos pasa por "
                         "compras: resuelve un dolor operativo"),
    "torre_de_enfriamiento": "servicios auxiliares / utilities",
    "intercambiador": "ingenieria de procesos; compras tecnicas cierra",
    "caldera_vapor": "servicios auxiliares; con EHS de por medio si hay permisos",
    "tratamiento_de_agua": ("EHS y medio ambiente junto con mantenimiento: es "
                            "la unica familia donde EHS decide y no solo opina"),
    "bombeo": "mantenimiento",
    "tuberia_y_montaje": "ingenieria de proyectos",
    "mezzanine": ("ingenieria de proyectos o facilidades; NO es venta de "
                  "mantenimiento"),
    "integracion_embolsadora": ("ingenieria de manufactura y produccion, no "
                                "mantenimiento: lo que compran es capacidad de "
                                "linea"),
    "subestacion": "ingenieria de planta y electrico; direccion aprueba el capex",
    "mantenimiento_servicio": "jefatura de mantenimiento, compra recurrente",
    "refaccion": "compras MRO, con almacen de por medio",
    # --- las familias que el dato real de Odoo destapo -------------------
    "transformador": ("ingenieria de planta y electrico; el capex lo aprueba "
                      "direccion, y la especificacion la firma quien responde "
                      "por la continuidad de la energia"),
    "electroducto_busway": ("ingenieria de proyectos electricos. Es obra de "
                            "ampliacion: aparece cuando la planta sube carga"),
    "tablero_electrico": ("mantenimiento electrico e ingenieria de planta; "
                          "compras tecnicas cierra"),
    "instalacion_electrica": ("mantenimiento electrico. Es la venta mas "
                              "recurrente del lado electrico"),
    "puesta_a_tierra": ("ingenieria de planta, y con EHS de por medio cuando "
                        "hay auditoria o norma que cumplir"),
    "ups_respaldo": ("IT industrial junto con mantenimiento electrico: "
                     "protege linea, no oficina"),
    "integracion_control": ("ingenieria de manufactura y automatizacion. NO es "
                            "venta de mantenimiento: lo que compran es que la "
                            "linea haga algo que hoy no hace"),
    "red_industrial": ("IT industrial. Es la unica familia donde el comprador "
                       "puede estar en sistemas y no en planta"),
    "medicion_y_calibracion": ("calidad y metrologia, con mantenimiento "
                               "ejecutando. Compra recurrente y calendarizada"),
    "clima_de_tablero": ("mantenimiento electrico: enfria el tablero, no la "
                         "nave. Se confunde con HVAC y no es lo mismo"),
    "estructura_metalica": ("ingenieria de proyectos o facilidades; en "
                            "seguridad de maquina entra EHS"),
    "trabajos_civiles": "ingenieria de proyectos; obra nueva",
    "conveyor_y_manejo": ("ingenieria de manufactura y produccion: compran "
                          "capacidad de linea"),
    "comisionamiento_y_arranque": ("quien es dueno del arranque: direccion de "
                                   "planta o ingenieria de proyectos. Se vende "
                                   "junto al equipo, casi nunca solo"),
    "maniobras_y_montaje": ("ingenieria de proyectos; es el complemento de una "
                            "venta de equipo, propia o de un tercero"),
}
