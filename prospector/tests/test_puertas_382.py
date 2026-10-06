"""Dos puertas por planta nueva, y la identidad de grupo (#382).

LO QUE ESTAS PRUEBAS FIJAN, y cada una viene de un error que se puede cometer:

  1. la fase de obra se LEE del texto y no se deduce. Tres casos de la corrida del
     5-oct nombran dos fases a la vez y los tres se clasifican bien solo con la
     precedencia correcta; una nota que no nombra ninguna NO se lee como anuncio.
  2. la puerta del EPC se cierra cuando la planta se inaugura, y la del usuario se
     abre ahi. Si las dos estuvieran abiertas siempre, el radar seguiria mandando a
     buscar al usuario mientras el que compra es el constructor.
  3. la ventana del usuario va AL REVES de la frescura: vale mas a los 14 meses que
     el dia de la inauguracion.
  4. `relacion_de_grupo` y `trabajo_via_canal` son DISTINTAS. Arca no es una
     division de Ecolab; es una planta que FTS intervino cobrandole a Ecolab.
     Fundirlas haria que la carta dijera «somos proveedores de tu corporativo» a
     quien no lo es.
"""
import re
import json
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from flujo import puertas as P                                     # noqa: E402
from flujo.radar import (FASE_ANUNCIO, FASE_INAUGURADA,            # noqa: E402
                         FASE_OBRA_ARRANCADA, FUERZA_DE_FUENTE,
                         TIPO_POR_OMISION_DE_FUENTE, cargar_catalogo,
                         fase_de_obra)
from flujo.ubicacion_de_proyectos import (relacion_de_grupo,        # noqa: E402
                                          trabajo_via_canal)

CAT = cargar_catalogo()
HOY = date(2026, 10, 7)


def _s(**kw):
    base = {"empresa": "Acme", "planta": "Monterrey", "fecha": "2026-09-01",
            "texto": "nueva planta", "giro": "metalmecanica",
            "fuente": "prensa_industrial"}
    base.update(kw)
    return base


# ------------------------------------------------------- 1 · la fase se lee
def test_las_tres_fases_se_leen_del_texto():
    assert fase_de_obra("inaugura su segunda planta")[0] == FASE_INAUGURADA
    assert fase_de_obra("arranca la construccion de su primera planta")[0] == \
        FASE_OBRA_ARRANCADA
    assert fase_de_obra("invertira 330 millones en nueva planta")[0] == FASE_ANUNCIO


def test_los_tres_casos_mixtos_de_la_corrida_se_clasifican_bien():
    # Ecocab: «inicia construccion ... arranque de operaciones en enero de 2027».
    # Hoy nombra UNA sola fase, y es la correcta. Este caso se escribio el 7-oct
    # esperando que «arranque de operaciones» apareciera en `otras`; esa misma
    # tarde ese termino salio del vocabulario de FASE_INAUGURADA porque en
    # Yokohama («arranque de operaciones en el segundo trimestre de 2028») hacia
    # pasar por inaugurada una planta que no existe. El efecto colateral aqui es
    # una mejora: la nota de Ecocab habla de una sola fase --la obra arrancada--
    # y el aviso de «nombra mas de una fase» ya no se emite para ella.
    f, _, otras = fase_de_obra("inicia construccion de su tercera planta; arranque "
                               "de operaciones en enero de 2027")
    assert f == FASE_OBRA_ARRANCADA and otras == []
    # NIFCO Apodaca: «invertira 85 MDD ... y coloca la primera piedra». Con «la
    # primera gana» saldria anuncio, que subestima: la obra ya arranco.
    f, _, otras = fase_de_obra("invertira 85 millones de dolares en nueva planta y "
                               "coloca la primera piedra")
    assert f == FASE_OBRA_ARRANCADA and FASE_ANUNCIO in otras
    # NIFCO Chihuahua: solo inaugura.
    f, _, otras = fase_de_obra("inaugura su segunda planta en Chihuahua")
    assert f == FASE_INAUGURADA and not otras


def test_una_frase_de_FUTURO_no_es_una_obra_arrancada():
    """Yokohama dice «inicio de construccion en el tercer trimestre de 2026». Es un
    anuncio con calendario, no una obra arrancada, y meter el sustantivo en el
    vocabulario lo volveria lo segundo."""
    f, _, _ = fase_de_obra("invertira 115 mdd en su segunda planta; inicio de "
                           "construccion en el tercer trimestre de 2026")
    assert f == FASE_ANUNCIO


