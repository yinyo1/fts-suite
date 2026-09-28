"""El hueco de #335: los archivos que SI se suben no pasaban por la comparacion.

La comparacion nacio de #306 -- la subida de Pesqueria difirio en un byte y la
entrega se dio por buena porque nadie la comparo-- y vivia encerrada en
`Corrida.registrar_entrega`. Los dos entregables de esta noche no los produce una
corrida, asi que `prospector entregar` los rechaza:

    No hay corrida para 'Hershey' en 'Escobedo'. Corre primero: prospecta

Estas pruebas atan las dos vias al MISMO veredicto, para que no se puedan separar.
"""
import json
import os
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from flujo.estado import Corrida, comparar_subida
from herramientas import verificar_entrega as ve


def _archivo(tmp_path, contenido=b"a,b,c\n1,2,3\n"):
    r = tmp_path / "entregable.csv"
    r.write_bytes(contenido)
    return str(r)


def test_el_veredicto_vive_suelto_y_no_dentro_de_corrida():
    """Si vuelve a vivir solo dentro de la clase, el hueco de #335 vuelve."""
    assert callable(comparar_subida)
    # Y `registrar_entrega` la USA, en vez de tener su propia copia: dos copias
    # de la misma logica es como se separan los veredictos de las dos vias.
    fuente = open(os.path.join(RAIZ, "flujo", "estado.py"), encoding="utf-8").read()
    cuerpo = fuente.split("def registrar_entrega(")[1].split("\n    def ")[0]
    assert "comparar_subida(" in cuerpo
    assert "longitud_confirmada_en_base64" not in cuerpo, (
        "registrar_entrega volvio a calcular el veredicto por su cuenta")


def test_las_dos_vias_dan_EL_MISMO_veredicto(tmp_path):
    ruta = _archivo(tmp_path)
    huella = Corrida.huella(ruta)
    por_fuera = ve.verificar(ruta, "https://ejemplo/x.csv",
                             bytes_subidos=huella["bytes"],
                             base64_confirmado=True)
    por_dentro, _ = comparar_subida(huella, bytes_subidos=huella["bytes"],
                                    base64_con_longitud_confirmada=True)
    assert por_fuera["verificacion"] == por_dentro == "longitud_confirmada_en_base64"


def test_base64_confirmado_es_aceptable_y_el_tamano_solo_NO_lo_es(tmp_path):
    ruta = _archivo(tmp_path)
    n = Corrida.huella(ruta)["bytes"]
    assert ve.verificar(ruta, "https://e/x", bytes_subidos=n,
                        base64_confirmado=True)["verificacion_aceptable"]
    # El tamano por si solo NO alcanza: es exactamente el error de #306.
    solo_tamano = ve.verificar(ruta, "https://e/x", bytes_subidos=n)
    assert solo_tamano["verificacion"] == "mismo_tamano_sin_hash"
    assert not solo_tamano["verificacion_aceptable"]


def test_el_byte_de_mas_de_306_cae_como_TAMANO_DISTINTO(tmp_path):
    ruta = _archivo(tmp_path)
    n = Corrida.huella(ruta)["bytes"]
    e = ve.verificar(ruta, "https://e/x", bytes_subidos=n + 1,
                     base64_confirmado=True)
    assert e["verificacion"] == "TAMANO_DISTINTO"
    assert not e["verificacion_aceptable"]


def test_sin_liga_se_niega(tmp_path):
    with pytest.raises(SystemExit):
        ve.verificar(_archivo(tmp_path), "   ", bytes_subidos=11)


def test_un_archivo_que_no_esta_en_disco_no_se_da_por_bueno(tmp_path):
    e = ve.verificar(str(tmp_path / "no-existe.csv"), "https://e/x",
                     bytes_subidos=99, base64_confirmado=True)
    assert e["local"] == {}
    assert e["verificacion"] == "sin_verificar"
    assert not e["verificacion_aceptable"]


def test_el_registro_reemplaza_la_subida_anterior_del_mismo_archivo(tmp_path):
    reg = str(tmp_path / "entregas.json")
    ruta = _archivo(tmp_path)
    n = Corrida.huella(ruta)["bytes"]
    for url in ("https://e/v1", "https://e/v2"):
        ve.registrar(ve.verificar(ruta, url, bytes_subidos=n,
                                  base64_confirmado=True), registro=reg)
    guardado = json.load(open(reg, encoding="utf-8"))["entregas"]
    assert len(guardado) == 1, "el registro dice donde esta la copia VIGENTE"
    assert guardado[0]["url"] == "https://e/v2"


def test_las_tres_entregas_de_la_noche_quedaron_registradas():
    ruta = os.path.join(RAIZ, "datos", "entregas-fuera-de-corrida.json")
    d = json.load(open(ruta, encoding="utf-8"))
    por_nombre = {e["archivo"]: e for e in d["entregas"]}
    assert set(por_nombre) == {
        "crm-lead-etapa1-4-tarjetas-REVISAR-y-subir.csv",
        "crm-lead-etapa1-5-tarjetas-archiva-NO-subir.csv",
        "tarjeta-1-hershey-escobedo.json",
    }
    for nombre, e in por_nombre.items():
        assert e["url"].startswith("https://"), nombre
        assert e["verificacion_aceptable"], nombre
        # La liga tiene que llevar el nombre correcto: D9 exige que el archivo de
        # 'archiva' se distinga del que SI se sube, y la liga es lo que Esteban ve.
        assert e["local"]["bytes"] > 0, nombre


def test_el_registro_no_lleva_datos_personales():
    crudo = open(os.path.join(RAIZ, "datos", "entregas-fuera-de-corrida.json"),
                 encoding="utf-8").read()
    assert "@" not in crudo.replace("estebandelacruz_fts_mx", ""), (
        "un correo en el registro es un dato personal; la unica cadena con "
        "usuario permitida es la ruta del OneDrive del propio operador")
