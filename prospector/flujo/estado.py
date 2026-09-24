"""El estado de la corrida. Python lo posee; Claude propone, Python registra.

Si Claude intenta avanzar sin cerrar el paso anterior, `siguiente_paso` no
devuelve el paso que quiere: devuelve el que falta.
"""
from __future__ import annotations
import json, os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

from .compuertas import (EstadoModulo, Presupuesto, CompuertaCerrada, AGOTADO,
                         TAMANO_BLOQUE,
                         Busqueda)
from .confianza import Contacto, Dato, Observacion, _normaliza
from .chao1 import estimar

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
    gancho: str = ""
    por_que_ahora: str = ""
    como_hablarles: list = field(default_factory=list)
    vueltas_loop: int = 0
    _bloques_al_abrir_vuelta: int = 0

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
        return estimar([c.hits for c in self.contactos])

    # ----------------------------------------------------------------- el loop
    def que_detiene_el_loop(self) -> str:
        """La razon por la que el lazo YA no puede seguir, o '' si puede."""
        if self.presupuesto.saturado:
            return (f"presupuesto: {self.presupuesto.secos_al_final} bloques "
                    "secos seguidos")
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
    def guardar(self, ruta: str) -> str:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(self.a_dict(), f, ensure_ascii=False, indent=2)
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
                            "bloques": [asdict(b) | {"seco": b.seco} for b in self.presupuesto.bloques]},
            "chao1": self.completitud().a_dict(),
            "vocabulario": self.vocabulario,
            "senal": self.senal,
            "challenge_corrido": self.challenge_corrido,
            "vueltas_loop": self.vueltas_loop,
            "bloques_al_abrir_vuelta": self._bloques_al_abrir_vuelta,
            "loop_puede_seguir": self.puede_seguir_el_loop(),
            "loop_lo_detiene": self.que_detiene_el_loop(),
            "avisos": self.avisos,
            "gancho": self.gancho,
            "por_que_ahora": self.por_que_ahora,
            "como_hablarles": self.como_hablarles,
            "rendimiento_por_modulo": self.rendimiento(),
            "rendimiento_por_origen": self.rendimiento_por_origen(),
            "contactos": [c.a_dict() for c in self.contactos],
        }
