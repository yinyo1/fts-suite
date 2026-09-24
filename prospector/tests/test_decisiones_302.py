"""Las decisiones que Esteban cerro sobre #302, y la interfaz del motor 2.

Cinco construcciones: la tabla de traduccion ES-EN, la exclusion por ubicacion,
el nivel corporativo, `sembrar`, y el tramo adaptativo con `CAMBIAR_DE_VIA`. Mas
la entrada con angulo del radar y el paquete para el motor 3.

Las pruebas de MODO DE FALLA van marcadas: son las que fijan lo que cada cambio
NO debe hacer, y son las que importan. La de `sembrar` es la mas importante de
todas -- hecha mal, sembrar no pierde datos: INVENTA CONFIRMACIONES--.
"""
from __future__ import annotations
import json
import os
import pytest

from flujo import orquestador as orq
from flujo.catalogo import grupo_de_puesto, EQUIVALENCIAS_DE_PUESTO
from flujo.chao1 import CAMBIAR_DE_VIA, FALTA_BARRER, PREMATURO, SATURO
from flujo.compuertas import (CompuertaCerrada, TOPE_SIN_HUMANO, TRAMO_BASE,
                              TRAMO_INCREMENTO)
from flujo.confianza import (Contacto, CONFIRMADO, SOLIDO, CANDIDATO,
                             EN_CONFLICTO, EN_ESTA_PLANTA, EN_OTRA_PLANTA,
                             EN_CORPORATIVO, SIN_UBICACION)
from flujo.estado import Corrida, NIVEL_CORPORATIVO, ORIGEN_RADAR, SIN_ACCESO
from flujo.ficha import modo_limpio
from flujo.paquete import armar, CORREO_DIRECTO, LINKEDIN, CONMUTADOR


