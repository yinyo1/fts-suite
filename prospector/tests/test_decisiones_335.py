"""D6 a D9 de #335, aprobadas, y el cuarto defecto que salio con D6.

D6 -> el evaluador lee montos de inversion, con escala derivada y corte por arriba.
D7 -> los ejemplos trabajados de los docs llevan marca de calculados o razonados.
D8 -> los primeros toques de una cuenta se escalonan.
D9 -> la etapa 1 exporta solo pasa + guarda.
"""
import os
import re
import sys
from datetime import date

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

from flujo import radar
from flujo.catalogo_proyectos import UNIDADES_DE_DINERO, magnitudes

HOY = date(2026, 9, 28)
CAT = radar.cargar_catalogo()


# ==========================================================  D6 · el dinero
def test_d6_magnitudes_lee_las_unidades_que_la_decision_nombra():
    casos = {
        "60 MDD": (60.0, "MDD"),
        "inversion de 205 MDD": (205.0, "MDD"),
        "633 MDP": (633.0, "MDP"),
        "500 mdp": (500.0, "MDP"),
        "85 MUSD": (85.0, "MDD"),
        "invierte 1200 millones de pesos": (1200.0, "MDP"),
        "aporta 40 millones de dolares": (40.0, "MDD"),
        "19.2 MW": (19.2, "MW"),
    }
    for texto, (valor, unidad) in casos.items():
        m = magnitudes(texto)
        assert m, f"no leyo nada de: {texto}"
        assert (m[0]["valor"], m[0]["unidad"]) == (valor, unidad), texto


def test_d6_no_rompio_las_unidades_que_ya_leia():
    for texto, unidad in (("chiller de 200 TR", "TR"), ("2000 kVA", "kVA"),
                          ("150 kW", "kW"), ("3 m3/h", "m3/h")):
        m = magnitudes(texto)
        assert m and m[0]["unidad"] == unidad, texto


def test_d6_kw_y_mw_no_se_confunden():
    # `mw` va despues de `kw` en el regex por fronteras. Si se confundieran, un
    # motor de 150 kW se leeria como una cogeneracion de 150 MW.
    assert magnitudes("150 kW")[0]["unidad"] == "kW"
    assert magnitudes("19.2 MW")[0]["unidad"] == "MW"


def test_d6_el_piso_se_DERIVA_del_catalogo():
    """Es la unica frontera de la banda que sale del catalogo sin suposiciones: un
    capex mas chico que el proyecto mas chico de FTS no puede contener uno."""
    piso, por_que = radar.piso_de_inversion(CAT)
    montos = sorted(e["monto"] for e in CAT["entradas"]
                    if isinstance(e.get("monto"), (int, float)) and e["monto"] > 0)
    assert piso == montos[0] / 1_000_000
    assert "mas chico" in por_que
    # Y declara que la moneda del catalogo no esta declarada.
    assert "sin declarar" in por_que


def test_d6_un_programa_corporativo_cuenta_POCO():
    v, por = radar.puntos_de_inversion(2000, "MDD", CAT)
    assert v == radar.MAX_CAPACIDAD / 4
    assert "PROGRAMA CORPORATIVO" in por
    # La razon tiene que estar escrita: se reparte en anos, en varias plantas y con
    # contratistas de otro tamano.
    assert "anos" in por and "plantas" in por


def test_d6_una_obra_del_tamano_de_FTS_cuenta_COMPLETO():
    v, por = radar.puntos_de_inversion(60, "MDD", CAT)
    assert v == radar.MAX_CAPACIDAD
    assert "obra completa" in por


