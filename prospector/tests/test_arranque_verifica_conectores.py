"""El arranque verifica los conectores SOLO, y se detiene si uno esta caido.

El problema que cierra: el operador tenia que pedir aparte, en lenguaje natural,
que se corriera `listo` y que se probaran los tres conectores antes de escribir
la frase de arranque. Un prompt extra cada vez -- y si se le olvidaba, la corrida
arrancaba a ciegas.

La verificacion NO se puede mover a Python: los conectores viven detras de MCP y
desde aqui no se ven. Lo que si se mueve es la EXIGENCIA.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import json
import pytest

from flujo import orquestador as orq
from flujo.compuertas import CompuertaCerrada
from flujo.conectores import (Sondeo, Sonda, CONECTORES, VENTANA_MINUTOS,
                              ARCHIVO)


@pytest.fixture
def sesion(tmp_path, monkeypatch):
    """Una sesion limpia: la sonda y las corridas caen en tmp_path."""
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    return tmp_path


def _tres_vivos(s: Sondeo) -> Sondeo:
    s.registrar("odoo", True, "1 fila de res.partner")
    s.registrar("outlook", True, "12 hilos")
    s.registrar("websearch", True, "10 resultados")
    return s


# ======================================================= la sonda pide EVIDENCIA
def test_una_sonda_sin_evidencia_no_existe():
    """'vivo=True' sin decir QUE contesto es una declaracion, y las
    declaraciones son lo que esta herramienta no acepta."""
    with pytest.raises(CompuertaCerrada, match="sin evidencia"):
        Sonda(conector="odoo", vivo=True, evidencia="")
    with pytest.raises(CompuertaCerrada, match="sin evidencia"):
        Sonda(conector="odoo", vivo=True, evidencia="   ")


def test_un_conector_inventado_se_rechaza():
    with pytest.raises(CompuertaCerrada, match="desconocido"):
        Sonda(conector="telepatia", vivo=True, evidencia="algo")


def test_los_tres_conectores_son_los_tres_que_importan():
    assert set(CONECTORES) == {"odoo", "outlook", "websearch"}
    # webfetch NO esta: bloqueado por egress, y no detiene nada.
    assert "webfetch" not in CONECTORES


# ================================================= la compuerta del arranque
def test_sin_sondear_no_se_abre_la_corrida():
    s = Sondeo()
    assert s.faltan == ["odoo", "outlook", "websearch"]
    with pytest.raises(CompuertaCerrada) as e:
        s.exigir_listo()
    assert "sin sondear" in str(e.value)
    assert "./prospector conectores" in str(e.value), "dice el comando exacto"


def test_sondear_solo_dos_tampoco_alcanza():
    s = Sondeo()
    s.registrar("odoo", True, "1 fila")
    s.registrar("websearch", True, "10 resultados")
    with pytest.raises(CompuertaCerrada, match="outlook"):
        s.exigir_listo()


def test_con_los_tres_vivos_arranca_sin_preguntar_nada():
    s = _tres_vivos(Sondeo())
    s.exigir_listo()                     # no lanza
    assert s.listo
    assert s.caidos_sin_autorizar == []


def test_una_sonda_VIEJA_no_prueba_que_el_conector_este_vivo_AHORA():
    s = _tres_vivos(Sondeo())
    viejo = (datetime.now(timezone.utc)
             - timedelta(minutes=VENTANA_MINUTOS + 5)).isoformat()
    s.sondas["outlook"].ts = viejo
    assert not s.sondas["outlook"].fresca
    assert s.vencidas == ["outlook"]
    with pytest.raises(CompuertaCerrada, match="vencida"):
        s.exigir_listo()


def test_la_ventana_es_de_una_hora_y_esta_nombrada():
    assert VENTANA_MINUTOS == 60


# ============================================== un conector caido DETIENE y pregunta
def test_un_conector_caido_detiene_la_corrida_y_PREGUNTA():
    """No arranca a ciegas y no simula la fuente."""
    s = Sondeo()
    s.registrar("odoo", True, "1 fila de res.partner")
    s.registrar("outlook", False, "timeout MCP, no responde")
    s.registrar("websearch", True, "10 resultados")
    assert s.caidos_sin_autorizar == ["outlook"]
    with pytest.raises(CompuertaCerrada) as e:
        s.exigir_listo()
    msg = str(e.value)
    assert "OUTLOOK NO RESPONDE" in msg
    assert "PREGUNTA AL OPERADOR" in msg
    assert "seguir sin ese conector, o esperar" in msg
    assert "--continuar-sin outlook" in msg
    # Y dice POR QUE importa ese conector, no solo que se cayo.
    assert "anclas" in msg.lower()


def test_autorizar_seguir_sin_el_EXIGE_razon_escrita():
    s = Sondeo()
    s.registrar("outlook", False, "no responde")
    with pytest.raises(CompuertaCerrada, match="EXIGE razon"):
        s.registrar("outlook", False, "no responde", autorizado_sin=True)


def test_no_se_autoriza_un_hueco_de_un_conector_que_nadie_probo():
    s = Sondeo()
    with pytest.raises(CompuertaCerrada, match="sondea primero"):
        s.autorizar_sin("outlook", "porque yo digo")


def test_no_se_autoriza_un_hueco_de_un_conector_que_CONTESTO_bien():
    s = _tres_vivos(Sondeo())
    with pytest.raises(CompuertaCerrada, match="sondea primero"):
        s.autorizar_sin("outlook", "no lo quiero usar")


def test_con_el_hueco_autorizado_la_corrida_ya_puede_arrancar():
    s = Sondeo()
    s.registrar("odoo", True, "1 fila")
    s.registrar("outlook", False, "timeout MCP")
    s.registrar("websearch", True, "10 resultados")
    s.autorizar_sin("outlook", "la cuenta es fria, no esperamos historia")
    s.exigir_listo()                     # no lanza
    assert s.listo
    assert [x.conector for x in s.huecos_autorizados] == ["outlook"]


# ========================================================= de punta a punta
def test_prospecta_se_NIEGA_sin_sondeo(sesion, capsys):
    assert orq.main(["prospecta", "--empresa", "Grupo Cuprum"]) == 2
    assert "sin haber LLAMADO a los conectores" in capsys.readouterr().err
    assert not (sesion / "grupo-cuprum.json").exists(), "no abrio nada"


def test_prospecta_con_un_conector_caido_devuelve_3_y_pregunta(sesion, capsys):
    """Salida 3 es la MISMA que la pregunta de la empresa multiplanta: no es un
    error que arreglar, es una decision del operador."""
    orq.main(["conectores", "--odoo", "1 fila", "--outlook-caido",
              "timeout MCP", "--websearch", "10 resultados"])
    capsys.readouterr()
    assert orq.main(["prospecta", "--empresa", "Grupo Cuprum"]) == 3
    err = capsys.readouterr().err
    assert "OUTLOOK NO RESPONDE" in err and "PREGUNTA AL OPERADOR" in err
    assert not (sesion / "grupo-cuprum.json").exists()


def test_tras_autorizar_arranca_y_el_hueco_queda_DECLARADO(sesion, capsys):
    """Declarar el hueco es la mitad del metodo; anotarlo al margen no lo es.
    El modulo que depende del conector caido sale `sin_acceso` con razon, y eso
    viaja hasta el checklist de la ficha."""
    orq.main(["conectores", "--odoo", "1 fila", "--outlook-caido",
              "timeout MCP, no responde", "--websearch", "10 resultados"])
    orq.main(["conectores", "--continuar-sin", "outlook",
              "--razon", "cuenta fria, no esperamos historia"])
    capsys.readouterr()

    assert orq.main(["prospecta", "--empresa", "Grupo Cuprum",
                     "--ciudad", "San Nicolas de los Garza"]) == 0
    salida = capsys.readouterr().out
    assert "CONECTORES verificados antes de abrir" in salida
    assert "HUECO" in salida

    d = json.loads((sesion / "grupo-cuprum.json").read_text(encoding="utf-8"))
    assert d["cobertura"]["M0b"]["estado"] == "sin_acceso"
    assert "cuenta fria" in d["cobertura"]["M0b"]["razon"]
    assert any("SIN OUTLOOK" in a for a in d["avisos"])


def test_con_los_tres_vivos_prospecta_abre_sin_preguntar(sesion, capsys):
    orq.main(["conectores", "--odoo", "1 fila de res.partner",
              "--outlook", "12 hilos", "--websearch", "10 resultados"])
    capsys.readouterr()
    assert orq.main(["prospecta", "--empresa", "Grupo Cuprum",
                     "--ciudad", "San Nicolas de los Garza"]) == 0
    salida = capsys.readouterr().out
    assert "Corrida abierta" in salida
    assert "12 hilos" in salida, "imprime la evidencia, no un 'OK' pelado"
    d = json.loads((sesion / "grupo-cuprum.json").read_text(encoding="utf-8"))
    assert not any("SIN OUTLOOK" in a for a in d["avisos"])


def test_vivo_y_caido_a_la_vez_se_rechaza(sesion):
    with pytest.raises(SystemExit, match="las dos cosas no"):
        orq.main(["conectores", "--odoo", "1 fila", "--odoo-caido", "no responde"])


def test_continuar_sin_exige_razon_desde_la_linea_de_comandos(sesion):
    orq.main(["conectores", "--outlook-caido", "timeout"])
    with pytest.raises(SystemExit, match="EXIGE --razon"):
        orq.main(["conectores", "--continuar-sin", "outlook"])


def test_la_sonda_vive_FUERA_del_repo(sesion):
    from flujo.salida import raiz_del_repo
    s = _tres_vivos(Sondeo())
    ruta = s.guardar()
    assert ruta.name == ARCHIVO
    with pytest.raises(ValueError):
        ruta.relative_to(raiz_del_repo())


def test_listo_deja_de_decir_solo_claude_cuando_claude_ya_lo_comprobo(sesion):
    from flujo.arranque import chequeo
    filas = {q: (ok, det) for q, ok, det in chequeo(correr_pruebas=False)}
    assert filas["Outlook vivo (M0b)"][0] is None
    assert "sin sondear" in filas["Outlook vivo (M0b)"][1]

    _tres_vivos(Sondeo()).guardar()
    filas = {q: (ok, det) for q, ok, det in chequeo(correr_pruebas=False)}
    for etiqueta in ("Odoo vivo (M0)", "Outlook vivo (M0b)", "WebSearch vivo"):
        assert filas[etiqueta][0] is True, f"{etiqueta} sigue en [?]"
    assert "12 hilos" in filas["Outlook vivo (M0b)"][1]


def test_listo_marca_FALLA_cuando_un_conector_no_responde(sesion):
    from flujo.arranque import chequeo
    s = Sondeo()
    s.registrar("odoo", True, "1 fila")
    s.registrar("outlook", False, "timeout MCP")
    s.registrar("websearch", True, "10 resultados")
    s.guardar()
    filas = {q: (ok, det) for q, ok, det in chequeo(correr_pruebas=False)}
    assert filas["Outlook vivo (M0b)"][0] is False
    assert "NO RESPONDE" in filas["Outlook vivo (M0b)"][1]


def test_una_sonda_corrupta_vale_lo_mismo_que_ninguna(sesion):
    (sesion / ARCHIVO).write_text('{"sondas": {"odoo": {"basura": 1}}}',
                                  encoding="utf-8")
    s = Sondeo.cargar()
    assert "odoo" in s.faltan, "no se da por buena una sonda que no se entiende"


def test_webfetch_bloqueado_NO_detiene_el_arranque(sesion, capsys):
    """M7 y M8 salen sin_acceso y eso es correcto, no una falla."""
    orq.main(["conectores", "--odoo", "1 fila", "--outlook", "12 hilos",
              "--websearch", "10 resultados"])
    salida = capsys.readouterr().out
    assert "webfetch" in salida and "NO detiene nada" in salida
    assert orq.main(["prospecta", "--empresa", "Grupo Cuprum",
                     "--ciudad", "San Nicolas de los Garza"]) == 0
