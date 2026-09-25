"""La regla del buzon: leer las convocatorias que ya estan llegando.

DECISION 5 de #305, y es lo primero porque **el dato ya esta en casa**. Buscando
en Outlook el 24-sep-2026 aparecio, con cadencia semanal, correo de agregadores
de requerimientos industriales -- "empresas buscan proveedores de estos productos
y servicios", con requerimiento por categoria y por estado--, avisos de congresos
del sector, y una RFQ real de cliente reenviada por un vendedor de FTS.

La fuente que el diseno puntuo con 23 y marco "no medido" **esta entrando sola,
por correo, y nadie la lee**. No hace falta raspar portales para empezar: hace
falta una regla sobre el buzon.

SOLO LECTURA. Este modulo clasifica y extrae; no marca como leido, no responde,
no mueve nada. Lo unico que produce es una senal para el evaluador del radar.

QUE NO HACE, Y ES DELIBERADO: no guarda al remitente. Un correo trae una persona
en el `From`, y la senal que sale de aqui viaja con la EMPRESA y el
REQUERIMIENTO. El nombre de quien lo manda no hace falta para puntuar y si hace
falta cuidarlo -- el catalogo y las senales no llevan personas--.
"""
from __future__ import annotations
import re
from datetime import date, datetime

from .catalogo_proyectos import plano
from .radar import tipos_que_nombra

# --------------------------------------------------------------- que clase es
CONVOCATORIA = "convocatoria"          # un agregador publica requerimientos
RFQ_CLIENTE = "rfq_cliente"            # un cliente pide cotizacion
CONGRESO = "congreso"                  # feria, expo, congreso del sector
NO_ES_SENAL = "no_es_senal"

# Las marcas con las que cada clase se delata. Salieron del buzon REAL, no de
# imaginarlas: son las frases que los correos del 24-sep-2026 traian.
MARCAS = {
    RFQ_CLIENTE: (
        "rfq", "request for quotation", "solicitud de cotizacion",
        "peticion de oferta", "invitacion a cotizar", "favor de cotizar",
        "solicitud de propuesta", "request for proposal", "rfp",
    ),
    # OJO CON LA PALABRA SUELTA "requerimiento": la tenia, y el buzon real la
    # descarto. Aparecia en un hilo INTERNO de aceptacion de proyecto
    # ("Requerimientos para aceptacion de proyecto") y en marketing de un
    # proveedor de vision industrial ("los requerimientos reglamentarios estan
    # evolucionando"). Las dos son falsos positivos, y el segundo es peor: habria
    # entrado como convocatoria con peso 23. La marca tiene que ser la FRASE, no
    # la palabra.
    CONVOCATORIA: (
        "buscamos proveedores", "busca proveedores", "buscan proveedores",
        "buscando proveedores", "aceptamos proveedores", "sumar proveedores",
        "sumarse a industriamart", "requerimientos de compra",
        "requieren de estos proveedores", "necesitan estos requerimientos",
        "requerimientos especiales", "aplicar al requerimiento",
        "empresa requiere", "empresas requieren", "registro de proveedores",
        "alta de proveedor", "convocatoria para proveedores",
        "abierta la convocatoria", "licitacion publica", "convocatoria publica",
    ),
    # `congreso` es la clase de MENOR peso de las tres, asi que un falso positivo
    # aqui cuesta poco -- y la marca "expo" pega dentro de "exposicion", que es
    # justo lo que se quiere--. Lo que NO puede pasar es que un curso de
    # cumplimiento de una camara entre como convocatoria de compra: por eso las
    # marcas de camara viven aqui y no alla.
    CONGRESO: (
        "expo", "congreso", "feria", "tu acceso a", "confirma tu participacion",
        "tecnologico y exposicion", "summit", "foro", "webinar", "curso",
        "capacitacion", "inspecciones de autoridades",
    ),
}
# El orden en que se prueba. Lo mas ESPECIFICO primero: una RFQ de cliente puede
# traer la palabra "requerimiento" y no por eso es una convocatoria de agregador.
ORDEN = (RFQ_CLIENTE, CONVOCATORIA, CONGRESO)