@pytest.fixture
def sesion(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    return tmp_path


def _sondas_ok():
    from flujo.conectores import Sondeo
    s = Sondeo()
    for k in ("odoo", "outlook", "websearch"):
        s.registrar(k, True, "ok")
    s.guardar()


def _puesto(a, b, campo="puesto"):
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    d = x.dato(campo)
    d.observar("linkedin_publico", a)
    d.observar("rocketreach", b)
    return d


def _poblada(hits, **kw):
    c = Corrida(empresa="Coficab", ciudad=kw.pop("ciudad", "Silao"),
                giro="cables", **kw)
    for i, h in enumerate(hits):
        x = Contacto(nombre=f"N{i}", puesto="Gerente de Planta",
                     empresa="Coficab", cercania_decision=10)
        x.hits = h
        c.contactos.append(x)
    return c


# ================================ DECISION 2 · la tabla de traduccion ES-EN
def test_el_caso_de_DURANGO_ya_no_choca():
    """Los 2 de 3 conflictos que quedaron vivos despues de B2."""
    d = _puesto("Director General", "General Manager")
    assert not d.choca
    assert d.equivalencia is not None


def test_se_reporta_el_termino_en_ESPANOL_y_la_salvedad_da_el_otro():
    """La ficha la lee un operador mexicano. Y no se elige en silencio."""
    d = _puesto("Director General", "General Manager")
    assert d.valor == "Director General"
    assert "General Manager" in d.disidencia
    assert "rocketreach" in d.disidencia
    assert "dos idiomas" in d.disidencia


def test_la_equivalencia_TOPA_en_SOLIDO():
    """La tabla es una DECISION HUMANA, no una observacion. Llamar CONFIRMADO a
    un acuerdo que depende de una tabla seria acreditarle a la evidencia algo
    que puso el catalogo."""
    d = _puesto("Gerente de Planta", "Plant Manager")
    assert d.n_raices >= 2
    assert d.nivel == SOLIDO


@pytest.mark.parametrize("es,en", [
    ("Director General", "General Manager"),
    ("Gerente de Planta", "Plant Manager"),
    ("Jefe de Mantenimiento", "Head of Maintenance"),
    ("Gerente de Mantenimiento", "Maintenance Manager"),
    ("Gerente de Compras", "Purchasing Manager"),
    ("Gerente de Compras", "Procurement Manager"),
    ("Ingeniero de Mantenimiento", "Maintenance Engineer"),
    ("Gerente de Proyectos", "Project Manager"),
    ("Director de Operaciones", "COO"),
    ("Gerente de Calidad", "Quality Manager"),
])
def test_los_pares_que_la_industria_usa_de_verdad(es, en):
    assert grupo_de_puesto(es) == grupo_de_puesto(en) is not None
    assert not _puesto(es, en).choca


def test_los_ACENTOS_no_rompen_la_tabla():
    """La tabla se escribe sin acentos y el dato real los trae. Sin doblarlos, la
    mitad de la tabla en espanol no emparejaria nunca."""
    assert grupo_de_puesto("Gerente de Ingeniería") is not None
    assert not _puesto("Gerente de Ingeniería", "Engineering Manager").choca


# --- MODO DE FALLA de la tabla ---------------------------------------------
def test_MODO_DE_FALLA_la_tabla_NO_cruza_jerarquia():
    """`gerente` y `jefe` de mantenimiento NO son la misma posicion en la
    industria mexicana, y fusionarlos esconderia la diferencia que decide a quien
    se le manda la propuesta."""
    assert grupo_de_puesto("gerente de mantenimiento") != \
        grupo_de_puesto("jefe de mantenimiento")
    assert _puesto("Gerente de Mantenimiento", "Jefe de Mantenimiento").choca


def test_MODO_DE_FALLA_la_tabla_NO_cruza_funcion():
    assert grupo_de_puesto("gerente de seguridad e higiene") != \
        grupo_de_puesto("gerente de medio ambiente")


def test_MODO_DE_FALLA_dos_puestos_DISTINTOS_siguen_chocando():
    assert _puesto("Director General", "Gerente de Ventas").choca
    assert _puesto("Gerente de Compras", "Quality Manager").choca


def test_MODO_DE_FALLA_con_TRES_valores_uno_ajeno_rompe_la_equivalencia():
    """Si el tercero es otra persona u otro dato, el conflicto es de verdad."""
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    d = x.dato("puesto")
    d.observar("linkedin_publico", "Director General")
    d.observar("rocketreach", "General Manager")
    d.observar("zoominfo", "Gerente de Ventas")
    assert d.equivalencia is None
    assert d.choca


def test_MODO_DE_FALLA_la_tabla_empareja_el_valor_COMPLETO():
    """Limite declarado: "Gerente de Planta" contra "Plant Manager COFICAB Silao"
    NO es equivalencia. Aflojarlo pedia un tokenizador de titulos, y el modo de
    falla de aflojarlo es fusionar a dos personas distintas."""
    assert _puesto("Gerente de Planta", "Plant Manager COFICAB Silao").choca


def test_MODO_DE_FALLA_la_equivalencia_NO_aplica_a_la_entidad():
    assert _puesto("Director General", "General Manager", campo="entidad").choca


def test_ningun_termino_esta_en_DOS_grupos():
    """Un termino en dos grupos los fusiona por transitividad y la tabla deja de
    decir lo que dice. El catalogo lo verifica al importar; esto lo fija."""
    vistos = {}
    for i, g in enumerate(EQUIVALENCIAS_DE_PUESTO):
        for t in g:
            assert t not in vistos, f"'{t}' esta en los grupos {vistos[t]} y {i}"
            vistos[t] = i


# ====================== DECISION 3a · la exclusion por EVIDENCIA de ubicacion
def _con_planta(nombre, puesto, planta, ciudad_corrida, fuente="rocketreach"):
    c = Corrida(empresa="Coficab", ciudad=ciudad_corrida, giro="cables")
    x = Contacto(nombre=nombre, puesto=puesto, empresa="Coficab",
                 cercania_decision=10)
    if planta:
        x.dato("planta").observar(fuente, planta)
    x.hits = 1
    c.agregar(x)
    return c, x


@pytest.mark.parametrize("planta,ciudad,esperado", [
    ("COFICAB Durango", "Durango", EN_ESTA_PLANTA),
    ("planta Cd. Juarez", "Cd. Juarez", EN_ESTA_PLANTA),
    ("COFICAB LEON, Silao Gto", "Silao", EN_ESTA_PLANTA),
    ("Pesquería NL", "Pesqueria", EN_ESTA_PLANTA),
    ("planta Cd. Juarez", "Pesqueria", EN_OTRA_PLANTA),
    ("COFICAB Group", "Pesqueria", EN_CORPORATIVO),
    ("Compras regionales Americas", "Silao", EN_CORPORATIVO),
    ("EHS corporativo", "Durango", EN_CORPORATIVO),
])
def test_donde_esta_sentada_la_persona(planta, ciudad, esperado):
    _c, x = _con_planta("N", "Gerente", planta, ciudad)
    assert x.ubicacion_respecto_a(ciudad) == esperado


def test_UNA_fuente_que_nombre_esta_ciudad_basta():
    """El caso de Juarez en #300: un contacto con "COFICAB Group" y "planta Cd.
    Juarez" a la vez, que el challenge marco como CONFLICTO de planta. No hay
    conflicto: la persona es de Juarez y una fuente la nombro por el grupo."""
    _c, x = _con_planta("N", "Gerente", "COFICAB Group", "Cd. Juarez")
    x.dato("planta").observar("outlook", "planta Cd. Juarez")
    assert x.ubicacion_respecto_a("Cd. Juarez") == EN_ESTA_PLANTA
    assert x.cuenta_en_la_poblacion_de("Cd. Juarez")


def test_el_chao1_deja_de_contar_a_los_de_otra_planta():
    """El numero de #300: la gente regional salio en 2 a 4 de las cuatro
    corridas y cada Chao1 la sumo a SU poblacion."""
    c = Corrida(empresa="Coficab", ciudad="Pesqueria", giro="cables")
    for nombre, planta in [("A", "COFICAB Pesqueria"), ("B", "planta Cd. Juarez"),
                           ("C", "COFICAB Group"), ("D", None)]:
        x = Contacto(nombre=nombre, puesto="Gerente", empresa="Coficab",
                     cercania_decision=10)
        if planta:
            x.dato("planta").observar("rocketreach", planta)
        x.hits = 1
        c.agregar(x)
    assert len(c.contactos) == 4
    assert [x.nombre for x in c.poblacion()] == ["A", "D"]
    assert c.completitud().observados == 2, "eran 4 antes de la exclusion"


def test_los_excluidos_se_EXPORTAN_a_la_semilla_corporativa():
    """No se tiran: hoy son ruido en cuatro fichas, asi son el insumo de una
    quinta. Y la semilla sale SIN NOMBRES: viaja el puesto y la ubicacion."""
    c, _x = _con_planta("Regional", "Gerente de Compras", "COFICAB Group",
                        "Pesqueria")
    s = c.semilla_corporativa()
    assert len(s) == 1
    assert s[0]["puesto"] == "Gerente de Compras"
    assert s[0]["donde"] == EN_CORPORATIVO
    assert s[0]["de_corrida"] == "Coficab/Pesqueria"
    assert "nombre" not in s[0], (
        "la semilla no lleva nombres: el nombre lo vuelve a encontrar la corrida "
        "destino, y asi no puede pasar por observacion propia")


def test_la_ficha_los_pone_en_su_SECCION_no_en_a_quien_buscar():
    c, _x = _con_planta("Regional", "Gerente de Compras", "COFICAB Group",
                        "Pesqueria")
    h = modo_limpio(c)
    assert "No son de esta planta" in h
    assert "--nivel corporativo" in h, "la ficha dice como recogerlos"


# --- MODO DE FALLA de la exclusion -----------------------------------------
def test_MODO_DE_FALLA_SIN_ubicacion_observada_NO_se_excluye_a_nadie():
    """Ausencia de evidencia no es evidencia de ausencia. Excluir por silencio
    seria exactamente la heuristica que esta regla evita."""
    _c, x = _con_planta("N", "Gerente de Compras", None, "Pesqueria")
    assert x.ubicacion_respecto_a("Pesqueria") == SIN_UBICACION
    assert x.cuenta_en_la_poblacion_de("Pesqueria")


def test_MODO_DE_FALLA_la_exclusion_NO_se_hace_por_TITULO():
    """"Compras = corporativo" perderia a la gerencia de compras DE LA PLANTA,
    que si es target: en Silao era uno de los cuatro de valor."""
    _c, x = _con_planta("N", "Gerente de Compras MRO", "COFICAB LEON, Silao Gto",
                        "Silao")
    assert x.ubicacion_respecto_a("Silao") == EN_ESTA_PLANTA
    assert x.cuenta_en_la_poblacion_de("Silao")


def test_MODO_DE_FALLA_la_corrida_CORPORATIVA_no_excluye_a_nadie():
    """La exclusion necesita una ciudad contra la que comparar, y una corrida
    corporativa no tiene una. Sus consultas ya son corporativas."""
    c = Corrida(empresa="Coficab", ciudad="", giro="cables",
                nivel=NIVEL_CORPORATIVO)
    for planta in ("COFICAB Group", "planta Cd. Juarez", None):
        x = Contacto(nombre=planta or "sin", puesto="Gerente",
                     empresa="Coficab", cercania_decision=10)
        if planta:
            x.dato("planta").observar("rocketreach", planta)
        x.hits = 1
        c.agregar(x)
    assert len(c.poblacion()) == 3
    assert c.fuera_de_la_poblacion() == []


# ================================= DECISION 3b · el nivel corporativo
def test_la_llave_del_corporativo_NO_puede_chocar_con_una_ciudad(sesion):
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab",
                     "--nivel", "corporativo"]) == 0
    assert orq.main(["prospecta", "--empresa", "Coficab",
                     "--ciudad", "Durango"]) == 0
    archivos = sorted(p.name for p in (sesion / "coficab").glob("*.json"))
    assert archivos == ["_corporativo.json", "durango.json"]


