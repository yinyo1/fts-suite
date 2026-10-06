"""Un aviso que describe un ESTADO se REEMPLAZA, y uno que envejece lo declara (#384).

LOS DOS DEFECTOS, encontrados leyendo la ficha de Daikin antes de entregarla --
que es como se han encontrado casi todos--:

  1. `senal --reevaluar` corrido dos veces dejaba el MISMO aviso dos veces en la
     ficha. No es cosmetico: la lista de avisos es lo que el operador revisa, y
     una lista con repetidos se lee peor. Es la tercera vez que aparece la misma
     familia de defecto -- MARCA_PADRON en #306, MARCA_ANGULO en #330-- y por eso
     aqui se fija para los dos restantes.

  2. La corrida se entrego, despues se le corrigio el giro, la ficha se volvio a
     emitir, y la ficha NUEVA seguia imprimiendo «local 31,436 contra 31,436
     subidos. Coinciden» sobre un archivo que ya pesaba 31,951. La afirmacion no
     estaba vieja: estaba FALSA, y era justo la afirmacion de verificacion.

El segundo es el grave. La vendedora abre la liga, lee OTRA ficha, y llama con lo
que la pantalla le dijo.
"""
import json
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from flujo.confianza import Contacto                                 # noqa: E402
from flujo.estado import Corrida, MARCA_ENTREGA                      # noqa: E402
from flujo.ficha import aviso_rojo                                   # noqa: E402


def _corrida(tmp):
    c = Corrida(empresa="Acme", ciudad="Monterrey", giro="autopartes")
    c.registrar_busqueda("M5", "bloques_secos", 'site:mx.linkedin.com/in Acme',
                         "linkedin_publico", 1,
                         contactos=[Contacto(nombre="Fulano De Tal",
                                             puesto="gerente de mantenimiento",
                                             empresa="Acme",
                                             cercania_decision=10)])
    ruta = Path(tmp) / "ficha.html"
    ruta.write_text("<html>la primera version</html>", encoding="utf-8")
    return c, str(ruta)


def test_dos_entregas_dejan_UN_juego_de_avisos_no_dos():
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida(tmp)
        c.registrar_entrega("onedrive", "https://x/1", archivo=ruta)
        n1 = len([a for a in c.avisos if a.startswith(MARCA_ENTREGA)])
        assert n1 >= 1, "una entrega sin sha deja al menos un aviso"
        c.registrar_entrega("onedrive", "https://x/2", archivo=ruta)
        n2 = len([a for a in c.avisos if a.startswith(MARCA_ENTREGA)])
        assert n2 == n1, (
            f"la segunda entrega acumulo avisos ({n1} -> {n2}): los de la primera "
            "hablan de un archivo que ya no esta en el destino")


def test_la_entrega_queda_atras_cuando_el_archivo_cambia():
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida(tmp)
        c.registrar_entrega("onedrive", "https://x/1", archivo=ruta)
        assert c.entrega_quedo_atras() is None, (
            "recien entregada, el archivo y la copia son el mismo")

        Path(ruta).write_text("<html>la segunda version, mas larga</html>",
                             encoding="utf-8")
        atras = c.entrega_quedo_atras()
        assert atras, "el archivo cambio y la entrega no se renovo"
        assert atras["sha256_entregado"] != atras["sha256_de_ahora"]
        assert atras["bytes_entregados"] != atras["bytes_de_ahora"]
        assert "no es esta ficha" in atras["por_que_importa"].lower() or \
               "no es esta" in atras["por_que_importa"].lower()


def test_el_tamano_igual_NO_basta_para_decir_que_es_la_misma():
    """La leccion de #306: dos archivos del mismo tamano pueden diferir."""
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida(tmp)
        c.registrar_entrega("onedrive", "https://x/1", archivo=ruta)
        viejo = Path(ruta).read_text(encoding="utf-8")
        # un byte cambiado en medio, MISMO largo
        nuevo = viejo.replace("primera", "primerA")
        assert len(nuevo) == len(viejo)
        Path(ruta).write_text(nuevo, encoding="utf-8")
        atras = c.entrega_quedo_atras()
        assert atras, "el tamano no cambio y el contenido si: tiene que detectarse"
        assert atras["bytes_entregados"] == atras["bytes_de_ahora"], (
            "este es justo el caso que el tamano NO distingue")


def test_la_ficha_lo_dice_en_el_aviso_ROJO_no_en_el_tecnico():
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida(tmp)
        c.registrar_entrega("onedrive", "https://x/1", archivo=ruta)
        assert "COPIA ENTREGADA" not in aviso_rojo(c)
        Path(ruta).write_text("<html>otra cosa completamente distinta</html>",
                             encoding="utf-8")
        rojo = aviso_rojo(c)
        assert "LA COPIA ENTREGADA NO ES ESTA FICHA" in rojo
        assert "volver a subirla" in rojo, (
            "un aviso sin que-hacer es un aviso que no se obedece")


def test_sin_entrega_registrada_no_hay_nada_que_declarar():
    with tempfile.TemporaryDirectory() as tmp:
        c, _ruta = _corrida(tmp)
        assert c.entrega_quedo_atras() is None
        assert "COPIA ENTREGADA" not in aviso_rojo(c)


def test_la_ficha_NO_contiene_su_propia_medida():
    """EL DEFECTO MAS SUTIL DE LOS TRES, y el que costo mas en encontrar.

    El aviso de entrega compara el tamano de la ficha contra el de la copia
    subida. Mientras ese aviso se imprimia DENTRO de la ficha, el documento
    contenia su propia medida y no podia converger: registrar una entrega
    cambiaba la ficha, volver a emitirla cambiaba el aviso, y la cifra impresa
    siempre describia la version anterior. Medido en vivo: tres emisiones
    seguidas de la misma corrida dieron tres sha distintos.

    La comparacion no se pierde -- sigue en la consola de `entregar` y en
    `corrida.entrega` con su fecha-- y lo que el LECTOR necesita sale en el
    aviso rojo, que solo aparece cuando de verdad difieren.
    """
    import re
    from flujo.estado import MARCA_ENTREGA as ME
    from flujo.ficha import modo_limpio

    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida(tmp)
        c.challenge_corrido = True
        c.registrar_entrega("onedrive", "https://x/1", archivo=ruta)
        assert any(a.startswith(ME) for a in c.avisos), (
            "el aviso de entrega SI tiene que quedar en el registro")

        doc = modo_limpio(c)
        bloque = re.search(r"Avisos de la corrida</h3>(.*?)</ul>", doc, re.S)
        cuerpo = bloque.group(1) if bloque else ""
        assert "[entrega]" not in cuerpo, (
            "el aviso de entrega no entra al documento: ahi la ficha estaria "
            "afirmando su propio tamano, y ese numero cambia al emitirla")


def test_el_aviso_de_entrega_va_FECHADO_en_el_registro():
    """Fechado es historia; sin fecha era una afirmacion que se volvia falsa."""
    with tempfile.TemporaryDirectory() as tmp:
        c, ruta = _corrida(tmp)
        c.registrar_entrega("onedrive", "https://x/1", archivo=ruta)
        de_entrega = [a for a in c.avisos if a.startswith(MARCA_ENTREGA)]
        assert de_entrega
        for a in de_entrega:
            assert "entrega del " in a, a
            assert c.entrega["ts"][:10] in a, (
                "la fecha del aviso es la de SU entrega, no otra")
