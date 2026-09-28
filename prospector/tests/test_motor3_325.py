"""Los seis hallazgos de #325 y los tres lazos de aprendizaje.

Cada hallazgo tiene una prueba que FALLA con el codigo de antes. No son pruebas
del diseno -- el diseno estaba bien escrito--: son pruebas de que la cadena que
el diseno describe de verdad transporta los datos, que es lo que no hacia.
"""
import os
import re
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flujo import aprendizaje as ap
from flujo import importacion_odoo as io
from flujo import paquete as pq
from flujo import radar
from flujo.confianza import CONFIRMADO, DESMENTIDO, Contacto, Dato
from flujo.estado import Corrida, CompuertaCerrada

HOY = date(2026, 9, 28)


def _corrida(**kw):
    c = Corrida(empresa="Ejemplo", ciudad="Monterrey")
    c.senal.append("amplian la subestacion de la planta, nota de 2026-07-01")
    if kw:
        # #340: declarar la senal EXIGE fecha o declarar que no hay. Estas pruebas
        # no son de la fecha, asi que se les pone la de la nota que el propio texto
        # de arriba cita. Lo que NO se hace es rodear la compuerta con `sin_fecha`:
        # eso entrenaria a rodearla.
        kw.setdefault("fecha_senal", "2026-07-01")
        c.declarar_senal_origen(**kw)
    return c


# ===========================================================  H1 · el expediente
def test_h1_el_paquete_emite_fuente_tipo_y_puntaje():
    ev = radar.evaluar({"texto": "amplian la subestacion 2000 kVA",
                        "fuente": "prensa_industrial", "fecha": "2026-07-01"},
                       hoy=HOY)
    c = _corrida(fuente="prensa_industrial", fecha_senal="2026-07-01",
                 evaluacion=ev)
    p = pq.armar(c)
    assert p["fuente"] == "prensa_industrial"
    assert p["tipo_de_senal"] == "obra_nueva"
    assert p["puntaje_del_evaluador"] == ev["puntaje"]
    # EL DESGLOSE, no solo el total: un 72 no dice si vino de match fuerte con
    # senal vieja o de lo contrario, y son dos lecciones opuestas.
    assert p["senal_origen"]["desglose"] == ev["desglose"]


def test_h1_una_fuente_que_el_evaluador_no_conoce_se_rechaza():
    with pytest.raises(CompuertaCerrada) as e:
        _corrida(fuente="un_blog_que_me_gusta")
    assert "no esta en el evaluador" in str(e.value)


def test_h1_declarar_sin_fuente_se_rechaza():
    with pytest.raises(CompuertaCerrada) as e:
        _corrida(fuente="")
    assert "EXIGE fuente" in str(e.value)


def test_h1_una_senal_sin_evaluador_lo_dice_en_los_avisos():
    c = _corrida(fuente="prensa_industrial")
    assert any("SIN pasar por el evaluador" in a for a in c.avisos)
    assert pq.armar(c)["puntaje_del_evaluador"] is None


def test_h1_el_expediente_sobrevive_al_guardar_y_cargar(tmp_path):
    from flujo.orquestador import _cargar_de
    ev = radar.evaluar({"texto": "chiller de 200 TR", "fuente": "correo_propio",
                        "fecha": "2026-09-01"}, hoy=HOY)
    c = _corrida(fuente="correo_propio", fecha_senal="2026-09-01", evaluacion=ev)
    ruta = c.guardar(str(tmp_path / "x.json"))
    otra = _cargar_de(ruta)
    # El puntaje se restaura TAL CUAL. Recalcularlo cambiaria la frescura -- la
    # senal envejece-- y el lazo compararia contra un numero que nadie uso.
    assert otra.senal_origen["puntaje"] == ev["puntaje"]
    assert otra.senal_origen["desglose"] == ev["desglose"]


