"""El exportador de etapa 1 pregunta a Odoo antes de emitir (#355, decision 3).

El defecto, encontrado en #355: el exportador emitia el CSV de `crm.lead` sin
preguntarle a Odoo si la cuenta ya tenia algo. Bimbo tiene una oportunidad desde
nov-2024 en etapa «Revisar» -- etapa TRABAJADA, no la inicial: alguien la movio--.
Subir el CSV habria creado un lead duplicado en una cuenta que ya se trabajaba, y
un duplicado no se nota hasta que dos personas llaman a la misma planta la misma
semana.

Sin nombres: las cuentas se nombran por empresa y los leads por su id.
"""
from __future__ import annotations

import csv
import os
import sys
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

import exportar_etapa1 as ex  # noqa: E402
from flujo import importacion_odoo as io  # noqa: E402

HOY = date(2026, 9, 30)


def _declarado():
    return ex._leer_odoo_declarado()


# ------------------------------------------------- la constancia existe y vence
def test_hay_constancia_de_haber_leido_odoo():
    d = _declarado()
    assert d.get("leido_el"), "no hay constancia de la lectura de Odoo"
    assert d.get("cuentas"), "la constancia no trae cuentas"
    assert d.get("etapas_iniciales"), (
        "sin la lista de etapas iniciales no se puede distinguir un lead que "
        "nadie movio de una oportunidad que alguien trabajo")


def test_la_constancia_VENCE_y_entonces_nada_se_sube():
    """Un archivo de hace un mes es peor que ninguno: da confianza sin tenerla."""
    ok, razon = ex.odoo_vigente(_declarado(), date(2026, 10, 20))
    assert ok is False
    assert "vuelve a leer Odoo" in razon, razon
    marca, _ = ex.estado_en_odoo("Bimbo", _declarado(), date(2026, 10, 20))
    assert marca == ex.SIN_CONSULTAR


def test_sin_constancia_tampoco_se_sube():
    marca, razon = ex.estado_en_odoo("Bimbo", {}, HOY)
    assert marca == ex.SIN_CONSULTAR
    assert "no hay constancia" in razon


def test_una_cuenta_que_no_esta_en_la_lectura_NO_se_supone_limpia():
    """«No aparece» no es «no tiene nada»: es «no se pregunto por ella»."""
    marca, razon = ex.estado_en_odoo("Una Empresa Que Nadie Leyo", _declarado(),
                                     HOY)
    assert marca == ex.SIN_CONSULTAR
    assert "no se pregunto por ella" in razon


# ----------------------------------------------------------- las tres marcas
def test_bimbo_sale_marcada_por_su_oportunidad_de_nov_2024():
    """El caso que motivo la decision."""
    marca, razon = ex.estado_en_odoo("Bimbo", _declarado(), HOY)
    assert marca == ex.CON_OPORTUNIDAD, marca
    assert "1563" in razon and "2024-11-14" in razon, razon
    assert "Revisar" in razon
    assert "Enlaza" in razon, "no dice que hacer en vez de subirla"


def test_un_lead_reciente_en_etapa_inicial_no_se_sube_pero_es_OTRA_cosa():
    """No es lo mismo que una oportunidad: ahi hay trabajo humano encima y se
    ENLAZA; aqui es, con toda probabilidad, el mismo lead de hace una semana."""
    marca, razon = ex.estado_en_odoo("Metalsa", _declarado(), HOY)
    assert marca == ex.CON_LEAD_RECIENTE, marca
    assert "2242" in razon and "etapa inicial" in razon


def test_una_cuenta_sin_nada_en_odoo_es_nueva():
    """Ragasa y Nemak SALIERON de esta lista en #361, y la razon vale mas que el
    cambio: la lectura del 29-sep las declaro «sin lead ni oportunidad» porque
    busco leads SOLO por `partner_id` de la planta, y FTS le vende a esas dos a
    traves de un intermediario -- la contraparte del lead es el intermediario--.
    Ragasa tiene una COTIZACION ENVIADA y Nemak un PROYECTO GANADO.
    """
    for empresa in ("Hershey", "Sigma", "Coficab"):
        marca, _ = ex.estado_en_odoo(empresa, _declarado(), HOY)
        assert marca == ex.NUEVA, (empresa, marca)


def test_un_lead_bajo_el_partner_de_un_INTERMEDIARIO_tambien_frena():
    """El punto ciego que #361 cerro. Si el lead cuelga de otro partner, la
    cuenta igual esta trabajada: subir otro lead la duplica de todas formas."""
    for empresa in ("Ragasa", "Nemak"):
        marca, razon = ex.estado_en_odoo(empresa, _declarado(), HOY)
        assert marca == ex.CON_OPORTUNIDAD, (empresa, marca)
        assert "NO cuelga del partner de la planta" in razon, (empresa, razon)
        assert "Buscalo por su id" in razon, razon