def test_el_corporativo_cierra_M2_y_M13_con_razon_escrita(sesion):
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab",
                     "--nivel", "corporativo"]) == 0
    d = json.loads((sesion / "coficab" / "_corporativo.json").read_text("utf-8"))
    assert d["nivel"] == NIVEL_CORPORATIVO
    assert d["ciudad"] == ""
    for m in ("M2", "M13"):
        assert d["cobertura"][m]["estado"] == "no_aplicaba"
        assert d["cobertura"][m]["razon"], f"{m} sin razon escrita"
    assert "PLANTA" in d["cobertura"]["M2"]["razon"].upper()
    assert "ESTABLECIMIENTO" in d["cobertura"]["M13"]["razon"].upper()


def test_el_corporativo_con_ciudad_se_NIEGA(sesion):
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab", "--nivel",
                     "corporativo", "--ciudad", "Durango"]) == 2


def test_el_corporativo_NO_pregunta_cual_planta(sesion):
    """Que el padron liste tres establecimientos es informacion, no una
    ambiguedad que resolver: la corrida corporativa no va a ninguno."""
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Ragasa",
                     "--nivel", "corporativo"]) != 3


# ============================== DECISION 3c · sembrar. UNA SEMILLA NO ES RAIZ
def test_sembrar_no_cuenta_como_consulta_ni_mueve_el_agotado():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    antes = (c.consultas_de_red(), c.presupuesto.gastadas)
    c.sembrar("Coficab/Cd. Juarez", "patron", "nombre.apellido@dominio")
    assert (c.consultas_de_red(), c.presupuesto.gastadas) == antes


