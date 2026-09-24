"""El clasificador del catalogo de proyectos de FTS (motor 1, §3a).

La clasificacion es por VOCABULARIO EXPLICITO y no por un modelo, por dos
razones: Esteban puede leer la lista y corregirla, y una linea que no pega sale
como `sin_clasificar` en vez de caer en el cajon mas parecido. **Un catalogo que
clasifica el 100% miente sobre su propia cobertura**, y hay una prueba que lo
fija asi.
"""
from __future__ import annotations
import pytest

from flujo.catalogo_proyectos import (clasificar_linea, proceso_de, magnitudes,
                                      palabras_de_capacidad, plano,
                                      TIPOS_DE_PROYECTO, PROCESOS_DEL_CLIENTE,
                                      PERFIL_DE_QUIEN_COMPRA)


@pytest.mark.parametrize("texto,tipo", [
    ("SUMINISTRO E INSTALACION DE CHILLER 30 TR", "chiller"),
    ("Sistema de agua helada para proceso 200 TR", "sistema_agua_helada"),
    ("Circuito cerrado de recirculacion para horno", "circuito_cerrado"),
    ("Torre de enfriamiento 150 TR", "torre_de_enfriamiento"),
    ("Intercambiador de placas 45 m3/h", "intercambiador"),
    ("Fabricacion de mezzanine estructural", "mezzanine"),
    ("Integracion de embolsadora a linea", "integracion_embolsadora"),
    ("Subestacion electrica 500 kVA", "subestacion"),
    ("Caldera de vapor 100 BHP", "caldera_vapor"),
    ("PTAR municipal 20 m3/h", "tratamiento_de_agua"),
    ("Sistema de bombeo con carcamo", "bombeo"),
    ("Montaje mecanico de tuberia de proceso", "tuberia_y_montaje"),
])
def test_los_tipos_que_Esteban_nombro(texto, tipo):
    assert clasificar_linea(texto)["tipo"] == tipo


def test_lo_MAS_ESPECIFICO_gana():
    """"Sistema de agua helada" tiene que ganarle a "chiller" cuando la linea
    dice las dos: el sistema es el proyecto y el chiller es un componente suyo."""
    r = clasificar_linea("Sistema de agua helada 200 TR, incluye chiller y bombeo")
    assert r["tipo"] == "sistema_agua_helada"


def test_SERVICIO_contra_EQUIPO_lo_decide_el_verbo_de_suministro():
    """Lo encontro la primera prueba del clasificador: "Mantenimiento preventivo
    semestral de chiller" salia como proyecto de chiller. Contarlo asi infla el
    catalogo de equipo con ventas recurrentes de servicio, y esas dos familias
    las compra gente distinta."""
    assert clasificar_linea(
        "Mantenimiento preventivo semestral de chiller")["tipo"] == \
        "mantenimiento_servicio"
    assert clasificar_linea(
        "SUMINISTRO E INSTALACION DE CHILLER 30 TR, incluye puesta en marcha"
    )["tipo"] == "chiller", "con verbo de suministro es la venta del equipo"
    assert clasificar_linea(
        "Limpieza quimica de intercambiador")["tipo"] == "mantenimiento_servicio"
    assert clasificar_linea(
        "Refaccion: impulsor para bomba")["tipo"] == "refaccion"


@pytest.mark.parametrize("basura", [
    "Flete de equipo a planta", "Anticipo 50%", "Descuento comercial",
    "Viaticos del personal", "Comision de venta", "IVA 16%",
])
def test_lo_que_NO_es_un_proyecto_se_descarta_con_su_razon(basura):
    """Una orden de venta trae fletes, viaticos y anticipos. Contarlos como
    proyectos infla el catalogo con cosas que no dicen nada del alcance."""
    r = clasificar_linea(basura)
    assert r["tipo"] is None
    assert r["descartada"], "se descarta DICIENDO por que"


def test_MODO_DE_FALLA_lo_que_no_pega_sale_SIN_CLASIFICAR():
    """La prueba mas importante del archivo. Un clasificador que siempre
    encuentra un cajon no mide su cobertura: la inventa."""
    r = clasificar_linea("Servicios profesionales varios segun anexo A")
    assert r["tipo"] is None
    assert r["descartada"] == "", (
        "no es basura declarada: es una linea que el vocabulario no cubre, y eso "
        "tiene que poder contarse aparte")


