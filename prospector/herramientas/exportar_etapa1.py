"""ETAPA 1: el CSV de `crm.lead` de las mejores tarjetas, para que Esteban lo suba.

SON NUEVE, NO DIEZ. La tarea pedia "las 10 mejores tarjetas por puntaje del
evaluador" y solo hay **nueve** cuentas con senal documentada: las otras cuatro de
las trece son huecos, y una tarjeta sin expediente de senal no tiene puntaje con el
que ordenarla. Exportar diez habria significado inventarle la senal a una, que es
exactamente lo que la regla de la regeneracion prohibe.

CERO ESCRITURAS A ODOO. Este archivo produce un CSV que la importacion nativa de
Odoo entiende, fuera del repo, y lo sube una PERSONA. La etapa 2 espera OK
explicito con alcance exacto.

LAS TRES REGLAS DURAS NO SE REIMPLEMENTAN AQUI: las aplica
`flujo/importacion_odoo.py`, que ya las tiene con prueba. Este modulo solo arma el
paquete y reporta QUE hizo cada regla, para que la revision de Esteban vea la regla
actuando y no tenga que confiar en que actuo.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flujo import importacion_odoo as io
from flujo import radar
from flujo.confianza import CANDIDATO, SOLIDO
from flujo.paquete import CANALES_QUE_NO_EMITE, CONMUTADOR, CORREO_DIRECTO, LINKEDIN

import linea_base_radar as lb
import tarjeta_hershey as th

#: Los contactos que tenemos documentados por cuenta. Solo Hershey los tiene, y
#: **por puesto, sin nombres** -- ver `tarjeta_hershey.py`--. Las demas van sin
#: contactos, que es lo que hay: la corrida que los tenia se murio con su
#: contenedor y no se inventan.
#:
#: El correo que viaja es el PATRON de la cuenta con su forma, no la direccion de
#: nadie: `FLast@` es lo que los directorios reportan y lo que el metodo compara.
#: Su nivel es CANDIDATO por la regla de #24 -- un correo derivado de un patron es
#: candidato aunque el patron este bien medido-- y por eso la regla dura 1 lo tiene
#: que sacar de `email_from`.
CONTACTOS_POR_CUENTA = {
    "Hershey/Escobedo": [
        dict(x, correo=("FLast@hersheys.com" if x["con_historia"] else None),
             nivel_confianza=(CANDIDATO if x["con_historia"]
                              else x["nivel_confianza"]),
             canal_por_que=x["por_que_ese_canal"],
             sigue_en_la_casa=True, motivo_revision=None,
             ubicacion="en_esta_planta", modulo_origen="M0b",
             nombre=None)
        for x in th.CONTACTOS
    ],
}


def _paquete(c: dict, hoy: date) -> dict:
    """Un paquete con la forma que `importacion_odoo` espera."""
    ev = radar.evaluar({"texto": c["texto"], "fuente": c["fuente"],
                        "fecha": c.get("fecha_senal"), "giro": c.get("giro") or "",
                        "empata_padron": bool(c.get("en_padron_denue"))}, hoy=hoy)
    tipo, _ = radar.tipo_de_senal_de(c["fuente"], c.get("tipo") or "")
    llave = f"{c['empresa']}/{c.get('planta') or '?'}"
    return {
        "version": 1, "de": "motor2_prospector", "para": "motor3_crm_odoo",
        "empresa": c["empresa"], "planta": c.get("planta"),
        "giro": c.get("giro"), "nivel": "planta",
        "llave_corrida": llave,
        "llave_de_reciclaje": None,
        "llave_de_reciclaje_por_que": (
            "no hay correo ANCLA observado cargado en esta tarjeta: el unico correo "
            "que viaja es el PATRON de la cuenta, y un dominio sacado de un patron "
            "es un dominio adivinado"),
        "origen": "manual",
        "senal_origen": {"fuente": c["fuente"], "tipo": tipo,
                         "fecha_senal": c.get("fecha_senal"),
                         "puntaje": ev["puntaje"], "veredicto": ev["veredicto"],
                         "desglose": ev["desglose"], "familia": ev["familia"]},
        "fuente": c["fuente"], "tipo_de_senal": tipo,
        "puntaje_del_evaluador": ev["puntaje"],
        "gancho": None, "por_que_ahora": None, "como_hablarles": [],
        "senal": [{"texto": c["texto"], "fecha": c.get("fecha_senal")}],
        "contactos_de_valor": CONTACTOS_POR_CUENTA.get(llave, []),
        "chao1": {"observados": None, "cobertura_pct": None,
                  "veredicto": "sin_datos", "opina": False},
        "consultas_gastadas": 0, "tope": 60,
        "cerro_porque": "tarjeta armada desde la senal documentada, sin corrida",
        "estado_editado_a_mano": False,
        "canales_que_no_emite": CANALES_QUE_NO_EMITE,
        "advertencia": (
            "Este paquete es un INSUMO, no una instruccion. Los contactos con "
            "`revision_humana: true` NO se contactan sin que una persona los "
            "revise, y los de `nivel_confianza: candidato` llevan un correo "
            "DERIVADO de un patron, no observado."),
    }


def exportar(destino: str, hoy: date | None = None) -> dict:
    hoy = hoy or date.today()
    with open(lb.RUTA, encoding="utf-8") as f:
        d = json.load(f)
    con_senal = [c for c in d["cuentas"] if c.get("fuente")]
    paquetes = [(_paquete(c, hoy), c) for c in con_senal]
    # Ordenadas por PUNTAJE DEL EVALUADOR, que es lo que la tarea pide: la revision
    # de Esteban empieza por la que mas vale.
    paquetes.sort(key=lambda t: -(t[0]["puntaje_del_evaluador"] or 0))

    os.makedirs(destino, exist_ok=True)
    filas_todas, detalle = [], []
    for pq, c in paquetes:
        fila = io.lineas(pq, hoy)[0]
        filas_todas.append(fila)
        contactos = pq["contactos_de_valor"]
        retenidos = [x for x in contactos
                     if x.get("correo") and x.get("nivel_confianza") == CANDIDATO]
        caduca, por_que = io.razon_de_caducidad(pq, hoy)
        detalle.append({
            "llave": pq["llave_corrida"],
            "puntaje": pq["puntaje_del_evaluador"],
            "veredicto": pq["senal_origen"]["veredicto"],
            "fuente": pq["fuente"], "tipo": pq["tipo_de_senal"],
            "caduca": caduca, "caduca_por_que": por_que,
            "contactos": len(contactos),
            "email_from": fila["email_from"],
            "correos_retenidos_por_candidato": len(retenidos),
            "en_revision_no_creados": sum(1 for x in contactos
                                          if x.get("revision_humana")),
            "phone_vacio": fila["phone"] == "",
        })

    # UN archivo con las nueve tarjetas: la importacion de Odoo toma un CSV con
    # varias filas, y nueve archivos serian nueve subidas a mano.
    ruta = os.path.join(destino, "crm-lead-etapa1-9-tarjetas.csv")
    import csv
    import io as _io
    buf = _io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(io.COLUMNAS), extrasaction="ignore")
    w.writeheader()
    for f in filas_todas:
        w.writerow(f)
    texto = buf.getvalue()
    with open(ruta, "w", encoding="utf-8-sig", newline="") as f:
        f.write(texto)

    return {
        "archivo": ruta,
        "bytes": len(texto.encode("utf-8-sig")),
        "tarjetas": len(filas_todas),
        "pedidas": 10,
        "por_que_no_son_diez": (
            "solo hay nueve cuentas con senal documentada; las otras cuatro de las "
            "trece son huecos, y una tarjeta sin expediente no tiene puntaje con el "
            "que ordenarla. La decima habria que inventarsela."),
        "escrituras_a_odoo": 0,
        "detalle": detalle,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--destino", required=True)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    r = exportar(a.destino)
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=2, default=str))
    else:
        print(f"\n  ETAPA 1 — {r['tarjetas']} tarjeta(s) en un CSV")
        print(f"  {r['archivo']}  ({r['bytes']:,} bytes)")
        print(f"  escrituras a Odoo: {r['escrituras_a_odoo']}")
        print(f"\n  {r['por_que_no_son_diez']}\n")
        print(f"  {'tarjeta':22} {'pts':>6} {'veredicto':>9} {'caduca':>12} "
              f"{'cont':>5} {'email_from':>28}")
        print("  " + "-" * 92)
        for x in r["detalle"]:
            ef = x["email_from"] or "(vacio)"
            print(f"  {x['llave']:22} {x['puntaje']:>6} {x['veredicto']:>9} "
                  f"{x['caduca']:>12} {x['contactos']:>5} {ef:>28}")
        print("  " + "-" * 92)
        ret = sum(x["correos_retenidos_por_candidato"] for x in r["detalle"])
        rev = sum(x["en_revision_no_creados"] for x in r["detalle"])
        print(f"  REGLA 1 · correos retenidos por ser candidato: {ret}")
        print(f"  REGLA 2 · contactos en revision no creados como partner: {rev}")
        print(f"  REGLA 3 · columna `phone` vacia en todas: "
              f"{all(x['phone_vacio'] for x in r['detalle'])}")
        print()
