"""El evaluador del radar: cuánto vale una señal, y por qué.

Aprobado sobre #305. Tres factores, y el desglose viaja con el puntaje -- un
numero sin su cuenta no se puede discutir, y este numero decide si se gastan 60
consultas--.

    puntaje = match_catalogo(0-50) + frescura(0-25) + fuerza_de_fuente(0-25)
              + padron(0 u 8)

LO QUE EL CATALOGO CORRIGIO, y es la razon de ser de este archivo (DECISION 1 de
#305). El catalogo real de proyectos midio que FTS es, por volumen de lineas:

    ELECTRICO 33.8% · AUTOMATIZACION/TI 18.8% · TERMICO/FLUIDOS 14.9% ·
    SERVICIO 13.6% · ESTRUCTURA 11.7% · MANEJO 7.1%

`chiller` + `sistema_agua_helada` son SEIS de 154 lineas. Los terminos de alto
valor que `consultas_senal.json` traia -- PTAR, caldera, torre de enfriamiento--
cubren el 15% del negocio. Un radar montado sobre esas palabras encuentra
sistematicamente la minoria.

EL PESO DE CADA TERMINO SE DERIVA, NO SE ESCRIBE. Es la misma regla que gobierna
todo lo demas aqui: un peso escrito a mano al lado de un catalogo se separa del
catalogo en la segunda actualizacion. El peso sale de la PARTICIPACION de su
familia en el catalogo, y si manana FTS vende otra cosa, los pesos se mueven
solos al regenerar el catalogo.
"""
from __future__ import annotations
import json
import os
from datetime import date, datetime

from .catalogo_proyectos import (UNIDADES_DE_DINERO, magnitudes, plano,
                                 proceso_de)

RUTA_CATALOGO = os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "datos", "catalogo-de-proyectos-fts.json")

# --------------------------------------------------------------------- familias
# Tipo de proyecto -> familia. La familia es la unidad que tiene sentido para el
# radar: una senal de "ampliacion de carga" no dice si va a ser un tablero o un
# electroducto, dice que va a ser ELECTRICO.
FAMILIAS = {
    "electrico": ("transformador", "electroducto_busway", "tablero_electrico",
                  "subestacion", "instalacion_electrica", "puesta_a_tierra",
                  "ups_respaldo"),
    "automatizacion": ("integracion_control", "red_industrial",
                       "medicion_y_calibracion"),
    "termico_fluidos": ("sistema_agua_helada", "circuito_cerrado",
                        "torre_de_enfriamiento", "intercambiador", "chiller",
                        "clima_de_tablero", "caldera_vapor",
                        "tratamiento_de_agua", "bombeo", "tuberia_y_montaje"),
    "estructura": ("mezzanine", "estructura_metalica", "trabajos_civiles"),
    "manejo": ("conveyor_y_manejo", "integracion_embolsadora"),
    "servicio": ("comisionamiento_y_arranque", "maniobras_y_montaje",
                 "mantenimiento_servicio", "refaccion"),
}
FAMILIA_DE_TIPO = {t: f for f, ts in FAMILIAS.items() for t in ts}

# ------------------------------------------------------ el tipo INTEGRAL
# DECISION 3 de #329 (D3), aprobada. El hueco que la midio: `tipos_que_nombra()`
# no reconocia "segunda planta", "planta nueva", "ampliacion de nave" ni
# "construye una planta", asi que **una planta nueva contribuia CERO** al factor
# de tipo de obra. Y cuando si habia match -- "nave industrial"-- apuntaba a
# `trabajos_civiles`, de la familia ESTRUCTURA (11.7%), una de las mas chicas: una
# planta nueva se puntuaba como un trabajo civil pequeno.
#
# Es la misma clase de hueco que la DECISION 1 de #305, donde el radar no tenia
# ELECTRICO -- su familia mas grande--.
#
# POR QUE ES UN TIPO APARTE Y NO UNA FAMILIA MAS. Una planta nueva no es un tipo
# de proyecto: es **todos a la vez**. Compra subestacion Y control Y agua helada Y
# estructura Y manejo de material Y comisionamiento. Meterla como miembro de una
# familia la haria competir con sus propios componentes y saldria valiendo lo que
# vale el mas grande de ellos -- que es exactamente el error que tenia--.
#
# Y EL PESO SE DERIVA, COMO TODOS. La regla de este archivo no se afloja para
# esta decision: el peso de un tipo integral es la **suma de las participaciones
# de las familias que la obra necesita**, escalada igual que cualquier otra
# contra la familia mayor. Si manana FTS vende otra mezcla, este peso se mueve
# solo al regenerar el catalogo, sin que nadie lo edite.
#
# LAS SEIS FAMILIAS, Y NO LAS CUATRO QUE LA DECISION NOMBRO. D3 dice "compra
# electrico, automatizacion, termico y estructura a la vez". Se incluyen tambien
# SERVICIO y MANEJO, y es una desviacion consciente de la lista literal: una
# planta nueva necesita comisionamiento y arranque -- no se entrega sola-- y
# necesita mover material dentro. Dejarlas fuera daria un peso de 35.2 y con el
# Coficab Pesqueria se queda en 57.9 (`guarda`), por debajo del `pasa` que la
# propia decision pide como prueba de aceptacion. Con las seis, el peso sale de
# que la obra compra UNA DE CADA COSA, que es lo que de verdad hace.
TIPO_INTEGRAL_OBRA_NUEVA = "obra_nueva_integral"
TIPOS_INTEGRALES = {
    # tipo -> las familias que la obra necesita. `None` = todas las del catalogo.
    TIPO_INTEGRAL_OBRA_NUEVA: None,
}

