"""Una planta nueva no es una señal: son DOS, con dos compradores distintos.

DECISION 1 de #382, y el contexto de negocio que la motiva es de Esteban:

  * **Durante la construcción compra el EPC**, el que trae la planta llave en mano.
    FTS no compite con él: le vende como subcontratista de especialidad --
    eléctrico, tubería, automatización--. Y ese EPC trae MAS obra en la región: el
    caso BIC, donde el constructor traía varios proyectos más detrás.
  * **Después de la inauguración, de 12 a 18 meses, compra el usuario.** Lo que el
    EPC no alcanzó, la segunda línea, la ampliación de carga, las mejoras.

QUE ESTABA MAL. El radar puntuaba `obra_nueva_integral` alto -- bien-- y la trataba
como UNA sola puerta, y mandaba a buscar al usuario. En fase de obra arrancada eso
es hablarle a quien todavía no tiene planta, mientras el que está comprando hoy es
un constructor cuyo nombre ni se buscó.

LAS TRES PUERTAS QUE ESTE MODULO EMITE:

  (a) `epc`               quien construye. Angulo de subcontratista de especialidad.
  (b) `usuario`           la empresa dueña. Angulo de «lo que falta después del
                          arranque», con ventana de 18 meses desde la inauguración
                          en vez de la frescura normal de la nota.
  (c) `expansion_lateral` cuando la cuenta YA tiene relación con FTS por otra
                          división o como canal. No es fría y no se archiva: la
                          relación existente es la carta de presentación.

LO QUE ESTE MODULO NO HACE. No puntúa de nuevo la señal: el puntaje de la señal lo
pone `radar.evaluar` y aquí se reusa. Lo que cada puerta agrega es su propio
puntaje de OPORTUNIDAD -- qué tan abierta está hoy-- y su interlocutor, que es el
dato que faltaba.
"""
from __future__ import annotations

import re
from datetime import date

from .catalogo_proyectos import plano
from .expansion import que_sigue
from .radar import (FASE_ANUNCIO, FASE_INAUGURADA, FASE_OBRA_ARRANCADA,
                    TIPO_INTEGRAL_OBRA_NUEVA, cargar_catalogo,
                    dias_de_antiguedad, evaluar, fase_de_obra)
from .ubicacion_de_proyectos import relacion_de_grupo, trabajo_via_canal

PUERTA_EPC = "epc"
PUERTA_USUARIO = "usuario"
PUERTA_LATERAL = "expansion_lateral"
PUERTA_VIA_CANAL = "planta_ya_intervenida"
PUERTA_USUARIO_DIRECTO = "usuario_directo"
PUERTA_LICITACION = "licitacion_publica"

ABIERTA = "abierta"
CERRADA = "cerrada"
FUTURA = "futura"
DESCONOCIDA = "desconocida"

# ===================================================== la ventana del usuario
#
# CONFIRMADA POR ESTEBAN EL 2026-10-06 (decision 1 de #382). Sigue siendo CRITERIO
# DECLARADO Y NO MEDICION, y por eso viaja etiquetada: «después de la inauguración,
# 12 a 18 meses, compra el usuario». El lazo 3 del motor 3 es el que va a corregir
# estos tramos cuando haya cierres que los contradigan -- confirmar un criterio no lo
# vuelve un dato--.
#
# Y la escala va AL REVES de la frescura normal, que es lo interesante: una nota
# fresca vale más, pero una planta recién inaugurada vale MENOS -- todavía está
# digiriendo la obra y el EPC acaba de entregar--. El valor sube con el tiempo
# hasta el mes 18 y después la puerta se cierra.
MESES_DE_LA_VENTANA_DEL_USUARIO = 18
ESCALA_DEL_USUARIO = (
    # (hasta este mes, puntos, por que)
    (6, 8, "recien inaugurada: todavia esta digiriendo la obra y el EPC acaba de "
           "entregar. Se habla, pero sin esperar orden"),
    (12, 18, "empieza a aparecer lo que el EPC no alcanzo, y ya hay quien lo note "
             "porque la planta lleva medio anio corriendo"),
    (MESES_DE_LA_VENTANA_DEL_USUARIO, 25,
     "la ventana que Esteban nombro: segunda linea, ampliacion de carga y mejoras "
     "se presupuestan aqui"),
)
DIAS_POR_MES = 30.44  # promedio del anio gregoriano: 365.25 / 12

