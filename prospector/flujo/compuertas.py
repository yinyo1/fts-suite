"""Las tres compuertas. Son `raise`, no parrafos.

(a) AGOTADO     un modulo no reporta dato si no llego a su criterio de agotado
(b) PRESUPUESTO bloques de 10, parar tras 3 bloques secos, repartir parejo
(c) CONFIANZA   1 sola fuente topa en SOLIDO; CONFLICTO solo si DOS chocan

La prisa no puede saltarse un raise.
"""
from __future__ import annotations
from dataclasses import dataclass, field

from .confianza import CONFIRMADO, EN_CONFLICTO, Contacto


class CompuertaCerrada(RuntimeError):
    """Un paso intento avanzar sin cumplir su condicion."""


# ---------------------------------------------------------------- (a) agotado
# Criterio de agotado por modulo. Es el contrato de docs/prospeccion/modulos.
AGOTADO = {
    "M0":  ("contactos_recorridos", 1,  "recorridos los contactos de la cuenta"),
    "M0b": ("consultas", 1,             "al menos una consulta por empresa"),
    "M13": ("cortes", 1,                "corte vigente cargado"),
    "M1":  ("directorios", 3,           "MINIMO TRES directorios consultados y contrastados"),
    "M2":  ("bolsas", 3,                "bolsa propia + 2 agregadores"),
    "M3":  ("documentos", 1,            "ultima edicion publicada"),
    "M12": ("notas", 1,                 "ultima nota relevante de 24 meses"),
    "M4":  ("combinaciones", 1,         "producto completo generado (no toca red)"),
    "M5":  ("bloques_secos", 3,         "tres bloques consecutivos secos"),
    "M6":  ("vueltas_secas", 1,         "una vuelta sin nombres nuevos"),
    "M7":  ("formas", 2,                "forma por empresa + forma por nombre"),
    "M8":  ("documentos", 1,            "al menos un padron leido"),
    "M9":  ("consultas", 1,             "al menos una consulta"),
}


@dataclass
class EstadoModulo:
    modulo: str
    contadores: dict[str, int] = field(default_factory=dict)
    cerrado: bool = False
    razon_no_agotado: str = ""

    def suma(self, contador: str, n: int = 1) -> None:
        self.contadores[contador] = self.contadores.get(contador, 0) + n

    @property
    def agotado(self) -> bool:
        if self.modulo not in AGOTADO:
            return self.cerrado
        clave, minimo, _ = AGOTADO[self.modulo]
        return self.contadores.get(clave, 0) >= minimo

    def exigir_agotado(self) -> None:
        if self.agotado:
            return
        if self.modulo not in AGOTADO:
            raise CompuertaCerrada(
                f"[{self.modulo}] sin criterio de agotado definido. "
                "Un modulo sin criterio no se puede cerrar como 'respondio': "
                "o se le define uno en AGOTADO, o se cierra con estado y razon.")
        clave, minimo, desc = AGOTADO[self.modulo]
        tiene = self.contadores.get(clave, 0)
        raise CompuertaCerrada(
            f"[{self.modulo}] NO agotado: {desc}. "
            f"Lleva {clave}={tiene}, se exigen {minimo}. "
            f"Un modulo no agotado no puede reportar dato como CONFIRMADO.")


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


# ------------------------------------------------------------ (b) presupuesto
TAMANO_BLOQUE = 10
BLOQUES_SECOS_PARA_PARAR = 3
SECO_SI_NUEVAS_MENOR_QUE = 1     # un bloque es seco si trae <1 entrada nueva


@dataclass
class Bloque:
    numero: int
    consultas: int
    nuevas: int

    @property
    def seco(self) -> bool:
        return self.nuevas < SECO_SI_NUEVAS_MENOR_QUE

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

    def registrar(self, consultas: int, nuevas: int) -> Bloque:
        if consultas > TAMANO_BLOQUE:
            raise CompuertaCerrada(
                f"Bloque de {consultas} consultas: el maximo es {TAMANO_BLOQUE}. "
                "Los bloques existen para medir rendimiento marginal; "
                "uno mas grande deja de medir.")
        if self.agotado_por_tope:
            raise CompuertaCerrada(
                f"Presupuesto agotado: {self.gastadas}/{self.tope_por_cuenta}. "
                "Subir el tope es una decision, no un descuido: hay que pedirla.")
        b = Bloque(numero=len(self.bloques) + 1, consultas=consultas, nuevas=nuevas)
        self.bloques.append(b)
        return b

    def exigir_puede_seguir(self) -> None:
        if self.saturado:
            raise CompuertaCerrada(
                f"SATURADO: {self.secos_al_final} bloques secos seguidos. "
                "La cascada cierra aqui; seguir es gastar sin rendimiento.")
        if self.agotado_por_tope:
            raise CompuertaCerrada(
                f"Tope alcanzado: {self.gastadas}/{self.tope_por_cuenta} consultas.")

    def reparto_parejo(self, n_cuentas: int) -> int:
        """Reparte el tope entre cuentas. Medido: repartir por orden de llegada
        costo ~17% de entradas con el mismo gasto."""
        return max(TAMANO_BLOQUE, self.tope_por_cuenta // max(1, n_cuentas))


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
            if d.nivel == EN_CONFLICTO:
                avisos.append(
                    f"CONFLICTO en '{campo}' de {c.nombre or c.puesto}: "
                    f"{d.valores} -> revision humana, no se elige en silencio")
    return avisos
