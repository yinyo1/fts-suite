"""La linea base del radar tiene que ser reproducible, y su "antes" honesto.

La cifra que contesta "el radar ya sirve o sigue ciego" no se puede opinar. Estas
pruebas sostienen que el artefacto que la calcula mide lo que dice medir.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "herramientas"))

from flujo import catalogo_proyectos as cp
from flujo import radar
import linea_base_radar as lb


def test_el_contexto_sin_d3_deja_el_estado_como_estaba():
    """Una medicion que ensucia el estado del proceso no se puede correr dos veces.

    Y seria peor que inutil: la segunda corrida de la suite mediria contra un
    evaluador mutilado y las pruebas de D3 empezarian a fallar por una razon que
    no tiene nada que ver con D3.
    """
    terminos_antes = dict(radar.TERMINOS_DE_TIPO)
    procesos_antes = cp.PROCESOS_DEL_CLIENTE
    with lb.SinD3():
        assert "planta nueva" not in radar.TERMINOS_DE_TIPO
    assert radar.TERMINOS_DE_TIPO == terminos_antes
    assert cp.PROCESOS_DEL_CLIENTE is procesos_antes


def test_el_antes_se_RECALCULA_no_se_guarda_a_mano():
    # Dentro del contexto, el vocabulario de D3 no existe y "prensa" vuelve a ser
    # un proceso. Asi el "antes" es lo que el evaluador de verdad decia, no lo que
    # alguien recuerda que decia.
    with lb.SinD3():
        assert cp.proceso_de("prensa reporta")["proceso"] == "metalmecanica"
        assert cp.proceso_de("cables automotrices")["proceso"] is None
    assert cp.proceso_de("prensa reporta")["proceso"] is None
    assert cp.proceso_de("cables automotrices")["proceso"] == "arneses_cableado"


def test_una_cuenta_sin_fuente_es_un_HUECO_no_un_cero():
    """La diferencia importa para la metrica: un cero dice "el radar la evaluo y
    la descarto"; un hueco dice "nadie documento su senal". Contar los huecos como
    ceros haria ver al radar peor de lo que es, y contarlos como pasa, mejor."""
    f = lb.medir({"empresa": "X", "planta": "Y", "fuente": None,
                  "nota": "sin senal documentada"})
    assert f["hueco"] is True
    assert "antes" not in f and "despues" not in f


def test_las_cuentas_sin_fecha_traen_su_TECHO_etiquetado():
    """De nueve cuentas con senal, solo tres traen fecha de la nota.

    Puntuarlas con el minimo de frescura las hundiria por un dato que falta;
    puntuarlas como frescas seria inventarles la fecha. Se reportan las dos.
    """
    r = lb.linea_base()
    sin_fecha = [f for f in r["filas"]
                 if not f["hueco"] and not f["fecha_documentada"]]
    assert sin_fecha
    for f in sin_fecha:
        assert f["techo_si_fresca"] > f["despues"], (
            "el techo de una senal sin fecha tiene que ser mayor que su puntaje "
            "documentado: la diferencia ES el costo de no haber anotado la fecha")


def test_una_cuenta_CON_fecha_no_tiene_techo_inventado():
    r = lb.linea_base()
    con_fecha = [f for f in r["filas"]
                 if not f["hueco"] and f["fecha_documentada"]]
    assert con_fecha
    for f in con_fecha:
        assert f["techo_si_fresca"] == f["despues"]


def test_d3_subio_a_la_mayoria_de_las_cuentas_con_senal():
    r = lb.linea_base()
    assert r["subieron_con_d3"] >= r["con_senal_documentada"] - 2


def test_la_linea_base_no_lee_ninguna_corrida():
    """A proposito: las corridas viven en la sesion y se mueren con el contenedor.

    Si esta medicion dependiera de ellas, no se podria repetir manana.
    """
    import pathlib
    fuente = pathlib.Path(lb.__file__).read_text(encoding="utf-8")
    for prohibido in ("_todas_las_corridas", "CORRIDAS(", "carpeta_de_corridas"):
        assert prohibido not in fuente


def test_las_senales_documentadas_declaran_su_procedencia():
    import json
    with open(lb.RUTA, encoding="utf-8") as f:
        d = json.load(f)
    for c in d["cuentas"]:
        if c.get("fuente"):
            assert c.get("documentado_en"), (
                f"{c['empresa']} declara una fuente sin decir donde esta "
                "documentada: una senal sin procedencia es una senal inventada")
            assert c["fuente"] in radar.FUERZA_DE_FUENTE


def test_ninguna_cuenta_con_hueco_trae_fuente_inventada():
    import json
    with open(lb.RUTA, encoding="utf-8") as f:
        d = json.load(f)
    huecos = [c for c in d["cuentas"] if not c.get("fuente")]
    assert huecos, "si no hay huecos, alguien les invento la fuente"
    for c in huecos:
        assert c["tipo"] is None and c["texto"] is None
        assert "HUECO DECLARADO" in (c.get("nota") or "")