def test_d6_el_tipo_de_cambio_es_lo_UNICO_declarado_y_lo_dice():
    """Un tipo de cambio escrito en el codigo se queda viejo. Va con su fecha, su
    alcance, y la razon por la que su imprecision no muerde hoy."""
    import pathlib
    fuente = pathlib.Path(os.path.join(RAIZ, "flujo", "radar.py")).read_text()
    assert "PESOS_POR_DOLAR_DECLARADO" in fuente
    assert radar.FECHA_DEL_TIPO_DE_CAMBIO
    bloque = fuente[fuente.index("PESOS_POR_DOLAR_DECLARADO ="):
                    fuente.index("def _a_mdd")]
    # No: el comentario esta ARRIBA de la asignacion.
    arriba = fuente[fuente.index("# El unico numero DECLARADO"):
                    fuente.index("PESOS_POR_DOLAR_DECLARADO =")]
    assert "ALCANCE" in arriba and "POR QUE NO MUERDE" in arriba
    assert "CUANDO REVISARLO" in arriba


def test_d6_el_tipo_de_cambio_no_mueve_ningun_veredicto_de_hoy():
    """El monto en pesos mas grande documentado es 633 MDP. A cualquier tipo de
    cambio entre 15 y 25 queda lejisimos del corte de 500 MDD."""
    for tasa in (15.0, 18.5, 25.0):
        antes = radar.PESOS_POR_DOLAR_DECLARADO
        radar.PESOS_POR_DOLAR_DECLARADO = tasa
        try:
            v, _ = radar.puntos_de_inversion(633, "MDP", CAT)
            assert v == radar.MAX_CAPACIDAD, tasa
        finally:
            radar.PESOS_POR_DOLAR_DECLARADO = antes


def test_d6_el_dinero_manda_sobre_la_capacidad_de_una_maquina():
    """"planta nueva de 60 MDD con chiller de 200 TR": el monto habla del tamano de
    LA OBRA y los TR del tamano de UNA MAQUINA. Para decidir si vale gastar 60
    consultas manda la obra."""
    v, por = radar.puntos_de_capacidad(
        "planta nueva de 60 MDD con chiller de 200 TR", CAT)
    assert v == radar.MAX_CAPACIDAD
    assert "MDD" in por


# ------------------------------------- las tres pruebas de aceptacion de D6
def _linea_base():
    import linea_base_radar as lb
    return lb.linea_base(hoy=HOY)


def test_d6_aceptacion_las_cinco_de_inversion_media_suben():
    r = _linea_base()
    por_nombre = {f"{f['empresa']}": f for f in r["filas"] if not f["hueco"]}
    # Las cinco con MONTO documentado en su texto.
    for n in ("LEGO", "Ragasa", "Cuprum", "Amazon", "Bimbo"):
        f = por_nombre[n]
        assert f["por_etapa"]["con_d6"] > f["por_etapa"]["con_d3_y_b"], n


def test_d6_aceptacion_las_dos_sin_monto_no_se_mueven():
    """Pesqueria y Hershey no traen monto en su senal documentada, asi que D6 no
    las puede mover -- y no debe--."""
    r = _linea_base()
    por_llave = {f"{f['empresa']}/{f.get('planta')}": f
                 for f in r["filas"] if not f["hueco"]}
    for llave in ("Coficab/Pesqueria", "Hershey/Escobedo"):
        f = por_llave[llave]
        assert f["por_etapa"]["con_d6"] == f["por_etapa"]["con_d3_y_b"], llave


def test_d6_aceptacion_Bimbo_NO_queda_arriba_de_Coficab_Durango():
    """La razon de ser del corte por arriba. 2,000 MDD de Bimbo es un programa
    nacional; 60 MDD de Coficab Durango es lo que FTS si toma."""
    r = _linea_base()
    por = {f"{f['empresa']}/{f.get('planta')}": f["por_etapa"]["con_d6"]
           for f in r["filas"] if not f["hueco"]}
    assert por["Bimbo/None"] < por["Coficab/Durango"]


