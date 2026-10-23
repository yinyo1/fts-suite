"""Triple redundancia. Un estado sólo queda 'validado' si pasa V1, V2 y V3.

V1 · resumen del banco: número y suma de cargos y abonos contra la pág. 1 y
     contra el bloque 'Total de Movimientos', y saldo final = inicial + abonos − cargos.
V2 · saldo corrido: recalcular renglón por renglón y comparar contra CADA saldo
     que imprime el banco (operación y liquidación). Cero diferencias.
V3 · continuidad: saldo final del mes N = saldo inicial del mes N+1 (ver continuidad.py).

Todo en Decimal, al centavo. Nada de tolerancias.
"""
from __future__ import annotations

from decimal import Decimal

from .bbva import EstadoParseado
from .util import CERO, fmt


def v1(est: EstadoParseado) -> tuple[bool, dict]:
    movs = est.movimientos
    n_c = sum(1 for m in movs if m.cargo > 0)
    n_a = sum(1 for m in movs if m.abono > 0)
    s_c = sum((m.cargo for m in movs), CERO)
    s_a = sum((m.abono for m in movs), CERO)
    checks = []

    def chk(nombre, esperado, obtenido, pagina):
        ok = esperado == obtenido
        checks.append({"check": nombre, "ok": ok, "banco": str(esperado), "calculado": str(obtenido),
                       "diferencia": str(obtenido - esperado) if isinstance(esperado, Decimal) else obtenido - esperado,
                       "pagina": pagina})

    pr = est.paginas.get("resumen", 1)
    chk("num_cargos_vs_resumen", est.resumen_num_cargos, n_c, pr)
    chk("suma_cargos_vs_resumen", est.resumen_total_cargos, s_c, pr)
    chk("num_abonos_vs_resumen", est.resumen_num_abonos, n_a, pr)
    chk("suma_abonos_vs_resumen", est.resumen_total_abonos, s_a, pr)
    if est.totales_total_cargos is not None:
        pt = est.paginas.get("totales")
        chk("num_cargos_vs_totales", est.totales_num_cargos, n_c, pt)
        chk("suma_cargos_vs_totales", est.totales_total_cargos, s_c, pt)
        chk("num_abonos_vs_totales", est.totales_num_abonos, n_a, pt)
        chk("suma_abonos_vs_totales", est.totales_total_abonos, s_a, pt)
    chk("saldo_final_aritmetico", est.saldo_final,
        est.saldo_inicial + est.resumen_total_abonos - est.resumen_total_cargos, est.paginas.get("saldo_final", 1))
    ok = all(c["ok"] for c in checks) and bool(movs or (est.resumen_num_cargos == 0 and est.resumen_num_abonos == 0))
    falla = next((c for c in checks if not c["ok"]), None)
    return ok, {"checks": checks, "primera_falla": falla,
                "texto": None if ok else _texto_falla(falla, est)}


def _texto_falla(c, est) -> str:
    if not c:
        return "el estado no trae movimientos pero el resumen dice que sí"
    nombres = {
        "num_cargos_vs_resumen": "el número de cargos no cuadra contra la pág. {p}",
        "suma_cargos_vs_resumen": "los cargos no cuadran por ${d} contra la pág. {p}",
        "num_abonos_vs_resumen": "el número de abonos no cuadra contra la pág. {p}",
        "suma_abonos_vs_resumen": "los abonos no cuadran por ${d} contra la pág. {p}",
        "num_cargos_vs_totales": "el número de cargos no cuadra contra 'Total de Movimientos' (pág. {p})",
        "suma_cargos_vs_totales": "los cargos no cuadran por ${d} contra 'Total de Movimientos' (pág. {p})",
        "num_abonos_vs_totales": "el número de abonos no cuadra contra 'Total de Movimientos' (pág. {p})",
        "suma_abonos_vs_totales": "los abonos no cuadran por ${d} contra 'Total de Movimientos' (pág. {p})",
        "saldo_final_aritmetico": "el saldo final impreso no es saldo inicial + abonos − cargos (diferencia ${d}, pág. {p})",
    }
    d = c["diferencia"]
    try:
        d = fmt(abs(Decimal(str(d))))
    except Exception:
        pass
    return nombres[c["check"]].format(d=d, p=c["pagina"])


def v2(est: EstadoParseado) -> tuple[bool, dict]:
    saldo = est.saldo_inicial
    liq_ini = est.saldo_liq_inicial if est.saldo_liq_inicial is not None else est.saldo_inicial
    difs, n_op, n_liq = [], 0, 0
    for i, m in enumerate(est.movimientos):
        saldo = saldo + m.abono - m.cargo
        m.saldo_calculado = saldo
        if m.saldo_operacion_impreso is not None:
            n_op += 1
            if m.saldo_operacion_impreso != saldo:
                difs.append({"renglon": m.renglon, "pagina": m.pagina, "tipo": "operacion",
                             "impreso": str(m.saldo_operacion_impreso), "calculado": str(saldo),
                             "diferencia": str(saldo - m.saldo_operacion_impreso)})
        if m.saldo_liquidacion_impreso is not None:
            n_liq += 1
            corte = m.fecha_operacion
            liq = liq_ini + sum((x.abono - x.cargo for x in est.movimientos
                                 if (x.fecha_liquidacion or x.fecha_operacion) <= corte), CERO)
            if m.saldo_liquidacion_impreso != liq:
                difs.append({"renglon": m.renglon, "pagina": m.pagina, "tipo": "liquidacion",
                             "impreso": str(m.saldo_liquidacion_impreso), "calculado": str(liq),
                             "diferencia": str(liq - m.saldo_liquidacion_impreso)})
    final_ok = (saldo == est.saldo_final)
    if not final_ok:
        difs.append({"renglon": None, "pagina": est.paginas.get("saldo_final", 1), "tipo": "saldo_final",
                     "impreso": str(est.saldo_final), "calculado": str(saldo), "diferencia": str(saldo - est.saldo_final)})
    impresos = sum(1 for m in est.movimientos if m.saldo_operacion_impreso is not None or m.saldo_liquidacion_impreso is not None)
    ok = not difs and impresos > 0 if est.movimientos else not difs
    det = {"saldos_impresos": impresos, "saldos_operacion": n_op, "saldos_liquidacion": n_liq,
           "diferencias": difs[:50], "num_diferencias": len(difs)}
    if est.movimientos and impresos == 0:
        det["texto"] = "no se encontró ningún saldo diario impreso (¿columnas mal leídas?)"
    elif difs:
        d0 = difs[0]
        det["texto"] = (f"el saldo corrido no coincide con el impreso por el banco en la pág. {d0['pagina']}"
                        f" (renglón {d0['renglon']}, {d0['tipo']}, diferencia ${fmt(abs(Decimal(d0['diferencia'])))})")
    return ok, det
