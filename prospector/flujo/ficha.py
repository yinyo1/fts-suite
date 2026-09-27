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

from .confianza import CONFIRMADO, EN_CONFLICTO, SOLIDO, CANDIDATO, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO
from .estado import Corrida, RESPONDIO, PENDIENTE
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
INTERLOCUTOR = (
    ("mantenimiento", "Mantenimiento y servicios de planta",
     ("mantenimiento", "maintenance", "facilities", "facilidades", "utilities",
      "servicios auxiliares", "servicios generales", "ehs", "seguridad",
      "higiene", "medio ambiente", "ambiental")),
    ("compras", "Compras y abastecimiento",
     ("compras", "purchasing", "procurement", "comprador", "buyer",
      "abastecimiento", "supply chain", "cadena de suministro")),
    ("direccion", "Direccion y planta",
     ("director", "gerente de planta", "plant manager", "gerente general",
      "gerente de operaciones", "operations manager", "chief", "ceo", "coo")),
    ("ingenieria", "Ingenieria y proyectos",
     ("ingenieria", "engineering", "proyectos", "project", "procesos",
      "process", "control", "automatizacion")),
)

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
            return (valor,
                    f"patron confirmado con {n} correo(s) real(es) de la empresa; "
                    "el buzon de esta persona es probable, no verificado"
                    + salvedad, "sup")
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