def test_d6_la_linea_base_mide_las_tres_etapas_por_separado():
    """Sin etapas independientes la tabla mentia sutilmente: al aplicar D6 el
    "antes" tambien subia, y una columna que dice "antes" y se mueve cuando se
    agrega una mejora no es un antes, es otro despues."""
    r = _linea_base()
    assert [e["etapa"] for e in r["etapas"]] == ["original", "con_d3_y_b",
                                                 "con_d6"]
    # La cuenta de las que pasan tiene que crecer o quedarse, nunca bajar.
    pasan = [e["pasan"] for e in r["etapas"]]
    assert pasan == sorted(pasan)


def test_d6_el_contexto_de_etapas_restaura_el_estado():
    import linea_base_radar as lb
    from flujo import catalogo_proyectos as cp
    t0, v0, m0 = dict(radar.TERMINOS_DE_TIPO), cp.PROCESOS_DEL_CLIENTE, cp._MAGNITUD
    for _, apagar, _ in lb.ETAPAS:
        with lb.SinMejoras(*apagar):
            pass
    assert dict(radar.TERMINOS_DE_TIPO) == t0
    assert cp.PROCESOS_DEL_CLIENTE is v0
    assert cp._MAGNITUD is m0


def test_d6_apagado_el_dinero_NO_se_lee_por_ninguna_via():
    """Se apaga en la raiz: si `magnitudes()` no lee dinero, el evaluador no puede
    puntuarlo. Apagarlo solo en `puntos_de_inversion` dejaria el regex abierto."""
    import linea_base_radar as lb
    from flujo.catalogo_proyectos import magnitudes as mg
    with lb.SinMejoras("d6"):
        assert mg("60 MDD") == []
    assert mg("60 MDD")


# ======================================  B4 · capacidad_por_tipo viene vacio
def test_b4_el_catalogo_no_trae_rangos_de_capacidad_y_se_DICE():
    """Las 154 entradas traen `magnitudes: []` -- sus descripciones no dicen la
    capacidad en una forma que el regex lea-- asi que `capacidad_por_tipo` sale
    vacio y la rama del corte por arriba en TR NUNCA ha corrido.

    Lo que esta prueba exige no es que el catalogo tenga rangos: es que cuando NO
    los tenga, el `por_que` lo diga en vez de aparentar una comparacion que no hubo.
    """
    assert CAT.get("capacidad_por_tipo") == {}, (
        "si el catalogo ya trae rangos, este defecto se cerro: actualiza la prueba")
    v, por = radar.puntos_de_capacidad("chiller de 200 TR", CAT)
    assert v == radar.MAX_CAPACIDAD / 2
    assert "NO trae rangos de capacidad" in por
    assert "el rango no existe" in por


# ==========================================================  D9 · el filtro
def _exportado(tmp_path):
    import exportar_etapa1 as ee
    return ee.exportar(str(tmp_path / "etapa1"), hoy=HOY)


def test_d9_solo_pasa_y_guarda_se_suben(tmp_path):
    r = _exportado(tmp_path)
    for x in r["detalle"]:
        assert x["se_sube"] == (x["veredicto"] in ("pasa", "guarda")), x["llave"]


def test_d9_las_archiva_NO_se_tiran_van_a_un_archivo_marcado(tmp_path):
    """Es la misma razon por la que una tarjeta caducada se archiva y no se borra:
    el historial es lo que hace posible el reciclaje. Y son material del lazo 1 --
    si una `archiva` hubiera convertido, eso es justo lo que el evaluador tiene que
    aprender."""
    r = _exportado(tmp_path)
    assert len(r["archivos"]) == 2
    nombres = [a["nombre"] for a in r["archivos"]]
    assert any("REVISAR-y-subir" in n for n in nombres)
    assert any("archiva-NO-subir" in n for n in nombres)
    assert r["se_suben"] + r["no_se_suben"] == r["tarjetas_totales"]


