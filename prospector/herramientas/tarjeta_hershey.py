"""La tarjeta que abre el ciclo: Hershey Escobedo, caso 1 del piloto.

POR QUE ESTA CUENTA Y NO OTRA. Es la unica de las nueve cuya senal viene de
`correo_propio` -- el cliente diciendolo por escrito en el buzon de FTS-- que es la
fuente mas fuerte del catalogo (25 de 25). Puntua **83**, la mas alta de la linea
base, y con margen sobre `pasa`. Si el piloto va a fallar por algo, no va a ser
porque la primera tarjeta fuera debil.

SIN NOMBRES, Y NO ES PRUDENCIA EXCESIVA. Los contactos de Hershey vivieron en una
corrida que se murio con su contenedor, y **no los voy a inventar**: un nombre
inventado en la tarjeta que abre el piloto es un nombre que Rissia va a marcar. Lo
que si esta documentado y si viaja: los PUESTOS, el patron de correo con su nivel,
y el canal que le toca a cada uno. Un puesto no es un dato personal, y la cadencia
se programa por puesto y canal -- quien es va en la tabla de personas, que en la
semana 2 llena Esteban con lo que tenga a la vista--.

EL PATRON DE CORREO de esta cuenta esta medido: cuatro fuentes, tres contra una,
Outlook vio el literal, y se informa `FLast@` **con salvedad**
(`metodo/busqueda-encadenada-contactos.md`). Un patron con salvedad es nivel
`solido`, no `confirmado`, y por eso el correo de esta cuenta NO va en `email_from`
de nadie hasta que se confirme uno literal.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flujo import importacion_odoo as io
from flujo import radar
from flujo.cadencia import (CONMUTADOR, CORREO_DIRECTO, LINKEDIN,
                            actividad_de_refinar_ficha, plan_de_la_tarjeta)

#: El expediente de la senal, con las tres piezas que la documentan.
SENAL = {
    "fuente": "correo_propio",
    "tipo": "necesidad_declarada",
    "fecha_senal": "2026-09-24",
    "texto": ("hilo vivo en el buzon de FTS sobre molinos; NDA firmado con la "
              "cuenta; vacantes tecnicas de mantenimiento abiertas en la planta"),
    "giro": "confiteria y chocolate; alimentos",
    "en_padron_denue": True,
    "por_que_esta_fuente": (
        "Las tres piezas apuntan a la misma fuente y la mas fuerte manda. El NDA y "
        "las vacantes son CONTEXTO que sostiene el momento; el hilo vivo es el "
        "cliente diciendolo POR ESCRITO en nuestro propio buzon, que es "
        "`correo_propio` y vale 25 de 25. Declararla como `vacante_tecnica` (16) "
        "por las vacantes seria subvaluar la evidencia mas fuerte que hay."),
    "por_que_este_tipo": (
        "`necesidad_declarada`: alguien de la cuenta dijo por escrito que va a "
        "necesitar algo. NO es `obra_nueva` -- no hay planta nueva anunciada-- ni "
        "`vacante_tecnica`, que describiria el contexto y no el hecho. El tipo "
        "gobierna el reloj: 90 dias desde el 24-sep."),
    "el_cruce_que_la_sostiene": (
        "C7 del §5: inversion o necesidad anunciada MAS vacantes abiertas del area "
        "= la obra va adelante del equipo. Aqui el cruce es hilo vivo + vacantes "
        "de mantenimiento, y dice que la planta ya sabe que le falta capacidad de "
        "mantenimiento para lo que viene."),
}

#: Los contactos, POR PUESTO. El nivel es del patron de correo medido, no inventado.
CONTACTOS = [
    {
        "puesto": "Gerente de Mantenimiento",
        "cercania_decision": 6,
        "canal_recomendado": CORREO_DIRECTO,
        "con_historia": True,
        "nivel_confianza": "solido",
        "por_que_ese_canal": (
            "hay historia: el hilo de molinos esta en el buzon de FTS, asi que "
            "este no es un primer toque frio. Espera de 5 dias habiles y no de 7."),
        "por_que_ese_nivel": (
            "el patron de la cuenta se midio con cuatro fuentes, tres contra una, "
            "y se informa `FLast@` CON SALVEDAD. Un patron con salvedad es "
            "`solido`, no `confirmado`."),
        "revision_humana": False,
    },
    {
        "puesto": "Jefe de Servicios Auxiliares",
        "cercania_decision": 10,
        "canal_recomendado": CORREO_DIRECTO,
        "con_historia": True,
        "nivel_confianza": "solido",
        "por_que_ese_canal": "misma cuenta y mismo hilo: tampoco es un toque frio.",
        "por_que_ese_nivel": "el mismo patron de la cuenta, con la misma salvedad.",
        "revision_humana": False,
    },
    {
        "puesto": "Plant Manager",
        "cercania_decision": 8,
        "canal_recomendado": LINKEDIN,
        "con_historia": False,
        "nivel_confianza": "candidato",
        "por_que_ese_canal": (
            "no hay correo observado de este puesto: el que habria seria derivado "
            "del patron. LinkedIn como REFUERZO, no como primer toque."),
        "por_que_ese_nivel": (
            "candidato: derivado del patron y sin ancla. Su correo NO va en "
            "`email_from` — de ahi salen los envios de Odoo."),
        "revision_humana": False,
    },
    {
        "puesto": "Comprador de mantenimiento y refacciones",
        "cercania_decision": 16,
        "canal_recomendado": CONMUTADOR,
        "con_historia": False,
        "nivel_confianza": "candidato",
        "por_que_ese_canal": (
            "hay puesto y planta y no hay nombre: se llama a la planta y se pide "
            "al puesto por su titulo."),
        "por_que_ese_nivel": "candidato: no hay nada observado de esta persona.",
        "revision_humana": False,
    },
]


def armar(sube_el: date | None = None, hoy: date | None = None) -> dict:
    hoy = hoy or date.today()
    sube_el = sube_el or hoy
    ev = radar.evaluar({"texto": SENAL["texto"], "fuente": SENAL["fuente"],
                        "fecha": SENAL["fecha_senal"], "giro": SENAL["giro"],
                        "empata_padron": SENAL["en_padron_denue"]}, hoy=hoy)
    paquete = {"senal_origen": {k: SENAL[k] for k in
                                ("fuente", "tipo", "fecha_senal")}}
    caduca, por_que = io.razon_de_caducidad(paquete, hoy)
    cad = plan_de_la_tarjeta(CONTACTOS, sube_el, date.fromisoformat(caduca))
    return {
        "empresa": "Hershey", "planta": "Escobedo",
        "giro": SENAL["giro"],
        "tipo_de_tarjeta": "lead",
        "senal": dict(SENAL, puntaje=ev["puntaje"], veredicto=ev["veredicto"],
                      desglose=ev["desglose"], familia=ev["familia"]),
        "caduca_el": caduca, "caduca_por_que": por_que,
        "contactos": CONTACTOS,
        "cadencia": cad,
        "actividad_que_abre": actividad_de_refinar_ficha("Pablo", sube_el),
        "reglas_duras": [
            "Los correos de nivel `candidato` NO van en `email_from`: de ahi salen "
            "los envios de Odoo, y un correo derivado de un patron es un rebote "
            "con el dominio de FTS o un correo a la persona equivocada. Van al "
            "lognote con su nivel escrito.",
            "Ningun contacto de esta tarjeta esta en revision humana, asi que los "
            "cuatro entran a la cadencia. Si alguno lo estuviera, NO se crearia "
            "como partner ni se le programaria un toque.",
            "No hay columna de celular, y no la va a haber.",
        ],
        "sin_nombres_por_que": (
            "Los contactos de esta cuenta vivieron en una corrida que se murio con "
            "su contenedor, y no se inventan: un nombre inventado en la tarjeta que "
            "abre el piloto es un nombre que Rissia va a marcar. Los PUESTOS, el "
            "patron con su nivel y el canal de cada uno si estan documentados, y "
            "con eso la cadencia se programa completa. Los nombres los pone Esteban "
            "en la semana 2, con lo que tenga a la vista."),
    }


def imprimir(t: dict) -> None:
    s = t["senal"]
    print(f"\n  TARJETA 1 DEL PILOTO — {t['empresa']} · {t['planta']}")
    print(f"  tipo `lead`, no `opportunity`\n")
    print(f"  SENAL · {s['fuente']} / {s['tipo']} · {s['fecha_senal']}")
    print(f"     {s['texto']}")
    print(f"     puntaje {s['puntaje']} -> {s['veredicto'].upper()}   "
          f"{json.dumps(s['desglose'])}")
    print(f"     caduca {t['caduca_el']} — {t['caduca_por_que']}")
    print(f"\n  CONTACTOS ({len(t['contactos'])}, por puesto — sin nombres)")
    for x in t["contactos"]:
        print(f"     · {x['puesto']:44} {x['nivel_confianza']:10} "
              f"{x['canal_recomendado']}")
    print(f"\n  CADENCIA — {t['cadencia']['toques_totales']} toques, "
          f"arranca {t['cadencia']['arranque']}, ultimo "
          f"{t['cadencia']['ultimo_toque']}")
    for p in t["cadencia"]["plan"]:
        fechas = " · ".join(f"#{x['n']} {x['fecha']}" for x in p["toques"])
        print(f"     {p['puesto'][:40]:42} {p['canal']:15} {fechas}")
        if p["comprimida"]:
            print(f"        ⚠ {p['nota']}")
    for a in t["cadencia"]["avisos"]:
        print(f"     ⚠ {a}")
    act = t["actividad_que_abre"]
    print(f"\n  ACTIVIDAD QUE ABRE EL CICLO")
    print(f"     «{act['tipo']}» para {act['para']} · arranca {act['arranca']} · "
          f"VENCE {act['vence']} ({act['habiles']} dias habiles)")
    print(f"     {act['por_que']}")
    print(f"\n  REGLAS DURAS")
    for r in t["reglas_duras"]:
        print(f"     · {r}")
    print(f"\n  {t['sin_nombres_por_que']}\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sube-el", default="", dest="sube_el",
                    help="la fecha en que Esteban sube la tarjeta (AAAA-MM-DD). "
                         "La fecha limite de «Refinar ficha» se cuenta desde aqui")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    sube = date.fromisoformat(a.sube_el) if a.sube_el else None
    t = armar(sube_el=sube)
    print(json.dumps(t, ensure_ascii=False, indent=2) if a.json else "", end="")
    if not a.json:
        imprimir(t)
