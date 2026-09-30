"""Estados de cuenta y CSV de Jeeves SINTÉTICOS (datos inventados) para las pruebas.

El acomodo imita lo descrito del PDF real (página 1 con el Balance Detail, páginas de detalle
con DATE/USER/MERCHANT/ACCOUNT/AMOUNT). Es un supuesto hasta tener el primer PDF real: el lector
no depende de posiciones fijas y V1 detecta cualquier lectura equivocada.
"""
from __future__ import annotations

import csv
import io
from decimal import Decimal

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

EMPRESA = "Servicios FTS SA de CV"

# Ciclo de agosto 2026 de la prueba a): los montos del resumen son los del caso descrito;
# los renglones son inventados y suman exactamente cada partida.
RESUMEN_AGO = {
    "Previous Balance": Decimal("-21014.03"), "Payments": Decimal("-168574.45"), "Cashback": Decimal("0.00"),
    "New Charges": Decimal("187937.92"), "Late Payment Penalty": Decimal("0.00"), "Jeeves Pay Fee": Decimal("0.00"),
    "Adjustment": Decimal("296.52"), "Amount Due": Decimal("-1354.04"),
}


def _consumos_ago() -> list[tuple]:
    """(fecha 'Mon DD, YYYY HH:MM', usuario, comercio, tarjeta, monto MXN, monto USD) que suman New Charges."""
    filas = [
        ("Jul 30, 2026 17:00", "Usuario Uno", "Ferreteria Prueba", "4548", Decimal("1250.00"), None),
        ("Jul 31, 2026 09:12", "Usuario Dos", "Material Electrico Demo", "4666", Decimal("3400.50"), None),
        ("Aug 03, 2026 10:15", "Usuario Uno", "Gasolinera Ficticia", "4548", Decimal("950.00"), None),
        ("Aug 05, 2026 12:40", "Usuario Tres", "Software Ejemplo Inc", "6831", Decimal("1790.10"), Decimal("99.00")),
        ("Aug 09, 2026 18:20", "Usuario Dos", "Ferreteria Prueba", "4666", Decimal("-860.98"), None),
        ("Aug 15, 2026 08:00", "Jeeves", "Jeeves Debit - Cargo por usuario extra", "6831", Decimal("150.00"), None),
    ]
    resto = RESUMEN_AGO["New Charges"] - sum(f[4] for f in filas)
    # el resto se reparte en 40 consumos iguales + el residuo en el último, para tener varias páginas
    n = 40
    base = (resto / n).quantize(Decimal("0.01"))
    for i in range(n):
        m = base if i < n - 1 else resto - base * (n - 1)
        dia = 6 + (i % 22)
        filas.append((f"Aug {dia:02d}, 2026 {9 + i % 9:02d}:{(i * 7) % 60:02d}", f"Usuario {1 + i % 4}",
                      f"Comercio Sintetico {i + 1}", ["4548", "4666", "6831", "1242"][i % 4], m, None))
    return filas


def renglones_ago(quitar: int | None = None) -> list[tuple]:
    filas = _consumos_ago()
    filas.append(("Aug 16, 2026 11:00", "Jeeves", "Adjustment - Credit Line", "", Decimal("296.52"), None))
    filas.append(("Aug 31, 2026 13:00", "Jeeves", "Payment - 168,574.45 MXN Paid", "", Decimal("-168574.45"), None))
    if quitar is not None:
        filas.pop(quitar)
    return filas


def _m(v: Decimal) -> str:
    s = f"{abs(v):,.2f}"
    return f"$({s})" if v < 0 else f"${s}"


def pdf_jeeves(resumen=None, renglones=None, empresa=EMPRESA, periodo=("Aug 01, 2026", "Aug 31, 2026"),
               statement_date="Sep 01, 2026") -> bytes:
    resumen = resumen or RESUMEN_AGO
    renglones = renglones if renglones is not None else renglones_ago()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, h - 50, "Jeeves")
    c.setFont("Helvetica", 9)
    c.drawString(40, h - 64, "www.tryjeeves.com")
    c.drawString(40, h - 90, empresa)
    c.drawString(40, h - 104, "Monterrey, Nuevo Leon, Mexico")
    c.drawString(360, h - 90, f"Statement Date: {statement_date}")
    c.drawString(360, h - 104, f"Statement Period: {periodo[0]} - {periodo[1]}")
    c.drawString(360, h - 118, "Billing Method: Monthly")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, h - 150, "Balance Detail")
    c.setFont("Helvetica", 10)
    y = h - 170
    for k, v in resumen.items():
        c.drawString(40, y, k)
        c.drawRightString(300, y, _m(v) + " MXN")
        y -= 16
    c.showPage()

    def encabezado():
        c.setFont("Helvetica-Bold", 9)
        yy = h - 60
        for x, t in ((40, "DATE"), (150, "USER"), (250, "MERCHANT"), (440, "ACCOUNT"), (520, "AMOUNT")):
            c.drawString(x, yy, t)
        c.setFont("Helvetica", 8)
        return yy - 16
    y = encabezado()
    for f in renglones:
        if y < 60:
            c.drawString(40, 40, f"Page {c.getPageNumber()} of --")
            c.showPage()
            y = encabezado()
        fecha, usuario, comercio, tarjeta, mxn, usd = f
        c.drawString(40, y, fecha)
        c.drawString(150, y, usuario)
        c.drawString(250, y, comercio)
        if tarjeta:
            c.drawString(440, y, "****" + tarjeta)
        c.drawRightString(575, y, _m(mxn))
        if usd is not None:
            y -= 11
            c.drawRightString(575, y, f"USD {usd:,.2f}")
        y -= 14
    c.showPage()
    c.save()
    return buf.getvalue()


