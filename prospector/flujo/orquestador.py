"""El runner. Dice cual es el paso siguiente y se niega a saltarse uno.

    USO NORMAL -- una sola instruccion:
        ./prospector prospecta --empresa "Hershey"
        ./prospector listo


    python3 -m flujo.orquestador iniciar --empresa "Ragasa" --ciudad "Guadalupe, NL"
    python3 -m flujo.orquestador siguiente --empresa "Ragasa"
    python3 -m flujo.orquestador padron --empresa "Ragasa" --ciudad "Guadalupe" \
        --entidad "Nuevo Leon" --dominio ragasa.com.mx --giro 311
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
from .padron import cargar as cargar_padron, vigilar_cobertura, PadronInvalido
from .arranque import resolver, texto_del_plan, chequeo, pregunta_de_una_linea
from .catalogo import exigir_permitida, FuenteProhibida
from .confianza import Contacto, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO
from .estado import Corrida, RESPONDIO
from .ficha import modo_limpio, modo_procedencia, tabla_de_rendimiento

# Las corridas llevan nombres, puestos y correos de PERSONAS. No se escriben en
# el repo: `fts-suite` es publico. Ver flujo/salida.py -- ahi vive la regla, y
# se hace cumplir con un raise, no con un .gitignore.
def CORRIDAS() -> str:
    return str(carpeta_de_corridas())


# Marca de los avisos que produce el challenge. Existe para poder re-correrlo
# sin duplicarlos Y sin borrar los avisos que NO son suyos.
MARCA_CHALLENGE = "[challenge] "


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
        c.presupuesto.registrar(b["consultas"], b["nuevas"],
                                busquedas_al_cerrar=b.get("busquedas_al_cerrar", 0),
                                contactos_al_cerrar=b.get("contactos_al_cerrar", 0))
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
        # Se restaura para los contactos que entraron por `registrar` (esos no
        # dejan hallazgo en ninguna busqueda, asi que `_recalcular_hits` no
        # puede derivarles el origen). Para los que entraron por `buscar`, el
        # registro manda y este valor se sobreescribe solo.
        x.modulo_origen = cd.get("modulo_origen", "")
        x.sigue_en_la_casa = cd.get("sigue_en_la_casa", True)
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
                 motivo_revision=cd.get("motivo_revision", ""),
                 sigue_en_la_casa=cd.get("sigue_en_la_casa", True))
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
    for nombre in ("prospecta", "listo", "iniciar", "siguiente", "padron",
                   "buscar", "registrar", "bloque", "cerrar", "vuelta",
                   "challenge", "ficha", "estado", "tope"):
        s = sub.add_parser(nombre)
        if nombre != "listo":
            s.add_argument("--empresa", required=True)
        if nombre == "listo":
            s.add_argument("--rapido", action="store_true",
                           help="salta la suite de pruebas")
        if nombre == "prospecta":
            s.add_argument("--ciudad", default="")
            s.add_argument("--giro", default="")
            s.add_argument("--dominio", default="")
            s.add_argument("--entidad", default="")
            s.add_argument("--tope", type=int, default=60)
        if nombre == "padron":
            s.add_argument("--ciudad", default="")
            s.add_argument("--entidad", default="")
            s.add_argument("--dominio", default="")
            s.add_argument("--giro", default="", help="SCIAN, aunque sean 3 digitos")
            s.add_argument("--cerrada", default="",
                           help="evidencia de que la planta ya no opera, si la corrida la encontro")
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
        if nombre == "tope":
            s.add_argument("--nuevo", type=int, required=True)
            s.add_argument("--razon", required=True,
                           help="POR QUE se sube. Sin razon no se sube: el "
                                "codigo ya decia que subir el tope es una "
                                "decision y no un descuido, y una decision que "
                                "no deja rastro es un descuido con otro nombre.")
        if nombre == "bloque":
            # YA NO son obligatorios: el bloque se cierra contra el registro.
            # Si se declaran, tienen que coincidir -- y si no coinciden, la
            # compuerta lanza en vez de creerle al que escribe.
            s.add_argument("--consultas", type=int, default=None)
            s.add_argument("--nuevas", type=int, default=None)
            s.add_argument("--parcial", action="store_true",
                           help="cierra un bloque incompleto. NO cuenta como "
                                "seco aunque no traiga nada.")
        if nombre == "ficha":
            s.add_argument("--modo", choices=["limpio", "procedencia"], default="limpio")
            s.add_argument("--salida", default=None)
    a = ap.parse_args(argv)

    try:
        if a.cmd == "listo":
            filas = chequeo(correr_pruebas=not a.rapido)
            print("\nLISTO PARA USAR DE TRABAJO\n" + "=" * 62)
            pend = 0
            for que, ok, detalle in filas:
                marca = {True: " OK ", False: "FALLA", None: " ?  "}[ok]
                if ok is False: pend += 1
                print(f"  [{marca}] {que:<26} {detalle}")
            print("=" * 62)
            print(f"  Lo que la maquina verifica: "
                  f"{sum(1 for _q,o,_d in filas if o is not None)} puntos, "
                  f"{pend} en falla.")
            print("  Los marcados [ ?  ] SOLO Claude los comprueba, llamando a la")
            print("  fuente. Darlos por buenos sin llamarla seria el mismo pecado")
            print("  que la compuerta de agotado persigue.\n")
            return 2 if pend else 0

        if a.cmd == "prospecta":
            ar = resolver(a.empresa, a.ciudad, a.giro, a.dominio, a.entidad)
            if ar.ambiguo and not os.path.exists(_ruta(a.empresa)):
                # NO se abre la corrida: elegir una planta en silencio es el caso
                # de los cinco DUNS de Ragasa, y hornear '(sin ciudad)' en una
                # corrida guardada es peor que preguntar.
                print("\n  " + pregunta_de_una_linea(ar).replace("\n", "\n  ") + "\n")
                return 3
            hay_corrida = os.path.exists(_ruta(a.empresa))
            if not hay_corrida:
                c = Corrida(empresa=a.empresa, ciudad=ar.ciudad or "(sin ciudad)",
                            giro=ar.giro)
                c.presupuesto.tope_por_cuenta = a.tope
                for b in ar.banderas:
                    c.avisos.append(str(b).replace("\n", " "))
                # M13 queda registrado con lo que el padron contesto DE VERDAD.
                # Cero filas cuenta: significa que se busco bien y no esta.
                consulta = (f"padron corte {ar.padron.corte}: empresa="
                            f"{a.empresa!r} dominio={ar.dominio or '-'!r} "
                            f"ciudad={ar.ciudad or '-'!r}")
                c.registrar_busqueda(
                    "M13", "cortes", consulta, "denue", len(ar.filas_padron),
                    nota=f"{len(ar.filas_padron)} fila(s); banderas: "
                         f"{', '.join(b.clave for b in ar.banderas) or 'ninguna'}")
                if ar.filas_padron and not ar.falta:
                    c.cerrar_modulo("M13")
                elif not ar.filas_padron:
                    c.cerrar_modulo("M13", "no_aplicaba",
                                    ar.banderas[-1].mensaje if ar.banderas
                                    else "no aparece en el padron")
                c.guardar(_ruta(a.empresa))
                print(f"Corrida abierta: {a.empresa} · tope {a.tope} consultas")
                print(f"  Resultados en la SESION, nunca en el repo:\n  {CORRIDAS()}")
            else:
                c = _cargar(a.empresa)
                print(f"Corrida YA existe para {a.empresa}: se retoma donde quedo.")
            print()
            print(texto_del_plan(ar, a.tope))
            print()
            _imprimir_paso(c)
            return 0

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

        if a.cmd == "tope":
            antes = c.presupuesto.tope_por_cuenta
            if a.nuevo <= antes:
                raise SystemExit(
                    f"El tope ya es {antes}. Este comando SUBE el tope; bajarlo "
                    "a media corrida borraria evidencia ya gastada.")
            if not a.razon.strip():
                raise SystemExit("Falta --razon.")
            c.presupuesto.tope_por_cuenta = a.nuevo
            c.avisos.append(f"TOPE SUBIDO de {antes} a {a.nuevo} consultas. "
                            f"Razon: {a.razon.strip()}")
            c.guardar(_ruta(a.empresa))
            print(f"Tope: {antes} -> {a.nuevo}. Restantes: "
                  f"{c.presupuesto.restantes}")
            print(f"  Queda en los avisos de la ficha, no solo en la consola.")
            _imprimir_paso(c)
            return 0

        if a.cmd == "registrar":
            d = json.loads(a.datos)
            for f in d.get("fuentes", []):
                exigir_permitida(f)                       # <- compuerta catalogo
            for cd in d.get("contactos", []):
                x = _contacto(c, cd)
                # Mismo credito que en `buscar`: el modulo que lo trajo se
                # queda con la entrada. Sin esto, un contacto entrado por
                # `registrar` no aparecia en NINGUNA fila de la tabla de
                # rendimiento -- la tabla sumaba menos entradas de las que la
                # corrida tenia, y el % de valor por origen salia mal.
                if not x.modulo_origen:
                    x.modulo_origen = a.modulo
                c.agregar(x)
            c.vocabulario.extend(d.get("vocabulario", []))
            c.senal.extend(d.get("senal", []))
            c.guardar(_ruta(a.empresa))
            print(f"[{a.modulo}] registrado. Contadores (derivados del "
                  f"registro): {c.mod(a.modulo).contadores}")
            print("  Nota: `registrar` NO mueve el agotado. Para eso va `buscar`, "
                  "que exige la consulta que se corrio.")
            _imprimir_paso(c)
            return 0

        if a.cmd == "padron":
            p = cargar_padron()
            hits = p.buscar(a.empresa, a.dominio, a.ciudad, a.entidad)
            print(f"Padron: corte {p.corte} · {len(p.operables)} plantas "
                  f"operables · {p.antiguedad_meses} meses de antiguedad")
            banderas = list(p.banderas) + vigilar_cobertura(
                p, a.empresa, a.dominio, a.ciudad, a.entidad, a.giro, a.cerrada)
            for b in banderas:
                print("\n  " + str(b).replace("\n", "\n  "))
                c.avisos.append(str(b).replace("\n", " "))

            # M13 queda registrado con lo que el padron contesto DE VERDAD.
            # Cero hits es una respuesta y cuenta: significa que se busco bien.
            consulta = (f"padron corte {p.corte}: empresa='{a.empresa}' "
                        f"dominio='{a.dominio or '-'}' ciudad='{a.ciudad or '-'}' "
                        f"entidad='{a.entidad or '-'}'")
            c.registrar_busqueda("M13", "cortes", consulta, "denue", len(hits),
                                 nota=f"{len(hits)} fila(s); banderas: "
                                      f"{', '.join(b.clave for b in banderas) or 'ninguna'}")
            if hits:
                print(f"\n  {len(hits)} fila(s):")
                for f in hits[:5]:
                    print(f"    {f['nom_estab'][:38]} · {f['raz_social'][:26]} · "
                          f"{f['municipio']} · CP {f['cod_postal']} · "
                          f"estrato {f['estrato_min']}+ · {f['dominio_correo'] or 'sin dominio'}")
                c.cerrar_modulo("M13")
            else:
                c.cerrar_modulo("M13", "no_aplicaba",
                                banderas[-1].mensaje if banderas else
                                "no aparece en el padron")
            c.guardar(_ruta(a.empresa))
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
            b = c.cerrar_bloque(a.consultas, a.nuevas, parcial=a.parcial)
            c.guardar(_ruta(a.empresa))
            print(f"Bloque {b.numero}: {b.consultas} consultas, {b.nuevas} nuevas "
                  f"({b.rendimiento:.2f}/consulta){' SECO' if b.seco else ''}")
            print("  Las dos cifras salen del registro, no de la linea de "
                  "comandos.")
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
            # NO se pisan los avisos de la corrida. `c.avisos = avisos` borraba
            # los avisos de caducidad del padron y las subidas de tope -- las
            # DECISIONES de la corrida-- cada vez que se corria el challenge.
            # Lo encontro la corrida de Cuprum del 24-sep-2026 al ir a citar las
            # cuatro subidas de tope y encontrar la lista con puros conflictos.
            # Se reemplazan solo los del challenge anterior, por su marca.
            c.avisos = ([a for a in c.avisos if not a.startswith(MARCA_CHALLENGE)]
                        + [MARCA_CHALLENGE + a for a in avisos])
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
            print()
            print(tabla_de_rendimiento(c))
            return 0

    except (CompuertaCerrada, FuenteProhibida, SalidaEnElRepo,
            PadronInvalido) as e:
        print(f"\n  ⛔ COMPUERTA: {e}\n", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