def test_un_arranque_de_operaciones_FUTURO_no_es_una_inauguracion():
    """El caso Yokohama, hallado al mirar la salida del 7-oct antes de publicarla.

    Su nota dice «invertira 115 mdd ... arranque de operaciones en el segundo
    trimestre de 2028» y salia `inaugurada`, con la puerta del usuario ABIERTA y «4.6
    meses de inaugurada», cuando la planta no existe. Es el mismo error de futuro que
    ya se habia cerrado con `inicio de construccion`, un tramo mas arriba."""
    f, _, _ = fase_de_obra("invertira 115 millones de dolares en su segunda planta; "
                           "inicio de construccion en el tercer trimestre de 2026 y "
                           "arranque de operaciones en el segundo trimestre de 2028")
    assert f == FASE_ANUNCIO, f
    p = P.puertas_de(_s(empresa="Yokohama", texto=
        "invertira 115 millones de dolares en su segunda planta de llantas; "
        "arranque de operaciones en el segundo trimestre de 2028",
        fecha="2026-05-21"), CAT, hoy=HOY)
    q = {x["puerta"]: x for x in p["puertas"]}
    assert q[P.PUERTA_USUARIO]["estado"] == P.FUTURA, (
        "la puerta del usuario no puede estar abierta en una planta que no existe")
    assert q[P.PUERTA_EPC]["estado"] == P.ABIERTA


def test_una_nota_sin_fase_no_se_lee_como_anuncio():
    """Paso con Nemak: «amplia su planta con nueva linea» no dice en que momento
    esta la obra, y la version anterior afirmaba «el EPC puede no estar elegido»."""
    f, _, _ = fase_de_obra("amplia su planta de Garcia con nueva linea de produccion")
    assert f == ""
    p = P.puertas_de(_s(empresa="Sin Fase", texto="nueva planta de produccion"),
                     CAT, hoy=HOY)
    epc = [q for q in p["puertas"] if q["puerta"] == P.PUERTA_EPC][0]
    assert epc["estado"] == P.DESCONOCIDA
    assert epc["puntos_de_oportunidad"] == 0


# ------------------------------------------------ 2 · las puertas se turnan
def test_obra_arrancada_abre_la_del_epc_y_deja_futura_la_del_usuario():
    p = P.puertas_de(_s(texto="arranca la construccion de su primera planta",
                        fecha="2026-08-11"), CAT, hoy=HOY)
    q = {x["puerta"]: x for x in p["puertas"]}
    assert q[P.PUERTA_EPC]["estado"] == P.ABIERTA
    assert q[P.PUERTA_USUARIO]["estado"] == P.FUTURA


def test_inaugurada_cierra_la_del_epc_y_abre_la_del_usuario():
    p = P.puertas_de(_s(texto="inaugura su nueva planta", fecha="2026-09-25"),
                     CAT, hoy=HOY)
    q = {x["puerta"]: x for x in p["puertas"]}
    assert q[P.PUERTA_EPC]["estado"] == P.CERRADA
    assert q[P.PUERTA_EPC]["puntos_de_oportunidad"] == 0
    assert q[P.PUERTA_USUARIO]["estado"] == P.ABIERTA


def test_coficab_durango_es_el_caso_de_aceptacion_de_la_decision_1():
    """Inaugurada hace 10 meses: el EPC se fue y el usuario esta en su ventana."""
    p = P.puertas_de(_s(empresa="Coficab", planta="Durango", fecha="2025-12-08",
                        texto="nave nueva con carga de enfriamiento; inversion de "
                              "60 MDD; inauguracion",
                        giro="arneses cableado automotriz"), CAT, hoy=HOY)
    q = {x["puerta"]: x for x in p["puertas"]}
    assert p["fase"] == FASE_INAUGURADA
    assert q[P.PUERTA_EPC]["estado"] == P.CERRADA
    u = q[P.PUERTA_USUARIO]
    assert u["estado"] == P.ABIERTA
    assert 9 <= u["meses_desde_la_inauguracion"] <= 11
    assert u["puntos_de_oportunidad"] == 18, (
        "a 10 meses cae en el tramo de 6 a 12: ya aparece lo que el EPC no alcanzo")


def test_una_senal_que_no_es_obra_nueva_no_emite_puertas_de_obra():
    p = P.puertas_de(_s(texto="invierte en mejorar su eficiencia energetica"),
                     CAT, hoy=HOY)
    assert p["es_obra_nueva"] is False
    assert not [q for q in p["puertas"]
                if q["puerta"] in (P.PUERTA_EPC, P.PUERTA_USUARIO)]


