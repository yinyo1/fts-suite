"""El estado de la corrida. Python lo posee; Claude propone, Python registra.

Si Claude intenta avanzar sin cerrar el paso anterior, `siguiente_paso` no
devuelve el paso que quiere: devuelve el que falta.
"""
from __future__ import annotations
import hashlib
import json, os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

from .compuertas import (EstadoModulo, Presupuesto, CompuertaCerrada, AGOTADO,
                         TAMANO_BLOQUE, POR_FUENTE, TRAMO_INCREMENTO,
                         TOPE_SIN_HUMANO, BLOQUES_SECOS_PARA_PARAR,
                         Busqueda)
from .catalogo import PERMITIDAS
from .confianza import (Contacto, Dato, Observacion, _normaliza,
                        EN_OTRA_PLANTA, EN_CORPORATIVO,
                        EN_ESTA_PLANTA, SIN_UBICACION)
from .chao1 import estimar, FALTA_BARRER, CAMBIAR_DE_VIA, SATURO

# El flujo, con las cinco correcciones validadas en el issue #22.
OLAS = [
    ("ola0_internas", "OLA 0 · INTERNAS — precedencia, no rendimiento",
     ["M0", "M0b", "M0c"]),
    # M3 sube al SEGUNDO lugar de la ola. Decision aprobada tras #295: ademas de
    # contactos da VOCABULARIO, y correrlo tarde fue lo que hizo que el motor de
    # combinaciones se armara sin las palabras del organismo de normalizacion.
    # Su rendimiento medido -- 0.62 entradas de valor por consulta contra 0.25
    # de M5-- no deja argumento para dejarlo al final de la fila.
    ("ola1_vocabulario", "OLA 1 · BARATAS — llenan el diccionario ANTES del motor",
     ["M13", "M3", "M1", "M2", "M12"]),
    ("ola2_motor", "OLA 2 · EL MOTOR CARO — ~60% del gasto",
     ["M4", "M5", "M6"]),
    ("ola3_refuerzo", "OLA 3 · REFUERZO",
     ["M7", "M8", "M9"]),
]

# Los modulos que el lazo de refuerzo reabre: motor -> individuales -> PDFs.
MODULOS_DEL_LOOP = ("M5", "M6", "M7")

DESCRIPCION = {
    "M0":  "Odoo · contactos ya cotizados -> patron REAL + vocabulario",
    "M0b": "Outlook · historia de cuenta -> ¿ya es cliente?",
    "M0c": "search_people · contactos IMPLICITOS del dominio -> CORREO LITERAL (ancla dura)",
    "M13": "DENUE · padron -> identidad y dominio_correo (entrada de M1)",
    "M1":  "Directorios (MINIMO 3, contrastados) -> patron con %",
    "M2":  "Vacantes · careers, Indeed, Glassdoor -> vocabulario de la casa",
    "M3":  "Congresos y camaras · CMC, CAINTRA, CLAUT, Supply Hub, Herramentales",
    "M12": "Prensa · angulo tecnico -> gancho Y TITULOS que el diccionario no tiene",
    "M4":  "Motor de combinaciones (SIN RED) -> lista de consultas",
    "M5":  "Busqueda de personas · 2 formas: simple SIN operador y site:linkedin",
    "M6":  "Individuales por nombre · cierra apellidos y cosecha colegas",
    "M7":  "PDFs publicos · DESPUES de M6: su forma fuerte pide nombres",
    "M8":  "Padrones publicos de gobierno",
    "M9":  "Aduanas · Panjiva",
}

# Estados de fuente. 'Cero resultados' ES una respuesta, no un fallo.
RESPONDIO = "respondio"
NO_APLICABA = "no_aplicaba"
FALLO = "fallo"
SIN_ACCESO = "sin_acceso"
OMITIDA_COSTO = "omitida_por_costo"
PENDIENTE = "pendiente"

# ---------------------------------------------------------------- niveles
NIVEL_PLANTA = "planta"
NIVEL_CORPORATIVO = "corporativo"
# Llave del archivo de la corrida corporativa. El guion bajo al frente la hace
# IMPOSIBLE de colisionar con un slug de ciudad -- ninguna ciudad empieza asi--
# y la ordena primero en la tabla de `estado`.
LLAVE_CORPORATIVO = "_corporativo"

# Los dos modulos que NO aplican al nivel corporativo, con su razon escrita: una
# VACANTE y un ESTABLECIMIENTO del DENUE son objetos DE PLANTA. Forzarlos al
# nivel corporativo devuelve las plantas otra vez, que es el problema que el
# nivel corporativo resuelve.
MODULOS_SIN_NIVEL_CORPORATIVO = {
    "M2": ("una vacante se publica POR PLANTA, con su ciudad. En el nivel "
           "corporativo devolveria las plantas otra vez, que es justo lo que "
           "este nivel separa."),
    "M13": ("el DENUE lista ESTABLECIMIENTOS con domicilio. El corporativo no "
            "es un establecimiento: no tiene una linea en el padron."),
}

# De donde vino el angulo de la corrida.
ORIGEN_MANUAL = "manual"
ORIGEN_RADAR = "radar"
# Marca del aviso del angulo preliminar, para poder REEMPLAZARLO cuando la
# corrida lo resuelve. Mismo mecanismo que `MARCA_CHALLENGE`: un aviso que dice
# "confirmalo" y sigue ahi despues de confirmado es una instruccion caduca en la
# ficha, y el operador no puede saber cual de las dos cosas es cierta.
MARCA_ANGULO = "[angulo] "

# QUE se siembra entre corridas. Lista corta, y los contactos NO estan: un
# contacto regional sembrado en una corrida de planta es exactamente el doble
# conteo que #300 midio. Van a la corrida corporativa.
SE_PUEDE_SEMBRAR = ("patron", "vocabulario", "nota")


