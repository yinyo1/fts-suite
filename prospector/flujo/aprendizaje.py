"""Los TRES LAZOS de aprendizaje del motor 3. Diseno de #325.

Un lazo de aprendizaje no es "guardar datos y ya". Son cuatro piezas, y si
falta una el lazo esta abierto:

    1. un EVENTO que ocurre en el mundo            (la tarjeta cerro)
    2. un REGISTRO que lo captura sin interpretar  (el expediente del desenlace)
    3. una COMPUERTA que dice cuando alcanza       (n minimo antes de mover nada)
    4. un DESTINO CONCRETO en el codigo            (que constante se mueve)

La pieza 4 es la que se olvida. Un documento que dice "el aprendizaje ajustara
los pesos" sin nombrar la constante produce un archivo de datos que nadie lee
nunca. Aqui cada lazo nombra su archivo y su constante.

LOS TRES LAZOS, y son tres porque tienen TRES DESTINOS DISTINTOS en el codigo:

  LAZO 1 · al RADAR         -> `radar.py`: FUERZA_DE_FUENTE, ESCALA_FRESCURA,
                               PADRON_EMPATA, los pesos por familia.
                               Pregunta: **a quien vale la pena tocar.**

  LAZO 2 · al MOTOR 2       -> `confianza.py`: desmentidos que bajan niveles;
                               `paquete.py`: las reglas de canal.
                               Pregunta: **con que datos se toca.**

  LAZO 3 · al MOTOR 3 mismo -> `importacion_odoo.py`: DIAS_POR_TIPO_DE_SENAL;
                               y la tabla de cadencia.
                               Pregunta: **cuando y por que canal se toca.**

POR QUE NO ES UN SOLO LAZO: porque las tres preguntas se contestan con numeros
distintos de tarjetas y con evidencia distinta. El lazo 2 aprende de UN rebote
-- un rebote es prueba suficiente de que ese correo esta mal-- mientras el lazo 1
necesita veinte cierres para que una tasa de conversion signifique algo. Meterlos
en la misma compuerta obligaria a elegir: o el lazo 1 se mueve con ruido, o el
lazo 2 se queda esperando veinte rebotes antes de corregir un patron que ya se
sabe malo.

LO QUE ESTE MODULO NO HACE, Y ES A PROPOSITO: **no mueve ninguna constante.**
Calcula lo que el lazo MOVERIA, con su cuenta a la vista, y lo deja escrito para
que una persona lo apruebe. Un evaluador que se reajusta solo es un evaluador que
nadie puede auditar, y el puntaje decide si se gastan 60 consultas.
"""
from __future__ import annotations
import json
import os
from collections import defaultdict
from datetime import datetime, timezone

from .confianza import Dato
from .radar import (FUERZA_DE_FUENTE, ESCALA_FRESCURA, TIPOS_DE_SENAL,
                    PADRON_EMPATA, FAMILIAS)

# --------------------------------------------------------------- los desenlaces
# Como cerro una tarjeta. Son los tres destinos del §4b del diseno.
CADUCA = "caduca"
RECICLA = "recicla"
EVOLUCIONA = "evoluciona"
DESTINOS = (CADUCA, RECICLA, EVOLUCIONA)

# Como cerro un TOQUE. `Dato.DESMIENTEN` y `Dato.NO_DESMIENTEN` juntos: la
# division entre los que son contra-evidencia del DATO y los que no ya vive ahi,
# y repetirla aqui la dejaria desincronizada en la segunda correccion.
RESULTADOS_DE_TOQUE = tuple(sorted(set(Dato.DESMIENTEN) | set(Dato.NO_DESMIENTEN)))

# QUE CUENTA COMO «CONTESTO», en un solo lugar (#365). Estaba repetido como tupla
# literal en cuatro sitios de este archivo, y al agregar `reunion_agendada` los
# cuatro habrian tenido que cambiar a mano: el que se olvidara habria dejado una
# reunion contando como silencio, que es el peor error posible en la metrica que
# mide si el motor 3 sirve.
CUENTAN_COMO_RESPUESTA = ("respuesta_positiva", "respuesta_negativa",
                          "reunion_agendada")
