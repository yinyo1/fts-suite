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
