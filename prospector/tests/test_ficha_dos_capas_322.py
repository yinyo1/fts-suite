"""El rediseno de la ficha para el LECTOR REAL (#322).

Una sola ficha con dos capas: la limpia visible al abrir, para quien va a
llamar, y la tecnica colapsada al final, para quien va a auditar.

EL PROBLEMA MEDIDO: en la ficha de Pesqueria, antes de llegar a un solo contacto,
Rissia leia "En conflicto — 5", "No son de esta planta — 15", codigos M0b/M5/M13,
N1/N2/N3, Chao1 y FALTA_BARRER, y las 61 busquedas en tabla completa. Para quien
construyo la herramienta es transparencia; para quien llama es ruido que la hace
dudar de la ficha antes de llegar a lo util.

Sin datos personales: todos los nombres son inventados.
"""
from __future__ import annotations
import re
import pytest

from flujo import ficha as fichamod
from flujo import orquestador as orq
from flujo.confianza import Contacto, EN_CONFLICTO
from flujo.estado import (Corrida, SIN_ACCESO, OMITIDA_COSTO, RESPONDIO,
                          MARCA_HISTORIA)
from flujo.sello import sello, version, commit, SIN_GIT, SIN_VERSION

# Las cadenas que la capa limpia NO puede contener. Son las que #322 midio en la
# ficha de Pesqueria como ruido para quien llama.
PROHIBIDAS_EN_LIMPIO = ("M0", "M5", "M13", "Chao1", "N1", "N2", "N3", "CONF",
                        "SOLIDO", "sin_acceso", "FALTA_BARRER",
                        "omitida_por_costo")


@pytest.fixture
def sesion(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    return tmp_path


def _corrida_rica(empresa="Coficab", ciudad="Pesqueria") -> Corrida:
    """Una corrida que EJERCE los tres estados que la prueba de vocabulario
    necesita ver dentro de la pestana: un modulo sin acceso, uno omitido por
    costo, y bastante gente para que la estimacion opine FALTA_BARRER.

    Sin esto la prueba pasaria por vacuidad -- las cadenas no estarian ni fuera ni
    dentro-- y no probaria nada.
    """
    c = Corrida(empresa=empresa, ciudad=ciudad, giro="cables")
    # decisor con patron confirmado por dos anclas
    a = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de Mantenimiento",
                           empresa=empresa, cercania_decision=10))
    d = a.dato("patron_correo")
    d.observar("outlook_personas", "nombre.apellido@ejemplo.com", forma="first.last")
    d.observar("camara", "nombre.apellido@ejemplo.com", forma="first.last")
    a.dato("planta").observar("buscador", f"Coficab {ciudad}")
    # puesto sin persona: sigue siendo una puerta
    c.agregar(Contacto(nombre=None, puesto="Jefe de Servicios Auxiliares",
                       empresa=empresa, cercania_decision=15))
    # en revision por variante de redaccion: el caso que #322 dice que estaba
    # escondido en "conflicto"
    b = c.agregar(Contacto(nombre="Beto Ficticio", puesto="Comprador Senior",
                           empresa=empresa, cercania_decision=20,
                           revision_humana=True,
                           motivo_revision="dos fuentes escriben su puesto "
                                           "distinto: Senior Buyer y Comprador Sr"))
    b.dato("planta").observar("buscador", f"Coficab {ciudad}")
    # contexto
    c.agregar(Contacto(nombre="Cami Ficticia", puesto="Gerente de Sistemas",
                       empresa=empresa, cercania_decision=88))
    # de otra planta: no cuenta en la poblacion, y su lugar es la pestana
    e = c.agregar(Contacto(nombre="Eva Ficticia", puesto="Compras Americas",
                           empresa=empresa, cercania_decision=30))
    e.dato("planta").observar("buscador", "Coficab Group")
    # gente suficiente para que la estimacion OPINE
    for i in range(12):
        x = c.agregar(Contacto(nombre=f"Persona{i} Ficticia",
                               puesto="Supervisor de Mantenimiento",
                               empresa=empresa, cercania_decision=40))
        x.dato("planta").observar("buscador", f"Coficab {ciudad}")
        x.hits = 1 if i < 7 else 2
    a.hits, b.hits = 3, 2
    # los tres estados internos, de verdad
    c.cerrar_modulo("M7", SIN_ACCESO, "WebFetch bloqueado por egress")
    c.cerrar_modulo("M9", OMITIDA_COSTO, "Panjiva pide suscripcion")
    # M13 se REGISTRA, no se cierra: cerrarlo exige que este agotado, y una
    # consulta al padron es justo lo que hace que "M13" aparezca en la pestana.
    c.registrar_busqueda("M13", "cortes", "padron corte 2026-05: Coficab",
                         "denue", 0)
    c.registrar_busqueda("M5", "puestos", "coficab pesqueria mantenimiento",
                         "buscador", 3, liga="https://ejemplo.mx/a")
    c.registrar_busqueda("M0", "contactos_recorridos", "res.partner Coficab",
                         "odoo", 1)
    c.gancho = "Arrancaron una linea nueva en agosto y el agua helada esta al limite."
    c.por_que_ahora = "El equipo que compraron en otra planta es el mismo modelo."
    c.como_hablarles = ["Abrir por el arranque de linea, no por el equipo."]
    c.senal = ["arranque de linea ago-2026", "ampliacion 2018",
               "nave nueva, nota sin fecha"]
    c.vocabulario = ["agua helada", "chiller de proceso"]
    c.challenge_corrido = True
    return c