def test_equipo_dentro_de_una_planta_que_ya_opera_le_vende_al_usuario_hoy():
    """El caso Martinrea: 50 MDD en una prensa, una linea de perfilado y celdas de
    automatizacion dentro de una planta corriendo. No es obra nueva, no hay EPC, y
    la version anterior lo dejaba sin UNA SOLA puerta -- o sea sin interlocutor--."""
    p = P.puertas_de(_s(empresa="Martinrea", planta="Silao",
                        texto="amplia su planta con una prensa de 3,000 toneladas, "
                              "una linea de perfilado y celdas de automatizacion",
                        giro="metalmecanica estampado"), CAT, hoy=HOY)
    assert p["es_obra_nueva"] is False
    q = [x for x in p["puertas"] if x["puerta"] == P.PUERTA_USUARIO_DIRECTO]
    assert q, "una senal con comprador y sin obra nueva tiene que emitir su puerta"
    assert q[0]["estado"] == P.ABIERTA
    assert "No hay EPC de por medio" in q[0]["por_que"]
    # y NO emite las puertas de obra, que no existen aqui
    assert not [x for x in p["puertas"]
                if x["puerta"] in (P.PUERTA_EPC, P.PUERTA_USUARIO)]


def test_el_epc_sin_identificar_trae_como_buscarlo_y_lo_grita():
    p = P.puertas_de(_s(texto="arranca la construccion de su primera planta"),
                     CAT, hoy=HOY)
    epc = [q for q in p["puertas"] if q["puerta"] == P.PUERTA_EPC][0]
    # El «por identificar» ahora dice QUE se busca -- un EPC o un contratista
    # general--, porque en una ampliacion no es lo mismo y no se busca igual.
    assert epc["interlocutor"] == "POR IDENTIFICAR (EPC)"
    assert "constructora" in epc["como_identificarlo"]
    assert any("no sabemos quien es" in a for a in p["avisos"])


def test_un_epc_identificado_viaja_como_interlocutor():
    p = P.puertas_de(_s(texto="arranca la construccion de su planta",
                        epc="Constructora Ejemplo"), CAT, hoy=HOY)
    epc = [q for q in p["puertas"] if q["puerta"] == P.PUERTA_EPC][0]
    assert epc["interlocutor"] == "Constructora Ejemplo"
    assert not epc["como_identificarlo"]
    assert "las demas obras" in epc["y_ademas"]


# --------------------------------- 3 · la ventana del usuario va al reves
def test_la_ventana_del_usuario_vale_mas_a_los_catorce_meses_que_el_primer_dia():
    recien, _ = P._puntos_del_usuario(0.3)
    medio, _ = P._puntos_del_usuario(8)
    dulce, _ = P._puntos_del_usuario(14)
    cerrada, _ = P._puntos_del_usuario(20)
    assert recien < medio < dulce, (
        "la puerta del usuario tiene que VALER MAS con el tiempo: una planta recien "
        "inaugurada esta digiriendo la obra")
    assert cerrada == 0 and P.MESES_DE_LA_VENTANA_DEL_USUARIO == 18


def test_a_los_doce_dias_lo_dice_en_dias_y_no_en_cero_meses():
    _, por_que = P._puntos_del_usuario(12 / P.DIAS_POR_MES)
    assert "dia(s)" in por_que and "a 0 mes" not in por_que


def test_las_formas_de_inaugura_que_el_emparejado_no_veia():
    """`inaugura planta` no caza «inaugura su planta»: el emparejado es por
    adyacencia literal. En la corrida del 5-oct no se noto porque las dos
    inauguraciones entraron por otros terminos -- funcionaron por casualidad-- y la
    DECISION 1 lo destapo: una inauguracion que no se reconoce no emite puertas."""
    from flujo.radar import tipos_que_nombra
    for t in ("inaugura su planta de Monterrey", "inauguro su planta",
              "inauguracion de su planta", "inaugura su nave"):
        assert tipos_que_nombra(t), t
    p = P.puertas_de(_s(texto="inaugura su planta de Monterrey",
                        fecha="2026-09-25"), CAT, hoy=HOY)
    assert p["es_obra_nueva"]
    q = {x["puerta"]: x for x in p["puertas"]}
    assert q[P.PUERTA_USUARIO]["estado"] == P.ABIERTA


def test_la_ventana_se_declara_como_criterio_y_no_como_medicion():
    p = P.puertas_de(_s(texto="inaugura su planta", fecha="2026-09-25"), CAT, hoy=HOY)
    u = [q for q in p["puertas"] if q["puerta"] == P.PUERTA_USUARIO][0]
    assert "CRITERIO" in u["de_donde_sale_la_ventana"]
    assert "Esteban" in u["de_donde_sale_la_ventana"]


# ------------------------------------- 4 · las dos identidades, separadas
def test_ecolab_y_nalco_son_la_misma_empresa():
    for e in ("Ecolab", "Nalco", "Nalco Water", "Nalco de Mexico",
              "Ecolab de Mexico"):
        assert relacion_de_grupo(e).get("grupo") == "Ecolab", e