# =======================================================  H2 · la caducidad viva
def test_h2_la_tabla_de_caducidad_ya_elige_renglon():
    # ANTES: toda tarjeta caducaba a los 60 dias por omision, porque la tabla se
    # buscaba por una llave que el paquete no emitia. Las once filas nunca
    # eligieron ninguna.
    c = _corrida(fuente="prensa_industrial", fecha_senal="2026-07-01")
    f, por = io.razon_de_caducidad(pq.armar(c), HOY)
    assert "obra_nueva" in por
    assert f == "2026-10-29"          # 2026-07-01 + 120
    assert f != (HOY.replace(month=11, day=27)).isoformat()


def test_h2_el_reloj_arranca_en_la_senal_no_en_hoy():
    vieja = _corrida(fuente="prensa_industrial", fecha_senal="2026-07-01")
    nueva = _corrida(fuente="prensa_industrial", fecha_senal="2026-09-20")
    # La misma fuente y el mismo plazo, y NO caducan el mismo dia: una nota de
    # hace 80 dias con plazo de 120 le quedan 40. Arrancar en hoy le regalaba a
    # la senal vieja la misma ventana que a la fresca.
    assert (io.fecha_de_caducidad(pq.armar(vieja), HOY)
            < io.fecha_de_caducidad(pq.armar(nueva), HOY))


def test_h2_la_fecha_de_cierre_de_una_convocatoria_manda():
    c = _corrida(fuente="convocatoria", fecha_senal="2026-09-01",
                 fecha_de_cierre="2026-10-09")
    f, por = io.razon_de_caducidad(pq.armar(c), HOY)
    assert f == "2026-10-09"
    assert "no lo decide FTS" in por


def test_h2_una_convocatoria_sin_cierre_avisa():
    c = _corrida(fuente="convocatoria", fecha_senal="2026-09-20")
    assert any("SIN fecha de cierre" in a for a in c.avisos)


def test_h2_el_evento_pone_su_propio_reloj():
    c = _corrida(fuente="camara", fecha_del_evento="2026-11-05")
    f, por = io.razon_de_caducidad(pq.armar(c), HOY)
    assert f == "2026-11-20"          # evento + 15
    assert "el evento es el canal" in por


def test_h2_sin_expediente_el_plazo_se_declara_sin_significado():
    f, por = io.razon_de_caducidad(pq.armar(_corrida()), HOY)
    assert "POR OMISION" in por and "no significa nada" in por


def test_h2_todos_los_tipos_de_senal_tienen_plazo():
    # Un tipo sin plazo cae al de omision en silencio, que es el hallazgo H2 otra
    # vez. Si manana se agrega un tipo, esta prueba lo caza.
    faltan = set(radar.TIPOS_DE_SENAL) - set(io.DIAS_POR_TIPO_DE_SENAL)
    assert not faltan, f"tipos de senal sin plazo de caducidad: {faltan}"


# =========================================================  H3 · medium_id real
def test_h3_medium_id_es_la_fuente_no_el_origen():
    c = _corrida(fuente="prensa_industrial", fecha_senal="2026-07-01")
    c.origen = "radar"
    fila = io.lineas(pq.armar(c), HOY)[0]
    assert fila["medium_id"] == "prensa_industrial"
    # y ya no repite source_id, que era el sintoma
    assert fila["medium_id"] != fila["source_id"]


def test_h3_sin_fuente_medium_id_lo_dice_en_vez_de_inventar():
    fila = io.lineas(pq.armar(_corrida()), HOY)[0]
    assert fila["medium_id"] == "sin-fuente-declarada"


# ====================================================  H4 · llave de reciclaje
def test_h4_la_llave_de_reciclaje_sale_de_un_dominio_observado():
    c = _corrida(fuente="correo_propio")
    x = c.agregar(Contacto(empresa="Ejemplo", nombre="Ana Ficticia",
                        puesto="Gerente de Mantenimiento", cercania_decision=6))
    x.dato("correo").observar("outlook_personas", "test@ejemplo.mx")
    p = pq.armar(c)
    assert p["dominio_correo"] == "ejemplo.mx"
    assert p["llave_de_reciclaje"] == "ejemplo.mx|monterrey"