# ==================================== cuanto dura una obra antes de que el EPC se vaya
#
# CONFIRMADO POR ESTEBAN EL 2026-10-06 (decision 1 de #382), con su razon: «una planta
# industrial normal cierra entre 12 y 20 meses; 24 es tope». Sigue siendo CRITERIO
# DECLARADO Y NO MEDICION, y el lazo 3 lo corrige cuando haya cierres. Nace de
# un caso de la corrida: Doosan Bobcat puso su primera piedra el 13-jun-2024, o sea
# hace 846 dias, y la puerta del EPC salia «ABIERTA · 25 -- hay un EPC comprando
# especialidad AHORA--». No lo hay: una planta de 65,000 m2 no lleva dos anos y
# cuatro meses en obra, y la nota misma decia que arrancaba operaciones a principios
# de 2026. Mandar a alguien a buscar al constructor de esa obra es mandarlo a buscar
# a quien ya se fue.
#
# Es el mismo defecto que Yokohama, por el otro lado: ahi una frase de FUTURO
# ponia la obra en el pasado; aqui una fecha VIEJA la deja en el presente. La fase
# dice en que momento estaba la obra EL DIA DE LA NOTA, no hoy, y cuando la nota es
# vieja las dos cosas dejan de ser lo mismo.
#
# No se cierra la puerta ni se abre la del usuario: no se sabe si la planta ya
# inauguro, y el radar NO inventa una inauguracion que ninguna fuente dice. Se
# declara DESCONOCIDA con el trabajo que falta -- averiguar si ya opera-- , que es
# lo unico honesto con lo que el texto dice.
MESES_MAXIMOS_DE_OBRA = 24

ANGULO_EPC = ("subcontratista de especialidad: electrico, tuberia y automatizacion. "
              "FTS no compite con el EPC, le entrega la especialidad que el EPC "
              "subcontrata, y un EPC que ya tiene a FTS en su lista la vuelve a usar "
              "en la siguiente obra de la region")
ANGULO_USUARIO = ("lo que el EPC no alcanzo: segunda linea, ampliacion de carga, "
                  "mejoras y lo que quedo en lista de pendientes al arrancar")


# ============================= la obra que compra por licitacion publica
#
# DECISION 2 de #382, de Esteban: «CFE: NO abras puerta A. Sale a licitacion publica;
# es otra puerta con otras reglas».
#
# La senal de CFE -- 8,900 MDP para cuatro subestaciones nuevas en Nuevo Leon-- es la
# mas on-target de la corrida para una casa electrica, y el radar le abria la puerta
# del usuario directo con el angulo de siempre: «lo contrata mantenimiento o proyectos
# de la planta». En una empresa del Estado eso es falso y hace perder el tiempo: no lo
# contrata un gerente de planta al que se pueda llamar, sale a concurso y se gana
# cumpliendo requisitos ANTES de que el concurso exista. Quien no esta en el padron de
# contratistas el dia de la convocatoria no puede ni participar.
#
# Por eso la lista es DECLARADA y no adivinada del texto: de que una obra sea publica
# depende quien la paga, no como esta escrita la nota.
ENTIDADES_DE_COMPRA_PUBLICA = {
    "cfe": "Comision Federal de Electricidad",
    "comision federal de electricidad": "Comision Federal de Electricidad",
    "pemex": "Petroleos Mexicanos",
    "imss": "Instituto Mexicano del Seguro Social",
    "issste": "ISSSTE",
    "conagua": "Comision Nacional del Agua",
    "sacmex": "Sistema de Aguas de la Ciudad de Mexico",
    "servicios de agua y drenaje de monterrey": "SADM",
}
ANGULO_LICITACION = (
    "esta obra no se vende, se concursa. El trabajo es ANTES del concurso: alta y "
    "vigencia en el padron de contratistas y proveedores de la entidad, y seguimiento "
    "de la convocatoria en CompraNet. Lo que FTS puede ofrecer -- especialidad "
    "electrica, subestacion, media tension-- se acredita con los proyectos del "
    "catalogo como experiencia comprobable, y hay una segunda via mas corta: entrar "
    "como subcontratista de especialidad del contratista que gane"
)


