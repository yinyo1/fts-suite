"""Caso D — la ficha entrega lo que encontro, en tres niveles.

Medido en LEGO: con el criterio estricto -solo nombre y apellido completos-
la ficha salia con ~5 contactos. Al soltarlo, la misma empresa dio 21+.
"""
from flujo.confianza import Contacto, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO
from flujo.estado import Corrida


def _lego() -> Corrida:
    c = Corrida("LEGO Operaciones de Mexico", "Cienega de Flores, NL", "manufactura")
    duros = [
        ("Hector Joel Huerta Guajardo", "Senior Facilities Technical Manager", 5),
        ("Jorge Duque", "Senior Manager, Operations Facilities", 8),
        ("Karina Garza Trevino", "Construction Project Director", 10),
        ("Victor Hugo Lopez Garcia", "Senior Maintenance Manager", 15),
        ("Marcel Garcia", "Maintenance Manager", 20),
        ("Jorge Robles", "Sr. Project Manager NPI & Engineering", 18),
    ]
    for nombre, puesto, cercania in duros:
        x = Contacto(nombre, puesto, c.empresa, N1_CONFIRMADO, cercania_decision=cercania)
        x.dato("correo").observar("patron_derivado", "x@lego.com")
        x.datos["correo"].derivado_de_patron = True
        c.agregar(x)
    c.agregar(Contacto("Miguel Angel Perez", "Senior Manager (area sin cerrar)",
                       c.empresa, N2_PARCIAL, cercania_decision=40))
    for puesto in ("Sr. Controls Manager", "Quality & EHS Packing Manager"):
        c.agregar(Contacto(None, puesto, c.empresa, N3_PUESTO, cercania_decision=12))
    return c


def test_los_tres_niveles_llegan_a_la_ficha():
    c = _lego()
    niveles = {x.nivel_ficha for x in c.contactos}
    assert niveles == {N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO}, (
        "una cascada que encuentre los tres niveles y entregue solo el primero "
        "falla el Caso D")


def test_reproduce_los_hallazgos_clave_de_lego():
    nombres = {x.nombre for x in _lego().contactos}
    for clave in ("Victor Hugo Lopez Garcia", "Marcel Garcia", "Jorge Robles",
                  "Jorge Duque", "Hector Joel Huerta Guajardo"):
        assert clave in nombres, f"falta el hallazgo medido: {clave}"


def test_un_puesto_sin_persona_que_decide_va_ARRIBA_de_un_confirmado_que_no():
    """El metodo NO dice que N3 vaya siempre primero: dice que el orden es por
    cercania a la decision de obra. Un puesto sin persona que decide el CAPEX
    va arriba de un confirmado que no decide nada -- y un confirmado que SI
    decide, como quien negocia el suministro de agua, va arriba de los dos."""
    c = _lego()
    orden = sorted(c.contactos, key=lambda x: x.cercania_decision)
    pos = {(x.nombre or x.puesto): i for i, x in enumerate(orden)}

    # el N3 que decide obra supera al N2 que ni siquiera cerro su area
    assert pos["Sr. Controls Manager"] < pos["Miguel Angel Perez"], (
        "un puesto-objetivo que decide va ARRIBA de un parcial que no decide")

    # y el orden NO es por nivel de confirmacion: hay N3 antes que N1
    niveles = [x.nivel_ficha for x in orden]
    assert niveles.index(N3_PUESTO) < niveles.index(N2_PARCIAL), (
        "ordenar por nivel de confirmacion es colar el sesgo por la puerta "
        "de atras")


def test_el_correo_derivado_de_patron_nunca_sube_a_confirmado():
    from flujo.confianza import CANDIDATO
    c = _lego()
    x = next(x for x in c.contactos if x.nombre == "Jorge Duque")
    assert x.datos["correo"].nivel == CANDIDATO
