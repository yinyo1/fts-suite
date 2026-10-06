"""La ficha entregada, enlazada EN LA TARJETA del piloto (#384).

POR QUE LA LIGA VA EN LA TARJETA. La tarjeta es lo que la vendedora abre cuando le
toca la cuenta. Una ficha que no se alcanza desde ahi no existe para ella: la
version que si existe acaba siendo la que alguien le reenvio por chat, que es la
que nadie puede fechar ni verificar. Y la ficha es justo lo que esta corrida
produjo: sin la liga, el piloto tiene la senal y el puntaje y no tiene con quien
hablar.

DE DONDE SALE EL DATO, Y DE DONDE NO. Sale de `corrida.entrega`, que es lo que
`./prospector entregar` escribio cuando la ficha se subio de verdad: la liga, la
fecha, el tamano y el sha256 del archivo local que se entrego. NADA se declara a
mano aqui -- si la liga se pudiera teclear, la tarjeta podria apuntar a una ficha
que nunca se subio--. Una corrida sin `entrega` no se enlaza y se dice por que.

EL SHA256 NO ES DECORACION. Es lo que permite, manana, volver a emitir la ficha de
la corrida y saber si la copia de la liga sigue siendo esa, sin abrir la liga. El
TAMANO NO VERIFICA CONTENIDO (#306): dos fichas del mismo tamano difieren en
cualquier byte, y en esta misma corrida un aviso de 373 caracteres fue toda la
diferencia entre dos emisiones.

CERO ESCRITURAS A ODOO. Esto escribe en Postgres del piloto, en la tarjeta, y en
ninguna otra parte.
"""
from __future__ import annotations
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flujo.base_motor3 import Base, SinPostgres                     # noqa: E402
from flujo.orquestador import (CORRIDAS, _cargar_de, _es_salida,    # noqa: E402
                               _slug)


def _lit(s) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def rutas_de_las_corridas(raiz: str | None = None) -> list[str]:
    """Las corridas abiertas de la sesion, por su ruta. Sin las salidas."""
    raiz = raiz or CORRIDAS()
    rutas = []
    for carpeta, _, archivos in os.walk(raiz):
        for n in sorted(archivos):
            if n.endswith(".json") and not _es_salida(n) and n != "conectores.json":
                rutas.append(os.path.join(carpeta, n))
    return sorted(rutas)


def entregas_de_las_corridas(raiz: str | None = None) -> list[dict]:
    """Lo que cada corrida abierta dice de su entrega. Sin tocar la base.

    Devuelve una fila por corrida, enlazable o no, con el por_que cuando no: una
    tarjeta sin ficha es un hueco que hay que VER, no una fila que falta.
    """
    filas = []
    for ruta in rutas_de_las_corridas(raiz):
        # Una corrida que YA NO CARGA no se salta en silencio. Pasa de verdad: una
        # guardada por una version anterior puede traer una fila que una compuerta
        # mas estricta ya no acepta, y el archivo se queda sin poder abrirse. Si
        # esto desapareciera de la lista, su tarjeta se quedaria sin ficha y nadie
        # sabria por que.
        try:
            c = _cargar_de(ruta)
        except Exception as err:
            filas.append({
                "llave": os.path.basename(ruta)[:-5], "enlazable": False,
                "por_que": f"la corrida ya no carga con esta version: "
                           f"{type(err).__name__}: {str(err)[:160]}"})
            continue
        e = c.entrega or {}
        llave = f"{c.empresa}/{c.ciudad or '?'}"
        if not e.get("url"):
            filas.append({"llave": llave, "enlazable": False,
                          "por_que": "la corrida no tiene entrega registrada: la "
                                     "ficha no se subio, o se subio y nadie corrio "
                                     "`entregar`"})
            continue
        atras = c.entrega_quedo_atras()
        filas.append({
            "llave": llave, "enlazable": True,
            "empresa": c.empresa, "ciudad": c.ciudad or "",
            "ficha_url": e["url"],
            "ficha_entregada_el": e["ts"],
            "ficha_bytes": (e.get("local") or {}).get("bytes"),
            "ficha_sha256": (e.get("local") or {}).get("sha256"),
            # Se enlaza IGUAL, y queda dicho: la tarjeta tiene que poder decir
            # «esta liga ya no es la ficha de hoy», no esconder la liga.
            "quedo_atras": bool(atras),
        })
    return filas


