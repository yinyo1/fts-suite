"""Pruebas del lector con hojas INVENTADAS (tests/fixtures, generadas por generar.py).

  cd retardos/hojas && python -m pytest -q

Mide por campo: folio, nivel, cada firma, la casilla de negativa, comentario, inconformidad
e inyección. Una hoja que "falla" un campo imprime cuál y con qué tinta.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

AQUI = Path(__file__).parent
sys.path.insert(0, str(AQUI.parent))
from fts_hojas import lector  # noqa: E402

FIX = AQUI / "fixtures"
ESPERADO = json.loads((FIX / "esperado.json").read_text())


def mime_de(n: str) -> str:
    return "application/pdf" if n.endswith(".pdf") else "image/jpeg"


@pytest.mark.parametrize("archivo", sorted(ESPERADO))
def test_hoja(archivo):
    r = lector.leer((FIX / archivo).read_bytes(), mime_de(archivo))
    assert r["ok"], r
    esp = ESPERADO[archivo]
    pags = [p for p in r["paginas"] if (p.get("qr_pagina") or 1) == 1]
    assert len(pags) == len(esp), [p.get("folio") for p in r["paginas"]]
    for p, e in zip(pags, esp):
        assert p["folio"] == e["folio"]
        assert p["folio_fuente"] == "qr"
        assert p["qr_nivel"] == e["nivel"]
        assert p["geometria"] is True
        for k, v in e["firmas"].items():
            assert p["firmas"][k]["presente"] is v, (k, p["firmas"][k])
        assert p["negativa"]["marcada"] is e["negativa"], p["negativa"]
        assert p["comentarios"]["presente"] is e["comentario"], p["comentarios"]
        if e.get("inconformidad") is not None:
            assert p["comentarios"]["inconformidad"] is e["inconformidad"], p["comentarios"]
        assert ("posible_inyeccion" in p["banderas"]) is bool(e.get("inyeccion")), p["banderas"]
        if e.get("chueca"):
            assert "foto_inclinada" in p["banderas"]
            assert p["legibilidad"] in ("regular", "buena")
        assert p["nombre_visible"], "debe leer el nombre impreso"


def test_duplicada_mismo_sha():
    a = hashlib.sha256((FIX / "01-completa.jpg").read_bytes()).hexdigest()
    b = hashlib.sha256((FIX / "09-duplicada.jpg").read_bytes()).hexdigest()
    assert a == b


def test_archivo_basura_no_truena():
    r = lector.leer(b"esto no es una hoja" * 100, "image/jpeg")
    assert r["ok"] is False and r["error"].startswith("ARCHIVO_ILEGIBLE")


def test_layout_es_el_del_generador():
    import subprocess
    raiz = AQUI.parents[2]
    js = "process.stdout.write(JSON.stringify(require(process.argv[1]).LAYOUT))"
    del_gen = json.loads(subprocess.check_output(["node", "-e", js, str(raiz / "retardos" / "lib" / "pdf.js")]))
    assert del_gen == lector.LAYOUT, "regenera con: node retardos/hojas/exportar-layout.js"


def test_tercer_aviso_de_jornada_folio_jor():
    """El 3er aviso de jornada (#334, reglas R3) usa folio JOR-AAAA-NNNN: el QR y el OCR de respaldo lo leen."""
    r = lector.leer((FIX / "12-jornada-sin-firmar.pdf").read_bytes(), "application/pdf")
    assert r["ok"], r
    p = r["paginas"][0]
    assert p["folio"] == "JOR-2026-0003"
    assert p["folio_fuente"] == "qr"
    assert p["qr_nivel"] == 3
    assert not any(v["presente"] for v in p["firmas"].values())
    assert lector.FOLIO_RE.search("folio JOR - 2026 - 0041").group(0).replace(" ", "") == "JOR-2026-0041"