def test_el_vocabulario_sembrado_entra_al_vocabulario():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    c.sembrar("Coficab/Cd. Juarez", "vocabulario", "nave de extrusion")
    assert "nave de extrusion" in c.vocabulario


def test_la_ficha_DECLARA_lo_sembrado():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    c.sembrar("Coficab/Cd. Juarez", "patron", "nombre.apellido@dominio")
    h = modo_limpio(c)
    assert "Sembrado de otras corridas" in h
    assert "Coficab/Cd. Juarez" in h
    assert "no observado en esta corrida" in h


# --- MODO DE FALLA de sembrar: LA MAS IMPORTANTE DE TODO EL ARCHIVO ---------
def test_MODO_DE_FALLA_una_semilla_NO_INVENTA_CONFIRMACIONES():
    """El peor modo de falla del proyecto: hecho mal, sembrar no pierde datos,
    INVENTA CONFIRMACIONES.

    El patron de Coficab tiene UNA sola ancla, en Juarez. Si sembrarla contara
    como fuente, esa unica observacion produciria CONFIRMADO en las cuatro
    corridas, y el estado reportaria cuatro confirmaciones de un solo hecho --
    indistinguible, leyendo el estado, de cuatro observaciones independientes--.

    Aqui se siembra la MISMA cosa desde DOS corridas distintas, que es el caso
    peor: dos semillas de dos origenes se verian como dos raices.
    """
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    x = Contacto(nombre="N N", puesto="Gerente", empresa="Coficab")
    c.agregar(x)
    c.sembrar_en_contacto(x, "patron_correo", "first.last", "Coficab/Cd. Juarez")
    c.sembrar_en_contacto(x, "patron_correo", "first.last", "Coficab/Durango")
    d = x.dato("patron_correo")
    assert d.n_raices == 0, "una semilla NO es raiz, vengan de donde vengan"
    assert d.nivel == CANDIDATO, "dos semillas no hacen un CONFIRMADO"
    assert d.solo_sembrado
    assert not d.tiene_ancla if hasattr(d, "tiene_ancla") else True