# Y que cuenta como que el CANAL funciono. Una negativa es respuesta y NO es exito:
# prueba que el dato estaba bien y que el negocio dijo no.
EL_CANAL_FUNCIONO = ("respuesta_positiva", "reunion_agendada")

# ------------------------------------------------------------- las compuertas
# CUANTAS tarjetas cerradas hacen falta antes de que cada lazo pueda mover algo.
#
# El 20 del lazo 1 es la regla que el diseno ya fijo, y su razon es la misma que
# la del veredicto `prematuro` de Chao1: con cinco resultados, ajustar un peso es
# ruido con cara de aprendizaje.
#
# EL 20 NO ES GLOBAL, ES POR CELDA. Veinte tarjetas repartidas en once fuentes
# son menos de dos por fuente, y dos cierres no dicen nada de una fuente. La
# compuerta se evalua en la celda que se va a mover: si se mueve el peso de
# `prensa_industrial`, hacen falta 20 cierres DE PRENSA INDUSTRIAL.
MINIMO_POR_CELDA_LAZO1 = 20
# El lazo 2 abre con UNO. Un rebote es prueba suficiente de que ESE correo esta
# mal -- no es una tasa, es un hecho-- y esperar veinte seria seguir escribiendo a
# diecinueve buzones que ya se sabe que rebotan. Para mover un PATRON de cuenta
# (no un correo suelto) pide tres, porque un rebote puede ser un buzon lleno.
MINIMO_POR_DATO_LAZO2 = 1
MINIMO_POR_PATRON_LAZO2 = 3
# El lazo 3 mueve PLAZOS, que son medianas: con menos de diez cierres por tipo de
# senal la mediana la mueve un solo caso raro.
MINIMO_POR_TIPO_LAZO3 = 10

ALCANZA = "alcanza"
PREMATURO = "prematuro"
SIN_DATOS = "sin_datos"


def _veredicto(n: int, minimo: int) -> str:
    if n <= 0:
        return SIN_DATOS
    return ALCANZA if n >= minimo else PREMATURO


class Compuerta:
    """Cuanto falta para poder mover una celda, y que se movería si alcanzara."""

    def __init__(self, celda: str, n: int, minimo: int, archivo: str,
                 constante: str, propuesta: str = "", vigente=None,
                 sugerido=None):
        self.celda, self.n, self.minimo = celda, n, minimo
        self.archivo, self.constante = archivo, constante
        self.propuesta = propuesta
        self.vigente, self.sugerido = vigente, sugerido
        self.veredicto = _veredicto(n, minimo)

    @property
    def abre(self) -> bool:
        return self.veredicto == ALCANZA

    @property
    def faltan(self) -> int:
        return max(0, self.minimo - self.n)

    def a_dict(self) -> dict:
        return {
            "celda": self.celda, "n": self.n, "minimo": self.minimo,
            "faltan": self.faltan, "veredicto": self.veredicto,
            "abre": self.abre,
            "destino": f"{self.archivo}::{self.constante}",
            "vigente": self.vigente, "sugerido": self.sugerido,
            "propuesta": self.propuesta,
        }


