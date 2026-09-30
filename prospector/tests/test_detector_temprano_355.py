"""El detector temprano de limite de fuente (#355, decision 2).

N = 12, las TRES formas cubiertas, criterio «cero perfiles de la empresa».
Esteban rechazo el criterio amplio -- «cero puestos de planta»-- con la razon
correcta: distinguir un puesto de planta de uno corporativo es justo lo que el
filtro no hace solo, y un criterio que depende de una distincion que la
herramienta no sabe hacer cortaria cuentas buenas.

LA CONSECUENCIA MEDIDA, que estas pruebas fijan: **Cuprum corta y Ragasa no.**
Cuprum devolvio cero perfiles de la empresa con cuatro configuraciones; Ragasa SI
tiene perfiles de la empresa en el indice -- un director general adjunto entre
ellos-- y lo que no tiene son los de planta. Ragasa llega al final del bloque y
declara su limite POR ROL en la ficha: menos ahorro y mas honesto.

Sin nombres: las cuentas se nombran por empresa y los puestos por su titulo.
"""
from __future__ import annotations

from flujo.compuertas import (
    CONSULTAS_PARA_CORTAR_POR_LIMITE_DE_FUENTE as N,
    FORMAS_QUE_EL_CORTE_EXIGE_CUBIERTAS,
    corta_por_limite_de_fuente,
)
from flujo.confianza import Contacto
from flujo.estado import Corrida

FORMAS = ("simple", "linkedin_global", "linkedin_mx")


def _m5(c, cuantas, perfiles=0, formas=FORMAS, desde=0):
    for i in range(desde, desde + cuantas):
        c.registrar_busqueda("M5", "bloques_secos",
                             f"consulta de personas numero {i}",
                             "linkedin_publico", 0,
                             etiqueta=formas[i % len(formas)],
                             perfiles_de_la_empresa=perfiles)
    return c


# --------------------------------------------------------------- los numeros
def test_el_corte_es_a_las_doce_y_exige_las_tres_formas():
    assert N == 12
    assert FORMAS_QUE_EL_CORTE_EXIGE_CUBIERTAS == 3


# ------------------------------------------------------- CUPRUM: SI corta
def test_cuprum_corta_a_las_doce():
    """El caso limpio: cuatro configuraciones, cero perfiles de la empresa."""
    c = _m5(Corrida("Cuprum", "Monterrey"), N)
    corta, razon = c.corta_m5_por_limite_de_fuente()
    assert corta is True, razon
    assert "CERO perfiles de la empresa" in razon, razon


def test_cuprum_entra_al_motor_3_con_canal_sales_navigator():
    """La cuenta clase (c) SI entra, con tarjeta, y con el canal marcado desde
    el radar. Sin esto la tarjeta llega con cero contactos y parece una cuenta
    mala en vez de una cuenta que se trabaja por otra via."""
    c = _m5(Corrida("Cuprum", "Monterrey"), N)
    canal, por_que = c.canal_de_la_cuenta()
    assert canal == "sales_navigator", canal
    assert "Sales Navigator" in por_que
    assert "busqueda armada" in por_que


def test_el_paquete_lleva_el_limite_y_el_canal_de_la_cuenta():
    from flujo.paquete import armar

    c = _m5(Corrida("Cuprum", "Monterrey"), N)
    p = armar(c)
    assert p["limite_de_fuente"]["hay"] is True
    assert p["limite_de_fuente"]["canal_de_la_cuenta"] == "sales_navigator"
    assert p["limite_de_fuente"]["razon"]


# ------------------------------------------------------- RAGASA: NO corta
def test_ragasa_no_corta_porque_el_buscador_SI_tiene_perfiles_de_la_empresa():
    """La correccion de #355. Medido el 29-sep: `site:mx.linkedin.com/in Ragasa
    gerente de planta Monterrey` devuelve perfiles DE RAGASA -- entre ellos un
    director general adjunto--. Lo que no devuelve son los puestos de planta.

    Con el criterio estrecho aprobado, esa cuenta NO se corta. Es menos ahorro,
    y es el precio de no cortar una cuenta que el buscador si tiene.
    """
    c = Corrida("Ragasa", "Monterrey")
    # Once secas y una que si trajo un perfil corporativo: el corte no se
    # dispara, y la razon dice por que.
    _m5(c, N - 1)
    c.registrar_busqueda("M5", "bloques_secos",
                         "site:mx.linkedin.com/in Ragasa director",
                         "linkedin_publico", 1, etiqueta="linkedin_mx",
                         perfiles_de_la_empresa=1)
    corta, razon = c.corta_m5_por_limite_de_fuente()
    assert corta is False, razon
    assert "SI trajeron perfil de la empresa" in razon, razon
    assert "se arregla aqui y no en Sales Navigator" in razon, razon


