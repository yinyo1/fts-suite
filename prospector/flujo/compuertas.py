"""Las tres compuertas. Son `raise`, no parrafos.

(a) AGOTADO     un modulo no reporta dato si no llego a su criterio de agotado
(b) PRESUPUESTO bloques de 10, parar tras 3 bloques secos, repartir parejo
(c) CONFIANZA   1 sola fuente topa en SOLIDO; CONFLICTO solo si DOS chocan

La prisa no puede saltarse un raise.

------------------------------------------------------------------------------
La correccion de fondo (defecto abierto de #24)

La version anterior contaba DECLARACIONES: `EstadoModulo.suma("directorios")`
subia un entero. Para cerrar un modulo que exige tres bolsas de trabajo bastaba
llamar `suma()` tres veces con nada detras. Detenia el descuido, no la
determinacion.

Ahora el contador NO se puede tocar. Es una propiedad DERIVADA de `registros`:
una lista de `Busqueda`, y una `Busqueda` solo existe si trae consulta textual,
fuente permitida para ese modulo, y un numero de resultados -- cero incluido,
porque cero ES una respuesta.

El modelo es el que ya funcionaba en la compuerta de confianza: `n_raices` no es
un contador que alguien sube, es un hecho que se lee de las observaciones. Aqui
`directorios` no es un contador que alguien sube: es cuantos directorios
distintos hay en el registro de trabajo ejecutado.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

from .catalogo import PERMITIDAS, exigir_permitida
from .confianza import CONFIRMADO, EN_CONFLICTO, Contacto


class CompuertaCerrada(RuntimeError):
    """Un paso intento avanzar sin cumplir su condicion."""


# ------------------------------------------------------ el registro de trabajo
MIN_LARGO_CONSULTA = 3       # "odoo" o "SO11134" valen; "" y "x" no


@dataclass
class Busqueda:
    """Un trabajo EJECUTADO. La unidad de evidencia del agotado.

    Que exista esta fila es lo que hace subir un contador. No hay otra via.
    `resultados = 0` es valido y cuenta: cero resultados ES una respuesta, y
    haber preguntado bien y no encontrar nada es trabajo hecho.
    """
    modulo: str
    clave: str                  # el contador de agotado que alimenta
    consulta: str               # la consulta textual, o la lectura concreta
    fuente: str
    resultados: int
    ts: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    nota: str = ""
    # La LIGA de donde salio, cuando la hay. La ficha la necesita para que el
    # operador pueda mandarla a un tercero y que el tercero la verifique: una
    # fuente sin liga ni fecha no es una fuente, es una afirmacion. Opcional a
    # proposito -- una lectura a Odoo o al buzon no tiene URL--.
    liga: str = ""
    hallazgos: list[str] = field(default_factory=list)   # claves de contacto
    etiqueta: str | None = None   # cuando lo que distingue NO es la fuente sino
                                  # la forma de preguntar (M7: por empresa vs
                                  # por nombre, las dos contra pdf_publico)

    @property
    def via(self) -> str:
        """Que cuenta como 'distinto' para el criterio de agotado."""
        return (self.etiqueta or self.fuente).strip().lower()

    @property
    def consulta_normalizada(self) -> str:
        return " ".join(self.consulta.lower().split())

    def __post_init__(self) -> None:
        if not (self.consulta or "").strip() or len(self.consulta.strip()) < MIN_LARGO_CONSULTA:
            raise CompuertaCerrada(
                f"[{self.modulo}] busqueda sin consulta. Una busqueda sin texto "
                "no es evidencia de nada: es un contador con otro nombre. "
                "Escribe la consulta que se corrio, aunque haya dado cero.")
        if not (self.fuente or "").strip():
            raise CompuertaCerrada(
                f"[{self.modulo}] busqueda sin fuente. Sin fuente no se puede "
                "saber si son tres directorios distintos o el mismo tres veces.")
        if self.resultados is None or self.resultados < 0:
            raise CompuertaCerrada(
                f"[{self.modulo}] resultados={self.resultados}. Tiene que ser un "
                "entero >= 0. Cero es valido y cuenta; None no.")
        exigir_permitida(self.fuente)                 # <- compuerta catalogo
        permitidas = PERMITIDAS.get(self.modulo)
        if permitidas and self.fuente.strip().lower() not in permitidas:
            raise CompuertaCerrada(
                f"[{self.modulo}] la fuente '{self.fuente}' no le corresponde a "
                f"este modulo. Las suyas son: {', '.join(permitidas)}. "
                "Acreditarle a M1 una consulta de prensa infla el agotado con "
                "trabajo que no es el que la compuerta exige.")

    def a_dict(self) -> dict:
        return asdict(self)


# ------------------------------------------------------------ (b) presupuesto
TAMANO_BLOQUE = 10
BLOQUES_SECOS_PARA_PARAR = 3

# SECO = CERO ENTRADAS DE VALOR. Decision de criterio aprobada tras la corrida
# de #295.
#
# El criterio anterior -- cero ENTRADAS, de las que fueran-- no terminaba. En
# una casa de ~6,000 empleados con catorce lineas de negocio, seis direcciones y
# ocho marcas siempre queda un angulo que devuelve dos o tres nombres sin puesto
# y sin valor. La regla media SI QUEDA ALGO, y siempre queda algo. Lo que tiene
# que medir es SI QUEDA ALGO QUE VALGA.
#
# Medido en la corrida de #295: con el criterio viejo, 132 consultas y 14
# bloques sin que la regla se pronunciara una sola vez. Con este, la cascada
# cierra en el bloque 12 -- 120 consultas--.
SECO_SI_VALOR_MENOR_QUE = 1

# Se conserva para la tabla de rendimiento y para el historial de los bloques ya
# cerrados. YA NO decide la saturacion.
SECO_SI_NUEVAS_MENOR_QUE = 1


@dataclass
class Bloque:
    numero: int
    consultas: int
    nuevas: int
    # Marcadores de EVIDENCIA al cerrar el bloque: cuantas busquedas y cuantos
    # contactos llevaba la corrida en ese momento. Con ellos, `consultas` y
    # `nuevas` dejan de ser dos numeros que alguien escribe y pasan a ser dos
    # restas comprobables. Era el ULTIMO lugar del sistema donde una compuerta
    # contaba declaraciones en vez de evidencia, y se noto en la corrida real de
    # Cuprum del 24-sep-2026: a mano sume 58 consultas contra 59 registradas y
    # 50 entradas nuevas contra 46 contactos que la corrida tenia de verdad.
    busquedas_al_cerrar: int = 0
    contactos_al_cerrar: int = 0
    # Cuanto VALOR aporto el bloque, y cuanto llevaba la corrida al cerrarlo.
    # `de_valor` es la resta entre dos marcadores, igual que `nuevas`: no es un
    # numero que alguien escriba.
    de_valor: int = 0
    de_valor_al_cerrar: int = 0

    @property
    def seco(self) -> bool:
        """Seco = se pregunto EL BLOQUE COMPLETO y no entro NADA DE VALOR.

        Dos exigencias, y las dos salieron de corridas reales.

        El bloque COMPLETO: cerre un bloque de cinco consultas sin entradas y el
        sistema lo conto igual que uno de diez. Medio bloque sin hallazgos no
        dice que la veta se acabo: dice que se pregunto la mitad.

        CERO DE VALOR y no cero entradas: la corrida de #295 gasto 132 consultas
        sin que la regla se pronunciara nunca, porque siempre quedaba un angulo
        que devolvia nombres sin puesto. Un bloque que trae cinco contactos de
        los que ninguno compra ni decide NO esta alimentando la cascada: esta
        alargandola.

        Un bloque que no suma contactos pero ASCIENDE a uno viejo -- porque al
        fin aparecio su puesto-- no es seco, y no debe serlo: produjo valor.
        Por eso `de_valor` es la resta de dos marcadores y no un conteo de
        contactos nuevos.
        """
        return (self.consultas >= TAMANO_BLOQUE
                and self.de_valor < SECO_SI_VALOR_MENOR_QUE)

    @property
    def rendimiento(self) -> float:
        return self.nuevas / self.consultas if self.consultas else 0.0


@dataclass
class Presupuesto:
    tope_por_cuenta: int = 60
    bloques: list[Bloque] = field(default_factory=list)

    @property
    def gastadas(self) -> int:
        return sum(b.consultas for b in self.bloques)

    @property
    def restantes(self) -> int:
        return max(0, self.tope_por_cuenta - self.gastadas)

    @property
    def secos_al_final(self) -> int:
        n = 0
        for b in reversed(self.bloques):
            if b.seco:
                n += 1
            else:
                break
        return n

    @property
    def saturado(self) -> bool:
        return self.secos_al_final >= BLOQUES_SECOS_PARA_PARAR

    @property
    def agotado_por_tope(self) -> bool:
        return self.restantes <= 0

    def registrar(self, consultas: int, nuevas: int,
                  busquedas_al_cerrar: int = 0,
                  contactos_al_cerrar: int = 0,
                  de_valor: int = 0, de_valor_al_cerrar: int = 0) -> Bloque:
        if consultas > TAMANO_BLOQUE:
            raise CompuertaCerrada(
                f"Bloque de {consultas} consultas: el maximo es {TAMANO_BLOQUE}. "
                "Los bloques existen para medir rendimiento marginal; "
                "uno mas grande deja de medir.")
        if self.agotado_por_tope:
            raise CompuertaCerrada(
                f"Presupuesto agotado: {self.gastadas}/{self.tope_por_cuenta}. "
                "Subir el tope es una decision, no un descuido: hay que pedirla.")
        b = Bloque(numero=len(self.bloques) + 1, consultas=consultas,
                   nuevas=nuevas, busquedas_al_cerrar=busquedas_al_cerrar,
                   contactos_al_cerrar=contactos_al_cerrar,
                   de_valor=de_valor, de_valor_al_cerrar=de_valor_al_cerrar)
        self.bloques.append(b)
        return b

    @property
    def marcador(self) -> tuple[int, int, int]:
        """(busquedas, contactos, de_valor) que la corrida llevaba al cerrar el
        ultimo bloque. El punto desde el que se mide el siguiente."""
        if not self.bloques:
            return (0, 0, 0)
        u = self.bloques[-1]
        return (u.busquedas_al_cerrar, u.contactos_al_cerrar, u.de_valor_al_cerrar)

    def exigir_puede_seguir(self) -> None:
        if self.saturado:
            raise CompuertaCerrada(
                f"SATURADO: {self.secos_al_final} bloques seguidos sin UNA SOLA "
                "entrada de valor. "
                "La cascada cierra aqui; seguir es gastar sin rendimiento.")
        if self.agotado_por_tope:
            raise CompuertaCerrada(
                f"Tope alcanzado: {self.gastadas}/{self.tope_por_cuenta} consultas.")

    def reparto_parejo(self, n_cuentas: int) -> int:
        """Reparte el tope entre cuentas. Medido: repartir por orden de llegada
        costo ~17% de entradas con el mismo gasto."""
        return max(TAMANO_BLOQUE, self.tope_por_cuenta // max(1, n_cuentas))


# ---------------------------------------------------------------- (a) agotado
# Como se cuenta la evidencia de cada criterio.
POR_REGISTRO = "registros"       # cuantas busquedas hay
POR_FUENTE = "fuentes_distintas" # cuantas fuentes DISTINTAS hay
DEL_PRESUPUESTO = "presupuesto"  # lo lee del objeto Presupuesto, no de un contador

# Criterio de agotado por modulo. Es el contrato de metodo/modulos-de-contactos.md
AGOTADO = {
    "M0":  ("contactos_recorridos", 1, POR_REGISTRO,
            "recorridos los contactos de la cuenta"),
    "M0b": ("consultas", 1, POR_REGISTRO,
            "al menos una consulta por empresa"),
    "M0c": ("llamadas", 2, POR_FUENTE,
            "las DOS llamadas a search_people: por dominio y por nombre de la "
            "empresa. Cero contactos cuenta: significa que FTS no tiene historia "
            "con esa casa, y eso es una respuesta"),
    "M13": ("cortes", 1, POR_REGISTRO,
            "corte vigente cargado"),
    "M1":  ("directorios", 3, POR_FUENTE,
            "MINIMO TRES directorios DISTINTOS consultados y contrastados"),
    "M2":  ("bolsas", 3, POR_FUENTE,
            "bolsa propia + 2 agregadores, tres fuentes distintas"),
    # M3 sube a POR_FUENTE con TRES vias. Decision de criterio aprobada tras la
    # corrida de #295, y el numero que la sostiene: M3 rindio 0.62 entradas DE
    # VALOR por consulta contra 0.25 de M5 -- 2.5x-- siendo la capa barata, y
    # fue la UNICA fuente que aporto anclas. Con el criterio viejo -- "ultima
    # edicion publicada", un solo documento-- se cerraba antes de llegar al
    # organismo de normalizacion, que fue el que dio los ingenieros con nombre
    # completo y titulo en un documento oficial.
    "M3":  ("vias", 3, POR_FUENTE,
            "TRES vias distintas: camara general (CAINTRA, CLAUT), organismo de "
            "NORMALIZACION del sector, y congreso o feria. Cada una con su "
            "consulta real registrada. Son tres poblaciones distintas de "
            "documento, no tres formas de preguntar lo mismo"),
    "M12": ("notas", 1, POR_REGISTRO,
            "ultima nota relevante de 24 meses"),
    "M4":  ("combinaciones", 1, POR_REGISTRO,
            "producto completo generado (no toca red)"),
    "M5":  ("bloques_secos", BLOQUES_SECOS_PARA_PARAR, DEL_PRESUPUESTO,
            "tres bloques consecutivos secos EN EL PRESUPUESTO"),
    "M6":  ("vueltas_secas", 1, POR_REGISTRO,
            "una vuelta sin nombres nuevos"),
    "M7":  ("formas", 2, POR_FUENTE,
            "forma por empresa + forma por nombre"),
    "M8":  ("documentos", 1, POR_REGISTRO,
            "al menos un padron leido"),
    "M9":  ("consultas", 1, POR_REGISTRO,
            "al menos una consulta"),
}

# M4 no toca red, asi que su "fuente" es el propio motor y no vive en el
# catalogo por modulo. Se le permite explicitamente.
PERMITIDAS.setdefault("M4", ["patron_derivado"])


@dataclass
class EstadoModulo:
    modulo: str
    registros: list[Busqueda] = field(default_factory=list)
    cerrado: bool = False
    razon_no_agotado: str = ""
    # M5 lee los bloques REALES del presupuesto de la corrida, no un contador
    # aparte. Lo inyecta `Corrida.mod()`.
    presupuesto: Presupuesto | None = None

    # ------------------------------------------------------------- evidencia
    def registrar_busqueda(self, clave: str, consulta: str, fuente: str,
                           resultados: int, nota: str = "",
                           hallazgos: list[str] | None = None,
                           etiqueta: str | None = None,
                           liga: str = "") -> Busqueda:
        """La UNICA forma de hacer subir un contador de agotado."""
        b = Busqueda(modulo=self.modulo, clave=clave, consulta=consulta,
                     fuente=fuente, resultados=resultados, nota=nota,
                     liga=liga, hallazgos=list(hallazgos or []),
                     etiqueta=etiqueta)
        self.registros.append(b)
        return b

    def suma(self, contador: str, n: int = 1) -> None:
        """Tumba. Existia para subir un entero a mano; es el defecto de #24."""
        raise CompuertaCerrada(
            f"[{self.modulo}] `suma('{contador}')` ya no existe. Un contador de "
            "agotado no se declara: se DERIVA del registro de busquedas. "
            "Usa registrar_busqueda(clave, consulta, fuente, resultados) con la "
            "consulta que de verdad se corrio. Si dio cero, pon resultados=0: "
            "cero es una respuesta y cuenta.")

    @property
    def contadores(self) -> dict[str, int]:
        """Derivado, no almacenado. Nadie lo puede escribir."""
        out: dict[str, int] = {}
        req = AGOTADO.get(self.modulo)
        modo = req[2] if req else POR_REGISTRO
        claves = {b.clave for b in self.registros}
        if req:
            claves.add(req[0])
        for clave in claves:
            if req and clave == req[0] and modo == DEL_PRESUPUESTO:
                out[clave] = self.presupuesto.secos_al_final if self.presupuesto else 0
            elif req and clave == req[0] and modo == POR_FUENTE:
                out[clave] = len(self._vias_distintas(clave))
            else:
                out[clave] = sum(1 for b in self.registros if b.clave == clave)
        return out

    def _vias_distintas(self, clave: str) -> set[str]:
        """Vias distintas, y cada una tiene que traer su propia consulta.

        Dos registros con la MISMA consulta no son dos trabajos aunque les
        cambien la etiqueta: seria el contador vacio con un disfraz mas.
        """
        por_consulta: dict[str, str] = {}
        for b in self.registros:
            if b.clave == clave:
                por_consulta.setdefault(b.consulta_normalizada, b.via)
        return set(por_consulta.values())

    @property
    def consultas_corridas(self) -> int:
        return len(self.registros)

    @property
    def resultados_totales(self) -> int:
        return sum(b.resultados for b in self.registros)

    # --------------------------------------------------------------- compuerta
    @property
    def agotado(self) -> bool:
        if self.modulo not in AGOTADO:
            return self.cerrado
        clave, minimo, _modo, _d = AGOTADO[self.modulo]
        return self.contadores.get(clave, 0) >= minimo

    def exigir_agotado(self) -> None:
        if self.agotado:
            return
        if self.modulo not in AGOTADO:
            raise CompuertaCerrada(
                f"[{self.modulo}] sin criterio de agotado definido. "
                "Un modulo sin criterio no se puede cerrar como 'respondio': "
                "o se le define uno en AGOTADO, o se cierra con estado y razon.")
        clave, minimo, modo, desc = AGOTADO[self.modulo]
        tiene = self.contadores.get(clave, 0)
        detalle = f"Lleva {clave}={tiene}, se exigen {minimo}."
        if modo == POR_FUENTE:
            vistas = sorted(self._vias_distintas(clave))
            detalle += (f" Vias distintas en el registro: "
                        f"{', '.join(vistas) if vistas else '(ninguna)'}. "
                        f"Repetir la misma via, o repetir la misma consulta con "
                        f"otra etiqueta, no suma.")
        elif modo == DEL_PRESUPUESTO:
            p = self.presupuesto
            detalle += (f" Se lee de los bloques del presupuesto: "
                        f"{len(p.bloques) if p else 0} bloques, "
                        f"{p.secos_al_final if p else 0} secos al final. "
                        f"No hay contador aparte que subir.")
        else:
            detalle += f" Busquedas en el registro: {self.consultas_corridas}."
        raise CompuertaCerrada(
            f"[{self.modulo}] NO agotado: {desc}. {detalle} "
            "Un modulo no agotado no puede reportar dato como CONFIRMADO.")

    def a_dict(self) -> dict:
        return {
            "contadores": self.contadores,
            "cerrado": self.cerrado,
            "agotado": self.agotado,
            "consultas_corridas": self.consultas_corridas,
            "resultados_totales": self.resultados_totales,
            "registros": [b.a_dict() for b in self.registros],
        }


