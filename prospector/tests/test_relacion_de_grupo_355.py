"""La puerta de Xignux: relacion con el GRUPO, no con la planta (#355, tarea 7).

Salio de la via interna de #353: FTS esta dado de alta como proveedor en el
portal de compras del grupo Xignux desde ene-2025, y hay pagos de una empresa del
grupo en jun-2025 y jun-2026 -- el alta no quedo en tramite--.

Es una PUERTA y hay que nombrarla como puerta. Un alta vigente cambia la
conversacion de compras -- no hay que abrir expediente ni pasar validacion de
proveedor nuevo, y el de compras lo verifica en su sistema en un minuto-- y NO es
una venta a la planta que se esta prospectando. Decirlo mal repite el error de
Coficab/Pesqueria (#310) con una cara peor: un alta da confianza de cliente sin
ser una.

Sin nombres: los correos que lo prueban son del portal y de tesoreria.
"""
from __future__ import annotations

import json

from flujo.ubicacion_de_proyectos import (
    RUTA_GRUPOS,
    carta_de_presentacion,
    relacion_de_grupo,
)

EMPRESAS_DE_XIGNUX = ("Qualtia", "Viakon", "Voltrak", "Prolec", "Magnekon")


def test_las_cuatro_empresas_que_la_decision_nombra_empatan():
    for e in EMPRESAS_DE_XIGNUX:
        assert relacion_de_grupo(e).get("grupo") == "Xignux", e


def test_empata_con_el_nombre_COMPUESTO_que_usan_la_planilla_y_odoo():
    """«Xignux / Qualtia Alimentos» es como la cuenta quedo escrita en los dos
    lados. Si solo empatara el nombre corto, la cuenta del piloto no recibiria su
    propia linea."""
    assert relacion_de_grupo("Xignux / Qualtia Alimentos").get("grupo") == "Xignux"


def test_una_cuenta_de_otro_grupo_no_recibe_nada():
    for e in ("Metalsa", "Nemak", "LEGO", "Ragasa", "Cuprum"):
        assert relacion_de_grupo(e) == {}, e


def test_una_empresa_vacia_no_empata_con_todo():
    """`in` sobre cadena vacia empata siempre: seria darle la puerta de Xignux a
    cualquier cuenta sin nombre."""
    for vacio in ("", "   ", None):
        assert relacion_de_grupo(vacio) == {}


# ------------------------------------------------------------- en la carta
def test_la_carta_de_una_empresa_de_xignux_dice_el_alta():
    for e in EMPRESAS_DE_XIGNUX:
        carta = carta_de_presentacion(e, "Monterrey")
        assert "PROVEEDOR DEL GRUPO Xignux" in carta, e


def test_la_carta_dice_TAMBIEN_lo_que_no_se_puede_decir():
    """Media verdad en una carta de presentacion es peor que ninguna: la mitad
    que se cae es la que se dice primero."""
    carta = carta_de_presentacion("Qualtia", "Monterrey")
    assert "OJO:" in carta
    assert "Ya somos proveedores de ustedes" in carta
    assert "no a esta planta" in carta or "no con esta planta" in carta, carta


def test_la_linea_del_grupo_NO_reemplaza_al_veredicto_de_planta():
    """Son dos hechos distintos y los dos se sostienen. La cuenta sigue sin
    historia declarada de planta, y la carta lo dice igual."""
    carta = carta_de_presentacion("Qualtia", "Monterrey")
    assert "Sin historia declarada" in carta
    assert "PROVEEDOR DEL GRUPO" in carta


def test_la_carta_de_una_cuenta_de_otro_grupo_no_la_menciona():
    assert "Xignux" not in carta_de_presentacion("Metalsa", "Apodaca")


# --------------------------------------------------------- el registro mismo
def test_el_registro_declara_su_procedencia_y_su_fecha():
    with open(RUTA_GRUPOS, encoding="utf-8") as f:
        d = json.load(f)
    g = d["grupos"][0]
    for campo in ("relacion", "desde", "evidencia", "procedencia",
                  "linea_para_la_carta", "lo_que_NO_se_puede_decir"):
        assert g.get(campo), campo
    assert d.get("por_que_es_otro_archivo"), (
        "sin esa nota, el proximo barrido va a fundirlo con "
        "ubicacion-de-proyectos.json, que es justo el error que evita")


def test_el_registro_no_trae_personas_ni_importes():
    import re

    with open(RUTA_GRUPOS, encoding="utf-8") as f:
        crudo = f.read()
    assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", crudo)
    assert "MDP" not in crudo and "MDD" not in crudo
    assert "numero de proveedor" not in crudo.lower().replace("ni un numero de proveedor", "")


def test_NO_se_construyo_el_modo_expansion():
    """La decision fue explicita: solo esta linea. Un modo expansion completo
    -- que derive a que otras plantas del grupo entrar y en que orden-- es otra
    cosa y no se pidio."""
    import inspect

    from flujo import ubicacion_de_proyectos as up

    fuente = inspect.getsource(up)
    for de_mas in ("def expandir_al_grupo", "def plantas_del_grupo",
                   "def priorizar_grupo"):
        assert de_mas not in fuente, de_mas