def _capas(h: str) -> tuple[str, str]:
    i = h.index('<details class="tec">')
    return (h[:i], h[i:])


# ============================ el reparto de vocabulario, que es el punto
def test_la_capa_limpia_NO_lleva_UN_SOLO_termino_interno():
    """La prueba central de #322. Cada una de estas cadenas la vio Rissia en la
    ficha de Pesqueria antes de llegar a un contacto."""
    limpia, _tec = _capas(fichamod.modo_limpio(_corrida_rica()))
    fugas = {t: limpia.count(t) for t in PROHIBIDAS_EN_LIMPIO if t in limpia}
    assert not fugas, f"vocabulario interno en la capa limpia: {fugas}"


def test_y_TODOS_esos_terminos_SI_estan_en_la_pestana():
    """La honestidad no se pierde, se muda. Si alguno faltara aqui, la ficha
    habria dejado de ser auditable -- que es el otro trabajo que hace--."""
    _limpia, tec = _capas(fichamod.modo_limpio(_corrida_rica()))
    faltan = [t for t in PROHIBIDAS_EN_LIMPIO if t not in tec]
    assert not faltan, f"la capa tecnica perdio: {faltan}"


def test_MODO_DE_FALLA_el_CSS_no_puede_nombrar_un_estado_interno():
    """El CSS vive en <head>, FUERA del <details>: `.e-sin_acceso` era una fuga
    por la puerta de atras, y la primera version de este rediseno la tenia. La
    encontro esta prueba, no una revision."""
    h = fichamod.modo_limpio(_corrida_rica())
    css = h[h.index("<style>"):h.index("</style>")]
    for t in PROHIBIDAS_EN_LIMPIO:
        assert t not in css, f"'{t}' esta en el CSS, que es capa limpia"


def test_la_pestana_esta_CERRADA_por_defecto():
    """Si abriera sola, el rediseno no serviria de nada: el ruido volveria a
    estar delante de quien llama."""
    h = fichamod.modo_limpio(_corrida_rica())
    assert '<details class="tec">' in h
    assert "<details open" not in h and "<details  open" not in h
    assert "no hace falta abrirlo para llamar" in h


# ==================================== el orden de lectura de la vendedora
def test_el_orden_de_las_secciones_es_el_de_la_llamada():
    h = fichamod.modo_limpio(_corrida_rica())
    orden = ["Ficha de prospeccion · para Rissia", 'class="hook"',
             "Por que ahora", "A quien buscar", "Como hablarles",
             "Lo que falta y donde conseguirlo", "Que no pudimos revisar",
             "Detalle tecnico"]
    posiciones = [h.index(t) for t in orden]
    assert posiciones == sorted(posiciones), dict(zip(orden, posiciones))


def test_los_tres_grupos_de_contactos_con_su_subtitulo():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Decisores de la planta" in limpia
    assert "Por confirmar, valen la pena" in limpia
    assert "De contexto, no son compradores" in limpia


def test_el_contacto_EN_REVISION_sigue_visible_en_la_capa_limpia():
    """#306 D3 otra vez, y sigue siendo la regla que mas caro salio romper."""
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Beto Ficticio" in limpia
    assert "dos fuentes escriben su puesto distinto" in limpia