def test_una_senal_de_ecolab_es_expansion_lateral_y_no_cuenta_fria():
    p = P.puertas_de(_s(empresa="Ecolab", texto="anuncia nueva planta de "
                        "especialidades", giro="quimicos"), CAT, hoy=HOY)
    lat = [q for q in p["puertas"] if q["puerta"] == P.PUERTA_LATERAL][0]
    assert lat["la_relacion_existente_es_con"] == "Ecolab"
    assert lat["tipo_de_relacion"] == "canal_hacia_clientes"
    assert lat["lo_que_NO_se_puede_decir"]
    assert any("OTRA division" in a for a in p["avisos"])


def test_arca_NO_es_una_division_de_ecolab_pero_si_una_planta_intervenida():
    """La distincion que una sola tabla habria borrado."""
    assert relacion_de_grupo("Arca Continental") == {}
    c = trabajo_via_canal("Arca Continental")
    assert c.get("canal") == "Ecolab / Nalco"


def test_nemak_y_ragasa_estan_en_el_piloto_como_descubrimiento_y_no_lo_son():
    """Es el punto ciego de #361 con nombre: sus leads cuelgan del canal."""
    for e in ("Nemak", "Ragasa"):
        c = trabajo_via_canal(e)
        # Nemak llega por DOS canales -- Nalco y ChemTreat--, hallado el 7-oct al
        # buscar por nombre de lead y no por partner de la cuenta.
        assert "Nalco" in c.get("canal", ""), e
        assert "piloto" in (c.get("ojo") or ""), e
    assert "ChemTreat" in trabajo_via_canal("Nemak")["canal"]
    assert trabajo_via_canal("Caterpillar").get("canal") == "ChemTreat (Veolia)"
    p = P.puertas_de(_s(empresa="Nemak", planta="Garcia", texto="amplia su planta "
                        "con nueva nave"), CAT, hoy=HOY)
    via = [q for q in p["puertas"] if q["puerta"] == P.PUERTA_VIA_CANAL][0]
    assert via["estado"] == P.ABIERTA
    assert "NO es una cuenta fria" in via["por_que"]
    assert any("partner_id no los ve" in a for a in p["avisos"])


def test_una_cuenta_sin_relacion_declarada_no_inventa_ninguna():
    p = P.puertas_de(_s(empresa="Waelzholz",
                        texto="arranca la construccion de su primera planta"),
                     CAT, hoy=HOY)
    assert not [q for q in p["puertas"]
                if q["puerta"] in (P.PUERTA_LATERAL, P.PUERTA_VIA_CANAL)]


# ------------------------------------------- la fuente de los constructores
def test_la_fuente_del_constructor_existe_y_pesa_menos_que_una_convocatoria():
    assert FUERZA_DE_FUENTE["constructor_o_epc"] == 20
    assert (FUERZA_DE_FUENTE["constructor_o_epc"]
            < FUERZA_DE_FUENTE["convocatoria"]), (
        "una convocatoria compromete a comprar y tiene fecha de cierre; el boletin "
        "de un constructor anuncia metros cuadrados")
    assert (FUERZA_DE_FUENTE["constructor_o_epc"]
            > FUERZA_DE_FUENTE["prensa_industrial"])
    assert TIPO_POR_OMISION_DE_FUENTE["constructor_o_epc"] == "obra_nueva"


def test_el_archivo_de_consultas_trae_la_familia_de_constructores_y_la_geografia():
    d = json.loads((RAIZ / "datos" / "consultas_senal.json").read_text("utf-8"))
    assert d["version"] == 2
    f5 = [f for f in d["familias"] if f["clave"] == "F5_constructores_y_epc"]
    assert f5 and f5[0]["desarrolladores_de_nave"]
    for quien in ("Vesta", "Fibra Macquarie", "Prologis"):
        assert quien in f5[0]["desarrolladores_de_nave"], quien
    # DECISION 4: la geografia expandida
    for estado in ("Tamaulipas", "Chihuahua", "Sonora", "Guanajuato", "Queretaro",
                   "San Luis Potosi", "Aguascalientes", "Durango"):
        todos = (d["geografia"]["noreste"] + d["geografia"]["segundo_anillo"]
                 + d["geografia"]["bajio"])
        assert estado in todos, estado
    assert d["ventanas"]["descubrimiento_dias"] == 180
    assert d["ventanas"]["puerta_usuario_meses"] == 18
    assert d["ventanas"]["presupuesto_de_consultas"] == 150


