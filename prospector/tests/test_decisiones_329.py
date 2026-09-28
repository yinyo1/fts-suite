"""Las cinco decisiones de #329, aprobadas, y los tres defectos que salieron.

D1 -> (b) la ficha AVISA sin expediente, no bloquea.
D2 -> aprobados 20 por celda, 1 rebote, 3 para patron, 10 por tipo.
D3 -> (a) vocabulario de obra nueva con el tipo `obra_nueva_integral`.
D4 -> sigue esperando alcance exacto. No se toca, y una prueba lo sostiene.
D5 -> el guardia queda estricto. Una prueba lo sostiene.

Y tres defectos que la implementacion de D3 saco a la luz, todos de la misma
familia: el evaluador no leia lo que tenia enfrente.
"""
import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flujo import aprendizaje as ap
from flujo import radar
from flujo.catalogo_proyectos import proceso_de
from flujo.confianza import Dato
from flujo.estado import Corrida

HOY = date(2026, 9, 28)
CAT = radar.cargar_catalogo()


# ============================================================  D1 · la ficha avisa
def _sin_expediente():
    c = Corrida(empresa="Ejemplo", ciudad="Monterrey", giro="cables automotrices")
    c.senal.append("amplian la subestacion de la planta")
    return c


def test_d1_avisa_cuando_falta_el_expediente():
    c = _sin_expediente()
    avisos = c.avisar_si_falta_el_expediente()
    assert len(avisos) == 1
    a = avisos[0]
    assert "SIN EXPEDIENTE DE SENAL" in a
    # Tiene que decir las tres cosas: que falta, que NO se rompe, y como
    # arreglarlo sin gastar consultas.
    assert "la fuente" in a and "el tipo" in a
    assert "sirve igual para llamar" in a
    assert "./prospector senal" in a


def test_d1_NO_avisa_cuando_el_expediente_esta_completo():
    c = _sin_expediente()
    ev = radar.evaluar({"texto": "amplian la subestacion", "fuente": "correo_propio",
                        "fecha": "2026-09-01"}, hoy=HOY)
    c.declarar_senal_origen("correo_propio", fecha_senal="2026-09-01", evaluacion=ev)
    assert c.avisar_si_falta_el_expediente() == []


def test_d1_el_aviso_se_REEMPLAZA_no_se_acumula():
    # Misma razon que el veredicto del padron (#306, D1): es una CONCLUSION sobre
    # el estado actual, y dos conclusiones contradictorias no informan.
    c = _sin_expediente()
    c.avisar_si_falta_el_expediente()
    c.avisar_si_falta_el_expediente()
    c.avisar_si_falta_el_expediente()
    assert sum(1 for a in c.avisos if "SIN EXPEDIENTE DE SENAL" in a) == 1


def test_d1_al_completar_el_expediente_el_aviso_desaparece():
    c = _sin_expediente()
    c.avisar_si_falta_el_expediente()
    assert any("SIN EXPEDIENTE" in a for a in c.avisos)
    ev = radar.evaluar({"texto": "amplian la subestacion", "fuente": "correo_propio"},
                       hoy=HOY)
    c.declarar_senal_origen("correo_propio", evaluacion=ev)
    c.avisar_si_falta_el_expediente()
    assert not any("SIN EXPEDIENTE" in a for a in c.avisos)


def test_d1_NO_va_en_el_aviso_rojo_de_la_capa_limpia():
    """El aviso rojo es para lo que se cae EN LA LLAMADA. Esto no se cae.

    Que falte el expediente no afecta nada de lo que la ficha dice: el gancho, los
    contactos y el Chao1 estan bien. Meterlo en rojo tendria dos costos: pondria
    vocabulario interno en la capa que #322 dejo libre de el, y gastaria el aviso
    rojo en algo que a quien llama no le sirve. Un aviso rojo que sale siempre no
    se lee.
    """
    from flujo.ficha import aviso_rojo
    c = _sin_expediente()
    c.avisar_si_falta_el_expediente()
    assert "expediente" not in (aviso_rojo(c) or "").lower()


