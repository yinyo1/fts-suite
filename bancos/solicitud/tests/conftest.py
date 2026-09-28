"""Pruebas de bancos_0002 (solicitud, acuses, vistas) sobre Postgres real.

Reutiliza SIN modificar los fixtures sintéticos de la sesión de ingesta
(bancos/procesador/tests): una base nueva por prueba con bancos_0001 + bancos_0002."""
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
PROC = RAIZ / "bancos" / "procesador"
sys.path.insert(0, str(PROC))
sys.path.insert(0, str(PROC / "tests"))
sys.path.insert(0, str(AQUI))
MIGRACIONES = sorted((RAIZ / "db" / "migrations" / "bancos").glob("bancos_*.sql"))
PG = os.environ.get("BANCOS_TEST_PG", "host=/tmp port=5433 user=postgres")


def psql(db, *args):
    return subprocess.run(["psql", f"{PG} dbname={db}", "-v", "ON_ERROR_STOP=1", "-q", *args],
                          check=True, capture_output=True, text=True)


@pytest.fixture
def base(monkeypatch):
    from fixtures import CUENTAS_JSON
    nombre = "s_" + uuid.uuid4().hex[:10]
    psql("postgres", "-c", f"CREATE DATABASE {nombre}")
    for m in MIGRACIONES:
        psql(nombre, "-1", "-f", str(m))
    monkeypatch.setenv("DATABASE_URL", f"{PG} dbname={nombre}")
    monkeypatch.setenv("BANCOS_DB_ROLE", "bancos_app")
    monkeypatch.setenv("BANCOS_CUENTAS_JSON", CUENTAS_JSON)
    monkeypatch.setenv("BANCOS_PERIODO_INICIO", "2026-01")
    from fts_bancos.sinteticos import rfc as _rfc
    monkeypatch.setenv("BANCOS_RFC", _rfc())
    monkeypatch.delenv("BANCOS_HMAC_SECRET", raising=False)
    from fts_bancos import pipeline
    from fts_bancos.cuentas import cargar_de_entorno
    from fts_bancos.db import conexion
    with conexion() as con:
        pipeline.sembrar(con, cargar_de_entorno())
    # configuración de prueba (como administrador: la aplicación no puede editarla)
    admin("UPDATE bancos.fuentes_solicitud SET periodo_inicio='2026-01' WHERE tipo='bbva'", nombre)
    yield nombre
    psql("postgres", "-c", f"DROP DATABASE IF EXISTS {nombre} WITH (FORCE)")


def admin(sql, db):
    return psql(db, "-At", "-c", sql).stdout
