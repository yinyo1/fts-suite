"""Chao1: estimar cuantos contactos NO se han visto todavia.

Viene de biologia de campo -estimar especies sin recorrer la selva entera-.
La intuicion: si casi todo lo que encontraste aparecio UNA sola vez, estas
raspando la superficie. Si la mayoria aparecio varias veces desde consultas
distintas, ya barriste casi todo.

Requiere `hits` por contacto: cuantas consultas distintas lo trajeron.
Ese conteo es justo lo que antes se tiraba.

------------------------------------------------------------------------------
La correccion de fondo (defecto abierto de #24)

`confiable` era un booleano, y el lazo de refuerzo lo leia asi:

    if est.confiable and est.cobertura < 0.8:  -> seguir barriendo

Al principio de una corrida Chao1 NUNCA es confiable -- pocos observados, f2
chico, casi todo visto una sola vez -- asi que la condicion era falsa y el lazo
no se disparaba jamas. **"No tengo datos para opinar" se estaba leyendo como
"ya termina".** Es el error exactamente al reves: la falta de datos es la razon
mas fuerte para seguir buscando.

Ahora Chao1 emite un VEREDICTO de cuatro valores y solo UNO detiene el lazo:

    SIN_DATOS     no hay ni un contacto     -> SIGUE (obvio)
    PREMATURO     no alcanza para opinar    -> SIGUE (es lo contrario de terminar)
    FALTA_BARRER  opina, y falta gente      -> SIGUE
    SATURO        opina, y ya esta barrido  -> PARA

Quien detiene el lazo cuando Chao1 no puede opinar es el PRESUPUESTO: tres
bloques secos o el tope de la cuenta. Chao1 solo puede terminarlo antes.
"""
from __future__ import annotations
from dataclasses import dataclass

SIN_DATOS = "sin_datos"
PREMATURO = "prematuro"
FALTA_BARRER = "falta_barrer"
SATURO = "saturo"
# El TERCER caso del desempate, aprobado sobre #302. No es un veredicto que
# `estimar` pueda emitir -- no depende de los hits sino de los BLOQUES-- asi que
# lo resuelve `Corrida.desempate()`. Vive aqui porque es del mismo vocabulario.
#
# Es el caso en que las dos compuertas tienen razon A LA VEZ: Chao1 opina y dice
# que falta ~40% de la poblacion, y tres bloques seguidos dicen que estas
# consultas ya no la traen. Las dos son ciertas: LA POBLACION NO ESTA AGOTADA,
# PERO ESTA FORMA DE PREGUNTAR SI. Ni parar ni renovar tope: cambiar de via.
CAMBIAR_DE_VIA = "cambiar_de_via"

UMBRAL_SATURACION = 0.8     # cobertura estimada a partir de la cual esta barrido


@dataclass
class Estimacion:
    observados: int
    f1: int              # vistos exactamente una vez
    f2: int              # vistos exactamente dos veces
    estimado: float      # poblacion total estimada
    no_vistos: float
    cobertura: float     # observados / estimado
    confiable: bool      # = opina. Con f2<3 NO opina: el divisor 2*f2 vale 2
    nota: str
    veredicto: str = PREMATURO
    razones: tuple = ()

    @property
    def opina(self) -> bool:
        """Si la estimacion alcanza para sacar una conclusion."""
        return self.confiable

    @property
    def detiene_el_loop(self) -> bool:
        """SOLO 'saturo' detiene. Los otros tres mandan seguir.

        Esta es la linea que arregla el defecto: `not opina` NO detiene.
        """
        return self.veredicto == SATURO

    @property
    def por_que(self) -> str:
        return {
            SIN_DATOS: "sin un solo contacto: la cascada no ha empezado",
            # CORREGIDA sobre #302. Decia "eso manda SEGUIR, no terminar", y
            # eso era leer un "no se" como un "sigue". `prematuro` NO MANDA
            # NADA: con 5 observados y f2=1 Chao1 no tiene denominador, y quien
            # decide entonces es el presupuesto. Tratar la falta de datos como
            # una instruccion de seguir es el mismo error que imprimir una liga
            # sin comprobar como si abriera.
            PREMATURO: "Chao1 todavia no tiene datos para opinar: NO OPINA, "
                       "ni para seguir ni para parar. Decide el presupuesto",
            FALTA_BARRER: "Chao1 opina y dice que falta gente por encontrar",
            SATURO: "Chao1 opina y dice que ya esta barrido",
        }[self.veredicto]

    def a_dict(self) -> dict:
        return {
            "observados": self.observados, "f1": self.f1, "f2": self.f2,
            "estimado": round(self.estimado, 1),
            "no_vistos": round(self.no_vistos, 1),
            "cobertura_pct": round(self.cobertura * 100, 1),
            "confiable": self.confiable, "opina": self.opina,
            "veredicto": self.veredicto,
            "detiene_el_loop": self.detiene_el_loop,
            "por_que": self.por_que,
            "razones": list(self.razones),
            "nota": self.nota,
        }


def estimar(hits: list[int]) -> Estimacion:
    """hits: cuantas consultas distintas trajeron a cada contacto."""
    hits = [h for h in hits if h > 0]
    s_obs = len(hits)
    if s_obs == 0:
        return Estimacion(0, 0, 0, 0.0, 0.0, 0.0, False, "sin observaciones",
                          veredicto=SIN_DATOS,
                          razones=("no hay ni un contacto observado",))

    f1 = sum(1 for h in hits if h == 1)
    f2 = sum(1 for h in hits if h == 2)

    if f2 > 0:
        no_vistos = (f1 * f1) / (2 * f2)
        nota = "Chao1 clasico"
    else:
        # correccion de sesgo cuando nadie aparecio exactamente dos veces
        no_vistos = f1 * (f1 - 1) / 2
        nota = "Chao1 corregido por sesgo (f2=0)"

    estimado = s_obs + no_vistos
    cobertura = s_obs / estimado if estimado else 1.0

    # Con pocos datos, con f2 muy chico o con casi todo visto una sola vez, la
    # estimacion es ruido. Medido en la corrida real de Cuprum (24-sep-2026):
    # 16 observados con f1=14 y f2=1 daban 114 estimados. El divisor 2*f2 vale
    # 2, asi que el numero lo decide UN contacto. La version anterior marcaba
    # eso como confiable.
    proporcion_unicos = f1 / s_obs if s_obs else 1.0
    razones = []
    if s_obs < 10:
        razones.append("menos de 10 contactos")
    if f2 < 3:
        razones.append(f"f2={f2}: con tan pocos vistos dos veces, un solo "
                       "contacto mueve la estimacion entera")
    if proporcion_unicos > 0.8:
        razones.append(f"{proporcion_unicos:.0%} aparecio una sola vez: "
                       "la cascada apenas empezo")
    confiable = not razones
    if razones:
        nota += " - NO OPINA TODAVIA (" + "; ".join(razones) + ")"

    if not confiable:
        # NO es "ya termina". Es "no se todavia", y eso manda seguir.
        veredicto = PREMATURO
    elif cobertura < UMBRAL_SATURACION:
        veredicto = FALTA_BARRER
    else:
        veredicto = SATURO

    return Estimacion(s_obs, f1, f2, estimado, no_vistos, cobertura, confiable,
                      nota, veredicto=veredicto, razones=tuple(razones))
