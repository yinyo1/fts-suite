"""La base del piloto: que cargue, que sus reglas rechacen, y que NO simule.

Las pruebas que necesitan Postgres se saltan si no se puede levantar. Las que NO
lo necesitan -- que son las que sostienen las decisiones-- corren siempre.
"""
import json
import os
import shutil
import subprocess
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

from flujo.base_motor3 import Base, SinPostgres


# ================================================  sin Postgres: las decisiones
def test_sin_psql_se_DICE_no_se_devuelve_vacio(monkeypatch):
    """Un reporte que dice "cero cierres" cuando lo que pasa es que no hay base
    es indistinguible de uno correcto. Es la misma familia que el
    `mismo_tamano_sin_hash` que se leia como verificado."""
    monkeypatch.setattr(shutil, "which", lambda x: None)
    with pytest.raises(SinPostgres) as e:
        Base()
    assert "NO se inventa un resultado vacio" in str(e.value)


def test_la_carga_exige_las_mismas_llaves_en_todas_las_filas():
    """Con llaves distintas, la columna que le falta a una entraria como NULL para
    todas -- silenciosamente--."""
    b = Base.__new__(Base)
    b.socket, b.puerto, b.usuario, b.base = "", "1", "u", "d"
    with pytest.raises(SinPostgres) as e:
        b.cargar_json("t", [{"a": 1, "b": 2}, {"a": 3}])
    assert "llaves distintas" in str(e.value)


def test_el_insert_lleva_lista_de_columnas_explicita():
    """La razon esta medida: sin la lista, `jsonb_populate_recordset` produce la
    fila COMPLETA y las columnas ausentes del JSON entran como NULL explicito,
    PISANDO el DEFAULT. El sintoma fue `null value in column "creada"` en una
    columna con `DEFAULT now()`."""
    import pathlib
    fuente = pathlib.Path(os.path.join(RAIZ, "flujo", "base_motor3.py")).read_text()
    assert "INSERT INTO {tabla_destino} ({cols})" in fuente
    assert "pisando el DEFAULT" in fuente


def test_ninguna_consulta_del_aprendizaje_toca_las_tablas_de_personas():
    """El corte de aprendizaje tiene que poder salir sin que nadie se acuerde de
    excluir columnas."""
    import pathlib
    fuente = pathlib.Path(os.path.join(RAIZ, "flujo", "base_motor3.py")).read_text()
    consulta = fuente[fuente.index("def cierres_para_el_aprendizaje"):
                      fuente.index("def resumen_del_piloto")]
    # Se quita la DOCSTRING antes de buscar, no solo las lineas con `#`: la
    # docstring nombra las dos tablas justo para decir que no las toca, y una
    # prueba que se tropieza con su propia explicacion no prueba nada. El SQL vive
    # despues del ultimo `"""`.
    sql = consulta.rsplit('"""', 1)[-1]
    sql = "\n".join(l for l in sql.splitlines() if not l.strip().startswith("#"))
    for tabla in ("motor3.contacto", "toque_destinatario"):
        assert tabla not in sql, f"la consulta del aprendizaje lee {tabla}"


def test_el_cargador_no_inventa_la_llave_de_reciclaje():
    """Sale de un correo ANCLA observado, y el piloto de la semana 1 no carga
    contactos. Derivarla del nombre del dominio de la empresa seria la llave por
    nombre con un disfraz."""
    import pathlib
    fuente = pathlib.Path(os.path.join(RAIZ, "herramientas",
                                       "cargar_piloto.py")).read_text()
    assert '"llave_de_reciclaje": None' in fuente


def test_el_cargador_no_carga_las_cuentas_con_hueco():
    import cargar_piloto as cp
    import linea_base_radar as lb
    with open(lb.RUTA, encoding="utf-8") as f:
        d = json.load(f)
    huecos = [c for c in d["cuentas"] if not c.get("fuente")]
    assert huecos
    # Meterlas con fuente NULL romperia el NOT NULL de `senal.fuente`, que esta
    # ahi justo para eso.
    assert "if c.get(\"fuente\")" in open(cp.__file__, encoding="utf-8").read()


