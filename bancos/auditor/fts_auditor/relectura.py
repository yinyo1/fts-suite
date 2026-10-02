"""Pata 2 · relectura INDEPENDIENTE de un estado BBVA.

Camino distinto al del servicio: el servicio lee con pdfplumber (pdfminer) y agrupa palabras por
coordenadas propias. Aquí se usa PDFium (pypdfium2): otro motor de extracción, otras cajas de
caracteres, otra segmentación de renglones (la del propio PDFium, por saltos de línea del texto).
No se importa nada de fts_bancos. Todo lo que sale de aquí es PRIVADO (montos): va sólo al
informe de Esteban, nunca al issue.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

import pypdfium2 as pdfium

MES = {"ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8,
       "SEP": 9, "SET": 9, "OCT": 10, "NOV": 11, "DIC": 12}
R_IMPORTE = re.compile(r"^-?[\d,]*\d\.\d{2}$")
R_FECHA = re.compile(r"^(\d{2})/([A-Z]{3})$")
R_PERIODO = re.compile(r"DEL\s+(\d{2})/(\d{2})/(\d{4})\s+AL\s+(\d{2})/(\d{2})/(\d{4})", re.I)
R_CUENTA = re.compile(r"No\.?\s*de\s*Cuenta\s+(\d{10,11})\b", re.I)
R_CLABE = re.compile(r"CLABE\s+(\d{18})\b", re.I)
R_TOT_C = re.compile(r"TOTAL\s+IMPORTE\s+CARGOS\s+([\d,]+\.\d{2})\s+TOTAL\s+MOVIMIENTOS\s+CARGOS\s+(\d+)", re.I)
R_TOT_A = re.compile(r"TOTAL\s+IMPORTE\s+ABONOS\s+([\d,]+\.\d{2})\s+TOTAL\s+MOVIMIENTOS\s+ABONOS\s+(\d+)", re.I)


def importe(t: str) -> Decimal:
    t = t.replace(",", "")
    return Decimal(t).quantize(Decimal("0.01"))


def _buscar(patrones: list[str], texto: str) -> Decimal | None:
    for p in patrones:
        m = re.search(p + r"\s*(?:\(\+\)|\(-\))?\s*(-?[\d,]+\.\d{2})", texto, re.I)
        if m:
            return importe(m.group(1))
    return None


@dataclass
class Palabra:
    t: str
    x0: float
    x1: float


@dataclass
class MovLeido:
    pagina: int
    orden: int
    fecha_operacion: date
    fecha_liquidacion: date | None
    codigo: str
    cargo: Decimal
    abono: Decimal
    saldo_operacion: Decimal | None
    saldo_liquidacion: Decimal | None
    texto: str


@dataclass
class EstadoLeido:
    paginas: int = 0
    cuenta: str | None = None
    clabe: str | None = None
    inicio: date | None = None
    fin: date | None = None
    saldo_inicial: Decimal | None = None
    saldo_final: Decimal | None = None
    abonos_num: int | None = None
    abonos_total: Decimal | None = None
    cargos_num: int | None = None
    cargos_total: Decimal | None = None
    tot_cargos: tuple | None = None      # (importe, número) del pie "Total de Movimientos"
    tot_abonos: tuple | None = None
    movimientos: list[MovLeido] = field(default_factory=list)
    problemas: list[dict] = field(default_factory=list)

    @property
    def periodo(self) -> str | None:
        return self.fin.strftime("%Y-%m") if self.fin else None


def _renglones(page) -> list[list[Palabra]]:
    """Renglones según PDFium (saltos \\r\\n de su propio texto), cada uno en palabras con su x."""
    tp = page.get_textpage()
    n = tp.count_chars()
    txt = tp.get_text_range(0, n) if n else ""
    out, actual, pal, x0, x1 = [], [], "", None, None
    # get_text_range puede no ser 1:1 con los índices de carácter si hay caracteres generados;
    # por eso se recorre carácter por carácter con su propia caja.
    for i in range(n):
        c = tp.get_text_range(i, 1)
        if c in ("\r",):
            continue
        if c == "\n":
            if pal:
                actual.append(Palabra(pal, x0, x1))
            if actual:
                out.append(actual)
            actual, pal, x0, x1 = [], "", None, None
            continue
        if c.isspace():
            if pal:
                actual.append(Palabra(pal, x0, x1))
            pal, x0, x1 = "", None, None
            continue
        l, b, r, t = tp.get_charbox(i)
        if pal and x1 is not None and l - x1 > 6:     # hueco grande dentro del renglón = otra palabra
            actual.append(Palabra(pal, x0, x1))
            pal, x0 = "", None
        pal += c
        x0 = l if x0 is None else x0
        x1 = r
    if pal:
        actual.append(Palabra(pal, x0, x1))
    if actual:
        out.append(actual)
    return out, txt


def _fecha(dd: str, mmm: str, inicio: date, fin: date) -> date:
    mes = MES[mmm]
    anio = fin.year if mes >= inicio.month or inicio.year == fin.year else inicio.year
    if inicio.year != fin.year:
        anio = inicio.year if mes == inicio.month else fin.year
    return date(anio, mes, int(dd))


def leer(contenido: bytes) -> EstadoLeido:
    est = EstadoLeido()
    try:
        pdf = pdfium.PdfDocument(contenido)
    except Exception as e:  # protegido o dañado
        est.problemas.append({"codigo": "PDF_ILEGIBLE", "detalle": str(e)[:120]})
        return est
    est.paginas = len(pdf)
    paginas = []
    for k in range(len(pdf)):
        renglones, txt = _renglones(pdf[k])
        paginas.append((k + 1, renglones, txt))
    # la "página 1" del estado es la primera con el periodo impreso (algunos PDF traen antes una portada sin texto)
    p1 = next((p[2] for p in paginas if R_PERIODO.search(p[2])), paginas[0][2] if paginas else "")
    m = R_PERIODO.search(p1)
    if m:
        d1, m1, y1, d2, m2, y2 = map(int, m.groups())
        est.inicio, est.fin = date(y1, m1, d1), date(y2, m2, d2)
    m = R_CUENTA.search(p1)
    est.cuenta = m.group(1) if m else None
    m = R_CLABE.search(p1)
    est.clabe = m.group(1) if m else None
    est.saldo_inicial = _buscar([r"Saldo\s+de\s+Operaci[oó]n\s+Inicial", r"Saldo\s+Anterior", r"Saldo\s+Inicial"], p1)
    est.saldo_final = _buscar([r"Saldo\s+de\s+Operaci[oó]n\s+Final", r"Saldo\s+Final"], p1)
    m = re.search(r"Dep[oó]sitos\s*/\s*Abonos\s*\(\+\)\s*(\d+)\s+([\d,]+\.\d{2})", p1, re.I)
    if m:
        est.abonos_num, est.abonos_total = int(m.group(1)), importe(m.group(2))
    m = re.search(r"Retiros\s*/\s*Cargos\s*\(-\)\s*(\d+)\s+([\d,]+\.\d{2})", p1, re.I)
    if m:
        est.cargos_num, est.cargos_total = int(m.group(1)), importe(m.group(2))
    todo = "\n".join(p[2] for p in paginas)
    m = R_TOT_C.search(todo)
    est.tot_cargos = (importe(m.group(1)), int(m.group(2))) if m else None
    m = R_TOT_A.search(todo)
    est.tot_abonos = (importe(m.group(1)), int(m.group(2))) if m else None
    if not (est.inicio and est.fin):
        est.problemas.append({"codigo": "SIN_PERIODO"})
        return est

    cols = None
    terminado = False
    orden = 0
    for num, renglones, _ in paginas:
        if terminado:
            break
        for r in renglones:
            textos = [w.t for w in r]
            linea = " ".join(textos)
            if re.search(r"Total\s+de\s+Movimientos", linea, re.I):
                terminado = True
                break
            if "CARGOS" in textos and "ABONOS" in textos:
                idx = {t: w for t, w in ((w.t.upper(), w) for w in r)}
                sal = [w for w in r if w.t.upper().startswith("OPERACI")]
                liq = [w for w in r if w.t.upper().startswith("LIQUIDACI")]
                cols = {"cargo": idx["CARGOS"].x1, "abono": idx["ABONOS"].x1,
                        "saldo_op": sal[-1].x1 if sal else None, "saldo_liq": liq[-1].x1 if liq else None}
                continue
            if len(r) < 3 or not R_FECHA.match(r[0].t) or not R_FECHA.match(r[1].t):
                continue
            if cols is None:
                est.problemas.append({"codigo": "SIN_ENCABEZADO", "pagina": num})
                continue
            nums = []
            for w in reversed(r[3:]):
                if R_IMPORTE.match(w.t):
                    nums.append(w)
                else:
                    break
            nums.reverse()
            asignado = {}
            for w in nums:
                cands = {k: abs(w.x1 - v) for k, v in cols.items() if v is not None}
                k = min(cands, key=cands.get)
                if k in asignado:
                    est.problemas.append({"codigo": "COLUMNA_DOBLE", "pagina": num, "orden": orden + 1})
                asignado[k] = importe(w.t)
            fo = R_FECHA.match(r[0].t)
            fl = R_FECHA.match(r[1].t)
            orden += 1
            cargo, abono = asignado.get("cargo", Decimal("0.00")), asignado.get("abono", Decimal("0.00"))
            if (cargo > 0) == (abono > 0):
                est.problemas.append({"codigo": "MOV_SIN_IMPORTE_UNICO", "pagina": num, "orden": orden})
            est.movimientos.append(MovLeido(num, orden, _fecha(fo.group(1), fo.group(2), est.inicio, est.fin),
                                            _fecha(fl.group(1), fl.group(2), est.inicio, est.fin), r[2].t,
                                            cargo, abono, asignado.get("saldo_op"), asignado.get("saldo_liq"), linea))
    return est
