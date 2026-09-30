"""La ficha declara el limite de la fuente (Tarea 4 de #353).

Hay cuentas donde el bloque completo de M5 -- las tres formas, con alias de
marca y con ancla de geografia-- devuelve CERO perfiles de la empresa. Ragasa es
el caso limpio: 0 de 3 contactos de valor, probada con la forma global, con la
mexicana y con el alias de marca. Eso no es defecto de la herramienta ni hueco
de vocabulario: es que el buscador publico no indexa esos perfiles.

Y mientras la ficha no lo diga, quien la lee concluye una de dos cosas falsas:
que la herramienta fallo, o que la planta no tiene gente. Esta prueba fija que
la ficha lo diga, EN LA CAPA LIMPIA y sin vocabulario interno, y que entregue la
busqueda de Sales Navigator ya armada.

Sin nombres: las cuentas se nombran por empresa.
"""
from __future__ import annotations

import pytest

from flujo.compuertas import (
    CONSULTAS_PARA_CORTAR_POR_LIMITE_DE_FUENTE as N_CORTE,
)
from flujo.confianza import Contacto
from flujo.estado import Corrida
from flujo.ficha import (
    aviso_de_cuenta_sin_buscador_publico,
    busqueda_armada_para_sales_navigator,
    sin_presencia_en_buscador_publico,
)

# El umbral y el criterio los movio la decision de #355: de 8 consultas con
# «ninguna entrego un contacto» a 12 con las TRES FORMAS cubiertas y cero
# PERFILES de la empresa. Este alias mantiene legible el resto del archivo.
CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE = N_CORTE
FORMAS = ("simple", "linkedin_global", "linkedin_mx")


def _corrida_con_m5_seco(cuantas: int, empresa: str = "Ragasa",
                         ciudad: str = "Monterrey") -> Corrida:
    """Una corrida que pregunto `cuantas` veces por personas y no trajo ninguna."""
    c = Corrida(empresa, ciudad)
    for i in range(cuantas):
        # Las tres formas se rotan a proposito: el corte las EXIGE cubiertas, y
        # doce consultas de un solo corpus no prueban nada. Y cada una declara
        # `perfiles_de_la_empresa=0`, porque el silencio no corta.
        c.registrar_busqueda(
            "M5", "bloques_secos",
            f"consulta de personas numero {i} para {empresa}",
            "linkedin_publico", 0,
            etiqueta=FORMAS[i % len(FORMAS)],
            perfiles_de_la_empresa=0)
    return c


def _corrida_con_m5_que_si_trajo(empresa: str = "LEGO") -> Corrida:
    c = _corrida_con_m5_seco(CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE,
                             empresa=empresa)
    c.registrar_busqueda("M5", "bloques_secos",
                         f"site:linkedin.com/in {empresa} maintenance manager",
                         "linkedin_publico", 1,
                         etiqueta="linkedin_global",
                         contactos=[Contacto(None, "Maintenance Manager",
                                             empresa)])
    return c


# ---------------------------------------------------------------------------
# 1. Cuando SI es limite de fuente
def test_ocho_consultas_secas_declaran_el_limite():
    es, razon = sin_presencia_en_buscador_publico(
        _corrida_con_m5_seco(CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE))
    assert es is True
    assert f"{N_CORTE} consultas" in razon, razon


# ---------------------------------------------------------------------------
# 2. Cuando NO, y son los dos casos que importan
def test_pocas_consultas_no_alcanzan_para_declararlo():
    """Con dos o tres consultas secas lo honesto es «todavia no se sabe».

    Declarar el limite de la fuente manda a la vendedora a Sales Navigator y la
    saca de aqui. Decirlo con tres consultas seria mandarla por un limite que
    no se midio.
    """
    for pocas in (0, 1, 3, CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE - 1):
        es, _ = sin_presencia_en_buscador_publico(_corrida_con_m5_seco(pocas))
        assert es is False, pocas


def test_una_sola_consulta_con_resultado_lo_desactiva():
    """No es «casi ninguna»: es NINGUNA.

    Si una consulta trajo aunque sea un contacto, el buscador SI tiene a la
    empresa y el problema es otro -- orden, vocabulario, redaccion-- que se
    arregla aqui y no en Sales Navigator.
    """
    es, _ = sin_presencia_en_buscador_publico(_corrida_con_m5_que_si_trajo())
    assert es is False


