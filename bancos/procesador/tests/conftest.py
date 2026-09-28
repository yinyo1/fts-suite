import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI))
MIGRACION = AQUI.parents[2] / "db" / "migrations" / "bancos" / "bancos_0001_fundacion.sql"
PG = os.environ.get("BANCOS_TEST_PG", "host=/tmp port=5433 user=postgres")


def _psql(db, *args):
    return subprocess.run(["psql", f"{PG} dbname={db}", "-v", "ON_ERROR_STOP=1", "-q", *args],
                          check=True, capture_output=True, text=True)


@pytest.fixture
def base_limpia(monkeypatch):
    """Una base NUEVA por prueba, con la migración aplicada tal cual está en el repo."""
    from fixtures import CUENTAS_JSON
    nombre = "t_" + uuid.uuid4().hex[:10]
    _psql("postgres", "-c", f"CREATE DATABASE {nombre}")
    _psql(nombre, "-1", "-f", str(MIGRACION))
    monkeypatch.setenv("DATABASE_URL", f"{PG} dbname={nombre}")
    monkeypatch.setenv("BANCOS_DB_ROLE", "bancos_app")
    monkeypatch.setenv("BANCOS_CUENTAS_JSON", CUENTAS_JSON)
    monkeypatch.setenv("BANCOS_PERIODO_INICIO", "2026-01")
    monkeypatch.delenv("BANCOS_HMAC_SECRET", raising=False)
    from fts_bancos import pipeline
    from fts_bancos.cuentas import cargar_de_entorno
    from fts_bancos.db import conexion
    with conexion() as con:
        pipeline.sembrar(con, cargar_de_entorno())
    yield nombre
    _psql("postgres", "-c", f"DROP DATABASE IF EXISTS {nombre} WITH (FORCE)")
