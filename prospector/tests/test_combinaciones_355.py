"""R1 a R4, el motor de combinaciones de M5 (#355).

Las cuatro reglas se midieron en #353 y Esteban las aprobo en #355. Hasta
entonces el producto de M5 -- titulos x formas x dominios-- estaba descrito en
prosa y lo armaba el agente a mano. Una regla que depende de que alguien se
acuerde no es una regla, asi que aqui viven en codigo y estas pruebas las fijan.

  R1  el puesto entre comillas cuando tiene 3 palabras o mas
  R2  el nivel corporativo se busca SIN ancla de planta
  R3  las siglas cosechadas por M2 se expanden antes de consultar
  R4  se pregunta con TODOS los nombres de la empresa, no solo el legal

Sin nombres: los casos se nombran por puesto y empresa.
"""
from __future__ import annotations

from flujo.combinaciones import (
    PALABRAS_DE_NIVEL_CORPORATIVO,
    PALABRAS_PARA_ENTRECOMILLAR,
    consultas_de_m5,
    cuantas_agrega_cada_regla,
    es_nivel_corporativo,
    expandir_siglas,
    siglas_del_puesto,
)


def _textos(cs):
    return [c["texto"] for c in cs]


# ------------------------------------------------------------------------ R1
def test_r1_un_puesto_de_tres_palabras_va_entre_comillas():
    cs = consultas_de_m5("Nemak", ["Capex Control Leader"], pais="Mexico")
    assert all('"Capex Control Leader"' in t for t in _textos(cs)), _textos(cs)
    assert all("R1" in c["reglas"] for c in cs)


def test_r1_un_puesto_de_dos_palabras_NO_va_entre_comillas():
    """El corte es TRES, y es deliberado: con dos palabras la frase exacta es
    demasiado estrecha y pierde el orden invertido, que en espaniol es comun --
    «gerente mantenimiento» contra «mantenimiento gerente»--."""
    assert PALABRAS_PARA_ENTRECOMILLAR == 3
    cs = consultas_de_m5("Nemak", ["Plant Manager"], pais="Mexico")
    assert all('"' not in t for t in _textos(cs)), _textos(cs)
    assert all("R1" not in c["reglas"] for c in cs)


def test_r1_normaliza_los_espacios_antes_de_entrecomillar():
    cs = consultas_de_m5("X", ["  Gerente   de   Planta  "], pais="Mexico")
    assert all('"Gerente de Planta"' in t for t in _textos(cs)), _textos(cs)


# ------------------------------------------------------------------------ R2
def test_r2_el_nivel_corporativo_no_lleva_ciudad():
    cs = consultas_de_m5("Bimbo", ["Global Procurement Director"],
                         ciudad="Monterrey", pais="Mexico")
    assert cs, "no genero ninguna consulta"
    for t in _textos(cs):
        assert "Monterrey" not in t, t
    assert all("R2" in c["reglas"] for c in cs)


def test_r2_un_puesto_de_planta_SI_lleva_ciudad_y_tambien_sin_ella():
    """Las dos: el ancla en el texto SUGIERE y no filtra, asi que puede tanto
    ayudar como esconder a quien no escribio la ciudad en su perfil."""
    cs = consultas_de_m5("Nemak", ["Jefe de Mantenimiento"],
                         ciudad="Garcia", pais="Mexico")
    con = [t for t in _textos(cs) if "Garcia" in t]
    sin = [t for t in _textos(cs) if "Garcia" not in t]
    assert con and sin, _textos(cs)
    assert all("R2" not in c["reglas"] for c in cs)


def test_r2_reconoce_las_cuatro_familias_de_palabra():
    for w in ("Global", "Corporate", "Regional", "Nacional"):
        assert es_nivel_corporativo(f"{w} Purchasing Manager") == w.lower(), w
    # Y con acento o sin el: se compara sobre texto normalizado.
    assert es_nivel_corporativo("Gerente Nacional de Mantenimiento")
    assert es_nivel_corporativo("Jefe de Planta") == ""


def test_r2_no_pega_dentro_de_otra_palabra():
    """«Globalization Manager» no es un puesto corporativo de planta, y
    «nacionalidad» tampoco. La palabra va con frontera."""
    assert es_nivel_corporativo("Globalization Specialist") == ""
    assert es_nivel_corporativo("Internacionalizacion Lead") == ""


