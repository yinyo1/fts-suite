"""Las seis decisiones que Esteban cerro sobre #305.

D1 electrico y automatizacion en el evaluador con pesos derivados del catalogo ·
D2 IT industrial como comprador, acotado · D3 el padron como factor · D4 modo
expansion · D5 la regla del buzon · D6 la etapa 1 de escritura a Odoo.

Las pruebas de MODO DE FALLA van marcadas: son las que fijan lo que cada cambio
NO debe hacer.
"""
from __future__ import annotations
from datetime import date
import csv
import io
import json
import pytest

from flujo import orquestador as orq
from flujo.buzon import (clasificar, a_senal, fecha_de_cierre, es_agregador,
                         CONVOCATORIA, RFQ_CLIENTE, CONGRESO, NO_ES_SENAL)
from flujo.compuertas import CompuertaCerrada
from flujo.confianza import (Contacto, exigir_cercania_coherente,
                             es_it_industrial, TIPOS_DONDE_IT_DECIDE, CANDIDATO)
from flujo.estado import Corrida
from flujo.expansion import (senal_de_expansion, que_sigue, coocurrencia,
                             MEDIDO, DECLARADO, DEBIL, MIN_COOCURRENCIA,
                             DIAS_MINIMOS_PARA_VOLVER, DIAS_MAXIMOS_PARA_VOLVER)
from flujo.importacion_odoo import (a_csv, lineas, fecha_de_caducidad,
                                    COLUMNAS, NIVELES_QUE_PUEDEN_ENVIAR)
from flujo.paquete import armar as armar_paquete
from flujo.radar import (evaluar, cargar_catalogo, peso_de_tipo,
                         participacion_por_familia, tipos_que_nombra,
                         FAMILIA_DE_TIPO, PADRON_EMPATA, PADRON_NO_EMPATA,
                         MAX_TIPO_DE_OBRA, PESO_MINIMO_TIPO, UMBRAL_PASA,
                         PASA, GUARDA, ARCHIVA, puntos_de_frescura,
                         FRESCURA_SIN_FECHA)


@pytest.fixture(scope="module")
def cat():
    return cargar_catalogo()


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


# ============ D1 · electrico y automatizacion, con peso derivado del catalogo
def test_el_catalogo_dice_que_ELECTRICO_es_la_familia_mas_grande(cat):
    """Es el numero que justifica toda la DECISION 1: el radar estaba montado
    sobre el 15% del negocio."""
    part = participacion_por_familia(cat)
    assert max(part, key=part.get) == "electrico"
    assert part["electrico"] > part["termico_fluidos"]


@pytest.mark.parametrize("termino,tipo", [
    ("subestacion", "subestacion"),
    ("ampliacion de carga", "subestacion"),
    ("media tension", "subestacion"),
    ("tablero", "tablero_electrico"),
    ("transformador", "transformador"),
    ("electroducto", "electroducto_busway"),
    ("busway", "electroducto_busway"),
    ("puesta a tierra", "puesta_a_tierra"),
    ("ups", "ups_respaldo"),
    ("automatizacion de linea", "integracion_control"),
    ("plc", "integracion_control"),
    ("hmi", "integracion_control"),
    ("retrofit", "integracion_control"),
    ("migracion de control", "integracion_control"),
    ("integracion de control", "integracion_control"),
    ("red industrial", "red_industrial"),
    ("medicion", "medicion_y_calibracion"),
])
def test_los_terminos_que_la_DECISION_1_pidio(termino, tipo):
    assert (termino, tipo) in tipos_que_nombra(f"la planta anuncia {termino} nueva")


def test_el_peso_SALE_del_catalogo_y_no_es_igual_para_todos(cat):
    """Un peso escrito a mano al lado de un catalogo se separa del catalogo en la
    segunda actualizacion. Y la DECISION 1 pidio explicitamente que no fueran
    todos iguales."""
    electrico = peso_de_tipo("subestacion", cat)
    termico = peso_de_tipo("chiller", cat)
    manejo = peso_de_tipo("conveyor_y_manejo", cat)
    assert electrico == MAX_TIPO_DE_OBRA, "la familia mas grande vale el tope"
    assert electrico > termico > 0
    assert manejo >= PESO_MINIMO_TIPO
    assert len({electrico, termico, manejo}) == 3, "no todos iguales"


