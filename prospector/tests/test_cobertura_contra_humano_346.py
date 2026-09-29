"""Lo que la planilla de una corrida HUMANA con Sales Navigator destapo (#346).

Por primera vez hubo una RESPUESTA CORRECTA EXTERNA: 68 personas en 10 cuentas,
una semana de trabajo de una persona con sesion en Monterrey. Medir el filtro de la
herramienta contra esa lista encontro cuatro defectos, y el cuarto es el que
importa: **los tres unicos que respondieron estaban clasificados como CONTEXTO.**

Ni un nombre entra a este archivo. Los casos son PUESTOS, que no identifican a
nadie, y estan aqui porque son los que fallaron de verdad -- no inventados--.
"""
import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from flujo.confianza import (TRONCOS_DE_LA_LISTA_NEGRA, puesto_nunca_decisor,
                             _pega_con_frontera)
from flujo.ficha import INTERLOCUTOR, SIGLAS_CON_FRONTERA, _tipo_de_interlocutor


def clase(puesto: str) -> str:
    """Valor o contexto, con las dos tablas de la herramienta y nada mas."""
    if puesto_nunca_decisor(puesto):
        return "contexto"
    grupo, _ = _tipo_de_interlocutor(puesto)
    return "contexto" if grupo == "otros" else "valor"


# =====================================  B6 · el substring se comia cinco titulos
@pytest.mark.parametrize("puesto", [
    "Gerente Nacional de Construccion y Mantenimiento",   # Na-CIO-nal
    "Gerente de Planta & Operaciones Sr",                  # Opera-CIO-nes
    "Lider de Operaciones",
    "Gerente de Proyectos Nuevos negocio",                 # nego-CIO
    "Maintenance Manager International Motors",            # INTERN-ational
])
def test_B6_la_lista_negra_YA_NO_se_come_pedazos_de_palabra(puesto):
    """Tres de estos cinco son targets de primera y el filtro los mandaba a
    contexto. Es la TERCERA vez que este proyecto tropieza con un substring sin
    frontera: #300 con los puestos, #329 con «prensa», y esto."""
    assert puesto_nunca_decisor(puesto) == "", (
        f"«{puesto}» sigue bloqueado por un pedazo de palabra")
    assert clase(puesto) == "valor"


def test_B6_los_bloqueos_LEGITIMOS_siguen_bloqueando():
    """Una frontera que abre la compuerta no sirve de nada."""
    for puesto, marca in (("CIO", "cio"), ("IT Manager", "it manager"),
                          ("Reclutadora Senior", "reclutad"),
                          ("Recepcionista", "recepcion"),
                          ("Becarios de verano", "becari"),
                          ("Talent Acquisition Partner", "talent acquisition")):
        assert puesto_nunca_decisor(puesto) == marca, puesto


def test_B6_los_troncos_se_DECLARAN_no_se_adivinan_del_formato():
    """El primer arreglo infirio el tronco del espacio final de la marca, y se cayo
    en el acto: `"intern "` estaba cerrado por ese espacio, no abierto. Adivinar la
    intencion desde el formato de la cadena es lo que fallo dos veces."""
    assert "intern" not in TRONCOS_DE_LA_LISTA_NEGRA
    assert "reclutad" in TRONCOS_DE_LA_LISTA_NEGRA
    # Un tronco pega con su derivada; una palabra completa no pega dentro de otra.
    assert _pega_con_frontera("reclutad", " reclutadora ")
    assert not _pega_con_frontera("intern", " international ")