def entidad_de_compra_publica(empresa: str) -> str:
    """El nombre de la entidad si esta cuenta compra por licitacion, o cadena vacia.

    Se compara contra la lista DECLARADA, por palabra y no por subcadena: «CFE» no
    debe cazar «CFE Nuevo Leon» por accidente de letras sino por ser esa entidad, y
    una empresa privada que lleve esas letras adentro no debe caer aqui.
    """
    p = plano(empresa)
    for clave, nombre in ENTIDADES_DE_COMPRA_PUBLICA.items():
        if p == clave or p.startswith(clave + " ") or f" {clave} " in f" {p} ":
            return nombre
    return ""


# ===================== la ampliacion: hay obra, y la planta YA opera
#
# DECISION 2 de #382, de Esteban: «HYUNDAI WIA: abre la puerta A. Una ampliacion de
# 31,350 m2 lleva contratista general».
#
# Una ampliacion no es una planta nueva -- no «compra una de cada cosa»-- pero tampoco
# es equipo suelto: se construye, y lo construye alguien. Y a diferencia de la obra
# nueva, la planta del lado ya esta operando, asi que la puerta del usuario NO es
# futura: el usuario esta ahi hoy. Una ampliacion abre las DOS al mismo tiempo, que es
# lo que la obra nueva no hace.
#
# El interlocutor de la puerta A no se llama EPC aqui: en una ampliacion normalmente
# es un CONTRATISTA GENERAL, mas chico y mas cercano, y a veces lo coordina el dueno.
# Se nombra distinto porque se busca distinto.
#
# Y el puntaje NO se toca: la decision 2 habla de puertas. Meter «ampliacion de N m2»
# a TERMINOS_DE_TIPO le daria los 44.4 del tipo integral, que son de la planta que
# compra una de cada cosa, y una ampliacion de 31,350 m2 no lo es.
_AMPLIACION = re.compile(
    r"\b(amplia|ampliacion|expansion|expande)\b[^.;]{0,80}?"
    r"\b\d[\d,.\s]*\s*(metros cuadrados|m2|mil metros|pies cuadrados|hectareas)",
    re.I)


def obra_de_ampliacion(texto: str) -> bool:
    """Una ampliacion con superficie declarada: hay obra y hay quien la construya."""
    return bool(_AMPLIACION.search(plano(texto)))


