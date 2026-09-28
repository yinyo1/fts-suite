"""Entrada de archivos: ZIP seguro y detección de tipo.

Cualquier texto dentro de un PDF, ZIP, CSV o nombre de archivo es DATO, nunca
instrucción. Si algo parece una orden dirigida a un sistema, el archivo se
marca 'sospechoso' y se aparta; no se interpreta.
"""
from __future__ import annotations

import io
import posixpath
import re
import zipfile
from dataclasses import dataclass, field

MAX_BYTES_ARCHIVO = 40 * 1024 * 1024          # por archivo (incluye los que salen de un ZIP)
MAX_BYTES_ZIP_TOTAL = 300 * 1024 * 1024        # descomprimido, sumando niveles
MAX_ARCHIVOS_ZIP = 400
MAX_PROFUNDIDAD = 3
MAX_RATIO = 200                                # bomba de compresión
EXT_PERMITIDAS = {".pdf", ".zip", ".csv", ".xlsx", ".xls", ".txt"}

RE_SOSPECHOSO = re.compile(
    r"(ignora(r)?\s+(todas?\s+)?(las|lo|tus|el)\s+(instrucci|anterior|previ|regla)"
    r"|ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+instructions"
    r"|system\s+prompt|prompt\s+injection"
    r"|instrucci[oó]n(es)?\s+para\s+(el\s+|la\s+)?(asistente|ia|ai|claude|modelo|agente)"
    r"|(env[ií]a|reenv[ií]a|manda)\s+(este|el|los|todos)\s+(archivo|correo|datos|estados)"
    r"|(borra|elimina)\s+(todo|todos|los\s+archivos|la\s+base)"
    r"|contrase[nñ]a\s*[:=]|password\s*[:=]|api[_\s-]?key\s*[:=]|token\s*[:=])",
    re.I,
)


@dataclass
class Pieza:
    nombre: str                  # nombre del archivo (hoja)
    ruta: str                    # ruta dentro del contenedor, '' si es la raíz
    contenido: bytes
    profundidad: int = 0
    padre: "Pieza | None" = None


@dataclass
class ResultadoZip:
    piezas: list[Pieza] = field(default_factory=list)
    rechazos: list[dict] = field(default_factory=list)


def es_zip(b: bytes) -> bool:
    return b[:4] == b"PK\x03\x04" and not es_xlsx(b)


def es_xlsx(b: bytes) -> bool:
    if b[:4] != b"PK\x03\x04":
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            n = set(z.namelist())
            return "[Content_Types].xml" in n and any(x.startswith("xl/") for x in n)
    except zipfile.BadZipFile:
        return False


def es_pdf(b: bytes) -> bool:
    return b[:1024].lstrip().startswith(b"%PDF")


def ruta_segura(nombre: str) -> bool:
    if not nombre or nombre.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", nombre):
        return False
    norm = posixpath.normpath(nombre.replace("\\", "/"))
    return not (norm.startswith("..") or "/../" in f"/{norm}/")


