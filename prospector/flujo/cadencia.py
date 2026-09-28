"""La cadencia multicanal del §4c, calculada en vez de descrita.

El diseno de `motor3-crm-odoo.md` §4c tiene la tabla de esperas y de toques por
canal escrita en prosa, y **nada la calculaba**. Es el mismo patron que los cinco
hallazgos de #329: una regla que el documento da por aplicada y que no tiene
codigo. Sin esto, cada quien programa los toques a ojo y la cadencia deja de ser
comparable entre cuentas -- y el lazo 3, que mide cuantos toques hacen falta antes
de que alguien conteste, compararia cadencias distintas como si fueran la misma--.

DOS RELOJES, Y MANDA EL MENOR. Lo dice el §4b: "la caducidad efectiva es el menor
de los dos relojes". Si la senal caduca en 45 dias y la cadencia necesita 3 x 7 =
21, cabe. Si la convocatoria cierra en 10 dias, la cadencia **se comprime**. Este
modulo comprime de verdad y dice cuanto comprimio, en vez de programar toques
despues de la fecha de caducidad -- que es lo que pasa cuando nadie compara los dos
relojes: la tarjeta caduca con la mitad de sus toques sin hacer--.

DIAS HABILES, no dias naturales. Un toque programado en domingo es un toque que se
hace el lunes con un dia de retraso, o que no se hace. La planta no contesta el
sabado.
"""
from __future__ import annotations
from datetime import date, timedelta

from .paquete import CONMUTADOR, CORREO_DIRECTO, LINKEDIN

EVENTO = "evento"

#: (dias de espera entre toques, cuantos toques antes de caducar). Del §4c.
#: `correo_directo` tiene DOS renglones en el diseno -- con historia y frio-- porque
#: no esperan lo mismo: a quien ya nos conoce se le puede volver a escribir en
#: cinco dias sin ser inoportuno.
ESPERA_Y_TOQUES = {
    (CORREO_DIRECTO, True): (5, 3),
    (CORREO_DIRECTO, False): (7, 3),
    (LINKEDIN, False): (10, 2),
    (CONMUTADOR, False): (7, 2),
    # El evento pone su propia fecha: un solo toque, y la fecha no la decide la
    # cadencia.
    (EVENTO, False): (0, 1),
}

#: Plazos que NO son de este modulo y se declaran para que nadie los busque aqui:
#: los de CADUCIDAD por tipo de senal viven en `importacion_odoo.py`. Son el otro
#: reloj.
PROHIBIDO = ("celular_personal",)


def espera_y_toques(canal: str, con_historia: bool = False) -> tuple[int, int]:
    if canal in PROHIBIDO:
        raise ValueError(
            f"'{canal}' no es un canal de esta herramienta y nunca lo va a ser. "
            "No aparece en ninguna cadencia, por ninguna via.")
    clave = (canal, bool(con_historia) and canal == CORREO_DIRECTO)
    if clave in ESPERA_Y_TOQUES:
        return ESPERA_Y_TOQUES[clave]
    if (canal, False) in ESPERA_Y_TOQUES:
        return ESPERA_Y_TOQUES[(canal, False)]
    raise ValueError(f"Canal '{canal}' sin cadencia declarada. Los que hay: "
                     + ", ".join(sorted({c for c, _ in ESPERA_Y_TOQUES})))


def habil(d: date) -> date:
    """El mismo dia si es habil; el siguiente lunes si cae en fin de semana.

    No se cargan los dias feriados de Mexico a proposito: seria una tabla que hay
    que mantener cada ano y que se queda vieja en silencio. Un toque programado en
    un feriado se hace el dia siguiente y el operador lo ve en su bandeja; un
    calendario de feriados de 2026 leido en 2028 es peor que no tenerlo.
    """
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def dias_habiles_despues(desde: date, n: int) -> date:
    """`n` dias HABILES despues de `desde`. Con n=0, el siguiente dia habil."""
    d = habil(desde)
    contados = 0
    while contados < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            contados += 1
    return d


