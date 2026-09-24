"""Las tres correcciones que dejo la primera corrida real de un OPERADOR
(Coficab, #268). No salieron de una prueba de escritorio ni de una corrida mia:
salieron de alguien usando la herramienta para trabajar.
"""
from __future__ import annotations
import re
import pytest

from flujo import orquestador as orq
from flujo.compuertas import CompuertaCerrada, TAMANO_BLOQUE
from flujo.confianza import Contacto, N3_PUESTO
from flujo.estado import Corrida
from flujo.ficha import (modo_limpio, modo_procedencia_html, fecha_de,
                         busquedas_sales_navigator)


def _con_busquedas(c: Corrida, n: int, liga: str = "") -> Corrida:
    for i in range(n):
        c.registrar_busqueda("M5", "bloques_secos",
                             f"consulta real numero {i} sobre la casa",
                             "buscador", 1, liga=liga)
    return c


# ============================================== 1 · la ficha es un ARCHIVO .html
def test_la_ficha_limpia_es_un_documento_AUTOCONTENIDO():
    """El defecto exacto: el archivo existia con extension .html pero era un
    FRAGMENTO -- sin doctype, sin <html> y sin <meta charset>--. Sin charset
    declarado los acentos se rompen en cuanto sale del navegador que lo genero:
    adjunto de correo, lognote de Odoo, vista previa.
    """
    c = Corrida(empresa="Casa", ciudad="Pesqueria, NL", giro="cables")
    html_txt = modo_limpio(c)
    assert html_txt.lstrip().startswith("<!doctype html>")
    assert '<html lang="es">' in html_txt
    assert '<meta charset="utf-8">' in html_txt
    assert html_txt.rstrip().endswith("</html>")


def test_la_ficha_trae_TODAS_las_secciones_que_el_operador_necesita():
    c = Corrida(empresa="Casa", ciudad="Pesqueria, NL", giro="cables")
    secciones = re.findall(r"<h2>([^<]*)</h2>", modo_limpio(c))
    for pedida in ("Gancho", "Senal caliente", "Por que ahora", "A quien buscar",
                   "Como hablarles", "Busquedas para Sales Navigator", "Fuentes",
                   "Checklist de validaciones"):
        assert any(pedida in s for s in secciones), f"falta la seccion {pedida}"


def test_los_textos_de_criterio_que_faltan_salen_como_HUECO_DECLARADO():
    """Gancho, por que ahora y como hablarles son CRITERIO: el codigo no puede
    derivarlos. Cuando faltan, la ficha lo dice y nombra el comando que los
    llena -- una ficha que parece completa y no lo esta es peor que una con
    avisos--."""
    c = Corrida(empresa="Casa", ciudad="Pesqueria, NL")
    txt = modo_limpio(c)
    assert txt.count('class="hueco"') == 3
    assert "registrar --datos" in txt


def test_los_textos_de_criterio_se_imprimen_cuando_estan():
    c = Corrida(empresa="Casa", ciudad="Pesqueria, NL")
    c.gancho = "Arranco la segunda linea y mantenimiento esta corto de gente."
    c.por_que_ahora = "Siete vacantes abiertas antes del contrato anual."
    c.como_hablarles = ["MTBF y % de preventivo, no catalogo."]
    txt = modo_limpio(c)
    assert c.gancho in txt and c.por_que_ahora in txt
    assert c.como_hablarles[0] in txt
    assert 'class="hueco"' not in txt


def test_cada_senal_va_con_LA_FECHA_que_su_texto_trae():
    """La leccion mas cara de #295: un programa de inversion de 2022 que sin la
    fecha al lado se leia como noticia fresca."""
    assert fecha_de("inaugurada dic-2025, 60 MDD") == "dic-2025"
    assert fecha_de("boletin del 9-oct-2025") == "9-oct-2025"
    assert fecha_de("son de AGOSTO DE 2022") == "AGOSTO DE 2022"
    assert fecha_de("sin ninguna fecha") == ""

    c = Corrida(empresa="Casa", ciudad="MTY")
    c.senal = ["segunda planta inaugurada en mar-2025", "algo sin fecha"]
    txt = modo_limpio(c)
    assert 'class="fecha">mar-2025' in txt
    assert "sin fecha en el registro" in txt


