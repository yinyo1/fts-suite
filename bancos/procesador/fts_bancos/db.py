"""Conexión a Postgres. Permisos efectivos = rol bancos_app (SET ROLE)."""
from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg
from psycopg import sql as psql
from psycopg.rows import dict_row


def conninfo() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    partes = {
        "host": os.environ.get("PGHOST"), "port": os.environ.get("PGPORT", "5432"),
        "dbname": os.environ.get("PGDATABASE"), "user": os.environ.get("PGUSER"),
        "password": os.environ.get("PGPASSWORD"), "sslmode": os.environ.get("PGSSLMODE", "prefer"),
    }
    return " ".join(f"{k}={v}" for k, v in partes.items() if v)


@contextmanager
def conexion():
    con = psycopg.connect(conninfo(), row_factory=dict_row, autocommit=False, connect_timeout=10)
    try:
        rol = os.environ.get("BANCOS_DB_ROLE", "bancos_app")
        if rol:
            with con.cursor() as cur:
                cur.execute(psql.SQL("SET ROLE {}").format(psql.Identifier(rol)))
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