def test_h4_sin_dominio_observado_NO_hay_llave_y_eso_es_la_respuesta():
    # Devolver una llave inventada para no devolver None seria peor: el motor 3
    # la usaria para fundir o para partir cuentas sin que nadie lo notara.
    p = pq.armar(_corrida(fuente="correo_propio"))
    assert p["llave_de_reciclaje"] is None
    assert "ANCLA" in p["llave_de_reciclaje_por_que"]


def test_h4_un_correo_derivado_del_patron_no_da_dominio():
    c = _corrida(fuente="correo_propio")
    x = c.agregar(Contacto(empresa="Ejemplo", nombre="Beto Ficticio",
                        puesto="Compras", cercania_decision=16))
    # `buscador` NO esta en FUENTES_ANCLA, asi que esta observacion no es un
    # literal: es la FORMA, no el buzon. Un dominio sacado de ahi es un dominio
    # adivinado, y la llave por dominio adivinado vuelve a ser la llave por
    # nombre con un disfraz -- el HERSMEX que el diseno rechazo--.
    x.dato("correo").observar("buscador", "demo@ejemplo.mx")
    assert pq.armar(c)["llave_de_reciclaje"] is None


def test_h4_la_llave_de_reciclaje_no_es_la_de_la_corrida():
    c = _corrida(fuente="correo_propio")
    x = c.agregar(Contacto(empresa="Ejemplo", nombre="Ana Ficticia",
                        puesto="Mantenimiento", cercania_decision=6))
    x.dato("correo").observar("odoo", "test@ejemplo.mx")
    p = pq.armar(c)
    # La de la corrida lleva el NOMBRE de la empresa, que es justo lo que el
    # diseno rechazo: `HERSMEX` por Hershey.
    assert p["llave_corrida"] == "Ejemplo/Monterrey"
    assert p["llave_de_reciclaje"] == "ejemplo.mx|monterrey"
    assert p["llave_de_reciclaje"] != p["llave_corrida"]


# ==============================================================  H5 · desmentido
def test_h5_un_rebote_le_gana_a_dos_fuentes_que_coincidian():
    d = Dato(campo="correo")
    d.observar("camara", "test@ejemplo.mx").observar("outlook_personas",
                                                   "test@ejemplo.mx")
    assert d.nivel == CONFIRMADO
    d.desmentir("rebote", fecha="2026-10-02")
    # No es otra opinion sobre el dato: es el resultado de USARLO.
    assert d.nivel == DESMENTIDO


def test_h5_el_silencio_no_desmiente_nada():
    # Contarlo como desmentido acabaria descartando los correos buenos de las
    # cuentas que simplemente no contestan.
    with pytest.raises(ValueError) as e:
        Dato(campo="correo").desmentir("sin_respuesta")
    assert "silencio NO es contra-evidencia" in str(e.value)


def test_h5_una_respuesta_negativa_tampoco_desmiente():
    with pytest.raises(ValueError) as e:
        Dato(campo="correo").desmentir("respuesta_negativa")
    assert "habla del NEGOCIO" in str(e.value)


def test_h5_la_ficha_dice_NO_LO_USES_no_correo_probable():
    x = Contacto(empresa="Ejemplo", nombre="Ana Ficticia", puesto="Mantenimiento")
    x.dato("correo").observar("camara", "test@ejemplo.mx")
    from flujo.ficha import _correo_en_palabras
    x.dato("correo").desmentir("rebote", fecha="2026-10-02",
                               detalle="550 mailbox unavailable")
    valor, texto, clase = _correo_en_palabras(x)
    assert valor == ""
    assert "NO LO USES" in texto and "REBOTO" in texto
    # El respaldo del final decia "correo probable — confirmalo en la primera
    # llamada", que para un buzon que ya reboto es al reves de lo que paso.
    assert "probable" not in texto
    assert clase == "flag"


