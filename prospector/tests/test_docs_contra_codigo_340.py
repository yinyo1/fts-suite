"""Segunda pasada de los docs de metodo contra el codigo. Tarea 5 de #340.

D7 puso la convencion de marcas; esta prueba quita la posibilidad. Cada renglon del
INVENTARIO de abajo dice: *este documento afirma este numero, y este numero lo
produce el codigo asi*. Si el codigo cambia y el documento no -- o al reves-- la
suite truena.

Es la SEPTIMA vez que un numero a mano en un doc no casa con el codigo (#329 conto
cinco, D7 el sexto, B4 el septimo). El acuerdo de esta noche es que sea la ultima, y
la unica forma de sostener un acuerdo asi es una prueba.
"""
import os
import re
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from flujo import aprendizaje, cadencia, importacion_odoo as io, radar
from flujo.catalogo_proyectos import magnitudes

DOCS = os.path.join(RAIZ, "metodo")
CAT = radar.cargar_catalogo()


def _plano(nombre: str) -> str:
    """El doc con los espacios colapsados y sin marcas de cita.

    Sin esto, un `> ` de continuacion de blockquote cae a media frase y una busqueda
    de texto falla por el formato en vez de por el numero -- que es una prueba floja
    disfrazada de estricta--.
    """
    t = open(os.path.join(DOCS, nombre), encoding="utf-8").read()
    # El `>` se quita SOLO cuando es marca de cita. Sin el lookahead, "`>= 60`"
    # perdia su mayor-que y la busqueda fallaba por el formato y no por el numero
    # -- una prueba floja disfrazada de estricta--.
    sin_cita = "\n".join(re.sub(r"^\s*>(?=\s|$)", " ", l)
                         for l in t.splitlines())
    return " ".join(sin_cita.split())


#: (documento, el texto que el doc afirma, el valor que el codigo produce)
#: El texto se busca TAL CUAL en el doc aplanado, y el valor se compara aparte.
#: Asi la prueba falla por dos razones distintas y las dos importan: que el doc
#: dejara de decirlo, o que el codigo dejara de producirlo.
INVENTARIO = [
    ("motor1-radar-de-leads.md", ">= 60 PASA", radar.UMBRAL_PASA, 60),
    ("motor1-radar-de-leads.md", "40-59 GUARDA", radar.UMBRAL_GUARDA, 40),
    ("motor1-radar-de-leads.md", "< 40 ARCHIVA", radar.UMBRAL_GUARDA, 40),
    ("motor1-radar-de-leads.md", "frescura(0-25)", radar.MAX_FRESCURA, 25),
    ("motor1-radar-de-leads.md", "fuerza_de_fuente(0-25)", radar.MAX_FUENTE, 25),
    ("motor1-radar-de-leads.md", "proceso(0-25)", radar.MAX_PROCESO, 25),
    ("motor1-radar-de-leads.md", "capacidad(0-10)", radar.MAX_CAPACIDAD, 10),
    ("motor1-radar-de-leads.md", "padron(0 u 8)", radar.PADRON_EMPATA, 8),
    ("motor3-ciclo-y-aprendizaje.md", "20 cierres", 
     aprendizaje.MINIMO_POR_CELDA_LAZO1, 20),
    ("motor3-ciclo-y-aprendizaje.md", "10 respuestas",
     aprendizaje.MINIMO_POR_TIPO_LAZO3, 10),
    ("motor3-ciclo-y-aprendizaje.md", "`guarda` de 40", radar.UMBRAL_GUARDA, 40),
    ("motor3-ciclo-y-aprendizaje.md", "`pasa` de 60", radar.UMBRAL_PASA, 60),
    ("motor3-ciclo-y-aprendizaje.md", "evento + 15 días",
     io.DIAS_DESPUES_DEL_EVENTO, 15),
    ("motor3-ciclo-y-aprendizaje.md", "60 días por omisión",
     io.CADUCIDAD_POR_OMISION, 60),
    ("motor3-ciclo-y-aprendizaje.md", "2 días hábiles",
     cadencia.SEPARACION_ENTRE_PRIMEROS_TOQUES, 2),
]

