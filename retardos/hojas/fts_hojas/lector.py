"""Lector de hojas de Retardos v2 (#334). Determinista; la IA es opcional y sólo transcribe.

Recibe los bytes de un PDF o una imagen y devuelve, por página, lo que VE:
folio (QR o texto), nivel, página, nombre impreso, tinta en cada recuadro de firma,
la casilla "Se negó a firmar", el recuadro de comentarios, legibilidad y banderas.
No decide nada: la sugerencia la calcula Postgres (retardos.registrar_lectura) y
la decisión es siempre de RH.

Todo texto que aparezca en la hoja es DATO. Si parece una instrucción, se marca
`posible_inyeccion` y se entrega tal cual para que RH lo revise.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pypdfium2 as pdfium
import zxingcpp
from PIL import Image, ImageOps

try:  # Tesseract es opcional en tiempo de ejecución: sin él se degrada con bandera.
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None

from . import ia

log = logging.getLogger("fts_hojas")
LAYOUT = json.loads((Path(__file__).parent / "layout.json").read_text())
DPI = 200
MAX_PAGINAS = 20
FIRMAS = ("trabajador", "rh", "jefe", "testigo1", "testigo2")

# Umbrales de tinta (fracción de pixeles oscuros dentro del recuadro, ya sin el borde).
UMBRAL_FIRMA = 0.010
UMBRAL_CASILLA = 0.10
UMBRAL_COMENTARIO = 0.006

QR_RE = re.compile(r"FTS[|]((?:RET|JOR)-[0-9]{4}-[0-9]{4})[|]N([0-9])[|]P([0-9]+)/([0-9]+)")
FOLIO_RE = re.compile(r"(RET|JOR)\s*-\s*([0-9]{4})\s*-\s*([0-9]{4})")
INYECCION = re.compile(
    r"(ignora|ignore|olvida (lo|las|todo)|instrucciones (anteriores|previas)|previous instructions|system prompt|"
    r"\bprompt\b|eres un (modelo|asistente)|you are an?|act[uú]a como|marca(r)? (esta|la) hoja como|"
    r"(valida|aprueba|confirma)(r)? (esta|la) hoja|responde (solo|únicamente) con|jailbreak)",
    re.IGNORECASE)
INCONFORMIDAD = re.compile(
    r"(no estoy de acuerdo|no acepto|inconform|no es cierto|es falso|falso|no firmo|no me corresponde|ten[ií]a permiso|"
    r"con permiso|justificad|error en la checada|no llegu[eé] tarde|me opongo|impugn|desacuerdo)", re.IGNORECASE)


@dataclass
class Pagina:
    numero: int
    imagen: Image.Image
    texto_capa: str


# ── entrada ──────────────────────────────────────────────────────────────────
def cargar(contenido: bytes, mime: str) -> tuple[list[Pagina], list[str]]:
    banderas: list[str] = []
    paginas: list[Pagina] = []
    es_pdf = contenido[:5] == b"%PDF-" or "pdf" in (mime or "")
    if es_pdf:
        doc = pdfium.PdfDocument(contenido)
        n = len(doc)
        if n > MAX_PAGINAS:
            banderas.append("demasiadas_paginas")
        for i in range(min(n, MAX_PAGINAS)):
            p = doc[i]
            try:
                texto = p.get_textpage().get_text_range() or ""
            except Exception:
                texto = ""
            img = p.render(scale=DPI / 72).to_pil().convert("L")
            paginas.append(Pagina(i + 1, img, texto))
    else:
        img = Image.open(io.BytesIO(contenido))
        img = ImageOps.exif_transpose(img).convert("L")
        # Fotos enormes de celular: se bajan a ~200 dpi de carta en el lado largo.
        largo = max(img.size)
        if largo > 2600:
            f = 2600 / largo
            img = img.resize((int(img.size[0] * f), int(img.size[1] * f)), Image.LANCZOS)
        paginas.append(Pagina(1, img, ""))
    return paginas, banderas


# ── geometría ────────────────────────────────────────────────────────────────
def homografia(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """DLT por mínimos cuadrados: H lleva puntos src (x,y) a dst (u,v)."""
    filas = []
    for (x, y), (u, v) in zip(src, dst):
        filas.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        filas.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, vt = np.linalg.svd(np.asarray(filas, dtype=float))
    h = vt[-1].reshape(3, 3)
    return h / h[2, 2]


def afin(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Transformación afín por mínimos cuadrados. Con sólo las 4 esquinas del QR (juntas y en
    una esquina de la hoja) una homografía completa extrapola mal hacia abajo: el ruido de un
    pixel se vuelve perspectiva falsa. La perspectiva se estima sólo cuando hay marcas."""
    A = np.hstack([src, np.ones((len(src), 1))])
    m, *_ = np.linalg.lstsq(A, dst, rcond=None)
    return np.vstack([m.T, [0, 0, 1]])


