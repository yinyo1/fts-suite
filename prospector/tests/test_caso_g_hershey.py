"""Caso G — mayoria clara con ancla INFORMA; empate sin ancla se abstiene.

Medido en Hershey (#287). El patron de correo tuvo CUATRO fuentes: tres decian
`FLast` -y una de esas tres era un correo literal real visto en un hilo de
Outlook- y solo SignalHire decia lo contrario. La compuerta marco conflicto y
VACIO el campo.

    Sin patron de correo, Rissia no le puede escribir a nadie.

Y el campo vacio tiraba informacion buena: que 3 de 4 apuntaban al mismo lado, y
que una de esas 3 no era una estadistica de directorio sino un correo que
alguien mando de verdad.

    NO ELEGIR NO ES LO MISMO QUE NO INFORMAR.

Pero la otra mitad de la regla importa igual: el Caso F sigue vivo. Estas
pruebas existen para fijar LA LINEA, no para relajarla. Si alguna vez Cuprum
deja de dar conflicto, el cambio esta mal.
"""
import pytest
from flujo.confianza import (Dato, CONFIRMADO, SOLIDO, CANDIDATO, EN_CONFLICTO,
                             MINIMO_MAYORIA, RAZON_MAYORIA, FUENTES_ANCLA,
                             CAMPOS_CON_MAYORIA)


def _hershey() -> Dato:
    """Los cuatro observados de la corrida real del 24-sep-2026."""
    d = Dato("patron_correo")
    d.observar("leadiq", "FLast@hersheys.com", forma="FLast",
               nota="el mas usado; 8 patrones")
    d.observar("contactout", "FLast@hersheys.com", forma="FLast", nota="68.78%")
    d.observar("signalhire", "LastF@hersheys.com", forma="LastFirstInitial",
               nota="67%")
    d.observar("outlook", "FLast@hersheys.com", forma="FLast",
               nota="ANCLA: correo literal real visto en el hilo de mayo")
    return d


# ------------------------------------------------- Hershey: informa, no vacia
def test_hershey_REPORTA_el_valor_en_vez_de_vaciarlo():
    d = _hershey()
    assert d.valor == "FLast@hersheys.com", (
        "es el defecto que este caso existe para arreglar: el campo salia vacio "
        "y Rissia se quedaba sin a quien escribirle")
    assert d.nivel != EN_CONFLICTO


def test_hershey_topa_en_SOLIDO_y_nunca_llega_a_confirmado():
    """Hay una fuente viva diciendo lo contrario. Llamarle 'verificado' a eso
    seria el Caso F por la puerta de atras."""
    d = _hershey()
    assert d.nivel == SOLIDO
    assert d.nivel != CONFIRMADO


def test_hershey_sigue_reconociendo_que_las_fuentes_CHOCAN():
    """Informar no es fingir que no hay desacuerdo. `choca` sigue en True: el
    hecho es que chocan, y lo que cambia es que ademas se puede informar."""
    d = _hershey()
    assert d.choca
    assert d.informa_pese_al_conflicto


def test_hershey_dice_QUIEN_disiente_y_QUE_dice():
    """Dar el valor y callar la disidencia seria elegir en silencio con otro
    nombre."""
    d = _hershey()
    dis = d.disidencia
    assert "3 de 4" in dis
    assert "outlook lo vio literal" in dis
    assert "signalhire disiente" in dis
    assert "LastF@hersheys.com" in dis
    assert "confirmalo" in dis


def test_hershey_la_disidencia_LLEGA_a_la_ficha_limpia():
    """El mismo bug que el Caso F destapo con los conflictos: si la ficha limpia
    -la que lee Rissia- no muestra la salvedad, el valor sale afirmado a secas."""
    from flujo.estado import Corrida
    from flujo.confianza import Contacto
    from flujo.ficha import modo_limpio

    c = Corrida("Hershey Mexico", "General Escobedo, NL", "confiteria")
    x = Contacto(None, "Maintenance Supervisor · Utilities & Facilities",
                 c.empresa, cercania_decision=6)
    x.datos["patron_correo"] = _hershey()
    c.agregar(x)

    html_out = modo_limpio(c)
    assert "Con salvedad" in html_out
    assert "FLast@hersheys.com" in html_out
    assert "signalhire disiente" in html_out
    assert "En conflicto" not in html_out, (
        "un dato usable con salvedad NO es un pendiente: mezclarlo con los "
        "conflictos de verdad vuelve la ficha una lista de tareas")


