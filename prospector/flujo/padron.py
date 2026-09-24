"""El mapa de plantas: lo que envejece lento. Y su fecha de caducidad.

QUE GUARDA, Y QUE NO
--------------------
El padron del DENUE se queda **solo con lo estructural**, que es lo que envejece
lento: establecimiento, razon social, giro/SCIAN, tamano/estrato, municipio,
ciudad, CP, y `dominio_correo`.

**`correoelec` y `telefono` estan FUERA, definitivamente.** Por dos razones que
apuntan al mismo lado:

  1. Son datos de contacto de personas, y este repo es publico. Ya causaron una
     exposicion (191 correos y 59 telefonos; ver CHANGELOG v0.4.0).
  2. **Caducan rapido.** Un correo de 2010 -y el padron trae filas con
     `fecha_alta` de 2010- no sirve para llamar hoy. El contacto fresco lo
     consigue la cascada en cada corrida, que es justo su oficio.

Lo que se queda es el MAPA: donde hay una planta, de que tamano, de que giro, y
con que dominio. Eso cambia poco de un corte al siguiente, y es lo que el metodo
necesita: la llave operativa es **dominio + ciudad + CP**.

DONDE VIVE
----------
Como **CSV limpio versionado en el repo** -`datos/padron_denue.csv`- mientras la
herramienta se pule. Es diffable: un corte contra el siguiente se compara en un
pull request. **Postgres se posterga** a proposito; el enganche esta anotado al
final de este archivo y NO esta construido.

LA CADUCIDAD, EN DOS DISPARADORES
---------------------------------
  * **Por TIEMPO** — el padron lleva su fecha de corte del INEGI y el codigo
    calcula la antiguedad. Pasado el umbral, AVISA. No frena.
  * **Por DATOS** — si una corrida topa con que el mapa no cubre lo que busca
    -una planta que ya no existe, una empresa o una zona que el padron no
    tiene-, levanta una bandera sugiriendo revisar si hace falta un corte nuevo
    o mas amplio.

Ninguno de los dos decide. Los dos avisan, y los dos apuntan al **vigilante del
DENUE** (`metodo/denue-vigilante.md`), que es la misma preocupacion vista del
otro lado: el vigilante pregunta *"cambio el archivo?"* por `ETag` y
`Last-Modified`; esto pregunta *"me esta estorbando que no haya cambiado?"*.
"""
from __future__ import annotations

import csv
import datetime as dt
import pathlib
import re
import unicodedata
from dataclasses import dataclass, field

AQUI = pathlib.Path(__file__).resolve().parent.parent
CSV_PADRON = AQUI / "datos" / "padron_denue.csv"

# Columnas de contacto. No pueden volver al CSV versionado.
PROHIBIDAS = ("correoelec", "telefono")

# ---------------------------------------------------------------- el umbral
# EL INEGI publica el DENUE dos veces al ano: los cortes medidos fueron
# `2025_11` y `2026_05` (ver el issue #9 del historial). Seis meses es
# exactamente un ciclo de publicacion.
#
# Por eso el umbral es 6: pasado ese punto **ya existe un corte mas nuevo**, y
# seguir con el viejo no es una decision, es un olvido. Antes de los 6 meses
# avisar seria ruido, porque no hay nada mas fresco que traer.
AVISO_MESES = 6

# A los 12 meses ya se saltaron DOS cortes. Sigue sin frenar -frenar una corrida
# por la edad del mapa seria peor que correrla con el mapa viejo- pero el aviso
# cambia de tono.
GRAVE_MESES = 12


class PadronInvalido(RuntimeError):
    """El CSV del padron no cumple su contrato."""


def _sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def _norm(s: str) -> str:
    s = _sin_acentos((s or "").lower())
    s = re.sub(r"\b(s\.?a\.?p\.?i\.?|s\.?a\.?|s\.?\s*de\s*r\.?l\.?|de\s*c\.?v\.?|"
               r"sofom|e\.?n\.?r\.?|cv)\b", " ", s)
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s).split())


# ------------------------------------------------------------------- banderas
@dataclass
class Bandera:
    """Un aviso. No una decision."""
    clave: str
    mensaje: str
    sugerencia: str
    grave: bool = False

    def __str__(self) -> str:
        marca = "AVISO GRAVE" if self.grave else "AVISO"
        return f"{marca} · {self.clave}: {self.mensaje}\n  -> {self.sugerencia}"


REVISAR_VIGILANTE = (
    "Correr el vigilante del DENUE (metodo/denue-vigilante.md): un GET con "
    "`Range: bytes=0-15` a la ruta estable trae `ETag` y `Last-Modified` por 16 "
    "bytes. Si cambiaron, hay corte nuevo y toca recargar el padron.")


