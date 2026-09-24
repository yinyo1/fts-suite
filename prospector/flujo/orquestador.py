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
import argparse, json, os, re, sys, unicodedata

from .compuertas import (CompuertaCerrada, exigir_confianza, techo_por_agotado,
                         Busqueda)
from .salida import carpeta_de_corridas, exigir_fuera_del_repo, SalidaEnElRepo
from .padron import cargar as cargar_padron, vigilar_cobertura, PadronInvalido
from .arranque import resolver, texto_del_plan, chequeo, pregunta_de_una_linea
from .catalogo import exigir_permitida, FuenteProhibida
from .conectores import Sondeo, CONECTORES, VENTANA_MINUTOS
from .confianza import (Contacto, N1_CONFIRMADO, N2_PARCIAL, N3_PUESTO,
                        CERCANIA_SIN_ESTIMAR, exigir_cercania_coherente)
from .estado import (Corrida, RESPONDIO, OLAS, NIVEL_PLANTA,
                     NIVEL_CORPORATIVO, LLAVE_CORPORATIVO, ORIGEN_MANUAL,
                     ORIGEN_RADAR, MARCA_ANGULO)
from .paquete import armar as armar_paquete, escribir as escribir_paquete
from .compuertas import TOPE_SIN_HUMANO
from .ficha import (modo_limpio, modo_procedencia,
                    modo_procedencia_html, tabla_de_rendimiento)

# Las corridas llevan nombres, puestos y correos de PERSONAS. No se escriben en
# el repo: `fts-suite` es publico. Ver flujo/salida.py -- ahi vive la regla, y
# se hace cumplir con un raise, no con un .gitignore.
def CORRIDAS() -> str:
    return str(carpeta_de_corridas())


# Marca de los avisos que produce el challenge. Existe para poder re-correrlo
# sin duplicarlos Y sin borrar los avisos que NO son suyos.
MARCA_CHALLENGE = "[challenge] "


def _slug(s: str) -> str:
    # Los acentos se pierden a proposito: 'Pesqueria' y 'Pesquería' tienen que
    # dar el MISMO slug, o la misma planta abre dos corridas segun como se
    # escriba. Es el bug de siempre con la geografia mexicana.
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------------------------------------------------------------- una corrida
# = UNA PLANTA, y el disco lo refleja
#
# Hasta la v0.9.2 la corrida se guardaba como `<empresa>.json`, plano. Con una
# empresa multiplanta eso significa que la segunda planta PISA la primera, y el
# operador lo parcho de la unica forma que podia: inventando nombres --
# "Coficab Juarez", "Coficab Durango"--. Cuatro corridas con cuatro nombres
# falsos, y el cruce con el padron buscando una empresa que no existe.
#
# Ahora la identidad es empresa + ciudad, nativa:
#
#     <carpeta de la sesion>/<empresa>/<ciudad>.json
#
# `Corrida.empresa` guarda la empresa REAL -- "Coficab"--, que es la que cruza
# con el padron y la que encabeza la ficha. La ciudad vive en su campo, donde
# siempre debio estar.
#
# Las corridas viejas siguen abriendose: el plano `<empresa>.json` se busca
# tambien, porque hay corridas vivas guardadas asi y romperlas seria perder
# trabajo del operador.
SIN_CIUDAD = "sin-ciudad"


def _carpeta_empresa(empresa: str) -> str:
    return os.path.join(CORRIDAS(), _slug(empresa))


def _ruta(empresa: str, ciudad: str | None = None,
           nivel: str = NIVEL_PLANTA) -> str:
    """Donde vive la corrida de ESTA planta, o la corporativa.

    La corporativa NO lleva ciudad -- su poblacion no es geografica-- y su llave
    es `_corporativo`: el guion bajo al frente la hace imposible de colisionar
    con un slug de ciudad (ninguna empieza asi) y la ordena primero.
    """
    if nivel == NIVEL_CORPORATIVO:
        return os.path.join(_carpeta_empresa(empresa),
                            f"{LLAVE_CORPORATIVO}.json")
    return os.path.join(_carpeta_empresa(empresa),
                        f"{_slug(ciudad) or SIN_CIUDAD}.json")


def _ruta_plana(empresa: str) -> str:
    """El esquema viejo. Se lee, no se escribe."""
    return os.path.join(CORRIDAS(), f"{_slug(empresa)}.json")


# Archivos que la herramienta ESCRIBE en la carpeta de la corrida y que NO son
# corridas. `-paquete.json` entro con la salida al motor 3, y sin esta lista el
# resumen de `estado` lo leia como una corrida y la fila salia con "?" -- lo
# encontro una verificacion a mano del comando--.
SUFIJOS_QUE_NO_SON_CORRIDA = ("-procedencia.json", "-paquete.json")


def _es_salida(nombre: str) -> bool:
    return any(nombre.endswith(s) for s in SUFIJOS_QUE_NO_SON_CORRIDA)


def _corridas_de(empresa: str) -> list[str]:
    """Las plantas de esa empresa que ya tienen corrida, ordenadas."""
    d = _carpeta_empresa(empresa)
    if not os.path.isdir(d):
        return []
    return sorted(os.path.join(d, f) for f in os.listdir(d)
                  if f.endswith(".json") and not _es_salida(f))


def _resolver_ruta(empresa: str, ciudad: str | None = None,
                   para_crear: bool = False) -> str:
    """La ruta de la corrida que el comando quiere tocar.

    Con ciudad, no hay ambiguedad. Sin ciudad:
      1. el plano viejo, si existe -- corridas vivas--;
      2. si la empresa tiene UNA sola planta abierta, esa;
      3. si tiene VARIAS, se niega y las lista. Elegir una en silencio es
         exactamente el defecto que esta mejora corrige.
    """
    if ciudad:
        return _ruta(empresa, ciudad)
    plano = _ruta_plana(empresa)
    if os.path.exists(plano):
        return plano
    abiertas = _corridas_de(empresa)
    if len(abiertas) == 1:
        return abiertas[0]
    if len(abiertas) > 1:
        plantas = ", ".join(os.path.basename(r)[:-5] for r in abiertas)
        raise SystemExit(
            f"'{empresa}' tiene {len(abiertas)} corridas y no dijiste cual: "
            f"{plantas}.\n  Agrega --ciudad. Elegir una en silencio es el "
            "defecto que el guardado por planta corrige.")
    return _ruta(empresa, ciudad)      # nueva, sin ciudad conocida


