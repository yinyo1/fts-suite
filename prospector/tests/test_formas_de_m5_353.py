"""Las TRES formas de M5, y el disparador de la mexicana (#353).

Hasta la 0.15.0 el numero de formas de M5 vivia en prosa -- en el texto de
ayuda de `arranque.py` y en `estado.DESCRIPCION`-- y no habia dato ni prueba
que lo fijara. La medicion contra la corrida humana de Rissia encontro que el
subdominio de pais es un CORPUS DISTINTO, no un filtro del global: cuatro
personas de planta en Mexico salen con `site:mx.linkedin.com/in` y no salen con
`site:linkedin.com/in`, con ninguna redaccion.

Esta prueba fija las tres cosas que la decision de Esteban sobre #353 declara:

  1. Son TRES formas, no dos.
  2. La mexicana corre ADEMAS de la global, nunca en su lugar.
  3. El disparador es dato DECLARADO: sin pais no se dispara.

Sin nombres: los casos se nombran por puesto y empresa, como el resto de las
pruebas de cobertura.
"""
from __future__ import annotations

import re

from flujo.catalogo import (
    DISPARADOR_PLANTA_EN_MEXICO,
    FORMAS_M5,
    formas_de_m5,
)


# ---------------------------------------------------------------------------
# 1. Son tres, y cada una trae plantilla y razon
def test_m5_tiene_tres_formas():
    assert len(FORMAS_M5) == 3, (
        "M5 corre TRES formas desde #353. Si alguien agrega o quita una, esta "
        "prueba tiene que cambiar A PROPOSITO, no de pasada."
    )
    claves = [f[0] for f in FORMAS_M5]
    assert claves == ["simple", "linkedin_global", "linkedin_mx"], claves


def test_cada_forma_declara_plantilla_y_razon():
    for clave, plantilla, _disparador, por_que in FORMAS_M5:
        assert "{puesto}" in plantilla and "{empresa}" in plantilla, clave
        assert len(por_que) > 80, (
            f"La forma '{clave}' no explica por que existe. Una configuracion "
            f"sin razon escrita es la que el proximo barrido borra por parecer "
            f"repetida."
        )


# ---------------------------------------------------------------------------
# 2. La mexicana corre ADEMAS de la global
def test_planta_en_mexico_corre_las_tres():
    corre = formas_de_m5("México")
    assert corre == ["simple", "linkedin_global", "linkedin_mx"], corre


def test_la_mexicana_no_sustituye_a_la_global():
    """El punto de la decision: se suman, no se reemplazan."""
    corre = formas_de_m5("Mexico")
    assert "linkedin_global" in corre and "linkedin_mx" in corre, (
        "Si la mexicana desplazara a la global se perderian los perfiles que "
        "solo el corpus global indexa -- entre ellos los corporativos de LEGO "
        "que la corrida de #353 si trajo por la via global."
    )


def test_el_disparador_se_declara_en_el_dato():
    assert DISPARADOR_PLANTA_EN_MEXICO == "planta_en_mexico"
    disparadores = {f[2] for f in FORMAS_M5}
    assert disparadores == {None, DISPARADOR_PLANTA_EN_MEXICO}, disparadores


# ---------------------------------------------------------------------------
# 3. Sin pais declarado NO se dispara
def test_sin_pais_no_se_supone_mexico():
    for sin_dato in (None, "", "   "):
        assert formas_de_m5(sin_dato) == ["simple", "linkedin_global"], sin_dato


def test_planta_fuera_de_mexico_no_dispara_la_mexicana():
    for fuera in ("Estados Unidos", "USA", "Brasil", "Alemania"):
        assert "linkedin_mx" not in formas_de_m5(fuera), fuera


def test_el_pais_se_normaliza():
    """'México', 'MEXICO', 'mexico' y 'MX' son el mismo dato."""
    for forma_de_escribirlo in ("México", "MEXICO", "mexico", " Mexico ", "MX",
                                "mx"):
        assert "linkedin_mx" in formas_de_m5(forma_de_escribirlo), (
            forma_de_escribirlo
        )


# ---------------------------------------------------------------------------
# 4. El limite medido queda escrito donde se lee
def test_la_razon_de_la_mexicana_declara_que_el_texto_no_filtra():
    """El hallazgo que cuesta dinero si se olvida.

    Una consulta de M5 con el ancla de geografia EN EL TEXTO ('Monterrey
    Apodaca') devolvio a quien tiene ese puesto en Sydney. Quien lea la tabla
    tiene que encontrar ahi la razon de que exista un subdominio aparte, o va a
    volver a intentar resolverlo con texto.
    """
    por_que = dict((f[0], f[3]) for f in FORMAS_M5)["linkedin_mx"]
    plano = por_que.lower()
    assert "sydney" in plano, por_que
    assert "no filtra" in plano, por_que


# ---------------------------------------------------------------------------
# 5. La prosa de ayuda no se queda en dos
def test_la_ayuda_de_arranque_y_estado_dice_tres():
    from flujo import arranque, estado

    m5_arranque = [b for b in arranque.PLAN if b[0] == "M5"]
    assert m5_arranque, "M5 desaparecio de arranque.PLAN"
    texto = " ".join(str(x) for x in m5_arranque[0])
    assert re.search(r"TRES formas", texto), texto
    assert "mx.linkedin.com/in" in texto, texto

    d = estado.DESCRIPCION["M5"]
    assert "3 formas" in d, d
    assert "mx.linkedin.com/in" in d, d


# ---------------------------------------------------------------------------
# 6. Los cuatro casos medidos, por puesto (sin nombres)
#
# Son las cuatro personas de la planilla humana que la forma global NO entrega
# y la mexicana SI. Se guardan como constancia de que la configuracion se gano
# midiendo, no razonando.
RESCATADOS_POR_LA_MEXICANA = (
    ("Metalsa", "Plant Manager"),
    ("Sigma Alimentos", "Jefe de Compras"),
    ("Amazon", "Operations Manager (Monterrey)"),
    ("Nemak", "Plant Operations Manager"),
)


def test_los_cuatro_casos_medidos_no_traen_nombres():
    for empresa, puesto in RESCATADOS_POR_LA_MEXICANA:
        assert empresa and puesto
        # Un caso se nombra por empresa y puesto. Si alguien mete un nombre de
        # persona aqui, la palabra suelta capitalizada de dos tokens sin
        # vocabulario de puesto lo delata; la prueba de datos personales del
        # repo es la que manda, esta solo deja la intencion escrita.
        assert "@" not in puesto and "@" not in empresa


def test_son_cuatro_y_de_cuatro_cuentas_distintas():
    assert len(RESCATADOS_POR_LA_MEXICANA) == 4
    assert len({e for e, _ in RESCATADOS_POR_LA_MEXICANA}) == 4
