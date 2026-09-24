"""El lazo de refuerzo, y el defecto de #24: se disparaba nunca.

La condicion anterior era:

    if est.confiable and est.cobertura < 0.8:  -> seguir barriendo

Al principio de una corrida Chao1 no es confiable -- pocos observados, f2 chico,
casi todo visto una sola vez -- asi que la condicion era falsa y el lazo no
arrancaba. **"No tengo datos para opinar" se leia como "ya termina".**

Es el error exactamente al reves: la falta de datos es la razon mas fuerte para
seguir buscando. Ahora solo `saturo` detiene el lazo, y quien lo detiene cuando
Chao1 no opina es el presupuesto.
"""
import pytest
from flujo.chao1 import estimar, SIN_DATOS, PREMATURO, FALTA_BARRER, SATURO
from flujo.compuertas import CompuertaCerrada
from flujo.confianza import Contacto
from flujo.estado import Corrida, MODULOS_DEL_LOOP


# ------------------------------------------------- los cuatro veredictos
def test_sin_datos_no_detiene_el_lazo():
    e = estimar([])
    assert e.veredicto == SIN_DATOS
    assert not e.detiene_el_loop, "cero contactos es la razon mas fuerte para seguir"


def test_prematuro_NO_detiene_el_lazo():
    """El corazon del defecto. 16 observados, f1=14, f2=1: Chao1 no puede
    opinar, y eso NO es una senal de terminar.

    **La ASERCION DEL TEXTO cambio, no la del comportamiento.** Antes el texto
    decia "eso manda SEGUIR", y esa frase era la otra mitad del defecto: leia un
    "no se" como un "sigue". Un `prematuro` NO MANDA NADA -- con f2=1 no hay
    denominador-- y quien decide es el presupuesto. Lo que esta prueba defiende
    sigue siendo lo mismo: `prematuro` **no detiene** el lazo por su cuenta.
    """
    e = estimar([4, 2] + [1] * 14)
    assert e.veredicto == PREMATURO
    assert not e.opina
    assert not e.detiene_el_loop
    assert "NO OPINA" in e.por_que
    assert "manda SEGUIR" not in e.por_que, (
        "un 'no se' no es una instruccion de seguir: eso era el defecto")


