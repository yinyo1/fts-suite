"""El arranque de una instruccion: `prospecta <empresa>`.

La empresa es lo UNICO obligatorio. Lo demas se infiere del padron o se pide en
una linea. Nunca falla por falta de un dato que el padron ya tiene, y nunca
elige una planta en silencio.
"""
import pytest
from flujo.arranque import (resolver, texto_del_plan, pregunta_de_una_linea,
                            chequeo, PLAN)


def test_con_solo_el_nombre_infiere_la_geografia():
    a = resolver("Galletera Santa Maria")
    assert a.ciudad and a.entidad and a.giro and a.dominio
    assert not a.ambiguo and not a.falta
    assert any("ciudad" in x for x in a.inferido)
    assert any("dominio" in x for x in a.inferido)


def test_varias_plantas_PREGUNTAN_en_vez_de_elegir():
    """Elegir una planta en silencio es el caso de los cinco DUNS de Ragasa:
    cuatro en NL y uno en Jalisco con la misma razon social."""
    a = resolver("Bimbo")
    assert a.ambiguo
    assert len(a.filas_padron) > 1
    assert not a.ciudad, "no se inventa una"
    p = pregunta_de_una_linea(a)
    assert "¿Cual?" in p and "plantas en el padron" in p
    assert "\n" in p and p.count("\n") == 1, "una linea, mas la forma de repetir"


def test_con_la_ciudad_la_ambiguedad_se_resuelve():
    a = resolver("Bimbo", ciudad="San Nicolás de los Garza")
    assert not a.ambiguo and len(a.filas_padron) == 1
    assert a.dominio == "grupobimbo.com"


def test_fuera_del_padron_ARRANCA_igual_con_bandera():
    """Un prospecto fuera del padron sigue siendo un prospecto."""
    a = resolver("Grupo Cuprum", ciudad="San Nicolas de los Garza",
                 entidad="Nuevo León", giro="331")
    assert not a.filas_padron
    assert not a.ambiguo, "no esta ambiguo: simplemente no esta"
    assert [b.clave for b in a.banderas] == ["FUERA_DEL_ALCANCE_DEL_PADRON"]
    assert "MAS AMPLIO, no mas nuevo" in a.banderas[0].sugerencia


def test_sin_ciudad_y_fuera_del_padron_lo_declara_sin_frenar():
    a = resolver("Planta Que No Existe 2026")
    assert not a.ambiguo
    assert any("la ciudad" in x for x in a.falta)


def test_el_plan_trae_los_modulos_de_busqueda_en_el_orden_del_metodo():
    """M13 no esta en el plan a proposito: `prospecta` ya lo corrio y lo cerro
    al resolver la cuenta en el padron."""
    assert [m for m, *_ in PLAN] == ["M0", "M0b", "M1", "M2", "M3", "M12",
                                     "M4", "M5", "M6", "M7", "M8", "M9"]


def test_el_plan_pone_las_internas_primero_y_el_motor_despues_del_vocabulario():
    orden = [m for m, *_ in PLAN]
    assert orden[0] == "M0" and orden[1] == "M0b", "internas primero: precedencia"
    assert orden.index("M2") < orden.index("M4"), "vacantes ANTES del motor"
    assert orden.index("M12") < orden.index("M4"), "prensa ANTES del motor"
    assert orden.index("M6") < orden.index("M7"), "M7 pide nombres que da M6"


def test_cada_paso_del_plan_dice_POR_QUE_ahora():
    for mod, clave, vias, que, porque in PLAN:
        assert vias and que and len(porque) > 40, (
            f"{mod} sin justificacion: un plan que no dice por que invita a "
            "saltarse pasos")


def test_el_plan_trae_los_comandos_ya_escritos():
    a = resolver("Galletera Santa Maria")
    t = texto_del_plan(a)
    assert "prospector buscar --empresa" in t
    assert "--estado sin_acceso --razon" in t, "declarar el hueco tiene que estar a la vista"
    assert "NO se simula" in t


def test_las_vias_del_plan_existen_en_el_catalogo():
    from flujo.catalogo import PERMITIDAS
    for mod, _clave, vias, *_ in PLAN:
        permitidas = PERMITIDAS.get(mod)
        if not permitidas:
            continue
        for v in vias:
            assert v in permitidas, (
                f"el plan le ofrece '{v}' a {mod} y el catalogo lo rechaza: "
                "seria mandar al usuario contra una compuerta")


def test_el_chequeo_no_da_por_buenos_los_conectores():
    """Decir que un conector esta vivo sin llamarlo es contar una declaracion
    como evidencia: el mismo pecado que la compuerta de agotado persigue."""
    # `correr_pruebas=False` a proposito: chequeo() corre la suite en un
    # subproceso, y llamarlo desde la suite recursa sin fondo. Lo encontre
    # colgando la maquina. Hay una guarda por variable de entorno ademas.
    filas = chequeo(correr_pruebas=False)
    porque = {q: (ok, det) for q, ok, det in filas}
    for conector in ("Odoo vivo (M0)", "Outlook vivo (M0b)", "WebSearch vivo"):
        ok, det = porque[conector]
        assert ok is None, f"{conector} no se puede verificar desde Python"
        assert "solo Claude" in det
    assert porque["Pruebas en verde"][0] is None, "saltadas por --rapido"
    assert porque["Salida FUERA del repo"][0] is True
