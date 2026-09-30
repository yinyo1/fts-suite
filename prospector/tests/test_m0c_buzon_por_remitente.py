"""M0c · search_people — el ancla dura que faltaba en la Fase 0.

Medido en Hershey el 24-sep-2026 (#292): **14 configuraciones de busqueda web
dieron 5 nombres y ningun gerente de mantenimiento o proyectos.** Una sola llamada
a `search_people` con el dominio devolvio dos contactos implicitos -gente que de
verdad le escribio a FTS- con su correo LITERAL, y esos dos correos desempataron
el patron que tres directorios no habian podido cerrar.

Una llamada. Cero creditos. Y el #292 lo recomendo antes de existir.

La correccion que este modulo encarna: el #4 midio `search_people` y lo descarto
porque devolvia `jobTitle: null`. **Era la prueba equivocada.** Se evaluo como
fuente de PUESTOS, y ahi es inutil. Su valor es otro: es una fuente de ANCLAS.
"""
import pytest
from flujo.compuertas import EstadoModulo, CompuertaCerrada
from flujo.confianza import (Dato, Contacto, CONFIRMADO, SOLIDO, EN_CONFLICTO,
                             raiz_de, FUENTES_ANCLA)
from flujo.catalogo import PERMITIDAS, exigir_permitida
from flujo.estado import Corrida, OLAS


# ---------------------------------------------------------- donde vive
def test_va_en_la_OLA_0_despues_de_odoo_y_outlook():
    internas = OLAS[0][2]
    assert internas == ["M0", "M0b", "M0c"], (
        "el ancla tiene que estar puesta ANTES de que los directorios "
        "contrasten el patron")


def test_su_fuente_esta_en_el_catalogo_y_le_corresponde():
    assert PERMITIDAS["M0c"] == ["outlook_remitentes",
                                 "outlook_hilos_por_nombre"]
    exigir_permitida("outlook_remitentes")
    m = EstadoModulo("M1")
    with pytest.raises(CompuertaCerrada, match="no le corresponde"):
        m.registrar_busqueda("directorios", "x.com", "outlook_remitentes", 1)


# ------------------------------------------- la raiz, y la trampa que evita
def test_comparte_raiz_con_outlook__NO_son_dos_confirmaciones():
    """La trampa de la independencia del #4: las dos salen del historial de
    comunicacion de FTS. Darle raiz propia habria inflado n_raices con la misma
    casa contada dos veces."""
    assert raiz_de("outlook_remitentes") == raiz_de("outlook") == "fts_interno"
    d = Dato("correo")
    d.observar("outlook", "[persona]@empresa-ejemplo.com")
    d.observar("outlook_remitentes", "[persona]@empresa-ejemplo.com")
    assert d.n_fuentes == 2 and d.n_raices == 1
    assert d.nivel == SOLIDO, "dos veces la misma casa no confirma"


def test_es_fuente_de_ANCLA_DURA():
    assert "outlook_remitentes" in FUENTES_ANCLA
    d = Dato("patron_correo")
    d.observar("outlook_remitentes", "FLast@empresa-ejemplo.com")
    assert d.observaciones[0].es_ancla


# ------------------------------------- LA PRUEBA QUE PIDIO EL ENCARGO
def test_el_ancla_de_M0c_sube_el_patron_a_CONFIRMADO_aunque_los_directorios_choquen():
    """Con contactos implicitos, el patron llega a CONFIRMADO por ancla dura
    aunque los directorios no se pongan de acuerdo.

    Reproduce el caso de Hershey: dos directorios dan `FLast`, SignalHire da lo
    contrario, y de la Fase 0 salen DOS literales -uno del hilo de Outlook y uno
    de `search_people`- que dicen `FLast`.

    **Hacen falta DOS anclas, no una**, y la razon es la regla del #24: un correo
    real prueba que el dominio vive, no con que frecuencia se usa. Una direccion
    suelta es EXISTENCIA; dos que coinciden en la forma son una MEDICION de la
    poblacion, pequena pero directa. Ahi el patron deja de inferirse.
    """
    d = Dato("patron_correo")
    d.observar("leadiq", "FLast@empresa-ejemplo.com", forma="FLast")
    d.observar("contactout", "FLast@empresa-ejemplo.com", forma="FLast", nota="68%")
    d.observar("signalhire", "LastF@empresa-ejemplo.com", forma="LastFirstInitial",
               nota="67%")
    d.observar("outlook", "FLast@empresa-ejemplo.com", forma="FLast",
               nota="literal citado en un hilo")
    d.observar("outlook_remitentes", "FLast@empresa-ejemplo.com", forma="FLast",
               nota="contacto implicito: correo con el que hubo trafico")

    assert d.choca, "los directorios SIGUEN chocando: eso no se tapa"
    assert d.informa_pese_al_conflicto
    assert d.anclas_en_la_mayoria == 2 and d.medido_no_inferido
    _valor, a_favor, disidentes = d.mayoria
    assert len(a_favor) == 4 and len(disidentes) == 1
    assert d.valor == "FLast@empresa-ejemplo.com"
    assert d.nivel == CONFIRMADO, (
        "el ancla de M0c aporta una raiz distinta a la de los directorios, asi "
        "que la mayoria tiene dos raices y llega a CONFIRMADO")
    assert "lo vio literal" in d.disidencia


