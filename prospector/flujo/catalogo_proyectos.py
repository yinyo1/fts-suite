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
    ("integracion_embolsadora", (
        "embolsadora", "enfardadora", "empacadora", "integracion de linea",
        "integrar a la linea", "bagger")),
    ("mezzanine", (
        "mezzanine", "mezanine", "entrepiso", "plataforma estructural")),
    ("subestacion", (
        "subestacion", "transformador", "acometida", "tablero de distribucion",
        "media tension", "switchgear")),
    ("sistema_agua_helada", (
        "agua helada", "chilled water", "sistema de enfriamiento de proceso",
        "circuito de agua helada")),
    ("circuito_cerrado", (
        "circuito cerrado", "closed loop", "circuito de recirculacion")),
    ("torre_de_enfriamiento", (
        "torre de enfriamiento", "cooling tower", "torre de enfriam")),
    ("intercambiador", (
        "intercambiador", "heat exchanger", "placas", "shell and tube",
        "casco y tubo")),
    ("chiller", (
        "chiller", "enfriador de agua", "unidad enfriadora", "planta de agua "
        "helada")),
    ("caldera_vapor", (
        "caldera", "vapor", "generador de vapor", "boiler")),
    ("tratamiento_de_agua", (
        "ptar", "tratamiento de agua", "osmosis", "suavizador",
        "planta de tratamiento", "desmineraliz")),
    ("bombeo", (
        "bombeo", "carcamo", "estacion de bombas", "sistema de bombeo")),
    ("tuberia_y_montaje", (
        "tuberia", "piping", "montaje mecanico", "interconexion", "racks de "
        "tuberia", "soporteria")),
    ("mantenimiento_servicio", (
        "mantenimiento", "servicio preventivo", "correctivo", "puesta en marcha",
        "arranque", "limpieza quimica", "reparacion")),
    ("refaccion", (
        "refaccion", "repuesto", "spare", "kit de", "sello", "impulsor")),
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
    ("arneses_cableado", ("arnes", "arneses", "cableado", "wire harness",
                          "trefilado", "cable", "conductor")),
    ("envasado_bebidas", ("envasado", "embotellado", "llenadora", "bebida",
                          "refresco", "cerveza", "bottling")),
    ("alimentos", ("alimento", "lacteo", "carnico", "panificacion", "harina",
                   "boteana", "snack", "chocolate", "confiteria")),
    ("quimica", ("quimica", "quimico", "reactor", "formulacion", "resina",
                 "polimero")),
    ("metalmecanica", ("metalmecanica", "maquinado", "cnc", "estampado",
                       "troquelado", "soldadura", "prensa")),
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
NO_ES_PROYECTO = (
    "flete", "viatico", "viaje", "hospedaje", "anticipo", "descuento",
    "redondeo", "iva", "comision", "penalizacion", "nota de credito",
    "gastos de envio", "maniobra de descarga",
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
}