def _ruta_de(c: Corrida, a) -> str:
    """Donde vuelve a guardarse la corrida que se acaba de cargar.

    Manda la ruta de ORIGEN, no un recalculo. Si se cargo por el esquema plano
    viejo se guarda ahi mismo -- mover un archivo a media corrida del operador
    seria peor que el esquema viejo-- y si se cargo de la carpeta de la planta,
    vuelve a la misma. Recalcular desde `c.ciudad` partia la corrida en dos
    archivos cuando el nombre del archivo y la ciudad del contenido no coincidian.
    """
    if c._ruta_origen and os.path.exists(c._ruta_origen):
        return c._ruta_origen
    plano = _ruta_plana(c.empresa)
    if os.path.exists(plano):
        return plano
    return _ruta(c.empresa, getattr(a, "ciudad", None) or c.ciudad)


def _cargar_de(ruta: str) -> Corrida:
    """Carga una corrida por su RUTA, sin resolver empresa ni ciudad."""
    d = json.load(open(ruta, encoding="utf-8"))
    return _armar(d, ruta)


def _cargar(empresa: str, ciudad: str | None = None) -> Corrida:
    ruta = _resolver_ruta(empresa, ciudad)
    if not os.path.exists(ruta):
        abiertas = _corridas_de(empresa)
        pista = ""
        if abiertas:
            pista = ("\n  Plantas con corrida: "
                     + ", ".join(os.path.basename(r)[:-5] for r in abiertas))
        raise SystemExit(f"No hay corrida para '{empresa}'"
                         + (f" en '{ciudad}'" if ciudad else "")
                         + f". Corre primero: prospecta{pista}")
    return _armar(json.load(open(ruta, encoding="utf-8")), ruta)


def _armar(d: dict, ruta: str) -> Corrida:
    """Reconstruye la corrida desde su JSON.

    Compartido por las dos vias de carga: por empresa + ciudad, y por ruta
    directa -- que es la que usa el resumen de todas las corridas--.
    """
    c = Corrida(empresa=d["empresa"], ciudad=d["ciudad"], giro=d.get("giro", ""))
    c.creada = d["creada"]
    c.cobertura = d.get("cobertura", {})
    c.vocabulario = d.get("vocabulario", [])
    c.senal = d.get("senal", [])
    c.challenge_corrido = d.get("challenge_corrido", False)
    c.avisos = d.get("avisos", [])
    # Sin esto la entrega se perdia al releer del disco y `ficha` volvia a
    # reclamarla aunque ya estuviera subida. Es la MISMA familia de defecto que
    # `modulo_origen` en #295: un campo que se escribe y no se restaura.
    c._ruta_origen = ruta
    # La firma que el archivo traia, contra la que el contenido produce de
    # verdad. Si no coinciden, el JSON se escribio por fuera de la herramienta.
    c._firma_leida = str(d.get(Corrida.CAMPO_FIRMA) or "")
    c.entrega = d.get("entrega", {}) or {}
    c.fichas_emitidas = list(d.get("fichas_emitidas", []) or [])
    c.gancho = d.get("gancho", "")
    c.por_que_ahora = d.get("por_que_ahora", "")
    c.como_hablarles = d.get("como_hablarles", [])
    # Los campos del motor 1 y del nivel. Es la MISMA familia de defecto que
    # `modulo_origen` (#295) y `entrega` (#301): un campo que se escribe y no se
    # restaura se pierde al releer, y la corrida vuelve pareciendo otra.
    c.nivel = d.get("nivel", NIVEL_PLANTA)
    c.sembrado = list(d.get("sembrado", []) or [])
    c.angulo = d.get("angulo", "")
    c.origen = d.get("origen", ORIGEN_MANUAL)
    c.angulo_resuelto = d.get("angulo_resuelto", "")
    pres = d.get("presupuesto", {})
    c.presupuesto.tope_por_cuenta = pres.get("tope", 60)
    # Los tramos se restauran DESPUES del tope, y tal cual: son el historial de
    # las renovaciones y la razon escrita de cada una. Recalcularlos seria
    # inventar la evidencia que las justifico.
    c.presupuesto.tramos = list(pres.get("tramos", []) or [])
    for b in pres.get("bloques", []):
        c.presupuesto.registrar(b["consultas"], b["nuevas"],
                                busquedas_al_cerrar=b.get("busquedas_al_cerrar", 0),
                                contactos_al_cerrar=b.get("contactos_al_cerrar", 0),
                                de_valor=b.get("de_valor", 0),
                                de_valor_al_cerrar=b.get("de_valor_al_cerrar", 0))
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
                              nota=o.get("nota", ""), forma=o.get("forma"),
                              sembrado=bool(o.get("sembrado")),
                              de_corrida=o.get("de_corrida", ""))
        c.contactos.append(x)
    c._recalcular_hits()
    c.firma_al_abrir = c.firma()
    return c


