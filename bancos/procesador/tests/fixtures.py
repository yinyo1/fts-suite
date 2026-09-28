"""Fixtures SINTÉTICOS: PDFs con el acomodo de un estado BBVA, números inventados.

Prohibido en el repo: PDFs reales, números de cuenta reales, montos reales o
nombres de beneficiarios reales. Todo lo de aquí es inventado.
"""
from __future__ import annotations

import calendar
import io
import json
import zipfile
from dataclasses import dataclass, field
from decimal import Decimal

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

MES3 = ["", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]

# cuentas FALSAS (mismo largo que las de BBVA)
CUENTAS = [
    {"clave": "general", "banco": "BBVA", "alias": "General", "numero": "0999000011",
     "clabe": "012580009990000117", "moneda": "MXN", "journal_odoo": 8,
     "carpeta": "01 Estados de cuenta originales - Servicios FTS SA de CV/BBVA/BBVA General MXN 0999000011"},
    {"clave": "nomina", "banco": "BBVA", "alias": "Nomina", "numero": "0999000022",
     "clabe": "012580009990000228", "moneda": "MXN", "journal_odoo": 96,
     "carpeta": "01 Estados de cuenta originales - Servicios FTS SA de CV/BBVA/BBVA Nomina MXN 0999000022"},
    {"clave": "usd", "banco": "BBVA", "alias": "USD", "numero": "0999000033",
     "clabe": "012580009990000339", "moneda": "USD", "journal_odoo": 75,
     "carpeta": "01 Estados de cuenta originales - Servicios FTS SA de CV/BBVA/BBVA USD 0999000033"},
]
CUENTAS_JSON = json.dumps(CUENTAS)


def m(v) -> str:
    return f"{Decimal(str(v)):,.2f}"


@dataclass
class Mov:
    dia: int
    codigo: str
    desc: list[str]
    cargo: Decimal = Decimal("0")
    abono: Decimal = Decimal("0")
    dia_liq: int | None = None


@dataclass
class Estado:
    numero: str
    clabe: str
    anio: int
    mes: int
    saldo_inicial: Decimal
    movs: list[Mov] = field(default_factory=list)
    rfc: str = "SFT170905L43"
    entidad: str = "SERVICIOS FTS SA DE CV"
    moneda: str = "MXN"
    corromper_total_cargos: Decimal = Decimal("0")
    corromper_saldo_impreso: Decimal = Decimal("0")
    sin_texto_extra: list[str] = field(default_factory=list)


def saldo_final(e: Estado) -> Decimal:
    return e.saldo_inicial + sum(x.abono for x in e.movs) - sum(x.cargo for x in e.movs)


