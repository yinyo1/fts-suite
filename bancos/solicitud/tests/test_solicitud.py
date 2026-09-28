"""bancos_0002: calendario, faltantes, solicitud en cuatro escenarios, acuses, vistas y rol lector."""
import json
import re
import subprocess
from datetime import date
from pathlib import Path

import pytest
from conftest import admin

from fts_bancos import pipeline
from fts_bancos.db import conexion
from test_pipeline import lote

AQUI = Path(__file__).resolve().parent


def correr(archivos, origen="cron", hoy=date(2026, 9, 15)):
    with conexion() as con:
        cid = pipeline.abrir_corrida(con, origen)
    for nombre, datos in archivos.items():
        with conexion() as con:
            pipeline.procesar_archivo(con, datos, nombre, {"origen": "buzon"}, cid, pipeline.catalogo_db(con), pipeline.reglas_db(con))
    with conexion() as con:
        pipeline.cerrar_corrida(con, cid, pipeline.catalogo_db(con), graph_ok=True, hoy=hoy)
    return cid


def q(sql, *args):
    with conexion() as con, con.cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchall()


def uno(sql, *args):
    r = q(sql, *args)[0]
    return next(iter(r.values()))


def render(tipo, datos, **kw):
    r = subprocess.run(["node", str(AQUI / "render.js")], input=json.dumps({"tipo": tipo, "datos": datos, **kw}, default=str),
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def registrar(correo, modo="prueba", corrida=None, hoy="2026-10-01"):
    with conexion() as con, con.cursor() as cur:
        cur.execute("""INSERT INTO bancos.correos (tipo, modo, hoy, message_id, in_reply_to, thread_index, asunto, para, cc,
                         total_abiertos, corrida_id, graph_status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,202)""",
                    (correo["tipo"], modo, hoy, correo["message_id"], correo["in_reply_to"], correo["thread_index"],
                     correo["asunto"], correo["para"], correo["cc"], correo["total_abiertos"], corrida))


# ── calendario ──
@pytest.mark.parametrize("hoy,esperado", [
    ("2026-09-30", "2026-08"), ("2026-10-01", "2026-09"),       # jue 1-oct es hábil
    ("2027-01-01", "2026-11"), ("2027-01-03", "2026-11"),       # 1-ene inhábil, 2 y 3 fin de semana
    ("2027-01-04", "2026-12"),                                   # primer hábil de enero 2027
    ("2026-11-30", "2026-10"), ("2026-12-01", "2026-11"),
])
def test_periodo_exigible(base, hoy, esperado):
    assert uno("SELECT bancos.periodo_exigible(%s::date)", hoy) == esperado


def test_dias_inhabiles_y_habiles(base):
    assert uno("SELECT bancos.es_dia_habil('2026-11-16')") is False     # tercer lunes de noviembre
    assert uno("SELECT bancos.es_dia_habil('2026-09-29')") is True       # martes del gate
    assert uno("SELECT bancos.primer_habil_semana('2026-11-18')") == date(2026, 11, 17)
    assert uno("SELECT bancos.dias_habiles('2026-10-01','2026-10-01')") == 1
    assert uno("SELECT count(*) FROM bancos.dias_inhabiles WHERE fecha BETWEEN '2026-01-01' AND '2027-12-31'") >= 20


# ── faltantes ──
def test_faltantes_desde_la_base(base):
    correr(lote())
    fs = q("SELECT fuente, periodo, motivo, es_mes_reciente, dias_habiles FROM bancos.f_faltantes('2026-09-15')")
    pares = {(f["fuente"], f["periodo"], f["motivo"]) for f in fs}
    # julio de General y junio de Nómina no llegaron; Payana y Jeeves de agosto tampoco. USD completo.
    assert pares == {("general", "2026-07", "faltante"), ("nomina", "2026-06", "faltante"),
                     ("payana", "2026-08", "faltante"), ("jeeves", "2026-08", "faltante")}
    reciente = {f["fuente"] for f in fs if f["es_mes_reciente"]}
    assert reciente == {"payana", "jeeves"}
    # julio 2026 es exigible desde el 3-ago (1-ago sábado): del 3-ago al 15-sep hay 31 hábiles (sin el 16-sep)
    jul = next(f for f in fs if f["fuente"] == "general")
    assert jul["dias_habiles"] == uno("SELECT bancos.dias_habiles('2026-08-03','2026-09-15')") == 32


def test_mes_no_disponible_no_cuenta(base):
    correr(lote())
    # el 30-sep septiembre todavía no se pide; el 1-oct sí
    assert uno("SELECT count(*) FROM bancos.f_faltantes('2026-09-30') WHERE periodo='2026-09'") == 0
    assert uno("SELECT count(*) FROM bancos.f_faltantes('2026-10-01') WHERE periodo='2026-09'") == 5


def test_rechazo_y_conflicto_siguen_abiertos(base):
    from fixtures import escenario, pdf_estado
    import fixtures as F
    correr(lote())
    E = escenario()
    # otra versión de agosto de USD con un movimiento distinto -> conflicto de versión
    e = E["usd_2026-08"]
    e2 = F.Estado(e.numero, e.clabe, e.anio, e.mes, e.saldo_inicial, movs=list(e.movs[:-1]))
    correr({"USD agosto v2.pdf": pdf_estado(e2)})
    fs = q("SELECT fuente, periodo, motivo, archivo, sha256 FROM bancos.f_faltantes('2026-09-15') WHERE fuente='usd'")
    assert [(f["periodo"], f["motivo"]) for f in fs] == [("2026-08", "conflicto_version")]
    assert fs[0]["archivo"] == "USD agosto v2.pdf" and len(fs[0]["sha256"]) == 64
    # una persona lo revisa: se cierra
    admin("INSERT INTO bancos.revisiones_manuales (fuente, periodo, motivo, nota, revisado_por) "
          "VALUES ('usd','2026-08','conflicto_version','prueba','test')", base)
    assert uno("SELECT count(*) FROM bancos.f_faltantes('2026-09-15') WHERE fuente='usd'") == 0


# ── solicitud: los cuatro escenarios ──
def test_escenario_1_primer_dia_habil(base):
    correr(lote())
    d = uno("SELECT bancos.f_solicitud('2026-10-01','prueba')")
    assert d["tipo"] == "solicitud" and d["razon"] == "primer día hábil del mes" and d["periodo_reciente"] == "2026-09"
    assert d["total"] == 2 + 5 + 2   # rezago (jul General, jun Nómina, ago Payana/Jeeves) + septiembre de las 5
    c = render("solicitud", d, url="https://ejemplo.invalid/buzon")
    assert c["asunto"] == f"Estados de cuenta FTS: faltan {d['total']} (el más antiguo lleva {d['mas_antiguo_dias']} días hábiles)"
    assert "Mes recién cerrado: septiembre 2026" in c["html"] and "Rezago" in c["html"]
    assert "Cómo descargarlos y subirlos" in c["html"] and "responde este correo" in c["html"]
    assert "ejemplo.invalid/buzon" in c["html"]
    assert "estado protegido.pdf" in c["html"] and "el PDF tiene contraseña" in c["html"]
    assert "—" not in c["html"] and "–" not in c["html"]
    assert c["para"] == ["gerardo@fts.mx"] and c["cc"] == ["estebandelacruz@fts.mx", "erick@fts.mx"]
    assert "From: sales@fts.mx" in c["mime"] and "Message-ID: <fts-bancos.solicitud.20261001." in c["mime"]
    assert not re.search(r"\d{8,}", c["html"])   # nada con forma de cuenta completa


def test_escenario_2_dia_intermedio_y_una_vez_al_dia(base):
    correr(lote(), origen="fixture")      # una corrida que no es lectura del buzón
    d = uno("SELECT bancos.f_solicitud('2026-10-02','prueba')")
    assert d["tipo"] == "solicitud" and d["razon"] == "día hábil con faltantes abiertos"
    assert uno("SELECT bancos.f_solicitud('2026-10-03','prueba')")["tipo"] == "nada"   # sábado
    # en modo real: sin lectura del buzón en 26 h no se le escribe a Gerardo
    assert uno("SELECT bancos.f_solicitud('2026-10-02','real')")["tipo"] == "aviso_esteban"
    admin("INSERT INTO bancos.corridas (origen, parser_version, terminada_at, graph_ok) VALUES ('cron','x', now(), true)", base)
    real = uno("SELECT bancos.f_solicitud('2026-10-02','real')")
    assert real["tipo"] == "solicitud"
    registrar(render("solicitud", real), modo="real", hoy="2026-10-02")
    assert uno("SELECT bancos.f_solicitud('2026-10-02','real')")["razon"] == "ya salió un correo hoy"
    assert uno("SELECT bancos.f_solicitud('2026-09-28','real')")["razon"].startswith("antes de")


def test_escenario_3_rezago_semanal(base):
    correr(lote())
    mar = uno("SELECT bancos.f_solicitud('2026-10-06','prueba','semanal')")     # martes
    lun = uno("SELECT bancos.f_solicitud('2026-10-05','prueba','semanal')")     # lunes
    assert all(f["es_mes_reciente"] for f in mar["faltantes"]) and mar["rezago_omitido"] == 4
    assert len(lun["faltantes"]) == lun["total"] and lun["rezago_omitido"] == 0
    assert mar["total"] == lun["total"]      # el asunto cuenta todo lo abierto
    c = render("solicitud", mar)
    assert "se listan completos en la solicitud del primer día hábil de cada semana" in c["html"]
    # 17-nov: el lunes 16 es inhábil, el martes toma su lugar
    assert uno("SELECT bancos.f_solicitud('2026-11-17','prueba','semanal')")["es_primer_habil_semana"] is True
    # parámetro guardado
    admin("UPDATE bancos.parametros SET valor='semanal' WHERE clave='rezago_frecuencia'", base)
    assert uno("SELECT bancos.f_solicitud('2026-10-06','prueba')")["frecuencia"] == "semanal"


def _solo_usd(base):
    admin("UPDATE bancos.fuentes_solicitud SET activa = (clave = 'usd')", base)


def test_escenario_4_todo_completo_manda_final_y_calla(base):
    correr(lote())
    _solo_usd(base)
    admin("UPDATE bancos.parametros SET valor='2026-09-01' WHERE clave='solicitud_desde'", base)
    admin("INSERT INTO bancos.corridas (origen, parser_version, terminada_at, graph_ok) VALUES ('cron','x', now(), true)", base)
    # antes hubo una solicitud real
    registrar({"tipo": "solicitud", "message_id": "<x@fts.mx>", "in_reply_to": None, "thread_index": None, "asunto": "a",
               "para": ["gerardo@fts.mx"], "cc": [], "total_abiertos": 1}, modo="real", hoy="2026-09-14")
    d = uno("SELECT bancos.f_solicitud('2026-09-15','real')")
    assert d["total"] == 0 and d["tipo"] == "final"
    c = render("solicitud", d)
    assert c["tipo"] == "final" and "al día hasta agosto 2026" in c["asunto"]
    assert "no hace falta nada más hasta el primer día hábil de septiembre 2026" not in c["html"]
    assert "no hace falta nada más hasta el primer día hábil de octubre 2026 (1 de octubre de 2026)" in c["html"]
    registrar(c, modo="real", hoy="2026-09-15")
    for dia in ("2026-09-17", "2026-09-18", "2026-09-21"):
        assert uno("SELECT bancos.f_solicitud(%s::date,'real')", dia)["tipo"] == "nada"


# ── acuses ──
def test_acuse_tanda_con_duplicado_y_rechazo(base):
    cid = correr(lote())
    d = uno("SELECT bancos.f_acuse(%s, '2026-09-15', 'prueba')", cid)
    assert len(d["validados"]) == 22
    assert any(x["archivo"] == "copia GEN 01.pdf" for x in d["duplicados"])
    nombres = {x["archivo"] for x in d["rechazados"]}
    assert {"estado protegido.pdf", "escaneo.pdf", "factura.pdf", "ajeno.pdf", "raro.pdf"} <= nombres
    assert any("fuera.pdf" in n for n in nombres)                 # pieza del ZIP con ruta insegura
    jul = next(v for v in d["validados"] if v["archivo"] == "JUL 26 FTS MX.pdf")
    assert jul["periodo"] == "2026-08" and jul["zip"] == "General 2026.zip"
    assert "es agosto 2026, no julio 2026" in (jul["aviso"] or "")      # aviso guardado por la ingesta en corrida_eventos
    # el hilo: primero una solicitud de prueba, el acuse responde a ella
    sol = render("solicitud", uno("SELECT bancos.f_solicitud('2026-10-01','prueba')"))
    registrar(sol)
    d = uno("SELECT bancos.f_acuse(%s, '2026-10-01', 'prueba')", cid)
    a = render("acuse", d, ms=sol_ms() + 3600_000)
    assert a["tipo"] == "acuse" and a["asunto"] == "RE: " + sol["asunto"]
    assert a["in_reply_to"] == sol["message_id"]
    assert f"In-Reply-To: {sol['message_id']}" in a["mime"] and f"References: {sol['message_id']}" in a["mime"]
    assert a["thread_index"].startswith(sol["thread_index"][:28])    # Thread-Index hijo: mismo prefijo de 22 bytes
    assert len(bytes(__import__("base64").b64decode(a["thread_index"]))) == 27
    assert "cuadra al centavo contra el resumen del banco" in a["html"] and "copia GEN 01.pdf" in a["html"]
    assert "el PDF tiene contraseña" in a["html"] and "Faltan <b>" in a["html"]
    assert "Aviso: el archivo &#x27;JUL 26 FTS MX.pdf&#x27;" in a["html"] or "Aviso: el archivo 'JUL 26 FTS MX.pdf'" in a["html"]


def sol_ms():
    from datetime import datetime, timezone   # 2026-10-01 15:00 UTC, el mismo que usa render.js por omisión
    return int(datetime(2026, 10, 1, 15, tzinfo=timezone.utc).timestamp() * 1000)


def test_acuse_tanda_toda_validada(base):
    correr(lote())
    from fixtures import escenario, pdf_estado
    E = escenario()
    cid = correr({"julio general.pdf": pdf_estado(E["general_2026-07"])})
    d = uno("SELECT bancos.f_acuse(%s, '2026-09-15', 'prueba')", cid)
    assert [v["periodo"] for v in d["validados"]] == ["2026-07"] and not d["rechazados"] and not d["duplicados"]
    assert d["total"] == 3     # queda Nómina junio + Payana y Jeeves agosto
    a = render("acuse", d)
    assert a["tipo"] == "acuse" and "Faltan <b>3</b>" in a["html"]


def test_acuse_que_completa_todo(base):
    from fixtures import escenario, pdf_estado
    _solo_usd(base)
    E = escenario()
    correr({f"USD {m:02d}.pdf": pdf_estado(E[f"usd_2026-{m:02d}"]) for m in range(1, 8)})
    cid = correr({"USD 08.pdf": pdf_estado(E["usd_2026-08"])})
    d = uno("SELECT bancos.f_acuse(%s, '2026-09-15', 'prueba')", cid)
    assert d["total"] == 0
    a = render("acuse", d)
    assert a["tipo"] == "final"
    assert "Estados de cuenta FTS al día hasta agosto 2026. Gracias, no hace falta nada más hasta el primer día hábil de octubre 2026" in a["html"]


def test_acuse_sin_nada_reconocible(base):
    from fixtures import pdf_texto
    cid = correr({"nota.pdf": pdf_texto(["Hola", "esto no es nada"])})
    d = uno("SELECT bancos.f_acuse(%s, '2026-09-15', 'prueba')", cid)
    assert not d["validados"] and [r["archivo"] for r in d["rechazados"]] == ["nota.pdf"]
    a = render("acuse", d)
    assert "no es un estado de cuenta" in a["html"]


def test_corridas_sin_acuse(base):
    cid = correr(lote())
    assert [r["corrida_id"] for r in q("SELECT * FROM bancos.f_corridas_sin_acuse()")] == [cid]
    a = render("acuse", uno("SELECT bancos.f_acuse(%s, '2026-09-15')", cid))
    registrar(a, modo="real", corrida=cid)
    assert q("SELECT * FROM bancos.f_corridas_sin_acuse()") == []


# ── vistas y rol ──
def test_vistas_rastreables_y_rol_lector(base):
    correr(lote())
    admin("GRANT bancos_lector TO postgres", base)
    out = admin("""SET ROLE bancos_lector;
      SELECT (SELECT count(*) FROM bancos.v_estados_validados) || '|' ||
             (SELECT count(*) FROM bancos.v_movimientos_validados WHERE archivo IS NULL OR pagina IS NULL OR length(sha256) <> 64) || '|' ||
             (SELECT count(*) FROM bancos.v_movimientos_validados) || '|' ||
             (SELECT count(*) FROM bancos.v_saldos_mensuales) || '|' ||
             (SELECT count(*) FROM bancos.v_faltantes) || '|' ||
             (SELECT count(*) FROM bancos.v_cotejo_odoo);""", base).strip()
    est, sin_rastro, movs, saldos, falt, cot = map(int, out.split("|"))
    assert est == 22 and sin_rastro == 0 and movs > 0 and saldos == 22 and falt >= 4 and cot == 0
    for prohibido in ("SELECT 1 FROM bancos.estados LIMIT 1", "SELECT 1 FROM bancos.movimientos LIMIT 1",
                      "SELECT bancos.f_solicitud('2026-10-01')", "INSERT INTO bancos.correos DEFAULT VALUES",
                      "SELECT 1 FROM bancos.blobs LIMIT 1"):
        with pytest.raises(Exception) as e:
            admin("SET ROLE bancos_lector; " + prohibido, base)
        assert "permission denied" in str(e.value.stderr)


def test_saldos_mensuales_cuadran(base):
    correr(lote())
    r = q("""SELECT count(*) FILTER (WHERE saldo_final <> saldo_inicial + total_abonos - total_cargos) AS malos,
                    count(*) FILTER (WHERE abonos_externos + abonos_traspaso_interno <> total_abonos) AS malos2 FROM bancos.v_saldos_mensuales""")[0]
    assert r["malos"] == 0 and r["malos2"] == 0


def test_la_app_no_edita_configuracion(base):
    for sql in ("UPDATE bancos.parametros SET valor='semanal'", "INSERT INTO bancos.dias_inhabiles VALUES ('2026-10-12','x','y',true)",
                "DELETE FROM bancos.correos"):
        with pytest.raises(Exception) as e:
            with conexion() as con, con.cursor() as cur:
                cur.execute(sql)
        assert "permission denied" in str(e.value)