def test_MODO_DE_FALLA_una_familia_chica_NO_vale_cero(cat):
    """Un proyecto de chiller sigue siendo un proyecto de FTS. El peso expresa
    'que tan probable es que sea el trabajo que FTS gana', no lo anula."""
    for t in ("chiller", "conveyor_y_manejo", "mezzanine", "refaccion"):
        assert peso_de_tipo(t, cat) >= PESO_MINIMO_TIPO


def test_una_senal_ELECTRICA_le_gana_a_una_TERMICA_igual_en_lo_demas(cat):
    base = {"fuente": "camara", "fecha": "2026-09-20", "empata_padron": True}
    e = evaluar(dict(base, texto="la planta anuncia una ampliacion de carga y "
                                 "una subestacion nueva"), cat, date(2026, 9, 25))
    t = evaluar(dict(base, texto="la planta anuncia un chiller nuevo"),
                cat, date(2026, 9, 25))
    assert e["puntaje"] > t["puntaje"]
    assert e["familia"] == "electrico" and t["familia"] == "termico_fluidos"


def test_un_peso_de_fuente_NO_declarado_cuenta_CERO(cat):
    """Un peso inventado es peor que un hueco."""
    r = evaluar({"texto": "subestacion nueva", "fuente": "telepatia",
                 "fecha": "2026-09-20"}, cat, date(2026, 9, 25))
    assert r["desglose"]["fuerza_de_fuente"] == 0
    assert "sin peso declarado" in r["por_que"]


# ==================================== D2 · IT industrial, acotado a tres tipos
# Los AMBIGUOS: se llaman como IT de oficina y responden por la linea. Son los
# unicos que la excepcion rescata, porque son los unicos que la compuerta bloquea.
PUESTOS_AMBIGUOS = ("Gerente de Sistemas de Manufactura", "Gerente de TI Industrial",
                    "Director de Sistemas de Manufactura")


@pytest.mark.parametrize("puesto", PUESTOS_AMBIGUOS)
def test_el_IT_INDUSTRIAL_puede_decidir_en_los_tres_tipos(puesto):
    for tipo in ("red_industrial", "integracion_control", "medicion"):
        assert exigir_cercania_coherente(5, puesto, (tipo,)) == 5, (
            f"{puesto} en {tipo}")


def test_el_numero_que_justifica_la_DECISION_2(cat):
    """`integracion_control` es el tipo MAS GRANDE de los 29 del catalogo, y
    automatizacion/TI es el 18.8% del negocio. La regla vieja era un falso
    negativo sistematico sobre eso."""
    tipos = cat["tipos_de_proyecto"]
    assert max(tipos, key=lambda t: tipos[t]["n"]) == "integracion_control"


# --- MODO DE FALLA de D2: lo que NO se abre ---------------------------------
@pytest.mark.parametrize("puesto", [
    "Gerente de TI", "Gerente de Sistemas", "Director de Sistemas",
    "Administrador de Red", "Jefe de Mesa de Ayuda", "Help Desk",
    "Analista de Ciberseguridad", "CIO",
])
def test_MODO_DE_FALLA_el_IT_CORPORATIVO_sigue_siendo_contexto(puesto):
    """La DECISION 2 pidio prueba de que no se abre a IT corporativo generico.
    Un gerente de sistemas no compra una subestacion, y tampoco una red
    industrial: el que la compra responde por la linea, no por el correo."""
    assert not es_it_industrial(puesto), f"{puesto!r} no es IT industrial"
    for tipo in ("red_industrial", "integracion_control", "medicion"):
        with pytest.raises(CompuertaCerrada):
            exigir_cercania_coherente(5, puesto, (tipo,))


def test_MODO_DE_FALLA_el_IT_industrial_NO_decide_en_electrico_ni_termico():
    """Acotado a esos tipos, dijo la decision. Para electrico o termico, IT sigue
    siendo contexto."""
    for tipo in ("subestacion", "tablero_electrico", "chiller",
                 "sistema_agua_helada", "estructura_metalica"):
        with pytest.raises(CompuertaCerrada):
            exigir_cercania_coherente(5, "Gerente de Sistemas de Manufactura",
                                      (tipo,))


