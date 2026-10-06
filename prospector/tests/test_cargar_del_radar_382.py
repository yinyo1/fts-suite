"""Las primeras tarjetas que nacen del radar (#382, decision 5).

Lo que estas pruebas cuidan NO es que la carga corra: es que una tarjeta del radar
se pueda DISTINGUIR de una que Esteban abrio a mano, y que su reloj sea el de la
puerta del usuario y no el de la senal. Si las dos cosas se pierden, el lazo 3 suma
peras con manzanas y la correccion de la ventana de 18 meses no mide nada.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "herramientas"))

from flujo import puertas as P                                      # noqa: E402
import cargar_del_radar as cr                                       # noqa: E402

HOY = date(2026, 10, 6)


def test_entran_SOLO_las_de_puerta_de_usuario_abierta():
    """No entran las de EPC -- ahi el interlocutor es el constructor y la mitad esta
    sin identificar-- ni las de licitacion publica, cuyo ciclo no es una tarjeta.

    ERAN SEIS Y SON CINCO desde #384, y el numero bajo por una DECISION, no por un
    arreglo: QSMX tenia la puerta abierta y la corrida humana descubrio que no es
    una planta que compre. Ver `test_las_desmentidas_NO_entran_al_piloto`.
    """
    cuales = cr.las_del_radar()
    assert len(cuales) == 5, [x["senal"]["empresa"] for x in cuales]
    for x in cuales:
        assert x["puerta"]["puerta"] == P.PUERTA_USUARIO
        assert x["puerta"]["estado"] == P.ABIERTA
    nombres = {x["senal"]["empresa"] for x in cuales}
    assert "CFE Nuevo Leon" not in nombres, "una obra publica no es una tarjeta"
    assert "Waelzholz" not in nombres, "esa es puerta de EPC, no de usuario"


def test_las_desmentidas_NO_entran_al_piloto():
    """#384: la puerta abierta dice que la planta COMPRA, no que nos compre.

    QSMX puntuo 93.1 y tenia la puerta de usuario abierta. Es una casa de
    servicios que vende lo mismo que FTS. Abrirle tarjeta habria puesto a la
    vendedora a prospectar a un competidor.
    """
    fuera = cr.desmentidas()
    assert "QSMX" in fuera, "QSMX se declaro fuera del piloto en #384"
    assert fuera["QSMX"]["estado"] == "posible_aliado"
    assert fuera["QSMX"]["razon"], "un desmentido sin razon escrita no sirve"

    nombres = {x["senal"]["empresa"] for x in cr.las_del_radar()}
    assert "QSMX" not in nombres

    # Y la contraprueba: SIN el desmentido si entraria. Sin esto la primera
    # prueba pasaria igual si QSMX hubiera desaparecido de la constancia.
    con_todas = {x["senal"]["empresa"] for x in cr.las_del_radar(fuera={})}
    assert "QSMX" in con_todas, (
        "QSMX sigue en la constancia del radar con su puerta abierta: lo que la "
        "saca es el desmentido, no que el radar la haya dejado de ver")
    assert len(con_todas) == len(nombres) + 1


def test_el_desmentido_exige_razon_y_estado_conocido():
    """Un archivo de desmentidos sin razon es una lista negra, y eso no se audita."""
    import json
    ruta = Path(cr.NO_SON_PROSPECTOS)
    d = json.loads(ruta.read_text(encoding="utf-8"))
    assert d["estados"], "los estados posibles se declaran, no se inventan por fila"
    for c in d["cuentas"]:
        assert c["estado"] in d["estados"], (
            f"{c['empresa']}: estado '{c['estado']}' no esta declarado en `estados`")
        assert len(c.get("razon", "")) > 80, (
            f"{c['empresa']}: la razon tiene que explicar, no etiquetar")
        assert c.get("decidido_por") and c.get("decidido_el"), (
            f"{c['empresa']}: quien lo decidio y cuando son parte del desmentido")


def test_el_orden_es_por_MADUREZ_de_la_puerta_y_Daikin_va_primero():
    """Esteban lo pidio asi: «en el orden de madurez de la puerta (Daikin primero)».
    Daikin tiene la nota mas vieja de las seis -- 360 dias-- y por frescura normal
    seria la ultima; por madurez de la puerta es la primera."""
    cuales = cr.las_del_radar()
    assert cuales[0]["senal"]["empresa"] == "Daikin"
    meses = [x["puerta"]["meses_desde_la_inauguracion"] for x in cuales]
    assert meses == sorted(meses, reverse=True), meses


def test_la_cadencia_sale_de_la_VENTANA_DEL_USUARIO_y_no_de_la_senal():
    """Es la diferencia que hace util a estas tarjetas.

    La caducidad por omision de una senal de obra nueva son 120 dias desde la nota.
    Para esta puerta eso esta al reves: el valor SUBE hasta el mes 18. Daikin lo
    deja a la vista -- nota de 360 dias y aun le quedan meses de su mejor momento--.
    """
    f = cr.filas(HOY)
    for se, ta in zip(f["senales"], f["tarjetas"]):
        assert "ventana de la puerta del usuario" in ta["caduca_por_que"]
        assert "NO son los 120 dias" in ta["caduca_por_que"]
        assert "CRITERIO declarado" in ta["caduca_por_que"]
        # y ninguna nace vencida: su estado se calculo con la misma ventana
        assert ta["estado"] == "abierta"
        assert ta["caduca_el"] > HOY.isoformat(), ta["caduca_el"]
    daikin = f["tarjetas"][0]
    assert daikin["caduca_el"] == "2027-04-11", (
        "18 meses desde la inauguracion del 10-oct-2025")


def test_cada_senal_del_radar_se_marca_como_tal_y_dice_su_puerta():
    f = cr.filas(HOY)
    for se in f["senales"]:
        assert se["origen"] == "radar"
        assert se["puerta"] == "usuario"
        assert se["evaluada"] is True, "una senal sin evaluar no alimenta los lazos"
        assert se["fecha_senal"], "sin fecha el reloj arranca en hoy"


def test_el_esquema_sabe_distinguirlas_y_lo_restringe():
    """Las dos columnas con su CHECK. Sin el CHECK, un `origen = 'radra'` entra y el
    lazo 3 deja de ver esa tarjeta sin que nadie se entere."""
    sql = (RAIZ / "datos" / "esquema-motor3.sql").read_text(encoding="utf-8")
    assert "origen            text NOT NULL DEFAULT 'mano'" in sql
    assert "CHECK (origen IN ('mano', 'radar'))" in sql
    assert "senal_del_radar" in sql, "el lazo 3 lee por ahi"
    for puerta in ("epc", "usuario", "usuario_directo", "licitacion_publica"):
        assert f"'{puerta}'" in sql


def test_el_tablero_tiene_su_seccion_y_dice_por_que_importan():
    tablero = (RAIZ / "herramientas" / "tablero.py").read_text(encoding="utf-8")
    assert "LAS QUE NACIERON DEL RADAR, NO DE LA MANO" in tablero
    assert "'del_radar'" in tablero
    assert "s.origen = 'radar'" in tablero
    # y explica la diferencia de reloj, que es la razon de que esten aparte
    assert "no son los 120 dias" in tablero.lower()