def test_el_puesto_SIN_PERSONA_va_con_los_decisores_y_con_su_chip():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Jefe de Servicios Auxiliares" in limpia
    assert "Puesto sin persona" in limpia


def test_el_correo_dice_su_nivel_EN_PALABRAS_no_con_una_sigla():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "patron confirmado con 2 correo(s) real(es)" in limpia
    assert "no verificado" in limpia
    # y ninguna sigla del metodo en esa frase
    for sigla in ("CONF", "SOL", "CAND", "SOLIDO", "CANDIDATO"):
        assert f">{sigla}<" not in limpia


def test_el_de_OTRA_PLANTA_no_ensucia_la_capa_limpia_pero_sigue_contado():
    """No se pierde: el pie dice cuantos se guardaron, y la pestana los lista."""
    limpia, tec = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Eva Ficticia" not in limpia
    # el pie va debajo de la pestana desde #323, como el prototipo
    h = fichamod.modo_limpio(_corrida_rica())
    assert "se guardaron para la corrida corporativa" in h
    assert "Eva Ficticia" in tec or "Compras Americas" in tec


def test_la_linea_de_tiempo_ordena_y_marca_lo_que_no_trae_fecha():
    c = _corrida_rica()
    tl = fichamod.linea_de_tiempo(c)
    assert tl.index("2018") < tl.index("ago-2026"), "la linea de tiempo no ordena"
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert tl in limpia, "la linea de tiempo no llego a la capa limpia"
    assert "Sin fecha" in limpia
    assert "Confirmar el ano antes de citarlo" in limpia


def test_el_medidor_dice_el_porcentaje_y_QUE_SIGNIFICA():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    # #323: el medidor es el circulo conic-gradient del prototipo, con el
    # porcentaje al centro, no un SVG.
    assert 'class="medidor"' in limpia
    assert "conic-gradient(var(--teal)" in limpia
    assert "Sales Navigator" in limpia
    assert re.search(r"<span>\d+%</span>", limpia)


def test_lo_que_no_se_pudo_revisar_va_en_lenguaje_de_persona():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "PDFs y documentos publicos" in limpia
    assert "el entorno no deja abrirlos" in limpia
    assert "registros de comercio exterior" in limpia
    assert "no gastar el presupuesto" in limpia


# ============================================ el aviso rojo, condicional
def test_el_aviso_rojo_SALE_cuando_la_planta_es_fria():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Ojo antes de llamar" in limpia
    assert "FTS nunca ha trabajado en esta planta" in limpia
    assert "Ciudad Juarez" in limpia
    assert "a su grupo en Ciudad Juarez" in limpia


def test_el_aviso_rojo_NO_SE_IMPRIME_cuando_no_hay_nada_que_avisar():
    """Un aviso que sale siempre no se lee. Esta es la mitad de la regla que la
    hace funcionar, y la que es facil de romper sin notarlo."""
    c = _corrida_rica(empresa="EmpresaFicticiaSinHistoria", ciudad="Saltillo")
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert "Ojo antes de llamar" not in limpia
    assert 'class="aviso"' not in limpia


def test_el_aviso_rojo_CACHA_un_gancho_que_afirma_trabajo_aqui():
    c = _corrida_rica()
    c.gancho = "Ya trabajamos en su planta el ano pasado"
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert "dice algo que el registro no sostiene" in limpia


def test_la_nota_de_canal_avisa_del_intermediario():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Cuidado con el intermediario Quimitec" in limpia
    assert "no en esta planta" in limpia


# ============================================= version y commit sellados
def test_la_tabla_de_corrida_trae_version_y_commit_NO_VACIOS():
    _l, tec = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Version de la herramienta" in tec
    assert "Commit" in tec
    s = sello()
    assert s["version"] and s["version"] != SIN_VERSION
    assert s["commit"]
    assert s["version"] in tec and s["commit"] in tec


def test_la_version_sale_del_CHANGELOG_no_de_una_constante():
    """Habia una `__version__ = "0.1.0"` mientras el CHANGELOG iba en 0.9.9:
    nueve versiones mintiendo, y nadie lo noto porque nada la leia."""
    import flujo
    assert flujo.__version__ == version()
    assert re.fullmatch(r"\d+\.\d+\.\d+", version())


def test_sin_git_se_DICE_no_se_inventa(tmp_path):
    """Una ficha generada fuera de un checkout es legitima; hacerla pasar por una
    que si lo estaba, no."""
    assert commit(cwd=str(tmp_path)) == SIN_GIT