def test_h5_un_correo_desmentido_no_puede_ir_en_email_from():
    c = _corrida(fuente="correo_propio")
    x = c.agregar(Contacto(empresa="Ejemplo", nombre="Ana Ficticia",
                        puesto="Mantenimiento", cercania_decision=6))
    x.dato("correo").observar("odoo", "test@ejemplo.mx")
    x.dato("correo").desmentir("rebote")
    fila = io.lineas(pq.armar(c), HOY)[0]
    assert fila["email_from"] == ""


def test_h5_el_desmentido_se_serializa():
    d = Dato(campo="correo")
    d.observar("camara", "test@ejemplo.mx").desmentir("rebote", fecha="2026-10-02")
    j = d.a_dict()
    assert j["nivel"] == DESMENTIDO
    assert j["procedencia"] == "desmentido_al_usarlo"
    assert len(j["desmentidos"]) == 1


# =======================================================  los tres lazos
def _cierre(i, fuente, tipo, fresc, empata, convirtio, toques):
    return {
        "llave": f"E{i}/P", "llave_de_reciclaje": f"e{i}.mx|p",
        "senal_origen": {"fuente": fuente, "tipo": tipo, "familia": "electrico",
                         "empata_padron": empata,
                         "desglose": {"frescura": fresc,
                                      "padron": 8 if empata else 0}},
        "destino": ap.EVOLUCIONA if convirtio else ap.CADUCA,
        "convirtio": convirtio, "toques": toques,
        "dias_hasta_la_primera_respuesta": 7 if convirtio else None,
        "canal_que_funciono": toques[0]["canal"] if convirtio else None,
    }


def _t(canal, res, n=1, nivel=None):
    return {"n": n, "canal": canal, "fecha": "2026-08-10", "resultado": res,
            "nivel_confianza_del_correo": nivel}


def test_los_lazos_son_tres_con_destinos_distintos():
    r = ap.los_tres_lazos([])
    assert [l["lazo"] for l in r["lazos"]] == [1, 2, 3]
    destinos = [tuple(l["destinos"]) for l in r["lazos"]]
    # Tres lazos con el mismo destino serian un lazo con tres nombres.
    assert len(set(destinos)) == 3


def test_ningun_lazo_mueve_una_constante():
    antes = dict(radar.FUERZA_DE_FUENTE)
    cierres = [_cierre(i, "prensa_industrial", "obra_nueva", 25, False, False,
                       [_t("correo_directo", "sin_respuesta")])
               for i in range(30)]
    ap.los_tres_lazos(cierres)
    assert radar.FUERZA_DE_FUENTE == antes
    assert "nadie puede auditar" in ap.los_tres_lazos([])["nada_se_movio_solo"]


def test_lazo1_con_menos_de_veinte_por_celda_no_abre():
    cierres = [_cierre(i, "prensa_industrial", "obra_nueva", 25, False, False,
                       [_t("correo_directo", "sin_respuesta")])
               for i in range(19)]
    l1 = ap.lazo1_radar(cierres)
    celda = next(k for k in l1["compuertas"]
                 if k["celda"] == "fuerza_de_fuente[prensa_industrial]")
    assert celda["veredicto"] == ap.PREMATURO and celda["faltan"] == 1


def test_lazo1_propone_bajar_el_peso_de_la_fuente_que_no_convierte():
    cierres = ([_cierre(i, "prensa_industrial", "obra_nueva", 25, False,
                        i < 1, [_t("correo_directo", "sin_respuesta")])
                for i in range(22)]
               + [_cierre(100 + i, "correo_propio", "necesidad_declarada", 25,
                          False, i < 7, [_t("correo_directo", "respuesta_positiva"
                                            if i < 7 else "sin_respuesta")])
                  for i in range(21)])
    l1 = ap.lazo1_radar(cierres)
    prensa = next(k for k in l1["compuertas"]
                  if k["celda"] == "fuerza_de_fuente[prensa_industrial]")
    assert prensa["abre"]
    assert prensa["sugerido"] < prensa["vigente"]


