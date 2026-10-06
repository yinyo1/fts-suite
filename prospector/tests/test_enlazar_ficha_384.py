"""La tarjeta del piloto lleva la ficha enlazada, y el dato NO se teclea.

La liga, la fecha, el tamano y el sha256 salen de `corrida.entrega`, que es lo que
`entregar` escribio cuando la ficha se subio de verdad. Si la liga se pudiera
declarar a mano, una tarjeta podria apuntar a una ficha que nunca se subio.
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

import enlazar_ficha as ef                                          # noqa: E402
import cargar_del_radar as cdr                                      # noqa: E402
from flujo.estado import Corrida                                    # noqa: E402


def _corrida(tmp_path, empresa, ciudad, con_entrega=True):
    """Una corrida en disco, con o sin entrega, en el plano de carpeta por planta."""
    d = tmp_path / empresa.lower().replace(" ", "-")
    d.mkdir(parents=True, exist_ok=True)
    ruta = str(d / (ciudad.lower().replace(" ", "-") + ".json"))
    c = Corrida(empresa=empresa, ciudad=ciudad)
    archivo = str(tmp_path / f"{empresa}-ficha.html")
    with open(archivo, "w", encoding="utf-8") as f:
        f.write("<html>la ficha</html>")
    if con_entrega:
        c.registrar_entrega("onedrive", f"https://ejemplo/{empresa}.html",
                            archivo=archivo)
    c.guardar(ruta)
    return ruta


def test_la_entrega_de_la_corrida_ES_lo_que_se_enlaza(tmp_path):
    _corrida(tmp_path, "Daikin", "San Luis Potosi")
    f = ef.entregas_de_las_corridas(str(tmp_path))
    assert len(f) == 1
    assert f[0]["enlazable"]
    assert f[0]["ficha_url"] == "https://ejemplo/Daikin.html"
    assert f[0]["ficha_bytes"] == len("<html>la ficha</html>")
    assert len(f[0]["ficha_sha256"]) == 64


def test_una_corrida_SIN_entrega_sale_con_su_razon_no_desaparece(tmp_path):
    _corrida(tmp_path, "NIFCO", "Chihuahua", con_entrega=False)
    f = ef.entregas_de_las_corridas(str(tmp_path))
    assert len(f) == 1 and not f[0]["enlazable"]
    assert "no tiene entrega registrada" in f[0]["por_que"]


def test_una_corrida_QUE_YA_NO_CARGA_sale_con_su_razon(tmp_path):
    """Lo encontro una corrida real: una fila que una compuerta mas estricta ya
    no acepta deja el archivo sin poder abrirse, y su tarjeta sin ficha."""
    d = tmp_path / "vieja"
    d.mkdir()
    (d / "planta.json").write_text('{"empresa": "X", "modulos": {"M0c": '
                                   '{"registros": [{"modulo": "M0c", "fuente": '
                                   '"outlook_personas", "consulta": "q", '
                                   '"resultados": 0}]}}}', encoding="utf-8")
    f = ef.entregas_de_las_corridas(str(tmp_path))
    assert len(f) == 1 and not f[0]["enlazable"]
    assert "ya no carga" in f[0]["por_que"]


def test_la_entrega_QUE_QUEDO_ATRAS_se_enlaza_IGUAL_y_queda_dicho(tmp_path):
    """Esconder la liga no ayuda: la tarjeta tiene que poder decir «esta liga ya
    no es la ficha de hoy», que es distinto de no tener liga."""
    ruta = _corrida(tmp_path, "Dormakaba", "Nogales")
    c = ef._cargar_de(ruta)
    with open(c.entrega["archivo"], "w", encoding="utf-8") as f:
        f.write("<html>la ficha, cambiada</html>")
    f = ef.entregas_de_las_corridas(str(tmp_path))
    assert f[0]["enlazable"] and f[0]["quedo_atras"] is True


def test_las_salidas_NO_son_corridas(tmp_path):
    d = tmp_path / "daikin"
    d.mkdir()
    for n in ("slp-procedencia.json", "slp-paquete.json"):
        (d / n).write_text("{}", encoding="utf-8")
    assert ef.rutas_de_las_corridas(str(tmp_path)) == []


# ------------------------------------------------- QSMX fuera del piloto (#384)

def test_la_desmentida_se_ESCRIBE_en_el_piloto_no_solo_se_omite():
    f = cdr.filas_de_fuera()
    assert [x["empresa"] for x in f] == ["QSMX"]
    q = f[0]
    assert q["estado"] == "posible_aliado"
    assert q["puntaje_del_radar"] == 93.1
    assert q["razon"].strip() and q["por_que_el_radar_erro"].strip()
    assert q["decidido_el"] == "2026-10-06"


def test_la_que_esta_fuera_NO_esta_entre_las_del_radar():
    """Las dos caras de la misma decision: ni tarjeta, y si constancia."""
    delradar = {e["senal"]["empresa"] for e in cdr.las_del_radar()}
    fuera = {x["empresa"] for x in cdr.filas_de_fuera()}
    assert fuera and not (delradar & fuera)


def test_el_estado_de_la_desmentida_es_UNO_DE_LOS_DECLARADOS():
    """El CHECK del esquema solo acepta tres. Un estado nuevo en el archivo sin
    el estado nuevo en el esquema haria fallar la carga en vez del archivo."""
    with open(os.path.join(RAIZ, "datos", "no-son-prospectos.json"),
              encoding="utf-8") as fh:
        declarados = set(json.load(fh)["estados"])
    with open(os.path.join(RAIZ, "datos", "esquema-motor3.sql"),
              encoding="utf-8") as fh:
        sql = fh.read()
    for e in declarados:
        assert f"'{e}'" in sql, f"'{e}' esta en el archivo y no en el CHECK"
    for x in cdr.filas_de_fuera():
        assert x["estado"] in declarados
