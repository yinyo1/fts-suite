"""Parser determinista de estados de cuenta BBVA México (PDF con texto).

Lee por COORDENADAS, no por texto corrido: el lado (cargo o abono) de un
importe se decide por la columna bajo la que está impreso, nunca por la
aritmética del saldo. Si se decidiera por el saldo, V2 sería una tautología.

Todo lo que el parser no reconoce se reporta con nombre (MARCADOR_AUSENTE,
SIN_ENCABEZADO_COLUMNAS…), nunca se devuelve vacío: un vacío se confunde
con "no había nada" (CLAUDE.md §20 #11).
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

import pdfplumber

from . import PARSER_VERSION
from .util import CERO, MESES, dinero, es_monto, sha256_texto


class ErrorParser(Exception):
    def __init__(self, codigo: str, mensaje: str, pagina: int | None = None):
        super().__init__(f"{codigo}: {mensaje}")
        self.codigo, self.mensaje, self.pagina = codigo, mensaje, pagina


@dataclass
class Palabra:
    texto: str
    x0: float
    x1: float
    top: float

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2


@dataclass
class Movimiento:
    renglon: int
    pagina: int
    fecha_operacion: date
    fecha_liquidacion: date | None
    codigo: str | None
    descripcion: str
    cargo: Decimal = CERO
    abono: Decimal = CERO
    saldo_operacion_impreso: Decimal | None = None
    saldo_liquidacion_impreso: Decimal | None = None
    referencia: str | None = None
    contraparte: str | None = None
    saldo_calculado: Decimal = CERO
    hash: str = ""

    @property
    def neto(self) -> Decimal:
        return self.abono - self.cargo


@dataclass
class EstadoParseado:
    parser: str
    parser_version: str
    numero_cuenta: str | None
    clabe: str | None
    rfc: str | None
    moneda: str
    periodo_inicio: date
    periodo_fin: date
    saldo_inicial: Decimal
    saldo_liq_inicial: Decimal | None
    saldo_final: Decimal
    resumen_num_abonos: int
    resumen_total_abonos: Decimal
    resumen_num_cargos: int
    resumen_total_cargos: Decimal
    totales_num_abonos: int | None
    totales_total_abonos: Decimal | None
    totales_num_cargos: int | None
    totales_total_cargos: Decimal | None
    paginas: dict
    num_paginas: int
    texto_encabezado: str
    movimientos: list[Movimiento] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    # Estado de APERTURA (#352): la fecha del renglón C98 'APERTURA DE CUENTA', que BBVA imprime sin importe.
    apertura: date | None = None

    @property
    def periodo(self) -> str:
        return f"{self.periodo_fin.year:04d}-{self.periodo_fin.month:02d}"

    @property
    def comisiones(self) -> Decimal:
        s = CERO
        for m in self.movimientos:
            if (m.codigo or "") in ("S39", "S40") or re.search(r"\bCOM(ISION|\.)", m.descripcion.upper()):
                s += m.cargo
        return s


# ── alias de etiquetas (un formato ajeno se lee por alias, §20 #16) ──
RE_PERIODO = re.compile(r"DEL\s+(\d{2})/(\d{2})/(\d{4})\s+AL\s+(\d{2})/(\d{2})/(\d{4})", re.I)
RE_RFC = re.compile(r"R\.?\s*F\.?\s*C\.?\s*:?\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})", re.I)
RE_CUENTA = re.compile(r"(?:No\.?\s*de\s*Cuenta|N[uú]mero\s+de\s+Cuenta|Cuenta)\s*:?\s*(\d{10,11})(?!\d)", re.I)
RE_CLABE = re.compile(r"CLABE\s*:?\s*(\d{18})", re.I)
M = r"(-?[\d,]+\.\d{2})"
ALIAS_SALDO_INICIAL = [r"Saldo\s+Anterior", r"Saldo\s+de\s+Operaci[oó]n\s+Inicial", r"Saldo\s+Inicial"]
ALIAS_SALDO_LIQ_INI = [r"Saldo\s+de\s+Liquidaci[oó]n\s+Inicial"]
ALIAS_SALDO_FINAL = [r"Saldo\s+Final\s*\(\+\)", r"Saldo\s+de\s+Operaci[oó]n\s+Final", r"Saldo\s+Final"]
RE_ABONOS = re.compile(r"Dep[oó]sitos\s*/\s*Abonos\s*\(\+\)\s*(\d+)\s+" + M, re.I)
RE_CARGOS = re.compile(r"Retiros\s*/\s*Cargos\s*\(-\)\s*(\d+)\s+" + M, re.I)
RE_TOT_CARGOS = re.compile(r"TOTAL\s+IMPORTE\s+CARGOS\s+" + M + r"\s+TOTAL\s+MOVIMIENTOS\s+CARGOS\s+(\d+)", re.I)
RE_TOT_ABONOS = re.compile(r"TOTAL\s+IMPORTE\s+ABONOS\s+" + M + r"\s+TOTAL\s+MOVIMIENTOS\s+ABONOS\s+(\d+)", re.I)
RE_FECHA_CORTA = re.compile(r"^(\d{2})/([A-Z]{3})$")
RE_CODIGO = re.compile(r"^[A-Z0-9]{3}$")
RE_FIN_DETALLE = re.compile(r"Total\s+de\s+Movimientos", re.I)
# El movimiento de apertura de una cuenta nueva: BBVA lo imprime como renglón con fecha y SIN importe.
RE_APERTURA = re.compile(r"APERTURA\s+DE\s+CUENTA", re.I)
RE_USD = re.compile(r"D[OÓ]LAR(ES)?|USD|DLLS", re.I)

COLUMNAS = {
    "cargo": ("CARGOS",),
    "abono": ("ABONOS",),
    "saldo_op": ("OPERACIÓN", "OPERACION"),
    "saldo_liq": ("LIQUIDACIÓN", "LIQUIDACION"),
}


def _buscar(alias: list[str], texto: str) -> Decimal | None:
    for a in alias:
        m = re.search(a + r"\s*:?\s*\$?\s*" + M, texto, re.I)
        if m:
            return dinero(m.group(1))
    return None


def _lineas(page) -> list[list[Palabra]]:
    words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False, use_text_flow=False)
    ps = sorted((Palabra(w["text"], w["x0"], w["x1"], w["top"]) for w in words), key=lambda p: (round(p.top), p.x0))
    lineas: list[list[Palabra]] = []
    for p in ps:
        if lineas and abs(lineas[-1][0].top - p.top) <= 2.5:
            lineas[-1].append(p)
        else:
            lineas.append([p])
    return [sorted(l, key=lambda p: p.x0) for l in lineas]


def _fecha(dia: str, mes_txt: str, inicio: date, fin: date) -> date:
    mes = MESES.get(mes_txt.upper())
    if not mes:
        raise ErrorParser("FECHA_INVALIDA", f"mes '{mes_txt}' no reconocido")
    anio = fin.year if mes <= fin.month or inicio.year == fin.year else inicio.year
    if inicio.year != fin.year and mes > fin.month:
        anio = inicio.year
    return date(anio, mes, int(dia))


def abrir_pdf(contenido: bytes):
    return pdfplumber.open(io.BytesIO(contenido))


def texto_paginas(contenido: bytes, max_paginas: int | None = None) -> list[str]:
    with abrir_pdf(contenido) as pdf:
        pags = pdf.pages if max_paginas is None else pdf.pages[:max_paginas]
        return [(p.extract_text() or "") for p in pags]


def parsear(contenido: bytes) -> EstadoParseado:
    with abrir_pdf(contenido) as pdf:
        textos = [(p.extract_text() or "") for p in pdf.pages]
        if not any(t.strip() for t in textos):
            raise ErrorParser("SIN_TEXTO", "el PDF no tiene texto extraíble (¿escaneado?)")
        # Algunos PDF del portal traen antes una hoja que es sólo imagen (sin texto). Esas se
        # saltan; una hoja CON texto que no sea el estado no se salta: eso sería otro documento.
        i0 = 0
        while i0 < len(textos) - 1 and not textos[i0].strip():
            i0 += 1
        p1 = textos[i0]
        paginas: dict = {}
        avisos_ini = [f"la pág. 1 del PDF no tiene texto (imagen); el estado empieza en la pág. {i0 + 1}"] if i0 else []

        mp = RE_PERIODO.search(p1)
        if not mp:
            raise ErrorParser("MARCADOR_AUSENTE", "no se encontró 'Periodo DEL dd/mm/aaaa AL dd/mm/aaaa' en la pág. 1", i0 + 1)
        d1, m1, a1, d2, m2, a2 = (int(x) for x in mp.groups())
        inicio, fin = date(a1, m1, d1), date(a2, m2, d2)
        paginas["periodo"] = i0 + 1

        rfc = (RE_RFC.search(p1).group(1).upper() if RE_RFC.search(p1) else None)
        cuenta = RE_CUENTA.search(p1)
        clabe = RE_CLABE.search(p1)

        # El resumen puede partirse a la pág. 2 en estados largos: se busca en las dos primeras.
        cabecera = "\n".join(textos[i0:i0 + 2])
        si = _buscar(ALIAS_SALDO_INICIAL, cabecera)
        sli = _buscar(ALIAS_SALDO_LIQ_INI, cabecera)
        sf = _buscar(ALIAS_SALDO_FINAL, cabecera)
        ra, rc = RE_ABONOS.search(cabecera), RE_CARGOS.search(cabecera)
        faltan = [n for n, v in (("Saldo Anterior", si), ("Saldo Final", sf), ("Depósitos / Abonos", ra), ("Retiros / Cargos", rc)) if v is None]
        if faltan:
            raise ErrorParser("MARCADOR_AUSENTE", "no se encontró en el resumen 'Comportamiento': " + ", ".join(faltan), i0 + 1)
        for clave, alias in (("saldo_inicial", ALIAS_SALDO_INICIAL), ("saldo_final", ALIAS_SALDO_FINAL)):
            paginas[clave] = next((i + 1 for i, t in enumerate(textos[:i0 + 2]) if i >= i0 and any(re.search(a, t, re.I) for a in alias)), i0 + 1)
        paginas["resumen"] = next((i + 1 for i, t in enumerate(textos[:i0 + 2]) if i >= i0 and RE_ABONOS.search(t)), i0 + 1)

        todo = "\n".join(textos)
        tc, ta = RE_TOT_CARGOS.search(todo), RE_TOT_ABONOS.search(todo)
        if tc:
            paginas["totales"] = next(i + 1 for i, t in enumerate(textos) if RE_TOT_CARGOS.search(t))
        moneda = "USD" if RE_USD.search(p1) and not re.search(r"MONEDA\s+NACIONAL", p1, re.I) else "MXN"

        est = EstadoParseado(
            parser="bbva", parser_version=PARSER_VERSION,
            numero_cuenta=cuenta.group(1) if cuenta else None, clabe=clabe.group(1) if clabe else None,
            rfc=rfc, moneda=moneda, periodo_inicio=inicio, periodo_fin=fin,
            saldo_inicial=si, saldo_liq_inicial=sli, saldo_final=sf,
            resumen_num_abonos=int(ra.group(1)), resumen_total_abonos=dinero(ra.group(2)),
            resumen_num_cargos=int(rc.group(1)), resumen_total_cargos=dinero(rc.group(2)),
            totales_num_abonos=int(ta.group(2)) if ta else None, totales_total_abonos=dinero(ta.group(1)) if ta else None,
            totales_num_cargos=int(tc.group(2)) if tc else None, totales_total_cargos=dinero(tc.group(1)) if tc else None,
            paginas=paginas, num_paginas=len(pdf.pages), texto_encabezado=p1[:4000],
        )
        est.avisos.extend(avisos_ini)
        if not tc or not ta:
            est.avisos.append("MARCADOR_AUSENTE: bloque 'Total de Movimientos' incompleto; V1 se valida sólo contra el resumen")

        _movimientos(pdf, est)
    return est


def _movimientos(pdf, est: EstadoParseado) -> None:
    columnas: dict[str, float] | None = None
    en_detalle = False
    terminado = False
    actual: Movimiento | None = None
    renglon = 0
    x_desc = None
    ultimo_top = None
    for n, page in enumerate(pdf.pages, start=1):
        if terminado:
            break
        header_top = None
        ultimo_top = None
        for linea in _lineas(page):
            textos = [p.texto.upper() for p in linea]
            unido = " ".join(p.texto for p in linea)
            if re.search(r"Detalle\s+de\s+Movimientos", unido, re.I):
                en_detalle = True
                continue
            # encabezado de columnas (se repite en cada página)
            if "CARGOS" in textos and "ABONOS" in textos:
                cols = {}
                for clave, nombres in COLUMNAS.items():
                    w = next((p for p in linea if p.texto.upper() in nombres), None)
                    if w:
                        cols[clave] = w.xc
                if "cargo" in cols and "abono" in cols:
                    columnas = cols
                    header_top = linea[0].top
                    if actual is not None and actual.pagina != n:
                        # la descripción del último movimiento puede seguir justo debajo del
                        # encabezado repetido de la página nueva
                        ultimo_top = header_top
                    en_detalle = True
                    desc = next((p for p in linea if p.texto.upper().startswith("DESCRIP")), None)
                    x_desc = desc.x0 if desc else x_desc
                continue
            if not en_detalle:
                continue
            if RE_FIN_DETALLE.search(unido):
                terminado = True
                break
            if columnas is None:
                continue
            if header_top is None:
                # página sin encabezado repetido: sólo cuentan renglones con fecha
                pass
            es_mov = (len(linea) >= 2 and RE_FECHA_CORTA.match(linea[0].texto.upper())
                      and RE_FECHA_CORTA.match(linea[1].texto.upper()))
            if es_mov:
                if actual:
                    est.movimientos.append(actual)
                renglon += 1
                f_op = _fecha(*RE_FECHA_CORTA.match(linea[0].texto.upper()).groups(), est.periodo_inicio, est.periodo_fin)
                f_lq = _fecha(*RE_FECHA_CORTA.match(linea[1].texto.upper()).groups(), est.periodo_inicio, est.periodo_fin)
                resto = linea[2:]
                codigo = None
                if resto and RE_CODIGO.match(resto[0].texto) and not es_monto(resto[0].texto):
                    codigo = resto[0].texto
                    resto = resto[1:]
                palabras, montos = [], []
                umbral = min(columnas.values()) - 45
                for p in resto:
                    (montos if es_monto(p.texto) and p.xc >= umbral else palabras).append(p)
                actual = Movimiento(renglon=renglon, pagina=n, fecha_operacion=f_op, fecha_liquidacion=f_lq,
                                    codigo=codigo, descripcion=" ".join(p.texto for p in palabras))
                for p in montos:
                    col = min(columnas, key=lambda k: abs(columnas[k] - p.xc))
                    v = dinero(p.texto)
                    if col == "cargo":
                        if actual.cargo:
                            raise ErrorParser("DOS_CARGOS", f"renglón {renglon} con dos importes en CARGOS", n)
                        actual.cargo = v
                    elif col == "abono":
                        if actual.abono:
                            raise ErrorParser("DOS_ABONOS", f"renglón {renglon} con dos importes en ABONOS", n)
                        actual.abono = v
                    elif col == "saldo_op":
                        actual.saldo_operacion_impreso = v
                    else:
                        actual.saldo_liquidacion_impreso = v
                ultimo_top = linea[0].top
                if _es_apertura(actual, montos, est):
                    # No es un movimiento de dinero: queda como dato del estado y no entra al detalle (no cuenta
                    # en V1 ni en V2). Sólo aquí se acepta un renglón sin importe; cualquier otro sigue rechazándose.
                    est.apertura = actual.fecha_operacion
                    est.avisos.append(f"estado de apertura: la cuenta abrió el {actual.fecha_operacion.isoformat()} "
                                      f"(renglón C98 'APERTURA DE CUENTA', sin importe; saldo inicial 0.00)")
                    actual = None
                    renglon -= 1
                    continue
                if (actual.cargo > 0) == (actual.abono > 0):
                    raise ErrorParser("IMPORTE_AMBIGUO",
                                      f"renglón {renglon} ({linea[0].texto}) sin importe o con cargo y abono a la vez", n)
            elif actual is not None:
                # continuación de la descripción: texto a la derecha de la columna de fecha,
                # sin importes. Pie de página y avisos legales quedan fuera por posición.
                if any(es_monto(p.texto) for p in linea):
                    continue
                if x_desc is not None and linea[0].x0 < x_desc - 25:
                    continue
                if actual.pagina != n and header_top is None:
                    continue
                if ultimo_top is None or linea[0].top - ultimo_top > 14 or linea[0].top < ultimo_top:
                    continue
                ultimo_top = linea[0].top
                actual.descripcion = (actual.descripcion + " " + unido).strip()
    if actual:
        est.movimientos.append(actual)
    if columnas is None:
        # Un mes sin movimientos no trae sección de detalle. Sólo se acepta si el propio banco
        # dice cero en el resumen (y en los totales, si los imprime); V1 y V2 lo verifican después.
        ceros = (est.resumen_num_cargos == 0 and est.resumen_num_abonos == 0
                 and est.totales_num_cargos in (None, 0) and est.totales_num_abonos in (None, 0))
        if not ceros:
            raise ErrorParser("SIN_ENCABEZADO_COLUMNAS", "no se encontró el encabezado CARGOS/ABONOS del detalle")
        est.avisos.append("mes sin movimientos: el banco no imprimió la sección de detalle")
    for m in est.movimientos:
        m.descripcion = re.sub(r"\s+", " ", m.descripcion).strip()
        ref = re.search(r"\bRef\.?\s*:?\s*([A-Z0-9/-]{4,})", m.descripcion, re.I)
        bnet = re.search(r"\bBNET\s*(\d{6,})", m.descripcion, re.I)
        m.referencia = (ref.group(1) if ref else None) or (("BNET " + bnet.group(1)) if bnet else None)


def _es_apertura(mov: Movimiento, montos: list, est: EstadoParseado) -> bool:
    """El renglón C98 'APERTURA DE CUENTA' de una cuenta nueva (#352). Se acepta SÓLO si es exactamente eso:
    primer renglón del detalle, código C98, descripción de apertura, ningún importe impreso (ni saldos), fecha =
    inicio del periodo y saldo inicial 0.00. Si falta cualquiera, el renglón sigue el camino normal y, sin
    importe, se rechaza como IMPORTE_AMBIGUO: no se afloja nada para los demás estados."""
    return (mov.renglon == 1 and not montos and (mov.codigo or "").upper() == "C98"
            and bool(RE_APERTURA.search(mov.descripcion or ""))
            and mov.fecha_operacion == est.periodo_inicio
            and est.saldo_inicial == 0 and not est.movimientos)


def calcular_hashes(est: EstadoParseado, numero_cuenta: str) -> str:
    hashes = []
    for m in est.movimientos:
        m.hash = sha256_texto("|".join([
            numero_cuenta, est.periodo, str(m.renglon), m.fecha_operacion.isoformat(),
            m.fecha_liquidacion.isoformat() if m.fecha_liquidacion else "", m.codigo or "",
            m.descripcion, f"{m.cargo:.2f}", f"{m.abono:.2f}",
        ]))
        hashes.append(m.hash)
    return sha256_texto("\n".join(hashes))
