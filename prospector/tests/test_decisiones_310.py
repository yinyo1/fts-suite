"""Las tres decisiones de #310, mas el dato de negocio que Odoo no tiene.

EL DATO: `sale.order` no registra la PLANTA. Tiene el cliente y no tiene el
sitio, asi que una corrida de Coficab/Pesqueria encontraba tres proyectos de esa
cuenta, no veia ninguna planta escrita, y la ficha concluia lo que parece obvio y
es falso: que FTS ya trabajo EN ESA PLANTA. Los tres fueron en Ciudad Juarez.

D1 la tabla ES-EN con los dos grupos aprobados y sus tres restricciones ·
D2 el alias lo pregunta el agente con evidencia, no lo aplica solo ·
D3 `alias --quitar` recalcula y la ficha declara el cambio.

Las pruebas de MODO DE FALLA van marcadas. Sin datos personales: nombres
inventados, y el registro de ubicacion no lleva personas ni importes por diseno.
"""
from __future__ import annotations
import json
import pytest

from flujo import ficha as fichamod
from flujo import orquestador as orq
from flujo.catalogo import EQUIVALENCIAS_DE_PUESTO, GRUPO_DE_PUESTO, _plano
from flujo.compuertas import CompuertaCerrada
from flujo.confianza import Contacto, SOLIDO, EN_CONFLICTO
from flujo.estado import Corrida, MARCA_HISTORIA, MARCA_ALIAS
from flujo.ubicacion_de_proyectos import (
    cargar, declarar, de_la_cuenta, plantas_con_proyecto, veredicto,
    carta_de_presentacion, contacto_es_puerta_a, DeclaracionInvalida,
    CONOCIMIENTO_DIRECTO, HISTORIA_AQUI, HISTORIA_EN_OTRA_PLANTA,
    SIN_HISTORIA_DECLARADA)


