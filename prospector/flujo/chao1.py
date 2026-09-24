"""Chao1: estimar cuantos contactos NO se han visto todavia.

Viene de biologia de campo -estimar especies sin recorrer la selva entera-.
La intuicion: si casi todo lo que encontraste aparecio UNA sola vez, estas
raspando la superficie. Si la mayoria aparecio varias veces desde consultas
distintas, ya barriste casi todo.

Requiere `hits` por contacto: cuantas consultas distintas lo trajeron.
Ese conteo es justo lo que antes se tiraba.
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass
class Estimacion:
    observados: int
    f1: int              # vistos exactamente una vez
    f2: int              # vistos exactamente dos veces
    estimado: float      # poblacion total estimada
    no_vistos: float
    cobertura: float     # observados / estimado
    confiable: bool
    nota: str

    def a_dict(self) -> dict:
        return {
            "observados": self.observados, "f1": self.f1, "f2": self.f2,
            "estimado": round(self.estimado, 1),
            "no_vistos": round(self.no_vistos, 1),
            "cobertura_pct": round(self.cobertura * 100, 1),
            "confiable": self.confiable, "nota": self.nota,
        }


def estimar(hits: list[int]) -> Estimacion:
    """hits: cuantas consultas distintas trajeron a cada contacto."""
    hits = [h for h in hits if h > 0]
    s_obs = len(hits)
    if s_obs == 0:
        return Estimacion(0, 0, 0, 0.0, 0.0, 0.0, False, "sin observaciones")

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
        nota += " - POCO CONFIABLE (" + "; ".join(razones) + ")"

    return Estimacion(s_obs, f1, f2, estimado, no_vistos, cobertura, confiable, nota)
