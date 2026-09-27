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
    orden = ["Ficha de prospeccion · para Rissia", "Gancho", "Por que ahora",
             "A quien buscar", "Como hablarles",
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
    assert "se guardaron para la corrida corporativa" in limpia
    assert "Eva Ficticia" in tec or "Compras Americas" in tec


def test_la_linea_de_tiempo_ordena_y_marca_lo_que_no_trae_fecha():
    c = _corrida_rica()
    tl = fichamod.linea_de_tiempo(c)
    assert tl.index("2018") < tl.index("ago-2026"), "la linea de tiempo no ordena"
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert tl in limpia, "la linea de tiempo no llego a la capa limpia"
    assert "Sin fecha" in limpia
    assert "confirmar el ano antes de citarlo" in limpia


def test_el_medidor_dice_el_porcentaje_y_QUE_SIGNIFICA():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert 'class="gauge"' in limpia
    assert "Sales Navigator" in limpia
    assert re.search(r'class="g-t">\d+%<', limpia)


def test_lo_que_no_se_pudo_revisar_va_en_lenguaje_de_persona():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "PDFs y documentos publicos" in limpia
    assert "el entorno no deja abrirlos" in limpia
    assert "registros de comercio exterior" in limpia
    assert "no gastar el presupuesto" in limpia


# ============================================ el aviso rojo, condicional
def test_el_aviso_rojo_SALE_cuando_la_planta_es_fria():
    limpia, _t = _capas(fichamod.modo_limpio(_corrida_rica()))
    assert "Antes de llamar" in limpia
    assert "FTS nunca ha trabajado en esta planta" in limpia
    assert "Ciudad Juarez" in limpia
    assert "a su grupo en Ciudad Juarez" in limpia


def test_el_aviso_rojo_NO_SE_IMPRIME_cuando_no_hay_nada_que_avisar():
    """Un aviso que sale siempre no se lee. Esta es la mitad de la regla que la
    hace funcionar, y la que es facil de romper sin notarlo."""
    c = _corrida_rica(empresa="EmpresaFicticiaSinHistoria", ciudad="Saltillo")
    limpia, _t = _capas(fichamod.modo_limpio(c))
    assert "Antes de llamar" not in limpia
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
