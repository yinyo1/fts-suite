"""Cotejo del banco (PDF) contra Odoo. SOLO LECTURA del lado de Odoo: las líneas
llegan ya leídas por n8n (nodo Odoo, credencial 'Odoo FTS'); aquí no hay ni un
token de Odoo ni una escritura hacia Odoo.

Regla: misma cuenta (journal) + fecha ±3 días + monto exacto (+ referencia).
  exacto    = monto exacto, |Δfecha| ≤ 3 y la referencia coincide
  probable  = monto exacto, |Δfecha| ≤ 3, sin coincidencia de referencia
  sin_match = nada de lo anterior
Asignación uno a uno, primero los que coinciden en referencia y luego por Δfecha.
Lo que sobra de Odoo se reporta como 'odoo_sin_banco'.
"""
from __future__ import annotations

import html
import json
import re
from datetime import date
from decimal import Decimal

from .util import fmt

VENTANA_DIAS = 3


def _tokens(*textos) -> set[str]:
    out = set()
    for t in textos:
        for tok in re.findall(r"[A-Z0-9]{5,}", (t or "").upper()):
            if not re.fullmatch(r"\d{10,}", tok):   # cuentas/CLABE no cuentan como referencia
                out.add(tok.lstrip("0") or tok)
    return out


def cotejar(con, corrida_id: int, lineas_odoo: list[dict], desde: str, hasta: str) -> dict:
    with con.cursor() as cur:
        cur.execute("SELECT id, journal_odoo, alias, banco, numero_mask, moneda FROM bancos.cuentas WHERE journal_odoo IS NOT NULL")
        cuentas = {r["journal_odoo"]: r for r in cur.fetchall()}
        cur.execute("""SELECT m.id, m.cuenta_id, m.fecha_operacion, m.descripcion, m.referencia, m.cargo, m.abono, m.pagina,
                              a.nombre_canonico, e.periodo, cu.journal_odoo
                       FROM bancos.movimientos m JOIN bancos.estados e ON e.id=m.estado_id
                       JOIN bancos.archivos a ON a.id=e.archivo_id JOIN bancos.cuentas cu ON cu.id=m.cuenta_id
                       WHERE a.estado='validado' AND m.fecha_operacion BETWEEN %s AND %s AND cu.journal_odoo IS NOT NULL
                       ORDER BY m.cuenta_id, m.fecha_operacion, m.id""", (desde, hasta))
        movs = cur.fetchall()
    por_journal: dict[int, list] = {}
    for l in lineas_odoo:
        l = dict(l)
        l["_monto"] = Decimal(str(l["amount"])).quantize(Decimal("0.01"))
        l["_fecha"] = date.fromisoformat(str(l["date"])[:10])
        l["_tok"] = _tokens(l.get("ref"), l.get("name"), l.get("move_name"), l.get("payment_ref"))
        l["_usada"] = False
        por_journal.setdefault(int(l["journal_id"]), []).append(l)
    pares = []
    for m in movs:
        neto = m["abono"] - m["cargo"]
        tok_b = _tokens(m["descripcion"], m["referencia"])
        for l in por_journal.get(m["journal_odoo"], []):
            if l["_monto"] != neto:
                continue
            dd = (l["_fecha"] - m["fecha_operacion"]).days
            if abs(dd) > VENTANA_DIAS:
                continue
            ref = bool(tok_b & l["_tok"])
            pares.append((0 if ref else 1, abs(dd), m["id"], l.get("line_id"), m, l, dd, ref))
    pares.sort(key=lambda x: x[:4])
    asignado: dict[int, tuple] = {}
    for _, _, mid, _, m, l, dd, ref in pares:
        if mid in asignado or l["_usada"]:
            continue
        l["_usada"] = True
        asignado[mid] = (l, dd, ref)
    filas = []
    with con.cursor() as cur:
        for m in movs:
            neto = m["abono"] - m["cargo"]
            if m["id"] in asignado:
                l, dd, ref = asignado[m["id"]]
                est = "exacto" if ref else "probable"
                cur.execute("""INSERT INTO bancos.cotejo_odoo (corrida_id, movimiento_id, journal_id, odoo_line_id, odoo_move_id,
                                 odoo_payment_id, odoo_fecha, odoo_monto, odoo_ref, estado, dif_dias, dif_monto, detalle)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (corrida_id, m["id"], m["journal_odoo"], l.get("line_id"), l.get("move_id"), l.get("payment_id"),
                             l["_fecha"], l["_monto"], (l.get("ref") or l.get("name") or "")[:200], est, dd, Decimal("0.00"),
                             json.dumps({"move_name": l.get("move_name")})))
            else:
                est = "sin_match"
                cur.execute("""INSERT INTO bancos.cotejo_odoo (corrida_id, movimiento_id, journal_id, estado)
                               VALUES (%s,%s,%s,'sin_match')""", (corrida_id, m["id"], m["journal_odoo"]))
            filas.append({**m, "neto": neto, "estado": est, "odoo": asignado.get(m["id"])})
        sobran, fuera = [], 0
        cubiertos = {(m["journal_odoo"], m["periodo"]) for m in movs}
        for j, ls in por_journal.items():
            for l in ls:
                if not l["_usada"] and (j, l["_fecha"].strftime("%Y-%m")) not in cubiertos:
                    fuera += 1          # journal/mes sin estado de cuenta cargado: no se puede afirmar nada
                    continue
                if not l["_usada"]:
                    sobran.append(l)
                    cur.execute("""INSERT INTO bancos.cotejo_odoo (corrida_id, journal_id, odoo_line_id, odoo_move_id, odoo_payment_id,
                                     odoo_fecha, odoo_monto, odoo_ref, estado, detalle)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'odoo_sin_banco',%s)""",
                                (corrida_id, j, l.get("line_id"), l.get("move_id"), l.get("payment_id"), l["_fecha"], l["_monto"],
                                 (l.get("ref") or l.get("name") or "")[:200], json.dumps({"move_name": l.get("move_name")})))
    r = resumir(filas, sobran, cuentas, desde, hasta)
    r["odoo_sin_estado_de_cuenta_cargado"] = fuera
    return r


def resumir(filas, sobran, cuentas, desde, hasta) -> dict:
    grupos: dict = {}
    for f in filas:
        k = (f["journal_odoo"], f["periodo"])
        g = grupos.setdefault(k, {"journal": f["journal_odoo"], "periodo": f["periodo"], "archivo": f["nombre_canonico"],
                                   "n": 0, "dinero": Decimal("0"), "exacto": Decimal("0"), "probable": Decimal("0"),
                                   "n_exacto": 0, "n_probable": 0, "n_sin": 0, "dinero_sin": Decimal("0")})
        g["n"] += 1
        g["dinero"] += abs(f["neto"])
        if f["estado"] == "exacto":
            g["exacto"] += abs(f["neto"]); g["n_exacto"] += 1
        elif f["estado"] == "probable":
            g["probable"] += abs(f["neto"]); g["n_probable"] += 1
        else:
            g["n_sin"] += 1; g["dinero_sin"] += abs(f["neto"])
    tabla = []
    for (j, p), g in sorted(grupos.items()):
        c = cuentas.get(j, {})
        pct = (g["exacto"] + g["probable"]) / g["dinero"] * 100 if g["dinero"] else Decimal("0")
        tabla.append({**{k: (str(v) if isinstance(v, Decimal) else v) for k, v in g.items()},
                      "cuenta": f"{c.get('banco','')} {c.get('alias','')} {c.get('numero_mask','')}",
                      "moneda": c.get("moneda"), "pct_en_odoo": f"{pct:.1f}"})
    return {"desde": desde, "hasta": hasta, "por_cuenta_mes": tabla, "movimientos": len(filas),
            "exactos": sum(1 for f in filas if f["estado"] == "exacto"),
            "probables": sum(1 for f in filas if f["estado"] == "probable"),
            "sin_match": sum(1 for f in filas if f["estado"] == "sin_match"),
            "odoo_sin_banco": len(sobran), "_filas": filas, "_sobran": sobran}


def html_reporte(res: dict, generado: str) -> str:
    e = html.escape
    css = """body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:24px;color:#1b1f23;background:#fff}