# ------------------------- 8 · la constancia no se escribe a mano
def test_la_constancia_de_la_corrida_ES_el_recalculo_de_los_modulos():
    """El defecto de los numeros a mano, cerrado con una prueba.

    Esta corrida lo cometio dos veces en un dia: el libro de consultas del 5-oct
    decia 20 cuando se gastaron 38, y el resumen del 7-oct siguio diciendo
    «inaugurada 7 / puerta de usuario abierta 7» despues de que Yokohama dejara de
    ser una inauguracion. Los dos se hallaron leyendo la salida, no la suite.

    Entonces: cada parte derivada del archivo --el puntaje, las puertas, la fase,
    los dias, y TODOS los conteos del resumen-- tiene que ser identica a lo que
    `flujo.radar` y `flujo.puertas` producen hoy. Si alguien edita un numero a
    mano, o si cambia el evaluador y no se vuelve a sellar, esta prueba truena.
    """
    from herramientas.sellar_constancia_puertas import CONSTANCIA, recalcular
    en_disco = json.load(open(CONSTANCIA, encoding="utf-8"))
    recalculada = recalcular(en_disco)
    assert en_disco["consultas_gastadas"] == len(en_disco["consultas"]), (
        "el libro de consultas no empata con lo que dice haber gastado")
    assert en_disco["version_de_la_herramienta"] == \
        recalculada["version_de_la_herramienta"], (
            "la constancia declara una version de la herramienta que no es la de hoy")
    assert en_disco["resumen"] == recalculada["resumen"], (
        "el resumen tiene numeros que los modulos no producen; corre "
        "herramientas/sellar_constancia_puertas.py --escribir")
    for a, b in zip(en_disco["evaluadas"], recalculada["evaluadas"]):
        assert a["eval"] == b["eval"], f"el puntaje de {a['empresa']} esta a mano"
        assert a["puertas"] == b["puertas"], f"las puertas de {a['empresa']} estan a mano"


def test_la_constancia_de_puertas_no_lleva_datos_personales():
    """La misma reja del 5-oct, sobre el archivo nuevo.

    No se duplica el detector: se importa el del 5-oct con su lista de lugares y
    medios, porque una reja apagada en un archivo y encendida en el otro es una
    reja que no sirve.
    """
    from tests.test_corrida_radar_369 import _CORREO, _TRES, NO_SON_PERSONAS
    from herramientas.sellar_constancia_puertas import CONSTANCIA
    crudo = open(CONSTANCIA, encoding="utf-8").read()
    sin_ligas = re.sub(r'https?://[^\s"]+', "", crudo)
    assert not _CORREO.findall(sin_ligas), "hay un correo en la constancia"
    assert not re.findall(r"\b\d{3}[- ]?\d{3}[- ]?\d{4}\b", sin_ligas), "hay un telefono"
    sospechosos = [m for m in _TRES.findall(sin_ligas)
                   if not any(b in m or m in b for b in NO_SON_PERSONAS)]
    assert not sospechosos, (
        f"algo parece un nombre de persona: {sospechosos}. Si es un lugar, un medio "
        "o una razon social, agregalo a NO_SON_PERSONAS; si es una persona, sacalo")


# --------------- 9 · la fase describe el dia de la nota, no el dia de hoy
def test_una_obra_arrancada_HACE_DOS_ANOS_no_tiene_al_EPC_en_sitio():
    """El caso Doosan Bobcat, hallado leyendo la salida del 7-oct.

    Primera piedra el 13-jun-2024: 846 dias. La puerta del EPC salia «ABIERTA · 25
    -- hay un EPC comprando especialidad AHORA--», que es falso dos veces: la obra
    de 65,000 m2 ya termino, y la nota misma decia que arrancaba operaciones a
    principios de 2026.

    Es el defecto de Yokohama por el otro lado. Ahi una frase de FUTURO ponia la
    obra en el pasado; aqui una fecha VIEJA la deja en el presente.
    """
    s = _s(empresa="Doosan Bobcat", fecha="2024-06-13",
               texto="inicia construccion de su planta de manufactura de 65,000 "
                     "metros cuadrados con inversion de 300 millones de dolares")
    p = P.puertas_de(s, hoy=HOY)
    assert p["fase"] == FASE_OBRA_ARRANCADA, "la fase del texto no cambia"
    epc = next(q for q in p["puertas"] if q["puerta"] == P.PUERTA_EPC)
    assert epc["estado"] == P.DESCONOCIDA and epc["puntos_de_oportunidad"] == 0.0
    assert "ya entrego y se fue" in epc["por_que"]
    # Y la del usuario NO se declara futura: decir «futura» seria afirmar que la
    # planta todavia no existe, y de eso no hay fuente. Tampoco se declara abierta:
    # inventar la inauguracion es el error de Coficab/Pesqueria.
    u = next(q for q in p["puertas"] if q["puerta"] == P.PUERTA_USUARIO)
    assert u["estado"] == P.DESCONOCIDA and u["puntos_de_oportunidad"] == 0.0


