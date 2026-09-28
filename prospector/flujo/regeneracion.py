"""Que cuentas ya evaluadas hay que regenerar, y por que exactamente.

EL PROBLEMA, en una linea: las cuentas que se evaluaron antes de #325 no traen
expediente de senal, y sin el no pueden ensenarle nada a los lazos 1 y 3.

Y NO ES UN PROBLEMA DE LA FICHA. La ficha de esas cuentas esta bien: tiene el
gancho, los contactos, el Chao1 y el aviso. Lo que falta es el dato que hace
POSIBLE APRENDER de ellas cuando su tarjeta cierre -- la fuente que las origino,
su tipo y el puntaje con que se decidio gastar 60 consultas--. Una cuenta sin eso
se puede trabajar perfectamente; lo que no se puede es medir si valio la pena.

POR ESO LA REGENERACION NO ES "CORRER TODO OTRA VEZ". Hay tres niveles de arreglo
y cuestan cosas muy distintas:

  NIVEL 1 · DECLARAR  -- gratis, cero consultas, un comando.
      La fuente y el tipo los sabe el operador: se acuerda de donde salio la
      cuenta. `./prospector senal --fuente ... --tipo ...` y listo.
      El puntaje queda sin llenar y la cuenta ya sirve para el lazo 1 parcial
      (conversion por fuente) y para el lazo 3 completo (plazos por tipo).

  NIVEL 2 · REEVALUAR  -- gratis, cero consultas de red.
      Si se conserva el texto de la senal, `radar.evaluar()` lo puntua sin salir
      a internet: el evaluador lee el catalogo local. El puntaje que sale NO es
      el que se uso el dia de la corrida -- la frescura cambio-- y eso tiene que
      quedar escrito, porque el lazo 1 compara el desenlace contra la decision
      que se tomo. Un puntaje reevaluado sirve para los pesos por familia y NO
      para la curva de frescura.

  NIVEL 3 · VOLVER A CORRER  -- 60 consultas y horario fuera de produccion.
      Solo cuando no hay ni texto de senal. Es el caso caro y es el mas raro.

LA REGLA DE ORO DE ESTE ARCHIVO: **no borrar la ficha vieja.** Una cuenta
regenerada tiene que poder compararse contra lo que dijo antes; si la nueva dice
otra cosa, eso es un hallazgo, no un accidente que nadie noto.
"""
from __future__ import annotations
import json
import os

NIVEL_DECLARAR = "declarar"
NIVEL_REEVALUAR = "reevaluar"
NIVEL_VOLVER_A_CORRER = "volver_a_correr"
NIVEL_NADA = "ya_esta_completa"

#: Que tan caro es cada nivel, para poder ordenar el trabajo por lo barato.
COSTO = {
    NIVEL_NADA: (0, "nada que hacer"),
    NIVEL_DECLARAR: (0, "cero consultas: el operador declara lo que ya sabe"),
    NIVEL_REEVALUAR: (0, "cero consultas de red: el evaluador lee el catalogo "
                         "local"),
    NIVEL_VOLVER_A_CORRER: (60, "hasta 60 consultas, y solo fuera de horario de "
                                "produccion"),
}


