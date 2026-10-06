"""El giro de la cuenta es ENTRADA DEL EVALUADOR, no una descripcion (#384).

DE DONDE SALE: la hoja de las seis puertas de usuario (#383) traia el giro
redactado a mano -- 'cerraduras mecanicas y electronicas control de acceso'--
en vez del giro del radar -- 'metalmecanica cerraduras herrajes'--. Las dos
frases describen la misma casa y las dos son ciertas. Pero `puntos_de_proceso`
busca el proceso del cliente DENTRO de la cadena del giro, y la palabra
'metalmecanica' vale 12.7 puntos: al reevaluar la senal dentro de la corrida,
Dormakaba bajo de 85.1 a 72.4 y NetShape habria bajado igual.

POR QUE IMPORTA: ese puntaje es el que el lazo 3 usa para corregir los pesos por
familia y la conversion por fuente. Un puntaje mas bajo en la corrida que en el
radar, por una redaccion, le ensena al motor algo que no paso.

Y EL MODO DE FALLA ES EL PEOR: silencioso. Las dos cifras son plausibles, las dos
estan en el rango que pasa, y ninguna fuente decia cual manda.
"""
import json
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from flujo.radar import evaluar                                     # noqa: E402

RADAR = RAIZ / "datos" / "radar-2026-10-05-puertas.json"
HOJA = RAIZ / "datos" / "prospecta-2026-10-06-seis-puertas-de-usuario.json"


def _radar():
    return {s["empresa"]: s
            for s in json.loads(RADAR.read_text(encoding="utf-8"))["evaluadas"]}


def _hoja():
    return json.loads(HOJA.read_text(encoding="utf-8"))


def test_el_giro_de_la_hoja_es_EL_DEL_RADAR_verbatim():
    rad = _radar()
    for c in _hoja()["cuentas"]:
        e = c["empresa"]
        assert e in rad, f"{e} no esta en la constancia del radar"
        assert c["giro"] == rad[e]["giro"], (
            f"{e}: la hoja dice {c['giro']!r} y el radar {rad[e]['giro']!r}. "
            "El giro que viaja a la corrida tiene que ser el del radar: es el "
            "que produjo el puntaje. La redaccion legible va en "
            "`giro_como_lo_describe_la_nota`, que no entra a ningun calculo")


def test_la_redaccion_legible_se_conserva_donde_no_calcula():
    """Corregir el giro NO puede perder lo que la nota decia."""
    hoja = _hoja()
    con_redaccion = [c for c in hoja["cuentas"]
                     if c.get("giro_como_lo_describe_la_nota")]
    assert con_redaccion, (
        "al menos las cuentas cuyo giro se corrigio conservan la redaccion "
        "original: borrarla seria perder evidencia para no perder un punto")
    for c in con_redaccion:
        assert c["giro_como_lo_describe_la_nota"] != c["giro"]


def test_el_giro_de_la_hoja_NO_reproduce_el_puntaje_de_la_constancia():
    """La prueba que lo cierra, y por el lado que importa.

    El recalculo de la constancia -- que la sella y que su propia prueba ya
    cubre-- se corre con la entrada COMPLETA del radar. Aqui se mide lo otro:
    que sustituir solo el giro por el redactado de la hoja CAMBIA el numero. Si
    no cambiara, la llave `giro` seria decorativa y esta correccion no tendria
    sentido.
    """
    sys.path.insert(0, str(RAIZ / "herramientas"))
    from sellar_constancia_puertas import _senal_de                 # noqa: E402

    rad = _radar()
    redactados = {c["empresa"]: c["giro_como_lo_describe_la_nota"]
                  for c in _hoja()["cuentas"]
                  if c.get("giro_como_lo_describe_la_nota")}
    assert redactados, "sin giros corregidos no hay nada que contrastar"

    hoy = date.fromisoformat(json.loads(RADAR.read_text(encoding="utf-8"))["hoy"])
    bajaron = []
    for e, redactado in redactados.items():
        senal = _senal_de(rad[e])
        con = evaluar(senal, hoy=hoy)
        assert con["puntaje"] == rad[e]["eval"]["puntaje"], (
            f"{e}: la constancia no se reproduce ni con su propio giro")
        sin = evaluar(dict(senal) | {"giro": redactado}, hoy=hoy)
        if sin["puntaje"] < con["puntaje"]:
            bajaron.append((e, con["puntaje"], sin["puntaje"]))
    assert bajaron, (
        "ninguna cuenta cambio de puntaje al cambiarle la redaccion del giro: "
        "revisa si el evaluador sigue leyendo el giro")


def test_cambiar_la_redaccion_del_giro_SI_mueve_el_puntaje():
    """La contraprueba. Sin esto, las de arriba podrian pasar por casualidad."""
    s = _radar()["Dormakaba"]
    base = {"texto": s["texto"], "fuente": s["fuente"], "fecha": s["fecha"]}
    con = evaluar(base | {"giro": "metalmecanica cerraduras herrajes"})
    sin = evaluar(base | {"giro": "cerraduras mecanicas y electronicas "
                                  "control de acceso"})
    assert con["puntaje"] > sin["puntaje"], (
        "si las dos redacciones puntuaran igual, este defecto no existiria y "
        "esta prueba no tendria para que estar")
    assert con["desglose"]["proceso"] > 0 and sin["desglose"]["proceso"] == 0, (
        "la diferencia es el renglon de PROCESO, no otro: es lo que hace que "
        "el giro no sea decorativo")