def test_MODO_DE_FALLA_una_semilla_NO_es_ancla():
    """`tiene_ancla` decide si un contacto es DE VALOR cuando la cercania no se
    estimo. Una semilla que anclara volveria de valor a gente que nadie observo."""
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    c.agregar(x)
    c.sembrar_en_contacto(x, "correo", "[persona]@ejemplo.mx", "Coficab/Cd. Juarez")
    assert not x.tiene_ancla
    assert not x.de_valor, "sembrado + sin cercania no puede ser de valor"


def test_la_semilla_SUBE_cuando_esta_corrida_lo_observa_por_su_cuenta():
    """No es un castigo permanente: es lo que se observo. Cuando la corrida lo
    mide, sube con SUS raices."""
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    x = Contacto(nombre="N N", puesto="Gerente", empresa="Coficab")
    c.agregar(x)
    c.sembrar_en_contacto(x, "patron_correo", "first.last", "Coficab/Cd. Juarez")
    d = x.dato("patron_correo")
    assert d.nivel == CANDIDATO
    d.observar("rocketreach", "first.last")
    assert d.nivel == SOLIDO and d.n_raices == 1
    d.observar("outlook", "first.last")
    assert d.nivel == CONFIRMADO and d.n_raices == 2


def test_MODO_DE_FALLA_los_CONTACTOS_no_se_siembran_en_una_planta():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    with pytest.raises(CompuertaCerrada, match="corporativa"):
        c.sembrar("Coficab/Cd. Juarez", "contactos", "gerencia regional")


def test_MODO_DE_FALLA_una_corrida_no_se_siembra_a_SI_MISMA():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    with pytest.raises(CompuertaCerrada, match="misma corrida"):
        c.sembrar("Coficab/Durango", "patron", "x.y@z")


def test_MODO_DE_FALLA_una_semilla_sin_origen_no_se_puede_auditar():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    with pytest.raises(CompuertaCerrada, match="auditar"):
        c.sembrar("", "patron", "x.y@z")


def test_lo_sembrado_SOBREVIVE_al_disco(sesion):
    """Misma familia de defecto que `modulo_origen` (#295) y `entrega` (#301):
    un campo que se escribe y no se restaura se pierde al releer."""
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab",
                     "--ciudad", "Durango"]) == 0
    assert orq.main(["sembrar", "--empresa", "Coficab", "--ciudad", "Durango",
                     "--de", "Coficab/Cd. Juarez", "--que", "patron",
                     "--valor", "nombre.apellido@dominio"]) == 0
    c = orq._cargar("Coficab", "Durango")
    assert len(c.sembrado) == 1
    assert c.patron_sembrado["de_corrida"] == "Coficab/Cd. Juarez"


def test_una_observacion_SEMBRADA_sobrevive_al_disco_marcada(sesion):
    """Si `sembrado` no se restaura, la semilla vuelve del disco pareciendo una
    observacion propia — y ahi si inventa confirmaciones."""
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab",
                     "--ciudad", "Durango"]) == 0
    c = orq._cargar("Coficab", "Durango")
    x = Contacto(nombre="N N", puesto="Gerente", empresa="Coficab")
    c.agregar(x)
    c.sembrar_en_contacto(x, "patron_correo", "first.last", "Coficab/Cd. Juarez")
    c.guardar(orq._ruta("Coficab", "Durango"))
    c2 = orq._cargar("Coficab", "Durango")
    d = c2.contactos[0].dato("patron_correo")
    assert d.solo_sembrado, "volvio del disco como observacion propia"
    assert d.n_raices == 0
    assert d.nivel == CANDIDATO


# ============ DECISION 3d · el tramo adaptativo y el desempate CAMBIAR_DE_VIA
def _con_bloques(c, cuantos, de_valor=1, consultas=10):
    for _ in range(cuantos):
        c.presupuesto.registrar(consultas, de_valor, de_valor=de_valor)
    return c


def test_el_tramo_base_es_60_y_el_incremento_30():
    """30 = TRES bloques de 10, la ventana minima en la que la saturacion puede
    dispararse. Con 20 no le das a la compuerta de agotado la oportunidad."""
    assert TRAMO_BASE == 60
    assert TRAMO_INCREMENTO == 30
    assert TOPE_SIN_HUMANO == 90