def test_lazo1_la_compuerta_de_frescura_no_abre_con_un_solo_lado():
    # Una compuerta que dice ABRE y en el mismo renglon dice que no puede
    # concluir nada es la clase de veredicto que este proyecto lleva cuatro
    # issues sacando del codigo.
    cierres = [_cierre(i, "correo_propio", "necesidad_declarada", 25, False,
                       False, [_t("correo_directo", "sin_respuesta")])
               for i in range(40)]
    k = next(x for x in ap.lazo1_radar(cierres)["compuertas"]
             if x["celda"] == "escala_frescura")
    assert not k["abre"]
    assert "mismo lado de la curva" in k["propuesta"]


def test_lazo1_el_padron_necesita_los_dos_lados_poblados():
    cierres = [_cierre(i, "correo_propio", "necesidad_declarada", 25, True,
                       False, [_t("correo_directo", "sin_respuesta")])
               for i in range(25)]
    k = next(x for x in ap.lazo1_radar(cierres)["compuertas"]
             if x["celda"] == "padron_empata")
    assert "los dos lados" in k["propuesta"]


def test_lazo2_abre_con_un_solo_rebote():
    # Un rebote es prueba suficiente de que ESE correo esta mal: no es una tasa,
    # es un hecho. Esperar veinte seria seguir escribiendo a diecinueve buzones
    # que ya se sabe que rebotan.
    l2 = ap.lazo2_motor2([_cierre(1, "correo_propio", "necesidad_declarada", 25,
                                  False, False,
                                  [_t("correo_directo", "rebote", 1,
                                      "candidato")])])
    d = next(k for k in l2["compuertas"] if k["celda"].startswith("desmentido["))
    assert d["abre"] and d["n"] == 1


def test_lazo2_agrupa_los_desmentidos_de_la_misma_cuenta():
    cierres = [_cierre(1, "correo_propio", "necesidad_declarada", 25, False,
                       False, [_t("correo_directo", "rebote", 1, "candidato")])
               for _ in range(12)]
    l2 = ap.lazo2_motor2(cierres)
    filas = [k for k in l2["compuertas"] if k["celda"].startswith("desmentido[")]
    # Doce rebotes de la misma cuenta son UN hallazgo con doce casos.
    assert len(filas) == 1 and filas[0]["n"] == 12
    assert "12 veces" in filas[0]["propuesta"]


def test_lazo2_el_patron_de_cuenta_pide_tres_rebotes_no_uno():
    uno = ap.lazo2_motor2([_cierre(1, "correo_propio", "necesidad_declarada", 25,
                                   False, False,
                                   [_t("correo_directo", "rebote", 1,
                                       "candidato")])])
    k = next(x for x in uno["compuertas"] if x["celda"].startswith("patron_correo"))
    # Un rebote puede ser un buzon lleno; tres son el patron. Y descartar el
    # patron afecta a contactos que nunca se tocaron.
    assert not k["abre"] and "buzon lleno" in k["propuesta"]


def test_lazo3_propone_el_plazo_desde_lo_que_de_verdad_tardaron():
    cierres = [_cierre(i, "correo_propio", "necesidad_declarada", 25, False,
                       True, [_t("correo_directo", "respuesta_positiva")])
               for i in range(12)]
    k = next(x for x in ap.lazo3_motor3(cierres)["compuertas"]
             if x["celda"] == "dias[necesidad_declarada]")
    assert k["abre"] and k["sugerido"] is not None
    assert k["vigente"] == io.DIAS_POR_TIPO_DE_SENAL["necesidad_declarada"]


def test_lazo3_cero_respuestas_manda_la_leccion_al_lazo_1():
    cierres = [_cierre(i, "vacante_tecnica", "vacante_tecnica", 18, False, False,
                       [_t("correo_directo", "sin_respuesta")])
               for i in range(15)]
    k = next(x for x in ap.lazo3_motor3(cierres)["compuertas"]
             if x["celda"] == "dias[vacante_tecnica]")
    assert not k["abre"]
    assert "leccion del lazo 1, no de este" in k["propuesta"]


