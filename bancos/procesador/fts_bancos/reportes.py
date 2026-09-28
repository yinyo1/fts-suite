"""Salidas: base maestra (CSV + XLSX), diccionario de datos y LEEME.

Deterministas: mismo contenido de la base ⇒ mismos bytes de CSV (orden total
por cuenta, fecha, renglón y hash). El XLSX fija su fecha de creación para que
tampoco cambie entre corridas.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from .util import NOMBRE_MES, fmt, rango_periodos, sha256_bytes

COLUMNAS = [
    ("cuenta", "Banco, alias y últimos 4 dígitos de la cuenta (el número completo vive sólo en Postgres)"),
    ("moneda", "Moneda original del movimiento (MXN o USD). Nunca se convierte"),
    ("periodo", "Mes del estado de cuenta (AAAA-MM), tomado de 'Periodo DEL … AL …' de la pág. 1"),
    ("fecha_operacion", "Fecha de operación impresa (columna OPER)"),
    ("fecha_liquidacion", "Fecha de liquidación impresa (columna LIQ)"),
    ("codigo", "Código BBVA del movimiento (T17 SPEI enviado, T20 SPEI recibido, S39 comisión, S40 IVA de comisión…)"),
    ("descripcion", "Descripción impresa, con sus renglones de continuación"),
    ("referencia", "Referencia extraída de la descripción (Ref. … o BNET …)"),
    ("cargo", "Importe en la columna CARGOS (salida), positivo"),
    ("abono", "Importe en la columna ABONOS (entrada), positivo"),
    ("neto", "abono − cargo"),
    ("saldo_calculado", "Saldo recalculado renglón por renglón desde el saldo inicial"),
    ("saldo_impreso", "Saldo de operación que imprime el banco (sólo al cierre de cada día)"),
    ("categoria", "Clasificación por reglas: cobro_cliente, pago_proveedor, nomina, impuestos_sat, seguridad_social, comision_bancaria, credito_financiamiento, traspaso_interno, sin_clasificar"),
    ("subcategoria", "Detalle de la categoría (p. ej. General→Nomina)"),
    ("contraparte", "Contraparte conocida por regla (SAT, IMSS, cuenta propia…)"),
    ("es_traspaso_interno", "Sí = movimiento entre cuentas propias; se EXCLUYE del gasto y del ingreso"),
    ("par_traspaso", "id del movimiento pareja en la otra cuenta propia (mismo monto y fecha)"),
    ("regla", "Regla que decidió la clasificación"),
    ("confianza", "0 a 1"),
    ("validacion", "V1/V2/V3 del estado de origen"),
    ("archivo", "Nombre canónico del PDF de origen en OneDrive"),
    ("pagina", "Página del PDF donde está el renglón"),
    ("renglon", "Número de renglón dentro del estado"),
    ("id", "id del movimiento en bancos.movimientos"),
    ("hash", "sha256 del movimiento (idempotencia: reprocesar da el mismo hash)"),
]

SQL_BASE = """
SELECT m.id, cu.banco, cu.alias, cu.numero_mask, cu.moneda, e.periodo, m.fecha_operacion, m.fecha_liquidacion, m.codigo,
       m.descripcion, m.referencia, m.cargo, m.abono, m.saldo_calculado, m.saldo_operacion_impreso,
       c.categoria, c.subcategoria, c.contraparte, c.es_traspaso_interno, c.par_traspaso_id, c.regla, c.confianza,
       e.v1_ok, e.v2_ok, (SELECT resultado FROM bancos.validaciones_v3 v WHERE v.estado_id=e.id ORDER BY v.id DESC LIMIT 1) AS v3,
       a.nombre_canonico, m.pagina, m.renglon, m.hash
