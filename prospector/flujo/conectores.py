"""Las tres sondas de conector, y la compuerta que las exige antes de arrancar.

POR QUE ESTO EXISTE
-------------------
Los tres conectores -- Odoo, Outlook y WebSearch-- viven detras de MCP. **Python
no los ve.** Por eso `chequeo()` los marca `[ ? ]`: decir que estan bien sin
haberlos llamado seria exactamente el pecado que la compuerta de agotado
persigue, aplicado al arranque.

Hasta la v0.9.1 eso dejaba el hueco del lado del operador: tenia que pedir
aparte, en lenguaje natural, que se corriera `listo` y que se probaran los
conectores antes de escribir la frase de arranque. Un prompt extra cada vez, y
si se le olvidaba, la corrida arrancaba a ciegas.

La verificacion NO se puede mover a Python -- los conectores no se ven desde
aqui--. Lo que si se puede mover es la EXIGENCIA: Claude llama a los tres, y
`prospecta` **se niega a abrir la corrida** si no hay constancia fresca de esas
tres llamadas. Es el mismo mecanismo que `buscar`, que exige la consulta textual
porque no puede comprobar que se corrio.

    Claude llama                ->   registra lo que contesto   ->  prospecta abre
    (MCP, fuera de Python)           `conectores`                   la corrida

Un conector caido NO se rodea en silencio: o el operador autoriza seguir sin el
-- y entonces el modulo queda `sin_acceso` con razon escrita, visible en la
ficha--, o la corrida no arranca.
"""
from __future__ import annotations
import json
import os
import pathlib
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone

from .compuertas import CompuertaCerrada

# conector -> (modulos que dependen de el, como se comprueba, por que importa)
CONECTORES: dict[str, tuple[str, str, str]] = {
    "odoo": ("M0", "una lectura minima a res.partner",
             "es la que dice si la cuenta YA tiene relacion, y una cuenta con "
             "historia se trabaja al reves que una fria"),
    "outlook": ("M0b", "una busqueda minima en el buzon",
                "es la fuente mas rentable cuando hay historia: los correos "
                "literales de un hilo son ANCLAS, y ninguna otra fuente las da"),
    "websearch": ("M1-M12", "una consulta cualquiera",
                  "sin ella no hay OLA 1 ni motor: en una cuenta sin historia "
                  "pone el 100% del valor, medido en #295"),
}

# Cuanto vale una sonda. Una hora, y no es un numero redondo por gusto: una
# sonda de hace seis horas no prueba que el conector este vivo AHORA, y arrancar
# con esa constancia seria dar por bueno algo que no se llamo. Menos de una hora
# obligaria a re-sondear a media corrida sin motivo.
VENTANA_MINUTOS = 60

ARCHIVO = "conectores.json"


@dataclass
class Sonda:
    """Lo que UNA llamada real contesto. `evidencia` es obligatoria.

    Un booleano suelto no sirve: 'vivo=True' sin decir que contesto es una
    declaracion, y este archivo existe para guardar evidencia.
    """
    conector: str
    vivo: bool
    evidencia: str
    ts: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    autorizado_sin: bool = False
    razon_autorizacion: str = ""

    def __post_init__(self) -> None:
        if self.conector not in CONECTORES:
            raise CompuertaCerrada(
                f"Conector desconocido '{self.conector}'. Los tres que la "
                f"corrida necesita: {', '.join(CONECTORES)}.")
        if not (self.evidencia or "").strip():
            raise CompuertaCerrada(
                f"Sonda de '{self.conector}' sin evidencia. Un 'vivo' sin decir "
                "QUE contesto es una declaracion, y las declaraciones son lo "
                "que esta herramienta no acepta. Escribe lo que devolvio: "
                "'1 fila de res.partner', '12 hilos', '10 resultados'.")
        if self.autorizado_sin and not (self.razon_autorizacion or "").strip():
            raise CompuertaCerrada(
                f"Autorizar seguir sin '{self.conector}' EXIGE razon escrita: "
                "es un hueco de la corrida y va a salir en la ficha.")

    @property
    def edad_minutos(self) -> float:
        try:
            t = datetime.fromisoformat(self.ts)
        except ValueError:
            return float("inf")
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - t).total_seconds() / 60

    @property
    def fresca(self) -> bool:
        return self.edad_minutos <= VENTANA_MINUTOS

    @property
    def sirve(self) -> bool:
        """Deja arrancar: o el conector contesto, o el operador autorizo el hueco."""
        return self.fresca and (self.vivo or self.autorizado_sin)