# ==========================================  el expediente de cierre
def test_el_expediente_no_lleva_datos_personales():
    c = _corrida(fuente="correo_propio")
    x = c.agregar(Contacto(empresa="Ejemplo", nombre="Ana Ficticia",
                        puesto="Mantenimiento", cercania_decision=6))
    x.dato("correo").observar("odoo", "test@ejemplo.mx")
    e = ap.expediente_de_cierre(
        pq.armar(c), ap.CADUCA,
        [{"canal": "correo_directo", "fecha": "2026-08-10",
          "resultado": "sin_respuesta", "nivel_confianza_del_correo": "solido",
          "nombre": "Ana Ficticia", "correo": "test@ejemplo.mx"}])
    texto = str(e)
    # Los toques traen canal, fecha, nivel y resultado. NO nombre ni correo: el
    # expediente es lo que se agrega, y un nombre aqui se replica en cada corte.
    assert "Ana Ficticia" not in texto
    assert "test@ejemplo.mx" not in texto
    assert e["toques"][0]["nivel_confianza_del_correo"] == "solido"


def test_el_expediente_rechaza_un_destino_inventado():
    with pytest.raises(ValueError):
        ap.expediente_de_cierre(pq.armar(_corrida()), "se_perdio", [])


def test_el_expediente_rechaza_un_resultado_de_toque_inventado():
    with pytest.raises(ValueError):
        ap.expediente_de_cierre(pq.armar(_corrida()), ap.CADUCA,
                                [{"canal": "correo_directo",
                                  "resultado": "contesto_raro"}])


def test_el_expediente_marca_las_cuentas_que_no_pueden_ensenar_nada():
    e = ap.expediente_de_cierre(pq.armar(_corrida()), ap.CADUCA, [])
    assert e["sin_expediente_de_senal"] is True
    r = ap.los_tres_lazos([e])
    # Un tablero que muestra "8 cierres" cuando 5 no ensenan nada hace creer que
    # el aprendizaje avanza mas rapido de lo que avanza.
    assert r["cierres_sin_expediente_de_senal"] == 1
    assert r["cuentas_por_regenerar"] == [e["llave"]]


# ==========================================  el prototipo del tablero
PROTO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "metodo", "prototipo-tablero-motor3.html")


def _proto():
    with open(PROTO, encoding="utf-8") as f:
        return f.read()


def test_el_prototipo_usa_la_paleta_aprobada():
    h = _proto()
    # Los tokens de #323, con sus nombres Y sus valores. Un prototipo nuevo con
    # otra paleta obliga a Esteban a aprobar el color dos veces.
    for token in ("--paper:#f5f7f4", "--teal:#0f6b5c", "--hot:#b3261e",
                  "--warn:#b06a00", "--ok:#1f7a4d", "--gray-bg:#eef1ef"):
        assert token in h, f"falta el token {token} de la paleta aprobada"


def test_el_prototipo_define_los_tres_estados_de_tema():
    h = _proto()
    assert "@media (prefers-color-scheme:dark)" in h
    assert ':root:not([data-theme="light"])' in h
    assert ':root[data-theme="dark"]' in h


def test_toda_clase_usada_en_el_prototipo_tiene_CSS():
    # La leccion de #323: `class="q"` sobrevivio a un renombre, se quedo sin CSS,
    # y la columna de consultas perdio su monoespaciada sin que nada fallara.
    h = _proto()
    usadas = set()
    for m in re.finditer(r'class="([^"]+)"', h):
        usadas.update(m.group(1).split())
    definidas = set(re.findall(r"\.([a-zA-Z][\w-]*)", h[:h.index("</style>")]))
    assert not (usadas - definidas), f"clases sin CSS: {sorted(usadas - definidas)}"


def test_el_prototipo_declara_que_sus_cuentas_son_inventadas():
    h = _proto()
    assert "inventad" in h.lower()


