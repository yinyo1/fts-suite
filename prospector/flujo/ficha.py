"""Genera LA ficha. Una sola, con dos capas.

EL LECTOR REAL, que es lo que este modulo entendio tarde (#322). La ficha la
usan cuatro personas para dos cosas distintas:

    Rissia y Pablo    para LLAMAR. Quieren a quien buscar, con que abrir, y que
                      no decir. Nada mas.
    Esteban y Pablo   para AUDITAR. Quieren de donde salio cada dato.

Hasta esta version la ficha estaba escrita para el segundo par y se le entregaba
al primero. Medido en la ficha de Pesqueria: antes de llegar a un solo contacto,
Rissia leia "En conflicto — 5", "No son de esta planta — 15", codigos M0b/M5/M13,
N1/N2/N3, Chao1 y FALTA_BARRER. Para quien construyo la herramienta eso es
transparencia. Para quien va a llamar es ruido que la hace dudar de la ficha
antes de llegar a lo util -- y los cinco contactos que si valian estaban
escondidos en "conflicto" por variantes de redaccion--.

    CAPA LIMPIA     visible al abrir, en orden de lectura de vendedora, con
                    CERO vocabulario interno. Cuando hay que nombrar una fuente
                    se nombra en castellano: "el padron del DENUE", "el buzon de
                    FTS", "Sales Navigator".
    CAPA TECNICA    un <details> CERRADO al final. Ahi si van Chao1, los
                    modulos, los estados y las 61 busquedas: es la procedencia,
                    y quien audita la abre.

LA HONESTIDAD NO SE MUEVE DE CAPA. Lo que esta por confirmar, lo probable y lo
que no tiene fecha siguen visibles ARRIBA, dicho como lo diria una persona. Lo
que baja a la pestana es de DONDE salio, no QUE TAN seguro es. Una ficha limpia
que parece completa y no lo esta es peor que una con avisos.

Reglas que este modulo hace cumplir y que la plantilla sola no puede:
 - un contacto en `revision_humana` SI se imprime en limpio, en "Por confirmar",
   con la razon en una linea (#306 D3: esconderlos dejo una ficha sin nadie);
 - un contacto que YA NO ESTA en la casa no se imprime: no le falta una
   comprobacion, la persona se fue;
 - un dato EN_CONFLICTO no muestra valor: dice que dos fuentes no coinciden;
 - cada senal va con LA FECHA que su texto trae, o marcada sin fecha y con la
   instruccion de confirmar el ano antes de citarlo;
 - el AVISO ROJO sale solo cuando hay algo que puede hacer quedar mal a quien
   llama -- del registro de historia declarada y del challenge del gancho--;
   si no hay nada, el bloque no se imprime;
 - los tres textos de criterio -- gancho, por que ahora, como hablarles-- que el
   codigo no puede derivar salen como HUECO DECLARADO cuando faltan, con el
   comando que los llena.

El documento es .html AUTOCONTENIDO -- doctype, `<html>`, `<meta charset>`--.
Hasta la v0.9.0 era un fragmento con extension .html y los acentos se rompian en
cuanto el archivo salia del navegador que lo genero. Lo destapo la primera
corrida real de un operador (Coficab, #268).

EL SEGUNDO HTML DEJO DE EXISTIR. La capa tecnica reemplaza a `modo procedencia`
como documento: dos archivos que hay que abrir en orden era una manera de que
nadie abriera el segundo. El JSON de auditoria se queda -- lo lee una maquina sin
ambiguedad-- y `modo_procedencia()` sigue siendo su fuente.
"""
from __future__ import annotations
import html
import re

from .confianza import CONFIRMADO, DESMENTIDO, EN_CONFLICTO, SOLIDO, CANDIDATO, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO
from .confianza import puesto_nunca_decisor
from .estado import Corrida, RESPONDIO, PENDIENTE
from .catalogo_proyectos import plano as _plano
from .sello import sello
from .ubicacion_de_proyectos import (carta_de_presentacion, HISTORIA_AQUI,
                                     HISTORIA_EN_OTRA_PLANTA,
                                     SIN_HISTORIA_DECLARADA)

CHIP = {CONFIRMADO: "CONF", SOLIDO: "SOL", CANDIDATO: "CAND", EN_CONFLICTO: "CONFLICTO"}

# ---------------------------------------------------------------- vocabulario
# El UNICO lugar donde se decide como se dice cada cosa en castellano. Si la capa
# limpia va a hablar de una fuente, la nombra desde aqui.
FUENTE_EN_CASTELLANO = {
    "M0": "el historial de ventas de FTS",
    "M0b": "el buzon de FTS",
    "M0c": "los correos que esa empresa ya nos mando",
    "M13": "el padron del DENUE",
    "M1": "los directorios de contactos",
    "M2": "las vacantes que publica la empresa",
    "M3": "camaras, congresos y organismos de normalizacion",
    "M12": "la prensa",
    "M4": "combinaciones de puestos y formas de correo",
    "M5": "busqueda de personas en la web",
    "M6": "busqueda por nombre de cada persona",
    "M7": "PDFs y documentos publicos",
    "M8": "padrones oficiales de gobierno",
    "M9": "registros de comercio exterior",
}

# Por que NO se pudo revisar, en lenguaje de persona. "M7 sin_acceso" no le dice
# nada a quien llama; "PDFs y padrones oficiales: el entorno no deja abrirlos" si.
POR_QUE_NO_SE_PUDO = {
    "sin_acceso": "el entorno no deja abrirlos",
    "fallo": "la fuente no respondio",
    "omitida_por_costo": "se dejo fuera para no gastar el presupuesto de la corrida",
    "no_aplicaba": "no aplica para esta cuenta",
    "pendiente": "no se alcanzo a revisar en esta corrida",
}

# Tipo de interlocutor, por vocabulario EXPLICITO. Es el mismo criterio del
# catalogo de proyectos: una lista que Esteban puede leer y corregir, y lo que no
# clasifica cae en "otros" en vez de en el cajon mas parecido.
# QUIEN ES QUIEN, y desde #346 tambien QUE CUENTA COMO DE VALOR.
#
# La planilla de una corrida HUMANA con Sales Navigator -- 68 personas en 10
# cuentas, una semana de trabajo-- se uso como respuesta correcta externa, y midio
# que este vocabulario dejaba fuera titulos que de verdad compran:
#
#   Capex Control Leader · Jefe de compras MRO y Capex · CAPEX Global Procurement
#   Director · Portfolio Manager | Strategic CAPEX Leader   <- CAPEX no existia
#   Sr. Regional RME Manager · Reliability and Maintenance Engineering Manager
#                                                           <- RME no existia
#   Ingeniero de proyecto · Comprador de proyecto           <- solo estaba el plural
#   Operation Manager · Operations Head                     <- solo "operations manager"
#   Strategic sourcing specialist                           <- "sourcing" no existia
#   Gerente de Produccion                                   <- produccion no existia
#
# DOS de los tres que RESPONDIERON en esa corrida traen CAPEX o RME en el titulo.
# El vocabulario que no los reconocia estaba mandando a contexto justo a los que
# contestan.
#
# Las siglas de una sola palabra -- "ceo", "coo", "rme", "mro"-- se comparan CON
# FRONTERA: "coo" se comia "COOrdinador" y metia a un coordinador de ingenieria en
# el grupo de direccion. Misma leccion que B6 en la lista negra.
INTERLOCUTOR = (
    ("mantenimiento", "Mantenimiento y servicios de planta",
     ("mantenimiento", "maintenance", "facilities", "facilidades", "utilities",
      "servicios auxiliares", "servicios generales", "ehs", "seguridad",
      "higiene", "medio ambiente", "ambiental",
      # #346: el vocabulario de la casa, medido en la planilla.
      "reliability", "confiabilidad", "rme", "asset management",
      "activos", "superintendente", "superintendent")),
    ("compras", "Compras y abastecimiento",
     ("compras", "purchasing", "procurement", "comprador", "buyer",
      "abastecimiento", "supply chain", "cadena de suministro",
      # #346: CAPEX y MRO son COMO SE LLAMA el presupuesto que FTS persigue, y no
      # estaban. Tampoco "sourcing", que es la palabra de las plantas globales.
      "capex", "mro", "sourcing", "categoria", "category", "commodity")),
    ("direccion", "Direccion y planta",
     ("director", "gerente de planta", "plant manager", "gerente general",
      "gerente de operaciones", "operations manager", "operation manager",
      "operations head", "lider de operaciones", "jefe de operaciones",
      "gerente de produccion", "produccion", "production",
      "chief", "ceo", "coo")),
    ("ingenieria", "Ingenieria y proyectos",
     ("ingenieria", "ingeniero", "engineering", "engineer",
      "proyectos", "proyecto", "project", "procesos",
      "process", "control", "automatizacion")),
)

#: Siglas que se comparan COMO PALABRA. Sin esto "coo" pega dentro de
#: "coordinador" y "mro" dentro de cualquier cosa; con esto, solo cuando el titulo
#: de verdad las dice.
SIGLAS_CON_FRONTERA = ("ceo", "coo", "cfo", "rme", "mro", "ehs", "capex")

# Frases con las que una ficha se atribuye trabajo EN la planta que prospecta.

NIVEL_FICHA = {N1_CONFIRMADO: "N1", N2_PARCIAL: "N2", N3_PUESTO: "N3"}


def checklist_validaciones(c: Corrida) -> list[dict]:
    """Lo que NO se pudo hacer, declarado. Una corrida con limites de entorno
    entrega ficha con huecos marcados; no falla."""
    filas = []
    for clave, _t, modulos in __import__("flujo.estado", fromlist=["OLAS"]).OLAS:
        for m in modulos:
            cob = c.cobertura.get(m, {"estado": PENDIENTE, "razon": ""})
            filas.append({"modulo": m, "estado": cob["estado"], "razon": cob["razon"],
                          "agotado": c.mod(m).agotado})
    # Y una validacion que no es de cobertura sino de VERACIDAD: si el registro
    # declarado dice que esta planta es fria y el gancho afirma trabajo previo
    # AQUI, el checklist lo marca. Es el error de #310, y es el unico de la ficha
    # que no cuesta una consulta: cuesta la cuenta.
    hist = c.historia()
    if hist["veredicto"] == HISTORIA_EN_OTRA_PLANTA:
        texto = " ".join([c.gancho or "", c.por_que_ahora or ""]
                         + list(c.como_hablarles or []))
        if _afirma_trabajo_aqui(texto):
            filas.append({
                "modulo": "HISTORIA", "estado": EN_CONFLICTO,
                "razon": ("El gancho afirma trabajo previo EN ESTA PLANTA y el "
                          "registro declarado dice que los proyectos de esta "
                          f"cuenta fueron en {', '.join(hist['plantas'])}. "
                          "Corrigelo antes de mandarla: la afirmacion se cae en "
                          "la primera llamada."),
                "agotado": False})
    return filas