def test_una_obra_arrancada_RECIENTE_si_tiene_al_EPC_en_sitio():
    """La reja no se come el caso normal: a 57 dias el EPC esta comprando."""
    s = _s(empresa="Waelzholz", fecha="2026-08-11",
               texto="arranca la construccion de su primera planta en Mexico")
    epc = next(q for q in P.puertas_de(s, hoy=HOY)["puertas"]
               if q["puerta"] == P.PUERTA_EPC)
    assert epc["estado"] == P.ABIERTA and epc["puntos_de_oportunidad"] == 25.0


# ====================================================================
# Las cuatro decisiones del 6-oct sobre #382
# ====================================================================

def test_los_dos_criterios_confirmados_siguen_dichos_como_criterios():
    """Esteban confirmo el tope de obra y la ventana del usuario el 6-oct.

    Confirmar un criterio NO lo vuelve una medicion, y el dia que el lazo 3 tenga
    cierres que lo contradigan tiene que poder moverlo. Asi que el modulo sigue
    obligado a decir que son criterios declarados y de quien son.
    """
    fuente = (RAIZ / "flujo" / "puertas.py").read_text(encoding="utf-8")
    assert P.MESES_MAXIMOS_DE_OBRA == 24
    assert P.MESES_DE_LA_VENTANA_DEL_USUARIO == 18
    for cte in ("cuanto dura una obra antes de que el EPC se vaya",
                "la ventana del usuario"):
        i = fuente.index(cte)
        bloque = fuente[i:i + 700]
        assert "2026-10-06" in bloque, cte
        assert "CRITERIO" in bloque and "NO MEDICION" in bloque, cte
        assert "lazo 3" in bloque, cte
    # Y el comentario de los 30.44 dias vuelve a estar en su constante: al insertar
    # el tope de obra el 5-oct se quedo colgado de MESES_MAXIMOS_DE_OBRA, diciendo
    # «promedio del anio gregoriano» de un numero de meses.
    assert "DIAS_POR_MES = 30.44  # promedio del anio gregoriano" in fuente
    assert "MESES_MAXIMOS_DE_OBRA = 24\n" in fuente


def test_una_ampliacion_con_superficie_abre_la_puerta_del_CONTRATISTA():
    """Decision 2: «Hyundai WIA: abre la puerta A. Una ampliacion de 31,350 m2
    lleva contratista general»."""
    s = _s(empresa="Hyundai WIA", planta="Nuevo Leon", fecha="2026-04-10",
           giro="motores automotriz",
           texto="invertira 35 millones de dolares en Nuevo Leon para manufactura de "
                 "motores hibridos, con ampliacion de 31,350 metros cuadrados de "
                 "nuevo espacio")
    r = P.puertas_de(s, hoy=HOY)
    assert r.get("es_ampliacion") is True and r["es_obra_nueva"] is False
    cuales = {q["puerta"]: q for q in r["puertas"]}
    # La puerta del contratista, abierta, y nombrada como lo que es.
    a = cuales[P.PUERTA_EPC]
    assert a["estado"] == P.ABIERTA and a["quien_construye"] == "contratista general"
    assert "contratista general" in a["interlocutor"]
    # Y la del usuario esta abierta HOY, no «futura»: la planta ya opera.
    assert cuales[P.PUERTA_USUARIO_DIRECTO]["estado"] == P.ABIERTA
    assert P.PUERTA_USUARIO not in cuales, (
        "una ampliacion no tiene puerta de usuario FUTURA: el usuario ya esta ahi")


def test_una_ampliacion_SIN_superficie_no_es_obra():
    """Martinrea amplia su planta con una prensa y dos lineas. Eso es equipo, y no
    hay contratista de obra: la reja tiene que distinguirlo de Hyundai."""
    s = _s(empresa="Martinrea", planta="Silao, Gto.", fecha="2026-09-30",
           texto="amplia su planta con inversion de 50 millones de dolares; "
                 "instalacion de una prensa SIMPAC de 3,000 toneladas, una linea de "
                 "perfilado Samco y celdas de automatizacion")
    r = P.puertas_de(s, hoy=HOY)
    assert not r.get("es_ampliacion")
    assert {q["puerta"] for q in r["puertas"]} == {P.PUERTA_USUARIO_DIRECTO}