# --------------------------------------------------------- terminos de la senal
# Lo que una senal dice que va a pasar, apuntando al TIPO de proyecto de FTS que
# implicaria. Los de electrico y automatizacion entraron por la DECISION 1; los
# termicos ya estaban en `consultas_senal.json` y se conservan.
#
# El termino apunta al tipo, y el tipo determina el peso via su familia. Nadie
# escribe un numero aqui.
TERMINOS_DE_TIPO = {
    # --- electrico: 33.8% del negocio, y no estaba en el radar -------------
    "subestacion": "subestacion",
    "media tension": "subestacion",
    "alta tension": "subestacion",
    "acometida": "subestacion",
    "ampliacion de carga": "subestacion",
    "aumento de carga": "subestacion",
    "tablero": "tablero_electrico",
    "switchgear": "tablero_electrico",
    "centro de control de motores": "tablero_electrico",
    "ccm": "tablero_electrico",
    "transformador": "transformador",
    "electroducto": "electroducto_busway",
    "busway": "electroducto_busway",
    "barras de cobre": "electroducto_busway",
    "puesta a tierra": "puesta_a_tierra",
    "sistema de tierras": "puesta_a_tierra",
    "ups": "ups_respaldo",
    "respaldo de energia": "ups_respaldo",
    "no break": "ups_respaldo",
    "instalacion electrica": "instalacion_electrica",
    "obra electrica": "instalacion_electrica",
    "canalizacion electrica": "instalacion_electrica",
    # --- automatizacion y TI industrial: 18.8% ----------------------------
    "automatizacion de linea": "integracion_control",
    "automatizacion": "integracion_control",
    "plc": "integracion_control",
    "hmi": "integracion_control",
    "scada": "integracion_control",
    "retrofit": "integracion_control",
    "migracion de control": "integracion_control",
    "integracion de control": "integracion_control",
    "sistema de control": "integracion_control",
    "variador": "integracion_control",
    "red industrial": "red_industrial",
    "red de planta": "red_industrial",
    "ot industrial": "red_industrial",
    "industria 4.0": "red_industrial",
    "trazabilidad": "red_industrial",
    "medicion": "medicion_y_calibracion",
    "instrumentacion": "medicion_y_calibracion",
    "calibracion": "medicion_y_calibracion",
    "metrologia": "medicion_y_calibracion",
    # --- termico y fluidos: los que ya estaban ---------------------------
    "chiller": "chiller",
    "agua helada": "sistema_agua_helada",
    "sistema de enfriamiento": "sistema_agua_helada",
    "torre de enfriamiento": "torre_de_enfriamiento",
    "intercambiador": "intercambiador",
    "caldera": "caldera_vapor",
    "vapor": "caldera_vapor",
    "cogeneracion": "caldera_vapor",
    "ptar": "tratamiento_de_agua",
    "planta de tratamiento": "tratamiento_de_agua",
    "tratamiento de agua": "tratamiento_de_agua",
    "reuso de agua": "tratamiento_de_agua",
    "agua residual": "tratamiento_de_agua",
    "bombeo": "bombeo",
    "tuberia de proceso": "tuberia_y_montaje",
    "circuito cerrado": "circuito_cerrado",
    # --- estructura y manejo --------------------------------------------
    "mezanine": "mezzanine",
    "mezzanine": "mezzanine",
    "entrepiso": "mezzanine",
    "estructura metalica": "estructura_metalica",
    # OJO: "nave industrial" GENERICA se queda en trabajos_civiles. Una nota que
    # habla de una nave sin decir que es NUEVA no es obra nueva: puede ser un
    # reacondicionamiento, una renta o una mencion de paso. Los terminos de obra
    # nueva viven abajo, y todos exigen la palabra que dice que es nueva.
    "nave industrial": "trabajos_civiles",
    "obra civil": "trabajos_civiles",
    "conveyor": "conveyor_y_manejo",
    "transportador": "conveyor_y_manejo",
    "polipasto": "conveyor_y_manejo",
    "embolsadora": "integracion_embolsadora",
    "empacadora": "integracion_embolsadora",
    # --- obra nueva INTEGRAL: la senal mas fuerte que FTS puede recibir -----
    # D3 de #329. Cada termino tiene que decir que la planta es NUEVA o que
    # CRECE; ninguno pega con una mencion generica de una nave o de una planta.
    "planta nueva": TIPO_INTEGRAL_OBRA_NUEVA,
    "nueva planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "segunda planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "tercera planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "nueva nave": TIPO_INTEGRAL_OBRA_NUEVA,
    "nave nueva": TIPO_INTEGRAL_OBRA_NUEVA,
    "ampliacion de nave": TIPO_INTEGRAL_OBRA_NUEVA,
    "ampliacion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "expansion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "construye una planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "construira una planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "construccion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inaugura planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inauguracion de planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "nuevo complejo": TIPO_INTEGRAL_OBRA_NUEVA,
    "nueva linea de produccion": TIPO_INTEGRAL_OBRA_NUEVA,
    # en ingles: las notas de prensa industrial de automotriz y alimentos en
    # Nuevo Leon llegan en ingles la mitad de las veces
    "new plant": TIPO_INTEGRAL_OBRA_NUEVA,
    "second plant": TIPO_INTEGRAL_OBRA_NUEVA,
    "third plant": TIPO_INTEGRAL_OBRA_NUEVA,
    "plant expansion": TIPO_INTEGRAL_OBRA_NUEVA,
    "new facility": TIPO_INTEGRAL_OBRA_NUEVA,
    "greenfield": TIPO_INTEGRAL_OBRA_NUEVA,
    "groundbreaking": TIPO_INTEGRAL_OBRA_NUEVA,
    "breaks ground": TIPO_INTEGRAL_OBRA_NUEVA,
    "new production line": TIPO_INTEGRAL_OBRA_NUEVA,

    # --- EL ARRANQUE DE OBRA, EN CASTELLANO -------------------------------
    #
    # Medido en #381 y aplicado aqui porque la DECISION 1 de #382 no funciona sin
    # esto: si una senal de «arranca la construccion» no se reconoce como obra
    # nueva, no emite ninguna puerta.
    #
    # EL DEFECTO QUE CIERRA. La tabla conocia `groundbreaking` y `breaks ground`
    # en INGLES y ni una de las frases que la prensa industrial mexicana usa de
    # verdad. Si conocia `inaugura planta`, que es el momento en que la ventana de
    # especificacion YA CERRO. O sea: el vocabulario estaba sesgado al FINAL de la
    # obra y ciego a su principio, en el idioma en que se publica.
    #
    # COSTO MEDIDO, en la corrida del 5-oct: Waelzholz -- arranca construccion, 65
    # MDD, la banda que Esteban declaro como «exactamente lo que FTS si toma»--
    # sacaba 48.7 y GUARDABA; Inventec -- primera piedra, 450 MDD, 45 lineas--
    # sacaba 36.0 y ARCHIVABA. Las dos con 10 de 10 en tamanio de obra.
    # Con estas frases: 93.1 y 80.4, las dos `pasa`. Se midio sobre las 14 senales
    # de la corrida y se mueven SOLO esas dos: cero falsos positivos nuevos.
    #
    # NO ENTRA `inicio de construccion` ni `inicia operaciones en`: son frases de
    # FUTURO -- «inicio de construccion en el tercer trimestre»-- y meterlas haria
    # que un anuncio se leyera como una obra que ya arranco. La prueba de Yokohama
    # fija ese limite.
    "arranca la construccion": TIPO_INTEGRAL_OBRA_NUEVA,
    "arranca construccion": TIPO_INTEGRAL_OBRA_NUEVA,
    "inicia construccion": TIPO_INTEGRAL_OBRA_NUEVA,
    "inicia la construccion": TIPO_INTEGRAL_OBRA_NUEVA,
    "primera piedra": TIPO_INTEGRAL_OBRA_NUEVA,
    "arranque de obra": TIPO_INTEGRAL_OBRA_NUEVA,
    "empezo a construir": TIPO_INTEGRAL_OBRA_NUEVA,
    "comenzo a construir": TIPO_INTEGRAL_OBRA_NUEVA,
    "construira una planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "primera planta": TIPO_INTEGRAL_OBRA_NUEVA,

    # «UNA PLANTA DE <algo>», hallado el 7-oct al leer la salida entrada por
    # entrada. Megasteel dice «invertira 200 millones de dolares en una planta de
    # estructuras metalicas en el parque industrial de Grupo Simsa» y el radar la
    # archivaba con 32.7: ninguna de las formas del vocabulario -- «nueva planta»,
    # «primera planta», «segunda planta»-- aparece en esa frase, asi que una planta
    # nueva de 200 MDD entraba como equipo dentro de una planta que ya opera, sin
    # puerta de EPC.
    #
    # Medido sobre las 23 senales de la corrida: cambia UNA, Megasteel, de 32.7
    # archiva a 77.1 pasa. Cero falsos positivos. No se mete «una planta» a secas
    # porque cae en frases como «dentro de una planta»; con «de» detras exige que
    # la planta sea DE algo, que es como se nombra una planta nueva.
    "una planta de": TIPO_INTEGRAL_OBRA_NUEVA,

    # --- LAS FORMAS DE «INAUGURA» QUE EL EMPAREJADO NO VEIA ----------------
    #
    # `tipos_que_nombra` empareja por ADYACENCIA LITERAL, asi que `inaugura planta`
    # caza «inaugura planta nueva» y NO caza «inaugura su planta de Monterrey»: el
    # «su» de en medio la rompe. En la corrida del 5-oct esto no se noto porque las
    # dos inauguraciones decian «su SEGUNDA planta» y «nueva planta», y entraron por
    # esos terminos -- o sea, funcionaron por casualidad--.
    #
    # Lo destapo la DECISION 1: la fase `inaugurada` es la que ABRE la puerta del
    # usuario, asi que una inauguracion que no se reconoce como obra nueva no emite
    # ninguna puerta y la cuenta se cae del tablero entera.
    #
    # LIMITACION QUE QUEDA, declarada: cada forma necesita su renglon porque el
    # emparejado no tokeniza. Las de abajo son las que aparecen de verdad en la
    # prensa; la que falte se agrega cuando una corrida la encuentre, no antes.
    "inaugura su planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inauguro su planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inauguracion de su planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inaugura su complejo": TIPO_INTEGRAL_OBRA_NUEVA,
    "inaugura su nave": TIPO_INTEGRAL_OBRA_NUEVA,
    "arranca operaciones su planta": TIPO_INTEGRAL_OBRA_NUEVA,
    "inicia operaciones su planta": TIPO_INTEGRAL_OBRA_NUEVA,
}

