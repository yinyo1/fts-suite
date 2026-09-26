"""En que PLANTA se hizo cada proyecto. Lo declara el operador, no Odoo.

EL HUECO QUE CIERRA, y lo destapo la ficha de Coficab Pesqueria (#310).

`sale.order` de Odoo **no registra la planta**. Tiene el cliente -- "Coficab"-- y
no tiene el sitio. Asi que una corrida de Coficab/Pesqueria encuentra tres
proyectos de agua helada de esa cuenta, no ve ninguna planta escrita, y la ficha
concluye lo que parece obvio y es falso: que FTS ya trabajo *en esa planta*.

Los tres proyectos de Coficab fueron en **Ciudad Juarez**. Pesqueria es cuenta
**FRIA**: sin proyecto propio, sin contacto propio. Y la diferencia no es un
matiz de redaccion:

    "ya trabajamos en su planta"            <- falso. Se cae en la primera llamada
    "ya le hicimos tres proyectos de agua   <- verdadero, y sigue siendo fuerte
     helada a su grupo en Juarez"

La segunda abre la puerta igual de bien y **no se derrumba cuando el de Pesqueria
pregunta cual proyecto**. La primera convierte una carta de presentacion en una
mentira comprobable, que es la peor clase de error comercial que esta herramienta
puede cometer: no cuesta una consulta, cuesta la cuenta.

POR QUE ES UN ARCHIVO DECLARADO Y NO UNA DERIVACION

Nadie puede derivar esto. No esta en Odoo, no esta en el correo de forma fiable,
y la direccion de facturacion es la del corporativo o la del intermediario -- los
tres de Coficab entraron via un distribuidor, asi que hasta la contraparte
comercial apunta al lugar equivocado--. El unico que lo sabe es quien vendio.

Entonces se **declara**, con su fuente escrita (`conocimiento_directo`) y su
fecha, y queda en el repo: son EMPRESAS, PLANTAS Y REFERENCIAS DE ORDEN, sin una
sola persona y sin un solo importe. Esa es la misma linea que deja vivir al
catalogo de proyectos en un repo publico.

Y por eso vive en `datos/` y no en el estado de una corrida: el estado de una
corrida muere con la sesion, y lo que hay que evitar es que **la corrida que
todavia no existe** vuelva a especular. Una corrida de Coficab/Saltillo abierta
en diciembre tiene que leer esto sin que nadie se acuerde de sembrarlo.
"""
from __future__ import annotations
import json
import os
import unicodedata
from datetime import date

_DATOS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "datos")
RUTA = os.path.join(_DATOS, "ubicacion-de-proyectos.json")

# El DENOMINADOR: las cuentas de Odoo con trabajo de tamano de proyecto. Sin el,
# "cuantas cuentas tienen su planta declarada" no se puede contestar -- solo se
# sabe cuantas SI, nunca cuantas faltan--.
RUTA_CUENTAS = os.path.join(_DATOS, "cuentas-con-proyecto.json")

# La unica fuente que hay, y por eso se escribe: que el dato venga de la cabeza
# del dueno no lo hace menos cierto, lo hace NO AUDITABLE. Escrito, al menos se
# sabe a quien preguntarle si resulta equivocado.
CONOCIMIENTO_DIRECTO = "conocimiento_directo"
FUENTES = (CONOCIMIENTO_DIRECTO,)

# Los tres veredictos, y el de en medio es el que no existia.
HISTORIA_AQUI = "historia_en_esta_planta"
HISTORIA_EN_OTRA_PLANTA = "historia_del_grupo_en_otra_planta"
SIN_HISTORIA_DECLARADA = "sin_historia_declarada"


def _plano(v) -> str:
    v = unicodedata.normalize("NFD", str(v or "").lower())
    v = "".join(c for c in v if unicodedata.category(c) != "Mn")
    return " ".join(v.split())


class DeclaracionInvalida(Exception):
    """Una declaracion incompleta es peor que ninguna: se cita como si fuera
    dato y no se puede rastrear."""


def cargar(ruta: str = RUTA) -> dict:
    if not os.path.exists(ruta):
        return {"registros": []}
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def de_la_cuenta(empresa: str, datos: dict | None = None) -> list[dict]:
    """Los proyectos declarados de esta cuenta, con su planta."""
    d = datos if datos is not None else cargar()
    e = _plano(empresa)
    if not e:
        return []
    return [r for r in d.get("registros", [])
            if _plano(r.get("empresa")) == e]


def plantas_con_proyecto(empresa: str, datos: dict | None = None) -> list[str]:
    """Las plantas de esta cuenta donde FTS SI trabajo, sin repetir."""
    out = []
    for r in de_la_cuenta(empresa, datos):
        p = r.get("planta") or ""
        if p and p not in out:
            out.append(p)
    return out