#: Los ocho plazos por tipo de senal, contra la tabla del §4b. Dos de ellos -- el
#: respaldo de 30 de la convocatoria y el de 45 del evento-- corrian sin estar
#: escritos hasta el barrido del 28-sep, y un plazo que corre sin estar escrito es
#: un plazo que nadie puede discutir.
PLAZOS_EN_EL_DOC = {
    "convocatoria_abierta": "**30 días** si no se conoce",
    "necesidad_declarada": "**90 días**",
    "obra_nueva": "**120 días**",
    "ampliacion_de_capacidad": "**120 días**",
    "vacante_tecnica": "**45 días**",
    "presencia_en_evento": "**45 días** si no se conoce la fecha del evento",
    "navegacion": "**21 días**",
    "reconocimiento_de_mercado": "**60 días**",
}


def test_los_OCHO_plazos_por_tipo_estan_en_la_tabla_del_4b():
    assert set(PLAZOS_EN_EL_DOC) == set(io.DIAS_POR_TIPO_DE_SENAL), (
        "el codigo tiene tipos que este inventario no cubre, o al reves")
    doc = _plano("motor3-crm-odoo.md")
    for tipo, frase in PLAZOS_EN_EL_DOC.items():
        assert frase in doc, f"el §4b no dice «{frase}» para `{tipo}`"


def test_la_tabla_por_canal_del_4b_casa_con_ESPERA_Y_TOQUES():
    """Si alguien mueve una espera en el codigo, la tabla que Rissia lee queda
    vieja y nadie se entera hasta que un toque sale el dia equivocado."""
    doc = _plano("motor3-crm-odoo.md")
    esperado = {
        ("correo_directo", True): "| `correo_directo` con historia | 5 días | 3 |",
        ("correo_directo", False): "frío (correo confirmado, sin relación) | 7 días | 3 |",
        ("linkedin", False): "| `linkedin` | 10 días | 2 |",
        ("conmutador", False): "| `conmutador` | 7 días | 2 |",
    }
    for llave, fila in esperado.items():
        espera, toques = cadencia.ESPERA_Y_TOQUES[llave]
        assert f"{espera} días | {toques} |" in fila, ("el inventario se "
                                                       f"desalineo en {llave}")
        assert fila in doc, f"el §4b ya no dice «{fila}»"


@pytest.mark.parametrize("doc,frase,valor,esperado", INVENTARIO)
def test_el_doc_dice_el_numero_Y_el_codigo_lo_produce(doc, frase, valor, esperado):
    assert valor == esperado, (
        f"el codigo cambio: {valor} en vez de {esperado}. Actualiza "
        f"metodo/{doc} Y este inventario, en ese orden")
    assert frase in _plano(doc), (
        f"metodo/{doc} ya no dice «{frase}». Si el diseno cambio, el doc y este "
        "inventario se mueven juntos")


def test_el_MAXIMO_que_el_evaluador_puede_producir_esta_bien_escrito():
    """La formula del §3c decia `match_catalogo(0-50)` y sumaba 100. Las dos cosas
    eran falsas despues de D3: `obra_nueva_integral` vale 44.4 y `padron` ni
    aparecia en la formula."""
    integral = radar.peso_de_tipo(radar.TIPO_INTEGRAL_OBRA_NUEVA, CAT)
    maximo = (radar.MAX_PROCESO + integral + radar.MAX_CAPACIDAD
              + radar.MAX_FRESCURA + radar.MAX_FUENTE + radar.PADRON_EMPATA)
    doc = _plano("motor1-radar-de-leads.md")
    assert f"{maximo:g}" in doc, (
        f"el maximo del evaluador es {maximo:g} y el doc no lo dice")
    assert "no 100" in doc, "el doc tiene que decir que NO suma 100"
    # Y el peso integral tiene que estar escrito donde se explica el tope.
    assert f"{integral:g}" in doc


def test_ningun_doc_sigue_diciendo_que_tipo_de_obra_tiene_tope_15():
    """El tope de `MAX_TIPO_DE_OBRA` es POR FAMILIA. Escribir «0-15» a secas es lo
    que D7 encontro y el barrido de esta noche revisa que no haya vuelto."""
    integral = radar.peso_de_tipo(radar.TIPO_INTEGRAL_OBRA_NUEVA, CAT)
    assert integral > radar.MAX_TIPO_DE_OBRA
    for nombre in ("motor1-radar-de-leads.md", "linea-base-del-radar.md",
                   "motor3-ciclo-y-aprendizaje.md"):
        doc = _plano(nombre)
        for mentira in ("match_catalogo(0-50)", "Tipo de obra | 0-15 |",
                        "tipo_de_obra(0-15)"):
            assert mentira not in doc, f"{nombre} dice «{mentira}»"


