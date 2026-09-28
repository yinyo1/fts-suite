"""API interna de retardos-hojas (#334). Sin dominio público: n8n la llama por la red privada
de Railway. Sin base de datos, sin credenciales, sin herramientas: recibe bytes, devuelve JSON.
HMAC + anti-replay (#123) se encienden al existir RETARDOS_HOJAS_HMAC_SECRET (mismo esquema
que fts-bancos: x-fts-ts + x-fts-sig = hex(HMAC-SHA256(secret, ts + "." + body)), ventana 5 min)."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from . import VERSION, ia, lector

log = logging.getLogger("fts_hojas")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI(title="retardos-hojas", docs_url=None, redoc_url=None, openapi_url=None)
_VISTOS: dict[str, float] = {}
VENTANA = 300
MAX_BYTES = 15_000_000


def _secretos() -> list[bytes]:
    return [s.encode() for s in (os.environ.get("RETARDOS_HOJAS_HMAC_SECRET"), os.environ.get("RETARDOS_HOJAS_HMAC_SECRET_ANTERIOR")) if s]


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


@app.get("/salud")
def salud():
    return {"ok": True, "servicio": "retardos-hojas", "version": VERSION, "hmac": bool(_secretos()),
            "ia": ia.disponible(), "ocr": lector.pytesseract is not None, "layout": lector.LAYOUT["version"]}


@app.post("/leer")
async def leer(req: Request, mime: str = "application/pdf"):
    """El cuerpo son los bytes del archivo tal cual (n8n manda el binario)."""
    contenido = await req.body()
    if not contenido:
        raise HTTPException(400, "cuerpo vacío")
    if len(contenido) > MAX_BYTES:
        return {"ok": False, "error": "ARCHIVO_DEMASIADO_GRANDE"}
    t0 = time.time()
    r = lector.leer(contenido, mime)
    r["sha256"] = hashlib.sha256(contenido).hexdigest()
    r["ms"] = int((time.time() - t0) * 1000)
    log.info("leer %s bytes · %s páginas · %s ms", len(contenido), len(r.get("paginas", [])), r["ms"])
    return r
