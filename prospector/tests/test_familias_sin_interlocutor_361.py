"""La ficha declara el limite POR FAMILIA (#361, tarea 4 — el caso de Ragasa).

El aviso de #353 era todo-o-nada: la empresa esta en el buscador publico o no
esta. La correccion de #355 mostro que el caso NORMAL es intermedio, y Ragasa es
el ejemplo: el buscador SI devuelve perfiles de Ragasa -- un director general
adjunto entre ellos-- y los que NO devuelve son los de planta. Para ese caso la
ficha no tenia nada que decir, asi que se veia completa: con contactos, con senal,
y sin avisar de que faltaba justo el que firma la orden.

Ahora lo dice por familia, y la busqueda de Sales Navigator sale acotada a las
familias vacias: mandar a la vendedora a buscar las cuatro cuando dos ya tienen a
alguien es mandarla a repetir el trabajo caro.

Sin nombres: los contactos entran con `nombre=None` y su puesto.
"""
from __future__ import annotations

from flujo.confianza import Contacto
from flujo.estado import Corrida
from flujo.ficha import (
    INTERLOCUTOR,
    aviso_de_cuenta_sin_buscador_publico,
    aviso_de_familias_sin_interlocutor,
    busqueda_armada_para_sales_navigator,
    familias_sin_interlocutor,
)

FORMAS = ("simple", "linkedin_global", "linkedin_mx")


def _corrida(puestos=(), perfiles_por_consulta=1, consultas=12):
    c = Corrida("Ragasa", "Monterrey", giro="aceites comestibles")
    for i in range(consultas):
        c.registrar_busqueda("M5", "bloques_secos", f"consulta numero {i}",
                             "linkedin_publico", 0,
                             etiqueta=FORMAS[i % 3],
                             perfiles_de_la_empresa=(perfiles_por_consulta
                                                     if i == 0 else 0))
    for p in puestos:
        c.agregar(Contacto(nombre=None, puesto=p, empresa="Ragasa"))
    return c


# ----------------------------------------------------- que familias faltan
def test_sin_ningun_contacto_no_falta_ninguna_familia_todavia():
    """Sin contactos no se emite este aviso: lo cubre el otro, y decir los dos
    seria repetir."""
    c = _corrida()
    assert aviso_de_familias_sin_interlocutor(c) == ""


def test_un_contacto_de_ingenieria_deja_tres_familias_vacias():
    c = _corrida(["Coordinar proyectos, diseno de tuberias, materiales"])
    faltan = {k for k, _t in familias_sin_interlocutor(c)}
    assert faltan == {"mantenimiento", "compras", "direccion"}, faltan


def test_un_puesto_que_el_filtro_manda_a_OTROS_no_llena_ninguna_familia():
    """«Tecnico Electromecanico» no esta en el vocabulario de mantenimiento, asi
    que no cuenta como interlocutor de esa familia -- aunque la ficha si lo liste
    como puerta que llamar, que es otra pregunta--."""
    c = _corrida(["Tecnico Electromecanico"])
    faltan = {k for k, _t in familias_sin_interlocutor(c)}
    assert faltan == {"mantenimiento", "compras", "direccion", "ingenieria"}


def test_un_puesto_bloqueado_por_la_lista_negra_tampoco_llena_la_familia():
    c = _corrida(["Reclutador de mantenimiento"])
    assert len(familias_sin_interlocutor(c)) == len(INTERLOCUTOR)


def test_con_las_cuatro_familias_cubiertas_no_hay_aviso():
    c = _corrida(["Jefe de Mantenimiento", "Gerente de Compras",
                  "Gerente de Planta", "Ingeniero de Procesos"])
    assert familias_sin_interlocutor(c) == []
    assert aviso_de_familias_sin_interlocutor(c) == ""


# --------------------------------------------------------------- el aviso
def test_el_aviso_nombra_las_familias_que_faltan_y_dice_que_la_empresa_SI_esta():
    c = _corrida(["Coordinar proyectos, diseno de tuberias, materiales"])
    html = aviso_de_familias_sin_interlocutor(c)
    assert html
    assert "3 familias" in html
    for titulo in ("Mantenimiento y servicios de planta",
                   "Compras y abastecimiento", "Direccion y planta"):
        assert titulo in html, titulo
    # Lo que distingue este aviso del de clase (c): aqui la empresa SI esta.
    assert "El buscador si tiene a esta empresa" in html
    assert "no es que la planta no los tenga" in html.lower()


