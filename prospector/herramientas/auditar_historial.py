"""Audita TODO el historial de git buscando datos personales. NO imprime ninguno.

POR QUE EXISTE. La guardia del repo (`tests/test_sin_datos_personales.py`) mira el
ARBOL DE TRABAJO y, desde que se escribio, solo la carpeta `prospector/`. Dos cosas
se le escapan por construccion:

  1. lo que ya se commiteo y despues se enmascaro -- sigue en el historial--;
  2. todo lo que vive FUERA de `prospector/`.

Esta herramienta cubre las dos: recorre cada blob que existe en cualquier commit de
cualquier rama, con los MISMOS regex de la guardia -- importados de ella, para que
no puedan divergir-- y con la limpieza de etiquetas que #323 agrego.

POR QUE BLOBS Y NO `git log -p`. Un diff cuenta el mismo dato una vez por commit
que lo toca, se pierde lo que entro por un merge, y no dice donde vive ahora. El
recorrido de blobs los enumera una vez y los ubica.

REGLA DE SALIDA, y es la razon de ser del formato: **no se imprime ningun dato**.
Cada valor sale por su FORMA (`xxxx.xxxxx@dominio`) y por un prefijo de hash, que
alcanza para contar valores distintos, agruparlos entre archivos y comprobar dos
corridas, sin reproducir uno solo. Un reporte de fuga que reproduce la fuga es la
fuga otra vez -- ya paso en el issue #285--.

    python herramientas/auditar_historial.py [ruta-del-repo]
"""
from __future__ import annotations
import collections
import hashlib
import pathlib
import re
import subprocess
import sys

AQUI = pathlib.Path(__file__).resolve()
PROSPECTOR = AQUI.parent.parent

sys.path.insert(0, str(PROSPECTOR / "tests"))
import test_sin_datos_personales as G          # noqa: E402  la MISMA guardia

ETIQUETA = re.compile(r"<[^>]*>")
CON_MARCADO = {".html", ".md", ".xml", ".svg"}


def _git(repo: str, *args) -> str:
    return subprocess.run(["git", "-C", repo, *args], capture_output=True,
                          text=True, errors="replace").stdout


def huella(v: str) -> str:
    """Identidad del valor SIN el valor. Diez hex alcanzan para agrupar."""
    return hashlib.sha256(v.lower().encode()).hexdigest()[:10]


def forma(correo: str) -> str:
    """`nombre.apellido@dominio` -> `xxxxxx.xxxxxxx@dominio`.

    El dominio SI se imprime: una empresa no es una persona, y saber que dominios
    aparecen es justo lo que dice si la fuga es interna o de un cliente.
    """
    local, _, dom = correo.partition("@")
    molde = ".".join("x" * min(len(p), 9) for p in re.split(r"[._-]", local) if p)
    return f"{molde}@{dom}"


def correos_de_persona(texto: str) -> set:
    out = set()
    for c in G.CORREO.findall(texto):
        local, _, dom = c.partition("@")
        if G.PERMITIDO.match(local) or G.DOMINIO_EJEMPLO.search(dom):
            continue
        out.add(c)
    return out


def sin_etiquetas(texto: str, sufijo: str) -> str:
    return ETIQUETA.sub("", texto) if sufijo in CON_MARCADO else texto


def auditar(repo: str) -> dict:
    """Devuelve el inventario. Las llaves son (ruta, huella); los valores, blobs."""
    blobs = {}
    for linea in _git(repo, "rev-list", "--objects", "--all").splitlines():
        sha, _, ruta = linea.partition(" ")
        if ruta and pathlib.Path(ruta).suffix in G.EXT:
            blobs[sha] = ruta
    r = {"blobs": len(blobs), "formas": {},
         "correo_solo_sin_etiquetas": collections.defaultdict(set),
         "correo_a_la_vista": collections.defaultdict(set),
         "tel_solo_sin_etiquetas": collections.defaultdict(set),
         "tel_a_la_vista": collections.defaultdict(set)}
    for sha, ruta in blobs.items():
        crudo = _git(repo, "cat-file", "-p", sha)
        if not crudo:
            continue
        limpio = sin_etiquetas(crudo, pathlib.Path(ruta).suffix)
        crudos, limpios = correos_de_persona(crudo), correos_de_persona(limpio)
        for c in limpios:
            h = huella(c)
            r["formas"][h] = forma(c)
            llave = ("correo_a_la_vista" if c in crudos
                     else "correo_solo_sin_etiquetas")
            r[llave][(ruta, h)].add(sha)
        t_crudo, t_limpio = set(G.TELEFONO.findall(crudo)), set(G.TELEFONO.findall(limpio))
        for t in t_limpio:
            llave = ("tel_a_la_vista" if t in t_crudo
                     else "tel_solo_sin_etiquetas")
            r[llave][(ruta, huella(t))].add(sha)
    return r


def commits_con(repo: str, shas: set) -> list:
    out = []
    for c in _git(repo, "rev-list", "--all", "--reverse").splitlines():
        if any(s in _git(repo, "ls-tree", "-r", c) for s in shas):
            out.append(c[:9])
    return out


def imprimir(repo: str, r: dict) -> None:
    print(f"repo: {repo}")
    print(f"blobs de texto en todo el historial: {r['blobs']}\n")
    for titulo, llave, con_forma in (
        ("A · CORREOS que SOLO se ven quitando etiquetas (el hueco de #323)",
         "correo_solo_sin_etiquetas", True),
        ("B · CORREOS a la vista (los que cualquier escaner encuentra)",
         "correo_a_la_vista", True),
        ("C · TELEFONOS que SOLO se ven quitando etiquetas",
         "tel_solo_sin_etiquetas", False),
        ("D · TELEFONOS a la vista", "tel_a_la_vista", False),
    ):
        datos = r[llave]
        print("=" * 70)
        print(titulo)
        print("=" * 70)
        if not datos:
            print("  NINGUNO.\n")
            continue
        valores = {h for _ruta, h in datos}
        print(f"  valores DISTINTOS: {len(valores)}  ·  "
              f"apariciones (archivo x valor): {len(datos)}")
        por_ruta = collections.defaultdict(set)
        for (ruta, h) in datos:
            por_ruta[ruta].add(h)
        for ruta in sorted(por_ruta):
            shas = set()
            for (rr, hh), ss in datos.items():
                if rr == ruta:
                    shas |= ss
            cs = commits_con(repo, shas)
            rango = (f"{cs[0]}..{cs[-1]} ({len(cs)} commits)" if len(cs) > 1
                     else (cs[0] if cs else "?"))
            print(f"\n  {ruta}\n     distintos: {len(por_ruta[ruta])}  ·  {rango}")
            if con_forma:
                for h in sorted(por_ruta[ruta]):
                    print(f"       [{h}]  {r['formas'][h]}")
        print()


if __name__ == "__main__":
    repo = sys.argv[1] if len(sys.argv) > 1 else str(PROSPECTOR.parent)
    imprimir(repo, auditar(repo))