def _tipo_de_interlocutor(puesto: str) -> tuple[str, str]:
    p = " ".join(str(puesto or "").lower().split())
    for clave, titulo, palabras in INTERLOCUTOR:
        if any(w in p for w in palabras):
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
    return ('<div class="aviso"><div class="aviso-t">Antes de llamar</div>'
            + "".join(f"<p>{x}</p>" for x in partes) + "</div>")


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
        out.append(f'<div class="tl"><div class="tl-f">{html.escape(f)}</div>'
                   f'<div class="tl-h">{html.escape(t)}</div></div>')
    for _f, t in sin:
        out.append('<div class="tl"><div class="tl-f sf">Sin fecha</div>'
                   f'<div class="tl-h">{html.escape(t)}'
                   '<div class="tl-n">confirmar el ano antes de citarlo</div>'
                   '</div></div>')
    return "".join(out)


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

    def tarjeta(x, tipo: str, razon_extra: str = "") -> str:
        correo, dice, clase = _correo_en_palabras(x)
        planta = _planta_de(x)
        nombre = x.nombre or "(puesto sin persona)"
        chip = tipo
        linea = (f'<div class="mail">{html.escape(correo)}</div>' if correo else "")
        return (
            f'<div class="card">'
            f'<div class="card-h"><div class="card-n">{html.escape(nombre)}</div>'
            f'<span class="chip c-{clase if tipo == "Por confirmar" else "t"}">'
            f'{html.escape(chip)}</span></div>'
            f'<div class="card-p">{html.escape(x.puesto or "puesto sin registrar")}'
            + (f' · {html.escape(planta)}' if planta else "") + '</div>'
            f'<div class="card-q">{html.escape(_por_que_le_importa(x, c))}</div>'
            + (f'<div class="card-r">{html.escape(razon_extra)}</div>'
               if razon_extra else "")
            + linea
            + f'<div class="mail-d {clase}">{html.escape(dice)}</div>'
            '</div>')

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
        def _linea_ctx(x) -> str:
            _correo, dice, clase = _correo_en_palabras(x)
            # Un CONFLICTO se dice incluso en la tarjeta de contexto. Callar un
            # conflicto es afirmar que no hay desacuerdo, y esa regla no depende de
            # que la persona sea decisora: la ficha de Cuprum (#289) se rompio por
            # exactamente esto, con el conflicto guardado y no impreso.
            extra = (f'<div class="mail-d flag">{html.escape(dice)}</div>'
                     if clase == "flag" else "")
            return (f'<li><b>{html.escape(x.nombre or "(puesto sin persona)")}</b> — '
                    f'{html.escape(x.puesto or "puesto sin registrar")}'
                    + (f' · {html.escape(_planta_de(x))}' if _planta_de(x) else "")
                    + extra + '</li>')
        filas = "".join(_linea_ctx(x) for x in contexto)
        b_ctx = (f'<div class="card ctx"><div class="card-h">'
                 f'<div class="card-n">Contexto — {len(contexto)} persona(s)'
                 f'</div><span class="chip c-t">Contexto</span></div>'
                 '<div class="card-q">No compran, y sirven para dos cosas: '
                 'confirmar el organigrama y conseguir el nombre de quien si '
                 f'decide.</div><ul class="ctx-l">{filas}</ul></div>')
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
    # medidor circular, SVG inline: un archivo que se manda por correo no puede
    # depender de una imagen externa.
    r, circ = 34, 2 * 3.14159 * 34
    lleno = circ * ((pct or 0) / 100)
    etiqueta = f"{pct}%" if pct is not None else "n/d"
    svg = (f'<svg class="gauge" viewBox="0 0 80 80" role="img" '
           f'aria-label="cobertura estimada {etiqueta}">'
           f'<circle cx="40" cy="40" r="{r}" class="g-bg"/>'
           f'<circle cx="40" cy="40" r="{r}" class="g-fg" '
           f'stroke-dasharray="{lleno:.1f} {circ:.1f}" '
           f'transform="rotate(-90 40 40)"/>'
           f'<text x="40" y="45" class="g-t">{etiqueta}</text></svg>')
    return (svg, frase)


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
    return "alerta" if estado in ("sin_acceso", "fallo") else "tenue"


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
        '<table><tr><th>Observados</th><th>f1</th><th>f2</th><th>Estimado</th>'
        '<th>Cobertura</th><th>Veredicto</th></tr>'
        f'<tr><td>{est.observados}</td><td>{est.f1}</td><td>{est.f2}</td>'
        f'<td>{est.estimado:.1f}</td><td>{est.cobertura:.0%}</td>'
        f'<td><b>{html.escape(est.veredicto.upper())}</b></td></tr></table>'
        f'<p class="nt">{html.escape(est.por_que)}</p>')

    val = "".join(
        f'<tr><td>{html.escape(f["modulo"])}</td>'
        f'<td class="e-{_clase_de_estado(f["estado"])}">{html.escape(f["estado"])}</td>'
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
            f'<td class="q">{html.escape(campos) or "—"}</td></tr>')

    # LA HISTORIA DECLARADA, con su referencia. El aviso rojo de la capa limpia
    # dice lo que hay que decir en la llamada -- "nunca trabajamos aqui, fue en
    # Juarez via Quimitec"-- y la REFERENCIA de cada proyecto es procedencia: #310
    # exige que la ficha la cite, y este es su lugar.
    hist = c.historia()
    regs = hist.get("aqui", []) + hist.get("en_otras", [])
    hist_t = ("" if not regs else (
        '<h3>Historia declarada de la cuenta</h3>'
        '<table><tr><th>Referencia</th><th>Planta</th><th>Que fue</th>'
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
            f'<td class="q">{html.escape(b.consulta)}</td>'
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
<summary>Detalle tecnico: como se obtuvieron estos datos
<span class="hint">para validar o auditar — no hace falta abrirlo para llamar</span>
</summary>

<h3>Completitud estimada (Chao1)</h3>
{chao}

<h3>Nivel por contacto y por campo</h3>
<table><tr><th>Quien</th><th>Nivel</th><th>Cercania</th><th>Hits</th>
<th>Nivel por campo</th></tr>
{niveles_t}</table>
<p class="nt">N1 nombre completo · N2 parcial · N3 puesto sin persona.
CONF confirmado (2+ raices) · SOL solido (1 fuente fiable) · CAND candidato ·
CONFLICTO dos fuentes que no coinciden. Una sola fuente topa en SOLIDO.</p>

<h3>Checklist por modulo</h3>
<table><tr><th>Modulo</th><th>Estado</th><th>Razon</th><th>Agotado</th></tr>
{val}</table>

{seccion("Contactos en revision humana",
         f'<table><tr><th>Quien</th><th>Puesto</th><th>Motivo exacto</th></tr>{rev}</table>' if rev else "")}

{hist_t}
{alias_t}
{seccion("Fuera de la poblacion de esta planta",
         (f'<table><tr><th>Puesto</th><th>Ubicacion observada</th><th>Donde</th></tr>{f_fuera}</table>'
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
         ('<table><tr><th>Alias</th><th>Salieron</th><th>Poblacion</th>'
          f'<th>Chao1</th><th>Veredicto</th></tr>{quitados}</table>') if quitados else "")}

<h3>Todas las busquedas — {todas}</h3>
<table><tr><th>Mod</th><th>Via</th><th>Consulta</th><th>Res</th><th>Fecha</th>
<th>Liga</th></tr>
{"".join(fuentes) or '<tr><td colspan="6"><i>Sin busquedas.</i></td></tr>'}</table>
<p class="nt">Las ligas llevan <span class="nc">?</span> porque su FORMA se
verifico al registrarlas y su CONTENIDO no: abrirlas exige WebFetch, bloqueado
por egress en este entorno.</p>

{seccion("Avisos de la corrida", f"<ul>{avisos}</ul>" if avisos else "")}

<h3>La corrida</h3>
<table>
<tr><th>Fecha</th><td>{html.escape(c.creada[:19])}</td></tr>
<tr><th>Llave</th><td><code>{html.escape(c.llave)}</code></td></tr>
<tr><th>Busquedas registradas</th><td>{todas} ({unicas} consultas unicas)</td></tr>
<tr><th>Presupuesto gastado</th><td>{c.presupuesto.gastadas} de
    {c.presupuesto.tope_por_cuenta}</td></tr>
<tr><th>Version de la herramienta</th><td><code>{html.escape(sl["version"])}</code></td></tr>
<tr><th>Commit</th><td><code>{html.escape(sl["commit"])}</code></td></tr>
<tr><th>Firma del estado</th><td>{html.escape(firma)}</td></tr>
</table>
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
    bl_gancho = (f'<div class="gancho">{html.escape(c.gancho)}</div>'
                 if c.gancho else _hueco(
                     "gancho escrito",
                     "Lo escribe el operador: es criterio, no dato. Se carga con "
                     + CARGA % ("gancho", '"..."')))

    tl = linea_de_tiempo(c)
    bl_porque = (f'<div class="gancho">{html.escape(c.por_que_ahora)}</div>'
                 if c.por_que_ahora else _hueco(
                     "razon de oportunidad escrita",
                     "La linea de tiempo de abajo es la materia prima; esto es la "
                     "lectura. Se carga con " + CARGA % ("por_que_ahora", '"..."')))

    # --- COMO HABLARLES. El texto del operador va primero y tal cual -- es su
    # criterio y no se toca--; debajo, los grupos de interlocutor que ESTA corrida
    # encontro, para que el guion se pueda aplicar a alguien concreto.
    hablar_op = ("".join(f"<li>{html.escape(t)}</li>" for t in c.como_hablarles)
                 if c.como_hablarles else "")
    bl_hablar = (f'<ul>{hablar_op}</ul>' if hablar_op else _hueco(
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
    bl_grupos = (f'<ul class="gr">{nota_canal}{grupos}</ul>'
                 if (grupos or nota_canal) else "")

    nav = "".join(f"<li><code>{html.escape(q)}</code></li>"
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
 :root{{--paper:#f5f7f4;--card:#fff;--ink:#12201e;--ink2:#3d4b48;--ink3:#6c7975;
        --line:#dde3df;--line2:#c9d2cd;--accent:#0f6b5c;--accent-s:#e3efeb;
        --ok:#1f7a4d;--ok-s:#e4f1e9;--sup:#9a6608;--sup-s:#f8eed8;
        --nil:#6c7975;--nil-s:#eceeed;--flag:#a93520;--flag-s:#fae9e5;
        --shadow:0 1px 2px rgba(18,32,30,.06),0 8px 24px -16px rgba(18,32,30,.22);
        --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
        --body:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}}
 @media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{
        --paper:#0e1614;--card:#151f1d;--ink:#e8efec;--ink2:#b3c1bc;--ink3:#849690;
        --line:#26332f;--line2:#334440;--accent:#5cc9b0;--accent-s:#16302b;
        --ok:#6ed19b;--ok-s:#142b20;--sup:#e0ac4d;--sup-s:#33260f;
        --nil:#849690;--nil-s:#1d2724;--flag:#f08a71;--flag-s:#341811;
        --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -16px rgba(0,0,0,.8)}}}}
 :root[data-theme="dark"]{{--paper:#0e1614;--card:#151f1d;--ink:#e8efec;
        --ink2:#b3c1bc;--ink3:#849690;--line:#26332f;--line2:#334440;
        --accent:#5cc9b0;--accent-s:#16302b;--ok:#6ed19b;--ok-s:#142b20;
        --sup:#e0ac4d;--sup-s:#33260f;--nil:#849690;--nil-s:#1d2724;
        --flag:#f08a71;--flag-s:#341811}}
 *{{box-sizing:border-box}}
 body{{font:16px/1.6 var(--body);color:var(--ink);background:var(--paper);
       margin:0;padding:0}}
 .wrap{{max-width:780px;margin:0 auto;padding-block:32px;padding-left:16px;
        padding-right:16px}}
 .kicker{{font:600 .72rem var(--body);letter-spacing:.11em;text-transform:uppercase;
          color:var(--accent);margin-bottom:8px}}
 h1{{font-size:2rem;line-height:1.15;margin:0;text-wrap:balance;
     letter-spacing:-.02em}}
 .sub{{color:var(--ink3);font-size:.95rem;margin-top:6px}}
 .edo{{display:inline-block;margin-top:14px;font:600 .8rem var(--body);
       padding:5px 12px;border-radius:999px}}
 .edo.fria{{background:var(--flag-s);color:var(--flag)}}
 .edo.ok{{background:var(--ok-s);color:var(--ok)}}
 .edo.nil{{background:var(--nil-s);color:var(--nil)}}
 h2{{font:600 .78rem var(--body);letter-spacing:.1em;text-transform:uppercase;
     color:var(--ink3);margin:40px 0 12px;padding-bottom:6px;
     border-bottom:1px solid var(--line)}}
 h3{{font-size:.95rem;margin:22px 0 6px;color:var(--ink2)}}
 .aviso{{background:var(--flag-s);border-left:4px solid var(--flag);
         padding:16px 18px;margin:24px 0 0;border-radius:4px}}
 .aviso-t{{font:700 .74rem var(--body);letter-spacing:.1em;
           text-transform:uppercase;color:var(--flag);margin-bottom:8px}}
 .aviso p{{margin:0 0 10px;font-size:.93rem;color:var(--ink)}}
 .aviso p:last-child{{margin-bottom:0}}
 .gancho{{background:var(--accent-s);border-left:4px solid var(--accent);
          padding:16px 18px;font-size:1.08rem;line-height:1.5;border-radius:4px}}
 .tl{{display:flex;gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}}
 .tl:last-child{{border-bottom:0}}
 .tl-f{{flex:0 0 5.5rem;font:700 .82rem var(--mono);color:var(--accent);
        padding-top:2px}}
 .tl-f.sf{{color:var(--sup)}}
 .tl-h{{flex:1;font-size:.95rem}}
 .tl-n{{font-size:.82rem;color:var(--sup);margin-top:2px}}
 .card{{background:var(--card);border:1px solid var(--line);border-radius:6px;
        padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow)}}
 .card-h{{display:flex;align-items:baseline;gap:10px;justify-content:space-between}}
 .card-n{{font-size:1.14rem;font-weight:650;letter-spacing:-.01em}}
 .card-p{{color:var(--ink2);font-size:.9rem;margin-top:2px}}
 .card-q{{font-size:.9rem;color:var(--ink2);margin-top:8px}}
 .card-r{{font-size:.88rem;color:var(--sup);background:var(--sup-s);
          padding:7px 10px;border-radius:4px;margin-top:8px}}
 .chip{{flex:0 0 auto;font:600 .68rem var(--body);letter-spacing:.06em;
        text-transform:uppercase;padding:3px 9px;border-radius:999px;
        background:var(--nil-s);color:var(--nil);white-space:nowrap}}
 .chip.c-t{{background:var(--accent-s);color:var(--accent)}}
 .chip.c-sup,.chip.c-flag{{background:var(--sup-s);color:var(--sup)}}
 .mail{{font:.86rem var(--mono);color:var(--ink);margin-top:10px;
        word-break:break-all}}
 .mail-d{{font-size:.82rem;margin-top:2px}}
 .mail-d.ok{{color:var(--ok)}} .mail-d.sup{{color:var(--sup)}}
 .mail-d.nil{{color:var(--ink3)}} .mail-d.flag{{color:var(--flag)}}
 .ctx-l{{margin:8px 0 0;padding-left:20px;font-size:.9rem;color:var(--ink2)}}
 .gr{{padding-left:20px;font-size:.92rem;color:var(--ink2)}}
 .gr li.ojo{{color:var(--flag);list-style:none;margin-left:-20px;
             background:var(--flag-s);padding:9px 12px;border-radius:4px}}
 .cob{{display:flex;gap:18px;align-items:center;background:var(--card);
       border:1px solid var(--line);border-radius:6px;padding:16px}}
 .gauge{{flex:0 0 76px;width:76px;height:76px}}
 .g-bg{{fill:none;stroke:var(--line2);stroke-width:8}}
 .g-fg{{fill:none;stroke:var(--accent);stroke-width:8;stroke-linecap:round}}
 .g-t{{font:700 17px var(--body);fill:var(--ink);text-anchor:middle}}
 .hueco{{background:var(--sup-s);border-left:4px solid var(--sup);
         padding:12px 14px;font-size:.92rem;border-radius:4px;color:var(--ink)}}
 ul.nav{{padding-left:0;list-style:none}}
 ul.nav li{{margin:6px 0}}
 ul.nav code{{display:block;font:.82rem var(--mono);background:var(--card);
              border:1px solid var(--line);border-radius:4px;padding:9px 11px;
              word-break:break-word}}
 .pie{{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);
       color:var(--ink3);font-size:.85rem}}
 details.tec{{margin-top:32px;background:var(--card);border:1px solid var(--line);
              border-radius:6px}}
 details.tec>summary{{cursor:pointer;padding:14px 16px;font-weight:600;
                      font-size:.92rem;color:var(--ink2)}}
 details.tec .hint{{display:block;font-weight:400;font-size:.82rem;
                    color:var(--ink3);margin-top:3px}}
 details.tec>*:not(summary){{margin-left:16px;margin-right:16px}}
 details.tec>*:last-child{{margin-bottom:16px}}
 details.tec table{{width:calc(100% - 0px);border-collapse:collapse;
                    font-size:.82rem;margin:6px 0 4px}}
 details.tec th{{text-align:left;font-size:.7rem;text-transform:uppercase;
                 letter-spacing:.05em;color:var(--ink3);padding:5px 7px;
                 border-bottom:1px solid var(--line)}}
 details.tec td{{padding:5px 7px;border-bottom:1px solid var(--line);
                 vertical-align:top}}
 details.tec td.c{{text-align:center;white-space:nowrap}}
 details.tec td.q{{font:.76rem var(--mono);word-break:break-word}}
 .nt{{font-size:.8rem;color:var(--ink3);margin:4px 0 12px}}
 .nc{{display:inline-block;font:700 .62rem var(--mono);color:var(--sup);
      background:var(--sup-s);border-radius:50%;width:13px;height:13px;
      text-align:center;line-height:13px;margin-left:3px;vertical-align:super}}
 ul.cf,ul.sv{{background:var(--sup-s);border-left:3px solid var(--sup);
              padding:9px 12px 9px 28px;margin:0 0 10px;font-size:.84rem}}
 .e-alerta{{color:var(--sup);font-weight:600}}
 .e-tenue{{color:var(--ink3)}}
 code{{font:.82rem var(--mono)}}
 a{{color:var(--accent)}}
 .tabla-scroll{{overflow-x:auto}}
 @media (max-width:520px){{
   h1{{font-size:1.6rem}}
   .tl{{flex-direction:column;gap:2px}}
   .tl-f{{flex:none}}
   .cob{{flex-direction:column;align-items:flex-start}}
 }}
 @media print{{body{{background:#fff}} .wrap{{padding:0;max-width:none}}
               details.tec{{display:none}} h2{{page-break-after:avoid}}
               .card{{page-break-inside:avoid;box-shadow:none}}}}
</style>
</head>
<body>
<div class="wrap">

<div class="kicker">Ficha de prospeccion · para Rissia</div>
<h1>{html.escape(c.empresa)}{f" — {html.escape(c.ciudad)}" if c.ciudad else ""}</h1>
<div class="sub">{html.escape(c.giro or "giro sin registrar")}{f" · {html.escape(c.ciudad)}" if c.ciudad else ""}</div>
<div class="edo {estado_cls}">{html.escape(estado_txt)}</div>

{aviso_rojo(c)}

<h2>Gancho</h2>
{bl_gancho}

<h2>Por que ahora</h2>
{bl_porque}
{f'<div style="margin-top:14px">{tl}</div>' if tl else '<p class="nt">Sin senal registrada en esta corrida.</p>'}

<h2>A quien buscar</h2>
{f'<h3>Decisores de la planta — {n["decisores"]}</h3>{b_dec}' if b_dec else '<p class="hueco"><b>Sin decisores con nombre todavia.</b> Lo que sigue en «Lo que falta» es exactamente como conseguirlos.</p>'}
{f'<h3>Por confirmar, valen la pena — {n["confirmar"]}</h3><p class="nt">No estan descartados: les falta una comprobacion, y cual va en su tarjeta. Un contacto pendiente con su razon visible vale mas que un hueco.</p>{b_con}' if b_con else ''}
{f'<h3>De contexto, no son compradores — {n["contexto"]}</h3>{b_ctx}' if b_ctx else ''}

<h2>Como hablarles</h2>
{bl_hablar}
{bl_grupos}

<h2>Lo que falta y donde conseguirlo</h2>
<div class="cob">{svg}<div>{html.escape(frase)}</div></div>
<h3>Busquedas listas para pegar en Sales Navigator</h3>
<ul class="nav">{nav}</ul>

<h2>Que no pudimos revisar</h2>
<ul>{bl_falta}</ul>

<div class="pie">
Corrida del {c.creada[:10]} · {len(c.busquedas())} busquedas reales
{f' · {len(fuera)} contacto(s) de otras plantas o del corporativo se guardaron para la corrida corporativa' if fuera else ''}
{f' · {len(ya_no_estan)} persona(s) quedaron fuera porque una fuente mostro que ya no trabajan ahi' if ya_no_estan else ''}.
<br>El detalle de donde salio cada dato esta en la pestana de abajo.
</div>

{capa_tecnica(c)}

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
