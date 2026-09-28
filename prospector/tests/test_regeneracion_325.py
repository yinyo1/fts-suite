"""El diagnostico de regeneracion: que le falta a cada cuenta ya evaluada.

LO QUE ESTE MODULO TIENE QUE NO HACER, y es la mitad de su valor: no proponer
"correr todo otra vez". Las cuentas evaluadas antes de #325 tienen la ficha bien;
lo que les falta es el expediente de senal, y de los tres arreglos posibles DOS
NO CUESTAN NI UNA CONSULTA. Un plan que mande a recorrer 26 cuentas a 60
consultas cada una es un plan que no se va a ejecutar.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flujo import regeneracion as rg


def _vieja(**kw):
    """Una corrida como las de antes de #325: sin `senal_origen`."""
    return {"empresa": "Ejemplo", "ciudad": "Monterrey", "origen": "manual",
            "senal": ["amplian la subestacion de la planta"],
            "contactos": [], **kw}


def _completa():
    return _vieja(senal_origen={"fuente": "prensa_industrial",
                                "tipo": "obra_nueva", "puntaje": 46.0,
                                "fecha_senal": "2026-07-01"})


def test_una_cuenta_completa_no_necesita_nada():
    d = rg.diagnosticar(_completa())
    assert d["nivel"] == rg.NIVEL_NADA
    assert d["le_falta"] == []
    assert rg.comando_para(d) == ""


def test_una_cuenta_vieja_se_arregla_declarando_sin_gastar_consultas():
    d = rg.diagnosticar(_vieja())
    assert d["nivel"] == rg.NIVEL_DECLARAR
    # LA CIFRA QUE IMPORTA: cero. Si esto fuera 60, el plan no se ejecutaria.
    assert d["consultas"] == 0


def test_lo_que_falta_viene_con_LO_QUE_SE_PIERDE_no_solo_con_el_nombre():
    # "le falta la fuente" no le dice a nadie por que deberia importarle. El
    # diagnostico tiene que decir que capacidad concreta se queda sin poder usar.
    d = rg.diagnosticar(_vieja())
    assert len(d["que_se_pierde"]) == len(d["le_falta"])
    junto = " ".join(d["que_se_pierde"])
    assert "lazo 1" in junto and "lazo 3" in junto


def test_si_solo_falta_el_puntaje_el_nivel_es_reevaluar():
    d = rg.diagnosticar(_vieja(senal_origen={
        "fuente": "prensa_industrial", "tipo": "obra_nueva",
        "fecha_senal": "2026-07-01", "puntaje": None}))
    assert d["nivel"] == rg.NIVEL_REEVALUAR
    assert d["consultas"] == 0


def test_sin_texto_de_senal_el_nivel_es_volver_a_correr():
    d = rg.diagnosticar({"empresa": "Ejemplo", "ciudad": "Monterrey",
                         "senal": [], "contactos": []})
    assert d["nivel"] == rg.NIVEL_VOLVER_A_CORRER
    assert d["consultas"] == 60
    assert "FUERA de horario de produccion" in rg.comando_para(d)


def test_el_comando_NO_adivina_la_fuente():
    # Poner una fuente probable seria inventar la procedencia de la cuenta, y de
    # ahi sale el peso que el lazo 1 va a mover. Se deja el hueco marcado.
    cmd = rg.comando_para(rg.diagnosticar(_vieja()))
    assert "--fuente '<" in cmd
    assert "prensa_industrial'" not in cmd


def test_la_llave_de_reciclaje_no_se_declara_se_deriva():
    # No aparece en `le_falta`: no es algo que el operador pueda declarar. Sale de
    # un correo ancla o no sale, y que no salga es la respuesta correcta.
    d = rg.diagnosticar(_vieja())
    assert not any("reciclaje" in f.lower() for f in d["le_falta"])
    assert d["tiene_correo_ancla"] is False
    con_ancla = rg.diagnosticar(_vieja(contactos=[
        {"datos": {"correo": {"anclas_en_la_mayoria": 2}}}]))
    assert con_ancla["tiene_correo_ancla"] is True


def test_el_plan_pone_lo_barato_primero():
    caras = {"empresa": "Cara", "ciudad": "X", "senal": [], "contactos": []}
    pl = rg.plan([caras, _vieja(), _completa()])
    niveles = [x["nivel"] for x in pl["detalle"]]
    assert niveles.index(rg.NIVEL_DECLARAR) < niveles.index(
        rg.NIVEL_VOLVER_A_CORRER)
    # Las completas van al final: no son trabajo.
    assert niveles[-1] == rg.NIVEL_NADA


def test_el_plan_suma_las_consultas_para_que_el_costo_sea_visible():
    pl = rg.plan([_vieja(), _vieja(empresa="Otra"),
                  {"empresa": "Cara", "ciudad": "X", "senal": [],
                   "contactos": []}])
    # Dos de declarar (0) y una de volver a correr (60).
    assert pl["consultas_totales"] == 60


def test_el_plan_dice_que_no_se_borra_la_ficha_vieja():
    # Una cuenta regenerada tiene que poder compararse contra lo que dijo antes.
    assert "no se borra" in rg.plan([]).get("regla", "").lower()


def test_diagnosticar_no_modifica_la_corrida():
    d = _vieja()
    antes = dict(d)
    rg.diagnosticar(d)
    assert d == antes
