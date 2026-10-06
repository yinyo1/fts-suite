"""El tablero del viernes: el estado del piloto en una pantalla.

PARA QUIEN ES. Para Esteban, el viernes, para saber si el motor 3 esta vivo. No
es un reporte de aprendizaje -- ese es `flujo/aprendizaje.py` y sale en JSON--:
es media hoja que se lee de pie.

QUE MUESTRA, Y POR QUE ESO:

  tarjetas por estado         si hay trabajo abierto, o si el radar produjo y
                              nadie lo trabajo. `vencida_sin_trabajar` va SEPARADA
                              de `cerrada` a proposito: una cerrada se trabajo y
                              termino; una vencida nunca se toco, y sumarlas
                              esconde el unico numero que mide al equipo en vez de
                              medir al radar.
  toques por canal y result.  es la tabla del lazo 2. Una columna de «sin
                              respuesta» alta con un canal no significa que el
                              canal no sirva: significa que todavia no se sabe.
  vencen esta semana          lo unico del tablero que pide una accion hoy.
  las tres compuertas         cuanto falta para que cada lazo pueda mover una
                              constante. Casi siempre va a decir «faltan N», y
                              eso es correcto: el piloto lleva una semana.
  anomalias                   lo que no deberia existir. Un `toque` sin
                              destinatario se ve, en la linea de arriba, igual que
                              trabajo hecho -- y en #365 hubo uno de verdad, que
                              dejo una carga que se cayo a medias--. Si el tablero
                              no lo dice, nadie lo va a ver.

SIN NOMBRES. Ninguna consulta de aqui toca `contacto.nombre`: el tablero habla de
puestos, cuentas y plantas. Que sea por construccion y no por cuidado es el punto.

NO ESCRIBE NADA. Ni en la base, ni en Odoo.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from flujo.aprendizaje import los_tres_lazos                     # noqa: E402
from flujo.base_motor3 import (Base, SinPostgres,                # noqa: E402
                               cierres_para_el_aprendizaje)
from flujo.sello import version                                  # noqa: E402

# Los estados en el orden en que se leen, no en orden alfabetico: primero lo que
# esta vivo, al final lo que nunca se trabajo.
ORDEN_DE_ESTADOS = ("abierta", "cerrada", "vencida_sin_trabajar")

CANALES = ("correo_directo", "linkedin", "conmutador", "evento")
RESULTADOS = ("sin_respuesta", "respuesta_positiva", "reunion_agendada",
              "respuesta_negativa", "rebote", "persona_equivocada",
              "ya_no_trabaja_aqui")


def _fin_de_semana(hoy: date) -> date:
    """El domingo de la semana de `hoy`. Lunes es el primer dia."""
    return hoy + timedelta(days=6 - hoy.weekday())


def leer(b: Base, hoy: date) -> dict:
    """Todo lo que el tablero muestra, en una sola lectura."""
    hasta = _fin_de_semana(hoy)
    datos = b.json(f"""
    SELECT jsonb_build_object(
      'tarjetas_por_estado', coalesce((
         SELECT jsonb_object_agg(estado, n) FROM (
           SELECT estado::text AS estado, count(*) AS n
             FROM motor3.tarjeta GROUP BY 1) z), '{{}}'::jsonb),
      'reabiertas_vencidas', (SELECT count(*) FROM motor3.tarjeta
                              WHERE reabierta_vencida),
      -- LAS QUE NACIERON DEL RADAR (#382, D5). Van aparte de las de la mano de
      -- Esteban porque son las unicas que pueden corregir los CRITERIOS del radar:
      -- una tarjeta abierta a mano cierra por razones que el radar nunca vio.
      'del_radar', coalesce((
         SELECT jsonb_agg(jsonb_build_object(
                  'empresa', c.empresa, 'planta', c.planta,
                  'puerta', s.puerta, 'puntaje', s.puntaje,
                  'caduca_el', t.caduca_el,
                  'dias', (t.caduca_el - '{hoy}'::date),
                  'estado', t.estado::text,
                  'toques', (SELECT count(*) FROM motor3.toque q
                             WHERE q.tarjeta_id = t.id))
                ORDER BY t.caduca_el)
           FROM motor3.tarjeta t
           JOIN motor3.senal s  ON s.id = t.senal_id
           JOIN motor3.cuenta c ON c.id = t.cuenta_id
          WHERE s.origen = 'radar'), '[]'::jsonb),
      'cuentas', (SELECT count(*) FROM motor3.cuenta),
      'toques', coalesce((
         SELECT jsonb_agg(jsonb_build_object(
                  'canal', canal::text,
                  'resultado', coalesce(resultado::text, 'pendiente'),
                  'n', n))
           FROM (SELECT canal, resultado, count(*) AS n
                   FROM motor3.toque GROUP BY 1, 2) z), '[]'::jsonb),
      'toques_total', (SELECT count(*) FROM motor3.toque),
      'toques_pendientes', (SELECT count(*) FROM motor3.toque
                            WHERE resultado IS NULL),
      'vencen', coalesce((
         SELECT jsonb_agg(jsonb_build_object(
                  'empresa', c.empresa, 'planta', c.planta,
                  'caduca_el', t.caduca_el, 'por_que', t.caduca_por_que,
                  'toques', (SELECT count(*) FROM motor3.toque q
                              WHERE q.tarjeta_id = t.id))
                ORDER BY t.caduca_el)
           FROM motor3.tarjeta t JOIN motor3.cuenta c ON c.id = t.cuenta_id
          WHERE t.estado = 'abierta' AND t.caduca_el IS NOT NULL
            AND t.caduca_el <= DATE '{hasta.isoformat()}'), '[]'::jsonb),
      'huerfanos', (SELECT count(*) FROM motor3.toque t
                    WHERE NOT EXISTS (SELECT 1 FROM motor3.toque_destinatario d
                                       WHERE d.toque_id = t.id)),
      'contactos_con_nombre', (SELECT count(*) FROM motor3.contacto
                               WHERE nombre IS NOT NULL),
      'senales_sin_fecha', (SELECT count(*) FROM motor3.senal
                            WHERE fecha_senal IS NULL),
      -- Una tarjeta ABIERTA que cuelga de una senal sin fecha tiene una
      -- caducidad calculada desde HOY, no desde el hecho: se ve mas fresca de lo
      -- que es, y es la unica de las anomalias que cambia una decision -- cual
      -- tarjeta se trabaja primero--.
      'abiertas_con_senal_sin_fecha', (
         SELECT count(*) FROM motor3.tarjeta t
           JOIN motor3.senal s ON s.id = t.senal_id
          WHERE t.estado = 'abierta' AND s.fecha_senal IS NULL),
      'abiertas_sin_un_solo_toque', (
         SELECT count(*) FROM motor3.tarjeta t
          WHERE t.estado = 'abierta'
            AND NOT EXISTS (SELECT 1 FROM motor3.toque q
                             WHERE q.tarjeta_id = t.id))
    );
    """) or {}
    datos["hoy"] = hoy.isoformat()
    datos["hasta"] = hasta.isoformat()
    datos["lazos"] = los_tres_lazos(cierres_para_el_aprendizaje(b))
    return datos


def _matriz(toques: list[dict]) -> tuple[list[str], list[str], dict]:
    """(canales con algo, resultados con algo, {(canal,resultado): n}).

    Solo se imprimen las filas y columnas que TIENEN algo. Una matriz de 4x8 casi
    vacia se lee peor que tres renglones.
    """
    m = {}
    for t in toques:
        m[(t["canal"], t["resultado"])] = m.get(
            (t["canal"], t["resultado"]), 0) + int(t["n"])
    cs = [c for c in CANALES if any(k[0] == c for k in m)]
    cs += sorted({k[0] for k in m} - set(CANALES))
    rs = [r for r in ("pendiente",) + RESULTADOS if any(k[1] == r for k in m)]
    rs += sorted({k[1] for k in m} - set(RESULTADOS) - {"pendiente"})
    return cs, rs, m


ANCHO = 78


def _titulo(t: str) -> str:
    return f"\n  {t}\n  " + "-" * (ANCHO - 2)


def pintar(d: dict) -> str:
    """El tablero como texto. Una pantalla."""
    l = []
    l.append("")
    l.append("  " + "=" * (ANCHO - 2))
    l.append(f"  MOTOR 3 · ESTADO DEL PILOTO · {d['hoy']}")
    l.append(f"  prospector {version()} · {d['cuentas']} cuenta(s) en el piloto")
    l.append("  " + "=" * (ANCHO - 2))

    # 1 · tarjetas
    l.append(_titulo("TARJETAS POR ESTADO"))
    por = d.get("tarjetas_por_estado") or {}
    for e in ORDEN_DE_ESTADOS:
        n = int(por.get(e, 0))
        etiqueta = {"abierta": "abiertas — hay trabajo que hacer",
                    "cerrada": "cerradas — se trabajaron y terminaron",
                    "vencida_sin_trabajar":
                        "vencidas SIN TRABAJAR — el radar produjo y nadie las "
                        "tomo"}[e]
        l.append(f"      {n:>4}  {etiqueta}")
    otros = {k: v for k, v in por.items() if k not in ORDEN_DE_ESTADOS}
    for k, v in sorted(otros.items()):
        l.append(f"      {int(v):>4}  {k}")
    if d.get("reabiertas_vencidas"):
        l.append(f"      {int(d['reabiertas_vencidas']):>4}  de esas, reabiertas "
                 "a mano por una persona")
    if not por:
        l.append("      la base no tiene ni una tarjeta: el piloto no esta "
                 "cargado")

    # 2 · toques
    l.append(_titulo("TOQUES POR CANAL Y RESULTADO"))
    cs, rs, m = _matriz(d.get("toques") or [])
    if not cs:
        l.append("      todavia no hay un solo toque registrado. Si Rissia y "
                 "Pablo")
        l.append("      ya escribieron, lo que falta es cargar la hoja:")
        l.append("      herramientas/cargar_toques.py --hoja <el .xlsx>")
    else:
        corto = {"sin_respuesta": "sin resp.", "respuesta_positiva": "respondio",
                 "reunion_agendada": "REUNION", "respuesta_negativa": "rechazo",
                 "rebote": "rebote", "persona_equivocada": "persona eq.",
                 "ya_no_trabaja_aqui": "ya no esta", "pendiente": "pendiente"}
        encabezado = "      " + "canal".ljust(17)
        for r in rs:
            encabezado += corto.get(r, r)[:10].rjust(11)
        l.append(encabezado + "  total".rjust(8))
        for c in cs:
            fila = "      " + c.replace("_", " ")[:16].ljust(17)
            suma = 0
            for r in rs:
                n = m.get((c, r), 0)
                suma += n
                fila += (str(n) if n else "·").rjust(11)
            l.append(fila + str(suma).rjust(8))
        l.append(f"      total {d['toques_total']} toque(s), "
                 f"{d['toques_pendientes']} sin resultado todavia")

    # 3 · lo que vence
    l.append(_titulo(f"VENCEN ESTA SEMANA (al {d['hasta']})"))
    vencen = d.get("vencen") or []
    if not vencen:
        l.append("      ninguna tarjeta abierta vence esta semana")
    for v in vencen:
        planta = v.get("planta") or "—"
        aviso = "  ⚠ SIN UN SOLO TOQUE" if not v.get("toques") else ""
        l.append(f"      {v['caduca_el']}  {v['empresa']} / {planta}"
                 f"  · {v.get('toques', 0)} toque(s){aviso}")
        if v.get("por_que"):
            l.append(f"                  {str(v['por_que'])[:60]}")

    # 3 bis · las que nacieron del radar
    radar = d.get("del_radar") or []
    if radar:
        l.append(_titulo("LAS QUE NACIERON DEL RADAR, NO DE LA MANO"))
        l.append("      Son las unicas que pueden corregir los criterios del radar:")
        l.append("      su caducidad NO son los 120 dias de la senal, es la ventana")
        l.append("      de 18 meses de la puerta del usuario. Si una de estas cierra,")
        l.append("      el lazo 3 tiene con que mover esa ventana.")
        l.append("")
        for r in radar:
            planta = r.get("planta") or "—"
            aviso = "  ⚠ sin un solo toque" if not r.get("toques") else ""
            l.append(f"      {r['caduca_el']}  ({str(r['dias']).rjust(4)} d)  "
                     f"{r['empresa']} / {planta}")
            l.append(f"                  puerta {r['puerta']} · puntaje "
                     f"{r['puntaje']} · {r.get('toques', 0)} toque(s){aviso}")
        l.append(f"      {len(radar)} del radar de "
                 f"{d['tarjetas_por_estado'].get('abierta', 0)} abiertas en total")

    # 4 · las compuertas
    l.append(_titulo("LAS TRES COMPUERTAS DEL APRENDIZAJE"))
    lz = d["lazos"]
    l.append(f"      {lz['cierres_leidos']} cierre(s) leido(s)"
             + (f", {lz['cierres_sin_expediente_de_senal']} sin expediente de "
                "senal (no ensenan nada)"
                if lz.get("cierres_sin_expediente_de_senal") else ""))
    for lazo in lz["lazos"]:
        l.append(f"      lazo {lazo['lazo']} {lazo['nombre']} — "
                 f"{lazo['pregunta']}")
        for c in lazo["compuertas"]:
            marca = "ABRE" if c["abre"] else c["veredicto"]
            falta = (f"faltan {c['faltan']}" if c["faltan"]
                     else "alcanza el minimo")
            l.append(f"          [{marca:^10}] {c['celda'][:34]:<34} "
                     f"n={c['n']}/{c['minimo']} · {falta}")
    if not lz["compuertas_que_abren"]:
        l.append("      NINGUNA compuerta abre todavia, y con una semana de "
                 "piloto eso es")
        l.append("      lo correcto: el aprendizaje no se apura, se espera.")

    # 5 · anomalias
    l.append(_titulo("ANOMALIAS — esto no deberia existir"))
    hubo = False
    if d.get("huerfanos"):
        hubo = True
        l.append(f"      ⚠ {d['huerfanos']} toque(s) SIN destinatario. En la tabla "
                 "de arriba se")
        l.append("        cuentan como trabajo hecho y no lo son. Revisalos antes "
                 "de leer")
        l.append("        el lazo 2.")
    if d.get("contactos_con_nombre"):
        hubo = True
        l.append(f"      ⚠ {d['contactos_con_nombre']} contacto(s) CON nombre en "
                 "la base. La hoja de")
        l.append("        toques nunca pone nombres: alguien los metio por otra "
                 "via.")
    if d.get("abiertas_con_senal_sin_fecha"):
        hubo = True
        n = int(d["abiertas_con_senal_sin_fecha"])
        l.append(f"      ⚠ {n} tarjeta(s) ABIERTA(s) cuelgan de una senal SIN "
                 "FECHA. Su caducidad")
        l.append("        se conto desde el dia que se cargaron, no desde el "
                 "hecho: se ven mas")
        l.append("        frescas de lo que son, y el orden de trabajo sale mal. "
                 "Fechar la")
        l.append("        senal las corrige — la lista esta en la vista "
                 "senal_incompleta.")
    elif d.get("senales_sin_fecha"):
        hubo = True
        l.append(f"      · {d['senales_sin_fecha']} senal(es) sin fecha, ninguna "
                 "con tarjeta abierta.")
    if d.get("abiertas_sin_un_solo_toque"):
        hubo = True
        l.append(f"      · {d['abiertas_sin_un_solo_toque']} tarjeta(s) abierta(s) "
                 "sin un solo toque. No es un error")
        l.append("        si se abrieron esta semana; si llevan dos, es la cola "
                 "que crece.")
    if not hubo:
        l.append("      nada. La base esta limpia.")

    l.append("")
    l.append("  " + "-" * (ANCHO - 2))
    l.append("  Sin nombres de personas en ninguna linea de este tablero.")
    l.append("  Escrituras a Odoo: 0. El tablero solo lee.")
    l.append("")
    return "\n".join(l)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--socket", default="")
    ap.add_argument("--puerto", default="5440")
    ap.add_argument("--hoy", default="", help="para fijar la semana en pruebas")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    hoy = date.fromisoformat(a.hoy) if a.hoy else date.today()
    try:
        b = Base(socket=a.socket, puerto=a.puerto)
        if not b.vive():
            raise SinPostgres("la base no contesta")
        d = leer(b, hoy)
    except SinPostgres as e:
        # No se pinta un tablero vacio: un tablero de ceros es indistinguible de
        # uno correcto, y es la forma mas facil de creer que no paso nada.
        print(f"\n  NO HAY BASE: {e}\n  El tablero NO se pinta con ceros: un "
              "tablero vacio se lee igual que\n  uno donde no hubo trabajo.\n")
        return 2
    if a.json:
        print(json.dumps(d, ensure_ascii=False, indent=2, default=str))
    else:
        print(pintar(d))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
