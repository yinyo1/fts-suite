"""Las dos decisiones de criterio aprobadas a partir de la corrida de #295,
y los tres arreglos menores que venian con ellas.

La prueba central replica la corrida real: sus catorce bloques, sus 132
consultas, sus 27 entradas de valor.
"""
from __future__ import annotations
import pytest

from flujo.compuertas import (TAMANO_BLOQUE, BLOQUES_SECOS_PARA_PARAR,
                              SECO_SI_VALOR_MENOR_QUE, Bloque, Presupuesto,
                              AGOTADO, POR_FUENTE, CompuertaCerrada)
from flujo.catalogo import PERMITIDAS
from flujo.confianza import (Contacto, CAMPOS_ACUMULATIVOS, CAMPOS_DE_ANCLA,
                             RAICES, FUENTES_ANCLA)
from flujo.estado import Corrida, OLAS
from flujo.arranque import PLAN


# ===================================================== DECISION 1 · seco = valor
# Los catorce bloques de la corrida de #295, en orden, tal como los cerro:
#   (consultas, entradas nuevas, entradas DE VALOR)
#
# Las columnas 1 y 2 salen del archivo de la corrida. La tercera se reconstruyo
# atribuyendo cada entrada de valor al bloque donde apareci0 por primera vez.
# Los bloques TAL COMO la corrida los cerro, con sus tamanos disparejos: el 7
# quedo en siete consultas y el 12 en cinco, porque los cerre a mano antes de
# que el codigo exigiera bloque completo.
CORRIDA_295 = [
    (10,  0, 0), (10, 18, 6), (10,  4, 2), (10,  7, 3), (10,  7, 3),
    (10, 10, 0), ( 7,  6, 6), (10,  7, 2), (10,  7, 2), (10,  4, 1),
    (10,  0, 0), ( 5,  0, 0), (10,  3, 0), (10,  7, 2),
]

# Las MISMAS 132 consultas recortadas en bloques llenos de diez, que es lo que
# el codigo obliga hoy: desde el arreglo del bloque corto, `cerrar_bloque` se
# niega a cerrar menos de diez sin `--parcial`. Esta es la tabla que modela el
# comportamiento futuro; la de arriba es historia.
CORRIDA_295_LLENOS = [
    (10,  0, 0), (10, 18, 6), (10,  4, 2), (10,  7, 3), (10,  7, 3),
    (10, 10, 0), (10,  9, 6), (10,  7, 2), (10,  7, 3), (10,  1, 0),
    (10,  0, 0), (10,  3, 0), (10,  5, 1), ( 2,  2, 1),
]
VALOR_TOTAL_295 = 27
CONSULTAS_295 = 132


def _hasta_saturar(bloques):
    """Corre los bloques por el presupuesto y devuelve donde cierra la cascada."""
    p = Presupuesto(tope_por_cuenta=10_000)
    for n, (cons, nuevas, valor) in enumerate(bloques, 1):
        p.registrar(cons, nuevas, de_valor=valor)
        if p.saturado:
            return n, p.gastadas, p
    return None, p.gastadas, p


def test_con_el_criterio_VIEJO_la_corrida_de_295_no_cerraba_nunca():
    """El numero que motivo la decision: 132 consultas, 14 bloques, y la regla
    sin pronunciarse una sola vez."""
    secos_viejos = [n for n, (c, nuevas, _v) in enumerate(CORRIDA_295, 1)
                    if c >= TAMANO_BLOQUE and nuevas < 1]
    assert secos_viejos == [1, 11], "solo dos, y nunca dos seguidos"
    seguidos = max(
        (len(r) for r in _rachas(secos_viejos)), default=0)
    assert seguidos < BLOQUES_SECOS_PARA_PARAR
    assert sum(c for c, *_ in CORRIDA_295) == CONSULTAS_295
    assert sum(c for c, *_ in CORRIDA_295_LLENOS) == CONSULTAS_295
    assert (sum(v for *_x, v in CORRIDA_295)
            == sum(v for *_x, v in CORRIDA_295_LLENOS) == VALOR_TOTAL_295)