# Frases con las que una ficha se atribuye trabajo EN la planta que prospecta.
# Deliberadamente CORTA y textual: no es un clasificador, es una lista que
# Esteban puede leer y corregir -- el mismo criterio del catalogo de proyectos--.
_AFIRMA_AQUI = (
    "en su planta", "en esta planta", "en su instalacion", "en sus instalaciones",
    "ya trabajamos con ustedes", "ya les hemos trabajado", "su planta ya",
    "trabajamos en su sitio",
)


def _afirma_trabajo_aqui(texto: str) -> bool:
    t = " ".join(str(texto or "").lower().split())
    return any(f in t for f in _AFIRMA_AQUI)


# ------------------------------------------------------------------ utilerias
# Fecha suelta dentro de un texto de senal, en las formas que la corrida escribe:
# "ene-2026", "9-oct-2025", "2026-09-24", "agosto de 2022", "mar-2025".
_MESES = ("ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic")
# Las formas van de la MAS precisa a la MENOS: el regex alterna, y si la parcial
# fuera primero se comeria el ano de una fecha completa.
#
# B3 de #300: `AAAA-MM` y `AAAA` solos no se reconocian, asi que la senal de
# oct-2024 de Silao y la de 2018 de Juarez salian "sin fecha en el registro"
# aunque la traen escrita. Esa marca existe para que una senal vieja NO se lea
# fresca; no reconocer la fecha parcial ESCONDE la antiguedad, que es lo
# contrario de su proposito. Se acepta y se imprime tal cual: '2024-10' dice
# menos que '2024-10-15' y dice muchisimo mas que nada.
_FECHA = re.compile(
    r"(\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}[ -](?:%s)[a-z]*[ -]\d{4}"
    r"|(?:%s)[a-z]*[ -]\d{4}"
    r"|(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre"
    r"|noviembre|diciembre)\s+(?:de\s+)?\d{4}"
    r"|\d{4}-(?:0[1-9]|1[0-2])"
    r"|(?<![\d./-])(?:19|20)\d{2}(?![\d./-]))" % (_MESES, _MESES), re.I)


def fecha_de(texto: str) -> str:
    """La fecha que el texto de la senal trae escrita, si trae alguna.

    No se inventa ninguna. Una senal sin fecha se marca como tal: la leccion mas
    cara de la corrida de #295 fue un programa de inversion de 2022 que, sin la
    fecha al lado, se leia como noticia fresca.
    """
    m = _FECHA.search(texto or "")
    return m.group(1) if m else ""


def _correo_visible(x) -> tuple[str, str, str]:
    """(texto, etiqueta, chip) del correo de la persona, o de su patron.

    Devuelve el correo LITERAL si lo hay; si no, el patron de la cuenta, que para
    un puesto sin persona es justo lo accionable -- etiquetado como patron y no
    como direccion, porque no lo es: es la forma, no el buzon--.
    """
    d = x.datos.get("correo")
    etiqueta = ""
    if d is None:
        d = x.datos.get("patron_correo")
        etiqueta = "patron · "
    if d is None:
        return ("", "", "")
    if d.nivel == EN_CONFLICTO:
        return (f"EN CONFLICTO — {d.motivo_conflicto}", "", "CONFLICTO")
    return (f"{etiqueta}{d.valor or ''}", d.disidencia, CHIP.get(d.nivel, "?"))


def _planta_de(x) -> str:
    """En que planta esta. El operador trabaja por planta, no por empresa."""
    for campo in ("planta", "ciudad", "entidad"):
        d = x.datos.get(campo)
        if d is not None and d.nivel != EN_CONFLICTO and d.valor:
            return str(d.valor)
        # EL DESMENTIDO VA ANTES QUE TODO, incluso antes del conflicto. Sin esta
    # comprobacion un correo que REBOTO caia al respaldo del final y salia como
    # "correo probable — confirmalo en la primera llamada", que es al reves de lo
    # que pasa: ya se confirmo, y lo que se confirmo es que esta mal. Es la misma
    # trampa de orden que escondio el conflicto detras de "sin correo" (#323),
    # y aqui seria peor: la ficha estaria invitando a usar un buzon que ya reboto.
    if d is not None and d.nivel == DESMENTIDO:
        ultimo = d.desmentidos[-1]
        que = {"rebote": "este correo REBOTO cuando se le escribio",
               "persona_equivocada": "se escribio a este correo y contesto quien "
                                     "no era",
               "ya_no_trabaja_aqui": "esta persona ya no trabaja aqui"}.get(
                   ultimo.get("que_paso"), "se intento usar este dato y no sirvio")
        cuando = f" ({ultimo['fecha']})" if ultimo.get("fecha") else ""
        return ("", f"NO LO USES: {que}{cuando}. "
                + (f"{ultimo['detalle']}. " if ultimo.get("detalle") else "")
                + "Hay que conseguir el correo de nuevo, por conmutador o "
                  "preguntandole a quien si contesta", "flag")
    if d is not None and d.nivel == EN_CONFLICTO:
            return "en conflicto"
    return ""


def busquedas_sales_navigator(c: Corrida) -> list[str]:
    """Las busquedas que el operador pega en Sales Navigator.

    Se DERIVAN de los puestos que la corrida encontro de valor y del vocabulario
    que recogio, no se piden: el operador ya hizo el trabajo de encontrarlos y
    volver a escribirlos a mano es donde se pierde media hora y se cuelan
    errores de dedo.
    """
    puestos = []
    for x in sorted(c.contactos, key=lambda y: y.cercania_decision):
        if not x.de_valor or not x.puesto:
            continue
        p = x.puesto.split(",")[0].split("(")[0].strip()
        if p and p not in puestos:
            puestos.append(p)
    salidas = []
    if puestos:
        titulos = " OR ".join(f'"{p}"' for p in puestos[:8])
        salidas.append(f'Empresa "{c.empresa}" · Cargo actual: {titulos}')
        if c.ciudad:
            salidas.append(f'Empresa "{c.empresa}" · Geografia "{c.ciudad}" · '
                           f'Cargo actual: {titulos}')
    # El vocabulario de la casa rinde donde el titulo genérico no: es lo que la
    # cuenta se llama a si misma.
    voc = [v for v in c.vocabulario if len(v) > 3][:6]
    if voc:
        salidas.append(f'Empresa "{c.empresa}" · Palabras clave: '
                       + " OR ".join(f'"{v}"' for v in voc))
    if not salidas:
        salidas.append("(sin puestos de valor ni vocabulario registrados: no hay "
                       "busqueda que derivar todavia)")
    return salidas


def _correo_en_palabras(x) -> tuple[str, str, str]:
    """(correo, como_se_dice, clase). Sin una sola sigla.

    El chip "CONF / SOL / CAND" no significa nada para quien llama, y "CANDIDATO"
    suena a que el correo esta mal cuando lo que dice es que la FORMA esta
    confirmada y el buzon de esa persona no. Eso se explica, no se abrevia.
    """
    d = x.datos.get("correo")
    es_patron = False
    if d is None:
        d = x.datos.get("patron_correo")
        es_patron = True
    # EL CONFLICTO SE PREGUNTA PRIMERO, y el orden no es cosmetico: un dato en
    # conflicto no expone `valor` -- a proposito, para no elegir en silencio-- asi
    # que preguntar por el valor antes reportaba "sin correo" y **escondia el
    # conflicto**. Decir "no hay" cuando lo que hay es un desacuerdo entre fuentes
    # es la clase de silencio que este rediseno existe para no cometer.
    # EL DESMENTIDO VA ANTES QUE TODO, incluso antes del conflicto. Sin esta
    # comprobacion un correo que REBOTO caia al respaldo del final y salia como
    # "correo probable — confirmalo en la primera llamada", que es al reves de lo
    # que pasa: ya se confirmo, y lo que se confirmo es que esta mal. Es la misma
    # trampa de orden que escondio el conflicto detras de "sin correo" (#323),
    # y aqui seria peor: la ficha estaria invitando a usar un buzon que ya reboto.
    if d is not None and d.nivel == DESMENTIDO:
        ultimo = d.desmentidos[-1]
        que = {"rebote": "este correo REBOTO cuando se le escribio",
               "persona_equivocada": "se escribio a este correo y contesto quien "
                                     "no era",
               "ya_no_trabaja_aqui": "esta persona ya no trabaja aqui"}.get(
                   ultimo.get("que_paso"), "se intento usar este dato y no sirvio")
        cuando = f" ({ultimo['fecha']})" if ultimo.get("fecha") else ""
        return ("", f"NO LO USES: {que}{cuando}. "
                + (f"{ultimo['detalle']}. " if ultimo.get("detalle") else "")
                + "Hay que conseguir el correo de nuevo, por conmutador o "
                  "preguntandole a quien si contesta", "flag")
    if d is not None and d.nivel == EN_CONFLICTO:
        # NO se elige un valor -- eso es la regla--, pero SI se dicen los dos que
        # chocan: "tenemos dos formas posibles, cuprum.com y verzatec.com" es
        # accionable para quien llama, y callarlo seria afirmar que no hay nada.
        # Lo unico que se esconde es la sigla, no el desacuerdo.
        return ("", "dos fuentes lo escriben distinto, y no elegimos por ti: "
                + (d.motivo_conflicto or "no quedo escrito en que difieren")
                + ". Confirmalo antes de escribirle, o llama al conmutador",
                "flag")
    if d is None or not d.valor:
        return ("", "sin correo — hay que pedirlo por conmutador o por LinkedIn",
                "nil")
    # `anclas_en_la_mayoria` y no un conteo propio: `ancla_dura` es un campo de
    # Dato, NO de Observacion, asi que contar `o.ancla_dura` sobre las
    # observaciones daba cero siempre y caia al respaldo sin que nada fallara.
    # "confirmado con 0 correos reales" es la clase de cifra que destruye la
    # confianza en la ficha completa.
    anclas = d.anclas_en_la_mayoria
    # La SALVEDAD viaja siempre que exista. Una fuente que disiente del correo es
    # justo lo que quien llama necesita saber antes de escribirle, y la ficha vieja
    # la imprimia: perderla al rediseñar habria sido mover honestidad a la pestana,
    # que es lo unico que este rediseno no puede hacer.
    salvedad = (f" Ojo: {d.disidencia}" if d.disidencia else "")
    if es_patron:
        # El valor se MARCA como patron, no como direccion: es la forma, no el
        # buzon, y sin la marca alguien lo copia y lo manda tal cual.
        valor = f"patron de la cuenta: {d.valor}"
        if d.nivel == CONFIRMADO:
            n = anclas or d.n_fuentes
            # verde, como el prototipo: lo confirmado se lee como bueno aunque
            # el buzon de la persona siga siendo probable -- eso lo dice el texto--.
            return (valor,
                    f"patron confirmado con {n} correo(s) real(es) de la empresa; "
                    "el buzon de esta persona es probable, no verificado"
                    + salvedad, "ok")
        # OJO CON LA REDACCION: si el patron mismo NO esta confirmado, decir
        # "sobre patron confirmado" es una afirmacion falsa, y en la capa que se
        # manda al cliente la redaccion ES el dato. Se dice lo que hay.
        return (valor,
                "probable: el patron lo sostiene una sola fuente fiable, asi que "
                "confirmalo antes de escribirle o pidelo por conmutador"
                + salvedad, "sup")
    if d.nivel == CONFIRMADO:
        return (str(d.valor),
                f"correo real, visto en {d.n_fuentes} fuentes independientes"
                + salvedad, "ok")
    return (str(d.valor), "correo probable — confirmalo en la primera llamada"
            + salvedad, "sup")


