"""Arranque de una corrida con UNA instruccion, y el chequeo de listo para usar.

El problema que resuelve: hasta la v0.6.0 arrancar una cuenta eran cinco comandos
-iniciar, padron, buscar M0, buscar M0b, cerrar- y habia que acordarse del orden,
de los nombres de los contadores y de que fuente le toca a cada modulo. Sirve
para desarrollar; no sirve para usar.

Lo que NO hace, y es a proposito: **Python no busca.** No puede: buscar es
criterio -decidir si dos empresas de nombre parecido son la misma, si un puesto
compra, que titulo tecnico sale de una nota-. Lo que Python hace es quitar de
enmedio todo lo que no es criterio: resolver la cuenta en el padron, abrir la
corrida, registrar M13 con lo que el padron contesto de verdad, y **entregar el
plan con los comandos ya escritos**.

Las compuertas siguen gobernando igual. El arranque no salta ninguna.
"""
from __future__ import annotations

import os
import pathlib
import shlex
import subprocess
import sys
from dataclasses import dataclass, field

from .padron import cargar, vigilar_cobertura, Padron, Bandera

# Las fuentes que a cada paso le toca correr DE VERDAD, en el orden del metodo.
# Cada entrada es: (modulo, clave, [vias], que se busca, por que ahora)
PLAN = [
    ("M0", "contactos_recorridos", ["odoo"],
     "res.partner por nombre Y por dominio",
     "PRECEDENCIA, no rendimiento: si ya es cliente, el patron de correo es REAL "
     "y no derivado. Dos vias porque el empate por nombre solo no basta."),
    ("M0b", "consultas", ["outlook"],
     "el buzon por nombre de la cuenta y por su dominio",
     "La fuente que nadie mas tiene. En Ragasa destapo dos cotizaciones que Odoo "
     "no tenia; en Hershey, un NDA firmado. Contesta '¿hay historia?', que NO es "
     "la misma pregunta que '¿es cliente?'."),
    ("M1", "directorios", ["leadiq", "rocketreach", "contactout", "signalhire",
                           "prospeo", "zoominfo"],
     "el formato de correo de la cuenta en TRES directorios DISTINTOS",
     "Tres, no uno: con uno no hay con que contrastar, y es el hueco por el que "
     "en septiembre paso un patron al 100% que venia de una sola fuente."),
    ("M2", "bolsas", ["vacante_propia", "vacante_indeed", "vacante_occ",
                      "vacante_glassdoor", "vacante_linkedin_publico"],
     "vacantes de mantenimiento, utilities, calderas y refrigeracion",
     "No dan nombres casi nunca. Dan el VOCABULARIO de la casa: como le llaman "
     "ahi al puesto que compra. Y la bolsa propia es otra raiz que los "
     "agregadores: es la empresa hablando de si misma."),
    ("M3", "documentos", ["congreso"],
     "camaras y congresos del giro (CAINTRA, CMC, CLAUT, Supply Hub)",
     "Da puestos con nombre cuando la cuenta expone o patrocina."),
    ("M12", "notas", ["prensa"],
     "inversion, ampliacion, nueva linea, PTAR, cogeneracion, agua, vapor",
     "El ANGULO TECNICO y titulos que el diccionario no tiene. La web entrega "
     "nombres cuando hubo evento de prensa, no cuando la planta es grande. "
     "OJO con la fecha: la del DATO, no la de la consulta."),
    ("M4", "combinaciones", ["patron_derivado"],
     "el producto titulos x formas x dominios (NO toca red)",
     "Se corre DESPUES del vocabulario, nunca antes: el motor combina lo que las "
     "olas baratas cosecharon."),
    ("M5", "bloques_secos", ["buscador", "linkedin_publico"],
     "personas por puesto, en DOS formas: simple sin operador y site:linkedin",
     "La capa cara, ~60% del gasto. Se mide por bloques de 10 y para a los tres "
     "secos seguidos."),
    ("M6", "vueltas_secas", ["buscador", "linkedin_publico"],
     "individuales por nombre, para cerrar apellidos y cosechar colegas",
     "Depende de que M5 entregue nombres, y es donde un nombre de pila suelto "
     "se convierte en persona completa. Cada nombre cerrado destapa colegas "
     "del mismo area que la busqueda por puesto no trajo."),
    ("M7", "formas", ["pdf_publico"],
     "PDFs indexados, en DOS formas: por empresa y por nombre",
     "DESPUES de M6: su forma fuerte pide nombres. Y el limite de privacidad "
     "del §3.5 no se negocia."),
    ("M8", "documentos", ["padron_gobierno"], "padrones publicos del giro",
     "Refuerzo de RAIZ distinta: un padron oficial es documento_oficial, no "
     "directorio, asi que puede CONFIRMAR lo que tres directorios solo sostienen. "
     "En este entorno suele salir sin_acceso porque exige abrir la pagina."),
    ("M9", "consultas", ["aduana"], "comercio exterior",
     "Da el area de compras e importaciones cuando la planta importa insumo. "
     "Panjiva pide suscripcion y el detalle de Veritrade tambien, asi que casi "
     "siempre se declara sin_acceso: sin una medicion desde la v1.0."),
]