# ================================================  con Postgres, si se puede
def _cluster(puerto="5441", d="/tmp/pgm3-piloto-test"):
    if not shutil.which("psql") or not os.path.isdir("/usr/lib/postgresql"):
        return None
    vers = sorted(os.listdir("/usr/lib/postgresql"), reverse=True)
    if not vers:
        return None
    binarios = f"/usr/lib/postgresql/{vers[0]}/bin"
    subprocess.run(["rm", "-rf", d], check=False)
    os.makedirs(f"{d}/data", exist_ok=True)
    os.makedirs(f"{d}/run", exist_ok=True)
    if subprocess.run(["chown", "-R", "postgres:postgres", d],
                      capture_output=True).returncode:
        return None
    pre = f"PATH={binarios}:$PATH "
    if subprocess.run(["su", "postgres", "-c",
                       pre + f"initdb -D {d}/data -U postgres -A trust"],
                      capture_output=True).returncode:
        return None
    if subprocess.run(["su", "postgres", "-c",
                       pre + f"pg_ctl -D {d}/data -o \"-k {d}/run -h '' "
                             f"-p {puerto}\" -l {d}/log -w start"],
                      capture_output=True).returncode:
        return None
    b = Base(socket=f"{d}/run", puerto=puerto)
    # SE COMPRUEBA QUE CONTESTE, no solo que `pg_ctl` haya devuelto cero.
    # Hizo falta: el cluster arrancaba, cuatro pruebas pasaban y la quinta fallaba
    # con "No such file or directory" en el socket. En un contenedor un Postgres
    # desechable se puede reapear a media corrida, y una prueba que falla por eso
    # es una prueba FLOJA -- y una floja en esta suite es peor que ninguna, porque
    # entrena a ignorar el rojo--.
    return b if b.vive() else None


@pytest.fixture(scope="module")
def _cluster_del_modulo():
    b = _cluster()
    if b is None:
        pytest.skip("no hay un Postgres que se pueda levantar en este entorno")
    yield b
    subprocess.run(["su", "postgres", "-c",
                    "pg_ctl -D /tmp/pgm3-piloto-test/data stop"],
                   capture_output=True)


@pytest.fixture
def base(_cluster_del_modulo):
    """El cluster, comprobando que siga vivo ANTES de cada prueba.

    Si se murio a media corrida la prueba se SALTA, no falla: lo que estas pruebas
    verifican son las reglas del esquema, y un cluster reapeado no dice nada sobre
    ellas. Fallar ahi seria rojo que no significa nada.
    """
    if not _cluster_del_modulo.vive():
        pytest.skip("el Postgres de prueba dejo de contestar a media corrida")
    return _cluster_del_modulo


def test_el_piloto_carga_y_sus_reglas_rechazan(base):
    import cargar_piloto as cp
    r = cp.cargar(base)
    assert r["cuentas_cargadas"] == 9
    assert len(r["huecos_no_cargados"]) == 4
    res = r["resumen"]
    # Una tarjeta abierta por cuenta, y CERO contactos: la semana 1 valida reglas,
    # y las reglas no necesitan a nadie.
    assert res["tarjetas_abiertas"] == res["cuentas"] == 9
    assert res["contactos"] == 0
    assert res["cierres"] == 0
    reglas = cp.verificar_reglas(base)
    assert reglas, "la verificacion no probo ninguna regla"
    for x in reglas:
        assert x["ok"], f"{x['regla']}: {x['resultado']}"


def test_el_cargador_declara_las_tarjetas_que_nacen_vencidas(base):
    """Coficab/Durango: senal del 8-dic-2025, ventana de 120 dias, cerrada en
    abril. Abrir hoy una tarjeta con caducidad en el pasado es una tarjeta que nace
    muerta, y el tablero la mostraria como trabajo vivo."""
    import cargar_piloto as cp
    r = cp.cargar(base)
    vencidas = r["tarjetas_vencidas_al_cargar"]
    assert vencidas, "ninguna se declaro vencida, y Durango lo esta"
    assert any("Durango" in v["llave"] for v in vencidas)


def test_el_cargador_NO_cierra_las_vencidas_solo(base):
    """Un cierre sin un solo toque seria un expediente inventado -- destino
    `caduca` sin cadencia, sin canal y sin resultado-- y entraria a los tres lazos
    como un desenlace real. Ensuciar el aprendizaje para que el tablero quede
    limpio es el peor de los dos males."""
    import cargar_piloto as cp
    r = cp.cargar(base)
    assert r["resumen"]["cierres"] == 0
    assert r["resumen"]["tarjetas_cerradas"] == 0


def test_las_tres_compuertas_dicen_sin_datos_en_la_semana_1(base):
    import cargar_piloto as cp
    from flujo.aprendizaje import los_tres_lazos
    from flujo.base_motor3 import cierres_para_el_aprendizaje
    cp.cargar(base)
    cierres = cierres_para_el_aprendizaje(base)
    assert cierres == []
    r = los_tres_lazos(cierres)
    assert r["cierres_leidos"] == 0
    assert r["compuertas_que_abren"] == []


