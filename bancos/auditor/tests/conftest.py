"""Pruebas del auditor en una base de PRUEBA (Postgres local), nunca en bancos real.
La base se llena con el servicio (es 'el sistema' a auditar); el auditor la revisa con su propio código."""
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
sys.path.insert(0, str(AQUI.parent))                                  # fts_auditor
sys.path.insert(0, str(RAIZ / "bancos" / "procesador"))               # fts_bancos (sólo para sembrar)
sys.path.insert(0, str(RAIZ / "bancos" / "procesador" / "tests"))     # fixtures sintéticos
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("conftest_procesador", RAIZ / "bancos" / "procesador" / "tests" / "conftest.py")
_m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m)
base_limpia = _m.base_limpia   # misma base NUEVA por prueba, con TODAS las migraciones (incluida bancos_0006)
