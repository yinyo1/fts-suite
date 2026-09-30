"""El paquete que el motor 2 le entrega al motor 3.

La ficha es para un HUMANO -- Rissia la lee, la manda, la pega en un lognote--.
El paquete es para una MAQUINA: es lo que el motor 3 necesita para crear la
tarjeta de prospecto en el CRM de Odoo sin volver a interpretar nada.

Son dos salidas de la misma corrida y ninguna sustituye a la otra: la ficha
puede decir "quedo en revision porque el hilo no dice de que planta es" y el
paquete tiene que decir `revision_humana: true` en un campo que un flujo pueda
leer. Derivar el paquete de la ficha -- raspando el HTML-- seria volver a la
version del problema que este proyecto lleva cuatro issues cerrando.

DONDE VIVE: fuera del repo, en la carpeta de la corrida, igual que la ficha.
Lleva NOMBRES Y CORREOS de personas, asi que `salida.py` lo defiende con el
mismo raise.

EL CANAL. Cada contacto sale con el canal recomendado, derivado de la evidencia
y no de una preferencia:

  * `correo_directo`   hay relacion previa (raiz `fts_interno`) o correo literal
                       observado. Es el mas rentable y el unico que no es frio.
  * `linkedin`         hay nombre y puesto, pero el correo no esta observado.
                       Refuerzo, no primer toque.
  * `conmutador`       hay PUESTO y planta pero no nombre. Se llama a la planta y
                       se pide al puesto por su titulo.
  * `evento`           lo pone el motor 3 cuando el radar detecta que la empresa
                       estara en uno. El motor 2 no lo emite: no tiene con que.

PROHIBIDO, y no es una omision: **celular personal, nunca**. No aparece como
canal, no viaja en el paquete, y el catalogo ya rechaza la fuente que lo
recolecta (`cv_celular_masivo`). Un hallazgo suelto va a revision humana.
"""
from __future__ import annotations
import json
import os
from datetime import datetime, timezone

from .confianza import CANDIDATO, raiz_de
from .ficha import fecha_de

CORREO_DIRECTO = "correo_directo"
LINKEDIN = "linkedin"
CONMUTADOR = "conmutador"
# Los que el motor 2 NUNCA emite, y por que. Viajan en el paquete para que el
# motor 3 no los invente tampoco.
CANALES_QUE_NO_EMITE = {
    "evento": ("lo decide el motor 3 cuando el radar detecte que la empresa "
               "estara en uno. El motor 2 no tiene esa senal."),
    "celular_personal": ("PROHIBIDO. Dato personal sensible bajo la LFPDPPP; "
                         "que alguien lo haya subido a un CV no lo vuelve "
                         "material de contacto."),
}


# --------------------------------------------------------- llave de reciclaje
# El destino 2 del motor 3 -- la tarjeta archivada REABRE con su historial en vez
# de nacer de cero-- es, en palabras del diseno, "la decision de diseno mas
# importante del motor 3". Y hasta el hallazgo H4 de #325 no se podia implementar:
# el paquete emitia `llave_corrida = "Coficab/Pesqueria"`, o sea EMPRESA + ciudad,
# y el diseno dice explicitamente que la misma empresa se reconoce por
# `dominio_correo + ciudad` y NO por nombre, porque la razon social casi nunca es
# la marca -- `HERSMEX` por Hershey--.
#
# Reciclar por nombre falla en las dos direcciones, y las dos son caras:
#
#   * NO reconoce: "Coficab" y "COFICAB MX Suc Monterrey" son la misma cuenta y
#     producirian dos tarjetas. Al ano hay seis de la misma planta, nadie sabe
#     cual es la vigente, y el equipo se vuelve a presentar como si no se
#     conocieran -- que es justo lo que el destino 2 existe para evitar--.
#   * RECONOCE DE MAS: dos empresas distintas con nombre parecido se funden en una
#     tarjeta, y el historial de una contamina a la otra.
#
# EL DOMINIO TIENE QUE SER OBSERVADO. Un dominio adivinado del nombre de la
# empresa vuelve a ser la llave por nombre con un disfraz.
def dominio_de_la_cuenta(c) -> tuple[str | None, str]:
    """(dominio, por que). Solo de correos ANCLA -- observados, no derivados--."""
    conteo: dict[str, int] = {}
    for x in c.poblacion():
        d = x.datos.get("correo")
        if d is None:
            continue
        for o in d.observaciones:
            if o.sembrado or not o.es_ancla:
                continue
            valor = str(o.valor or "")
            if "@" not in valor:
                continue
            dom = valor.rsplit("@", 1)[1].strip().lower()
            if dom:
                conteo[dom] = conteo.get(dom, 0) + 1
    if not conteo:
        return (None, "ningun correo ANCLA observado en esta cuenta: no hay "
                      "dominio que no sea adivinado")
    orden = sorted(conteo.items(), key=lambda kv: (-kv[1], kv[0]))
    dom, n = orden[0]
    if len(orden) > 1:
        return (dom, f"dominio mas visto entre los correos observados ({n} de "
                     f"{sum(conteo.values())}); tambien se vieron "
                     + ", ".join(f"{d} x{k}" for d, k in orden[1:]))
    return (dom, f"unico dominio observado, en {n} correo(s) ancla")