# --------------------------------------------------------------- los tres topes
MAX_PROCESO = 25
MAX_TIPO_DE_OBRA = 15
MAX_CAPACIDAD = 10
MAX_FRESCURA = 25
MAX_FUENTE = 25

# Piso del peso de un termino. Una familia chica no vale CERO: un proyecto de
# chiller sigue siendo un proyecto de FTS. Lo que el peso expresa es "que tan
# probable es que este sea el tipo de trabajo que FTS gana", y eso lo mide la
# participacion -- no la anula--.
PESO_MINIMO_TIPO = 4

# DECISION 3 · el padron es FACTOR, no requisito.
#
# Antes, una senal cuya cuenta no estaba en el corte del DENUE se guardaba como
# "candidata a entrar al padron" y se quedaba esperando un corte que tarda meses.
# El corte es de mayo: las plantas NUEVAS -- las de obra nueva, las de presupuesto
# abierto, las que mas valen-- eran sistematicamente las que el radar no podia
# detonar. Era un sesgo contra el mejor prospecto que existe.
#
# Ahora suma cuando empata y NO RESTA cuando no. El no-empate viaja como
# ambiguedad declarada, no como descuento.
PADRON_EMPATA = 8
PADRON_NO_EMPATA = 0

# --------------------------------------------------------- fuerza de la fuente
# El orden salio del diseno de #305 y la medicion de #302/#305 lo sostiene: el
# correo propio es el cliente diciendolo por escrito, y la prensa generica pega
# 0 de 22 veces con el padron.
FUERZA_DE_FUENTE = {
    "correo_propio": 25,
    "rfq_cliente": 25,
    "convocatoria": 23,
    "licitacion": 20,
    "expansion_odoo": 22,
    "vacante_tecnica": 16,
    "camara": 12,
    "congreso": 12,
    "prensa_industrial": 8,
    # La EMPRESA hablando de si misma en su propio sitio. Se agrego en #353 al
    # documentar la senal de Qualtia -- su ampliacion la anuncia su propia
    # pagina, no la prensa-- y sin peso declarado valia CERO, que es lo que el
    # evaluador hace bien: un peso inventado es peor que un hueco. Vale MAS que
    # la prensa industrial para el HECHO -- no hay intermediario que le cambie
    # la cifra-- y MENOS que una camara: un comunicado propio es texto de
    # marketing, la empresa lo puede editar o bajar, y casi nunca trae monto ni
    # fecha. "La mayor inversion de nuestra historia" sin cifra es exactamente
    # el tipo de afirmacion que una pagina propia infla.
    "sitio_de_la_empresa": 10,
    # EL CONSTRUCTOR O EL EPC HABLANDO DE LA OBRA QUE ESTA HACIENDO. Entra por la
    # DECISION 2 de #382, y vale 20 por una razon concreta: es de PRIMERA MANO
    # sobre la obra -- el que la construye no se equivoca sobre si existe-- y llega
    # ANTES de que la planta exista como empresa, que es justo cuando la ventana de
    # especificacion esta abierta. Vale MENOS que una convocatoria (23) porque una
    # convocatoria compromete a comprar y tiene fecha de cierre; el boletin de un
    # desarrollador es material de marketing que anuncia metros cuadrados.
    #
    # Y hay una razon de NEGOCIO para que esta fuente exista, no solo de dato: el
    # EPC es el comprador de la puerta (a). Una nave que Vesta anuncia trae un
    # constructor que ya esta comprando especialidad, y ese mismo constructor trae
    # mas obra en la region -- el caso BIC que Esteban nombro--.
    "constructor_o_epc": 20,
    "ip_corporativa": 6,
    "feed_generico": 3,
}