def test_la_firma_del_estado_se_reporta_en_la_pestana():
    _l, tec = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Firma del estado" in tec


# ================================= lo que NO se pierde del rediseno anterior
def test_sigue_siendo_un_html_autocontenido_y_responsivo():
    h = fichamod.modo_limpio(_corrida_rica())
    assert h.startswith("<!doctype html>")
    assert '<meta charset="utf-8">' in h
    assert "viewport" in h
    assert "prefers-color-scheme:dark" in h
    assert "@media (max-width:520px)" in h


def test_los_huecos_de_criterio_se_siguen_declarando_con_su_comando():
    c = _corrida_rica()
    c.gancho, c.por_que_ahora, c.como_hablarles = "", "", []
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert "Sin gancho escrito" in limpia
    assert "Sin razon de oportunidad escrita" in limpia
    assert "Sin guion escrito" in limpia
    assert "registrar --datos" in limpia


def test_el_SEGUNDO_HTML_dejo_de_existir():
    """Dos archivos que hay que abrir en orden era una manera de que nadie
    abriera el segundo. El JSON de auditoria si se queda."""
    assert not hasattr(fichamod, "modo_procedencia_html")
    assert hasattr(fichamod, "modo_procedencia")


def test_el_JSON_de_auditoria_sigue_completo():
    d = fichamod.modo_procedencia(_corrida_rica())
    assert d and isinstance(d, dict)


def test_emitir_en_modo_procedencia_escribe_SOLO_el_json(sesion, capsys):
    c = _corrida_rica()
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
              "--modo", "procedencia"])
    c2 = orq._cargar("Coficab", "Pesqueria")
    assert any(r.endswith(".json") for r in c2.fichas_emitidas)
    assert not any(r.endswith("-procedencia.html") for r in c2.fichas_emitidas)


# ================== #323 · el estilo del PROTOTIPO APROBADO, portado
def test_los_tokens_de_la_paleta_son_los_del_prototipo():
    """Nombres y valores exactos. Si alguien los renombra, las reglas del
    prototipo dejan de aplicar en silencio y la ficha se ve casi bien."""
    h = fichamod.modo_limpio(_corrida_rica())
    css = h[h.index("<style>"):h.index("</style>")]
    for token, valor in (("--teal", "#0f6b5c"), ("--teal-soft", "#e2efeb"),
                         ("--hot", "#b3261e"), ("--hot-bg", "#fbe9e7"),
                         ("--warn", "#b06a00"), ("--warn-bg", "#fbf3e3"),
                         ("--ok", "#1f7a4d"), ("--gray-bg", "#eef1ef"),
                         ("--paper", "#f5f7f4"), ("--ink", "#1b2621")):
        assert f"{token}:{valor}" in css, f"falta {token}:{valor}"
    # y los tres estados de tema siguen ahi
    assert "prefers-color-scheme:dark" in css
    assert ':root:not([data-theme="light"])' in css
    assert ':root[data-theme="dark"]' in css


def test_el_gancho_es_el_BLOQUE_TEAL_en_dos_partes():
    c = _corrida_rica()
    c.gancho = ("El grupo pidio agua helada tres veces en diez meses. "
                "Pesqueria es su planta mas cercana y no hablamos directo.")
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert 'class="hook"' in limpia and 'class="big"' in limpia
    # se parte en la PRIMERA frase, no a la mitad de una oracion
    assert "El grupo pidio agua helada tres veces en diez meses." in limpia
    assert "<p>Pesqueria es su planta mas cercana" in limpia


def test_un_gancho_de_UNA_SOLA_FRASE_no_queda_partido():
    c = _corrida_rica()
    c.gancho = "Arrancaron una linea nueva en agosto"
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert 'class="big">Arrancaron una linea nueva en agosto</div>' in limpia


def test_las_secciones_van_en_TARJETAS_con_h2_teal():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert limpia.count('<div class="card">') >= 5
    assert "<h2>Por que ahora</h2>" in limpia


def test_la_persona_va_en_DOS_COLUMNAS_con_el_chip_sobre_el_correo():
    """El acomodo del prototipo: nombre grande a la izquierda, chip y correo a la
    derecha. El chip va ARRIBA del correo, que es lo que hace que la columna
    derecha se lea como una sola cosa."""
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    import re as _re
    fila = _re.search(r'<div class="persona[^>]*>.*?<div class="lado">.*?</div>\s*</div>',
                      limpia, _re.S).group(0)
    assert 'class="nombre"' in fila and 'class="puesto"' in fila
    assert 'class="porque"' in fila
    assert fila.index('class="chip') < fila.index('class="correo')


