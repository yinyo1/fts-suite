"""La cadencia del §4c, calculada. Y el defecto que salio al calcularla.

El diseno tenia la tabla de esperas y toques en prosa y nada la aplicaba. Es el
mismo patron de los cinco hallazgos de #329: una regla que el documento da por
aplicada y que no tiene codigo.
"""
import os
import sys
from datetime import date

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

from flujo import cadencia as cd


# ===================================================  los dos relojes
def test_la_tabla_es_la_del_diseno():
    # Candado sobre el §4c: 3 toques cada 5 dias con historia, 3 cada 7 en frio,
    # 2 cada 10 en LinkedIn, 2 cada 7 por conmutador, 1 en evento.
    assert cd.espera_y_toques(cd.CORREO_DIRECTO, con_historia=True) == (5, 3)
    assert cd.espera_y_toques(cd.CORREO_DIRECTO, con_historia=False) == (7, 3)
    assert cd.espera_y_toques(cd.LINKEDIN) == (10, 2)
    assert cd.espera_y_toques(cd.CONMUTADOR) == (7, 2)
    assert cd.espera_y_toques(cd.EVENTO)[1] == 1


def test_el_celular_personal_no_tiene_cadencia_y_truena():
    with pytest.raises(ValueError) as e:
        cd.espera_y_toques("celular_personal")
    assert "nunca lo va a ser" in str(e.value)


def test_los_toques_caen_en_dias_habiles():
    # Un toque programado en domingo es un toque que se hace el lunes con un dia de
    # retraso, o que no se hace. La planta no contesta el sabado.
    for d in (date(2026, 10, 3), date(2026, 10, 4)):   # sabado y domingo
        assert cd.habil(d).weekday() < 5
    p = cd.plan_de_un_contacto(cd.CORREO_DIRECTO, date(2026, 10, 3))
    for t in p["toques"]:
        assert date.fromisoformat(t["fecha"]).weekday() < 5


def test_NO_se_programa_un_toque_despues_de_la_caducidad():
    """Es lo que pasa cuando nadie compara los dos relojes: la tarjeta caduca con
    la mitad de sus toques sin hacer."""
    caduca = date(2026, 10, 5)
    p = cd.plan_de_un_contacto(cd.CORREO_DIRECTO, date(2026, 9, 28), caduca)
    for t in p["toques"]:
        assert date.fromisoformat(t["fecha"]) <= caduca


def test_la_cadencia_se_COMPRIME_en_vez_de_perder_toques():
    # "la cadencia se comprime o se salta a correo_directo" (§4b). La senal manda
    # sobre la cadencia, no al contrario.
    p = cd.plan_de_un_contacto(cd.LINKEDIN, date(2026, 9, 28), date(2026, 10, 5))
    assert p["comprimida"] is True
    assert len(p["toques"]) == p["toques_previstos"]
    assert any(t.get("comprimido") for t in p["toques"])
    assert "no cabe antes de la caducidad" in p["nota"]


def test_un_contacto_en_revision_humana_NO_entra_a_la_cadencia():
    """La regla dura dice que no se crea como partner; programarle un toque seria
    la misma afirmacion por otra via."""
    r = cd.plan_de_la_tarjeta(
        [{"puesto": "Compras", "canal_recomendado": cd.CORREO_DIRECTO,
          "revision_humana": True, "motivo_revision": "dos redacciones del puesto"}],
        date(2026, 9, 28), date(2026, 12, 23))
    assert r["contactos_en_cadencia"] == 0
    assert r["toques_totales"] == 0
    assert "EN REVISION HUMANA" in r["avisos"][0]


def test_la_fecha_limite_se_cuenta_desde_que_se_SUBE():
    """Si se contara desde hoy, una tarjeta preparada un viernes y subida el
    miercoles llegaria con la fecha ya vencida."""
    a = cd.actividad_de_refinar_ficha("Pablo", date(2026, 9, 28))
    assert a["arranca"] == "2026-09-28"
    assert a["vence"] == "2026-10-01"      # mar 29, mie 30, jue 1
    b = cd.actividad_de_refinar_ficha("Pablo", date(2026, 10, 2))   # viernes
    assert b["vence"] == "2026-10-07"      # lun 5, mar 6, mie 7
    assert date.fromisoformat(b["vence"]).weekday() < 5


