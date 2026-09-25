#!/usr/bin/env python3
"""Arma el catalogo de proyectos de FTS a partir de lo que Odoo devolvio.

POR QUE ESTE ARCHIVO EXISTE, y es la misma razon de siempre: **Python no puede
llamar a Odoo.** El conector vive detras de MCP, igual que Outlook y WebSearch.
Asi que el reparto es el de todo el proyecto:

    Claude llama       -> guarda el JSON crudo en la carpeta de la sesion
    Python exige       -> lee ese JSON, clasifica y produce el catalogo

Se corre asi:

    python3 herramientas/construir_catalogo.py \\
        --ordenes <crudo>/ordenes.json --lineas <crudo>/lineas.json \\
        --hilos <crudo>/hilos.json --propuestas <crudo>/propuestas.json \\
        --salida datos/catalogo-de-proyectos-fts.json

LOS CRUDOS VIVEN FUERA DEL REPO. Traen nombres de cliente y pueden traer
contactos; el catalogo que sale **no**, y esa es la unica razon por la que el
catalogo si puede versionarse.

LO QUE EL CATALOGO NO LLEVA, verificado antes de escribir: ni una persona. Si una
descripcion de linea trae algo con forma de correo o de telefono, se enmascara.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from flujo.catalogo_proyectos import (clasificar_linea, proceso_de, magnitudes,
                                      palabras_de_capacidad,
                                      PERFIL_DE_QUIEN_COMPRA, plano)

# Lo que NUNCA sale al catalogo, aunque venga en una descripcion de Odoo.
_CORREO = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_TEL = re.compile(r"(?<![\d.\-])(?:\+?52[ \-]?)?(?:81|33|55|86|84|87|82|83|89)\d{8}(?![\d.])")


def sin_personas(t: str) -> str:
    t = _CORREO.sub("[correo]", str(t or ""))
    return _TEL.sub("[telefono]", t)


def _leer(ruta: str | None) -> list:
    if not ruta:
        return []
    with open(ruta, encoding="utf-8") as f:
        d = json.load(f)
    # Acepta la lista directa o el sobre que devuelve el conector.
    for clave in ("result", "records", "rows", "data"):
        if isinstance(d, dict) and clave in d:
            d = d[clave]
    if isinstance(d, dict):
        d = list(d.values())
    return d if isinstance(d, list) else []


def _texto_de(fila: dict, *claves) -> str:
    return " · ".join(str(fila.get(k) or "") for k in claves if fila.get(k))


def construir(ordenes: list, lineas: list, hilos: list,
              propuestas: list, procedencia: str = "") -> dict:
    """El catalogo. Triangula las tres fuentes y dice de donde salio cada cosa."""
    # --- indice de ordenes, para colgarles sus lineas y su cliente
    por_id = {}
    for o in ordenes:
        oid = o.get("id")
        cliente = o.get("partner_id")
        if isinstance(cliente, (list, tuple)) and len(cliente) == 2:
            cliente = cliente[1]
        por_id[oid] = {
            "orden": o.get("name"), "cliente": cliente,
            "fecha": (o.get("date_order") or "")[:10],
            "monto": o.get("amount_untaxed"),
            "moneda": (o.get("currency_id") or [None, ""])[1]
                      if isinstance(o.get("currency_id"), (list, tuple))
                      else o.get("currency_id"),
            "estado": o.get("state"),
        }

    # --- el PROCESO del cliente sale de los hilos y de las propuestas: la orden
    #     dice "CHILLER 30 TR" y casi nunca dice para que proceso.
    proceso_por_cliente: dict[str, Counter] = defaultdict(Counter)
    evidencia_de_proceso: dict[str, list] = defaultdict(list)
    for fuente, filas, claves in (
            ("outlook", hilos, ("subject", "asunto", "snippet", "preview",
                                "body", "cuerpo")),
            ("sharepoint", propuestas, ("name", "nombre", "title", "titulo",
                                        "path", "ruta"))):
        for f in filas:
            cliente = (f.get("cliente") or f.get("empresa") or
                       f.get("partner") or "")
            texto = _texto_de(f, *claves)
            pr = proceso_de(texto)
            if pr["proceso"]:
                clave = plano(cliente) or "(sin cliente)"
                proceso_por_cliente[clave][pr["proceso"]] += 1
                if len(evidencia_de_proceso[clave]) < 3:
                    evidencia_de_proceso[clave].append(
                        {"fuente": fuente, "por": pr["por"]})

    # --- las lineas, clasificadas
    entradas, descartadas, sin_clasificar = [], Counter(), []
    for l in lineas:
        oid = l.get("order_id")
        if isinstance(oid, (list, tuple)) and len(oid) == 2:
            oid = oid[0]
        desc = sin_personas(l.get("name") or "")
        r = clasificar_linea(desc)
        if r["descartada"]:
            descartadas[r["descartada"]] += 1
            continue
        o = por_id.get(oid, {})
        cliente = o.get("cliente") or ""
        pcs = proceso_por_cliente.get(plano(cliente))
        proceso_linea = proceso_de(desc)["proceso"]
        proceso = proceso_linea or (pcs.most_common(1)[0][0] if pcs else None)
        e = {
            "tipo": r["tipo"], "por": r["por"],
            "descripcion": desc[:180],
            "cliente": cliente, "orden": o.get("orden"),
            "fecha": o.get("fecha"), "monto": l.get("price_subtotal"),
            "moneda": o.get("moneda"),
            "proceso": proceso,
            "proceso_de": ("la propia linea" if proceso_linea
                           else "hilo o propuesta del cliente" if proceso
                           else None),
            "magnitudes": magnitudes(desc),
        }
        if r["tipo"] is None:
            sin_clasificar.append(e)
        else:
            entradas.append(e)

    # --- lo que el catalogo DERIVA, que es para lo que existe
    por_tipo = Counter(e["tipo"] for e in entradas)
    proceso_por_tipo: dict[str, Counter] = defaultdict(Counter)
    tipo_por_proceso: dict[str, Counter] = defaultdict(Counter)
    for e in entradas:
        if e["proceso"]:
            proceso_por_tipo[e["tipo"]][e["proceso"]] += 1
            tipo_por_proceso[e["proceso"]][e["tipo"]] += 1

    total = len(entradas) + len(sin_clasificar)
    return {
        "version": 1,
        "nota": ("Que ha hecho FTS de verdad. Triangulado de Odoo (que se "
                 "vendio), Outlook (de que se hablo) y SharePoint (que se "
                 "propuso). SIN PERSONAS: empresa, proyecto, proceso y monto."),
        "procedencia": procedencia,
        "cobertura": {
            "ordenes_leidas": len(ordenes),
            "lineas_leidas": len(lineas),
            "hilos_leidos": len(hilos),
            "propuestas_leidas": len(propuestas),
            "lineas_clasificadas": len(entradas),
            "lineas_sin_clasificar": len(sin_clasificar),
            "pct_clasificado": round(100 * len(entradas) / total, 1) if total else 0.0,
            "descartadas_por_no_ser_proyecto": dict(descartadas.most_common()),
            "aviso": ("El % sin clasificar es la medida honesta de la cobertura "
                      "del vocabulario. Un catalogo que clasifica el 100% miente "
                      "sobre su propia cobertura."),
        },
        "tipos_de_proyecto": {
            t: {"n": n,
                "procesos_que_lo_generaron": dict(proceso_por_tipo[t].most_common()),
                "quien_lo_compra": PERFIL_DE_QUIEN_COMPRA.get(t, ""),
                }
            for t, n in por_tipo.most_common()},
        "procesos_del_cliente": {
            p: {"n": sum(c.values()),
                "proyectos_que_produjo": dict(c.most_common())}
            for p, c in sorted(tipo_por_proceso.items(),
                               key=lambda kv: -sum(kv[1].values()))},
        "capacidad_por_tipo": palabras_de_capacidad(entradas),
        "sin_clasificar_muestra": [e["descripcion"] for e in sin_clasificar[:25]],
        "entradas": entradas,
    }


def a_markdown(cat: dict) -> str:
    """El catalogo en la forma que se REVISA: una tabla que Esteban lee.

    Se GENERA del JSON, nunca se escribe a mano. Un documento escrito a mano al
    lado de un JSON se separa del JSON en la segunda actualizacion, y entonces hay
    dos catalogos que dicen cosas distintas -- que es peor que no tener ninguno--.
    """
    c = cat["cobertura"]
    L = ["# Catálogo de proyectos de FTS — qué ha hecho la casa, de verdad", "",
         "> **GENERADO**, no escrito a mano: sale de "
         "`herramientas/construir_catalogo.py` sobre el JSON de al lado. Si algo "
         "está mal aquí, se corrige el **vocabulario** en "
         "`flujo/catalogo_proyectos.py` y se vuelve a generar.", "",
         "Es el insumo del **evaluador del motor 1**: sin él, «planta nueva en "
         "Durango» no dice si es un prospecto de FTS o de un fabricante de racks. "
         "Con él, «funde cobre» se convierte en «fundición, y la fundición "
         "produjo N proyectos de enfriamiento en el historial».", "",
         "**No lleva ni una persona.** Empresa, proyecto, proceso y monto. Por eso "
         "puede vivir en este repo, que es público.", "",
         "## Procedencia de la muestra — léelo antes de las tablas", "",
         (cat.get("procedencia") or
          "**SIN DECLARAR.** Un catálogo sin procedencia no se puede "
          "interpretar: un sesgo de muestreo no declarado se lee como un hecho "
          "sobre el negocio."), "",
         "## Cobertura — lo primero, porque decide cuánto vale lo demás", "",
         "| | |", "|---|---|",
         f"| Órdenes leídas | {c['ordenes_leidas']} |",
         f"| Líneas leídas | {c['lineas_leidas']} |",
         f"| Hilos de Outlook | {c['hilos_leidos']} |",
         f"| Propuestas de SharePoint | {c['propuestas_leidas']} |",
         f"| **Líneas clasificadas** | **{c['lineas_clasificadas']} "
         f"({c['pct_clasificado']}%)** |",
         f"| Sin clasificar | {c['lineas_sin_clasificar']} |", "",
         f"Descartadas por no ser proyecto: "
         + (", ".join(f"`{k}` ({v})" for k, v in
                      c["descartadas_por_no_ser_proyecto"].items()) or "ninguna"),
         "",
         "> **El porcentaje sin clasificar es la medida honesta del vocabulario.** "
         "Un catálogo que clasifica el 100% no tiene mejor vocabulario: miente "
         "sobre su propia cobertura.", "",
         "## Tipos de proyecto, y quién los compra", "",
         "| Tipo | n | Procesos que lo generaron | Quién lo compra |",
         "|---|---|---|---|"]
    for t, d in cat["tipos_de_proyecto"].items():
        pr = ", ".join(f"{k} ({v})" for k, v in
                       list(d["procesos_que_lo_generaron"].items())[:4])
        L.append(f"| `{t}` | {d['n']} | {pr or '—'} | {d['quien_lo_compra']} |")
    L += ["", "> La columna **«quién lo compra» NO sale de los datos**: sale del "
          "método. Mirar quién firmó exigiría mirar personas, y el catálogo no las "
          "lleva. Se declara así para que nadie la confunda con una medición.", "",
          "## Procesos del cliente — la llave que usa el radar", "",
          "El proceso **no es la industria**: es qué hace la planta, que es lo que "
          "genera la carga. Dos plantas «automotrices» con procesos distintos son "
          "dos prospectos distintos.", "",
          "| Proceso | n | Proyectos que produjo |", "|---|---|---|"]
    for pr, d in cat["procesos_del_cliente"].items():
        ty = ", ".join(f"{k} ({v})" for k, v in
                       list(d["proyectos_que_produjo"].items())[:4])
        L.append(f"| `{pr}` | {d['n']} | {ty} |")
    cap = cat.get("capacidad_por_tipo") or {}
    if cap:
        L += ["", "## Capacidad — el rango donde FTS ha vendido de verdad", "",
              "Es la tercera capa del match del evaluador, y **corta por arriba, "
              "no solo por abajo**: una señal de 1,500 TR no es mejor que una de "
              "200, es de otro tamaño de empresa y otro competidor.", "",
              "| Tipo | n con TR | mín | mediana | máx | Unidades vistas |",
              "|---|---|---|---|---|---|"]
        for t, d in sorted(cap.items()):
            u = ", ".join(f"{k}×{v}" for k, v in
                          (d.get("unidades_vistas") or {}).items())
            if "min_TR" in d:
                L.append(f"| `{t}` | {d['n']} | {d['min_TR']:g} | "
                         f"{d['mediana_TR']:g} | {d['max_TR']:g} | {u} |")
            else:
                L.append(f"| `{t}` | — | — | — | — | {u} |")
    muestra = cat.get("sin_clasificar_muestra") or []
    if muestra:
        L += ["", "## Lo que el vocabulario NO cubre todavía", "",
              "Se listan a propósito: es de aquí de donde sale la siguiente "
              "corrección del vocabulario.", ""]
        L += [f"- `{m}`" for m in muestra]
    return "\n".join(L) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ordenes", required=True)
    ap.add_argument("--lineas", required=True)
    ap.add_argument("--hilos", default=None)
    ap.add_argument("--propuestas", default=None)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--procedencia", default="",
                    help="COMO se tomo la muestra. Sin esto el catalogo no se "
                         "puede interpretar: un sesgo de muestreo no declarado "
                         "se lee como un hecho sobre el negocio")
    ap.add_argument("--md", default=None,
                    help="tambien escribe la tabla en markdown, generada del JSON")
    a = ap.parse_args(argv)
    cat = construir(_leer(a.ordenes), _leer(a.lineas),
                    _leer(a.hilos), _leer(a.propuestas),
                    procedencia=a.procedencia)
    crudo = json.dumps(cat, ensure_ascii=False)
    # Despues de enmascarar, CUALQUIER coincidencia que quede es una fuga. No
    # hace falta filtrar los marcadores: `[correo]` y `[telefono]` no tienen forma
    # de correo ni de telefono, asi que el regex no los ve.
    fugas = _CORREO.findall(crudo) + _TEL.findall(crudo)
    if fugas:
        raise SystemExit(
            "SE DETENDRA: el catalogo lleva algo con forma de dato personal y "
            "este repo es PUBLICO:\n  " + "\n  ".join(sorted(set(fugas))[:10]))
    os.makedirs(os.path.dirname(os.path.abspath(a.salida)) or ".", exist_ok=True)
    with open(a.salida, "w", encoding="utf-8") as f:
        json.dump(cat, f, ensure_ascii=False, indent=2)
    if a.md:
        with open(a.md, "w", encoding="utf-8") as f:
            f.write(a_markdown(cat))
    c = cat["cobertura"]
    print(f"\nCATALOGO DE PROYECTOS -> {a.salida}")
    if a.md:
        print(f"  tabla para revisar -> {a.md}")
    print(f"  {c['ordenes_leidas']} ordenes · {c['lineas_leidas']} lineas · "
          f"{c['hilos_leidos']} hilos · {c['propuestas_leidas']} propuestas")
    print(f"  clasificadas {c['lineas_clasificadas']} "
          f"({c['pct_clasificado']}%) · sin clasificar "
          f"{c['lineas_sin_clasificar']}")
    print("\n  TIPOS DE PROYECTO:")
    for t, d in cat["tipos_de_proyecto"].items():
        pr = ", ".join(f"{k}({v})" for k, v in
                       list(d["procesos_que_lo_generaron"].items())[:3])
        print(f"    {t:26} {d['n']:>4}   {pr or '(sin proceso identificado)'}")
    print("\n  PROCESOS DEL CLIENTE:")
    for p, d in cat["procesos_del_cliente"].items():
        ty = ", ".join(f"{k}({v})" for k, v in
                       list(d["proyectos_que_produjo"].items())[:3])
        print(f"    {p:26} {d['n']:>4}   {ty}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
