"""Donde van los resultados de una corrida. Y donde NO van.

REGLA DE ARQUITECTURA
---------------------
Los datos de contactos y personas son datos personales, y **nunca se guardan en
el repo**: `fts-suite` es publico.

    EL REPO          solo LOGICA. Codigo, compuertas, metodo, diccionario de
                     puestos (titulos genericos, no personas), catalogos de
                     fuentes, pruebas con datos ficticios.

    LA SESION        el resultado de una corrida -la ficha y el historial de
                     esa corrida- mientras la herramienta se pule. Se genera,
                     se usa, y se va con la sesion.

    POSTGRES         los contactos reales, a futuro. Se actualizan ahi, y de
                     ahi se integran a Odoo cuando eso se implemente.

Es la misma separacion que ya rige la suite comercial: codigo publico, corpus y
datos sensibles en Postgres, nunca en el repo.

Este modulo la hace cumplir con un `raise`, no con un parrafo: `exigir_fuera_del_repo`
se niega a escribir dentro del arbol del repositorio, aunque el `.gitignore` lo
cubra. Un `.gitignore` es una red; esto es la compuerta.
"""
from __future__ import annotations
import os
import pathlib
import tempfile

# La raiz del repo: dos niveles arriba de este archivo (flujo/ -> prospector/ ->
# ... ). Se busca el .git para no depender del anidamiento.
_AQUI = pathlib.Path(__file__).resolve()
PROSPECTOR = _AQUI.parent.parent


def raiz_del_repo() -> pathlib.Path | None:
    for d in [PROSPECTOR, *PROSPECTOR.parents]:
        if (d / ".git").exists():
            return d
    return None


class SalidaEnElRepo(RuntimeError):
    """Se intento escribir un resultado de corrida dentro del repositorio."""


def exigir_fuera_del_repo(ruta: str | os.PathLike) -> pathlib.Path:
    """Compuerta. Un resultado de corrida NO se escribe en el repo."""
    p = pathlib.Path(ruta).expanduser().resolve()
    repo = raiz_del_repo()
    if repo is None:
        return p
    try:
        p.relative_to(repo)
    except ValueError:
        return p
    raise SalidaEnElRepo(
        f"'{p}' esta dentro del repositorio ({repo}).\n"
        "Los contactos y las fichas son datos personales y el repo es PUBLICO: "
        "no se escriben aqui ni con .gitignore de por medio.\n"
        "Destino correcto: la carpeta de trabajo de la sesion (se elige sola), "
        "o la que indique PROSPECTOR_SALIDA. "
        "El destino definitivo de los contactos es Postgres.")


def carpeta_de_corridas() -> pathlib.Path:
    """La carpeta de trabajo de esta sesion.

    1. `PROSPECTOR_SALIDA`, si esta puesta -- para apuntarla a donde sea.
    2. Si no, una carpeta por sesion en el temporal del sistema.

    En los dos casos se verifica que quede FUERA del repo.
    """
    puesta = os.environ.get("PROSPECTOR_SALIDA", "").strip()
    if puesta:
        destino = pathlib.Path(puesta).expanduser()
    else:
        sesion = (os.environ.get("CLAUDE_CODE_SESSION_ID")
                  or os.environ.get("CLAUDE_SESSION_ID")
                  or f"pid-{os.getpid()}")
        destino = pathlib.Path(tempfile.gettempdir()) / "prospector-corridas" / sesion
    destino = exigir_fuera_del_repo(destino)
    destino.mkdir(parents=True, exist_ok=True)
    return destino


# ---------------------------------------------------------------------------
# A FUTURO — el enganche a Postgres. NO construido todavia (fase posterior).
#
# Cuando se implemente, los contactos de una corrida cerrada van a
# `prospeccion.ficha_campo` (append-only, una fila por campo por corrida) y a
# `prospeccion.contacto`, por las migraciones 010-013 que ya estan escritas y
# **sin aplicar** en `fts-suite-db`. De ahi se integran a Odoo.
#
# El enganche seria una funcion aqui:
#
#     def escribir_en_postgres(corrida) -> None:
#         """Persiste contactos y campos con su procedencia. NO IMPLEMENTADO."""
#
# y se llamaria desde el orquestador en `cerrar`/`ficha`, despues del challenge
# -nunca antes: un dato que no paso el cruce no se archiva como si hubiera
# pasado-. Dos cosas que ya estan decididas y conviene no volver a discutir:
#
#   * la cadena de conexion va por variable de entorno, NUNCA en el repo;
#   * `ck_patron_nunca_verificado` ya existe en la 010: la base rechaza un
#     correo derivado de patron marcado como verificado. La compuerta de
#     confianza y la base dicen lo mismo, cada una por su lado.
# ---------------------------------------------------------------------------