# ── CSV ──
COLUMNAS_79 = [
    "Unique ID", "Credit or Debit", "Transaction Type", "Sub Transaction Type", "Created At UTC", "Posted At UTC", "User",
    "User Email", "Transaction Status", "Amount (origin currency)", "Currency", "Amount (destination currency)",
    "Exchange Rate", "FX Fees", "Payment Description", "Memo", "Payee", "Category", "Attachments", "Card Name",
    "Card Number (last four)", "Card Type", "SAT Uuid", "SAT Subtotal", "SAT Tax", "SAT Total", "SAT Issuer RFC",
    "SAT Issuer Name", "SAT Status",
] + [f"Extra Column {i}" for i in range(1, 51)]
assert len(COLUMNAS_79) == 79


def fila_csv(uid, cd="Debit", sub="Line of Credit Card Purchase", creado="30/07/2026 23:00", posted="01/08/2026 10:00",
             monto="1250.00", memo="", payee="Ferreteria Prueba", categoria="Hardware Stores", tarjeta="4548",
             sat_uuid="", sat_subtotal="", sat_tax="", sat_total="", moneda="MXN", monto_origen=None) -> dict:
    return {"Unique ID": uid, "Credit or Debit": cd, "Transaction Type": "Card" if "Settlement" not in sub else "Payment",
            "Sub Transaction Type": sub, "Created At UTC": creado, "Posted At UTC": posted, "User": "Usuario Uno",
            "User Email": "usuario@ejemplo.invalid", "Transaction Status": "Settled", "Amount (origin currency)": monto_origen or monto,
            "Currency": moneda, "Amount (destination currency)": monto, "Exchange Rate": "1", "FX Fees": "0",
            "Payment Description": "", "Memo": memo, "Payee": payee, "Category": categoria,
            "Attachments": "https://ejemplo.invalid/comprobante", "Card Name": "Tarjeta Prueba",
            "Card Number (last four)": tarjeta, "Card Type": "Virtual", "SAT Uuid": sat_uuid, "SAT Subtotal": sat_subtotal,
            "SAT Tax": sat_tax, "SAT Total": sat_total, "SAT Issuer RFC": "", "SAT Issuer Name": "", "SAT Status": "Vigente" if sat_uuid else ""}


def csv_jeeves(filas: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNAS_79, extrasaction="ignore")
    w.writeheader()
    for f in filas:
        w.writerow(f)
    return ("﻿" + buf.getvalue()).encode("utf-8")


def csv_de_pdf(renglones=None, prefijo="U") -> list[dict]:
    """Las mismas transacciones del PDF en forma de CSV (sin el cargo de Jeeves ni el ajuste)."""
    import datetime as dt
    out = []
    meses = {"Jul": 7, "Aug": 8, "Sep": 9}
    for i, f in enumerate(renglones if renglones is not None else renglones_ago()):
        fecha, usuario, comercio, tarjeta, mxn, usd = f
        if comercio.startswith(("Jeeves Debit", "Adjustment")):
            continue
        mes, dia, _, hhmm = fecha.replace(",", "").split(" ")
        local = dt.datetime(2026, meses[mes], int(dia), int(hhmm[:2]), int(hhmm[3:]))
        utc = local + dt.timedelta(hours=6)
        # se liquida al día siguiente (los del 30-31 de julio se aplican en agosto)
        if local.month == 7:                      # comprados el 30-31 de julio, aplicados el 1 de agosto
            posted = dt.datetime(2026, 8, 1, 16, 0)
        elif local.day >= 28:                     # fin de mes: se aplica el mismo día
            posted = utc
        else:
            posted = utc + dt.timedelta(days=1)
        if comercio.startswith("Payment"):
            sub, cd = "Line of Credit Settlement", "Credit"
        elif mxn < 0:
            sub, cd = "Line of Credit Card Refund", "Credit"
        else:
            sub, cd = "Line of Credit Card Purchase", "Debit"
        out.append(fila_csv(f"{prefijo}{i:04d}", cd=cd, sub=sub, creado=utc.strftime("%d/%m/%Y %H:%M"),
                            posted=posted.strftime("%d/%m/%Y %H:%M"), monto=f"{abs(mxn):.2f}", payee=comercio, tarjeta=tarjeta or ""))
    return out