def test_el_prototipo_dice_las_tres_preguntas_de_los_tres_lazos():
    h = _proto()
    for pregunta in ("vale la pena tocar", "qué datos se toca",
                     "por qué canal se toca"):
        assert pregunta in h, f"el tablero no dice: {pregunta}"


def test_el_prototipo_nombra_la_constante_que_cada_lazo_movería():
    # Un tablero que dice "el aprendizaje ajustara los pesos" sin nombrar la
    # constante produce un archivo que nadie lee nunca.
    h = _proto()
    for constante in ("FUERZA_DE_FUENTE", "PADRON_EMPATA", "DESMENTIDO",
                      "canal_de()", "flujo/radar.py",
                      "flujo/importacion_odoo.py"):
        assert constante in h


def test_el_prototipo_distingue_los_cierres_que_no_ensenan_nada():
    h = _proto()
    assert "58 cierres" in h and "55 enseñan" in h


def test_el_prototipo_no_lee_las_tablas_de_personas():
    h = _proto()
    # Lo dice, y el esquema lo sostiene (ver test_esquema_motor3).
    assert "contacto" in h and "toque_destinatario" in h
    assert "Ninguna cifra de este tablero necesita leer" in h


# ==========================================  los comandos nuevos
def test_el_comando_senal_declara_y_deja_la_caducidad_viva(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    from flujo.orquestador import main
    c = _corrida()
    c.guardar(str(tmp_path / "ejemplo" / "monterrey.json"))
    assert main(["senal", "--empresa", "Ejemplo", "--ciudad", "Monterrey",
                 "--fuente", "prensa_industrial",
                 "--fecha-senal", "2026-07-01"]) == 0
    from flujo.orquestador import _cargar_de
    otra = _cargar_de(str(tmp_path / "ejemplo" / "monterrey.json"))
    assert otra.senal_origen["fuente"] == "prensa_industrial"
    assert otra.senal_origen["tipo"] == "obra_nueva"


def test_el_comando_senal_rechaza_una_fuente_inventada(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    from flujo.orquestador import main
    _corrida().guardar(str(tmp_path / "ejemplo" / "monterrey.json"))
    # Codigo 2 = compuerta cerrada, la convencion del proyecto. No una traza:
    # el operador tiene que leer POR QUE se nego, no un stacktrace.
    assert main(["senal", "--empresa", "Ejemplo", "--ciudad", "Monterrey",
                 "--fuente", "un_blog_que_me_gusta"]) == 2


def test_reevaluar_marca_que_el_puntaje_es_de_hoy(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    from flujo.orquestador import main, _cargar_de
    _corrida().guardar(str(tmp_path / "ejemplo" / "monterrey.json"))
    main(["senal", "--empresa", "Ejemplo", "--ciudad", "Monterrey",
          "--fuente", "prensa_industrial", "--fecha-senal", "2026-07-01",
          "--reevaluar"])
    otra = _cargar_de(str(tmp_path / "ejemplo" / "monterrey.json"))
    assert otra.senal_origen["puntaje"] is not None
    # El numero NO es el del dia de la corrida: la frescura cambio. Sin esta
    # marca, el lazo 1 corregiria la curva de frescura con un numero que la curva
    # ya afecto.
    assert otra.senal_origen["puntaje_reevaluado_hoy"] is True
    assert any("REEVALUO hoy" in a for a in otra.avisos)


def test_el_comando_regenera_corre_sin_empresa(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    from flujo.orquestador import main
    _corrida().guardar(str(tmp_path / "ejemplo" / "monterrey.json"))
    assert main(["regenera"]) == 0
    salida = capsys.readouterr().out
    assert "REGENERACION" in salida
    assert "Ejemplo/Monterrey" in salida
    # El comando de arreglo tiene que estar VISIBLE en la salida, no en un doc.
    assert "./prospector senal" in salida


def test_el_comando_aprendizaje_sin_cierres_lo_dice(capsys):
    from flujo.orquestador import main
    assert main(["aprendizaje"]) == 0
    salida = capsys.readouterr().out
    assert "0 cierre(s)" in salida
    assert "nadie puede auditar" in salida