FROM bancos.movimientos m
JOIN bancos.estados e ON e.id = m.estado_id
JOIN bancos.archivos a ON a.id = e.archivo_id
JOIN bancos.cuentas cu ON cu.id = m.cuenta_id
LEFT JOIN bancos.clasificacion_vigente c ON c.movimiento_id = m.id
WHERE a.estado = 'validado'
ORDER BY cu.id, m.fecha_operacion, e.periodo, m.renglon, m.hash
"""


def filas_base(con) -> list[dict]:
    with con.cursor() as cur:
        cur.execute(SQL_BASE)
        out = []
        for r in cur.fetchall():
            out.append({
                "cuenta": f"{r['banco']} {r['alias']} {r['numero_mask']}", "moneda": r["moneda"], "periodo": r["periodo"],
                "fecha_operacion": r["fecha_operacion"].isoformat(),
                "fecha_liquidacion": r["fecha_liquidacion"].isoformat() if r["fecha_liquidacion"] else "",
                "codigo": r["codigo"] or "", "descripcion": r["descripcion"], "referencia": r["referencia"] or "",
                "cargo": f"{r['cargo']:.2f}", "abono": f"{r['abono']:.2f}", "neto": f"{r['abono'] - r['cargo']:.2f}",
                "saldo_calculado": f"{r['saldo_calculado']:.2f}",
                "saldo_impreso": f"{r['saldo_operacion_impreso']:.2f}" if r["saldo_operacion_impreso"] is not None else "",
                "categoria": r["categoria"] or "sin_clasificar", "subcategoria": r["subcategoria"] or "",
                "contraparte": r["contraparte"] or "", "es_traspaso_interno": "si" if r["es_traspaso_interno"] else "no",
                "par_traspaso": str(r["par_traspaso_id"] or ""), "regla": r["regla"] or "",
                "confianza": f"{r['confianza']:.3f}" if r["confianza"] is not None else "",
                "validacion": f"V1 {'ok' if r['v1_ok'] else 'X'} · V2 {'ok' if r['v2_ok'] else 'X'} · V3 {r['v3'] or '?'}",
                "archivo": r["nombre_canonico"] or "", "pagina": str(r["pagina"]), "renglon": str(r["renglon"]),
                "id": str(r["id"]), "hash": r["hash"],
            })
        return out


def csv_bytes(filas: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=[c for c, _ in COLUMNAS], lineterminator="\n")
    w.writeheader()
    for f in filas:
        w.writerow(f)
    return ("﻿" + buf.getvalue()).encode("utf-8")


def xlsx_bytes(filas: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "movimientos"
    cols = [c for c, _ in COLUMNAS]
    ws.append(cols)
    for c in ws[1]:
        c.font = Font(bold=True)
    num = {"cargo", "abono", "neto", "saldo_calculado", "saldo_impreso", "confianza"}
    for f in filas:
        ws.append([float(f[c]) if c in num and f[c] != "" else f[c] for c in cols])
    for i, c in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(i)].width = 14 if c not in ("descripcion", "hash", "archivo") else 48
        if c in num:
            for cell in ws.iter_cols(min_col=i, max_col=i, min_row=2):
                for x in cell:
                    x.number_format = "#,##0.00"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    d = wb.create_sheet("diccionario")
    d.append(["columna", "significado"])
    for c, s in COLUMNAS:
        d.append([c, s])
    fijo = datetime(2026, 1, 1)
    wb.properties.created = fijo
    wb.properties.modified = fijo
    wb.properties.creator = "fts-bancos"
    buf = io.BytesIO()
    wb.save(buf)
    return _zip_determinista(buf.getvalue())


def _zip_determinista(b: bytes) -> bytes:
    """openpyxl estampa la hora en cada entrada del ZIP: se reescribe con fecha fija."""
    import zipfile
    src = zipfile.ZipFile(io.BytesIO(b))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for i in src.infolist():
            zi = zipfile.ZipInfo(i.filename, date_time=(2026, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = i.external_attr
            datos = src.read(i.filename)
            if i.filename == "docProps/core.xml":
                import re as _re
                datos = _re.sub(rb"(<dcterms:modified[^>]*>)[^<]*(</dcterms:modified>)", rb"\g<1>2026-01-01T00:00:00Z\g<2>", datos)
            z.writestr(zi, datos)
    return out.getvalue()


def diccionario_md() -> str:
    lineas = ["# Diccionario de datos · base maestra de transacciones", "",
              "Un renglón por movimiento de todas las cuentas. Sólo entran estados que pasaron V1 y V2.", "",
              "| columna | significado |", "|---|---|"]
    lineas += [f"| `{c}` | {s} |" for c, s in COLUMNAS]
    return "\n".join(lineas) + "\n"


def leeme_md(con, generado: str) -> str:
    with con.cursor() as cur:
        cur.execute("SELECT * FROM bancos.cuentas WHERE activa ORDER BY id")
        cuentas = cur.fetchall()
        cur.execute("""SELECT a.*, e.v1_ok, e.v2_ok, e.saldo_inicial, e.saldo_final,
                         (SELECT resultado FROM bancos.validaciones_v3 v WHERE v.estado_id=e.id ORDER BY v.id DESC LIMIT 1) AS v3
                       FROM bancos.archivos a LEFT JOIN bancos.estados e ON e.archivo_id=a.id
                       ORDER BY a.cuenta_id NULLS LAST, a.periodo NULLS LAST, a.id""")
        archivos = cur.fetchall()
        cur.execute("""SELECT h.*, c.alias, c.banco, c.numero_mask FROM bancos.huecos h JOIN bancos.cuentas c ON c.id=h.cuenta_id
                       WHERE h.resuelto_en IS NULL ORDER BY c.id, h.periodo""")
        huecos = cur.fetchall()
        cur.execute("""SELECT d.*, a.nombre_original, b.nombre_canonico AS original
                       FROM bancos.duplicados_logicos d JOIN bancos.estados e ON e.id=d.estado_id JOIN bancos.archivos a ON a.id=e.archivo_id
                       JOIN bancos.estados e2 ON e2.id=d.duplicado_de JOIN bancos.archivos b ON b.id=e2.archivo_id ORDER BY d.id""")
        dups = cur.fetchall()
        cur.execute("""SELECT v.nombre, a.nombre_canonico, a.nombre_original FROM bancos.avistamientos v JOIN bancos.archivos a ON a.id=v.archivo_id
                       WHERE v.id NOT IN (SELECT min(id) FROM bancos.avistamientos GROUP BY archivo_id) ORDER BY v.id""")
        exactos = cur.fetchall()
    L = ["# 00 LEEME · Inventario y reglas", "",
         f"_Generado automáticamente por fts-bancos el {generado}. No editar a mano: se reescribe en cada corrida._", "",
         "## Reglas", "",
         "1. Suban los estados de cuenta a **00 Buzon de carga - subir aqui** como los descarguen: PDF, ZIP, CSV o XLSX.",
         "2. El sistema identifica cada estado por el **número de cuenta o CLABE** impreso en el PDF y por el **periodo** de la pág. 1, nunca por el nombre del archivo.",
         "3. Nombre canónico: `Banco_Cuenta-Moneda_NumeroDeCuenta_AAAA-MM.pdf`.",
         "4. Un estado queda **validado** sólo si pasa tres pruebas al centavo: V1 (resumen del banco), V2 (saldo corrido contra cada saldo impreso) y V3 (el saldo final del mes anterior es el inicial de éste).",
         "5. Nada se borra. Los originales del buzón pasan a `Procesados`; lo que no se pudo usar queda en `Rechazados` con un .txt del motivo.", "",
         "## Inventario por cuenta", ""]
    por_cuenta: dict = {}
    for a in archivos:
        if a["cuenta_id"] and a["periodo"] and a["estado"] in ("validado", "no_cuadra"):
            por_cuenta.setdefault(a["cuenta_id"], {}).setdefault(a["periodo"], a)
    for c in cuentas:
        ests = por_cuenta.get(c["id"], {})
        L.append(f"### {c['banco']} {c['alias']} {c['moneda']} {c['numero_mask']}")
        L.append("")
        if not ests:
            L.append("Sin estados recibidos todavía.")
            L.append("")
            continue
        anios = sorted({p[:4] for p in ests} | {h["periodo"][:4] for h in huecos if h["cuenta_id"] == c["id"]})
        L.append("| año | " + " | ".join(NOMBRE_MES[m][:3] for m in range(1, 13)) + " |")
        L.append("|---|" + "---|" * 12)
        faltan = {h["periodo"] for h in huecos if h["cuenta_id"] == c["id"] and h["motivo"] == "faltante"}
        for an in anios:
            celdas = []
            for m in range(1, 13):
                p = f"{an}-{m:02d}"
                a = ests.get(p)
                if a is None:
                    celdas.append("❌ falta" if p in faltan else "·")
                elif a["estado"] != "validado":
                    celdas.append("⚠️ no cuadra")
                else:
                    celdas.append("✅" if a["v3"] in ("ok", "primero") else "✅ V3 " + (a["v3"] or "?"))
            L.append(f"| {an} | " + " | ".join(celdas) + " |")
        L.append("")
    L += ["## Faltantes (lista exacta)", ""]
    if huecos:
        for h in huecos:
            mm = NOMBRE_MES[int(h["periodo"][5:7])]
            extra = f" · diferencia sin explicar ${fmt(h['monto_diferencia'])}" if h["monto_diferencia"] is not None else ""
            L.append(f"- {h['banco']} {h['alias']} {h['numero_mask']}: **{mm} {h['periodo'][:4]}** ({h['motivo']}){extra}")
    else:
        L.append("Ninguno.")
    L += ["", "## Duplicados detectados (no se copiaron)", ""]
    if not dups and not exactos:
        L.append("Ninguno.")
    for d in dups:
        L.append(f"- `{d['nombre_original']}` es el mismo periodo que `{d['original']}` "
                 f"({'mismo contenido' if d['mismo_contenido'] else 'CONTENIDO DISTINTO: revisar'})")
    for x in exactos:
        L.append(f"- `{x['nombre']}` es copia exacta (mismo sha256) de `{x['nombre_canonico'] or x['nombre_original']}`")
    L += ["", "## Rechazados y sin formato soportado", ""]
    malos = [a for a in archivos if a["estado"] in ("rechazado", "sospechoso", "formato_no_soportado", "no_cuadra")]
    if not malos:
        L.append("Ninguno.")
    for a in malos:
        L.append(f"- `{a['nombre_original']}` · {a['estado']} · {a['motivo'] or ''}")
    L.append("")
    return "\n".join(L)


def huella_csv(filas: list[dict]) -> str:
    return sha256_bytes(csv_bytes(filas))
