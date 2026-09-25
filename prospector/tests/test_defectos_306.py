"""Los cinco defectos y la compuerta rodeada de la corrida de Coficab Pesqueria
(#306).

D3 la ficha limpia escondia a los de revision -- el serio-- · D1 el aviso del
padron se acumulaba · D2 el sufijo de empresa en el puesto se leia como conflicto
· D4 el alias de ubicacion por cuenta · la compuerta de busquedas duplicadas ·
D5 la contabilidad de bloques (REPRODUCIDO) · y la verificacion de la subida por
CONTENIDO y no por tamano.

Las pruebas de MODO DE FALLA van marcadas: fijan lo que cada arreglo NO debe
hacer. Sin datos personales: todos los nombres son inventados.
"""
from __future__ import annotations
import hashlib
import pytest

from flujo import ficha as fichamod
from flujo import orquestador as orq
from flujo.compuertas import CompuertaCerrada
from flujo.confianza import (Contacto, sin_sufijo_de_empresa, SOLIDO,
                             EN_CONFLICTO, EN_ESTA_PLANTA, EN_OTRA_PLANTA)
from flujo.estado import Corrida, MARCA_PADRON, MARCA_ENTREGA


@pytest.fixture
def sesion(tmp_path, monkeypatch):
    monkeypatch.setenv("PROSPECTOR_SALIDA", str(tmp_path))
    monkeypatch.setattr(orq, "CORRIDAS", lambda: str(tmp_path))
    return tmp_path


def _corrida(empresa="Coficab", ciudad="Pesqueria") -> Corrida:
    return Corrida(empresa=empresa, ciudad=ciudad, giro="cables")


# ===================== DEFECTO 3 · la ficha limpia no esconde a los pendientes
def test_el_contacto_en_revision_SALE_en_limpio_con_su_razon():
    """El defecto serio. En Pesqueria la ficha limpia salio con cero personas de
    valor con nombre mientras las dos puertas mas probables estaban en revision:
    solo aparecian en la version de procedencia, que no es la que se manda."""
    c = _corrida()
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab", cercania_decision=12,
                           revision_humana=True,
                           motivo_revision="el puesto viene de un directorio "
                                           "de 2023"))
    x.dato("planta").observar("buscador", "Coficab Pesqueria")
    html = fichamod.modo_limpio(c)
    assert "Por confirmar" in html
    assert "Ana Ficticia" in html
    assert "Gerente de EHS" in html
    assert "directorio de 2023" in html


def test_la_razon_de_la_revision_va_EN_LA_MISMA_FILA_que_la_persona():
    """Un pendiente sin razon visible es un hueco con nombre: el operador no
    sabe que llamada hacer para cerrarlo."""
    c = _corrida()
    c.agregar(Contacto(nombre="Beto Ficticio", puesto="Comprador",
                       empresa="Coficab", revision_humana=True,
                       motivo_revision="falta confirmar que sigue en la planta"))
    html = fichamod.modo_limpio(c)
    fila = html[html.index("Beto Ficticio"):]
    fila = fila[:fila.index("</tr>")]
    assert "falta confirmar que sigue en la planta" in fila


def test_MODO_DE_FALLA_la_procedencia_tecnica_SIGUE_oculta_en_limpio():
    """Lo que el modo limpio oculta es de donde salio el dato, no la persona. Si
    este arreglo hubiera abierto la procedencia, la ficha que se manda a un
    cliente llevaria las consultas internas de FTS."""
    c = _corrida()
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab", revision_humana=True,
                           motivo_revision="por confirmar"))
    x.dato("puesto").observar("outlook_personas", "Gerente de EHS",
                              forma="firma de correo")
    html = fichamod.modo_limpio(c)
    assert "Ana Ficticia" in html
    assert "outlook_personas" not in html
    assert "firma de correo" not in html


def test_MODO_DE_FALLA_el_que_YA_NO_ESTA_no_aparece_en_por_confirmar():
    """Al que se fue de la empresa no le falta una comprobacion: ya no es una
    puerta. Ese hueco si es correcto."""
    c = _corrida()
    c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                       empresa="Coficab", revision_humana=True,
                       motivo_revision="por confirmar", sigue_en_la_casa=False))
    html = fichamod.modo_limpio(c)
    assert "Ana Ficticia" not in html
    assert "Por confirmar" not in html


