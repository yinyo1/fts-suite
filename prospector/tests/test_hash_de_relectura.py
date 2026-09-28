"""La verificacion de la entrega tiene que decir DE DONDE salio el hash.

El conector de Graph no devuelve `file.hashes` (medido). La unica forma de
verificar CONTENIDO con ese conector es leer el archivo de vuelta y hashearlo
aqui. Eso verifica el ida y vuelta -- caza el salto de linea de mas de #306 --
pero no es lo mismo que un hash calculado por el servicio, y la corrida no
puede registrar lo segundo cuando lo que hubo fue lo primero.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flujo.estado import Corrida


def _corrida_con_ficha(tmp):
    ruta = os.path.join(tmp, "ficha.html")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("<html>lo que se subio</html>")
    c = Corrida(empresa="X", ciudad="Y")
    c.fichas_emitidas.append(ruta)
    return c, ruta


def test_hash_del_conector_sigue_diciendo_identico():
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida_con_ficha(tmp)
        h = c.huella(ruta)["sha256"]
        e = c.registrar_entrega("onedrive", "https://x/y", ruta, sha256_subido=h)
        assert e["verificacion"] == "identico"
        assert e["hash_de_relectura"] is False


def test_hash_de_relectura_no_se_hace_pasar_por_hash_del_servicio():
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida_con_ficha(tmp)
        h = c.huella(ruta)["sha256"]
        e = c.registrar_entrega("onedrive", "https://x/y", ruta,
                                sha256_subido=h, hash_de_relectura=True)
        assert e["verificacion"] == "identico_por_relectura"
        assert e["hash_de_relectura"] is True


def test_la_relectura_declara_su_salvedad_en_los_avisos():
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida_con_ficha(tmp)
        h = c.huella(ruta)["sha256"]
        e = c.registrar_entrega("onedrive", "https://x/y", ruta,
                                sha256_subido=h, hash_de_relectura=True)
        texto = " ".join(e["avisos_de_verificacion"])
        # Tiene que decir las dos cosas: que SI coincide byte por byte, y que la
        # relectura pasa por el mismo conector. Un aviso que solo diga lo
        # primero vende la verificacion como mas fuerte de lo que es.
        assert "byte por byte" in texto
        assert "mismo conector" in texto
        assert "file.hashes" in texto


def test_un_hash_de_relectura_que_no_casa_sigue_siendo_DIFIERE():
    # La procedencia no suaviza un desacuerdo: si no casa, no casa.
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida_con_ficha(tmp)
        e = c.registrar_entrega("onedrive", "https://x/y", ruta,
                                sha256_subido="0" * 64, hash_de_relectura=True)
        assert e["verificacion"] == "DIFIERE"


def test_el_veredicto_nuevo_tiene_rotulo_en_el_orquestador():
    # Un veredicto sin rotulo se imprime crudo y el operador lee un identificador
    # interno en lugar de una frase. Ya paso con los estados de modulo (#323).
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "flujo", "orquestador.py")
    with open(ruta, encoding="utf-8") as f:
        fuente = f.read()
    assert '"identico_por_relectura":' in fuente
