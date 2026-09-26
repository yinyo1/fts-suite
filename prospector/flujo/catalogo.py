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
    # M3 exige TRES vias distintas, asi que el catalogo tiene que NOMBRARLAS.
    # Con una sola etiqueta `congreso` el modulo no podria agotarse nunca por
    # fuente -- el mismo tropiezo que M2 tuvo con `vacante` en la corrida del
    # 24-sep--. Y no son tres formas de preguntar lo mismo: son tres
    # poblaciones de documento distintas.
    #
    #   camara         -- CAINTRA, CLAUT, CANACINTRA: quien preside y quien va
    #   normalizacion  -- IMEDAL y sus comites: quien firma la NORMA. Es la via
    #                     que dio los ingenieros con nombre completo y titulo en
    #                     la corrida de #295, y la que el agotado viejo nunca
    #                     alcanzaba
    #   congreso       -- programas, memorias y ferias del sector
    "M3":  ["camara", "normalizacion", "congreso"],
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


# ---------------------------------------------------------------------------
# EQUIVALENCIAS DE PUESTO ES <-> EN
#
# Aprobada por Esteban sobre #302. Cierra los 2 falsos conflictos que quedaron
# vivos en Durango: "Director General" contra "General Manager" son la MISMA
# persona con el titulo en dos idiomas, y el challenge los mandaba a revision
# humana sin nada que decidir.
#
# La tabla es CORTA Y EXPLICITA a proposito -- Esteban la aprueba y la puede
# leer de una sentada--. No es un traductor: es una lista de grupos, y dos
# valores son equivalentes SOLO si los dos estan en el mismo grupo.
#
# TRES LIMITES QUE LA TABLA NO CRUZA, y los tres son deliberados:
#
#   1. NO cruza jerarquia. `gerente de mantenimiento` y `jefe de mantenimiento`
#      quedan en grupos DISTINTOS. En la industria mexicana un gerente y un jefe
#      no son la misma posicion, y fusionarlos esconderia una diferencia real --
#      justo la que decide a quien se le manda la propuesta--. Que los dos
#      traduzcan a "maintenance manager" en ingles descuidado no los vuelve la
#      misma persona.
#   2. NO cruza funcion. `gerente de seguridad e higiene` no entra al grupo de
#      `gerente de medio ambiente`, aunque muchas empresas los junten en un EHS.
#   3. NO es sinonimo DENTRO de un idioma. `servicios generales` y
#      `facilidades` son la misma funcion en Mexico, y aun asi no estan
#      agrupados: la peticion era una tabla ES-EN, y un sinonimo intra-idioma es
#      una decision aparte que nadie ha tomado.
#
# Cada grupo empieza por el termino EN ESPANOL, y eso es funcional: es el que la
# ficha reporta -- la lee un operador mexicano-- y el ingles va en la salvedad.
EQUIVALENCIAS_DE_PUESTO = (
    # --- direccion ---
    ("director general", "general manager", "managing director"),
    ("director de planta", "plant director"),
    ("director de operaciones", "operations director",
     "chief operating officer", "coo"),
    ("director de manufactura", "manufacturing director"),
    ("director de ingenieria", "engineering director"),
    ("director de finanzas", "chief financial officer", "cfo"),
    # --- planta y produccion ---
    ("gerente de planta", "plant manager"),
    ("gerente de produccion", "production manager"),
    ("jefe de produccion", "head of production", "production chief"),
    ("gerente de manufactura", "manufacturing manager"),
    ("gerente de operaciones", "operations manager"),
    # --- mantenimiento y utilities: el terreno de FTS ---
    ("gerente de mantenimiento", "maintenance manager"),
    ("jefe de mantenimiento", "head of maintenance", "maintenance chief"),
    ("superintendente de mantenimiento", "maintenance superintendent"),
    ("supervisor de mantenimiento", "maintenance supervisor"),
    ("ingeniero de mantenimiento", "maintenance engineer"),
    ("gerente de servicios auxiliares", "utilities manager"),
    # "Gerente de Facilities" es spanglish y la industria mexicana lo dice asi todo
    # el tiempo. Entra por el DEFECTO 2 de #306: sin el, "Gerente de Facilities"
    # contra "Facilities Manager - COFICAB Americas" seguia chocando aunque el
    # sufijo de empresa ya se quitara. Y sigue siendo ES-EN: es el mismo puesto.
    #
    # ROZA LA RESTRICCION 3 Y NO LA CRUZA, y Esteban lo APROBO asi en #320: la
    # restriccion prohibe agrupar dos palabras ESPANOLAS distintas para la misma
    # funcion -- y por eso `servicios generales` sigue FUERA de la tabla--.
    # "facilities" no es otra palabra espanola: es la MISMA palabra inglesa con
    # cabeza espanola. Queda escrito aqui para que un lector futuro no lea el
    # grupo como un descuido y lo "arregle": sacarlo devuelve el caso de #306 a
    # EN_CONFLICTO, y la prueba
    # `test_RESTRICCION_3_gerente_de_facilities_es_SPANGLISH_no_un_sinonimo_ES`
    # falla a proposito si alguien lo intenta.
    ("gerente de facilidades", "gerente de facilities", "facilities manager"),
    # --- ingenieria y proyectos ---
    ("gerente de ingenieria", "engineering manager"),
    ("gerente de proyectos", "project manager"),
    ("ingeniero de proyectos", "project engineer"),
    ("ingeniero de procesos", "process engineer"),
    # --- compras ---
    ("gerente de compras", "purchasing manager", "procurement manager"),
    ("jefe de compras", "head of purchasing", "purchasing chief"),
    ("comprador", "buyer"),
    # Del mismo caso de #306. "Senior Buyer" contra "Comprador Senior" es ES-EN, y
    # NO cruza jerarquia con `comprador`: un senior buyer no es un comprador raso.
    ("comprador senior", "senior buyer"),
    ("gerente de cadena de suministro", "supply chain manager"),
    # --- calidad, EHS, soporte ---
    ("gerente de calidad", "quality manager"),
    ("gerente de seguridad e higiene", "health and safety manager"),
    ("gerente de medio ambiente", "environmental manager"),
    ("gerente de recursos humanos", "human resources manager", "hr manager"),
    ("gerente de tecnologias de la informacion", "it manager"),
)