# ============================ DEFECTO 1 · el veredicto del padron se REEMPLAZA
def test_el_veredicto_del_padron_borra_al_anterior():
    """La ficha de Pesqueria llevaba los dos veredictos: el de 'no aparece en el
    padron' de la primera consulta y el de 'aparece' de la segunda. Dos
    conclusiones que se contradicen en la misma hoja."""
    c = _corrida()
    c.registrar_veredicto_del_padron(["no aparece en el padron de Nuevo Leon"])
    c.registrar_veredicto_del_padron(["aparece en el padron: planta en Pesqueria"])
    padron = [a for a in c.avisos if a.startswith(MARCA_PADRON)]
    assert not any("no aparece" in a for a in padron)
    assert any("aparece en el padron: planta" in a for a in padron)


def test_el_reemplazo_queda_DICHO_no_callado():
    """Reemplazar en silencio es tan malo como acumular: el que lee la ficha no
    sabe que hubo una conclusion anterior."""
    c = _corrida()
    c.registrar_veredicto_del_padron(["no aparece"])
    c.registrar_veredicto_del_padron(["aparece"])
    assert any("reemplazo a 1 anterior" in a for a in c.avisos)


def test_MODO_DE_FALLA_el_veredicto_no_se_lleva_los_OTROS_avisos():
    """Solo manda el ultimo veredicto DEL PADRON. Los avisos de las compuertas,
    de la entrega y del angulo no tienen nada que ver y se quedan."""
    c = _corrida()
    c.avisos.append("el bloque 3 salio seco")
    c.registrar_veredicto_del_padron(["no aparece"])
    c.registrar_veredicto_del_padron(["aparece"])
    assert "el bloque 3 salio seco" in c.avisos


# ======================== DEFECTO 2 · el sufijo de empresa fuera del puesto
@pytest.mark.parametrize("valor,limpio", [
    ("Senior Buyer en COFICAB Group", "Senior Buyer"),
    ("Senior Buyer at Coficab", "Senior Buyer"),
    ("Gerente de Compras - Coficab", "Gerente de Compras"),
    ("COFICAB — Gerente de Planta", "Gerente de Planta"),
    ("Senior Buyer Coficab", "Senior Buyer"),
])
def test_quitar_el_sufijo_de_empresa_del_puesto(valor, limpio):
    assert sin_sufijo_de_empresa(valor, "Coficab") == limpio


def test_MODO_DE_FALLA_no_se_lleva_la_CIUDAD_pegada_al_corporativo():
    """"COFICAB LEON" nombra una planta, no solo la empresa: si el arreglo se
    comiera la cabeza completa, "Gerente de Planta COFICAB LEON, Silao Gto"
    quedaria reducido a "Silao Gto" y el puesto desapareceria."""
    v = sin_sufijo_de_empresa("Gerente de Planta COFICAB LEON, Silao Gto",
                              "Coficab")
    assert v.startswith("Gerente de Planta")


def test_dos_fuentes_con_la_empresa_pegada_NO_son_conflicto():
    """Caso 1 de los dos que pidio #306: misma cadena salvo la empresa."""
    x = Contacto(nombre="Beto Ficticio", puesto="Senior Buyer",
                 empresa="Coficab")
    d = x.dato("puesto")
    d.observar("linkedin", "Senior Buyer en COFICAB Group")
    d.observar("web", "Senior Buyer at Coficab")
    assert not d.choca
    assert d.nivel == SOLIDO
    assert d.valor == "Senior Buyer at Coficab"
    assert "empresa pegada" in d.salvedad_por_sufijo


def test_con_el_sufijo_fuera_la_tabla_ES_EN_ya_alcanza():
    """Caso 2: quitada la empresa, lo que queda son dos idiomas del mismo puesto,
    y eso ya lo resuelve la tabla de equivalencias de #302. Antes el sufijo
    estorbaba ANTES de llegar a la tabla, y el par se declaraba en conflicto."""
    x = Contacto(nombre="Cami Ficticia", puesto="Gerente de Facilidades",
                 empresa="Coficab")
    d = x.dato("puesto")
    d.observar("odoo", "Gerente de Facilidades en Coficab")
    d.observar("web", "Facilities Manager - COFICAB Group")
    assert not d.choca
    assert d.nivel == SOLIDO


def test_MODO_DE_FALLA_dos_puestos_DISTINTOS_siguen_chocando():
    """Normalizar no puede volverse una manera de tapar desacuerdos reales."""
    x = Contacto(nombre="Dani Ficticio", puesto="Senior Buyer",
                 empresa="Coficab")
    d = x.dato("puesto")
    d.observar("linkedin", "Senior Buyer en Coficab")
    d.observar("web", "Gerente de Mantenimiento at Coficab")
    assert d.choca
    assert d.nivel == EN_CONFLICTO


