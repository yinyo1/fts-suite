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
import re
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


#: LAS ETAPAS DE LA NOCHE, en orden. Cada una ES un conjunto de mejoras apagadas.
#:
#: Sin esto, la tabla mentia de una forma sutil: al aplicar D6 el "antes" tambien
#: subio -- porque el contexto solo apagaba D3 y B1/B2/B3-- y la columna que decia
#: "antes" ya traia D6 adentro. Un "antes" que se mueve cuando se agrega una mejora
#: no es un antes: es otro despues.
ETAPAS = (
    ("original", ("d3", "b", "d6"),
     "antes de la noche del 28-sep: sin vocabulario de obra nueva, con el falso "
     "positivo de 'prensa', sin 'cable' en el catalogo, sin giro y sin dinero"),
    ("con_d3_y_b", ("d6",),
     "con D3 -- obra nueva integral-- y con B1/B2/B3 corregidos"),
    ("con_d6", (),
     "mas D6: el evaluador ya lee los montos de inversion"),
)


class SinMejoras:
    """Apaga las mejoras que se le nombren, y las restaura al salir.

    Tres interruptores independientes, y tienen que ser independientes para que la
    tabla de evolucion signifique algo:

      `d3`  el vocabulario de obra nueva y su tipo integral
      `b`   los tres defectos: el falso positivo de "prensa" (B1), la falta de
            "cable" (B2) y el giro que no entraba (B3)
      `d6`  la lectura de montos de inversion

    Una medicion que ensucia el estado del proceso no se puede correr dos veces, y
    seria peor que inutil: la segunda corrida de la suite mediria contra un
    evaluador mutilado y las pruebas de D3 fallarian por una razon ajena a D3.
    """

    #: El regex de `magnitudes()` de ANTES de D6: sin dinero y sin MW.
    _MAG_ANTES_DE_D6 = re.compile(
        r"(\d{1,5}(?:[.,]\d{1,2})?)\s*"
        r"(tr\b|ton(?:elada)?s?\s+de\s+refrigeracion|hp\b|kw\b|kva\b|"
        r"m3\s*/\s*h|m3\b|gpm\b|lpm\b|bhp\b|kg\s*/\s*h|lb\s*/\s*h)", re.I)

    def __init__(self, *apagar: str):
        self.apagar = set(apagar)

    @property
    def con_giro(self) -> bool:
        """B3: el giro entra al evaluador solo si B no esta apagado."""
        return "b" not in self.apagar

    def __enter__(self):
        self._terminos = dict(radar.TERMINOS_DE_TIPO)
        self._vocab = cp.PROCESOS_DEL_CLIENTE
        self._mag = cp._MAGNITUD
        if "d3" in self.apagar:
            for t in TERMINOS_DE_D3:
                radar.TERMINOS_DE_TIPO.pop(t, None)
        if "b" in self.apagar:
            # `PROCESOS_DEL_CLIENTE` es una TUPLA -- no se muta en su lugar-- asi
            # que se reemplaza el atributo del modulo, que es lo que `proceso_de`
            # lee.
            cp.PROCESOS_DEL_CLIENTE = tuple(
                (proc, PROCESO_ANTES_DE_B1_B2.get(proc, palabras))
                for proc, palabras in cp.PROCESOS_DEL_CLIENTE)
        if "d6" in self.apagar:
            # Se apaga en la RAIZ: si `magnitudes()` no lee dinero, el evaluador no
            # puede puntuarlo por ninguna via. Apagarlo solo en
            # `puntos_de_inversion` dejaria la puerta del regex abierta.
            cp._MAGNITUD = self._MAG_ANTES_DE_D6
        return self

    def __exit__(self, *a):
        radar.TERMINOS_DE_TIPO.clear()
        radar.TERMINOS_DE_TIPO.update(self._terminos)
        cp.PROCESOS_DEL_CLIENTE = self._vocab
        cp._MAGNITUD = self._mag
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
    """El puntaje de UNA cuenta en CADA etapa de la noche, y su techo.

    Las tres etapas se recalculan; ninguna esta guardada a mano. El "original" es
    lo que el evaluador de verdad decia antes del 28-sep, no lo que alguien
    recuerda que decia.
    """
    if not cuenta.get("fuente"):
        return {"empresa": cuenta["empresa"], "planta": cuenta.get("planta"),
                "hueco": True, "nota": cuenta.get("nota"),
                "que_faltaria": cuenta.get("que_faltaria")}
    etapas = {}
    for nombre, apagar, _ in ETAPAS:
        with SinMejoras(*apagar) as ctx:
            etapas[nombre] = radar.evaluar(
                _senal(cuenta, con_giro=ctx.con_giro), hoy=hoy)
    final = etapas[ETAPAS[-1][0]]
    # El TECHO con senal fresca: se lleva la frescura al maximo de la escala en vez
    # de inventar una fecha, que es lo mismo y no mete una fecha falsa en ningun
    # registro.
    techo, techo_v = final["puntaje"], final["veredicto"]
    if not cuenta.get("fecha_documentada"):
        techo = round(final["puntaje"]
                      + (radar.MAX_FRESCURA - final["desglose"]["frescura"]), 1)
        techo_v = (radar.PASA if techo >= radar.UMBRAL_PASA
                   else radar.GUARDA if techo >= radar.UMBRAL_GUARDA
                   else radar.ARCHIVA)
    return {
        "empresa": cuenta["empresa"], "planta": cuenta.get("planta"),
        "hueco": False,
        "fuente": cuenta["fuente"], "tipo": cuenta.get("tipo"),
        "fecha_documentada": bool(cuenta.get("fecha_documentada")),
        "por_etapa": {k: v["puntaje"] for k, v in etapas.items()},
        "veredicto_por_etapa": {k: v["veredicto"] for k, v in etapas.items()},
        # `antes` y `despues` se conservan con el nombre viejo -- son la primera y la
        # ultima etapa-- para no romper lo que ya los lee.
        "antes": etapas[ETAPAS[0][0]]["puntaje"],
        "antes_veredicto": etapas[ETAPAS[0][0]]["veredicto"],
        "despues": final["puntaje"], "veredicto": final["veredicto"],
        "techo_si_fresca": techo, "techo_veredicto": techo_v,
        "desglose": final["desglose"],
        "tipos_que_nombra": final["tipos_que_nombra"],
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
    por_etapa_pasan = {
        nombre: sum(1 for f in con_senal
                    if f["veredicto_por_etapa"][nombre] == radar.PASA)
        for nombre, _, _ in ETAPAS}
    return {
        "corte": d.get("corte"),
        "etapas": [{"etapa": n, "apaga": list(a), "que_es": q,
                    "pasan": por_etapa_pasan[n]} for n, a, q in ETAPAS],
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
    cols = [n for n, _, _ in ETAPAS]
    print(f"\n  LINEA BASE DEL RADAR — corte {r['corte']}")
    print(f"  {r['cuentas']} cuentas ya evaluadas · "
          f"{r['con_senal_documentada']} con senal documentada · "
          f"{len(r['huecos'])} huecos\n")
    print("  LA EVOLUCION DE LA NOCHE, cuenta por cuenta")
    print(f"  {'cuenta':24}" + "".join(f"{c:>12}" for c in cols)
          + f"{'veredicto':>10}{'techo':>7}{'fecha?':>7}")
    print("  " + "-" * (24 + 12 * len(cols) + 24))
    for f in r["filas"]:
        if f["hueco"]:
            print(f"  {_nombre(f):24}" + "".join(f"{'—':>12}" for _ in cols)
                  + f"{'HUECO':>10}")
            continue
        fecha = "si" if f["fecha_documentada"] else "NO"
        techo = "" if f["fecha_documentada"] else f"{f['techo_si_fresca']:g}"
        print(f"  {_nombre(f):24}"
              + "".join(f"{f['por_etapa'][c]:>12g}" for c in cols)
              + f"{f['veredicto']:>10}{techo:>7}{fecha:>7}")
    print("  " + "-" * (24 + 12 * len(cols) + 24))
    print(f"  {'PASAN':24}"
          + "".join(f"{e['pasan']:>12}" for e in r["etapas"])
          + f"{'de ' + str(r['con_senal_documentada']):>10}")
    print()
    for e in r["etapas"]:
        print(f"    {e['etapa']:14} {e['que_es']}")
    print()
    print(f"  Pasarian si la senal estuviera fresca: "
          f"{r['pasarian_si_la_senal_estuviera_fresca']} de "
          f"{r['con_senal_documentada']}")
    if r["huecos"]:
        print(f"  Huecos (sin senal documentada, NO se inventa): "
              f"{', '.join(r['huecos'])}")
    for c in r["control"]:
        if not c["hueco"]:
            print(f"\n  CONTROL · senal fresca documentada: "
                  + " -> ".join(f"{c['por_etapa'][k]:g}" for k in cols)
                  + f"  ({c['veredicto']})")
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
