"""Objetivo 1 del auditor: los seis casos sembrados dan ROJO en su pata, y la base sana da VERDE."""
import json
import os
import subprocess
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import fixtures as F
from fixtures import CUENTAS, pdf_estado

from fts_auditor.patas import RAIZ, Auditoria

LECTURA = Path(__file__).resolve().parents[1] / "n8n" / "lectura.sql"
HOY = date(2026, 9, 15)
AHORA = datetime(2026, 9, 15, 23, 0, tzinfo=timezone.utc)


def _psql(sql: str) -> str:
    return subprocess.run(["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
                          check=True, capture_output=True, text=True).stdout


def sembrar(pdfs: dict[str, bytes]):
    from fts_bancos import pipeline
    from fts_bancos.db import conexion
    with conexion() as con:
        cid = pipeline.abrir_corrida(con, "fixture")
    for nombre, datos in pdfs.items():
        with conexion() as con:
            pipeline.procesar_archivo(con, datos, nombre, {"origen": "fixture"}, cid, pipeline.catalogo_db(con), pipeline.reglas_db(con))
    with conexion() as con:
        pipeline.cerrar_corrida(con, cid, pipeline.catalogo_db(con), graph_ok=True, hoy=HOY)


def foto():
    """Lo que el auditor ve: la base por el rol bancos_auditor, y un OneDrive simulado con las copias canónicas."""
    salida = subprocess.run(["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-1", "-qAt", "-f", str(LECTURA)],
                            check=True, capture_output=True, text=True).stdout.strip()
    base = json.loads(salida)
    assert base["rol"] == "bancos_auditor"
    pdfs, od = {}, []
    for fila in _psql("SELECT a.sha256, a.ruta_canonica, translate(encode(b.contenido,'base64'), E'\\n', '') FROM bancos.archivos a JOIN bancos.blobs b USING (sha256) "
                      "WHERE a.ruta_canonica IS NOT NULL").splitlines():
        sha, ruta, b64 = fila.split("|")
        import base64
        pdfs[sha] = base64.b64decode(b64)
        d, n = (RAIZ + ruta).rsplit("/", 1)
        od.append({"nombre": n, "ruta": d, "sha256": sha, "en_buzon": False, "creado": "2026-09-15T12:00:00Z"})
    return base, {"archivos": od, "errores": []}, pdfs


N8N_OK = {"solicitud_activos": 1, "acuse_activo": True}


def estados_general(meses, romper_inicial_en=None):
    gen = CUENTAS[0]
    out, s = {}, F.monto(500000) if hasattr(F, "monto") else Decimal("500000.00")
    for m in meses:
        ini = s + (Decimal("100.00") if m == romper_inicial_en else 0)
        e = F.Estado(gen["numero"], gen["clabe"], 2026, m, ini, movs=[
            F.Mov(2, "T20", ["SPEI RECIBIDO BANCO PRUEBA", f"Ref. COB{m:02d}"], abono=Decimal("1000.25") * m),
            F.Mov(3, "T17", ["SPEI ENVIADO BANCO PRUEBA", f"Ref. PAG{m:02d}"], cargo=Decimal("300.10")),
            F.Mov(9, "S39", ["SERV BANCA INTERNET"], cargo=Decimal("250.00")),
        ])
        out[f"GEN {m:02d} 2026.pdf"] = pdf_estado(e)
        s = F.saldo_final(e)
    return out


def auditar(base, od, pdfs):
    return Auditoria(base, od, pdfs, n8n=N8N_OK, ahora=AHORA).correr()


def rojos(r, pata, codigo=None):
    return [h for h in r["hallazgos"] if h["resultado"] == "ROJO" and h["pata"] == pata and (codigo is None or h["codigo"] == codigo)]


def test_base_sana_da_verde_en_las_tres_patas(base_limpia):
    sembrar(estados_general([1, 2, 3, 4]))
    r = auditar(*foto())
    assert r["conteos"]["estados"] == 4 and r["conteos"]["movimientos"] == 12
    assert r["conteos"]["objetivo1"] == "VERDE", [h for h in r["hallazgos"] if h["resultado"] == "ROJO"]


def test_caso1_pdf_en_onedrive_sin_registro(base_limpia):
    sembrar(estados_general([1, 2, 3]))
    base, od, pdfs = foto()
    extra = estados_general([7])["GEN 07 2026.pdf"]
    import hashlib
    od["archivos"].append({"nombre": "BBVA_extra.pdf", "ruta": od["archivos"][0]["ruta"], "sha256": hashlib.sha256(extra).hexdigest(),
                           "en_buzon": False, "creado": "2026-09-15T12:00:00Z"})
    r = auditar(base, od, pdfs)
    assert rojos(r, 1, "P1_PDF_SIN_REGISTRO") and r["conteos"]["objetivo1"] == "ROJO"


def test_caso2_registro_cuyo_pdf_ya_no_existe(base_limpia):
    sembrar(estados_general([1, 2, 3]))
    base, od, pdfs = foto()
    quitado = od["archivos"].pop(1)
    r = auditar(base, od, pdfs)
    h = rojos(r, 1, "P1_REGISTRO_SIN_PDF")
    assert h and h[0]["evidencia"]["ruta"].endswith(quitado["nombre"])
    assert r["conteos"]["rojo_por_pata"]["1"] == 1


def test_caso3_pdf_reemplazado_mismo_nombre_otro_sha(base_limpia):
    sembrar(estados_general([1, 2, 3]))
    base, od, pdfs = foto()
    od["archivos"][0]["sha256"] = "f" * 64
    r = auditar(base, od, pdfs)
    assert rojos(r, 1, "P1_REEMPLAZADO")


def test_caso4_un_centavo_de_diferencia_entre_base_y_pdf(base_limpia):
    sembrar(estados_general([1, 2, 3]))
    _psql("UPDATE bancos.movimientos SET cargo = cargo + 0.01 WHERE id = (SELECT min(id) FROM bancos.movimientos WHERE cargo > 0)")
    r = auditar(*foto())
    h = rojos(r, 2, "P2_MOVIMIENTO_DISTINTO")
    assert h and "cargo" in h[0]["evidencia"]["pdf_vs_base"] and h[0]["evidencia"]["pagina"] >= 1


def test_caso5_movimiento_que_falta_en_la_base(base_limpia):
    sembrar(estados_general([1, 2, 3]))
    _psql("WITH m AS (SELECT max(id) AS id FROM bancos.movimientos), c AS (DELETE FROM bancos.clasificacion WHERE movimiento_id = (SELECT id FROM m) OR par_traspaso_id = (SELECT id FROM m)) "
          "DELETE FROM bancos.movimientos WHERE id = (SELECT id FROM m)")
    r = auditar(*foto())
    assert rojos(r, 2, "P2_CONTEO_POR_PAGINA") and rojos(r, 2, "P2_MOVIMIENTO_FALTANTE")


def test_caso6_saldo_final_que_no_encadena_con_el_mes_siguiente(base_limpia):
    sembrar(estados_general([1, 2, 3], romper_inicial_en=3))
    r = auditar(*foto())
    h = rojos(r, 3, "P3_V3_NO_ENCADENA")
    assert h and h[0]["evidencia"]["mes_anterior"] == "2026-02"
    assert not rojos(r, 2)   # el PDF y la base coinciden: el problema es del banco/continuidad, no de la lectura


# ── corte de alcance de la pata 3 (decisión de #346): lo anterior al corte sigue en patas 1 y 2 ──
def auditar_corte(base, od, pdfs, desde, por_cuenta=None):
    return Auditoria(base, od, pdfs, n8n=N8N_OK, ahora=AHORA, p3_desde=desde, p3_desde_por_cuenta=por_cuenta).correr()


def test_corte_exenta_de_pata3_lo_anterior(base_limpia):
    sembrar(estados_general([1, 2, 3, 4], romper_inicial_en=2))
    base, od, pdfs = foto()
    assert rojos(auditar_corte(base, od, pdfs, None), 3, "P3_V3_NO_ENCADENA")          # sin corte: ROJO
    r = auditar_corte(base, od, pdfs, "2026-03")
    assert not rojos(r, 3) and r["veredicto"] == "VERDE" and r["conteos"]["objetivo1"] == "VERDE"
    fila = {f["periodo"]: f for f in r["por_estado"]}
    assert [fila[p]["pata3"] for p in ("2026-01", "2026-02", "2026-03", "2026-04")] == ["NO_APLICA", "NO_APLICA", "VERDE", "VERDE"]
    assert all(f["pata1"] == f["pata2"] == "VERDE" for f in r["por_estado"])
    assert r["conteos"]["estados_exentos_pata3"] == 2 and r["conteos"]["estados_tres_patas_verde"] == 2 and r["conteos"]["estados_ok"] == 4
    assert "P3_FUERA_DE_ALCANCE" not in r["conteos"]["hallazgos_por_codigo"]


def test_corte_no_exenta_de_patas_1_y_2(base_limpia):
    sembrar(estados_general([1, 2, 3]))
    _psql("UPDATE bancos.movimientos SET cargo = cargo + 0.01 WHERE id = (SELECT min(id) FROM bancos.movimientos WHERE cargo > 0)")
    r = auditar_corte(*foto(), "2026-03")
    h = rojos(r, 2, "P2_MOVIMIENTO_DISTINTO")
    assert h and r["veredicto"] == "ROJO" and r["conteos"]["objetivo1"] == "ROJO"


def test_corte_primer_estado_sin_vecino_antes_del_corte(base_limpia):
    sembrar(estados_general([1, 3, 4]))
    base, od, pdfs = foto()
    r = auditar_corte(base, od, pdfs, "2026-03")
    assert not rojos(r, 3), rojos(r, 3)


def test_corte_por_cuenta_gana_al_global(base_limpia):
    sembrar(estados_general([1, 2, 3, 4], romper_inicial_en=2))
    base, od, pdfs = foto()
    mask = base["cuentas"][0]["numero_mask"]
    assert rojos(auditar_corte(base, od, pdfs, "2026-03", {mask: None}), 3, "P3_V3_NO_ENCADENA")   # la cuenta sin corte
    assert not rojos(auditar_corte(base, od, pdfs, None, {mask: "2026-03"}), 3)


def test_config_del_repo_trae_el_corte_de_2019():
    from fts_auditor.__main__ import config
    assert config()["pata3"]["alcance_desde"] == "2020-01"