def diagnosticar(d: dict) -> dict:
    """Que le falta a ESTA corrida, leida de su JSON. No la modifica.

    Se le pasa el diccionario del estado y no una `Corrida` a proposito: asi se
    puede diagnosticar una corrida vieja sin cargarla -- cargarla corre
    migraciones y el diagnostico dejaria de reflejar el archivo tal como esta--.
    """
    sen = d.get("senal_origen") or {}
    faltas, para_que = [], []

    if not sen.get("fuente"):
        faltas.append("la FUENTE de la senal")
        para_que.append("el lazo 1 no puede atribuirle el desenlace a nada: el "
                        "peso de fuerza de fuente se queda siendo una hipotesis")
    if not sen.get("tipo"):
        faltas.append("el TIPO de senal")
        para_que.append("el reloj de caducidad cae al plazo por omision, asi que "
                        "el plazo de esta tarjeta no significa nada, y el lazo 3 "
                        "no tiene con que comparar lo que tardo")
    if sen.get("puntaje") is None:
        faltas.append("el PUNTAJE del evaluador")
        para_que.append("no se puede saber con que numero se decidio gastar las "
                        "consultas, asi que los pesos por familia y la curva de "
                        "frescura no se pueden corregir con esta cuenta")
    if not sen.get("fecha_senal"):
        faltas.append("la FECHA de la senal")
        para_que.append("el reloj arranca en hoy y le regala a una senal vieja la "
                        "misma ventana que a una fresca")

    # La llave de reciclaje no se DECLARA: se deriva de un correo ancla. Si la
    # cuenta no tiene ninguno, no hay nada que regenerar -- la respuesta correcta
    # es que no hay llave-- y el reciclaje se resuelve a mano.
    tiene_ancla = False
    for x in d.get("contactos") or []:
        for campo, dd in (x.get("datos") or {}).items():
            if campo != "correo":
                continue
            if dd.get("ancla_en_la_mayoria") or dd.get("anclas_en_la_mayoria"):
                tiene_ancla = True

    hay_texto = bool(sen.get("texto")) or bool(d.get("senal")) or bool(d.get("angulo"))

    if not faltas:
        nivel = NIVEL_NADA
    elif faltas == ["el PUNTAJE del evaluador"] and hay_texto:
        nivel = NIVEL_REEVALUAR
    elif hay_texto or not any("FUENTE" in f for f in faltas):
        # Con texto de senal guardado, declarar fuente y tipo alcanza, y el
        # puntaje se puede reevaluar en la misma pasada.
        nivel = NIVEL_DECLARAR
    else:
        nivel = NIVEL_VOLVER_A_CORRER

    return {
        "llave": (f"{d.get('empresa')}/{d.get('ciudad') or '?'}"),
        "empresa": d.get("empresa"),
        "planta": d.get("ciudad"),
        "origen": d.get("origen"),
        "senal_guardada": list(d.get("senal") or [])[:1],
        "angulo": d.get("angulo") or None,
        "le_falta": faltas,
        "que_se_pierde": para_que,
        "nivel": nivel,
        "consultas": COSTO[nivel][0],
        "costo": COSTO[nivel][1],
        "tiene_correo_ancla": tiene_ancla,
        "llave_de_reciclaje_posible": tiene_ancla,
        "contactos": len(d.get("contactos") or []),
        "fichas_emitidas": len(d.get("fichas_emitidas") or []),
    }


def comando_para(dg: dict) -> str:
    """La linea exacta que arregla esta cuenta. Sin adivinar la fuente."""
    emp = dg["empresa"]
    ciu = f" --ciudad {dg['planta']!r}" if dg.get("planta") else ""
    if dg["nivel"] == NIVEL_NADA:
        return ""
    if dg["nivel"] == NIVEL_VOLVER_A_CORRER:
        return (f"./prospector prospecta --empresa {emp!r}{ciu}   "
                "# 60 consultas, FUERA de horario de produccion")
    # La fuente NO se adivina: se deja el hueco marcado para que el operador la
    # ponga. Poner una fuente probable aqui seria inventar la procedencia de la
    # cuenta, que es el error mas caro que este proyecto puede cometer.
    return (f"./prospector senal --empresa {emp!r}{ciu} "
            f"--fuente '<correo_propio|prensa_industrial|convocatoria|...>' "
            f"--fecha-senal '<AAAA-MM-DD>' --reevaluar")


def plan(corridas: list[dict]) -> dict:
    """El plan completo, ordenado por lo BARATO primero.

    El orden importa: las de nivel 1 se arreglan en una sesion sin gastar una
    sola consulta, y con eso el lazo 3 ya queda completo para ellas. Empezar por
    las caras dejaria el aprendizaje esperando el presupuesto.
    """
    dgs = [diagnosticar(d) for d in corridas]
    orden = {NIVEL_DECLARAR: 0, NIVEL_REEVALUAR: 1, NIVEL_VOLVER_A_CORRER: 2,
             NIVEL_NADA: 3}
    dgs.sort(key=lambda x: (orden[x["nivel"]], x["llave"]))
    por_nivel: dict[str, int] = {}
    for x in dgs:
        por_nivel[x["nivel"]] = por_nivel.get(x["nivel"], 0) + 1
    return {
        "cuentas": len(dgs),
        "por_nivel": por_nivel,
        "consultas_totales": sum(x["consultas"] for x in dgs),
        "completas": [x["llave"] for x in dgs if x["nivel"] == NIVEL_NADA],
        "detalle": dgs,
        "regla": ("No se borra la ficha vieja. Una cuenta regenerada tiene que "
                  "poder compararse contra lo que dijo antes; si la nueva dice "
                  "otra cosa, eso es un hallazgo."),
    }


def leer(rutas: list[str]) -> list[dict]:
    fuera = []
    for r in rutas:
        try:
            with open(r, encoding="utf-8") as f:
                fuera.append(json.load(f))
        except (OSError, json.JSONDecodeError):
            continue
    return fuera