def llave_de_reciclaje(c) -> tuple[str | None, str]:
    """La llave con la que el motor 3 reconoce "la misma cuenta" para reabrir.

    Devuelve None cuando no hay dominio observado, y eso NO es un error: es la
    respuesta correcta. Una llave inventada para no devolver None es peor que no
    tener llave, porque el motor 3 la usaria para fundir o para partir cuentas
    sin que nadie lo notara. Sin llave, la tarjeta se crea y el reciclaje se
    resuelve a mano -- y el paquete lo dice--.
    """
    dom, por_que = dominio_de_la_cuenta(c)
    if not dom:
        return (None, por_que)
    lugar = (c.ciudad or "").strip().lower() or "?"
    return (f"{dom}|{lugar}", por_que)


def canal_de(c) -> tuple[str, str]:
    """(canal, por que) para este contacto, derivado de su evidencia."""
    correo = c.datos.get("correo")
    if correo is not None:
        raices = {raiz_de(o.fuente) for o in correo.observaciones
                  if not o.sembrado}
        if "fts_interno" in raices:
            return (CORREO_DIRECTO,
                    "hay historia: su correo salio del buzon o de Odoo de FTS. "
                    "No es un primer toque frio")
        if any(o.es_ancla for o in correo.observaciones):
            return (CORREO_DIRECTO,
                    "correo literal observado, no derivado de un patron")
    if c.nombre and (c.puesto or "puesto" in c.datos):
        return (LINKEDIN,
                "hay nombre y puesto, y el correo no esta observado -- el que "
                "haya es derivado del patron--. LinkedIn como refuerzo, no como "
                "primer toque")
    if c.puesto or "puesto" in c.datos:
        return (CONMUTADOR,
                "hay puesto y planta pero no nombre: se llama a la planta y se "
                "pide al puesto por su titulo")
    return (CONMUTADOR,
            "no hay con que hacer un toque dirigido; queda el conmutador")


def _nivel_del_contacto(c) -> str:
    """El nivel de confianza que el CRM tiene que ver, sin promediar nada.

    Se reporta el del CORREO cuando lo hay -- es el campo del que depende que el
    toque llegue-- y si no, el del puesto. Promediar los niveles de los campos
    daria un numero que no corresponde a ninguna afirmacion.
    """
    for campo in ("correo", "puesto"):
        d = c.datos.get(campo)
        if d is not None and d.observaciones:
            return d.nivel
    return CANDIDATO