def test_la_ficha_lista_las_fuentes_con_su_fecha_y_su_liga():
    c = _con_busquedas(Corrida(empresa="Casa", ciudad="MTY"), 3,
                       liga="https://example.com/fuente")
    txt = modo_limpio(c)
    assert txt.count('href="https://example.com/fuente"') == 3
    assert txt.count('<td class="q">') == 3


def test_una_busqueda_sin_liga_lo_dice_en_vez_de_dejar_el_hueco_en_blanco():
    c = _con_busquedas(Corrida(empresa="Casa", ciudad="MTY"), 1)
    assert "sin liga" in modo_limpio(c)


def test_la_fila_de_contacto_trae_nombre_puesto_planta_correo_y_confianza():
    c = Corrida(empresa="Casa", ciudad="MTY")
    x = Contacto(nombre="Ana Ficticia", puesto="Gerente de Mantenimiento",
                 empresa="Casa", cercania_decision=10)
    x.dato("planta").observar("linkedin_publico", "Pesqueria, NL")
    x.dato("correo").observar("congreso", "[persona]@example.com")
    c.agregar(x)
    fila = re.search(r'<tr><td class="lv">.*?</tr>', modo_limpio(c), re.S).group(0)
    for esperado in ("Ana Ficticia", "Gerente de Mantenimiento", "Pesqueria, NL",
                     "[persona]@example.com"):
        assert esperado in fila
    assert "SOL" in fila or "CONF" in fila


def test_un_contacto_en_revision_o_que_YA_NO_ESTA_no_se_imprime():
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.agregar(Contacto(nombre="Visible", puesto="Gerente", empresa="Casa",
                       cercania_decision=10))
    c.agregar(Contacto(nombre="Oculto", puesto="Gerente", empresa="Casa",
                       cercania_decision=10, revision_humana=True))
    c.agregar(Contacto(nombre="Ido", puesto="Gerente", empresa="Casa",
                       cercania_decision=10, sigue_en_la_casa=False))
    txt = modo_limpio(c)
    assert "Visible" in txt and "Oculto" not in txt and "Ido" not in txt
    assert "2 hallazgo(s) fuera de esta ficha" in txt


def test_las_busquedas_de_sales_navigator_se_DERIVAN_de_lo_encontrado():
    c = Corrida(empresa="Casa", ciudad="Pesqueria, NL")
    c.vocabulario = ["chiller", "torre de enfriamiento"]
    c.agregar(Contacto(nombre="Ana", puesto="Gerente de Mantenimiento",
                       empresa="Casa", cercania_decision=10))
    qs = busquedas_sales_navigator(c)
    assert any("Gerente de Mantenimiento" in q for q in qs)
    assert any("Pesqueria, NL" in q for q in qs)
    assert any("chiller" in q for q in qs)


def test_sin_nada_que_derivar_lo_dice_en_vez_de_inventar_una_busqueda():
    qs = busquedas_sales_navigator(Corrida(empresa="Casa", ciudad="MTY"))
    assert len(qs) == 1 and "no hay busqueda que derivar" in qs[0]


def test_el_modo_procedencia_tambien_es_un_html_autocontenido():
    c = Corrida(empresa="Casa", ciudad="MTY")
    x = Contacto(nombre="Ana", puesto="Gerente", empresa="Casa",
                 cercania_decision=10)
    x.dato("puesto").observar("linkedin_publico", "Gerente", nota="90%")
    c.agregar(x)
    txt = modo_procedencia_html(c)
    assert txt.lstrip().startswith("<!doctype html>")
    assert '<meta charset="utf-8">' in txt
    assert "Cada dato, con su procedencia" in txt
    assert "linkedin_publico" in txt and "web_perfil" in txt


def test_los_dos_modos_escriben_ARCHIVO_e_imprimen_su_ruta(tmp_path, capsys,
                                                           monkeypatch):
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.agregar(Contacto(nombre="Ana", puesto="Gerente", empresa="Casa",
                       cercania_decision=10))
    c.challenge_corrido = True
    c.guardar(orq._ruta("Casa"))

    assert orq.main(["ficha", "--empresa", "Casa", "--modo", "limpio"]) == 0
    limpio = tmp_path / "casa-limpio.html"
    assert limpio.exists()
    assert str(limpio) in capsys.readouterr().out

    assert orq.main(["ficha", "--empresa", "Casa", "--modo", "procedencia"]) == 0
    salida = capsys.readouterr().out
    for esperado in ("casa-procedencia.html", "casa-procedencia.json"):
        assert (tmp_path / esperado).exists()
        assert esperado in salida