# -------------------------------------------------------------------- el mapa
@dataclass
class Padron:
    filas: list[dict]
    corte: str                      # 'YYYY-MM', leido del CSV
    hoy: dt.date
    ruta: pathlib.Path | None = None
    banderas: list[Bandera] = field(default_factory=list)

    # --- caducidad por TIEMPO ---
    @property
    def antiguedad_meses(self) -> int:
        a, m = (int(x) for x in self.corte.split("-")[:2])
        return (self.hoy.year - a) * 12 + (self.hoy.month - m)

    @property
    def caduco(self) -> bool:
        return self.antiguedad_meses >= AVISO_MESES

    @property
    def aviso_de_tiempo(self) -> Bandera | None:
        n = self.antiguedad_meses
        if n < AVISO_MESES:
            return None
        grave = n >= GRAVE_MESES
        cortes = n // 6
        return Bandera(
            clave="PADRON_CADUCO",
            mensaje=(f"el mapa de plantas es del corte {self.corte} y hoy es "
                     f"{self.hoy:%Y-%m}: {n} meses. El INEGI publica dos cortes "
                     f"al ano, asi que probablemente ya se saltaron {cortes}."),
            sugerencia=(REVISAR_VIGILANTE + " La corrida SIGUE: un mapa viejo "
                        "ubica plantas igual, y frenar por su edad seria peor."),
            grave=grave)

    # --- cobertura, para el disparador por DATOS ---
    @property
    def entidades(self) -> set[str]:
        return {f["entidad"] for f in self.filas}

    @property
    def giros(self) -> set[str]:
        return {f["codigo_act"][:3] for f in self.filas if f["codigo_act"]}

    @property
    def operables(self) -> list[dict]:
        return [f for f in self.filas if f.get("es_punto_venta") != "si"]

    def buscar(self, empresa: str, dominio: str = "", ciudad: str = "",
               entidad: str = "") -> list[dict]:
        """Empata por dominio primero -la llave operativa- y luego por nombre.

        Nunca solo por razon social: el padron llama `HERSMEX` a Hershey y
        `COMERCIALIZADORA DE LACTEOS Y DERIVADOS` a Lala. Empatar por nombre sin
        pasar por el dominio falla callado justo en los grupos grandes.

        **La geografia no es un filtro opcional.** Si se da ciudad o entidad y
        ningun candidato coincide, la respuesta es CERO, no "los demas". Es la
        leccion de los cinco DUNS de Ragasa: cuatro en Nuevo Leon y uno en
        Jalisco, con la misma razon social. El nombre no desempata; el domicilio
        si. Devolver la fila de Monterrey cuando preguntaron por Guadalajara es
        el empate silencioso que el metodo existe para impedir.
        """
        candidatos = self.operables
        if entidad:
            en = _norm(entidad)
            candidatos = [f for f in candidatos
                          if en in _norm(f["entidad"]) or _norm(f["entidad"]) in en]
            if not candidatos:
                return []
        if ciudad:
            c = _norm(ciudad).split(",")[0].strip()
            if c:
                candidatos = [f for f in candidatos if c in _norm(f["municipio"])]
                if not candidatos:
                    return []

        if dominio:
            d = dominio.strip().lower().lstrip("@")
            hit = [f for f in candidatos if f["dominio_correo"].lower() == d]
            if hit:
                return hit
        e = _norm(empresa)
        if not e:
            return []
        return [f for f in candidatos
                if e in _norm(f["nom_estab"]) or e in _norm(f["raz_social"])
                or _norm(f["nom_estab"]) in e or _norm(f["raz_social"]) in e]


# ------------------------------------------------------------------ la carga
def cargar(ruta: str | pathlib.Path | None = None,
           hoy: dt.date | None = None) -> Padron:
    """Lee el mapa y AVISA de su edad. No frena por la edad; si frena si el CSV
    trae columnas de contacto, porque eso no es envejecimiento: es una fuga."""
    ruta = pathlib.Path(ruta or CSV_PADRON)
    if not ruta.exists():
        raise PadronInvalido(f"no hay padron en {ruta}")
    with ruta.open(encoding="utf-8") as fh:
        lector = csv.DictReader(fh)
        campos = lector.fieldnames or []
        filas = list(lector)

    fuga = [c for c in PROHIBIDAS if c in campos]
    if fuga:
        raise PadronInvalido(
            f"el padron versionado trae {fuga}. Son datos de contacto de "
            "personas y este repo es PUBLICO. Van a la copia local y a Postgres, "
            "nunca al CSV del repo. Ver CHANGELOG v0.4.0.")
    if not filas:
        raise PadronInvalido(f"{ruta} esta vacio")

    cortes = {f.get("corte_denue", "").strip() for f in filas} - {""}
    if len(cortes) != 1:
        raise PadronInvalido(
            f"el padron mezcla cortes {sorted(cortes)}. Una foto por archivo: "
            "comparar dos cortes es trabajo del vigilante, no del cargador.")
    corte = cortes.pop()
    if not re.fullmatch(r"\d{4}-\d{2}", corte):
        raise PadronInvalido(
            f"corte '{corte}' no tiene forma YYYY-MM. **Es la fecha del DATO** "
            "-la del `metadatos_denue.txt` del zip-, no la de la consulta.")

    p = Padron(filas=filas, corte=corte, hoy=hoy or dt.date.today(), ruta=ruta)
    aviso = p.aviso_de_tiempo
    if aviso:
        p.banderas.append(aviso)
    return p


