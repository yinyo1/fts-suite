"""Herramienta de prospeccion de contactos: compuertas deterministas.

Python es dueno de las compuertas. Claude es dueno del criterio.
El metodo vive en metodo/busqueda-encadenada-contactos.md
"""
# La version NO se escribe aqui: se deriva del CHANGELOG. Esta constante decia
# "0.1.0" mientras el CHANGELOG iba en 0.9.9 -- nueve versiones mintiendo, y nadie
# lo noto porque nada la leia--. Ver flujo/sello.py.
from .sello import version as _version

__version__ = _version()
