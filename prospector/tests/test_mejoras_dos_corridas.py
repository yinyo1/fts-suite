"""Las cuatro mejoras que dejaron las DOS corridas reales del operador:
Coficab (#268) y las cuatro plantas en paralelo.

Las dos de fondo -- que la ficha sobreviva a la sesion, y guardar por empresa +
planta-- salieron de perder trabajo. Las dos de comodidad, de verlo trabajar.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import json
import os
import time
import pytest

from flujo import orquestador as orq
from flujo.compuertas import CompuertaCerrada
from flujo.confianza import Contacto
from flujo.estado import Corrida


@pytest.fixture
def sesion(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    return tmp_path


def _sondas_ok():
    from flujo.conectores import Sondeo
    s = Sondeo()
    s.registrar("odoo", True, "1 fila")
    s.registrar("outlook", True, "12 hilos")
    s.registrar("websearch", True, "10 resultados")
    s.guardar()


def _lista_para_ficha(sesion, empresa="Coficab", ciudad="Pesqueria") -> Corrida:
    c = Corrida(empresa=empresa, ciudad=ciudad, giro="cables")
    c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de Mantenimiento",
                       empresa=empresa, cercania_decision=10))
    c.challenge_corrido = True
    c.guardar(orq._ruta(empresa, ciudad))
    return c


# ============================== MEJORA 2 · empresa + planta, nativo
def test_cuatro_plantas_de_una_empresa_NO_se_pisan(sesion):
    """El operador tuvo que inventar 'Coficab Juarez' y 'Coficab Durango' para
    que cuatro plantas no se sobrescribieran. Ya no hace falta."""
    _sondas_ok()
    for ciudad in ("Cd. Juarez", "Durango", "Silao", "Pesqueria"):
        assert orq.main(["prospecta", "--empresa", "Coficab",
                         "--ciudad", ciudad]) == 0
    archivos = sorted(p.name for p in (sesion / "coficab").glob("*.json"))
    assert archivos == ["cd-juarez.json", "durango.json", "pesqueria.json",
                        "silao.json"]


def test_la_empresa_guardada_es_la_REAL_no_el_compuesto(sesion):
    """El cruce con el padron y el nombre de la ficha usan la empresa, no
    'Coficab Durango'."""
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    d = json.loads((sesion / "coficab" / "durango.json").read_text(encoding="utf-8"))
    assert d["empresa"] == "Coficab"
    assert d["ciudad"] == "Durango"


def test_los_acentos_no_abren_una_segunda_corrida(sesion):
    """'Pesqueria' y 'Pesqueria' con acento son la MISMA planta."""
    assert orq._slug("Pesquería") == orq._slug("Pesqueria") == "pesqueria"
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Pesquería"])
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Pesqueria"])
    assert len(list((sesion / "coficab").glob("*.json"))) == 1


def test_sin_ciudad_y_con_varias_plantas_se_NIEGA_en_vez_de_elegir(sesion):
    _sondas_ok()
    for ciudad in ("Durango", "Silao"):
        orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", ciudad])
    with pytest.raises(SystemExit, match="no dijiste cual"):
        orq._cargar("Coficab")


def test_sin_ciudad_y_con_UNA_sola_planta_la_encuentra(sesion):
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    c = orq._cargar("Coficab")
    assert c.ciudad == "Durango"


def test_una_corrida_VIEJA_plana_sigue_abriendose(sesion):
    """Hay corridas vivas guardadas con el esquema plano. Romperlas seria perder
    trabajo del operador."""
    vieja = Corrida(empresa="Coficab Durango", ciudad="Durango")
    vieja.guardar(str(sesion / "coficab-durango.json"))
    c = orq._cargar("Coficab Durango")
    assert c.ciudad == "Durango"


def test_una_corrida_vieja_se_guarda_DONDE_ESTABA(sesion):
    """Mover el archivo a media corrida del operador seria peor que el esquema
    viejo."""
    vieja = Corrida(empresa="Coficab Durango", ciudad="Durango")
    plano = str(sesion / "coficab-durango.json")
    vieja.guardar(plano)

    class _A:
        ciudad = None
    c = orq._cargar("Coficab Durango")
    assert orq._ruta_de(c, _A()) == plano
    assert not (sesion / "coficab-durango").exists()


def test_la_ficha_de_cada_planta_tiene_su_PROPIO_archivo(sesion, capsys):
    """Con el nombre plano las cuatro plantas escribian la misma
    `<empresa>-limpio.html` y se pisaban: el mismo defecto, un paso mas abajo."""
    for ciudad in ("Durango", "Pesqueria"):
        _lista_para_ficha(sesion, ciudad=ciudad)
        orq.main(["ficha", "--empresa", "Coficab", "--ciudad", ciudad,
                  "--modo", "limpio"])
    capsys.readouterr()
    htmls = sorted(p.name for p in (sesion / "coficab").glob("*-limpio.html"))
    assert htmls == ["durango-limpio.html", "pesqueria-limpio.html"]


# ==================== MEJORA 1 · la ficha tiene que sobrevivir a la sesion
def test_la_ficha_recien_emitida_avisa_que_NO_sobrevive(sesion, capsys):
    _lista_para_ficha(sesion)
    assert orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--modo", "limpio"]) == 4, "codigo 4: paso pendiente"
    err = capsys.readouterr().err
    assert "ENTREGA PENDIENTE" in err
    assert "MUERE al cerrar la sesion" in err
    assert "sharepoint_upload_file" in err, "dice el conector exacto"
    assert "./prospector entregar" in err, "dice el comando exacto"


def test_el_aviso_dice_que_por_correo_NO_se_puede(sesion, capsys):
    """Medido, no supuesto: el `outlook_send_mail` conectado no tiene parametro
    de adjuntos, y el cuerpo se sanea quitando <style>."""
    _lista_para_ficha(sesion)
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
              "--modo", "limpio"])
    assert "no tiene" in capsys.readouterr().err
    assert "correo" not in Corrida.DESTINOS


def test_los_destinos_evaluados_son_tres_y_onedrive_es_el_primero():
    assert Corrida.DESTINOS == ("onedrive", "drive", "otro")


def test_registrar_la_entrega_calla_el_aviso(sesion, capsys):
    _lista_para_ficha(sesion)
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
              "--modo", "limpio"])
    assert orq.main(["entregar", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--destino", "onedrive",
                     "--url", "https://ejemplo/ficha.html"]) == 0
    capsys.readouterr()
    c = orq._cargar("Coficab", "Pesqueria")
    assert c.entregada
    assert not c.entrega_pendiente


def test_la_entrega_sobrevive_al_disco(sesion):
    """Misma familia de defecto que `modulo_origen` en #295: un campo que se
    escribe y no se restaura."""
    _lista_para_ficha(sesion)
    c = orq._cargar("Coficab", "Pesqueria")
    c.registrar_entrega("onedrive", "https://ejemplo/f.html")
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq._cargar("Coficab", "Pesqueria").entregada


def test_una_entrega_sin_liga_no_es_una_entrega():
    c = Corrida(empresa="X", ciudad="Y")
    with pytest.raises(CompuertaCerrada, match="sin URL"):
        c.registrar_entrega("onedrive", "")


def test_un_destino_inventado_se_rechaza():
    c = Corrida(empresa="X", ciudad="Y")
    with pytest.raises(CompuertaCerrada, match="desconocido"):
        c.registrar_entrega("telegrama", "https://x")


def test_si_la_ficha_se_re_emite_DESPUES_la_entrega_queda_VIEJA(sesion, capsys):
    """Una copia vieja en OneDrive es peor que ninguna: el operador se la manda
    a un tercero creyendo que es la ultima."""
    _lista_para_ficha(sesion)
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
              "--modo", "limpio"])
    orq.main(["entregar", "--empresa", "Coficab", "--ciudad", "Pesqueria",
              "--destino", "onedrive", "--url", "https://ejemplo/f.html"])
    assert not orq._cargar("Coficab", "Pesqueria").entrega_pendiente

    time.sleep(1.1)          # el mtime tiene resolucion de segundo
    assert orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--modo", "limpio"]) == 4
    assert "ENTREGA PENDIENTE" in capsys.readouterr().err


def test_no_entregarla_EXIGE_razon_y_queda_escrito(sesion, capsys):
    _lista_para_ficha(sesion)
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
              "--modo", "limpio"])
    with pytest.raises(SystemExit, match="EXIGE --razon"):
        orq.main(["entregar", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                  "--sin-entregar", "--razon", ""])
    assert orq.main(["entregar", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--sin-entregar", "--razon", "prueba, se va a rehacer"]) == 0
    c = orq._cargar("Coficab", "Pesqueria")
    assert c.entrega["declarada"] and "rehacer" in c.entrega["razon"]
    assert not c.entrega_pendiente, "ya se dijo que no se saca"
    assert not c.entregada


def test_la_ficha_sigue_sin_poder_escribirse_en_el_repo(sesion):
    from flujo.salida import raiz_del_repo
    _lista_para_ficha(sesion)
    repo = raiz_del_repo()
    assert orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--modo", "limpio", "--salida",
                     str(repo / "ficha.html")]) == 2
    assert not (repo / "ficha.html").exists()


# ================================ MEJORA 3 · pytest no da falla falsa
def test_si_falta_pytest_el_chequeo_dice_NO_VERIFICADO_no_FALLA(monkeypatch):
    """Las dos corridas reales vieron FALLA aqui y no era cierto: el contenedor
    no trae pytest. NO VERIFICADO no es FALLA -- es la misma distincion que la
    herramienta hace en todas partes--."""
    from flujo import arranque
    # Sin esto la prueba NO prueba nada: cuando `listo` corre la suite pone
    # PROSPECTOR_CHEQUEO_EN_CURSO=1, `chequeo()` toma la rama de --rapido antes
    # de llegar a la de pytest, y la prueba pasaba sin ejercitar su codigo. Lo
    # destapo `./prospector listo`, corriendo la suite como la corre de verdad.
    monkeypatch.delenv(arranque.GUARDA_RECURSION, raising=False)
    monkeypatch.setattr(arranque, "hay_pytest", lambda: False)
    monkeypatch.setattr(arranque, "instalar_pytest", lambda: False)
    filas = {q: (ok, det) for q, ok, det in arranque.chequeo(correr_pruebas=True)}
    ok, det = filas["Pruebas en verde"]
    assert ok is None, "None (no verificado), NUNCA False (falla)"
    assert "NO SE PUDO VERIFICAR" in det
    assert "No es una falla de la herramienta" in det
    assert "pip install pytest" in det, "dice como arreglarlo a mano"


def test_si_pytest_se_puede_instalar_se_instala_y_se_corre(monkeypatch):
    llamado = []
    from flujo import arranque
    monkeypatch.delenv(arranque.GUARDA_RECURSION, raising=False)
    monkeypatch.setattr(arranque, "hay_pytest", lambda: False)
    monkeypatch.setattr(arranque, "instalar_pytest",
                        lambda: llamado.append(1) or True)

    class _R:
        returncode = 0
        stdout = "259 passed in 0.5s"
    monkeypatch.setattr(arranque.subprocess, "run", lambda *a, **k: _R())
    filas = {q: (ok, det) for q, ok, det in arranque.chequeo(correr_pruebas=True)}
    assert llamado, "intento instalarlo"
    assert filas["Pruebas en verde"][0] is True


def test_instalar_pytest_no_hace_nada_si_ya_esta(monkeypatch):
    from flujo import arranque
    monkeypatch.setattr(arranque, "hay_pytest", lambda: True)
    def _no(*a, **k):
        raise AssertionError("no debe llamar a pip si pytest ya esta")
    monkeypatch.setattr(arranque.subprocess, "run", _no)
    assert arranque.instalar_pytest() is True


# ============================ MEJORA 4 · estado legible de corridas en curso
def test_estado_sin_empresa_resume_TODAS_las_corridas(sesion, capsys):
    """Con corridas en paralelo el operador solo veia 'N tareas en ejecucion'."""
    _sondas_ok()
    for ciudad in ("Durango", "Pesqueria", "Silao"):
        orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", ciudad])
    capsys.readouterr()
    assert orq.main(["estado"]) == 0
    salida = capsys.readouterr().out
    assert "CORRIDAS EN LA SESION · 3" in salida
    for ciudad in ("Durango", "Pesqueria", "Silao"):
        assert ciudad in salida
    for columna in ("gasto", "bloques", "modulo", "chao1", "ficha"):
        assert columna in salida


def test_el_resumen_dice_el_modulo_EN_CURSO(sesion, capsys):
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    c = orq._cargar("Coficab", "Durango")
    for m in ("M0", "M0b", "M0c"):
        c.cerrar_modulo(m, "sin_acceso", "prueba")
    c.guardar(orq._ruta("Coficab", "Durango"))
    capsys.readouterr()
    orq.main(["estado"])
    fila = [l for l in capsys.readouterr().out.splitlines() if "Durango" in l][0]
    assert " M3 " in fila, "M13 cerrado por el padron, sigue M3"


def test_el_resumen_GRITA_cuando_una_ficha_no_se_entrego(sesion, capsys):
    _lista_para_ficha(sesion, ciudad="Durango")
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Durango",
              "--modo", "limpio"])
    capsys.readouterr()
    orq.main(["estado"])
    salida = capsys.readouterr().out
    assert "SIN ENTREGAR" in salida
    assert "se pierden al cerrar la sesion" in salida


def test_el_resumen_muestra_la_ficha_ya_entregada(sesion, capsys):
    _lista_para_ficha(sesion, ciudad="Durango")
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Durango",
              "--modo", "limpio"])
    orq.main(["entregar", "--empresa", "Coficab", "--ciudad", "Durango",
              "--destino", "onedrive", "--url", "https://ejemplo/f.html"])
    capsys.readouterr()
    orq.main(["estado"])
    salida = capsys.readouterr().out
    assert "ENTREGADA (onedrive)" in salida
    assert "se pierden al cerrar" not in salida


def test_el_resumen_incluye_las_corridas_viejas_planas(sesion, capsys):
    Corrida(empresa="Coficab Durango", ciudad="Durango").guardar(
        str(sesion / "coficab-durango.json"))
    capsys.readouterr()
    orq.main(["estado"])
    assert "Coficab Durango" in capsys.readouterr().out


def test_sin_corridas_lo_dice_y_no_revienta(sesion, capsys):
    assert orq.main(["estado"]) == 0
    salida = capsys.readouterr().out
    assert "Sin corridas en esta sesion" in salida
    assert "prospecta" in salida


def test_el_resumen_no_confunde_la_sonda_con_una_corrida(sesion, capsys):
    _sondas_ok()
    capsys.readouterr()
    orq.main(["estado"])
    assert "Sin corridas" in capsys.readouterr().out