def test_el_caso_de_SILAO_renueva_a_90_sola():
    """60/60, Chao1 falta_barrer confiable, ultimo bloque no seco."""
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 6)
    ev = c.evaluar_tramo()
    assert ev["puede"] and not ev["necesita_humano"]
    r = c.renovar_tramo()
    assert r["tope_nuevo"] == 90
    assert c.presupuesto.tramo == 2
    assert "falta_barrer" in r["razon"]


def test_la_renovacion_escribe_su_RAZON_y_su_evidencia():
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 6)
    r = c.renovar_tramo()
    assert r["razon"].strip()
    assert r["chao1"]["observados"] == 25
    assert r["ultimo_bloque"]["seco"] is False
    assert r["autorizado_por_humano"] is False


def test_de_90_para_arriba_lo_decide_EL_OPERADOR():
    """Una renovacion automatica sin techo convierte el tope en decoracion:
    Chao1 casi siempre dice que falta gente, es un estimador de poblacion."""
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 6)
    c.renovar_tramo()
    _con_bloques(c, 3)
    assert c.evaluar_tramo()["necesita_humano"]
    with pytest.raises(CompuertaCerrada, match="decide el operador"):
        c.renovar_tramo()
    assert c.renovar_tramo(autorizado_por_humano=True)["tope_nuevo"] == 120


@pytest.mark.parametrize("hits,bloques,falta", [
    # chao1 prematuro: un "no se" no es razon para gastar mas
    ([2, 1, 1, 1, 1], 6, "chao1_dice_que_falta"),
])
def test_MODO_DE_FALLA_un_prematuro_NO_renueva_el_tope(hits, bloques, falta):
    c = _poblada(hits)
    _con_bloques(c, bloques)
    ev = c.evaluar_tramo()
    assert falta in ev["faltan"]
    with pytest.raises(CompuertaCerrada):
        c.renovar_tramo()


def test_MODO_DE_FALLA_un_ultimo_bloque_SECO_no_renueva():
    """Si el tramo termino en seco, el problema no es el presupuesto."""
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 5)
    c.presupuesto.registrar(10, 0, de_valor=0)
    with pytest.raises(CompuertaCerrada, match="SECO"):
        c.renovar_tramo()


def test_MODO_DE_FALLA_sin_vias_libres_no_renueva():
    """Renovar el tope para volver a preguntar lo mismo es gastar por gastar."""
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 6)
    for mod in list(c.vias_sin_agotar()):
        c.marcar_cobertura(mod, SIN_ACCESO, "prueba")
    with pytest.raises(CompuertaCerrada, match="gastar por gastar"):
        c.renovar_tramo()


def test_MODO_DE_FALLA_una_renovacion_sin_razon_no_existe():
    c = _poblada([1] * 10 + [2] * 5)
    with pytest.raises(CompuertaCerrada, match="razon"):
        c.presupuesto.renovar("", {})


# --- el desempate, en sus tres casos ---------------------------------------
def test_CASO_1_prematuro_contra_3_secos_manda_AGOTADO():
    """Pesqueria en #300. Y la razon no es que "prematuro pierda": con 5
    observados y f2=1 Chao1 NO TIENE DENOMINADOR."""
    c = _poblada([2, 1, 1, 1, 1], ciudad="Pesqueria")
    _con_bloques(c, 3, de_valor=0)
    d = c.desempate()
    assert d["manda"] == "agotado" and d["para"]
    assert "NO OPINA" in d["razon"]
    assert c.que_detiene_el_loop()


def test_CASO_3_falta_barrer_contra_3_secos_manda_CAMBIAR_DE_VIA():
    """Las dos tienen razon a la vez: la poblacion no esta agotada, pero esta
    forma de preguntar si. Ni parar ni renovar tope."""
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 3, de_valor=0)
    d = c.desempate()
    assert d["veredicto"] == CAMBIAR_DE_VIA
    assert not d["para"]
    assert d["vias_sin_agotar"], "sin vias que nombrar no es una instruccion"
    assert c.que_detiene_el_loop() == "", (
        "los tres bloques secos NO detienen el lazo en este caso: mandan cambiar "
        "de via")


def test_CASO_3_bis_sin_vias_SI_para_y_dice_QUE_COMPRAR():
    """Es un hallazgo entregable, no un fracaso."""
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 3, de_valor=0)
    for mod in list(c.vias_sin_agotar()):
        c.marcar_cobertura(mod, SIN_ACCESO, "prueba")
    d = c.desempate()
    assert d["para"] and d["manda"] == "las dos"
    assert "Sales Navigator" in d["razon"]


