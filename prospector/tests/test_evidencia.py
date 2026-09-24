"""El truco del contador vacio, que es el defecto abierto de #24.

Lo que paso de verdad el 24-sep-2026, y lo hizo quien escribio el reporte que
lo denuncia: para cerrar M2 -que exige tres bolsas de trabajo- se incremento el
contador tres veces con registros vacios, y la compuerta quedo satisfecha.

    Detenia el descuido, no la determinacion.

Estas pruebas son el intento de hacerlo otra vez. Todas tienen que fallar en la
compuerta, no en un assert.
"""
import pytest
from flujo.compuertas import EstadoModulo, Busqueda, CompuertaCerrada, Presupuesto
from flujo.estado import Corrida
from flujo.catalogo import FuenteProhibida


# --------------------------------------------------- el truco, en sus variantes
def test_el_contador_ya_no_se_puede_subir_a_mano():
    m = EstadoModulo("M2")
    with pytest.raises(CompuertaCerrada, match="ya no existe"):
        m.suma("bolsas")


def test_tres_sumas_vacias_ya_no_cierran_M2():
    """La reproduccion literal de lo que paso."""
    c = Corrida("Grupo Cuprum", "San Nicolas, NL")
    for _ in range(3):
        with pytest.raises(CompuertaCerrada, match="ya no existe"):
            c.mod("M2").suma("bolsas")
    with pytest.raises(CompuertaCerrada, match="NO agotado"):
        c.cerrar_modulo("M2")


def test_el_contador_no_se_puede_escribir_ni_por_asignacion():
    """Cerrar la puerta de al lado: `contadores` es derivado, no un dict que
    se pueda sobrescribir con {'bolsas': 3}."""
    m = EstadoModulo("M2")
    with pytest.raises(AttributeError):
        m.contadores = {"bolsas": 3}


def test_una_busqueda_sin_consulta_se_rechaza():
    m = EstadoModulo("M2")
    with pytest.raises(CompuertaCerrada, match="sin consulta"):
        m.registrar_busqueda("bolsas", "", "vacante", 0)
    with pytest.raises(CompuertaCerrada, match="sin consulta"):
        m.registrar_busqueda("bolsas", "  ", "vacante", 5)


def test_una_busqueda_con_resultados_negativos_se_rechaza():
    m = EstadoModulo("M2")
    with pytest.raises(CompuertaCerrada, match="entero >= 0"):
        m.registrar_busqueda("bolsas", "indeed cuprum", "vacante", -1)


def test_CERO_resultados_SI_cuenta_como_trabajo_hecho():
    """La otra mitad de la regla: haber preguntado bien y no encontrar nada es
    trabajo hecho. Si cero no contara, la compuerta premiaria mentir."""
    m = EstadoModulo("M13")
    m.registrar_busqueda("cortes", "denue corte 05/2026", "denue", 0)
    m.exigir_agotado()
    assert m.agotado
    assert m.resultados_totales == 0


# ------------------------------------------- repetir la misma fuente no suma
def test_la_MISMA_bolsa_tres_veces_no_agota_M2():
    """El truco version 2: tres busquedas reales, pero las tres a Indeed.
    El criterio pide tres fuentes DISTINTAS, no tres consultas."""
    m = EstadoModulo("M2")
    for q in ("cuprum mantenimiento", "cuprum jefe de planta", "cuprum compras"):
        m.registrar_busqueda("bolsas", q, "vacante", 2)
    assert m.consultas_corridas == 3
    assert m.contadores["bolsas"] == 1, "una sola fuente distinta"
    with pytest.raises(CompuertaCerrada, match="Repetir la misma via"):
        m.exigir_agotado()