def test_la_constancia_declara_el_punto_ciego_que_tenia():
    """Sin esa nota, el proximo que lea el archivo va a suponer que la lectura
    anterior estaba bien y que Odoo cambio en un dia."""
    d = _declarado()
    assert d.get("QUE_CAMBIO_CONTRA_EL_29_SEP"), "no declara que cambio"
    nota = d["QUE_CAMBIO_CONTRA_EL_29_SEP"]
    assert "partner_id" in nota and "intermediario" in nota
    assert d.get("como_se_leyo"), (
        "sin decir COMO se leyo, nadie puede saber que quedo fuera")


def test_un_lead_viejo_en_etapa_inicial_ya_no_frena():
    """Nadie lo trabajo y su senal caduco: seguir frenando por el seria dejar
    una cuenta congelada para siempre por un lead que nunca se toco."""
    d = dict(_declarado())
    d["cuentas"] = [{"empresa": "Zeta",
                     "leads": [{"id": 1, "fecha": "2024-01-01",
                                "etapa": "Prospecto Lead"}]}]
    marca, razon = ex.estado_en_odoo("Zeta", d, HOY)
    assert marca == ex.NUEVA, marca
    assert "nadie lo trabajo" in razon


def test_el_nombre_de_la_empresa_se_compara_sin_acentos_ni_mayusculas():
    d = dict(_declarado())
    d["cuentas"] = [{"empresa": "  GARCÍA  y Asociados ", "leads": []}]
    marca, _ = ex.estado_en_odoo("garcia Y ASOCIADOS", d, HOY)
    assert marca == ex.NUEVA


# --------------------------------------------------- el CSV lo lleva escrito
def test_la_columna_existe_y_va_al_final():
    assert io.COLUMNAS[-1] == "_odoo_ya_tiene", io.COLUMNAS
    # Con guion bajo al principio a proposito: Odoo no tiene ese campo y lo
    # ignora al importar. Esta para quien abre el archivo.
    assert io.COLUMNAS[-1].startswith("_")


def test_TODAS_las_filas_de_TODOS_los_archivos_traen_la_marca(tmp_path):
    r = ex.exportar(str(tmp_path), hoy=HOY)
    vistas = 0
    for a in r["archivos"]:
        with open(a["archivo"], encoding="utf-8-sig") as f:
            for fila in csv.DictReader(f):
                assert fila["_odoo_ya_tiene"], (a["nombre"], fila.get("name"))
                vistas += 1
    assert vistas == r["tarjetas_totales"], (vistas, r["tarjetas_totales"])


def test_el_reporte_dice_si_odoo_se_consulto():
    import tempfile

    r = ex.exportar(tempfile.mkdtemp(), hoy=HOY)
    assert r["odoo_consultado"] is True
    assert "leido el" in r["odoo_razon"]
    assert "ya_estan_en_odoo" in r


def test_el_orden_es_veredicto_reloj_y_AL_FINAL_odoo(tmp_path):
    """Una `archiva` con oportunidad abierta sigue siendo `archiva`: tener
    historia en Odoo no la vuelve subible. Odoo solo SACA del archivo de subir
    lo que el radar y el reloj ya habian aprobado.
    """
    r = ex.exportar(str(tmp_path), hoy=HOY)
    archiva = next(a for a in r["archivos"] if "archiva-NO-subir" in a["nombre"])
    with open(archiva["archivo"], encoding="utf-8-sig") as f:
        marcas = [x["_odoo_ya_tiene"] for x in csv.DictReader(f)]
    # En el archivo de `archiva` hay filas con lead reciente, y siguen ahi.
    assert any(ex.CON_LEAD_RECIENTE in m for m in marcas), marcas


def test_nada_se_pierde_por_el_camino(tmp_path):
    r = ex.exportar(str(tmp_path), hoy=HOY)
    assert r["se_suben"] + r["no_se_suben"] == r["tarjetas_totales"]
    assert sum(a["tarjetas"] for a in r["archivos"]) == r["tarjetas_totales"]


def test_sigue_sin_escribir_a_odoo(tmp_path):
    r = ex.exportar(str(tmp_path), hoy=HOY)
    assert r["escrituras_a_odoo"] == 0


def test_la_constancia_no_trae_nombres_de_personas():
    import json
    import re

    with open(ex.RUTA_ODOO_DECLARADO, encoding="utf-8") as f:
        crudo = f.read()
    assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", crudo)
    d = json.loads(crudo)
    assert "contacto" not in json.dumps(d.get("cuentas"), ensure_ascii=False).lower()
