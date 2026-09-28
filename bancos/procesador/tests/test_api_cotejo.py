import base64
import hashlib
import hmac
import json
import time

from fastapi.testclient import TestClient
from fixtures import escenario, pdf_estado

from fts_bancos.db import conexion


def test_hmac_y_antireplay(base_limpia, monkeypatch):
    monkeypatch.setenv("BANCOS_HMAC_SECRET", "secreto-de-prueba")
    from fts_bancos.app import app
    c = TestClient(app)
    assert c.post("/corridas", json={"origen": "fixture"}).status_code == 401          # sin firma
    body = json.dumps({"origen": "fixture"}).encode()
    ts = str(int(time.time() * 1000))
    sig = hmac.new(b"secreto-de-prueba", ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    h = {"x-fts-ts": ts, "x-fts-sig": sig, "content-type": "application/json"}
    assert c.post("/corridas", content=body, headers=h).status_code == 200
    assert c.post("/corridas", content=body, headers=h).json()["motivo"] == "REPLAY"
    viejo = str(int(time.time() * 1000) - 10 * 60 * 1000)
    sig2 = hmac.new(b"secreto-de-prueba", viejo.encode() + b"." + body, hashlib.sha256).hexdigest()
    assert c.post("/corridas", content=body, headers={**h, "x-fts-ts": viejo, "x-fts-sig": sig2}).json()["motivo"] == "FIRMA_VENCIDA"
    assert c.get("/salud").status_code == 200


def test_api_procesar_y_cotejo(base_limpia):
    from fts_bancos.app import app
    c = TestClient(app)
    E = escenario()
    cid = c.post("/corridas", json={"origen": "manual"}).json()["corrida_id"]
    r = c.post("/procesar", json={"corrida_id": cid, "nombre": "GEN 03.pdf", "meta": {"origen": "fixture"},
                                  "contenido_b64": base64.b64encode(pdf_estado(E["general_2026-03"])).decode()}).json()
    assert r["items"][0]["estado"] == "validado" and r["mover_original_a"] == "Procesados" and not r["requiere_correo"]
    sha = r["items"][0]["sha256"]
    assert c.get(f"/blob/{sha}").content == pdf_estado(E["general_2026-03"])
    c.post(f"/corridas/{cid}/cerrar", json={"graph_ok": True, "hoy": "2026-09-15"})
    assert c.get("/huecos").json()["listo"] is True
    with conexion() as con, con.cursor() as cur:
        cur.execute("SELECT id, fecha_operacion, cargo, abono, referencia FROM bancos.movimientos ORDER BY renglon")
        movs = cur.fetchall()
    # Odoo: el cobro con su referencia (exacto), el pago 2 días después sin ref (probable),
    # el resto no existe en Odoo, y un registro de Odoo que no está en el banco.
    lineas = [
        {"journal_id": 8, "line_id": 1, "move_id": 11, "date": str(movs[0]["fecha_operacion"]),
         "amount": str(movs[0]["abono"]), "ref": "COB0301 cliente"},
        {"journal_id": 8, "line_id": 2, "move_id": 12, "date": "2026-03-05", "amount": str(-movs[1]["cargo"]), "ref": "pago"},
        {"journal_id": 8, "line_id": 3, "move_id": 13, "date": "2026-03-09", "amount": "-777.00", "ref": "BILL/2026/03/0001"},
    ]
    res = c.post("/cotejo", json={"lineas": lineas, "desde": "2026-03-01", "hasta": "2026-03-31"}).json()
    assert (res["exactos"], res["probables"], res["sin_match"], res["odoo_sin_banco"]) == (1, 1, len(movs) - 2, 1)
    assert "Cotejo banco (PDF) contra Odoo" in res["html"] and "BBVA_General-MXN_0999000011_2026-03.pdf" in res["html"]
    assert c.get("/base-maestra.csv").headers["x-filas"] == str(len(movs))
    idem = c.post("/verificar/idempotencia").json()
    assert idem["iguales"] and idem["csv_estable"]


def test_solo_estados_ignora_lo_que_no_es_estado(base_limpia):
    from fixtures import pdf_texto, zip_de
    from fts_bancos.app import app
    c = TestClient(app)
    fac = c.post("/procesar-raw?nombre=factura.pdf&solo_estados=1&origen=sharepoint", content=pdf_texto(["FACTURA", "CFDI"])).json()
    assert fac["ignorado"] is True
    z = zip_de({"a.pdf": pdf_texto(["SIPARE"]), "b.pdf": pdf_estado(escenario()["usd_2026-02"])})
    r = c.post("/procesar-raw?nombre=mezcla.zip&solo_estados=1&origen=sharepoint", content=z).json()
    assert not r.get("ignorado") and any(i["estado"] == "validado" for i in r["items"])
    with conexion() as con, con.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM bancos.archivos WHERE nombre_original='factura.pdf'")
        assert cur.fetchone()["n"] == 0


def test_corrida_sin_graph_no_toca_huecos(base_limpia):
    from fts_bancos.app import app
    c = TestClient(app)
    cid = c.post("/corridas", json={"origen": "cron"}).json()["corrida_id"]
    c.post(f"/corridas/{cid}/cerrar", json={"graph_ok": False})
    with conexion() as con, con.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM bancos.huecos")
        assert cur.fetchone()["n"] == 0
