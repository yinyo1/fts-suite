"""ETAPA 1 de la escritura a Odoo: el archivo que Esteban sube a mano.

DECISION 6 de #305, aprobada tal como se propuso. **CERO ESCRITURAS, SIN
CREDENCIAL.** Este modulo produce un CSV que la importacion nativa de Odoo
entiende (`crm.lead`), lo revisa una persona, y esa persona lo sube. La etapa 2
-- escritura acotada por n8n-- espera OK explicito con alcance exacto, y **no usa
la credencial de Odoo que ya existe en la suite**: ese atajo es exactamente lo que
convierte "la herramienta lee Odoo" en "la herramienta escribe donde quiera" sin
que nadie lo haya decidido.

POR QUE UN CSV Y NO UNA LLAMADA: porque la etapa 1 tiene que poder validarse
SIN riesgo. Un CSV se lee, se corrige y se tira; una escritura no se deshace. Y
valida lo que importa validar primero -- la FORMA de la tarjeta, los plazos, la
cadencia-- que es donde estan los errores de criterio, no de transporte.

LAS TRES REGLAS DURAS, y las tres son de codigo aqui, no de prosa:

  1. **un correo `candidato` NO va en el campo `email_from`.** De ahi salen los
     envios de Odoo: un correo derivado de un patron puesto ahi es un rebote con
     el dominio de FTS, o peor, un correo a la persona equivocada. Va al lognote,
     con su nivel escrito.
  2. **un contacto en revision humana NO se crea como partner.** En Odoo un
     partner con nombre y puesto se ve identico venga de donde venga.
  3. **`celular personal` no existe como columna.** Nunca, por ninguna via.
"""
from __future__ import annotations
import csv
import io
import os
from datetime import date, timedelta

from .confianza import CONFIRMADO, SOLIDO, CANDIDATO
from .paquete import armar as armar_paquete, CANALES_QUE_NO_EMITE

# Los niveles cuyo correo SI puede ir al campo del que Odoo envia.
NIVELES_QUE_PUEDEN_ENVIAR = (CONFIRMADO, SOLIDO)

# Columnas del CSV, con el nombre que la importacion de Odoo espera para
# `crm.lead`. El orden es el que hace legible la revision a mano.
COLUMNAS = (
    "name", "type", "partner_name", "city", "email_from", "phone",
    "contact_name", "function", "date_deadline", "source_id", "medium_id",
    "campaign_id", "tag_ids", "description",
)

# Plazos de caducidad por tipo de senal, del §4b del diseno. RAZONADOS, NO
# MEDIDOS: se corrigen con el lazo de aprendizaje del motor 3.
DIAS_DE_CADUCIDAD = {
    "convocatoria": 30, "licitacion": 30,
    "rfq_cliente": 21,
    "correo_propio": 90,
    "expansion_odoo": 120,
    "obra_nueva": 120, "prensa_industrial": 60,
    "vacante_tecnica": 45,
    "camara": 45, "congreso": 45,
    "ip_corporativa": 21,
}
CADUCIDAD_POR_OMISION = 60


def fecha_de_caducidad(paquete: dict, hoy: date | None = None) -> str:
    """El menor de los dos relojes: el de la senal y el de la cadencia.

    Una convocatoria con fecha de cierre manda sobre cualquier plazo: **el plazo
    no lo decide FTS**. Si cierra el 30, la tarjeta caduca el 30.
    """
    hoy = hoy or date.today()
    cierre = (paquete.get("fecha_de_cierre") or
              next((s.get("fecha_de_cierre") for s in paquete.get("senal") or []
                    if isinstance(s, dict) and s.get("fecha_de_cierre")), None))
    if cierre:
        return str(cierre)[:10]
    dias = DIAS_DE_CADUCIDAD.get(
        str(paquete.get("fuente") or paquete.get("origen") or ""),
        CADUCIDAD_POR_OMISION)
    return (hoy + timedelta(days=dias)).isoformat()


