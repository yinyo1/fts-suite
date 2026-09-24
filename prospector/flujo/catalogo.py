"""Catalogo de fuentes: las permitidas y las DESCARTADAS.

Las descartadas dejan de ser una lista que hay que recordar y pasan a ser una
lista que el codigo rechaza. La razon viaja con el rechazo.
"""
from __future__ import annotations


class FuenteProhibida(RuntimeError):
    """Se intento usar una fuente descartada. Lleva la razon en el mensaje."""


DESCARTADAS = {
    "linkedin_autenticado": (
        "Viola terminos y arriesga el BANEO de la cuenta de Rissia, de la que "
        "depende el remate de todas las fichas. Ni sesion prestada, ni headless "
        "logueado, ni extension. NO reversible."),
    "linkedin_api": (
        "La API oficial / SNAP esta cerrada a nuevos socios. No hay tramite que "
        "iniciar."),
    "google_cuenta_dedicada": (
        "Google la bloquea por actividad automatizada. No es configuracion, es "
        "su deteccion. La alternativa legitima es SerpAPI o DataForSEO."),
    "uule": (
        "No funciona desde este entorno. Medido."),
    "cv_celular_masivo": (
        "Dato personal sensible bajo la LFPDPPP. Que alguien lo haya subido sin "
        "cuidado no lo vuelve material de recoleccion masiva. Un hallazgo suelto "
        "va a REVISION HUMANA, nunca a la base."),
    "lusha_filtro_industria": (
        "Devuelve basura. El resto de Lusha solo con autorizacion por corrida."),
    "vibe_senales": (
        "Solo como segunda opinion, nunca fuente unica: registro a LEGO como "
        "casa de bolsa de Hong Kong."),
    "dnb_directo": (
        "Sin contrato. Y via Odoo es la MISMA raiz que dnb.com: no confirma "
        "nada por separado."),
    "duns_como_llave": (
        "Apunta a veces a una oficina en vez de la planta (SuKarne) y Ragasa "
        "tiene cinco, uno en Jalisco. La llave operativa es "
        "dominio_correo + ciudad + CP."),
    "denue_api_token": (
        "Descartada en fase previa. El padron se recorre por descarga de corte, "
        "por entidad, no nacional."),
    "lookalikes": (
        "Amplia el universo sin criterio de valor, y el metodo ya tiene un "
        "filtro de valor explicito."),
    "google_places": (
        "No hay llave y no la va a haber por ahora. Hueco declarado, nunca "
        "simulado ni sustituido en silencio."),
    "smtp_directo": (
        "El catch-all de Microsoft 365 contesta que si a todo, incluso a "
        "buzones inventados. Un 250 OK no prueba nada."),
}

# modulo -> fuentes que le corresponden
PERMITIDAS = {
    "M0":  ["odoo"],
    "M0b": ["outlook"],
    # M0c · `search_people` de Microsoft 365. Dos vias: por DOMINIO y por NOMBRE
    # de la empresa. Son dos preguntas distintas a la misma fuente: el dominio
    # trae a quien escribio desde esa casa; el nombre trae a quien Graph asocia
    # con la marca aunque escriba desde otro dominio.
    "M0c": ["outlook_personas"],
    "M13": ["denue"],
    # `theorg` entro por la corrida de Cuprum del 24-sep-2026: un agregador de
    # ORGANIGRAMAS publicados. Es un directorio de personas como los demas -- y
    # rinde distinto, porque publica la JERARQUIA y no el correo. La compuerta de
    # catalogo rechazo la consulta por no tenerlo en la lista, que es
    # exactamente lo que debia hacer: la lista estaba incompleta y se corrige
    # aqui, no relajando la compuerta.
    "M1":  ["prospeo", "rocketreach", "leadiq", "zoominfo", "finalscout",
            "contactout", "signalhire", "aeroleads", "seamless", "clay",
            "tomba", "datanyze", "theorg"],
    # El criterio de M2 pide "bolsa propia + 2 agregadores": son TRES fuentes
    # distintas, asi que el catalogo tiene que nombrarlas. Con una sola etiqueta
    # `vacante` el modulo no podia agotarse nunca -- lo encontro la corrida de
    # Cuprum del 24-sep-2026 al intentar cerrarlo.
    "M2":  ["vacante", "vacante_propia", "vacante_indeed", "vacante_glassdoor",
            "vacante_occ", "vacante_simplyhired", "vacante_linkedin_publico",
            "vacante_computrabajo"],
    "M3":  ["congreso"],
    "M12": ["prensa"],
    "M5":  ["buscador", "linkedin_publico"],
    "M6":  ["buscador", "linkedin_publico"],
    "M7":  ["pdf_publico"],
    "M8":  ["padron_gobierno"],
    "M9":  ["aduana"],
}


def exigir_permitida(fuente: str) -> None:
    """Compuerta de catalogo. Lanza si la fuente esta descartada."""
    f = fuente.strip().lower()
    if f in DESCARTADAS:
        raise FuenteProhibida(f"Fuente descartada '{f}'. Razon: {DESCARTADAS[f]}")