def _rachas(numeros):
    fuera, actual = [], []
    for n in sorted(numeros):
        if actual and n == actual[-1] + 1:
            actual.append(n)
        else:
            actual = [n]
            fuera.append(actual)
    return fuera


def test_con_el_criterio_NUEVO_la_corrida_de_295_cierra_en_el_bloque_12():
    """Los bloques 10, 11 y 12 son los tres seguidos sin una sola entrada de
    valor. La cascada cierra ahi, con 120 consultas de las 132."""
    bloque, gastadas, p = _hasta_saturar(CORRIDA_295_LLENOS)
    assert bloque == 12
    assert gastadas == 120
    assert p.saturado
    assert [b.numero for b in p.bloques if b.seco] == [1, 6, 10, 11, 12]


def test_con_los_bloques_DISPAREJOS_de_la_corrida_real_aun_asi_no_cerraria():
    """El matiz que no se puede callar.

    Con las fronteras que la corrida uso DE VERDAD, el criterio nuevo tampoco
    se habria pronunciado: los bloques 10 y 11 salen secos, pero el 12 tenia
    cinco consultas y un bloque corto no puede declarar que la veta se acabo,
    asi que rompe la racha.

    No es un defecto del criterio nuevo: es el bloque corto, que era un error
    mio y que el codigo ya no permite. Por eso la tabla que modela el futuro es
    la de bloques llenos, no esta.
    """
    bloque, gastadas, _p = _hasta_saturar(CORRIDA_295)
    assert bloque is None
    assert gastadas == CONSULTAS_295


def test_cerrar_en_el_bloque_12_cuesta_DOS_de_las_27_entradas_de_valor():
    """La cuenta honesta del cambio, no la optimista.

    Cerrar en 120 consultas ahorra 12 y **pierde dos** entradas de valor -- una
    superintendencia de operaciones y un herramental de extrusion, las dos de
    M5--. No es gratis, y el numero tiene que estar escrito donde se vea.
    """
    bloque, _gastadas, _p = _hasta_saturar(CORRIDA_295_LLENOS)
    capturado = sum(v for _c, _n, v in CORRIDA_295_LLENOS[:bloque])
    perdido = VALOR_TOTAL_295 - capturado
    assert capturado == 25
    assert perdido == 2


def test_un_bloque_con_entradas_pero_SIN_VALOR_es_seco():
    """El bloque 13 de la corrida: tres entradas nuevas, cero de valor. Con el
    criterio viejo alargaba la cascada; con este la cierra."""
    assert Bloque(numero=13, consultas=10, nuevas=3, de_valor=0).seco


def test_un_bloque_sin_entradas_pero_CON_VALOR_no_es_seco():
    """Una vuelta que no suma contactos pero le encuentra el puesto a uno que
    habia entrado sin el SI produjo valor."""
    assert not Bloque(numero=1, consultas=10, nuevas=0, de_valor=1).seco


def test_medio_bloque_sigue_sin_poder_declarar_saturacion():
    assert not Bloque(numero=12, consultas=5, nuevas=0, de_valor=0).seco


def test_siguen_siendo_tres_bloques_y_diez_por_bloque():
    assert BLOQUES_SECOS_PARA_PARAR == 3
    assert TAMANO_BLOQUE == 10
    assert SECO_SI_VALOR_MENOR_QUE == 1


def test_el_valor_del_bloque_se_deriva_del_registro_igual_que_las_consultas():
    c = Corrida(empresa="Casa", ciudad="MTY")
    for i in range(TAMANO_BLOQUE):
        x = Contacto(nombre=f"P{i}", puesto="Gerente", empresa="Casa",
                     cercania_decision=10 if i < 4 else 90)
        c.registrar_busqueda("M5", "bloques_secos",
                             f"consulta real numero {i} sobre la casa",
                             "buscador", 1, contactos=[x])
    assert c.bloque_pendiente() == (TAMANO_BLOQUE, TAMANO_BLOQUE, 4)
    b = c.cerrar_bloque()
    assert (b.consultas, b.nuevas, b.de_valor) == (TAMANO_BLOQUE, TAMANO_BLOQUE, 4)
    assert not b.seco