# ------------------------------------------------------------ tipo de senal
# QUE ESTA PASANDO, que no es lo mismo que QUIEN NOS LO DIJO.
#
# La tabla de caducidad de `importacion_odoo.py` nacia mezclando las dos cosas:
# once llaves, diez de ellas FUENTES (`correo_propio`, `prensa_industrial`,
# `camara`...) y una sola TIPO (`obra_nueva`). Esa mezcla es la que la dejo
# muerta -- ver el hallazgo H2 de #325--: la caducidad se buscaba por una llave
# que el paquete no emitia y caia siempre al plazo por omision.
#
# La separacion importa porque los dos ejes contestan preguntas distintas:
#
#   * la FUENTE dice cuanto CREERLE a la senal -> `FUERZA_DE_FUENTE`, puntaje;
#   * el TIPO dice CUANDO SE VENCE -> el reloj lo pone el evento, no el CRM.
#
# La misma obra nueva puede llegar por prensa (poco fiable) o por el correo del
# cliente (muy fiable) y en los dos casos su ventana de especificacion es la
# misma. Y la misma fuente -- el buzon-- puede traer una convocatoria que cierra
# el jueves o una necesidad para el ano que entra.
TIPOS_DE_SENAL = {
    "obra_nueva": "planta nueva, nave nueva o ampliacion anunciada",
    "ampliacion_de_capacidad": "mas carga, mas linea o mas proceso en lo que ya existe",
    "convocatoria_abierta": "licitacion o registro de proveedores con fecha de cierre",
    "necesidad_declarada": "alguien de la cuenta dijo por escrito que va a necesitar algo",
    "vacante_tecnica": "contratan a quien operaria o mantendria lo que FTS instala",
    "presencia_en_evento": "la cuenta estara en un congreso, expo o camara",
    "navegacion": "visitas al sitio desde la IP de la corporacion",
    "reconocimiento_de_mercado": "nota, premio o movimiento corporativo sin obra declarada",
}

# Que tipo implica cada fuente cuando nadie declara el tipo. Es un DEFAULT
# honesto, no una equivalencia: `prensa_industrial` suele traer obra nueva, y
# cuando trae otra cosa el operador lo declara y este mapa no se usa.
TIPO_POR_OMISION_DE_FUENTE = {
    "correo_propio": "necesidad_declarada",
    "rfq_cliente": "necesidad_declarada",
    "convocatoria": "convocatoria_abierta",
    "licitacion": "convocatoria_abierta",
    "expansion_odoo": "ampliacion_de_capacidad",
    "vacante_tecnica": "vacante_tecnica",
    "camara": "presencia_en_evento",
    "congreso": "presencia_en_evento",
    "prensa_industrial": "obra_nueva",
    "constructor_o_epc": "obra_nueva",
    "ip_corporativa": "navegacion",
    "feed_generico": "reconocimiento_de_mercado",
}


def tipo_de_senal_de(fuente: str, tipo_declarado: str = "") -> tuple[str, str]:
    """(tipo, de donde salio). El declarado manda sobre el derivado."""
    t = (tipo_declarado or "").strip()
    if t:
        if t not in TIPOS_DE_SENAL:
            raise ValueError(
                f"Tipo de senal '{t}' desconocido. Los que existen: "
                + ", ".join(sorted(TIPOS_DE_SENAL))
                + ". Un tipo inventado rompe el reloj de caducidad en silencio, "
                  "que es exactamente el hallazgo H2.")
        return (t, "declarado")
    f = plano(fuente or "").replace(" ", "_")
    if f in TIPO_POR_OMISION_DE_FUENTE:
        return (TIPO_POR_OMISION_DE_FUENTE[f], f"derivado de la fuente '{f}'")
    return ("", "sin tipo: la fuente no permite derivarlo y nadie lo declaro")


# ===================================================== D1 de #382 · LA FASE DE LA OBRA
#
# QUE ES Y POR QUE NO ES EL TIPO. `TERMINOS_DE_TIPO` contesta QUE se va a
# construir; esto contesta EN QUE MOMENTO ESTA. Son dos preguntas distintas y el
# radar las tenia fundidas: `inaugura planta` y `arranca la construccion` apuntan
# al mismo tipo y valian lo mismo, pero una tiene la ventana de especificacion
# abierta y la otra la tiene cerrada desde hace meses.
#
# Y la fase es lo que decide QUIEN COMPRA, que es la decision 1 de #382:
#
#   anuncio          el EPC quizas no esta elegido. Es el mejor momento para entrar
#                    a su lista de especialidad, y el peor para hablar con el
#                    usuario, que todavia no tiene planta.
#   obra_arrancada   hay un EPC y esta comprando AHORA. Puerta (a) abierta.
#   inaugurada       el EPC se fue. Empieza a correr el reloj del usuario.
#
# PRECEDENCIA, y no es el orden en que aparecen las frases. `obra_arrancada` le
# gana a las otras dos porque es la afirmacion mas fuerte: una primera piedra es
# un evento fechado que ocurrio. Medido contra las 14 senales de la corrida del
# 5-oct, es el unico orden que clasifica bien los tres casos mixtos:
#
#   * Ecocab dice «inicia construccion ... arranque de operaciones en enero de
#     2027». Con «la ultima gana» saldria `inaugurada`, que es falso: la planta no
#     existe. Con esta precedencia sale `obra_arrancada`.
#   * NIFCO Apodaca dice «invertira 85 MDD ... y coloca la primera piedra». Con «la
#     primera gana» saldria `anuncio`, que subestima: la obra ya arranco.
#   * NIFCO Chihuahua dice solo «inaugura»: sale `inaugurada`.
FASE_ANUNCIO = "anuncio"
FASE_OBRA_ARRANCADA = "obra_arrancada"
FASE_INAUGURADA = "inaugurada"