def _pega_palabra(w: str, p: str) -> bool:
    """`w` aparece en `p`. Las siglas exigen FRONTERA; el resto son troncos.

    "coo" dentro de "coordinador" metia a un Coordinador de Ingenieria de Producto
    en el grupo de DIRECCION -- medido en la planilla de #346--. Y quitarle la
    frontera a todo romperia los troncos que la lista usa a proposito: "ingenieria"
    tiene que pegar con "ingenieria de proyectos".
    """
    if w in SIGLAS_CON_FRONTERA:
        return re.search(r"(?<![0-9a-z])" + re.escape(w) + r"(?![0-9a-z])",
                         p) is not None
    return w in p


def _tipo_de_interlocutor(puesto: str) -> tuple[str, str]:
    p = _plano(" ".join(str(puesto or "").lower().split()))
    for clave, titulo, palabras in INTERLOCUTOR:
        if any(_pega_palabra(w, p) for w in palabras):
            return (clave, titulo)
    return ("otros", "Otros contactos")


def estado_de_cuenta(c: Corrida) -> tuple[str, str]:
    """La etiqueta de la cabecera: en que relacion esta FTS con ESTA planta.

    Es lo primero que decide el tono de la llamada, asi que va arriba y en tres
    palabras. Sale del registro de historia declarada (#310), no de una
    suposicion.
    """
    v = c.historia()["veredicto"]
    if v == HISTORIA_EN_OTRA_PLANTA:
        return ("Cuenta fria en esta planta · carta del grupo", "fria")
    if v == HISTORIA_AQUI:
        return ("Cuenta con historia en esta planta", "ok")
    return ("Sin historia declarada en esta planta", "nil")


def aviso_rojo(c: Corrida) -> str:
    """Solo lo que puede hacerla quedar mal EN LA LLAMADA. Si no hay, no sale.

    Dos fuentes, y las dos son de la misma clase -- afirmaciones que se caen
    delante del cliente--: el registro de historia declarada, y el challenge del
    gancho contra ese registro. Un aviso rojo que sale siempre no se lee, asi que
    este bloque se imprime vacio jamas.
    """
    partes = []
    hist = c.historia()
    if hist["veredicto"] == HISTORIA_EN_OTRA_PLANTA:
        plantas = ", ".join(hist["plantas"])
        canales = sorted({r.get("canal", "") for r in hist["en_otras"]
                          if r.get("canal")})
        via = f" via {', '.join(canales)}" if canales else ""
        partes.append(
            "<b>FTS nunca ha trabajado en esta planta.</b> Todo el trabajo con "
            f"esta cuenta fue en {html.escape(plantas)}{html.escape(via)}. "
            "No digas «ya trabajamos en su planta»: se cae en la primera "
            "llamada.<br><br><b>La carta correcta es:</b><br>"
            + html.escape(carta_de_presentacion(c.empresa, c.ciudad)))
    for f in checklist_validaciones(c):
        if f["modulo"] == "HISTORIA":
            partes.append("<b>El gancho de abajo dice algo que el registro no "
                          "sostiene.</b> " + html.escape(f["razon"]))
    # GANCHO PRELIMINAR: el radar detono la corrida con una hipotesis y esta
    # corrida no la confirmo. Presentar una hipotesis como hallazgo es
    # exactamente "algo que puede hacerla quedar mal en la llamada", asi que su
    # lugar natural es este bloque -- antes vivia en un aviso ambar aparte--.
    if c.origen == "radar" and c.angulo and not c.angulo_resuelto:
        partes.append(
            "<b>GANCHO PRELIMINAR, sembrado por el radar.</b> Esta corrida NO lo "
            "confirmo ni lo corrigio: el gancho de abajo es la hipotesis con la "
            "que se detono la busqueda, no un hallazgo medido aqui. Verificalo "
            "antes de usarlo para abrir.")
    if c.editada_a_mano:
        partes.append(
            "<b>ESTADO EDITADO A MANO.</b> La firma del archivo de esta corrida "
            "no coincide con su contenido: alguien escribio el JSON por fuera de "
            "la herramienta. Parte de lo que sigue puede no venir de una busqueda "
            "registrada. Vale la pena confirmarlo contra las fuentes antes de "
            "llamar.")
    if not partes:
        return ""
    return ('<div class="aviso"><b>Ojo antes de llamar:</b>'
            + "".join(f"<p>{x}</p>" for x in partes) + "</div>")


def aviso_de_senal_sin_fecha(c: Corrida) -> str:
    """«Esta senal no tiene fecha», en lenguaje de persona. Tarea 3 de #340.

    VA EN LA CAPA LIMPIA, dentro de «Por que ahora», y no en los avisos tecnicos.
    La razon es la que #322 fijo para esta capa: el aviso tiene que servirle a quien
    LLAMA. Y a quien llama le sirve muchisimo -- es la diferencia entre decir "vi que
    van a ampliar la planta" con una nota de esta semana y decirlo con una de hace
    tres anios, donde la obra ya se adjudico y el que contesta lo sabe--.

    Tambien va SIN vocabulario interno: no dice «frescura», ni «FRESCURA_SIN_FECHA»,
    ni «techo». Dice que no se sabe de cuando es y que conviene confirmarlo antes de
    usarla como novedad.

    De donde salio la necesidad: seis de las nueve senales de septiembre llegaron sin
    fecha y nadie lo veia en la ficha. Cuando se buscaron, tres eran de mas de un
    ano.
    """
    sen = c.senal_origen or {}
    if not sen.get("fuente"):
        return ""            # sin expediente hay otro aviso, y este sobraria
    if sen.get("fecha_senal"):
        return ""
    razon = (sen.get("razon_sin_fecha") or "").strip()
    return (
        '<p class="hueco"><b>Esta senal no tiene fecha.</b> '
        'No sabemos si es de este mes o de hace un ano, y eso cambia como se '
        'menciona: con una nota reciente se habla de algo que apenas se anuncio; '
        'con una vieja, la obra probablemente ya tiene proveedor y conviene '
        'preguntar por la SIGUIENTE etapa en lugar de por esta.'
        + (f' Quedo anotado por que no la hay: {html.escape(razon)}' if razon else '')
        + ' <b>Antes de usarla como novedad, confirma la fecha de la nota.</b></p>')


# ---------------------------------------------------------------------------
# CLASE (c): LA CUENTA QUE EL BUSCADOR PUBLICO NO TIENE
#
# Tarea 4 de #353. La medicion contra la corrida humana encontro tres cuentas
# donde el bloque completo de M5 -- las tres formas, con alias de marca y con
# ancla de geografia-- devuelve CERO perfiles de la empresa: Ragasa es el caso
# limpio (0 de 3 contactos de valor), y Cuprum y Qualtia se le parecen.
#
# Eso NO es un defecto de la herramienta ni un hueco de vocabulario. Es un
# limite de la FUENTE: esos perfiles existen y Sales Navigator los entrega, y el
# buscador publico no los indexa. Y mientras la ficha no lo diga, quien la lee
# concluye lo contrario -- que la herramienta fallo, o que la planta no tiene
# gente--. Las dos conclusiones son falsas y las dos cuestan.
#
# UNA SOLA DEFINICION, y por eso esto ya no calcula nada. Hasta la 0.16.0 esta
# funcion tenia su propio umbral de 8 consultas y su propio criterio -- «ninguna
# entrego un contacto»--, distinto del que el detector temprano de #355 usa: 12
# consultas, las tres formas cubiertas, y cero PERFILES de la empresa. Dos
# numeros y dos criterios para el mismo hecho garantizan que un dia la compuerta
# corte y la ficha no lo diga, o al contrario.
#
# Ahora los dos leen de `Corrida.limite_de_fuente()`, que es
# `compuertas.corta_por_limite_de_fuente`. El numero vive en un solo lugar.


def sin_presencia_en_buscador_publico(c: Corrida) -> tuple[bool, str]:
    """¿El buscador publico no tiene a esta empresa? (bool, razon legible).

    Delega en la corrida. Se conserva como nombre porque es el que la capa
    limpia usa y el que las pruebas de #353 fijaron.
    """
    return c.limite_de_fuente()


def familias_sin_interlocutor(c: Corrida) -> list[tuple[str, str]]:
    """Las familias de INTERLOCUTOR donde esta corrida NO tiene a nadie de valor.

    Anadido en #361. El aviso de limite de fuente de #353 era todo-o-nada: la
    empresa esta en el buscador o no esta. La correccion de #355 mostro que el
    caso normal es intermedio -- Ragasa: el buscador SI tiene perfiles de la
    empresa, y los que no tiene son los de PLANTA-- y para ese caso la ficha no
    tenia nada que decir.

    Ahora lo dice por familia, que es como la vendedora lo va a usar: no «no hay
    nadie» sino «de las cuatro familias, en estas dos no hay nadie, y para esas
    dos la busqueda de Sales Navigator es esta».
    """
    con_alguien = set()
    for x in c.contactos:
        if not getattr(x, "sigue_en_la_casa", True):
            continue
        puesto = x.puesto or (x.datos.get("puesto").valor
                              if x.datos.get("puesto") else "")
        if puesto_nunca_decisor(puesto):
            continue
        clave, _titulo = _tipo_de_interlocutor(puesto)
        if clave != "otros":
            con_alguien.add(clave)
    return [(clave, titulo) for clave, titulo, _p in INTERLOCUTOR
            if clave not in con_alguien]


def busqueda_armada_para_sales_navigator(c: Corrida,
                                         solo_familias=None) -> str:
    """La busqueda de Sales Navigator, ya armada, para copiar y pegar.

    Las familias salen de INTERLOCUTOR, la misma tabla con la que la herramienta
    agrupa: si manana se le agrega vocabulario, esto se mueve con ella y no
    queda una version vieja escrita a mano en un texto.

    `solo_familias` acota la lista a las claves que se le pasen. Sirve para el
    caso de Ragasa: pedirle a la vendedora que busque en Sales Navigator las
    cuatro familias cuando dos ya tienen a alguien es mandarla a repetir trabajo,
    y el trabajo en Sales Navigator es el caro.
    """
    filas = []
    for _clave, titulo, palabras in INTERLOCUTOR:
        if solo_familias is not None and _clave not in solo_familias:
            continue
        muestra = ", ".join(palabras[:5])
        filas.append(f"<li><b>{html.escape(titulo)}:</b> "
                     f"{html.escape(muestra)}</li>")
    donde = c.ciudad or "la ciudad de la planta"
    return (
        '<p style="margin:10px 0 4px"><b>La busqueda, ya armada:</b></p>'
        '<ol style="margin:0 0 8px 18px;padding:0">'
        f'<li><b>Empresa:</b> {html.escape(c.empresa)} '
        '— en el filtro <i>Current company</i>, no en el texto.</li>'
        f'<li><b>Lugar:</b> {html.escape(donde)} '
        '— en el filtro <i>Geography</i>. <b>Escribir la ciudad en el texto no '
        'filtra:</b> una consulta con la ciudad escrita devolvio a quien tiene '
        'ese mismo puesto en Sydney.</li>'
        '<li><b>Puestos — una busqueda por familia,</b> nunca varias juntas: '
        'juntas se tapan entre si.</li>'
        '</ol>'
        f'<ul style="margin:0 0 0 18px;padding:0">{"".join(filas)}</ul>')


