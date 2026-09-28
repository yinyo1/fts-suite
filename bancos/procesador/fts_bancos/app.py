"""API interna de fts-bancos. Sin dominio público: n8n la llama por la red privada
de Railway. HMAC + anti-replay (#123) se encienden al existir BANCOS_HMAC_SECRET."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import string
import time
from datetime import date, datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from . import PARSER_VERSION, cotejo, pipeline, reportes, verificar
from .cuentas import cargar_de_entorno
from .db import conexion
from .util import enmascarar_texto, sha256_bytes

log = logging.getLogger("fts_bancos")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI(title="fts-bancos", docs_url=None, redoc_url=None, openapi_url=None)
_VISTOS: dict[str, float] = {}
VENTANA = 300


def _secretos() -> list[bytes]:
    return [s.encode() for s in (os.environ.get("BANCOS_HMAC_SECRET"), os.environ.get("BANCOS_HMAC_SECRET_ANTERIOR")) if s]


@app.middleware("http")
async def hmac_guard(request: Request, call_next):
    secretos = _secretos()
    if secretos and request.url.path != "/salud":
        ts = request.headers.get("x-fts-ts", "")
        sig = request.headers.get("x-fts-sig", "")
        body = await request.body()
        try:
            t = int(ts)
        except ValueError:
            return JSONResponse({"ok": False, "motivo": "SIN_FIRMA"}, status_code=401)
        if abs(time.time() * 1000 - t) > VENTANA * 1000:
            return JSONResponse({"ok": False, "motivo": "FIRMA_VENCIDA"}, status_code=401)
        msg = ts.encode() + b"." + body
        if not any(hmac.compare_digest(hmac.new(s, msg, hashlib.sha256).hexdigest(), sig) for s in secretos):
            log.warning("rechazo HMAC %s", request.url.path)
            return JSONResponse({"ok": False, "motivo": "FIRMA_INVALIDA"}, status_code=401)
        ahora = time.time()
        for k in [k for k, v in _VISTOS.items() if ahora - v > 2 * VENTANA]:
            _VISTOS.pop(k, None)
        if sig in _VISTOS:
            return JSONResponse({"ok": False, "motivo": "REPLAY"}, status_code=401)
        _VISTOS[sig] = ahora
    return await call_next(request)


@app.on_event("startup")
def _inicio():
    try:
        with conexion() as con:
            pipeline.sembrar(con, cargar_de_entorno())
        log.info("fts-bancos listo · parser %s · cuentas sembradas", PARSER_VERSION)
    except Exception as e:  # la API sigue arriba para poder diagnosticar
        log.error("siembra fallida: %s", enmascarar_texto(str(e)))


def _hoy() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


@app.get("/salud")
def salud():
    db = "?"
    try:
        with conexion() as con, con.cursor() as cur:
            cur.execute("SELECT current_user AS u, (SELECT count(*) FROM bancos.cuentas) AS n")
            r = cur.fetchone()
            db = {"rol": r["u"], "cuentas": r["n"]}
    except Exception as e:
        db = {"error": enmascarar_texto(str(e))[:200]}
    return {"ok": True, "servicio": "fts-bancos", "parser": PARSER_VERSION, "hmac": bool(_secretos()), "db": db}


@app.post("/corridas")
async def corrida_nueva(req: Request):
    b = await req.json()
    with conexion() as con:
        cid = pipeline.abrir_corrida(con, b.get("origen", "manual"), b.get("disparada_por"))
    return {"corrida_id": cid}


@app.post("/procesar")
async def procesar(req: Request):
    b = await req.json()
    try:
        contenido = base64.b64decode(b["contenido_b64"], validate=True)
    except Exception:
        raise HTTPException(400, "contenido_b64 inválido")
    nombre = str(b.get("nombre") or "sin_nombre")[:250]
    return _procesar(contenido, nombre, b.get("meta") or {}, b.get("corrida_id"))


@app.post("/procesar-raw")
async def procesar_raw(req: Request, nombre: str, corrida_id: int | None = None, graph_item_id: str | None = None,
                       graph_drive_id: str | None = None, ruta: str | None = None, subido_por: str | None = None,
                       subido_at: str | None = None, origen: str = "buzon", solo_estados: int = 0):
    """Mismo contrato que /procesar, pero el cuerpo son los bytes del archivo (n8n manda el binario tal cual)."""
    contenido = await req.body()
    if not contenido:
        raise HTTPException(400, "cuerpo vacío")
    meta = {"origen": origen, "graph_item_id": graph_item_id, "graph_drive_id": graph_drive_id, "ruta": ruta,
            "subido_por": subido_por, "subido_at": subido_at}
    if solo_estados:
        with conexion() as con:
            cat = pipeline.catalogo_db(con)
        if not pipeline.es_candidato(contenido, cat):
            return {"ok": True, "ignorado": True, "entrada": {**meta, "nombre": nombre[:250], "bytes": len(contenido)},
                    "items": [], "subir": [], "rechazar_piezas": [], "problemas": [], "requiere_correo": False}
    return _procesar(contenido, nombre[:250], meta, corrida_id)


def _procesar(contenido: bytes, nombre: str, meta: dict, corrida_id):
    with conexion() as con:
        cat = pipeline.catalogo_db(con)
        reglas = pipeline.reglas_db(con)
        items = pipeline.procesar_archivo(con, contenido, nombre, meta, corrida_id, cat, reglas)
    out = [i.dict() for i in items]
    problemas = [i for i in out if i["estado"] in ("rechazado", "no_cuadra", "sospechoso", "formato_no_soportado")
                 or i["avisos"]]
    raiz = out[0] if out else None
    rechazo_total = raiz is not None and raiz["accion"] == "rechazados"
    log.info("procesado %s → %s", enmascarar_texto(nombre), [(i["estado"], i["periodo"]) for i in out])
    subir = [i for i in out if i["accion"] in ("copiar", "otras") and i["carpeta_destino"] and i["nombre_destino"]]
    rechazar = [i for i in out if i["accion"] == "rechazados" and i["es_pieza_de_zip"]]
    entrada = {**meta, "nombre": nombre, "bytes": len(contenido)}
    return json.loads(json.dumps({"ok": True, "entrada": entrada, "sha256": sha256_bytes(contenido), "items": out, "subir": subir,
                                  "rechazar_piezas": rechazar,
                                  "mover_original_a": "Rechazados" if rechazo_total else "Procesados",
                                  "motivo_original": raiz["motivo"] if rechazo_total else None,
                                  "instruccion_original": raiz["instruccion"] if rechazo_total else None,
                                  "requiere_correo": bool(problemas), "problemas": problemas}, default=str))


@app.post("/ensayo")
async def ensayo(req: Request, hoy: str = "2026-09-15"):
    """Corre el pipeline completo sobre un ZIP de fixtures SINTÉTICOS dentro de una transacción
    que se revierte al final. Sirve para probar el contenedor de producción sin ensuciar la base."""
    import io
    import zipfile
    from .cuentas import cargar_de_entorno as _c
    from .ensayo import CUENTAS_FALSAS_JSON
    contenido = await req.body()
    salida = {"archivos": {}}
    with conexion(ensayo=True) as con:
        falsas = _c(CUENTAS_FALSAS_JSON)
        pipeline.sembrar(con, falsas)
        cid = pipeline.abrir_corrida(con, "fixture", "ensayo")
        with zipfile.ZipFile(io.BytesIO(contenido)) as z:
            for n in sorted(z.namelist()):
                cat = pipeline.catalogo_db(con)
                cat.cuentas = [c for c in cat.cuentas if c.numero in {f.numero for f in falsas}]
                for c in cat.cuentas:
                    c.clave = next(f.clave for f in falsas if f.numero == c.numero)
                items = pipeline.procesar_archivo(con, z.read(n), n, {"origen": "fixture"}, cid, cat, pipeline.reglas_db(con))
                salida["archivos"][n] = [{k: i.dict()[k] for k in ("nombre_original", "estado", "accion", "periodo", "motivo",
                                                                  "avisos", "nombre_destino", "carpeta_destino", "v1", "v2")}
                                         for i in items]
        cat = pipeline.catalogo_db(con)
        cat.cuentas = [c for c in cat.cuentas if c.numero in {f.numero for f in falsas}]
        for c in cat.cuentas:
            c.clave = next(f.clave for f in falsas if f.numero == c.numero)
        salida["cierre"] = pipeline.cerrar_corrida(con, cid, cat, True, None, date.fromisoformat(hoy))
        filas = [f for f in reportes.filas_base(con) if "…00" in f["cuenta"]]
        salida["base_filas"] = len(filas)
        salida["base_csv_sha256"] = sha256_bytes(reportes.csv_bytes([{**f, "id": "", "par_traspaso": ""} for f in filas]))
        rec = verificar.huella_reconstruida(con, cat, pipeline.reglas_db(con))
        salida["reconstruida"] = {k: rec[k] for k in ("huella", "movimientos", "estados")}
        salida["hashes_iguales_al_reprocesar"] = not rec["estados_con_huella_distinta"]
    salida["revertido"] = True
    return json.loads(json.dumps(salida, default=str))


@app.get("/diag/token-roles")
def diag_token_roles(req: Request):
    """Diagnóstico de permisos de Graph SIN exponer el token: decodifica sólo la carga útil
    del JWT que n8n adjunta y devuelve roles, emisión y vencimiento. No lo guarda ni lo registra."""
    auth = req.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return {"ok": False, "motivo": "sin token"}
    try:
        carga = auth.split()[1].split(".")[1]
        carga += "=" * (-len(carga) % 4)
        d = json.loads(base64.urlsafe_b64decode(carga))
    except Exception:
        return {"ok": False, "motivo": "token ilegible"}
    ahora = int(time.time())
    return {"ok": True, "roles": sorted(d.get("roles", [])), "emitido_utc": datetime.fromtimestamp(d.get("iat", 0), timezone.utc).isoformat(),
            "vence_utc": datetime.fromtimestamp(d.get("exp", 0), timezone.utc).isoformat(), "segundos_para_vencer": d.get("exp", 0) - ahora}


@app.get("/blob/{sha}")
def blob(sha: str):
    if len(sha) != 64 or any(c not in string.hexdigits.lower() for c in sha):
        raise HTTPException(400)
    with conexion() as con, con.cursor() as cur:
        cur.execute("SELECT b.contenido FROM bancos.blobs b JOIN bancos.archivos a ON a.sha256=b.sha256 WHERE b.sha256=%s", (sha,))
        r = cur.fetchone()
    if not r:
        raise HTTPException(404)
    return Response(bytes(r["contenido"]), media_type="application/octet-stream")


@app.post("/corridas/{cid}/cerrar")
async def cerrar(cid: int, req: Request):
    b = await req.json() if (await req.body()) else {}
    hoy = date.fromisoformat(b["hoy"]) if b.get("hoy") else None
    with conexion() as con:
        cat = pipeline.catalogo_db(con)
        r = pipeline.cerrar_corrida(con, cid, cat, b.get("graph_ok"), b.get("extra"), hoy)
    return json.loads(json.dumps(r, default=str))


@app.get("/huecos")
def huecos():
    """Para el workflow A. 'listo' = hubo un inventario completo con Graph ok en las últimas 26 h."""
    with conexion() as con, con.cursor() as cur:
        cur.execute("""SELECT max(terminada_at) AS t FROM bancos.corridas
                       WHERE graph_ok AND origen IN ('cron','inventario','manual') AND terminada_at > now() - interval '26 hours'""")
        t = cur.fetchone()["t"]
        cur.execute("""SELECT h.id, h.periodo, h.motivo, h.monto_diferencia, h.veces_solicitado, h.solicitado_en,
                              c.banco, c.alias, c.moneda, c.numero_mask, c.tipo
                       FROM bancos.huecos h JOIN bancos.cuentas c ON c.id=h.cuenta_id
                       WHERE h.resuelto_en IS NULL ORDER BY c.id, h.periodo""")
        hs = cur.fetchall()
    return json.loads(json.dumps({"listo": t is not None, "ultimo_inventario": t, "huecos": hs}, default=str))


@app.post("/huecos/solicitados")
async def solicitados(req: Request):
    b = await req.json()
    ids = [int(x) for x in b.get("ids", [])]
    with conexion() as con, con.cursor() as cur:
        cur.execute("""UPDATE bancos.huecos SET solicitado_en=now(), veces_solicitado=veces_solicitado+1
                       WHERE id = ANY(%s) AND resuelto_en IS NULL""", (ids,))
        n = cur.rowcount
    return {"ok": True, "marcados": n}


@app.get("/base-maestra.csv")
def base_csv():
    with conexion() as con:
        filas = reportes.filas_base(con)
    b = reportes.csv_bytes(filas)
    return Response(b, media_type="text/csv; charset=utf-8", headers={"x-sha256": sha256_bytes(b), "x-filas": str(len(filas))})


@app.get("/base-maestra.xlsx")
def base_xlsx():
    with conexion() as con:
        filas = reportes.filas_base(con)
    b = reportes.xlsx_bytes(filas)
    return Response(b, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"x-sha256": sha256_bytes(b), "x-filas": str(len(filas))})


@app.get("/diccionario.md")
def diccionario():
    return PlainTextResponse(reportes.diccionario_md())


@app.get("/leeme.md")
def leeme():
    with conexion() as con:
        return PlainTextResponse(reportes.leeme_md(con, _hoy()))


@app.post("/cotejo")
async def post_cotejo(req: Request):
    b = await req.json()
    with conexion() as con:
        cid = pipeline.abrir_corrida(con, "cotejo", b.get("disparada_por"))
        res = cotejo.cotejar(con, cid, b.get("lineas", []), b["desde"], b["hasta"])
        html_ = cotejo.html_reporte(res, _hoy())
        with con.cursor() as cur:
            cur.execute("UPDATE bancos.corridas SET terminada_at=now(), resumen=%s WHERE id=%s",
                        (json.dumps({k: v for k, v in res.items() if not k.startswith("_")}, default=str), cid))
    publico = {k: v for k, v in res.items() if not k.startswith("_")}
    return json.loads(json.dumps({"corrida_id": cid, **publico, "html": html_}, default=str))


@app.post("/verificar/idempotencia")
def idempotencia():
    with conexion() as con:
        cat = pipeline.catalogo_db(con)
        reglas = pipeline.reglas_db(con)
        h_db, n_db = verificar.huella_db(con)
        rec = verificar.huella_reconstruida(con, cat, reglas)
        filas = reportes.filas_base(con)
    csv1 = sha256_bytes(reportes.csv_bytes(filas))
    csv2 = sha256_bytes(reportes.csv_bytes(filas))
    return {"iguales": h_db == rec["huella"] and not rec["estados_con_huella_distinta"],
            "huella_db": h_db, "movimientos_db": n_db, "reconstruida": rec, "csv_sha256": csv1, "csv_estable": csv1 == csv2}


@app.get("/resumen")
def resumen():
    with conexion() as con, con.cursor() as cur:
        cur.execute("""SELECT estado, count(*) AS n FROM bancos.archivos GROUP BY estado ORDER BY estado""")
        arch = cur.fetchall()
        cur.execute("""SELECT c.alias, c.numero_mask, e.periodo, e.v1_ok, e.v2_ok, e.num_movimientos, e.num_saldos_impresos,
                              (SELECT resultado FROM bancos.validaciones_v3 v WHERE v.estado_id=e.id ORDER BY v.id DESC LIMIT 1) AS v3
                       FROM bancos.estados e JOIN bancos.cuentas c ON c.id=e.cuenta_id JOIN bancos.archivos a ON a.id=e.archivo_id
                       WHERE a.estado='validado' ORDER BY c.id, e.periodo""")
        ests = cur.fetchall()
        cur.execute("SELECT id, origen, iniciada_at, terminada_at, leidos, validados, rechazados, duplicados, graph_ok FROM bancos.corridas ORDER BY id DESC LIMIT 5")
        cor = cur.fetchall()
    return json.loads(json.dumps({"archivos": arch, "estados_validados": ests, "corridas": cor}, default=str))


@app.get("/aceptacion")
def aceptacion(anio: str = "2026"):
    """Mediciones para los casos de aceptación de la Fase 4. No trae valores esperados:
    los números reales no viven en el repo; se comparan en el issue."""
    with conexion() as con, con.cursor() as cur:
        cur.execute("""SELECT count(*) AS estados, sum(e.num_movimientos) AS movimientos, sum(e.num_saldos_impresos) AS saldos
                       FROM bancos.estados e JOIN bancos.archivos a ON a.id=e.archivo_id
                       WHERE a.estado='validado' AND e.periodo LIKE %s AND e.v1_ok AND e.v2_ok""", (anio + "-%",))
        tot = cur.fetchone()
        cur.execute("""SELECT c.alias, h.periodo, h.motivo, h.monto_diferencia FROM bancos.huecos h JOIN bancos.cuentas c ON c.id=h.cuenta_id
                       WHERE h.resuelto_en IS NULL AND h.periodo LIKE %s ORDER BY c.id, h.periodo""", (anio + "-%",))
        huecos = cur.fetchall()
        cur.execute("""SELECT c.alias, e.periodo, e.saldo_inicial, e.saldo_final FROM bancos.estados e
                       JOIN bancos.cuentas c ON c.id=e.cuenta_id JOIN bancos.archivos a ON a.id=e.archivo_id
                       WHERE a.estado='validado' AND e.periodo LIKE %s ORDER BY c.id, e.periodo""", (anio + "-%",))
        saldos = cur.fetchall()
        cur.execute("""SELECT cv.subcategoria, count(*) AS n, sum(m.cargo) AS monto,
                              count(*) FILTER (WHERE cv.par_traspaso_id IS NOT NULL) AS con_pareja,
                              sum(m.cargo) FILTER (WHERE cv.par_traspaso_id IS NOT NULL) AS monto_con_pareja,
                              count(*) FILTER (WHERE cv.par_traspaso_id IS NULL) AS sin_pareja,
                              sum(m.cargo) FILTER (WHERE cv.par_traspaso_id IS NULL) AS monto_sin_pareja
                       FROM bancos.movimientos m JOIN bancos.clasificacion_vigente cv ON cv.movimiento_id=m.id
                       WHERE cv.es_traspaso_interno AND m.cargo>0 AND m.fecha_operacion >= %s
                       GROUP BY cv.subcategoria ORDER BY cv.subcategoria""", (anio + "-01-01",))
        traspasos = cur.fetchall()
        cur.execute("""SELECT c.alias, m.fecha_operacion, m.cargo, m.abono, m.codigo, left(m.descripcion, 90) AS descripcion
                       FROM bancos.movimientos m JOIN bancos.cuentas c ON c.id=m.cuenta_id
                       WHERE m.fecha_operacion >= %s AND (m.cargo >= 1000000 OR m.abono >= 1000000 OR (c.moneda='USD' AND (m.cargo>=100000 OR m.abono>=100000)))
                       ORDER BY m.fecha_operacion""", (anio + "-01-01",))
        grandes = cur.fetchall()
    return json.loads(json.dumps({"anio": anio, "totales_validados": tot, "huecos": huecos, "saldos": saldos,
                                  "traspasos": traspasos, "movimientos_grandes": grandes}, default=str))