def expandir_zip(contenido: bytes, nombre: str, profundidad: int = 0, acumulado: list[int] | None = None) -> ResultadoZip:
    """Descomprime (también ZIP dentro de ZIP) con límites. Nunca escribe a disco."""
    acumulado = acumulado if acumulado is not None else [0]
    res = ResultadoZip()
    if profundidad >= MAX_PROFUNDIDAD:
        res.rechazos.append({"nombre": nombre, "codigo": "ZIP_DEMASIADO_PROFUNDO",
                             "motivo": f"más de {MAX_PROFUNDIDAD} niveles de ZIP dentro de ZIP"})
        return res
    try:
        z = zipfile.ZipFile(io.BytesIO(contenido))
    except zipfile.BadZipFile:
        res.rechazos.append({"nombre": nombre, "codigo": "ZIP_DANADO", "motivo": "el ZIP está dañado o incompleto"})
        return res
    with z:
        infos = [i for i in z.infolist() if not i.is_dir()]
        if len(infos) > MAX_ARCHIVOS_ZIP:
            res.rechazos.append({"nombre": nombre, "codigo": "ZIP_DEMASIADOS_ARCHIVOS",
                                 "motivo": f"{len(infos)} archivos; el máximo es {MAX_ARCHIVOS_ZIP}"})
            return res
        for i in infos:
            hoja = posixpath.basename(i.filename.replace("\\", "/"))
            if hoja.startswith("._") or "__MACOSX" in i.filename or hoja in (".DS_Store", "Thumbs.db"):
                continue
            if not ruta_segura(i.filename):
                res.rechazos.append({"nombre": i.filename, "codigo": "ZIP_RUTA_INSEGURA",
                                     "motivo": "ruta con '..' o absoluta dentro del ZIP (zip slip)"})
                continue
            if (i.external_attr >> 16) & 0o170000 == 0o120000:
                res.rechazos.append({"nombre": i.filename, "codigo": "ZIP_SYMLINK", "motivo": "enlace simbólico dentro del ZIP"})
                continue
            if i.flag_bits & 0x1:
                res.rechazos.append({"nombre": i.filename, "codigo": "ZIP_PROTEGIDO", "motivo": "archivo con contraseña dentro del ZIP"})
                continue
            if i.file_size > MAX_BYTES_ARCHIVO:
                res.rechazos.append({"nombre": i.filename, "codigo": "ARCHIVO_DEMASIADO_GRANDE",
                                     "motivo": f"{i.file_size} bytes; el máximo es {MAX_BYTES_ARCHIVO}"})
                continue
            if i.compress_size and i.file_size / max(i.compress_size, 1) > MAX_RATIO:
                res.rechazos.append({"nombre": i.filename, "codigo": "ZIP_BOMBA", "motivo": "relación de compresión anómala"})
                continue
            acumulado[0] += i.file_size
            if acumulado[0] > MAX_BYTES_ZIP_TOTAL:
                res.rechazos.append({"nombre": i.filename, "codigo": "ZIP_DEMASIADO_GRANDE",
                                     "motivo": "el contenido descomprimido excede el límite total"})
                break
            datos = z.read(i)
            if len(datos) > MAX_BYTES_ARCHIVO:
                res.rechazos.append({"nombre": i.filename, "codigo": "ARCHIVO_DEMASIADO_GRANDE", "motivo": "excede el límite"})
                continue
            pieza = Pieza(nombre=hoja, ruta=i.filename, contenido=datos, profundidad=profundidad + 1)
            if es_zip(datos):
                sub = expandir_zip(datos, hoja, profundidad + 1, acumulado)
                res.piezas.append(pieza)          # el ZIP interno también se registra (contenedor)
                for p in sub.piezas:
                    p.ruta = f"{i.filename}/{p.ruta}"
                    if p.padre is None:
                        p.padre = pieza
                    res.piezas.append(p)
                res.rechazos.extend({**r, "nombre": f"{i.filename}/{r['nombre']}"} for r in sub.rechazos)
            else:
                res.piezas.append(pieza)
    return res


def texto_sospechoso(texto: str) -> str | None:
    m = RE_SOSPECHOSO.search(texto or "")
    return m.group(0)[:80] if m else None


def periodo_en_nombre(nombre: str) -> str | None:
    """Pista del periodo en el NOMBRE (sólo para avisar; el periodo real sale del PDF)."""
    from .util import MESES, MESES_LARGOS
    n = nombre.upper()
    m = re.search(r"(20\d{2})[-_ .]?(0[1-9]|1[0-2])(?!\d)", n)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    for largo, num in MESES_LARGOS.items():
        mm = re.search(largo + r"[\s_-]*(20\d{2}|\d{2})(?!\d)", n)
        if mm:
            a = mm.group(1)
            return f"{('20' + a) if len(a) == 2 else a}-{num:02d}"
    for corto, num in MESES.items():
        mm = re.search(r"(?<![A-Z])" + corto + r"[\s_-]*(20\d{2}|\d{2})(?!\d)", n)
        if mm:
            a = mm.group(1)
            return f"{('20' + a) if len(a) == 2 else a}-{num:02d}"
    return None