def aviso_de_cuenta_sin_buscador_publico(c: Corrida) -> str:
    """«Esta empresa no aparece en el buscador publico», en lenguaje de persona.

    VA EN LA CAPA LIMPIA, en «A quien buscar»: es ahi donde quien lee se
    pregunta por que no hay nombres, y es ahi donde la respuesta le sirve.

    Sin vocabulario interno: no dice "clase (c)", ni "M5", ni "limite de
    fuente". Dice que la empresa no esta en el buscador, que los contactos de
    planta salen por Sales Navigator, y deja la busqueda armada.
    """
    es, razon = sin_presencia_en_buscador_publico(c)
    if not es:
        return ""
    return (
        '<div class="hueco">'
        '<b>Esta empresa no aparece en el buscador publico.</b> '
        'No es que no tenga gente de planta: es que sus perfiles no estan '
        'indexados donde la herramienta busca. Se pregunto de todas las formas '
        f'({html.escape(razon)}) y el buscador no devolvio ni un perfil de la '
        'empresa. '
        '<b>Los contactos de planta de esta cuenta salen solo por Sales '
        'Navigator</b>, con sesion en la ciudad de la planta. Insistir aqui no '
        'los va a traer, y cada intento cuesta.'
        + busqueda_armada_para_sales_navigator(c)
        + '</div>')


# --------------------------------------------- LO QUE SALIO DEL BUZON, PRIMERO
#
# Tarea 6 de #355. La corrida de #353 lo demostro dos veces: el hueco de Metalsa
# lo cerro un correo que llevaba dos meses en el buzon -- su propia nota proponia
# cerrarlo gastando una consulta de prensa-- y la via interna dio cuatro personas
# que YA le habian escrito a FTS, con correo verificado e hilo abierto, que una
# semana de Sales Navigator no encontro.
#
# Si eso no sale ARRIBA en la ficha, quien llama lo trata como un dato mas de la
# lista. Y no es un dato mas: es la diferencia entre «vi que van a ampliar la
# planta» y «me escribiste en octubre sobre el taller de mantenimiento».
#
# VA CON SU FECHA, siempre. Un hilo de hace un mes y uno de hace dos anios abren
# conversaciones distintas, y sin la fecha quien llama no puede saber cual tiene.
FUENTES_INTERNAS = ("odoo", "outlook", "outlook_remitentes",
                    "outlook_hilos_por_nombre", "outlook_personas")


def lo_que_salio_del_buzon(c: Corrida) -> list[dict]:
    """Las busquedas de la OLA 0 que TRAJERON algo, con su fecha, las primeras.

    Se leen del registro, no de una lista aparte: lo que la ficha muestra es lo
    que la corrida gasto, y no hay forma de que digan cosas distintas.
    """
    fuera = []
    for b in c.busquedas():
        if b.modulo not in ("M0", "M0b", "M0c"):
            continue
        if not b.resultados:
            continue                     # cero es una respuesta, no una noticia
        fuera.append({"modulo": b.modulo, "fuente": b.fuente,
                      "consulta": b.consulta, "resultados": b.resultados,
                      "nota": b.nota, "fecha": (b.ts or "")[:10]})
    return fuera


def bloque_de_lo_interno(c: Corrida) -> str:
    """«Esto ya estaba en casa», arriba de la linea de tiempo de la web."""
    filas = lo_que_salio_del_buzon(c)
    if not filas:
        return ""
    lis = []
    for f in filas:
        de_donde = {"M0": "Odoo", "M0b": "el buzon",
                    "M0c": "el buzon, por remitente"}.get(f["modulo"], f["modulo"])
        detalle = html.escape(f["nota"] or f["consulta"])
        lis.append(f'<li><b>{html.escape(f["fecha"])}</b> — '
                   f'{f["resultados"]} en {de_donde}: {detalle}</li>')
    return ('<div class="card" style="margin:0 0 12px">'
            '<div class="sub-h">Esto ya estaba en casa</div>'
            '<p class="nota-g">Salio de Odoo y del buzon de FTS, no de la web. '
            'Es lo primero que hay que leer: una persona que ya nos escribio '
            'pesa mas que cualquier nota de prensa, y con ella la llamada no '
            'empieza en frio.</p>'
            f'<ul style="margin:0 0 0 18px;padding:0">{"".join(lis)}</ul>'
            '</div>')


def aviso_de_familias_sin_interlocutor(c: Corrida) -> str:
    """«En estas familias no hay nadie», con la busqueda de SN para esas.

    Es el caso de Ragasa, y es el caso NORMAL -- mas comun que el de la empresa
    que no esta indexada--. El buscador tiene a la empresa, la corrida saco gente
    de ella, y sin embargo una o dos familias quedan vacias. Sin este aviso la
    ficha se ve completa: tiene contactos, tiene senal, y la vendedora no sabe
    que le falta justo el que firma la orden.

    NO se emite cuando la cuenta ya cayo en el aviso de «no aparece en el
    buscador publico»: ese ya dice mas y decir los dos seria repetir.
    """
    if not c.contactos:
        return ""                    # sin ningun contacto, otro aviso lo cubre
    es_clase_c, _r = sin_presencia_en_buscador_publico(c)
    if es_clase_c:
        return ""
    faltan = familias_sin_interlocutor(c)
    if not faltan:
        return ""
    if len(faltan) == len(INTERLOCUTOR):
        return ""                    # ninguna familia: lo dice el otro aviso
    nombres = [t for _c, t in faltan]
    lista = nombres[0] if len(nombres) == 1 else (
        ", ".join(nombres[:-1]) + " y " + nombres[-1])
    cuantas = "una familia" if len(faltan) == 1 else f"{len(faltan)} familias"
    return (
        '<div class="hueco">'
        f'<b>Falta con quien hablar en {cuantas}: {html.escape(lista)}.</b> '
        'El buscador si tiene a esta empresa -- de ella salieron los contactos '
        'de arriba-- y lo que no entrego son esos puestos. No es que la planta '
        'no los tenga: es que sus perfiles no estan donde la herramienta busca. '
        '<b>Para esas familias, y solo para esas, la via es Sales Navigator.</b>'
        + busqueda_armada_para_sales_navigator(
            c, solo_familias={cl for cl, _t in faltan})
        + '</div>')


def linea_de_tiempo(c: Corrida) -> str:
    """La senal como linea de tiempo: fecha a la izquierda, hecho a la derecha.

    Ordenada cronologicamente, porque quien llama necesita saber QUE PASO PRIMERO
    -- una ampliacion de 2018 y un arranque de linea de hace dos meses no abren la
    misma conversacion--. Lo que no trae fecha lo dice y pide confirmarla: citar
    un ano equivocado delante del cliente es peor que no citarlo.
    """
    filas = []
    for t in c.senal:
        f = fecha_de(t)
        filas.append((f or "", t))
    # las fechadas primero y en orden; las sin fecha al final, no escondidas
    con = sorted([x for x in filas if x[0]], key=lambda x: _orden_de_fecha(x[0]))
    sin = [x for x in filas if not x[0]]
    out = []
    for f, t in con:
        out.append(f'<li><span class="f">{html.escape(f)}</span>'
                   f'<span class="t">{html.escape(t)}</span></li>')
    for _f, t in sin:
        out.append('<li><span class="f sf">Sin fecha</span>'
                   f'<span class="t">{html.escape(t)} '
                   '<b>Confirmar el ano antes de citarlo.</b></span></li>')
    return f'<ul class="timeline">{"".join(out)}</ul>' if out else ""


_MES_N = {m: i for i, m in enumerate(
    ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct",
     "nov", "dic"), start=1)}


def _orden_de_fecha(f: str):
    """Clave de orden para las formas que la corrida escribe. Lo que no se
    entiende va al final de las fechadas, nunca se pierde."""
    t = f.lower()
    m = re.search(r"(19|20)\d{2}", t)
    anio = int(m.group(0)) if m else 9999
    mes = 13
    for nombre, n in _MES_N.items():
        if nombre in t:
            mes = n
            break
    else:
        m2 = re.search(r"\d{4}-(\d{2})", t)
        if m2:
            mes = int(m2.group(1))
    return (anio, mes)


def _por_que_le_importa(x, c: Corrida) -> str:
    """Una linea de por que ESTA persona le importa a FTS.

    Derivada del puesto y de la cercania a la decision, no escrita a mano: es lo
    que convierte una lista de nombres en una lista de puertas. Si no se puede
    derivar, se dice -- no se rellena con una frase generica--.
    """
    clave, _t = _tipo_de_interlocutor(x.puesto or "")
    razones = {
        "mantenimiento": "responde por que la planta no pare: es quien vive el "
                         "problema que FTS resuelve",
        "compras": "pone la orden y pide las tres cotizaciones",
        "direccion": "firma el CAPEX",
        "ingenieria": "escribe la especificacion, y la especificacion decide "
                      "quien puede cotizar",
    }
    base = razones.get(clave, "")
    if not base:
        return ("no se pudo derivar por que importa desde su puesto; sirve de "
                "contexto y para llegar a quien decide")
    return base


