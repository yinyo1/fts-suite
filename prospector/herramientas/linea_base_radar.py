"""La linea base del radar: cuantas de las cuentas ya evaluadas pasarian solas.

POR QUE ESTA HERRAMIENTA EXISTE. Despues de D3 hay que contestar una pregunta
concreta: **con el radar calibrado como esta hoy, cuantas de las cuentas que FTS
ya trabajo habrian salido del radar por si solas.** Si son pocas, el radar sigue
ciego y el trabajo entra por criterio del dueno; si son muchas, el radar ya
sirve. Esa cifra no se puede opinar, y sin un artefacto reproducible cada quien
la recalcularia distinto.

COMO MIDE EL "ANTES". No se guarda un numero viejo a mano: se recalcula
desactivando D3 -- el vocabulario de obra nueva-- y B1, B2 y B3 -- los tres
defectos del evaluador--. Asi el "antes" es lo que el evaluador de verdad decia,
no lo que alguien recuerda que decia. La unica excepcion documentada es Coficab
Durango, cuyo puntaje viejo (59) esta escrito en
`metodo/motor1-radar-de-leads.md` §3d, y sirve de control del calculo.

LAS DOS COLUMNAS DE FRESCURA, y la razon de que sean dos. De las nueve cuentas
con senal documentada, solo tres traen FECHA de la nota. Las otras seis se
midieron el 18-sep-2026 como "senales calientes" y su fecha no quedo escrita.
Puntuarlas con el minimo de frescura (2 de 25) las hundiria por un dato que falta,
no por una senal debil; puntuarlas como frescas seria inventarles la fecha. Se
reportan las dos cifras: la que sale de lo documentado, y el TECHO que tendrian si
la senal estuviera fresca. La diferencia entre las dos columnas es exactamente el
costo de no haber anotado la fecha.

NO LEE NINGUNA CORRIDA, y es a proposito: las corridas viven en la sesion y se
mueren con el contenedor. Esta medicion lee `datos/senales-documentadas.json`, que
vive en el repo con la procedencia de cada senal.
"""
from __future__ import annotations
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flujo import radar
from flujo import catalogo_proyectos as cp

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "datos", "senales-documentadas.json")

#: Los terminos que D3 agrego. Se quitan para medir el "antes".
TERMINOS_DE_D3 = {t for t, tipo in radar.TERMINOS_DE_TIPO.items()
                  if tipo == radar.TIPO_INTEGRAL_OBRA_NUEVA}
#: Lo que B1 quito y B2 agrego, para poder restaurar el estado de antes.
PROCESO_ANTES_DE_B1_B2 = {
    "metalmecanica": ("metalmecanica", "maquinado", "cnc", "estampado",
                      "troquelado", "soldadura", "prensa", "machining",
                      "iron machining", "rueda", "wheel", "maquinados"),
    "arneses_cableado": ("arnes", "arneses", "wire harness", "trefilado",
                         "alambre magneto", "magnet wire",
                         "esmaltado de alambre", "conductor de cobre"),
}


class SinD3:
    """Contexto que devuelve el evaluador al estado de ANTES de #330.

    Quita el vocabulario de D3, restaura el "prensa" de B1, quita el "cable" de
    B2 y apaga el giro de B3. Al salir lo deja todo como estaba: una medicion que
    ensucia el estado del proceso no se puede correr dos veces.
    """

    def __enter__(self):
        self._terminos = dict(radar.TERMINOS_DE_TIPO)
        for t in TERMINOS_DE_D3:
            radar.TERMINOS_DE_TIPO.pop(t, None)
        # `PROCESOS_DEL_CLIENTE` es una TUPLA -- no se muta en su lugar-- asi que
        # se reemplaza el atributo del modulo, que es lo que `proceso_de` lee.
        self._vocab = cp.PROCESOS_DEL_CLIENTE
        cp.PROCESOS_DEL_CLIENTE = tuple(
            (proc, PROCESO_ANTES_DE_B1_B2.get(proc, palabras))
            for proc, palabras in cp.PROCESOS_DEL_CLIENTE)
        return self

    def __exit__(self, *a):
        radar.TERMINOS_DE_TIPO.clear()
        radar.TERMINOS_DE_TIPO.update(self._terminos)
        cp.PROCESOS_DEL_CLIENTE = self._vocab
        return False


def _senal(c: dict, con_giro: bool, fresca: bool = False) -> dict:
    s = {"texto": c.get("texto") or "", "fuente": c.get("fuente") or "",
         "empata_padron": bool(c.get("en_padron_denue"))}
    if con_giro:
        s["giro"] = c.get("giro") or ""
    if fresca:
        # El techo: la misma senal con fecha de hoy. No se guarda como puntaje de
        # la cuenta, se reporta aparte y etiquetado.
        s["fecha"] = None
        s["_fresca"] = True
    else:
        s["fecha"] = c.get("fecha_senal")
    return s