def test_no_se_carga_un_calendario_de_feriados():
    """Seria una tabla que hay que mantener cada ano y que se queda vieja en
    silencio. Un calendario de 2026 leido en 2028 es peor que no tenerlo."""
    import pathlib
    fuente = pathlib.Path(os.path.join(RAIZ, "flujo", "cadencia.py")).read_text()
    assert "feriado" in fuente     # lo dice
    for mes in ("-12-25", "-01-01", "-09-16"):
        assert mes not in fuente   # y no los lista


# ===================================================  la tarjeta de Hershey
def _tarjeta():
    import tarjeta_hershey as th
    return th.armar(sube_el=date(2026, 9, 28), hoy=date(2026, 9, 28))


def test_la_tarjeta_de_hershey_es_la_de_mas_puntaje_y_pasa():
    t = _tarjeta()
    assert t["senal"]["veredicto"] == "pasa"
    assert t["senal"]["puntaje"] >= 80


def test_la_senal_de_hershey_declara_por_que_esa_fuente_y_ese_tipo():
    """Tres piezas apuntan a la misma cuenta y hay que elegir una fuente. La
    eleccion tiene que estar escrita: de esa fuente sale el peso que el lazo 1
    va a mover."""
    t = _tarjeta()
    assert t["senal"]["fuente"] == "correo_propio"
    assert t["senal"]["tipo"] == "necesidad_declarada"
    assert "25 de 25" in t["senal"]["por_que_esta_fuente"]
    assert "subvaluar" in t["senal"]["por_que_esta_fuente"]
    assert "gobierna el reloj" in t["senal"]["por_que_este_tipo"]


def test_la_tarjeta_de_hershey_NO_trae_nombres():
    """Los contactos vivieron en una corrida que se murio con su contenedor, y un
    nombre inventado en la tarjeta que abre el piloto es un nombre que Rissia va a
    marcar."""
    t = _tarjeta()
    for x in t["contactos"]:
        assert "nombre" not in x
        assert x["puesto"]
    assert "no se inventan" in t["sin_nombres_por_que"]


def test_cada_contacto_de_hershey_declara_su_canal_y_su_nivel():
    t = _tarjeta()
    for x in t["contactos"]:
        assert x["por_que_ese_canal"] and x["por_que_ese_nivel"]
        assert x["nivel_confianza"] in ("confirmado", "solido", "candidato")


def test_el_patron_de_hershey_es_SOLIDO_no_confirmado():
    """Se midio con cuatro fuentes, tres contra una, y se informa con salvedad. Un
    patron con salvedad no es confirmado."""
    t = _tarjeta()
    con_correo = [x for x in t["contactos"] if x["con_historia"]]
    assert con_correo
    for x in con_correo:
        assert x["nivel_confianza"] == "solido"
        assert "salvedad" in x["por_que_ese_nivel"].lower()


def test_la_actividad_de_pablo_vence_a_tres_habiles():
    t = _tarjeta()
    a = t["actividad_que_abre"]
    assert a["para"] == "Pablo" and a["tipo"] == "Refinar ficha"
    assert a["habiles"] == 3 and a["vence"] == "2026-10-01"


def test_ningun_toque_de_hershey_cae_despues_de_su_caducidad():
    t = _tarjeta()
    caduca = date.fromisoformat(t["caduca_el"])
    for p in t["cadencia"]["plan"]:
        for x in p["toques"]:
            assert date.fromisoformat(x["fecha"]) <= caduca


# ==================================  D8 · ARREGLADO en #335, y la prueba invertida
def test_D8_los_primeros_toques_YA_NO_caen_el_mismo_dia():
    """La prueba que documentaba el enjambre, invertida.

    En #330 esta prueba exigia que los cuatro primeros toques cayeran el MISMO dia,
    porque eso era lo que el codigo hacia y escalonar cambia como FTS se ve frente
    al cliente -- criterio del dueno--. D8 se aprobo en #335 y ahora exige lo
    contrario: un solo toque #1 por cuenta por dia.
    """
    t = _tarjeta()
    primeros = [p["toques"][0]["fecha"] for p in t["cadencia"]["plan"]
                if p["toques"]]
    assert len(primeros) == 4
    assert len(set(primeros)) == 4, f"dos primeros toques el mismo dia: {primeros}"
    assert t["cadencia"]["un_solo_primer_toque_por_dia"] is True


def test_D8_hay_al_menos_dos_dias_habiles_entre_primeros_toques():
    t = _tarjeta()
    fechas = sorted(date.fromisoformat(p["toques"][0]["fecha"])
                    for p in t["cadencia"]["plan"] if p["toques"])
    for a, b in zip(fechas, fechas[1:]):
        habiles = sum(1 for n in range((b - a).days)
                      if (a + __import__("datetime").timedelta(days=n + 1)).weekday() < 5)
        assert habiles >= cd.SEPARACION_ENTRE_PRIMEROS_TOQUES, (a, b)