def veredicto(empresa: str, ciudad: str | None,
              datos: dict | None = None) -> dict:
    """Que puede decir esta corrida sobre la historia de FTS con esta planta.

    Tres respuestas, y la de en medio es la que faltaba. Sin ella solo habia
    "hay proyectos de esta cuenta" contra "no hay", y la primera se leia como
    "hay proyectos en esta planta" -- que es el error de #310--.
    """
    registros = de_la_cuenta(empresa, datos)
    if not registros:
        return {"veredicto": SIN_HISTORIA_DECLARADA, "aqui": [], "en_otras": [],
                "plantas": [], "es_fria": None,
                "por_que": "Nadie ha declarado donde se hizo ningun proyecto de "
                           "esta cuenta. NO significa que no haya: significa que "
                           "la planta de los que haya no esta escrita, y por eso "
                           "esta corrida no puede afirmar nada sobre el sitio."}
    c = _plano(ciudad)
    aqui = [r for r in registros if c and _plano(r.get("planta")) == c]
    en_otras = [r for r in registros if r not in aqui]
    if aqui:
        return {
            "veredicto": HISTORIA_AQUI, "aqui": aqui, "en_otras": en_otras,
            "plantas": plantas_con_proyecto(empresa, datos), "es_fria": False,
            "por_que": f"FTS trabajo EN ESTA PLANTA: {len(aqui)} proyecto(s) "
                       f"declarado(s) en {ciudad}. La carta de presentacion si "
                       "puede decir 'ya trabajamos en su planta'."}
    otras = []
    for r in en_otras:
        if r.get("planta") and r["planta"] not in otras:
            otras.append(r["planta"])
    return {
        "veredicto": HISTORIA_EN_OTRA_PLANTA, "aqui": [], "en_otras": en_otras,
        "plantas": otras, "es_fria": True,
        "por_que": f"CUENTA FRIA EN ESTA PLANTA. Los {len(en_otras)} proyecto(s) "
                   f"declarado(s) de esta cuenta fueron en {', '.join(otras)}, no "
                   f"en {ciudad or 'esta planta'}. Esta planta no tiene proyecto "
                   "propio ni contacto propio: la historia es DEL GRUPO, y la "
                   "carta de presentacion tiene que decirlo asi o se cae en la "
                   "primera llamada."}


def carta_de_presentacion(empresa: str, ciudad: str | None,
                          datos: dict | None = None) -> str:
    """La frase que la ficha puede sostener. Literal, para que nadie la adorne."""
    v = veredicto(empresa, ciudad, datos)
    if v["veredicto"] == SIN_HISTORIA_DECLARADA:
        return ("Sin historia declarada: no afirmes nada sobre proyectos previos "
                "en esta planta hasta que alguien declare donde se hicieron.")
    if v["veredicto"] == HISTORIA_AQUI:
        que = "; ".join(r.get("que", "") for r in v["aqui"] if r.get("que"))
        return (f"FTS ya trabajo EN ESTA PLANTA: {que or 'proyecto declarado'}. "
                "Se puede decir 'ya trabajamos en su planta'.")
    que = "; ".join(sorted({r.get("que", "") for r in v["en_otras"]
                            if r.get("que")}))
    canales = sorted({r.get("canal", "") for r in v["en_otras"] if r.get("canal")})
    n = len(v["en_otras"])
    return (f"«Ya le hicimos {n} proyecto(s) a su grupo en "
            f"{', '.join(v['plantas'])}»"
            + (f", via {', '.join(canales)}" if canales else "")
            + (f" — {que}" if que else "")
            + ". NO digas 'ya trabajamos en su planta': esta planta es fria, y la "
              "afirmacion se cae en la primera llamada.")


def contacto_es_puerta_a(empresa: str, ciudad: str | None, referencia: str,
                         datos: dict | None = None) -> bool:
    """Si la contraparte de ESE proyecto es puerta a ESTA planta.

    La ficha de Pesqueria trataba a la contraparte de SO10977 como puerta probable
    a Pesqueria. No lo es: es gente de Juarez. Y no es que sea mal contacto -- es
    excelente para Juarez y es semilla de la corrida corporativa--: es que no abre
    ESTA puerta, y una ficha que lo presenta como si la abriera manda al operador
    a una llamada que empieza con un dato falso.
    """
    ref = _plano(referencia)
    c = _plano(ciudad)
    for r in de_la_cuenta(empresa, datos):
        if _plano(r.get("referencia")) == ref:
            return bool(c) and _plano(r.get("planta")) == c
    return False        # referencia no declarada: no se afirma que abra nada