def test_el_ascenso_de_un_contacto_VIEJO_cuenta_para_el_bloque_que_lo_asciende():
    """Paso de verdad en #295: alguien entro sin puesto en el bloque 4 y
    aparecio como superintendencia de fundicion en el 14."""
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.registrar_busqueda("M5", "bloques_secos", "la primera consulta de la casa",
                         "buscador", 1,
                         contactos=[Contacto(nombre="Ana", puesto=None,
                                             empresa="Casa",
                                             cercania_decision=90)])
    assert c.de_valor_ahora() == 0
    c.contactos[0].cercania_decision = 10          # aparecio su puesto
    assert c.bloque_pendiente()[2] == 1


# ================================================ DECISION 2 · M3 a tres vias
def test_M3_exige_TRES_vias_distintas_por_fuente():
    clave, meta, modo, _desc = AGOTADO["M3"]
    assert (clave, meta, modo) == ("vias", 3, POR_FUENTE)


def test_las_tres_vias_de_M3_estan_NOMBRADAS_en_el_catalogo():
    """Con una sola etiqueta el modulo no podria agotarse nunca por fuente."""
    assert set(PERMITIDAS["M3"]) == {"camara", "normalizacion", "congreso"}


def test_las_tres_vias_comparten_raiz_pero_no_contador():
    """Separar en el AGOTADO no es separar en la CONFIANZA: tres documentos
    oficiales no son tres mundos independientes."""
    assert {RAICES[f] for f in PERMITIDAS["M3"]} == {"documento_oficial"}
    assert all(f in FUENTES_ANCLA for f in PERMITIDAS["M3"])


def test_M3_no_se_cierra_con_una_sola_via():
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.registrar_busqueda("M3", "vias", "programa del congreso del giro 2026",
                         "congreso", 3)
    with pytest.raises(CompuertaCerrada, match="NO agotado"):
        c.mod("M3").exigir_agotado()
    c.registrar_busqueda("M3", "vias", "directorio de socios de la camara",
                         "camara", 2)
    c.registrar_busqueda("M3", "vias", "comite tecnico de normalizacion sectorial",
                         "normalizacion", 5)
    c.mod("M3").exigir_agotado()


def test_repetir_la_misma_via_no_agota_M3():
    c = Corrida(empresa="Casa", ciudad="MTY")
    for i in range(5):
        c.registrar_busqueda("M3", "vias", f"otro congreso del giro numero {i}",
                             "congreso", 1)
    with pytest.raises(CompuertaCerrada):
        c.mod("M3").exigir_agotado()


def test_M3_corre_ANTES_del_motor_y_arriba_en_su_ola():
    ola1 = dict((c, m) for c, _t, m in OLAS)["ola1_vocabulario"]
    ola2 = dict((c, m) for c, _t, m in OLAS)["ola2_motor"]
    assert ola1.index("M3") < ola1.index("M1"), "antes que los directorios"
    assert ola1.index("M3") < ola1.index("M2")
    assert "M4" in ola2, "el motor sigue en la ola siguiente"
    plan = [m for m, *_ in PLAN]
    assert plan.index("M3") < plan.index("M4")
    assert plan.index("M3") < plan.index("M1")


# ============================================= los tres arreglos menores
def test_la_trayectoria_con_fechas_NO_dispara_C1():
    """Tres de los once conflictos de #295 eran carrera, no contradiccion."""
    assert "trayectoria" in CAMPOS_ACUMULATIVOS
    x = Contacto(nombre="Ana", puesto="Gerente", empresa="Casa")
    d = x.dato("trayectoria")
    d.observar("rocketreach", "Jefe de Mantenimiento 2016-2019")
    d.observar("linkedin_publico", "Coordinador de Extrusion 2009-2016")
    assert not d.choca
    assert d.nivel != "en_conflicto"