def tarjetas_de_contactos(c: Corrida) -> tuple[str, str, str, dict]:
    """Los tres grupos de "a quien buscar", ya en HTML.

    TRES, y el orden es el de la llamada: primero a quien le hablas, luego a quien
    te falta confirmar, y al final quien te sirve de contexto. La ficha vieja los
    mezclaba en una tabla con una columna "de valor: si/no" que habia que leer
    fila por fila.

    Los EN REVISION no se esconden (#306 D3, y fue el defecto serio). Los puestos
    SIN PERSONA van con los decisores, porque un puesto sin nombre sigue siendo
    una puerta -- se llama al conmutador y se pregunta por el--.
    """
    poblacion = c.poblacion()
    vivos = [x for x in poblacion if x.sigue_en_la_casa]
    decisores, confirmar, contexto = [], [], []
    for x in vivos:
        if x.revision_humana:
            confirmar.append(x)
        elif x.de_valor or not x.nombre:
            # UN PUESTO SIN PERSONA VA CON LOS DECISORES, aunque su cercania no
            # alcance para `de_valor`. Es instruccion explicita de #322, y la
            # razon es operativa: un puesto sin nombre sigue siendo una puerta
            # -- se llama al conmutador y se pregunta por el--, mientras que
            # mandarlo a "contexto" lo entierra en una lista que nadie marca.
            decisores.append(x)
        else:
            contexto.append(x)
    orden = lambda y: (y.cercania_decision, y.nombre or "zzz")
    decisores.sort(key=orden)
    confirmar.sort(key=orden)
    contexto.sort(key=orden)

    # UNA PERSONA, con el acomodo del prototipo (#323): a la izquierda nombre
    # grande, puesto y planta debajo, y la linea de por que importa; a la derecha
    # el chip de tipo y, bajo el chip, el correo en monoespaciada con su nivel en
    # palabras. El chip va ARRIBA del correo y no en la cabecera, que es lo que
    # hace que la columna derecha se lea como una sola cosa.
    CHIP_CLASE = {"Decisor": "tea", "Puesto sin persona": "pue",
                  "Por confirmar": "dec", "Contexto": "ctx"}

    def persona(x, tipo: str, razon_extra: str = "") -> str:
        correo, dice, clase = _correo_en_palabras(x)
        planta = _planta_de(x)
        sin_nombre = not x.nombre
        nombre = x.nombre or (x.puesto or "(puesto sin persona)")
        puesto = ("Puesto confirmado que existe, todavia sin nombre" if sin_nombre
                  else (x.puesto or "puesto sin registrar"))
        if planta and not sin_nombre:
            puesto += f", {planta}"
        elif planta:
            puesto += f" · {planta}"
        cuerpo = (f'<div class="nombre">{html.escape(nombre)}</div>'
                  f'<div class="puesto">{html.escape(puesto)}</div>'
                  f'<div class="porque">{html.escape(_por_que_le_importa(x, c))}'
                  + (f' <b>{html.escape(razon_extra)}</b>' if razon_extra else "")
                  + '</div>')
        cor = ('<span class="correo' + (' nil' if not correo else '') + '">'
               + (html.escape(correo) if correo else "")
               + f'<small class="{clase}">{html.escape(dice)}</small></span>')
        return (f'<div class="persona{" sinpersona" if sin_nombre else ""}">'
                f'<div>{cuerpo}</div>'
                f'<div class="lado">'
                f'<span class="chip {CHIP_CLASE.get(tipo, "ctx")}">'
                f'{html.escape(tipo)}</span>{cor}</div></div>')
    tarjeta = persona

    b_dec = "".join(
        tarjeta(x, "Puesto sin persona" if not x.nombre else "Decisor")
        for x in decisores)
    b_con = "".join(
        tarjeta(x, "Por confirmar",
                x.motivo_revision or "falta una comprobacion y nadie escribio cual")
        for x in confirmar)
    # los de contexto van en UNA tarjeta, no en una por cabeza: son contexto, y
    # una tarjeta por cada uno los hace competir visualmente con los decisores.
    if contexto:
        # Un CONFLICTO se dice incluso aqui. Callar un conflicto es afirmar que no
        # hay desacuerdo, y esa regla no depende de que la persona sea decisora:
        # la ficha de Cuprum (#289) se rompio por exactamente esto.
        vistos, puestos = [], []
        for x in contexto:
            pz = x.puesto or "puesto sin confirmar"
            if pz not in vistos:
                vistos.append(pz)
                puestos.append(pz)
        puestos_ctx = ", ".join(puestos[:4]) + (
            f" y {len(puestos) - 4} mas" if len(puestos) > 4 else "")
        # Los de contexto van en UNA fila de persona, no en una por cabeza: son
        # contexto, y una tarjeta por cada uno los hace competir visualmente con
        # los decisores. Es el acomodo del prototipo.
        nombres = " · ".join(x.nombre or x.puesto or "?" for x in contexto[:6])
        if len(contexto) > 6:
            nombres += f" y {len(contexto) - 6} mas"
        conflictos_ctx = "".join(
            f'<div class="porque"><b>{html.escape(_correo_en_palabras(x)[1])}</b>'
            f' — {html.escape(x.nombre or x.puesto or "?")}</div>'
            for x in contexto if _correo_en_palabras(x)[2] == "flag")
        b_ctx = (f'<div class="persona"><div>'
                 f'<div class="nombre">{html.escape(nombres)}</div>'
                 f'<div class="puesto">{html.escape(puestos_ctx)}</div>'
                 '<div class="porque">Estan en la planta o en la cuenta y pueden '
                 'abrir puerta, pero no deciden compras tecnicas.</div>'
                 + conflictos_ctx + '</div>'
                 '<div class="lado"><span class="chip ctx">Contexto</span>'
                 '</div></div>')
    else:
        b_ctx = ""
    return (b_dec, b_con, b_ctx,
            {"decisores": len(decisores), "confirmar": len(confirmar),
             "contexto": len(contexto)})


def medidor(c: Corrida) -> tuple[str, str]:
    """(svg, frase). El porcentaje de cobertura, y lo que significa en castellano.

    Sin nombrar la estimacion ni su veredicto: lo que la vendedora necesita saber
    es si la lista esta completa y, si no, de donde sale lo que falta. "FALTA_BARRER"
    no contesta ninguna de las dos.
    """
    est = c.completitud()
    if not est.opina:
        pct = None
        frase = ("Todavia no se puede estimar cuanta gente falta: la corrida "
                 "encontro pocos contactos para calcularlo. Lo que sigue son las "
                 "busquedas que quedaron pendientes.")
    else:
        pct = max(0, min(100, round(est.cobertura * 100)))
        if pct >= 80:
            frase = ("Encontramos casi todo el mapa de esta planta. Lo que falta "
                     "es poco y sale de Sales Navigator.")
        elif pct >= 45:
            frase = (f"Encontramos aproximadamente {'la mitad' if pct < 60 else 'dos tercios'} "
                     "del mapa de esta planta; lo que falta sale de Sales Navigator.")
        else:
            frase = ("Falta buena parte del mapa de esta planta. Lo que sigue "
                     "necesita Sales Navigator para cerrarse.")
    # MEDIDOR CONIC-GRADIENT, como el prototipo aprobado (#323): un circulo con
    # el porcentaje al centro. Sustituyo a un SVG que hacia lo mismo con menos
    # claridad, y no necesita nada externo -- un archivo que se manda por correo
    # no puede depender de una imagen que hay que descargar--.
    etiqueta = f"{pct}%" if pct is not None else "n/d"
    relleno = (f"conic-gradient(var(--teal) 0 {pct}%, var(--line) {pct}% 100%)"
               if pct is not None else "var(--gray-bg)")
    medidor = (f'<div class="medidor" style="background:{relleno}" role="img" '
               f'aria-label="cobertura estimada {etiqueta}">'
               f'<span>{etiqueta}</span></div>')
    return (medidor, frase)


def no_se_pudo_revisar(c: Corrida) -> list[str]:
    """Que fuentes quedaron sin revisar, en lenguaje de persona.

    La ficha vieja imprimia el checklist entero -- catorce filas con "M7 /
    sin_acceso / WebFetch bloqueado por egress"-- arriba, donde Rissia lo leia
    como catorce fallas. Son tres o cuatro huecos, y se dicen en tres o cuatro
    lineas; el checklist completo vive en la pestana de abajo.
    """
    juntos: dict[str, list[str]] = {}
    for f in checklist_validaciones(c):
        m = f["modulo"]
        if m not in FUENTE_EN_CASTELLANO:
            continue
        if f["estado"] in (RESPONDIO,):
            continue
        porque = POR_QUE_NO_SE_PUDO.get(f["estado"])
        if not porque:
            continue
        juntos.setdefault(porque, []).append(FUENTE_EN_CASTELLANO[m])
    out = []
    for porque, fuentes in juntos.items():
        # se junta por RAZON, no por fuente: "el entorno no deja abrirlos" dicho
        # tres veces se lee como tres problemas distintos.
        lista = ", ".join(fuentes[:4])
        if len(fuentes) > 4:
            lista += f" y {len(fuentes) - 4} mas"
        out.append(f"{lista}: {porque}")
    return out


def _hueco(que: str, como: str) -> str:
    return (f'<p class="hueco"><b>Sin {html.escape(que)}.</b> '
            f'{html.escape(como)}</p>')


def _clase_de_estado(estado: str) -> str:
    """Clase CSS por estado, sin meter el nombre del estado en el CSS.

    El CSS vive en <head>, que esta FUERA del <details>: `.e-sin_acceso` era una
    fuga de vocabulario interno a la capa limpia por la puerta de atras, y la
    prueba de regresion la encontro.
    """
    if estado in ("sin_acceso", "fallo", "omitida_por_costo"):
        return "warn"
    if estado == RESPONDIO:
        return "ok"
    return "no"


# NO hay `_estado_legible`. Se escribio y se quito: el prototipo escribe los
# estados bonitos ("sin acceso") y aqui gana la regla de #322 -- "aqui si van
# todos los terminos internos: es la procedencia"--. `sin_acceso` con guion bajo
# es la llave exacta que se puede buscar entre fichas y entre corridas; "sin
# acceso" con espacio ya es prosa, y la prueba de vocabulario lo cacho.