def armar(c) -> dict:
    """El paquete de esta corrida, listo para el motor 3."""
    est = c.completitud()
    _dom = dominio_de_la_cuenta(c)
    _llave = llave_de_reciclaje(c)
    senales = [{"texto": s, "fecha": fecha_de(s) or None} for s in c.senal]
    contactos = []
    for x in c.poblacion():
        if not x.de_valor:
            continue
        canal, por_que = canal_de(x)
        correo = x.datos.get("correo")
        contactos.append({
            "nombre": x.nombre,
            "puesto": x.puesto or (x.dato("puesto").valor
                                   if "puesto" in x.datos else None),
            "correo": correo.valor if correo is not None else None,
            "nivel_confianza": _nivel_del_contacto(x),
            "cercania_decision": x.cercania_decision,
            "sigue_en_la_casa": x.sigue_en_la_casa,
            "revision_humana": x.revision_humana,
            "motivo_revision": x.motivo_revision,
            "canal_recomendado": canal,
            "canal_por_que": por_que,
            "ubicacion": x.ubicacion_respecto_a(c.ciudad, c.alias_de_ubicacion),
            "modulo_origen": x.modulo_origen,
        })
    _limite_hay, _limite_razon = c.limite_de_fuente()
    _canal_cuenta, _canal_por_que = c.canal_de_la_cuenta()

    return {
        "version": 1,
        "emitido": datetime.now(timezone.utc).isoformat(),
        "de": "motor2_prospector",
        "para": "motor3_crm_odoo",
        # --- la cuenta ---
        "empresa": c.empresa,
        "planta": c.ciudad or None,
        "nivel": c.nivel,
        "giro": c.giro,
        "llave_corrida": c.llave,
        # La llave de RECICLAJE del destino 2, que no es la de la corrida: la de
        # la corrida lleva el nombre de la empresa y esta lleva el dominio
        # observado. Ver `llave_de_reciclaje`.
        "llave_de_reciclaje": _llave[0],
        "llave_de_reciclaje_por_que": _llave[1],
        "dominio_correo": _dom[0],
        # --- de donde vino ---
        "origen": c.origen,
        # EL EXPEDIENTE DE LA SENAL, con el puntaje y su desglose tal como el
        # evaluador los calculo. Hallazgo H1 de #325: sin esto el motor 3 cierra
        # tarjetas y no puede decirle al radar si la fuente que las origino
        # convierte o no. `fuente` y `tipo` se leen tambien sueltos porque el
        # reloj de caducidad los busca ahi.
        "senal_origen": dict(c.senal_origen),
        "fuente": (c.senal_origen or {}).get("fuente"),
        "tipo_de_senal": (c.senal_origen or {}).get("tipo"),
        "puntaje_del_evaluador": (c.senal_origen or {}).get("puntaje"),
        "angulo": c.angulo or None,
        "angulo_resuelto": c.angulo_resuelto or None,
        # --- que decir ---
        "gancho": c.gancho or None,
        "por_que_ahora": c.por_que_ahora or None,
        "como_hablarles": list(c.como_hablarles),
        "senal": senales,
        # --- a quien ---
        "contactos_de_valor": contactos,
        # --- que tan barrido quedo, para que el motor 3 sepa cuanto pesa ---
        "chao1": {"observados": est.observados,
                  "cobertura_pct": round(est.cobertura * 100, 1),
                  "veredicto": est.veredicto, "opina": est.confiable},
        "consultas_gastadas": c.presupuesto.gastadas,
        "tope": c.presupuesto.tope_por_cuenta,
        "cerro_porque": c.que_detiene_el_loop() or "no cerro todavia",
        "estado_editado_a_mano": c.editada_a_mano,
        # LIMITE DE FUENTE, y el canal que el radar recomienda POR LA CUENTA
        # (#355). Normalmente el canal es por contacto y lo deriva `canal_de` de
        # la evidencia de cada uno. La excepcion es la cuenta que el buscador
        # publico no tiene: ahi no hay contactos de los que derivar nada, y lo
        # que el motor 3 necesita saber es que esa cuenta se trabaja por Sales
        # Navigator -- no que se quedo sin gente--. Sin este dato la tarjeta
        # llega con cero contactos y parece una cuenta mala.
        "limite_de_fuente": {
            "hay": _limite_hay,
            "razon": _limite_razon,
            "canal_de_la_cuenta": _canal_cuenta or None,
            "canal_por_que": _canal_por_que or None,
        },
        # --- lo que el motor 3 NO debe inventar ---
        "canales_que_no_emite": CANALES_QUE_NO_EMITE,
        "advertencia": (
            "Este paquete es un INSUMO, no una instruccion. Los contactos con "
            "`revision_humana: true` NO se contactan sin que una persona los "
            "revise, y los de `nivel_confianza: candidato` llevan un correo "
            "DERIVADO de un patron, no observado. Escribirle a un candidato "
            "como si fuera confirmado es el error que cuesta la cuenta."),
    }


def escribir(c, destino: str) -> str:
    """Escribe el paquete. El destino lo defiende `salida.py`, igual que la ficha."""
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(armar(c), f, ensure_ascii=False, indent=2)
    return destino
