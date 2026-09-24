"""Lo que la corrida real de Cuprum del 24-sep-2026 rompio.

Ocho defectos que 132 consultas reales encontraron y que ninguna prueba de
escritorio habia encontrado. Cada prueba de aqui lleva el nombre del sintoma
que se vio en la corrida, no el del metodo que arregla.
"""
from __future__ import annotations
import pytest

from flujo.confianza import (Contacto, CERCANIA_DE_VALOR, CERCANIA_SIN_ESTIMAR,
                             RAICES)
from flujo.compuertas import CompuertaCerrada, TAMANO_BLOQUE, Bloque
from flujo.catalogo import PERMITIDAS
from flujo.estado import Corrida


def _c(**kw) -> Contacto:
    base = dict(nombre="X", puesto="Y", empresa="Casa")
    base.update(kw)
    return Contacto(**base)


# ------------------------------------------------- 1. el filtro de valor
def test_un_correo_literal_NO_asciende_a_quien_ya_se_midio_como_contexto():
    """El directorio sectorial devolvio un correo literal de difusion comercial.

    Con la regla vieja entraba como 'de valor' y habria inflado la unica cifra
    que ordena las prioridades del metodo.
    """
    x = _c(cercania_decision=80)
    x.dato("correo").observar("congreso", "[persona]@example.com")   # fuente de ancla
    assert x.tiene_ancla
    assert not x.de_valor
    assert "no es target" in x.por_que_de_valor or "contexto" in x.por_que_de_valor


def test_el_ancla_SI_desempata_cuando_nadie_estimo_la_cercania():
    x = _c(cercania_decision=CERCANIA_SIN_ESTIMAR)
    x.dato("correo").observar("congreso", "[persona]@example.com")
    assert x.de_valor
    assert "sin estimar" in x.por_que_de_valor


def test_sin_ancla_y_sin_estimar_no_es_de_valor():
    x = _c(cercania_decision=CERCANIA_SIN_ESTIMAR)
    x.dato("entidad").observar("linkedin_publico", "Casa")
    assert not x.de_valor


def test_la_cercania_cerca_sigue_mandando():
    assert _c(cercania_decision=CERCANIA_DE_VALOR).de_valor


# ------------------------------------------------- 2. vigencia
def test_el_mejor_puesto_del_mundo_en_OTRA_empresa_no_cuenta():
    """El asiento de mas valor de la corrida resulto ser director general de
    otra empresa. Sin esto, habria encabezado la ficha."""
    x = _c(cercania_decision=5, sigue_en_la_casa=False)
    assert not x.de_valor
    assert "YA NO ESTA" in x.por_que_de_valor


def test_la_vigencia_solo_se_apaga_nunca_se_reenciende():
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.agregar(_c(cercania_decision=5, sigue_en_la_casa=False))
    c.agregar(_c(cercania_decision=5, sigue_en_la_casa=True))   # perfil viejo
    assert c.contactos[0].sigue_en_la_casa is False


# ------------------------------------------------- 3. la cercania se acerca
def test_la_cercania_se_acerca_cuando_aparece_el_puesto_de_verdad():
    """Entro como 'decision maker' sin puesto (50) y dos bloques despues un
    organigrama lo nombro director general."""
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.agregar(_c(cercania_decision=CERCANIA_SIN_ESTIMAR, puesto=None))
    c.agregar(_c(cercania_decision=5, puesto="Director General"))
    assert c.contactos[0].cercania_decision == 5
    assert c.contactos[0].puesto == "Director General"
    assert c.contactos[0].de_valor


# ------------------------------------------------- 4. el bloque contra evidencia
def _corrida_con(n_busquedas: int, n_contactos: int) -> Corrida:
    c = Corrida(empresa="Casa", ciudad="MTY")
    for i in range(n_busquedas):
        cont = [_c(nombre=f"P{i}")] if i < n_contactos else []
        c.registrar_busqueda("M5", "bloques_secos", f"consulta real numero {i} sobre la casa", "buscador",
                             len(cont) or 1, contactos=cont)
    return c


def test_el_bloque_se_deriva_del_registro():
    c = _corrida_con(TAMANO_BLOQUE, 3)
    b = c.cerrar_bloque()
    assert (b.consultas, b.nuevas) == (TAMANO_BLOQUE, 3)


