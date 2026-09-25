"""Modo EXPANSION del radar: qué va a necesitar el que ya me conoce.

DECISION 4 de #305, y priorizada. El radar diseñado hasta #305 solo sabia
DESCUBRIR: buscaba cuentas nuevas en fuentes publicas. La pregunta de Budenheim
lo destapo -- Budenheim ya es cliente de FTS, con ordenes en Odoo-- y para una
cuenta con historia la fuente que manda es OTRA: el buzon y el historico de Odoo.

Es mas rentable por tres razones, y las tres se miden:

  1. la fuente pesa el maximo (`expansion_odoo` = 22, `correo_propio` = 25),
  2. el canal ya NO es frio -- eso ya esta implementado en `paquete.py`: la raiz
     `fts_interno` en el correo del contacto es lo que lo decide--,
  3. el historico dice QUE SIGUE, que es lo que este modulo calcula.

Y tiene un disparador que el modo descubrimiento no tiene: **el proyecto que se
cierra o arranca**. Es una senal que FTS GENERA, no que espera; no depende de que
nadie publique nada.

DE DONDE SALE "QUE SIGUE", y es la parte que importa: de la CO-OCURRENCIA en el
catalogo. Si los clientes que compraron X tambien compraron Y, entonces Y sigue a
X -- eso es una medicion--. Solo donde el catalogo todavia no tiene con que se usa
la tabla declarada de abajo, y esa tabla esta marcada como CRITERIO, no como
medicion, para que nadie confunda las dos.
"""
from __future__ import annotations
from datetime import date, datetime

from .catalogo_proyectos import plano
from .radar import (FAMILIA_DE_TIPO, evaluar, cargar_catalogo,
                    dias_de_antiguedad)

# ------------------------------------------------------------- el disparador
CERRO = "proyecto_cerrado"
ARRANCO = "proyecto_arrancado"
COMISIONAMIENTO = "comisionamiento"
DISPARADORES = (CERRO, ARRANCO, COMISIONAMIENTO)

# Cuantos dias despues de cerrar un proyecto tiene sentido volver. Antes de eso la
# planta esta digiriendo la obra; mucho despues, ya compro con otro.
#
# VENTANA RAZONADA, NO MEDIDA -- se corrige con el lazo de aprendizaje del motor
# 3, que es el que va a decir cuando de verdad vuelven a comprar--.
DIAS_MINIMOS_PARA_VOLVER = 30
DIAS_MAXIMOS_PARA_VOLVER = 540

# QUE SIGUE A QUE, cuando el catalogo no tiene co-ocurrencia. Es la tabla que
# Esteban nombro en la DECISION 4, ampliada con las familias que el catalogo real
# destapo. **ES CRITERIO, NO MEDICION**, y por eso viaja etiquetada asi hasta la
# senal: quien la lea tiene que poder distinguir "esto lo midio el historial" de
# "esto lo supone el metodo".
SIGUE_DECLARADO = {
    # los dos pares que la DECISION 4 nombro
    "chiller": ("tratamiento_de_agua", "integracion_control"),
    "sistema_agua_helada": ("tratamiento_de_agua", "integracion_control"),
    "subestacion": ("tablero_electrico", "medicion_y_calibracion"),
    # el resto, por la misma logica de obra: lo que queda pendiente cuando el
    # equipo ya esta puesto
    "transformador": ("tablero_electrico", "puesta_a_tierra"),
    "tablero_electrico": ("integracion_control", "medicion_y_calibracion"),
    "electroducto_busway": ("tablero_electrico", "medicion_y_calibracion"),
    "instalacion_electrica": ("puesta_a_tierra", "tablero_electrico"),
    "ups_respaldo": ("red_industrial", "medicion_y_calibracion"),
    "integracion_control": ("red_industrial", "medicion_y_calibracion"),
    "red_industrial": ("integracion_control", "medicion_y_calibracion"),
    "torre_de_enfriamiento": ("tratamiento_de_agua", "bombeo"),
    "intercambiador": ("tuberia_y_montaje", "medicion_y_calibracion"),
    "caldera_vapor": ("tuberia_y_montaje", "medicion_y_calibracion"),
    "tratamiento_de_agua": ("bombeo", "integracion_control"),
    "bombeo": ("integracion_control", "tuberia_y_montaje"),
    "tuberia_y_montaje": ("instalacion_electrica", "integracion_control"),
    "mezzanine": ("estructura_metalica", "instalacion_electrica"),
    "estructura_metalica": ("instalacion_electrica", "trabajos_civiles"),
    "conveyor_y_manejo": ("integracion_control", "instalacion_electrica"),
    "integracion_embolsadora": ("integracion_control", "conveyor_y_manejo"),
    "clima_de_tablero": ("tablero_electrico", "medicion_y_calibracion"),
    "trabajos_civiles": ("instalacion_electrica", "estructura_metalica"),
    "puesta_a_tierra": ("medicion_y_calibracion", "tablero_electrico"),
    "medicion_y_calibracion": ("integracion_control", "red_industrial"),
}