def _como_se_busca_al_constructor(senal: dict, quien: str = "EPC") -> str:
    """Las consultas para hallar a quien construye, EN EL ORDEN QUE SI CONTESTO.

    Decision 3 de #382. La corrida del 5-oct midio las tres formas de preguntar:
      · «que constructoras industriales hay en Monterrey» -> DIRECTORIOS, cero obras.
      · «quien construye la planta de X» -> las notas dan monto, empleos y fecha, y
        ninguna nombra al constructor. Negativo explicito en el caso de La Moderna.
      · por PARQUE -> es la que contesto. El dueno del parque sabe quien construye
        adentro, lo publica, y de paso dice que mas trae en la region.
    Asi que el parque va primero, y la pregunta por la planta queda de respaldo.
    """
    parque = (senal.get("parque") or "").strip()
    empresa = senal.get("empresa") or ""
    municipio = senal.get("planta") or ""
    if parque:
        return (f"POR EL PARQUE, que es la que contesto en la medicion: «quien "
                f"construye en {parque}», «{parque} obra en construccion {empresa}», "
                f"«{parque} constructora naves». De respaldo, por la planta: "
                f"«constructora \"{empresa}\" planta {municipio}».")
    return (f"la nota no nombra el parque, que es por donde si se encuentra. Primero "
            f"hay que sacarlo: «{empresa} {municipio} parque industrial». Con el "
            f"parque en mano, «quien construye en <parque>». De respaldo, y midio "
            f"peor: «constructora \"{empresa}\" planta {municipio}», «quien "
            f"construye la planta de {empresa}».")


def _cuanto_hace(meses: float) -> str:
    """«a 11 dias» o «a 10 meses». Decirle «a 0 mes(es)» a algo de hace 12 dias es
    redondear hasta volver el dato ilegible."""
    if meses < 1:
        return f"a {meses * DIAS_POR_MES:.0f} dia(s)"
    return f"a {meses:.0f} mes(es)"


def _puntos_del_usuario(meses: float | None) -> tuple[float, str]:
    """Cuanto vale la puerta del usuario a los `meses` de la inauguracion."""
    if meses is None:
        return (0.0, "no hay fecha de inauguracion: la puerta no se puede fechar")
    if meses < 0:
        return (0.0, f"la planta no esta inaugurada todavia (faltan "
                     f"{abs(meses):.0f} mes(es)): la puerta se abre entonces")
    for tope, puntos, por_que in ESCALA_DEL_USUARIO:
        if meses < tope:
            return (float(puntos), f"{_cuanto_hace(meses)} de la inauguracion: "
                                   f"{por_que}")
    return (0.0, f"{_cuanto_hace(meses)} de la inauguracion, la ventana de "
                 f"{MESES_DE_LA_VENTANA_DEL_USUARIO} meses ya cerro")


def _obra_demasiado_vieja(senal: dict, hoy) -> bool:
    """La nota dice «obra arrancada», pero ¿hace cuanto lo dijo?

    La fase describe el momento de la obra EL DIA DE LA NOTA. Cuando la nota tiene
    mas de `MESES_MAXIMOS_DE_OBRA`, esa descripcion ya no habla de hoy.
    """
    d = dias_de_antiguedad(senal.get("fecha"), hoy)
    return d is not None and d > MESES_MAXIMOS_DE_OBRA * DIAS_POR_MES


def _meses_desde(fecha: str | None, hoy: date | None = None) -> float | None:
    d = dias_de_antiguedad(fecha, hoy)
    return None if d is None else d / DIAS_POR_MES


def _lo_que_sigue(senal: dict, catalogo: dict) -> list[str]:
    """Los tipos de proyecto que el historial dice que siguen, para el angulo.

    Sale de `expansion.que_sigue`, que lo mide por co-ocurrencia en el catalogo. Si
    la senal no nombra un tipo concreto -- una obra integral no lo nombra-- se usa
    el proceso de la cuenta para no inventar nada.
    """
    tipos = senal.get("tipos_que_nombra") or []
    concretos = [t for t in tipos if t != TIPO_INTEGRAL_OBRA_NUEVA]
    if not concretos:
        return []
    out = []
    for t in concretos[:2]:
        for s in que_sigue(t, catalogo, cuantos=2):
            if s["tipo"] not in out:
                out.append(s["tipo"])
    return out[:3]


