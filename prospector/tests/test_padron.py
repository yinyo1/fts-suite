"""El mapa de plantas: lo estructural, y su fecha de caducidad.

Dos preocupaciones, y son la misma vista de dos lados:

  * el padron guarda lo que envejece LENTO -donde hay planta, de que tamano, de
    que giro, con que dominio- y suelta lo que caduca rapido -correo, telefono-;
  * y avisa cuando ya envejecio: por TIEMPO (el corte es viejo) y por DATOS (una
    corrida topo con que el mapa no alcanza).

Ninguno de los dos frena una corrida. Los dos avisan.
"""
import datetime as dt
import pytest

from flujo.padron import (cargar, vigilar_cobertura, Padron, PadronInvalido,
                          AVISO_MESES, GRAVE_MESES, PROHIBIDAS, CSV_PADRON)

HOY = dt.date(2026, 9, 24)


# ------------------------------------------------- lo estructural se queda
def test_el_padron_carga_y_trae_lo_estructural():
    p = cargar(hoy=HOY)
    campos = set(p.filas[0].keys())
    for estructural in ("nom_estab", "raz_social", "codigo_act", "estrato_min",
                        "municipio", "entidad", "cod_postal", "dominio_correo"):
        assert estructural in campos, f"falta el dato estructural {estructural}"


def test_el_contacto_NO_esta_y_cargar_se_niega_si_vuelve(tmp_path):
    p = cargar(hoy=HOY)
    for prohibida in PROHIBIDAS:
        assert prohibida not in p.filas[0], (
            f"'{prohibida}' caduca rapido y es dato personal: va a Postgres")

    # Y si alguien lo vuelve a meter, la carga NO sigue. Esto no es
    # envejecimiento del dato: es una fuga.
    sucio = tmp_path / "sucio.csv"
    sucio.write_text("corte_denue,nom_estab,correoelec\n2026-05,X,[persona]@empresa-ejemplo.com\n",
                     encoding="utf-8")
    with pytest.raises(PadronInvalido, match="repo es PUBLICO"):
        cargar(sucio, hoy=HOY)


def test_el_dominio_sobrevive_porque_no_identifica_a_nadie():
    p = cargar(hoy=HOY)
    con = [f for f in p.operables if f["dominio_correo"].strip()]
    assert len(con) > 100, (
        "el dominio es la llave operativa -dominio + ciudad + CP-: si se fuera "
        "con los correos, el padron dejaria de servir")


# --------------------------------------------------------- caducidad por TIEMPO
def test_el_corte_se_lee_del_archivo_no_se_supone():
    p = cargar(hoy=HOY)
    assert p.corte == "2026-05", "es la fecha del DATO, no de la consulta"
    assert p.antiguedad_meses == 4


def test_hoy_no_avisa_porque_todavia_no_hay_nada_mas_fresco():
    p = cargar(hoy=HOY)
    assert not p.caduco and p.aviso_de_tiempo is None and not p.banderas


@pytest.mark.parametrize("fecha,meses,grave", [
    (dt.date(2026, 10, 31), 5, False),   # 5 meses: todavia calla
    (dt.date(2026, 11, 1), 6, False),    # el umbral: avisa
    (dt.date(2027, 5, 1), 12, True),     # dos cortes saltados: avisa grave
])
def test_avisa_al_umbral_y_sube_el_tono_al_doble(fecha, meses, grave):
    p = cargar(hoy=fecha)
    assert p.antiguedad_meses == meses
    aviso = p.aviso_de_tiempo
    if meses < AVISO_MESES:
        assert aviso is None
        return
    assert aviso is not None and aviso.clave == "PADRON_CADUCO"
    assert aviso.grave is grave
    assert "vigilante" in aviso.sugerencia, "tiene que apuntar al vigilante"


def test_el_aviso_NO_frena_la_corrida():
    """Frenar por la edad del mapa seria peor que correr con el mapa viejo: un
    corte de hace un ano sigue ubicando plantas."""
    p = cargar(hoy=dt.date(2028, 1, 1))
    assert p.aviso_de_tiempo.grave
    assert len(p.operables) > 200, "el padron sigue usable, solo avisado"
    assert p.buscar("Hershey", "hersheys.com", entidad="Nuevo León")