def test_la_misma_consulta_con_otra_etiqueta_tampoco_suma():
    """El truco version 4, que abre la etiqueta: si lo que distingue a dos
    trabajos es una etiqueta y no la fuente, la etiqueta tiene que venir con su
    propia consulta. La misma consulta dos veces es un trabajo, no dos."""
    m = EstadoModulo("M7")
    q = "cuprum.com filetype:pdf organigrama"
    m.registrar_busqueda("formas", q, "pdf_publico", 2, etiqueta="forma_empresa")
    m.registrar_busqueda("formas", q, "pdf_publico", 2, etiqueta="forma_nombre")
    assert m.consultas_corridas == 2
    assert m.contadores["formas"] == 1, "misma consulta = un trabajo"
    with pytest.raises(CompuertaCerrada, match="Repetir la misma via"):
        m.exigir_agotado()


def test_dos_FORMAS_con_su_propia_consulta_si_agotan_M7():
    """M7 exige dos FORMAS de preguntar, no dos fuentes: las dos van contra
    pdf_publico. Es para eso que existe la etiqueta."""
    m = EstadoModulo("M7")
    m.registrar_busqueda("formas", "cuprum.com filetype:pdf organigrama",
                         "pdf_publico", 2, etiqueta="forma_empresa")
    m.registrar_busqueda("formas", '"[Persona C]" cuprum filetype:pdf',
                         "pdf_publico", 0, etiqueta="forma_nombre")
    assert m.contadores["formas"] == 2
    m.exigir_agotado()


def test_M2_si_se_puede_agotar_con_bolsa_propia_y_dos_agregadores():
    """Defecto que encontro la corrida de Cuprum: el criterio pedia tres
    fuentes distintas y el catalogo solo permitia la etiqueta `vacante`.
    M2 no se podia agotar NUNCA."""
    m = EstadoModulo("M2")
    for f, q in (("vacante_propia", "cuprum.com/careers vacantes"),
                 ("vacante_indeed", "site:mx.indeed.com cuprum mantenimiento"),
                 ("vacante_occ", "site:occ.com.mx cuprum")):
        m.registrar_busqueda("bolsas", q, f, 0)
    assert m.contadores["bolsas"] == 3
    m.exigir_agotado()


def test_dos_agregadores_de_vacantes_son_la_MISMA_raiz():
    """Indeed y OCC republican el mismo anuncio: que coincidan no confirma."""
    from flujo.confianza import Dato, SOLIDO
    d = Dato("puesto")
    d.observar("vacante_indeed", "Jefe de Mantenimiento")
    d.observar("vacante_occ", "Jefe de Mantenimiento")
    assert d.n_fuentes == 2 and d.n_raices == 1
    assert d.nivel == SOLIDO
    d.observar("vacante_propia", "Jefe de Mantenimiento")   # la empresa misma
    assert d.n_raices == 2


def test_tres_directorios_DISTINTOS_si_agotan_M1():
    m = EstadoModulo("M1")
    for f in ("leadiq", "rocketreach", "signalhire"):
        m.registrar_busqueda("directorios", f"cuprum.com via {f}", f, 1)
    assert m.contadores["directorios"] == 3
    m.exigir_agotado()


def test_no_se_le_acredita_a_M1_una_consulta_de_prensa():
    """El truco version 3: registrar trabajo REAL, pero del modulo equivocado.
    Tres notas de prensa no son tres directorios contrastados."""
    m = EstadoModulo("M1")
    with pytest.raises(CompuertaCerrada, match="no le corresponde"):
        m.registrar_busqueda("directorios", "cuprum inversion 2026", "prensa", 3)


def test_una_fuente_descartada_no_puede_ser_evidencia():
    m = EstadoModulo("M5")
    with pytest.raises(FuenteProhibida, match="BANEO"):
        m.registrar_busqueda("bloques_secos", "cuprum staff",
                             "linkedin_autenticado", 40)


# ------------------------------------------------ una sola fuente de verdad
def test_los_hits_de_chao1_salen_del_MISMO_registro():
    """Antes `hits` era un contador que subia al agregar. Ahora es cuantas
    busquedas distintas trajeron al contacto: el mismo registro que sostiene el
    agotado sostiene la estimacion de completitud. Una sola fuente de verdad."""
    from flujo.confianza import Contacto
    c = Corrida("Grupo Cuprum", "San Nicolas, NL")

    def oscar():
        return Contacto("[Persona C]", "Portfolio Manager", c.empresa)

    c.registrar_busqueda("M0", "contactos_recorridos", "res.partner cuprum",
                         "odoo", 1, contactos=[oscar()])
    assert c.contactos[0].hits == 1
    c.registrar_busqueda("M5", "bloques_secos", "\"[Persona C]\" cuprum",
                         "buscador", 1, contactos=[oscar()])
    assert len(c.contactos) == 1, "es el mismo, no un duplicado"
    assert c.contactos[0].hits == 2, "dos busquedas distintas lo trajeron"
    assert c.completitud().observados == 1