# Cuantos clientes distintos tienen que haber comprado LOS DOS para que la
# co-ocurrencia cuente como medicion y le gane a la tabla declarada.
#
# DOS, y es la misma leccion que `f2 < 3` en Chao1: con un solo cliente el numero
# lo decide una coincidencia. Se noto al construir esto: el catalogo dice
# `chiller -> instalacion_electrica` con n=1, porque UN cliente compro las dos
# cosas en la misma obra. Eso no es un patron, es una obra.
MIN_COOCURRENCIA = 2

MEDIDO = "co-ocurrencia medida en el catalogo"
DEBIL = "co-ocurrencia de UN solo cliente: no alcanza para ser patron"
DECLARADO = "tabla declarada del metodo (CRITERIO, no medicion)"


def coocurrencia(catalogo: dict) -> dict[str, dict[str, int]]:
    """Que tipos compro el MISMO cliente, contados por pares.

    Es la unica forma honesta de decir "esto sigue a esto": lo dice el historial,
    no yo. Un par que el catalogo no ha visto cae en la tabla declarada.
    """
    por_cliente: dict[str, set] = {}
    for e in catalogo.get("entradas") or []:
        cli, tipo = plano(e.get("cliente")), e.get("tipo")
        if not cli or not tipo:
            continue
        por_cliente.setdefault(cli, set()).add(tipo)
    pares: dict[str, dict[str, int]] = {}
    for tipos in por_cliente.values():
        for a in tipos:
            for b in tipos:
                if a != b:
                    pares.setdefault(a, {})
                    pares[a][b] = pares[a].get(b, 0) + 1
    return pares


def que_sigue(tipo: str, catalogo: dict, cuantos: int = 2) -> list[dict]:
    """Los tipos que suelen seguir a este, con de donde sale cada uno."""
    pares = coocurrencia(catalogo).get(tipo) or {}
    out, debiles = [], []
    for otro, n in sorted(pares.items(), key=lambda kv: (-kv[1], kv[0])):
        if n >= MIN_COOCURRENCIA:
            out.append({"tipo": otro, "clientes_que_compraron_los_dos": n,
                        "de_donde": MEDIDO})
            if len(out) >= cuantos:
                return out
        else:
            debiles.append({"tipo": otro, "clientes_que_compraron_los_dos": n,
                            "de_donde": DEBIL})
    # La tabla declarada rellena, y las co-ocurrencias DEBILES van al final: no
    # se tiran -- son una pista de a que volver a mirar cuando el catalogo crezca--
    # pero no mandan.
    for otro in SIGUE_DECLARADO.get(tipo, ()):
        if any(o["tipo"] == otro for o in out):
            continue
        out.append({"tipo": otro, "clientes_que_compraron_los_dos": 0,
                    "de_donde": DECLARADO})
        if len(out) >= cuantos:
            return out
    for d in debiles:
        if not any(o["tipo"] == d["tipo"] for o in out):
            out.append(d)
        if len(out) >= cuantos:
            break
    return out


