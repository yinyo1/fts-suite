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


# Etiquetas HTML entre el local y el @. ES UN HUECO REAL QUE YA PASO: el
# prototipo de ficha de #323 traia cuatro correos de personas reales escritos
# `wendy.maldonado<br>@coficab.com` -- partidos con un <br> para que cupieran en
# la columna-- y ESTA PRUEBA LOS DEJO PASAR, porque el caracter antes del @ era
# un `>` y el regex no lo admite en el local.
#
# Cuatro correos reales entraron a un repo publico por una etiqueta de maquetado.
# Ahora el texto se limpia de etiquetas ANTES de buscar, en los archivos donde el
# marcado puede partir un dato: el dato es el texto que se lee, no el que se
# escribio.
_ETIQUETA = re.compile(r"<[^>]*>")
CON_MARCADO = {".html", ".md"}


def _texto_para_buscar(f: pathlib.Path) -> str:
    t = f.read_text(encoding="utf-8", errors="replace")
    if f.suffix in CON_MARCADO:
        # se quita la etiqueta SIN dejar espacio, que es justo como lo lee el ojo:
        # "wendy.apellido<br>@x.com" se ve como un correo, y lo es.
        t = _ETIQUETA.sub("", t)
    return t


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
        for n, linea in enumerate(_texto_para_buscar(f).splitlines(), 1):
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
        for n, linea in enumerate(_texto_para_buscar(f).splitlines(), 1):
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


def test_un_correo_PARTIDO_POR_MARCADO_no_se_escapa(tmp_path, monkeypatch):
    """EL HUECO QUE #323 destapo, y por accidente.

    El prototipo de ficha traia `wendy.maldonado<br>@coficab.com` -- el <br>
    partia el correo para que cupiera en la columna-- y el escaner lo dejo pasar,
    porque el caracter antes del @ era un `>`. Cuatro correos de personas reales
    habrian entrado a un repo publico por una etiqueta de maquetado.

    Un dato personal no deja de serlo porque el HTML lo parta a la mitad.
    """
    f = tmp_path / "ficha.html"
    f.write_text('<span class="correo">persona.apellido<br>@empresareal.com</span>',
                 encoding="utf-8")
    texto = _texto_para_buscar(f)
    hallados = [c for c in CORREO.findall(texto)
                if not PERMITIDO.match(c.partition("@")[0])
                and not DOMINIO_EJEMPLO.search(c.partition("@")[2])]
    assert hallados, "un correo partido por una etiqueta sigue siendo un correo"


def test_el_marcador_partido_SIGUE_permitido(tmp_path):
    """Y el arreglo no puede volverse un falso positivo: `nombre.apellido@` es una
    plantilla de patron, y partirla con un <br> tampoco la vuelve el correo de
    nadie."""
    f = tmp_path / "ficha.html"
    f.write_text('<span>nombre.apellido<br>@coficab.com</span>', encoding="utf-8")
    for c in CORREO.findall(_texto_para_buscar(f)):
        assert PERMITIDO.match(c.partition("@")[0]), c


def test_la_herramienta_de_auditoria_comparte_LOS_MISMOS_regex_que_la_guardia():
    """#324. Si la auditoria del historial tuviera su propia copia de los regex,
    los dos se irian separando y el dia de la purga el inventario no cuadraria con
    lo que la guardia deja pasar. Los importa de aqui a proposito."""
    import importlib.util
    ruta = RAIZ / "herramientas" / "auditar_historial.py"
    assert ruta.exists(), "la herramienta de auditoria del historial no esta"
    spec = importlib.util.spec_from_file_location("auditar_historial", ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.G.CORREO is CORREO
    assert mod.G.TELEFONO is TELEFONO
    assert mod.G.PERMITIDO is PERMITIDO


def test_la_auditoria_NO_puede_imprimir_un_valor():
    """La forma de un correo sale enmascarada y su dominio no. Un reporte de fuga
    que reproduce la fuga es la fuga otra vez -- ya paso en el issue #285--."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "auditar_historial", RAIZ / "herramientas" / "auditar_historial.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # El fixture usa un dominio de ejemplo a proposito: la guardia de arriba
    # escanea ESTE archivo, y ya cazo tres veces en esta sesion a fixtures que
    # parecian correos de verdad. Un dominio permitido evita el falso positivo sin
    # aflojar el regex.
    f = mod.forma("nombre.muy.largo@example.com")
    assert "nombre" not in f and "largo" not in f
    assert f == "xxxxxx.xxx.xxxxx@example.com"     # el dominio SI se ve
    # y la huella no permite reconstruir el valor
    h = mod.huella("alguien@example.com")
    assert len(h) == 10 and "alguien" not in h


def test_el_plan_de_purga_habla_de_RUTAS_no_de_valores():
    """El documento que dice que hay que purgar no puede contener lo que hay que
    purgar. Es la regla que ya trae escrita, y esta prueba la hace cumplir sobre el
    apartado que #324 le agrego."""
    plan = (RAIZ / "PURGA-DEL-HISTORIAL.md")
    texto = _texto_para_buscar(plan)
    hallazgos = []
    for correo in CORREO.findall(texto):
        local, _, dom = correo.partition("@")
        if PERMITIDO.match(local) or DOMINIO_EJEMPLO.search(dom):
            continue
        hallazgos.append(correo)
    assert not hallazgos, f"el plan de purga nombra {len(hallazgos)} correo(s)"
    assert not TELEFONO.findall(texto), "el plan de purga nombra un telefono"
    # y si menciona dominios, es sin la parte local: una empresa no es una persona
    assert "@fts.mx" in texto, "el inventario de dominios es parte del valor del plan"
