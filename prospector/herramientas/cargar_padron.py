#!/usr/bin/env python3
"""Toma la salida de prospeccion/denue-padron y la deja en tres formas.

Por que tres y no una:

  1. `datos/padron_denue.csv` — la fuente DIFFABLE, la que se revisa en un pull
     request. **Va SIN las columnas de contacto** (ver abajo).
  2. `padron_denue.sqlite` — la copia consultable sin Postgres. Lleva TODO,
     y NO se versiona.
  3. stdout — el INSERT para `prospeccion.denue_planta`. Lleva TODO.

REGLA DURA: LOS CONTACTOS NO VIVEN EN EL REPO
---------------------------------------------
`fts-suite` es un repo PUBLICO. El padron del DENUE trae `correoelec` y
`telefono`, y aunque INEGI los publique, **son datos de contacto de personas**:
de las 238 filas del corte 05/2026, 191 traen correo y 136 de esos tienen forma
de correo de persona (`nombre.apellido@`, o webmail libre que en un negocio
chico suele ser la cuenta del dueno). 59 traen telefono.

Por eso `COLUMNAS_SENSIBLES` se recorta del CSV versionado. Lo que SI se
conserva es `dominio_correo`, que se deriva del correo y **no es dato
personal**: es la llave operativa del metodo -dominio + ciudad + CP-, y con ella
el padron sigue sirviendo igual.

El destino de los correos y telefonos es **Postgres**
(`prospeccion.denue_planta`), y a futuro Odoo. Nunca el repo.

Uso:
    python3 herramientas/cargar_padron.py corrida.json --corte 2026-05

Uso:
    python3 scripts/cargar_padron.py corrida.json --corte 2026-09
"""
import argparse
import collections
import csv
import json
import pathlib
import re
import sqlite3
import sys
import unicodedata

COLUMNAS = [
    "id", "clee", "nom_estab", "raz_social", "clave_norm", "codigo_act",
    "nombre_act", "per_ocu", "estrato_min", "cod_postal", "cve_ent", "entidad",
    "cve_mun", "municipio", "localidad", "nomb_asent", "nom_vial", "numero_ext",
    "telefono", "correoelec", "dominio_correo", "www", "latitud", "longitud",
    "fecha_alta", "sitios_nacionales", "piso_aplicado", "motivo_ingreso",
    "es_punto_venta", "excluido_por",
]

# Columnas de contacto: van a Postgres y al SQLite local, NUNCA al CSV del repo.
COLUMNAS_SENSIBLES = ["telefono", "correoelec"]

# Lo que si se versiona: todo menos el contacto. `dominio_correo` se queda.
COLUMNAS_PUBLICABLES = [c for c in COLUMNAS if c not in COLUMNAS_SENSIBLES]


# Cadenas de autoservicio, club de precio, tienda departamental y plaza.
# Un establecimiento cuyo NOMBRE carga una de estas es un punto de venta
# adentro de una tienda, no una planta.
#
# POR QUE HACE FALTA: el DENUE clasifica esos mostradores en 311 -manufactura-
# y les asigna el ESTRATO DEL CORPORATIVO, no el del local. Un mostrador de
# helado dentro de un Soriana aparece como 311520 con 251+ personas, o sea
# identico a una planta en las dos columnas con las que se filtra. El nombre es
# la unica senal que los delata.
#
# NO SE BORRAN. Se marcan, con la razon a la vista, para poder auditar la regla
# despues. Una exclusion que no se puede revisar es indistinguible de un bug.
CADENAS = {
    "WALMART": "Walmart", "WAL MART": "Walmart",
    "BODEGA AURRERA": "Bodega Aurrera", "AURRERA": "Bodega Aurrera",
    "HEB": "HEB", "H E B": "HEB",
    "SORIANA": "Soriana", "CHEDRAUI": "Chedraui", "COSTCO": "Costco",
    "SAMS": "Sam's Club", "SAM S": "Sam's Club",
    "LA COMER": "La Comer", "CITY CLUB": "City Club", "SUPERAMA": "Superama",
    "OXXO": "Oxxo", "MERCO": "Merco", "SMART": "Smart",
    "LIVERPOOL": "tienda departamental", "PALACIO DE HIERRO": "tienda departamental",
    "SEARS": "tienda departamental",
    "PLAZA": "plaza comercial", "MOLL": "plaza comercial", "MALL": "plaza comercial",
    "GALERIAS": "plaza comercial", "CITADEL": "plaza comercial",
    "SENDERO": "plaza comercial", "PASEO": "plaza comercial",
    "PUERTA DE HIERRO": "plaza comercial",
}