@pytest.mark.parametrize("texto,proceso", [
    ("el piso superior funde cobre OFC", "fundicion"),
    ("para la linea de extrusion de aluminio", "extrusion"),
    ("planta de arneses automotrices", "arneses_cableado"),
    ("llenadora de refresco", "envasado_bebidas"),
    ("horno de temple", "tratamiento_termico"),
    ("area de inyeccion de plastico", "inyeccion"),
    ("planta de lacteos", "alimentos"),
    ("cuarto de data center con CRAC", "datacenter"),
])
def test_el_PROCESO_del_cliente_es_lo_que_genera_la_carga(texto, proceso):
    """No es la industria: dos plantas "automotrices" con procesos distintos son
    dos prospectos distintos. Una fundicion de cobre y un ensamble de arneses no
    compran lo mismo."""
    assert proceso_de(texto)["proceso"] == proceso


def test_el_caso_de_COFICAB_DURANGO_pega_con_fundicion():
    """La validacion de #302: "funde cobre OFC" tiene que llevar a fundicion, que
    es proceso de chiller en el catalogo. Si esto falla, el radar no habria
    puntuado a Coficab."""
    assert proceso_de(
        "el piso superior funde cobre, lo que implica carga fuerte de "
        "enfriamiento")["proceso"] == "fundicion"


@pytest.mark.parametrize("texto,esperado", [
    ("CHILLER 30 TR", [{"valor": 30.0, "unidad": "TR"}]),
    ("200 toneladas de refrigeracion", [{"valor": 200.0, "unidad": "TR"}]),
    ("bomba de 25 HP", [{"valor": 25.0, "unidad": "HP"}]),
    ("subestacion 500 kVA", [{"valor": 500.0, "unidad": "kVA"}]),
    ("flujo de 45 m3/h", [{"valor": 45.0, "unidad": "m3/h"}]),
    ("caldera 100 BHP", [{"valor": 100.0, "unidad": "BHP"}]),
    ("sin magnitud alguna", []),
])
def test_las_magnitudes_se_leen_con_su_unidad(texto, esperado):
    assert magnitudes(texto) == esperado


def test_la_unidad_se_normaliza():
    """Odoo trae 'TR', 'tr' y 'Toneladas de Refrigeracion' en la misma cuenta."""
    for t in ("30 TR", "30 tr", "30 toneladas de refrigeracion"):
        assert magnitudes(t) == [{"valor": 30.0, "unidad": "TR"}]


def test_el_rango_de_capacidad_sale_de_los_proyectos_REALES():
    """Es la tercera capa del match del evaluador, y la que corta por ARRIBA: una
    senal de 1,500 TR no es mejor que una de 200, es de otro tamano de empresa y
    otro competidor."""
    entradas = [
        {"tipo": "chiller", "magnitudes": [{"valor": 30.0, "unidad": "TR"}]},
        {"tipo": "chiller", "magnitudes": [{"valor": 200.0, "unidad": "TR"}]},
        {"tipo": "chiller", "magnitudes": [{"valor": 60.0, "unidad": "TR"}]},
        {"tipo": None, "magnitudes": [{"valor": 9999.0, "unidad": "TR"}]},
    ]
    r = palabras_de_capacidad(entradas)
    assert r["chiller"]["n"] == 3
    assert r["chiller"]["min_TR"] == 30.0
    assert r["chiller"]["max_TR"] == 200.0
    assert 9999.0 not in (r["chiller"]["min_TR"], r["chiller"]["max_TR"]), \
        "una linea sin tipo no aporta rango a ningun tipo"


def test_los_acentos_no_rompen_la_clasificacion():
    assert clasificar_linea("Torre de enfriamiento")["tipo"] == \
        clasificar_linea("TORRE DE ENFRIAMIENTO")["tipo"]
    assert proceso_de("fundición de cobre")["proceso"] == "fundicion"
    assert plano("Ingeniería") == "ingenieria"


def test_cada_tipo_declara_QUIEN_LO_COMPRA():
    """El perfil NO sale de los datos -- eso exigiria mirar personas, y el catalogo
    no las lleva-- sale del metodo, y se declara asi para que nadie lo confunda
    con una medicion."""
    tipos = {t for t, _ in TIPOS_DE_PROYECTO}
    faltan = tipos - set(PERFIL_DE_QUIEN_COMPRA)
    assert not faltan, f"tipos sin perfil de comprador: {faltan}"


def test_ningun_tipo_ni_proceso_esta_declarado_dos_veces():
    for lista, nombre in ((TIPOS_DE_PROYECTO, "tipos"),
                          (PROCESOS_DEL_CLIENTE, "procesos")):
        claves = [k for k, _ in lista]
        assert len(claves) == len(set(claves)), f"{nombre} duplicados"