def test_un_padron_con_dos_cortes_mezclados_se_rechaza(tmp_path):
    f = tmp_path / "mezcla.csv"
    f.write_text("corte_denue,nom_estab\n2026-05,A\n2025-11,B\n", encoding="utf-8")
    with pytest.raises(PadronInvalido, match="mezcla cortes"):
        cargar(f, hoy=HOY)


def test_un_corte_sin_forma_de_fecha_se_rechaza(tmp_path):
    f = tmp_path / "raro.csv"
    f.write_text("corte_denue,nom_estab\nseptiembre,A\n", encoding="utf-8")
    with pytest.raises(PadronInvalido, match="fecha del DATO"):
        cargar(f, hoy=HOY)


# ---------------------------------------------------------- caducidad por DATOS
def test_una_cuenta_que_esta_en_el_mapa_no_levanta_bandera():
    p = cargar(hoy=HOY)
    assert vigilar_cobertura(p, "HERSHEY S", "hersheys.com",
                             "General Escobedo", "Nuevo León", "311") == []


def test_fuera_del_alcance_pide_un_corte_MAS_AMPLIO_no_mas_nuevo():
    """Cuprum es aluminio (SCIAN 331) y el padron cubre 311/312. Un corte nuevo
    del mismo alcance no lo va a traer nunca: la distincion evita mandar a
    descargar 32 archivos para nada."""
    p = cargar(hoy=HOY)
    bs = vigilar_cobertura(p, "Grupo Cuprum", "cuprum.com",
                           "San Nicolas de los Garza", "Nuevo León", "331")
    assert len(bs) == 1 and bs[0].clave == "FUERA_DEL_ALCANCE_DEL_PADRON"
    assert "MAS AMPLIO, no mas nuevo" in bs[0].sugerencia
    assert "La corrida SIGUE" in bs[0].sugerencia


def test_dentro_del_alcance_y_ausente_sugiere_corte_nuevo():
    p = cargar(hoy=HOY)
    bs = vigilar_cobertura(p, "Procesadora de Carnes Escobedo 2026", "",
                           "General Escobedo", "Nuevo León", "311")
    assert len(bs) == 1 and bs[0].clave == "NO_EN_PADRON_PERO_EN_ALCANCE"
    assert "DOMINIO antes de concluir" in bs[0].sugerencia, (
        "primero descartar que el empate fallo por la razon social")
    assert "vigilante" in bs[0].sugerencia


def test_evidencia_de_cierre_levanta_bandera_grave():
    p = cargar(hoy=HOY)
    bs = vigilar_cobertura(p, "HERSHEY S", "hersheys.com", "General Escobedo",
                           "Nuevo León", "311",
                           evidencia_de_cierre="la nota de prensa dice que cerro")
    assert [b.clave for b in bs] == ["PLANTA_QUIZA_CERRADA"]
    assert bs[0].grave
    assert "vigente = false" in bs[0].sugerencia, "una baja no borra"


# ----------------------------------- la geografia no es un filtro opcional
def test_una_planta_de_otro_estado_NO_empata_con_una_de_aqui():
    """La leccion de los cinco DUNS de Ragasa: cuatro en NL y uno en Jalisco con
    la misma razon social. El nombre no desempata; el domicilio si. Devolver la
    fila de Monterrey cuando preguntaron por Guadalajara es el empate silencioso
    que el metodo existe para impedir."""
    p = cargar(hoy=HOY)
    assert p.buscar("Sigma Alimentos", entidad="Nuevo León"), "en NL si esta"
    assert p.buscar("Sigma Alimentos", ciudad="Guadalajara",
                    entidad="Jalisco") == [], "en Jalisco NO, y no se inventa"
    bs = vigilar_cobertura(p, "Sigma Alimentos", "", "Guadalajara", "Jalisco", "311")
    assert bs[0].clave == "FUERA_DEL_ALCANCE_DEL_PADRON"
    assert "Jalisco" in bs[0].mensaje


def test_el_empate_por_dominio_gana_al_nombre():
    """El padron llama HERSMEX a Hershey y COMERCIALIZADORA DE LACTEOS a Lala.
    Empatar por nombre sin pasar por el dominio falla callado justo en los
    grupos grandes."""
    p = cargar(hoy=HOY)
    por_dominio = p.buscar("cualquier cosa que no es el nombre",
                           "hersheys.com", entidad="Nuevo León")
    assert len(por_dominio) == 1
    assert "HERSMEX" in por_dominio[0]["raz_social"].upper()