def test_r2_las_palabras_de_nivel_estan_declaradas_sin_acento():
    """Se comparan contra texto normalizado: una con acento nunca pegaria."""
    for w in PALABRAS_DE_NIVEL_CORPORATIVO:
        assert w == w.lower() and w.isascii(), w


# ------------------------------------------------------------------------ R3
def test_r3_caza_las_siglas_como_M2_las_escribe():
    assert siglas_del_puesto("Head of GWP Projects LOM") == ["GWP", "LOM"]
    assert siglas_del_puesto("NPI & Industrial Engineering Manager") == ["NPI"]
    # `IntlRME` es como Amazon escribe la suya: dos mayusculas, no todas.
    assert "IntlRME" in siglas_del_puesto("Sr Manager IntlRME")
    assert siglas_del_puesto("Gerente de Planta") == []


def test_r3_expande_solo_lo_que_M2_cosecho():
    """Una sigla sin expansion cosechada NO se toca: inventarle una seria
    inventar vocabulario, y el motor no hace eso."""
    puesto = "Head of GWP Projects LOM"
    assert expandir_siglas(puesto, {}) == puesto
    assert expandir_siglas(puesto, {"GWP": "Global Workplace Projects"}) == (
        "Head of Global Workplace Projects Projects LOM")


def test_r3_emite_la_literal_Y_la_expandida():
    cs = consultas_de_m5("LEGO", ["Head of GWP Projects LOM"],
                         pais="Mexico",
                         siglas_de_la_casa={"GWP": "Global Workplace Projects",
                                            "LOM": "LEGO Operaciones de Mexico"})
    con_sigla = [t for t in _textos(cs) if "GWP" in t]
    expandida = [t for t in _textos(cs) if "Global Workplace Projects" in t]
    assert con_sigla, "se perdio la forma literal"
    assert expandida, "no emitio la forma expandida"
    assert any("R3" in c["reglas"] for c in cs)


def test_r3_sin_siglas_no_duplica():
    cs = consultas_de_m5("LEGO", ["Gerente de Planta"], pais="Mexico",
                         siglas_de_la_casa={"GWP": "Global Workplace Projects"})
    assert len(_textos(cs)) == len(set(_textos(cs)))
    assert all("R3" not in c["reglas"] for c in cs)


# ------------------------------------------------------------------------ R4
def test_r4_pregunta_con_todos_los_nombres_de_la_empresa():
    """Navistar / International Motors. El repo ya pago este error una vez: el
    barrido de huecos del 28-sep perdio los 120 MDD de esa cuenta buscando
    «International» donde el repo dice «Navistar»."""
    cs = consultas_de_m5("Navistar", ["Maintenance Manager"], pais="Mexico",
                         alias_de_empresa=["International Motors"])
    assert any("Navistar" in t for t in _textos(cs))
    assert any("International Motors" in t for t in _textos(cs))
    con_alias = [c for c in cs if c["nombre"] == "International Motors"]
    assert con_alias and all("R4" in c["reglas"] for c in con_alias)


def test_r4_el_nombre_legal_NO_se_marca_como_alias():
    cs = consultas_de_m5("Navistar", ["Plant Manager"], pais="Mexico",
                         alias_de_empresa=["International Motors"])
    propias = [c for c in cs if c["nombre"] == "Navistar"]
    assert propias and all("R4" not in c["reglas"] for c in propias)


def test_r4_un_alias_igual_al_nombre_no_duplica():
    cs = consultas_de_m5("Metalsa", ["Plant Manager"], pais="Mexico",
                         alias_de_empresa=["METALSA", "  metalsa "])
    assert len({c["nombre"] for c in cs}) == 1


# ---------------------------------------------------------------- las formas
def test_las_tres_formas_de_m5_salen_de_catalogo_no_de_aqui():
    """Si manana cambia `catalogo.FORMAS_M5`, el motor se mueve con ella."""
    mx = consultas_de_m5("X", ["Plant Manager"], pais="Mexico")
    eu = consultas_de_m5("X", ["Plant Manager"], pais="Estados Unidos")
    assert any("mx.linkedin.com/in" in t for t in _textos(mx))
    assert not any("mx.linkedin.com/in" in t for t in _textos(eu)), (
        "la forma mexicana se disparo en una planta que no esta en Mexico")