def plan_de_un_contacto(canal: str, arranque: date, caduca_el: date | None = None,
                        con_historia: bool = False) -> dict:
    """Los toques de UN contacto, con su fecha, comprimidos si no caben."""
    espera, cuantos = espera_y_toques(canal, con_historia)
    toques, comprimido = [], False
    d = habil(arranque)
    for n in range(1, cuantos + 1):
        if n > 1:
            d = dias_habiles_despues(d, espera)
        if caduca_el is not None and d > caduca_el:
            # NO se programa un toque despues de la caducidad. Antes de descartarlo
            # se intenta COMPRIMIR: la senal manda sobre la cadencia, no al
            # contrario.
            comprimido = True
            break
        toques.append({"n": n, "canal": canal, "fecha": d.isoformat(),
                       "espera_desde_el_anterior": espera if n > 1 else 0})
    if comprimido and caduca_el is not None and len(toques) < cuantos:
        # Se reparten los toques que faltan en los dias habiles que quedan, en vez
        # de perderlos: "la cadencia se comprime o se salta a correo_directo".
        restan = cuantos - len(toques)
        ultima = (date.fromisoformat(toques[-1]["fecha"]) if toques
                  else habil(arranque))
        hueco = max(1, (caduca_el - ultima).days // (restan + 1))
        for n in range(len(toques) + 1, cuantos + 1):
            ultima = dias_habiles_despues(ultima, hueco)
            if ultima > caduca_el:
                break
            toques.append({"n": n, "canal": canal, "fecha": ultima.isoformat(),
                           "espera_desde_el_anterior": hueco,
                           "comprimido": True})
    return {
        "canal": canal, "con_historia": bool(con_historia),
        "espera_normal": espera, "toques_previstos": cuantos,
        "toques": toques,
        "comprimida": comprimido,
        "nota": (f"la cadencia normal ({cuantos} toques cada {espera} dias "
                 f"habiles) no cabe antes de la caducidad; se comprimio a "
                 f"{len(toques)} toque(s)" if comprimido else ""),
    }


def plan_de_la_tarjeta(contactos: list[dict], arranque: date,
                       caduca_el: date | None = None) -> dict:
    """La cadencia completa de una tarjeta, contacto por contacto.

    `contactos` lleva, por cada uno: `puesto`, `canal_recomendado`,
    `nivel_confianza` y `con_historia`. **No necesita nombres**: la cadencia se
    programa por PUESTO y canal, y quien es va en la tabla de personas.
    """
    plan, avisos = [], []
    for x in contactos:
        canal = x.get("canal_recomendado") or CONMUTADOR
        if x.get("revision_humana"):
            # Un contacto en revision humana NO entra a la cadencia. La regla dura
            # dice que no se crea como partner; programarle un toque seria la misma
            # afirmacion por otra via.
            avisos.append(
                f"{x.get('puesto') or '(sin puesto)'}: EN REVISION HUMANA, no "
                f"entra a la cadencia — {x.get('motivo_revision') or 'sin motivo'}")
            continue
        p = plan_de_un_contacto(canal, arranque, caduca_el,
                                con_historia=bool(x.get("con_historia")))
        p["puesto"] = x.get("puesto")
        p["nivel_confianza"] = x.get("nivel_confianza")
        plan.append(p)
        if p["comprimida"]:
            avisos.append(f"{x.get('puesto') or '(sin puesto)'}: {p['nota']}")
    total = sum(len(p["toques"]) for p in plan)
    return {
        "arranque": habil(arranque).isoformat(),
        "caduca_el": caduca_el.isoformat() if caduca_el else None,
        "contactos_en_cadencia": len(plan),
        "toques_totales": total,
        "ultimo_toque": max((t["fecha"] for p in plan for t in p["toques"]),
                            default=None),
        "plan": plan,
        "avisos": avisos,
    }


def actividad_de_refinar_ficha(quien: str, sube_el: date,
                               habiles: int = 3) -> dict:
    """La actividad que abre el ciclo: alguien REVISA la ficha antes de llamar.

    La fecha limite se cuenta en dias HABILES desde que el operador sube la
    tarjeta, no desde hoy: si se contara desde hoy, una tarjeta preparada un
    viernes y subida el miercoles llegaria con la fecha ya vencida.
    """
    return {
        "tipo": "Refinar ficha",
        "para": quien,
        "arranca": sube_el.isoformat(),
        "vence": dias_habiles_despues(sube_el, habiles).isoformat(),
        "habiles": habiles,
        "por_que": (f"{habiles} dias habiles contados desde que la tarjeta se "
                    "sube, no desde que se preparo: una tarjeta preparada un "
                    "viernes y subida el miercoles llegaria con la fecha ya "
                    "vencida"),
    }
