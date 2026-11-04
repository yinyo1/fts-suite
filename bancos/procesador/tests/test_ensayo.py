from fastapi.testclient import TestClient
from test_pipeline import lote

from fixtures import zip_de
from fts_bancos.db import conexion


def test_ensayo_no_deja_rastro(base_limpia):
    from fts_bancos.app import app
    c = TestClient(app)
    z = zip_de(lote())
    r = c.post("/ensayo?hoy=2026-09-15", content=z).json()
    assert r["revertido"] and r["hashes_iguales_al_reprocesar"]
    assert r["base_filas"] > 0
    assert r["cierre"]["v3"]["cuentas"]["general"]["faltantes"] == ["2026-07"]
    r2 = c.post("/ensayo?hoy=2026-09-15", content=z).json()
    assert r2["base_csv_sha256"] == r["base_csv_sha256"]            # determinista entre corridas
    with conexion() as con, con.cursor() as cur:
        cur.execute("SELECT (SELECT count(*) FROM bancos.archivos) a, (SELECT count(*) FROM bancos.corridas) c")
        x = cur.fetchone()
    assert x["a"] == 0 and x["c"] == 0                               # nada quedó escrito


def test_ensayo_con_estados_reales_en_la_base(base_limpia, monkeypatch):
    """Producción ya tiene estados reales: /ensayo no debe tropezar con ellos al reconstruir la huella
    (antes: KeyError en verificar.huella_reconstruida → 500) y tampoco debe tocarlos (#352)."""
    import json
    from decimal import Decimal
    from test_pipeline import correr
    import fixtures as F
    from fts_bancos import pipeline
    from fts_bancos.app import app
    from fts_bancos.cuentas import cargar_de_entorno
    from fts_bancos.sinteticos import cuentas_falsas, cuenta, clabe
    # una cuenta "real" que NO está entre las falsas del ensayo (las de producción nunca lo están)
    otra = dict(cuentas_falsas()[0], clave="real", alias="Real", numero=cuenta(77), clabe=clabe(cuenta(77)))
    monkeypatch.setenv("BANCOS_CUENTAS_JSON", json.dumps(cuentas_falsas() + [otra]))
    with conexion() as con:
        pipeline.sembrar(con, cargar_de_entorno())
    correr({"real 02.pdf": F.pdf_estado(F.Estado(otra["numero"], otra["clabe"], 2026, 2, Decimal("1000.00"),
                                                  movs=[F.Mov(3, "T20", ["SPEI RECIBIDO BANCO PRUEBA"], abono=Decimal("10.00"))]))})
    q = ("SELECT (SELECT count(*) FROM bancos.archivos) a, (SELECT count(*) FROM bancos.corridas) c, "
         "(SELECT count(*) FROM bancos.movimientos) m, (SELECT count(*) FROM bancos.estados) e")
    with conexion() as con, con.cursor() as cur:
        cur.execute(q)
        antes = cur.fetchone()
    assert antes["e"] > 0
    c = TestClient(app, raise_server_exceptions=False)
    resp = c.post("/ensayo?hoy=2026-09-15", content=zip_de(lote()))
    assert resp.status_code == 200, resp.text[:300]
    r = resp.json()
    assert r["revertido"] and r["hashes_iguales_al_reprocesar"]
    assert r["reconstruida"]["estados"] > 0                         # reconstruyó lo del ensayo, sólo eso
    with conexion() as con, con.cursor() as cur:
        cur.execute(q)
        despues = cur.fetchone()
    assert despues == antes                                          # nada quedó escrito
