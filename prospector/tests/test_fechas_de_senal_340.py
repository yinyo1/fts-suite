"""Las fechas de las seis senales, y el defecto B5 que salio al ponerlas.

TRES DE SEIS se pudieron fechar con procedencia y cita textual, y el resultado fue
el contrario del esperado: el conteo de las que pasan NO subio. Las tres son de hace
mas de un ano, asi que pasan de `FRESCURA_SIN_FECHA = 2` a 0. El radar no estaba
ciego por falta de fecha -- estaba siendo GENEROSO--.

B5: `razon_de_caducidad` solo leia `YYYY-MM-DD`. Una fecha con precision de MES, que
es como la prensa la da, caia al `except` y el reloj arrancaba en HOY: una senal de
nov-2023 salia caducando en enero de 2027.
"""
import json
import os
import sys
from datetime import date

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

from flujo import radar
from flujo.importacion_odoo import razon_de_caducidad

HOY = date(2026, 9, 28)
SEN = json.load(open(os.path.join(RAIZ, "datos", "senales-documentadas.json"),
                    encoding="utf-8"))
POR = {c["empresa"] + ("/" + c["planta"] if c.get("planta") else ""): c
       for c in SEN["cuentas"]}


def _paq(fecha, tipo="ampliacion_de_capacidad"):
    return {"senal_origen": {"fuente": "prensa_industrial", "tipo": tipo,
                             "fecha_senal": fecha}}


# ======================================================  las fechas encontradas
@pytest.mark.parametrize("cuenta,fecha,precision", [
    ("LEGO", "2023-11", "mes"),
    ("Ragasa", "2025-03", "mes"),
    ("Bimbo", "2025-07-17", "dia"),
])
def test_las_tres_fechadas_traen_fecha_procedencia_Y_CITA(cuenta, fecha, precision):
    """Una fecha sin la frase que la sostiene es una fecha declarada de memoria."""
    c = POR[cuenta]
    assert c["fecha_senal"] == fecha
    assert c["fecha_documentada"] is True
    assert c["fecha_precision"] == precision
    assert c["fecha_procedencia"] and "fichas/" in c["fecha_procedencia"]
    # La cita tiene que contener el pedazo de fecha que se declaro.
    assert c["fecha_cita"].startswith("«") and c["fecha_cita"].endswith("»")


@pytest.mark.parametrize("cuenta", ["Cuprum", "Amazon", "Coficab/Pesqueria"])
def test_las_tres_que_NO_se_pudieron_fechar_dicen_por_que(cuenta):
    c = POR[cuenta]
    assert c["fecha_senal"] is None
    assert c["fecha_documentada"] is False
    razon = c.get("barrido_2026_09_28_fechas") or c.get("por_que_sigue_sin_fecha")
    assert razon, f"{cuenta} no dice por que sigue sin fecha"


def test_pesqueria_no_tiene_fecha_porque_LA_CORRIDA_lo_escribio():
    """La distincion que importa: no es que nadie buscara. La corrida que levanto la
    senal anoto que la nota no traia fecha, y contradecirla seria inventarla."""
    c = POR["Coficab/Pesqueria"]
    assert "SIN FECHA EN EL REGISTRO" in c["por_que_sigue_sin_fecha"]
    # Y si tiene fecha del EVENTO, que es otra cosa y se dice que es otra cosa.
    assert c["fecha_del_evento"] == "2026-08"
    assert "no de la senal" in c["fecha_del_evento_cita"]


def test_el_barrido_dice_DONDE_deberia_haber_quedado_anotada():
    """Es la parte que evita que vuelva a pasar: la fecha estaba en el contrato de
    M12 -- «el gancho: proyecto, monto, FECHA, ventana»-- y no llego al registro."""
    b = SEN["barrido_de_fechas"]
    assert "M12" in b["donde_deberia_haber_quedado_anotada"]
    assert len(b["fechadas"]) == 3
    assert len(b["sin_fechar"]) == 3


def test_el_hallazgo_INCOMODO_queda_escrito():
    """Fechar BAJO el puntaje. Si el issue de cierre dijera lo contrario, esta
    prueba es la que lo desmiente."""
    b = SEN["barrido_de_fechas"]["el_hallazgo_QUE_CAMBIA_LA_CONCLUSION"]
    assert "BAJO" in b and "GENEROSO" in b


# =============================================  el efecto medido en el evaluador
@pytest.mark.parametrize("fecha,dias_min", [("2023-11", 1000), ("2025-03", 550),
                                            ("2025-07-17", 430)])
def test_las_tres_fechas_caen_fuera_de_la_curva_de_frescura(fecha, dias_min):
    dias = radar.dias_de_antiguedad(fecha, HOY)
    assert dias >= dias_min
    puntos, _ = radar.puntos_de_frescura(fecha, HOY)
    assert puntos == 0.0, "si esto cambia, la curva de frescura se movio"
    # Y sin fecha valdrian DOS, que es el punto entero del hallazgo.
    sin, _ = radar.puntos_de_frescura(None, HOY)
    assert sin == radar.FRESCURA_SIN_FECHA == 2
    assert sin > puntos, (
        "el respaldo de «sin fecha» le daba a estas senales MAS que la verdad")