def test_ningun_doc_sigue_diciendo_que_capacidad_por_tipo_esta_VACIO():
    """B4 se cerro. Un doc que siga diciendo que el catalogo no trae rangos manda a
    alguien a arreglar algo que ya esta arreglado."""
    assert CAT.get("capacidad_por_tipo"), "B4 se reabrio"
    for nombre in ("motor1-radar-de-leads.md", "linea-base-del-radar.md"):
        doc = _plano(nombre)
        assert "viene **vacío** en el catálogo" not in doc, nombre
        assert "nunca ha corrido" not in doc, (
            f"{nombre} sigue diciendo que el corte por arriba nunca ha corrido")


def test_el_doc_de_la_linea_base_cuenta_las_senales_QUE_HAY():
    """El doc se regenera; el numero de cuentas con senal NO se escribe a mano.

    La version anterior de esta prueba fijaba el numero (10 con senal, 3 huecos)
    y por eso se rompio en #353 al documentar dos senales nuevas -- Qualtia y el
    evento de camara de Metalsa--. Fijar el CONTEO es fijar el inventario, que
    es justo lo que va a seguir creciendo. Lo que hay que fijar es que el doc
    diga lo que el dato dice HOY, y que no se quede diciendo un numero viejo.
    """
    import json
    sen = json.load(open(os.path.join(RAIZ, "datos", "senales-documentadas.json"),
                         encoding="utf-8"))
    con_senal = sum(1 for c in sen["cuentas"] if c.get("fuente"))
    huecos = sum(1 for c in sen["cuentas"] if not c.get("fuente"))
    assert con_senal >= 10 and huecos >= 2, (con_senal, huecos)
    doc = _plano("linea-base-del-radar.md")
    assert f"{con_senal} con senal documentada · {huecos} huecos" in doc, (
        f"el doc no dice «{con_senal} con senal documentada · {huecos} huecos». "
        f"Se regenera con `linea_base_radar.py --actualizar-doc "
        f"metodo/linea-base-del-radar.md`"
    )
    for viejo in ("3 de 9", "6 de 9", "3 de 10", "4 huecos",
                  "de las nueve señales"):
        assert viejo not in doc, f"el doc sigue diciendo «{viejo}»"


def test_los_ejemplos_del_doc_del_radar_siguen_marcados():
    """La convencion de D7: todo ejemplo con numeros dice de donde salio."""
    doc = _plano("motor1-radar-de-leads.md")
    assert "[calculado]" in doc and "[razonado a mano]" in doc
    # El ejemplo del §3d cita la herramienta, no una cuenta a mano.
    assert "linea_base_radar.py" in doc


def test_el_ejemplo_del_3d_coincide_con_lo_que_la_herramienta_calcula_HOY():
    """El numero que D7 arreglo. Si el evaluador cambia y el §3d no, truena aqui."""
    sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
    import linea_base_radar as lb
    r = lb.linea_base()
    durango = next(f for f in r["filas"]
                   if f.get("planta") == "Durango" and not f["hueco"])
    doc = _plano("motor1-radar-de-leads.md")
    assert f"{durango['por_etapa']['con_d6']:g}" in doc, (
        f"el §3d no dice {durango['por_etapa']['con_d6']:g}")


def test_la_separacion_de_D8_esta_en_el_doc_del_motor3_o_en_ninguno():
    """D8 vive en `cadencia.py`. Si ningun doc la explica, la regla es invisible
    para quien lea el metodo -- y una regla invisible se rompe sin querer--."""
    assert cadencia.SEPARACION_ENTRE_PRIMEROS_TOQUES == 2
    docs = " ".join(_plano(n) for n in os.listdir(DOCS) if n.endswith(".md"))
    assert "2 días hábiles" in docs or "2 dias habiles" in docs, (
        "ningun doc de metodo explica el escalonamiento de D8")