@dataclass
class Corrida:
    empresa: str
    ciudad: str
    giro: str = ""
    creada: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    modulos: dict = field(default_factory=dict)      # nombre -> EstadoModulo
    cobertura: dict = field(default_factory=dict)    # nombre -> {estado, razon}
    presupuesto: Presupuesto = field(default_factory=Presupuesto)
    contactos: list = field(default_factory=list)    # list[Contacto]
    vocabulario: list = field(default_factory=list)  # titulos cosechados
    senal: list = field(default_factory=list)        # hallazgos de prensa
    challenge_corrido: bool = False
    avisos: list = field(default_factory=list)
    # Los tres textos que la ficha necesita y el codigo NO puede derivar: son
    # CRITERIO, y el criterio es del operador. Se cargan con `registrar`. Si
    # faltan, la ficha lo dice en su lugar en vez de callarlo -- un hueco
    # declarado es informacion; un hueco silencioso es una ficha que parece
    # completa y no lo esta--.
    # A DONDE se entrego la ficha, para que sobreviva a la sesion. La carpeta de
    # la corrida vive en /tmp del contenedor de Claude Code web, y ese
    # contenedor MUERE al cerrar la sesion: la primera corrida de Coficab se
    # perdio asi (#268). Mientras Postgres no exista, la ficha tiene que salir a
    # un lugar del OPERADOR.
    #
    # Python no puede subirla -- el conector vive detras de MCP, igual que Odoo
    # y Outlook--. Lo que si puede es EXIGIR la constancia de que salio, y
    # decirlo fuerte cuando no.
    entrega: dict = field(default_factory=dict)
    fichas_emitidas: list = field(default_factory=list)
    # De DONDE se leyo. Volver a guardar en otro sitio partiria la corrida en
    # dos archivos: la ruta de origen manda sobre cualquier recalculo.
    _ruta_origen: str = ""
    # La firma que el archivo TRAIA, y la que la corrida tiene de verdad al
    # abrirse. Si no coinciden, alguien escribio el JSON por fuera.
    _firma_leida: str = ""
    firma_al_abrir: str = ""
    gancho: str = ""
    por_que_ahora: str = ""
    como_hablarles: list = field(default_factory=list)
    vueltas_loop: int = 0
    _bloques_al_abrir_vuelta: int = 0
    # NIVEL de la corrida. `planta` es una planta concreta -- lo de siempre-- y
    # `corporativo` es la gente regional o de grupo, que NO tiene planta. Ver el
    # §3 de metodo/propuestas-de-metodo-300.md: en #300 la gente regional salio
    # en 2 a 4 de las cuatro corridas y cada Chao1 la sumo a SU poblacion.
    nivel: str = NIVEL_PLANTA
    # Lo que se SEMBRO de otras corridas, con su procedencia. No es evidencia:
    # es el punto de partida, y la ficha lo declara como tal.
    sembrado: list = field(default_factory=list)
    # El ANGULO con el que la corrida arranco -- la senal que la origino-- y de
    # donde vino. Cuando lo siembra el radar (motor 1) entra como gancho
    # PRELIMINAR, no observado, y la corrida lo confirma o lo corrige.
    angulo: str = ""
    origen: str = ORIGEN_MANUAL
    angulo_resuelto: str = ""        # "confirmado" | "corregido" | ""

    # ---------------------------------------------------------------- modulos
    def mod(self, nombre: str) -> EstadoModulo:
        if nombre not in self.modulos:
            self.modulos[nombre] = EstadoModulo(modulo=nombre)
        # M5 lee sus bloques secos del Presupuesto de ESTA corrida, no de un
        # contador aparte que habia que acordarse de subir (defecto de #24).
        self.modulos[nombre].presupuesto = self.presupuesto
        return self.modulos[nombre]

    # ------------------------------------------------- el registro de trabajo
    def busquedas(self) -> list[Busqueda]:
        """Todo el trabajo ejecutado, en orden. UNICA fuente de verdad del
        progreso: de aqui salen los contadores de agotado Y los `hits` que
        alimentan Chao1."""
        todas = [b for m in self.modulos.values() for b in m.registros]
        return sorted(todas, key=lambda b: b.ts)

    def registrar_busqueda(self, modulo: str, clave: str, consulta: str,
                           fuente: str, resultados: int, nota: str = "",
                           contactos: list | None = None,
                           etiqueta: str | None = None,
                           liga: str = "") -> Busqueda:
        """Registra trabajo EJECUTADO. Es lo unico que mueve un contador."""
        contactos = contactos or []
        if resultados < len(contactos):
            raise CompuertaCerrada(
                f"[{modulo}] la busqueda declara resultados={resultados} pero "
                f"entrega {len(contactos)} contacto(s). Una busqueda no puede "
                "traer mas gente de la que dice haber encontrado.")
        m = self.mod(modulo)
        for x in contactos:
            # De que modulo salio. El PRIMERO que lo trajo se queda con el
            # credito: si M5 lo encuentra despues, ya no es un hallazgo nuevo.
            if not x.modulo_origen:
                x.modulo_origen = modulo
        claves = [self.agregar(x, contar_hit=False).clave for x in contactos]
        b = m.registrar_busqueda(clave, consulta, fuente, resultados, nota,
                                 claves, etiqueta=etiqueta, liga=liga)
        self._recalcular_hits()
        return b

    def _recalcular_hits(self) -> None:
        """`hits` y `modulo_origen`: los dos DERIVADOS del registro.

        Derivados, no contadores que alguien sube. Es lo mismo que `n_raices`
        hace con las observaciones, aplicado al progreso.

        `modulo_origen` estuvo un rato como campo que se ESCRIBIA al registrar,
        y la corrida real de Cuprum del 24-sep-2026 mostro por que eso esta mal:
        `_cargar` no lo restauraba del JSON, la corrida volvia del disco con
        veintitres contactos sin origen, y la tabla de rendimiento -- la cifra
        que ORDENA las prioridades del metodo -- salia con todas las filas en
        cero sin quejarse de nada. Derivarlo del registro vuelve imposible ese
        modo de falla: si la evidencia esta, el origen esta."""
        conteo: dict[str, int] = {}
        origen: dict[str, str] = {}
        for b in self.busquedas():           # en orden: el PRIMERO se lo queda
            for k in set(b.hallazgos):
                conteo[k] = conteo.get(k, 0) + 1
                origen.setdefault(k, b.modulo)
        for x in self.contactos:
            if x.clave in conteo:
                x.hits = conteo[x.clave]
            if x.clave in origen:
                x.modulo_origen = origen[x.clave]

    def marcar_cobertura(self, modulo: str, estado: str, razon: str = "") -> None:
        if estado in (NO_APLICABA, OMITIDA_COSTO, SIN_ACCESO) and not razon:
            raise CompuertaCerrada(
                f"[{modulo}] estado '{estado}' EXIGE razon. "
                "Un hueco sin motivo escrito se confunde con 'no hay nada'.")
        self.cobertura[modulo] = {"estado": estado, "razon": razon}

    # ---------------------------------------------------------------- senales
    #
    # B1 y B6 de #300. Dos defectos que se tocan:
    #
    #   B1  `registrar` aceptaba la senal como objeto {fecha,texto,fuente} y
    #       `ficha` tronaba con TypeError. Un agente lo vio y edito el JSON de
    #       estado a mano para poder emitir la ficha -- que es justo lo que no
    #       queremos--.
    #   B6  nada impedia meter "Mapeo de plantas" o "Contactos:" como senal.
    #       Salen en la ficha como senal sin fecha, ocupando el lugar de una de
    #       verdad.
    #
    # NOTA DE DISENO, y me aparto de la letra de B1 a proposito: B1 pedia
    # RECHAZAR el objeto y B6 pedia que la senal tenga "texto y fuente". Las dos
    # cosas juntas no se pueden -- si la senal es solo texto, no hay donde poner
    # la fuente--. El instinto del agente era correcto: queria estructura. Asi
    # que se ACEPTAN las dos formas y se normalizan a la cadena canonica, en vez
    # de rechazar la que tenia razon. Lo que se rechaza es lo que no es una
    # senal. Si Esteban prefiere el rechazo puro, es una linea.
    ETIQUETAS_NO_SENAL = (
        "mapeo de plantas", "contactos", "vocabulario", "resumen", "notas",
        "hallazgos", "fuentes", "pendientes", "observaciones",
    )
    LARGO_MINIMO_SENAL = 25

    @classmethod
    def normalizar_senal(cls, s) -> str:
        """Una senal, como cadena canonica. Lanza si no es una senal.

        Acepta la cadena, o un objeto con `texto` y opcionalmente `fecha` y
        `fuente` -- y los pega delante, porque la ficha lee la fecha DEL TEXTO--.
        """
        if isinstance(s, dict):
            texto = str(s.get("texto") or s.get("senal") or "").strip()
            if not texto:
                raise CompuertaCerrada(
                    f"Senal sin `texto`: {s!r}. Si viene como objeto, el campo "
                    "`texto` es obligatorio; `fecha` y `fuente` son opcionales y "
                    "se pegan al frente para que la ficha las vea.")
            trozos = [str(s[k]).strip() for k in ("fecha", "fuente")
                      if s.get(k)]
            s = " · ".join(trozos + [texto]) if trozos else texto
        elif not isinstance(s, str):
            raise CompuertaCerrada(
                f"Senal de tipo {type(s).__name__}: {s!r}. Una senal es texto, "
                "o un objeto con `texto`. Ni una lista ni un numero.")

        s = " ".join(s.split())
        if not s:
            raise CompuertaCerrada("Senal vacia.")
        desnudo = s.rstrip(":").strip().lower()
        if desnudo in cls.ETIQUETAS_NO_SENAL:
            raise CompuertaCerrada(
                f"'{s}' es un ENCABEZADO, no una senal. Una senal dice algo que "
                "pasa en la cuenta y que se puede fechar -- una inversion, una "
                "vacante, un evento, una nota--. Lo que es un rotulo va en la "
                "nota de su busqueda, no aqui.")
        if s.endswith(":"):
            raise CompuertaCerrada(
                f"'{s}' termina en dos puntos: es el rotulo de una lista, no la "
                "senal. Escribe el hallazgo.")
        if len(s) < cls.LARGO_MINIMO_SENAL:
            raise CompuertaCerrada(
                f"Senal de {len(s)} caracteres: '{s}'. Una senal necesita cuerpo "
                f"(>= {cls.LARGO_MINIMO_SENAL}): que pasa, y con que fecha o "
                "fuente se sabe. Dos palabras no son una senal.")
        return s

    def agregar_senal(self, s) -> str:
        canonica = self.normalizar_senal(s)
        self.senal.append(canonica)
        return canonica

    # ------------------------------------------------------------- la entrega
    #
    # DESTINOS EVALUADOS, y por que este:
    #
    #   onedrive  RECOMENDADO. `sharepoint_upload_file` de M365 sube texto UTF-8
    #             hasta 1 MB -- la ficha pesa ~25 KB-- y cae en el MISMO
    #             inquilino de Microsoft donde ya viven el Outlook y el Odoo del
    #             operador. Los datos personales no salen del control corporativo
    #             de FTS, que es la razon de fondo: la ficha lleva nombres,
    #             puestos y correos.
    #
    #   drive     ALTERNATIVA. `create_file` de Google Drive es mas simple -- no
    #             hace falta buscar el driveId primero-- pero cae en una cuenta
    #             distinta a la corporativa. Sirve de respaldo si OneDrive falla.
    #
    #   correo    NO SE PUEDE, medido: el `outlook_send_mail` conectado NO tiene
    #             parametro de adjuntos. Y pegar el HTML en el cuerpo no sirve:
    #             el cuerpo se sanea contra una lista corta que quita <style> y
    #             <span>, asi que llegaria el texto sin el diseno y sin ser un
    #             archivo que el operador pueda reenviar.
    DESTINOS = ("onedrive", "drive", "otro")

    def registrar_entrega(self, destino: str, url: str, archivo: str = "") -> dict:
        if destino not in self.DESTINOS:
            raise CompuertaCerrada(
                f"Destino '{destino}' desconocido. Los evaluados: "
                f"{', '.join(self.DESTINOS)}. 'correo' NO esta: el conector de "
                "Outlook no tiene parametro de adjuntos.")
        if not (url or "").strip():
            raise CompuertaCerrada(
                f"Entrega a '{destino}' sin URL. Una entrega sin liga no se "
                "puede comprobar, y el punto de entregarla es que el operador "
                "la encuentre cuando esta sesion ya no exista.")
        self.entrega = {
            "destino": destino, "url": url.strip(), "archivo": archivo,
            "ts": datetime.now(timezone.utc).isoformat(), "declarada": False,
        }
        return self.entrega

    def declarar_sin_entregar(self, razon: str) -> dict:
        """El operador decide no sacarla. Queda escrito que la ficha es volatil."""
        if not (razon or "").strip():
            raise CompuertaCerrada(
                "No entregar la ficha EXIGE razon escrita: significa que se va a "
                "perder al cerrar la sesion, y eso tiene que quedar dicho.")
        self.entrega = {
            "destino": "", "url": "", "archivo": "",
            "ts": datetime.now(timezone.utc).isoformat(),
            "declarada": True, "razon": razon.strip(),
        }
        return self.entrega

    @property
    def entregada(self) -> bool:
        return bool(self.entrega.get("url"))

    @property
    def entrega_pendiente(self) -> bool:
        """Se emitio la ficha y la copia entregada no esta al dia.

        No basta con "se entrego una vez": si la ficha se vuelve a emitir DESPUES
        de haberla subido, la copia de OneDrive quedo vieja y el operador se la
        va a mandar a Rissia creyendo que es la ultima. Se compara la fecha del
        archivo contra la de la entrega -- derivado del disco, no declarado--.
        """
        if not self.fichas_emitidas:
            return False
        if not self.entrega:
            return True
        if self.entrega.get("declarada"):
            return False            # el operador ya dijo que no la saca
        ts = self.entrega.get("ts") or ""
        try:
            entregada_en = datetime.fromisoformat(ts)
        except ValueError:
            return True
        if entregada_en.tzinfo is None:
            entregada_en = entregada_en.replace(tzinfo=timezone.utc)
        for ruta in self.fichas_emitidas:
            try:
                m = datetime.fromtimestamp(os.path.getmtime(ruta), timezone.utc)
            except OSError:
                continue            # el archivo ya no esta: nada que reclamar
            if m > entregada_en:
                return True
        return False

    # ------------------------------------------------- fusionar / renombrar
    def fusionar(self, nombre_viejo: str, nombre_nuevo: str) -> Contacto:
        """El contacto se queda con su nombre COMPLETO cuando aparece.

        Tres veces en la corrida de #295 aparecio el nombre completo de alguien
        que ya estaba en la lista con el apellido cortado por un directorio.
        Registrarlo como contacto aparte habria inflado el numerador de Chao1;
        registrarlo como observacion `nombre_completo` -- que fue lo que hice--
        dejaba la ficha mostrando el nombre corto. Faltaba esto.

        Si el nombre nuevo YA existe como contacto, los dos se funden en uno:
        las observaciones se suman, la cercania se acerca, la revision humana y
        la vigencia se propagan con la misma asimetria de siempre -- solo se
        agregan, nunca se limpian-- y los `hits` se recalculan del registro.
        """
        origen = self._buscar(nombre_viejo)
        if origen is None:
            raise CompuertaCerrada(
                f"No hay contacto '{nombre_viejo}' en la corrida. Fusionar algo "
                "que no esta registrado es inventar una fusion.")
        if not (nombre_nuevo or "").strip():
            raise CompuertaCerrada("El nombre nuevo no puede ir vacio.")

        clave_vieja = origen.clave
        destino = self._buscar(nombre_nuevo)

        if destino is None or destino is origen:
            origen.nombre = nombre_nuevo.strip()
        else:
            for campo, d in origen.datos.items():
                destino.dato(campo).observaciones.extend(d.observaciones)
            destino.cercania_decision = min(destino.cercania_decision,
                                            origen.cercania_decision)
            if origen.revision_humana and not destino.revision_humana:
                destino.revision_humana = True
                destino.motivo_revision = origen.motivo_revision
            if not origen.sigue_en_la_casa:
                destino.sigue_en_la_casa = False
            if not destino.puesto and origen.puesto:
                destino.puesto = origen.puesto
            self.contactos.remove(origen)
            origen = destino

        # El REGISTRO manda: las busquedas apuntan al contacto por su clave, y
        # si la clave cambia hay que reapuntarlas o los `hits` y el origen
        # quedan colgando de una clave que ya no existe.
        for b in self.busquedas():
            b.hallazgos = [origen.clave if k == clave_vieja else k
                           for k in b.hallazgos]
        self._recalcular_hits()
        return origen

    def _buscar(self, nombre: str) -> Contacto | None:
        objetivo = _normaliza(nombre or "")
        for x in self.contactos:
            if _normaliza(x.nombre or "") == objetivo:
                return x
        return None

    # --------------------------------------------- el bloque, contra evidencia
    # Las consultas que NO tocan red no gastan presupuesto. M4 genera su
    # producto sin pedirle nada a nadie: contarla seria cobrarle a la cuenta una
    # consulta que nunca salio.
    SIN_RED = ("patron_derivado",)

    def consultas_de_red(self) -> int:
        return sum(1 for b in self.busquedas() if b.fuente not in self.SIN_RED)

    def de_valor_ahora(self) -> int:
        """Cuantos contactos son DE VALOR en este momento.

        Se mide sobre el estado actual, no sobre el momento en que cada uno
        entro: si una vuelta posterior le encuentra el puesto a alguien que
        habia entrado sin el, el valor sube y el bloque que trajo esa evidencia
        se lo lleva de credito. Paso de verdad en #295 con una coordinacion de
        fundicion que entro sin puesto en el bloque 4.
        """
        return sum(1 for x in self.contactos if x.de_valor)

    def bloque_pendiente(self) -> tuple[int, int, int]:
        """(consultas, nuevas, de_valor) acumuladas desde el ultimo bloque.

        Derivado del registro. Es la misma leccion que los contadores de agotado
        y que `hits`: un bloque que se declara a mano deriva, y derivar en la
        compuerta que decide cuando PARAR es derivar en la unica cifra que no
        se puede equivocar."""
        b0, c0, v0 = self.presupuesto.marcador
        return (self.consultas_de_red() - b0, len(self.contactos) - c0,
                self.de_valor_ahora() - v0)

    def exigir_bloque_cerrado(self) -> None:
        """Se niega a registrar la consulta 11 con un bloque de 10 sin cerrar.

        La primera corrida real de un operador (Coficab, #268) se rompio aqui, y
        no por descuido de la compuerta sino por su MOMENTO: el operador no cerro
        el bloque a las diez y siguio hasta 35. Ahi `bloque` lo rechaza -- el
        maximo es diez-- y el bloque ya no se puede partir sin editar el estado a
        mano. Consecuencia real: M5 cerrado como `fallo` y la vuelta que Chao1
        pedia imposible de abrir.

        La compuerta detectaba el error cuando ya no tenia arreglo. Ahora lo
        detecta cuando todavia se puede corregir: en la consulta once.
        """
        pendientes, _n, _v = self.bloque_pendiente()
        if pendientes >= TAMANO_BLOQUE:
            raise CompuertaCerrada(
                f"Hay {pendientes} consultas sin bloque cerrado y el bloque es "
                f"de {TAMANO_BLOQUE}. NO se registra la siguiente hasta "
                f"cerrarlo:\n\n"
                f"    ./prospector bloque --empresa {self.empresa!r}\n\n"
                "Las dos cifras salen del registro, no hay que contarlas. "
                "Si se deja correr, el bloque pasa de diez y entonces ya no se "
                "puede cerrar ni partir: se pierde la medicion de rendimiento "
                "marginal de ese tramo y con ella la vuelta del lazo. Paso de "
                "verdad en la corrida de Coficab (#268), con 35 consultas.")

    def aviso_de_bloque(self) -> str:
        """El aviso que `buscar` imprime cuando el pendiente llega al tope.

        Vacio mientras no haga falta: un aviso que sale siempre no se lee.
        """
        pendientes, nuevas, valor = self.bloque_pendiente()
        if pendientes < TAMANO_BLOQUE:
            faltan = TAMANO_BLOQUE - pendientes
            if faltan <= 2:
                return (f"  ⏱  {pendientes}/{TAMANO_BLOQUE} consultas en el "
                        f"bloque. {'Falta' if faltan == 1 else 'Faltan'} "
                        f"{faltan} para cerrarlo.")
            return ""
        return (f"  ⛔ CIERRA EL BLOQUE AHORA — {pendientes}/{TAMANO_BLOQUE} "
                f"consultas, {nuevas} entradas, {valor} de valor:\n"
                f"       ./prospector bloque --empresa {self.empresa!r}\n"
                f"     La siguiente busqueda NO se va a registrar hasta que lo "
                f"cierres.")

    def cerrar_bloque(self, consultas: int | None = None,
                      nuevas: int | None = None, parcial: bool = False):
        """Cierra el bloque con lo que la EVIDENCIA dice.

        Si quien lo cierra declara numeros, tienen que coincidir. No es
        redundancia: es el mismo truco del contador vacio aplicado al
        presupuesto, y hasta la corrida de Cuprum del 24-sep-2026 no habia
        nada que lo detuviera."""
        real_c, real_n, real_v = self.bloque_pendiente()
        if consultas is not None and consultas != real_c:
            raise CompuertaCerrada(
                f"El bloque declara {consultas} consultas y el registro tiene "
                f"{real_c}. Un bloque mide rendimiento marginal: si el "
                "denominador se escribe a mano, no mide nada. Registra las "
                "busquedas que falten con `buscar`, o no declares el numero.")
        if nuevas is not None and nuevas != real_n:
            raise CompuertaCerrada(
                f"El bloque declara {nuevas} entradas nuevas y la corrida "
                f"gano {real_n} contactos desde el bloque anterior. El "
                "numerador tampoco se escribe a mano.")
        if real_c < TAMANO_BLOQUE and not parcial:
            raise CompuertaCerrada(
                f"Bloque de {real_c} consultas: el tamano es {TAMANO_BLOQUE}. "
                "Un bloque corto no puede declarar que la veta se agoto, solo "
                "que se pregunto poco. Corre las que faltan, o cierralo con "
                "`parcial=True` y sabiendo que NO contara como seco.")
        return self.presupuesto.registrar(
            real_c, real_n,
            busquedas_al_cerrar=self.consultas_de_red(),
            contactos_al_cerrar=len(self.contactos),
            de_valor=real_v,
            de_valor_al_cerrar=self.de_valor_ahora())

    def cerrar_modulo(self, nombre: str, estado: str = RESPONDIO, razon: str = "") -> None:
        m = self.mod(nombre)
        if estado == RESPONDIO:
            m.exigir_agotado()           # <- compuerta (a)
        m.cerrado = True
        self.marcar_cobertura(nombre, estado, razon)

    # -------------------------------------------------------------- contactos
    def agregar(self, c: Contacto, contar_hit: bool = True) -> Contacto:
        for ex in self.contactos:
            if ex.clave == c.clave:
                if contar_hit:
                    ex.hits += 1
                for campo, d in c.datos.items():
                    destino = ex.dato(campo)
                    destino.observaciones.extend(d.observaciones)
                # La cercania solo se ACERCA. Una vuelta posterior que identifica
                # mejor el asiento no puede quedar ignorada porque el contacto ya
                # estaba en la lista: la corrida de Cuprum del 24-sep-2026 entro
                # a un "decision maker" sin puesto con cercania 50, y dos
                # consultas despues un organigrama lo nombro DIRECTOR GENERAL.
                # Sin esto seguia contando como contexto.
                ex.cercania_decision = min(ex.cercania_decision,
                                           c.cercania_decision)
                # La revision humana solo se AGREGA, nunca se limpia sola: un
                # hueco que ya se detecto no desaparece porque otra fuente no lo
                # mencione.
                # La vigencia solo se APAGA, nunca se vuelve a encender.
                if not c.sigue_en_la_casa:
                    ex.sigue_en_la_casa = False
                if c.revision_humana and not ex.revision_humana:
                    ex.revision_humana = True
                    ex.motivo_revision = c.motivo_revision
                if not ex.puesto and c.puesto:
                    ex.puesto = c.puesto
                return ex
        c.hits = max(1, c.hits) if contar_hit else max(0, c.hits)
        self.contactos.append(c)
        return c

    # ------------------------------------------------- rendimiento por modulo
    def rendimiento(self) -> list[dict]:
        """La tabla de #20, calculada de esta corrida. Monedas SEPARADAS.

        `entradas` y `de_valor` no se suman ni se promedian entre si: son dos
        preguntas distintas, y mezclarlas fue el error que el #20 corrigio. M5
        puede traer veinte entradas y cero de valor, y las dos cifras son
        ciertas al mismo tiempo.
        """
        filas = []
        for clave, _titulo, modulos in OLAS:
            for mod in modulos:
                m = self.modulos.get(mod)
                if m is None:
                    continue
                traidos = [c for c in self.contactos if c.modulo_origen == mod]
                cons = m.consultas_corridas
                val = sum(1 for c in traidos if c.de_valor)
                anclas = sum(1 for c in traidos if c.tiene_ancla)
                filas.append({
                    "ola": clave, "modulo": mod,
                    "consultas": cons,
                    "resultados_declarados": m.resultados_totales,
                    "entradas": len(traidos),
                    "de_valor": val,
                    "con_ancla": anclas,
                    "ent_por_consulta": round(len(traidos) / cons, 2) if cons else None,
                    "valor_por_consulta": round(val / cons, 2) if cons else None,
                    "cobertura": self.cobertura.get(mod, {}).get("estado", PENDIENTE),
                    "agotado": m.agotado,
                })
        return filas

    def rendimiento_por_origen(self) -> dict:
        """Internas contra web abierta. El numero que ordena las prioridades."""
        ORIGEN = {"M0": "interna", "M0b": "interna", "M0c": "interna",
                  "M4": "motor", "M13": "padron"}
        out = {}
        for f in self.rendimiento():
            k = ORIGEN.get(f["modulo"], "web")
            a = out.setdefault(k, {"consultas": 0, "entradas": 0, "de_valor": 0,
                                   "con_ancla": 0, "modulos": []})
            a["consultas"] += f["consultas"]; a["entradas"] += f["entradas"]
            a["de_valor"] += f["de_valor"];   a["con_ancla"] += f["con_ancla"]
            a["modulos"].append(f["modulo"])
        total_valor = sum(a["de_valor"] for a in out.values())
        for a in out.values():
            a["pct_del_valor"] = (round(100 * a["de_valor"] / total_valor)
                                  if total_valor else None)
            a["valor_por_consulta"] = (round(a["de_valor"] / a["consultas"], 2)
                                       if a["consultas"] else None)
        return out

    # ------------------------------------------------------------------ chao1
    def completitud(self):
        """Chao1 sobre LA POBLACION DE ESTA CORRIDA, no sobre todo lo que entro.

        El arreglo del doble conteo de #300. Compras MRO, compras regionales de
        Americas y EHS corporativo aparecieron en 2 a 4 de las cuatro corridas de
        Coficab, y cada Chao1 las sumo a SU poblacion: los cuatro estimaron sobre
        una poblacion que no existe.

        Se excluye por EVIDENCIA DE UBICACION -- una fuente dijo que esta en otra
        planta o en el grupo-- y nunca por el titulo. Quien no tiene ubicacion
        observada SI cuenta: ausencia de evidencia no es evidencia de ausencia.

        En el nivel CORPORATIVO no se excluye a nadie, y no es una excepcion
        suelta: la exclusion necesita una ciudad contra la que comparar, y una
        corrida corporativa no tiene una. Sus consultas ya son corporativas.
        """
        return estimar([c.hits for c in self.poblacion()])

    def poblacion(self) -> list:
        """Los contactos que pertenecen a la poblacion que esta corrida estima."""
        if self.nivel == NIVEL_CORPORATIVO:
            return list(self.contactos)
        return [c for c in self.contactos
                if c.cuenta_en_la_poblacion_de(self.ciudad)]

    def fuera_de_la_poblacion(self) -> list[tuple]:
        """(contacto, donde_esta) de los que NO cuentan, con su razon."""
        if self.nivel == NIVEL_CORPORATIVO:
            return []
        out = []
        for c in self.contactos:
            donde = c.ubicacion_respecto_a(self.ciudad)
            if donde in (EN_OTRA_PLANTA, EN_CORPORATIVO):
                out.append((c, donde))
        return out

    # ------------------------------------------- la semilla para el corporativo
    def semilla_corporativa(self) -> list[dict]:
        """Los regionales y los de otra planta, listos para `sembrar`.

        Es la segunda mitad del arreglo, y sin ella el primero solo resta: hoy
        esta gente es RUIDO en cuatro fichas -- la ficha de Pesqueria traia como
        unico contacto a uno de Juarez--. Asi es el INSUMO de una quinta corrida.

        Sale sin nombres: lo que viaja es el PUESTO, la ubicacion observada y de
        que corrida salio. El nombre lo vuelve a encontrar la corrida destino, y
        asi la semilla no puede pasar por observacion propia.
        """
        out = []
        for c, donde in self.fuera_de_la_poblacion():
            out.append({
                "puesto": c.puesto or (c.dato("puesto").valor
                                       if "puesto" in c.datos else None),
                "donde": donde,
                "ubicaciones": c.ubicaciones_observadas,
                "cercania_decision": c.cercania_decision,
                "de_corrida": self.llave,
            })
        return out

    @property
    def llave(self) -> str:
        """Como se nombra esta corrida cuando otra habla de ella."""
        if self.nivel == NIVEL_CORPORATIVO:
            return f"{self.empresa}/{LLAVE_CORPORATIVO}"
        return f"{self.empresa}/{self.ciudad or '?'}"

    # ------------------------------------------------------------- sembrar
    def sembrar(self, de_corrida: str, que: str, valor, campo: str = "",
                nota: str = "") -> dict:
        """Mete en esta corrida algo que OTRA corrida ya midio.

        `que` es `patron`, `vocabulario` o `nota`. Los CONTACTOS REGIONALES no se
        siembran en una corrida de planta -- van a la corporativa--: sembrarlos en
        las plantas es exactamente lo que causo el doble conteo.

        Lo que esto NO hace, y es todo el diseno:

          * NO registra una busqueda -- no se ejecuto trabajo aqui--, asi que no
            mueve el presupuesto ni el agotado;
          * NO cuenta como raiz: la observacion entra con `sembrado=True` y
            `Dato.n_raices` la salta;
          * TOPA EN CANDIDATO mientras esta corrida no lo observe por su cuenta.

        La razon esta escrita en `Observacion.sembrado`: el patron de Coficab
        tiene UNA ancla, en Juarez. Si sembrarla contara como fuente, una sola
        observacion produciria CONFIRMADO en cuatro corridas.
        """
        if que not in SE_PUEDE_SEMBRAR:
            raise CompuertaCerrada(
                f"No se siembra '{que}'. Lo que se siembra es: "
                f"{', '.join(sorted(SE_PUEDE_SEMBRAR))}.\n"
                "  Y los CONTACTOS REGIONALES no se siembran en una corrida de "
                "planta: van a la corrida corporativa. Sembrarlos en las plantas "
                "es lo que hizo que los cuatro Chao1 de #300 contaran a la misma "
                "gente cuatro veces.")
        if not str(de_corrida or "").strip():
            raise CompuertaCerrada(
                "Una semilla sin corrida de origen no se puede auditar: la ficha "
                "tiene que poder decir de donde salio el dato.")
        if de_corrida.strip() == self.llave:
            raise CompuertaCerrada(
                f"'{de_corrida}' es esta misma corrida. Sembrarse a si misma "
                "duplicaria la observacion y la haria parecer dos.")
        if not str(valor or "").strip():
            raise CompuertaCerrada(f"Semilla de '{que}' sin valor.")
        valor = str(valor).strip()
        registro = {"que": que, "valor": valor, "de_corrida": de_corrida.strip(),
                    "campo": campo, "nota": nota,
                    "ts": datetime.now(timezone.utc).isoformat()}
        if que == "vocabulario":
            if valor not in self.vocabulario:
                self.vocabulario.append(valor)
        self.sembrado.append(registro)
        return registro

    def sembrar_en_contacto(self, c: Contacto, campo: str, valor,
                            de_corrida: str) -> Observacion:
        """La semilla que entra como OBSERVACION de un contacto, marcada."""
        d = c.dato(campo)
        d.observar("sembrado", valor, sembrado=True, de_corrida=de_corrida,
                   nota=f"sembrado de {de_corrida}, no observado aqui")
        return d.observaciones[-1]

    @property
    def patron_sembrado(self) -> dict | None:
        """El patron de correo que esta corrida NO derivo: lo trajo sembrado."""
        for r in reversed(self.sembrado):
            if r["que"] == "patron":
                return r
        return None

    # ------------------------------------------------------- nivel corporativo
    def abrir_nivel_corporativo(self) -> list[str]:
        """Cierra los modulos que no aplican a una corrida sin planta."""
        cerrados = []
        for mod, razon in MODULOS_SIN_NIVEL_CORPORATIVO.items():
            self.mod(mod).cerrado = True
            self.marcar_cobertura(mod, NO_APLICABA, razon)
            cerrados.append(mod)
        return cerrados

    # -------------------------------------------------- las VIAS que quedan
    def vias_sin_agotar(self) -> dict[str, list[str]]:
        """Fuentes del catalogo que este modulo NO ha preguntado todavia.

        Es lo que hace operable el veredicto CAMBIAR_DE_VIA: "cambia de via" sin
        decir a cual no es una instruccion. Un modulo cerrado por `sin_acceso` o
        `omitida_por_costo` no ofrece vias: ya se dijo por que no se puede.
        """
        out = {}
        for mod, permitidas in PERMITIDAS.items():
            cob = (self.cobertura.get(mod) or {}).get("estado", "")
            if cob in (SIN_ACCESO, OMITIDA_COSTO, NO_APLICABA):
                continue
            m = self.modulos.get(mod)
            usadas = {b.via for b in (m.registros if m else [])}
            libres = [f for f in permitidas if f.strip().lower() not in usadas]
            if libres:
                out[mod] = libres
        return out

    # -------------------------------------------------------- EL DESEMPATE
    def desempate(self) -> dict:
        """Quien manda cuando la compuerta de agotado y Chao1 no coinciden.

        Aprobado sobre #302, y la razon de fondo es que LAS DOS NO MIDEN LO
        MISMO: agotado mide el rendimiento marginal DE LA ESTRATEGIA que se esta
        corriendo; Chao1 mide LA POBLACION que falta por ver. Pueden tener razon
        las dos a la vez.

        Los tres casos:

          1. `prematuro` o `sin_datos` contra 3 bloques secos -> MANDA AGOTADO.
             Y no porque "prematuro pierda": porque con 5 observados y f2=1 Chao1
             NO TIENE DENOMINADOR. No dijo "falta gente", dijo "no puedo opinar".
             Es el caso de Pesqueria en #300.
          2. `falta_barrer` confiable y sin bloques secos -> MANDA CHAO1. Es
             Juarez y Silao, que cerraron por TOPE y no por agotado: eso lo
             resuelve el tramo adaptativo, no este desempate.
          3. `falta_barrer` confiable CONTRA 3 bloques secos -> NINGUNA DE LAS
             DOS. Las consultas estan mal, no el presupuesto: CAMBIAR_DE_VIA.
             Y si no queda ninguna via, entonces si para -- y eso es un hallazgo
             entregable, no un fracaso: le dice al operador QUE COMPRAR--.
        """
        est = self.completitud()
        vias = self.vias_sin_agotar()
        base = {"chao1": est.veredicto, "chao1_opina": est.confiable,
                "secos_al_final": self.presupuesto.secos_al_final,
                "vias_sin_agotar": vias}
        if not self.presupuesto.saturado:
            if est.veredicto == SATURO:
                return base | {"veredicto": SATURO, "manda": "chao1",
                               "para": True,
                               "razon": "Chao1 opina y dice que ya esta barrido."}
            return base | {"veredicto": est.veredicto, "manda": "ninguna",
                           "para": False,
                           "razon": "no hay desacuerdo: ninguna compuerta cerro."}
        # saturado: tres bloques secos seguidos
        if not (est.veredicto == FALTA_BARRER and est.confiable):
            return base | {
                "veredicto": est.veredicto, "manda": "agotado", "para": True,
                "razon": (
                    f"{self.presupuesto.secos_al_final} bloques secos seguidos, y "
                    f"Chao1 con {est.observados} observados y f2={est.f2} NO "
                    "OPINA -- no dijo 'falta gente', dijo 'no puedo'--. Manda la "
                    "compuerta de agotado.")}
        if vias:
            return base | {
                "veredicto": CAMBIAR_DE_VIA, "manda": "ninguna", "para": False,
                "razon": (
                    f"las dos tienen razon: Chao1 opina y dice que falta "
                    f"{100 - est.cobertura * 100:.0f}% de la poblacion, y "
                    f"{self.presupuesto.secos_al_final} bloques seguidos dicen "
                    "que estas consultas ya no la traen. LAS CONSULTAS ESTAN "
                    "MAL, NO EL PRESUPUESTO: cambia de via, sin renovar tope. "
                    "Quedan: " + "; ".join(f"{m} -> {', '.join(f)}"
                                           for m, f in vias.items()))}
        return base | {
            "veredicto": SATURO, "manda": "las dos", "para": True,
            "razon": (
                "la poblacion NO esta agotada -- Chao1 opina y dice que falta "
                f"{100 - est.cobertura * 100:.0f}%-- pero LAS VIAS DISPONIBLES "
                "SI. No queda una sola fuente del catalogo sin preguntar en un "
                "modulo abierto. Lo que falta necesita una fuente que no "
                "tenemos: Sales Navigator, o un padron con acceso. Eso va en la "
                "ficha, y es un hallazgo: dice QUE COMPRAR.")}

    # --------------------------------------------------- EL TRAMO ADAPTATIVO
    def evaluar_tramo(self) -> dict:
        """Si el tope se puede renovar, y con que evidencia. NO muta nada.

        Las TRES condiciones, todas derivadas de evidencia y ninguna de un
        contador que alguien suba.
        """
        est = self.completitud()
        ultimo = self.presupuesto.bloques[-1] if self.presupuesto.bloques else None
        vias = self.vias_sin_agotar()
        cond = {
            "chao1_dice_que_falta": est.veredicto == FALTA_BARRER and est.confiable,
            "ultimo_bloque_no_seco": bool(ultimo) and not ultimo.seco,
            "queda_via_sin_agotar": bool(vias),
        }
        faltan = [k for k, v in cond.items() if not v]
        razon = (
            f"chao1 {est.veredicto} "
            f"{'confiable' if est.confiable else 'NO confiable'} "
            f"{est.cobertura:.0%} · ultimo bloque "
            + (f"B{ultimo.numero} {ultimo.consultas}/{ultimo.nuevas}/"
               f"{ultimo.de_valor}{' SECO' if ultimo.seco else ' no seco'}"
               if ultimo else "sin bloques cerrados")
            + " · vias sin agotar: "
            + ("; ".join(f"{m}->{len(f)}" for m, f in vias.items()) or "ninguna"))
        return {
            "tramo_actual": self.presupuesto.tramo,
            "tope_actual": self.presupuesto.tope_por_cuenta,
            "tope_siguiente": self.presupuesto.tope_siguiente,
            "incremento": TRAMO_INCREMENTO,
            "condiciones": cond, "faltan": faltan,
            "puede": not faltan,
            "necesita_humano": self.presupuesto.renovacion_necesita_humano,
            "razon": razon,
            "evidencia": {
                "chao1": {"observados": est.observados, "f1": est.f1,
                          "f2": est.f2, "estimado": round(est.estimado, 1),
                          "cobertura": round(est.cobertura, 3),
                          "veredicto": est.veredicto,
                          "confiable": est.confiable},
                "ultimo_bloque": ({"n": ultimo.numero,
                                   "consultas": ultimo.consultas,
                                   "entradas": ultimo.nuevas,
                                   "de_valor": ultimo.de_valor,
                                   "seco": ultimo.seco} if ultimo else None),
                "vias_sin_agotar": vias,
            },
        }

    def renovar_tramo(self, autorizado_por_humano: bool = False) -> dict:
        """Sube el tope un tramo, si la evidencia lo justifica."""
        ev = self.evaluar_tramo()
        if not ev["puede"]:
            explica = {
                "chao1_dice_que_falta": (
                    "Chao1 no dice que falte gente CON DATOS. Un `prematuro` no "
                    "manda nada: no es razon para gastar mas."),
                "ultimo_bloque_no_seco": (
                    "el ultimo bloque cerrado salio SECO. Si el tramo termino en "
                    "seco, el problema no es el presupuesto."),
                "queda_via_sin_agotar": (
                    "no queda una sola fuente del catalogo sin preguntar en un "
                    "modulo abierto. Renovar el tope para volver a preguntar lo "
                    "mismo es gastar por gastar."),
            }
            raise CompuertaCerrada(
                f"El tope NO se renueva de {ev['tope_actual']} a "
                f"{ev['tope_siguiente']}. Falta:\n"
                + "\n".join(f"  · {explica[k]}" for k in ev["faltan"])
                + f"\n\n  Evidencia leida: {ev['razon']}")
        return self.presupuesto.renovar(ev["razon"], ev["evidencia"],
                                        autorizado_por_humano=autorizado_por_humano)

    # ----------------------------------------------------------------- el loop
    def que_detiene_el_loop(self) -> str:
        """La razon por la que el lazo YA no puede seguir, o '' si puede."""
        if self.presupuesto.saturado:
            # El DESEMPATE decide, no la primera compuerta que cerro. Cuando
            # Chao1 opina y dice que falta gente Y quedan vias sin preguntar, los
            # tres bloques secos NO detienen el lazo: mandan cambiar de via.
            d = self.desempate()
            if not d["para"]:
                return ""
            return (f"presupuesto: {self.presupuesto.secos_al_final} bloques "
                    f"secos seguidos — {d['razon']}")
        if self.presupuesto.agotado_por_tope:
            return (f"presupuesto: tope de {self.presupuesto.tope_por_cuenta} "
                    "consultas alcanzado")
        est = self.completitud()
        if est.detiene_el_loop:
            return f"Chao1: {est.por_que} (cobertura {est.cobertura:.0%})"
        return ""

    def puede_seguir_el_loop(self) -> bool:
        return not self.que_detiene_el_loop()

    def abrir_vuelta(self) -> dict:
        """Reabre los modulos del lazo para otra vuelta.

        Exige que se haya gastado al menos un bloque desde la vuelta anterior:
        dar vueltas sin gastar no encuentra a nadie nuevo, y un lazo que gira en
        seco es la version del contador vacio aplicada al flujo."""
        freno = self.que_detiene_el_loop()
        if freno:
            raise CompuertaCerrada(
                f"El lazo de refuerzo no puede dar otra vuelta. Lo detiene "
                f"{freno}. Cierra con challenge y ficha.")
        if self.vueltas_loop and len(self.presupuesto.bloques) <= self._bloques_al_abrir_vuelta:
            raise CompuertaCerrada(
                f"Vuelta {self.vueltas_loop} abierta y sin un bloque nuevo "
                f"registrado ({len(self.presupuesto.bloques)} bloques, los "
                f"mismos que al abrirla). Una vuelta que no gasta no encuentra "
                "a nadie: registra el bloque o cierra la cascada.")
        self.vueltas_loop += 1
        self._bloques_al_abrir_vuelta = len(self.presupuesto.bloques)
        for m in MODULOS_DEL_LOOP:
            self.mod(m).cerrado = False
            self.cobertura.pop(m, None)
        return {"vuelta": self.vueltas_loop, "reabiertos": list(MODULOS_DEL_LOOP)}

    # ------------------------------------------------------------ paso a paso
    def siguiente_paso(self) -> dict:
        for clave, titulo, modulos in OLAS:
            faltan = [m for m in modulos if not self.mod(m).cerrado]
            if faltan:
                m = faltan[0]
                req = AGOTADO.get(m)
                return {
                    "ola": clave, "titulo": titulo, "modulo": m,
                    "que_hace": DESCRIPCION.get(m, ""),
                    "agotado_cuando": req[3] if req else "cerrado a mano",
                    "se_cuenta_como": req[2] if req else "",
                    "lleva": self.mod(m).contadores,
                    "presupuesto_restante": self.presupuesto.restantes,
                    "pendientes_en_esta_ola": faltan,
                }
        # olas cerradas -> medir completitud
        est = self.completitud()
        # El lazo lo detiene UNA sola cosa de parte de Chao1: que haya opinado y
        # dicho que ya esta barrido. "Todavia no puedo opinar" manda SEGUIR.
        # Lo que lo detiene cuando Chao1 no opina es el PRESUPUESTO.
        if self.puede_seguir_el_loop():
            return {
                "ola": "loop",
                "titulo": f"LOOP · vuelta {self.vueltas_loop + 1} — {est.por_que}",
                "modulo": "M5",
                "reabrir": list(MODULOS_DEL_LOOP),
                "que_hace": ("Volver al motor -> individuales -> PDFs. "
                             f"Cobertura estimada {est.cobertura:.0%}. "
                             f"Lo detiene: {self.que_detiene_el_loop() or 'nada todavia'}."),
                "presupuesto_restante": self.presupuesto.restantes,
                "chao1": est.a_dict(),
            }
        if not self.challenge_corrido:
            return {"ola": "challenge", "titulo": "CHALLENGE · matriz C1-C9",
                    "modulo": "M10",
                    "que_hace": "Cruzar cada dato. Nada CONFIRMADO con <2 raices.",
                    "chao1": est.a_dict()}
        return {"ola": "ficha", "titulo": "FICHA · limpio + procedencia",
                "modulo": "M11", "que_hace": "Emitir. Ya paso el challenge.",
                "chao1": est.a_dict()}

    # ---------------------------------------------------------------- persist
    # ------------------------------------------------- firma contra edicion a mano
    #
    # En Pesqueria un agente EDITO EL JSON DE ESTADO A MANO para que la ficha
    # saliera -- convirtio las senales de objeto a texto--. Lo declaro en el
    # issue, y se pudo verificar contra un respaldo, pero la herramienta no lo
    # detecto: un estado editado a mano se veia idéntico a uno legitimo.
    #
    # Esto NO es seguridad: cualquiera que edite el JSON puede recalcular la
    # firma. Es DETECCION DE DESCUIDO, que es el caso real -- un agente con prisa
    # arreglando un bug--. Y su unico efecto es DECLARARLO en la ficha, nunca
    # bloquear: un estado editado a mano sigue teniendo trabajo real dentro, y
    # negarse a emitir la ficha perderia ese trabajo. Lo que no puede pasar es
    # que salga sin decirlo.
    CAMPO_FIRMA = "_firma"

    def firma(self) -> str:
        d = self.a_dict()
        d.pop(self.CAMPO_FIRMA, None)
        crudo = json.dumps(d, ensure_ascii=False, sort_keys=True,
                           separators=(",", ":"))
        return hashlib.sha256(crudo.encode("utf-8")).hexdigest()[:32]

    @property
    def editada_a_mano(self) -> bool:
        return bool(self.firma_al_abrir) and self.firma_al_abrir != self._firma_leida

    def guardar(self, ruta: str) -> str:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        d = self.a_dict()
        d[self.CAMPO_FIRMA] = self.firma()
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        return ruta

    def a_dict(self) -> dict:
        return {
            "empresa": self.empresa, "ciudad": self.ciudad, "giro": self.giro,
            "creada": self.creada,
            "modulos": {k: v.a_dict() for k, v in self.modulos.items()},
            "busquedas": len(self.busquedas()),
            "cobertura": self.cobertura,
            "presupuesto": {"tope": self.presupuesto.tope_por_cuenta,
                            "gastadas": self.presupuesto.gastadas,
                            "restantes": self.presupuesto.restantes,
                            "saturado": self.presupuesto.saturado,
                            "bloques": [asdict(b) | {"seco": b.seco} for b in self.presupuesto.bloques],
                            "tramo": self.presupuesto.tramo,
                            "tramos": self.presupuesto.tramos},
            "chao1": self.completitud().a_dict(),
            "desempate": self.desempate(),
            "tramo": self.evaluar_tramo(),
            "vocabulario": self.vocabulario,
            "senal": self.senal,
            "challenge_corrido": self.challenge_corrido,
            "nivel": self.nivel,
            "sembrado": self.sembrado,
            "angulo": self.angulo,
            "origen": self.origen,
            "angulo_resuelto": self.angulo_resuelto,
            "fuera_de_la_poblacion": len(self.fuera_de_la_poblacion()),
            "vueltas_loop": self.vueltas_loop,
            "bloques_al_abrir_vuelta": self._bloques_al_abrir_vuelta,
            "loop_puede_seguir": self.puede_seguir_el_loop(),
            "loop_lo_detiene": self.que_detiene_el_loop(),
            "avisos": self.avisos,
            "entrega": self.entrega,
            "fichas_emitidas": self.fichas_emitidas,
            "gancho": self.gancho,
            "por_que_ahora": self.por_que_ahora,
            "como_hablarles": self.como_hablarles,
            "rendimiento_por_modulo": self.rendimiento(),
            "rendimiento_por_origen": self.rendimiento_por_origen(),
            "contactos": [c.a_dict() for c in self.contactos],
        }
