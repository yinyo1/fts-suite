"""Pruebas de idempotencia y de 'desde cero' sobre la base viva.

huella_db:            lo que HAY en la base (validado), por hash de movimiento,
                      con su clasificación vigente y el hash de su pareja.
huella_reconstruida:  lo mismo, recalculado DESDE LOS BYTES guardados en
                      bancos.blobs, en memoria, sin tocar la base.
Si las dos coinciden, re-correr el pipeline desde cero produce la misma base.
"""
from __future__ import annotations

from types import SimpleNamespace

from . import bbva, validar
from .clasificar import clasificar, emparejar
from .util import sha256_texto


def _linea(h, k_cat, k_sub, trasp, par_hash):
    return "|".join([h, k_cat or "", k_sub or "", "1" if trasp else "0", par_hash or ""])


def huella_db(con) -> tuple[str, int]:
    with con.cursor() as cur:
        cur.execute("""SELECT m.hash, c.categoria, c.subcategoria, c.es_traspaso_interno, p.hash AS par_hash
                       FROM bancos.movimientos m JOIN bancos.estados e ON e.id=m.estado_id JOIN bancos.archivos a ON a.id=e.archivo_id
                       LEFT JOIN bancos.clasificacion_vigente c ON c.movimiento_id=m.id
                       LEFT JOIN bancos.movimientos p ON p.id=c.par_traspaso_id
                       WHERE a.estado='validado' AND e.parser_version=%s ORDER BY m.hash""", (bbva.PARSER_VERSION,))
        lineas = [_linea(r["hash"], r["categoria"], r["subcategoria"], r["es_traspaso_interno"], r["par_hash"]) for r in cur.fetchall()]
    return sha256_texto("\n".join(lineas)), len(lineas)


def huella_reconstruida(con, catalogo, reglas) -> dict:
    with con.cursor() as cur:
        cur.execute("""SELECT a.id, a.sha256, a.cuenta_id, b.contenido, e.huella
                       FROM bancos.archivos a JOIN bancos.blobs b ON b.sha256=a.sha256
                       JOIN bancos.estados e ON e.archivo_id=a.id AND e.parser_version=%s
                       WHERE a.estado='validado' ORDER BY a.id""", (bbva.PARSER_VERSION,))
        filas = cur.fetchall()
    por_id = {c.id: c for c in catalogo.cuentas}
    items, difs = [], []
    for f in filas:
        cta = por_id[f["cuenta_id"]]
        est = bbva.parsear(bytes(f["contenido"]))
        h = bbva.calcular_hashes(est, cta.numero)
        validar.v1(est); validar.v2(est)
        if h != f["huella"]:
            difs.append({"archivo_id": f["id"], "huella_db": f["huella"], "huella_nueva": h})
        for mv in est.movimientos:
            k = clasificar(mv, cta, catalogo, reglas, catalogo.externas_financiamiento)
            items.append((mv, cta, k))
    emparejar(items)
    lineas = sorted(_linea(mv.hash, k.categoria, k.subcategoria, k.es_traspaso_interno, k.par.hash if k.par else None)
                    for mv, cta, k in items)
    return {"huella": sha256_texto("\n".join(lineas)), "movimientos": len(lineas), "estados": len(filas),
            "estados_con_huella_distinta": difs}