def test_el_challenge_lo_reporta_como_salvedad_no_como_pendiente():
    from flujo.compuertas import exigir_confianza
    from flujo.confianza import Contacto
    x = Contacto(None, "Maintenance Supervisor", "Hershey Mexico")
    x.datos["patron_correo"] = _hershey()
    avisos = exigir_confianza([x])
    assert len(avisos) == 1
    assert avisos[0].startswith("CON SALVEDAD")
    assert "revision humana" not in avisos[0]


# ---------------------------------------- Cuprum: NO se relaja. Sigue vaciando
def test_CUPRUM_sin_ancla_sigue_dando_conflicto():
    """Tres directorios, ninguno vio un correo real: son tres estimaciones.
    Dos contra uno no le gana a nada."""
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com", nota="100%")
    d.observar("rocketreach", "nombre.apellido@cuprum.com", nota="45.45%")
    d.observar("contactout", "nombre.apellido@verzatec.com", nota="20%")
    assert d.nivel == EN_CONFLICTO
    assert d.valor is None
    assert not d.informa_pese_al_conflicto


def test_CUPRUM_con_ancla_pero_solo_2_a_1_TAMPOCO_informa():
    """El caso que mas trabaja de todos. Aqui SI hay ancla dura -el correo real
    de Outlook- y aun asi se abstiene, porque la mayoria son dos.

    Dos no alcanzan, y lo bloquean las DOS condiciones por separado: no llega a
    MINIMO_MAYORIA, y ademas 2 no es tres veces 1. Medido, no supuesto: ver
    `test_bajar_UNA_sola_condicion_no_deja_pasar_a_cuprum`.

    El tres no es un numero al azar: es el mismo que el metodo ya exige en M1
    -MINIMO TRES directorios contrastados- porque con dos no hay con que
    contrastar. Si dos no alcanzan para agotar un modulo, tampoco para ganarle
    a una disidencia.
    """
    d = Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com")
    d.observar("contactout", "nombre.apellido@verzatec.com")
    d.observar("outlook", "nombre.apellido@cuprum.com")   # ancla dura
    d.ancla_dura = True
    assert d.ancla_en_la_mayoria, "el ancla SI esta"
    assert len(d.mayoria[1]) == 2, "pero la mayoria son dos"
    assert not d.informa_pese_al_conflicto
    assert d.nivel == EN_CONFLICTO
    assert d.valor is None


# ------------------------------------------------- la linea, condicion por condicion
def test_mayoria_de_tres_SIN_ancla_no_informa():
    """Tres directorios de acuerdo siguen siendo tres estimaciones. Falta que
    alguien haya VISTO una direccion."""
    d = Dato("patron_correo")
    for f in ("leadiq", "contactout", "prospeo"):
        d.observar(f, "FLast@x.com")
    d.observar("signalhire", "LastF@x.com")
    assert len(d.mayoria[1]) == 3
    assert not d.ancla_en_la_mayoria
    assert not d.informa_pese_al_conflicto and d.nivel == EN_CONFLICTO


def test_tres_contra_DOS_no_informa_aunque_haya_ancla():
    """Una disidencia que junta dos fuentes ya no es ruido: 3 no es tres veces
    2. La razon existe para que la mayoria tenga que ser holgada, no apenas."""
    d = Dato("patron_correo")
    for f in ("leadiq", "outlook", "prospeo"):
        d.observar(f, "FLast@x.com")
    for f in ("signalhire", "zoominfo"):
        d.observar(f, "LastF@x.com")
    assert len(d.mayoria[1]) == 3 and len(d.mayoria[2]) == 2
    assert d.ancla_en_la_mayoria
    assert not d.informa_pese_al_conflicto and d.nivel == EN_CONFLICTO


def test_un_empate_genuino_jamas_informa():
    d = Dato("patron_correo")
    for f in ("leadiq", "outlook", "prospeo"):
        d.observar(f, "FLast@x.com")
    for f in ("signalhire", "zoominfo", "pdf_publico"):
        d.observar(f, "LastF@x.com")
    assert not d.informa_pese_al_conflicto and d.valor is None