def test_MODO_DE_FALLA_sin_declarar_tipos_la_excepcion_NO_se_abre():
    """El default es la regla vieja, que es la segura.

    **La excepcion es MAS ESTRECHA de lo que parece, y esta prueba lo fija.** Solo
    rescata a los puestos que estan en `PUESTOS_NUNCA_DECISORES` **y** son
    industriales -- los ambiguos, los que se llaman como IT de oficina y responden
    por la linea--. "Ingeniero de Control" o "Especialista OT" nunca estuvieron
    bloqueados: no son RH ni recepcion, y la compuerta siempre los dejo pasar. Lo
    encontro esta prueba al escribirla.
    """
    with pytest.raises(CompuertaCerrada):
        exigir_cercania_coherente(5, "Gerente de Sistemas de Manufactura")
    # y los que nunca estuvieron en la lista siguen pasando, con o sin tipos
    assert exigir_cercania_coherente(5, "Ingeniero de Control") == 5
    assert exigir_cercania_coherente(5, "Especialista OT") == 5


def test_el_mensaje_le_DICE_al_agente_como_abrirla():
    with pytest.raises(CompuertaCerrada) as e:
        exigir_cercania_coherente(5, "Gerente de Sistemas de Manufactura",
                                  ("chiller",))
    assert "--tipos" in str(e.value)
    assert "sistemas de manufactura" in str(e.value)


def test_los_tipos_viajan_de_la_CORRIDA_a_la_compuerta(sesion):
    _sondas_ok()
    assert orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Silao",
                     "--tipos", "integracion_control,red_industrial"]) == 0
    c = orq._cargar("Coficab", "Silao")
    assert c.tipos == ["integracion_control", "red_industrial"]
    x = orq._contacto(c, {"nombre": "N",
                          "puesto": "Gerente de Sistemas de Manufactura",
                          "cercania_decision": 5})
    assert x.cercania_decision == 5
    c2 = Corrida(empresa="Coficab", ciudad="Silao", tipos=["subestacion"])
    with pytest.raises(CompuertaCerrada):
        orq._contacto(c2, {"nombre": "N",
                           "puesto": "Gerente de Sistemas de Manufactura",
                           "cercania_decision": 5})


# ================================== D3 · el padron es FACTOR, no requisito
def test_empatar_el_padron_SUMA_y_no_empatar_no_resta(cat):
    base = {"texto": "ampliacion de carga y subestacion", "fuente": "camara",
            "fecha": "2026-09-20"}
    con = evaluar(dict(base, empata_padron=True), cat, date(2026, 9, 25))
    sin = evaluar(dict(base, empata_padron=False), cat, date(2026, 9, 25))
    assert con["desglose"]["padron"] == PADRON_EMPATA == 8
    assert sin["desglose"]["padron"] == PADRON_NO_EMPATA == 0
    assert con["puntaje"] - sin["puntaje"] == 8


def test_MODO_DE_FALLA_no_empatar_NUNCA_resta(cat):
    """Era el sesgo contra la planta nueva: el corte del DENUE es semestral, y una
    planta de junio no existe ahi. Restar la castigaria por ser nueva."""
    r = evaluar({"texto": "subestacion", "fuente": "camara",
                 "fecha": "2026-09-20", "empata_padron": False},
                cat, date(2026, 9, 25))
    assert r["desglose"]["padron"] >= 0


def test_el_no_empate_viaja_como_AMBIGUEDAD_no_como_descuento(cat):
    r = evaluar({"texto": "subestacion", "fuente": "camara",
                 "fecha": "2026-09-20", "empata_padron": False},
                cat, date(2026, 9, 25))
    assert any("DENUE" in a for a in r["ambiguedad"])


def test_el_caso_COFICAB_DURANGO_pasa_el_umbral_SIN_estar_en_el_padron(cat):
    """La prueba que la DECISION 3 pidio. La senal es el boletin del cluster
    (CLID) de la inauguracion, que es fuente `camara`."""
    s = {"texto": "Inauguracion de Coficab II en el CLID: mas de 60 MDD, 500 "
                  "empleos y 2,000 proyectados. El piso superior funde cobre "
                  "(OFC), carga fuerte de enfriamiento y ampliacion de carga "
                  "electrica",
         "fuente": "camara", "fecha": "2025-12-08", "empata_padron": False}
    r = evaluar(s, cat, date(2025, 12, 20))
    assert r["veredicto"] == PASA, f"{r['puntaje']} · {r['por_que']}"
    assert r["puntaje"] >= UMBRAL_PASA


