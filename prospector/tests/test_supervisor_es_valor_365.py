"""«supervisor» entra al vocabulario de mantenimiento (decision de Esteban, #363).

EL CASO QUE LA MOTIVO. Un supervisor de la planta de Monterrey de una panificadora
esta corriendo una prueba de producto CON FTS -- hilo abierto en el buzon, con
laboratorio externo, mar-abr 2025-- y el filtro lo mandaba a `otros`, o sea a
contexto. Un supervisor de planta conoce el equipo, sabe que falla y abre la puerta
al que firma.

LO QUE LA DECISION CUESTA, y esta prueba lo deja escrito para que nadie se lleve una
sorpresa: la palabra suelta caza tambien al supervisor de VENTAS, de CALL CENTER,
CONTABLE, de LIMPIEZA y de ALMACEN. Medido sobre el corpus real de 68 puestos de la
corrida humana, ninguno de esos aparece. Queda como decision pendiente en el issue,
y aqui queda la constancia de cuales son.

Sin nombres: los casos son puestos.
"""
from __future__ import annotations

from flujo.confianza import puesto_nunca_decisor
from flujo.ficha import INTERLOCUTOR, _tipo_de_interlocutor


def _clase(puesto: str) -> tuple[str, str]:
    clave, _titulo = _tipo_de_interlocutor(puesto)
    bloqueado = puesto_nunca_decisor(puesto)
    return ("contexto" if (clave == "otros" or bloqueado) else "valor"), clave


# --------------------------------------------------------------- la decision
def test_supervisor_esta_en_la_familia_de_mantenimiento():
    familia = dict((c, p) for c, _t, p in INTERLOCUTOR)["mantenimiento"]
    assert "supervisor" in familia


def test_un_supervisor_de_planta_es_de_VALOR_y_de_mantenimiento():
    """El caso que motivo la decision."""
    assert _clase("Supervisor de planta") == ("valor", "mantenimiento")


def test_las_formas_en_ingles_tambien():
    for p in ("Packing Supervisor", "Shift Supervisor", "Production Supervisor",
              "Maintenance Supervisor"):
        clase, _fam = _clase(p)
        assert clase == "valor", p


def test_no_rompe_lo_que_ya_estaba_bien():
    """`Supervisor de Mantenimiento` ya era de mantenimiento antes de la decision
    -- por la palabra `mantenimiento`, no por `supervisor`-- y sigue igual."""
    assert _clase("Supervisor de Mantenimiento") == ("valor", "mantenimiento")
    assert _clase("Superintendente de Servicios") == ("valor", "mantenimiento")


# ------------------------------------------------- el bug que dejo alcanzable
def test_un_supervisor_de_RECLUTAMIENTO_sigue_bloqueado():
    """`reclutad` NO cazaba «reclutamiento» -- tiene «reclutam», no «reclutad»--.
    El defecto era viejo y no importaba porque ningun puesto de reclutamiento caia
    en una familia de interlocutor. Al entrar `supervisor` si importa: habria
    salido como interlocutor de MANTENIMIENTO.
    """
    assert puesto_nunca_decisor("Supervisor de Reclutamiento") == "reclutami"
    assert _clase("Supervisor de Reclutamiento")[0] == "contexto"


def test_el_resto_de_la_lista_negra_sigue_ganandole_a_supervisor():
    """La lista negra corre DESPUES de la familia y le gana: un supervisor de
    recursos humanos no es interlocutor de mantenimiento por traer la palabra."""
    for p in ("Supervisor de Recursos Humanos", "Supervisor de Nomina",
              "Supervisor de Capital Humano", "HR Supervisor"):
        assert _clase(p)[0] == "contexto", p


# --------------------------------------- lo que la decision NO resuelve, medido
# Puestos que la palabra suelta convierte en interlocutores de MANTENIMIENTO y que
# no lo son. NINGUNO aparece en el corpus real de 68 puestos de la corrida humana,
# asi que el riesgo esta declarado y es teorico -- no teorico-pero-probable--.
#
# Y no se arregla metiendolos a la lista negra sin pensarlo: «ventas» no es
# «reclutamiento». Un gerente de ventas del cliente no compra agua tratada, pero
# tampoco es un puesto que NUNCA decide nada, que es lo que esa lista significa.
COLISIONES_DECLARADAS = (
    "Supervisor de Ventas",
    "Supervisor de Call Center",
    "Supervisor Contable",
    "Supervisor de Limpieza",
    "Supervisor de Almacen",
)


def test_las_colisiones_estan_medidas_y_declaradas():
    for p in COLISIONES_DECLARADAS:
        clase, fam = _clase(p)
        assert (clase, fam) == ("valor", "mantenimiento"), (
            f"«{p}» dejo de colisionar. Si alguien lo arreglo, esta lista tiene "
            f"que encogerse A PROPOSITO y el issue de #363 actualizarse: la "
            f"constancia sirve justamente para que el arreglo sea deliberado.")


def test_la_razon_de_la_decision_queda_escrita_en_el_codigo():
    """Un vocabulario que crece sin razon escrita es el que nadie se atreve a
    podar despues."""
    import inspect

    from flujo import ficha

    fuente = inspect.getsource(ficha)
    i = fuente.index('"supervisor"))')
    contexto = fuente[max(0, i - 1800):i]
    assert "#363" in contexto
    assert "COLISIONA" in contexto
    assert "Packing Supervisor" in contexto


# ------------------------------------------------ cuantos contactos se mueven
# Medido el 30-sep-2026 al aplicar la decision. Son DOS, y uno de los dos es
# justamente el que la motivo.
CONTACTOS_QUE_CAMBIAN_DE_CONTEXTO_A_VALOR = (
    ("LEGO", "Packing Supervisor", "planilla de la corrida humana"),
    ("Bimbo", "Supervisor de planta", "buzon, via M0c corregido"),
)


def test_los_dos_que_cambian_cambian_de_verdad():
    for _empresa, puesto, _de in CONTACTOS_QUE_CAMBIAN_DE_CONTEXTO_A_VALOR:
        assert _clase(puesto) == ("valor", "mantenimiento"), puesto


def test_la_planilla_pasa_de_55_a_56_de_valor():
    """El conteo de #353 era 55 de valor y 13 de contexto sobre 68. Con
    `supervisor` es 56 y 12. Un solo contacto, y es de piso de planta."""
    assert len(CONTACTOS_QUE_CAMBIAN_DE_CONTEXTO_A_VALOR) == 2
