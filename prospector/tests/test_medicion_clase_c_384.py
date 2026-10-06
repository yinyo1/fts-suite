"""Los numeros del documento de metodo SON los de la medicion (#384).

POR QUE EXISTE: en #353 y en #382 la misma falla aparecio dos veces -- una prosa
que decia «once puertas» cuando eran doce, y otra que decia «362 dias contra 10»
cuando el mas fresco era 7--. Un numero escrito a mano en un documento de metodo
envejece sin avisar, y el documento es lo que se cita para decidir.

Aqui se fija la otra mitad: que la tabla del documento case con el archivo de
medicion, y que el archivo de medicion NO lleve datos personales, porque el repo
es publico.
"""
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

MEDICION = RAIZ / "datos" / "medicion-limite-clase-c-2026-10-06.json"
DOC = RAIZ / "metodo" / "limite-de-clase-c.md"


def _med():
    return json.loads(MEDICION.read_text(encoding="utf-8"))


def _doc():
    """El documento con los saltos de linea planchados.

    Markdown parte las frases donde le toca la columna 80, y una frase citada
    aqui no tiene por que saber donde quedo el corte.
    """
    crudo = DOC.read_text(encoding="utf-8")
    # La marca de cita `>` al inicio de renglon se quita: parte frases que en la
    # pagina se leen de corrido.
    sin_cita = "\n".join(re.sub(r"^>\s?", "", l) for l in crudo.splitlines())
    return " ".join(sin_cita.split())


def test_los_totales_del_archivo_son_la_suma_de_sus_cuentas():
    m = _med()
    t = m["totales"]
    cs = m["cuentas"]
    assert t["cuentas"] == len(cs)
    for llave in ("consultas_de_red", "bloques_cerrados", "bloques_secos",
                  "consultas_de_m5", "contactos", "de_valor_con_nombre"):
        assert t[llave] == sum(c[llave] for c in cs), (
            f"'{llave}' no es la suma de las cuentas: el total esta a mano")


def test_cada_cuenta_respeta_el_tope_declarado():
    m = _med()
    for c in m["cuentas"]:
        assert c["consultas_de_red"] <= m["tope_por_cuenta"], (
            f"{c['empresa']} gasto {c['consultas_de_red']} y el tope declarado "
            f"es {m['tope_por_cuenta']}")


def test_los_niveles_declarados_cuadran_con_el_conteo_de_valor():
    """Si una cuenta dice 2 de valor, tiene que declarar 2 niveles."""
    for c in _med()["cuentas"]:
        assert len(c["niveles_de_los_de_valor"]) == c["de_valor_con_nombre"], (
            f"{c['empresa']}: {c['de_valor_con_nombre']} de valor y "
            f"{len(c['niveles_de_los_de_valor'])} nivel(es) declarado(s)")


def test_el_archivo_de_medicion_NO_lleva_datos_personales():
    """El repo es publico. Los nombres viven en la corrida y en OneDrive.

    No se puede probar «no hay nombres» en general, asi que se prueba lo que si
    se puede: que no haya correos, ni telefonos, ni la llave `nombre`.
    """
    crudo = MEDICION.read_text(encoding="utf-8")
    assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", crudo), (
        "hay algo con forma de correo en el archivo de medicion")
    # Las fechas ISO se quitan antes: tienen forma de telefono y no lo son.
    sin_fechas = re.sub(r"\d{4}-\d{2}-\d{2}", "", crudo)
    assert not re.search(r"\+?\d[\d\s().-]{8,}\d", sin_fechas), (
        "hay algo con forma de telefono en el archivo de medicion")
    for c in _med()["cuentas"]:
        assert "nombre" not in c, f"{c['empresa']} trae la llave `nombre`"


def test_la_tabla_del_documento_cita_los_totales_del_archivo():
    t = _med()["totales"]
    doc = _doc()
    fila = [l for l in DOC.read_text(encoding="utf-8").splitlines()
            if l.startswith("| **Total**")]
    assert len(fila) == 1, "la tabla del documento tiene que traer su renglon de Total"
    cifras = re.findall(r"\*\*(\d+)\*\*", fila[0])
    assert cifras == [str(t["consultas_de_red"]), str(t["bloques_cerrados"]),
                      str(t["bloques_secos"]), str(t["consultas_de_m5"]),
                      str(t["contactos"]), str(t["de_valor_con_nombre"])], (
        f"el renglon de Total dice {cifras} y la medicion dice "
        f"{[t['consultas_de_red'], t['bloques_cerrados'], t['bloques_secos'], t['consultas_de_m5'], t['contactos'], t['de_valor_con_nombre']]}")


def test_el_documento_cita_las_cifras_que_HACEN_la_regla():
    """Las cuatro que sostienen el enunciado, no la tabla entera."""
    t = _med()["totales"]
    doc = _doc()
    for frase in (
        f"**{t['de_valor_que_salieron_de_prensa']} de "
        f"{t['de_valor_con_nombre']}** salieron de **prensa",
        f"**{t['de_valor_a_nivel_de_planta']} de {t['de_valor_con_nombre']}** "
        "está a nivel de **planta**",
        f"**0 de {t['de_valor_con_nombre']}** traen **correo literal**",
        f"**0 de {t['consultas_de_red']}** consultas",
    ):
        assert frase in doc, f"el documento no cita: {frase!r}"


def test_el_documento_se_declara_REGLA_y_no_sospecha():
    doc = _doc()
    assert "REGLA, NO SOSPECHA" in doc
    assert "once cuentas frías medidas" in doc, (
        "el peso de la regla son los once casos: seis de #355 y cinco de #384")
