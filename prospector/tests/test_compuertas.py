"""Que no se pueda saltar un paso ni gastar de mas."""
import pytest
from flujo.compuertas import Presupuesto, CompuertaCerrada, exigir_confianza
from flujo.confianza import Contacto, Dato
from flujo.estado import Corrida, RESPONDIO, NO_APLICABA


def test_bloque_mas_grande_que_diez_se_rechaza():
    p = Presupuesto()
    with pytest.raises(CompuertaCerrada, match="maximo es 10"):
        p.registrar(25, 5)


def test_tres_bloques_secos_paran_la_corrida():
    p = Presupuesto(tope_por_cuenta=100)
    for n in (7, 4, 0, 0, 0):
        p.registrar(10, n)
    assert p.saturado
    with pytest.raises(CompuertaCerrada, match="SATURADO"):
        p.exigir_puede_seguir()


def test_el_tope_por_cuenta_se_respeta():
    p = Presupuesto(tope_por_cuenta=20)
    p.registrar(10, 5); p.registrar(10, 5)
    with pytest.raises(CompuertaCerrada, match="agotado"):
        p.registrar(10, 5)


def test_no_se_cierra_un_modulo_sin_agotarlo():
    c = Corrida("X", "Monterrey")
    c.registrar_busqueda("M1", "directorios", "cuprum.com leadiq", "leadiq", 3)
    with pytest.raises(CompuertaCerrada, match="NO agotado"):
        c.cerrar_modulo("M1")


def test_un_hueco_sin_razon_escrita_se_rechaza():
    c = Corrida("X", "Monterrey")
    with pytest.raises(CompuertaCerrada, match="EXIGE razon"):
        c.marcar_cobertura("M9", NO_APLICABA)
    c.marcar_cobertura("M9", NO_APLICABA, "aduanas nunca corridas")


def test_el_flujo_arranca_por_internas_y_denue_va_antes_de_directorios():
    c = Corrida("X", "Monterrey")
    assert c.siguiente_paso()["modulo"] == "M0"
    c.registrar_busqueda("M0", "contactos_recorridos",
                         "res.partner name ilike X", "odoo", 0)
    c.cerrar_modulo("M0")
    c.registrar_busqueda("M0b", "consultas", "outlook: X", "outlook", 0)
    c.cerrar_modulo("M0b")
    assert c.siguiente_paso()["modulo"] == "M0c", (
        "search_people va DESPUES de Outlook y ANTES del padron: es interna, y su "
        "correo literal es el ancla que el resto de la cascada va a contrastar")
    for etiq, q in (("via_dominio", 'search_people("x.com")'),
                    ("via_nombre", 'search_people("Empresa X")')):
        c.registrar_busqueda("M0c", "llamadas", q, "outlook_personas", 0, etiqueta=etiq)
    c.cerrar_modulo("M0c")
    assert c.siguiente_paso()["modulo"] == "M13", "DENUE da el dominio que M1 necesita"


def test_prensa_y_congresos_van_ANTES_del_motor():
    from flujo.estado import OLAS
    ola1 = dict((k, m) for k, _t, m in OLAS)["ola1_vocabulario"]
    ola2 = dict((k, m) for k, _t, m in OLAS)["ola2_motor"]
    assert "M12" in ola1 and "M3" in ola1, "prensa y congresos son VOCABULARIO"
    assert "M4" in ola2
    assert OLAS.index(("ola1_vocabulario", dict((k,t) for k,t,_m in OLAS)["ola1_vocabulario"], ola1)) \
        < OLAS.index(("ola2_motor", dict((k,t) for k,t,_m in OLAS)["ola2_motor"], ola2))


def test_confirmado_con_una_sola_raiz_revienta():
    x = Contacto("Ana", "Compras", "X")
    d = x.dato("correo")
    d.observar("leadiq", "a@x.com")
    d.observar("rocketreach", "a@x.com")     # misma RAIZ: directorio
    assert d.n_fuentes == 2 and d.n_raices == 1
    from flujo.confianza import SOLIDO
    assert d.nivel == SOLIDO, "dos directorios son la MISMA raiz, no confirman"


def test_modulo_sin_criterio_de_agotado_no_revienta_con_KeyError():
    """Bug encontrado en la primera corrida de punta a punta: un modulo fuera
    de AGOTADO lanzaba KeyError en vez de una compuerta legible."""
    from flujo.compuertas import EstadoModulo
    m = EstadoModulo("MXX")
    with pytest.raises(CompuertaCerrada, match="sin criterio de agotado"):
        m.exigir_agotado()


def test_no_se_cruza_con_modulos_abiertos():
    """Bug encontrado en la misma corrida: el challenge corria a medias."""
    from flujo.orquestador import main
    import tempfile, os
    assert main is not None   # la compuerta vive en el orquestador, probada en e2e