def capa_tecnica(c: Corrida) -> str:
    """La procedencia, en un <details> CERRADO. Aqui si van todos los terminos.

    Cerrado por defecto y con el hint dicho en voz alta -- "no hace falta abrirlo
    para llamar"--, porque el problema nunca fue que la procedencia existiera:
    fue que estaba ARRIBA, mezclada con lo que se usa para llamar. Quien audita
    abre la pestana y encuentra todo lo que antes salia suelto, y mas: la version
    y el commit con que se genero la ficha, que antes no estaban en ninguna parte.
    """
    est = c.completitud()
    sl = sello()

    chao = (
        '<table class="tec-t"><tr><th>Observados</th><th>f1</th><th>f2</th><th>Estimado</th>'
        '<th>Cobertura</th><th>Veredicto</th></tr>'
        f'<tr><td>{est.observados}</td><td>{est.f1}</td><td>{est.f2}</td>'
        f'<td>{est.estimado:.1f}</td><td>{est.cobertura:.0%}</td>'
        f'<td><b>{html.escape(est.veredicto.upper())}</b></td></tr></table>'
        f'<p class="nt">{html.escape(est.por_que)}</p>')

    val = "".join(
        f'<tr><td>{html.escape(f["modulo"])}</td>'
        f'<td class="est-{_clase_de_estado(f["estado"])}">'
        f'{html.escape(f["estado"])}</td>'
        f'<td>{html.escape(f["razon"]) or "—"}</td>'
        f'<td class="c">{"si" if f["agotado"] else "no"}</td></tr>'
        for f in checklist_validaciones(c))

    rev = "".join(
        f'<tr><td>{html.escape(x.nombre or x.puesto or "?")}</td>'
        f'<td>{html.escape(x.puesto or "")}</td>'
        f'<td>{html.escape(x.motivo_revision) or "<i>sin razon escrita</i>"}</td>'
        f'</tr>' for x in c.contactos if x.revision_humana)

    # El nivel por contacto y por campo. Esto es lo que la capa limpia dice en
    # palabras -- "patron confirmado con 2 correos reales"-- y aqui se dice con la
    # sigla, que es como lo nombra el metodo.
    niveles = []
    for x in sorted(c.contactos, key=lambda y: y.cercania_decision):
        campos = " · ".join(
            f'{campo}:{CHIP.get(d.nivel, d.nivel.upper())}'
            f'({",".join(sorted({o.fuente for o in d.observaciones}))})'
            for campo, d in sorted(x.datos.items()))
        # Quien YA NO ESTA sale de las tarjetas de la capa limpia pero SI aparece
        # aqui, marcado: la procedencia de un descarte es tan auditable como la de
        # un hallazgo, y sin la marca aparecer en esta tabla se leeria como seguir
        # en la casa.
        niveles.append(
            f'<tr><td>{html.escape(x.nombre or x.puesto or "?")}'
            + ("" if x.sigue_en_la_casa else
               ' <b>(YA NO ESTA en la casa)</b>') + '</td>'
            f'<td class="c">{NIVEL_FICHA.get(x.nivel_ficha, "N2")}</td>'
            f'<td class="c">{x.cercania_decision}</td>'
            f'<td class="c">{x.hits}</td>'
            f'<td class="mono">{html.escape(campos) or "—"}</td></tr>')

    # LA HISTORIA DECLARADA, con su referencia. El aviso rojo de la capa limpia
    # dice lo que hay que decir en la llamada -- "nunca trabajamos aqui, fue en
    # Juarez via Quimitec"-- y la REFERENCIA de cada proyecto es procedencia: #310
    # exige que la ficha la cite, y este es su lugar.
    hist = c.historia()
    regs = hist.get("aqui", []) + hist.get("en_otras", [])
    hist_t = ("" if not regs else (
        '<h3>Historia declarada de la cuenta</h3>'
        '<table class="tec-t"><tr><th>Referencia</th><th>Planta</th><th>Que fue</th>'
        '<th>Fecha</th><th>Canal</th><th>Es esta planta</th></tr>'
        + "".join(
            f'<tr><td>{html.escape(r.get("referencia",""))}</td>'
            f'<td>{html.escape(r.get("planta",""))}</td>'
            f'<td>{html.escape(r.get("que",""))}</td>'
            f'<td>{html.escape(r.get("fecha","")) or "—"}</td>'
            f'<td>{html.escape(r.get("canal","")) or "—"}</td>'
            f'<td class="c">{"si" if r in hist.get("aqui", []) else "no"}</td>'
            '</tr>' for r in regs)
        + '</table>'
        '<p class="nt">Declarado por el operador (conocimiento directo). '
        '<code>sale.order</code> de Odoo no registra la planta: tiene el cliente '
        'y no tiene el sitio, asi que esto no se puede derivar.</p>'))

    # El ALIAS DE UBICACION declarado. Va en esta capa y no en la limpia porque es
    # procedencia -- explica por que la frontera de la planta esta donde esta-- y
    # quien llama no necesita saberlo. Pero se imprime SIEMPRE que exista: #306 D4
    # lo exige, y mover la frontera a mano sin decirlo deja una ficha que parece
    # derivada cuando lleva un juicio dentro.
    alias_t = ("" if not c.alias_de_ubicacion else (
        '<h3>Alias de ubicacion declarado</h3>'
        '<p class="nt">Para esta cuenta, <b>'
        + html.escape(" · ".join(c.alias_de_ubicacion)) + '</b> tambien nombra a '
        + html.escape(c.ciudad or "esta planta")
        + '. Lo declaro el operador: que dos nombres sean el mismo lugar es '
          'geografia local y la herramienta no lo puede derivar. Los contactos '
          'que ese alias devolvio a la poblacion cuentan en el Chao1.</p>'))

    fuera = c.fuera_de_la_poblacion()
    f_fuera = "".join(
        f'<tr><td>{html.escape(x.puesto or x.nombre or "?")}</td>'
        f'<td>{html.escape(", ".join(x.ubicaciones_observadas))}</td>'
        f'<td class="c">{"otra planta" if d == "otra_planta" else "corporativo"}</td>'
        f'</tr>' for x, d in fuera)

    conflictos, salvedades = [], []
    for x in c.contactos:
        quien = html.escape(x.nombre or x.puesto or "?")
        for campo, d in x.datos.items():
            if d.informa_pese_al_conflicto:
                salvedades.append(
                    f'<li><b>{html.escape(campo)}</b> de {quien}: '
                    f'<code>{html.escape(str(d.valor))}</code> — '
                    f'{html.escape(d.disidencia)}</li>')
            elif d.nivel == EN_CONFLICTO:
                conflictos.append(
                    f'<li><b>{html.escape(campo)}</b> de {quien}: '
                    f'{html.escape(d.motivo_conflicto)}</li>')

    fuentes = []
    for b in c.busquedas():
        if b.liga:
            dom = b.liga.split("//", 1)[-1].split("/", 1)[0][:38]
            liga = (f'<a href="{html.escape(b.liga, quote=True)}" '
                    'title="forma verificada, contenido NO comprobado">'
                    f'{html.escape(dom)}</a><span class="nc">?</span>')
        else:
            liga = '<i>sin liga</i>'
        fuentes.append(
            f'<tr><td>{html.escape(b.modulo)}</td>'
            f'<td>{html.escape(b.etiqueta or b.fuente)}</td>'
            f'<td class="mono">{html.escape(b.consulta)}</td>'
            f'<td class="c">{b.resultados}</td>'
            f'<td class="c">{html.escape(b.ts[:10])}</td>'
            f'<td class="c">{liga}</td></tr>')

    avisos = "".join(f"<li>{html.escape(a)}</li>" for a in c.avisos)
    sem = "".join(
        f'<li><b>{html.escape(r["que"])}</b>: <code>'
        f'{html.escape(str(r["valor"]))}</code> — de '
        f'<i>{html.escape(r["de_corrida"])}</i>, '
        '<b>no observado en esta corrida</b></li>'
        for r in c.sembrado)
    quitados = "".join(
        f'<tr><td><b>{html.escape(q["alias"])}</b></td>'
        f'<td>{len(q["salieron"])}</td>'
        f'<td>{q["poblacion_antes"]} &rarr; {q["poblacion_despues"]}</td>'
        f'<td>{q["chao1_antes"]} &rarr; {q["chao1_despues"]}</td>'
        f'<td>{html.escape(q["veredicto_antes"])} &rarr; '
        f'{html.escape(q["veredicto_despues"])}</td></tr>'
        for q in c.alias_quitados)

    todas = len(c.busquedas())
    unicas = len({b.consulta_normalizada for b in c.busquedas()})
    firma = ("NO COINCIDE — el JSON se edito por fuera de la herramienta"
             if c.editada_a_mano else "coincide con el contenido")

    def seccion(titulo: str, cuerpo: str, vacio: str = "") -> str:
        if not cuerpo:
            return (f'<h3>{titulo}</h3><p class="nt">{vacio}</p>'
                    if vacio else "")
        return f'<h3>{titulo}</h3>{cuerpo}'

    niveles_t = "".join(niveles) or '<tr><td colspan="5"><i>Sin contactos.</i></td></tr>'
    return f'''<details class="tec">
<summary>Detalle tecnico: como se obtuvieron estos datos <span class="hint">para validar o auditar, no hace falta abrirlo para llamar</span></summary>
<div class="tec-body">

<h3>Que tan completa esta la ficha (Chao1)</h3>
{chao}

<h3>Nivel por contacto y por campo</h3>
<table class="tec-t"><tr><th>Quien</th><th>Nivel</th><th>Cercania</th><th>Hits</th>
<th>Nivel por campo</th></tr>
{niveles_t}</table>
<p class="nt">N1 nombre completo · N2 parcial · N3 puesto sin persona.
CONF confirmado (2+ raices) · SOL solido (1 fuente fiable) · CAND candidato ·
CONFLICTO dos fuentes que no coinciden. Una sola fuente topa en SOLIDO.</p>

<h3>Estado por modulo (checklist de validaciones)</h3>
<table class="tec-t"><tr><th>Modulo</th><th>Estado</th><th>Razon</th><th>Agotado</th></tr>
{val}</table>

{seccion("Contactos en revision humana",
         f'<table class="tec-t"><tr><th>Quien</th><th>Puesto</th><th>Motivo exacto</th></tr>{rev}</table>' if rev else "")}

{hist_t}
{alias_t}
{seccion("Fuera de la poblacion de esta planta",
         (f'<table class="tec-t"><tr><th>Puesto</th><th>Ubicacion observada</th><th>Donde</th></tr>{f_fuera}</table>'
          '<p class="nt">Salen del Chao1 a proposito: su poblacion es otra. No se '
          'pierden — son la semilla de la corrida corporativa:<br><code>'
          f'./prospector prospecta --empresa {html.escape(repr(c.empresa))} '
          '--nivel corporativo</code></p>') if f_fuera else "")}

{seccion("En conflicto", f'<ul class="cf">{"".join(conflictos)}</ul>' if conflictos else "")}
{seccion("Con salvedad", f'<ul class="sv">{"".join(salvedades)}</ul>' if salvedades else "")}
{seccion("Sembrado de otras corridas", f'<ul class="sv">{sem}</ul>'
         + '<p class="nt">Una semilla NO cuenta como fuente ni como raiz, y topa '
           'en CANDIDATO hasta que esta corrida lo observe por su cuenta.</p>'
         if sem else "")}
{seccion("Alias de ubicacion retirados",
         ('<table class="tec-t"><tr><th>Alias</th><th>Salieron</th><th>Poblacion</th>'
          f'<th>Chao1</th><th>Veredicto</th></tr>{quitados}</table>') if quitados else "")}

<h3>Todas las busquedas — {todas}</h3>
<table class="tec-t"><tr><th>Mod</th><th>Via</th><th>Consulta</th><th>Res</th><th>Fecha</th>
<th>Liga</th></tr>
{"".join(fuentes) or '<tr><td colspan="6"><i>Sin busquedas.</i></td></tr>'}</table>
<p class="nt">Las ligas llevan <span class="nc">?</span> porque su FORMA se
verifico al registrarlas y su CONTENIDO no: abrirlas exige WebFetch, bloqueado
por egress en este entorno.</p>

{seccion("Avisos de la corrida", f"<ul>{avisos}</ul>" if avisos else "")}

<h3>La corrida</h3>
<table class="tec-t">
<tr><th>Fecha</th><td>{html.escape(c.creada[:19])}</td></tr>
<tr><th>Llave</th><td><code>{html.escape(c.llave)}</code></td></tr>
<tr><th>Busquedas registradas</th><td>{todas} ({unicas} consultas unicas)</td></tr>
<tr><th>Presupuesto gastado</th><td>{c.presupuesto.gastadas} de
    {c.presupuesto.tope_por_cuenta}</td></tr>
<tr><th>Version de la herramienta</th><td><code>{html.escape(sl["version"])}</code></td></tr>
<tr><th>Commit</th><td><code>{html.escape(sl["commit"])}</code></td></tr>
<tr><th>Firma del estado</th><td>{html.escape(firma)}</td></tr>
</table>
</div>
</details>'''