def test_una_obra_de_entidad_publica_se_concursa_y_no_abre_las_otras_puertas():
    """Decision 2: «CFE: NO abras puerta A. Sale a licitacion publica»."""
    s = _s(empresa="CFE Nuevo Leon", planta="varias, N.L.", fecha="2026-08-19",
           giro="generacion y transmision electrica",
           texto="invertira 8 mil 900 millones de pesos en Nuevo Leon para construir "
                 "cuatro subestaciones electricas nuevas y ampliar la capacidad de "
                 "diez instalaciones mas, con incremento de 140 MVA")
    r = P.puertas_de(s, hoy=HOY)
    assert r.get("es_compra_publica") is True
    cuales = {q["puerta"] for q in r["puertas"]}
    assert cuales == {P.PUERTA_LICITACION}, (
        f"una obra publica no abre puerta de EPC ni de usuario: {cuales}")
    q = next(x for x in r["puertas"] if x["puerta"] == P.PUERTA_LICITACION)
    # El angulo que Esteban dicto, con sus dos piezas.
    assert "padron" in q["angulo"] and "CompraNet" in q["angulo"]
    # Y lo que NO se puede decir, porque es el error que esta puerta evita.
    assert "gerente" in q["lo_que_NO_se_puede_decir"]
    # La segunda via, que si es una venta normal.
    assert "subcontratista" in q["la_segunda_via"]


def test_una_empresa_privada_no_se_vuelve_publica_por_las_letras():
    for quien in ("Daikin", "Grupo Cementos Chihuahua", "Pacifico", "Cifunsa"):
        assert P.entidad_de_compra_publica(quien) == "", quien


def test_la_busqueda_del_constructor_pregunta_PRIMERO_por_el_parque():
    """Decision 3: la medicion del 5-oct dijo que el parque es lo unico que contesta."""
    con = P.puertas_de(_s(empresa="Waelzholz", planta="Ramos Arizpe, Coah.",
                          parque="Parque Industrial Amistad",
                          texto="arranca la construccion de su primera planta"),
                       hoy=HOY)
    a = next(q for q in con["puertas"] if q["puerta"] == P.PUERTA_EPC)
    assert a["como_identificarlo"].startswith("POR EL PARQUE")
    assert "Parque Industrial Amistad" in a["como_identificarlo"]
    # Sin parque, la primera tarea es sacarlo, no preguntar por el constructor.
    sin = P.puertas_de(_s(empresa="Yokohama Rubber", planta="Saltillo, Coah.",
                          texto="invertira 115 millones en su segunda planta"),
                       hoy=HOY)
    b = next(q for q in sin["puertas"] if q["puerta"] == P.PUERTA_EPC)
    assert "no nombra el parque" in b["como_identificarlo"]
    assert "parque industrial" in b["como_identificarlo"]


def test_el_parque_de_cada_senal_esta_EN_LA_FUENTE_y_no_en_mi_memoria():
    """Decision 3 pide el parque «si la nota lo dice». Esta reja verifica el «si».

    Lo escribi a mano leyendo las 23 notas, y una casilla escrita de memoria es
    exactamente el defecto que este repo persigue. La regla es literal: el nombre del
    parque -- lo que va antes del parentesis, que es solo una aclaracion de donde
    queda-- tiene que aparecer TAL CUAL en el texto de la senal o en el nombre de la
    planta. Las dos cosas vienen de la fuente; mi memoria no.
    """
    from herramientas.sellar_constancia_puertas import CONSTANCIA
    from flujo.catalogo_proyectos import plano
    c = json.load(open(CONSTANCIA, encoding="utf-8"))
    sin_respaldo, con_parque = [], 0
    for e in c["evaluadas"]:
        if not e.get("parque"):
            continue
        con_parque += 1
        nombre = plano(e["parque"].split("(")[0].strip())
        fuente = plano(f"{e['texto']} {e['planta']}")
        # Un parque puede venir de DOS lugares, y los dos valen: de la nota original,
        # o de la segunda vuelta por parque del 6-oct. Lo que no vale es que venga de
        # ninguna parte, asi que el que no esta en la nota tiene que decir de donde
        # salio -- tres de ellos salieron de una consulta y lo declaran--.
        if nombre not in fuente and not e.get("parque_procedencia"):
            sin_respaldo.append((e["empresa"], e["parque"]))
    assert con_parque >= 10, f"se perdieron los parques declarados: {con_parque}"
    assert not sin_respaldo, (
        f"estos parques no aparecen literalmente en la fuente de su senal: "
        f"{sin_respaldo}")


def test_los_conteos_de_nuevas_y_heredadas_NO_dependen_de_una_fecha():
    """Salieron en cero al corregir el dia de la corrida, y nadie se habria dado cuenta.

    `de_la_corrida` era una fecha y el resumen comparaba contra `hoy`. Las dos corridas
    del 5-oct cayeron el mismo dia, asi que la fecha dejo de distinguirlas: «9 nuevas y
    14 heredadas» se volvio «0 y 0» sin que ninguna prueba lo viera. Ahora el
    identificador es el nombre de la corrida, y esto exige que sumen.
    """
    from herramientas.sellar_constancia_puertas import CONSTANCIA
    c = json.load(open(CONSTANCIA, encoding="utf-8"))
    r = c["resumen"]
    assert r["nuevas_de_esta_corrida"] > 0 and r["heredadas_de_la_corrida_anterior"] > 0
    assert (r["nuevas_de_esta_corrida"] + r["heredadas_de_la_corrida_anterior"]
            == r["senales"])
    assert not any(e["de_la_corrida"][:1].isdigit() for e in c["evaluadas"]), (
        "`de_la_corrida` volvio a ser una fecha; tiene que ser el nombre de la corrida")