@pytest.fixture
def sesion(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    return tmp_path


@pytest.fixture
def registro(tmp_path):
    """Un registro propio, para no escribir en el del repo."""
    return str(tmp_path / "ubicacion.json")


def _corrida(empresa="Coficab", ciudad="Pesqueria") -> Corrida:
    return Corrida(empresa=empresa, ciudad=ciudad, giro="cables")


# ============ EL DATO DE NEGOCIO · donde se hizo cada proyecto, declarado
def test_los_tres_proyectos_de_coficab_estan_declarados_en_juarez():
    """El dato que Esteban aporto, cargado en el repo. Si esto se rompe, la
    proxima corrida de Coficab vuelve a especular con la planta."""
    assert plantas_con_proyecto("Coficab") == ["Ciudad Juarez"]
    assert len(de_la_cuenta("Coficab")) == 3
    assert all(r["fuente"] == CONOCIMIENTO_DIRECTO
               for r in de_la_cuenta("Coficab"))


def test_pesqueria_es_CUENTA_FRIA_y_juarez_no():
    """El veredicto de en medio, que es el que no existia. Sin el solo habia
    'hay proyectos de esta cuenta' contra 'no hay', y la primera se leia como
    'hay proyectos en esta planta'."""
    v = veredicto("Coficab", "Pesqueria")
    assert v["veredicto"] == HISTORIA_EN_OTRA_PLANTA
    assert v["es_fria"] is True
    assert v["plantas"] == ["Ciudad Juarez"]
    assert veredicto("Coficab", "Ciudad Juarez")["veredicto"] == HISTORIA_AQUI
    assert veredicto("Coficab", "Ciudad Juarez")["es_fria"] is False


def test_la_carta_de_presentacion_es_LA_DEL_GRUPO_no_la_de_la_planta():
    """La frase falsa y la frase verdadera abren la puerta igual de bien. La
    diferencia es que la verdadera no se derrumba cuando el de Pesqueria
    pregunta cual proyecto."""
    carta = carta_de_presentacion("Coficab", "Pesqueria")
    assert "a su grupo en Ciudad Juarez" in carta
    assert "NO digas 'ya trabajamos en su planta'" in carta


def test_MODO_DE_FALLA_la_contraparte_de_un_proyecto_de_JUAREZ_no_es_puerta_a_PESQUERIA():
    """La ficha trataba a la contraparte de SO10977 como puerta probable a
    Pesqueria. No lo es. Y no es mal contacto -- es excelente para Juarez y es
    semilla de la corrida corporativa--: es que no abre ESTA puerta."""
    assert not contacto_es_puerta_a("Coficab", "Pesqueria", "SO10977")
    assert contacto_es_puerta_a("Coficab", "Ciudad Juarez", "SO10977")


def test_MODO_DE_FALLA_una_referencia_no_declarada_no_abre_nada():
    """Callar no es afirmar. Si nadie declaro donde se hizo, la herramienta no
    puede decir que abre una puerta."""
    assert not contacto_es_puerta_a("Coficab", "Ciudad Juarez", "SO99999")


def test_sin_historia_declarada_NO_significa_que_no_haya():
    """La distincion que evita el error simetrico: una cuenta sin declaracion no
    es una cuenta sin proyectos, es una cuenta cuya planta nadie escribio."""
    v = veredicto("EmpresaFicticia", "Saltillo")
    assert v["veredicto"] == SIN_HISTORIA_DECLARADA
    assert v["es_fria"] is None
    assert "NO significa que no haya" in v["por_que"]


def test_se_declara_en_UNA_LINEA_y_vive_en_el_registro(registro):
    declarar("Ficticia", "SO00001", "Saltillo", que="tablero",
             fecha="2026-01", canal="directo", ruta=registro)
    d = cargar(registro)
    assert d["registros"][0]["planta"] == "Saltillo"
    assert d["registros"][0]["fuente"] == CONOCIMIENTO_DIRECTO
    assert d["registros"][0]["declarado_en"]


def test_declarar_la_misma_orden_dos_veces_REEMPLAZA(registro):
    """Dos plantas para la misma orden son dos afirmaciones que se contradicen.
    Misma regla que el veredicto del padron de #306."""
    declarar("Ficticia", "SO00001", "Saltillo", ruta=registro)
    r = declarar("Ficticia", "SO00001", "Queretaro", ruta=registro)
    assert r["reemplazo_a"] == "Saltillo"
    assert len(cargar(registro)["registros"]) == 1
    assert plantas_con_proyecto("Ficticia", cargar(registro)) == ["Queretaro"]


def test_MODO_DE_FALLA_una_declaracion_a_medias_se_rechaza(registro):
    """Una declaracion incompleta es peor que ninguna: se cita en la ficha como
    si fuera dato y no se puede rastrear hasta quien la dijo."""
    with pytest.raises(DeclaracionInvalida) as e:
        declarar("Ficticia", "", "Saltillo", ruta=registro)
    assert "referencia" in str(e.value)
    with pytest.raises(DeclaracionInvalida):
        declarar("Ficticia", "SO1", "", ruta=registro)


def test_MODO_DE_FALLA_no_se_acepta_una_fuente_inventada(registro):
    """Esto NO se deriva de Odoo ni del correo. Si algun dia se puede, la fuente
    se agrega a mano y la ficha nota la diferencia."""
    with pytest.raises(DeclaracionInvalida) as e:
        declarar("Ficticia", "SO1", "Saltillo", fuente="odoo", ruta=registro)
    assert "no se deriva" in str(e.value).lower() or "NO se deriva" in str(e.value)


def test_el_registro_del_repo_NO_lleva_personas_ni_importes():
    """La linea que le permite vivir en un repo publico, igual que el catalogo
    de proyectos. Si alguien mete un contacto aqui, esto lo detiene."""
    # Se escanean los REGISTROS, no la prosa que explica el archivo: esa prosa
    # dice "ni una persona y ni un importe", y buscar la palabra 'importe' en
    # ella marcaria el archivo por explicar su propia regla.
    crudo = json.dumps(cargar()["registros"], ensure_ascii=False).lower()
    for prohibido in ("@", "correo", "email", "telefono", "celular",
                      "mxn", "usd", "monto", "importe"):
        assert prohibido not in crudo, f"'{prohibido}' no puede estar aqui"
    permitidas = {"empresa", "referencia", "planta", "que", "fecha", "canal",
                  "fuente", "declarado_en", "reemplazo_a"}
    for r in cargar()["registros"]:
        assert set(r) <= permitidas, f"campo inesperado: {set(r) - permitidas}"


# --------- la corrida y la ficha lo LEEN y lo CITAN
def test_la_FASE_0_registra_el_veredicto_de_historia():
    c = _corrida()
    nuevos = c.registrar_historia_declarada()
    assert nuevos
    assert c.es_cuenta_fria
    assert any(a.startswith(MARCA_HISTORIA) and "CUENTA FRIA" in a
               for a in c.avisos)
    assert any("CARTA DE PRESENTACION" in a for a in c.avisos)


def test_el_veredicto_de_historia_REEMPLAZA_no_acumula():
    """Dos cartas de presentacion que se contradicen en la misma ficha son
    peores que ninguna. Misma regla que #306 D1."""
    c = _corrida()
    c.registrar_historia_declarada()
    c.registrar_historia_declarada()
    assert len([a for a in c.avisos if "CUENTA FRIA" in a]) == 1


def test_la_ficha_limpia_DECLARA_que_la_planta_es_fria_y_cita_la_evidencia():
    c = _corrida()
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab", cercania_decision=10))
    x.dato("planta").observar("buscador", "Coficab Pesqueria")
    html = fichamod.modo_limpio(c)
    assert "CUENTA FRIA EN ESTA PLANTA" in html
    assert "SO10977" in html and "Quimitec" in html
    assert "a su grupo en Ciudad Juarez" in html
    # y dice POR QUE no se puede derivar, que es lo que evita que alguien lo
    # "arregle" borrando el archivo y confiando en Odoo
    assert "no registra la planta" in html


def test_el_checklist_CACHA_un_gancho_que_afirma_trabajo_en_esta_planta():
    """La unica validacion de la ficha que no cuesta una consulta: cuesta la
    cuenta. Una afirmacion falsa se cae en la primera llamada."""
    c = _corrida()
    c.gancho = "Ya trabajamos en su planta con tres proyectos de agua helada"
    filas = [f for f in fichamod.checklist_validaciones(c)
             if f["modulo"] == "HISTORIA"]
    assert filas and filas[0]["estado"] == EN_CONFLICTO
    assert "Ciudad Juarez" in filas[0]["razon"]


def test_MODO_DE_FALLA_la_carta_CORRECTA_no_dispara_el_checklist():
    """El guardia no puede castigar la frase verdadera: 'a su grupo en Juarez'
    es exactamente lo que la ficha debe decir."""
    c = _corrida()
    c.gancho = ("Ya le hicimos tres proyectos de agua helada a su grupo en "
                "Ciudad Juarez, via Quimitec")
    assert not [f for f in fichamod.checklist_validaciones(c)
                if f["modulo"] == "HISTORIA"]


def test_MODO_DE_FALLA_en_la_planta_donde_SI_trabajo_la_frase_es_valida():
    """En Juarez 'en su planta' es cierto, y el checklist no debe estorbar."""
    c = _corrida(ciudad="Ciudad Juarez")
    c.gancho = "Ya trabajamos en su planta: tres proyectos de agua helada"
    assert not [f for f in fichamod.checklist_validaciones(c)
                if f["modulo"] == "HISTORIA"]
    assert "FTS ya trabajo EN ESTA PLANTA" in fichamod.modo_limpio(c)


def test_se_declara_desde_el_CLI_sin_corrida_abierta(sesion, capsys, monkeypatch,
                                                     tmp_path):
    """Es un registro de la CUENTA, no de una corrida: lo que hay que evitar es
    que la corrida que todavia no existe vuelva a especular."""
    ruta = str(tmp_path / "ub.json")
    monkeypatch.setattr(orq, "RUTA_UBICACION", ruta)
    monkeypatch.setattr(orq, "declarar_ubicacion",
                        lambda *args, **kw: declarar(*args, ruta=ruta, **kw))
    monkeypatch.setattr(orq, "de_la_cuenta",
                        lambda e: de_la_cuenta(e, cargar(ruta)))
    assert orq.main(["donde-se-hizo", "--empresa", "Ficticia",
                     "--referencia", "SO00002", "--planta", "Saltillo",
                     "--que", "tablero"]) == 0
    salida = capsys.readouterr().out
    assert "DECLARADO" in salida and "Saltillo" in salida
    assert "COMMITEALO" in salida     # si se queda en el contenedor, se pierde


# ======================= DECISION 1 · la tabla ES-EN, y sus tres restricciones
def test_los_DOS_GRUPOS_NUEVOS_estan_en_la_tabla():
    for grupo in (("gerente de facilidades", "gerente de facilities",
                   "facilities manager"),
                  ("comprador senior", "senior buyer")):
        assert grupo in EQUIVALENCIAS_DE_PUESTO


def test_RESTRICCION_1_comprador_senior_NO_cruza_jerarquia_con_comprador():
    """Un senior buyer no es un comprador raso, y fusionarlos esconderia la
    diferencia que decide a quien se le manda la propuesta."""
    assert GRUPO_DE_PUESTO["comprador senior"] != GRUPO_DE_PUESTO["comprador"]
    assert GRUPO_DE_PUESTO["senior buyer"] != GRUPO_DE_PUESTO["buyer"]


def test_RESTRICCION_2_facilities_NO_cruza_funcion_con_servicios_auxiliares():
    """Muchas empresas juntan facilities y utilities en la misma gerencia. La
    tabla no los junta: eso es una decision de funcion que nadie ha tomado."""
    assert (GRUPO_DE_PUESTO["gerente de facilidades"]
            != GRUPO_DE_PUESTO["gerente de servicios auxiliares"])


def test_RESTRICCION_3_gerente_de_facilities_es_SPANGLISH_no_un_sinonimo_ES():
    """El limite mas fino de los tres, y vale dejarlo escrito. La restriccion 3
    prohibe agrupar dos palabras ESPANOLAS distintas para la misma funcion --
    `servicios generales` y `facilidades` siguen separados--. 'facilities' no es
    otra palabra espanola: es la MISMA palabra inglesa con cabeza espanola, que
    es lo que la industria mexicana dice todo el tiempo. Sigue siendo ES-EN."""
    assert _plano("servicios generales") not in GRUPO_DE_PUESTO
    assert (GRUPO_DE_PUESTO["gerente de facilities"]
            == GRUPO_DE_PUESTO["facilities manager"]
            == GRUPO_DE_PUESTO["gerente de facilidades"])


def test_cada_grupo_EMPIEZA_en_espanol():
    """Funcional, no estetico: el primero es el que la ficha reporta, y la lee
    un operador mexicano. El ingles va en la salvedad."""
    for grupo in EQUIVALENCIAS_DE_PUESTO:
        assert grupo[0] == grupo[0].lower()
        assert not any(grupo[0].startswith(p) for p in
                       ("senior ", "head of ", "plant ", "chief "))


def test_los_dos_grupos_nuevos_RESUELVEN_sus_casos():
    """Para que no queden como tabla decorativa: los dos casos de #306 que los
    motivaron siguen resolviendo en SOLIDO."""
    for uno, otro in (("Gerente de Facilidades en Coficab",
                       "Facilities Manager - COFICAB Group"),
                      ("Comprador Senior en COFICAB Group",
                       "Senior Buyer at Coficab")):
        x = Contacto(nombre="Cami Ficticia", puesto=uno, empresa="Coficab")
        d = x.dato("puesto")
        d.observar("odoo", uno)
        d.observar("web", otro)
        assert not d.choca, f"{uno} vs {otro}"
        assert d.nivel == SOLIDO


# ================ DECISION 2 · el agente PREGUNTA, con la evidencia que motiva
def _con_dos_plantas(c):
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab", cercania_decision=10))
    for f in ("buscador", "linkedin_publico", "prensa"):
        x.dato("planta").observar(f, "COFICAB Monterrey")
    x.hits = 3
    y = c.agregar(Contacto(nombre="Beto Ficticio", puesto="Comprador",
                           empresa="Coficab"))
    for f in ("buscador", "prensa"):
        y.dato("planta").observar(f, "Coficab Pesqueria")
    y.hits = 2
    return x, y


def test_la_pregunta_LLEVA_LA_EVIDENCIA_que_la_motiva():
    """Literalmente lo que pidio la decision 2: 'vi X en 3 fuentes y Pesqueria
    en 2, son la misma planta?'."""
    c = _corrida()
    _con_dos_plantas(c)
    cand = c.alias_por_preguntar()
    assert len(cand) == 1
    q = cand[0]
    assert q["valor"] == "COFICAB Monterrey"
    assert q["n_fuentes"] == 3
    assert q["fuentes_de_la_ciudad"] == 2
    assert q["contactos_afectados"] == 1
    assert "3 fuente(s)" in q["pregunta"] and "'Pesqueria' en 2" in q["pregunta"]
    assert "Son la misma planta?" in q["pregunta"]


def test_MODO_DE_FALLA_preguntar_NO_declara_nada():
    """La decision 2 es que el alias se queda como criterio del operador. Si
    preguntar aplicara el alias, la decision estaria revertida en el codigo."""
    c = _corrida()
    _con_dos_plantas(c)
    antes = len(c.poblacion())
    c.alias_por_preguntar()
    assert c.alias_de_ubicacion == []
    assert len(c.poblacion()) == antes


def test_MODO_DE_FALLA_una_corporativa_NO_se_propone_como_alias():
    """'COFICAB Group' no es una planta con otro nombre: es el grupo. Proponerlo
    como alias es exactamente el doble conteo de #300."""
    c = _corrida()
    x = c.agregar(Contacto(nombre="Cami Ficticia", puesto="Compras Americas",
                           empresa="Coficab"))
    x.dato("planta").observar("buscador", "COFICAB Group")
    assert c.alias_por_preguntar() == []


def test_MODO_DE_FALLA_lo_que_ya_empata_no_se_pregunta():
    c = _corrida()
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab"))
    x.dato("planta").observar("buscador", "Coficab Pesqueria")
    assert c.alias_por_preguntar() == []
    # y tampoco cuando el alias ya esta declarado
    c2 = _corrida()
    _con_dos_plantas(c2)
    c2.declarar_alias_de_ubicacion("Monterrey")
    assert c2.alias_por_preguntar() == []


def test_el_CLI_pregunta_y_sale_con_codigo_3(sesion, capsys):
    """Codigo 3 = necesita decision del operador. No es falla."""
    c = _corrida()
    _con_dos_plantas(c)
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq.main(["alias", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--preguntar"]) == 3
    salida = capsys.readouterr().out
    assert "ALIAS POR PREGUNTAR" in salida
    assert "NO declara nada" in salida
    assert "si dice que no" in salida     # las dos ramas, no solo la del si
    assert orq._cargar("Coficab", "Pesqueria").alias_de_ubicacion == []


# ============= DECISION 3 · alias --quitar, recalculando y declarando el cambio
def test_poner_medir_quitar_verificar_que_vuelve():
    """La prueba exacta que pidio la decision 3."""
    c = _corrida()
    x, _y = _con_dos_plantas(c)
    # poner
    assert len(c.poblacion()) == 1
    c.declarar_alias_de_ubicacion("Monterrey")
    # medir
    assert len(c.poblacion()) == 2
    con_alias = c.completitud().estimado
    # quitar
    cam = c.quitar_alias_de_ubicacion("Monterrey")
    # verificar que vuelve
    assert len(c.poblacion()) == 1
    assert "Ana Ficticia" in cam["salieron"]
    assert cam["poblacion_antes"] == 2 and cam["poblacion_despues"] == 1
    assert cam["chao1_antes"] == round(con_alias, 1)
    assert cam["chao1_despues"] != cam["chao1_antes"]
    assert c.alias_de_ubicacion == []


def test_quitar_el_alias_NO_es_silencioso():
    """Lo que la decision 3 pidio explicitamente. Quitarlo mueve el denominador
    del agotado, que es la cifra que decide cuando parar."""
    c = _corrida()
    _con_dos_plantas(c)
    c.declarar_alias_de_ubicacion("Monterrey")
    c.quitar_alias_de_ubicacion("Monterrey")
    avisos = [a for a in c.avisos if a.startswith(MARCA_ALIAS)]
    assert len(avisos) == 1
    assert "SE QUITO EL ALIAS 'Monterrey'" in avisos[0]
    assert "1 contacto(s) salieron" in avisos[0]
    assert "2 -> 1" in avisos[0]
    assert "Chao1 paso de" in avisos[0]


def test_la_ficha_DECLARA_el_alias_retirado_con_el_antes_y_el_despues():
    c = _corrida()
    _con_dos_plantas(c)
    c.declarar_alias_de_ubicacion("Monterrey")
    c.quitar_alias_de_ubicacion("Monterrey")
    html = fichamod.modo_limpio(c)
    assert "Alias de ubicacion retirados" in html
    assert "Monterrey" in html
    assert "denominador del agotado" in html


def test_el_retiro_SOBREVIVE_al_guardado(sesion):
    """Si no se restaura, la ficha de la vuelta siguiente deja de declarar un
    cambio que si ocurrio."""
    c = _corrida()
    _con_dos_plantas(c)
    c.declarar_alias_de_ubicacion("Monterrey")
    c.quitar_alias_de_ubicacion("Monterrey")
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    c2 = orq._cargar("Coficab", "Pesqueria")
    assert len(c2.alias_quitados) == 1
    assert c2.alias_quitados[0]["alias"] == "Monterrey"
    assert "Alias de ubicacion retirados" in fichamod.modo_limpio(c2)


def test_MODO_DE_FALLA_quitar_un_alias_que_no_existe_se_rechaza():
    """Quitar un alias inexistente no es inocuo: quien lo pide cree que la
    poblacion cambio, y no cambio."""
    c = _corrida()
    with pytest.raises(CompuertaCerrada) as e:
        c.quitar_alias_de_ubicacion("Monterrey")
    assert "no hay ninguno" in str(e.value)
    c.declarar_alias_de_ubicacion("Monterrey")
    with pytest.raises(CompuertaCerrada) as e2:
        c.quitar_alias_de_ubicacion("Saltillo")
    assert "Monterrey" in str(e2.value)


def test_el_CLI_quita_e_imprime_el_recalculo(sesion, capsys):
    c = _corrida()
    _con_dos_plantas(c)
    c.declarar_alias_de_ubicacion("Monterrey")
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq.main(["alias", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--quitar", "Monterrey"]) == 0
    salida = capsys.readouterr().out
    assert "ALIAS RETIRADO" in salida
    assert "poblacion: 2 -> 1" in salida
    assert "Chao1 estimado" in salida
    assert orq._cargar("Coficab", "Pesqueria").alias_de_ubicacion == []


def test_alias_sin_ninguna_de_las_tres_formas_se_niega_con_las_tres(sesion):
    c = _corrida()
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    with pytest.raises(SystemExit) as e:
        orq.main(["alias", "--empresa", "Coficab", "--ciudad", "Pesqueria"])
    for forma in ("--preguntar", "--es", "--quitar"):
        assert forma in str(e.value)


def test_RE_EMITIR_basta_para_corregir_una_corrida_VIEJA(sesion, capsys):
    """El caso real de #310: la corrida de Pesqueria se abrio ANTES de que el
    dato existiera, y el operador declaro la planta DESPUES. Re-emitir tiene que
    bastar -- si hubiera que reabrir la corrida, el arreglo no sirve para la ficha
    que ya esta mal, que es justo la que hay que corregir--."""
    c = _corrida()
    c.gancho = "Ya trabajamos en su planta: mezanine, intercambiador y chiller"
    c.por_que_ahora = "arranque de linea"
    c.como_hablarles = ["por correo"]
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab", cercania_decision=12))
    x.dato("planta").observar("buscador", "Coficab Pesqueria")
    x.hits = 1
    c.challenge_corrido = True
    c.avisos = []                       # una corrida vieja: sin aviso de historia
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    orq.main(["ficha", "--empresa", "Coficab", "--ciudad", "Pesqueria",
              "--modo", "limpio"])
    c2 = orq._cargar("Coficab", "Pesqueria")
    assert any(a.startswith(MARCA_HISTORIA) for a in c2.avisos)
    ruta = c2.fichas_emitidas[-1]
    html = open(ruta, encoding="utf-8").read()
    assert "CUENTA FRIA EN ESTA PLANTA" in html
    assert "a su grupo en Ciudad Juarez" in html