# =============================================================================
# LAZO 1 · al RADAR: a quien vale la pena tocar
# =============================================================================
def lazo1_radar(cierres: list[dict]) -> dict:
    """Que movería en `radar.py`, con la cuenta a la vista.

    Tres celdas, y cada una tiene su propia compuerta porque cada una se
    alimenta de un corte distinto de las mismas tarjetas.
    """
    por_fuente: dict[str, dict] = defaultdict(
        lambda: {"n": 0, "convirtio": 0, "respondio": 0})
    por_familia: dict[str, dict] = defaultdict(lambda: {"n": 0, "convirtio": 0})
    por_tramo_de_frescura: dict[int, dict] = defaultdict(
        lambda: {"n": 0, "convirtio": 0})
    padron = {"empata": {"n": 0, "convirtio": 0},
              "no_empata": {"n": 0, "convirtio": 0}}

    for t in cierres:
        sen = t.get("senal_origen") or {}
        convirtio = bool(t.get("convirtio"))
        respondio = bool(t.get("canal_que_funciono"))
        f = sen.get("fuente") or ""
        if f:
            por_fuente[f]["n"] += 1
            por_fuente[f]["convirtio"] += convirtio
            por_fuente[f]["respondio"] += respondio
        fam = sen.get("familia")
        if fam:
            por_familia[fam]["n"] += 1
            por_familia[fam]["convirtio"] += convirtio
        # El tramo de frescura al que la senal pertenecia CUANDO SE PUNTUO. Sale
        # del desglose guardado, no de recalcular: la senal envejecio desde
        # entonces y recalcular compararia contra un numero que nadie uso.
        pf = (sen.get("desglose") or {}).get("frescura")
        if pf is not None:
            por_tramo_de_frescura[int(pf)]["n"] += 1
            por_tramo_de_frescura[int(pf)]["convirtio"] += convirtio
        k = "empata" if sen.get("empata_padron") else "no_empata"
        padron[k]["n"] += 1
        padron[k]["convirtio"] += convirtio

    compuertas = []

    # --- celda A: el peso de cada fuente -------------------------------------
    # La conversion relativa entre fuentes es lo que el peso deberia reflejar. Se
    # compara CONTRA LA MEJOR fuente observada, no contra un absoluto: el peso es
    # un orden, no una probabilidad.
    tasas = {f: (d["convirtio"] / d["n"]) for f, d in por_fuente.items()
             if d["n"] >= MINIMO_POR_CELDA_LAZO1}
    mejor = max(tasas.values(), default=0.0)
    for f, d in sorted(por_fuente.items()):
        vigente = FUERZA_DE_FUENTE.get(f)
        sug = None
        prop = ""
        if d["n"] >= MINIMO_POR_CELDA_LAZO1 and mejor > 0:
            tope = max(FUERZA_DE_FUENTE.values())
            sug = round(tope * (d["convirtio"] / d["n"]) / mejor, 1)
            prop = (f"convirtio {d['convirtio']} de {d['n']}; la mejor fuente "
                    f"medida convierte {mejor:.0%}. El peso proporcional seria "
                    f"{sug:g} contra el {vigente} vigente")
        elif d["n"]:
            prop = (f"{d['convirtio']} de {d['n']} cierres. Faltan "
                    f"{MINIMO_POR_CELDA_LAZO1 - d['n']} para que la tasa "
                    "signifique algo")
        compuertas.append(Compuerta(
            f"fuerza_de_fuente[{f}]", d["n"], MINIMO_POR_CELDA_LAZO1,
            "flujo/radar.py", "FUERZA_DE_FUENTE", prop, vigente, sug))

    # --- celda B: la curva de frescura ---------------------------------------
    conv_por_tramo = {p: d for p, d in sorted(por_tramo_de_frescura.items())}
    # LA CUENTA DE ESTA COMPUERTA SON LOS CIERRES COMPARABLES, no todos.
    # Corregirlo fue necesario: contando todos, 55 cierres agrupados en un solo
    # tramo de la curva abrian la compuerta, y acto seguido la propuesta decia
    # "todos en el mismo lado: no hay con que compararla". Una compuerta que
    # declara ABRE y en el mismo renglon dice que no puede concluir nada es
    # exactamente la clase de veredicto que este proyecto lleva cuatro issues
    # sacando del codigo -- como el `mismo_tamano_sin_hash` que se leia como
    # verificado--. La curva solo se puede juzgar con senal fresca Y senal vieja.
    _altos_n = sum(d["n"] for p, d in conv_por_tramo.items() if p >= 18)
    _bajos_n = sum(d["n"] for p, d in conv_por_tramo.items() if p <= 10)
    n_fresca = (_altos_n + _bajos_n) if (_altos_n and _bajos_n) else 0
    n_total_fresca = sum(d["n"] for d in por_tramo_de_frescura.values())
    prop_fresca = ""
    if not n_fresca and n_total_fresca:
        prop_fresca = (
            f"{n_total_fresca} cierres con desglose de frescura, y TODOS del "
            f"mismo lado de la curva ({_altos_n} con senal fresca, {_bajos_n} con "
            "senal vieja). La compuerta se queda cerrada a proposito: sin los dos "
            "lados no se puede saber si la curva ordena bien, y abrirla con un "
            "solo lado invitaria a mover la tabla con una comparacion que no "
            "existe")
    if n_fresca >= MINIMO_POR_CELDA_LAZO1:
        # La pregunta del diseno: "si las que convierten se tocaron a los 200
        # dias, la tabla esta mal". Se contesta viendo si los tramos de MENOS
        # puntos convierten igual o mejor que los de mas.
        altos = [d for p, d in conv_por_tramo.items() if p >= 18]
        bajos = [d for p, d in conv_por_tramo.items() if p <= 10]
        ca = sum(d["convirtio"] for d in altos); na = sum(d["n"] for d in altos)
        cb = sum(d["convirtio"] for d in bajos); nb = sum(d["n"] for d in bajos)
        if na and nb:
            ta, tb = ca / na, cb / nb
            prop_fresca = (
                f"senal fresca (18-25 pts) convirtio {ca}/{na} = {ta:.0%}; "
                f"senal vieja (0-10 pts) convirtio {cb}/{nb} = {tb:.0%}. "
                + ("La curva ordena bien: no se toca."
                   if ta >= tb else
                   "LA CURVA ESTA AL REVES: la senal vieja convierte igual o "
                   "mejor, y la frescura esta castigando prospectos buenos."))
    elif n_fresca:
        prop_fresca = (f"{n_fresca} cierres comparables (los dos lados de la "
                       f"curva). Faltan {MINIMO_POR_CELDA_LAZO1 - n_fresca}")
    compuertas.append(Compuerta(
        "escala_frescura", n_fresca, MINIMO_POR_CELDA_LAZO1,
        "flujo/radar.py", "ESCALA_FRESCURA", prop_fresca,
        list(ESCALA_FRESCURA)))

    # --- celda C: el padron como factor -------------------------------------
    # EL HUECO DEL §3d, y es la unica celda que puede llegar a valer CERO o
    # NEGATIVO: si las que convierten NO estan en el padron, los +8 estan
    # sesgando el radar contra la obra nueva, que es el mejor prospecto que hay.
    n_pad = padron["empata"]["n"] + padron["no_empata"]["n"]
    prop_pad = ""
    if n_pad >= MINIMO_POR_CELDA_LAZO1 and padron["empata"]["n"] and padron["no_empata"]["n"]:
        te = padron["empata"]["convirtio"] / padron["empata"]["n"]
        tn = padron["no_empata"]["convirtio"] / padron["no_empata"]["n"]
        prop_pad = (
            f"en el padron: {padron['empata']['convirtio']}/"
            f"{padron['empata']['n']} = {te:.0%}; fuera del padron: "
            f"{padron['no_empata']['convirtio']}/{padron['no_empata']['n']} = "
            f"{tn:.0%}. "
            + ("El +8 se sostiene." if te > tn else
               "EL +8 NO SE SOSTIENE: las de fuera del padron convierten igual o "
               "mejor. El padron esta sesgando contra la planta nueva, y ahora "
               "hay numero para quitarle los puntos."))
    elif n_pad:
        prop_pad = (f"{n_pad} cierres, y hacen falta los dos lados poblados "
                    f"({padron['empata']['n']} dentro, "
                    f"{padron['no_empata']['n']} fuera)")
    compuertas.append(Compuerta(
        "padron_empata", n_pad, MINIMO_POR_CELDA_LAZO1,
        "flujo/radar.py", "PADRON_EMPATA", prop_pad, PADRON_EMPATA))

    return {
        "lazo": 1, "nombre": "al radar", "pregunta": "a quien vale la pena tocar",
        "destinos": ["flujo/radar.py"],
        "cierres_leidos": len(cierres),
        "por_fuente": {f: dict(d) for f, d in sorted(por_fuente.items())},
        "por_familia": {f: dict(d) for f, d in sorted(por_familia.items())},
        "padron": padron,
        "compuertas": [x.a_dict() for x in compuertas],
        "abren": [x.celda for x in compuertas if x.abre],
    }