def test_falta_barrer_no_detiene_el_lazo():
    """Chao1 SI opina, y lo que opina es que falta gente: sigue."""
    e = estimar([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    assert e.opina, f"deberia opinar; razones: {e.razones}"
    assert e.veredicto == FALTA_BARRER and e.cobertura < 0.8
    assert not e.detiene_el_loop


def test_solo_saturo_detiene_el_lazo():
    e = estimar([5] * 20 + [1] * 2 + [2] * 6)
    assert e.veredicto == SATURO
    assert e.detiene_el_loop


def test_f2_de_uno_sigue_sin_ser_confiable():
    """Que el veredicto nuevo no haya soltado la regla de #24."""
    e = estimar([4, 2] + [1] * 14)
    assert e.f2 == 1 and e.estimado == 114.0
    assert not e.confiable and "f2=1" in e.nota


# ------------------------------------------- el lazo dentro de la corrida
def _cascada_cerrada(n_contactos: int = 3) -> Corrida:
    """Corrida con las cuatro olas cerradas y pocos contactos: el escenario
    temprano donde el lazo NO se disparaba."""
    c = Corrida("Grupo Cuprum", "San Nicolas, NL", "aluminio")
    c.presupuesto.tope_por_cuenta = 100
    plan = [
        ("M0", "contactos_recorridos", ["odoo"]),
        ("M0b", "consultas", ["outlook"]),
        ("M0c", "llamadas", ["outlook_personas", "outlook_personas"]),
        ("M13", "cortes", ["denue"]),
        ("M1", "directorios", ["leadiq", "rocketreach", "signalhire"]),
        ("M2", "bolsas", ["vacante", "vacante", "vacante"]),
        ("M3", "vias", ["camara", "normalizacion", "congreso"]),
        ("M12", "notas", ["prensa"]),
        ("M4", "combinaciones", ["patron_derivado"]),
        ("M6", "vueltas_secas", ["buscador"]),
        ("M7", "formas", ["pdf_publico", "pdf_publico"]),
        ("M8", "documentos", ["padron_gobierno"]),
        ("M9", "consultas", ["aduana"]),
    ]
    for modulo, clave, fuentes in plan:
        for i, f in enumerate(fuentes):
            # M0c distingue sus dos llamadas por ETIQUETA, no por fuente: las dos
            # van contra search_people. Es el mismo mecanismo que M7.
            etiq = ("via_dominio", "via_nombre")[i] if modulo == "M0c" else None
            c.registrar_busqueda(modulo, clave, f"{modulo} consulta {i} {f}", f, 0,
                                 etiqueta=etiq)
        if modulo == "M2":
            # M2 exige tres fuentes distintas y solo hay una permitida: se cierra
            # declarando el hueco, que es para lo que existen los cinco estados.
            c.cerrar_modulo(modulo, "sin_acceso",
                            "solo una bolsa alcanzable desde este entorno")
        elif modulo == "M7":
            c.cerrar_modulo(modulo, "sin_acceso", "una sola forma corrida")
        else:
            c.cerrar_modulo(modulo)
    for i in range(n_contactos):
        c.registrar_busqueda("M5", "bloques_secos", f"cuprum persona {i}",
                             "buscador", 1,
                             contactos=[Contacto(f"Persona {i}", "Mantenimiento",
                                                 c.empresa)])
    c.presupuesto.registrar(10, n_contactos, de_valor=n_contactos)
    c.cerrar_modulo("M5", "omitida_por_costo", "cerrada a mano para la prueba")
    return c


def test_el_lazo_SI_se_dispara_al_principio():
    """La prueba que el defecto de #24 no tenia. Tres contactos, Chao1 sin
    datos para opinar, presupuesto casi intacto: el paso siguiente tiene que
    ser el lazo, NO el challenge."""
    c = _cascada_cerrada(3)
    est = c.completitud()
    assert est.veredicto == PREMATURO, "con 3 contactos Chao1 no puede opinar"

    p = c.siguiente_paso()
    assert p["ola"] == "loop", (
        f"con presupuesto de sobra el paso es el lazo, no '{p['ola']}'. "
        "Leer 'no puedo opinar' como 'ya termina' es el defecto de #24.")
    assert p["reabrir"] == list(MODULOS_DEL_LOOP)
    assert c.puede_seguir_el_loop()


def test_el_presupuesto_es_quien_detiene_el_lazo_cuando_chao1_no_opina():
    c = _cascada_cerrada(3)
    assert c.siguiente_paso()["ola"] == "loop"
    for _ in range(3):
        # Secos por el criterio NUEVO: cero entradas DE VALOR.
        c.presupuesto.registrar(10, 0, de_valor=0)
    assert c.presupuesto.saturado
    assert not c.puede_seguir_el_loop()
    assert "bloques" in c.que_detiene_el_loop()
    assert c.siguiente_paso()["ola"] == "challenge"


def test_el_tope_por_cuenta_tambien_detiene_el_lazo():
    c = _cascada_cerrada(3)
    c.presupuesto.tope_por_cuenta = c.presupuesto.gastadas
    assert not c.puede_seguir_el_loop()
    assert "tope" in c.que_detiene_el_loop()
    assert c.siguiente_paso()["ola"] == "challenge"


def test_abrir_vuelta_reabre_los_modulos_del_lazo():
    c = _cascada_cerrada(3)
    assert all(c.mod(m).cerrado for m in MODULOS_DEL_LOOP)
    r = c.abrir_vuelta()
    assert r["vuelta"] == 1
    assert all(not c.mod(m).cerrado for m in MODULOS_DEL_LOOP)
    assert c.siguiente_paso()["modulo"] == "M5", "vuelve al motor"


def test_una_vuelta_que_no_gasta_no_puede_dar_otra():
    """Un lazo que gira en seco es el contador vacio aplicado al flujo."""
    c = _cascada_cerrada(3)
    c.abrir_vuelta()
    with pytest.raises(CompuertaCerrada, match="sin un bloque nuevo"):
        c.abrir_vuelta()
    c.presupuesto.registrar(10, 4, de_valor=4)  # se gasto de verdad
    assert c.abrir_vuelta()["vuelta"] == 2


def test_no_se_abre_vuelta_cuando_chao1_dice_que_saturo():
    c = _cascada_cerrada(3)
    # cascada madura y barrida: casi nadie visto una sola vez, y f2 suficiente
    for i, h in enumerate([2] * 5 + [5] * 25):
        x = Contacto(f"Barrido {i}", "Mantenimiento", c.empresa)
        x.hits = h
        c.agregar(x, contar_hit=False)
    est = c.completitud()
    assert est.veredicto == SATURO
    with pytest.raises(CompuertaCerrada, match="Chao1"):
        c.abrir_vuelta()
    assert c.siguiente_paso()["ola"] == "challenge"


def test_la_compuerta_de_la_vuelta_en_seco_sobrevive_al_disco():
    """Defecto que encontro la corrida real de Cuprum: `vueltas_loop` se
    guardaba y el marcador de bloques no, asi que al releer del disco la
    corrida volvia con la vuelta abierta y el marcador en cero -- y cualquier
    bloque viejo la dejaba dar otra vuelta gratis."""
    import json, tempfile, os
    from flujo.orquestador import _cargar, _ruta
    c = _cascada_cerrada(3)
    c.abrir_vuelta()
    d = c.a_dict()
    assert d["bloques_al_abrir_vuelta"] == len(c.presupuesto.bloques), (
        "el marcador tiene que viajar en el JSON")

    vuelta = Corrida(empresa=d["empresa"], ciudad=d["ciudad"])
    for b in d["presupuesto"]["bloques"]:
        vuelta.presupuesto.registrar(b["consultas"], b["nuevas"],
                                     de_valor=b.get("de_valor", 0))
    vuelta.vueltas_loop = d["vueltas_loop"]
    vuelta._bloques_al_abrir_vuelta = d["bloques_al_abrir_vuelta"]
    with pytest.raises(CompuertaCerrada, match="sin un bloque nuevo"):
        vuelta.abrir_vuelta()