def _contacto(c: Corrida, cd: dict) -> Contacto:
    """Arma un Contacto desde el JSON, con la compuerta de catalogo en cada
    observacion. Compartido por `registrar` y por `buscar`."""
    # La compuerta de ESCALA, antes de construir el contacto. En Silao un agente
    # capturo la cercania invertida y marco a un reclutador como comprador; la
    # herramienta no lo detecto. Ahora si, y en el momento.
    x = Contacto(nombre=cd.get("nombre"), puesto=cd.get("puesto"),
                 empresa=c.empresa,
                 nivel_ficha=cd.get("nivel_ficha", N2_PARCIAL),
                 cercania_decision=exigir_cercania_coherente(
                     cd.get("cercania_decision", CERCANIA_SIN_ESTIMAR),
                     cd.get("puesto")),
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


def _todas_las_corridas() -> list[str]:
    """Todas las corridas de la sesion: el esquema por planta y el plano viejo."""
    raiz = CORRIDAS()
    if not os.path.isdir(raiz):
        return []
    rutas = []
    for nombre in sorted(os.listdir(raiz)):
        ruta = os.path.join(raiz, nombre)
        if os.path.isdir(ruta):
            rutas += [os.path.join(ruta, f) for f in sorted(os.listdir(ruta))
                      if f.endswith(".json") and not _es_salida(f)]
        elif (nombre.endswith(".json") and nombre != "conectores.json"
              and not _es_salida(nombre)):
            rutas.append(ruta)
    return rutas


def tabla_de_corridas() -> str:
    """El estado de TODAS las corridas de la sesion, en una tabla.

    Con corridas en paralelo el operador solo veia "N tareas en ejecucion". Esto
    es lo que necesita ver: cuanto ha gastado cada una, cuantos bloques cerro y
    cuantos salieron secos, en que modulo va, y -- lo que mas importa-- si la
    ficha ya salio de la sesion o se va a perder.
    """
    rutas = _todas_las_corridas()
    if not rutas:
        return ("Sin corridas en esta sesion.\n  Arranca una: "
                "./prospector prospecta --empresa \"<empresa>\" "
                "--ciudad \"<ciudad>\"")
    L = [f"CORRIDAS EN LA SESION · {len(rutas)}", "",
         f"{'empresa':<18} {'planta':<18} {'gasto':>9} {'bloques':>9} "
         f"{'modulo':<8} {'chao1':<12} ficha"]
    for ruta in rutas:
        try:
            d = json.load(open(ruta, encoding="utf-8"))
        except (ValueError, OSError):
            L.append(f"{os.path.basename(ruta):<18} (no se pudo leer)")
            continue
        pres = d.get("presupuesto", {})
        bloques = pres.get("bloques", [])
        secos = sum(1 for b in bloques if b.get("seco"))
        chao = (d.get("chao1") or {})
        # El modulo en curso: el primero sin cerrar, en el orden de las olas.
        en_curso = "—"
        for _clave, _t, mods in OLAS:
            for m in mods:
                if not (d.get("modulos", {}).get(m, {}) or {}).get("cerrado"):
                    en_curso = m
                    break
            if en_curso != "—":
                break
        # La firma: si el archivo no la trae, o no cuadra, el estado se toco por
        # fuera. Aqui se lee del JSON directo, sin reconstruir la corrida.
        editada = ""
        try:
            c_tmp = _cargar_de(ruta)
            if c_tmp.editada_a_mano:
                editada = " ✎"
        except Exception:
            editada = " ?"
        entrega = d.get("entrega") or {}
        if entrega.get("url"):
            ficha = f"ENTREGADA ({entrega['destino']})"
        elif entrega.get("declarada"):
            ficha = "sin entregar (declarado)"
        elif d.get("fichas_emitidas"):
            ficha = "!! SIN ENTREGAR"
        else:
            ficha = "no emitida"
        L.append(
            f"{((d.get('empresa') or '?') + editada)[:17]:<18} "
            # La corporativa se distingue: sin esto dos filas de la misma empresa
            # salen identicas con la planta en blanco, y el operador no puede
            # saber cual es cual.
            f"{(d.get('ciudad') or ('(corporativo)' if d.get('nivel') == NIVEL_CORPORATIVO else '—'))[:17]:<18} "
            f"{pres.get('gastadas', 0):>4}/{pres.get('tope', 0):<4} "
            f"{len(bloques):>4}·{secos:<4} "
            f"{en_curso:<8} "
            f"{(chao.get('veredicto') or '—')[:11]:<12} "
            f"{ficha}")
    pendientes = [r for r in rutas if _pendiente_de_entrega(r)]
    if pendientes:
        L += ["", f"  ⛔ {len(pendientes)} ficha(s) emitida(s) y SIN ENTREGAR: "
                  "se pierden al cerrar la sesion.",
              "     Corre `entregar` en cada una, o declaralo con "
              "--sin-entregar --razon."]
    editadas = [l for l in L if " ✎" in l]
    if editadas:
        L += ["", f"  ✎ {len(editadas)} corrida(s) con el ESTADO EDITADO A MANO: "
                  "su ficha lo declara arriba."]
    L += ["", "  gasto = consultas/tope · bloques = cerrados·secos"]
    return "\n".join(L)


def _pendiente_de_entrega(ruta: str) -> bool:
    try:
        d = json.load(open(ruta, encoding="utf-8"))
    except (ValueError, OSError):
        return False
    return bool(d.get("fichas_emitidas")) and not (d.get("entrega") or {})


def texto_entrega_pendiente(c: Corrida, archivo: str) -> str:
    """El bloque que dice que la ficha existe pero todavia no sobrevive.

    Los pasos van escritos porque quien los ejecuta es Claude -- el conector
    vive detras de MCP y Python no lo alcanza--, igual que con las sondas de
    conector.
    """
    nombre = f"{_slug(c.empresa)}-{_slug(c.ciudad) or SIN_CIUDAD}-ficha.html"
    return f"""
  ⛔ ENTREGA PENDIENTE — la ficha todavia NO sobrevive a esta sesion.

     Esta carpeta vive en /tmp del contenedor y MUERE al cerrar la sesion. La
     primera corrida de Coficab se perdio exactamente asi.

     1. Lee el archivo:      {archivo}
     2. Subelo a OneDrive del operador, con el conector de M365:
          sharepoint_folder_search  -> para el driveId de su OneDrive
          sharepoint_upload_file    -> filename "{nombre}", content = el HTML
        Mismo inquilino que su Outlook: los datos personales no salen del
        control corporativo de FTS. Si OneDrive falla, Google Drive sirve de
        respaldo (`create_file`, contentMimeType "text/html",
        disableConversionToGoogleType true).
     3. Registra la liga que devolvio:
          ./prospector entregar --empresa {c.empresa!r}{f" --ciudad {c.ciudad!r}" if c.ciudad else ""} \\
            --destino onedrive --url '<webUrl que devolvio>'

     Por correo NO se puede: el `outlook_send_mail` conectado no tiene
     parametro de adjuntos (medido, no supuesto).

     Si el operador decide no sacarla, queda escrito que se va a perder:
       ./prospector entregar --empresa {c.empresa!r} --sin-entregar --razon '<...>'
"""


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
                   "challenge", "ficha", "estado", "tope", "fusionar",
                   "conectores", "entregar", "sembrar", "tramo", "paquete"):
        s = sub.add_parser(nombre)
        if nombre == "estado":
            # `estado` sin --empresa resume TODAS las corridas de la sesion.
            s.add_argument("--empresa", default=None)
        elif nombre not in ("listo", "conectores"):
            s.add_argument("--empresa", required=True)
        # `--ciudad` identifica la PLANTA en todos los comandos de corrida. En
        # `prospecta`, `iniciar` y `padron` ademas alimenta la resolucion del
        # padron, y ahi se declara aparte con su ayuda propia.
        if nombre not in ("listo", "conectores", "prospecta", "iniciar", "padron"):
            s.add_argument("--ciudad", default=None,
                           help="la planta, cuando la empresa tiene varias. Sin "
                                "esto, si hay mas de una, el comando se niega en "
                                "vez de elegir")
        if nombre == "listo":
            s.add_argument("--rapido", action="store_true",
                           help="salta la suite de pruebas")
        if nombre == "prospecta":
            s.add_argument("--ciudad", default="")
            s.add_argument("--giro", default="")
            s.add_argument("--dominio", default="")
            s.add_argument("--entidad", default="")
            s.add_argument("--tope", type=int, default=60)
            s.add_argument("--nivel", choices=[NIVEL_PLANTA, NIVEL_CORPORATIVO],
                           default=NIVEL_PLANTA,
                           help="planta (lo de siempre) o corporativo: la gente "
                                "regional o de grupo, que NO tiene planta. El "
                                "corporativo no pide --ciudad")
            s.add_argument("--angulo", default="",
                           help="la SENAL que origino la corrida. Con --origen "
                                "radar entra a la ficha como gancho PRELIMINAR, "
                                "no observado, y la corrida lo confirma o corrige")
            s.add_argument("--origen", choices=[ORIGEN_MANUAL, ORIGEN_RADAR],
                           default=ORIGEN_MANUAL,
                           help="de donde vino el angulo: manual (el operador) o "
                                "radar (el motor 1)")
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
            s.add_argument("--liga", default="",
                           help="la URL de donde salio, si la hay. La ficha la "
                                "necesita: una fuente sin liga ni fecha no es "
                                "una fuente, es una afirmacion")
            s.add_argument("--etiqueta", default=None,
                           help="cuando lo distinto no es la fuente sino la forma "
                                "de preguntar (M7: forma_empresa / forma_nombre)")
            s.add_argument("--datos", default=None,
                           help="JSON con los contactos que trajo, si trajo")
        if nombre == "cerrar":
            s.add_argument("--estado", default=RESPONDIO)
            s.add_argument("--razon", default="")
        if nombre == "entregar":
            s.add_argument("--destino", default=None,
                           choices=list(Corrida.DESTINOS),
                           help="onedrive (recomendado: mismo inquilino que su "
                                "Outlook) · drive (respaldo) · otro")
            s.add_argument("--url", default="",
                           help="la liga del archivo ya subido. Sin liga no hay "
                                "entrega que comprobar")
            s.add_argument("--archivo", default="",
                           help="el nombre con el que quedo, si cambio")
            s.add_argument("--sin-entregar", action="store_true",
                           dest="sin_entregar",
                           help="el operador decide NO sacarla. Exige --razon: "
                                "la ficha se va a perder al cerrar la sesion")
            s.add_argument("--razon", default="")
        if nombre == "conectores":
            for k in CONECTORES:
                s.add_argument(f"--{k}", default=None,
                               help=f"lo que contesto {k} DE VERDAD "
                                    f"({CONECTORES[k][1]})")
                s.add_argument(f"--{k}-caido", default=None, dest=f"{k}_caido",
                               help=f"{k} no respondio: por que exactamente")
            s.add_argument("--continuar-sin", default=None, dest="continuar_sin",
                           choices=sorted(CONECTORES),
                           help="el operador autoriza seguir sin ese conector")
            s.add_argument("--razon", default="",
                           help="lo que dijo el operador. Obligatorio con "
                                "--continuar-sin: es un hueco de la corrida")
        if nombre == "fusionar":
            s.add_argument("--de", required=True,
                           help="el nombre como esta registrado hoy")
            s.add_argument("--a", required=True,
                           help="el nombre COMPLETO que aparecio despues")
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
        if nombre == "sembrar":
            s.add_argument("--de", dest="de_corrida", required=True,
                           help="la corrida de origen, como 'Coficab/Cd. Juarez'")
            # SIN `choices` a proposito: argparse rechazaria `contactos` con un
            # "invalid choice" y se perderia la razon, que es la parte que
            # importa -- sembrar contactos regionales en una planta es el doble
            # conteo de #300--. La compuerta de `Corrida.sembrar` la explica.
            s.add_argument("--que", required=True,
                           help="patron, vocabulario o nota. Los CONTACTOS "
                                "regionales no se siembran en una planta: van a "
                                "la corrida corporativa")
            s.add_argument("--valor", required=True)
            s.add_argument("--nota", default="")
        if nombre == "tramo":
            s.add_argument("--renovar", action="store_true",
                           help="sube el tope un tramo, si la evidencia lo "
                                "justifica. Sin esto solo informa")
            s.add_argument("--autorizado", action="store_true",
                           help="el operador autoriza pasar del tope que la "
                                "herramienta renueva sola")
        if nombre == "paquete":
            s.add_argument("--salida", default=None,
                           help="donde escribir el JSON. Por omision, la carpeta "
                                "de la corrida")
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

        if a.cmd == "conectores":
            sondeo = Sondeo.cargar()
            hubo = False
            for k in CONECTORES:
                vivo = getattr(a, k, None)
                caido = getattr(a, f"{k}_caido", None)
                if vivo and caido:
                    raise SystemExit(
                        f"--{k} y --{k}-caido a la vez. Un conector contesto o "
                        "no contesto; las dos cosas no.")
                if vivo:
                    sondeo.registrar(k, True, vivo); hubo = True
                elif caido:
                    sondeo.registrar(k, False, caido); hubo = True
            if a.continuar_sin:
                if not a.razon.strip():
                    raise SystemExit(
                        f"--continuar-sin {a.continuar_sin} EXIGE --razon: es un "
                        "hueco de la corrida y va a salir en la ficha.")
                sondeo.autorizar_sin(a.continuar_sin, a.razon.strip())
                hubo = True
            if hubo:
                ruta = sondeo.guardar()
            print("\nCONECTORES · sondas de esta sesion "
                  f"(valen {VENTANA_MINUTOS} min)")
            print("=" * 62)
            for linea in sondeo.resumen():
                print(linea)
            print("=" * 62)
            print("  [ ?  ] webfetch   bloqueado por egress (medido). NO detiene "
                  "nada:\n         M7/M8 salen sin_acceso y eso es correcto.")
            if sondeo.listo:
                print("\n  Listo para arrancar: ./prospector prospecta "
                      "--empresa \"<empresa>\"\n")
                return 0
            try:
                sondeo.exigir_listo()
            except CompuertaCerrada as e:
                print(f"\n  ⛔ FALTA: {e}\n", file=sys.stderr)
                return 3 if sondeo.caidos_sin_autorizar else 2
            return 0

        if a.cmd == "prospecta":
            # PRIMER PASO, antes de resolver el padron: los tres conectores
            # tuvieron que ser LLAMADOS. Python no los ve -- viven detras de
            # MCP-- asi que no puede llamarlos; lo que si puede es negarse a
            # abrir la corrida sin constancia fresca de esas llamadas. Es el
            # mismo mecanismo que `buscar`, que exige la consulta textual.
            sondeo = Sondeo.cargar()
            if sondeo.caidos_sin_autorizar:
                # Salida 3, la misma que la pregunta de la empresa multiplanta:
                # NO es un error que arreglar, es una DECISION del operador. Que
                # las dos compartan codigo no es casualidad -- las dos paran la
                # corrida para preguntar una linea--.
                try:
                    sondeo.exigir_listo()
                except CompuertaCerrada as e:
                    print(f"\n  ⛔ {e}\n", file=sys.stderr)
                    return 3
            sondeo.exigir_listo()
            corporativo = a.nivel == NIVEL_CORPORATIVO
            if corporativo and a.ciudad:
                print("\n  ⛔ --nivel corporativo no lleva --ciudad: su poblacion "
                      "NO es geografica.\n     Si querias la planta de "
                      f"{a.ciudad}, corre sin --nivel.\n", file=sys.stderr)
                return 2
            ar = resolver(a.empresa, a.ciudad, a.giro, a.dominio, a.entidad)
            ruta_nueva = _ruta(a.empresa, a.ciudad or ar.ciudad,
                               nivel=a.nivel)
            existente = (_ruta_plana(a.empresa)
                         if os.path.exists(_ruta_plana(a.empresa))
                         else ruta_nueva)
            # La corrida CORPORATIVA no pregunta cual planta: no va a ninguna.
            # Que el padron liste tres establecimientos es informacion, no una
            # ambiguedad que resolver.
            if ar.ambiguo and not corporativo and not os.path.exists(existente):
                # NO se abre la corrida: elegir una planta en silencio es el caso
                # de los cinco DUNS de Ragasa, y hornear '(sin ciudad)' en una
                # corrida guardada es peor que preguntar.
                print("\n  " + pregunta_de_una_linea(ar).replace("\n", "\n  ") + "\n")
                return 3
            hay_corrida = os.path.exists(existente)
            if not hay_corrida:
                c = Corrida(
                    empresa=a.empresa,
                    ciudad="" if corporativo else (ar.ciudad or "(sin ciudad)"),
                    giro=ar.giro, nivel=a.nivel)
                c.presupuesto.tope_por_cuenta = a.tope
                # El ANGULO. Cuando lo siembra el radar entra como gancho
                # PRELIMINAR y se dice que no se observo aqui: la corrida lo
                # confirma o lo corrige, y la ficha lo declara mientras no pase
                # ninguna de las dos cosas. Un gancho sembrado que sale como si
                # lo hubiera medido esta corrida es la semilla que se hace pasar
                # por observacion, el modo de falla del §4 de las propuestas.
                if a.angulo:
                    c.angulo = a.angulo.strip()
                    c.origen = a.origen
                    if a.origen == ORIGEN_RADAR:
                        c.gancho = c.angulo
                        c.avisos.append(
                            MARCA_ANGULO
                            + "GANCHO PRELIMINAR sembrado por el RADAR, no "
                            "observado en esta corrida. Confirmalo o corrigelo "
                            "con `registrar --datos '{\"angulo_resuelto\": "
                            "\"confirmado|corregido\"}'` antes de la ficha.")
                    else:
                        c.angulo_resuelto = "manual"
                for b in ar.banderas:
                    c.avisos.append(str(b).replace("\n", " "))
                # Un conector autorizado como hueco no se queda en una nota: el
                # modulo que depende de el sale `sin_acceso` con razon escrita,
                # y eso viaja hasta el checklist de la ficha. Declarar el hueco
                # es la mitad del metodo; anotarlo al margen no lo es.
                for sonda in sondeo.huecos_autorizados:
                    mod = CONECTORES[sonda.conector][0]
                    if mod in c.modulos or mod in ("M0", "M0b"):
                        c.cerrar_modulo(mod, "sin_acceso",
                                        f"{sonda.conector} no respondio al "
                                        f"arrancar ({sonda.evidencia}). El "
                                        f"operador autorizo seguir sin el: "
                                        f"{sonda.razon_autorizacion}")
                    c.avisos.append(
                        f"CORRIDA ABIERTA SIN {sonda.conector.upper()}: "
                        f"{sonda.evidencia}. Autorizado por el operador: "
                        f"{sonda.razon_autorizacion}")
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
                # El nivel corporativo se aplica DESPUES del padron, a
                # proposito: el padron SI se consulto -- la consulta queda
                # registrada, y cero filas es una respuesta-- pero la RAZON que
                # manda en M13 es la del nivel, no la del empate. Al reves, la
                # razon del padron pisaba la del nivel y la cobertura decia "no
                # aparece en el corte" cuando lo que pasa es que el corporativo
                # no es un establecimiento.
                if corporativo:
                    cerrados = c.abrir_nivel_corporativo()
                    c.avisos.append(
                        "NIVEL CORPORATIVO: " + ", ".join(cerrados) + " salen "
                        "no_aplicaba con razon escrita. Una vacante y un "
                        "establecimiento del DENUE son objetos DE PLANTA.")
                c.guardar(existente)
                print("\nCONECTORES verificados antes de abrir:")
                for linea in sondeo.resumen():
                    print(linea)
                print()
                print(f"Corrida abierta: {a.empresa} · tope {a.tope} consultas")
                print(f"  Resultados en la SESION, nunca en el repo:\n  {CORRIDAS()}")
            else:
                c = _cargar(a.empresa, a.ciudad or ar.ciudad)
                print(f"Corrida YA existe para {a.empresa}"
                      + (f" en {c.ciudad}" if c.ciudad else "")
                      + ": se retoma donde quedo.")
            print()
            print(texto_del_plan(ar, a.tope))
            print()
            _imprimir_paso(c)
            return 0

        if a.cmd == "iniciar":
            c = Corrida(empresa=a.empresa, ciudad=a.ciudad, giro=a.giro)
            c.presupuesto.tope_por_cuenta = a.tope
            c.guardar(_ruta(a.empresa, a.ciudad))
            print(f"Corrida iniciada: {a.empresa} · tope {a.tope} consultas")
            print(f"  Los resultados viven en la sesion, NO en el repo:\n"
                  f"  {CORRIDAS()}")
            _imprimir_paso(c)
            return 0

        if a.cmd == "estado" and not a.empresa:
            print()
            print(tabla_de_corridas())
            print()
            return 0

        c = _cargar(a.empresa, getattr(a, "ciudad", None))

        if a.cmd in ("siguiente", "estado"):
            _imprimir_paso(c)
            if a.cmd == "estado":
                print(json.dumps(c.a_dict()["presupuesto"], indent=2,
                                 ensure_ascii=False))
                if c.entrega_pendiente:
                    print("\n  ⛔ La ficha de esta corrida esta emitida y SIN "
                          "ENTREGAR: se pierde al cerrar la sesion.")
            return 0

        if a.cmd == "entregar":
            if a.sin_entregar:
                if not a.razon.strip():
                    raise SystemExit(
                        "--sin-entregar EXIGE --razon: significa que la ficha se "
                        "va a perder al cerrar la sesion, y eso tiene que quedar "
                        "dicho en la corrida.")
                c.declarar_sin_entregar(a.razon)
                c.guardar(_ruta_de(c, a))
                print(f"\n  ⚠  FICHA SIN ENTREGAR, declarado: {a.razon.strip()}")
                print("     Va a desaparecer al cerrar la sesion. Queda escrito "
                      "en la corrida.\n")
                return 0
            if not a.destino:
                raise SystemExit(
                    "Falta --destino. Los evaluados: "
                    + ", ".join(Corrida.DESTINOS)
                    + ". 'correo' no esta: el conector de Outlook no tiene "
                      "parametro de adjuntos (medido).")
            e = c.registrar_entrega(a.destino, a.url, a.archivo)
            c.guardar(_ruta_de(c, a))
            print(f"\n  ✓ FICHA ENTREGADA — sobrevive a esta sesion:")
            print(f"     destino: {e['destino']}")
            print(f"     liga:    {e['url']}\n")
            return 0

        if a.cmd == "fusionar":
            antes = len(c.contactos)
            x = c.fusionar(a.de, a.a)
            c.guardar(_ruta_de(c, a))
            fundidos = antes - len(c.contactos)
            print(f"[{a.empresa}] '{a.de}' -> '{x.nombre}'"
                  f"{' (DOS fichas fundidas en una)' if fundidos else ''}")
            print(f"  hits: {x.hits} · origen: {x.modulo_origen or '(sin registro)'} "
                  f"· de valor: {'si' if x.de_valor else 'no'}")
            print("  Los hallazgos de las busquedas quedaron reapuntados: si no, "
                  "los hits colgarian de una clave que ya no existe.")
            return 0

        if a.cmd == "sembrar":
            r = c.sembrar(a.de_corrida, a.que, a.valor, nota=a.nota)
            c.guardar(_ruta_de(c, a))
            print(f"\nSEMBRADO de {r['de_corrida']}: {r['que']} = {r['valor']}")
            print("  NO cuenta como consulta, NO mueve el agotado, y NO cuenta "
                  "como raiz.")
            print("  Topa en CANDIDATO hasta que ESTA corrida lo observe por su "
                  "cuenta.")
            print("  La ficha lo declara: 'sembrado de <corrida>, no observado "
                  "aqui'.\n")
            _imprimir_paso(c)
            return 0

        if a.cmd == "tramo":
            ev = c.evaluar_tramo()
            print(f"\nTRAMO {ev['tramo_actual']} · tope {ev['tope_actual']} "
                  f"consultas · gastadas {c.presupuesto.gastadas}")
            print(f"  Evidencia: {ev['razon']}")
            print(f"\n  Las tres condiciones para renovar a {ev['tope_siguiente']}:")
            for k, v in ev["condiciones"].items():
                print(f"    [{'OK' if v else '  '}] {k.replace('_', ' ')}")
            if not a.renovar:
                if ev["puede"]:
                    extra = (" --autorizado" if ev["necesita_humano"] else "")
                    # Con la ciudad: sin ella, en una empresa multiplanta el
                    # comando que se sugiere se niega y no renueva nada.
                    planta = (f" --ciudad {c.ciudad!r}" if c.ciudad else "")
                    print(f"\n  Se puede renovar. Corre: ./prospector tramo "
                          f"--empresa {c.empresa!r}{planta} --renovar{extra}\n")
                else:
                    print("\n  NO se renueva todavia. Falta: "
                          + ", ".join(ev["faltan"]) + "\n")
                return 0
            if ev["necesita_humano"] and not a.autorizado:
                print(f"\n  ⛔ Pasar de {ev['tope_actual']} a "
                      f"{ev['tope_siguiente']} excede {TOPE_SIN_HUMANO}, que es "
                      "hasta donde la herramienta renueva sola.\n"
                      "     Preguntale al operador y vuelve con --autorizado.\n",
                      file=sys.stderr)
                return 3
            r = c.renovar_tramo(autorizado_por_humano=a.autorizado)
            c.avisos.append(
                f"TOPE RENOVADO por tramo {r['tramo']}: {r['tope_anterior']} -> "
                f"{r['tope_nuevo']} consultas. Razon: {r['razon']}"
                + (" (autorizado por el operador)"
                   if r["autorizado_por_humano"] else " (automatico)"))
            c.guardar(_ruta_de(c, a))
            print(f"\n  TRAMO {r['tramo']}: tope {r['tope_anterior']} -> "
                  f"{r['tope_nuevo']}. Restantes: {c.presupuesto.restantes}")
            print(f"  Razon escrita, y queda en la ficha: {r['razon']}\n")
            _imprimir_paso(c)
            return 0

        if a.cmd == "paquete":
            destino = a.salida or os.path.join(
                os.path.dirname(_ruta_de(c, a)),
                (_slug(c.ciudad) or LLAVE_CORPORATIVO) + "-paquete.json")
            destino = exigir_fuera_del_repo(destino)
            ruta = escribir_paquete(c, destino)
            pq = armar_paquete(c)
            print(f"\nPAQUETE PARA EL MOTOR 3 (CRM) — {os.path.getsize(ruta):,} bytes")
            print(f"  {ruta}")
            print(f"  empresa {pq['empresa']} · planta {pq['planta'] or '(corporativo)'}"
                  f" · origen {pq['origen']}")
            print(f"  contactos de valor: {len(pq['contactos_de_valor'])}"
                  f" · senales: {len(pq['senal'])}")
            for x in pq["contactos_de_valor"]:
                print(f"    · {x['puesto'] or '(sin puesto)'} — canal "
                      f"{x['canal_recomendado']} — {x['nivel_confianza']}"
                      + ("  ⚠ REVISION HUMANA" if x["revision_humana"] else ""))
            if not pq["contactos_de_valor"]:
                print("    (ninguno: el motor 3 no tiene a quien tocar todavia)")
            print("\n  El paquete es un INSUMO, no una instruccion. Los de "
                  "revision humana NO se contactan sin que alguien los revise.\n")
            _imprimir_paso(c)
            return 0

        if a.cmd == "tope":
            antes = c.presupuesto.tope_por_cuenta
            if a.nuevo <= antes:
                raise SystemExit(
                    f"El tope ya es {antes}. Este comando SUBE el tope; bajarlo "
                    "a media corrida borraria evidencia ya gastada.")
            if not a.razon.strip():
                raise SystemExit("Falta --razon.")
            # Queda en `tramos`, igual que una renovacion automatica: con dos
            # caminos para subir el tope y solo uno dejando historial, la ficha
            # mostraba unas subidas y no otras.
            c.presupuesto.subir_a_mano(a.nuevo, a.razon)
            c.avisos.append(f"TOPE SUBIDO A MANO de {antes} a {a.nuevo} "
                            f"consultas. Razon: {a.razon.strip()}")
            c.guardar(_ruta_de(c, a))
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
            for sn in d.get("senal", []):
                c.agregar_senal(sn)          # <- compuerta B1+B6 de #300
            # El angulo que sembro el radar se CONFIRMA o se CORRIGE aqui. Que
            # el gancho preliminar se quede sin resolver no bloquea la ficha,
            # pero la ficha lo declara: un gancho que el radar supuso y la
            # corrida no verifico no puede salir con el mismo peso que uno medido.
            if d.get("angulo_resuelto"):
                r = str(d["angulo_resuelto"]).strip().lower()
                if r not in ("confirmado", "corregido", "manual"):
                    raise SystemExit(
                        f"angulo_resuelto '{r}': solo vale 'confirmado' o "
                        "'corregido'. El angulo del radar es una hipotesis; la "
                        "corrida dice si se sostuvo o no.")
                c.angulo_resuelto = r
                # El aviso que decia "confirmalo" se REEMPLAZA. Dejarlo seria
                # una instruccion caduca en la ficha, y el operador no puede
                # saber cual de las dos cosas es cierta.
                c.avisos = [a for a in c.avisos
                            if not a.startswith(MARCA_ANGULO)]
                c.avisos.append(
                    MARCA_ANGULO + f"El angulo que sembro el radar quedo "
                    f"{r.upper()} por esta corrida.")
            # Los tres textos de CRITERIO que la ficha necesita. Se reemplazan,
            # no se acumulan: son una redaccion, no una lista de hallazgos.
            for campo in ("gancho", "por_que_ahora"):
                if d.get(campo):
                    setattr(c, campo, str(d[campo]))
            if d.get("como_hablarles"):
                c.como_hablarles = list(d["como_hablarles"])
            c.guardar(_ruta_de(c, a))
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
            c.guardar(_ruta_de(c, a))
            _imprimir_paso(c)
            return 0

        if a.cmd == "buscar":
            # ANTES de registrar: si el bloque anterior quedo abierto en diez, se
            # corrige aqui, que es donde todavia tiene arreglo.
            c.exigir_bloque_cerrado()
            contactos = []
            if a.datos:
                d = json.loads(a.datos)
                for cd in d.get("contactos", []):
                    contactos.append(_contacto(c, cd))
            b = c.registrar_busqueda(
                a.modulo, a.clave, a.consulta, a.fuente, a.resultados,
                nota=a.nota, contactos=contactos, etiqueta=a.etiqueta,
                liga=a.liga)
            c.guardar(_ruta_de(c, a))
            m = c.mod(a.modulo)
            print(f"[{a.modulo}] busqueda registrada: {a.fuente} · "
                  f"{a.resultados} resultado(s)"
                  f"{' (CERO, y cuenta)' if a.resultados == 0 else ''}")
            print(f"  Consulta: {b.consulta}")
            print(f"  Contadores DERIVADOS del registro: {m.contadores}")
            aviso = c.aviso_de_bloque()
            if aviso:
                print()
                print(aviso)
            _imprimir_paso(c)
            return 0

        if a.cmd == "vuelta":
            r = c.abrir_vuelta()
            c.guardar(_ruta_de(c, a))
            print(f"Vuelta {r['vuelta']} abierta. Reabiertos: "
                  f"{', '.join(r['reabiertos'])}")
            _imprimir_paso(c)
            return 0

        if a.cmd == "bloque":
            c.presupuesto.exigir_puede_seguir()
            b = c.cerrar_bloque(a.consultas, a.nuevas, parcial=a.parcial)
            c.guardar(_ruta_de(c, a))
            print(f"Bloque {b.numero}: {b.consultas} consultas, {b.nuevas} nuevas, "
                  f"{b.de_valor} DE VALOR "
                  f"({b.rendimiento:.2f}/consulta){' SECO' if b.seco else ''}")
            print("  Las dos cifras salen del registro, no de la linea de "
                  "comandos.")
            print(f"Secos seguidos: {c.presupuesto.secos_al_final}/3 · "
                  f"restantes: {c.presupuesto.restantes}")
            return 0

        if a.cmd == "cerrar":
            c.cerrar_modulo(a.modulo, a.estado, a.razon)   # <- compuerta agotado
            c.guardar(_ruta_de(c, a))
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
            c.guardar(_ruta_de(c, a))
            print(f"Challenge corrido. {len(avisos)} conflicto(s) a revision humana:")
            for w in avisos:
                print("  -", w)
            _imprimir_paso(c)
            return 0

        if a.cmd == "ficha":
            if not c.challenge_corrido:
                raise CompuertaCerrada(
                    "No se emite ficha sin challenge. Corre: challenge")
            # Los DOS modos escriben un .html autocontenido. Hasta la
            # v0.9.0 el limpio salia como fragmento -- sin doctype ni charset--
            # y el de procedencia solo como JSON. La primera corrida real de un
            # operador (#268) mostro para que se necesita el archivo: mandarlo a
            # un tercero y pegarlo en un lognote de Odoo.
            # La ficha va JUNTO a su corrida, en la carpeta de la planta. Con
            # el nombre plano viejo las cuatro plantas de una empresa escribian
            # la misma `<empresa>-limpio.html` y se pisaban -- el mismo defecto
            # que el guardado por planta acaba de corregir, un paso mas abajo--.
            # La ficha va JUNTO a su corrida, con el mismo nombre base: si la
            # corrida es `coficab/pesqueria.json`, la ficha es
            # `coficab/pesqueria-limpio.html`. Con el nombre plano viejo las
            # cuatro plantas escribian la misma `<empresa>-limpio.html` y se
            # pisaban -- el mismo defecto que el guardado por planta acaba de
            # corregir, un paso mas abajo--.
            origen = _ruta_de(c, a)
            base = (str(exigir_fuera_del_repo(a.salida)) if a.salida
                    else origen[:-5] + f"-{a.modo}")
            if base.lower().endswith((".html", ".htm", ".json")):
                base = base.rsplit(".", 1)[0]
            escritos = []
            if a.modo == "limpio":
                escritos.append((base + ".html", modo_limpio(c)))
            else:
                escritos.append((base + ".html", modo_procedencia_html(c)))
                # El JSON se queda: es el artefacto AUDITABLE, el que una
                # maquina lee sin ambiguedad. El .html es el que se revisa.
                escritos.append((base + ".json", json.dumps(
                    modo_procedencia(c), ensure_ascii=False, indent=2)))
            for ruta, contenido in escritos:
                exigir_fuera_del_repo(ruta)
                os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
                open(ruta, "w", encoding="utf-8").write(contenido)
            print(f"\n  FICHA ({a.modo.upper()}) — archivo listo para mandar:")
            for ruta, _x in escritos:
                print(f"    {ruta}  ({os.path.getsize(ruta):,} bytes)")
                if ruta not in c.fichas_emitidas:
                    c.fichas_emitidas.append(ruta)
            print(f"\n  Abrelo o adjuntalo desde esa ruta. NO esta en el repo: "
                  f"lleva datos personales.")
            c.guardar(_ruta_de(c, a))
            print()
            print(tabla_de_rendimiento(c))
            if c.entrega_pendiente:
                # La ficha existe y todavia NO ha salido de la sesion. Callarlo
                # seria repetir la perdida de la primera corrida de Coficab: el
                # archivo estaba, el operador vio "escrita", y el contenedor se
                # lo llevo. Salida 4 para que la skill lo detecte: no es falla,
                # es un paso pendiente.
                print(texto_entrega_pendiente(c, escritos[0][0]), file=sys.stderr)
                return 4
            print(f"\n  Entregada en {c.entrega['destino']}: "
                  f"{c.entrega['url']}\n")
            return 0

    except (CompuertaCerrada, FuenteProhibida, SalidaEnElRepo,
            PadronInvalido) as e:
        print(f"\n  ⛔ COMPUERTA: {e}\n", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