def test_el_puesto_y_la_entidad_SIGUEN_chocando():
    """El arreglo no afloja donde equivocarse cuesta."""
    x = Contacto(nombre="Ana", puesto="Gerente", empresa="Casa")
    p = x.dato("puesto")
    p.observar("linkedin_publico", "Supervisor Sr de Mantenimiento")
    p.observar("zoominfo", "Superintendente de Mantenimiento")
    assert p.choca
    e = x.dato("entidad")
    e.observar("linkedin_publico", "Casa")
    e.observar("rocketreach", "Otra Casa")
    assert e.choca


def test_un_puesto_impreso_en_documento_oficial_NO_ancla_a_la_persona():
    """`tiene_ancla` miraba la FUENTE y no el campo."""
    assert CAMPOS_DE_ANCLA == ("correo",)
    x = Contacto(nombre="Ana", puesto="Ing.", empresa="Casa")
    x.dato("puesto").observar("normalizacion", "Comite Tecnico")
    assert not x.tiene_ancla


def test_un_correo_literal_SI_ancla():
    x = Contacto(nombre="Ana", puesto="Ing.", empresa="Casa")
    x.dato("correo").observar("congreso", "[persona]@example.com")
    assert x.tiene_ancla


def test_el_patron_de_correo_no_ancla_a_la_persona():
    """Un patron habla de una POBLACION de direcciones, no de esta persona."""
    x = Contacto(nombre="Ana", puesto="Ing.", empresa="Casa")
    x.dato("patron_correo").observar("congreso", "nombre.apellido")
    assert not x.tiene_ancla


def test_renombrar_deja_el_nombre_completo_en_la_ficha():
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.registrar_busqueda("M1", "directorios", "el organigrama del directorio",
                         "rocketreach", 1,
                         contactos=[Contacto(nombre="Ana M", puesto="CEO",
                                             empresa="Casa",
                                             cercania_decision=5)])
    x = c.fusionar("Ana M", "Ana Muzquiz")
    assert x.nombre == "Ana Muzquiz"
    assert len(c.contactos) == 1
    assert x.hits == 1, "el hallazgo quedo reapuntado a la clave nueva"
    assert x.modulo_origen == "M1"


def test_fusionar_dos_fichas_de_la_misma_persona_no_infla_el_numerador():
    c = Corrida(empresa="Casa", ciudad="MTY")
    corta = Contacto(nombre="Ana M", puesto=None, empresa="Casa",
                     cercania_decision=50, revision_humana=True,
                     motivo_revision="apellido abreviado")
    corta.dato("entidad").observar("contactout", "Casa")
    larga = Contacto(nombre="Ana Muzquiz", puesto="CEO", empresa="Casa",
                     cercania_decision=5)
    larga.dato("puesto").observar("prensa", "Directora General")
    c.registrar_busqueda("M1", "directorios", "el directorio de contactos",
                         "rocketreach", 1, contactos=[corta])
    c.registrar_busqueda("M12", "notas", "la nota de prensa del nombramiento",
                         "prensa", 1, contactos=[larga])
    assert len(c.contactos) == 2

    x = c.fusionar("Ana M", "Ana Muzquiz")
    assert len(c.contactos) == 1
    assert x.nombre == "Ana Muzquiz"
    assert x.cercania_decision == 5
    assert x.revision_humana, "la revision humana se propaga, no se limpia"
    assert "entidad" in x.datos and "puesto" in x.datos
    assert x.hits == 2, "las DOS busquedas lo trajeron"
    assert x.modulo_origen == "M1", "el primero que lo trajo se queda el credito"


def test_fusionar_algo_que_no_esta_registrado_lanza():
    c = Corrida(empresa="Casa", ciudad="MTY")
    with pytest.raises(CompuertaCerrada, match="No hay contacto"):
        c.fusionar("Nadie", "Nadie Completo")