def test_el_ancla_tiene_que_estar_en_la_MAYORIA_no_en_la_disidencia():
    """Un correo literal que apoya a la MINORIA no habilita a la mayoria: si el
    unico que vio una direccion real dice lo contrario que los tres directorios,
    eso es mas razon para abstenerse, no menos."""
    d = Dato("patron_correo")
    for f in ("leadiq", "contactout", "prospeo"):
        d.observar(f, "FLast@x.com")
    d.observar("outlook", "LastF@x.com")        # el ancla DISIENTE
    assert len(d.mayoria[1]) == 3
    assert not d.ancla_en_la_mayoria
    assert not d.informa_pese_al_conflicto and d.nivel == EN_CONFLICTO


@pytest.mark.parametrize("fuente", sorted(FUENTES_ANCLA))
def test_las_fuentes_de_ancla_son_las_que_ven_un_literal(fuente):
    d = Dato("patron_correo")
    for f in ("leadiq", "contactout"):
        d.observar(f, "FLast@x.com")
    d.observar(fuente, "FLast@x.com")
    d.observar("signalhire", "LastF@x.com")
    assert d.informa_pese_al_conflicto, f"{fuente} deberia anclar"


@pytest.mark.parametrize("fuente", ["zoominfo", "buscador", "prensa",
                                    "linkedin_publico", "patron_derivado",
                                    "vacante_indeed", "dnb"])
def test_una_estimacion_NO_ancla(fuente):
    """Un directorio dice 'el 68% se ve asi': es una estadistica sobre una
    muestra que el directorio junto. No es lo mismo que una direccion que
    existio."""
    d = Dato("patron_correo")
    for f in ("leadiq", "contactout"):
        d.observar(f, "FLast@x.com")
    d.observar(fuente, "FLast@x.com")
    d.observar("signalhire", "LastF@x.com")
    assert not d.informa_pese_al_conflicto, f"{fuente} no deberia anclar"


# ------------------------------- la regla NO se escapa a los campos de persona
@pytest.mark.parametrize("campo", ["puesto", "empleador", "correo", "telefono"])
def test_la_regla_NO_aplica_a_campos_de_persona(campo):
    """Un patron de correo es un hecho de la CUENTA y no cambia de un mes a
    otro. Un PUESTO si: si tres dicen Jefe y una dice Gerente, la disidente
    puede ser la que se entero del ascenso. Ahi la mayoria no es la verdad, es
    la inercia. Y un EMPLEADOR equivocado no rebota: se manda el correo."""
    assert campo not in CAMPOS_CON_MAYORIA
    d = Dato(campo)
    for f in ("leadiq", "outlook", "prospeo"):
        d.observar(f, "Jefe de Mantenimiento")
    d.observar("prensa", "Gerente de Planta")
    assert d.nivel == EN_CONFLICTO
    assert d.valor is None


def test_los_umbrales_son_los_que_estan_medidos():
    assert (MINIMO_MAYORIA, RAZON_MAYORIA) == (3, 3.0)
    assert CAMPOS_CON_MAYORIA == ("patron_correo",)


@pytest.mark.parametrize("minimo,razon", [(2, 3.0), (3, 2.0), (3, 1.0), (2, 3.0)])
def test_bajar_UNA_sola_condicion_no_deja_pasar_a_cuprum(monkeypatch, minimo, razon):
    """Las dos condiciones se cubren entre si, y eso lo verifique corriendo la
    matriz, no suponiendolo.

    Yo habia escrito que `MINIMO_MAYORIA` era la que separaba los dos casos.
    Es falso: con MINIMO en 2 y RAZON en 3.0, Cuprum sigue dando conflicto
    porque 2 no es tres veces 1. Cada una lo bloquea por su lado, y **hay que
    bajar LAS DOS a 2 para que se rompa**.
    """
    from flujo import confianza as cf
    monkeypatch.setattr(cf, "MINIMO_MAYORIA", minimo)
    monkeypatch.setattr(cf, "RAZON_MAYORIA", razon)
    d = cf.Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com")
    d.observar("contactout", "nombre.apellido@verzatec.com")
    d.observar("outlook", "nombre.apellido@cuprum.com")
    assert not d.informa_pese_al_conflicto
    assert d.nivel == EN_CONFLICTO


