"""El buzon y Odoo van ANTES de gastar, y la ficha lo pone arriba (#355, tarea 6).

La corrida de #353 lo demostro dos veces, y las dos fueron gratis:

  * el hueco de Metalsa llevaba un mes declarado proponiendo cerrarse «con una
    consulta dirigida de prensa, que cuesta una consulta web», y lo cerro un
    correo de camara que estaba en el buzon desde el 24-jul;
  * la via interna dio cuatro personas que YA le habian escrito a FTS -- correo
    verificado, hilo abierto-- y ninguna de las cuatro estaba en la planilla del
    humano con Sales Navigator.

El orden ya estaba en `OLAS`. Lo que faltaba era la compuerta: nada impedia
registrar una consulta de red con la ola 0 abierta.
"""
from __future__ import annotations

import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from flujo import orquestador as orq  # noqa: E402
from flujo.compuertas import CompuertaCerrada  # noqa: E402
from flujo.estado import OLAS, Corrida  # noqa: E402


def _c():
    return Corrida(empresa="Zeta", ciudad="Monterrey", giro="alimentos")


# --------------------------------------------------------------- el orden
def test_la_ola_0_es_la_primera_y_son_los_tres_modulos_internos():
    clave, _titulo, modulos = OLAS[0]
    assert clave == "ola0_internas"
    assert modulos == ["M0", "M0b", "M0c"]


def test_la_ola_0_va_antes_de_cualquier_modulo_de_red():
    """M3, M1, M2 y M12 son de red y viven en la ola 1, detras."""
    orden = [m for _c, _t, ms in OLAS for m in ms]
    for interno in ("M0", "M0b", "M0c"):
        for de_red in ("M1", "M2", "M3", "M12", "M5"):
            assert orden.index(interno) < orden.index(de_red), (interno, de_red)


def test_el_primer_paso_de_una_corrida_nueva_es_M0():
    assert _c().siguiente_paso()["modulo"] == "M0"


# ----------------------------------------------------------- la compuerta
def test_la_compuerta_rechaza_una_consulta_de_red_con_la_ola_0_abierta():
    c = _c()
    with pytest.raises(CompuertaCerrada) as e:
        c.exigir_ola0_antes_de_gastar_red("M5", "buscador")
    msg = str(e.value)
    assert "OLA 0 sigue abierta" in msg
    assert "M0, M0b, M0c" in msg
    # La razon medida va en el mensaje: un mensaje que solo dice «no puedes» se
    # lee como burocracia y el que lo recibe busca como rodearlo.
    assert "Metalsa" in msg and "24-jul" in msg
    assert "gratis" in msg


def test_el_motor_de_combinaciones_NO_lo_frena_porque_no_gasta_red():
    c = _c()
    c.exigir_ola0_antes_de_gastar_red("M4", "patron_derivado")   # no lanza


def test_los_propios_modulos_de_la_ola_0_no_se_frenan_a_si_mismos():
    c = _c()
    for m in ("M0", "M0b", "M0c"):
        c.exigir_ola0_antes_de_gastar_red(m, "outlook")


def test_un_HUECO_DECLARADO_abre_la_compuerta():
    """Lo que exige es HABER PREGUNTADO, no haber encontrado. Si el conector no
    existe se declara `sin_acceso` con su razon y la corrida sigue -- si no, una
    cuenta sin Odoo quedaria bloqueada para siempre--."""
    c = _c()
    for m in ("M0", "M0b", "M0c"):
        c.marcar_cobertura(m, "sin_acceso", "el conector no contesto")
        c.cerrar_modulo(m, "sin_acceso", "el conector no contesto")
    c.exigir_ola0_antes_de_gastar_red("M5", "buscador")          # no lanza


def test_la_compuerta_dice_COMO_seguir():
    c = _c()
    with pytest.raises(CompuertaCerrada) as e:
        c.exigir_ola0_antes_de_gastar_red("M1", "leadiq")
    assert "--estado sin_acceso" in str(e.value)


def test_la_CLI_de_buscar_llama_a_la_compuerta():
    import inspect

    fuente = inspect.getsource(orq.main)
    i_buscar = fuente.index('if a.cmd == "buscar":')
    i_compuerta = fuente.index("exigir_ola0_antes_de_gastar_red", i_buscar)
    i_registrar = fuente.index("c.registrar_busqueda(", i_buscar)
    assert i_buscar < i_compuerta < i_registrar, (
        "la compuerta tiene que correr ANTES de registrar: despues ya se gasto")


# -------------------------------------------------- la ficha lo pone arriba
def test_lo_del_buzon_sale_en_la_ficha_con_su_fecha():
    from flujo.ficha import bloque_de_lo_interno, lo_que_salio_del_buzon

    c = _c()
    c.registrar_busqueda("M0b", "consultas", "buzon: Zeta",
                         "outlook", 3, nota="tres hilos, uno con NDA firmado")
    filas = lo_que_salio_del_buzon(c)
    assert len(filas) == 1 and filas[0]["fecha"]
    html = bloque_de_lo_interno(c)
    assert "Esto ya estaba en casa" in html
    assert "NDA firmado" in html
    assert filas[0]["fecha"] in html, "el bloque salio sin fecha"


def test_cero_resultados_no_es_una_noticia():
    """Cero cuenta como trabajo hecho -- eso no cambia-- pero no es material para
    la conversacion: anunciarlo en «Por que ahora» seria ruido."""
    from flujo.ficha import lo_que_salio_del_buzon

    c = _c()
    c.registrar_busqueda("M0c", "llamadas", "buzon sender=@zeta.com",
                         "outlook_remitentes", 0)
    assert lo_que_salio_del_buzon(c) == []


def test_lo_de_la_web_NO_se_cuela_al_bloque_interno():
    from flujo.ficha import lo_que_salio_del_buzon

    c = _c()
    for m in ("M0", "M0b", "M0c"):
        c.cerrar_modulo(m, "sin_acceso", "fixture")
    c.registrar_busqueda("M12", "notas", "zeta inversion ampliacion",
                         "prensa", 4)
    assert lo_que_salio_del_buzon(c) == []


def test_en_la_ficha_el_bloque_interno_va_ARRIBA_de_la_linea_de_tiempo():
    import inspect

    from flujo import ficha

    fuente = inspect.getsource(ficha)
    i_titulo = fuente.index("<h2>Por que ahora</h2>")
    i_interno = fuente.index("{bl_interno}", i_titulo)
    i_tl = fuente.index("{tl or ", i_titulo)
    assert i_titulo < i_interno < i_tl, (
        "lo del buzon tiene que ir arriba de la linea de tiempo de la web")
