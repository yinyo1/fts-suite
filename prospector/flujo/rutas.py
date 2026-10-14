"""Donde viven los datos del prospector (#407 M4/M12).

`fts-suite` es PUBLICO. Lo que es inteligencia comercial -- catalogo de proyectos,
cuentas con proyecto, relacion de grupo, senales, corridas del radar, entregas --
se mudo al repo privado `fts-conceptualizador/marketing/datos/`. En este repo solo
quedan los datos que son logica o son publicos: el esquema del motor 3, las
fuentes, las consultas de senal y el padron del DENUE (INEGI).

Orden de busqueda de un archivo de datos:
  1. `PROSPECTOR_DATOS` (la carpeta privada; el motor de Marketing la exporta);
  2. el clon hermano `../fts-conceptualizador/marketing/datos` si existe;
  3. `prospector/datos/` de este repo (solo los publicos).
Si no esta en ninguno, se devuelve la ruta del paso 3 para que el error diga el
nombre del archivo que falta -- nunca se inventa un vacio.
"""
import os

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLICOS = os.path.join(AQUI, "datos")
_HERMANO = os.path.join(os.path.dirname(os.path.dirname(AQUI)), "fts-conceptualizador",
                        "marketing", "datos")


def carpetas() -> list:
    out = []
    env = os.environ.get("PROSPECTOR_DATOS")
    if env:
        out.append(env)
    if os.path.isdir(_HERMANO):
        out.append(_HERMANO)
    out.append(PUBLICOS)
    return out


def datos(nombre: str) -> str:
    """Ruta del archivo de datos `nombre`, privado o publico."""
    for c in carpetas():
        r = os.path.join(c, nombre)
        if os.path.exists(r):
            return r
    return os.path.join(PUBLICOS, nombre)


def hay(nombre: str) -> bool:
    return os.path.exists(datos(nombre))


def o_saltar(nombre: str) -> str:
    """Para pruebas que leen datos privados: sin la carpeta privada se SALTAN con
    la razon escrita (un clon publico no los tiene, y eso no es un defecto)."""
    r = datos(nombre)
    if not os.path.exists(r):
        import pytest
        pytest.skip(f"{nombre} vive en el repo privado (PROSPECTOR_DATOS); "
                    "este clon publico no lo trae", allow_module_level=True)
    return r