def test_sin_saturacion_NO_hay_desacuerdo_que_resolver():
    c = _poblada([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5)
    _con_bloques(c, 2)
    assert c.desempate()["manda"] == "ninguna"
    assert not c.desempate()["para"]


def test_el_texto_de_PREMATURO_ya_no_dice_que_manda_seguir():
    """Era la otra mitad del defecto: leia un "no se" como un "sigue"."""
    c = _poblada([2, 1, 1, 1, 1])
    por_que = c.completitud().por_que
    assert "NO OPINA" in por_que
    assert "manda SEGUIR" not in por_que


# ================ PARTE 2 · el angulo del radar y el paquete para el motor 3
def test_el_angulo_del_RADAR_entra_como_gancho_PRELIMINAR(sesion):
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango",
                     "--angulo", "8-dic-2025 · inauguracion de la nave nueva",
                     "--origen", "radar"]) == 0
    c = orq._cargar("Coficab", "Durango")
    assert c.origen == ORIGEN_RADAR
    assert c.gancho == c.angulo
    assert c.angulo_resuelto == "", "todavia no lo confirmo nadie"
    h = modo_limpio(c)
    assert "GANCHO PRELIMINAR" in h
    assert h.index("GANCHO PRELIMINAR") < h.index("<h1>")


def test_un_angulo_MANUAL_funciona_como_hoy(sesion):
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Silao",
                     "--angulo", "el operador lo pidio", "--origen", "manual"]) == 0
    c = orq._cargar("Coficab", "Silao")
    assert c.angulo_resuelto == "manual"
    assert "GANCHO PRELIMINAR" not in modo_limpio(c)


def test_la_corrida_CONFIRMA_o_CORRIGE_el_angulo_del_radar(sesion):
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango",
              "--angulo", "inauguracion", "--origen", "radar"])
    assert orq.main(["registrar", "--empresa", "Coficab", "--ciudad", "Durango",
                     "--modulo", "M12",
                     "--datos", '{"angulo_resuelto": "confirmado"}']) == 0
    c = orq._cargar("Coficab", "Durango")
    assert c.angulo_resuelto == "confirmado"
    assert "GANCHO PRELIMINAR" not in modo_limpio(c)


def test_un_angulo_resuelto_INVENTADO_se_rechaza(sesion):
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    with pytest.raises(SystemExit):
        orq.main(["registrar", "--empresa", "Coficab", "--ciudad", "Durango",
                  "--modulo", "M12",
                  "--datos", '{"angulo_resuelto": "mas o menos"}'])


def _corrida_para_paquete():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    c.gancho = "La nave nueva funde cobre OFC"
    c.agregar_senal("2025-12-08 · prensa · inauguracion de Coficab II, 60 MDD")
    # con historia en el buzon -> correo directo
    a = Contacto(nombre="A", puesto="Gerente de Mantenimiento", empresa="Coficab",
                 cercania_decision=10)
    a.dato("correo").observar("outlook", "[persona-a]@ejemplo.mx")
    a.dato("planta").observar("outlook", "COFICAB Durango")
    # frio, con nombre -> linkedin
    b = Contacto(nombre="B", puesto="Director de Planta", empresa="Coficab",
                 cercania_decision=5)
    b.dato("correo").observar("patron_derivado", "[persona-b]@ejemplo.mx")
    b.dato("planta").observar("linkedin_publico", "Durango")
    # sin nombre -> conmutador
    d = Contacto(nombre=None, puesto="Jefe de Mantenimiento", empresa="Coficab",
                 cercania_decision=10)
    d.dato("planta").observar("buscador", "planta Durango")
    # regional -> NO va al paquete
    e = Contacto(nombre="E", puesto="Gerente de Compras", empresa="Coficab",
                 cercania_decision=15)
    e.dato("planta").observar("zoominfo", "COFICAB Group")
    for x in (a, b, d, e):
        c.agregar(x)
    return c


def test_el_paquete_trae_lo_que_el_CRM_necesita():
    pq = armar(_corrida_para_paquete())
    assert pq["empresa"] == "Coficab" and pq["planta"] == "Durango"
    assert pq["gancho"]
    assert pq["senal"][0]["fecha"] == "2025-12-08", "la senal con su fecha"
    assert pq["para"] == "motor3_crm_odoo"
    assert len(pq["contactos_de_valor"]) == 3


