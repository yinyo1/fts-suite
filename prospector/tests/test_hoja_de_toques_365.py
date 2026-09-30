"""La hoja que llena Rissia, y el puente que la carga a la base (#365).

QUE SE FIJA AQUI, y por que cada cosa:

  1. las dos tablas de traduccion. La hoja habla en castellano de oficina
     («respondio») y la base en enum («respuesta_positiva»). Si una de las dos se
     mueve sin la otra, la hoja empieza a rechazar filas correctas -- o peor, la
     base recibe una palabra que no conoce--.
  2. la reja de datos personales. La hoja viaja por OneDrive, que es el canal que
     nadie audita, y la columna `puesto` es la que un dia va a traer un nombre.
  3. UNA FILA ES UNA SOLA SENTENCIA. Esto no es elegancia: la primera version
     mandaba tres llamadas de psql por fila y la prueba de #365 dejo un `toque`
     sin destinatario en la base cuando la segunda paso y la tercera no corrio.
     Un toque sin destinatario se ve, en el tablero del viernes, igual que trabajo
     hecho. La prueba mira la forma del SQL porque el defecto vivia en la forma.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "herramientas"))

import cargar_toques as ct                                       # noqa: E402
from paquete_semana1 import (CANALES_DE_LA_HOJA,                 # noqa: E402
                             RESULTADOS_DE_LA_HOJA,
                             COLUMNAS_DE_LA_HOJA)


# --------------------------------------------------- 1 · las dos traducciones
def test_los_canales_de_la_hoja_existen_en_el_enum():
    sql = (RAIZ / "datos" / "esquema-motor3.sql").read_text(encoding="utf-8")
    bloque = sql[sql.index("CREATE TYPE canal_de_toque"):]
    bloque = bloque[:bloque.index(");")]
    for humano, enum in CANALES_DE_LA_HOJA.items():
        assert f"'{enum}'" in bloque, (
            f"la hoja ofrece «{humano}» -> {enum}, y el enum del esquema no lo "
            "tiene. Rissia escogeria de la lista y la carga lo rechazaria")


def test_los_resultados_de_la_hoja_existen_en_el_enum():
    sql = (RAIZ / "datos" / "esquema-motor3.sql").read_text(encoding="utf-8")
    bloque = sql[sql.index("CREATE TYPE resultado_de_toque"):]
    bloque = bloque[:bloque.index(");")]
    for humano, enum in RESULTADOS_DE_LA_HOJA.items():
        assert f"'{enum}'" in bloque, (
            f"la hoja ofrece «{humano}» -> {enum} y el enum no lo tiene")


def test_reunion_agendada_esta_en_la_hoja():
    # Es el mejor desenlace que el piloto puede producir. Si la hoja no lo ofrece,
    # una reunion se registra como «respondio» y el lazo 3 pierde justo la senal
    # que mide.
    assert RESULTADOS_DE_LA_HOJA["reunion"] == "reunion_agendada"


def test_la_hoja_no_tiene_columna_de_nombre_ni_de_correo():
    # COLUMNAS_DE_LA_HOJA es (nombre, ayuda): aqui se miran los NOMBRES. La
    # ayuda de `puesto` dice «NO su nombre», que es justo lo contrario.
    bajas = [str(c[0]).lower() for c in COLUMNAS_DE_LA_HOJA]
    for prohibida in ("nombre", "correo", "email", "telefono", "celular"):
        assert not any(prohibida in c for c in bajas), (
            f"la hoja tiene una columna con «{prohibida}»: el lazo no lo necesita "
            "y OneDrive no es donde se guarda un dato personal")


# ------------------------------------------------ 2 · la reja de lo personal
def test_un_correo_en_el_puesto_se_rechaza():
    assert "correo" in ct.parece_dato_personal("compras@empresa.com.mx")


def test_tres_palabras_capitalizadas_se_rechazan():
    assert "nombre" in ct.parece_dato_personal("Juan Carlos Perez")


def test_un_puesto_normal_pasa():
    for bueno in ("Gerente de Mantenimiento", "Plant Manager",
                  "Supervisor de planta", "Jefe de Compras",
                  "Sr. Regional RME Manager"):
        assert ct.parece_dato_personal(bueno) == "", bueno


# ------------------------------------------------------ 3 · validar sin base
CUENTAS = {
    "hershey|escobedo": {"cuenta_id": 1, "tarjeta_id": 11, "estado": "abierta"},
    "hershey|": {"cuenta_id": 1, "tarjeta_id": 11, "estado": "abierta"},
    "ragasa|monterrey": {"cuenta_id": 2, "tarjeta_id": None, "estado": None},
    "ragasa|": {"cuenta_id": 2, "tarjeta_id": None, "estado": None},
}


def _fila(**kw):
    base = {"_fila": 6, "fecha": "2026-10-01", "cuenta": "Hershey",
            "planta": "Escobedo", "puesto": "Gerente de Mantenimiento",
            "canal": "correo", "resultado": "respondio", "nota": ""}
    base.update(kw)
    return base


def test_una_fila_buena_pasa_y_se_traduce():
    buenas, problemas = ct.validar([_fila()], CUENTAS)
    assert not problemas
    assert buenas[0]["canal"] == "correo_directo"
    assert buenas[0]["resultado"] == "respuesta_positiva"
    assert buenas[0]["tarjeta_id"] == 11


def test_un_canal_invalido_se_rechaza_con_la_lista_de_validos():
    buenas, problemas = ct.validar([_fila(canal="whatsapp")], CUENTAS)
    assert not buenas and len(problemas) == 1
    assert "whatsapp" in problemas[0]["que"]
    # El mensaje tiene que DECIR cuales son, no solo que ese no es: quien lo lee
    # no tiene el codigo enfrente.
    for valido in CANALES_DE_LA_HOJA:
        assert valido in problemas[0]["como"]


def test_una_cuenta_que_no_existe_se_rechaza():
    _, problemas = ct.validar([_fila(cuenta="Sigma", planta="Monterrey")],
                              CUENTAS)
    assert "no esta en el piloto" in problemas[0]["que"]


def test_una_cuenta_sin_tarjeta_abierta_se_rechaza():
    _, problemas = ct.validar([_fila(cuenta="Ragasa", planta="Monterrey")],
                              CUENTAS)
    assert "tarjeta ABIERTA" in problemas[0]["que"]


def test_una_fecha_ilegible_se_rechaza():
    _, problemas = ct.validar([_fila(fecha="2 de octubre")], CUENTAS)
    assert "no se pudo leer" in problemas[0]["que"]


def test_un_nombre_en_el_puesto_se_rechaza_antes_de_llegar_a_la_base():
    _, problemas = ct.validar([_fila(puesto="Juan Carlos Perez")], CUENTAS)
    assert "nombre completo" in problemas[0]["que"]


def test_una_fila_mala_no_arrastra_a_las_buenas():
    filas = [_fila(_fila=6), _fila(_fila=7, canal="whatsapp"), _fila(_fila=8)]
    buenas, problemas = ct.validar(filas, CUENTAS)
    assert [b["fila"] for b in buenas] == [6, 8]
    assert [p["fila"] for p in problemas] == [7]


# ------------------------------- 4 · una fila es una sola sentencia (atomica)
class BaseDeMentira:
    """Anota el SQL que recibe. No habla con Postgres."""

    def __init__(self):
        self.sql = []

    def correr(self, sql):
        self.sql.append(sql)
        if "INSERT" in sql.upper():
            # lo que `cargar` espera leer: id|n|destinatarios|contactos
            return "7|1|1|1\n"
        return "0\n"                       # el conteo de huerfanos


def test_una_fila_es_UNA_sola_llamada_a_la_base():
    b = BaseDeMentira()
    buenas = ct.validar([_fila()], CUENTAS)[0]
    # `cargar` cierra midiendo los huerfanos, que es otra consulta: la que importa
    # es que las ESCRITURAS de la fila vayan juntas.
    ct.cargar(b, buenas)
    escrituras = [s for s in b.sql if "INSERT" in s.upper()]
    assert len(escrituras) == 1, (
        "las escrituras de una fila se partieron en varias sentencias: "
        f"{len(escrituras)}. Cada sentencia es una transaccion, y si una pasa y "
        "la siguiente no, la base se queda con un toque sin destinatario -- que "
        "es exactamente el defecto que se encontro en #365--")
    una = escrituras[0]
    for tabla in ("motor3.contacto", "motor3.toque",
                  "motor3.toque_destinatario"):
        assert f"INTO {tabla}" in una, f"{tabla} quedo fuera de la sentencia"


def test_la_sentencia_no_pone_nombre_al_contacto():
    b = BaseDeMentira()
    ct.cargar(b, ct.validar([_fila()], CUENTAS)[0])
    una = [s for s in b.sql if "INSERT" in s.upper()][0]
    # nombre explicitamente NULL: el contacto existe para el lazo, no para nadie.
    assert re.search(r"nombre,\s*puesto", una)
    assert "NULL" in una


def test_cargar_reporta_huerfanos():
    b = BaseDeMentira()
    r = ct.cargar(b, ct.validar([_fila()], CUENTAS)[0])
    assert "huerfanos" in r, (
        "la carga tiene que decir cuantos toques sin destinatario hay en la base: "
        "es lo que ensucia el tablero sin avisar")