CIERRE = [
    ("bloque", "Registra CADA bloque de consultas que gastes: "
               "--consultas N --nuevas M. Es lo que mide el rendimiento marginal "
               "y lo que agota M5."),
    ("vuelta", "Si el paso siguiente dice LOOP, el lazo pide otra vuelta y el "
               "presupuesto lo permite. Exige un bloque nuevo desde la anterior."),
    ("challenge", "Cruza todo. Se niega si queda un modulo abierto."),
    ("ficha", "--modo limpio para Rissia, --modo procedencia para auditar."),
]


@dataclass
class Arranque:
    empresa: str
    ciudad: str = ""
    giro: str = ""
    dominio: str = ""
    entidad: str = ""
    inferido: list[str] = field(default_factory=list)
    falta: list[str] = field(default_factory=list)
    # Ambiguo NO es lo mismo que incompleto. Varias plantas de la misma cuenta
    # es una pregunta de una linea; sin geografia es una corrida mas debil que
    # aun asi sirve. Confundirlas hornea la ambiguedad en una corrida guardada.
    ambiguo: bool = False
    banderas: list[Bandera] = field(default_factory=list)
    filas_padron: list[dict] = field(default_factory=list)
    padron: Padron | None = None


def resolver(empresa: str, ciudad: str = "", giro: str = "",
             dominio: str = "", entidad: str = "") -> Arranque:
    """La empresa es lo UNICO obligatorio. Lo demas se infiere del padron.

    Si el padron no la tiene, la corrida NO falla: arranca sin mapa, se declara
    la bandera, y M13 queda `no_aplicaba` con su razon. Un prospecto fuera del
    padron sigue siendo un prospecto.
    """
    a = Arranque(empresa=empresa.strip(), ciudad=ciudad.strip(),
                 giro=giro.strip(), dominio=dominio.strip(),
                 entidad=entidad.strip())
    p = cargar()
    a.padron = p
    a.banderas = list(p.banderas)

    filas = p.buscar(a.empresa, a.dominio, a.ciudad, a.entidad)
    if len(filas) > 1 and not a.ciudad:
        # Varias plantas de la misma cuenta. NO se elige una en silencio: es el
        # caso de los cinco DUNS de Ragasa con otro disfraz.
        a.filas_padron = filas
        a.ambiguo = True
        a.falta.append(
            f"{len(filas)} plantas de '{a.empresa}' en el padron. Di en cual: " +
            " · ".join(sorted({f"{f['municipio']} (CP {f['cod_postal']})"
                               for f in filas})))
        return a

    a.filas_padron = filas
    if filas:
        f = filas[0]
        for campo, col, etiq in (("ciudad", "municipio", "ciudad"),
                                 ("giro", "codigo_act", "giro SCIAN"),
                                 ("dominio", "dominio_correo", "dominio"),
                                 ("entidad", "entidad", "entidad")):
            if not getattr(a, campo) and f.get(col):
                setattr(a, campo, f[col])
                a.inferido.append(f"{etiq} = {f[col]} (del padron, corte {p.corte})")
    a.banderas += vigilar_cobertura(p, a.empresa, a.dominio, a.ciudad,
                                    a.entidad, a.giro)
    if not a.ciudad:
        a.falta.append(
            "la ciudad. No esta en el padron y no la diste: dila en una linea "
            "-'en Monterrey'- o la corrida arranca sin geografia y el empate "
            "por nombre queda sin desempatar.")
    return a


def pregunta_de_una_linea(a: Arranque) -> str:
    """Lo unico que hace falta para arrancar. Una linea, no un formulario."""
    ciudades = sorted({f"{f['municipio']}" for f in a.filas_padron})
    return (f"{a.empresa} tiene {len(a.filas_padron)} plantas en el padron. "
            f"¿Cual? — " + " / ".join(ciudades) + "\n"
            f"  Repite con: prospecta {a.empresa} en <ciudad>")


