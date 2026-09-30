"""El tablero del viernes (#365): que diga la verdad cuando no hay nada.

Lo que se fija aqui no es el formato -- eso cambia--, son cuatro cosas que si se
rompen hacen que el tablero MIENTA:

  1. no pinta ceros cuando no hay base. Un tablero de ceros se lee igual que una
     semana sin trabajo, y es la forma mas facil de creer que no paso nada.
  2. separa `vencida_sin_trabajar` de `cerrada`. Sumarlas esconde el unico numero
     que mide al equipo en vez de medir al radar.
  3. grita el toque sin destinatario. En la tabla de canales se ve igual que
     trabajo hecho; en #365 hubo uno de verdad.
  4. no imprime nombres de personas. Ninguna consulta los pide, y la prueba mira
     el SQL para que siga siendo cierto cuando alguien agregue una seccion.
"""
import sys
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "herramientas"))

import tablero                                                    # noqa: E402

VACIO = {"version": 1, "cierres_leidos": 0, "cierres_sin_expediente_de_senal": 0,
         "compuertas_que_abren": [],
         "lazos": [{"lazo": 1, "nombre": "al radar", "pregunta": "a quien tocar",
                    "compuertas": [{"celda": "escala_frescura", "n": 0,
                                    "minimo": 20, "faltan": 20,
                                    "veredicto": "sin_datos", "abre": False}]}]}


def _d(**kw):
    base = {"hoy": "2026-09-30", "hasta": "2026-10-04", "cuentas": 12,
            "tarjetas_por_estado": {"abierta": 6, "vencida_sin_trabajar": 6},
            "reabiertas_vencidas": 0, "toques": [], "toques_total": 0,
            "toques_pendientes": 0, "vencen": [], "huerfanos": 0,
            "contactos_con_nombre": 0, "senales_sin_fecha": 0,
            "abiertas_con_senal_sin_fecha": 0, "abiertas_sin_un_solo_toque": 0,
            "lazos": VACIO}
    base.update(kw)
    return base


# ------------------------------------------------ 1 · sin base, sin tablero
def test_sin_base_no_pinta_ceros(capsys, monkeypatch):
    from flujo.base_motor3 import SinPostgres

    def no_vive(self):
        return False
    monkeypatch.setattr(tablero.Base, "vive", no_vive)
    assert tablero.main(["--puerto", "1"]) == 2
    salida = capsys.readouterr().out
    assert "NO HAY BASE" in salida
    # y NO aparece ni una seccion del tablero: nada que se pueda leer como cero
    for seccion in ("TARJETAS POR ESTADO", "TOQUES POR CANAL"):
        assert seccion not in salida
    del SinPostgres


# ----------------------------------------- 2 · las vencidas no se suman a nada
def test_las_vencidas_sin_trabajar_van_en_su_propio_renglon():
    t = tablero.pintar(_d())
    assert "vencidas SIN TRABAJAR" in t
    # el renglon de cerradas existe aunque sea cero: que diga 0 es informacion
    assert "cerradas" in t
    ren = [l for l in t.splitlines() if "vencidas SIN TRABAJAR" in l][0]
    assert ren.strip().startswith("6")


def test_una_base_sin_tarjetas_lo_dice():
    t = tablero.pintar(_d(tarjetas_por_estado={}))
    assert "no esta cargado" in t


# ------------------------------------------------- 3 · el toque huerfano grita
def test_el_toque_sin_destinatario_sale_en_anomalias():
    t = tablero.pintar(_d(huerfanos=2, toques_total=2))
    assert "SIN destinatario" in t
    assert "2 toque(s)" in t


def test_sin_anomalias_lo_dice_en_una_linea():
    assert "nada. La base esta limpia." in tablero.pintar(_d())


def test_un_contacto_con_nombre_es_una_anomalia():
    # La hoja de toques nunca pone nombres. Si hay uno, entro por otra via y eso
    # es exactamente lo que hay que saber.
    assert "CON nombre" in tablero.pintar(_d(contactos_con_nombre=1))


def test_una_abierta_con_senal_sin_fecha_se_avisa():
    t = tablero.pintar(_d(senales_sin_fecha=5, abiertas_con_senal_sin_fecha=5))
    assert "SIN FECHA" in t
    assert "mas" in t and "frescas" in t


# --------------------------------------------------- 4 · nadie por su nombre
def test_ninguna_consulta_pide_el_nombre_de_nadie():
    fuente = (RAIZ / "herramientas" / "tablero.py").read_text(encoding="utf-8")
    sql = fuente[fuente.index("def leer("):fuente.index("def _matriz(")]
    # `nombre IS NOT NULL` si se permite: es un CONTEO, no el dato.
    assert "contacto.nombre" not in sql
    for prohibido in ("c.nombre,", "ct.nombre,", "correo", "telefono"):
        assert prohibido not in sql, (
            f"la consulta del tablero pide «{prohibido}»: el tablero se lee en "
            "pantalla compartida y no lleva datos de personas")


def test_el_pie_dice_que_no_escribe():
    t = tablero.pintar(_d())
    assert "Escrituras a Odoo: 0" in t
    assert "solo lee" in t


# ------------------------------------------------------- la semana, bien contada
def test_la_semana_termina_en_domingo():
    # 2026-09-30 es miercoles; la semana cierra el domingo 4-oct.
    assert tablero._fin_de_semana(date(2026, 9, 30)) == date(2026, 10, 4)
    # un lunes cierra seis dias despues, y un domingo cierra el mismo dia
    assert tablero._fin_de_semana(date(2026, 9, 28)) == date(2026, 10, 4)
    assert tablero._fin_de_semana(date(2026, 10, 4)) == date(2026, 10, 4)


def test_la_matriz_solo_trae_lo_que_tiene_algo():
    cs, rs, m = tablero._matriz([
        {"canal": "linkedin", "resultado": "sin_respuesta", "n": 3},
        {"canal": "conmutador", "resultado": "reunion_agendada", "n": 1}])
    assert cs == ["linkedin", "conmutador"]          # en orden de la constante
    assert "evento" not in cs                         # sin filas vacias
    assert rs == ["sin_respuesta", "reunion_agendada"]
    assert m[("linkedin", "sin_respuesta")] == 3


def test_la_reunion_se_ve_distinta_del_respondio():
    t = tablero.pintar(_d(
        toques=[{"canal": "conmutador", "resultado": "reunion_agendada", "n": 1}],
        toques_total=1))
    # REUNION en mayusculas: es el mejor desenlace del piloto y no se confunde
    # con «respondio» de un vistazo.
    assert "REUNION" in t