def senal_de_expansion(proyecto: dict, catalogo: dict | None = None,
                       hoy: date | None = None) -> dict | None:
    """La señal que un proyecto propio genera. None si todavia no toca.

    `proyecto` lleva `cliente`, `tipo`, `disparador`, `fecha`, y opcionalmente
    `planta` y `monto`.
    """
    catalogo = catalogo if catalogo is not None else cargar_catalogo()
    hoy = hoy or date.today()
    tipo = proyecto.get("tipo")
    if not tipo:
        return None
    if proyecto.get("disparador") not in DISPARADORES:
        return None
    dias = dias_de_antiguedad(proyecto.get("fecha"), hoy)
    if dias is None:
        return None
    if dias < DIAS_MINIMOS_PARA_VOLVER:
        return None      # la planta todavia esta digiriendo la obra
    if dias > DIAS_MAXIMOS_PARA_VOLVER:
        return None      # ya compro con otro; esto es historia, no senal
    sigue = que_sigue(tipo, catalogo)
    if not sigue:
        return None
    cliente = proyecto.get("cliente") or ""
    proximos = ", ".join(s["tipo"] for s in sigue)
    texto = (f"{cliente} cerro un proyecto de {tipo} hace {dias} dias. "
             f"Lo que sigue en ese proceso: {proximos}.")
    # El texto de la senal NOMBRA los tipos que siguen, y eso es lo que el
    # evaluador puntua: el `tipo_de_obra` sale del tipo SIGUIENTE, no del que ya
    # se vendio. Si ya se vendio, no hay nada que prospectar ahi.
    palabras = {
        "tratamiento_de_agua": "tratamiento de agua",
        "integracion_control": "integracion de control",
        "tablero_electrico": "tablero", "medicion_y_calibracion": "medicion",
        "puesta_a_tierra": "puesta a tierra", "red_industrial": "red industrial",
        "bombeo": "bombeo", "tuberia_y_montaje": "tuberia de proceso",
        "estructura_metalica": "estructura metalica",
        "instalacion_electrica": "instalacion electrica",
        "conveyor_y_manejo": "conveyor", "trabajos_civiles": "obra civil",
        "electroducto_busway": "electroducto", "transformador": "transformador",
        "subestacion": "subestacion", "ups_respaldo": "ups",
        "chiller": "chiller", "sistema_agua_helada": "agua helada",
        "clima_de_tablero": "clima", "mezzanine": "mezanine",
        "caldera_vapor": "caldera", "torre_de_enfriamiento": "torre de enfriamiento",
        "intercambiador": "intercambiador",
        "integracion_embolsadora": "embolsadora",
    }
    texto += " " + " ".join(palabras.get(s["tipo"], s["tipo"]) for s in sigue)
    senal = {
        "modo": "expansion",
        "texto": texto,
        "fuente": "expansion_odoo",
        "fecha": hoy.isoformat(),      # la senal es de HOY: la genera FTS ahora
        "empata_padron": bool(proyecto.get("empata_padron")),
        "cliente": cliente,
        "planta": proyecto.get("planta") or None,
        "disparador": proyecto.get("disparador"),
        "proyecto_que_la_origino": {"tipo": tipo, "fecha": proyecto.get("fecha"),
                                    "dias": dias, "monto": proyecto.get("monto")},
        "que_sigue": sigue,
        "ambiguedad": [],
    }
    if all(s["de_donde"] != MEDIDO for s in sigue):
        senal["ambiguedad"].append(
            f"lo que sigue a '{tipo}' sale de la TABLA DECLARADA del metodo, no "
            "de co-ocurrencia medida: el catalogo no tiene todavia un cliente "
            "que haya comprado los dos")
    r = evaluar(senal, catalogo, hoy)
    senal["evaluacion"] = r
    senal["puntaje"] = r["puntaje"]
    senal["veredicto"] = r["veredicto"]
    senal["ambiguedad"] += [a for a in r["ambiguedad"]
                            if a not in senal["ambiguedad"]]
    return senal