def test_declarar_un_numero_distinto_al_registro_lanza():
    """El truco del contador vacio, aplicado al presupuesto. En la corrida real
    sume 58 consultas a mano contra 59 registradas y 50 entradas contra 46."""
    c = _corrida_con(TAMANO_BLOQUE, 3)
    with pytest.raises(CompuertaCerrada, match="registro tiene"):
        c.cerrar_bloque(consultas=TAMANO_BLOQUE + 5)
    with pytest.raises(CompuertaCerrada, match="tampoco se escribe a mano"):
        c.cerrar_bloque(nuevas=99)


def test_un_bloque_corto_no_se_cierra_solo():
    c = _corrida_con(5, 0)
    with pytest.raises(CompuertaCerrada, match="bloque corto"):
        c.cerrar_bloque()


def test_medio_bloque_sin_hallazgos_NO_es_seco():
    """Cerre un bloque de cinco consultas sin entradas y el sistema lo conto
    igual que uno de diez. Tres de esos declaraban saturacion con la mitad."""
    assert not Bloque(numero=1, consultas=5, nuevas=0).seco
    assert Bloque(numero=1, consultas=TAMANO_BLOQUE, nuevas=0).seco


def test_el_bloque_parcial_se_cierra_a_proposito_y_no_cuenta_como_seco():
    c = _corrida_con(5, 0)
    b = c.cerrar_bloque(parcial=True)
    assert b.consultas == 5 and not b.seco
    assert c.presupuesto.secos_al_final == 0


def test_las_consultas_que_no_tocan_red_no_gastan_presupuesto():
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.registrar_busqueda("M4", "combinaciones", "producto completo de combinaciones", "patron_derivado", 240)
    assert c.consultas_de_red() == 0
    assert c.bloque_pendiente() == (0, 0)


# ------------------------------------------------- 5. el origen es derivado
def test_el_modulo_de_origen_sobrevive_al_disco():
    """La tabla de rendimiento salio con TODAS las filas en cero y sin quejarse:
    `_cargar` no restauraba el campo. Derivarlo del registro lo vuelve
    imposible."""
    c = _corrida_con(3, 3)
    for x in c.contactos:
        assert x.modulo_origen == "M5"
    c.contactos[0].modulo_origen = ""          # simula la vuelta del disco
    c._recalcular_hits()
    assert c.contactos[0].modulo_origen == "M5"


def test_el_primero_que_lo_trae_se_queda_con_el_credito():
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.registrar_busqueda("M3", "documentos", "consulta de congreso sobre la casa", "congreso", 1,
                         contactos=[_c(nombre="Ana")])
    c.registrar_busqueda("M5", "bloques_secos", "consulta de buscador sobre la casa", "buscador", 1,
                         contactos=[_c(nombre="Ana")])
    assert c.contactos[0].modulo_origen == "M3"


def test_la_tabla_de_rendimiento_suma_lo_que_la_corrida_tiene():
    c = _corrida_con(TAMANO_BLOQUE, 4)
    total = sum(f["entradas"] for f in c.rendimiento())
    assert total == len(c.contactos) == 4


# ------------------------------------------------- 6. el catalogo se corrige
def test_theorg_es_un_directorio_de_M1_y_comparte_raiz():
    """La compuerta de catalogo rechazo la consulta por no tener theorg en la
    lista. Se corrigio la LISTA, no la compuerta."""
    assert "theorg" in PERMITIDAS["M1"]
    assert RAICES["theorg"] == RAICES["rocketreach"] == "directorio"


# ------------------------------------------------- 7. el challenge no pisa
def test_el_challenge_no_borra_los_avisos_de_la_corrida(tmp_path, monkeypatch):
    """`c.avisos = avisos` borraba los avisos de caducidad del padron y las
    subidas de tope -- las DECISIONES de la corrida-- en cada challenge."""
    from flujo import orquestador as orq
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.avisos = ["TOPE SUBIDO de 60 a 120. Razon: la que sea."]
    x = _c(nombre="Ana", cercania_decision=10)
    x.dato("puesto").observar("linkedin_publico", "Gerente")
    c.agregar(x)
    c.guardar(orq._ruta("Casa"))

    orq.main(["challenge", "--empresa", "Casa"])
    orq.main(["challenge", "--empresa", "Casa"])      # dos veces, sin duplicar

    d = orq._cargar("Casa")
    assert any(a.startswith("TOPE SUBIDO") for a in d.avisos)
    marcados = [a for a in d.avisos if a.startswith(orq.MARCA_CHALLENGE)]
    assert len(marcados) == len(set(marcados))