# =============================================================================
# LAZO 2 · al MOTOR 2: con que datos se toca
# =============================================================================
def lazo2_motor2(cierres: list[dict]) -> dict:
    """Los desmentidos y lo que corrigen. Es el unico lazo que ya puede actuar.

    El lazo 1 y el 3 mueven CONSTANTES y esperan su compuerta. Este lazo mueve
    HECHOS sobre datos concretos -- este correo reboto-- y un hecho no necesita
    veinte repeticiones para ser verdad.
    """
    desmentidos: list[dict] = []
    por_canal: dict[str, dict] = defaultdict(
        lambda: {"usado": 0, "funciono": 0})
    # Patrones de correo por cuenta: cuantos rebotaron de cuantos se usaron.
    patrones: dict[str, dict] = defaultdict(lambda: {"usados": 0, "rebotes": 0})

    for t in cierres:
        llave = t.get("llave_de_reciclaje") or t.get("llave") or "?"
        for toque in t.get("toques") or []:
            canal = toque.get("canal") or "?"
            res = toque.get("resultado") or ""
            por_canal[canal]["usado"] += 1
            if res in EL_CANAL_FUNCIONO:
                por_canal[canal]["funciono"] += 1
            if toque.get("nivel_confianza_del_correo") == "candidato":
                patrones[llave]["usados"] += 1
                if res == "rebote":
                    patrones[llave]["rebotes"] += 1
            if res in Dato.DESMIENTEN:
                desmentidos.append({
                    "llave": llave,
                    "campo": ("correo" if res == "rebote" else "puesto"
                              if res == "persona_equivocada" else "contacto"),
                    "que_paso": res,
                    "por_que_desmiente": Dato.DESMIENTEN[res],
                    "fecha": toque.get("fecha"),
                    "nivel_que_traia": toque.get("nivel_confianza_del_correo"),
                })

    compuertas = []
    # --- celda A: los datos desmentidos, AGRUPADOS ---------------------------
    # Agrupados por (cuenta, campo, que paso) y no uno por renglon. Doce rebotes
    # de la misma cuenta son UN hallazgo con doce casos, y listarlos suelto los
    # hace ver como doce hallazgos: el tablero se llena de la misma linea repetida
    # y el hallazgo distinto que viene abajo se pierde de vista.
    agrupados: dict[tuple, dict] = {}
    for d in desmentidos:
        k = (d["llave"], d["campo"], d["que_paso"])
        g = agrupados.setdefault(k, {"n": 0, "fechas": [], "niveles": set(),
                                     "por_que": d["por_que_desmiente"]})
        g["n"] += 1
        if d.get("fecha"):
            g["fechas"].append(d["fecha"])
        if d.get("nivel_que_traia"):
            g["niveles"].add(d["nivel_que_traia"])
    for (llave, campo, que), g in sorted(agrupados.items()):
        veces = ("" if g["n"] == 1 else f", {g['n']} veces")
        compuertas.append(Compuerta(
            f"desmentido[{llave}::{campo}::{que}]", g["n"],
            MINIMO_POR_DATO_LAZO2, "flujo/confianza.py", "Dato.desmentir()",
            f"{que}{veces}: {g['por_que']}. Baja a DESMENTIDO y la ficha va a "
            "decir NO LO USES en lugar de 'correo probable'",
            ", ".join(sorted(g["niveles"])) or None, "desmentido"))

    # --- celda B: el PATRON de correo de la cuenta ---------------------------
    # Distinto de un correo suelto: aqui se descarta la REGLA de la cuenta, y eso
    # afecta a contactos que nunca se tocaron. Por eso pide tres y no uno -- un
    # rebote puede ser un buzon lleno, tres son el patron--.
    for llave, d in sorted(patrones.items()):
        if not d["rebotes"]:
            continue
        compuertas.append(Compuerta(
            f"patron_correo[{llave}]", d["rebotes"], MINIMO_POR_PATRON_LAZO2,
            "flujo/confianza.py", "el patron de la cuenta",
            f"{d['rebotes']} de {d['usados']} correos derivados del patron "
            "rebotaron. "
            + ("Descartar el patron de esta cuenta: deja de emitirse y los "
               "contactos sin correo observado se piden por conmutador"
               if d["rebotes"] >= MINIMO_POR_PATRON_LAZO2 else
               f"Faltan {MINIMO_POR_PATRON_LAZO2 - d['rebotes']} rebotes: uno "
               "solo puede ser un buzon lleno")))

    # --- celda C: las reglas de canal ----------------------------------------
    # La pregunta del diseno: "es el unico lugar donde se puede medir si
    # 'LinkedIn como refuerzo' es correcto".
    n_canal = sum(d["usado"] for d in por_canal.values())
    prop = ""
    if n_canal >= MINIMO_POR_CELDA_LAZO1:
        orden = sorted(((d["funciono"] / d["usado"], c, d)
                        for c, d in por_canal.items() if d["usado"]),
                       reverse=True)
        prop = "; ".join(f"{c} {d['funciono']}/{d['usado']} ({t:.0%})"
                         for t, c, d in orden)
        if orden and orden[0][1] == "linkedin":
            prop += (". LinkedIn es el que MAS funciona, y `paquete.py` lo emite "
                     "como refuerzo y no como primer toque: la regla esta al "
                     "reves y hay con que cambiarla")
    elif n_canal:
        prop = (f"{n_canal} toques registrados. Faltan "
                f"{MINIMO_POR_CELDA_LAZO1 - n_canal}")
    compuertas.append(Compuerta(
        "reglas_de_canal", n_canal, MINIMO_POR_CELDA_LAZO1,
        "flujo/paquete.py", "canal_de()", prop))

    return {
        "lazo": 2, "nombre": "al motor 2", "pregunta": "con que datos se toca",
        "destinos": ["flujo/confianza.py", "flujo/paquete.py"],
        "cierres_leidos": len(cierres),
        "desmentidos": desmentidos,
        "por_canal": {c: dict(d) for c, d in sorted(por_canal.items())},
        "compuertas": [x.a_dict() for x in compuertas],
        "abren": [x.celda for x in compuertas if x.abre],
    }


