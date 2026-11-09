"""Jeeves (issue #352): ingesta por contenido, V1–V4, deduplicación del CSV y Payana. Datos SINTÉTICOS."""
import copy
import json
from datetime import date
from decimal import Decimal

import jeeves_fixtures as J
from fixtures import Mov, escenario, pdf_estado, pdf_texto

from fts_bancos import jeeves, pipeline
from fts_bancos.db import conexion

HOY = date(2026, 9, 15)


def correr(archivos, meta=None):
    with conexion() as con:
        cid = pipeline.abrir_corrida(con, "fixture")
    items = {}
    for nombre, datos in archivos.items():
        with conexion() as con:
            cat, reglas = pipeline.catalogo_db(con), pipeline.reglas_db(con)
            items[nombre] = [i.dict() for i in pipeline.procesar_archivo(con, datos, nombre, dict({"origen": "fixture"}, **(meta or {})),
                                                                         cid, cat, reglas)]
    with conexion() as con:
        cierre = pipeline.cerrar_corrida(con, cid, pipeline.catalogo_db(con), graph_ok=True, hoy=HOY)
    return cid, items, cierre


def q(sql, *args):
    with conexion() as con, con.cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchall()


def validacion(ciclo, prueba):
    r = q("SELECT resultado, diferencia, detalle FROM bancos.v_jeeves_validaciones WHERE ciclo=%s AND prueba=%s", ciclo, prueba)
    return r[0] if r else None


# ── a) PDF sintético: Amount Due y V1 en verde ──
def test_a_pdf_sintetico_v1_verde(base_limpia):
    _, items, _ = correr({"estado agosto.pdf": J.pdf_jeeves()})
    it = items["estado agosto.pdf"][0]
    assert it["estado"] == "validado" and it["tipo"] == "jeeves", it
    assert it["nombre_destino"] == "Jeeves_Tarjeta-MXN_Servicios-FTS_2026-08.pdf"
    assert it["carpeta_destino"].endswith("Jeeves Tarjeta Credito/2026")
    c = q("SELECT * FROM bancos.v_jeeves_ciclos")[0]
    assert c["amount_due"] == Decimal("-1354.04") and c["v1_ok"]
    assert (c["previous_balance"] + c["payments"] + c["new_charges"] + c["adjustment"]) == c["amount_due"]
    tipos = {r["tipo"]: r["n"] for r in q("SELECT tipo, count(*) AS n FROM bancos.v_jeeves_movimientos_pdf GROUP BY tipo")}
    assert tipos["pago"] == 1 and tipos["ajuste"] == 1 and tipos["cargo_jeeves"] == 1 and tipos["devolucion"] == 1


# ── b) el mismo PDF con un renglón faltante: V1 en rojo con el monto de diferencia ──
def test_b_renglon_faltante_v1_rojo(base_limpia):
    faltante = J.renglones_ago()[10]
    _, items, _ = correr({"agosto incompleto.pdf": J.pdf_jeeves(renglones=J.renglones_ago(quitar=10))})
    it = items["agosto incompleto.pdf"][0]
    assert it["estado"] == "no_cuadra" and it["accion"] == "rechazados"
    assert f"(diferencia {-faltante[4]})" in it["motivo"], it["motivo"]
    assert not q("SELECT 1 FROM bancos.v_jeeves_ciclos")          # un ciclo que no cuadra no es vigente


# ── c) consumo del 30 de julio a las 23:00 UTC con Posted el 1 de agosto: ciclo de agosto ──
def test_c_posted_en_hora_de_monterrey(base_limpia):
    x = jeeves.parsear_csv(J.csv_jeeves([J.fila_csv("C1", creado="30/07/2026 23:00", posted="01/08/2026 07:00")]))
    t = x.filas[0]
    assert jeeves.en_mty(t["posted_at"]).date() == date(2026, 8, 1)      # 07:00 UTC = 01:00 de Monterrey del 1 de agosto
    assert jeeves.en_mty(t["created_at"]).date() == date(2026, 7, 30)
    filas = J.csv_de_pdf()
    correr({"estado.pdf": J.pdf_jeeves(), "transacciones.csv": J.csv_jeeves(filas)})
    v2 = validacion("2026-08", "V2")
    assert v2["resultado"] == "ok", json.dumps(v2["detalle"], default=str)[:800]
    julio = [r for r in q("SELECT created_mty, posted_mty FROM bancos.v_jeeves_transacciones") if r["created_mty"].month == 7]
    assert julio and all(r["posted_mty"].month == 8 for r in julio)