def modo_limpio(c: Corrida) -> str:
    """LA ficha. Capa limpia visible, capa tecnica colapsada al final.

    El orden de la capa limpia es el ORDEN DE LECTURA DE UNA VENDEDORA, no el
    orden en que la herramienta calculo las cosas:

        cabecera y estado de cuenta -> aviso rojo, si hay -> gancho -> por que
        ahora -> a quien buscar -> como hablarles -> lo que falta -> lo que no se
        pudo revisar -> pie

    Y CERO vocabulario interno. Ni un M5, ni un N2, ni un Chao1: cuando hay que
    nombrar una fuente se nombra en castellano (`FUENTE_EN_CASTELLANO`).
    """
    b_dec, b_con, b_ctx, n = tarjetas_de_contactos(c)
    svg, frase = medidor(c)
    estado_txt, estado_cls = estado_de_cuenta(c)
    fuera = c.fuera_de_la_poblacion()
    ya_no_estan = [x for x in c.poblacion() if not x.sigue_en_la_casa]

    # --- los tres bloques de criterio del operador: su texto, o el hueco con el
    # comando que lo llena. Nunca en blanco (#268).
    CARGA = "registrar --datos '{\"%s\": %s}'"
    # EL GANCHO EN DOS PARTES, como el prototipo: la frase grande que abre la
    # llamada, y debajo el detalle que la sostiene. Se parte en la PRIMERA frase
    # -- no a la mitad de una oracion-- y si es una sola, la parte grande es todo.
    if c.gancho:
        trozos = re.split(r"(?<=[.!?])\s+", c.gancho.strip(), maxsplit=1)
        grande = trozos[0]
        detalle = trozos[1] if len(trozos) > 1 else ""
        bl_gancho = ('<div class="hook">'
                     f'<div class="big">{html.escape(grande)}</div>'
                     + (f'<p>{html.escape(detalle)}</p>' if detalle else "")
                     + '</div>')
    else:
        bl_gancho = _hueco(
            "gancho escrito",
            "Lo escribe el operador: es criterio, no dato. Se carga con "
            + CARGA % ("gancho", '"..."'))

    tl = linea_de_tiempo(c)
    bl_sin_fecha = aviso_de_senal_sin_fecha(c)
    bl_sin_buscador = aviso_de_cuenta_sin_buscador_publico(c)
    bl_familias = aviso_de_familias_sin_interlocutor(c)
    bl_interno = bloque_de_lo_interno(c)
    bl_porque = (f'<p style="margin:0 0 12px">{html.escape(c.por_que_ahora)}</p>'
                 if c.por_que_ahora else _hueco(
                     "razon de oportunidad escrita",
                     "La linea de tiempo de abajo es la materia prima; esto es la "
                     "lectura. Se carga con " + CARGA % ("por_que_ahora", '"..."')))

    # --- COMO HABLARLES. El texto del operador va primero y tal cual -- es su
    # criterio y no se toca--; debajo, los grupos de interlocutor que ESTA corrida
    # encontro, para que el guion se pueda aplicar a alguien concreto.
    hablar_op = ("".join(f"<li>{html.escape(t)}</li>" for t in c.como_hablarles)
                 if c.como_hablarles else "")
    bl_hablar = (f'<ul class="simple">{hablar_op}</ul>' if hablar_op else _hueco(
        "guion escrito",
        "El vocabulario y los indicadores que la corrida recogio son la materia "
        "prima. Se carga con " + CARGA % ("como_hablarles", '["...", "..."]')))
    por_tipo: dict[str, list] = {}
    for x in c.poblacion():
        if not x.sigue_en_la_casa:
            continue
        clave, titulo = _tipo_de_interlocutor(x.puesto or "")
        por_tipo.setdefault(titulo, []).append(x.nombre or x.puesto or "?")
    grupos = "".join(
        f'<li><b>{html.escape(t)}</b> — {html.escape(", ".join(gente[:4]))}'
        + (f' y {len(gente) - 4} mas' if len(gente) > 4 else "") + '</li>'
        for t, gente in por_tipo.items())
    # La NOTA DE CANAL. Si el trabajo de esta cuenta entro por un intermediario y
    # esta planta es fria, decirlo aqui evita la llamada que empieza mal: el de
    # Pesqueria no sabe quien es Quimitec, y el de Juarez si.
    hist = c.historia()
    canales = sorted({r.get("canal", "") for r in hist.get("en_otras", [])
                      if r.get("canal")})
    nota_canal = ""
    if canales and hist["veredicto"] == HISTORIA_EN_OTRA_PLANTA:
        nota_canal = (
            '<li class="ojo"><b>Cuidado con el intermediario '
            + html.escape(", ".join(canales)) + '</b> — es nuestro canal en '
            + html.escape(", ".join(hist["plantas"]))
            + ', no en esta planta. Aqui no abre puertas y mencionarlo puede '
              'confundir a quien te contesta.</li>')
    bl_grupos = (f'<ul class="simple">{nota_canal}{grupos}</ul>'
                 if (grupos or nota_canal) else "")

    nav = "".join(f"<code>{html.escape(q)}</code>"
                  for q in busquedas_sales_navigator(c))
    faltantes = no_se_pudo_revisar(c)
    bl_falta = ("".join(f"<li>{html.escape(t)}</li>" for t in faltantes)
                if faltantes else
                "<li>Todas las fuentes previstas se pudieron revisar.</li>")

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(c.empresa)} — ficha de prospeccion</title>
<style>
 /* ------------------------------------------------------------------ paleta
    Los tokens son los del PROTOTIPO APROBADO (#323), con sus nombres y sus
    valores: teal para lo positivo, rojo para el aviso y para "por confirmar",
    ambar para "puesto sin persona" y para la etiqueta de estado, gris para
    contexto y para la barra de la pestana. */
 :root{{--paper:#f5f7f4;--ink:#1b2621;--muted:#66716c;--line:#dde3df;
        --card:#ffffff;--teal:#0f6b5c;--teal-soft:#e2efeb;
        --hot:#b3261e;--hot-bg:#fbe9e7;--ok:#1f7a4d;--ok-bg:#e6f4ec;
        --warn:#b06a00;--warn-bg:#fbf3e3;--gray-bg:#eef1ef}}
 @media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
        --paper:#121815;--ink:#e8efeb;--muted:#9aa8a2;--line:#2a3831;
        --card:#18211d;--teal:#4db5a0;--teal-soft:#183029;--hot:#f2897f;
        --hot-bg:#2c1613;--ok:#5bc98a;--ok-bg:#122a1d;--warn:#e0a94a;
        --warn-bg:#2e2413;--gray-bg:#1e2622}}}}
 :root[data-theme="dark"]{{--paper:#121815;--ink:#e8efeb;--muted:#9aa8a2;
        --line:#2a3831;--card:#18211d;--teal:#4db5a0;--teal-soft:#183029;
        --hot:#f2897f;--hot-bg:#2c1613;--ok:#5bc98a;--ok-bg:#122a1d;
        --warn:#e0a94a;--warn-bg:#2e2413;--gray-bg:#1e2622}}
 *{{box-sizing:border-box}}
 body{{margin:0;background:var(--paper);color:var(--ink);font-size:16px;
       line-height:1.55;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",
       Roboto,"Source Sans 3",sans-serif}}
 .wrap{{max-width:760px;margin:0 auto;padding-block:28px 70px;
        padding-left:18px;padding-right:18px}}

 /* ----------------------------------------------------------- cabecera */
 .kicker{{font-size:12px;letter-spacing:.09em;text-transform:uppercase;
          color:var(--teal);font-weight:700}}
 h1{{margin:6px 0 2px;font-size:30px;font-weight:800;letter-spacing:-.02em;
     line-height:1.1;text-wrap:balance}}
 .sub{{color:var(--muted);font-size:15px;margin:0}}
 .estado{{display:inline-block;margin-top:12px;padding:5px 13px;
          border-radius:999px;font-size:13px;font-weight:700}}
 .estado.fria{{background:var(--warn-bg);color:var(--warn)}}
 .estado.ok{{background:var(--ok-bg);color:var(--ok)}}
 .estado.nil{{background:var(--gray-bg);color:var(--muted)}}

 /* -------------------------------------------------------------- bloques */
 .card{{background:var(--card);border:1px solid var(--line);border-radius:14px;
        padding:20px 22px;margin:18px 0}}
 .card h2{{margin:0 0 12px;font-size:12.5px;letter-spacing:.08em;
           text-transform:uppercase;color:var(--teal);font-weight:700}}
 .hook{{background:var(--teal-soft);border:1px solid var(--teal);
        border-radius:14px;padding:20px 22px;margin:18px 0}}
 .hook .big{{font-size:21px;font-weight:800;color:var(--teal);line-height:1.25;
             letter-spacing:-.01em}}
 .hook p{{margin:12px 0 0;font-size:16px}}
 .aviso{{background:var(--hot-bg);border:1px solid var(--hot);border-radius:12px;
         padding:14px 18px;margin:18px 0}}
 .aviso b{{color:var(--hot)}}
 .aviso p{{margin:6px 0 0;font-size:15px}}

 /* --------------------------------------------------------- por que ahora */
 .timeline{{list-style:none;margin:0;padding:0}}
 .timeline li{{display:grid;grid-template-columns:96px 1fr;gap:12px;
               padding:9px 0;border-bottom:1px solid var(--line)}}
 .timeline li:last-child{{border-bottom:none}}
 .timeline .f{{font-weight:700;color:var(--teal);font-size:14px}}
 .timeline .f.sf{{color:var(--warn)}}
 .timeline .t{{font-size:15px}}

 /* ------------------------------------------------------------ contactos */
 .persona{{display:grid;grid-template-columns:1fr auto;gap:14px;padding:14px 0;
           border-bottom:1px solid var(--line)}}
 .persona:last-child{{border-bottom:none}}
 .persona .nombre{{font-weight:800;font-size:17px}}
 .persona .puesto{{color:var(--muted);font-size:14.5px;margin-top:2px}}
 .persona .porque{{margin-top:6px;font-size:15px}}
 .persona .lado{{text-align:right;min-width:150px}}
 .chip{{display:inline-block;font-size:11.5px;font-weight:700;padding:3px 10px;
        border-radius:6px;margin-bottom:6px}}
 .chip.dec{{background:var(--hot-bg);color:var(--hot)}}
 .chip.pue{{background:var(--warn-bg);color:var(--warn)}}
 .chip.ctx{{background:var(--gray-bg);color:var(--muted)}}
 .chip.tea{{background:var(--teal-soft);color:var(--teal)}}
 /* El correo se parte por CSS, no con un <br>. Ver el comentario de
    `_correo_en_palabras`: un <br> mete un salto de linea en el texto y el correo
    deja de poder copiarse a un campo "Para:". */
 .correo{{display:block;font-family:ui-monospace,Menlo,monospace;font-size:13px;
          color:var(--teal);word-break:break-all}}
 .correo small{{display:block;font-family:inherit;font-size:11.5px;
                color:var(--muted);font-weight:600;word-break:normal}}
 .correo small.ok{{color:var(--ok)}}
 .correo small.flag{{color:var(--hot)}}
 .correo.nil{{color:var(--muted)}}
 .sinpersona{{opacity:.9}}
 .sinpersona .nombre{{color:var(--warn)}}
 .sub-h{{font-size:13px;font-weight:700;color:var(--muted);
         text-transform:uppercase;letter-spacing:.06em;margin:20px 0 4px}}
 .nota-g{{font-size:13.5px;color:var(--muted);margin:2px 0 6px}}

 ul.simple{{margin:8px 0 0;padding-left:20px}}
 ul.simple li{{margin:7px 0;font-size:15.5px}}
 ul.simple li.ojo{{list-style:none;margin-left:-20px;background:var(--hot-bg);
                   color:var(--hot);padding:9px 12px;border-radius:8px}}

 .sn{{background:var(--card);border:1px dashed var(--line);border-radius:10px;
      padding:12px 14px;margin-top:14px}}
 .sn code{{display:block;font-family:ui-monospace,Menlo,monospace;font-size:13px;
           padding:4px 0;color:var(--ink);word-break:break-word}}

 /* -------------------------------------------------------------- medidor */
 .completitud{{display:grid;grid-template-columns:auto 1fr;gap:16px;
               align-items:center}}
 .medidor{{width:110px;height:110px;border-radius:50%;display:grid;
           place-items:center;flex:none}}
 .medidor span{{width:80px;height:80px;border-radius:50%;background:var(--card);
                display:grid;place-items:center;font-weight:800;font-size:22px;
                color:var(--teal)}}
 .completitud p{{margin:0;font-size:15px}}
 .hueco{{background:var(--warn-bg);border:1px solid var(--warn);color:var(--ink);
         border-radius:10px;padding:12px 14px;font-size:15px}}

 /* ------------------------------------------------- pestana tecnica */
 details.tec{{margin:26px 0 0;border:1px solid var(--line);border-radius:14px;
              background:var(--gray-bg)}}
 details.tec>summary{{cursor:pointer;list-style:none;padding:16px 22px;
                      font-weight:700;font-size:14px;color:var(--muted);
                      display:flex;align-items:center;gap:10px;
                      user-select:none}}
 details.tec>summary::-webkit-details-marker{{display:none}}
 details.tec>summary::before{{content:"\\25B8";font-size:14px;
                              transition:transform .15s}}
 details.tec[open]>summary::before{{transform:rotate(90deg)}}
 details.tec>summary .hint{{font-weight:500;font-size:13px;color:var(--muted);
                            margin-left:auto;text-align:right}}
 .tec-body{{padding:0 22px 22px}}
 .tec-body h3{{margin:18px 0 8px;font-size:12px;letter-spacing:.07em;
               text-transform:uppercase;color:var(--muted)}}
 table.tec-t{{width:100%;border-collapse:collapse;font-size:13px;
              background:var(--card);border-radius:8px;overflow:hidden}}
 table.tec-t th{{text-align:left;font-size:11px;text-transform:uppercase;
                 letter-spacing:.05em;color:var(--muted);padding:7px 9px;
                 border-bottom:1px solid var(--line)}}
 table.tec-t td{{padding:7px 9px;border-bottom:1px solid var(--line);
                 vertical-align:top}}
 table.tec-t tr:last-child td{{border-bottom:none}}
 table.tec-t td.c{{text-align:center;white-space:nowrap}}
 .mono{{font-family:ui-monospace,Menlo,monospace;font-size:12px;
        word-break:break-word}}
 .est-ok{{color:var(--ok);font-weight:700}}
 .est-no{{color:var(--muted)}}
 .est-warn{{color:var(--warn);font-weight:700}}
 .tabla-scroll{{overflow-x:auto}}
 .nt{{font-size:12.5px;color:var(--muted);margin:6px 0 12px}}
 ul.cf,ul.sv{{background:var(--warn-bg);border-left:3px solid var(--warn);
              padding:9px 12px 9px 28px;margin:0 0 10px;font-size:13px}}
 .nc{{display:inline-block;font:700 .62rem ui-monospace,Menlo,monospace;
      color:var(--warn);background:var(--warn-bg);border-radius:50%;width:13px;
      height:13px;text-align:center;line-height:13px;margin-left:3px;
      vertical-align:super}}
 code{{font-family:ui-monospace,Menlo,monospace;font-size:13px}}
 a{{color:var(--teal)}}

 .foot{{color:var(--muted);font-size:12.5px;text-align:center;margin-top:26px;
        line-height:1.5}}
 .foot a{{color:var(--teal)}}

 @media (max-width:520px){{
   h1{{font-size:24px}}
   .timeline li{{grid-template-columns:1fr;gap:2px}}
   .persona{{grid-template-columns:1fr}}
   .persona .lado{{text-align:left;min-width:0}}
   .completitud{{grid-template-columns:1fr}}
 }}
 @media print{{body{{background:#fff}} .wrap{{padding:0;max-width:none}}
               details.tec{{display:none}}
               .card,.hook{{page-break-inside:avoid}}}}
</style>
</head>
<body>
<div class="wrap">

<div class="kicker">Ficha de prospeccion · para Rissia</div>
<h1>{html.escape(c.empresa)}{f", planta {html.escape(c.ciudad)}" if c.ciudad else ""}</h1>
<p class="sub">{html.escape(c.giro or "giro sin registrar")}{f" · {html.escape(c.ciudad)}" if c.ciudad else ""} · {len(c.busquedas())} busquedas registradas</p>
<span class="estado {estado_cls}">{html.escape(estado_txt)}</span>

{aviso_rojo(c)}

{bl_gancho}

<div class="card">
<h2>Por que ahora</h2>
{bl_porque}
{bl_interno}
{bl_sin_fecha}
{tl or '<p class="nt">Sin senal registrada en esta corrida.</p>'}
</div>

<div class="card">
<h2>A quien buscar</h2>
{bl_sin_buscador}
{bl_familias}
{f'<div class="sub-h">Decisores de la planta — {n["decisores"]}</div>{b_dec}' if b_dec else '<div class="hueco"><b>Sin decisores con nombre todavia.</b> Lo que sigue en «Lo que falta» es exactamente como conseguirlos.</div>'}
{f'<div class="sub-h">Por confirmar, valen la pena — {n["confirmar"]}</div><p class="nota-g">No estan descartados: les falta una comprobacion, y cual va en su renglon. Un contacto pendiente con su razon visible vale mas que un hueco.</p>{b_con}' if b_con else ''}
{f'<div class="sub-h">De contexto, no son compradores — {n["contexto"]}</div>{b_ctx}' if b_ctx else ''}
</div>

<div class="card">
<h2>Como hablarles</h2>
{bl_hablar}
{bl_grupos}
</div>

<div class="card">
<h2>Lo que falta y donde conseguirlo</h2>
<div class="completitud">{svg}<p>{html.escape(frase)}</p></div>
<p class="nota-g">Busquedas listas para pegar en Sales Navigator</p>
<div class="sn">{nav}</div>
</div>

<div class="card">
<h2>Que no pudimos revisar</h2>
<ul class="simple">{bl_falta}</ul>
</div>


{capa_tecnica(c)}

<div class="foot">
Corrida del {c.creada[:10]} · {len(c.busquedas())} busquedas reales{f' · {len(fuera)} contacto(s) de otras plantas o del corporativo se guardaron para la corrida corporativa' if fuera else ''}{f' · {len(ya_no_estan)} persona(s) quedaron fuera porque una fuente mostro que ya no trabajan ahi' if ya_no_estan else ''}
<br>El detalle de donde salio cada dato esta en la pestana de arriba.
</div>


</div>
</body>
</html>"""


def modo_procedencia(c: Corrida) -> dict:
    """Cada dato con su fuente, su n_fuentes, su nivel. Auditable.

    Y la TABLA DE RENDIMIENTO de esta corrida, calculada sola. Hasta la v0.7.1 esa
    tabla la armaba yo a mano y hacia atras, con mi juicio sobre que contacto era
    de valor -lo dije en #292-. Eso es exactamente lo que la herramienta existe
    para no tener que hacer: un numero que alguien afirma contra uno que el codigo
    deriva.
    """
    return {
        "empresa": c.empresa, "ciudad": c.ciudad,
        "chao1": c.completitud().a_dict(),
        "cobertura": c.cobertura,
        "avisos": c.avisos,
        "rendimiento_por_modulo": c.rendimiento(),
        "rendimiento_por_origen": c.rendimiento_por_origen(),
        "contactos": [x.a_dict() for x in c.contactos],
    }


# `modo_procedencia_html` SE RETIRO en #322. La capa tecnica de `modo_limpio` la
# reemplaza, y el motivo es el que la hacia inutil: eran DOS archivos que habia
# que abrir en orden, asi que nadie abria el segundo -- y la ficha de Pesqueria
# tenia a sus dos mejores contactos solo ahi--. El JSON de auditoria se queda:
# `modo_procedencia()` sigue siendo su fuente, y una maquina lo lee sin ambiguedad.


def tabla_de_rendimiento(c: Corrida) -> str:
    """La misma tabla, legible, para imprimir al cerrar la corrida."""
    L = [f"RENDIMIENTO · {c.empresa}", "",
         f"{'mod':5s} {'cons':>5} {'entr':>5} {'valor':>6} {'ancla':>6} "
         f"{'ent/c':>6} {'val/c':>6}  cobertura"]
    for f in c.rendimiento():
        if not f["consultas"] and not f["entradas"]:
            continue
        ec = "  -  " if f["ent_por_consulta"] is None else f"{f['ent_por_consulta']:>5.2f}"
        vc = "  -  " if f["valor_por_consulta"] is None else f"{f['valor_por_consulta']:>5.2f}"
        L.append(f"{f['modulo']:5s} {f['consultas']:>5} {f['entradas']:>5} "
                 f"{f['de_valor']:>6} {f['con_ancla']:>6} {ec:>6} {vc:>6}  {f['cobertura']}")
    L += ["", f"{'origen':10s} {'cons':>5} {'entr':>5} {'valor':>6} "
              f"{'% valor':>8} {'val/c':>6}"]
    for origen, a in sorted(c.rendimiento_por_origen().items(),
                            key=lambda kv: -(kv[1]["de_valor"])):
        pct = "   -  " if a["pct_del_valor"] is None else f"{a['pct_del_valor']:>6}%"
        vc = "  -  " if a["valor_por_consulta"] is None else f"{a['valor_por_consulta']:>5.2f}"
        L.append(f"{origen:10s} {a['consultas']:>5} {a['entradas']:>5} "
                 f"{a['de_valor']:>6} {pct:>8} {vc:>6}")
    return "\n".join(L)