def tarjeta_de(b: Base, empresa: str, ciudad: str) -> tuple[int | None, str]:
    """(tarjeta_id, por_que_no). Empareja SIN adivinar.

    La llave de la tarjeta y la de la corrida NO son la misma cadena, y no es un
    descuido: la tarjeta nace del radar, cuya planta viene como la escribio la nota
    -- «San Luis Potosi (Campus Daikin)», «Cienega de Flores, N.L.»-- y la corrida
    la abre el operador con la ciudad pelada. Un `=` entre las dos enlaza CERO
    tarjetas y no se queja: el reporte diria «5 sin tarjeta abierta» y el defecto
    pasaria por dato.

    Asi que se empareja por empresa, y la ciudad DESEMPATA por prefijo de slug
    -- `san-luis-potosi` contra `san-luis-potosi-campus-daikin`--. Si quedan dos
    candidatas se devuelve el por_que y no se escribe nada: elegir una en silencio
    es el mismo defecto que `_resolver_ruta` ya rechaza en el disco.
    """
    filas = b.json(
        "SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'planta', "
        "c.planta)), '[]'::jsonb) FROM motor3.tarjeta t "
        "JOIN motor3.cuenta c ON c.id = t.cuenta_id "
        f"WHERE c.empresa = {_lit(empresa)} AND t.estado = 'abierta';") or []
    if not filas:
        return None, "el piloto no tiene tarjeta abierta para esta empresa"
    if len(filas) == 1:
        return filas[0]["id"], ""
    s = _slug(ciudad)
    cand = [x for x in filas
            if s and (_slug(x["planta"] or "").startswith(s)
                      or s.startswith(_slug(x["planta"] or "")))]
    if len(cand) == 1:
        return cand[0]["id"], ""
    plantas = ", ".join(repr(x["planta"]) for x in (cand or filas))
    return None, (f"{len(cand or filas)} tarjetas abiertas de '{empresa}' y la "
                  f"ciudad '{ciudad}' no desempata: {plantas}")


def enlazar(b: Base, raiz: str | None = None) -> dict:
    """UPDATE de la tarjeta abierta de cada cuenta. No crea tarjetas: si no hay
    tarjeta, el piloto no tiene esa cuenta y eso es otro problema, no este."""
    hechas, sin_ficha, sin_tarjeta = [], [], []
    for f in entregas_de_las_corridas(raiz):
        if not f["enlazable"]:
            sin_ficha.append(f)
            continue
        tid, por_que = tarjeta_de(b, f["empresa"], f["ciudad"])
        if tid is None:
            sin_tarjeta.append(dict(f, por_que=por_que))
            continue
        b.correr(
            "UPDATE motor3.tarjeta SET "
            f"ficha_url = {_lit(f['ficha_url'])}, "
            f"ficha_entregada_el = {_lit(f['ficha_entregada_el'])}::timestamptz, "
            f"ficha_bytes = {f['ficha_bytes']}, "
            f"ficha_sha256 = {_lit(f['ficha_sha256'])} "
            f"WHERE id = {tid};")
        hechas.append(dict(f, tarjeta_id=tid))
    return {"enlazadas": hechas, "sin_ficha": sin_ficha,
            "sin_tarjeta_abierta": sin_tarjeta}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--enlazar", action="store_true",
                    help="sin esto solo LISTA lo que haria")
    ap.add_argument("--socket", default=os.environ.get("MOTOR3_SOCKET", ""))
    ap.add_argument("--puerto", default=os.environ.get("MOTOR3_PUERTO", "5440"))
    a = ap.parse_args(argv)
    for f in entregas_de_las_corridas():
        if f["enlazable"]:
            atras = "  ⚠ LA COPIA DE LA LIGA YA NO ES ESTA FICHA" if f["quedo_atras"] else ""
            print(f"    · {f['llave']:42} {f['ficha_bytes']:>7} B  "
                  f"{f['ficha_sha256'][:16]}…{atras}")
        else:
            print(f"    · {f['llave']:42} SIN FICHA: {f['por_que']}")
    if not a.enlazar:
        print("\n  (nada se escribio; corre con --enlazar)")
        return 0
    try:
        b = Base(socket=a.socket, puerto=a.puerto)
        r = enlazar(b)
    except SinPostgres as e:
        print(f"\n  SIN POSTGRES: {e}")
        return 1
    print(f"\n  tarjetas enlazadas: {len(r['enlazadas'])}")
    for f in r["sin_tarjeta_abierta"]:
        print(f"  SIN ENLAZAR: {f['llave']} — {f['por_que']}")
    for f in r["sin_ficha"]:
        print(f"  SIN FICHA: {f['llave']} — {f['por_que']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