# ================================ DEFECTO 4 · alias de ubicacion por cuenta
def test_el_alias_declarado_mete_al_contacto_en_la_poblacion():
    """"COFICAB Monterrey" es la planta de Pesqueria: la cuenta la anuncia con el
    nombre del area metropolitana. Sin el alias, las dos puertas mas probables de
    Pesqueria quedaban excluidas como 'de otra planta'."""
    x = Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                 empresa="Coficab")
    x.dato("planta").observar("buscador", "COFICAB Monterrey")
    assert x.ubicacion_respecto_a("Pesqueria") == EN_OTRA_PLANTA
    assert x.ubicacion_respecto_a("Pesqueria", alias=["Monterrey"]) == EN_ESTA_PLANTA
    assert x.cuenta_en_la_poblacion_de("Pesqueria", alias=["Monterrey"])


def test_el_alias_queda_EN_EL_ESTADO_y_sobrevive_al_guardado(sesion):
    """Es criterio del operador, no algo que la herramienta pueda derivar, y por
    eso queda escrito en vez de aplicarse callado. Si no se restaurara al releer,
    la vuelta siguiente volveria a tirar a la gente que el alias rescato -- la
    misma familia de defecto que `modulo_origen` en #295--."""
    c = _corrida()
    c.declarar_alias_de_ubicacion("Monterrey")
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq._cargar("Coficab", "Pesqueria").alias_de_ubicacion == ["Monterrey"]


