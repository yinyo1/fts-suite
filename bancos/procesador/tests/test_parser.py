from decimal import Decimal

import pytest
from fixtures import Estado, Mov, escenario, pdf_estado

from fts_bancos import bbva, validar


@pytest.mark.parametrize("clave", sorted(escenario().keys()))
def test_cada_estado_sintetico_pasa_v1_y_v2(clave):
    e = escenario()[clave]
    est = bbva.parsear(pdf_estado(e))
    assert est.periodo == f"{e.anio}-{e.mes:02d}"
    assert est.numero_cuenta == e.numero
    ok1, d1 = validar.v1(est)
    ok2, d2 = validar.v2(est)
    assert ok1, d1
    assert ok2, d2
    assert len(est.movimientos) == len(e.movs)
    assert est.moneda == e.moneda


def test_v1_detecta_cargos_que_no_cuadran_contra_totales():
    e = escenario()["general_2026-02"]
    e.corromper_total_cargos = Decimal("10.00")
    est = bbva.parsear(pdf_estado(e))
    ok1, d1 = validar.v1(est)
    assert not ok1
    assert "no cuadran por $10.00" in d1["texto"]


def test_v2_detecta_saldo_impreso_distinto():
    e = escenario()["general_2026-02"]
    e.corromper_saldo_impreso = Decimal("0.01")
    est = bbva.parsear(pdf_estado(e))
    ok2, d2 = validar.v2(est)
    assert not ok2 and d2["num_diferencias"] >= 1


def test_muchas_paginas_y_liquidacion_diferida():
    from fixtures import CUENTAS
    e = Estado(CUENTAS[0]["numero"], CUENTAS[0]["clabe"], 2026, 5, Decimal(1000))
    for d in range(1, 29):
        for k in range(4):
            e.movs.append(Mov(d, "T20" if k % 2 else "T17", [f"MOV {d}-{k}", "LINEA DOS"],
                              abono=Decimal("10.01") if k % 2 else Decimal("0"),
                              cargo=Decimal("0") if k % 2 else Decimal("3.33"), dia_liq=min(d + (k == 0), 31)))
    est = bbva.parsear(pdf_estado(e))
    assert est.num_paginas >= 3
    assert len(est.movimientos) == 112
    assert validar.v1(est)[0]
    ok2, d2 = validar.v2(est)
    assert ok2, d2
    assert d2["saldos_impresos"] == 28


def test_hash_estable():
    e = escenario()["nomina_2026-04"]
    b = pdf_estado(e)
    a1 = bbva.calcular_hashes(bbva.parsear(b), e.numero)
    a2 = bbva.calcular_hashes(bbva.parsear(b), e.numero)
    assert a1 == a2


def test_hoja_imagen_antes_del_estado_se_salta():
    e = escenario()["general_2026-03"]
    e.portada_sin_texto = True
    est = bbva.parsear(pdf_estado(e))
    assert est.periodo == "2026-03" and est.paginas["periodo"] == 2
    assert any("pág. 1 del PDF no tiene texto" in a for a in est.avisos)
    assert validar.v1(est)[0] and validar.v2(est)[0]


def test_mes_sin_movimientos_sin_seccion_de_detalle():
    e = escenario()["usd_2026-03"]
    e.movs = []
    e.sin_detalle = True
    est = bbva.parsear(pdf_estado(e))
    assert est.movimientos == [] and est.saldo_final == est.saldo_inicial
    assert any("sin movimientos" in a for a in est.avisos)
    assert validar.v1(est)[0] and validar.v2(est)[0]


def test_sin_detalle_pero_el_resumen_dice_que_hubo_movimientos_se_rechaza():
    e = escenario()["usd_2026-03"]
    e.sin_detalle = True   # movimientos en el resumen, pero sin sección de detalle
    with pytest.raises(bbva.ErrorParser) as ex:
        bbva.parsear(pdf_estado(e))
    assert ex.value.codigo == "SIN_ENCABEZADO_COLUMNAS"
