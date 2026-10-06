"""La constancia de la primera corrida de descubrimiento (#369).

QUE FIJA, y por que cada cosa:

  1. toda senal trae FECHA CON PROCEDENCIA, o esta marcada como sin fecha. Es la
     regla de #359 y aqui se aplica a una corrida real: una fecha sin procedencia
     es una fecha inventada, y el reloj de caducidad del motor 3 cuelga de ella.
  2. el reporte se REGENERA del archivo de la corrida. El HTML que se subio a
     OneDrive no se escribio a mano: si alguien corrige un puntaje en el JSON, el
     papel se mueve con el. Tres veces en turnos anteriores un papel escrito a
     mano quedo viejo en silencio.
  3. ni un dato personal. La lista viaja por OneDrive y el archivo vive en un
     repo publico: empresas, plantas, senales y ligas, nada mas.
  4. los puntajes del archivo son los que el evaluador DE HOY produce. Si alguien
     cambia un peso del radar y no vuelve a correr la corrida, esta prueba se
     pone roja -- que es justo lo que tiene que pasar: el archivo dejaria de ser
     constancia y seria un numero viejo--.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from flujo.radar import cargar_catalogo, evaluar                  # noqa: E402

# EN `datos/`, NO EN `datos/corridas/`. El primer intento lo puso ahi y
# `.gitignore` lo ignoro en silencio -- `corridas/` esta ignorado a proposito: es
# salida de corrida, que vive en /tmp y no entra al repo--. Esta prueba habria
# pasado en esta maquina y fallado en un clon limpio. Lo que este archivo guarda no
# es salida de corrida: es DATO DECLARADO con procedencia, como
# `senales-documentadas.json`, y ese es su lugar.
RUTA = RAIZ / "datos" / "radar-2026-10-05-descubrimiento.json"
CORRIDA = json.loads(RUTA.read_text(encoding="utf-8"))


def test_el_archivo_de_la_corrida_existe_y_se_lee():
    assert CORRIDA["corrida"] == "radar-descubrimiento-2026-10-05"
    assert CORRIDA["consultas_gastadas"] == len(CORRIDA["consultas"])
    assert CORRIDA["consultas_gastadas"] <= CORRIDA["presupuesto_de_consultas"], (
        "se gastaron mas consultas que el presupuesto declarado")


def test_toda_senal_trae_fecha_con_procedencia_o_esta_marcada():
    for s in CORRIDA["senales"]:
        assert s.get("procedencia_fecha"), (
            f"{s['empresa']} no dice de donde sale su fecha")
        if not s.get("fecha"):
            # sin fecha SE PUEDE, pero se declara: va al techo minimo de frescura
            assert any("sin fecha" in a.lower()
                       for a in (s.get("ambiguedad") or [])), (
                f"{s['empresa']} no trae fecha y no lo declara como ambiguedad")
        else:
            date.fromisoformat(s["fecha"])


def test_la_ventana_declarada_se_respeta_o_se_marca():
    hoy = date.fromisoformat(CORRIDA["hoy"])
    tope = CORRIDA["ventana"]["dias"]
    for x in CORRIDA["evaluadas"]:
        if x["dias"] is not None and x["dias"] > tope:
            amb = " ".join(x["eval"]["ambiguedad"])
            assert "fuera de la ventana" in amb, (
                f"{x['empresa']} tiene {x['dias']} dias y no lo declara")
    del hoy


def test_los_puntajes_del_archivo_son_los_del_criterio_CON_EL_QUE_SE_CORRIO():
    """Una corrida es una medicion fechada BAJO UN CRITERIO, y el criterio se mueve.

    La version anterior de esta prueba comparaba contra el evaluador DE HOY y exigia
    volver a correr la corrida cuando difirieran. Estaba mal pensada: el 7-oct la
    DECISION 1 de #382 metio el vocabulario de arranque de obra, Waelzholz paso de
    48.7 a 93.1, y «volver a correr la corrida» habria borrado el registro de lo que
    el radar decia el 5-oct -- que es exactamente la evidencia que justifico el
    cambio--. Un archivo de constancia que se reescribe cada vez que el criterio se
    mueve deja de ser constancia.

    Lo que SI se verifica, y sigue cazando la corrupcion del archivo:
      1. el archivo declara con que version se puntuo;
      2. las diferencias contra el evaluador de hoy estan DECLARADAS una por una, con
         su antes y su despues. Una diferencia no declarada es rojo.
    """
    cat = cargar_catalogo()
    hoy = date.fromisoformat(CORRIDA["hoy"])
    crit = CORRIDA.get("criterio_con_el_que_se_puntuo") or {}
    assert crit.get("version_de_la_herramienta"), (
        "la corrida no declara con que version se puntuo")
    declaradas = crit.get("lo_que_cambiaria_con_el_criterio_de_hoy") or {}
    sin_declarar = {}
    for x in CORRIDA["evaluadas"]:
        r = evaluar(x, cat, hoy=hoy)
        llave = f"{x['empresa']} / {x['planta']}"
        if r["puntaje"] == x["eval"]["puntaje"]:
            assert r["veredicto"] == x["eval"]["veredicto"], llave
            continue
        d = declaradas.get(llave)
        if not d or d["antes"] != x["eval"]["puntaje"] or d["despues"] != r["puntaje"]:
            sin_declarar[llave] = {"archivo": x["eval"]["puntaje"],
                                   "evaluador_de_hoy": r["puntaje"],
                                   "declarado": d}
    assert not sin_declarar, (
        "el evaluador de hoy puntua distinto que el archivo y la diferencia NO esta "
        f"declarada en `criterio_con_el_que_se_puntuo`: {sin_declarar}. Si el "
        "criterio cambio a proposito, declaralo ahi con su antes y su despues; si no, "
        "alguien edito el archivo a mano.")


def test_el_resumen_concuerda_con_las_filas():
    ev = CORRIDA["evaluadas"]
    r = CORRIDA["resumen"]
    assert r["senales"] == len(ev)
    for llave, veredicto in (("pasan", "pasa"), ("guardan", "guarda"),
                             ("archivan", "archiva")):
        assert r[llave] == sum(1 for x in ev
                               if x["eval"]["veredicto"] == veredicto), llave
    assert r["pasan"] + r["guardan"] + r["archivan"] == len(ev)
    assert r["descubrimiento_puro"] + r["expansion"] == len(ev)


_CORREO = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_TRES = re.compile(
    r"\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}"
    r"\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b")
# Nombres de lugar y de medio que el detector de «tres capitalizadas» caza y que
# NO son personas. Se enlistan para que la reja siga sirviendo en vez de apagarla.
NO_SON_PERSONAS = (
    "Parque Industrial Amistad", "Parque Industrial Ramos", "Parque Industrial SIMSA",
    "Parque Mirador Industrial", "El Diario de Coahuila", "El Diario de Juarez",
    "El Heraldo de Saltillo", "El Siglo de Torreon", "La Gaceta", "El Bordo",
    "Chihuahua Digital", "Proyectos Torreon", "Nalco de Mexico",
    "Cluster Industrial", "Nuevo Leon", "Ciudad Juarez", "Gomez Palacio",
    "Ramos Arizpe", "Cienega de Flores", "Santa Catarina", "Hyundai WIA",
    "Yokohama Rubber", "Ecocab MX", "DH Autoware", "TDI Manufacturing",
    "CFE Nuevo Leon", "Mexico Industry", "Somos Industria", "MVS Noticias",
    # cazados por la reja en la primera corrida de la prueba: los cinco son
    # lugares o empresas, y se dejan escritos en vez de apagar el detector.
    "Tamaulipas Reynosa Matamoros", "Coahuila Parque Industrial",
    "Jaguar Industries Matamoros", "Jaguar Land Rover",
    "Parque Industrial Angostura",
    # cazados al completar la bitacora de las 38 consultas el 7-oct: los cinco son
    # cadenas de busqueda con nombres de ciudad, o razones sociales.
    "Chihuahua Juarez Cuauhtemoc", "Cubico Sustainable Investments",
    "Medline Nuevo Laredo", "Medline Industries Nuevo",
    "Saltillo Monclova Piedras",
    # cazados por la reja sobre la constancia del 7-oct, con la geografia
    # expandida al Bajio, Chihuahua y Sonora: ciudades, parques, medios y razones
    # sociales. La reja se queda encendida; la lista crece con la geografia.
    "San Luis Potosi", "Campus San Luis", "Daikin San Luis",
    "Guanajuato Silao Celaya", "Sonora Hermosillo Guaymas",
    "Nestle Purina Silao", "American Industries Leon", "Doosan Bobcat Nuevo",
    "Parque Industrial Garcia", "Parque Industrial Alianza",
    "Mexico Business News",
    # cazados al escribir el parque industrial de cada senal el 6-oct (decision 3).
    "Campus Daikin San", "Parque Mirador Industrial", "Parque Industrial Alianza",
    # cazados en la segunda vuelta por parque del 6-oct: parques, desarrolladores y
    # cadenas de busqueda con nombres de lugar.
    "Parques Industriales Amistad", "Parque Industrial Las", "Aparece Hubs Park",
    "Autoware Apodaca Santa", "Guanajuato Puerto Interior",
)


def test_la_constancia_no_lleva_datos_personales():
    crudo = RUTA.read_text(encoding="utf-8")
    sin_ligas = re.sub(r'https?://[^\s"]+', "", crudo)
    assert not _CORREO.findall(sin_ligas), "hay un correo en la constancia"
    assert not re.findall(r"\b\d{3}[- ]?\d{3}[- ]?\d{4}\b", sin_ligas), "hay un telefono"
    sospechosos = [m for m in _TRES.findall(sin_ligas)
                   if not any(b in m or m in b for b in NO_SON_PERSONAS)]
    assert not sospechosos, (
        f"algo parece un nombre de persona: {sospechosos}. Si es un lugar o un "
        "medio, agregalo a NO_SON_PERSONAS; si es una persona, sacalo del archivo")


def test_el_reporte_se_regenera_del_archivo_y_no_se_escribe_a_mano():
    """El papel sale del dato. Lo que se fija es el CONTENIDO, no un sha256.

    La version anterior fijaba el sha256 del HTML que se subio a OneDrive para #381.
    Era una mala reja y duro un dia: acopla un archivo historico ya publicado a un
    generador vivo y a la cadena de version de la herramienta, asi que se pone roja
    cuando sube la version sin que el papel haya cambiado en nada que importe. El
    sha256 de un papel publicado va en el issue que lo publica, que es donde sirve
    para verificar una descarga.
    """
    import os
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as t:
        r = subprocess.run(
            [sys.executable, str(RAIZ / "herramientas" /
                                 "reporte_radar_descubrimiento.py")],
            capture_output=True, text=True,
            env={**os.environ, "SALIDA_RADAR": t + "/"})
        assert r.returncode == 0, r.stderr
        ruta = [l for l in r.stdout.splitlines() if l.endswith(".html")][0]
        doc = open(ruta, encoding="utf-8").read()
    # las cinco que fueron a Rissia, y las dos rescatadas a mano
    for quien in ("NIFCO", "QSMX", "Ecocab MX", "Pegatron", "Waelzholz", "Inventec"):
        assert quien in doc, f"{quien} ya no aparece en el reporte"
    # los numeros del pie salen del archivo, no de la mano
    assert f"{CORRIDA['consultas_gastadas']} consultas" in doc
    assert f"{CORRIDA['resumen']['senales']} señales" in doc
    # y ni un dato personal
    assert not _CORREO.findall(re.sub(r'https?://[^\s"]+', "", doc))