def test_la_MISMA_senal_vieja_ya_NO_pasa(cat):
    """Y eso es correcto: la obra ya arranco."""
    s = {"texto": "Inauguracion de Coficab II, funde cobre, ampliacion de carga",
         "fuente": "camara", "fecha": "2025-12-08", "empata_padron": False}
    assert evaluar(s, cat, date(2026, 9, 25))["veredicto"] != PASA


def test_una_senal_SIN_FECHA_no_vale_cero_y_queda_marcada(cat):
    r = evaluar({"texto": "subestacion", "fuente": "camara"}, cat)
    assert r["desglose"]["frescura"] == FRESCURA_SIN_FECHA > 0
    assert any("sin fecha" in a for a in r["ambiguedad"])


# ==================================== D4 · modo expansion (priorizado)
def test_que_sigue_sale_de_la_COOCURRENCIA_del_catalogo(cat):
    sigue = que_sigue("tablero_electrico", cat)
    assert sigue and sigue[0]["de_donde"] == MEDIDO
    assert sigue[0]["clientes_que_compraron_los_dos"] >= MIN_COOCURRENCIA


def test_MODO_DE_FALLA_UN_solo_cliente_no_hace_un_patron(cat):
    """Misma leccion que `f2 < 3` en Chao1: con un cliente el numero lo decide una
    coincidencia. Se noto construyendo esto: el catalogo decia
    `chiller -> instalacion_electrica` con n=1, porque UN cliente compro las dos
    cosas en la misma obra. Eso es una obra, no un patron."""
    pares = coocurrencia(cat).get("chiller") or {}
    debiles = [k for k, n in pares.items() if n < MIN_COOCURRENCIA]
    assert debiles, "el catalogo tiene co-ocurrencias de un solo cliente"
    sigue = que_sigue("chiller", cat)
    assert all(s["de_donde"] != MEDIDO for s in sigue[:2]), (
        "una co-ocurrencia de un cliente no puede vencer a la tabla del metodo")


def test_la_tabla_declarada_se_MARCA_como_criterio(cat):
    sigue = que_sigue("chiller", cat)
    assert sigue[0]["de_donde"] == DECLARADO
    assert "CRITERIO" in DECLARADO


def test_el_caso_BUDENHEIM_genera_senal_SIN_ninguna_fuente_publica(cat):
    """La validacion que la DECISION 4 pidio. Budenheim ya es cliente: sus
    proyectos reales son conveyor, integracion de control y mezanine."""
    s = senal_de_expansion(
        {"cliente": "Budenheim Mexico", "tipo": "conveyor_y_manejo",
         "disparador": "proyecto_cerrado", "fecha": "2025-12-17"},
        cat, date(2026, 9, 25))
    assert s is not None
    assert s["modo"] == "expansion"
    assert s["fuente"] == "expansion_odoo", "la fuente es Odoo, no algo publico"
    assert s["puntaje"] > 0 and s["que_sigue"]
    assert "Budenheim" in s["texto"]


def test_el_disparador_es_PROPIO_no_publicado(cat):
    """Es una senal que FTS GENERA. No depende de que nadie publique nada."""
    for disp in ("proyecto_cerrado", "proyecto_arrancado", "comisionamiento"):
        s = senal_de_expansion({"cliente": "X", "tipo": "tablero_electrico",
                                "disparador": disp, "fecha": "2026-03-01"},
                               cat, date(2026, 9, 25))
        assert s is not None and s["disparador"] == disp


@pytest.mark.parametrize("dias,esperado", [
    (5, None), (20, None),        # la planta todavia digiere la obra
    (120, "senal"), (400, "senal"),
    (600, None),                  # ya compro con otro: es historia
])
def test_MODO_DE_FALLA_la_ventana_para_volver_tiene_DOS_bordes(cat, dias, esperado):
    from datetime import timedelta
    hoy = date(2026, 9, 25)
    s = senal_de_expansion(
        {"cliente": "X", "tipo": "tablero_electrico",
         "disparador": "proyecto_cerrado",
         "fecha": (hoy - timedelta(days=dias)).isoformat()}, cat, hoy)
    assert (s is None) == (esperado is None), f"{dias} dias"
    assert DIAS_MINIMOS_PARA_VOLVER < DIAS_MAXIMOS_PARA_VOLVER