def medir(cuenta: dict, hoy=None) -> dict:
    """El antes, el despues y el techo de UNA cuenta."""
    if not cuenta.get("fuente"):
        return {"empresa": cuenta["empresa"], "planta": cuenta.get("planta"),
                "hueco": True, "nota": cuenta.get("nota")}
    with SinD3():
        antes = radar.evaluar(_senal(cuenta, con_giro=False), hoy=hoy)
    despues = radar.evaluar(_senal(cuenta, con_giro=True), hoy=hoy)
    # El TECHO con senal fresca: se fuerza la frescura al maximo de la escala en
    # vez de inventar una fecha, que es lo mismo y no mete una fecha falsa en
    # ningun registro.
    techo = dict(despues)
    if not cuenta.get("fecha_documentada"):
        delta = radar.MAX_FRESCURA - despues["desglose"]["frescura"]
        techo = {**despues, "puntaje": round(despues["puntaje"] + delta, 1)}
        techo["veredicto"] = (radar.PASA if techo["puntaje"] >= radar.UMBRAL_PASA
                              else radar.GUARDA
                              if techo["puntaje"] >= radar.UMBRAL_GUARDA
                              else radar.ARCHIVA)
    return {
        "empresa": cuenta["empresa"], "planta": cuenta.get("planta"),
        "hueco": False,
        "fuente": cuenta["fuente"], "tipo": cuenta.get("tipo"),
        "fecha_documentada": bool(cuenta.get("fecha_documentada")),
        "antes": antes["puntaje"], "antes_veredicto": antes["veredicto"],
        "despues": despues["puntaje"], "veredicto": despues["veredicto"],
        "techo_si_fresca": techo["puntaje"],
        "techo_veredicto": techo["veredicto"],
        "desglose": despues["desglose"],
        "tipos_que_nombra": despues["tipos_que_nombra"],
    }


def linea_base(ruta: str = RUTA, hoy=None) -> dict:
    with open(ruta, encoding="utf-8") as f:
        d = json.load(f)
    filas = [medir(c, hoy) for c in d["cuentas"]]
    control = [medir(c, hoy) for c in d.get("casos_de_control") or []]
    con_senal = [f for f in filas if not f["hueco"]]
    pasan = [f for f in con_senal if f["veredicto"] == radar.PASA]
    pasan_techo = [f for f in con_senal if f["techo_veredicto"] == radar.PASA]
    subieron = [f for f in con_senal if f["despues"] > f["antes"]]
    return {
        "corte": d.get("corte"),
        "cuentas": len(filas),
        "huecos": [f"{f['empresa']}"
                   + (f"/{f['planta']}" if f.get("planta") else "")
                   for f in filas if f["hueco"]],
        "con_senal_documentada": len(con_senal),
        "pasan": [f"{f['empresa']}" + (f"/{f['planta']}" if f.get("planta") else "")
                  for f in pasan],
        "pasan_con_lo_documentado": len(pasan),
        "pasarian_si_la_senal_estuviera_fresca": len(pasan_techo),
        "subieron_con_d3": len(subieron),
        "filas": filas,
        "control": control,
    }


def _nombre(f):
    return f"{f['empresa']}" + (f"/{f['planta']}" if f.get("planta") else "")


def imprimir(r: dict) -> None:
    print(f"\n  LINEA BASE DEL RADAR — corte {r['corte']}")
    print(f"  {r['cuentas']} cuentas ya evaluadas · "
          f"{r['con_senal_documentada']} con senal documentada · "
          f"{len(r['huecos'])} huecos\n")
    print(f"  {'cuenta':26} {'antes':>7} {'despues':>8} {'veredicto':>9} "
          f"{'techo':>7} {'fecha?':>7}")
    print("  " + "-" * 70)
    for f in r["filas"]:
        if f["hueco"]:
            print(f"  {_nombre(f):26} {'—':>7} {'—':>8} {'HUECO':>9}")
            continue
        fecha = "si" if f["fecha_documentada"] else "NO"
        techo = "" if f["fecha_documentada"] else f"{f['techo_si_fresca']:>7}"
        print(f"  {_nombre(f):26} {f['antes']:>7} {f['despues']:>8} "
              f"{f['veredicto']:>9} {techo:>7} {fecha:>7}")
    print("  " + "-" * 70)
    print(f"  PASAN con lo documentado: {r['pasan_con_lo_documentado']} de "
          f"{r['con_senal_documentada']}  ({', '.join(r['pasan']) or 'ninguna'})")
    print(f"  Pasarian si la senal estuviera fresca: "
          f"{r['pasarian_si_la_senal_estuviera_fresca']} de "
          f"{r['con_senal_documentada']}")
    print(f"  Subieron con D3: {r['subieron_con_d3']}")
    if r["huecos"]:
        print(f"  Huecos (sin senal documentada, NO se inventa): "
              f"{', '.join(r['huecos'])}")
    for c in r["control"]:
        if not c["hueco"]:
            print(f"\n  CONTROL · senal fresca documentada: {c['despues']} "
                  f"-> {c['veredicto']}")
    print()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    r = linea_base()
    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        imprimir(r)