def test_otros_modulos_secos_no_cuentan():
    """El limite es del buscador de PERSONAS. Que M8 o M9 vengan secos no dice
    nada sobre si los perfiles estan indexados."""
    c = Corrida("Ragasa", "Monterrey")
    for i in range(20):
        c.registrar_busqueda("M1", "directorios",
                             f"ragasa.com.mx directorio {i}", "leadiq", 0,
                             perfiles_de_la_empresa=0)
    es, _ = sin_presencia_en_buscador_publico(c)
    assert es is False


# ---------------------------------------------------------------------------
# 3. El aviso, en lenguaje de persona
def test_el_aviso_dice_lo_que_hay_que_hacer_sin_vocabulario_interno():
    html = aviso_de_cuenta_sin_buscador_publico(
        _corrida_con_m5_seco(CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE))
    assert html, "la cuenta califica y el aviso salio vacio"
    plano = html.lower()
    # lo que SI tiene que decir
    assert "no aparece en el buscador publico" in plano
    assert "sales navigator" in plano
    # lo que NO: vocabulario de la herramienta en la cara de quien llama
    for interno in ("clase (c)", "m5", "frescura", "hallazgos", "modulo",
                    "linkedin_publico"):
        assert interno not in plano, interno


def test_sin_limite_el_aviso_no_aparece():
    assert aviso_de_cuenta_sin_buscador_publico(_corrida_con_m5_seco(2)) == ""
    assert aviso_de_cuenta_sin_buscador_publico(
        _corrida_con_m5_que_si_trajo()) == ""


# ---------------------------------------------------------------------------
# 4. La busqueda armada
def test_la_busqueda_armada_trae_empresa_ciudad_y_las_cuatro_familias():
    c = _corrida_con_m5_seco(CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE,
                             empresa="Ragasa", ciudad="Monterrey")
    armada = busqueda_armada_para_sales_navigator(c)
    assert "Ragasa" in armada and "Monterrey" in armada
    for familia in ("Mantenimiento", "Compras", "Direccion", "Ingenieria"):
        assert familia in armada, familia


def test_la_busqueda_armada_avisa_que_la_ciudad_en_el_texto_no_filtra():
    """El hallazgo medido: con la ciudad escrita en el texto, una consulta de
    un puesto de Amazon devolvio a quien lo tiene en Sydney."""
    armada = busqueda_armada_para_sales_navigator(
        _corrida_con_m5_seco(CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE))
    plano = armada.lower()
    assert "no filtra" in plano
    assert "sydney" in plano


def test_la_busqueda_armada_pide_una_familia_por_busqueda():
    armada = busqueda_armada_para_sales_navigator(
        _corrida_con_m5_seco(CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE))
    assert "una busqueda por familia" in armada.lower()


def test_las_familias_salen_de_INTERLOCUTOR_no_de_un_texto_a_mano():
    """Si manana se le agrega vocabulario a una familia, la busqueda armada se
    mueve con ella. Un texto escrito a mano quedaria viejo en silencio."""
    from flujo.ficha import INTERLOCUTOR

    armada = busqueda_armada_para_sales_navigator(
        _corrida_con_m5_seco(CONSULTAS_M5_PARA_DECLARAR_LIMITE_DE_FUENTE))
    for _clave, titulo, palabras in INTERLOCUTOR:
        assert titulo in armada, titulo
        assert palabras[0] in armada, palabras[0]


# ---------------------------------------------------------------------------
# 5. El aviso va en la capa LIMPIA, dentro de «A quien buscar»
def test_el_aviso_va_en_a_quien_buscar_de_la_capa_limpia():
    import inspect

    from flujo import ficha

    fuente = inspect.getsource(ficha)
    i_titulo = fuente.index("<h2>A quien buscar</h2>")
    i_aviso = fuente.index("{bl_sin_buscador}")
    i_dec = fuente.index("Decisores de la planta", i_titulo)
    assert i_titulo < i_aviso < i_dec, (
        "El aviso tiene que ir arriba de los decisores: es la respuesta a la "
        "pregunta que quien lee se hace justo ahi -- por que no hay nombres--."
    )