# =============================================================================
# LAZO 3 · al MOTOR 3 MISMO: cuando y por que canal se toca
# =============================================================================
def lazo3_motor3(cierres: list[dict]) -> dict:
    """Los plazos de caducidad y la cadencia, contra lo que de verdad tardaron.

    Es el lazo que el diseno reconocio como el mas necesario sin nombrarlo asi:
    los plazos del §4b estan escritos "para poder corregirlos con datos", y estos
    son los datos.
    """
    from .importacion_odoo import DIAS_POR_TIPO_DE_SENAL

    por_tipo: dict[str, dict] = defaultdict(
        lambda: {"n": 0, "respondieron": 0, "dias": [], "caducaron": 0,
                 "caducaron_y_reciclaron": 0})
    toques_hasta_responder: list[int] = []

    for t in cierres:
        tipo = (t.get("senal_origen") or {}).get("tipo") or "sin_tipo"
        d = por_tipo[tipo]
        d["n"] += 1
        dias = t.get("dias_hasta_la_primera_respuesta")
        if dias is not None:
            d["respondieron"] += 1
            d["dias"].append(int(dias))
        if t.get("destino") == CADUCA:
            d["caducaron"] += 1
        if t.get("destino") == RECICLA:
            d["caducaron_y_reciclaron"] += 1
        toques = t.get("toques") or []
        for i, x in enumerate(toques, 1):
            if x.get("resultado") in CUENTAN_COMO_RESPUESTA:
                toques_hasta_responder.append(i)
                break

    def _mediana(xs):
        if not xs:
            return None
        ys = sorted(xs)
        m = len(ys) // 2
        return ys[m] if len(ys) % 2 else (ys[m - 1] + ys[m]) / 2

    compuertas = []
    for tipo, d in sorted(por_tipo.items()):
        vigente = DIAS_POR_TIPO_DE_SENAL.get(tipo)
        med = _mediana(d["dias"])
        sug, prop = None, ""
        if d["respondieron"] >= MINIMO_POR_TIPO_LAZO3 and med is not None:
            p90 = sorted(d["dias"])[min(len(d["dias"]) - 1,
                                        int(0.9 * len(d["dias"])))]
            sug = int(p90)
            prop = (f"{d['respondieron']} de {d['n']} respondieron; mediana "
                    f"{med:g} dias, p90 {p90} dias. El plazo vigente de "
                    f"{vigente} dias "
                    + ("sobra: se puede cerrar antes y liberar la cartera"
                       if vigente and vigente > p90 * 2 else
                       "CORTA DEMASIADO: hay respuestas despues de que la "
                       "tarjeta ya caduco"
                       if vigente and vigente < p90 else
                       "queda bien"))
        elif d["respondieron"]:
            prop = (f"{d['respondieron']} respuestas de {d['n']} cierres. Faltan "
                    f"{MINIMO_POR_TIPO_LAZO3 - d['respondieron']}: con menos, la "
                    "mediana la mueve un solo caso raro")
        elif d["n"]:
            prop = (f"{d['n']} cierres y NINGUNA respuesta. Si esto se sostiene, "
                    "el plazo no es el problema: el tipo de senal no sirve, y eso "
                    "es leccion del lazo 1, no de este")
        compuertas.append(Compuerta(
            f"dias[{tipo}]", d["respondieron"], MINIMO_POR_TIPO_LAZO3,
            "flujo/importacion_odoo.py", "DIAS_POR_TIPO_DE_SENAL", prop,
            vigente, sug))

    # La cadencia: cuantos toques antes de que conteste quien iba a contestar.
    med_toques = _mediana(toques_hasta_responder)
    prop_cad = ""
    if len(toques_hasta_responder) >= MINIMO_POR_TIPO_LAZO3:
        prop_cad = (f"de {len(toques_hasta_responder)} cuentas que contestaron, la "
                    f"mediana contesto en el toque {med_toques:g}, y el maximo "
                    f"observado fue el {max(toques_hasta_responder)}. Los toques "
                    "de mas alla de ese maximo nunca han producido una respuesta")
    elif toques_hasta_responder:
        prop_cad = (f"{len(toques_hasta_responder)} cuentas contestaron. Faltan "
                    f"{MINIMO_POR_TIPO_LAZO3 - len(toques_hasta_responder)}")
    compuertas.append(Compuerta(
        "toques_antes_de_caducar", len(toques_hasta_responder),
        MINIMO_POR_TIPO_LAZO3, "metodo/motor3-ciclo-y-aprendizaje.md",
        "la tabla de cadencia por canal", prop_cad))

    return {
        "lazo": 3, "nombre": "al motor 3 mismo",
        "pregunta": "cuando y por que canal se toca",
        "destinos": ["flujo/importacion_odoo.py"],
        "cierres_leidos": len(cierres),
        "por_tipo": {t: dict(d) | {"mediana_dias": _mediana(d["dias"])}
                     for t, d in sorted(por_tipo.items())},
        "toques_hasta_responder": toques_hasta_responder,
        "compuertas": [x.a_dict() for x in compuertas],
        "abren": [x.celda for x in compuertas if x.abre],
    }