def test_una_busqueda_no_puede_entregar_mas_gente_de_la_que_dice():
    from flujo.confianza import Contacto
    c = Corrida("X", "Monterrey")
    with pytest.raises(CompuertaCerrada, match="no puede traer mas gente"):
        c.registrar_busqueda("M5", "bloques_secos", "x staff", "buscador", 0,
                             contactos=[Contacto("A", "B", "X")])


# --------------------------------- M5 lee el presupuesto REAL (defecto de #24)
def test_M5_lee_los_bloques_del_presupuesto_no_un_contador_aparte():
    c = Corrida("Grupo Cuprum", "San Nicolas, NL")
    c.presupuesto.tope_por_cuenta = 100
    with pytest.raises(CompuertaCerrada, match="bloques del presupuesto"):
        c.mod("M5").exigir_agotado()

    for nuevas in (7, 4):
        c.presupuesto.registrar(10, nuevas)
    assert c.mod("M5").contadores["bloques_secos"] == 0
    for _ in range(3):
        c.presupuesto.registrar(10, 0)
    assert c.mod("M5").contadores["bloques_secos"] == 3, (
        "lo lee de los bloques reales, no de un contador que alguien subio")
    c.mod("M5").exigir_agotado()
    assert c.presupuesto.saturado


def test_M5_no_se_puede_agotar_registrando_busquedas():
    """La puerta de al lado del defecto: si M5 leyera un contador propio, se
    podria agotar con busquedas sin gastar un bloque. Ya no."""
    c = Corrida("X", "Monterrey")
    for f, q in (("buscador", "x jefe planta"), ("linkedin_publico", "site:linkedin x")):
        c.registrar_busqueda("M5", "bloques_secos", q, f, 3)
    assert c.mod("M5").contadores["bloques_secos"] == 0, (
        "las busquedas de M5 se registran, pero el agotado lo decide el "
        "presupuesto: tres bloques secos de verdad")
    with pytest.raises(CompuertaCerrada, match="bloques del presupuesto"):
        c.mod("M5").exigir_agotado()


# ---------------------------------------------- la evidencia sobrevive al disco
def test_una_corrida_guardada_no_reaparece_con_contadores_sin_respaldo():
    """`a_dict` guarda los REGISTROS; al cargar, los contadores se vuelven a
    derivar. Editar el JSON para poner 'directorios: 3' no sirve de nada."""
    import json, tempfile, os
    c = Corrida("Grupo Cuprum", "San Nicolas, NL")
    for f in ("leadiq", "rocketreach"):
        c.registrar_busqueda("M1", "directorios", f"cuprum.com {f}", f, 1)
    d = c.a_dict()
    assert d["modulos"]["M1"]["contadores"]["directorios"] == 2
    assert len(d["modulos"]["M1"]["registros"]) == 2

    d["modulos"]["M1"]["contadores"]["directorios"] = 3      # el truco en JSON
    with tempfile.TemporaryDirectory() as tmp:
        ruta = os.path.join(tmp, "cuprum.json")
        json.dump(d, open(ruta, "w", encoding="utf-8"), ensure_ascii=False)
        vuelto = json.load(open(ruta, encoding="utf-8"))
    m = EstadoModulo("M1")
    for r in vuelto["modulos"]["M1"]["registros"]:
        m.registros.append(Busqueda(**r))
    assert m.contadores["directorios"] == 2, (
        "el contador del JSON se ignora: solo cuenta la evidencia")
    with pytest.raises(CompuertaCerrada, match="MINIMO TRES"):
        m.exigir_agotado()