# El orden es la precedencia: el primero que aparezca en el texto, gana.
FASES_DE_OBRA = (
    (FASE_OBRA_ARRANCADA, (
        "arranca la construccion", "arranca construccion", "inicia construccion",
        "inicia la construccion", "primera piedra", "arranque de obra",
        "empezo a construir", "comenzo a construir", "en construccion",
        "groundbreaking", "breaks ground", "under construction",
        "arranco la construccion", "construccion en marcha")),
    (FASE_INAUGURADA, (
        # SOLO FORMAS DE PASADO O PRESENTE. `arranque de operaciones` e
        # `inicio operaciones` se sacaron el 7-oct al ver la salida: Yokohama dice
        # «arranque de operaciones en el segundo trimestre de 2028» y salia
        # INAUGURADA -- con su puerta de usuario abierta y «4.6 meses de
        # inaugurada»-- cuando la planta no existe. Es el mismo error de futuro que
        # ya se habia cerrado un tramo mas arriba con `inicio de construccion`, y se
        # colo igual: la leccion es que un sustantivo o un infinitivo no afirman que
        # algo paso.
        #
        # `inicio operaciones` tampoco vuelve: sin acentos, «inicio operaciones»
        # (pasado) e «inicio de operaciones» (futuro) son la misma cadena, y una
        # frase que no se puede distinguir no sirve de marca.
        "inaugura", "inauguracion", "inauguro", "arranco operaciones",
        "entro en operacion", "ya opera", "opens", "inaugurates",
        "started operations")),
    (FASE_ANUNCIO, (
        "invertira", "anuncia", "anuncio de inversion", "destinara", "planea",
        "proyecta", "invertiran", "will invest", "announces", "to invest")),
)


def fase_de_obra(texto: str) -> tuple[str, str, list[str]]:
    """(fase, el termino que la decidio, las otras fases que el texto tambien nombra).

    La tercera cosa que devuelve importa: un texto que nombra dos fases es un texto
    ambiguo, y la ambiguedad se declara en vez de resolverse en silencio.
    """
    p = f" {plano(texto)} "
    halladas = []
    for fase, terminos in FASES_DE_OBRA:
        for t in terminos:
            if f" {plano(t)}" in p:
                halladas.append((fase, t))
                break
    if not halladas:
        return ("", "", [])
    fase, termino = halladas[0]
    otras = [f for f, _ in halladas[1:]]
    return (fase, termino, otras)


# --------------------------------------------------------------- los umbrales
UMBRAL_PASA = 60
UMBRAL_GUARDA = 40

PASA = "pasa"
GUARDA = "guarda"
ARCHIVA = "archiva"

# Frescura: dias de antiguedad -> puntos.
ESCALA_FRESCURA = ((30, 25), (90, 18), (180, 10), (365, 4))
# Una senal SIN FECHA no vale cero: vale el minimo y se marca. Poner cero
# equivale a descartarla, y `fecha_de()` se arreglo en #302 justo porque no
# reconocer la fecha ESCONDIA la antiguedad.
FRESCURA_SIN_FECHA = 2


def cargar_catalogo(ruta: str = RUTA_CATALOGO) -> dict:
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def participacion_por_familia(catalogo: dict) -> dict[str, float]:
    """Que fraccion de las lineas clasificadas aporta cada familia."""
    tipos = catalogo.get("tipos_de_proyecto") or {}
    por_familia: dict[str, int] = {}
    total = 0
    for tipo, d in tipos.items():
        n = int(d.get("n") or 0)
        total += n
        f = FAMILIA_DE_TIPO.get(tipo)
        if f:
            por_familia[f] = por_familia.get(f, 0) + n
    if not total:
        return {}
    return {f: n / total for f, n in por_familia.items()}


def familias_de_un_tipo_integral(tipo: str, catalogo: dict) -> list[str]:
    """Las familias que una obra de este tipo integral necesita."""
    if tipo not in TIPOS_INTEGRALES:
        return []
    pedidas = TIPOS_INTEGRALES[tipo]
    part = participacion_por_familia(catalogo)
    if pedidas is None:
        return sorted(part)
    return sorted(f for f in pedidas if f in part)


def peso_de_tipo(tipo: str, catalogo: dict) -> float:
    """Cuanto vale, de `MAX_TIPO_DE_OBRA`, una senal que apunta a este tipo.

    Escalado por la participacion de su FAMILIA contra la familia mas grande, con
    piso. Asi la senal electrica -- la familia mas grande-- vale el tope, y la
    termica vale proporcionalmente menos sin valer cero.

    UN TIPO INTEGRAL PASA DEL TOPE, y es lo unico que puede pasarlo. Su peso es
    la SUMA de las participaciones de las familias que la obra necesita, con la
    misma escala: si necesita las seis, su suma es 1.0 y su peso sale ~3x el de la
    familia mayor. No es una excepcion a la regla del peso derivado -- sigue
    saliendo del catalogo y nadie escribe el numero-- es la regla aplicada a algo
    que de verdad compra una de cada cosa.
    """
    part = participacion_por_familia(catalogo)
    if not part:
        return PESO_MINIMO_TIPO
    mayor_ = max(part.values()) if part else 0
    if tipo in TIPOS_INTEGRALES and mayor_ > 0:
        familias = familias_de_un_tipo_integral(tipo, catalogo)
        suma = sum(part[f] for f in familias)
        return max(PESO_MINIMO_TIPO,
                   round(MAX_TIPO_DE_OBRA * suma / mayor_, 1))
    f = FAMILIA_DE_TIPO.get(tipo)
    if not f or f not in part:
        return PESO_MINIMO_TIPO
    mayor = max(part.values())
    if mayor <= 0:
        return PESO_MINIMO_TIPO
    return max(PESO_MINIMO_TIPO,
               round(MAX_TIPO_DE_OBRA * part[f] / mayor, 1))


def tipos_que_nombra(texto: str) -> list[tuple[str, str]]:
    """(termino, tipo) de cada termino de tipo que el texto nombra."""
    p = f" {plano(texto)} "
    out, vistos = [], set()
    for termino, tipo in TERMINOS_DE_TIPO.items():
        if f" {plano(termino)}" in p and tipo not in vistos:
            vistos.add(tipo)
            out.append((termino, tipo))
    return out