def test_el_puntaje_que_entra_a_la_base_lo_CALCULA_el_codigo(base):
    """No se transcribe de la linea base: se corre el evaluador al cargar. Un
    numero transcrito se separa del codigo en la segunda correccion."""
    import cargar_piloto as cp
    import linea_base_radar as lb
    cp.cargar(base)
    lbase = {f"{f['empresa']}/{f.get('planta') or '?'}": f["despues"]
             for f in lb.linea_base()["filas"] if not f["hueco"]}
    filas = base.json(
        "SELECT coalesce(jsonb_agg(jsonb_build_object('k', c.llave_de_corrida, "
        "'p', s.puntaje)), '[]'::jsonb) FROM motor3.senal s "
        "JOIN motor3.cuenta c ON c.id = s.cuenta_id;")
    assert filas
    for f in filas:
        assert abs(float(f["p"]) - lbase[f["k"]]) < 0.05, f["k"]


# ============================  tarea 3 de #336 · la tarjeta que nace vencida
def test_una_tarjeta_muerta_abierta_BLOQUEA_el_reciclaje(base):
    """El argumento que decide el diseno de `metodo/tarjeta-que-nace-vencida.md`.

    No es un problema de presentacion: una tarjeta vencida que sigue `abierta`
    ocupa el unico lugar que la cuenta tiene, y cuando llegue una senal nueva el
    destino 2 NO PUEDE reabrir -- el indice unico parcial lo rechaza--. O sea que una
    tarjeta muerta rompe el mecanismo que el motor 3 existe para sostener.

    Si esta prueba fallara, la recomendacion del diseno cambiaria: el estado propio
    solo serviria para limpiar el tablero, y eso no justificaria tocar el esquema.
    """
    import cargar_piloto as cp
    r = cp.cargar(base)
    vencidas = r["tarjetas_vencidas_al_cargar"]
    assert vencidas, "ninguna nacio vencida; el caso no se puede probar"
    # La cuenta de la tarjeta vencida.
    llave = vencidas[0]["llave"]
    cuenta_id = base.correr(
        "SELECT id FROM motor3.cuenta WHERE llave_de_corrida = "
        f"$m3q${llave}$m3q$;").strip()
    assert cuenta_id
    # Llega una senal NUEVA de esa misma cuenta y se intenta reabrir.
    base.correr(
        f"INSERT INTO motor3.senal (cuenta_id, fuente, tipo, fecha_senal, "
        f"evaluada) VALUES ({cuenta_id}, 'correo_propio', 'necesidad_declarada', "
        f"current_date, false);")
    nueva = base.correr("SELECT max(id) FROM motor3.senal;").strip()
    try:
        base.correr(f"INSERT INTO motor3.tarjeta (cuenta_id, senal_id) "
                    f"VALUES ({cuenta_id}, {nueva});")
        reabrio = True
        detalle = ""
    except SinPostgres as e:
        reabrio, detalle = False, str(e)
    assert not reabrio, (
        "la tarjeta muerta NO bloqueo el reciclaje: revisa la recomendacion de "
        "metodo/tarjeta-que-nace-vencida.md antes de aplicarla")
    assert "tarjeta_una_abierta_por_cuenta" in detalle


def test_el_estado_propio_dejaria_libre_el_lugar(base):
    """La otra mitad del argumento: con la vencida FUERA de `abierta`, el reciclaje
    si puede reabrir. Se prueba con el estado que ya existe (`cerrada`) porque
    `vencida_sin_trabajar` todavia NO esta en el esquema -- el diseno espera OK--.

    Lo que esta prueba sostiene es que el indice es PARCIAL y por eso la solucion
    propuesta funciona, no que el estado nuevo exista.
    """
    import cargar_piloto as cp
    r = cp.cargar(base)
    llave = r["tarjetas_vencidas_al_cargar"][0]["llave"]
    cuenta_id = base.correr(
        "SELECT id FROM motor3.cuenta WHERE llave_de_corrida = "
        f"$m3q${llave}$m3q$;").strip()
    base.correr(f"UPDATE motor3.tarjeta SET estado = 'cerrada', "
                f"cerrada = now() WHERE cuenta_id = {cuenta_id};")
    base.correr(f"INSERT INTO motor3.senal (cuenta_id, fuente, evaluada) "
                f"VALUES ({cuenta_id}, 'correo_propio', false);")
    nueva = base.correr("SELECT max(id) FROM motor3.senal;").strip()
    base.correr(f"INSERT INTO motor3.tarjeta (cuenta_id, senal_id) "
                f"VALUES ({cuenta_id}, {nueva});")
    abiertas = base.correr(
        f"SELECT count(*) FROM motor3.tarjeta WHERE cuenta_id = {cuenta_id} "
        "AND estado = 'abierta';").strip()
    assert abiertas == "1"
