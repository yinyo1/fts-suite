"""El estado de la corrida. Python lo posee; Claude propone, Python registra.

Si Claude intenta avanzar sin cerrar el paso anterior, `siguiente_paso` no
devuelve el paso que quiere: devuelve el que falta.
"""
from __future__ import annotations
import json, os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

from .compuertas import (EstadoModulo, Presupuesto, CompuertaCerrada, AGOTADO,
                         Busqueda)
from .confianza import Contacto, Dato, Observacion
from .chao1 import estimar

# El flujo, con las cinco correcciones validadas en el issue #22.
OLAS = [
    ("ola0_internas", "OLA 0 · INTERNAS — precedencia, no rendimiento",
     ["M0", "M0b"]),
    ("ola1_vocabulario", "OLA 1 · BARATAS — llenan el diccionario ANTES del motor",
     ["M13", "M1", "M2", "M3", "M12"]),
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
                           etiqueta: str | None = None) -> Busqueda:
        """Registra trabajo EJECUTADO. Es lo unico que mueve un contador."""
        contactos = contactos or []
        if resultados < len(contactos):
            raise CompuertaCerrada(
                f"[{modulo}] la busqueda declara resultados={resultados} pero "
                f"entrega {len(contactos)} contacto(s). Una busqueda no puede "
                "traer mas gente de la que dice haber encontrado.")
        m = self.mod(modulo)
        claves = [self.agregar(x, contar_hit=False).clave for x in contactos]
        b = m.registrar_busqueda(clave, consulta, fuente, resultados, nota,
                                 claves, etiqueta=etiqueta)
        self._recalcular_hits()
        return b

    def _recalcular_hits(self) -> None:
        """`hits` = en cuantas busquedas DISTINTAS aparecio el contacto.

        Derivado del registro, no un contador que alguien sube. Es lo mismo que
        `n_raices` hace con las observaciones, aplicado al progreso."""
        conteo: dict[str, int] = {}
        for b in self.busquedas():
            for k in set(b.hallazgos):
                conteo[k] = conteo.get(k, 0) + 1
        for x in self.contactos:
            if x.clave in conteo:
                x.hits = conteo[x.clave]

    def marcar_cobertura(self, modulo: str, estado: str, razon: str = "") -> None:
        if estado in (NO_APLICABA, OMITIDA_COSTO, SIN_ACCESO) and not razon:
            raise CompuertaCerrada(
                f"[{modulo}] estado '{estado}' EXIGE razon. "
                "Un hueco sin motivo escrito se confunde con 'no hay nada'.")
        self.cobertura[modulo] = {"estado": estado, "razon": razon}

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
                return ex
        c.hits = max(1, c.hits) if contar_hit else max(0, c.hits)
        self.contactos.append(c)
        return c

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
            "contactos": [c.a_dict() for c in self.contactos],
        }