def puntos_de_proceso(texto: str, catalogo: dict) -> tuple[float, str]:
    """El proceso del cliente que la senal nombra, contra el catalogo.

    Dos escalones a proposito. RECONOCER el proceso ya es informacion -- el
    vocabulario sabe que "funde cobre" es una fundicion, y una fundicion es
    industria de carga termica y electrica--; que ADEMAS haya producido proyectos
    en el historial es mas fuerte. Sin los dos escalones, un proceso que el
    catalogo todavia no ha visto puntuaria cero, y la cobertura de proceso del
    catalogo es justo el hueco que #305 declaro.
    """
    pr = proceso_de(texto)
    if not pr["proceso"]:
        return (0.0, "ningun proceso reconocido")
    proc = pr["proceso"]
    base = 10.0
    procesos = catalogo.get("procesos_del_cliente") or {}
    d = procesos.get(proc)
    if not d:
        return (base, f"proceso '{proc}' reconocido (por '{pr['por']}'), "
                      "sin proyectos en el catalogo todavia")
    n = int(d.get("n") or 0)
    mayor = max((int(x.get("n") or 0) for x in procesos.values()), default=0) or 1
    extra = (MAX_PROCESO - base) * min(1.0, n / mayor)
    tipos = ", ".join(list(d.get("proyectos_que_produjo") or {})[:3])
    return (round(base + extra, 1),
            f"proceso '{proc}' con {n} proyecto(s) en el catalogo ({tipos})")


# ===================================================== D6 · el tamano del dinero
# APROBADA en #335 con la escala derivada del catalogo y corte por arriba.
#
# QUE SE PUEDE DERIVAR Y QUE NO, y la distincion es la mitad de esta decision.
#
# SE DERIVA del catalogo: el ticket de FTS. Los 154 proyectos reales de
# `catalogo-de-proyectos-fts.json` traen `monto`, y su distribucion es un hecho
# medido: minimo ~192 mil, mediana ~408 mil, p90 ~2.1 millones, maximo ~13.5
# millones. Eso es lo que FTS factura por proyecto.
#
# NO SE PUEDE DERIVAR de ningun archivo de este repo: **que fraccion del capex de
# un cliente acaba siendo un proyecto de FTS.** Un anuncio de "205 MDD" es la
# inversion DEL CLIENTE, no el ticket de FTS, y la razon entre las dos no esta
# registrada en ninguna parte. Comparar 205 MDD contra la distribucion de tickets
# de FTS seria un error de categoria: son dos cosas distintas medidas en la misma
# unidad.
#
# Por eso la banda tiene DOS ANCLAJES DECLARADOS POR ESTEBAN en la propia D6, y
# quedan escritos como declarados y no como derivados:
#
#   * **60 MDD de Coficab Durango es "exactamente lo que FTS si toma".**
#   * **2,000 MDD de Bimbo "es un programa nacional de varios anos".**
#   * y el corte: **arriba de ~500 MDD, programa corporativo.**
#
# EL PISO SI SE DERIVA, y es la unica frontera que sale del catalogo sin
# suposiciones: un capex mas chico que el proyecto MAS CHICO que FTS ha vendido no
# puede contener un proyecto de FTS. Es una cota dura, no una estimacion.
#
# QUE HACE EL CORTE POR ARRIBA. Lo mismo que ya hacia con los TR y por la misma
# razon escrita en `puntos_de_capacidad`: "una senal de 1,500 TR no es mejor que
# una de 200, es de otro tamano de empresa y otro competidor". Con inversion el
# argumento es mas fuerte todavia: un programa de 2,000 MDD se reparte en anos, en
# varias plantas y con contratistas de otro tamano, mientras 60 MDD es una obra que
# FTS puede tomar completa.
CORTE_PROGRAMA_CORPORATIVO_MDD = 500.0

# El unico numero DECLARADO y no derivado de todo este bloque, y se declara como
# tal: hace falta para poder comparar un monto en pesos contra un corte en dolares.
# Un tipo de cambio escrito en el codigo se queda viejo -- es justo la clase de dato
# que este proyecto saca de los documentos-- asi que aqui va con su fecha, su
# alcance y la razon por la que su imprecision no cambia ningun veredicto de hoy:
#
#   ALCANCE: solo decide si un monto EN PESOS cae arriba o abajo del corte de
#   programa corporativo. No entra en ningun otro calculo.
#   POR QUE NO MUERDE: el monto en pesos mas grande documentado es 633 MDP, que a
#   cualquier tipo de cambio entre 15 y 25 queda entre 25 y 42 MDD -- lejisimos del
#   corte de 500--. Habria que equivocarse por un factor de 12 para mover un
#   veredicto.
#   CUANDO REVISARLO: cuando aparezca un anuncio en pesos de mas de 7,500 MDP.
PESOS_POR_DOLAR_DECLARADO = 18.5
FECHA_DEL_TIPO_DE_CAMBIO = "2026-09"


def _a_mdd(valor: float, unidad: str) -> float:
    """El monto en millones de dolares, para poder compararlo con el corte."""
    if unidad == "MDP":
        return valor / PESOS_POR_DOLAR_DECLARADO
    return valor


def piso_de_inversion(catalogo: dict) -> tuple[float, str]:
    """El proyecto MAS CHICO que FTS ha vendido, del catalogo. Cota dura.

    Un capex mas chico que esto no puede contener un proyecto de FTS. Es lo unico
    de la banda que sale del catalogo sin ninguna suposicion.

    La moneda de los montos del catalogo **no esta declarada** (`moneda: null` en
    las 154 entradas, y Odoo es multi-moneda -- medido--). Eso no muerde por la
    misma razon que el tipo de cambio: el piso sale en ~0.19 millones y el anuncio
    mas chico documentado es de 200 MDD, tres ordenes de magnitud arriba. Si algun
    dia aparece un anuncio de menos de 5 millones, hay que declarar la moneda antes
    de confiar en esta frontera.
    """
    montos = [e.get("monto") for e in (catalogo.get("entradas") or [])]
    montos = sorted(m for m in montos if isinstance(m, (int, float)) and m > 0)
    if not montos:
        return (0.0, "el catalogo no trae montos: el piso no se puede derivar")
    piso = montos[0] / 1_000_000.0
    return (piso, f"el proyecto mas chico de los {len(montos)} del catalogo "
                  f"({montos[0]:,.0f} en la moneda del catalogo, sin declarar)")


