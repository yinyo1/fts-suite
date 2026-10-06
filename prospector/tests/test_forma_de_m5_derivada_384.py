"""La forma de una consulta de M5 se DERIVA del texto, no se le pide (#384).

EL CASO, Y ES DE OPERACION, NO DE CODIGO: en la vuelta de las cinco cuentas de
puerta de usuario se corrieron las TRES formas de M5 en las cinco cuentas -- 66
consultas-- y no se etiqueto ni una. El detector de limite de fuente leia la
forma SOLO de `Busqueda.etiqueta`, asi que quedo ciego en las cinco y dijo
«0 forma(s) de 3 (ninguna declarada)».

LO QUE ESO COSTABA: la ficha no podia decir «esta empresa no aparece en el
buscador publico» en las cuentas donde era cierto. Y es justo en esas donde ese
aviso lleva la busqueda de Sales Navigator armada, o sea donde hace toda la
diferencia: una ficha sin contactos y sin ese aviso se lee como «no hay nadie».

LA COMPUERTA NO ESTABA MAL: faltaba un dato que NO hacia falta pedir, porque el
texto de la consulta lo dice. Es la misma leccion de `hits`, de `modulo_origen` y
de los contadores de agotado.
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from flujo.compuertas import (FORMA_M5_GLOBAL, FORMA_M5_MX,       # noqa: E402
                              FORMA_M5_SIMPLE,
                              FORMAS_QUE_EL_CORTE_EXIGE_CUBIERTAS,
                              corta_por_limite_de_fuente, forma_de_m5)
from flujo.catalogo import FORMAS_M5                                # noqa: E402


class _B:
    """Lo minimo que el detector mira de una busqueda."""
    def __init__(self, consulta, etiqueta=None, perfiles=0):
        self.consulta = consulta
        self.etiqueta = etiqueta
        self.perfiles_de_la_empresa = perfiles
        self.modulo = "M5"


def test_las_tres_formas_se_derivan_de_su_operador():
    assert forma_de_m5(_B('site:mx.linkedin.com/in "Acme" mantenimiento')) \
        == FORMA_M5_MX
    assert forma_de_m5(_B('site:linkedin.com/in "Acme" mantenimiento')) \
        == FORMA_M5_GLOBAL
    assert forma_de_m5(_B('"Acme" "jefe de mantenimiento" planta')) \
        == FORMA_M5_SIMPLE


def test_el_subdominio_mexicano_NO_se_confunde_con_el_global():
    """`mx.linkedin.com/in` CONTIENE `linkedin.com/in`: el orden importa.

    Y no es un detalle: #353 midio que el subdominio de pais es un CORPUS
    DISTINTO, no un filtro del global. Confundirlos haria creer que dos formas
    estan cubiertas cuando se pregunto solo una.
    """
    mx = 'site:mx.linkedin.com/in "Acme"'
    assert "linkedin.com/in" in mx, "la trampa esta ahi de verdad"
    assert forma_de_m5(_B(mx)) == FORMA_M5_MX


def test_la_etiqueta_MANDA_cuando_existe():
    """El operador puede saber mas que el texto: un alias, otro buscador."""
    b = _B('"Acme" mantenimiento', etiqueta="linkedin_mx")
    assert forma_de_m5(b) == "linkedin_mx"


def test_las_formas_derivadas_son_las_que_el_radar_declara():
    """Sin esto, el derivador podria inventar nombres de forma que nadie usa."""
    declaradas = {clave for clave, _p, _d, _r in FORMAS_M5}
    assert {FORMA_M5_SIMPLE, FORMA_M5_GLOBAL, FORMA_M5_MX} == declaradas, (
        f"el derivador usa {{{FORMA_M5_SIMPLE}, {FORMA_M5_GLOBAL}, "
        f"{FORMA_M5_MX}}} y el radar declara {declaradas}")


def test_doce_consultas_SIN_etiquetar_ya_cubren_las_tres_formas():
    """El caso real de esta vuelta, reproducido."""
    consultas = ([_B('site:mx.linkedin.com/in "Acme" mantenimiento %d' % i)
                  for i in range(5)]
                 + [_B('site:linkedin.com/in "Acme" proyectos %d' % i)
                    for i in range(5)]
                 + [_B('"Acme" "jefe de mantenimiento" %d' % i)
                    for i in range(4)])
    assert all(b.etiqueta is None for b in consultas), "ninguna etiquetada"
    es, razon = corta_por_limite_de_fuente(consultas, solo_las_primeras=False)
    assert es, razon
    assert f"las {FORMAS_QUE_EL_CORTE_EXIGE_CUBIERTAS} formas cubiertas" in razon


def test_doce_de_UN_SOLO_corpus_siguen_sin_cubrir():
    """La contraprueba: derivar no afloja el criterio, solo lo deja de pedir."""
    consultas = [_B('site:mx.linkedin.com/in "Acme" %d' % i) for i in range(14)]
    es, razon = corta_por_limite_de_fuente(consultas, solo_las_primeras=False)
    assert not es
    assert "1 forma(s)" in razon and "un solo corpus" in razon