@dataclass
class Sondeo:
    """Las tres sondas juntas. Se guarda en la carpeta de la SESION."""
    sondas: dict = field(default_factory=dict)

    # ------------------------------------------------------------------ disco
    @staticmethod
    def ruta() -> pathlib.Path:
        from .salida import carpeta_de_corridas
        return carpeta_de_corridas() / ARCHIVO

    @classmethod
    def cargar(cls) -> "Sondeo":
        r = cls.ruta()
        if not r.exists():
            return cls()
        try:
            d = json.loads(r.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return cls()
        s = cls()
        for k, v in (d.get("sondas") or {}).items():
            if k in CONECTORES:
                try:
                    s.sondas[k] = Sonda(**v)
                except (CompuertaCerrada, TypeError):
                    continue          # una sonda corrupta vale lo mismo que ninguna
        return s

    def guardar(self) -> pathlib.Path:
        from .salida import exigir_fuera_del_repo
        r = exigir_fuera_del_repo(self.ruta())
        r.parent.mkdir(parents=True, exist_ok=True)
        r.write_text(json.dumps(
            {"sondas": {k: asdict(v) for k, v in self.sondas.items()}},
            ensure_ascii=False, indent=2), encoding="utf-8")
        return r

    # ------------------------------------------------------------- escribir
    def registrar(self, conector: str, vivo: bool, evidencia: str,
                  autorizado_sin: bool = False,
                  razon_autorizacion: str = "") -> Sonda:
        s = Sonda(conector=conector, vivo=vivo, evidencia=evidencia,
                  autorizado_sin=autorizado_sin,
                  razon_autorizacion=razon_autorizacion)
        self.sondas[conector] = s
        return s

    def autorizar_sin(self, conector: str, razon: str) -> Sonda:
        """El operador decidio seguir sin ese conector. Queda escrito."""
        previa = self.sondas.get(conector)
        if previa is None or previa.vivo:
            raise CompuertaCerrada(
                f"No hay una sonda de '{conector}' que diga que esta caido. "
                "Autorizar seguir sin un conector que nadie probo -- o que "
                "contesto bien-- no autoriza nada: sondea primero.")
        return self.registrar(conector, vivo=False, evidencia=previa.evidencia,
                              autorizado_sin=True, razon_autorizacion=razon)

    # ---------------------------------------------------------------- estado
    @property
    def faltan(self) -> list[str]:
        return [k for k in CONECTORES if k not in self.sondas]

    @property
    def vencidas(self) -> list[str]:
        return [k for k, s in self.sondas.items() if not s.fresca]

    @property
    def caidos_sin_autorizar(self) -> list[str]:
        return [k for k, s in self.sondas.items()
                if s.fresca and not s.vivo and not s.autorizado_sin]

    @property
    def huecos_autorizados(self) -> list[Sonda]:
        return [s for s in self.sondas.values()
                if s.fresca and not s.vivo and s.autorizado_sin]

    @property
    def listo(self) -> bool:
        return not (self.faltan or self.vencidas or self.caidos_sin_autorizar)

    # -------------------------------------------------------------- compuerta
    def exigir_listo(self) -> None:
        """La compuerta del arranque. Lanza con el comando exacto que falta."""
        if self.faltan or self.vencidas:
            pendientes = self.faltan + self.vencidas
            porque = []
            if self.faltan:
                porque.append(f"sin sondear: {', '.join(self.faltan)}")
            if self.vencidas:
                porque.append(
                    f"sonda vencida (mas de {VENTANA_MINUTOS} min): "
                    f"{', '.join(self.vencidas)} -- una sonda vieja no prueba "
                    "que el conector este vivo AHORA")
            raise CompuertaCerrada(
                "No se abre la corrida sin haber LLAMADO a los conectores. "
                + "; ".join(porque) + ".\n\n"
                + "\n".join(
                    f"    {k}: {CONECTORES[k][1]} — {CONECTORES[k][2]}"
                    for k in pendientes)
                + "\n\n  Llamalos de verdad y registra lo que contestaron:\n"
                  "    ./prospector conectores --odoo '<lo que devolvio>' "
                  "--outlook '<lo que devolvio>' --websearch '<lo que devolvio>'\n\n"
                  "  Python no puede verlos: viven detras de MCP. Por eso los "
                  "llama Claude y los registra aqui, y por eso darlos por buenos "
                  "sin llamarlos es el mismo pecado que la compuerta de agotado "
                  "persigue.")
        if self.caidos_sin_autorizar:
            partes = []
            for k in self.caidos_sin_autorizar:
                mod, _como, porque = CONECTORES[k]
                s = self.sondas[k]
                partes.append(
                    f"  {k.upper()} NO RESPONDE ({mod}): {s.evidencia}\n"
                    f"    {porque.capitalize()}.")
            raise CompuertaCerrada(
                "\n" + "\n".join(partes) + "\n\n"
                "  PREGUNTA AL OPERADOR, en una linea: seguir sin ese conector, "
                "o esperar a que se reconecte.\n"
                "  Si decide seguir, queda escrito y el modulo sale sin_acceso "
                "en la ficha:\n"
                "    ./prospector conectores --continuar-sin "
                f"{self.caidos_sin_autorizar[0]} --razon '<lo que dijo>'\n\n"
                "  No se arranca a ciegas y no se simula la fuente.")

    def resumen(self) -> list[str]:
        """Una linea por conector, para imprimir."""
        L = []
        for k in CONECTORES:
            s = self.sondas.get(k)
            if s is None:
                L.append(f"  [ ?  ] {k:<10} sin sondear")
            elif not s.fresca:
                L.append(f"  [VENC] {k:<10} sonda de hace "
                         f"{s.edad_minutos:.0f} min: {s.evidencia}")
            elif s.vivo:
                L.append(f"  [ OK ] {k:<10} {s.evidencia}")
            elif s.autorizado_sin:
                L.append(f"  [HUECO] {k:<9} CAIDO, autorizado: "
                         f"{s.razon_autorizacion}")
            else:
                L.append(f"  [FALLA] {k:<9} CAIDO: {s.evidencia}")
        return L