def test_ragasa_no_recibe_canal_de_cuenta():
    c = Corrida("Ragasa", "Monterrey")
    _m5(c, N - 1)
    c.registrar_busqueda("M5", "bloques_secos", "Ragasa director general",
                         "linkedin_publico", 1, etiqueta="linkedin_mx",
                         perfiles_de_la_empresa=1)
    assert c.canal_de_la_cuenta() == ("", "")


# -------------------------------------------- lo que impide cortar a ciegas
def test_una_consulta_sin_declarar_el_dato_NO_corta():
    """El silencio nunca corta. Si el agente no declara `--perfiles`, la
    compuerta se queda quieta y le dice que lo declare."""
    c = _m5(Corrida("X", "Y"), N - 1)
    c.registrar_busqueda("M5", "bloques_secos", "una consulta mas sin declarar",
                         "linkedin_publico", 0, etiqueta="simple")
    corta, razon = c.corta_m5_por_limite_de_fuente()
    assert corta is False
    assert "no declararon" in razon and "--perfiles" in razon, razon


def test_doce_consultas_de_una_sola_forma_NO_cortan():
    """Es el error de #353 con otra cara: doce consultas todas con
    `site:linkedin.com/in` prueban que ESE corpus no tiene a la empresa, no que
    el buscador no la tenga. Por eso `site:mx.linkedin.com/in` existe."""
    c = _m5(Corrida("X", "Y"), N, formas=("linkedin_global",))
    corta, razon = c.corta_m5_por_limite_de_fuente()
    assert corta is False
    assert "1 forma(s) de 3" in razon, razon
    assert "ESE corpus" in razon, razon


def test_once_consultas_todavia_no_cortan():
    c = _m5(Corrida("X", "Y"), N - 1)
    corta, razon = c.corta_m5_por_limite_de_fuente()
    assert corta is False
    assert f"{N - 1} de {N}" in razon, razon


def test_un_contacto_registrado_declara_el_perfil_solo():
    """Si la consulta trajo contactos, trajo perfiles: pedir el dato aparte
    seria pedir algo que el registro ya tiene."""
    c = Corrida("X", "Y")
    b = c.registrar_busqueda("M5", "bloques_secos", "una con contacto",
                             "linkedin_publico", 1, etiqueta="simple",
                             contactos=[Contacto(None, "Plant Manager", "X")])
    assert b.perfiles_de_la_empresa == 1


# ------------------------------------------ los dos alcances, y por que dos
def test_el_corte_mira_doce_y_la_ficha_mira_todas():
    """Pueden discrepar, y cuando lo hacen los dos tienen razon: el corte se
    disparo con la evidencia de las doce, la ficha lo desmiente con la de
    despues. Es el riesgo que la decision acepta a cambio de ~48 consultas."""
    c = _m5(Corrida("X", "Y"), N)
    # A las doce: corta.
    assert c.corta_m5_por_limite_de_fuente()[0] is True
    # La consulta trece trae un perfil.
    c.registrar_busqueda("M5", "bloques_secos", "la trece, con perfil",
                         "linkedin_publico", 1, etiqueta="simple",
                         perfiles_de_la_empresa=1)
    # El corte sigue diciendo que si -- mira las doce primeras--...
    assert c.corta_m5_por_limite_de_fuente()[0] is True
    # ...y la ficha ya dice que NO, porque mira todas.
    assert c.limite_de_fuente()[0] is False


def test_hay_UNA_sola_definicion_del_criterio():
    """La ficha no calcula: delega. Dos numeros para el mismo hecho garantizan
    que un dia la compuerta corte y la ficha no lo diga."""
    import inspect

    from flujo import ficha

    fuente = inspect.getsource(ficha.sin_presencia_en_buscador_publico)
    assert "c.limite_de_fuente()" in fuente, fuente
    assert "len(m5)" not in fuente, "la ficha volvio a calcular por su cuenta"
