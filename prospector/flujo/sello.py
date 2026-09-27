"""Con QUE version y QUE commit se genero una ficha.

Lo pidio #322 para la tabla de corrida de la capa tecnica, y el motivo es de
auditoria: una ficha que nadie puede fechar contra el codigo no se puede
reproducir. Cuando Esteban abra en diciembre la ficha de Pesqueria y algo no
cuadre, la primera pregunta va a ser "con que version salio" -- y sin esto la
respuesta es un encogimiento de hombros--.

DOS REGLAS, y las dos son porque un sello falso es peor que ninguno:

  1. La VERSION sale del CHANGELOG, no de una constante escrita a mano. Habia una
     `__version__ = "0.1.0"` en `flujo/__init__.py` mientras el CHANGELOG iba en
     0.9.9: llevaba nueve versiones mintiendo, y nadie lo noto porque nada la
     leia. Derivarla del CHANGELOG hace imposible esa deriva.
  2. El COMMIT sale de git, y si git no esta -- una copia descargada, un tarball,
     un contenedor sin .git-- se dice `sin-git`, NO se inventa ni se omite. Una
     ficha generada fuera de un checkout es legitima; hacerla pasar por una que
     si lo estaba, no.
"""
from __future__ import annotations
import os
import re
import subprocess

_AQUI = os.path.dirname(os.path.abspath(__file__))
PROSPECTOR = os.path.dirname(_AQUI)
RUTA_CHANGELOG = os.path.join(PROSPECTOR, "CHANGELOG.md")

_ENCABEZADO = re.compile(r"^##\s+(\d+\.\d+\.\d+)", re.M)

SIN_GIT = "sin-git"
SIN_VERSION = "sin-version"


def version(ruta: str = RUTA_CHANGELOG) -> str:
    """La primera version del CHANGELOG. Es la que esta vigente."""
    try:
        with open(ruta, encoding="utf-8") as f:
            m = _ENCABEZADO.search(f.read(4096))
        return m.group(1) if m else SIN_VERSION
    except OSError:
        return SIN_VERSION


def commit(cwd: str = PROSPECTOR) -> str:
    """El commit corto, mas `+sucio` si el arbol tiene cambios sin commitear.

    La marca de sucio importa: una ficha generada con cambios locales NO se puede
    reproducir desde el commit que dice, y decir solo el commit lo ocultaria.
    """
    try:
        h = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=cwd,
                           capture_output=True, text=True, timeout=5)
        if h.returncode != 0:
            return SIN_GIT
        corto = h.stdout.strip() or SIN_GIT
        s = subprocess.run(["git", "status", "--porcelain"], cwd=cwd,
                           capture_output=True, text=True, timeout=5)
        if s.returncode == 0 and s.stdout.strip():
            corto += "+sucio"
        return corto
    except (OSError, subprocess.SubprocessError):
        return SIN_GIT


def sello() -> dict:
    return {"version": version(), "commit": commit()}