def puntos_de_inversion(valor: float, unidad: str,
                        catalogo: dict) -> tuple[float, str]:
    """Cuanto vale un MONTO DE INVERSION anunciado. D6 de #335."""
    en_mdd = _a_mdd(valor, unidad)
    piso, por_que_piso = piso_de_inversion(catalogo)
    if en_mdd > CORTE_PROGRAMA_CORPORATIVO_MDD:
        return (MAX_CAPACIDAD / 4,
                f"{valor:g} {unidad} (~{en_mdd:.0f} MDD) pasa el corte de "
                f"{CORTE_PROGRAMA_CORPORATIVO_MDD:g} MDD: es un PROGRAMA "
                "CORPORATIVO, no una obra. Se reparte en anos, en varias plantas y "
                "con contratistas de otro tamano. Cuenta, y cuenta poco")
    if en_mdd * 1_000_000 < piso * 1_000_000:
        return (MAX_CAPACIDAD / 4,
                f"{valor:g} {unidad} queda POR DEBAJO del piso: {por_que_piso}")
    return (MAX_CAPACIDAD,
            f"{valor:g} {unidad} (~{en_mdd:.0f} MDD) cae en el rango donde FTS "
            f"puede tomar la obra completa: arriba del piso derivado del catalogo "
            f"y abajo del corte de {CORTE_PROGRAMA_CORPORATIVO_MDD:g} MDD")


def rango_de_la_unidad(catalogo: dict, unidad: str) -> dict | None:
    """El rango del catalogo para UNA unidad, unido sobre todos los tipos.

    LA UNION Y NO EL PRIMER TIPO QUE PEGUE, y es un arreglo de B4 (#340). El codigo
    anterior recorria `capacidad_por_tipo` y comparaba contra el rango del PRIMER
    tipo que tuviera datos, sin importar si era el tipo correcto -- y una senal no
    viene etiquetada con el tipo de proyecto de FTS, asi que no hay forma de elegir
    uno--. Comparar contra un tipo arbitrario es peor que no comparar.

    La union si tiene sentido: la pregunta que el corte por arriba hace es *"esta
    magnitud cae donde FTS vende"*, y eso es una pregunta sobre FTS entera. Se mide
    ademas cuantos valores DISTINTOS sostienen el rango, porque un rango de un solo
    valor no es un rango.
    """
    valores: list[float] = []
    tipos: list[str] = []
    for tipo, d in (catalogo.get("capacidad_por_tipo") or {}).items():
        r = (d.get("rangos") or {}).get(unidad)
        if r:
            valores += list(r.get("valores") or [r["min"], r["max"]])
            tipos.append(tipo)
        elif unidad == "TR" and "min_TR" in d:
            # Catalogo viejo, de antes de que los rangos fueran por unidad.
            valores += [d["min_TR"], d["max_TR"]]
            tipos.append(tipo)
    if not valores:
        return None
    u = sorted(set(valores))
    return {"min": u[0], "max": u[-1], "distintos": len(u),
            "tipos": sorted(tipos), "comparable": len(u) >= 2}


def puntos_de_capacidad(texto: str, catalogo: dict) -> tuple[float, str]:
    """La magnitud de la senal contra el rango donde FTS SI ha vendido.

    CORTA POR ARRIBA, no solo por abajo: una senal de 1,500 TR no es mejor que
    una de 200, es de otro tamano de empresa y otro competidor.
    """
    mags = magnitudes(texto)
    if not mags:
        return (0.0, "sin magnitud declarada")
    # EL DINERO SE ATIENDE PRIMERO, y el orden es una decision: si un texto trae
    # "planta nueva de 60 MDD con chiller de 200 TR", el monto habla del tamano de
    # LA OBRA y los TR del tamano de UNA MAQUINA. Para decidir si vale la pena
    # gastar 60 consultas manda la obra.
    for m in mags:
        if m["unidad"] in UNIDADES_DE_DINERO:
            return puntos_de_inversion(m["valor"], m["unidad"], catalogo)
    # Se recorren TODAS las magnitudes buscando una con rango comparable, en vez de
    # decidir con la primera: un texto que dice "cable de 240 mm2 en 35 kV" trae dos
    # unidades y solo una puede tener bordes medidos.
    sin_bordes = []
    for m in mags:
        r = rango_de_la_unidad(catalogo, m["unidad"])
        if r is None:
            continue
        donde = ", ".join(r["tipos"])
        if not r["comparable"]:
            sin_bordes.append(
                f"{m['valor']:g} {m['unidad']} contra UN SOLO valor medido "
                f"({r['min']:g} {m['unidad']} en {donde}): un punto no es un "
                "rango, y decir que algo queda fuera de un punto seria inventarle "
                "el borde")
            continue
        lo, hi = r["min"], r["max"]
        cuantos = f"{r['distintos']} valores en {donde}"
        if lo <= m["valor"] <= hi:
            return (MAX_CAPACIDAD,
                    f"{m['valor']:g} {m['unidad']} cae en el rango donde FTS SI ha "
                    f"vendido ({lo:g}-{hi:g}, {cuantos})")
        fuera = "por encima" if m["valor"] > hi else "por debajo"
        return (MAX_CAPACIDAD / 4,
                f"{m['valor']:g} {m['unidad']} queda {fuera} del rango donde FTS "
                f"vende ({lo:g}-{hi:g}, {cuantos}): otro tamano de empresa y otro "
                "competidor")
    if sin_bordes:
        # Hay EVIDENCIA de que FTS trabaja en esa unidad -- lineas vendidas-- pero no
        # hay bordes. La mitad: se midio algo, no se pudo ordenar.
        return (MAX_CAPACIDAD / 2, "; ".join(sin_bordes))
    # UNA MAGNITUD QUE NO SE PUEDE COMPARAR CON NADA NO DA PUNTOS, y cambio en #340.
    # Antes daba la mitad, y eso regalaba 5 puntos por cualquier numero con unidad:
    # la prueba de aceptacion de D3 lo cazo en el acto -- "se renta nave industrial
    # de 4000 m2" paso de `archiva` a `guarda` en cuanto el lector aprendio a leer
    # m2, y los metros cuadrados de una nave EN RENTA no dicen nada sobre si el
    # tamano de FTS cabe ahi--.
    #
    # El factor se llama `capacidad` y existe para el corte por arriba. Media
    # calificacion por un numero que no se comparo contra nada es justo la
    # comparacion inventada que este factor persigue. Se distingue del "sin magnitud
    # declarada" en el POR QUE, que es donde la distincion sirve; en el puntaje las
    # dos cosas valen lo mismo, porque las dos aportan lo mismo: nada.
    unidades = ", ".join(sorted({m["unidad"] for m in mags}))
    return (0.0,
            f"magnitud declarada ({mags[0]['valor']:g} {mags[0]['unidad']}) pero el "
            f"catalogo no tiene NI UNA linea medida en {unidades}: no hay rango "
            "contra que compararla, asi que no da puntos. No es que quede fuera de "
            "rango -- es que no hay rango, y media calificacion por una comparacion "
            "que no se hizo seria inventarla--")