def test_MODO_DE_FALLA_un_disparador_que_no_es_disparador_no_genera_senal(cat):
    assert senal_de_expansion({"cliente": "X", "tipo": "tablero_electrico",
                               "disparador": "se_me_ocurrio",
                               "fecha": "2026-03-01"}, cat) is None


def test_la_senal_de_expansion_nombra_lo_QUE_SIGUE_no_lo_ya_vendido(cat):
    """Si ya se vendio, no hay nada que prospectar ahi: el `tipo_de_obra` que el
    evaluador puntua sale del tipo SIGUIENTE."""
    s = senal_de_expansion({"cliente": "X", "tipo": "tablero_electrico",
                            "disparador": "proyecto_cerrado",
                            "fecha": "2026-03-01"}, cat, date(2026, 9, 25))
    nombrados = s["evaluacion"]["tipos_que_nombra"]
    assert any(x["tipo"] in nombrados for x in s["que_sigue"])


# ================================ D5 · la regla del buzon (lo primero)
@pytest.mark.parametrize("correo,clase", [
    ({"subject": "Por crecimiento buscamos proveedores de estos productos",
      "sender": "[x]@industriamartcontacto.com"}, CONVOCATORIA),
    ({"subject": "Empresas requieren de estos proveedores",
      "sender": "[x]@sebuscanproveedores.com"}, CONVOCATORIA),
    ({"subject": "RV: RFQ - Iluminacion y O. Civil Planta Garcia",
      "sender": "[vendedor]@fts.mx"}, RFQ_CLIENTE),
    ({"subject": "Tu acceso a Fundiexpo 2026 ya esta disponible",
      "sender": "[x]@somosindustria.com"}, CONGRESO),
])
def test_las_tres_clases_que_la_DECISION_5_nombro(correo, clase):
    assert clasificar(correo)["clase"] == clase


@pytest.mark.parametrize("correo", [
    {"subject": "RE: TCH: Requerimientos para aceptacion de proyecto",
     "sender": "[interno]@fts.mx", "summary": "el cliente solicita que"},
    {"subject": "Los requerimientos reglamentarios estan evolucionando",
     "sender": "[remitente]@response.cognex.com",
     "summary": "evolucionan los requerimientos de automatizacion"},
    {"subject": "Re: Consulta sobre servicios", "sender": "[x]@bfusa.com",
     "summary": "con base en los requerimientos que tengan actualmente"},
    {"subject": "Hemos renovado la poliza", "sender": "[x]@bbva.com"},
])
def test_MODO_DE_FALLA_la_palabra_suelta_REQUERIMIENTO_no_basta(correo):
    """Los tres primeros son casos REALES del buzon que mi primera version
    clasifico mal. El de vision industrial es el peor: habria entrado como
    convocatoria con peso 23. La marca tiene que ser la FRASE, no la palabra."""
    assert clasificar(correo)["clase"] == NO_ES_SENAL


def test_MODO_DE_FALLA_un_agregador_que_dice_RFQ_sigue_siendo_convocatoria():
    """El que pide no es el agregador. Sin esta linea, un boletin entraria con el
    peso 25 de una RFQ de cliente."""
    c = clasificar({"subject": "RFQ abiertas esta semana",
                    "sender": "[x]@industriamartcontacto.com"})
    assert c["clase"] == CONVOCATORIA
    assert "agregador" in c["por"]


def test_la_senal_del_buzon_NO_lleva_al_remitente():
    """Un correo trae una persona en el From. La senal viaja con la EMPRESA y el
    requerimiento: el nombre de quien lo manda no hace falta para puntuar."""
    s = a_senal({"subject": "buscamos proveedores de instalacion electrica",
                 "sender": "[remitente]@industriamartcontacto.com",
                 "receivedDateTime": "2026-09-22T16:15:56Z"})
    crudo = json.dumps(s, ensure_ascii=False)
    assert "[remitente]" not in crudo
    assert "sender" not in s and "remitente" not in s


def test_extrae_requerimiento_estado_y_fecha_de_cierre():
    s = a_senal({"subject": "RFQ - instalacion electrica y obra civil",
                 "sender": "[x]@cliente-ejemplo.mx",
                 "summary": "planta en Nuevo Leon, cierra el 15 de febrero",
                 "receivedDateTime": "2026-01-30T13:46:29Z"})
    assert "instalacion_electrica" in s["categorias"]
    assert "nuevo leon" in s["estados"]
    assert s["fecha_de_cierre"] == "2026-02-15"
    assert s["fecha"] == "2026-01-30"