# =============================================================================
# el expediente de un cierre, y los tres lazos juntos
# =============================================================================
def expediente_de_cierre(paquete: dict, destino: str, toques: list[dict],
                         convirtio: bool = False, motivo: str = "",
                         reaperturas: int = 0,
                         proceso_del_cliente: str = "",
                         tipo_de_proyecto_cotizado: str = "",
                         monto=None) -> dict:
    """El registro que se guarda cuando una tarjeta cierra. SIN INTERPRETAR.

    No lleva conclusiones -- ni "esta fuente sirve" ni "el plazo esta mal"--:
    lleva lo que paso. Las conclusiones las saca cada lazo despues, sobre muchos
    expedientes, y con su compuerta. Un registro que ya viene con la conclusion
    adentro no se puede reinterpretar cuando la regla cambie.

    NO LLEVA DATOS PERSONALES. Los toques traen canal, fecha, nivel de confianza
    y resultado; NO traen ni nombre ni correo. El expediente es lo que va a
    Postgres y lo que un dia se agrega: un nombre aqui es un nombre replicado en
    cada corte que alguien saque.
    """
    if destino not in DESTINOS:
        raise ValueError(
            f"Destino '{destino}' desconocido. Los tres del diseno: "
            + ", ".join(DESTINOS))
    limpios = []
    for i, t in enumerate(toques or [], 1):
        res = t.get("resultado")
        if res and res not in RESULTADOS_DE_TOQUE:
            raise ValueError(
                f"Resultado de toque '{res}' desconocido. Los que existen: "
                + ", ".join(RESULTADOS_DE_TOQUE))
        limpios.append({
            "n": t.get("n", i),
            "canal": t.get("canal"),
            "fecha": t.get("fecha"),
            "nivel_confianza_del_correo": t.get("nivel_confianza_del_correo"),
            "resultado": res,
        })
    primera = next((x for x in limpios
                    if x["resultado"] in CUENTAN_COMO_RESPUESTA), None)
    dias = None
    if primera and primera.get("fecha") and limpios and limpios[0].get("fecha"):
        try:
            a = datetime.fromisoformat(str(limpios[0]["fecha"])[:10])
            b = datetime.fromisoformat(str(primera["fecha"])[:10])
            dias = (b - a).days
        except ValueError:
            dias = None
    funciono = next((x["canal"] for x in limpios
                     if x["resultado"] in EL_CANAL_FUNCIONO), None)
    return {
        "version": 1,
        "emitido": datetime.now(timezone.utc).isoformat(),
        "de": "motor3_crm_odoo",
        "para": ["motor1_radar", "motor2_prospector", "motor3_crm_odoo"],
        "llave": paquete.get("llave_corrida"),
        "llave_de_reciclaje": paquete.get("llave_de_reciclaje"),
        "empresa": paquete.get("empresa"),
        "planta": paquete.get("planta"),
        # El expediente de la senal TAL COMO SE PUNTUO. Es la mitad del lazo 1.
        "senal_origen": dict(paquete.get("senal_origen") or {}),
        "chao1": dict(paquete.get("chao1") or {}),
        "toques": limpios,
        "dias_hasta_la_primera_respuesta": dias,
        "canal_que_funciono": funciono,
        "destino": destino,
        "motivo": motivo,
        "reaperturas_previas": reaperturas,
        "convirtio": bool(convirtio),
        "monto_si_hubo": monto,
        "proceso_del_cliente": proceso_del_cliente,
        "tipo_de_proyecto_cotizado": tipo_de_proyecto_cotizado,
        "sin_expediente_de_senal": not bool(paquete.get("senal_origen")),
    }


