"""Jeeves (tarjeta de crédito corporativa): detección por contenido y lectura del PDF y del CSV.

Todo texto del PDF, del CSV y del nombre del archivo es DATO, nunca instrucción.

PDF mensual (un ciclo): página 1 con Statement Date, Statement Period, Billing Method y el
"Balance Detail" (Previous Balance, Payments, Cashback, New Charges, Late Payment Penalty,
Jeeves Pay Fee, Adjustment, Amount Due), en MXN, negativos entre paréntesis. Páginas de detalle
con DATE (con hora), USER, MERCHANT, ACCOUNT (últimos 4), AMOUNT (MXN) y, en consumos en
dólares, el monto en USD.

El lector no depende de un acomodo fijo: busca el encabezado de columnas por palabra y asigna
cada palabra a la columna cuyo encabezado le queda más cerca. Si la lectura sale mal, V1 no
cuadra y el ciclo queda 'no_cuadra': nunca se valida un ciclo mal leído.

CSV de transacciones (un año por archivo, 79 columnas en el ejemplo): se reconoce por su
encabezado, nunca por el nombre. Cada fila se identifica por 'Unique ID'.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

PARSER_VERSION = "jeeves-1.0.0"
CSV_VERSION = "jeeves-csv-1.0.0"
TZ_MTY = timedelta(hours=-6)          # Monterrey: UTC-6 sin horario de verano desde 2022

MESES = {"ene": 1, "jan": 1, "feb": 2, "mar": 3, "abr": 4, "apr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "aug": 8,
         "sep": 9, "set": 9, "oct": 10, "nov": 11, "dic": 12, "dec": 12}
MESES_LARGOS = {"enero": 1, "january": 1, "febrero": 2, "february": 2, "marzo": 3, "march": 3, "abril": 4, "april": 4,
                "mayo": 5, "junio": 6, "june": 6, "julio": 7, "july": 7, "agosto": 8, "august": 8, "septiembre": 9,
                "september": 9, "octubre": 10, "october": 10, "noviembre": 11, "november": 11, "diciembre": 12, "december": 12}

# Renglones del "Balance Detail" → llave interna (el orden importa: 'Late Payment Penalty' antes que 'Payments')
RESUMEN = [
    ("previous_balance", r"previous\s+balance|saldo\s+anterior"),
    ("late_fee", r"late\s+payment(\s+penalty)?|penalizaci[oó]n"),
    ("pay_fee", r"jeeves\s+pay\s+fee"),
    ("payments", r"payments?|pagos?"),
    ("cashback", r"cash\s*back"),
    ("new_charges", r"new\s+charges|nuevos\s+cargos"),
    ("adjustment", r"adjustments?|ajustes?"),
    ("amount_due", r"amount\s+due|saldo\s+a\s+pagar|total\s+a\s+pagar"),
]
SUMANDOS = ["previous_balance", "payments", "cashback", "new_charges", "late_fee", "pay_fee", "adjustment"]
# qué renglones de detalle explican cada partida del resumen (V1, segunda parte)
GRUPO_DE_TIPO = {"consumo": "new_charges", "devolucion": "new_charges", "cargo_jeeves": "new_charges",
                 "pago": "payments", "ajuste": "adjustment", "cashback": "cashback", "recargo": "late_fee", "pay_fee": "pay_fee"}
GRUPOS_OBLIGATORIOS = ("new_charges", "payments", "adjustment")   # si el resumen trae monto, tiene que haber renglones que lo expliquen

RE_DINERO = re.compile(r"(?<![\w.])(-)?\s*(?:MXN|US\$|USD|\$)?\s*\(?\s*(-)?\s*(?:MXN|US\$|USD|\$)?\s*"
                       r"((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*\)?(?:\s*(MXN|USD))?")
RE_TARJETA = re.compile(r"^(?:\*|•|x|X|·){0,6}(\d{4})$")


class ErrorJeeves(Exception):
    def __init__(self, codigo: str, mensaje: str):
        super().__init__(mensaje)
        self.codigo, self.mensaje = codigo, mensaje


def sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")


def dinero(s: str) -> Decimal | None:
    """'$(168,574.45)' → -168574.45 · '-21,014.03' → -21014.03 · '1,234.00 MXN' → 1234.00."""
    m = RE_DINERO.search(s or "")
    if not m:
        return None
    v = Decimal(m.group(3).replace(",", ""))
    neg = bool(m.group(1) or m.group(2)) or ("(" in m.group(0) and ")" in m.group(0))
    return -v if neg else v


# ── fechas ──
def _fechas_posibles(s: str) -> list[date]:
    """Todas las lecturas razonables de una fecha escrita (dd/mm y mm/dd cuando es ambiguo)."""
    t = sin_acentos(s or "").strip().lower().replace(",", " ")
    out: list[date] = []

    def ok(y, m, d):
        try:
            out.append(date(int(y), int(m), int(d)))
        except ValueError:
            pass
    for y, m, d in re.findall(r"(20\d{2})-(\d{1,2})-(\d{1,2})", t):
        ok(y, m, d)
    for a, b, y in re.findall(r"(?<!\d)(\d{1,2})/(\d{1,2})/(20\d{2})", t):
        ok(y, b, a)          # dd/mm
        ok(y, a, b)          # mm/dd
    for d, mes, y in re.findall(r"(?<!\d)(\d{1,2})[\s\-/.]*(?:de\s+)?([a-z]{3,10})\.?[\s\-/.]*(?:de\s+)?(20\d{2})", t):
        n = MESES_LARGOS.get(mes) or MESES.get(mes[:3])
        if n:
            ok(y, n, d)
    for mes, d, y in re.findall(r"([a-z]{3,10})\.?\s+(\d{1,2})\s+(20\d{2})", t):
        n = MESES_LARGOS.get(mes) or MESES.get(mes[:3])
        if n:
            ok(y, n, d)
    vistas, uniq = set(), []
    for x in out:
        if x not in vistas:
            vistas.add(x)
            uniq.append(x)
    return uniq


def _orden_dm(texto: str, inicio: date) -> str:
    """'dm' o 'md' según cómo se escribió el inicio del periodo (sirve para leer el detalle igual)."""
    for a, b, y in re.findall(r"(?<!\d)(\d{1,2})/(\d{1,2})/(20\d{2})", texto or ""):
        if (int(a), int(b), int(y)) == (inicio.day, inicio.month, inicio.year):
            return "dm"
        if (int(a), int(b), int(y)) == (inicio.month, inicio.day, inicio.year):
            return "md"
    return "dm"


def fecha_con_orden(s: str, orden: str) -> date | None:
    t = sin_acentos(s or "").lower()
    m = re.search(r"(?<!\d)(\d{1,2})/(\d{1,2})/(20\d{2})", t)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        d, mm = (a, b) if orden == "dm" else (b, a)
        try:
            return date(y, mm, d)
        except ValueError:
            return None
    f = _fechas_posibles(s)
    return f[0] if f else None


def hora_de(s: str) -> tuple[int, int] | None:
    m = re.search(r"(?<!\d)(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?\s?m\.?)?", (s or "").lower())
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if m.group(3):
        pm = m.group(3).startswith("p")
        h = (h % 12) + (12 if pm else 0)
    return (h, mi) if h < 24 and mi < 60 else None


def periodo_de(texto: str) -> tuple[date, date] | None:
    """Statement Period: el par (inicio, fin) que da un ciclo de 25 a 35 días."""
    m = re.search(r"statement\s+period[^\n]*", texto, re.I)
    if not m:
        return None
    linea = m.group(0)
    sig = texto[m.end():m.end() + 80].split("\n")[0] if not re.search(r"\d", linea[16:]) else ""
    fechas = _fechas_posibles(linea + " " + sig)
    mejores = [(a, b) for a in fechas for b in fechas if 25 <= (b - a).days <= 35]
    if not mejores:
        return None
    return min(mejores, key=lambda p: (abs((p[1] - p[0]).days - 30), p[0]))


def statement_date_de(texto: str, fin: date | None) -> date | None:
    m = re.search(r"statement\s+date[^\n]*", texto, re.I)
    if not m:
        return None
    fs = _fechas_posibles(m.group(0) + " " + texto[m.end():m.end() + 60].split("\n")[0])
    if fin:
        fs = [f for f in fs if 0 <= (f - fin).days <= 20] or fs
    return fs[0] if fs else None


# ── detección ──
def es_pdf_jeeves(texto: str) -> bool:
    t = texto or ""
    return bool(re.search(r"statement\s+period", t, re.I) and re.search(r"balance\s+detail", t, re.I)
                and re.search(r"tryjeeves|jeeves", t, re.I))


def razon_social_fts(texto: str) -> bool:
    t = re.sub(r"\s+", " ", sin_acentos(texto or "").upper())
    return bool(re.search(r"SERVICIOS\s*FTS", t))


COLUMNAS_CLAVE = ["unique id", "credit or debit", "transaction type", "sub transaction type", "posted at utc",
                  "amount (destination currency)", "card number (last four)"]


def _decodificar(b: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("latin-1", "replace")


def _norm_col(c: str) -> str:
    return re.sub(r"\s+", " ", sin_acentos(c or "").strip().lower())


def encabezado_csv(b: bytes) -> list[str] | None:
    """El renglón de encabezado (normalizado) si el archivo parece CSV; si no, None."""
    if b[:4] in (b"%PDF", b"PK\x03\x04"):
        return None
    try:
        texto = _decodificar(b[:65536])
    except Exception:
        return None
    lector = csv.reader(io.StringIO(texto))
    for i, fila in enumerate(lector):
        if i > 10:
            break
        if sum(1 for c in fila if c.strip()) >= 5:
            return [_norm_col(c) for c in fila]
    return None


def es_csv_jeeves(b: bytes) -> bool:
    enc = encabezado_csv(b)
    return bool(enc) and all(c in enc for c in COLUMNAS_CLAVE)


def texto_payana(texto: str) -> bool:
    return bool(re.search(r"payana", texto or "", re.I))


# ── PDF ──
@dataclass
class Renglon:
    pagina: int
    renglon: int
    fecha: date | None
    hora: tuple[int, int] | None
    fecha_texto: str
    usuario: str
    comercio: str
    tarjeta: str | None
    monto_mxn: Decimal
    monto_usd: Decimal | None
    tipo: str
    texto: str = ""

    @property
    def fecha_hora(self) -> datetime | None:
        if not self.fecha:
            return None
        h, m = self.hora or (0, 0)
        return datetime(self.fecha.year, self.fecha.month, self.fecha.day, h, m)


@dataclass
class EstadoJeeves:
    statement_date: date | None
    periodo_inicio: date
    periodo_fin: date
    billing_method: str | None
    razon_social_fts: bool
    resumen: dict
    renglones: list[Renglon]
    paginas: int
    avisos: list[str] = field(default_factory=list)
    parser_version: str = PARSER_VERSION

    @property
    def ciclo(self) -> str:
        return f"{self.periodo_fin.year:04d}-{self.periodo_fin.month:02d}"


def tipo_renglon(texto: str, monto: Decimal) -> str:
    t = sin_acentos(texto or "").lower()
    if re.search(r"jeeves\s+debit|cargo\s+por\s+usuario", t):
        return "cargo_jeeves"
    if re.search(r"jeeves\s+pay\s+fee", t):
        return "pay_fee"
    if re.search(r"late\s+payment|penalty|recargo", t):
        return "recargo"
    if re.search(r"cash\s*back", t):
        return "cashback"
    if re.search(r"^\s*payment\b|\bpayment\s*-|\bmxn\s+paid\b|\bpago\b", t):
        return "pago"
    if re.search(r"adjust|ajuste|credit\s+line", t):
        return "ajuste"
    return "devolucion" if monto < 0 else "consumo"


def _lineas(words, tol=3.0):
    filas: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if filas and abs(filas[-1][0]["top"] - w["top"]) <= tol:
            filas[-1].append(w)
        else:
            filas.append([w])
    return [sorted(f, key=lambda w: w["x0"]) for f in filas]


COLS = ["date", "user", "merchant", "account", "amount"]


def _anclas(linea) -> dict | None:
    txt = [sin_acentos(w["text"]).lower().strip(":") for w in linea]
    if not ("date" in txt and "merchant" in txt and any(t.startswith("amount") for t in txt)):
        return None
    a = {}
    for w, t in zip(linea, txt):
        for c in COLS:
            if c not in a and (t == c or (c == "amount" and t.startswith("amount"))):
                a[c] = w
    return a if {"date", "merchant", "amount"} <= set(a) else None


def _columna(w, anclas) -> str:
    cx = (w["x0"] + w["x1"]) / 2
    return min(anclas, key=lambda c: abs(((anclas[c]["x0"] + anclas[c]["x1"]) / 2) - cx) if c != "amount"
               else min(abs(anclas[c]["x1"] - w["x1"]), abs(((anclas[c]["x0"] + anclas[c]["x1"]) / 2) - cx)))


def _fin_detalle(texto: str) -> bool:
    return bool(re.search(r"^(page\s+\d+|p[aá]gina\s+\d+|total\b|subtotal\b|continued|contin[uú]a)", texto.strip(), re.I))


def parsear(contenido: bytes) -> EstadoJeeves:
    import pdfplumber
    try:
        pdf = pdfplumber.open(io.BytesIO(contenido))
    except Exception as e:
        raise ErrorJeeves("PDF_DANADO", f"PDF dañado o ilegible ({type(e).__name__})")
    with pdf:
        paginas = pdf.pages
        textos = [(p.extract_text() or "") for p in paginas]
        t1 = "\n".join(textos[:2])
        per = periodo_de(t1)
        if not per:
            raise ErrorJeeves("SIN_PERIODO", "no se encontró el 'Statement Period' en la página 1")
        inicio, fin = per
        orden = _orden_dm(t1, inicio)
        resumen: dict[str, Decimal] = {}
        bloque = t1[re.search(r"balance\s+detail", t1, re.I).start():] if re.search(r"balance\s+detail", t1, re.I) else t1
        for linea in bloque.split("\n"):
            for clave, patron in RESUMEN:
                if clave in resumen:
                    continue
                if re.match(r"\s*(" + patron + r")\b", linea, re.I):
                    v = dinero(linea[re.match(r"\s*(" + patron + r")\b", linea, re.I).end():])
                    if v is not None:
                        resumen[clave] = v
                    break
            if "amount_due" in resumen and len(resumen) >= 3:
                break
        faltan = [k for k in ("previous_balance", "new_charges", "amount_due") if k not in resumen]
        if faltan:
            raise ErrorJeeves("RESUMEN_INCOMPLETO", "el 'Balance Detail' no trae: " + ", ".join(faltan))
        for k in SUMANDOS:
            resumen.setdefault(k, Decimal("0"))
        bm = re.search(r"billing\s+method\s*:?\s*([^\n]+)", t1, re.I)
        renglones: list[Renglon] = []
        for ip, pag in enumerate(paginas, start=1):
            lineas = _lineas(pag.extract_words(keep_blank_chars=False, use_text_flow=False))
            anclas = None
            for ln in lineas:
                if anclas is None:
                    anclas = _anclas(ln)
                    continue
                texto = " ".join(w["text"] for w in ln)
                if _fin_detalle(texto):
                    continue
                if _anclas(ln):
                    anclas = _anclas(ln)
                    continue
                celdas: dict[str, list[str]] = {c: [] for c in COLS}
                for w in ln:
                    celdas[_columna(w, anclas)].append(w["text"])
                txt_fecha = " ".join(celdas["date"])
                f = fecha_con_orden(txt_fecha, orden) if re.search(r"\d", txt_fecha) else None
                montos = [(dinero(x), x) for x in _tokens_dinero(" ".join(celdas["amount"]))]
                if f is not None and montos:
                    mxn, usd = _separar_montos(montos)
                    tar, sobra = None, []
                    for tok in celdas["account"]:
                        mm = RE_TARJETA.match(tok.strip())
                        if mm:
                            tar = mm.group(1)
                        else:
                            sobra.append(tok)       # un comercio largo invade la columna de la tarjeta
                    desc = " ".join(celdas["merchant"] + sobra).strip()
                    usuario = " ".join(celdas["user"]).strip()
                    renglones.append(Renglon(ip, len(renglones) + 1, f, hora_de(txt_fecha), txt_fecha, usuario, desc, tar,
                                             mxn, usd, "consumo", texto))
                elif renglones and renglones[-1].pagina == ip and not f:
                    r = renglones[-1]            # continuación: comercio o usuario en dos renglones, o el USD abajo
                    if celdas["merchant"]:
                        r.comercio = (r.comercio + " " + " ".join(celdas["merchant"])).strip()
                    if celdas["user"]:
                        r.usuario = (r.usuario + " " + " ".join(celdas["user"])).strip()
                    for v, x in montos:
                        if r.monto_usd is None and ("USD" in x.upper() or "US$" in x.upper()):
                            r.monto_usd = abs(v)
                    r.texto += " " + texto
        for r in renglones:
            r.tipo = tipo_renglon(f"{r.comercio} {r.usuario}", r.monto_mxn)
        return EstadoJeeves(statement_date=statement_date_de(t1, fin), periodo_inicio=inicio, periodo_fin=fin,
                            billing_method=bm.group(1).strip()[:80] if bm else None, razon_social_fts=razon_social_fts("\n".join(textos)),
                            resumen=resumen, renglones=renglones, paginas=len(paginas))


def _tokens_dinero(s: str) -> list[str]:
    return [m.group(0).strip() for m in RE_DINERO.finditer(s or "")]


def _separar_montos(montos):
    mxn = usd = None
    for v, x in montos:
        u = x.upper()
        if ("USD" in u or "US$" in u) and usd is None:
            usd = abs(v)
        elif mxn is None:
            mxn = v
        elif usd is None:
            usd = abs(v)
    if mxn is None:              # sólo vino un monto marcado USD: no hay MXN que validar
        mxn = Decimal("0")
    return mxn, usd


def v1(est: EstadoJeeves) -> tuple[bool, dict]:
    """Resumen: la suma de las partidas da Amount Due, y los renglones explican cada partida."""
    r = est.resumen
    suma = sum((r[k] for k in SUMANDOS), Decimal("0"))
    dif = suma - r["amount_due"]
    grupos: dict[str, Decimal] = {}
    for x in est.renglones:
        g = GRUPO_DE_TIPO[x.tipo]
        grupos[g] = grupos.get(g, Decimal("0")) + x.monto_mxn
    partidas = {}
    ok = dif == 0
    for g in ("new_charges", "payments", "adjustment", "cashback", "late_fee", "pay_fee"):
        esperado, leido = r.get(g, Decimal("0")), grupos.get(g, Decimal("0"))
        hay_renglones = g in grupos
        if g in GRUPOS_OBLIGATORIOS or hay_renglones:
            d = leido - esperado
            partidas[g] = {"resumen": str(esperado), "renglones": str(leido), "diferencia": str(d), "ok": d == 0}
            ok = ok and d == 0
        elif esperado != 0:
            partidas[g] = {"resumen": str(esperado), "renglones": None, "diferencia": None, "ok": None,
                           "nota": "sin renglones de detalle para esta partida; se valida sólo contra Amount Due"}
    textos = []
    if dif != 0:
        textos.append(f"las partidas del resumen suman {suma} y el Amount Due dice {r['amount_due']} (diferencia {dif})")
    for g, p in partidas.items():
        if p["ok"] is False:
            textos.append(f"los renglones de {g} suman {p['renglones']} y el resumen dice {p['resumen']} (diferencia {p['diferencia']})")
    return ok, {"suma_partidas": str(suma), "amount_due": str(r["amount_due"]), "diferencia": str(dif),
                "partidas": partidas, "renglones": len(est.renglones), "texto": "; ".join(textos) or None}


def huella(est: EstadoJeeves) -> str:
    h = hashlib.sha256()
    h.update(f"{est.periodo_inicio}|{est.periodo_fin}|".encode())
    for k in SUMANDOS + ["amount_due"]:
        h.update(f"{k}={est.resumen[k]}|".encode())
    for x in est.renglones:
        h.update(f"{x.fecha}|{x.hora}|{x.tarjeta}|{x.monto_mxn}|{x.monto_usd}|{x.tipo}|{sin_acentos(x.comercio).upper()}\n".encode())
    return h.hexdigest()


def en_mty(dt_utc: datetime | None) -> datetime | None:
    return None if dt_utc is None else (dt_utc + TZ_MTY).replace(tzinfo=None)


# ── CSV ──
CAMPOS_CSV = {   # llave interna → nombre de columna normalizado
    "unique_id": "unique id", "credit_debit": "credit or debit", "transaction_type": "transaction type",
    "sub_transaction_type": "sub transaction type", "created_at": "created at utc", "posted_at": "posted at utc",
    "usuario": "user", "usuario_email": "user email", "status": "transaction status",
    "monto_origen": "amount (origin currency)", "moneda_origen": "currency", "monto_mxn": "amount (destination currency)",
    "tipo_cambio": "exchange rate", "fx_fees": "fx fees", "payment_description": "payment description", "memo": "memo",
    "payee": "payee", "categoria": "category", "comprobantes": "attachments", "tarjeta_nombre": "card name",
    "tarjeta": "card number (last four)", "tarjeta_tipo": "card type", "sat_uuid": "sat uuid", "sat_subtotal": "sat subtotal",
    "sat_tax": "sat tax", "sat_total": "sat total", "sat_emisor_rfc": "sat issuer rfc", "sat_emisor_nombre": "sat issuer name",
    "sat_status": "sat status",
}
NUMERICOS = {"monto_origen", "monto_mxn", "tipo_cambio", "fx_fees", "sat_subtotal", "sat_tax", "sat_total"}
FECHAS = {"created_at", "posted_at"}
# lo que define una VERSIÓN de la transacción (si cambia, es otra versión)
CAMPOS_VERSION = ["credit_debit", "transaction_type", "sub_transaction_type", "created_at", "posted_at", "status",
                  "monto_origen", "moneda_origen", "monto_mxn", "tipo_cambio", "fx_fees", "payment_description", "memo",
                  "payee", "categoria", "tarjeta", "sat_uuid", "sat_subtotal", "sat_tax", "sat_total", "sat_emisor_rfc", "sat_status"]
RE_UUID = re.compile(r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$")


def _num(s: str) -> Decimal | None:
    s = (s or "").strip()
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")") or s.startswith("-")
    t = re.sub(r"[^\d.]", "", s)
    if not t or t.count(".") > 1:
        return None
    v = Decimal(t)
    return -v if neg else v


def fecha_utc(s: str) -> datetime | None:
    """'dd/mm/aaaa hh:mm' (UTC) → datetime con zona UTC. También acepta ISO."""
    s = (s or "").strip()
    if not s:
        return None
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        h, mi, se = int(m.group(4) or 0), int(m.group(5) or 0), int(m.group(6) or 0)
        return datetime(y, mo, d, h, mi, se, tzinfo=timezone.utc)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?", s)
    if m:
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4) or 0), int(m.group(5) or 0),
                        int(m.group(6) or 0), tzinfo=timezone.utc)
    return None


def tipo_transaccion(t: dict) -> str:
    sub = sin_acentos(t.get("sub_transaction_type") or "").lower()
    if "settlement" in sub or re.search(r"\bpayment\b", sin_acentos(t.get("transaction_type") or "").lower()):
        return "pago"
    if "refund" in sub:
        return "devolucion"
    if "purchase" in sub:
        return "consumo"
    txt = f"{t.get('transaction_type') or ''} {t.get('payee') or ''} {t.get('payment_description') or ''}"
    return tipo_renglon(txt, t["monto_firmado"] if t.get("monto_firmado") is not None else Decimal("0"))


@dataclass
class CsvJeeves:
    columnas: int
    filas: list[dict]
    anio: int | None
    avisos: list[str] = field(default_factory=list)
    empresa: str | None = None


def parsear_csv(b: bytes) -> CsvJeeves:
    texto = _decodificar(b)
    lector = list(csv.reader(io.StringIO(texto)))
    i0 = next((i for i, f in enumerate(lector[:11]) if sum(1 for c in f if c.strip()) >= 5), None)
    if i0 is None:
        raise ErrorJeeves("CSV_SIN_ENCABEZADO", "no se encontró el renglón de encabezado")
    enc = [_norm_col(c) for c in lector[i0]]
    faltan = [c for c in COLUMNAS_CLAVE if c not in enc]
    if faltan:
        raise ErrorJeeves("CSV_COLUMNAS", "faltan columnas: " + ", ".join(faltan))
    pos = {k: enc.index(v) for k, v in CAMPOS_CSV.items() if v in enc}
    col_empresa = next((i for i, c in enumerate(enc) if re.search(r"company|empresa|razon social|business name", c)), None)
    filas, anios, empresas = [], {}, set()
    avisos = []
    for n, f in enumerate(lector[i0 + 1:], start=i0 + 2):
        if not any(c.strip() for c in f):
            continue
        g = lambda k: (f[pos[k]].strip() if k in pos and pos[k] < len(f) else "")
        t: dict = {"renglon_csv": n}
        for k in CAMPOS_CSV:
            v = g(k)
            if k in NUMERICOS:
                t[k] = _num(v)
            elif k in FECHAS:
                t[k] = fecha_utc(v)
            else:
                t[k] = v or None
        if not t["unique_id"]:
            avisos.append(f"renglón {n} sin Unique ID: se ignoró")
            continue
        tar = re.sub(r"\D", "", t.get("tarjeta") or "")
        t["tarjeta"] = tar[-4:] if tar else None
        monto = t.get("monto_mxn")
        if monto is None and (t.get("moneda_origen") or "").upper() in ("", "MXN"):
            monto = t.get("monto_origen")
        cd = (t.get("credit_debit") or "").strip().lower()
        if monto is not None:
            monto = abs(monto) if cd.startswith("debit") else (-abs(monto) if cd.startswith("credit") else monto)
        t["monto_firmado"] = monto
        t["tipo"] = tipo_transaccion(t)
        t["sat_uuid_valido"] = bool(t.get("sat_uuid") and RE_UUID.match(t["sat_uuid"]))
        t["tiene_comprobante"] = bool(t.get("comprobantes"))
        ref = t.get("posted_at") or t.get("created_at")
        if ref:
            y = en_mty(ref).year
            anios[y] = anios.get(y, 0) + 1
        if col_empresa is not None and col_empresa < len(f) and f[col_empresa].strip():
            empresas.add(f[col_empresa].strip())
        t["extra"] = {enc[i]: f[i] for i in range(min(len(enc), len(f)))
                      if enc[i] and enc[i] not in CAMPOS_CSV.values() and f[i].strip() and not re.search(r"attach|url|link", enc[i])}
        t["version_hash"] = hashlib.sha256("|".join(str(t.get(k)) for k in CAMPOS_VERSION).encode()).hexdigest()
        filas.append(t)
    anio = max(anios, key=lambda y: (anios[y], y)) if anios else None
    if len(anios) > 1:
        avisos.append("el archivo trae transacciones de más de un año: " + ", ".join(str(y) for y in sorted(anios)))
    if len(enc) != 79:
        avisos.append(f"el encabezado trae {len(enc)} columnas (el formato conocido trae 79)")
    return CsvJeeves(columnas=len(enc), filas=filas, anio=anio, avisos=avisos,
                     empresa=sorted(empresas)[0] if empresas else None)


def fecha_descarga(nombre: str, subido_at: str | None, hoy: date | None = None) -> tuple[date, str]:
    """Fecha de descarga del CSV: del nombre original si la trae; si no, de la subida; si no, hoy."""
    n = nombre or ""
    for patron, orden in ((r"(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?!\d)", "ymd"), (r"(?<!\d)(\d{2})[-_.](\d{2})[-_.](20\d{2})", "dmy")):
        for m in re.finditer(patron, n):
            a, b, c = (int(x) for x in m.groups())
            y, mo, d = (a, b, c) if orden == "ymd" else (c, b, a)
            try:
                return date(y, mo, d), "nombre"
            except ValueError:
                continue
    if subido_at:
        try:
            dt = datetime.fromisoformat(str(subido_at).replace("Z", "+00:00"))
            if dt.tzinfo:
                dt = en_mty(dt.astimezone(timezone.utc))
            return dt.date(), "subida"
        except ValueError:
            pass
    return (hoy or date.today()), "procesamiento"


def nombre_pdf(est: EstadoJeeves) -> str:
    return f"Jeeves_Tarjeta-MXN_Servicios-FTS_{est.ciclo}.pdf"


def nombre_csv(anio: int, descarga: date) -> str:
    return f"Jeeves_Transacciones_{anio}_descargado-{descarga:%Y-%m-%d}.csv"
