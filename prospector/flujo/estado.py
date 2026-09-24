"""El estado de la corrida. Python lo posee; Claude propone, Python registra.

Si Claude intenta avanzar sin cerrar el paso anterior, `siguiente_paso` no
devuelve el paso que quiere: devuelve el que falta.
"""
from __future__ import annotations
import json, os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

from .compuertas import EstadoModulo, Presupuesto, CompuertaCerrada, AGOTADO
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

    # ---------------------------------------------------------------- modulos
    def mod(self, nombre: str) -> EstadoModulo:
        if nombre not in self.modulos:
            self.modulos[nombre] = EstadoModulo(modulo=nombre)
        return self.modulos[nombre]

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
    def agregar(self, c: Contacto) -> Contacto:
        for ex in self.contactos:
            if ex.clave == c.clave:
                ex.hits += 1
                for campo, d in c.datos.items():
                    destino = ex.dato(campo)
                    destino.observaciones.extend(d.observaciones)
                return ex
        c.hits = max(1, c.hits)
        self.contactos.append(c)
        return c

    # ------------------------------------------------------------------ chao1
    def completitud(self):
        return estimar([c.hits for c in self.contactos])

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
                    "agotado_cuando": req[2] if req else "cerrado a mano",
                    "lleva": self.mod(m).contadores,
                    "presupuesto_restante": self.presupuesto.restantes,
                    "pendientes_en_esta_ola": faltan,
                }
        # olas cerradas -> medir completitud
        est = self.completitud()
        if not self.presupuesto.saturado and est.confiable and est.cobertura < 0.8 \
                and not self.presupuesto.agotado_por_tope:
            return {
                "ola": "loop", "titulo": "LOOP · falta gente y todavia rinde",
                "modulo": "M5",
                "que_hace": "Volver al motor -> individuales -> PDFs. "
                            f"Cobertura estimada {est.cobertura:.0%}.",
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
            "modulos": {k: {"contadores": v.contadores, "cerrado": v.cerrado,
                            "agotado": v.agotado} for k, v in self.modulos.items()},
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
            "avisos": self.avisos,
            "contactos": [c.a_dict() for c in self.contactos],
        }