# Fuente que le corresponde a cada clase para el evaluador del radar.
FUENTE_DE_CLASE = {
    RFQ_CLIENTE: "rfq_cliente",
    CONVOCATORIA: "convocatoria",
    CONGRESO: "congreso",
}

# Estados de la republica, para el campo `estado` del requerimiento.
ESTADOS = (
    "aguascalientes", "baja california", "baja california sur", "campeche",
    "chiapas", "chihuahua", "coahuila", "colima", "durango", "guanajuato",
    "guerrero", "hidalgo", "jalisco", "estado de mexico", "michoacan",
    "morelos", "nayarit", "nuevo leon", "oaxaca", "puebla", "queretaro",
    "quintana roo", "san luis potosi", "sinaloa", "sonora", "tabasco",
    "tamaulipas", "tlaxcala", "veracruz", "yucatan", "zacatecas",
    "ciudad de mexico", "cdmx",
)
# Los dos estados del padron. Un requerimiento fuera de ellos NO se descarta --
# FTS factura en Houston y en Las Vegas-- pero se marca, porque el padron y la
# logistica de cuadrilla si son regionales.
ESTADOS_DEL_PADRON = ("nuevo leon", "coahuila")

# Dominios de agregador conocidos. Sirven para dos cosas: reconocer la clase sin
# depender solo del texto, y NO confundir al agregador con la empresa que compra.
DOMINIOS_AGREGADOR = (
    "industriamartcontacto.com", "industriamart.com", "sebuscanproveedores.com",
    "somosindustria.com", "clusterindustrial.com.mx",
    "vanguardia-industrial.net",
)

_FECHA_CIERRE = re.compile(
    r"(?:cierra|cierre|vence|limite|fecha\s+l[ií]mite|hasta\s+el)\s*"
    r"(?:el\s+)?:?\s*"
    r"(\d{1,2}\s+de\s+\w+(?:\s+de\s+\d{4})?|\d{4}-\d{2}-\d{2}|"
    r"\d{1,2}/\d{1,2}/\d{2,4})", re.I)

_MESES_ES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5,
             "junio": 6, "julio": 7, "agosto": 8, "septiembre": 9,
             "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}


def dominio_de(remitente: str) -> str:
    return (str(remitente or "").split("@")[-1].strip().lower()
            if "@" in str(remitente or "") else "")


def es_agregador(remitente: str) -> bool:
    d = dominio_de(remitente)
    return any(d == a or d.endswith("." + a) for a in DOMINIOS_AGREGADOR)


def _marca(texto_plano: str, marcas) -> str:
    for m in marcas:
        if plano(m) in texto_plano:
            return m
    return ""


def clasificar(correo: dict) -> dict:
    """Que clase de senal es este correo, y con que marca se decidio.

    `correo` lleva `subject`, `summary` (o `body`), `sender` y `receivedDateTime`.
    """
    texto = " · ".join(str(correo.get(k) or "") for k in
                       ("subject", "asunto", "summary", "snippet", "body",
                        "cuerpo"))
    p = plano(texto)
    for clase in ORDEN:
        m = _marca(p, MARCAS[clase])
        if m:
            # Un agregador que manda la palabra "rfq" sigue siendo convocatoria:
            # el que pide no es el agregador. Sin esta linea, el boletin de un
            # agregador entraria con el peso 25 de una RFQ de cliente.
            if clase == RFQ_CLIENTE and es_agregador(correo.get("sender", "")):
                clase = CONVOCATORIA
                m = f"{m} (pero el remitente es un agregador)"
            return {"clase": clase, "por": m,
                    "fuente": FUENTE_DE_CLASE[clase]}
    if es_agregador(correo.get("sender", "")):
        return {"clase": CONVOCATORIA,
                "por": f"dominio de agregador: {dominio_de(correo.get('sender',''))}",
                "fuente": FUENTE_DE_CLASE[CONVOCATORIA]}
    return {"clase": NO_ES_SENAL, "por": "", "fuente": ""}


