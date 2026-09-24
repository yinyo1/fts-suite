"""Caso F — el dato de UNA fuente reportado como consenso.

Medido en Cuprum: la ficha salio diciendo "patron 100%, el mas limpio de las
ocho". Venia de un solo directorio. Al contrastar, otro da cuprum.com al 45%
y un tercero reporta tambien verzatec.com -empresa hermana- al 20%.

Nadie eligio mal: NO HABIA CASILLA para "las fuentes chocan".
Si este test no atrapa el conflicto, la compuerta de confianza esta mal.
"""
import pytest
from flujo.confianza import Dato, CONFIRMADO, SOLIDO, EN_CONFLICTO
from flujo.compuertas import EstadoModulo, CompuertaCerrada, techo_por_agotado


def test_una_sola_fuente_topa_en_solido_y_NO_es_conflicto():
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com")
    assert d.nivel == SOLIDO, "una fuente confiable es SOLIDO"
    assert d.nivel != CONFIRMADO, "una sola fuente NUNCA es confirmado"
    assert d.nivel != EN_CONFLICTO, (
        "una sola fuente NO es conflicto: marcar asi manda media ficha a "
        "revision humana y vuelve la herramienta inoperable")
    assert not d.choca


def test_el_falso_100_baja_a_conflicto_al_contrastar():
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com", nota="100%")
    d.observar("rocketreach", "nombre.apellido@cuprum.com", nota="45.45%")
    d.observar("contactout", "nombre.apellido@verzatec.com", nota="20% - empresa hermana")
    assert d.choca
    assert d.nivel == EN_CONFLICTO
    assert d.valor is None, "en conflicto NO se elige en silencio"
    assert len(d.valores) == 2


def test_el_ancla_dura_fija_el_dominio_pero_NO_cierra_el_conflicto():
    """El correo real de Outlook prueba que cuprum.com vive.
    NO prueba con que frecuencia se usa: son preguntas distintas."""
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com")
    d.observar("contactout", "nombre.apellido@verzatec.com")
    d.observar("outlook", "nombre.apellido@cuprum.com")   # un correo literal real; su valor vive fuera del repo
    d.ancla_dura = True
    assert d.nivel == EN_CONFLICTO, (
        "usar el ancla para CERRAR el conflicto es fallar el caso: "
        "que dominio existe y con que frecuencia se usa son preguntas distintas")


def test_modulo_no_agotado_no_puede_confirmar():
    """A Cuprum se le hizo UNA consulta de directorio. La regla de cruce no
    puede dispararse con una sola fuente: lo que lo atrapa es el agotado."""
    m = EstadoModulo("M1")
    m.registrar_busqueda("directorios", "cuprum.com leadiq", "leadiq", 4)
    with pytest.raises(CompuertaCerrada, match="MINIMO TRES"):
        m.exigir_agotado()
    assert techo_por_agotado(m, CONFIRMADO) == SOLIDO


def test_con_tres_directorios_de_acuerdo_si_confirma():
    m = EstadoModulo("M1")
    for fuente in ("leadiq", "rocketreach", "contactout"):
        m.registrar_busqueda("directorios", f"cuprum.com {fuente}", fuente, 2)
    m.exigir_agotado()
    d = Dato("puesto")
    d.observar("leadiq", "Plant Manager")
    d.observar("pdf_publico", "Plant Manager")
    assert d.n_raices == 2
    assert techo_por_agotado(m, d.nivel) == CONFIRMADO


def test_el_conflicto_LLEGA_a_la_ficha_limpia():
    """Bug encontrado en la corrida e2e: el challenge detectaba el conflicto,
    lo guardaba en avisos y en el modo procedencia... y la ficha limpia -la
    que lee Rissia- no lo mostraba. Callar un conflicto es afirmar."""
    from flujo.estado import Corrida
    from flujo.confianza import Contacto
    from flujo.ficha import modo_limpio

    c = Corrida("Grupo Cuprum", "San Nicolas, NL", "aluminio")
    x = Contacto("[Persona A]", "proveedores", c.empresa)
    d = x.dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com")
    d.observar("contactout", "nombre.apellido@verzatec.com")
    c.agregar(x)

    html_out = modo_limpio(c)
    assert "En conflicto" in html_out
    assert "verzatec" in html_out and "cuprum.com" in html_out
    assert "revision humana" in html_out