# ---------------------------------------------------------------------------
# LA SEGUNDA REGLA: cadena de puntos de venta detectada por PATRON
# ---------------------------------------------------------------------------
# La regla por nombre solo atrapa al local que carga el nombre de la tienda.
# Deja pasar a sus hermanas, que estan nombradas por colonia: "HELADOS SULTANA
# LA CONCORDIA", "... RINCON DE LINDA VISTA", "... SAN JOSE".
#
# Lo que si las delata es el PATRON del grupo entero. Una cadena de mostradores
# se ve asi:
#
#   - muchos sitios en la MISMA zona metropolitana;
#   - el MISMO estrato en todos, porque el DENUE les hereda el del corporativo
#     en vez de contar la gente del local;
#   - ningun nombre con marca de planta;
#   - en colonias residenciales, no en parques industriales.
#
# Un grupo multiplanta de verdad falla al menos una. Medido sobre el corte
# 2026-05, con los diez grupos de 3+ sitios del padron:
#
#   Helados Sultana   10 sitios, estrato UNICO 101, sin marca, 0% industrial -> CADENA
#   Lala (Torreon)     4 sitios, todos "PLANTA ...", 100% Ciudad Industrial  -> planta
#   Mondelez           4 sitios, estratos distintos, "PLANTA ..."            -> planta
#   Bebidas Mundiales  5 sitios, estratos distintos, repartidos en 3 ZM      -> planta
#   Qualtia            6 sitios, CUATRO estratos distintos                   -> planta
#
# El caso al filo es Bimbo: 3 sitios, estrato identico, sin marca de planta y
# en colonias. Pasa las otras tres condiciones y solo lo salva el umbral de
# sitios. Queda dicho aqui para que quien suba o baje el umbral sepa a quien
# mueve.
UMBRAL_SITIOS = 5

ZONAS_METROPOLITANAS = {
    "ZM Monterrey": {
        "MONTERREY", "GUADALUPE", "APODACA", "SAN NICOLAS DE LOS GARZA",
        "GENERAL ESCOBEDO", "SANTA CATARINA", "SAN PEDRO GARZA GARCIA",
        "JUAREZ", "GARCIA", "SALINAS VICTORIA", "CADEREYTA JIMENEZ",
        "SANTIAGO", "EL CARMEN", "CIENEGA DE FLORES", "PESQUERIA",
    },
    "ZM Saltillo": {"SALTILLO", "RAMOS ARIZPE", "ARTEAGA"},
    "ZM La Laguna": {"TORREON", "MATAMOROS", "FRANCISCO I. MADERO", "SAN PEDRO", "VIESCA"},
}

MARCA_DE_PLANTA = [
    "PLANTA", "COMPLEJO", "FABRICA", "PLANT", "MOLINO", "REFINERIA",
    "CERVECERIA", "EMPACADORA", "PROCESADORA",
]
ASENTAMIENTO_INDUSTRIAL = ["INDUSTRIAL", "INTERPUERTO", "PARQUE", "ZONA IND", "NAVE"]


def _sin_acentos(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s or "")
        if unicodedata.category(c) != "Mn"
    ).upper()


def _zona(municipio: str) -> str:
    m = _sin_acentos(municipio)
    for zona, municipios in ZONAS_METROPOLITANAS.items():
        if m in municipios:
            return zona
    return "otra:" + m


def claves_de_cadena(filas):
    """Razones sociales cuyo PATRON de grupo las delata como cadena.

    Devuelve {clave_norm: razon_legible}. No borra nada: quien llama marca.
    """
    porclave = collections.defaultdict(list)
    for f in filas:
        porclave[f["clave_norm"]].append(f)

    cadenas = {}
    for clave, grupo in porclave.items():
        if len(grupo) < UMBRAL_SITIOS:
            continue
        zonas = collections.Counter(_zona(f["municipio"]) for f in grupo)
        zona, n_en_zona = zonas.most_common(1)[0]
        if n_en_zona < UMBRAL_SITIOS:
            continue
        estratos = {str(f["estrato_min"]) for f in grupo}
        if len(estratos) != 1:
            continue
        if any(
            marca in _sin_acentos(f["nom_estab"])
            for f in grupo for marca in MARCA_DE_PLANTA
        ):
            continue
        industriales = sum(
            1 for f in grupo
            if any(a in _sin_acentos(f["nomb_asent"]) for a in ASENTAMIENTO_INDUSTRIAL)
        )
        if industriales >= len(grupo) / 2:
            continue
        cadenas[clave] = (
            f"cadena de puntos de venta: {len(grupo)} sitios, {n_en_zona} en {zona}, "
            f"estrato identico {estratos.pop()}, sin marca de planta, en colonia"
        )
    return cadenas


def punto_de_venta(nom_estab: str):
    """Devuelve (cadena, etiqueta) si el nombre delata un punto de venta.

    Se compara por TOKEN completo, no por subcadena: 'HEB' no debe pegar dentro
    de 'SCHEBER', ni 'SMART' dentro de 'SMARTFOODS'.
    """
    t = " " + re.sub(r"[^A-Z0-9 ]", " ", (nom_estab or "").upper()) + " "
    t = re.sub(r" +", " ", t)
    for clave, etiqueta in CADENAS.items():
        if " " + clave + " " in t:
            return clave, etiqueta
    return None, None


