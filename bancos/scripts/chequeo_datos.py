#!/usr/bin/env python3
"""Chequeo anti-datos-reales antes de cada commit (repo PÚBLICO, issue #331).

Falla (exit 1) si en los archivos de texto nuevos o modificados aparece:
  - un monto con centavos de más de 3 dígitos enteros (1,234.56 · 1234.56)
  - un RFC (persona moral o física)
  - una CLABE (18 dígitos seguidos) o un número de cuenta completo (10-11 dígitos seguidos)
Uso:  python bancos/scripts/chequeo_datos.py            (archivos en stage + modificados)
      python bancos/scripts/chequeo_datos.py archivo...  (archivos dados)
Los fixtures del repo arman sus valores sintéticos por código para no dejar literales así.
"""
import re
import subprocess
import sys

PATRONES = {
    "monto": re.compile(r"(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d{4,})\.\d{2}(?!\d)"),
    "rfc": re.compile(r"(?<![A-Z0-9])[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])"),
    "clabe": re.compile(r"(?<!\d)\d{18}(?!\d)"),
    "cuenta": re.compile(r"(?<![\d.])\d{10,11}(?![\d.])"),
}
BINARIOS = (".pdf", ".zip", ".png", ".jpg", ".xlsx", ".pyc", ".sqlite", ".ico", ".woff", ".woff2")


def archivos():
    if len(sys.argv) > 1:
        return sys.argv[1:]
    out = subprocess.run(["git", "diff", "--name-only", "--cached", "--diff-filter=ACM"], capture_output=True, text=True).stdout.split()
    out += subprocess.run(["git", "diff", "--name-only", "--diff-filter=ACM"], capture_output=True, text=True).stdout.split()
    return sorted({f for f in out if f.startswith(("bancos/", "db/migrations/bancos/"))})


def main():
    fallas = []
    for f in archivos():
        if f.endswith(BINARIOS):
            continue
        try:
            texto = open(f, encoding="utf-8").read()
        except (FileNotFoundError, UnicodeDecodeError):
            continue
        for n, linea in enumerate(texto.splitlines(), 1):
            for nombre, pat in PATRONES.items():
                for m in pat.finditer(linea):
                    # los sha256 y otros hex largos no son cuentas
                    if nombre in ("clabe", "cuenta") and re.search(r"[0-9a-f]{20,}", linea[max(0, m.start() - 30):m.end() + 30]):
                        continue
                    fallas.append(f"{f}:{n}: {nombre}")
    if fallas:
        print("CHEQUEO DE DATOS: FALLA (no se publican montos, RFC, CLABE ni cuentas completas)")
        print("\n".join(fallas))
        sys.exit(1)
    print("CHEQUEO DE DATOS: ok")


if __name__ == "__main__":
    main()