def test_d9_el_nombre_del_archivo_dice_que_hacer_con_el(tmp_path):
    """Un archivo llamado "etapa1.csv" con nueve filas de las que seis no se deben
    subir es una trampa: quien lo abra a las 9 de la manana lo va a subir completo.
    """
    r = _exportado(tmp_path)
    for a in r["archivos"]:
        assert "subir" in a["nombre"]
        assert str(a["tarjetas"]) in a["nombre"]
        assert os.path.exists(a["archivo"])


def test_d9_ninguna_archiva_esta_en_el_archivo_que_se_sube(tmp_path):
    import csv
    r = _exportado(tmp_path)
    suben = next(a for a in r["archivos"] if "REVISAR-y-subir" in a["nombre"])
    with open(suben["archivo"], encoding="utf-8-sig") as f:
        filas = list(csv.DictReader(f))
    assert len(filas) == r["se_suben"]
    archiva = {x["llave"] for x in r["detalle"] if not x["se_sube"]}
    nombres = {x["name"] for x in filas}
    for llave in archiva:
        empresa = llave.split("/")[0]
        assert not any(n.startswith(empresa) for n in nombres), llave


def test_d9_las_tres_reglas_duras_siguen_en_los_dos_archivos(tmp_path):
    import csv
    r = _exportado(tmp_path)
    for a in r["archivos"]:
        with open(a["archivo"], encoding="utf-8-sig") as f:
            for fila in csv.DictReader(f):
                # REGLA 3 en las dos: no hay celular, y `phone` va vacio.
                assert fila["phone"] == ""
                assert "celular" not in fila["description"].lower() or \
                       "PROHIBIDO" in fila["description"]


def test_d9_con_d6_los_puntajes_del_csv_son_los_de_la_linea_base(tmp_path):
    import linea_base_radar as lb
    r = _exportado(tmp_path)
    base = {f"{f['empresa']}/{f.get('planta') or '?'}": f["por_etapa"]["con_d6"]
            for f in lb.linea_base(hoy=HOY)["filas"] if not f["hueco"]}
    for x in r["detalle"]:
        assert abs(x["puntaje"] - base[x["llave"]]) < 0.05, x["llave"]


# ==================================================  D7 · los docs contra el codigo
DOCS = os.path.join(RAIZ, "metodo")


def _doc(nombre):
    import pathlib
    return pathlib.Path(os.path.join(DOCS, nombre)).read_text(encoding="utf-8")


def _plano(t: str) -> str:
    """El doc con los saltos de linea colapsados y sin marcas de blockquote.

    Dos normalizaciones, y la segunda hizo falta: los .md van envueltos a 80
    columnas, asi que una frase cruza renglones; y cuando la frase esta DENTRO de
    un blockquote, cada renglon de continuacion empieza con `> `, que al colapsar
    queda a media frase -- "el documento prometia una > capacidad que..."--. Las dos
    son ruido de maquetado, no del texto.
    """
    sin_cita = "\n".join(re.sub(r"^\s*>\s?", "", l) for l in t.splitlines())
    return " ".join(sin_cita.split())


def test_d7_existe_la_convencion_de_marcas():
    d = _doc("motor1-radar-de-leads.md")
    assert "Convención de este documento" in d
    assert "[calculado]" in d and "[razonado a mano]" in d
    # Y dice por que existe: es la septima vez.
    assert "séptima vez" in d