def test_D8_arranca_el_de_mayor_nivel_y_canal_mas_directo():
    """Las dos mitades del orden tienen razon propia.

    Mayor nivel primero: si alguien va a contestar, el del dato mejor sostenido es
    el que mas probabilidad tiene, y una respuesta temprana puede volver
    innecesarios los toques que siguen. Canal mas directo primero: el correo con
    historia es el unico que empieza con "sobre lo que platicamos", y gastar el dia
    1 en un conmutador es tirar la unica ventaja que la cuenta da.
    """
    t = _tarjeta()
    orden = t["cadencia"]["orden_de_arranque"]
    assert orden[0] == "Gerente de Mantenimiento"
    # Los dos `solido` con correo directo van antes que los dos `candidato`.
    niveles = [x["nivel_confianza"] for x in cd.orden_de_arranque(t["contactos"])]
    assert niveles == ["solido", "solido", "candidato", "candidato"]


def test_D8_el_desempate_es_ESTABLE():
    """Sin desempate estable, dos corridas de la misma tarjeta escalonarian
    distinto y la cadencia dejaria de ser reproducible -- que es lo que el lazo 3
    necesita para comparar cadencias entre cuentas--."""
    gemelos = [
        {"puesto": "Zeta", "nivel_confianza": "solido",
         "canal_recomendado": cd.CORREO_DIRECTO, "cercania_decision": 10},
        {"puesto": "Alfa", "nivel_confianza": "solido",
         "canal_recomendado": cd.CORREO_DIRECTO, "cercania_decision": 10},
    ]
    una = [x["puesto"] for x in cd.orden_de_arranque(gemelos)]
    otra = [x["puesto"] for x in cd.orden_de_arranque(list(reversed(gemelos)))]
    assert una == otra == ["Alfa", "Zeta"]


def test_D8_un_contacto_en_revision_no_ocupa_lugar_en_el_escalonamiento():
    """No entra a la cadencia, asi que no puede consumir un dia del escalonamiento
    y empujar a los demas."""
    contactos = [
        {"puesto": "En revision", "nivel_confianza": "solido",
         "canal_recomendado": cd.CORREO_DIRECTO, "revision_humana": True,
         "motivo_revision": "dos redacciones"},
        {"puesto": "Bueno", "nivel_confianza": "solido",
         "canal_recomendado": cd.CORREO_DIRECTO},
    ]
    r = cd.plan_de_la_tarjeta(contactos, date(2026, 9, 28), date(2026, 12, 23))
    assert r["contactos_en_cadencia"] == 1
    assert r["orden_de_arranque"] == ["Bueno"]
    # El unico que queda arranca el dia 1, no el dia 3.
    assert r["plan"][0]["toques"][0]["fecha"] == "2026-09-28"


def test_D8_el_plan_DECLARA_si_la_regla_se_cumplio():
    """Quien lea el plan tiene que poder verlo sin ir al codigo."""
    sin = cd.plan_de_la_tarjeta(
        [{"puesto": f"P{i}", "nivel_confianza": "solido",
          "canal_recomendado": cd.CORREO_DIRECTO} for i in range(3)],
        date(2026, 9, 28), date(2026, 12, 23), escalonar=False)
    assert sin["un_solo_primer_toque_por_dia"] is False
    assert any("ENJAMBRE" in a.upper() or "enjambre" in a for a in sin["avisos"])
    con = cd.plan_de_la_tarjeta(
        [{"puesto": f"P{i}", "nivel_confianza": "solido",
          "canal_recomendado": cd.CORREO_DIRECTO} for i in range(3)],
        date(2026, 9, 28), date(2026, 12, 23))
    assert con["un_solo_primer_toque_por_dia"] is True
    assert con["avisos"] == []


def test_D8_el_escalonamiento_no_empuja_toques_despues_de_la_caducidad():
    """El escalonamiento corre las fechas hacia adelante, asi que el ultimo contacto
    tiene menos ventana. Los dos relojes siguen valiendo: nada cae despues."""
    t = _tarjeta()
    caduca = date.fromisoformat(t["caduca_el"])
    for p in t["cadencia"]["plan"]:
        for x in p["toques"]:
            assert date.fromisoformat(x["fecha"]) <= caduca
