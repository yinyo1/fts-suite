"""Recalcula la constancia de la corrida de puertas DESDE LOS MODULOS (#382).

Por que existe esta herramienta y no se editan los numeros a mano:

El defecto que este repo ha arreglado ocho veces es el mismo --un numero escrito a
mano que deja de empatar con el dato-- y esta corrida lo repitio dos veces en un
dia. Primero en el libro de consultas del 5-oct, que decia 20 cuando se habian
gastado 38. Despues con Yokohama: al sacar «arranque de operaciones» del
vocabulario de inauguracion (porque «arranque de operaciones en el segundo
trimestre de 2028» hacia pasar por inaugurada una planta que no existe) su fase
cambio de `inaugurada` a `anuncio`, y con ella sus dos puertas y tres renglones
del resumen. Corregir eso a mano es volver a sembrar el defecto.

Entonces: `eval`, `puertas`, `tipo_de_senal`, `dias` y TODO el resumen se derivan
de `flujo.radar` y `flujo.puertas`. Lo que se escribe a mano en el archivo es solo
lo que ningun modulo puede saber -- la senal, su fecha, su liga, su procedencia,
el EPC si la nota lo nombra--. `tests/test_puertas_382.py` exige que el archivo
en disco SEA ya el resultado de este recalculo, asi que un numero a mano no puede
sobrevivir a la suite.

    python3 herramientas/sellar_constancia_puertas.py            # dice que cambiaria
    python3 herramientas/sellar_constancia_puertas.py --escribir # lo escribe
"""
import json
import os
import sys
from collections import Counter
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from flujo import puertas as P                                     # noqa: E402
from flujo.radar import cargar_catalogo, evaluar, tipo_de_senal_de  # noqa: E402
from flujo.sello import version                                     # noqa: E402

CONSTANCIA = os.path.join(RAIZ, "datos", "radar-2026-10-05-puertas.json")

# Lo que el recalculo PRODUCE. Todo lo demas de cada entrada es dato de campo.
DERIVADAS = ("eval", "puertas", "tipo_de_senal", "dias")

SIN_FASE = "(sin fase en el texto)"


def _senal_de(entrada: dict) -> dict:
    return {k: v for k, v in entrada.items() if k not in DERIVADAS}


def recalcular(c: dict, catalogo: dict | None = None) -> dict:
    """La constancia con sus partes derivadas puestas al dia. No muta `c`."""
    catalogo = catalogo if catalogo is not None else cargar_catalogo()
    hoy = date.fromisoformat(c["hoy"])
    nuevo = dict(c)
    evaluadas = []
    for entrada in c["evaluadas"]:
        senal = _senal_de(entrada)
        ev = evaluar(senal, catalogo, hoy)
        pu = P.puertas_de(senal, catalogo, hoy, ev)
        tipo, _ = tipo_de_senal_de(senal.get("fuente", ""), senal.get("tipo") or "")
        al_dia = dict(senal)
        al_dia["eval"] = ev
        al_dia["puertas"] = pu
        al_dia["tipo_de_senal"] = tipo
        # `dias` queda en None cuando la senal no trae fecha (Megasteel): la
        # llave no se borra, porque quien lee el archivo cuenta con que exista.
        al_dia["dias"] = ((hoy - date.fromisoformat(senal["fecha"])).days
                          if senal.get("fecha") else None)
        # el orden de las llaves de la entrada original se respeta
        orden = [k for k in entrada if k in al_dia]
        orden += [k for k in al_dia if k not in entrada]
        evaluadas.append({k: al_dia[k] for k in orden})
    nuevo["evaluadas"] = evaluadas
    nuevo["consultas_gastadas"] = len(c["consultas"])
    # La version tambien se deriva: escrita a mano se queda en la del turno anterior,
    # y el pie del reporte la publica.
    nuevo["version_de_la_herramienta"] = version()
    nuevo["resumen"] = resumen_de(evaluadas, c)
    return nuevo