# ==========================================================  B5 · el reloj roto
def test_B5_la_precision_de_MES_ya_no_arranca_el_reloj_en_hoy():
    """Antes: una senal de nov-2023 caducaba en enero de 2027 -- tres anios y dos
    meses de ventana inventada-- porque `date.fromisoformat("2023-11")` truena y el
    `except` dejaba el arranque en HOY."""
    f, por = razon_de_caducidad(_paq("2023-11"), HOY)
    assert f == "2024-02-29", f
    assert "2023-11-01" in por
    assert "precision de mes" in por
    assert "desde hoy" not in por


def test_B5_se_cuenta_desde_el_PRIMER_dia_del_mes_y_no_del_ultimo():
    """Del lado conservador: la senal sale hasta 30 dias mas VIEJA de lo que podria
    ser, nunca mas fresca. Una ventana que se equivoca tiene que cerrarse antes."""
    primero, _ = razon_de_caducidad(_paq("2025-03"), HOY)
    exacto, _ = razon_de_caducidad(_paq("2025-03-31"), HOY)
    assert primero < exacto


def test_B5_el_anio_solo_tambien_se_lee():
    f, por = razon_de_caducidad(_paq("2024"), HOY)
    assert f == "2024-04-30" and "precision de anio" in por


def test_B5_una_fecha_ILEGIBLE_no_se_confunde_con_no_tener_fecha():
    """Las dos arrancan el reloj en hoy y significan cosas distintas: una es un
    hueco declarado, la otra es un dato que el codigo no supo leer."""
    _, sin = razon_de_caducidad(_paq(None), HOY)
    _, mala = razon_de_caducidad(_paq("no-es-fecha"), HOY)
    assert "contados desde hoy" in sin and "no se pudo leer" not in sin
    assert "no se pudo leer" in mala
    assert "NO es lo mismo que no tener fecha" in mala


def test_B5_las_fechas_completas_no_se_movieron():
    f, por = razon_de_caducidad(_paq("2025-07-17"), HOY)
    assert f == "2025-11-14"
    assert "precision" not in por, "una fecha al dia no necesita salvedad"


# ==========================  la correccion: International no era un hueco
def test_International_dejo_de_ser_hueco_y_la_correccion_esta_escrita():
    c = POR["International"]
    assert c["fuente"] == "prensa_industrial" and c["texto"]
    assert "120 MDD" in c["texto"]
    corr = c["CORRECCION_2026_09_28"]
    assert "NO ERA UN HUECO" in corr
    # La razon del error, que es la leccion: dos nombres para la misma cuenta.
    assert "Navistar" in corr


def test_Nemak_sigue_sin_monto_y_la_pista_falsa_queda_nombrada():
    """Los 220 MDD del archivo son de FINSA, no de Nemak. Atribuirselos seria
    inventarle el monto a una cuenta con la inversion de otra empresa del mismo
    municipio, y el evaluador no tiene forma de notar la diferencia."""
    c = POR["Nemak/Garcia"]
    assert c["monto_documentado"] is False
    pista = c["PISTA_FALSA_no_perseguir"]
    assert "220 MDD" in pista and "FINSA" in pista
    assert "NO DE NEMAK" in pista
    # Y el texto de la senal NO trae cifra: si alguien se la puso, esto se cae.
    assert "MDD" not in (c["texto"] or "") and "MDP" not in (c["texto"] or "")


# ======================  el doc de la linea base se GENERA, no se escribe a mano
def test_el_bloque_calculado_del_doc_ES_lo_que_la_herramienta_produce_HOY():
    """Es la SEPTIMA vez que un numero a mano en un doc no casa con el codigo -- la
    octava si se cuenta el `capacidad_por_tipo` vacio de B4--. D7 puso la convencion
    de marcas; esto quita la posibilidad.

    Si esta prueba falla, la respuesta NO es editar el doc a mano:
        python3 herramientas/linea_base_radar.py --actualizar-doc metodo/linea-base-del-radar.md
    """
    import linea_base_radar as lb
    ruta = os.path.join(RAIZ, "metodo", "linea-base-del-radar.md")
    doc = open(ruta, encoding="utf-8").read()
    assert lb.MARCA_INI in doc and lb.MARCA_FIN in doc
    en_disco = doc[doc.index(lb.MARCA_INI):
                   doc.index(lb.MARCA_FIN) + len(lb.MARCA_FIN)]
    assert en_disco == lb.bloque_calculado(lb.linea_base()), (
        "el doc y la herramienta ya no dicen lo mismo. Regeneralo con "
        "`--actualizar-doc`, no a mano")


def test_actualizar_doc_se_NIEGA_sin_las_marcas(tmp_path):
    import linea_base_radar as lb
    f = tmp_path / "sin-marcas.md"
    f.write_text("# un doc cualquiera\n", encoding="utf-8")
    with pytest.raises(SystemExit) as e:
        lb.actualizar_doc(str(f), lb.linea_base())
    assert "no tiene las marcas" in str(e.value)