h1{font-size:20px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0}
th,td{border:1px solid #d0d7de;padding:4px 6px;text-align:left}td.n{text-align:right;font-variant-numeric:tabular-nums}
th{background:#f3f4f6}.src{color:#57606a;font-size:11px}.ok{color:#1a7f37}.warn{color:#9a6700}.bad{color:#cf222e}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}th{background:#161b22}th,td{border-color:#30363d}.src{color:#8b949e}}"""
    H = [f"<!doctype html><html lang='es'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
         f"<title>Cotejo banco vs Odoo</title><style>{css}</style></head><body>",
         f"<h1>Cotejo banco (PDF) contra Odoo · {e(res['desde'])} a {e(res['hasta'])}</h1>",
         f"<p class='src'>Generado {e(generado)} por fts-bancos. Odoo se leyó en modo solo lectura. Regla: misma cuenta, fecha ±{VENTANA_DIAS} días, monto exacto; "
         f"'exacto' además coincide la referencia. Cada cifra del banco indica su archivo y página de origen.</p>",
         f"<p>Movimientos del banco: <b>{res['movimientos']}</b> · exactos <b class='ok'>{res['exactos']}</b> · probables "
         f"<b class='warn'>{res['probables']}</b> · sin registro en Odoo <b class='bad'>{res['sin_match']}</b> · registros de Odoo sin banco "
         f"<b class='bad'>{res['odoo_sin_banco']}</b></p>",
         "<h2>Por cuenta y mes: % del dinero del banco que existe en Odoo</h2><table><tr><th>cuenta</th><th>mes</th><th>mov.</th>"
         "<th>dinero banco</th><th>exacto</th><th>probable</th><th>% en Odoo</th><th>sin Odoo (#)</th><th>origen</th></tr>"]
    for g in res["por_cuenta_mes"]:
        H.append(f"<tr><td>{e(g['cuenta'])}</td><td>{e(g['periodo'])}</td><td class='n'>{g['n']}</td>"
                 f"<td class='n'>{fmt(Decimal(g['dinero']))}</td><td class='n'>{fmt(Decimal(g['exacto']))}</td>"
                 f"<td class='n'>{fmt(Decimal(g['probable']))}</td><td class='n'><b>{g['pct_en_odoo']}%</b></td>"
                 f"<td class='n'>{g['n_sin']}</td><td class='src'>{e(g['archivo'] or '')}</td></tr>")
    H.append("</table><h2>Movimientos del banco sin registro en Odoo</h2><table><tr><th>fecha</th><th>descripción</th>"
             "<th>cargo</th><th>abono</th><th>archivo · página</th></tr>")
    for f in [f for f in res["_filas"] if f["estado"] == "sin_match"]:
        H.append(f"<tr><td>{f['fecha_operacion']}</td><td>{e(f['descripcion'][:120])}</td><td class='n'>{fmt(f['cargo']) if f['cargo'] else ''}</td>"
                 f"<td class='n'>{fmt(f['abono']) if f['abono'] else ''}</td><td class='src'>{e(f['nombre_canonico'] or '')} · p. {f['pagina']}</td></tr>")
    H.append("</table><h2>Coincidencias con diferencia de fecha</h2><table><tr><th>fecha banco</th><th>fecha Odoo</th><th>Δ días</th>"
             "<th>monto</th><th>Odoo</th><th>archivo · página</th></tr>")
    for f in [f for f in res["_filas"] if f["odoo"] and f["odoo"][1] != 0]:
        l, dd, _ = f["odoo"]
        H.append(f"<tr><td>{f['fecha_operacion']}</td><td>{l['_fecha']}</td><td class='n'>{dd:+d}</td><td class='n'>{fmt(f['neto'])}</td>"
                 f"<td>{e(str(l.get('move_name') or l.get('ref') or ''))}</td><td class='src'>{e(f['nombre_canonico'] or '')} · p. {f['pagina']}</td></tr>")
    H.append("</table><h2>Registros de Odoo sin movimiento en el banco</h2><p class='src'>Posibles duplicados, o pagados por otro medio.</p>"
             "<table><tr><th>journal</th><th>fecha</th><th>monto</th><th>asiento</th><th>referencia</th></tr>")
    for l in res["_sobran"]:
        H.append(f"<tr><td>{l['journal_id']}</td><td>{l['_fecha']}</td><td class='n'>{fmt(l['_monto'])}</td>"
                 f"<td>{e(str(l.get('move_name') or ''))}</td><td>{e(str(l.get('ref') or l.get('name') or '')[:80])}</td></tr>")
    H.append("</table></body></html>")
    return "\n".join(H)