def dias_de_antiguedad(fecha: str | None, hoy: date | None = None) -> int | None:
    if not fecha:
        return None
    hoy = hoy or date.today()
    for forma in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            d = datetime.strptime(str(fecha).strip()[:len(
                datetime.now().strftime(forma))], forma).date()
            return max(0, (hoy - d).days)
        except ValueError:
            continue
    return None


def puntos_de_frescura(fecha: str | None,
                       hoy: date | None = None) -> tuple[float, str]:
    dias = dias_de_antiguedad(fecha, hoy)
    if dias is None:
        return (FRESCURA_SIN_FECHA,
                "SIN FECHA: vale el minimo y queda marcado. Poner cero "
                "equivale a descartarla")
    for tope, puntos in ESCALA_FRESCURA:
        if dias <= tope:
            return (float(puntos), f"{dias} dias")
    return (0.0, f"{dias} dias: ya no es senal, es historia")


def puntos_de_fuente(fuente: str) -> tuple[float, str]:
    f = plano(fuente).replace(" ", "_")
    if f in FUERZA_DE_FUENTE:
        return (float(FUERZA_DE_FUENTE[f]), f"fuente '{f}'")
    return (0.0, f"fuente '{fuente}' sin peso declarado: cuenta CERO, no un "
                 "promedio. Un peso inventado es peor que un hueco")


def evaluar(senal: dict, catalogo: dict | None = None,
            hoy: date | None = None) -> dict:
    """Puntua una senal. `senal` lleva texto, fuente, fecha y si empata el padron.

    Devuelve el puntaje CON SU DESGLOSE y su `por_que`. Un numero sin su cuenta
    no se puede discutir, y este numero decide si se gastan 60 consultas.
    """
    catalogo = catalogo if catalogo is not None else cargar_catalogo()
    texto = " · ".join(str(senal.get(k) or "") for k in
                       ("texto", "requerimiento", "asunto", "nota"))
    # DEFECTO B3 de #330: EL GIRO DE LA CUENTA NO ENTRABA AL EVALUADOR.
    #
    # `puntos_de_proceso` existe para puntuar el PROCESO DEL CLIENTE contra el
    # catalogo, y solo se le daba el texto de la senal -- que es un titular de
    # prensa--. O sea: se le estaba pidiendo al encabezado de una nota que
    # dijera a que se dedica la empresa. El proceso es propiedad de la CUENTA,
    # no de la noticia.
    #
    # Medido: Coficab es una planta de cable automotriz, el catalogo tiene el
    # proceso `arneses_cableado` con proyectos reales, y la cuenta puntuaba CERO
    # en proceso -- o peor, puntuaba `metalmecanica` por la palabra "prensa" del
    # falso positivo B1--. El giro viaja en `Corrida.giro` desde siempre y nadie
    # lo conectaba.
    #
    # El giro se suma SOLO para reconocer el proceso, no para los tipos de obra:
    # el giro dice a que se dedica la planta, no que va a construir. Mezclarlo en
    # `tipos_que_nombra` haria que una planta de cable puntuara "cable de datos"
    # como si fuera un proyecto anunciado.
    texto_con_giro = " · ".join(x for x in (texto, str(senal.get("giro") or ""))
                                if x.strip())

    p_proc, por_proc = puntos_de_proceso(texto_con_giro, catalogo)
    nombra = tipos_que_nombra(texto)
    if nombra:
        pesos = [(t, tipo, peso_de_tipo(tipo, catalogo)) for t, tipo in nombra]
        pesos.sort(key=lambda x: -x[2])
        termino, tipo, p_tipo = pesos[0]
        por_tipo = (f"'{termino}' -> {tipo} "
                    f"({FAMILIA_DE_TIPO.get(tipo, '?')}, peso {p_tipo:g} de "
                    f"{MAX_TIPO_DE_OBRA})")
        tipos_nombrados = [x[1] for x in pesos]
    else:
        termino, tipo, p_tipo = "", None, 0.0
        por_tipo = "no nombra ningun tipo de proyecto de FTS"
        tipos_nombrados = []
    p_cap, por_cap = puntos_de_capacidad(texto, catalogo)
    p_fresca, por_fresca = puntos_de_frescura(senal.get("fecha"), hoy)
    p_fuente, por_fuente = puntos_de_fuente(senal.get("fuente", ""))
    empata = bool(senal.get("empata_padron"))
    p_padron = PADRON_EMPATA if empata else PADRON_NO_EMPATA

    match = round(p_proc + p_tipo + p_cap, 1)
    total = round(match + p_fresca + p_fuente + p_padron, 1)
    veredicto = (PASA if total >= UMBRAL_PASA
                 else GUARDA if total >= UMBRAL_GUARDA else ARCHIVA)

    ambiguedad = list(senal.get("ambiguedad") or [])
    if not empata:
        ambiguedad.append(
            "no empata con el corte vigente del DENUE. NO se descuenta: el "
            "corte es semestral y una planta nueva no existe ahi todavia")
    if p_fresca == FRESCURA_SIN_FECHA:
        ambiguedad.append("sin fecha en el registro")

    return {
        "puntaje": total,
        "veredicto": veredicto,
        "desglose": {
            "match_catalogo": match,
            "proceso": p_proc, "tipo_de_obra": p_tipo, "capacidad": p_cap,
            "frescura": p_fresca, "fuerza_de_fuente": p_fuente,
            "padron": p_padron,
        },
        "por_que": " · ".join([por_proc, por_tipo, por_cap,
                               f"frescura: {por_fresca}", por_fuente,
                               f"padron: {'empata (+8)' if empata else 'no empata (0)'}"]),
        "tipos_que_nombra": tipos_nombrados,
        # Un tipo integral NO tiene una familia: tiene todas. Reportar la de uno
        # de sus componentes le mentiria al lazo 1, que agrupa por familia para
        # corregir pesos -- le atribuiria a ELECTRICO una conversion que fue de
        # una obra completa--.
        "familia": (TIPO_INTEGRAL_OBRA_NUEVA if tipo in TIPOS_INTEGRALES
                    else FAMILIA_DE_TIPO.get(tipo) if tipo else None),
        "familias_de_la_obra": (familias_de_un_tipo_integral(tipo, catalogo)
                                if tipo in TIPOS_INTEGRALES else []),
        "ambiguedad": ambiguedad,
        "umbrales": {"pasa": UMBRAL_PASA, "guarda": UMBRAL_GUARDA},
    }