def estados_que_nombra(texto: str) -> list[str]:
    p = f" {plano(texto)} "
    return [e for e in ESTADOS if f" {e}" in p]


def fecha_de_cierre(texto: str, anio_por_omision: int | None = None) -> str:
    """La fecha de cierre que el texto declara, en AAAA-MM-DD, o ''.

    Importa mas que la de publicacion: en una convocatoria **el plazo no lo
    decide FTS**. Si la convocatoria cierra el 30, la tarjeta caduca el 30.
    """
    m = _FECHA_CIERRE.search(str(texto or ""))
    if not m:
        return ""
    bruto = m.group(1).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", bruto):
        return bruto
    mm = re.match(r"(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?", bruto, re.I)
    if mm:
        dia = int(mm.group(1))
        mes = _MESES_ES.get(plano(mm.group(2)))
        anio = int(mm.group(3)) if mm.group(3) else (
            anio_por_omision or date.today().year)
        if mes:
            try:
                return date(anio, mes, dia).isoformat()
            except ValueError:
                return ""
    mm = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", bruto)
    if mm:
        d, mo, a = (int(x) for x in mm.groups())
        a = a + 2000 if a < 100 else a
        try:
            return date(a, mo, d).isoformat()
        except ValueError:
            return ""
    return ""


def a_senal(correo: dict, hoy: date | None = None) -> dict | None:
    """El correo convertido en senal para el evaluador, o None si no lo es.

    NO lleva al remitente: la senal viaja con la empresa y el requerimiento.
    """
    c = clasificar(correo)
    if c["clase"] == NO_ES_SENAL:
        return None
    texto = " · ".join(str(correo.get(k) or "") for k in
                       ("subject", "asunto", "summary", "snippet", "body",
                        "cuerpo"))
    recibido = str(correo.get("receivedDateTime") or
                   correo.get("fecha") or "")[:10]
    tipos = tipos_que_nombra(texto)
    ests = estados_que_nombra(texto)
    cierre = fecha_de_cierre(texto,
                             anio_por_omision=int(recibido[:4]) if recibido[:4].isdigit() else None)
    ambig = []
    # La EMPRESA que compra no es el remitente cuando el remitente es un
    # agregador: el agregador publica por cuenta de otra. Si el texto no la
    # nombra, se declara y NO se inventa.
    empresa = ""
    if not es_agregador(correo.get("sender", "")):
        d = dominio_de(correo.get("sender", ""))
        if d and not d.endswith("fts.mx"):
            empresa = d
    if not empresa:
        ambig.append("la empresa que compra no viene identificada: el remitente "
                     "es un agregador o un interno de FTS. Hay que abrir el "
                     "correo para sacarla")
    if not ests:
        ambig.append("sin estado nombrado")
    elif not any(e in ESTADOS_DEL_PADRON for e in ests):
        ambig.append(f"fuera del alcance regional del padron ({', '.join(ests)}): "
                     "no se descarta, pero la cuadrilla si es regional")
    if not tipos:
        ambig.append("no nombra ningun tipo de proyecto de FTS: puede ser "
                     "requerimiento de otra industria")
    return {
        "clase": c["clase"], "clasificada_por": c["por"],
        "fuente": c["fuente"],
        "texto": texto[:600],
        "empresa": empresa,
        "requerimiento": ", ".join(t for _m, t in tipos),
        "categorias": [t for _m, t in tipos],
        "estados": ests,
        "fecha": recibido or None,
        "fecha_de_cierre": cierre or None,
        "ambiguedad": ambig,
        "empata_padron": False,
        "asunto_corto": str(correo.get("subject") or "")[:120],
    }