def puertas_de(senal: dict, catalogo: dict | None = None,
               hoy: date | None = None, evaluacion: dict | None = None) -> dict:
    """Las puertas de una senal, con su interlocutor y su angulo.

    `senal` puede traer dos campos nuevos y OPCIONALES:
      `epc`           quien construye, si la nota lo dice. Si falta, la puerta (a)
                      sale con «por identificar» y la busqueda armada.
      `inauguracion`  la fecha de inauguracion, si se conoce. Si la senal YA es de
                      una inauguracion, se usa su propia fecha.
    """
    catalogo = catalogo if catalogo is not None else cargar_catalogo()
    ev = evaluacion if evaluacion is not None else evaluar(senal, catalogo, hoy=hoy)
    fase, termino, otras = fase_de_obra(
        " ".join(str(senal.get(k) or "") for k in ("texto", "nota", "asunto")))
    es_obra_nueva = TIPO_INTEGRAL_OBRA_NUEVA in (ev.get("tipos_que_nombra") or [])

    puertas: list[dict] = []
    avisos: list[str] = []

    # ------------------------------------------------- (c) la expansion lateral
    grupo = relacion_de_grupo(senal.get("empresa") or "")
    if grupo:
        puertas.append({
            "puerta": PUERTA_LATERAL,
            "estado": ABIERTA,
            "interlocutor": f"{senal.get('empresa')} — division nueva",
            "puntos_de_oportunidad": 0.0,
            "por_que": ("misma cuenta, otra division. No es una cuenta fria y "
                        "tampoco es un cliente de esta planta"),
            "la_relacion_existente_es_con": grupo.get("grupo"),
            "tipo_de_relacion": grupo.get("relacion"),
            "angulo": grupo.get("linea_para_la_carta", ""),
            "lo_que_NO_se_puede_decir": grupo.get("lo_que_NO_se_puede_decir", ""),
        })
        avisos.append(
            f"EXPANSION LATERAL: esta cuenta ya tiene relacion con FTS a traves "
            f"del grupo {grupo.get('grupo')} ({grupo.get('relacion')}). La senal "
            f"probablemente es de OTRA division, donde FTS no tiene historia. La "
            f"relacion existente es carta de presentacion, no es una venta previa "
            f"en esta planta.")

    # --------------------------- (c bis) la planta que FTS ya intervino por canal
    canal = trabajo_via_canal(senal.get("empresa") or "")
    if canal:
        puertas.append({
            "puerta": PUERTA_VIA_CANAL,
            "estado": ABIERTA,
            "interlocutor": senal.get("empresa"),
            "puntos_de_oportunidad": 0.0,
            "por_que": ("NO es una cuenta fria: FTS ya intervino esta instalacion, "
                        "pero le facturo al canal"),
            "la_relacion_existente_es_con": canal.get("canal"),
            "tipo_de_relacion": "trabajo_via_canal",
            "que_se_hizo": canal.get("que_se_hizo"),
            "lo_mas_reciente": canal.get("lo_mas_reciente"),
            "angulo": (f"FTS conoce esta instalacion por dentro: {canal.get('que_se_hizo')}. "
                       f"El trabajo se facturo a {canal.get('canal')}, y la referencia "
                       f"se puede pedir ahi antes de llamar."),
            "lo_que_NO_se_puede_decir": (
                "«Ya trabajamos con ustedes». El de la planta puede no saber que FTS "
                "existe: lo contrato su proveedor de quimica. Se cae en cuanto busque "
                "una orden a nombre de FTS y no encuentre ninguna."),
        })
        avisos.append(
            f"PLANTA YA INTERVENIDA: FTS trabajo en esta instalacion via "
            f"{canal.get('canal')} ({canal.get('que_se_hizo')}, lo mas reciente "
            f"{canal.get('lo_mas_reciente')}). NO es descubrimiento. Y los leads NO "
            f"cuelgan del partner de esta cuenta: cuelgan del canal, asi que un cruce "
            f"por partner_id no los ve."
            + (f" {canal['ojo']}" if canal.get("ojo") else ""))

    # ---------------------------- (e) la obra que se concursa, no se vende
    #
    # Va ANTES de las otras puertas y en vez de ellas: en una entidad publica no hay
    # un gerente de planta que decida ni un EPC al que venderle especialidad por
    # fuera del concurso. Emitir aqui tambien la puerta del usuario directo seria
    # mandar a alguien a llamarle a quien no puede comprar.
    entidad = entidad_de_compra_publica(senal.get("empresa") or "")
    if entidad:
        puertas.append({
            "puerta": PUERTA_LICITACION,
            "estado": ABIERTA,
            "interlocutor": f"{entidad} — area de concursos y padron de contratistas",
            "puntos_de_oportunidad": 22.0,
            "por_que": ("la obra la paga una entidad publica: se concursa. El trabajo "
                        "util pasa ANTES de que exista la convocatoria, y quien no "
                        "esta en el padron el dia que sale no puede participar"),
            "angulo": ANGULO_LICITACION,
            "donde_se_sigue": "CompraNet, y el padron de proveedores de la entidad",
            "lo_que_NO_se_puede_decir": (
                "«hablemos con el gerente de la planta». No decide: decide el fallo "
                "del concurso, y adelantarse por fuera no acelera nada."),
            "la_segunda_via": ("subcontratista de especialidad del contratista que "
                               "gane. Esa si es una venta normal, y se prepara "
                               "mirando quien gana estos concursos en la region"),
        })
        avisos.append(
            f"COMPRA PUBLICA ({entidad}): esta senal no abre puerta de EPC ni de "
            f"usuario. Se concursa. Decision 2 de #382.")
        return {"fase": fase, "fase_por": termino, "fases_ambiguas": otras,
                "es_obra_nueva": es_obra_nueva, "es_compra_publica": True,
                "puertas": puertas, "avisos": avisos}

    # -------------------------- (d) la senal que NO es obra nueva: compra el usuario
    #
    # HUECO QUE CERRO LA CORRIDA DEL 7-OCT. Martinrea anuncio 50 MDD en una prensa
    # de 3,000 toneladas, una linea de perfilado y CELDAS DE AUTOMATIZACION dentro de
    # una planta que ya opera. No es obra nueva, asi que no emitia ninguna puerta --y
    # se quedaba sin interlocutor-- cuando es el caso mas simple de todos: no hay EPC
    # de por medio, compra el usuario y compra AHORA. Un equipo que se instala en una
    # planta corriendo lo contrata mantenimiento o proyectos de la planta, no un
    # constructor.
    if not es_obra_nueva and (ev.get("tipos_que_nombra") or ev["desglose"]["capacidad"]):
        sigue = _lo_que_sigue(ev, catalogo)
        puertas.append({
            "puerta": PUERTA_USUARIO_DIRECTO,
            "estado": ABIERTA,
            "interlocutor": senal.get("empresa"),
            "puntos_de_oportunidad": 22.0,
            "por_que": ("no es obra nueva: es equipo o linea dentro de una planta que "
                        "ya opera. No hay EPC de por medio y el que decide es la "
                        "planta, hoy"),
            "angulo": ("lo que el equipo nuevo arrastra: acometida, tablero, "
                       "integracion de control y la tuberia o el enfriamiento que "
                       "pide"
                       + (f". El historial dice que despues de esto sigue: "
                          f"{', '.join(sigue)}" if sigue else "")),
            "por_que_vale_casi_tanto_como_una_obra": (
                "la obra nueva es mas dinero pero mas lejana y con un EPC en medio; "
                "esto es menos dinero, sin intermediario y con fecha propia"),
        })

    es_ampliacion = (not es_obra_nueva
                     and obra_de_ampliacion(" ".join(str(senal.get(k) or "")
                                                     for k in ("texto", "nota"))))
    if not es_obra_nueva and not es_ampliacion:
        return {"fase": fase, "fase_por": termino, "fases_ambiguas": otras,
                "es_obra_nueva": False, "puertas": puertas, "avisos": avisos}

    # ------------------------------------------------------------ (a) el EPC
    #
    # En una ampliacion el de esta puerta NO se llama EPC: suele ser un contratista
    # general, mas chico y mas cercano, y a veces lo coordina el dueno. Se nombra
    # distinto porque se busca distinto.
    quien_construye = "contratista general" if es_ampliacion else "EPC"
    epc = (senal.get("epc") or "").strip()
    if fase == FASE_INAUGURADA:
        estado_epc, por_que_epc = CERRADA, (
            "la planta ya se inauguro: el EPC entrego y se fue. Entrar ahora por "
            "esta puerta es llegar tarde a una obra que ya se pago")
        puntos_epc = 0.0
    elif fase == FASE_OBRA_ARRANCADA and _obra_demasiado_vieja(senal, hoy):
        meses = (dias_de_antiguedad(senal.get("fecha"), hoy) or 0) / DIAS_POR_MES
        estado_epc, por_que_epc = DESCONOCIDA, (
            f"la obra arranco hace {meses:.0f} meses, mas de los "
            f"{MESES_MAXIMOS_DE_OBRA} que se le dan a una obra industrial: el EPC "
            "probablemente ya entrego y se fue, pero ninguna fuente dice que la "
            "planta se inauguro. Averiguar si ya opera es lo primero, y de esa "
            "respuesta depende cual de las dos puertas se trabaja")
        puntos_epc = 0.0
    elif fase == FASE_OBRA_ARRANCADA:
        estado_epc, por_que_epc = ABIERTA, (
            "la obra esta en marcha: hay un EPC y esta comprando especialidad AHORA")
        puntos_epc = 25.0
    elif fase == FASE_ANUNCIO:
        estado_epc, por_que_epc = ABIERTA, (
            "anuncio sin obra todavia: el EPC puede no estar elegido, y es el mejor "
            "momento para entrar a su lista de especialidad antes de que la cierre")
        puntos_epc = 20.0
    else:
        # NO SE INVENTA LA FASE. La version anterior caia aqui en «anuncio» y
        # afirmaba «el EPC puede no estar elegido» sobre una nota que no dice nada
        # del momento de la obra -- se vio con Nemak, cuyo texto es «amplia su
        # planta con nueva linea»--. Una fase que no esta en el texto no se deduce:
        # se declara que falta, porque de ella depende cual de las dos puertas se
        # trabaja primero.
        estado_epc, por_que_epc = DESCONOCIDA, (
            "la nota no dice en que momento esta la obra -- ni anuncio, ni arranque, "
            "ni inauguracion--, asi que no se sabe si hay un EPC comprando hoy. Es "
            "lo primero que hay que averiguar de esta cuenta")
        puntos_epc = 0.0
    puertas.append({
        "puerta": PUERTA_EPC,
        "estado": estado_epc,
        "interlocutor": epc or f"POR IDENTIFICAR ({quien_construye})",
        "quien_construye": quien_construye,
        "puntos_de_oportunidad": puntos_epc,
        "por_que": por_que_epc,
        "angulo": ANGULO_EPC,
        # La consulta por PARQUE primero. Medido en la corrida del 5-oct: preguntar
        # «que constructoras hay» devuelve directorios, y preguntar por el constructor
        # de una planta devuelve notas que no lo nombran. Lo que si contesto fue el
        # parque: el dueno del parque sabe quien construye adentro y lo publica.
        # Decision 3 de #382.
        "como_identificarlo": "" if epc else _como_se_busca_al_constructor(
            senal, quien_construye),
        "y_ademas": (f"un {quien_construye} identificado vale mas que esta obra: trae "
                     "las demas obras que esta construyendo en la region"),
    })

    if es_ampliacion:
        # La puerta del usuario de una ampliacion NO es futura y no se emite aqui: la
        # planta ya opera y su puerta la emitio el bloque (d) como usuario directo.
        # Emitir las dos diria que el usuario llega despues, y ya esta ahi.
        avisos.append(
            "AMPLIACION: hay obra -- y por eso hay puerta de contratista-- pero la "
            "planta YA OPERA, asi que la puerta del usuario esta abierta HOY y no "
            "despues de una inauguracion. Decision 2 de #382.")
        return {"fase": fase, "fase_por": termino, "fases_ambiguas": otras,
                "es_obra_nueva": False, "es_ampliacion": True,
                "puertas": puertas, "avisos": avisos}

    # -------------------------------------------------------- (b) el usuario
    inauguracion = senal.get("inauguracion") or (
        senal.get("fecha") if fase == FASE_INAUGURADA else None)
    meses = _meses_desde(inauguracion, hoy)
    puntos_u, por_que_u = _puntos_del_usuario(meses)
    if inauguracion is None and estado_epc == DESCONOCIDA and \
            fase == FASE_OBRA_ARRANCADA:
        # La obra arranco hace demasiado. No se sabe si ya inauguro, asi que esta
        # puerta no es «futura» -- puede estar abierta AHORA, en su mejor momento--.
        # Decir «futura» aqui seria afirmar que la planta todavia no existe.
        estado_u = DESCONOCIDA
        por_que_u = ("la obra arranco hace mas de "
                     f"{MESES_MAXIMOS_DE_OBRA} meses y ninguna fuente dice que la "
                     "planta se haya inaugurado. Si ya opera, esta puerta puede "
                     "estar en su mejor momento; si no, sigue siendo futura. Una "
                     "sola busqueda lo resuelve")
        puntos_u = 0.0
    elif inauguracion is None:
        estado_u = FUTURA
        por_que_u = ("la planta no esta inaugurada o no se sabe cuando: la puerta "
                     "del usuario se abre en la inauguracion y dura "
                     f"{MESES_DE_LA_VENTANA_DEL_USUARIO} meses")
    elif meses is not None and meses >= MESES_DE_LA_VENTANA_DEL_USUARIO:
        estado_u = CERRADA
    else:
        estado_u = ABIERTA
    sigue = _lo_que_sigue(ev, catalogo)
    puertas.append({
        "puerta": PUERTA_USUARIO,
        "estado": estado_u,
        "interlocutor": senal.get("empresa"),
        "puntos_de_oportunidad": puntos_u,
        "por_que": por_que_u,
        "angulo": ANGULO_USUARIO + (
            f". El historial dice que despues de esto sigue: {', '.join(sigue)}"
            if sigue else ""),
        "inauguracion": inauguracion,
        "meses_desde_la_inauguracion": (round(meses, 1) if meses is not None
                                        else None),
        "ventana_meses": MESES_DE_LA_VENTANA_DEL_USUARIO,
        "de_donde_sale_la_ventana": ("CRITERIO declarado por Esteban en #382, no "
                                     "medicion. El lazo 3 lo corrige"),
    })

    if otras:
        avisos.append(
            f"la nota nombra mas de una fase de obra (tambien {', '.join(otras)}): "
            f"se tomo «{fase}» por «{termino}», que es la afirmacion mas fuerte. "
            "Si la fase real es otra, las dos puertas se mueven")
    if estado_epc == ABIERTA and not epc:
        avisos.append("la puerta que esta abierta HOY es la del EPC, y no sabemos "
                      "quien es. Identificarlo es el primer trabajo de esta cuenta")

    return {"fase": fase, "fase_por": termino, "fases_ambiguas": otras,
            "es_obra_nueva": True, "puertas": puertas, "avisos": avisos}


def resumen_de_puertas(p: dict) -> str:
    """Una linea por puerta, para leer de corrido."""
    out = []
    for q in p["puertas"]:
        out.append(f"{q['puerta']} [{q['estado']}] {q['puntos_de_oportunidad']:g} "
                   f"-> {q['interlocutor']}")
    return " · ".join(out) or "sin puertas"