def declarar(empresa: str, referencia: str, planta: str, que: str = "",
             fecha: str = "", canal: str = "",
             fuente: str = CONOCIMIENTO_DIRECTO, ruta: str = RUTA) -> dict:
    """Agrega una declaracion al registro. Exige los cuatro campos que la hacen
    rastreable, y se niega antes que guardar una a medias."""
    faltan = [n for n, v in (("empresa", empresa), ("referencia", referencia),
                             ("planta", planta)) if not str(v or "").strip()]
    if faltan:
        raise DeclaracionInvalida(
            f"Falta {', '.join(faltan)}. Una declaracion de ubicacion sin los "
            "tres se cita en la ficha como si fuera dato y no se puede rastrear "
            "hasta quien la dijo -- que es el unico control que tiene--.")
    if fuente not in FUENTES:
        raise DeclaracionInvalida(
            f"Fuente '{fuente}' desconocida. La unica que existe es "
            f"'{CONOCIMIENTO_DIRECTO}': esto NO se deriva de Odoo ni del correo. "
            "Si algun dia se puede derivar, esa fuente se agrega aqui y se nota "
            "la diferencia en la ficha.")
    d = cargar(ruta)
    d.setdefault("registros", [])
    reg = {"empresa": str(empresa).strip(), "referencia": str(referencia).strip(),
           "planta": str(planta).strip(), "que": str(que or "").strip(),
           "fecha": str(fecha or "").strip(), "canal": str(canal or "").strip(),
           "fuente": fuente, "declarado_en": date.today().isoformat()}
    ref = _plano(reg["referencia"])
    emp = _plano(reg["empresa"])
    for i, r in enumerate(d["registros"]):
        if _plano(r.get("referencia")) == ref and _plano(r.get("empresa")) == emp:
            # Se REEMPLAZA, como el veredicto del padron de #306: dos plantas
            # declaradas para la misma orden son dos afirmaciones que se
            # contradicen, y la ultima es la que el operador acaba de decir.
            reg["reemplazo_a"] = r.get("planta", "")
            d["registros"][i] = reg
            _guardar(d, ruta)
            return reg
    d["registros"].append(reg)
    _guardar(d, ruta)
    return reg


def _guardar(d: dict, ruta: str) -> None:
    d["corte"] = date.today().isoformat()
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")


# --------------------------------------------------------------- cobertura
def cargar_cuentas(ruta: str = RUTA_CUENTAS) -> dict:
    if not os.path.exists(ruta):
        return {"cuentas": []}
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def cobertura(datos: dict | None = None, censo: dict | None = None) -> dict:
    """Cuantas cuentas tienen su planta declarada, y cuantas siguen sin ella.

    SE REPORTA EN DOS CIFRAS, y no es prolijidad: **a quien se le factura no es
    siempre a quien se prospecta**. Coficab tiene tres proyectos declarados y NO
    aparece en el censo de Odoo, porque los tres entraron via un distribuidor que
    si aparece. Contar una sola cifra obligaria a elegir entre dos preguntas
    distintas:

      · del CENSO de Odoo, cuantas cuentas tienen planta declarada -- lo que
        contesta "cuanto me falta cargar"--;
      · del REGISTRO, cuantas cuentas hay declaradas que el censo no conoce
        -- lo que mide el trabajo que entro por intermediario--.
    """
    d = datos if datos is not None else cargar()
    c = censo if censo is not None else cargar_cuentas()
    declaradas = {}
    for r in d.get("registros", []):
        e = _plano(r.get("empresa"))
        if e:
            declaradas.setdefault(e, []).append(r)
    cuentas = c.get("cuentas", []) or []
    con, sin = [], []
    for x in cuentas:
        e = _plano(x.get("empresa"))
        fila = {"empresa": x.get("empresa"),
                "lineas_de_proyecto": x.get("lineas_de_proyecto", 0)}
        (con if e in declaradas else sin).append(fila)
    en_censo = {_plano(x.get("empresa")) for x in cuentas}
    fuera = sorted(e for e in declaradas if e not in en_censo)
    return {
        "censo": len(cuentas),
        "con_historia": con,
        "sin_historia": sorted(sin, key=lambda x: -x["lineas_de_proyecto"]),
        "declaradas_fuera_del_censo": fuera,
        "registros": sum(len(v) for v in declaradas.values()),
        "corte_del_censo": c.get("corte", ""),
        "total_cuentas_con_orden": c.get("total_cuentas_con_orden_confirmada"),
    }


def linea_para_declarar(empresa: str) -> str:
    """El comando ya escrito, para que declarar sea copiar y pegar."""
    return (f"./prospector donde-se-hizo --empresa {empresa!r} "
            "--referencia '<SO o vacio>' --planta '<la planta>' "
            "--que '<que fue>' --fecha '<AAAA-MM>' --canal '<si entro por alguien>'")
