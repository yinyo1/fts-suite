"""Solicitud y acuse de Jeeves (bancos_0011, issue #352). Datos SINTÉTICOS."""
from datetime import date

import jeeves_fixtures as J
from test_solicitud import correr, q, render, uno


def test_rezago_pide_pdf_desde_enero_2025_y_csv_por_anio(base_jeeves):
    fs = q("SELECT fuente, periodo, motivo, detalle, es_mes_reciente FROM bancos.f_faltantes('2026-09-29') WHERE fuente LIKE 'jeeves%%' ORDER BY fuente, periodo")
    pdf = [f for f in fs if f["fuente"] == "jeeves"]
    csvs = [f for f in fs if f["fuente"] == "jeeves_csv"]
    assert [f["periodo"] for f in pdf][0] == "2025-01" and pdf[-1]["periodo"] == "2026-08" and len(pdf) == 20
    assert [(f["periodo"], f["motivo"]) for f in csvs] == [("2025-12", "csv_anual"), ("2026-08", "csv_anual")]
    assert "el año completo" in csvs[0]["detalle"] and csvs[1]["es_mes_reciente"]


def test_jeeves_disponible_el_dia_habil_despues_del_estado(base_jeeves):
    # 1-sep-2026 es martes (Statement Date): el ciclo de agosto se puede pedir desde el miércoles 2
    assert str(uno("SELECT bancos.disponible_jeeves('2026-08')")) == "2026-09-02"
    per = [f["periodo"] for f in q("SELECT periodo FROM bancos.f_faltantes('2026-09-01') WHERE fuente='jeeves'")]
    assert per[-1] == "2026-07"                                   # el 1-sep todavía no se pide agosto
    per = [f["periodo"] for f in q("SELECT periodo FROM bancos.f_faltantes('2026-09-02') WHERE fuente='jeeves'")]
    assert per[-1] == "2026-08"


def test_pdf_y_csv_cierran_lo_que_piden_y_el_acuse_lo_dice(base_jeeves):
    cid = correr({"estado.pdf": J.pdf_jeeves(), "transacciones 2026-09-02.csv": J.csv_jeeves(J.csv_de_pdf())}, hoy=date(2026, 9, 29))
    fs = q("SELECT fuente, periodo FROM bancos.f_faltantes('2026-09-29') WHERE fuente LIKE 'jeeves%%'")
    assert ("jeeves", "2026-08") not in {(f["fuente"], f["periodo"]) for f in fs}
    assert ("jeeves_csv", "2026-08") not in {(f["fuente"], f["periodo"]) for f in fs}      # descargado el 2-sep: trae agosto completo
    assert ("jeeves_csv", "2025-12") in {(f["fuente"], f["periodo"]) for f in fs}
    d = uno("SELECT bancos.f_acuse(%s, '2026-09-29', 'prueba')", cid)
    tipos = {v["tipo"]: v for v in d["validados"]}
    assert tipos["jeeves"]["cuenta"] == "Jeeves, estado de cuenta" and tipos["jeeves"]["periodo"] == "2026-08"
    assert tipos["jeeves_csv"]["cuenta"] == "Jeeves, CSV de transacciones 2026" and tipos["jeeves_csv"]["csv"]["nuevas"] > 0
    a = render("acuse", d)
    assert "Balance Detail" in a["html"] and "se leyó completo" in a["html"]


def test_csv_viejo_no_cierra_el_mes_reciente(base_jeeves):
    correr({"transacciones 2026-08-15.csv": J.csv_jeeves(J.csv_de_pdf())}, hoy=date(2026, 9, 29))
    fs = {(f["fuente"], f["periodo"]) for f in q("SELECT fuente, periodo FROM bancos.f_faltantes('2026-09-29') WHERE fuente='jeeves_csv'")}
    assert ("jeeves_csv", "2026-08") in fs                        # descargado antes de que cerrara agosto


def test_solicitud_lista_jeeves_en_el_rezago(base_jeeves):
    d = uno("SELECT bancos.f_solicitud('2026-09-29', 'prueba', 'diario')")
    a = render("solicitud", d)
    assert "Jeeves, CSV de transacciones" in a["html"] and "falta el CSV de transacciones de 2025 (el año completo)" in a["html"]
    assert "Jeeves, estado de cuenta (PDF)" in a["html"]
    assert "Transacciones: exportar el CSV del año completo" in a["html"]