def los_tres_lazos(cierres: list[dict]) -> dict:
    """Los tres lazos sobre el mismo conjunto de cierres."""
    l1, l2, l3 = lazo1_radar(cierres), lazo2_motor2(cierres), lazo3_motor3(cierres)
    sin_expediente = [t.get("llave") for t in cierres
                      if not (t.get("senal_origen") or {}).get("fuente")]
    return {
        "version": 1,
        "emitido": datetime.now(timezone.utc).isoformat(),
        "cierres_leidos": len(cierres),
        # Las tarjetas que no traen fuente NO cuentan para el lazo 1 ni el 3, y
        # decirlo importa: un tablero que muestra "8 cierres" cuando 5 no pueden
        # ensenar nada hace creer que el aprendizaje avanza mas rapido de lo que
        # avanza.
        "cierres_sin_expediente_de_senal": len(sin_expediente),
        "cuentas_por_regenerar": sin_expediente,
        "lazos": [l1, l2, l3],
        "compuertas_que_abren": (l1["abren"] + l2["abren"] + l3["abren"]),
        "nada_se_movio_solo": (
            "Este reporte NO cambio ninguna constante. Dice que se moveria y con "
            "que cuenta, para que una persona lo apruebe. Un evaluador que se "
            "reajusta solo es un evaluador que nadie puede auditar, y su puntaje "
            "decide si se gastan 60 consultas por cuenta."),
    }


def escribir_reporte(cierres: list[dict], destino: str) -> str:
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(los_tres_lazos(cierres), f, ensure_ascii=False, indent=2)
    return destino
