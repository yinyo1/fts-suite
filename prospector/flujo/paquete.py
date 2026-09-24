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
            "ubicacion": x.ubicacion_respecto_a(c.ciudad),
            "modulo_origen": x.modulo_origen,
        })
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
        # --- de donde vino ---
        "origen": c.origen,
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