def test_los_chips_usan_el_color_que_les_toca():
    """Teal para lo positivo, rojo para «por confirmar», ambar para «puesto sin
    persona», gris para contexto. Es la instruccion de #323, literal."""
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert '<span class="chip pue">Puesto sin persona' in limpia
    assert '<span class="chip dec">Por confirmar' in limpia
    assert '<span class="chip ctx">Contexto' in limpia
    assert '<span class="chip tea">Decisor' in limpia


def test_el_medidor_es_un_CIRCULO_conic_gradient_con_el_numero_al_centro():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert 'class="medidor"' in limpia
    assert "conic-gradient(var(--teal) 0 " in limpia
    assert re.search(r'<span>\d+%</span>', limpia)


def test_el_medidor_SIN_estimacion_no_finge_un_porcentaje():
    """MODO DE FALLA: cuando la corrida no alcanza para estimar, el circulo sale
    gris y sin numero en vez de dibujar un 0% que se leeria como «no encontramos
    a nadie»."""
    c = _corrida_rica()
    c.contactos = c.contactos[:2]
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert "<span>n/d</span>" in limpia
    assert "conic-gradient" not in limpia
    assert "Todavia no se puede estimar" in limpia


def test_la_pestana_tiene_la_BARRA_GRIS_y_el_marcador():
    h = fichamod.modo_limpio(_corrida_rica())
    css = h[h.index("<style>"):h.index("</style>")]
    assert "details.tec{{margin" not in css      # ya paso por el formateo
    assert "background:var(--gray-bg)" in css
    assert 'content:"\\25B8"' in css or 'content:"\u25b8"' in css.lower()
    assert "details.tec[open]>summary::before" in css
    assert "margin-left:auto" in css             # el hint, a la derecha
    tec = h[h.index('<details class="tec">'):]
    assert '<div class="tec-body">' in tec
    assert 'class="tec-t"' in tec


def test_el_correo_NO_lleva_un_BR_adentro():
    """LA UNICA DESVIACION DELIBERADA del prototipo, y esta es su prueba.

    El prototipo parte el correo con `nombre.apellido<br>@coficab.com` para que
    quepa en la columna. Se ve bien y **rompe el copiado**: al pegarlo en un campo
    "Para:" viaja con un salto de linea adentro y la direccion queda invalida en
    la mayoria de los clientes. El correo es lo que quien llama COPIA, asi que el
    salto se hace con `word-break` en CSS -- mismo resultado visual, texto intacto--.

    Y el mismo <br> abrio un hueco en la guardia de datos personales: un correo
    partido por una etiqueta era invisible al escaner. Ver
    `test_un_correo_PARTIDO_POR_MARCADO_no_se_escapa`.
    """
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    import re as _re
    for cor in _re.findall(r'<span class="correo[^"]*">(.*?)</span>', limpia, _re.S):
        assert "<br>" not in cor, "un correo con <br> no se puede copiar"
    css = _t if False else limpia
    assert "word-break:break-all" in fichamod.modo_limpio(_corrida_rica())


def test_NINGUNA_celda_de_la_pestana_usa_una_clase_SIN_CSS():
    """#323 renombro las clases de la pestana y una celda se quedo con la vieja:
    `class="q"` sobrevivio en la columna de consultas y despues del restyle esa
    clase ya no existia en el CSS, asi que la consulta salia sin monoespaciada y
    sin corte de palabra. No lo cacho ninguna prueba -- se vio al leer el HTML
    generado--, y esta es la prueba que faltaba.
    """
    h = fichamod.modo_limpio(_corrida_rica())
    css = h[h.index("<style>"):h.index("</style>")]
    import re as _re
    usadas = {c for attr in _re.findall(r'class="([^"]+)"', h)
              for c in attr.split()}
    definidas = set(_re.findall(r"[.#]([A-Za-z][\w-]*)", css))
    # las que la plantilla usa y el CSS no define. `wrap` y las semanticas de
    # estado van con prefijo, asi que se comparan por nombre simple.
    huerfanas = {c for c in usadas if c not in definidas}
    assert not huerfanas, f"clases usadas y sin CSS: {sorted(huerfanas)}"
