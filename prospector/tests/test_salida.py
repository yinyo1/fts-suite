"""Los contactos NUNCA se escriben en el repo.

`fts-suite` es publico. Una ficha lleva nombres, puestos y correos de personas.
La regla vive en `flujo/salida.py` y se hace cumplir con un `raise`, no con un
`.gitignore` -- un `.gitignore` se edita sin querer, una compuerta no.
"""
import os
import pathlib
import pytest

from flujo.salida import (carpeta_de_corridas, exigir_fuera_del_repo,
                          raiz_del_repo, SalidaEnElRepo, PROSPECTOR)


def test_el_repo_se_encuentra():
    assert raiz_del_repo() is not None, "la compuerta necesita saber donde empieza el repo"


@pytest.mark.parametrize("dentro", [
    "corridas/cuprum.json",
    "corridas/cuprum-limpio.html",
    "flujo/robado.json",
    "../prospector/corridas/x.json",
    "datos/contactos.csv",
])
def test_cualquier_ruta_dentro_del_repo_se_rechaza(dentro):
    with pytest.raises(SalidaEnElRepo, match="repo es PUBLICO"):
        exigir_fuera_del_repo(PROSPECTOR / dentro)


def test_la_carpeta_de_la_sesion_queda_fuera_del_repo():
    destino = carpeta_de_corridas()
    repo = raiz_del_repo()
    with pytest.raises(ValueError):
        destino.relative_to(repo)      # no es relativa al repo = esta afuera
    assert destino.is_dir()


def test_PROSPECTOR_SALIDA_manda_pero_no_puede_apuntar_al_repo(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path / "mis-corridas"))
    assert carpeta_de_corridas() == (tmp_path / "mis-corridas").resolve()

    monkeypatch.setenv("PROSPECTOR_SALIDA", str(PROSPECTOR / "corridas"))
    with pytest.raises(SalidaEnElRepo):
        carpeta_de_corridas()


def test_el_orquestador_no_guarda_dentro_del_repo(tmp_path, monkeypatch):
    """La prueba de fondo: correr la herramienta no deja un archivo en el repo."""
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    from flujo import orquestador
    assert orquestador.main(["iniciar", "--empresa", "Prueba SA",
                             "--ciudad", "Monterrey, NL"]) == 0
    escritos = list(tmp_path.rglob("*.json"))
    assert escritos, "la corrida tiene que haber quedado en la carpeta de la sesion"
    repo = raiz_del_repo()
    for f in escritos:
        with pytest.raises(ValueError):
            f.resolve().relative_to(repo)


def test_el_repo_no_tiene_carpeta_de_corridas_versionada():
    assert not (PROSPECTOR / "corridas").exists(), (
        "la carpeta de corridas no debe existir en el arbol del repo: "
        "invita a que alguien escriba ahi")