def test_bajar_LAS_DOS_si_lo_rompe__por_eso_estan_las_dos(monkeypatch):
    """La contraprueba. Si esto pasara a `not informa`, las condiciones no
    estarian haciendo nada y sobraria una."""
    from flujo import confianza as cf
    monkeypatch.setattr(cf, "MINIMO_MAYORIA", 2)
    monkeypatch.setattr(cf, "RAZON_MAYORIA", 2.0)
    d = cf.Dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com")
    d.observar("contactout", "nombre.apellido@verzatec.com")
    d.observar("outlook", "nombre.apellido@cuprum.com")
    assert d.informa_pese_al_conflicto, (
        "con las dos en 2 Cuprum SI informa: es la razon de que esten las dos "
        "en 3, y de que esta prueba exista")


# ---------------------------- las otras dos caras de C1 no se tocaron
def test_el_choque_por_FORMA_sobre_el_mismo_literal_sigue_vaciando():
    """Aqui no hay valor mayoritario que reportar: el literal es el mismo y lo
    que se discute es que FORMA tiene. La mayoria no contesta esa pregunta."""
    d = Dato("patron_correo")
    d.observar("leadiq", "first.last@x.com", forma="first.last")
    d.observar("outlook", "first.last@x.com", forma="first.last")
    d.observar("prospeo", "first.last@x.com", forma="first.last")
    d.observar("signalhire", "first.last@x.com", forma="first_lastinitial")
    assert d.mayoria is None, "un solo valor: no hay disidencia que aislar"
    assert d.nivel == EN_CONFLICTO and d.valor is None


def test_el_choque_por_BRECHA_de_certeza_sigue_vaciando():
    d = Dato("patron_correo")
    d.observar("leadiq", "first.last@x.com", nota="44%")
    d.observar("outlook", "first.last@x.com", nota="100%")
    d.observar("prospeo", "first.last@x.com", nota="45%")
    assert d.mayoria is None
    assert d.nivel == EN_CONFLICTO and d.valor is None


def test_la_TARJETA_muestra_el_patron_cuando_no_hay_correo_de_la_persona():
    """Defecto que encontro ejercitar la ficha de punta a punta: la tarjeta solo
    leia `correo` -la direccion de una persona- y el patron de la CUENTA vive en
    `patron_correo`. Para un puesto sin persona, el patron es justo lo
    accionable, y la tarjeta no lo mostraba: el valor solo salia en el bloque de
    arriba.

    Va etiquetado `patron ·` y no como direccion, porque no lo es: es la forma,
    no el buzon.
    """
    import re
    from flujo.estado import Corrida
    from flujo.confianza import Contacto, N3_PUESTO
    from flujo.ficha import modo_limpio

    c = Corrida("Hershey Mexico", "General Escobedo, NL", "confiteria")
    x = Contacto(None, "Maintenance Supervisor · Utilities & Facilities",
                 c.empresa, nivel_ficha=N3_PUESTO, cercania_decision=6)
    x.datos["patron_correo"] = _hershey()
    c.agregar(x)

    tarjeta = re.search(r'<div class="p">.*?</div></div>',
                        modo_limpio(c), re.S).group(0)
    assert "patron · FLast@hersheys.com" in tarjeta
    assert "SOL" in tarjeta
    assert "con salvedad" in tarjeta and "signalhire disiente" in tarjeta


def test_un_patron_EN_CONFLICTO_de_verdad_no_se_imprime_en_la_tarjeta():
    """La otra mitad: si no hay mayoria con ancla, la tarjeta no puede imprimir
    un valor. Dice que choca y por que, y nada mas."""
    import re
    from flujo.estado import Corrida
    from flujo.confianza import Contacto, N3_PUESTO
    from flujo.ficha import modo_limpio

    c = Corrida("Grupo Cuprum", "San Nicolas, NL", "aluminio")
    x = Contacto(None, "Compras", c.empresa, nivel_ficha=N3_PUESTO)
    d = x.dato("patron_correo")
    d.observar("leadiq", "nombre.apellido@cuprum.com", nota="100%")
    d.observar("rocketreach", "nombre.apellido@cuprum.com", nota="45.45%")
    d.observar("contactout", "nombre.apellido@verzatec.com", nota="20%")
    c.agregar(x)

    tarjeta = re.search(r'<div class="p">.*?</div></div>',
                        modo_limpio(c), re.S).group(0)
    assert "EN CONFLICTO" in tarjeta
    assert "patron ·" not in tarjeta, "no hay valor que imprimir"