def test_mismo_valor_con_confianzas_muy_distintas_TAMBIEN_choca():
    """Hueco que encontro la corrida REAL de Cuprum (24-sep-2026).

    Tres directorios decian first.last@cuprum.com: uno al 44%, otro al
    45.45%, otro al 100%. El valor coincide y la certeza no. La version
    anterior devolvia SOLIDO, porque solo comparaba valores.

    Reportar el 100% porque una fuente lo dijo es el bug del Caso F con
    otro disfraz: la regla C1 exige marcar la brecha, no promediarla.
    """
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com", nota="44%")
    d.observar("rocketreach", "nombre.apellido@cuprum.com", nota="100.0%")
    assert d.brecha_magnitud == 56.0
    assert d.choca
    assert d.nivel == EN_CONFLICTO


def test_una_brecha_pequena_NO_dispara_conflicto():
    """Que no frene de mas: 44 vs 45.45 es la misma respuesta, no un choque.

    Pero tampoco es SOLIDO: las dos fuentes admiten menos del 60% de certeza.
    El nivel correcto es CANDIDATO -- hay acuerdo, y el acuerdo es sobre algo
    de lo que ninguna de las dos esta segura. Marcar eso SOLIDO era la otra
    mitad del hueco de la regla C1.
    """
    from flujo.confianza import CANDIDATO
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com", nota="44%")
    d.observar("contactout", "nombre.apellido@cuprum.com", nota="45.45%")
    assert d.brecha_magnitud < 20
    assert not d.choca, "44 vs 45.45 no es un conflicto"
    assert d.nivel == CANDIDATO
    assert d.certeza_declarada_baja


def test_dos_fuentes_seguras_y_de_acuerdo_si_llegan_a_solido():
    """Que el piso de certeza no frene de mas tampoco: 92% y 95% de la MISMA
    raiz es SOLIDO, y de raices distintas es CONFIRMADO."""
    from flujo.confianza import CONFIRMADO as CONF
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com", nota="92%")
    d.observar("contactout", "nombre.apellido@cuprum.com", nota="95%")
    assert d.nivel == SOLIDO, "dos directorios son la misma raiz"
    d.observar("pdf_publico", "nombre.apellido@cuprum.com", nota="93%")
    assert d.nivel == CONF, "raiz distinta y de acuerdo: confirmado"


def test_C1_el_formato_alterno_de_signalhire_TAMBIEN_choca():
    """El tercer caso de la regla C1, el de la corrida real de Cuprum: tres
    directorios dicen `first.last` y SignalHire dice `first_lastinitial`.

    Si las dos fuentes escriben el mismo literal pero NOMBRAN formas distintas,
    siguen chocando. El valor no alcanza para decidirlo: hay que mirar la forma.
    """
    d = Dato("patron_correo")
    d.observar("leadiq", "first.last@cuprum.com", forma="first.last")
    d.observar("signalhire", "first.last@cuprum.com", forma="first_lastinitial")
    assert len(d.valores) == 1, "el literal es el mismo"
    assert d.formas == ["first.last", "first_lastinitial"]
    assert d.choca
    assert d.nivel == EN_CONFLICTO
    assert "FORMAS distintas" in d.motivo_conflicto


def test_el_conflicto_por_brecha_DICE_que_es_una_brecha():
    """Un conflicto por brecha de certeza tiene UN solo valor. Sin el motivo,
    la ficha lo imprimia como si no hubiera nada raro: el nombre del dato y un
    valor, sin `A vs B`. Callar el motivo es callar el conflicto."""
    d = Dato("patron_correo")
    d.observar("leadiq", "first.last@cuprum.com", nota="44%")
    d.observar("rocketreach", "first.last@cuprum.com", nota="45%")
    d.observar("contactout", "first.last@cuprum.com", nota="100%")
    assert d.nivel == EN_CONFLICTO
    assert len(d.valores) == 1
    assert "certezas separadas por 56 puntos" in d.motivo_conflicto
    assert "leadiq 44%" in d.motivo_conflicto and "contactout 100%" in d.motivo_conflicto