def texto_del_plan(a: Arranque, tope: int = 60) -> str:
    """El plan, con los comandos ya escritos. Para pegar, no para recordar."""
    q = lambda s: shlex.quote(s)
    L = [f"PLAN DE LA CORRIDA · {a.empresa}"]
    if a.ciudad:
        L.append(f"  {a.ciudad}" + (f" · {a.entidad}" if a.entidad else "") +
                 (f" · SCIAN {a.giro}" if a.giro else "") +
                 (f" · {a.dominio}" if a.dominio else ""))
    if a.inferido:
        L.append("\n  INFERIDO del padron (no lo tuviste que decir):")
        L += [f"    · {x}" for x in a.inferido]
    if a.falta:
        L.append("\n  FALTA, y no frena:")
        L += [f"    ? {x}" for x in a.falta]
    if a.banderas:
        L.append("\n  BANDERAS del mapa:")
        for b in a.banderas:
            L.append("    " + str(b).replace("\n", "\n    "))

    L.append("\n" + "-" * 70)
    L.append("  Cada paso se CORRE de verdad. Si una fuente no esta disponible,")
    L.append("  se declara sin_acceso con su razon: NO se simula.")
    L.append("-" * 70)
    for i, (mod, clave, vias, que, porque) in enumerate(PLAN, 1):
        L.append(f"\n{i:>2}. {mod} · {que}")
        L.append(f"    por que ahora: {porque}")
        L.append(f"    vias validas: {', '.join(vias)}")
        L.append(f"    registrar:  prospector buscar --empresa {q(a.empresa)} "
                 f"--modulo {mod} --clave {clave} \\")
        L.append(f"                  --fuente <via> --consulta '<la consulta textual>' "
                 f"--resultados N")
        L.append(f"    cerrar:     prospector cerrar --empresa {q(a.empresa)} --modulo {mod}")
        L.append(f"    o declarar: prospector cerrar --empresa {q(a.empresa)} --modulo {mod} "
                 f"--estado sin_acceso --razon '<por que>'")
    L.append("\n" + "-" * 70)
    for cmd, nota in CIERRE:
        L.append(f"  {cmd:<10} {nota}")
    L.append("-" * 70)
    L.append(f"  Presupuesto: {tope} consultas. `siguiente` dice siempre que toca.")
    return "\n".join(L)


# ------------------------------------------------------- listo para usar
# Guarda contra recursion. `chequeo()` corre la suite en un subproceso, asi que
# llamarlo DESDE la suite recursa sin fondo: lo encontre colgando la maquina al
# escribir tests/test_arranque.py. La variable la pone el subproceso, y un
# `chequeo()` que la ve se niega a volver a correr las pruebas.
GUARDA_RECURSION = "PROSPECTOR_CHEQUEO_EN_CURSO"

# La suite tarda menos de un segundo. 300 es margen de sobra, y existe para que
# `listo` REPORTE una falla en vez de quedarse colgado esperando.
TOPE_PRUEBAS = 300


def chequeo(correr_pruebas: bool = True) -> list[tuple[str, bool | None, str]]:
    """Lo que la maquina PUEDE verificar sola. (que, ok, detalle)

    `ok = None` significa **solo Claude lo puede comprobar**: los conectores
    viven detras de MCP y desde Python no se ven. Decir que estan bien sin
    haberlos llamado seria exactamente el pecado que la herramienta persigue.

    `correr_pruebas=False` salta la suite -es lo que usa `--rapido`, y lo que
    usan las propias pruebas para no morderse la cola-.
    """
    from .salida import carpeta_de_corridas, raiz_del_repo
    out = []

    try:
        p = cargar()
        av = p.aviso_de_tiempo
        out.append(("Padron vigente",
                    not p.caduco,
                    f"corte {p.corte} · {p.antiguedad_meses} meses · "
                    f"{len(p.operables)} plantas operables" +
                    ("" if not av else f" · {av.clave}")))
    except Exception as e:
        out.append(("Padron vigente", False, f"no carga: {e}"))

    raiz = pathlib.Path(__file__).resolve().parent.parent
    if not correr_pruebas or os.environ.get(GUARDA_RECURSION):
        out.append(("Pruebas en verde", None,
                    "no se corrieron (--rapido, o llamada desde las pruebas): "
                    "correr `python3 -m pytest tests -q`"))
    else:
        try:
            r = subprocess.run([sys.executable, "-m", "pytest", "tests", "-q"],
                               cwd=raiz, capture_output=True, text=True,
                               env={**os.environ, GUARDA_RECURSION: "1"},
                               timeout=TOPE_PRUEBAS)
            ultima = (r.stdout.strip().splitlines() or [""])[-1]
            out.append(("Pruebas en verde", r.returncode == 0, ultima))
        except subprocess.TimeoutExpired:
            # Un chequeo que revienta con traza es peor que uno que reporta
            # falla: el que lo corre no sabe si el problema es la herramienta o
            # su maquina. La suite tarda <1s; 300 es una hora y media de margen.
            out.append(("Pruebas en verde", False,
                        f"NO terminaron en {TOPE_PRUEBAS}s. La suite normal "
                        "tarda menos de un segundo: algo esta colgado. Correr "
                        "`python3 -m pytest tests -q` a mano para ver donde."))
        except Exception as e:
            out.append(("Pruebas en verde", False, f"no se pudieron correr: {e}"))

    try:
        destino = carpeta_de_corridas()
        dentro = False
        try:
            destino.relative_to(raiz_del_repo())
            dentro = True
        except (ValueError, TypeError):
            pass
        out.append(("Salida FUERA del repo", not dentro, str(destino)))
    except Exception as e:
        out.append(("Salida FUERA del repo", False, str(e)))

    out.append(("Odoo vivo (M0)", None,
                "solo Claude lo comprueba: una lectura a res.partner"))
    out.append(("Outlook vivo (M0b)", None,
                "solo Claude lo comprueba: una busqueda en el buzon"))
    out.append(("WebSearch vivo", None,
                "solo Claude lo comprueba: una consulta cualquiera"))
    out.append(("WebFetch", None,
                "bloqueado por egress en este entorno (medido). M7/M8 salen "
                "sin_acceso y eso es correcto, no una falla"))
    return out
