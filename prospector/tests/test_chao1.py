from flujo.chao1 import estimar


def test_todo_visto_una_vez_significa_superficie():
    e = estimar([1] * 25 + [2] * 5)
    assert e.no_vistos > 0 and e.cobertura < 0.6


def test_todo_visto_muchas_veces_significa_barrido():
    e = estimar([5] * 20 + [1] * 2 + [2] * 6)
    assert e.cobertura > 0.9


def test_pocos_datos_se_marcan_poco_confiables():
    assert not estimar([1, 1, 2]).confiable


def test_sin_f2_usa_la_correccion_de_sesgo():
    e = estimar([1, 1, 1, 3, 4])
    assert "sesgo" in e.nota


def test_f2_de_uno_NO_es_confiable_aunque_haya_muchos_observados():
    """Hueco que encontro la corrida real de Cuprum (24-sep-2026):
    16 observados, f1=14, f2=1 -> 114 estimados, marcado confiable.
    Con f2=1 el divisor vale 2: el numero lo decide UN contacto."""
    e = estimar([4, 2] + [1] * 14)
    assert e.observados == 16 and e.f1 == 14 and e.f2 == 1
    assert e.estimado == 114.0
    assert not e.confiable, "f2=1 no sostiene una extrapolacion de 7x"
    assert "f2=1" in e.nota


def test_una_cascada_madura_si_es_confiable():
    e = estimar([1] * 8 + [2] * 6 + [3] * 5 + [5] * 4)
    assert e.confiable