def test_d1_no_bloquea_la_emision(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    from flujo.orquestador import main
    c = _sin_expediente()
    c.challenge_corrido = True
    c.guardar(str(tmp_path / "ejemplo" / "monterrey.json"))
    # Codigo 4 = "ficha emitida, ENTREGA pendiente", que es el codigo normal de
    # `ficha` cuando todavia no se subio a OneDrive. Lo que esta prueba sostiene
    # es que NO es 2 -- compuerta cerrada--: la ficha se emitio. La opcion (c) de
    # D1, negarse sin expediente, se descarto porque puede detener una ficha
    # urgente un viernes.
    codigo = main(["ficha", "--empresa", "Ejemplo", "--ciudad", "Monterrey"])
    assert codigo == 4, f"codigo {codigo}: la ficha no se emitio"
    # Y el archivo existe de verdad, que es la prueba de que no bloqueo.
    assert (tmp_path / "ejemplo" / "monterrey-limpio.html").exists()


# ==========================================================  D2 · las compuertas
def test_d2_los_cuatro_numeros_aprobados():
    """Constancia de lo que Esteban aprobo. Si alguien los mueve, la suite lo dice.

    No es una prueba de comportamiento: es un candado sobre una decision. Los
    numeros son razonados y no medidos, y el dia que se muevan tiene que ser
    porque hay datos, no porque alguien los ajusto de paso.
    """
    assert ap.MINIMO_POR_CELDA_LAZO1 == 20
    assert ap.MINIMO_POR_DATO_LAZO2 == 1
    assert ap.MINIMO_POR_PATRON_LAZO2 == 3
    assert ap.MINIMO_POR_TIPO_LAZO3 == 10


def test_d2_un_rebote_duro_es_definitivo():
    d = Dato(campo="correo")
    d.observar("camara", "test@ejemplo.mx").observar("outlook_personas",
                                                    "test@ejemplo.mx")
    d.desmentir("rebote")
    assert d.nivel == "desmentido"


# ================================================  D3 · el vocabulario de obra nueva
def test_d3_el_tipo_integral_pesa_mas_que_cualquier_familia():
    peso = radar.peso_de_tipo(radar.TIPO_INTEGRAL_OBRA_NUEVA, CAT)
    pesos_de_familia = [radar.peso_de_tipo(t, CAT) for t in radar.FAMILIA_DE_TIPO]
    assert peso > max(pesos_de_familia), (
        "una planta nueva compra de todas las familias a la vez: su peso tiene "
        "que estar por encima de cualquiera individual")
    assert peso > radar.MAX_TIPO_DE_OBRA


def test_d3_el_peso_integral_se_DERIVA_del_catalogo():
    """La regla del peso derivado no se afloja para esta decision.

    El peso es la SUMA de las participaciones de las familias que la obra
    necesita, escalada contra la mayor. Nadie escribe el numero: si manana FTS
    vende otra mezcla, se mueve solo al regenerar el catalogo.
    """
    part = radar.participacion_por_familia(CAT)
    familias = radar.familias_de_un_tipo_integral(
        radar.TIPO_INTEGRAL_OBRA_NUEVA, CAT)
    esperado = round(radar.MAX_TIPO_DE_OBRA * sum(part[f] for f in familias)
                     / max(part.values()), 1)
    assert radar.peso_de_tipo(radar.TIPO_INTEGRAL_OBRA_NUEVA, CAT) == esperado
    # Y son las SEIS familias: una planta nueva tambien necesita comisionamiento
    # (servicio) y mover material dentro (manejo). Con solo las cuatro que la
    # decision nombra, el peso da 35.2 y Coficab Pesqueria se queda en `guarda`.
    assert set(familias) == set(part)


def test_d3_el_vocabulario_reconoce_la_obra_nueva():
    for texto in ("segunda planta en Nuevo Leon", "planta nueva de cables",
                  "nueva planta en Durango", "ampliacion de nave",
                  "construye una planta", "inaugura planta", "nueva nave",
                  "expansion de planta", "new plant", "second plant",
                  "plant expansion", "new facility", "groundbreaking"):
        tipos = [t for _, t in radar.tipos_que_nombra(texto)]
        assert radar.TIPO_INTEGRAL_OBRA_NUEVA in tipos, f"no reconoce: {texto}"


def test_d3_una_nave_industrial_GENERICA_no_se_infla():
    """La prueba de aceptacion que evita el falso positivo.

    Una nota que habla de una nave sin decir que es NUEVA puede ser un
    reacondicionamiento, una renta o una mencion de paso.
    """
    tipos = [t for _, t in radar.tipos_que_nombra("se renta nave industrial de "
                                                 "4000 m2 en el parque")]
    assert radar.TIPO_INTEGRAL_OBRA_NUEVA not in tipos
    assert "trabajos_civiles" in tipos
    r = radar.evaluar({"texto": "se renta nave industrial de 4000 m2 en el parque",
                       "fuente": "prensa_industrial", "fecha": "2026-09-01"},
                      hoy=HOY)
    assert r["veredicto"] == radar.ARCHIVA


def test_d3_una_nave_NUEVA_si_gana_el_tipo_integral():
    # "nueva nave industrial" pega con los dos terminos, y `evaluar` se queda con
    # el de mas peso. Una nave NUEVA es obra nueva.
    r = radar.evaluar({"texto": "construyen una nueva nave industrial",
                       "fuente": "prensa_industrial", "fecha": "2026-09-01"},
                      hoy=HOY)
    assert r["familia"] == radar.TIPO_INTEGRAL_OBRA_NUEVA


def test_d3_coficab_pesqueria_pasa():
    # La prueba de aceptacion de D3: de 22.7 (`archiva`) a `pasa`.
    r = radar.evaluar({"texto": "prensa reporta segunda planta en Nuevo Leon; "
                                "ampliacion de nave",
                       "fuente": "prensa_industrial",
                       "giro": "cables automotrices"}, hoy=HOY)
    assert r["puntaje"] >= radar.UMBRAL_PASA
    assert r["veredicto"] == radar.PASA


def test_d3_coficab_durango_pasa():
    r = radar.evaluar({"texto": "invierte 60 MDD en planta nueva en Durango, "
                                "arranque dic-2025",
                       "fuente": "prensa_industrial", "fecha": "2025-12-01",
                       "giro": "cables automotrices"}, hoy=HOY)
    assert r["puntaje"] >= radar.UMBRAL_PASA


def test_d3_un_tipo_integral_no_reporta_una_familia_individual():
    """El lazo 1 agrupa por familia para corregir pesos.

    Reportar `electrico` en una obra completa le atribuiria a esa familia una
    conversion que fue de la obra entera, y el peso se moveria por la razon
    equivocada.
    """
    r = radar.evaluar({"texto": "construye una planta nueva",
                       "fuente": "prensa_industrial", "fecha": "2026-09-01"},
                      hoy=HOY)
    assert r["familia"] == radar.TIPO_INTEGRAL_OBRA_NUEVA
    assert r["familia"] not in radar.FAMILIAS
    assert len(r["familias_de_la_obra"]) == len(
        radar.participacion_por_familia(CAT))


# ==============================  B1 · "prensa" era un falso positivo sistematico
def test_b1_prensa_reporta_no_es_un_proceso_de_estampado():
    """El defecto mas caro de los tres, porque INFLABA puntajes.

    En una linea de venta de Odoo "prensa" es la maquina. En el texto de una
    senal, "prensa reporta..." es el medio. Coficab Pesqueria puntuaba 12.7 puntos
    de proceso por esa palabra, y con ellos cruzaba el umbral de `pasa`. Un umbral
    cruzado por un falso positivo es peor que un umbral no cruzado.
    """
    for texto in ("prensa reporta segunda planta en Nuevo Leon",
                  "nota de prensa: la empresa invierte",
                  "segun la prensa local"):
        assert proceso_de(texto)["proceso"] is None, texto


def test_b1_la_prensa_MAQUINA_si_se_reconoce():
    # El arreglo no puede costar la deteccion real: una linea de prensas ES
    # metalmecanica.
    for texto in ("linea de prensas de 400 toneladas",
                  "prensa hidraulica nueva", "prensa de estampado",
                  "stamping press line"):
        assert proceso_de(texto)["proceso"] == "metalmecanica", texto


# ==============================  B2 · el catalogo no conocia la palabra "cable"
def test_b2_una_planta_de_cable_reconoce_su_proceso():
    """El catalogo TIENE el proceso `arneses_cableado` con proyectos reales, y su
    vocabulario no incluia "cable". La cuenta mas trabajada del proyecto es de
    cable y puntuaba cero en proceso."""
    for texto in ("cables automotrices", "planta de cable", "cable de cobre",
                  "cableado de potencia", "wire and cable"):
        assert proceso_de(texto)["proceso"] == "arneses_cableado", texto


def test_b2_el_proceso_existe_en_el_catalogo_con_proyectos():
    procesos = CAT.get("procesos_del_cliente") or {}
    assert (procesos.get("arneses_cableado") or {}).get("n", 0) > 0


# ==============================  B3 · el evaluador no leia el giro de la cuenta
def test_b3_el_giro_entra_al_evaluador():
    """`puntos_de_proceso` existe para puntuar el proceso DEL CLIENTE, y solo
    recibia el texto de la senal -- un titular de prensa--. Se le estaba pidiendo
    al encabezado de una nota que dijera a que se dedica la empresa."""
    sin = radar.evaluar({"texto": "construye una planta nueva",
                         "fuente": "prensa_industrial", "fecha": "2026-09-01"},
                        hoy=HOY)
    con = radar.evaluar({"texto": "construye una planta nueva",
                         "fuente": "prensa_industrial", "fecha": "2026-09-01",
                         "giro": "cables automotrices"}, hoy=HOY)
    assert con["desglose"]["proceso"] > sin["desglose"]["proceso"] == 0.0
    assert con["puntaje"] > sin["puntaje"]


def test_b3_el_giro_NO_inventa_tipos_de_obra():
    """El giro dice a que se dedica la planta, no que va a construir.

    Mezclarlo en `tipos_que_nombra` haria que una planta de cable de datos
    puntuara "cable de datos" como si fuera un proyecto anunciado.
    """
    r = radar.evaluar({"texto": "la empresa cumple 30 anos",
                       "fuente": "feed_generico", "fecha": "2026-09-01",
                       "giro": "cables automotrices y cable de datos"}, hoy=HOY)
    assert r["desglose"]["tipo_de_obra"] == 0.0
    assert r["tipos_que_nombra"] == []


def test_b3_el_comando_senal_le_pasa_el_giro(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    from flujo.orquestador import main, _cargar_de
    c = Corrida(empresa="Ejemplo", ciudad="Monterrey", giro="cables automotrices")
    c.senal.append("construye una planta nueva en el parque industrial")
    c.guardar(str(tmp_path / "ejemplo" / "monterrey.json"))
    main(["senal", "--empresa", "Ejemplo", "--ciudad", "Monterrey",
          "--fuente", "prensa_industrial", "--fecha-senal", "2026-09-01",
          "--reevaluar"])
    otra = _cargar_de(str(tmp_path / "ejemplo" / "monterrey.json"))
    assert otra.senal_origen["desglose"]["proceso"] > 0


# ==============================================  D4 y D5 · lo que NO se toco
def test_d4_no_existe_ninguna_via_de_escritura_a_odoo():
    """D4 sigue esperando alcance exacto. Esta prueba es el candado.

    Recorre el codigo buscando cualquier llamada de escritura a Odoo. La etapa 1
    produce un CSV que sube una persona; no hay nada mas.
    """
    import pathlib
    raiz = pathlib.Path(__file__).resolve().parent.parent
    prohibidos = ("odoo_create", "odoo_write", "odoo_unlink", "execute_kw",
                  "env[", "xmlrpc")
    for f in sorted(raiz.rglob("*.py")):
        if "__pycache__" in f.parts or f.name.startswith("test_"):
            continue
        cuerpo = f.read_text(encoding="utf-8")
        for p in prohibidos:
            assert p not in cuerpo, f"{f.name} parece escribir en Odoo: {p}"


def test_d5_el_guardia_de_datos_personales_sigue_estricto():
    """D5: no se afloja. `DOMINIO_EJEMPLO` esta anclado con `$`, asi que
    `ejemplo.mx` NO queda permitido por dominio y solo pasan los locales de la
    lista. Aflojar un guardia de datos personales es decision de Esteban."""
    import test_sin_datos_personales as G
    assert G.DOMINIO_EJEMPLO.pattern.endswith("$")
    assert not G.DOMINIO_EJEMPLO.search("ejemplo.mx")
    assert not G.DOMINIO_EJEMPLO.search("ejemplo.com")