def test_la_fecha_de_CIERRE_manda_porque_el_plazo_no_lo_decide_FTS():
    assert fecha_de_cierre("la convocatoria cierra el 30 de octubre de 2026") == \
        "2026-10-30"
    assert fecha_de_cierre("vence 2026-11-05") == "2026-11-05"
    assert fecha_de_cierre("sin plazo declarado") == ""


def test_una_convocatoria_GENERICA_no_pasa_el_umbral(cat):
    """Medido sobre el buzon real: las 13 convocatorias de agregador dieron 37-48.
    El evaluador tiene razon -- no nombran la empresa que compra, ni el estado, ni
    un tipo de proyecto de FTS-- y eso hay que decirlo, no taparlo."""
    s = a_senal({"subject": "Por crecimiento buscamos proveedores de estos "
                            "productos y servicios en Mexico",
                 "sender": "[x]@industriamartcontacto.com",
                 "summary": "buscando empresas proveedoras especializadas",
                 "receivedDateTime": "2026-09-22T16:15:56Z"})
    r = evaluar(s, cat, date(2026, 9, 25))
    assert r["veredicto"] in (GUARDA, ARCHIVA)
    assert any("empresa que compra" in a for a in s["ambiguedad"])


def test_es_agregador_reconoce_los_dominios_medidos():
    assert es_agregador("[x]@industriamartcontacto.com")
    assert es_agregador("[x]@sebuscanproveedores.com")
    assert not es_agregador("[x]@cliente-ejemplo.mx")
    assert not es_agregador("[vendedor]@fts.mx")


# ============================ D6 · etapa 1 de escritura: el CSV de importacion
def _corrida_con_contactos():
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    c.gancho = "La nave nueva funde cobre OFC"
    c.agregar_senal("2025-12-08 · prensa · inauguracion de Coficab II, 60 MDD")
    a = Contacto(nombre="A", puesto="Gerente de Mantenimiento",
                 empresa="Coficab", cercania_decision=10)
    a.dato("correo").observar("outlook", "[persona-a]@example.com")
    a.dato("planta").observar("outlook", "COFICAB Durango")
    b = Contacto(nombre="B", puesto="Director de Planta", empresa="Coficab",
                 cercania_decision=5)
    b.dato("correo").observar("patron_derivado", "[persona-b]@example.com")
    b.dato("planta").observar("linkedin_publico", "Durango")
    d = Contacto(nombre="D", puesto="Jefe de Compras", empresa="Coficab",
                 cercania_decision=15, revision_humana=True,
                 motivo_revision="el hilo no dice de que planta es")
    d.dato("correo").observar("outlook", "[persona-d]@example.com")
    d.dato("planta").observar("buscador", "Durango")
    for x in (a, b, d):
        c.agregar(x)
    return c


def test_la_tarjeta_es_LEAD_no_oportunidad():
    """Un prospecto que nunca contesto no es una oportunidad perdida: nunca fue
    una oportunidad. Meterlo como oportunidad envenena las metricas del equipo
    que si vende."""
    f = lineas(armar_paquete(_corrida_con_contactos()), date(2026, 9, 25))[0]
    assert f["type"] == "lead"


def test_el_csv_tiene_las_columnas_que_Odoo_importa():
    txt = a_csv(armar_paquete(_corrida_con_contactos()), date(2026, 9, 25))
    filas = list(csv.DictReader(io.StringIO(txt)))
    assert list(filas[0]) == list(COLUMNAS)
    assert len(filas) == 1, "una tarjeta por CUENTA, no una por contacto"


def test_REGLA_DURA_1_un_correo_candidato_NO_va_en_email_from():
    """De ahi salen los envios de Odoo: un correo derivado de un patron es un
    rebote con el dominio de FTS, o un correo a la persona equivocada."""
    f = lineas(armar_paquete(_corrida_con_contactos()), date(2026, 9, 25))[0]
    assert "[persona-b]" not in f["email_from"]
    assert "[persona-b]" in f["description"], "va al lognote, con su nivel"
    assert "NO se escribe en `email_from`" in f["description"]
    assert f["email_from"] == "[persona-a]@example.com", (
        "y la tarjeta NO pierde el correo que si se puede usar")