def _correo_publicable(x: dict) -> tuple[str, str]:
    """(correo_para_el_campo, nota_para_el_lognote). REGLA DURA 1."""
    correo, nivel = x.get("correo"), x.get("nivel_confianza")
    if not correo:
        return ("", "")
    if nivel in NIVELES_QUE_PUEDEN_ENVIAR:
        return (correo, "")
    return ("", f"correo de nivel {nivel} NO se escribe en `email_from`: de ahi "
                f"salen los envios de Odoo y un correo derivado de un patron es "
                f"un rebote con el dominio de FTS. Queda aqui: {correo}")


def lineas(paquete: dict, hoy: date | None = None) -> list[dict]:
    """Las filas del CSV. Una por tarjeta -- y la tarjeta es de la CUENTA--.

    Una sola fila por cuenta, no una por contacto: el lead es de la planta, y los
    contactos van como texto en el lognote hasta que la etapa 2 los cree como
    partners de verdad. Crear un lead por contacto multiplicaria la cuenta en el
    embudo, que es el mismo error que multiplicar tarjetas por senal.
    """
    hoy = hoy or date.today()
    caduca = fecha_de_caducidad(paquete, hoy)
    contactos = list(paquete.get("contactos_de_valor") or [])

    # REGLA DURA 2: los de revision humana NO se proponen como partner.
    publicables = [x for x in contactos if not x.get("revision_humana")]
    en_revision = [x for x in contactos if x.get("revision_humana")]

    # El contacto que encabeza la tarjeta: el mas cercano a la decision de los
    # publicables. Si ninguno lo es, la tarjeta va sin contacto y lo dice.
    publicables.sort(key=lambda x: (x.get("cercania_decision", 100),
                                    x.get("nombre") or "zzz"))
    # LA CABEZA de la tarjeta: el mas cercano a la decision QUE ADEMAS tenga un
    # correo publicable. Se noto probando esto: ordenando solo por cercania, la
    # tarjeta encabezaba con un contacto de correo CANDIDATO y salia con
    # `email_from` vacio, aunque otro contacto tenia uno SOLIDO. La regla dura no
    # se relaja -- el candidato sigue fuera del campo-- pero la tarjeta no tiene
    # por que perder el correo que si se puede usar.
    con_correo = [x for x in publicables
                  if _correo_publicable(x)[0]]
    cabeza = (con_correo[0] if con_correo
              else publicables[0] if publicables else {})
    correo, _ = _correo_publicable(cabeza)
    # La nota del lognote se escribe por CADA contacto cuyo correo se retuvo, no
    # solo por la cabeza: si hay tres candidatos, los tres tienen que quedar
    # dichos con su nivel.
    notas_correo = [n for n in (_correo_publicable(x)[1] for x in publicables)
                    if n]

    senales = [s for s in (paquete.get("senal") or []) if s]
    def _txt(s):
        return s.get("texto", "") if isinstance(s, dict) else str(s)
    def _fec(s):
        return (s.get("fecha") or "") if isinstance(s, dict) else ""

    cuerpo = ["=== FICHA DEL MOTOR 2 (prospector) ==="]
    if paquete.get("gancho"):
        cuerpo.append(f"GANCHO: {paquete['gancho']}")
    if paquete.get("por_que_ahora"):
        cuerpo.append(f"POR QUE AHORA: {paquete['por_que_ahora']}")
    for s in senales:
        cuerpo.append(f"SENAL [{_fec(s) or 'sin fecha'}]: {_txt(s)}")
    for c in paquete.get("como_hablarles") or []:
        cuerpo.append(f"COMO HABLARLES: {c}")
    cuerpo.append("")
    cuerpo.append(f"A QUIEN BUSCAR ({len(publicables)} publicables, "
                  f"{len(en_revision)} en revision):")
    for x in publicables:
        cuerpo.append(
            f"  · {x.get('puesto') or '(sin puesto)'}"
            + (f" — {x.get('nombre')}" if x.get('nombre') else "")
            + f" — canal {x.get('canal_recomendado')} — nivel "
            f"{x.get('nivel_confianza')}"
            + (f" — correo {x.get('correo')}" if x.get("correo") else ""))
        cuerpo.append(f"      por que ese canal: {x.get('canal_por_que', '')}")
    for x in en_revision:
        cuerpo.append(
            f"  ⚠ EN REVISION HUMANA, NO SE CREA COMO PARTNER: "
            f"{x.get('puesto') or '(sin puesto)'} — "
            f"{x.get('motivo_revision') or 'sin motivo escrito'}")
    for n in notas_correo:
        cuerpo.append("")
        cuerpo.append(f"⚠ {n}")
    ch = paquete.get("chao1") or {}
    cuerpo += ["",
               f"BARRIDO: {paquete.get('consultas_gastadas')} de "
               f"{paquete.get('tope')} consultas · Chao1 "
               f"{ch.get('cobertura_pct')}% ({ch.get('veredicto')}) · cerro por: "
               f"{paquete.get('cerro_porque')}",
               f"ORIGEN: {paquete.get('origen')}"
               + (f" · angulo: {paquete.get('angulo')}"
                  if paquete.get("angulo") else ""),
               "",
               "PROHIBIDO EN ESTA TARJETA: celular personal, por ninguna via. "
               + CANALES_QUE_NO_EMITE["celular_personal"],
               "",
               "Este texto lo genero el motor 2 y lo subio una PERSONA: la "
               "herramienta no escribe en Odoo. Etapa 1 de #305."]
    if paquete.get("estado_editado_a_mano"):
        cuerpo.insert(1, "⚠⚠ EL ESTADO DE LA CORRIDA SE EDITO A MANO. Revisa "
                         "contra las fuentes antes de usar esta tarjeta.")

    etiquetas = ["prospector", f"origen:{paquete.get('origen')}",
                 f"nivel:{paquete.get('nivel')}"]
    if paquete.get("planta"):
        etiquetas.append(f"planta:{paquete['planta']}")
    if ch.get("veredicto"):
        etiquetas.append(f"chao1:{ch['veredicto']}")

    fila = {
        "name": " · ".join(x for x in (paquete.get("empresa"),
                                       paquete.get("planta")) if x),
        # TIPO `lead`, no `opportunity`: un prospecto que nunca contesto no es una
        # oportunidad perdida, nunca fue una oportunidad. Meterlo como
        # oportunidad envenena las metricas del equipo que si vende.
        "type": "lead",
        "partner_name": paquete.get("empresa") or "",
        "city": paquete.get("planta") or "",
        "email_from": correo,
        # REGLA DURA 3: no hay columna de celular, y `phone` va vacio a proposito.
        # El paquete no trae telefonos y este archivo no los inventa.
        "phone": "",
        "contact_name": cabeza.get("nombre") or "",
        "function": cabeza.get("puesto") or "",
        "date_deadline": caduca,
        "source_id": f"radar-{paquete.get('origen')}",
        "medium_id": str(paquete.get("fuente") or paquete.get("origen") or ""),
        "campaign_id": ("senal:" + (_fec(senales[0]) or "sin-fecha")
                        if senales else "sin-senal"),
        "tag_ids": ",".join(etiquetas),
        "description": "\n".join(cuerpo),
    }
    return [fila]


def a_csv(paquete: dict, hoy: date | None = None) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(COLUMNAS), extrasaction="ignore")
    w.writeheader()
    for f in lineas(paquete, hoy):
        w.writerow(f)
    return buf.getvalue()


def escribir(corrida, destino: str, hoy: date | None = None) -> dict:
    """Escribe el CSV de importacion. Devuelve la constancia de lo que hizo."""
    pq = armar_paquete(corrida)
    texto = a_csv(pq, hoy)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8-sig", newline="") as f:
        f.write(texto)
    contactos = pq.get("contactos_de_valor") or []
    en_revision = [x for x in contactos if x.get("revision_humana")]
    candidatos = [x for x in contactos
                  if x.get("correo") and x.get("nivel_confianza") == CANDIDATO]
    return {
        "archivo": destino,
        "bytes": len(texto.encode("utf-8-sig")),
        "tarjetas": 1,
        "contactos_en_el_lognote": len(contactos),
        "no_creados_por_revision": len(en_revision),
        "correos_retenidos_por_candidato": len(candidatos),
        "caduca": fecha_de_caducidad(pq, hoy),
        "escrituras_a_odoo": 0,
    }
