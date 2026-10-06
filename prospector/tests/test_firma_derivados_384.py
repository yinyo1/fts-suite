"""La firma del estado no puede acusar a una corrida limpia (#384).

DE DONDE SALE: la ficha de Daikin, leida antes de entregarla, salio con
«ESTADO EDITADO A MANO» en el primer renglon. La corrida nunca se toco por fuera
de la herramienta. La causa es un derivado DENTRO de una llave que la firma
hashea: `registrar` trae un contacto que ya estaba, `agregar` le sube `hits` en
memoria y firma con esa cifra; al releer, `_recalcular_hits` lo deriva del
registro y lo deja en la cifra verdadera, mas baja. Las dos firmas no casan.

POR QUE IMPORTA MAS QUE UN COSMETICO: la marca existe para delatar a quien
escribe el JSON por fuera. Si se dispara en la corrida normal -- y esta lo hacia
en cuanto una segunda fuente confirmaba a alguien, que es lo que la corrida
BUSCA-- deja de significar nada y la vendedora aprende a ignorarla. Entonces el
dia que si hubo una edicion a mano, nadie se entera.

LAS DOS MITADES, y ninguna sirve sola:
  1. un merge de contacto NO levanta la marca.
  2. una edicion de verdad SI la levanta.
"""
import json
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from flujo import orquestador as O                                  # noqa: E402
from flujo.confianza import Contacto                                # noqa: E402
from flujo.estado import Corrida                                    # noqa: E402


def _corrida_con_un_contacto(tmp):
    c = Corrida(empresa="Acme", ciudad="Monterrey", giro="autopartes")
    x = Contacto(nombre="Fulano De Tal", puesto="gerente de mantenimiento",
                 empresa="Acme", cercania_decision=10)
    c.registrar_busqueda("M5", "bloques_secos",
                         'site:mx.linkedin.com/in "gerente de mantenimiento" Acme',
                         "linkedin_publico", 1, contactos=[x])
    ruta = str(Path(tmp) / "acme" / "monterrey.json")
    c.guardar(ruta)
    return ruta


def _reabrir(ruta):
    d = json.loads(Path(ruta).read_text(encoding="utf-8"))
    return O._armar(d, ruta)


def test_un_merge_de_contacto_NO_levanta_la_marca_de_edicion_a_mano():
    with tempfile.TemporaryDirectory() as tmp:
        ruta = _corrida_con_un_contacto(tmp)
        c = _reabrir(ruta)
        assert not c.editada_a_mano

        # El merge: la misma persona vuelve a entrar por `registrar`. En memoria
        # `hits` sube; al releer se deriva del registro y baja. Esa diferencia es
        # la que NO puede contar como edicion a mano.
        c.agregar(Contacto(nombre="Fulano De Tal",
                           puesto="gerente de mantenimiento", empresa="Acme"))
        assert [x.hits for x in c.contactos] == [2]
        c.guardar(ruta)

        otra = _reabrir(ruta)
        assert [x.hits for x in otra.contactos] == [1], (
            "el hits derivado del registro es el verdadero")
        assert not otra.editada_a_mano, (
            "una corrida que solo paso por la herramienta NO esta editada a mano")


def test_los_dos_derivados_del_contacto_quedan_fuera_de_la_firma():
    assert Corrida.CAMPOS_DERIVADOS_DEL_CONTACTO == ("hits", "modulo_origen"), (
        "son exactamente los dos que `_recalcular_hits` deriva del registro. "
        "Si se agrega otro derivado al contacto, va aqui tambien")
    fuente = (RAIZ / "flujo" / "estado.py").read_text(encoding="utf-8")
    cuerpo = fuente.split("def _recalcular_hits")[1].split("def ")[0]
    for campo in Corrida.CAMPOS_DERIVADOS_DEL_CONTACTO:
        assert f"x.{campo} =" in cuerpo, (
            f"'{campo}' esta excluido de la firma porque se DERIVA. Si dejara "
            "de derivarse en `_recalcular_hits`, excluirlo seria un hueco")


def test_una_edicion_de_verdad_SI_levanta_la_marca():
    with tempfile.TemporaryDirectory() as tmp:
        ruta = _corrida_con_un_contacto(tmp)
        d = json.loads(Path(ruta).read_text(encoding="utf-8"))
        # Lo que la marca existe para delatar: un campo ESCRITO cambiado por
        # fuera, sin recalcular la firma.
        d["contactos"][0]["puesto"] = "director general"
        Path(ruta).write_text(json.dumps(d, ensure_ascii=False),
                              encoding="utf-8")
        assert _reabrir(ruta).editada_a_mano, (
            "cambiar un puesto por fuera de la herramienta tiene que delatarse")


def test_la_firma_no_cambia_por_los_derivados_pero_si_por_lo_escrito():
    with tempfile.TemporaryDirectory() as tmp:
        ruta = _corrida_con_un_contacto(tmp)
        c = _reabrir(ruta)
        antes = c.firma()
        c.contactos[0].hits = 99
        c.contactos[0].modulo_origen = "M7"
        assert c.firma() == antes, "los derivados no mueven la firma"
        c.contactos[0].motivo_revision = "falta confirmar la planta"
        assert c.firma() != antes, "lo que se escribe si la mueve"