def pdf_estado(e: Estado, encriptar: str | None = None) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter, invariant=1,
                      encrypt=encriptar if encriptar else None)
    W, H = letter
    ult = calendar.monthrange(e.anio, e.mes)[1]
    movs = sorted(e.movs, key=lambda x: x.dia)
    n_c = sum(1 for x in movs if x.cargo > 0)
    n_a = sum(1 for x in movs if x.abono > 0)
    s_c = sum((x.cargo for x in movs), Decimal("0"))
    s_a = sum((x.abono for x in movs), Decimal("0"))
    sf = saldo_final(e)
    pagina = [1]

    def pie():
        c.setFont("Helvetica", 6)
        c.drawString(36, 30, "BBVA Mexico, S.A., Institucion de Banca Multiple, Grupo Financiero BBVA Mexico. www.bbva.mx")
        c.drawRightString(W - 36, 30, f"PAGINA {pagina[0]}")

    def encabezado_columnas(y):
        c.setFont("Helvetica-Bold", 7)
        c.drawString(40, y + 10, "FECHA")
        c.drawString(530, y + 10, "SALDO")
        c.drawString(40, y, "OPER")
        c.drawString(72, y, "LIQ")
        c.drawString(100, y, "COD.")
        c.drawString(130, y, "DESCRIPCIÓN")
        c.drawString(300, y, "REFERENCIA")
        c.drawRightString(410, y, "CARGOS")
        c.drawRightString(470, y, "ABONOS")
        c.drawRightString(530, y, "OPERACIÓN")
        c.drawRightString(590, y, "LIQUIDACIÓN")
        c.setFont("Helvetica", 7)

    # pág. 1
    c.setFont("Helvetica-Bold", 10)
    c.drawString(36, H - 40, "Estado de Cuenta")
    c.setFont("Helvetica", 8)
    c.drawString(36, H - 52, "MAESTRA PYME BBVA")
    c.drawString(36, H - 70, e.entidad)
    c.drawString(36, H - 80, "AV SINTETICA 123 COL PRUEBA MONTERREY NL")
    c.drawString(330, H - 70, f"Periodo DEL 01/{e.mes:02d}/{e.anio} AL {ult:02d}/{e.mes:02d}/{e.anio}")
    c.drawString(330, H - 80, f"Fecha de Corte {ult:02d}/{e.mes:02d}/{e.anio}")
    c.drawString(330, H - 90, f"No. de Cuenta {e.numero}")
    c.drawString(330, H - 100, "No. de Cliente B0000000")
    c.drawString(330, H - 110, f"R.F.C {e.rfc}")
    c.drawString(330, H - 120, f"No. Cuenta CLABE {e.clabe}")
    c.drawString(36, H - 140, "Informacion Financiera " + ("MONEDA NACIONAL" if e.moneda == "MXN" else "DOLARES AMERICANOS"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(36, H - 160, "Comportamiento")
    c.setFont("Helvetica", 8)
    c.drawString(36, H - 172, f"Saldo Anterior {m(e.saldo_inicial)}")
    c.drawString(36, H - 182, f"Depósitos / Abonos (+) {n_a} {m(s_a)}")
    c.drawString(36, H - 192, f"Retiros / Cargos (-) {n_c} {m(s_c)}")
    c.drawString(36, H - 202, f"Saldo Final (+) {m(sf)}")
    c.drawString(36, H - 212, f"Dias del Periodo {ult}")
    for i, t in enumerate(e.sin_texto_extra):
        c.drawString(36, H - 226 - 10 * i, t)
    c.setFont("Helvetica-Bold", 8)
    y = H - 260
    c.drawString(36, y, "Detalle de Movimientos Realizados")
    y -= 22
    encabezado_columnas(y)
    y -= 14
    saldo = e.saldo_inicial
    liq_saldo_por_dia = {}
    for i, x in enumerate(movs):
        saldo = saldo + x.abono - x.cargo
        lineas = 1 + len(x.desc) - 1
        if y - 10 * lineas < 60:
            pie()
            c.showPage()
            pagina[0] += 1
            y = H - 60
            encabezado_columnas(y)
            y -= 14
        c.setFont("Helvetica", 7)
        dl = x.dia_liq or x.dia
        c.drawString(40, y, f"{x.dia:02d}/{MES3[e.mes]}")
        c.drawString(72, y, f"{dl:02d}/{MES3[e.mes]}")
        c.drawString(100, y, x.codigo)
        c.drawString(130, y, x.desc[0])
        if x.cargo > 0:
            c.drawRightString(410, y, m(x.cargo))
        if x.abono > 0:
            c.drawRightString(470, y, m(x.abono))
        ultimo_del_dia = (i == len(movs) - 1) or movs[i + 1].dia != x.dia
        if ultimo_del_dia:
            impreso = saldo + (e.corromper_saldo_impreso if i == 0 else 0)
            c.drawRightString(530, impreso and 530 or 530, m(impreso)) if False else c.drawRightString(530, y, m(impreso))
            liq = e.saldo_inicial + sum((z.abono - z.cargo for z in movs if (z.dia_liq or z.dia) <= x.dia), Decimal("0"))
            c.drawRightString(590, y, m(liq))
        for extra in x.desc[1:]:
            y -= 9
            c.drawString(130, y, extra)
        y -= 11
    if y < 110:
        pie()
        c.showPage()
        pagina[0] += 1
        y = H - 60
    y -= 10
    c.setFont("Helvetica-Bold", 8)
    c.drawString(36, y, "Total de Movimientos")
    c.setFont("Helvetica", 8)
    c.drawString(36, y - 12, f"TOTAL IMPORTE CARGOS {m(s_c + e.corromper_total_cargos)} TOTAL MOVIMIENTOS CARGOS {n_c}")
    c.drawString(36, y - 24, f"TOTAL IMPORTE ABONOS {m(s_a)} TOTAL MOVIMIENTOS ABONOS {n_a}")
    pie()
    c.showPage()
    c.save()
    return buf.getvalue()


def pdf_texto(lineas: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter, invariant=1)
    y = 740
    for t in lineas:
        c.drawString(40, y, t)
        y -= 14
    c.showPage()
    c.save()
    return buf.getvalue()


def pdf_escaneado() -> bytes:
    """Un PDF sin capa de texto (sólo un rectángulo dibujado)."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter, invariant=1)
    c.rect(50, 50, 400, 600, fill=1)
    c.showPage()
    c.save()
    return buf.getvalue()


def zip_de(archivos: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nombre, datos in archivos.items():
            zi = zipfile.ZipInfo(nombre, date_time=(2026, 9, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, datos)
    return buf.getvalue()


# ── escenario completo: 3 cuentas, ene–ago 2026, con huecos y traspasos ──
D = Decimal


def escenario() -> dict[str, Estado]:
    """Devuelve {clave_periodo: Estado}. Traspasos General→Nómina con referencia BNET."""
    gen, nom, usd = CUENTAS
    estados: dict[str, Estado] = {}
    s_gen, s_nom, s_usd = D("500000.00"), D("20000.00"), D("10000.00")
    for mes in range(1, 9):
        eg = Estado(gen["numero"], gen["clabe"], 2026, mes, s_gen)
        en = Estado(nom["numero"], nom["clabe"], 2026, mes, s_nom)
        eu = Estado(usd["numero"], usd["clabe"], 2026, mes, s_usd, moneda="USD")
        cobro = D(100000 + mes * 1111) + D("0.25")
        eg.movs += [
            Mov(2, "T20", ["SPEI RECIBIDOBANCO PRUEBA", "0000001 CLIENTE UNO SA DE CV", f"Ref. COB{mes:02d}01"], abono=cobro),
            Mov(3, "T17", ["SPEI ENVIADO BANCO PRUEBA", "0000002 PROVEEDOR DOS SA", f"Ref. PAG{mes:02d}02"], cargo=D("15000.50")),
            Mov(5, "N06", ["PAGO CUENTA DE TERCERO", f"BNET {nom['numero']} TRASPASO NOMINA"], cargo=D("30000.00")),
            Mov(5, "S39", ["SERV BANCA INTERNET"], cargo=D("250.00")),
            Mov(5, "S40", ["IVA COM SERV BCA INTERNET"], cargo=D("40.00")),
            Mov(12, "T17", ["SPEI ENVIADO BANCO PRUEBA", "PAGO SAT DECLARACION"], cargo=D("8000.00"), dia_liq=13),
            Mov(20, "T17", ["SPEI ENVIADO BANCO PRUEBA", "PAGO IMSS SIPARE"], cargo=D("4000.00")),
        ]
        en.movs += [
            Mov(5, "N06", ["PAGO CUENTA DE TERCERO", f"BNET {gen['numero']} TRASPASO NOMINA"], abono=D("30000.00")),
            Mov(6, "P14", ["PAGO DE NOMINA DISPERSION", "NOMINA QUINCENA"], cargo=D("29000.00")),
        ]
        eu.movs += [
            Mov(10, "T20", ["SPEI RECIBIDO USD CLIENTE EXTERIOR", "Ref. USD" + str(mes)], abono=D("1500.00")),
            Mov(15, "T17", ["TRANSFERENCIA ENVIADA PROVEEDOR EXTERIOR"], cargo=D("700.00")),
        ]
        for e, clave in ((eg, "general"), (en, "nomina"), (eu, "usd")):
            estados[f"{clave}_2026-{mes:02d}"] = e
        s_gen, s_nom, s_usd = saldo_final(eg), saldo_final(en), saldo_final(eu)
    return estados