def resumen_de(evaluadas: list[dict], c: dict) -> dict:
    """Los conteos, contados. Ninguno se escribe a mano."""
    fases = Counter(e["puertas"].get("fase") or SIN_FASE for e in evaluadas)
    ventana = c.get("ventanas", {}).get("descubrimiento_dias", 180)

    def puertas_con(nombre, estado=None):
        n = 0
        for e in evaluadas:
            for p in e["puertas"]["puertas"]:
                if p["puerta"] == nombre and (estado is None or p["estado"] == estado):
                    n += 1
        return n

    identificado = 0
    for e in evaluadas:
        for p in e["puertas"]["puertas"]:
            if (p["puerta"] == P.PUERTA_EPC and p["estado"] == P.ABIERTA
                    and p.get("interlocutor") and "POR IDENTIFICAR" not in p["interlocutor"]):
                identificado += 1
    return {
        "senales": len(evaluadas),
        # `de_la_corrida` lleva el NOMBRE de la corrida que la encontro, no su fecha:
        # las dos corridas pasaron el mismo dia -- descubrimiento en la manana, puertas
        # en la tarde-- y una fecha no las distingue. Cuando era una fecha, estos dos
        # conteos salieron en CERO al corregir el dia de la corrida.
        "nuevas_de_esta_corrida": sum(1 for e in evaluadas
                                      if e.get("de_la_corrida") == c["corrida"]),
        "heredadas_de_la_corrida_anterior": sum(
            1 for e in evaluadas
            if e.get("de_la_corrida") and e["de_la_corrida"] != c["corrida"]),
        "pasan": sum(1 for e in evaluadas if e["eval"]["veredicto"] == "pasa"),
        "guardan": sum(1 for e in evaluadas if e["eval"]["veredicto"] == "guarda"),
        "archivan": sum(1 for e in evaluadas if e["eval"]["veredicto"] == "archiva"),
        f"en_ventana_de_{ventana}_dias": sum(1 for e in evaluadas
                                             if e.get("dias") is not None
                                             and e["dias"] <= ventana),
        "por_fase": dict(sorted(fases.items())),
        "obra_nueva": sum(1 for e in evaluadas if e["puertas"]["es_obra_nueva"]),
        "puerta_epc_abierta": puertas_con(P.PUERTA_EPC, P.ABIERTA),
        # Ni abierta ni cerrada: la nota no alcanza para decirlo. Se cuenta aparte
        # porque es trabajo pendiente, no una puerta descartada.
        "puerta_epc_por_averiguar": puertas_con(P.PUERTA_EPC, P.DESCONOCIDA),
        "puerta_epc_con_interlocutor_identificado": identificado,
        "puerta_usuario_abierta": puertas_con(P.PUERTA_USUARIO, P.ABIERTA),
        "puerta_usuario_directo": puertas_con(P.PUERTA_USUARIO_DIRECTO),
        "expansion_lateral": puertas_con(P.PUERTA_LATERAL),
        "planta_ya_intervenida": puertas_con(P.PUERTA_VIA_CANAL),
    }


def _diferencias(viejo: dict, nuevo: dict) -> list[str]:
    d = []
    for k, v in nuevo["resumen"].items():
        if viejo["resumen"].get(k) != v:
            d.append(f"resumen.{k}: {viejo['resumen'].get(k)!r} -> {v!r}")
    if viejo.get("version_de_la_herramienta") != nuevo["version_de_la_herramienta"]:
        d.append(f"version_de_la_herramienta: "
                 f"{viejo.get('version_de_la_herramienta')} -> "
                 f"{nuevo['version_de_la_herramienta']}")
    if viejo.get("consultas_gastadas") != nuevo["consultas_gastadas"]:
        d.append(f"consultas_gastadas: {viejo.get('consultas_gastadas')} -> "
                 f"{nuevo['consultas_gastadas']}")
    for a, b in zip(viejo["evaluadas"], nuevo["evaluadas"]):
        quien = f"{a.get('empresa')} ({a.get('planta')})"
        if a.get("eval", {}).get("puntaje") != b["eval"]["puntaje"]:
            d.append(f"{quien}: puntaje {a.get('eval', {}).get('puntaje')} -> "
                     f"{b['eval']['puntaje']}")
        if a.get("dias", "falta") != b["dias"]:
            d.append(f"{quien}: dias {a.get('dias', 'falta')!r} -> {b['dias']!r}")
        if a.get("puertas", {}).get("fase") != b["puertas"]["fase"]:
            d.append(f"{quien}: fase {a.get('puertas', {}).get('fase')!r} -> "
                     f"{b['puertas']['fase']!r}")
        pa = {p["puerta"]: p["estado"] for p in a.get("puertas", {}).get("puertas", [])}
        pb = {p["puerta"]: p["estado"] for p in b["puertas"]["puertas"]}
        if pa != pb:
            d.append(f"{quien}: puertas {pa} -> {pb}")
        elif a.get("puertas") != b["puertas"]:
            # MISMO estado, distinto contenido. Pasaba desapercibido: el diff solo
            # miraba puerta->estado, y el 6-oct Daikin quedo con el texto viejo de
            # «como identificar al constructor» -- el que no traia el parque-- porque
            # el estado no habia cambiado. La prueba de sellado lo vio y el sellador
            # no: un diff mas angosto que su prueba es un diff que miente.
            cambiadas = sorted(
                k for pa_, pb_ in zip(a["puertas"]["puertas"], b["puertas"]["puertas"])
                for k in set(pa_) | set(pb_) if pa_.get(k) != pb_.get(k))
            d.append(f"{quien}: las puertas cambiaron por dentro ({', '.join(cambiadas)})")
    return d


def main(argv: list[str]) -> int:
    viejo = json.load(open(CONSTANCIA, encoding="utf-8"))
    nuevo = recalcular(viejo)
    dif = _diferencias(viejo, nuevo)
    if not dif:
        print("la constancia ya empata con los modulos: nada que sellar")
        return 0
    print(f"{len(dif)} diferencia(s) entre el archivo y lo que los modulos dicen hoy:")
    for linea in dif:
        print("  ·", linea)
    if "--escribir" not in argv:
        print("\n(nada escrito; corre con --escribir para sellarlo)")
        return 1
    with open(CONSTANCIA, "w", encoding="utf-8") as f:
        json.dump(nuevo, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nsellado: {CONSTANCIA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