def test_ninguna_consulta_se_repite():
    cs = consultas_de_m5("LEGO", ["Head of GWP Projects LOM",
                                  "Global Sourcing Manager",
                                  "Gerente de Planta"],
                         ciudad="Monterrey", pais="Mexico",
                         alias_de_empresa=["LEGO Group", "LEGO"],
                         siglas_de_la_casa={"GWP": "Global Workplace Projects"})
    t = _textos(cs)
    assert len(t) == len(set(t)), "el motor emitio la misma consulta dos veces"


def test_cada_consulta_dice_por_que_existe():
    cs = consultas_de_m5("X", ["Global Purchasing Manager"], ciudad="Y",
                         pais="Mexico")
    for c in cs:
        assert c["por_que"] and len(c["por_que"]) > 20, c


def test_se_puede_decir_cuanto_cuesta_cada_regla():
    """El costo es el argumento en contra de las reglas, asi que tiene que ser
    medible y no una impresion."""
    cs = consultas_de_m5("Navistar", ["Global Purchasing Performance Manager",
                                      "Jefe de Mantenimiento"],
                         ciudad="Escobedo", pais="Mexico",
                         alias_de_empresa=["International Motors"])
    cuenta = cuantas_agrega_cada_regla(cs)
    assert cuenta["R1"] > 0 and cuenta["R2"] > 0 and cuenta["R4"] > 0
    assert sum(1 for c in cs) >= cuenta["R2"]


# -------------------------------------------------- lo que la medicion dio
# Los DOS casos que las reglas rescataron de verdad, de los ocho que se
# reprobaron en LEGO, Bimbo y Nemak el 30-sep-2026. Se guardan como constancia
# de que el rendimiento se midio y NO fue de ocho de ocho.
RESCATADOS_POR_LAS_REGLAS = (
    ("Nemak", "Global Purchasing Performance Manager", ("R1", "R2")),
    ("LEGO", "Head of GWP Projects LOM", ("R3",)),
)
NO_RESCATADOS = (
    ("LEGO", "Sr. Operations Facilities Manager"),
    ("LEGO", "NPI & Industrial Engineering Manager"),
    ("LEGO", "Strategic sourcing specialist"),
    ("Bimbo", "Gerente Nacional de Construccion y Mantenimiento"),
    ("Bimbo", "CAPEX Global Procurement Director"),
    ("Nemak", "Capex Control Leader"),
)


def test_el_rendimiento_medido_queda_escrito_y_es_dos_de_ocho():
    """No es una prueba de comportamiento: es constancia.

    Si alguien lee «R1 rinde 9 de 12» en el issue de #355 y no encuentra donde
    se midio, va a suponer que se aplico y funciono. Se aplico y rescato DOS de
    los ocho que se reprobaron. Las reglas valen -- y ademas trajeron contactos
    de valor que el humano no tenia-- pero el numero es dos.
    """
    assert len(RESCATADOS_POR_LAS_REGLAS) == 2
    assert len(NO_RESCATADOS) == 6
    assert len(RESCATADOS_POR_LAS_REGLAS) + len(NO_RESCATADOS) == 8


def test_las_reglas_que_rescataron_generan_la_consulta_que_lo_hizo():
    """La consulta que trajo al de Nemak tiene que salir del motor hoy."""
    cs = consultas_de_m5("Nemak", ["Global Purchasing Performance Manager"],
                         ciudad="Garcia", pais="Mexico")
    esperada = ('site:linkedin.com/in "Global Purchasing Performance Manager" '
                'Nemak')
    assert esperada in _textos(cs), _textos(cs)
    # Y la de LEGO, con la sigla expandida.
    cs2 = consultas_de_m5("LEGO", ["Head of GWP Projects LOM"],
                          ciudad="Monterrey", pais="Mexico",
                          siglas_de_la_casa={
                              "GWP": "Global Workplace Projects"})
    assert any("Global Workplace Projects" in t for t in _textos(cs2))