def test_REGLA_DURA_2_un_contacto_en_revision_NO_se_propone_como_partner():
    """En Odoo un partner con nombre y puesto se ve identico venga de donde
    venga."""
    f = lineas(armar_paquete(_corrida_con_contactos()), date(2026, 9, 25))[0]
    assert f["contact_name"] != "D"
    assert "NO SE CREA COMO PARTNER" in f["description"]
    assert "el hilo no dice de que planta es" in f["description"]


def test_REGLA_DURA_3_el_celular_personal_no_existe_como_columna():
    f = lineas(armar_paquete(_corrida_con_contactos()), date(2026, 9, 25))[0]
    assert not any("celular" in c or "movil" in c or "mobile" in c
                   for c in COLUMNAS)
    assert f["phone"] == "", "el paquete no trae telefonos y esto no los inventa"
    assert "PROHIBIDO" in f["description"]


def test_la_fecha_de_cierre_MANDA_sobre_el_plazo_por_tipo():
    """En una convocatoria el plazo NO lo decide FTS."""
    pq = armar_paquete(_corrida_con_contactos())
    pq["fecha_de_cierre"] = "2026-10-01"
    assert fecha_de_caducidad(pq, date(2026, 9, 25)) == "2026-10-01"


def test_cada_tipo_de_senal_tiene_su_PLAZO():
    from flujo.importacion_odoo import DIAS_DE_CADUCIDAD
    for f in ("convocatoria", "rfq_cliente", "correo_propio", "expansion_odoo",
              "prensa_industrial", "vacante_tecnica"):
        assert f in DIAS_DE_CADUCIDAD
    assert DIAS_DE_CADUCIDAD["rfq_cliente"] < DIAS_DE_CADUCIDAD["expansion_odoo"]


def test_el_estado_editado_a_mano_se_DECLARA_en_la_tarjeta(sesion):
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    ruta = orq._ruta("Coficab", "Durango")
    d = json.loads(open(ruta, encoding="utf-8").read())
    d["gancho"] = "un gancho que nadie busco"
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False)
    c = orq._cargar_de(ruta)
    f = lineas(armar_paquete(c), date(2026, 9, 25))[0]
    assert "SE EDITO A MANO" in f["description"]


def test_el_comando_importar_escribe_y_NO_toca_Odoo(sesion, capsys):
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    capsys.readouterr()
    assert orq.main(["importar", "--empresa", "Coficab",
                     "--ciudad", "Durango"]) == 0
    salida = capsys.readouterr().out
    assert "ESCRITURAS A ODOO: 0" in salida
    assert "ETAPA 1" in salida
    assert (sesion / "coficab" / "durango-crm-lead.csv").exists()


def test_el_csv_NO_se_puede_escribir_en_el_repo(sesion):
    import os
    _sondas_ok()
    orq.main(["prospecta", "--empresa", "Coficab", "--ciudad", "Durango"])
    aqui = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fuga = os.path.join(aqui, "fuga.csv")
    assert orq.main(["importar", "--empresa", "Coficab", "--ciudad", "Durango",
                     "--salida", fuga]) == 2
    assert not os.path.exists(fuga)


# ============ el hueco del proceso, cerrado
def test_la_cobertura_de_PROCESO_del_catalogo_subio(cat):
    """Era 6 de 154 (3.9%). El arreglo de fondo fue que el constructor ignoraba
    `order_partner_id`, asi que TODAS las entradas salian sin cliente y el cruce
    de proceso no tenia con que empatar."""
    entradas = cat["entradas"]
    con = [e for e in entradas if e.get("proceso")]
    assert len(con) / len(entradas) > 0.5, (
        f"{len(con)} de {len(entradas)}: el hueco sigue abierto")
    assert len(cat["procesos_del_cliente"]) >= 5


def test_todas_las_entradas_tienen_CLIENTE(cat):
    """El defecto que causaba el hueco: sin cliente no hay cruce posible."""
    sin = [e for e in cat["entradas"] if not e.get("cliente")]
    assert not sin, f"{len(sin)} entradas sin cliente"


def test_el_catalogo_sigue_SIN_PERSONAS(cat):
    """El cliente entra por `order_partner_id`, que Odoo escribe como
    "Empresa, Contacto". Se corta en la primera coma: lo que viaja es la empresa."""
    crudo = json.dumps(cat, ensure_ascii=False)
    import re
    assert not re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", crudo)
    assert not any("," in (e.get("cliente") or "") for e in cat["entradas"])