# ============================  B7 · el vocabulario no conocia CAPEX ni RME
@pytest.mark.parametrize("puesto,grupo", [
    ("Capex Control Leader", "compras"),
    ("Jefe de compras MRO y Capex", "compras"),
    ("CAPEX - Global Procurement Director", "compras"),
    ("Portfolio Manager | Strategic CAPEX Leader", "compras"),
    ("Strategic sourcing specialist", "compras"),
    ("Sr. Regional RME Manager", "mantenimiento"),
    ("Reliability and Maintenance Engineering Manager", "mantenimiento"),
    ("Global Asset Management Director", "mantenimiento"),
    ("Ingeniero de proyecto", "ingenieria"),
    ("Comprador de proyecto", "compras"),
    ("Operation Manager", "direccion"),
    ("Operations Head", "direccion"),
    ("Gerente de Produccion", "direccion"),
])
def test_B7_el_vocabulario_YA_reconoce_lo_que_de_verdad_compra(puesto, grupo):
    """Todos estos salieron de la planilla. `CAPEX` es COMO SE LLAMA el presupuesto
    que FTS persigue y no estaba en ninguna tabla; `RME` es como Amazon llama a su
    area de mantenimiento."""
    assert clase(puesto) == "valor", puesto
    assert _tipo_de_interlocutor(puesto)[0] == grupo, puesto


def test_B7_las_siglas_se_comparan_CON_frontera():
    """"coo" dentro de "COOrdinador" metia a un coordinador de ingenieria en el
    grupo de DIRECCION. Medido en la planilla."""
    assert _tipo_de_interlocutor("Coordinador de Ingenieria de Producto")[0] == \
        "ingenieria"
    assert _tipo_de_interlocutor("COO")[0] == "direccion"
    for sigla in SIGLAS_CON_FRONTERA:
        assert len(sigla) <= 6, f"«{sigla}» es una palabra, no una sigla"


# ==================  B8 · RH y prestaciones EN INGLES no estaban en la lista negra
@pytest.mark.parametrize("puesto", [
    "HRBP Director Mexico Region",       # SE COLABA COMO VALOR por «director»
    "Human Resources",
    "Benefits Sr. Specialist",
    "Payroll Manager",
    "Compensation Analyst",
])
def test_B8_el_area_de_personas_en_INGLES_tambien_es_contexto(puesto):
    """La lista negra estaba en espanol, y la mitad de los titulos de una planta
    global vienen en ingles. `HRBP Director` era el peor: pegaba con «director` y
    entraba como DE VALOR."""
    assert puesto_nunca_decisor(puesto), puesto
    assert clase(puesto) == "contexto", puesto


# ============  EL HALLAZGO QUE IMPORTA: los tres que respondieron eran «contexto»
#: Los puestos de los tres unicos que contestaron en la corrida humana. Sin nombres
#: y sin empresa: lo que se prueba es el PUESTO contra el filtro.
LOS_TRES_QUE_RESPONDIERON = (
    ("Gerente de Proyectos Nuevos negocio", "ingenieria"),
    ("Portfolio Manager | Strategic CAPEX Leader", "compras"),
    ("Sr. Regional RME Manager", "mantenimiento"),
)


@pytest.mark.parametrize("puesto,grupo", LOS_TRES_QUE_RESPONDIERON)
def test_los_TRES_que_respondieron_son_DE_VALOR(puesto, grupo):
    """Antes de #346 los tres salian CONTEXTO, cada uno por un defecto distinto:
    el primero por el substring «cio», el segundo porque CAPEX no existia en el
    vocabulario, el tercero porque RME tampoco.

    O sea que el filtro, tal como estaba, le habria dicho a Rissia que NO tocara a
    las tres unicas personas que contestaron. La INTENCION del filtro acerto 3 de 3;
    su IMPLEMENTACION acerto 0 de 3.

    Si esta prueba se cae, el filtro volvio a perder a los que responden.
    """
    assert clase(puesto) == "valor", puesto
    assert _tipo_de_interlocutor(puesto)[0] == grupo, puesto


def test_los_tres_caen_en_TRES_grupos_distintos():
    """Y eso es lo que lo vuelve dato del lazo 2 y no anecdota: no respondio un
    perfil, respondieron tres perfiles de tres areas -- ingenieria, compras y
    mantenimiento--. Es la primera evidencia de que el filtro de valor predice
    respuesta, y apunta a los tres grupos a la vez, no a uno."""
    grupos = {g for _, g in LOS_TRES_QUE_RESPONDIERON}
    assert len(grupos) == 3
    assert grupos <= {c for c, _t, _p in INTERLOCUTOR}
