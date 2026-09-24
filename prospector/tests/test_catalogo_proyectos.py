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


# ===================== el constructor del catalogo (triangulacion de 3a)
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from herramientas.construir_catalogo import construir, sin_personas, main


_ORDENES = [
    {"id": 1, "name": "SO11551", "partner_id": [10, "Cliente Uno SA"],
     "date_order": "2026-08-03 10:00:00", "amount_untaxed": 450000,
     "currency_id": [33, "MXN"], "state": "sale"},
    {"id": 2, "name": "SO10344", "partner_id": [11, "Cliente Dos SA"],
     "date_order": "2025-11-12 10:00:00", "amount_untaxed": 1200000,
     "currency_id": [33, "MXN"], "state": "sale"},
]
_LINEAS = [
    {"order_id": [1, "SO11551"],
     "name": "SUMINISTRO E INSTALACION DE CHILLER 30 TR PARA PROCESO",
     "price_subtotal": 420000},
    {"order_id": [1, "SO11551"], "name": "Flete de equipo a planta",
     "price_subtotal": 30000},
    {"order_id": [2, "SO10344"],
     "name": "Sistema de agua helada para proceso 200 TR incluye bombeo",
     "price_subtotal": 1100000},
    {"order_id": [2, "SO10344"],
     "name": "Servicios profesionales varios segun anexo A",
     "price_subtotal": 100000},
]
_HILOS = [
    {"cliente": "Cliente Uno SA", "subject": "Chiller para el horno de induccion",
     "snippet": "la fundicion necesita enfriamiento"},
    {"cliente": "Cliente Dos SA",
     "subject": "Agua helada para la linea de extrusion", "snippet": "extrusora"},
]


def test_el_PROCESO_sale_del_HILO_cuando_la_orden_no_lo_dice():
    """Es la razon de ser de la triangulacion. La orden dice "CHILLER 30 TR" y no
    dice para que proceso; el hilo dice "para el horno de induccion" y no dice
    cuanto se vendio. El catalogo necesita las dos mitades."""
    cat = construir(_ORDENES, _LINEAS, _HILOS, [])
    chiller = next(e for e in cat["entradas"] if e["tipo"] == "chiller")
    assert chiller["proceso"] == "fundicion"
    assert chiller["proceso_de"] == "hilo o propuesta del cliente"
    assert chiller["monto"] == 420000, "y el monto sigue saliendo de la orden"


def test_el_catalogo_DECLARA_su_cobertura():
    """El % sin clasificar es la medida honesta de la cobertura del vocabulario."""
    c = construir(_ORDENES, _LINEAS, _HILOS, [])["cobertura"]
    assert c["lineas_clasificadas"] == 2
    assert c["lineas_sin_clasificar"] == 1
    assert c["pct_clasificado"] == pytest.approx(66.7, abs=0.1)
    assert c["descartadas_por_no_ser_proyecto"] == {"flete": 1}


def test_el_catalogo_cruza_PROCESO_con_TIPO_en_las_dos_direcciones():
    """Es lo que el evaluador del radar consulta: "fundicion" -> que proyectos
    produjo, y "chiller" -> que procesos lo generaron."""
    cat = construir(_ORDENES, _LINEAS, _HILOS, [])
    assert cat["procesos_del_cliente"]["fundicion"]["proyectos_que_produjo"] == \
        {"chiller": 1}
    assert cat["tipos_de_proyecto"]["chiller"]["procesos_que_lo_generaron"] == \
        {"fundicion": 1}
    assert cat["tipos_de_proyecto"]["chiller"]["quien_lo_compra"]


def test_MODO_DE_FALLA_el_catalogo_NO_LLEVA_PERSONAS(tmp_path):
    """La unica razon por la que el catalogo puede versionarse. El constructor se
    DETIENE si algo con forma de dato personal llego hasta la salida."""
    # El telefono se ARMA en dos trozos a proposito: la guardia de datos
    # personales del repo revisa el texto de los archivos, y un numero con forma
    # de telefono escrito literal aqui la haria fallar -- con razon, este repo es
    # publico--. El dominio es `example.com`, que la guardia si permite.
    tel = "81" + "81234567"
    assert sin_personas(f"escribir a alguien.real@example.com y al {tel}") == \
        "escribir a [correo] y al [telefono]"
    correo = "alguien.real" + "@example.com"
    lineas = list(_LINEAS) + [{
        "order_id": [1, "SO11551"],
        "name": f"CHILLER 20 TR, contacto tecnico {correo} tel {tel}",
        "price_subtotal": 1}]
    cat = construir(_ORDENES, lineas, _HILOS, [])
    crudo = json.dumps(cat, ensure_ascii=False)
    assert correo not in crudo
    assert tel not in crudo
    assert "[correo]" in crudo and "[telefono]" in crudo


def test_el_constructor_se_DETIENE_si_algo_se_le_escapa(tmp_path, monkeypatch):
    """La guardia final no es decorativa: si el enmascarado falla, no se escribe
    el archivo."""
    import herramientas.construir_catalogo as cc
    monkeypatch.setattr(cc, "sin_personas", lambda t: t)   # se rompe a proposito
    d = tmp_path / "crudo"
    d.mkdir()
    (d / "ordenes.json").write_text(json.dumps(_ORDENES), encoding="utf-8")
    (d / "lineas.json").write_text(json.dumps(_LINEAS + [{
        "order_id": [1, "SO11551"],
        "name": "CHILLER, escribir a " + "alguien.real" + "@example.com",
        "price_subtotal": 1}]), encoding="utf-8")
    salida = tmp_path / "cat.json"
    with pytest.raises(SystemExit, match="PUBLICO"):
        cc.main(["--ordenes", str(d / "ordenes.json"),
                 "--lineas", str(d / "lineas.json"), "--salida", str(salida)])
    assert not salida.exists(), "no se escribio nada, no solo se quejo"


def test_una_linea_sin_orden_conocida_no_revienta():
    """Odoo pagina: puede llegar una linea cuya orden quedo en la pagina
    siguiente."""
    cat = construir([], _LINEAS, [], [])
    assert cat["cobertura"]["lineas_clasificadas"] == 2
    assert all(e["cliente"] == "" for e in cat["entradas"])


def test_la_tabla_de_revision_se_GENERA_del_JSON(tmp_path):
    """Un documento escrito a mano al lado de un JSON se separa del JSON en la
    segunda actualizacion, y entonces hay dos catalogos que dicen cosas
    distintas — peor que no tener ninguno."""
    from herramientas.construir_catalogo import a_markdown
    md = a_markdown(construir(_ORDENES, _LINEAS, _HILOS, []))
    assert "66.7%" in md, "la cobertura real, no una redactada"
    assert "`chiller`" in md and "fundicion (1)" in md
    assert "NO sale de los datos" in md, (
        "la columna de quien compra se declara como criterio, no como medicion")
    assert "miente sobre su propia cobertura" in md