def dominio(correo: str) -> str:
    """El dominio, solo si el correo tiene forma de correo.

    No se inventa: un campo sin '@' devuelve cadena vacia, no una adivinanza.
    """
    correo = (correo or "").strip().lower()
    if correo.count("@") != 1:
        return ""
    dom = correo.split("@", 1)[1].strip()
    return dom if "." in dom else ""


def filas_de(corrida: dict):
    """Saca las filas del padron, tolerando las dos formas de la corrida."""
    items = corrida if isinstance(corrida, list) else corrida.get("items", [])
    resumen = None
    for it in items:
        j = it.get("json", it)
        if "_resumen" in j:
            resumen = j["_resumen"]
            continue
        if not j.get("id"):
            continue
        fila = {c: j.get(c, "") for c in COLUMNAS}
        fila["dominio_correo"] = dominio(j.get("correoelec", ""))
        fila["motivo_ingreso"] = j.get("motivo_entrada") or j.get("motivo_ingreso") or ""
        cadena, etiqueta = punto_de_venta(j.get("nom_estab", ""))
        fila["es_punto_venta"] = "si" if cadena else "no"
        fila["excluido_por"] = (
            f"punto de venta: {etiqueta} ({cadena})" if cadena else ""
        )
        yield fila, resumen


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("corrida", help="JSON con la salida de Code - Consolidar padron")
    p.add_argument("--corte", required=True, help="corte del DENUE, p.ej. 2026-09")
    p.add_argument("--dir", default="db/datos")
    args = p.parse_args()

    datos = json.loads(pathlib.Path(args.corrida).read_text(encoding="utf-8"))
    filas = []
    resumen = None
    for fila, res in filas_de(datos):
        filas.append(fila)
        if res:
            resumen = res

    # Segunda pasada: el patron de cadena solo se ve mirando el GRUPO entero,
    # asi que no se puede decidir fila por fila.
    cadenas = claves_de_cadena(filas)
    for f in filas:
        if f["clave_norm"] in cadenas and f["es_punto_venta"] != "si":
            f["es_punto_venta"] = "si"
            f["excluido_por"] = cadenas[f["clave_norm"]]

    if not filas:
        print("No hay filas de padron en ese JSON.", file=sys.stderr)
        return 1

    destino = pathlib.Path(args.dir)
    destino.mkdir(parents=True, exist_ok=True)

    # 1. CSV diffable, ordenado de forma ESTABLE para que el diff sea legible.
    filas.sort(key=lambda f: (f["cve_ent"], f["municipio"], f["raz_social"], f["id"]))
    ruta_csv = destino / "padron_denue.csv"
    with ruta_csv.open("w", encoding="utf-8", newline="") as fh:
        # SIN las columnas de contacto: este CSV se versiona en un repo publico.
        w = csv.DictWriter(fh, fieldnames=["corte_denue"] + COLUMNAS_PUBLICABLES,
                           extrasaction="ignore")
        w.writeheader()
        for f in filas:
            w.writerow({"corte_denue": args.corte, **f})

    # 2. SQLite consultable.
    ruta_db = destino / "padron_denue.sqlite"
    if ruta_db.exists():
        ruta_db.unlink()
    con = sqlite3.connect(ruta_db)
    cols = ", ".join(f"{c} TEXT" for c in COLUMNAS)
    con.execute(f"CREATE TABLE denue_planta (corte_denue TEXT, {cols})")
    con.executemany(
        f"INSERT INTO denue_planta VALUES ({','.join('?' * (len(COLUMNAS) + 1))})",
        [tuple([args.corte] + [str(f[c]) for c in COLUMNAS]) for f in filas],
    )
    con.execute("CREATE INDEX ix_clave ON denue_planta (clave_norm)")
    con.execute("CREATE INDEX ix_mun ON denue_planta (cve_ent, municipio)")
    con.commit()
    con.close()

    pv = [f for f in filas if f["es_punto_venta"] == "si"]
    firmes = [f for f in filas if f["motivo_ingreso"] == "piso_estrato"]
    operables = [f for f in firmes if f["es_punto_venta"] == "no"]
    print(f"{len(filas)} filas -> {ruta_csv} y {ruta_db}", file=sys.stderr)
    print(
        f"  padron firme {len(firmes)} · puntos de venta marcados {len(pv)} · "
        f"PLANTAS OPERABLES {len(operables)}",
        file=sys.stderr,
    )
    por_regla = collections.Counter(
        "patron de cadena" if f["excluido_por"].startswith("cadena")
        else "nombre de tienda"
        for f in pv
    )
    for regla, n in por_regla.most_common():
        print(f"    por {regla}: {n}", file=sys.stderr)
    for f in pv:
        print(f"    excluido: {f['nom_estab']} — {f['excluido_por']}", file=sys.stderr)
    if resumen:
        print(json.dumps(resumen, ensure_ascii=False, indent=2), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
