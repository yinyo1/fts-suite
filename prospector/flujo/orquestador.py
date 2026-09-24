"""El runner. Dice cual es el paso siguiente y se niega a saltarse uno.

    python3 -m flujo.orquestador iniciar --empresa "Ragasa" --ciudad "Guadalupe, NL"
    python3 -m flujo.orquestador siguiente --empresa "Ragasa"
    python3 -m flujo.orquestador buscar --empresa "Ragasa" --modulo M1 \
        --clave directorios --fuente leadiq --consulta "site:leadiq.com ragasa" \
        --resultados 4 --datos '<json con los contactos que trajo>'
    python3 -m flujo.orquestador registrar --empresa "Ragasa" --modulo M1 --datos '<json>'
    python3 -m flujo.orquestador bloque --empresa "Ragasa" --consultas 10 --nuevas 7
    python3 -m flujo.orquestador vuelta --empresa "Ragasa"
    python3 -m flujo.orquestador cerrar --empresa "Ragasa" --modulo M1
    python3 -m flujo.orquestador challenge --empresa "Ragasa"
    python3 -m flujo.orquestador ficha --empresa "Ragasa" --modo limpio
"""
from __future__ import annotations
import argparse, json, os, re, sys

from .compuertas import (CompuertaCerrada, exigir_confianza, techo_por_agotado,
                         Busqueda)
from .salida import carpeta_de_corridas, exigir_fuera_del_repo, SalidaEnElRepo
from .catalogo import exigir_permitida, FuenteProhibida
from .confianza import Contacto, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO
from .estado import Corrida, RESPONDIO
from .ficha import modo_limpio, modo_procedencia

# Las corridas llevan nombres, puestos y correos de PERSONAS. No se escriben en
# el repo: `fts-suite` es publico. Ver flujo/salida.py -- ahi vive la regla, y
# se hace cumplir con un raise, no con un .gitignore.
def CORRIDAS() -> str:
    return str(carpeta_de_corridas())


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _ruta(empresa: str) -> str:
    return os.path.join(CORRIDAS(), f"{_slug(empresa)}.json")


def _cargar(empresa: str) -> Corrida:
    ruta = _ruta(empresa)
    if not os.path.exists(ruta):
        raise SystemExit(f"No hay corrida para '{empresa}'. Corre primero: iniciar")
    d = json.load(open(ruta, encoding="utf-8"))
    c = Corrida(empresa=d["empresa"], ciudad=d["ciudad"], giro=d.get("giro", ""))
    c.creada = d["creada"]
    c.cobertura = d.get("cobertura", {})
    c.vocabulario = d.get("vocabulario", [])
    c.senal = d.get("senal", [])
    c.challenge_corrido = d.get("challenge_corrido", False)
    c.avisos = d.get("avisos", [])
    pres = d.get("presupuesto", {})
    c.presupuesto.tope_por_cuenta = pres.get("tope", 60)
    for b in pres.get("bloques", []):
        c.presupuesto.registrar(b["consultas"], b["nuevas"])
    c.vueltas_loop = d.get("vueltas_loop", 0)
    # Sin esto la compuerta de la vuelta en seco se olvidaba al releer del
    # disco: la corrida volvia con vueltas_loop=1 y el marcador de bloques en
    # cero, asi que cualquier bloque viejo la dejaba pasar. Lo encontro la
    # corrida real de Cuprum del 24-sep.
    c._bloques_al_abrir_vuelta = d.get("bloques_al_abrir_vuelta", 0)
    for nombre, m in d.get("modulos", {}).items():
        em = c.mod(nombre)
        em.cerrado = m["cerrado"]
        # Los contadores NO se restauran: son derivados. Se restaura la
        # EVIDENCIA, y los contadores salen de ella. Una corrida guardada no
        # puede reaparecer con contadores que su registro no sostiene.
        for r in m.get("registros", []):
            em.registros.append(Busqueda(**r))
    for cd in d.get("contactos", []):
        x = Contacto(nombre=cd["nombre"], puesto=cd["puesto"], empresa=cd["empresa"],
                     nivel_ficha=cd["nivel_ficha"], cercania_decision=cd["cercania_decision"],
                     revision_humana=cd["revision_humana"],
                     motivo_revision=cd.get("motivo_revision", ""))
        x.hits = cd.get("hits", 1)
        for campo, dd in cd.get("datos", {}).items():
            dato = x.dato(campo)
            dato.derivado_de_patron = any(o["fuente"] == "patron_derivado" for o in dd["observaciones"])
            for o in dd["observaciones"]:
                dato.observar(o["fuente"], o["valor"], fecha_dato=o.get("fecha_dato"),
                              nota=o.get("nota", ""), forma=o.get("forma"))
        c.contactos.append(x)
    c._recalcular_hits()
    return c