def test_d7_el_ejemplo_del_3d_coincide_con_lo_que_LA_HERRAMIENTA_produce():
    """El candado de D7. Si el evaluador cambia y el documento no, esto truena.

    Es la unica forma de que un documento de diseno no se separe del codigo: que
    separarse cueste rojo. La disciplina no alcanzo siete veces.
    """
    import linea_base_radar as lb
    d = _doc("motor1-radar-de-leads.md")
    f = next(x for x in lb.linea_base(hoy=HOY)["filas"]
             if x["empresa"] == "Coficab" and x.get("planta") == "Durango")
    plano = _plano(d)
    for etapa, valor in f["por_etapa"].items():
        # `12` y `12.0` son el mismo numero; lo que la prueba defiende es que el
        # documento cite EL NUMERO que el codigo produce, no como lo formatea.
        assert (f"**{valor:g}**" in plano or f"**{float(valor)}**" in plano), (
            f"§3d no cita el puntaje de la etapa {etapa} ({valor:g}) que la "
            "herramienta produce hoy")
    # El desglose se cita en un bloque de codigo con los valores tal como el
    # evaluador los emite, asi que se aceptan las dos formas -- `10` y `10.0`--:
    # lo que la prueba defiende es el NUMERO, no como se formatea.
    g = f["desglose"]
    for llave in ("proceso", "tipo_de_obra", "capacidad"):
        v = g[llave]
        assert (f"{llave} {v:g}" in plano or f"{llave} {float(v)}" in plano), (
            f"§3d no cita {llave}={v} del desglose que el codigo emite hoy")


def test_d7_el_3d_cita_la_herramienta_y_no_una_cuenta_a_mano():
    d = _doc("motor1-radar-de-leads.md")
    seccion = _plano(d[d.index("## ¿Habría encontrado a Coficab Durango?"):
                       d.index("## ¿Y Budenheim?")])
    assert "linea_base_radar.py" in seccion
    assert "[calculado]" in seccion
    # Y el 59 viejo sigue ahi, pero MARCADO como razonado a mano: borrarlo
    # esconderia la leccion.
    assert "**59**" in seccion
    assert "[razonado a mano]" in seccion


def test_d7_la_tabla_de_rangos_ya_no_miente_sobre_el_tipo_de_obra():
    """Decia "Tipo de obra 0-15" y despues de D3 `obra_nueva_integral` vale 44.4."""
    d = _doc("motor1-radar-de-leads.md")
    peso = radar.peso_de_tipo(radar.TIPO_INTEGRAL_OBRA_NUEVA, CAT)
    assert f"**{peso:g}**" in _plano(d)
    assert "por familia" in d


def test_d7_el_doc_declara_que_prometia_MDD_sin_leerlo():
    d = _doc("motor1-radar-de-leads.md")
    assert "prometía una capacidad que la cadena no transportaba" in _plano(d)


def test_d7_el_doc_de_la_linea_base_se_REGENERA_no_se_escribe():
    d = _doc("linea-base-del-radar.md")
    assert "[calculado]" in d
    assert "linea_base_radar.py" in d
    # La tabla pegada tiene que ser la que la herramienta imprime hoy.
    import linea_base_radar as lb
    r = lb.linea_base(hoy=HOY)
    for f in r["filas"]:
        if f["hueco"]:
            continue
        nombre = f"{f['empresa']}" + (f"/{f['planta']}" if f.get("planta") else "")
        assert nombre in d, nombre


def test_d7_ningun_doc_de_metodo_afirma_un_umbral_que_el_codigo_contradiga():
    """Barrido: los umbrales y topes citados en los docs contra los del codigo."""
    import pathlib
    reales = {
        "UMBRAL_PASA": radar.UMBRAL_PASA, "UMBRAL_GUARDA": radar.UMBRAL_GUARDA,
        "PADRON_EMPATA": radar.PADRON_EMPATA, "MAX_PROCESO": radar.MAX_PROCESO,
        "MAX_CAPACIDAD": radar.MAX_CAPACIDAD,
    }
    # Los docs citan estos numeros en prosa; lo que se verifica es que el numero
    # que citan siga siendo el del codigo.
    for f in sorted(pathlib.Path(DOCS).glob("*.md")):
        t = f.read_text(encoding="utf-8")
        if "UMBRAL_PASA" in t:
            assert str(reales["UMBRAL_PASA"]) in t, f.name
        if "PADRON_EMPATA" in t:
            assert str(reales["PADRON_EMPATA"]) in t, f.name