# ── d) dos descargas del mismo año: sin duplicados; el modificado deja la versión anterior no vigente ──
def test_d_dos_descargas_dedup_y_version(base_limpia):
    base = [J.fila_csv(f"D{i}", monto=f"{100 + i}.00") for i in range(5)]
    segunda = copy.deepcopy(base) + [J.fila_csv("D9", monto="999.00")]
    segunda[2]["Memo"] = "proyecto SO11547"                            # cambió entre descargas
    _, items, _ = correr({"jeeves 2026-09-01.csv": J.csv_jeeves(base)})
    assert items["jeeves 2026-09-01.csv"][0]["nombre_destino"] == "Jeeves_Transacciones_2026_descargado-2026-09-01.csv"
    _, items2, _ = correr({"export_2026-10-01.csv": J.csv_jeeves(segunda)})
    det = items2["export_2026-10-01.csv"][0]["detalle"]
    assert (det["nuevas"], det["versiones_nuevas"], det["repetidas"]) == (1, 1, 4), det
    assert q("SELECT count(*) AS n FROM bancos.jeeves_transacciones")[0]["n"] == 7         # 5 + 1 nueva + 1 versión
    vig = {r["unique_id"]: r for r in q("SELECT * FROM bancos.v_jeeves_transacciones")}
    assert len(vig) == 6 and vig["D2"]["memo"] == "proyecto SO11547"
    assert q("SELECT count(*) AS n FROM bancos.jeeves_transacciones WHERE unique_id='D2'")[0]["n"] == 2
    # ninguna liga de comprobante sale por la vista
    assert "comprobantes" not in vig["D2"] and vig["D2"]["tiene_comprobante"] is True


# ── e) pago de Jeeves sin cargo en BBVA: marcado; con el cargo, V4 en verde ──
def _general_agosto(con_fondeo: bool):
    e = copy.deepcopy(escenario()["general_2026-08"])
    if con_fondeo:
        e.movs.append(Mov(31, "T17", ["SPEI ENVIADO BANCO PRUEBA", "PAGO JEEVES LINEA"], cargo=Decimal("168574.45")))
    return pdf_estado(e)


def test_e_pago_sin_cargo_en_bbva(base_limpia):
    correr({"GEN 08.pdf": _general_agosto(False), "jeeves ago.pdf": J.pdf_jeeves()})
    v4 = validacion("2026-08", "V4")
    assert v4["resultado"] == "falla"
    assert len(v4["detalle"]["pago_sin_cargo_en_bbva"]) == 1 and not v4["detalle"]["cargo_bbva_sin_pago_en_jeeves"]


def test_e2_pago_con_cargo_en_bbva(base_limpia):
    correr({"GEN 08.pdf": _general_agosto(True), "jeeves ago.pdf": J.pdf_jeeves()})
    v4 = validacion("2026-08", "V4")
    assert v4["resultado"] == "ok", v4


# ── V3: continuidad entre ciclos ──
def test_v3_continuidad(base_limpia):
    sep = dict(J.RESUMEN_AGO)
    sep.update({"Previous Balance": Decimal("-1354.04"), "Payments": Decimal("0.00"), "New Charges": Decimal("1250.00"),
                "Adjustment": Decimal("0.00"), "Amount Due": Decimal("-104.04")})
    ren = [("Sep 02, 2026 10:00", "Usuario Uno", "Ferreteria Prueba", "4548", Decimal("1250.00"), None)]
    correr({"a.pdf": J.pdf_jeeves(), "b.pdf": J.pdf_jeeves(resumen=sep, renglones=ren, periodo=("Sep 01, 2026", "Sep 30, 2026"),
                                                          statement_date="Oct 01, 2026")})
    assert validacion("2026-09", "V3")["resultado"] == "ok"
    assert validacion("2026-08", "V3")["resultado"] == "no_aplica"