def test_el_operador_lo_declara_EN_UNA_LINEA_y_la_salida_dice_a_quien_rescato(
        sesion, capsys):
    """Una linea: `./prospector alias --empresa X --ciudad Y --es 'Monterrey'`."""
    c = _corrida()
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab", cercania_decision=12))
    x.dato("planta").observar("buscador", "COFICAB Monterrey")
    assert not x.cuenta_en_la_poblacion_de("Pesqueria")
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq.main(["alias", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--es", "Monterrey"]) == 0
    salida = capsys.readouterr().out
    assert "ALIAS DECLARADO" in salida
    assert "vuelven a la poblacion: 1" in salida
    c2 = orq._cargar("Coficab", "Pesqueria")
    assert "Ana Ficticia" in [y.nombre for y in c2.poblacion()]


def test_el_alias_se_IMPRIME_en_la_ficha_porque_es_criterio_no_evidencia():
    """Mover la frontera de una planta a mano y no decirlo deja una ficha que
    parece derivada cuando lleva un juicio dentro."""
    c = _corrida()
    x = c.agregar(Contacto(nombre="Ana Ficticia", puesto="Gerente de EHS",
                           empresa="Coficab", cercania_decision=12))
    x.dato("planta").observar("buscador", "COFICAB Monterrey")
    c.declarar_alias_de_ubicacion("Monterrey")
    html = fichamod.modo_limpio(c)
    assert "Alias de ubicacion declarado" in html
    assert "Monterrey" in html


def test_MODO_DE_FALLA_un_alias_de_dos_letras_se_rechaza():
    """El alias abre la puerta de la poblacion: uno flojo mete gente de otra
    planta en el Chao1 de esta, y Chao1 es lo que decide cuando parar."""
    c = _corrida()
    with pytest.raises(CompuertaCerrada) as e:
        c.declarar_alias_de_ubicacion("MX")
    assert "corto" in str(e.value)
    with pytest.raises(CompuertaCerrada):
        c.declarar_alias_de_ubicacion("   ")


def test_MODO_DE_FALLA_el_alias_no_abre_la_puerta_a_CUALQUIER_planta():
    """Declarar que Pesqueria tambien se llama Monterrey no puede volver local a
    alguien de Silao."""
    x = Contacto(nombre="Eva Ficticia", puesto="Comprador", empresa="Coficab")
    x.dato("planta").observar("buscador", "Coficab Silao, Gto")
    assert x.ubicacion_respecto_a("Pesqueria", alias=["Monterrey"]) == EN_OTRA_PLANTA


# ===================== COMPUERTA RODEADA · una consulta no se registra dos veces
def _busca(c, n, modulo="M5"):
    for i in range(n):
        c.registrar_busqueda(modulo, f"k{i}", f"consulta numero {i}",
                             "buscador", 1)


def test_la_misma_consulta_en_el_mismo_modulo_se_rechaza():
    c = _corrida()
    c.registrar_busqueda("M5", "k", "coficab pesqueria mantenimiento",
                         "buscador", 2)
    with pytest.raises(CompuertaCerrada) as e:
        c.registrar_busqueda("M5", "k", "coficab pesqueria mantenimiento",
                             "buscador", 2)
    assert "fila 1" in str(e.value)


def test_el_duplicado_se_reconoce_aunque_cambie_el_espaciado_o_la_caja():
    c = _corrida()
    c.registrar_busqueda("M5", "k", "Coficab Pesqueria EHS", "buscador", 1)
    with pytest.raises(CompuertaCerrada):
        c.registrar_busqueda("M5", "k", "  coficab   pesqueria   ehs  ",
                             "buscador", 1)


def test_MODO_DE_FALLA_la_misma_consulta_en_OTRO_modulo_si_pasa():
    """Dos modulos buscan cosas distintas con el mismo texto: el mismo nombre en
    Odoo y en la web son dos preguntas, y las dos se pagan."""
    c = _corrida()
    c.registrar_busqueda("M0", "k", "coficab pesqueria", "odoo", 1)
    c.registrar_busqueda("M5", "k", "coficab pesqueria", "buscador", 1)
    assert len(c.busquedas()) == 2


def test_buscar_CONFIRMA_en_la_ultima_linea_con_el_numero_de_fila(sesion, capsys):
    """La causa raiz de la compuerta rodeada no fue el agente: fue la salida. El
    agente recorto con `| tail -1`, vio una linea en blanco, creyo que la busqueda
    habia fallado y la repitio. Ahora la ULTIMA linea lo dice."""
    c = _corrida()
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq.main(["buscar", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--modulo", "M5", "--clave", "k",
                     "--consulta", "coficab pesqueria ehs",
                     "--fuente", "buscador", "--resultados", "3"]) == 0
    ultima = [l for l in capsys.readouterr().out.splitlines() if l.strip()][-1]
    assert "REGISTRADA" in ultima
    assert "fila 1" in ultima
    assert "M5" in ultima


# ============================ DEFECTO 5 · la contabilidad de bloques, REPRODUCIDO
def test_REPRODUCIDO_nueve_de_red_mas_una_local_dan_registro_de_diez():
    """El caso exacto: `bloque` se nego con "bloque de 9" y en la misma secuencia
    los `buscar` se negaron por "10 sin cerrar". Las dos cifras eran correctas
    -- el bloque mide gasto de red, el registro muestra todas las filas-- y
    ninguno de los dos mensajes lo decia."""
    c = _corrida()
    _busca(c, 9)
    c.registrar_busqueda("M4", "k9", "combinacion local", "patron_derivado", 1)
    assert len(c.busquedas()) == 10
    assert c.bloque_pendiente()[0] == 9
    assert c.filas_sin_red_en_el_bloque() == 1


def test_las_DOS_cifras_se_explican_en_las_dos_negativas():
    """El arreglo no es aritmetico -- las dos cifras eran correctas-- : es decir
    por que difieren, en los dos lugares donde el operador las ve. La secuencia
    reproduce el orden exacto en que las vio en Pesqueria."""
    c = _corrida()
    _busca(c, 9)
    c.registrar_busqueda("M4", "k9", "combinacion local", "patron_derivado", 1)
    # primero vio `bloque` negarse con "bloque de 9" mientras el registro decia 10
    with pytest.raises(CompuertaCerrada) as e:
        c.cerrar_bloque()
    assert "OJO CON LAS DOS CIFRAS" in str(e.value)
    assert "no gastan red" in str(e.value).replace("NO", "no")
    # una mas de red y el bloque llega a diez: ahora la que se niega es `buscar`,
    # con "10 sin cerrar" mientras el registro va en 11
    c.registrar_busqueda("M5", "k9r", "una mas de red", "buscador", 1)
    assert len(c.busquedas()) == 11 and c.bloque_pendiente()[0] == 10
    with pytest.raises(CompuertaCerrada) as e2:
        c.exigir_bloque_cerrado()          # lo que `buscar` corre antes de registrar
    assert "OJO CON LAS DOS CIFRAS" in str(e2.value)
    assert "11 filas" in str(e2.value)


def test_MODO_DE_FALLA_sin_filas_locales_las_dos_cifras_son_iguales():
    """Cuando todo el bloque es de red no hay nada que explicar, y el aviso no
    debe inventar una diferencia."""
    c = _corrida()
    _busca(c, 9)
    assert c.filas_sin_red_en_el_bloque() == 0


# =============== LA SUBIDA · se verifica el CONTENIDO, no el tamano
def _ficha_en_disco(sesion, texto=b"<html>ficha</html>") -> tuple:
    p = sesion / "ficha.html"
    p.write_bytes(texto)
    return str(p), hashlib.sha256(texto).hexdigest()


def test_la_entrega_con_el_hash_correcto_queda_VERIFICADA(sesion):
    c = _corrida()
    ruta, sha = _ficha_en_disco(sesion)
    c.fichas_emitidas.append(ruta)
    e = c.registrar_entrega("onedrive", "https://ejemplo/f.html",
                            sha256_subido=sha)
    assert e["verificacion"] == "identico"
    assert not e["avisos_de_verificacion"]


def test_UN_BYTE_DE_MAS_se_detecta_por_hash(sesion):
    """El caso literal de #306: la subida reporto 36,650 bytes contra 36,649 del
    local y la nota decia que no se habia comparado el contenido."""
    c = _corrida()
    ruta, _sha = _ficha_en_disco(sesion)
    c.fichas_emitidas.append(ruta)
    otro = hashlib.sha256(b"<html>ficha</html>\n").hexdigest()
    e = c.registrar_entrega("onedrive", "https://ejemplo/f.html",
                            sha256_subido=otro, bytes_subidos=19)
    assert e["verificacion"] == "DIFIERE"
    assert any("NO ES EL LOCAL" in a for a in e["avisos_de_verificacion"])


def test_EL_CASO_PELIGROSO_mismo_tamano_distinto_contenido(sesion):
    """Lo que el tamano no puede detectar nunca: un caracter cambiado en medio.
    Es la razon de pedir hash y no bytes."""
    c = _corrida()
    ruta, _sha = _ficha_en_disco(sesion, b"<html>ficha</html>")
    c.fichas_emitidas.append(ruta)
    falso = hashlib.sha256(b"<html>FICHA</html>").hexdigest()
    e = c.registrar_entrega("onedrive", "https://ejemplo/f.html",
                            sha256_subido=falso, bytes_subidos=18)
    assert e["verificacion"] == "DIFIERE"
    assert any("TAMANO SI COINCIDE" in a for a in e["avisos_de_verificacion"])


def test_solo_el_tamano_NO_cuenta_como_verificado(sesion):
    c = _corrida()
    ruta, _sha = _ficha_en_disco(sesion)
    c.fichas_emitidas.append(ruta)
    e = c.registrar_entrega("onedrive", "https://ejemplo/f.html",
                            bytes_subidos=18)
    assert e["verificacion"] == "mismo_tamano_sin_hash"
    assert any("SOLO EL TAMANO" in a for a in e["avisos_de_verificacion"])


def test_una_entrega_sin_nada_que_comparar_lo_DICE(sesion):
    """Registrar la entrega sin hash ni bytes es legitimo, pero no puede pasar por
    verificada: en Pesqueria se dio por buena justo asi."""
    c = _corrida()
    ruta, _sha = _ficha_en_disco(sesion)
    c.fichas_emitidas.append(ruta)
    e = c.registrar_entrega("onedrive", "https://ejemplo/f.html")
    assert e["verificacion"] == "sin_verificar"
    assert any(a.startswith(MARCA_ENTREGA) for a in c.avisos)


def test_el_CLI_imprime_el_veredicto_de_la_verificacion(sesion, capsys):
    c = _corrida()
    ruta, sha = _ficha_en_disco(sesion)
    c.fichas_emitidas.append(ruta)
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq.main(["entregar", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--destino", "onedrive", "--url", "https://ejemplo/f.html",
                     "--sha256", sha]) == 0
    salida = capsys.readouterr().out
    assert "VERIFICADO por sha256" in salida


def test_el_CLI_grita_cuando_el_contenido_subido_DIFIERE(sesion, capsys):
    c = _corrida()
    ruta, _sha = _ficha_en_disco(sesion)
    c.fichas_emitidas.append(ruta)
    c.guardar(orq._ruta("Coficab", "Pesqueria"))
    assert orq.main(["entregar", "--empresa", "Coficab", "--ciudad", "Pesqueria",
                     "--destino", "onedrive", "--url", "https://ejemplo/f.html",
                     "--sha256", "0" * 64]) == 0
    assert "contenido DISTINTO" in capsys.readouterr().out