def techo_por_agotado(modulo_estado: EstadoModulo, nivel: str) -> str:
    """Un modulo sin agotar no produce CONFIRMADO. Su techo es SOLIDO.

    Este es el hueco que la matriz de challenge sola NO cerraba: la regla de
    cruce no puede dispararse con una fuente, y nada impedia reportar un dato
    de un modulo a medias.
    """
    from .confianza import SOLIDO
    if nivel == CONFIRMADO and not modulo_estado.agotado:
        return SOLIDO
    return nivel


# --------------------------------------------------------------- (c) confianza
def exigir_confianza(contactos: list[Contacto]) -> list[str]:
    """Revisa que ningun dato viole la regla de confianza. Devuelve avisos."""
    avisos = []
    for c in contactos:
        for campo, d in c.datos.items():
            if d.nivel == CONFIRMADO and d.n_raices < 2:
                raise CompuertaCerrada(
                    f"[{c.nombre or c.puesto}] campo '{campo}' marcado CONFIRMADO "
                    f"con {d.n_raices} raiz. Se exigen 2 de raiz distinta.")
            if d.informa_pese_al_conflicto:
                # No es un pendiente: es un dato usable con su salvedad. Mandarlo
                # a revision humana junto con los conflictos de verdad vuelve la
                # ficha una lista de tareas.
                avisos.append(
                    f"CON SALVEDAD en '{campo}' de {c.nombre or c.puesto}: "
                    f"se reporta {d.valor}. {d.disidencia}")
            elif d.nivel == EN_CONFLICTO:
                avisos.append(
                    f"CONFLICTO en '{campo}' de {c.nombre or c.puesto}: "
                    f"{d.motivo_conflicto} -> revision humana, no se elige en silencio")
    return avisos