def test_cada_constructor_identificado_trae_su_procedencia():
    """La segunda vuelta por parque dejo cuatro constructores nuevos. Cada uno dice de
    donde salio, porque «el constructor es X» es una afirmacion sobre el mundo y de
    ella depende a quien se le llama."""
    from herramientas.sellar_constancia_puertas import CONSTANCIA
    c = json.load(open(CONSTANCIA, encoding="utf-8"))
    con_epc = [e for e in c["evaluadas"] if e.get("epc")]
    assert len(con_epc) >= 4, f"se perdieron los constructores hallados: {len(con_epc)}"
    for e in con_epc:
        assert e.get("epc_procedencia"), f"{e['empresa']} afirma un constructor sin fuente"
        # y la puerta A lo lleva como interlocutor, no como «por identificar»
        a = [q for q in e["puertas"]["puertas"] if q["puerta"] == P.PUERTA_EPC]
        if a:
            assert "POR IDENTIFICAR" not in a[0]["interlocutor"], e["empresa"]


# ========== el choque de familia, hallado corriendo prospecta el 6-oct
def test_la_familia_que_la_planta_FABRICA_no_es_venta_y_la_puerta_lo_dice():
    """Tres de las seis cuentas de puerta de usuario chocaban.

    Daikin fabrica chillers y el radar le proponia la familia termica; TDI es Yinlun
    TDI -- enfriadores y radiadores-- y lo mismo; QSMX vende estructura y servicio de
    planta, que es lo que vende FTS. Ofrecer enfriamiento a quien fabrica enfriadores
    quema la llamada, y escribirle a QSMX como usuario final es escribirle a un
    colega.
    """
    d = P.puertas_de(_s(empresa="Daikin", planta="San Luis Potosi",
                        giro="aire acondicionado chillers HVAC",
                        fecha="2025-10-10",
                        texto="inaugura su tercera planta y anuncia una linea de "
                              "chillers centrifugos enfriados por agua"), hoy=HOY)
    assert any("CHOQUE DE FAMILIA" in a and "termico_fluidos" in a for a in d["avisos"])
    for q in d["puertas"]:
        assert "termico_fluidos" in q["familias_que_NO_son_venta_aqui"]
        assert any("FABRICA equipo de enfriamiento" in x for x in q["por_que_no_lo_son"])

    q = P.puertas_de(_s(empresa="QSMX", planta="Ramos Arizpe",
                        giro="fabricacion de componentes y estructuras metalicas, "
                             "inspeccion y apoyo a la operacion de planta",
                        fecha="2026-09-01",
                        texto="inaugura nueva planta y centro de operaciones"),
                     hoy=HOY)
    assert any("colega o un competidor" in a for a in q["avisos"])


def test_una_planta_que_NO_choca_no_arrastra_el_aviso():
    """La reja no se come el caso normal: NIFCO inyecta plastico y Dormakaba hace
    cerraduras. Ninguna de las dos fabrica lo que FTS vende."""
    for giro in ("inyeccion de plastico ensambles", "cerraduras mecanicas y electronicas"):
        r = P.puertas_de(_s(giro=giro, texto="inaugura su segunda planta"), hoy=HOY)
        assert not any("CHOQUE DE FAMILIA" in a for a in r["avisos"]), giro
        for q in r["puertas"]:
            assert "familias_que_NO_son_venta_aqui" not in q


def test_el_choque_mira_el_GIRO_y_no_lo_que_la_cuenta_esta_comprando():
    """CFE fue el falso positivo que lo destapo.

    La primera version miraba el giro Y el texto de la senal. La nota de CFE dice
    «construir cuatro subestaciones electricas» y la palabra disparo la regla
    electrica, cuando CFE COMPRA subestaciones -- es el mejor cliente posible de una
    casa electrica, no su competencia--. El texto dice que compra la cuenta; el giro
    dice que ES.
    """
    assert P.choque_de_familia("transmision y distribucion de energia electrica") == []
    assert P.choque_de_familia(
        "transmision y distribucion de energia electrica",
        "invertira para construir cuatro subestaciones electricas nuevas") == []
    # Y los que SI chocan, chocan por su giro, con el giro tal como viene del archivo.
    assert P.choque_de_familia("aire acondicionado chillers equipo termico")
    assert P.choque_de_familia("intercambiadores de calor gestion termica autopartes")
    assert P.choque_de_familia("estructuras metalicas acero metalmecanica")
