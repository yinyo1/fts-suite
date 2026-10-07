"""Evaluación de punta a punta del lector con variantes de hojas INVENTADAS (#334).

Toma las hojas de tests/fixtures y fabrica variantes (ángulo, desenfoque, compresión,
resolución de celular) para medir aciertos por campo y la confianza reportada. Imprime un
resumen en JSON, sin datos personales (todo es inventado).

Uso: python retardos/hojas/tests/evaluar.py [--rapido]
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

AQUI = Path(__file__).parent
sys.path.insert(0, str(AQUI.parent))
from fts_hojas import lector  # noqa: E402

FIX = AQUI / "fixtures"
ESP = json.loads((FIX / "esperado.json").read_text())
BASE = ["01-completa.jpg", "02-falta-trabajador.jpg", "03-negativa-con-testigos.jpg", "04-negativa-sin-testigos.jpg",
        "05-inconformidad.jpg", "10-inyeccion.jpg"]


def variante(img: Image.Image, ang: float, blur: float, q: int, escala: float) -> bytes:
    w, h = img.size
    lienzo = Image.new("L", (int(w * 1.15), int(h * 1.12)), 110)
    lienzo.paste(img, (int(w * 0.07), int(h * 0.06)))
    lienzo = lienzo.rotate(ang, resample=Image.BICUBIC, fillcolor=110)
    if blur:
        lienzo = lienzo.filter(ImageFilter.GaussianBlur(blur))
    lienzo = lienzo.resize((int(lienzo.size[0] * escala), int(lienzo.size[1] * escala)))
    buf = io.BytesIO(); lienzo.save(buf, format="JPEG", quality=q); return buf.getvalue()


def comparar(p: dict, e: dict) -> dict:
    r = {"folio": p["folio"] == e["folio"]}
    for k, v in e["firmas"].items():
        r["firma_" + k] = p["firmas"].get(k, {}).get("presente") is v
    r["negativa"] = p["negativa"]["marcada"] is e["negativa"]
    r["comentario"] = p["comentarios"]["presente"] is e["comentario"]
    r["inyeccion"] = ("posible_inyeccion" in p["banderas"]) is bool(e.get("inyeccion"))
    return r


def main():
    rapido = "--rapido" in sys.argv
    variantes = [(0, 0, 85, 1.0), (3, 0.6, 70, 0.9), (-7, 0.8, 60, 0.8), (11, 1.0, 55, 0.75), (-14, 1.2, 45, 0.7)]
    if rapido:
        variantes = variantes[:3]
    tot, ok, confs, fallas, sin_qr, n = {}, {}, [], [], 0, 0
    for nombre in BASE:
        img = Image.open(FIX / nombre).convert("L")
        for (a, b, q, s) in variantes:
            n += 1
            r = lector.leer(variante(img, a, b, q, s), "image/jpeg")
            p = r["paginas"][0]
            if p["folio_fuente"] != "qr":
                sin_qr += 1
            c = comparar(p, ESP[nombre][0])
            for k, v in c.items():
                tot[k] = tot.get(k, 0) + 1; ok[k] = ok.get(k, 0) + (1 if v else 0)
                if not v:
                    fallas.append({"hoja": nombre, "variante": [a, b, q, s], "campo": k})
            confs.append(p["confianza"])
    res = {"hojas": n, "sin_qr": sin_qr,
           "aciertos_por_campo": {k: f"{ok[k]}/{tot[k]}" for k in sorted(tot)},
           "aciertos_totales": f"{sum(ok.values())}/{sum(tot.values())}",
           "confianza": {"min": round(min(confs), 3), "mediana": round(float(np.median(confs)), 3), "max": round(max(confs), 3)},
           "fallas": fallas}
    print(json.dumps(res, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