def _contacto(c: Corrida, cd: dict) -> Contacto:
    """Arma un Contacto desde el JSON, con la compuerta de catalogo en cada
    observacion. Compartido por `registrar` y por `buscar`."""
    x = Contacto(nombre=cd.get("nombre"), puesto=cd.get("puesto"),
                 empresa=c.empresa,
                 nivel_ficha=cd.get("nivel_ficha", N2_PARCIAL),
                 cercania_decision=cd.get("cercania_decision", 50),
                 revision_humana=cd.get("revision_humana", False),
                 motivo_revision=cd.get("motivo_revision", ""))
    for campo, obs in cd.get("datos", {}).items():
        dato = x.dato(campo)
        for o in obs:
            exigir_permitida(o["fuente"])
            dato.observar(o["fuente"], o["valor"],
                          fecha_dato=o.get("fecha_dato"), nota=o.get("nota", ""),
                          forma=o.get("forma"))
            if o["fuente"] == "patron_derivado":
                dato.derivado_de_patron = True
    return x


def _imprimir_paso(c: Corrida) -> None:
    p = c.siguiente_paso()
    print(f"\n  {p['titulo']}")
    print(f"  PASO SIGUIENTE: {p['modulo']} — {p['que_hace']}")
    if "agotado_cuando" in p:
        print(f"  Agotado cuando: {p['agotado_cuando']}")
        print(f"  Se cuenta como: {p.get('se_cuenta_como','')}")
        print(f"  Lleva: {p['lleva'] or '(nada aun)'}")
    if "presupuesto_restante" in p:
        print(f"  Presupuesto restante: {p['presupuesto_restante']} consultas")
    if "reabrir" in p:
        print(f"  Reabre: {', '.join(p['reabrir'])} — corre: vuelta")
    if "chao1" in p:
        e = p["chao1"]
        print(f"  Chao1: {e['observados']} observados · estimado {e['estimado']} · "
              f"cobertura {e['cobertura_pct']}% · veredicto {e['veredicto'].upper()}")
        print(f"         {e['por_que']}")
    print()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="orquestador", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nombre in ("iniciar", "siguiente", "buscar", "registrar", "bloque",
                   "cerrar", "vuelta", "challenge", "ficha", "estado"):
        s = sub.add_parser(nombre)
        s.add_argument("--empresa", required=True)
        if nombre == "iniciar":
            s.add_argument("--ciudad", required=True)
            s.add_argument("--giro", default="")
            s.add_argument("--tope", type=int, default=60)
        if nombre in ("registrar", "cerrar", "buscar"):
            s.add_argument("--modulo", required=True)
        if nombre == "registrar":
            s.add_argument("--datos", required=True, help="JSON con contactos/vocabulario/senal")
        if nombre == "buscar":
            s.add_argument("--clave", required=True, help="el contador de agotado que alimenta")
            s.add_argument("--consulta", required=True, help="la consulta TEXTUAL que se corrio")
            s.add_argument("--fuente", required=True)
            s.add_argument("--resultados", type=int, required=True,
                           help="cuantos trajo. CERO es valido y cuenta.")
            s.add_argument("--nota", default="")
            s.add_argument("--etiqueta", default=None,
                           help="cuando lo distinto no es la fuente sino la forma "
                                "de preguntar (M7: forma_empresa / forma_nombre)")
            s.add_argument("--datos", default=None,
                           help="JSON con los contactos que trajo, si trajo")
        if nombre == "cerrar":
            s.add_argument("--estado", default=RESPONDIO)
            s.add_argument("--razon", default="")
        if nombre == "bloque":
            s.add_argument("--consultas", type=int, required=True)
            s.add_argument("--nuevas", type=int, required=True)
        if nombre == "ficha":
            s.add_argument("--modo", choices=["limpio", "procedencia"], default="limpio")
            s.add_argument("--salida", default=None)
    a = ap.parse_args(argv)

    try:
        if a.cmd == "iniciar":
            c = Corrida(empresa=a.empresa, ciudad=a.ciudad, giro=a.giro)
            c.presupuesto.tope_por_cuenta = a.tope
            c.guardar(_ruta(a.empresa))
            print(f"Corrida iniciada: {a.empresa} · tope {a.tope} consultas")
            print(f"  Los resultados viven en la sesion, NO en el repo:\n"
                  f"  {CORRIDAS()}")
            _imprimir_paso(c)
            return 0

        c = _cargar(a.empresa)

        if a.cmd in ("siguiente", "estado"):
            _imprimir_paso(c)
            if a.cmd == "estado":
                print(json.dumps(c.a_dict()["presupuesto"], indent=2, ensure_ascii=False))
            return 0

        if a.cmd == "registrar":
            d = json.loads(a.datos)
            for f in d.get("fuentes", []):
                exigir_permitida(f)                       # <- compuerta catalogo
            for cd in d.get("contactos", []):
                c.agregar(_contacto(c, cd))
            c.vocabulario.extend(d.get("vocabulario", []))
            c.senal.extend(d.get("senal", []))
            c.guardar(_ruta(a.empresa))
            print(f"[{a.modulo}] registrado. Contadores (derivados del "
                  f"registro): {c.mod(a.modulo).contadores}")
            print("  Nota: `registrar` NO mueve el agotado. Para eso va `buscar`, "
                  "que exige la consulta que se corrio.")
            _imprimir_paso(c)
            return 0

        if a.cmd == "buscar":
            contactos = []
            if a.datos:
                d = json.loads(a.datos)
                for cd in d.get("contactos", []):
                    contactos.append(_contacto(c, cd))
            b = c.registrar_busqueda(
                a.modulo, a.clave, a.consulta, a.fuente, a.resultados,
                nota=a.nota, contactos=contactos, etiqueta=a.etiqueta)
            c.guardar(_ruta(a.empresa))
            m = c.mod(a.modulo)
            print(f"[{a.modulo}] busqueda registrada: {a.fuente} · "
                  f"{a.resultados} resultado(s)"
                  f"{' (CERO, y cuenta)' if a.resultados == 0 else ''}")
            print(f"  Consulta: {b.consulta}")
            print(f"  Contadores DERIVADOS del registro: {m.contadores}")
            _imprimir_paso(c)
            return 0

        if a.cmd == "vuelta":
            r = c.abrir_vuelta()
            c.guardar(_ruta(a.empresa))
            print(f"Vuelta {r['vuelta']} abierta. Reabiertos: "
                  f"{', '.join(r['reabiertos'])}")
            _imprimir_paso(c)
            return 0

        if a.cmd == "bloque":
            c.presupuesto.exigir_puede_seguir()
            b = c.presupuesto.registrar(a.consultas, a.nuevas)
            c.guardar(_ruta(a.empresa))
            print(f"Bloque {b.numero}: {b.consultas} consultas, {b.nuevas} nuevas "
                  f"({b.rendimiento:.2f}/consulta){' SECO' if b.seco else ''}")
            print(f"Secos seguidos: {c.presupuesto.secos_al_final}/3 · "
                  f"restantes: {c.presupuesto.restantes}")
            return 0

        if a.cmd == "cerrar":
            c.cerrar_modulo(a.modulo, a.estado, a.razon)   # <- compuerta agotado
            c.guardar(_ruta(a.empresa))
            print(f"[{a.modulo}] cerrado como '{a.estado}'.")
            _imprimir_paso(c)
            return 0

        if a.cmd == "challenge":
            abiertos = [m for _k, _t, mods in __import__(
                "flujo.estado", fromlist=["OLAS"]).OLAS for m in mods
                if not c.mod(m).cerrado]
            if abiertos:
                raise CompuertaCerrada(
                    f"No se cruza con modulos abiertos: {', '.join(abiertos)}. "
                    "Cruzar a medias produce el falso consenso que el Caso F "
                    "existe para impedir.")
            avisos = exigir_confianza(c.contactos)          # <- compuerta confianza
            c.avisos = avisos
            c.challenge_corrido = True
            c.guardar(_ruta(a.empresa))
            print(f"Challenge corrido. {len(avisos)} conflicto(s) a revision humana:")
            for w in avisos:
                print("  -", w)
            _imprimir_paso(c)
            return 0

        if a.cmd == "ficha":
            if not c.challenge_corrido:
                raise CompuertaCerrada(
                    "No se emite ficha sin challenge. Corre: challenge")
            salida = str(exigir_fuera_del_repo(a.salida)) if a.salida else os.path.join(
                CORRIDAS(), f"{_slug(a.empresa)}-{a.modo}." + ("html" if a.modo == "limpio" else "json"))
            contenido = modo_limpio(c) if a.modo == "limpio" else json.dumps(
                modo_procedencia(c), ensure_ascii=False, indent=2)
            os.makedirs(os.path.dirname(salida), exist_ok=True)
            open(salida, "w", encoding="utf-8").write(contenido)
            print(f"Ficha ({a.modo}) escrita: {salida}")
            return 0

    except (CompuertaCerrada, FuenteProhibida, SalidaEnElRepo) as e:
        print(f"\n  ⛔ COMPUERTA: {e}\n", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