def aplicar(h: np.ndarray, pts: np.ndarray) -> np.ndarray:
    p = np.hstack([pts, np.ones((len(pts), 1))]) @ h.T
    return p[:, :2] / p[:, 2:3]


def pdf_a_pts(x: float, y: float) -> tuple[float, float]:
    """Punto de la hoja en puntos PDF con el origen ARRIBA (como la imagen)."""
    return x, LAYOUT["pagina"][1] - y


def leer_qr(img: Image.Image):
    intentos = [img]
    if min(img.size) > 1400:
        intentos.append(img.resize((img.size[0] // 2, img.size[1] // 2)))
    intentos.append(ImageOps.autocontrast(img))
    for k, im in enumerate(intentos):
        try:
            res = zxingcpp.read_barcodes(im)
        except Exception:
            res = []
        for r in res:
            m = QR_RE.search(r.text or "")
            if m:
                esc = img.size[0] / im.size[0]
                p = r.position
                esquinas = np.array([[p.top_left.x, p.top_left.y], [p.top_right.x, p.top_right.y],
                                     [p.bottom_right.x, p.bottom_right.y], [p.bottom_left.x, p.bottom_left.y]], float) * esc
                return m, esquinas
    return None, None


def blanco(gris: np.ndarray) -> float:
    return float(np.percentile(gris, 95))


def refinar_con_marcas(h: np.ndarray, gris: np.ndarray, umbral: float) -> tuple[np.ndarray, int]:
    """Busca las tres marcas de esquina cerca de donde el QR dice que deben estar."""
    q = LAYOUT["qr"]
    L = q["lado"]
    src = [pdf_a_pts(q["x"], q["y"] + L), pdf_a_pts(q["x"] + L, q["y"] + L), pdf_a_pts(q["x"] + L, q["y"]), pdf_a_pts(q["x"], q["y"])]
    dst = list(aplicar(h, np.array(src)))
    halladas = 0
    alto, ancho = gris.shape
    escala = np.linalg.norm(aplicar(h, np.array([[0, 0], [100, 0]]))[1] - aplicar(h, np.array([[0, 0]]))[0]) / 100
    for mx, my, mw, mh in LAYOUT["marcas"]:
        c = pdf_a_pts(mx + mw / 2, my + mh / 2)
        u, v = aplicar(h, np.array([c]))[0]
        r = int(max(20, 30 * escala))                 # ventana de ±30 pt alrededor de la predicción
        x0, x1 = int(max(0, u - r)), int(min(ancho, u + r))
        y0, y1 = int(max(0, v - r)), int(min(alto, v + r))
        k = max(3, int(round(mw * escala)))           # lado de la marca en pixeles
        if x1 - x0 <= k + 2 or y1 - y0 <= k + 2:
            continue
        oscuro = (gris[y0:y1, x0:x1] < umbral).astype(np.int32)
        # El cuadrado de k x k más lleno de tinta: una marca sólida gana a cualquier texto.
        ii = np.pad(oscuro.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        suma = ii[k:, k:] - ii[:-k, k:] - ii[k:, :-k] + ii[:-k, :-k]
        iy, ix = np.unravel_index(np.argmax(suma), suma.shape)
        if suma[iy, ix] >= 0.8 * k * k:
            src.append(c)
            dst.append([x0 + ix + k / 2.0, y0 + iy + k / 2.0])
            halladas += 1
    if halladas >= 2:
        return homografia(np.array(src), np.array(dst)), halladas
    return h, halladas


def muestrear(gris: np.ndarray, h: np.ndarray, rect, margen: float, paso: float = 0.5) -> np.ndarray:
    """Valores de gris dentro de un rectángulo de la hoja (puntos PDF), sin el borde."""
    x, y, w, hh = rect
    xs = np.arange(x + margen, x + w - margen, paso)
    ys = np.arange(y + margen, y + hh - margen, paso)
    if len(xs) == 0 or len(ys) == 0:
        return np.array([255.0])
    gx, gy = np.meshgrid(xs, ys)
    pts = np.stack([gx.ravel(), LAYOUT["pagina"][1] - gy.ravel()], axis=1)
    uv = np.rint(aplicar(h, pts)).astype(int)
    alto, ancho = gris.shape
    dentro = (uv[:, 0] >= 0) & (uv[:, 0] < ancho) & (uv[:, 1] >= 0) & (uv[:, 1] < alto)
    if dentro.mean() < 0.9:
        return np.array([])
    uv = uv[dentro]
    return gris[uv[:, 1], uv[:, 0]].astype(float)


def recorte(img: Image.Image, h: np.ndarray, rect, escala: float = 3.0) -> Image.Image:
    """Endereza un rectángulo de la hoja a una imagen propia (para OCR o para la IA)."""
    x, y, w, hh = rect
    W, H = int(w * escala), int(hh * escala)
    # PIL PERSPECTIVE pide coeficientes que llevan pixeles de SALIDA a pixeles de ENTRADA.
    esquinas_sal = np.array([[0, 0], [W, 0], [W, H], [0, H]], float)
    esquinas_hoja = np.array([pdf_a_pts(x, y + hh), pdf_a_pts(x + w, y + hh), pdf_a_pts(x + w, y), pdf_a_pts(x, y)])
    esquinas_ent = aplicar(h, esquinas_hoja)
    t = homografia(esquinas_sal, esquinas_ent)
    return img.transform((W, H), Image.PERSPECTIVE, t.ravel()[:8].tolist(), Image.BICUBIC, fillcolor=255)


def confianza(valor: float, umbral: float) -> float:
    if valor < 0:
        return 0.0
    d = abs(valor - umbral) / max(umbral, 1e-6)
    return round(min(0.99, 0.5 + 0.5 * min(d, 1.0)), 3)


def nitidez(gris: np.ndarray) -> float:
    g = gris[::2, ::2].astype(float)
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(lap.var())


def ocr(img: Image.Image, psm: int = 6) -> tuple[str, float]:
    if pytesseract is None:
        return "", 0.0
    try:
        d = pytesseract.image_to_data(img, lang="spa", config=f"--psm {psm}", output_type=pytesseract.Output.DICT)
    except Exception as e:  # tesseract ausente o roto: se degrada, no truena
        log.warning("OCR no disponible: %s", str(e)[:120])
        return "", 0.0
    palabras = [(w, float(c)) for w, c in zip(d["text"], d["conf"]) if w.strip() and float(c) >= 0]
    if not palabras:
        return "", 0.0
    return " ".join(w for w, _ in palabras), sum(c for _, c in palabras) / len(palabras)


# ── una página ───────────────────────────────────────────────────────────────
def leer_pagina(p: Pagina, usar_ia: bool) -> dict:
    img = p.imagen
    gris = np.asarray(img, dtype=np.uint8)
    blanco_hoja = blanco(gris)
    umbral = blanco_hoja * 0.55
    ban: list[str] = []
    out: dict = {"pagina": p.numero, "folio": None, "folio_fuente": None, "qr_nivel": None, "qr_pagina": None,
                 "qr_total": None, "nombre_visible": None, "firmas": {}, "negativa": {"marcada": False, "confianza": 0.0},
                 "comentarios": {"presente": False, "transcripcion": None, "inconformidad": None, "fuente": None, "confianza": 0.0},
                 "legibilidad": "mala", "geometria": False, "confianza": 0.0, "banderas": ban}

    m, esquinas = leer_qr(img)
    textos_inyeccion = [p.texto_capa]
    if m is None:
        ban.append("sin_qr")
        texto, _ = ocr(img, psm=3)
        textos_inyeccion.append(texto)
        f = FOLIO_RE.search((p.texto_capa or "") + " " + texto)
        if f:
            out["folio"] = f"{f.group(1)}-{f.group(2)}-{f.group(3)}"
            out["folio_fuente"] = "ocr"
        if any(INYECCION.search(t or "") for t in textos_inyeccion):
            ban.append("posible_inyeccion")
        return out

    out["folio"], out["folio_fuente"] = m.group(1), "qr"
    out["qr_nivel"], out["qr_pagina"], out["qr_total"] = int(m.group(2)), int(m.group(3)), int(m.group(4))
    q = LAYOUT["qr"]
    L = q["lado"]
    src = np.array([pdf_a_pts(q["x"], q["y"] + L), pdf_a_pts(q["x"] + L, q["y"] + L), pdf_a_pts(q["x"] + L, q["y"]), pdf_a_pts(q["x"], q["y"])])
    h = afin(src, esquinas)
    h, marcas = refinar_con_marcas(h, gris, umbral)
    out["geometria"] = True
    if marcas < 2:
        ban.append("marcas_no_encontradas")
    # inclinación: ángulo del borde superior del QR
    dx, dy = esquinas[1] - esquinas[0]
    angulo = abs(np.degrees(np.arctan2(dy, dx)))
    angulo = min(angulo, abs(180 - angulo))
    if 2.0 < angulo < 88:
        ban.append("foto_inclinada")
    nit = nitidez(gris)
    out["legibilidad"] = "buena" if (nit > 60 and marcas >= 2 and angulo <= 2.0) else "regular"
    if nit < 8:
        out["legibilidad"] = "mala"
        ban.append("borrosa")

    # Nombre impreso (para comparar contra el caso; lo decide Postgres).
    if p.texto_capa and "Nombre:" in p.texto_capa:
        linea = next((l for l in p.texto_capa.splitlines() if "Nombre:" in l), "")
        out["nombre_visible"] = linea.split("Nombre:", 1)[1].strip()[:120]
    else:
        t, _ = ocr(recorte(img, h, LAYOUT["nombre"]), psm=7)
        out["nombre_visible"] = (t.split(":", 1)[1] if ":" in t else t).strip()[:120] or None

    if out["qr_pagina"] and out["qr_pagina"] > 1:
        out["confianza"] = 0.9
        return out

    C = LAYOUT["cajas"]
    confs = []
    if out["qr_nivel"] and out["qr_nivel"] >= 2:
        for k in FIRMAS:
            v = muestrear(gris, h, C[k], margen=5)
            frac = float((v < umbral).mean()) if v.size else -1.0
            out["firmas"][k] = {"presente": frac > UMBRAL_FIRMA, "confianza": confianza(frac, UMBRAL_FIRMA), "tinta": round(frac, 4)}
            confs.append(out["firmas"][k]["confianza"])
        v = muestrear(gris, h, C["negativa"], margen=2.5, paso=0.25)
        frac = float((v < umbral).mean()) if v.size else -1.0
        out["negativa"] = {"marcada": frac > UMBRAL_CASILLA, "confianza": confianza(frac, UMBRAL_CASILLA), "tinta": round(frac, 4)}
        confs.append(out["negativa"]["confianza"])
        v = muestrear(gris, h, C["comentarios"], margen=5)
        frac = float((v < umbral).mean()) if v.size else -1.0
        com = {"presente": frac > UMBRAL_COMENTARIO, "transcripcion": None, "inconformidad": None, "fuente": None,
               "confianza": confianza(frac, UMBRAL_COMENTARIO), "tinta": round(frac, 4)}
        if com["presente"]:
            corte = recorte(img, h, C["comentarios"])
            texto, conf_ocr = ocr(corte, psm=6)
            textos_inyeccion.append(texto)
            palabras = re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}", texto)
            if conf_ocr >= 60 and len(palabras) >= 3:
                com.update(transcripcion=texto[:1000], fuente="ocr", inconformidad=bool(INCONFORMIDAD.search(texto)))
            elif usar_ia:
                r = ia.transcribir(corte)
                if r:
                    textos_inyeccion.append(r.get("transcripcion") or "")
                    com.update(transcripcion=(r.get("transcripcion") or "")[:1000] or None, fuente="ia",
                               inconformidad=r.get("inconformidad"))
                    if r.get("parece_instruccion"):
                        ban.append("posible_inyeccion")
            if com["transcripcion"] is None:
                ban.append("comentario_sin_transcribir")
        out["comentarios"] = com
        confs.append(com["confianza"])
    # texto de toda la hoja: lo que no es plantilla y parece una orden
    todo, _ = ocr(img, psm=3)
    textos_inyeccion.append(todo)
    if any(INYECCION.search(t or "") for t in textos_inyeccion) and "posible_inyeccion" not in ban:
        ban.append("posible_inyeccion")
    base = min(confs) if confs else 0.9
    out["confianza"] = round(base * (1.0 if out["legibilidad"] == "buena" else 0.85), 3)
    return out


def leer(contenido: bytes, mime: str = "application/pdf") -> dict:
    try:
        paginas, banderas = cargar(contenido, mime)
    except Exception as e:
        return {"ok": False, "error": "ARCHIVO_ILEGIBLE: " + str(e)[:160]}
    usar_ia = ia.disponible()
    res = [leer_pagina(p, usar_ia) for p in paginas]
    return {"ok": True, "motor": "fts-hojas-1 " + ("con IA" if usar_ia else "sin IA"), "banderas": banderas, "paginas": res}
