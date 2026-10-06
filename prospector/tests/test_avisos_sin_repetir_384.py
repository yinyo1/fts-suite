"""El documento colapsa los avisos repetidos al EMITIR, no solo al escribir.

La ficha de Dormakaba salio con el parrafo de `[senal]` DOS VECES: los dos
`senal --reevaluar` que corrigieron su giro fueron anteriores al arreglo que
reemplaza en vez de acumular, asi que el duplicado ya estaba en disco y la firma
del estado lo cubria. Un aviso que describe un estado tiene una sola version
cierta; repetirlo solo hace la lista mas facil de ignorar.
"""
from flujo.estado import Corrida, MARCA_SENAL, MARCA_ENTREGA
from flujo.ficha import avisos_sin_repetir, modo_limpio


def test_un_aviso_repetido_sale_UNA_vez_y_en_su_lugar():
    assert avisos_sin_repetir(["a", "b", "a", "c", "b"]) == ["a", "b", "c"]


def test_dos_avisos_que_solo_SE_PARECEN_sobreviven_los_dos():
    """El colapso es por igualdad EXACTA. Dos padrones distintos son dos datos."""
    uno = MARCA_SENAL + "El puntaje se REEVALUO hoy: la frescura cambio."
    otro = MARCA_SENAL + "El puntaje se REEVALUO hoy: la frescura cambio!"
    assert avisos_sin_repetir([uno, otro]) == [uno, otro]


def test_la_lista_vacia_no_se_rompe():
    assert avisos_sin_repetir([]) == []


def test_acepta_un_generador_no_solo_una_lista():
    assert avisos_sin_repetir(x for x in ["a", "a"]) == ["a"]


def _corrida_con(avisos):
    c = Corrida(empresa="Dormakaba", ciudad="Nogales")
    c.avisos = list(avisos)
    return c


def test_EL_CASO_DE_DORMAKABA_el_parrafo_de_senal_sale_una_sola_vez():
    senal = (MARCA_SENAL + "El puntaje se REEVALUO hoy, no es el del dia de la "
             "corrida: la frescura de la senal cambio desde entonces.")
    html = modo_limpio(_corrida_con([senal, senal]))
    assert html.count("El puntaje se REEVALUO hoy") == 1


def test_el_colapso_NO_se_come_el_filtro_de_la_entrega():
    """La marca de entrega sigue fuera del documento, repetida o no."""
    c = _corrida_con([MARCA_ENTREGA + "entrega del 2026-10-06: x",
                      MARCA_ENTREGA + "entrega del 2026-10-06: x",
                      "[angulo] El angulo quedo CONFIRMADO."])
    html = modo_limpio(c)
    assert MARCA_ENTREGA not in html
    assert html.count("El angulo quedo CONFIRMADO") == 1


def test_el_estado_NO_se_reescribe_al_emitir():
    """Reparar el documento no toca la corrida: su firma sigue valiendo."""
    senal = MARCA_SENAL + "El puntaje se REEVALUO hoy."
    c = _corrida_con([senal, senal])
    antes = list(c.avisos)
    modo_limpio(c)
    assert c.avisos == antes == [senal, senal]
