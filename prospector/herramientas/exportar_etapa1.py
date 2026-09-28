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


# ===================================================== D9 · el filtro de la etapa 1
# APROBADA en #335. Una tarjeta que el radar manda ARCHIVAR no deberia llegar a Odoo
# como lead: si llega, el embudo se llena de cuentas que el propio evaluador dijo que
# no valian, y la primera vez que alguien las trabaje va a aprender que el puntaje no
# significa nada.
#
# Las `archiva` NO se tiran: van a un segundo archivo marcado. La razon es la misma
# por la que una tarjeta caducada se archiva y no se borra -- el historial es lo que
# hace posible el reciclaje-- y ademas son el material del lazo 1: si una `archiva`
# hubiera convertido, eso es justo lo que el evaluador tiene que aprender.
VEREDICTOS_QUE_SE_SUBEN = (radar.PASA, radar.GUARDA)

# Y EL VEREDICTO NO ALCANZA: TAMBIEN HAY QUE MIRAR EL RELOJ (#340).
#
# Salio al regenerar los CSV con las fechas puestas. El filtro de D9 mira solo el
# veredicto, asi que Coficab/Durango -- `pasa`, 76.4, el segundo mejor puntaje-- y
# Bimbo -- `guarda`-- caian en el archivo de SUBIR con su `date_deadline` YA VENCIDO:
# 7-abr-2026 y 14-nov-2025. Subir eso a Odoo es crear dos leads que nacen atrasados,
# y la actividad que se les programe va a salir en rojo el primer dia.
#
# Es el MISMO caso que la opcion C resolvio en la base -- `vencida_sin_trabajar`-- y
# la coherencia importa: si en Postgres una tarjeta vencida no entra a los lazos ni
# ocupa el lugar de la cuenta, en el CSV tampoco puede entrar como trabajo vivo.
#
# NO SE TIRAN, y esto es lo importante: Durango es una senal buena con la ventana
# cerrada. Van a un TERCER archivo cuyo nombre dice que hay que decidir, porque
# reabrirla es una decision de persona y lleva la caducidad recalculada desde hoy.
def ya_vencida(caduca: str, hoy: date) -> bool:
    return str(caduca)[:10] < hoy.isoformat()


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
    filas_suben, filas_archiva, filas_vencidas, detalle = [], [], [], []
    for pq, c in paquetes:
        fila = io.lineas(pq, hoy)[0]
        veredicto = pq["senal_origen"]["veredicto"]
        caduca_, por_que_ = io.razon_de_caducidad(pq, hoy)
        vencida = ya_vencida(caduca_, hoy)
        if veredicto not in VEREDICTOS_QUE_SE_SUBEN:
            filas_archiva.append(fila)
        elif vencida:
            filas_vencidas.append(fila)
        else:
            filas_suben.append(fila)
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
            "ya_vencida": vencida,
            "se_sube": (veredicto in VEREDICTOS_QUE_SE_SUBEN and not vencida),
            "por_que_no_se_sube": (
                "" if veredicto in VEREDICTOS_QUE_SE_SUBEN and not vencida
                else f"veredicto `{veredicto}`" if not vencida
                else f"su senal YA CADUCO el {caduca_}: subirla crearia un lead "
                     "que nace atrasado. Decidir si se reabre, con la caducidad "
                     "recalculada desde hoy"),
        })

    # DOS archivos, y el nombre de cada uno dice lo que hay que hacer con el. Un
    # archivo llamado "etapa1.csv" con nueve filas de las que seis no se deben subir
    # es una trampa: quien lo abra a las 9 de la manana lo va a subir completo.
    import csv
    import io as _io

    def _csv(filas):
        buf = _io.StringIO()
        w = csv.DictWriter(buf, fieldnames=list(io.COLUMNAS),
                           extrasaction="ignore")
        w.writeheader()
        for f in filas:
            w.writerow(f)
        return buf.getvalue()

    archivos = []
    for filas, nombre, que_es in (
            (filas_suben,
             f"crm-lead-etapa1-{len(filas_suben)}-tarjetas-REVISAR-y-subir.csv",
             "pasa + guarda: estas si se suben, despues de revisarlas"),
            (filas_vencidas,
             f"crm-lead-etapa1-{len(filas_vencidas)}-tarjetas-VENCIDAS-decidir.csv",
             "pasa + guarda pero su senal YA CADUCO. NO se suben tal cual: su "
             "`date_deadline` esta en el pasado y naceria un lead atrasado. Lo que "
             "hay que decidir es si se reabren, y entonces la caducidad se "
             "recalcula desde hoy y queda escrito que se reabrio vencida"),
            (filas_archiva,
             f"crm-lead-etapa1-{len(filas_archiva)}-tarjetas-archiva-NO-subir.csv",
             "archiva: referencia, NO se suben. Son material del lazo 1 -- si una "
             "hubiera convertido, eso es lo que el evaluador tiene que aprender--")):
        if not filas:
            continue
        ruta = os.path.join(destino, nombre)
        texto = _csv(filas)
        with open(ruta, "w", encoding="utf-8-sig", newline="") as f:
            f.write(texto)
        archivos.append({"archivo": ruta, "nombre": nombre,
                         "bytes": len(texto.encode("utf-8-sig")),
                         "tarjetas": len(filas), "que_es": que_es})

    return {
        "archivos": archivos,
        "tarjetas_totales": (len(filas_suben) + len(filas_vencidas)
                             + len(filas_archiva)),
        "se_suben": len(filas_suben),
        "vencidas": len(filas_vencidas),
        "no_se_suben": len(filas_archiva) + len(filas_vencidas),
        "filtro": (f"D9: solo {' y '.join(VEREDICTOS_QUE_SE_SUBEN)} se suben a "
                   "Odoo, Y SOLO si su senal no caduco todavia. Las `archiva` y las "
                   "vencidas van a archivos marcados, no se tiran: las primeras son "
                   "material del lazo 1 y las segundas son decisiones de persona"),
        "cuantas_cuentas": (
            "Diez cuentas con senal documentada de las trece, y tres huecos. Eran "
            "nueve y cuatro hasta el 28-sep: International dejo de ser hueco porque "
            "sus 120 MDD llevaban documentados desde el 18-sep y el barrido los "
            "perdio buscando «International» donde el repo dice «Navistar». Una "
            "tarjeta sin expediente no tiene puntaje con el que ordenarla, asi que "
            "los tres huecos no salen: habria que inventarles la senal."),
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
        print(f"\n  ETAPA 1 — {r['tarjetas_totales']} tarjeta(s) en "
              f"{len(r['archivos'])} archivo(s)")
        print(f"  {r['filtro']}")
        print(f"  escrituras a Odoo: {r['escrituras_a_odoo']}\n")
        for a_ in r["archivos"]:
            print(f"   · {a_['nombre']}  ({a_['bytes']:,} bytes, "
                  f"{a_['tarjetas']} tarjeta(s))")
            print(f"       {a_['que_es']}")
        print(f"\n  {r['cuantas_cuentas']}\n")
        print(f"  {'tarjeta':22} {'pts':>6} {'veredicto':>9} {'caduca':>12} "
              f"{'cont':>5} {'sube?':>6}  por que no")
        print("  " + "-" * 82)
        for x in r["detalle"]:
            print(f"  {x['llave']:22} {x['puntaje']:>6} {x['veredicto']:>9} "
                  f"{x['caduca']:>12} {x['contactos']:>5} "
                  f"{('SI' if x['se_sube'] else 'NO'):>6}  "
                  + ("SU SENAL YA CADUCO" if x["ya_vencida"] and not x["se_sube"]
                     else "" if x["se_sube"] else "veredicto `archiva`"))
        print("  " + "-" * 82)
        ret = sum(x["correos_retenidos_por_candidato"] for x in r["detalle"])
        rev = sum(x["en_revision_no_creados"] for x in r["detalle"])
        print(f"  REGLA 1 · correos retenidos por ser candidato: {ret}")
        print(f"  REGLA 2 · contactos en revision no creados como partner: {rev}")
        print(f"  REGLA 3 · columna `phone` vacia en todas: "
              f"{all(x['phone_vacio'] for x in r['detalle'])}")
        print()
