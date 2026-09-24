"""Guardia de higiene: el repo no lleva datos personales.

Esta prueba existe porque ya pasó. El 24-sep-2026 se copió a `fts-suite`
-publico- un padron con **191 correos y 59 telefonos**, y el correo real de una
persona quedo en cuatro lugares del metodo. El script que cargaba el padron
traia la advertencia escrita al lado, y la copia se hizo igual.

Una advertencia en un comentario no detiene a nadie. Esta prueba si.

Lo que se permite a proposito:
  * marcadores: `[persona]`, `[Persona 01]`, `nombre.apellido@`, `first.last@`
  * plantillas de patron: `FLast@`, `LastF@`, `FirstLast@` -- son la FORMA del
    patron escrita como plantilla, no la direccion de nadie. Es lo que los
    directorios reportan y lo que el Caso G compara
  * buzones genericos de ejemplo: `compras@`, `ventas@`, `info@`
  * `git@github.com` -- es una URL de clon, no el correo de nadie. Salio como
    falso positivo al escribir PURGA-DEL-HISTORIAL.md, y es la clase de ruido
    que hay que permitir con nombre y no aflojando el regex
  * dominios de empresa sueltos (`cuprum.com`) -- una empresa no es una persona
"""
import pathlib
import re
import pytest

RAIZ = pathlib.Path(__file__).resolve().parent.parent
EXT = {".md", ".py", ".html", ".json", ".csv", ".txt", ".yml", ".yaml"}
SALTAR = ("__pycache__", ".pytest_cache", "corridas", ".git")

CORREO = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Locales permitidos: marcadores y buzones genericos.
PERMITIDO = re.compile(r"""^(
    nombre\.apellido | first\.last | first_lastinitial | n\.apellido
  | FLast | LastF | FirstLast | LastFirstInitial | flast | lastf   # plantillas
  | \[[^\]]+\]                                  # cualquier marcador [.....]
  | x | a | correo | ejemplo | usuario | user | test | demo | noreply
  | git                                          # git@github.com, URL de clon SSH
  | info|contacto|ventas|compras|admin|recepcion|facturacion|contabilidad
  | rh|rrhh|hr|soporte|atencion|calidad|sistemas|gerencia|direccion|comercial
)$""", re.I | re.X)

DOMINIO_EJEMPLO = re.compile(r"(example\.(com|org|net)|empresa-ejemplo\.|ejemplo\.)$", re.I)

# Telefono mexicano de 10 digitos. Se excluyen las cifras que NO son telefonos:
# codigos postales (5), coordenadas, ids del DENUE, montos.
TELEFONO = re.compile(r"(?<![\d.\-])(?:\+?52[ \-]?)?(?:81|33|55|86|84|87|82|83|89)\d{8}(?![\d.])")


def _archivos():
    for f in sorted(RAIZ.rglob("*")):
        if not f.is_file() or f.suffix not in EXT:
            continue
        if any(s in f.parts for s in SALTAR):
            continue
        yield f


def test_ningun_correo_de_persona_en_el_repo():
    hallazgos = []
    for f in _archivos():
        for n, linea in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            for correo in CORREO.findall(linea):
                local, _, dom = correo.partition("@")
                if PERMITIDO.match(local) or DOMINIO_EJEMPLO.search(dom):
                    continue
                hallazgos.append(f"{f.relative_to(RAIZ)}:{n}  {correo}")
    assert not hallazgos, (
        "correos que parecen de una persona real, y este repo es PUBLICO.\n"
        "Enmascaralos con un marcador ([persona]@dominio) o quitalos; su valor "
        "vive en Postgres, no aqui:\n  " + "\n  ".join(hallazgos))


def test_ningun_telefono_en_el_repo():
    hallazgos = []
    for f in _archivos():
        for n, linea in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            for tel in TELEFONO.findall(linea):
                hallazgos.append(f"{f.relative_to(RAIZ)}:{n}  {tel}")
    assert not hallazgos, (
        "numeros con forma de telefono mexicano. Un telefono es dato de "
        "contacto y no va en el repo:\n  " + "\n  ".join(hallazgos))


def test_el_padron_no_tiene_columnas_de_contacto():
    """`dominio_correo` se queda -es la llave del metodo y no es dato personal-.
    `correoelec` y `telefono` no."""
    import csv
    csv_padron = RAIZ / "datos" / "padron_denue.csv"
    campos = next(csv.reader(open(csv_padron, encoding="utf-8")))
    for prohibida in ("correoelec", "telefono"):
        assert prohibida not in campos, (
            f"el padron versionado trae la columna '{prohibida}'. "
            "Esa columna va a Postgres, no al repo.")
    assert "dominio_correo" in campos, (
        "el dominio SI se queda: es la llave operativa -dominio + ciudad + CP- "
        "y no identifica a una persona")


def test_el_cargador_excluye_las_columnas_de_contacto():
    from herramientas import cargar_padron as cp  # noqa
    assert set(cp.COLUMNAS_SENSIBLES) == {"telefono", "correoelec"}
    assert "correoelec" not in cp.COLUMNAS_PUBLICABLES
    assert "telefono" not in cp.COLUMNAS_PUBLICABLES
    assert "dominio_correo" in cp.COLUMNAS_PUBLICABLES