def test_el_aviso_dice_una_familia_en_singular():
    c = _corrida(["Jefe de Mantenimiento", "Gerente de Compras",
                  "Gerente de Planta"])
    html = aviso_de_familias_sin_interlocutor(c)
    assert "una familia" in html and "familias" not in html.split("una familia")[0]


def test_la_busqueda_de_SN_sale_ACOTADA_a_las_familias_vacias():
    """Mandarla a buscar las cuatro cuando dos ya tienen a alguien es mandarla a
    repetir el trabajo caro."""
    c = _corrida(["Coordinar proyectos, diseno de tuberias, materiales"])
    html = aviso_de_familias_sin_interlocutor(c)
    assert "Ingenieria y proyectos" not in html, (
        "pidio buscar en Sales Navigator una familia que ya tiene a alguien")
    assert "Compras y abastecimiento" in html


def test_la_busqueda_armada_completa_sigue_existiendo_sin_acotar():
    c = _corrida()
    todas = busqueda_armada_para_sales_navigator(c)
    for _k, titulo, _p in INTERLOCUTOR:
        assert titulo in todas, titulo


# ------------------------------------- no se pisa con el aviso de clase (c)
def test_cuando_la_empresa_NO_esta_indexada_este_aviso_se_calla():
    """El de clase (c) dice mas -- «esta empresa no aparece en el buscador
    publico»-- y decir los dos seria repetir con dos redacciones distintas."""
    c = _corrida(["Jefe de Mantenimiento"], perfiles_por_consulta=0)
    assert aviso_de_cuenta_sin_buscador_publico(c) != ""
    assert aviso_de_familias_sin_interlocutor(c) == ""


def test_los_dos_avisos_van_en_A_QUIEN_BUSCAR_y_en_ese_orden():
    import inspect

    from flujo import ficha

    fuente = inspect.getsource(ficha)
    i_t = fuente.index("<h2>A quien buscar</h2>")
    i_c = fuente.index("{bl_sin_buscador}", i_t)
    i_f = fuente.index("{bl_familias}", i_t)
    i_dec = fuente.index("Decisores de la planta", i_t)
    assert i_t < i_c < i_f < i_dec


# ------------------------------------------------- el caso de Ragasa, medido
def test_el_caso_de_ragasa_de_punta_a_punta():
    """De «cero contactos» a dos contactos del buzon, sin correo, y la busqueda
    de SN acotada a las tres familias que siguen vacias. Es la prueba de que M0c
    corregido cambia una ficha real."""
    c = Corrida("Ragasa", "Monterrey", giro="aceites y grasas comestibles")
    for m, clave, fuente in (("M0", "contactos_recorridos", "odoo"),
                             ("M0b", "consultas", "outlook")):
        c.registrar_busqueda(m, clave, f"lectura de {fuente} para Ragasa",
                             fuente, 0, perfiles_de_la_empresa=0)
        c.cerrar_modulo(m, "respondio")
    c.registrar_busqueda("M0c", "llamadas",
                         "outlook_email_search(sender='@ragasa.com.mx')",
                         "outlook_remitentes", 0, etiqueta="via_dominio",
                         perfiles_de_la_empresa=0)
    c.registrar_busqueda(
        "M0c", "llamadas", "outlook_email_search(query='Ragasa') -> remitentes",
        "outlook_hilos_por_nombre", 2, etiqueta="via_nombre",
        perfiles_de_la_empresa=2,
        contactos=[Contacto(None, "Tecnico Electromecanico", "Ragasa"),
                   Contacto(None, "Coordinar proyectos, diseno de tuberias, "
                                  "materiales", "Ragasa")])
    c.cerrar_modulo("M0c", "respondio")
    for i in range(12):
        c.registrar_busqueda("M5", "bloques_secos", f"consulta de personas {i}",
                             "linkedin_publico", 0, etiqueta=FORMAS[i % 3],
                             perfiles_de_la_empresa=(3 if i == 1 else 0))

    # NO es clase (c): el buscador tiene a la empresa.
    assert c.limite_de_fuente()[0] is False
    assert c.corta_m5_por_limite_de_fuente()[0] is False
    # Y no hay ningun correo: los dos son contactos, no anclas.
    assert not any(x.datos.get("correo") for x in c.contactos)
    # Tres familias vacias, y el aviso las nombra.
    assert len(familias_sin_interlocutor(c)) == 3
    html = aviso_de_familias_sin_interlocutor(c)
    assert "Sales Navigator" in html
    assert "Ingenieria y proyectos" not in html