def test_la_ficha_NUNCA_se_escribe_en_el_repo(tmp_path, monkeypatch):
    """La guardia de salida.py sigue vigente: es lo unico que la sostiene."""
    from flujo.salida import SalidaEnElRepo, raiz_del_repo
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    c = Corrida(empresa="Casa", ciudad="MTY")
    c.challenge_corrido = True
    c.guardar(orq._ruta("Casa"))
    repo = raiz_del_repo()
    assert repo is not None
    assert orq.main(["ficha", "--empresa", "Casa", "--modo", "limpio",
                     "--salida", str(repo / "ficha.html")]) == 2
    assert not (repo / "ficha.html").exists()


# ================================================ 2 · el aviso de bloque a las 10
def test_el_aviso_aparece_al_llegar_a_diez_y_no_antes():
    c = Corrida(empresa="Casa", ciudad="MTY")
    _con_busquedas(c, 7)
    assert c.aviso_de_bloque() == "", "un aviso que sale siempre no se lee"
    _con_busquedas(c, 2)                      # 9
    assert "Falta 1 para cerrarlo" in c.aviso_de_bloque()
    _con_busquedas(c, 1)                      # 10
    aviso = c.aviso_de_bloque()
    assert "CIERRA EL BLOQUE AHORA" in aviso
    assert "./prospector bloque" in aviso


def test_la_consulta_ONCE_no_se_registra_con_un_bloque_de_diez_abierto():
    """El caso de Coficab, atrapado cuando todavia tiene arreglo."""
    c = Corrida(empresa="Casa", ciudad="MTY")
    _con_busquedas(c, TAMANO_BLOQUE)
    with pytest.raises(CompuertaCerrada, match="sin bloque cerrado"):
        c.exigir_bloque_cerrado()


def test_tras_cerrar_el_bloque_se_puede_seguir():
    c = Corrida(empresa="Casa", ciudad="MTY")
    _con_busquedas(c, TAMANO_BLOQUE)
    c.cerrar_bloque()
    c.exigir_bloque_cerrado()                 # ya no lanza
    _con_busquedas(c, 1)
    assert c.bloque_pendiente()[0] == 1


def test_el_caso_DE_35_CONSULTAS_de_Coficab_ya_es_inalcanzable():
    """Antes: el operador llegaba a 35, `bloque` lo rechazaba -- el maximo es
    diez-- y el tramo no se podia cerrar ni partir sin editar el estado a mano.
    Consecuencia real: M5 cerrado como `fallo` y la vuelta del lazo imposible.

    Ahora el camino a 35 esta cortado en la consulta once, y el estado
    irrecuperable es inalcanzable por la via normal.
    """
    c = Corrida(empresa="Casa", ciudad="MTY")
    for i in range(TAMANO_BLOQUE):
        c.exigir_bloque_cerrado()
        c.registrar_busqueda("M5", "bloques_secos",
                             f"consulta real numero {i} sobre la casa",
                             "buscador", 1)
    with pytest.raises(CompuertaCerrada):
        c.exigir_bloque_cerrado()
    assert c.bloque_pendiente()[0] == TAMANO_BLOQUE, "nunca paso de diez"

    # Y si alguien llega a 35 por otra via, `bloque` sigue negandose: el arreglo
    # es la PREVENCION, no una puerta nueva para cerrar tramos gigantes.
    suelta = Corrida(empresa="Otra", ciudad="MTY")
    _con_busquedas(suelta, 35)
    with pytest.raises(CompuertaCerrada, match="maximo es"):
        suelta.cerrar_bloque()


def test_buscar_se_niega_desde_la_linea_de_comandos(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    c = Corrida(empresa="Casa", ciudad="MTY")
    _con_busquedas(c, TAMANO_BLOQUE)
    c.guardar(orq._ruta("Casa"))
    assert orq.main(["buscar", "--empresa", "Casa", "--modulo", "M5",
                     "--clave", "bloques_secos", "--fuente", "buscador",
                     "--consulta", "la consulta once que no debe pasar",
                     "--resultados", "1"]) == 2
    assert "sin bloque cerrado" in capsys.readouterr().err
    assert len(orq._cargar("Casa").busquedas()) == TAMANO_BLOQUE