def _plano(v: str) -> str:
    """Minusculas, sin acentos, sin espacios de sobra.

    La tabla se escribe sin acentos -- `ingenieria`-- y el dato real los trae --
    `Gerente de Ingeniería`--. Sin doblar los acentos, la mitad de la tabla en
    espanol no emparejaria nunca.
    """
    import unicodedata
    v = unicodedata.normalize("NFD", str(v or "").lower())
    v = "".join(c for c in v if unicodedata.category(c) != "Mn")
    return " ".join(v.split())


# termino plano -> indice de su grupo. Se arma una vez, al importar.
GRUPO_DE_PUESTO: dict[str, int] = {}
for _i, _grupo in enumerate(EQUIVALENCIAS_DE_PUESTO):
    for _t in _grupo:
        _p = _plano(_t)
        if _p in GRUPO_DE_PUESTO and GRUPO_DE_PUESTO[_p] != _i:
            raise AssertionError(
                f"'{_t}' esta en dos grupos de EQUIVALENCIAS_DE_PUESTO. Un "
                "termino en dos grupos los fusiona por transitividad y la tabla "
                "deja de decir lo que dice.")
        GRUPO_DE_PUESTO[_p] = _i
del _i, _grupo, _t, _p


def grupo_de_puesto(valor) -> int | None:
    """El grupo de equivalencia de este puesto, o None si no esta en la tabla."""
    return GRUPO_DE_PUESTO.get(_plano(valor))