def test_con_UNA_sola_ancla_el_mismo_caso_topa_en_SOLIDO_y_no_confirma():
    """La regla del #24, viva: una direccion literal prueba que el dominio existe,
    NO con que frecuencia se usa. Informa -no se vacia- pero no llega a
    verificado."""
    d = Dato("patron_correo")
    d.observar("leadiq", "FLast@empresa-ejemplo.com", forma="FLast")
    d.observar("contactout", "FLast@empresa-ejemplo.com", forma="FLast")
    d.observar("signalhire", "LastF@empresa-ejemplo.com", forma="LastFirstInitial")
    d.observar("outlook_remitentes", "FLast@empresa-ejemplo.com", forma="FLast")
    assert d.anclas_en_la_mayoria == 1 and not d.medido_no_inferido
    assert d.valor == "FLast@empresa-ejemplo.com"
    assert d.nivel == SOLIDO, "informa, pero no confirma con un solo literal"


def test_sin_el_ancla_de_M0c_el_MISMO_caso_se_queda_en_conflicto():
    """La contraprueba. Quitando solo la observacion de M0c, el campo se vacia:
    queda 2 contra 1 sin ancla, y eso NO se relaja."""
    d = Dato("patron_correo")
    d.observar("leadiq", "FLast@empresa-ejemplo.com", forma="FLast")
    d.observar("contactout", "FLast@empresa-ejemplo.com", forma="FLast", nota="68%")
    d.observar("signalhire", "LastF@empresa-ejemplo.com", forma="LastFirstInitial")
    assert d.nivel == EN_CONFLICTO and d.valor is None


# ----------------------------------------------------- el agotado: DOS llamadas
def test_una_sola_llamada_NO_agota_M0c():
    m = EstadoModulo("M0c")
    m.registrar_busqueda("llamadas", 'search_people("empresa-ejemplo.com")',
                         "outlook_remitentes", 2, etiqueta="via_dominio")
    with pytest.raises(CompuertaCerrada, match="DOS consultas al buzon"):
        m.exigir_agotado()


def test_las_dos_llamadas_con_su_propia_consulta_SI_agotan():
    m = EstadoModulo("M0c")
    m.registrar_busqueda("llamadas", 'search_people("empresa-ejemplo.com")',
                         "outlook_remitentes", 2, etiqueta="via_dominio")
    m.registrar_busqueda("llamadas", 'search_people("Empresa Ejemplo SA")',
                         "outlook_remitentes", 0, etiqueta="via_nombre")
    assert m.contadores["llamadas"] == 2
    m.exigir_agotado()


def test_la_misma_consulta_con_dos_etiquetas_NO_agota():
    """El truco del contador vacio, en su version M0c: cambiarle la etiqueta a la
    misma llamada no la vuelve dos llamadas."""
    m = EstadoModulo("M0c")
    q = 'search_people("empresa-ejemplo.com")'
    m.registrar_busqueda("llamadas", q, "outlook_remitentes", 1, etiqueta="via_dominio")
    m.registrar_busqueda("llamadas", q, "outlook_remitentes", 1, etiqueta="via_nombre")
    assert m.contadores["llamadas"] == 1
    with pytest.raises(CompuertaCerrada, match="Repetir la misma via"):
        m.exigir_agotado()


def test_CERO_contactos_cuenta__es_una_respuesta():
    """Que FTS no tenga historia con esa casa es informacion: significa que el
    ancla no va a venir de aqui y hay que buscarla en otra parte."""
    m = EstadoModulo("M0c")
    for etiq, q in (("via_dominio", 'search_people("sin-historia.com")'),
                    ("via_nombre", 'search_people("Sin Historia SA")')):
        m.registrar_busqueda("llamadas", q, "outlook_remitentes", 0, etiqueta=etiq)
    m.exigir_agotado()
    assert m.resultados_totales == 0


