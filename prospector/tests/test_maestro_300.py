"""Los bugs medidos en la primera corrida A ESCALA -- Coficab en cuatro plantas,
#300-- y las desviaciones de agente que dejo #301.

Cada prueba de aqui nace de un NUMERO de esa corrida, no de una hipotesis. Donde
la corrida midio "7 de 7 falsos conflictos en Silao", la prueba reconstruye los
siete. Donde midio "la senal de oct-2024 sale sin fecha", la prueba pide la
fecha. Y donde el arreglo NO alcanza -- Durango, "Director General" contra
"General Manager"-- hay una prueba que lo fija asi, para que nadie lo "arregle"
despues confundiendo traduccion con redaccion.
"""
from __future__ import annotations
import json
import pytest

from flujo import orquestador as orq
from flujo.compuertas import Busqueda, CompuertaCerrada, exigir_liga_con_forma
from flujo.confianza import (Contacto, CONFIRMADO, SOLIDO, EN_CONFLICTO,
                             CERCANIA_TOPE_NO_DECISOR, exigir_cercania_coherente,
                             puesto_nunca_decisor)
from flujo.estado import Corrida
from flujo.ficha import fecha_de, modo_limpio


@pytest.fixture
def sesion(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    return tmp_path


# ===================================================== B3 · la fecha parcial
#
# Medido en #300: la senal de Silao trae "2024-10" y la de Juarez trae "2018", y
# las dos salian marcadas "sin fecha en el registro". Esa marca existe para que
# una senal vieja no se lea fresca; no reconocer la fecha parcial ESCONDE la
# antiguedad, que es lo contrario de su proposito.
def test_la_senal_de_octubre_de_2024_YA_MUESTRA_su_fecha():
    """El caso exacto de Silao. Antes: ''. Ahora: '2024-10'."""
    assert fecha_de("2024-10 · ampliacion de la planta anunciada") == "2024-10"


def test_el_ano_solo_YA_CUENTA_como_fecha():
    """El caso de Juarez: '2018' es menos preciso que '2018-03-15' y es
    muchisimo mas que 'sin fecha'."""
    assert fecha_de("2018 · arranque de la nave dos") == "2018"


@pytest.mark.parametrize("texto,esperada", [
    ("2026-09-24 · nota de prensa", "2026-09-24"),
    ("9-oct-2025 · vacante publicada", "9-oct-2025"),
    ("ene-2026 · inversion anunciada", "ene-2026"),
    ("agosto de 2022 · ampliacion", "agosto de 2022"),
    ("octubre 2024 · ampliacion", "octubre 2024"),
    ("2024-10 · ampliacion", "2024-10"),
    ("2018 · arranque", "2018"),
])
def test_las_formas_que_la_corrida_ESCRIBE_de_verdad(texto, esperada):
    assert fecha_de(texto) == esperada


def test_la_fecha_completa_GANA_a_la_parcial():
    """El regex alterna, y si la parcial fuera primero se comeria el ano de una
    fecha completa: '2026-09-24' saldria como '2026'."""
    assert fecha_de("inversion el 2026-09-24 en la planta") == "2026-09-24"


def test_un_numero_que_NO_es_ano_no_se_lee_como_fecha():
    """Sin la frontera, '1500' de '1500 empleados' o el '2024' de una version
    '3.2024.1' pasarian por fecha."""
    assert fecha_de("1500 empleados en el sitio") == ""
    assert fecha_de("version 3.2024.1 del sistema") == ""


def test_el_mes_13_no_existe():
    assert fecha_de("clave 2024-13 del expediente") == ""


# ============================== B2 · contencion en el puesto, no conflicto
#
# Los SIETE de Silao, reconstruidos. El challenge marcaba CONFLICTO entre
# "Gerente" y "Gerente COFICAB LEON, Silao Gto": no es una contradiccion, es la
# misma cosa redactada con mas o menos detalle. Siete contactos mandados a
# revision humana sin nada que decidir.
_SILAO = [
    ("Gerente", "Gerente COFICAB LEON, Silao Gto"),
    ("Gerente de Planta", "Gerente de Planta COFICAB Silao"),
    ("Ingeniero de Mantenimiento", "Ingeniero de Mantenimiento, Silao"),
    ("Coordinador de Proyectos", "Coordinador de Proyectos COFICAB LEON"),
    ("Jefe de Produccion", "Jefe de Produccion planta Silao Gto"),
    ("Supervisor de Calidad", "Supervisor de Calidad COFICAB LEON Silao"),
    ("Gerente de Ingenieria", "Gerente de Ingenieria, COFICAB Silao Gto"),
]


@pytest.mark.parametrize("corto,largo", _SILAO)
def test_los_SIETE_falsos_conflictos_de_Silao_ya_no_chocan(corto, largo):
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    p = x.dato("puesto")
    p.observar("linkedin_publico", corto)
    p.observar("rocketreach", largo)
    assert not p.choca, f"'{corto}' contenido en '{largo}' no es contradiccion"
    assert p.nivel != EN_CONFLICTO


def test_los_siete_juntos_bajan_de_7_conflictos_a_CERO():
    """El numero que #300 midio, medido de nuevo entero."""
    chocan = 0
    for corto, largo in _SILAO:
        x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
        p = x.dato("puesto")
        p.observar("linkedin_publico", corto)
        p.observar("rocketreach", largo)
        chocan += 1 if p.choca else 0
    assert chocan == 0, "eran 7 de 7 en la corrida de Silao"


def test_se_reporta_la_redaccion_MAS_ESPECIFICA():
    """'Gerente COFICAB LEON, Silao Gto' dice la planta y 'Gerente' no. Reportar
    el corto perderia el dato que importa."""
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    p = x.dato("puesto")
    p.observar("linkedin_publico", "Gerente")
    p.observar("rocketreach", "Gerente COFICAB LEON, Silao Gto")
    assert p.valor == "Gerente COFICAB LEON, Silao Gto"


def test_la_contencion_sale_CON_SALVEDAD_no_en_silencio():
    """No es elegir en silencio -- el bug del Caso F--: la ficha dice que la otra
    fuente lo dice mas corto, y de quien es cada redaccion."""
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    p = x.dato("puesto")
    p.observar("linkedin_publico", "Gerente")
    p.observar("rocketreach", "Gerente COFICAB LEON, Silao Gto")
    d = p.disidencia
    assert "linkedin_publico" in d, f"la salvedad no dice quien: {d!r}"
    assert "Gerente" in d
    assert "no es contradiccion" in d.lower()


def test_la_contencion_TOPA_en_SOLIDO_no_llega_a_CONFIRMADO():
    """Coinciden en el TRONCO, no en el todo. Dos raices distintas que dicen
    'Gerente' y 'Gerente COFICAB LEON, Silao Gto' corroboran el puesto, no la
    redaccion completa: llamarlo CONFIRMADO afirmaria mas de lo observado."""
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    p = x.dato("puesto")
    p.observar("linkedin_publico", "Gerente")
    p.observar("camara", "Gerente de la planta de Silao")
    assert p.n_raices >= 2
    assert p.nivel == SOLIDO


def test_la_TRADUCCION_de_Durango_NO_la_cierra_la_CONTENCION():
    """Los 2 de 3 de Durango: 'Director General' contra 'General Manager'.

    **Esta prueba cambio de veredicto, y a proposito.** Cuando se escribio,
    esto seguia chocando y era lo correcto: ninguno contiene al otro y no habia
    regla de traduccion aprobada. Esteban la aprobo en #302, asi que ahora lo
    cierra la TABLA DE EQUIVALENCIAS -- no la contencion--, y lo que esta prueba
    conserva es justo eso: que la contencion no tiene nada que ver aqui. Si
    alguien quita la tabla, el conflicto vuelve, y esta prueba lo dice.
    """
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    p = x.dato("puesto")
    p.observar("linkedin_publico", "Director General")
    p.observar("rocketreach", "General Manager")
    assert p.contencion is None, "ninguno contiene al otro: no es contencion"
    assert p.equivalencia is not None, "lo cierra la tabla ES-EN, no la contencion"


def test_la_contencion_es_por_PALABRA_COMPLETA():
    """Sin la frontera de palabra 'ventas' quedaria contenido en 'inventas' y la
    regla taparia un choque de verdad."""
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    p = x.dato("puesto")
    p.observar("linkedin_publico", "ventas")
    p.observar("rocketreach", "inventario y ventasx")
    assert p.choca


def test_un_valor_corto_SIN_CUERPO_no_es_una_redaccion_mas_corta():
    """'GM' dentro de 'GM de planta' podria ser, pero dos letras contenidas en
    otra cadena son coincidencia. La regla exige cuerpo."""
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    p = x.dato("puesto")
    p.observar("linkedin_publico", "GM")
    p.observar("rocketreach", "GM de planta Silao")
    assert p.choca, "un corto de 2 caracteres no alcanza para contencion"


def test_la_contencion_NO_aplica_a_la_entidad():
    """Lo encontro una prueba propia al implementar B2 y se dejo asi a
    proposito: 'Casa' esta en 'Otra Casa' como palabra completa y son dos
    EMPRESAS distintas. Un empleador equivocado no rebota."""
    x = Contacto(nombre="N N", puesto=None, empresa="Coficab")
    e = x.dato("entidad")
    e.observar("linkedin_publico", "Casa")
    e.observar("rocketreach", "Otra Casa")
    assert e.choca


# ==================================== B1 y B6 · que es, y que NO es, una senal
def test_la_senal_como_OBJETO_ya_no_truena_la_ficha():
    """B1: `registrar` aceptaba {fecha,texto,fuente} y `ficha` tronaba con
    TypeError. Un agente lo vio y edito el JSON a mano para poder emitir."""
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    s = c.agregar_senal({"fecha": "2024-10", "fuente": "nota de prensa",
                         "texto": "ampliacion de la planta anunciada"})
    assert s == "2024-10 · nota de prensa · ampliacion de la planta anunciada"
    assert fecha_de(s) == "2024-10", "la fecha del objeto llega hasta la ficha"


def test_la_senal_como_TEXTO_sigue_valiendo():
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    assert c.agregar_senal(
        "2024-10 · ampliacion de la planta anunciada en prensa")


def test_un_objeto_de_senal_SIN_texto_se_rechaza():
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    with pytest.raises(CompuertaCerrada, match="texto"):
        c.agregar_senal({"fecha": "2024-10", "fuente": "prensa"})


@pytest.mark.parametrize("basura", [
    ["una", "lista"], 12, None, 3.5,
])
def test_una_senal_que_no_es_texto_ni_objeto_se_rechaza(basura):
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    with pytest.raises(CompuertaCerrada):
        c.agregar_senal(basura)


@pytest.mark.parametrize("encabezado", [
    "Mapeo de plantas", "Contactos:", "contactos", "Vocabulario",
    "Hallazgos:", "Fuentes",
])
def test_un_ENCABEZADO_no_es_una_senal(encabezado):
    """B6, medido en la corrida: 'Mapeo de plantas' y 'Contactos:' salieron como
    senal sin fecha, ocupando el lugar de una de verdad."""
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    with pytest.raises(CompuertaCerrada):
        c.agregar_senal(encabezado)


def test_una_senal_sin_cuerpo_se_rechaza():
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    with pytest.raises(CompuertaCerrada, match="caracteres"):
        c.agregar_senal("crece")


def test_cualquier_rotulo_que_termina_en_dos_puntos_se_rechaza():
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    with pytest.raises(CompuertaCerrada, match="dos puntos"):
        c.agregar_senal("Lo que encontramos en la planta de Silao:")


# ======================================= la liga rota que reporto el operador
def test_una_liga_sin_esquema_se_rechaza_al_registrarla():
    """Reportado sobre la ficha de Durango: la liga de la fuente de clusters no
    abre, y la ficha la imprimia como si fuera buena."""
    with pytest.raises(CompuertaCerrada, match="https://"):
        Busqueda(modulo="M3", clave="camara", consulta="camara industria durango socios",
                 fuente="camara", resultados=3,
                 liga="www.ejemplo.mx/socios")


def test_una_ruta_relativa_no_es_una_liga():
    with pytest.raises(CompuertaCerrada, match="relativa"):
        Busqueda(modulo="M3", clave="camara", consulta="camara industria durango socios",
                 fuente="camara", resultados=3, liga="/socios/durango")


def test_una_liga_con_espacios_se_rechaza():
    with pytest.raises(CompuertaCerrada, match="espacios"):
        Busqueda(modulo="M3", clave="camara", consulta="camara industria durango socios",
                 fuente="camara", resultados=3,
                 liga="https://ejemplo.mx/socios de durango")


def test_SIN_liga_sigue_siendo_valido():
    """Odoo y el buzon no tienen URL. Exigirla los dejaria fuera del registro,
    que es peor que no tener liga."""
    b = Busqueda(modulo="M0", clave="odoo", consulta="res.partner Coficab",
                 fuente="odoo", resultados=1)
    assert b.liga == ""


def test_la_liga_se_limpia_de_las_COLAS_PEGADAS():
    """Copiar de un markdown o de un resultado de busqueda arrastra el
    parentesis o el punto final."""
    b = Busqueda(modulo="M3", clave="camara", consulta="camara industria durango socios",
                 fuente="camara", resultados=3,
                 liga="https://ejemplo.mx/socios).")
    assert b.liga == "https://ejemplo.mx/socios"


def test_la_ficha_marca_la_liga_como_NO_COMPROBADA(sesion):
    """No se puede prometer que abre -- WebFetch esta bloqueado por egress,
    medido-- asi que se deja de imprimirla como si estuviera comprobada."""
    c = Corrida(empresa="Coficab", ciudad="Durango", giro="cables")
    c.registrar_busqueda("M3", "clusters", "camara industria durango socios", "camara", 3,
                         liga="https://ejemplo.mx/socios",
                         etiqueta="camara")
    h = modo_limpio(c)
    assert 'class="nc"' in h
    assert "no comprobado" in h or "NO comprobado" in h
    assert "ejemplo.mx" in h, "se imprime el dominio, no la palabra 'liga'"


# ======================== PARTE C · la escala de cercania, que se capturo mal
#
# En Silao un agente capturo la cercania INVERTIDA -- creyo que 100 = decide-- y
# marco a un contacto de reclutamiento como comprador con correo solido: el
# unico "de valor + correo" de esa corrida era falso, y la herramienta no lo
# detecto en el momento.
def test_el_caso_de_SILAO_un_reclutador_no_puede_decidir_la_obra():
    with pytest.raises(CompuertaCerrada, match="reclutad"):
        exigir_cercania_coherente(5, "Reclutadora de planta")


@pytest.mark.parametrize("puesto", [
    "Reclutadora", "Talent Acquisition Specialist", "Gerente de Recursos Humanos",
    "Jefa de Capital Humano", "Recepcionista", "Community Manager",
    "Becario de mantenimiento", "Coordinador de Comunicacion Social",
])
def test_los_puestos_que_NO_compran_infraestructura(puesto):
    assert puesto_nunca_decisor(puesto), f"{puesto!r} deberia ser contexto"
    with pytest.raises(CompuertaCerrada):
        exigir_cercania_coherente(0, puesto)


def test_esos_mismos_puestos_SI_pueden_registrarse_como_CONTEXTO():
    """La compuerta no los borra: los pone donde van. Un reclutador es una
    fuente buenisima de vocabulario de planta -- lo que no es, es el comprador--."""
    assert exigir_cercania_coherente(CERCANIA_TOPE_NO_DECISOR + 1,
                                     "Reclutadora de planta") == 42
    assert exigir_cercania_coherente(90, "Reclutadora de planta") == 90


def test_un_puesto_que_SI_decide_puede_estar_en_CERO():
    assert exigir_cercania_coherente(0, "Director de Mantenimiento") == 0
    assert exigir_cercania_coherente(10, "Gerente de Planta") == 10


@pytest.mark.parametrize("fuera", [-1, 101, 1000, -50])
def test_una_cercania_FUERA_DE_RANGO_se_rechaza(fuera):
    with pytest.raises(CompuertaCerrada, match="rango"):
        exigir_cercania_coherente(fuera, "Gerente de Planta")


def test_el_mensaje_de_rango_DICE_EL_SENTIDO_de_la_escala():
    """El error real fue de sentido, no de rango. Si el mensaje no lo dice, el
    agente lo vuelve a invertir dentro del rango."""
    with pytest.raises(CompuertaCerrada) as e:
        exigir_cercania_coherente(150, "Gerente de Planta")
    assert "DECIDE" in str(e.value)


@pytest.mark.parametrize("no_numero", ["alta", None, "0", [0], True])
def test_una_cercania_que_no_es_numero_se_rechaza(no_numero):
    with pytest.raises(CompuertaCerrada):
        exigir_cercania_coherente(no_numero, "Gerente de Planta")


def test_una_cercania_DECIMAL_se_rechaza():
    """Un 100.5 es un error de captura, no media posicion mas lejos de la
    decision. Sin esta linea int(100.5) = 100 pasaba callado."""
    with pytest.raises(CompuertaCerrada, match="ENTEROS"):
        exigir_cercania_coherente(100.5, "Gerente de Planta")
    assert exigir_cercania_coherente(10.0, "Gerente de Planta") == 10


def test_la_compuerta_de_cercania_corre_al_REGISTRAR(sesion, monkeypatch):
    """No sirve como funcion suelta: tiene que estar en el camino por el que un
    agente captura de verdad."""
    monkeypatch.delenv("PROSPECTOR_CHEQUEO_EN_CURSO", raising=False)
    c = Corrida(empresa="Coficab", ciudad="Silao", giro="cables")
    with pytest.raises(CompuertaCerrada):
        orq._contacto(c, {"nombre": "N N", "puesto": "Reclutadora de planta",
                          "cercania_decision": 5})


# ================== PARTE C · el estado editado a mano, que no se detectaba
#
# En Pesqueria un agente EDITO EL JSON DE ESTADO A MANO para que la ficha
# saliera. Lo declaro en el issue, pero la herramienta no lo detecto: un estado
# editado a mano se veia identico a uno legitimo.
def test_una_corrida_que_la_herramienta_escribio_NO_sale_editada(sesion):
    c = Corrida(empresa="Coficab", ciudad="Pesqueria", giro="cables")
    ruta = c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert not orq._cargar_de(ruta).editada_a_mano


def test_editar_el_JSON_por_fuera_SE_DETECTA(sesion):
    c = Corrida(empresa="Coficab", ciudad="Pesqueria", giro="cables")
    ruta = c.guardar(orq._ruta("Coficab", "Pesqueria"))
    d = json.load(open(ruta, encoding="utf-8"))
    d["senal"] = ["alguien escribio esta senal a mano, por fuera"]
    json.dump(d, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
    assert orq._cargar_de(ruta).editada_a_mano


def test_la_FICHA_lo_declara_arriba(sesion):
    """No bloquea la emision -- dentro hay trabajo real y negarse lo perderia--
    pero no puede salir sin decirlo."""
    c = Corrida(empresa="Coficab", ciudad="Pesqueria", giro="cables")
    ruta = c.guardar(orq._ruta("Coficab", "Pesqueria"))
    d = json.load(open(ruta, encoding="utf-8"))
    d["gancho"] = "un gancho que nadie busco"
    json.dump(d, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
    h = modo_limpio(orq._cargar_de(ruta))
    assert "ESTADO EDITADO A MANO" in h
    assert h.index("ESTADO EDITADO A MANO") < h.index("<h1>"), \
        "el aviso va ANTES del gancho, no al pie"


def test_volver_a_guardar_deja_la_firma_CUADRADA(sesion):
    """La firma se recalcula al guardar: trabajar sobre la corrida no la marca
    como editada. Solo escribir el archivo por fuera lo hace."""
    c = Corrida(empresa="Coficab", ciudad="Pesqueria", giro="cables")
    ruta = c.guardar(orq._ruta("Coficab", "Pesqueria"))
    c2 = orq._cargar_de(ruta)
    c2.agregar_senal("2024-10 · ampliacion de la planta anunciada en prensa")
    c2.guardar(ruta)
    assert not orq._cargar_de(ruta).editada_a_mano


def test_la_firma_NO_pretende_ser_seguridad(sesion):
    """Quien edite el JSON puede recalcularla. Esto detecta DESCUIDO -- un agente
    con prisa arreglando un bug--, que es el caso real. Se fija asi para que
    nadie la presente despues como un control de integridad."""
    c = Corrida(empresa="Coficab", ciudad="Pesqueria", giro="cables")
    ruta = c.guardar(orq._ruta("Coficab", "Pesqueria"))
    d = json.load(open(ruta, encoding="utf-8"))
    d["gancho"] = "editado, y con la firma rehecha"
    c2 = orq._cargar_de(ruta)
    c2.gancho = d["gancho"]
    d[Corrida.CAMPO_FIRMA] = c2.firma()
    json.dump(d, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
    assert not orq._cargar_de(ruta).editada_a_mano


def test_el_resumen_de_corridas_marca_la_editada(sesion):
    c = Corrida(empresa="Coficab", ciudad="Pesqueria", giro="cables")
    ruta = c.guardar(orq._ruta("Coficab", "Pesqueria"))
    d = json.load(open(ruta, encoding="utf-8"))
    d["gancho"] = "un gancho que nadie busco"
    json.dump(d, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
    t = orq.tabla_de_corridas()
    assert "✎" in t
    assert "EDITADO A MANO" in t
