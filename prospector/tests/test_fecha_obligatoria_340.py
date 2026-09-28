"""Tarea 3 de #340: la fecha de la senal es obligatoria, o se declara su ausencia.

Es la regla que evita que el hallazgo de esta noche se repita. Seis de las nueve
senales de septiembre llegaron sin fecha, y el contrato de M12 -- el modulo que las
produjo-- dice literalmente que su salida es «el gancho: proyecto, monto, FECHA,
ventana». La fecha estaba en el contrato y no llegaba al registro.
"""
import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from flujo import ficha
from flujo.estado import Corrida, CompuertaCerrada, _precision_de_fecha


def _c():
    c = Corrida(empresa="Ejemplo", ciudad="Monterrey")
    c.senal.append("amplian la subestacion")
    return c


# ==========================================  la compuerta: fecha o decirlo en voz alta
def test_sin_fecha_y_sin_declararlo_la_compuerta_CIERRA():
    with pytest.raises(CompuertaCerrada) as e:
        _c().declarar_senal_origen("prensa_industrial", texto="amplian")
    m = str(e.value)
    assert "EXIGE fecha" in m
    # Y dice las DOS salidas, porque una compuerta que no dice como pasarla se
    # rodea en vez de cumplirse.
    assert "--fecha-senal" in m and "--sin-fecha" in m
    # Y dice POR QUE, con el numero que lo motivo.
    assert "2 de 25" in m and "techo" in m.lower()


def test_sin_fecha_declarado_SIN_razon_tambien_cierra():
    """«No la busque» y «la nota no la trae» son dos cosas distintas, y la segunda
    es un dato: por eso la corrida de Pesqueria hoy se puede defender."""
    with pytest.raises(CompuertaCerrada) as e:
        _c().declarar_senal_origen("prensa_industrial", sin_fecha=True)
    assert "--razon-sin-fecha" in str(e.value)


def test_sin_fecha_CON_razon_pasa_y_queda_escrito():
    c = _c()
    sen = c.declarar_senal_origen(
        "prensa_industrial", sin_fecha=True,
        razon_sin_fecha="la nota de Reforma no trae fecha")
    assert sen["sin_fecha_declarada"] is True
    assert sen["razon_sin_fecha"] == "la nota de Reforma no trae fecha"
    assert sen["fecha_precision"] is None
    aviso = next(a for a in c.avisos if "SIN FECHA" in a)
    assert "la nota de Reforma no trae fecha" in aviso
    assert "NO ES ALCANZABLE" in aviso


@pytest.mark.parametrize("fecha,precision", [
    ("2026-09-24", "dia"), ("2023-11", "mes"), ("2024", "anio"),
])
def test_las_tres_precisiones_se_aceptan_y_se_declaran(fecha, precision):
    """La prensa fecha al mes. Eso es una precision valida, no un error."""
    sen = _c().declarar_senal_origen("prensa_industrial", fecha_senal=fecha)
    assert sen["fecha_senal"] == fecha
    assert sen["fecha_precision"] == precision
    assert sen["sin_fecha_declarada"] is False


@pytest.mark.parametrize("basura", ["ayer", "nov-2023", "2023-13", "11/2023",
                                    "2026-02-30", "20261"])
def test_una_fecha_ILEGIBLE_se_rechaza_y_no_se_adivina(basura):
    """Es PEOR que no tener fecha: el defecto B5 hacia que el reloj de caducidad
    arrancara en HOY sin decirlo, y una senal de nov-2023 salia caducando en 2027."""
    with pytest.raises(CompuertaCerrada) as e:
        _c().declarar_senal_origen("prensa_industrial", fecha_senal=basura)
    assert "no se puede leer" in str(e.value)
    assert _precision_de_fecha(basura) is None


def test_la_fecha_no_se_puede_colar_en_blanco():
    """Espacios no son una fecha."""
    with pytest.raises(CompuertaCerrada):
        _c().declarar_senal_origen("prensa_industrial", fecha_senal="   ")


# ==============================  el aviso de la CAPA LIMPIA, en lenguaje de persona
def test_la_capa_limpia_avisa_sin_fecha_en_lenguaje_de_persona():
    c = _c()
    c.declarar_senal_origen("prensa_industrial", sin_fecha=True,
                            razon_sin_fecha="la nota no trae fecha")
    aviso = ficha.aviso_de_senal_sin_fecha(c)
    assert "no tiene fecha" in aviso
    assert "de este mes o de hace un ano" in aviso
    # Y dice QUE HACER con eso, que es lo que le sirve a quien llama.
    assert "confirma la fecha" in aviso.lower()
    assert "la nota no trae fecha" in aviso


def test_el_aviso_NO_lleva_vocabulario_interno():
    """La capa limpia es la que #322 dejo libre de vocabulario interno. Un aviso que
    dice «frescura vale 2 de 25» le sirve al que programa, no al que llama."""
    c = _c()
    c.declarar_senal_origen("prensa_industrial", sin_fecha=True,
                            razon_sin_fecha="sin fecha en el registro")
    aviso = ficha.aviso_de_senal_sin_fecha(c).lower()
    for palabra in ("frescura", "techo", "puntaje", "evaluador", "caducidad",
                    "radar", "umbral"):
        assert palabra not in aviso, f"«{palabra}» es vocabulario interno"


def test_con_fecha_el_aviso_NO_sale():
    c = _c()
    c.declarar_senal_origen("prensa_industrial", fecha_senal="2026-09-01")
    assert ficha.aviso_de_senal_sin_fecha(c) == ""


def test_sin_expediente_este_aviso_NO_se_duplica_con_el_otro():
    """Si no hay ni fuente, el aviso de expediente ya lo dice: dos avisos sobre lo
    mismo se leen como dos problemas."""
    assert ficha.aviso_de_senal_sin_fecha(_c()) == ""


def test_el_aviso_aparece_EN_la_ficha_limpia_y_dentro_de_por_que_ahora():
    c = _c()
    c.por_que_ahora = "amplian la subestacion"
    c.declarar_senal_origen("prensa_industrial", sin_fecha=True,
                            razon_sin_fecha="sin fecha en el registro")
    html_ = ficha.modo_limpio(c)
    assert "Esta senal no tiene fecha" in html_
    # Dentro de la tarjeta de «Por que ahora», que es donde se lee la oportunidad.
    trozo = html_[html_.index("Por que ahora"):]
    trozo = trozo[:trozo.index("</div>")]
    assert "Esta senal no tiene fecha" in trozo


# ==========================================  la CLI ofrece las dos vias y las nombra
def test_la_cli_tiene_las_dos_banderas():
    fuente = open(os.path.join(RAIZ, "flujo", "orquestador.py"),
                  encoding="utf-8").read()
    for bandera in ("--sin-fecha", "--razon-sin-fecha"):
        assert bandera in fuente, bandera
    # Y la ayuda de --fecha-senal dice que se aceptan las tres precisiones.
    assert "AAAA-MM-DD, AAAA-MM o AAAA" in fuente