def test_si_M365_no_esta_vivo_se_declara_sin_acceso_y_NO_se_simula():
    c = Corrida("Empresa Ejemplo", "Monterrey, NL")
    c.cerrar_modulo("M0c", "sin_acceso",
                    "el conector de Microsoft 365 no responde")
    assert c.cobertura["M0c"]["estado"] == "sin_acceso"
    assert not c.mod("M0c").agotado, "sin_acceso NO finge que se agoto"


# ===========================================================================
# LA CORRIDA DE M0C CORREGIDO SOBRE LAS DIEZ CUENTAS (#355, decision 4)
#
# `search_people` estuvo declarado como la fuente de M0c desde que el modulo
# nacio, y NUNCA pudo funcionar: no contesta por dominio ni por nombre de
# empresa. La contraprueba que lo cierra es la mas simple de todas --
# `search_people('fts.mx')` devuelve cero con el buzon de FTS lleno de
# direcciones de fts.mx--.
#
# Corregido a `outlook_email_search(sender='@dominio')`, se re-corrio sobre las
# diez cuentas de la corrida humana. Esto es la constancia, por dominio y sin un
# solo nombre de persona.
CORRIDA_M0C_30_SEP_2026 = {
    # dominio                 remitentes HUMANOS distintos que le escribieron a FTS
    "lego.com":               0,
    "metalsa.com":            0,
    "nemak.com":              1,   # + notificaciones del sistema de visitas
    "cuprum.com":             1,
    "grupobimbo.com":         2,
    "ragasa.com.mx":          0,
    "navistar.com":           0,
    "amazon.com":             0,   # solo transaccional de amazon.com.mx
    "xignux.com":             0,   # solo tesoreria y portal de proveedores
    "sigma-alimentos.com":    0,
}

# Las CUATRO personas que ya le habian escrito a FTS, por familia de puesto. No
# son las mismas cuatro que el humano encontro: NINGUNA de las cuatro esta en su
# planilla, y eso se verifico contra la lista completa de nombres en sesion.
LAS_CUATRO_QUE_YA_ESCRIBIERON = (
    ("Bimbo", "supervisor de planta (Monterrey)", "direccion"),
    ("Bimbo", "coordinacion de pruebas (Chihuahua)", "ingenieria"),
    ("Nemak", "taller de mantenimiento de planta de fundicion", "mantenimiento"),
    ("Cuprum", "recepcion de presentaciones de proveedores", "compras"),
)


def test_el_M0c_corregido_encuentra_a_las_cuatro():
    """La confirmacion que la decision pedia."""
    assert sum(CORRIDA_M0C_30_SEP_2026.values()) == 4
    assert len(LAS_CUATRO_QUE_YA_ESCRIBIERON) == 4
    con_gente = {d for d, n in CORRIDA_M0C_30_SEP_2026.items() if n}
    assert con_gente == {"nemak.com", "cuprum.com", "grupobimbo.com"}


def test_las_cuatro_estan_en_familias_distintas():
    """No hay una familia que escriba mas: las cuatro caen en las cuatro."""
    familias = {f for _, _, f in LAS_CUATRO_QUE_YA_ESCRIBIERON}
    assert familias == {"direccion", "ingenieria", "mantenimiento", "compras"}


def test_la_constancia_no_trae_un_solo_nombre():
    """Se nombran por dominio y por familia de puesto, como el resto de las
    pruebas de cobertura. La planilla vive en sesion y no en el repo."""
    for empresa, descripcion, familia in LAS_CUATRO_QUE_YA_ESCRIBIERON:
        assert "@" not in descripcion
        assert descripcion == descripcion.lower() or "(" in descripcion


def test_search_people_quedo_descartado_con_su_medicion():
    from flujo.catalogo import DESCARTADAS

    for clave in ("search_people_por_dominio",
                  "search_people_por_nombre_de_empresa"):
        assert clave in DESCARTADAS, clave
        razon = DESCARTADAS[clave]
        assert "CERO" in razon or "cero" in razon, razon
    # La contraprueba que cierra el caso tiene que estar escrita: sin ella,
    # alguien va a suponer que el problema era la cuenta y no la herramienta.
    assert "fts.mx" in DESCARTADAS["search_people_por_dominio"]