# ── ingesta: por contenido, nunca por el nombre ──
def test_deteccion_por_contenido_no_por_nombre(base_limpia):
    _, items, _ = correr({
        "BBVA_General_0000000000_2026-08.pdf": J.pdf_jeeves(),                   # nombre engañoso, contenido Jeeves
        "jeeves_notas.csv": b"nombre,valor,a,b,c\nx,1,2,3,4\n",                  # nombre de Jeeves, contenido no
        "reporte.csv": J.csv_jeeves([J.fila_csv("Z1")]),                         # nombre neutro, contenido Jeeves
    })
    assert items["BBVA_General_0000000000_2026-08.pdf"][0]["tipo"] == "jeeves"
    assert items["jeeves_notas.csv"][0]["tipo"] == "tabla_desconocida"
    assert items["reporte.csv"][0]["tipo"] == "jeeves_csv" and items["reporte.csv"][0]["estado"] == "validado"


def test_razon_social_ajena_va_a_otras(base_limpia):
    _, items, _ = correr({"otra.pdf": J.pdf_jeeves(empresa="Otra Empresa SA de CV")})
    it = items["otra.pdf"][0]
    assert it["accion"] == "otras" and "Otras cuentas por identificar" in it["carpeta_destino"]


def test_duplicado_logico_de_ciclo(base_limpia):
    pdf = J.pdf_jeeves()
    _, items, _ = correr({"a.pdf": pdf, "a-copia.pdf": pdf + b"\n%relleno\n"})
    assert items["a-copia.pdf"][0]["estado"] == "duplicado"


def test_payana_se_acomoda_sin_parser(base_limpia):
    _, items, _ = correr({"movimientos.csv": b"Fecha,Concepto,Monto,Saldo,Referencia\n2026-08-01,Fondeo Payana,1,2,3\n",
                          "estado.pdf": pdf_texto(["Payana", "Reporte de pagos", "Periodo agosto 2026"])})
    for n in ("movimientos.csv", "estado.pdf"):
        it = items[n][0]
        assert it["tipo"] == "payana" and it["accion"] == "copiar" and it["carpeta_destino"].endswith("/Payana"), it
        assert it["motivo"] == "recibido, sin parser (Payana)"


def test_permisos_lector_no_ve_comprobantes(base_limpia):
    correr({"t.csv": J.csv_jeeves([J.fila_csv("P1")])})
    import subprocess
    from conftest import PG
    r = subprocess.run(["psql", f"{PG} dbname={base_limpia}", "-tAc",
                        "SET ROLE bancos_lector; SELECT comprobantes FROM bancos.jeeves_transacciones"], capture_output=True, text=True)
    assert "permission denied" in r.stderr
    r = subprocess.run(["psql", f"{PG} dbname={base_limpia}", "-tAc",
                        "SET ROLE bancos_lector; SELECT count(*) FROM bancos.v_jeeves_transacciones"], capture_output=True, text=True)
    assert r.stdout.strip().splitlines()[-1] == "1", r.stderr


def test_v2_detecta_transaccion_faltante_en_csv(base_limpia):
    filas = J.csv_de_pdf()
    quitada = filas.pop(5)
    correr({"estado.pdf": J.pdf_jeeves(), "transacciones.csv": J.csv_jeeves(filas)})
    v2 = validacion("2026-08", "V2")
    assert v2["resultado"] == "falla"
    assert len(v2["detalle"]["solo_en_pdf"]) == 1 and not v2["detalle"]["solo_en_csv"]
    assert Decimal(v2["detalle"]["solo_en_pdf"][0]["monto"]) == Decimal(quitada["Amount (destination currency)"])


def test_reportes_con_jeeves_no_truenan(base_limpia):
    from fts_bancos import reportes
    correr({"estado.pdf": J.pdf_jeeves(), "transacciones.csv": J.csv_jeeves(J.csv_de_pdf())})
    with conexion() as con:
        assert reportes.leeme_md(con, "2026-09-29")
        assert reportes.html_estados(con, "2026-09-29")
        assert reportes.csv_bytes(reportes.filas_base(con))
