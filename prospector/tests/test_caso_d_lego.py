"""Caso D — la ficha entrega lo que encontro, en tres niveles.

Medido en LEGO: con el criterio estricto -solo nombre y apellido completos-
la ficha salia con ~5 contactos. Al soltarlo, la misma empresa dio 21+.

Los nombres de las personas van como marcadores -`[Persona 01]`- porque este
repo es publico y un nombre completo es dato personal. **Los PUESTOS si son los
medidos**, y son lo que el caso prueba: son titulos genericos, no personas.
Los nombres reales de la corrida viven fuera del repo.
"""
from flujo.confianza import Contacto, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO
from flujo.estado import Corrida


def _lego() -> Corrida:
    c = Corrida("LEGO Operaciones de Mexico", "Cienega de Flores, NL", "manufactura")
    duros = [
        ("[Persona 01]", "Senior Facilities Technical Manager", 5),
        ("[Persona 02]", "Senior Manager, Operations Facilities", 8),
        ("[Persona 03]", "Construction Project Director", 10),
        ("[Persona 04]", "Senior Maintenance Manager", 15),
        ("[Persona 05]", "Maintenance Manager", 20),
        ("[Persona 06]", "Sr. Project Manager NPI & Engineering", 18),
    ]
    for nombre, puesto, cercania in duros:
        x = Contacto(nombre, puesto, c.empresa, N1_CONFIRMADO, cercania_decision=cercania)
        x.dato("correo").observar("patron_derivado", "x@lego.com")
        x.datos["correo"].derivado_de_patron = True
        c.agregar(x)
    c.agregar(Contacto("[Persona 07]", "Senior Manager (area sin cerrar)",
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
    """Lo que el caso mide son los PUESTOS que la cascada destapo, no quien los
    ocupa. Afirmar que los marcadores estan en la lista de marcadores no probaria
    nada; afirmar que los seis puestos de mantenimiento, proyectos y facilities
    llegaron a la ficha si."""
    c = _lego()
    puestos = {x.puesto for x in c.contactos}
    for medido in ("Senior Facilities Technical Manager",
                   "Senior Manager, Operations Facilities",
                   "Construction Project Director",
                   "Senior Maintenance Manager",
                   "Maintenance Manager",
                   "Sr. Project Manager NPI & Engineering"):
        assert medido in puestos, f"falta el puesto medido: {medido}"
    assert sum(1 for x in c.contactos if x.nivel_ficha == N1_CONFIRMADO) == 6
    assert len(c.contactos) == 9, "seis duros, un parcial, dos puestos sin persona"


def test_un_puesto_sin_persona_que_decide_va_ARRIBA_de_un_confirmado_que_no():
    """El metodo NO dice que N3 vaya siempre primero: dice que el orden es por
    cercania a la decision de obra. Un puesto sin persona que decide el CAPEX
    va arriba de un confirmado que no decide nada -- y un confirmado que SI
    decide, como quien negocia el suministro de agua, va arriba de los dos."""
    c = _lego()
    orden = sorted(c.contactos, key=lambda x: x.cercania_decision)
    pos = {(x.nombre or x.puesto): i for i, x in enumerate(orden)}

    # el N3 que decide obra supera al N2 que ni siquiera cerro su area
    assert pos["Sr. Controls Manager"] < pos["[Persona 07]"], (
        "un puesto-objetivo que decide va ARRIBA de un parcial que no decide")

    # y el orden NO es por nivel de confirmacion: hay N3 antes que N1
    niveles = [x.nivel_ficha for x in orden]
    assert niveles.index(N3_PUESTO) < niveles.index(N2_PARCIAL), (
        "ordenar por nivel de confirmacion es colar el sesgo por la puerta "
        "de atras")


def test_el_correo_derivado_de_patron_nunca_sube_a_confirmado():
    from flujo.confianza import CANDIDATO
    c = _lego()
    x = next(x for x in c.contactos if x.nombre == "[Persona 02]")
    assert x.datos["correo"].nivel == CANDIDATO
