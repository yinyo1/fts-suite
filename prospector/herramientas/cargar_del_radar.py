"""Las primeras tarjetas que NACEN DEL RADAR y no de la mano de Esteban (#382, D5).

POR QUE ESTAS CINCO Y NO OTRAS. Son las de la corrida con la puerta del
USUARIO abierta hoy, menos las DESMENTIDAS: la planta ya inauguro y esta dentro de la ventana de 18 meses
en que compra lo que el EPC no alcanzo. Las de puerta de EPC no entran todavia --
ahi el interlocutor es el constructor y la mitad esta sin identificar-- y las de
licitacion publica tampoco, porque su ciclo no es una tarjeta de prospeccion. Y
de las seis con puerta de usuario, QSMX salio en #384: tenia la puerta abierta y
no es una planta que compre. Ver `desmentidas` y datos/no-son-prospectos.json.

LO QUE ESTAS TARJETAS TIENEN Y LAS DEL PILOTO NO: `origen = 'radar'` y la puerta por
la que se entra. No es etiqueta decorativa. El lazo 3 corrige los CRITERIOS del
radar -- la ventana de 18 meses, el tope de 24 meses de obra-- y solo puede hacerlo
con tarjetas cuyo criterio salio del radar. Una tarjeta que Esteban abrio a mano
cierra por razones que el radar nunca vio; mezclarlas ensucia la correccion.

LA CADENCIA NO ES LA DE SIEMPRE, y esta es la parte que importa. La caducidad por
omision de una senal de obra nueva son 120 dias contados desde la senal. Para la
puerta del usuario eso es al reves de la verdad: el valor de esta puerta SUBE con el
tiempo hasta el mes 18 y se cae despues. Asi que la tarjeta caduca cuando se cierra
la ventana del usuario -- 18 meses desde la inauguracion-- y no 120 dias despues de
la nota. Daikin lo hace evidente: su nota tiene 360 dias y por frescura normal esta
casi muerta, pero por la puerta del usuario le quedan seis meses de su mejor momento.

    python3 herramientas/cargar_del_radar.py            # dice que cargaria
    python3 herramientas/cargar_del_radar.py --cargar   # lo carga
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from datetime import date, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flujo import puertas as P                                      # noqa: E402
from flujo.base_motor3 import Base, SinPostgres, resumen_del_piloto  # noqa: E402

from sellar_constancia_puertas import CONSTANCIA                    # noqa: E402

PUERTA_QUE_ENTRA = P.PUERTA_USUARIO

# EL DESMENTIDO, Y POR QUE SE LEE AQUI (#384).
#
# La puerta abierta dice que la planta ESTA EN LA VENTANA en que compra. No dice
# que vaya a comprarle a FTS. QSMX tenia la puerta abierta y 93.1 de puntaje, y la
# corrida humana descubrio que no es una planta que compre: es una casa de
# servicios que vende lo mismo que FTS. Abrirle tarjeta habria puesto a la
# vendedora a prospectar a un competidor.
#
# La exclusion vive en un ARCHIVO y no en una lista aqui adentro a proposito: la
# siguiente va a aparecer, y cuando aparezca lo que hay que escribir es su razon,
# no una linea de codigo. Y el lazo 2 lee el mismo archivo para corregir el
# evaluador, que es donde el defecto de verdad esta.
NO_SON_PROSPECTOS = os.path.join(RAIZ, "datos", "no-son-prospectos.json")


def desmentidas(ruta: str | None = None) -> dict[str, dict]:
    """Las cuentas declaradas NO PROSPECTO, por empresa. Vacio si no hay archivo."""
    ruta = ruta or NO_SON_PROSPECTOS
    if not os.path.exists(ruta):
        return {}
    with open(ruta, encoding="utf-8") as f:
        d = json.load(f)
    return {c["empresa"]: c for c in d.get("cuentas", [])
            if c.get("sacada_del_piloto")}


def las_del_radar(constancia: dict | None = None,
                  fuera: dict[str, dict] | None = None) -> list[dict]:
    """Las senales de la corrida con la puerta del usuario ABIERTA, mas maduras
    primero -- que es el orden en que Esteban las mando a prospecta--, MENOS las
    desmentidas."""
    c = constancia or json.load(open(CONSTANCIA, encoding="utf-8"))
    fuera = desmentidas() if fuera is None else fuera
    salen = []
    for e in c["evaluadas"]:
        u = next((q for q in e["puertas"]["puertas"]
                  if q["puerta"] == PUERTA_QUE_ENTRA and q["estado"] == P.ABIERTA),
                 None)
        if u and e["empresa"] not in fuera:
            salen.append({"senal": e, "puerta": u})
    # mas madura primero: la que lleva mas meses desde la inauguracion
    salen.sort(key=lambda x: -(x["puerta"].get("meses_desde_la_inauguracion") or 0))
    return salen


def cadencia_de_la_puerta_del_usuario(puerta: dict) -> tuple[str, str]:
    """(caduca_el, caduca_por_que) desde la VENTANA DEL USUARIO, no desde la nota."""
    inauguracion = date.fromisoformat(puerta["inauguracion"])
    meses = puerta.get("meses_desde_la_inauguracion")
    cierra = inauguracion + timedelta(
        days=round(P.MESES_DE_LA_VENTANA_DEL_USUARIO * P.DIAS_POR_MES))
    return (cierra.isoformat(),
            f"la ventana de la puerta del usuario: {P.MESES_DE_LA_VENTANA_DEL_USUARIO} "
            f"meses desde la inauguracion del {inauguracion.isoformat()}, y la planta "
            f"lleva {meses} meses. NO son los 120 dias de la senal de obra nueva: para "
            f"esta puerta el valor SUBE con el tiempo hasta el mes "
            f"{P.MESES_DE_LA_VENTANA_DEL_USUARIO}. CRITERIO declarado por Esteban "
            f"(#382), confirmado el 2026-10-06, y el lazo 3 lo corrige")


def filas(hoy: date, constancia: dict | None = None) -> dict:
    """Las filas tal como van a la base, sin tocarla. Separado para poder probarlo."""
    cuentas, senales, tarjetas = [], [], []
    for i, x in enumerate(las_del_radar(constancia), start=1):
        s, u = x["senal"], x["puerta"]
        ev = s["eval"]
        cuentas.append({
            "llave_de_reciclaje": None,
            "llave_de_corrida": f"{s['empresa']}/{s.get('planta') or '?'}",
            "empresa": s["empresa"], "planta": s.get("planta"),
            "giro": s.get("giro"),
            "en_padron_denue": bool(s.get("empata_padron")),
            "usuario_odoo_id": None,
        })
        senales.append({
            "fuente": s["fuente"], "tipo": s.get("tipo_de_senal"),
            "texto": s["texto"],
            "fecha_senal": s.get("fecha"),
            "fecha_senal_precision": "dia",
            "fecha_senal_declarada": s.get("procedencia_fecha"),
            "fecha_de_cierre": None, "fecha_del_evento": None,
            "puntaje": ev["puntaje"], "veredicto": ev["veredicto"],
            "familia": ev["familia"],
            "empata_padron": bool(s.get("empata_padron")),
            "desglose": ev["desglose"],
            "evaluada": True,
            "origen": "radar",
            "puerta": PUERTA_QUE_ENTRA,
        })
        caduca, por_que = cadencia_de_la_puerta_del_usuario(u)
        # Una puerta de usuario ABIERTA no puede nacer vencida: su estado se calculo
        # con la misma ventana que fija la caducidad. Si alguna vez naciera vencida,
        # las dos cuentas estarian en desacuerdo y eso es un defecto, no un caso.
        tarjetas.append({
            "estado": "abierta",
            "caduca_el": caduca, "caduca_por_que": por_que,
            "caducidad_original": None, "reabierta_vencida": False,
            "reaperturas": 0, "odoo_lead_id": None,
        })
    return {"cuentas": cuentas, "senales": senales, "tarjetas": tarjetas}


def cargar(b: Base, hoy: date | None = None) -> dict:
    """Agrega las seis AL PILOTO YA CARGADO. No vuelve a aplicar el esquema: estas
    tarjetas conviven con las de la mano de Esteban, y distinguirlas es el punto."""
    hoy = hoy or date.today()
    f = filas(hoy)
    puestas = []
    for cu, se, ta in zip(f["cuentas"], f["senales"], f["tarjetas"]):
        cid = b.json("SELECT to_jsonb(id) FROM motor3.cuenta WHERE llave_de_corrida = "
                     f"{_lit(cu['llave_de_corrida'])};")
        if cid is None:
            b.cargar_json("motor3.cuenta", [cu])
            cid = b.json("SELECT to_jsonb(id) FROM motor3.cuenta WHERE "
                         f"llave_de_corrida = {_lit(cu['llave_de_corrida'])};")
        se = dict(se, cuenta_id=cid)
        b.cargar_json("motor3.senal", [se])
        sid = b.json("SELECT to_jsonb(max(id)) FROM motor3.senal WHERE cuenta_id = "
                     f"{cid};")
        b.cargar_json("motor3.tarjeta", [dict(ta, cuenta_id=cid, senal_id=sid)])
        tid = b.json("SELECT to_jsonb(max(id)) FROM motor3.tarjeta WHERE cuenta_id = "
                     f"{cid};")
        b.cargar_json("motor3.tarjeta_senal",
                      [{"tarjeta_id": tid, "senal_id": sid, "reabrio": False}])
        puestas.append({"llave": cu["llave_de_corrida"], "cuenta_id": cid,
                        "puntaje": se["puntaje"], "caduca": ta["caduca_el"]})
    return {"tarjetas_del_radar": puestas, "resumen": resumen_del_piloto(b)}


def _lit(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cargar", action="store_true")
    ap.add_argument("--socket", default=os.environ.get("MOTOR3_SOCKET", ""))
    ap.add_argument("--puerto", default=os.environ.get("MOTOR3_PUERTO", "5440"))
    a = ap.parse_args(argv)
    f = filas(date.today())
    print(f"  {len(f['cuentas'])} tarjeta(s) del radar, por puerta de usuario, "
          f"de mas madura a menos:")
    for cu, se, ta in zip(f["cuentas"], f["senales"], f["tarjetas"]):
        print(f"    · {cu['llave_de_corrida']:42} {se['puntaje']:>6} "
              f"{se['veredicto']:7} caduca {ta['caduca_el']}")
    if not a.cargar:
        print("\n  (nada se cargo; corre con --cargar)")
        return 0
    try:
        b = Base(socket=a.socket, puerto=a.puerto)
        r = cargar(b)
    except SinPostgres as e:
        print(f"\n  SIN POSTGRES: {e}")
        return 1
    print(f"\n  cargadas: {len(r['tarjetas_del_radar'])}")
    print(f"  {json.dumps(r['resumen'], ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