@pytest.mark.parametrize("nombre,canal", [
    ("A", CORREO_DIRECTO),   # historia en el buzon
    ("B", LINKEDIN),         # frio, correo derivado del patron
    (None, CONMUTADOR),      # puesto sin persona
])
def test_el_canal_sale_de_la_EVIDENCIA_no_de_una_preferencia(nombre, canal):
    pq = armar(_corrida_para_paquete())
    x = next(x for x in pq["contactos_de_valor"] if x["nombre"] == nombre)
    assert x["canal_recomendado"] == canal
    assert x["canal_por_que"], "el canal sin su razon es una preferencia"


def test_MODO_DE_FALLA_el_paquete_NO_lleva_a_los_de_otra_planta():
    """La ficha de Pesqueria de #300 traia como unico contacto a uno de Juarez.
    El paquete crearia una tarjeta de CRM con esa misma gente."""
    pq = armar(_corrida_para_paquete())
    assert "E" not in [x["nombre"] for x in pq["contactos_de_valor"]]


def test_MODO_DE_FALLA_el_celular_personal_NUNCA_es_un_canal():
    pq = armar(_corrida_para_paquete())
    canales = {x["canal_recomendado"] for x in pq["contactos_de_valor"]}
    assert "celular_personal" not in canales
    assert "celular_personal" in pq["canales_que_no_emite"], (
        "viaja declarado para que el motor 3 no lo invente tampoco")
    assert "PROHIBIDO" in pq["canales_que_no_emite"]["celular_personal"]


def test_el_paquete_marca_al_CANDIDATO_como_lo_que_es():
    """Escribirle a un candidato como si fuera confirmado es el error que cuesta
    la cuenta."""
    pq = armar(_corrida_para_paquete())
    b = next(x for x in pq["contactos_de_valor"] if x["nombre"] == "B")
    assert b["nivel_confianza"] == CANDIDATO
    assert "candidato" in pq["advertencia"]


def test_el_paquete_se_escribe_FUERA_del_repo(sesion):
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    assert orq.main(["paquete", "--empresa", "Coficab", "--ciudad", "Durango"]) == 0
    p = sesion / "coficab" / "durango-paquete.json"
    assert p.exists()
    assert json.loads(p.read_text("utf-8"))["para"] == "motor3_crm_odoo"


def test_el_paquete_NO_se_puede_escribir_en_el_repo(sesion):
    """La regla del repo no cambia porque haya una salida nueva: el paquete lleva
    nombres y correos, y el repo es PUBLICO. Codigo 2, igual que la ficha."""
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    aqui = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fuga = os.path.join(aqui, "fuga.json")
    assert orq.main(["paquete", "--empresa", "Coficab", "--ciudad", "Durango",
                     "--salida", fuga]) == 2
    assert not os.path.exists(fuga), "no se escribio nada, no solo se quejo"


# --- lo que la verificacion del comando `tramo` destapo ---------------------
def test_MODO_DE_FALLA_el_motor_LOCAL_no_es_una_via_para_cambiar():
    """Una via es un lugar DONDE PREGUNTAR, y `patron_derivado` -- el motor de
    combinaciones de M4-- no pregunta en ningun lado: genera local.

    No era cosmetico. Una corrida cuya unica via "libre" fuera M4 recibiria
    CAMBIAR_DE_VIA y daria vueltas sobre un generador local, en vez de parar y
    decir "esto necesita Sales Navigator" — que es el hallazgo entregable.
    """
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    vias = c.vias_sin_agotar()
    assert "M4" not in vias
    assert not any("patron_derivado" in fs for fs in vias.values())


def test_el_comando_que_sugiere_tramo_lleva_la_CIUDAD(sesion, capsys):
    """Sin ella, en una empresa multiplanta el comando sugerido se niega."""
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Silao"])
    c = orq._cargar("Coficab", "Silao")
    for i, h in enumerate([1] * 10 + [2] * 5 + [3] * 5 + [5] * 5):
        x = Contacto(nombre=f"N{i}", puesto="Gerente de Planta",
                     empresa="Coficab", cercania_decision=10)
        x.hits = h
        c.contactos.append(x)
    _con_bloques(c, 6)
    c.guardar(orq._ruta("Coficab", "Silao"))
    capsys.readouterr()
    assert orq.main(["tramo", "--empresa", "Coficab", "--ciudad", "Silao"]) == 0
    assert "--ciudad 'Silao'" in capsys.readouterr().out