# ------------------------------------------- el disparador POR DATOS
def vigilar_cobertura(p: Padron, empresa: str, dominio: str = "",
                      ciudad: str = "", entidad: str = "",
                      giro_scian: str = "",
                      evidencia_de_cierre: str = "") -> list[Bandera]:
    """Mira si el mapa alcanza para ESTA cuenta, y levanta bandera si no.

    Distingue tres cosas que se ven iguales desde afuera y no son lo mismo:

      * el padron **no cubre esa zona o ese giro** -> hace falta un corte MAS
        AMPLIO, no mas nuevo;
      * la cubre y la planta no aparece -> puede ser una planta NUEVA, y el
        padron es una foto: hace falta un corte mas NUEVO;
      * aparece, y la corrida encontro que ya no opera -> el padron trae una
        baja sin registrar.

    Confundirlas manda a descargar 32 archivos cuando lo que faltaba era una
    entidad, o a esperar el corte que no va a traer nada.
    """
    banderas: list[Bandera] = []
    hits = p.buscar(empresa, dominio, ciudad, entidad)

    if evidencia_de_cierre and hits:
        banderas.append(Bandera(
            clave="PLANTA_QUIZA_CERRADA",
            mensaje=(f"'{empresa}' esta en el corte {p.corte} y la corrida "
                     f"encontro lo contrario: {evidencia_de_cierre}"),
            sugerencia=("Marcar la fila con `vigente = false` cuando la 012 este "
                        "aplicada -una baja NO se borra, la historia sigue "
                        "valiendo- y " + REVISAR_VIGILANTE),
            grave=True))

    if hits:
        return banderas

    # No aparece. Antes de pedir un corte nuevo, ver si el padron siquiera cubre
    # esto: un corte nuevo del mismo alcance no va a traerlo.
    fuera = []
    if entidad and not any(_norm(entidad) in _norm(e) for e in p.entidades):
        fuera.append(f"la entidad '{entidad}' (el padron cubre "
                     f"{', '.join(sorted(p.entidades))})")
    if giro_scian and giro_scian[:3] not in p.giros:
        fuera.append(f"el giro SCIAN {giro_scian[:3]} (el padron cubre "
                     f"{', '.join(sorted(p.giros))})")

    if fuera:
        banderas.append(Bandera(
            clave="FUERA_DEL_ALCANCE_DEL_PADRON",
            mensaje=(f"'{empresa}' no esta, y no es que el corte sea viejo: el "
                     f"padron no cubre " + "; ".join(fuera) + "."),
            sugerencia=("Hace falta un corte MAS AMPLIO, no mas nuevo. Un corte "
                        "nuevo del mismo alcance no lo va a traer. La corrida "
                        "SIGUE sin el padron: M13 se declara `no_aplicaba` con "
                        "esta razon y la cascada arranca en M1.")))
    else:
        banderas.append(Bandera(
            clave="NO_EN_PADRON_PERO_EN_ALCANCE",
            mensaje=(f"'{empresa}' cae dentro de lo que el padron cubre y NO "
                     f"aparece en el corte {p.corte}."),
            sugerencia=(
                "Dos explicaciones, y hay que distinguirlas antes de descargar "
                "nada. (a) El empate fallo: la razon social no es la marca -el "
                "padron dice `HERSMEX` por Hershey-, asi que hay que buscar por "
                "DOMINIO antes de concluir. (b) Es una planta nueva posterior al "
                "corte. Descartada (a), toca (b): " + REVISAR_VIGILANTE)))
    return banderas


# ---------------------------------------------------------------------------
# A FUTURO — POSTERGADO A PROPOSITO. NO CONSTRUIR TODAVIA.
#
# Mientras la herramienta se pule, el mapa vive como este CSV. Cuando toque
# Postgres, el enganche va aqui y son dos funciones:
#
#     def sincronizar_con_postgres(p: Padron) -> None:
#         """Upsert del corte a `prospeccion.denue_planta`. NO IMPLEMENTADO."""
#
#     def desde_postgres(corte: str) -> Padron:
#         """Lee el corte vigente de la base en vez del CSV. NO IMPLEMENTADO."""
#
# Lo que ya esta decidido y no hay que volver a discutir:
#
#   * La migracion **012** ya separa `planta` -la identidad, a la que cuelgan
#     corridas y contactos, vive ENTRE cortes- de `denue_planta` -la foto, una
#     fila por `(id, corte)`-. Sin esa separacion, `id` como llave primaria
#     funciona con un corte y colisiona con dos.
#   * Una baja **no borra**: `planta.vigente` pasa a `false`. Es lo que la
#     bandera PLANTA_QUIZA_CERRADA va a escribir cuando exista.
#   * Un salto de estrato hacia arriba entra a `denue_cambio` con
#     `es_senal = true` y alimenta el modo senal.
#   * Las migraciones 010-013 estan escritas y **sin aplicar** en `fts-suite-db`.
#   * `correoelec` y `telefono` SI van a Postgres. Ahi es donde tienen que vivir.
# ---------------------------------------------------------------------------
