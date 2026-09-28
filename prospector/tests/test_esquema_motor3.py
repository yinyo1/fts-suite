"""El esquema de Postgres del motor 3, contra el vocabulario de Python.

DOS CLASES DE PRUEBA AQUI, y la primera es la que importa:

1. SIN POSTGRES: que los enums del SQL y los vocabularios de Python digan lo
   mismo. Es el riesgo real de este archivo -- el esquema y el codigo se escriben
   el mismo dia y se separan en la tercera correccion--, y si se separan el lazo 2
   baja niveles por razones que el codigo no reconoce, o la base rechaza un canal
   que el paquete si emite.

2. CON POSTGRES, si lo hay: que el esquema APLIQUE y que sus restricciones de
   verdad rechacen lo que dicen rechazar. Un CHECK mal escrito se lee igual que
   uno bien escrito.
"""
import os
import re
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flujo.aprendizaje import DESTINOS, RESULTADOS_DE_TOQUE
from flujo.confianza import (CANDIDATO, CONFIRMADO, DESMENTIDO, EN_CONFLICTO,
                             NO_ENCONTRADO, SOLIDO, Dato)
from flujo.paquete import CONMUTADOR, CORREO_DIRECTO, LINKEDIN

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESQUEMA = os.path.join(RAIZ, "datos", "esquema-motor3.sql")


def _sql():
    with open(ESQUEMA, encoding="utf-8") as f:
        return f.read()


def _enum(nombre: str) -> set[str]:
    """Los valores del CREATE TYPE ... AS ENUM (...) que se llame `nombre`."""
    m = re.search(rf"CREATE TYPE {nombre} AS ENUM \((.*?)\);", _sql(), re.S)
    assert m, f"no existe el enum {nombre} en el esquema"
    # los comentarios -- ... se quitan antes de leer los literales
    cuerpo = re.sub(r"--[^\n]*", "", m.group(1))
    return set(re.findall(r"'([^']+)'", cuerpo))


# =====================================================  1 · sin Postgres
def test_los_niveles_de_confianza_son_los_mismos_en_los_dos_lados():
    assert _enum("nivel_de_confianza") == {
        CONFIRMADO, SOLIDO, CANDIDATO, EN_CONFLICTO, NO_ENCONTRADO, DESMENTIDO}


def test_el_esquema_conoce_el_nivel_desmentido():
    # Sin el, el lazo 2 no puede guardar lo que calcula (#325, H5).
    assert DESMENTIDO in _enum("nivel_de_confianza")


def test_los_resultados_de_toque_son_los_mismos_en_los_dos_lados():
    assert _enum("resultado_de_toque") == set(RESULTADOS_DE_TOQUE)


def test_los_destinos_de_tarjeta_son_los_tres_del_diseno():
    assert _enum("destino_de_tarjeta") == set(DESTINOS)


def test_los_canales_son_los_que_el_paquete_emite_mas_evento():
    # `evento` lo pone el motor 3 -- el motor 2 no tiene esa senal-- asi que el
    # esquema lo conoce y el paquete no lo emite. Los dos hechos son correctos.
    assert _enum("canal_de_toque") == {CORREO_DIRECTO, LINKEDIN, CONMUTADOR,
                                       "evento"}


def test_el_celular_personal_no_existe_como_canal_ni_como_columna():
    sql = _sql()
    # Aparece SOLO en los comentarios que explican que no existe. Si apareciera
    # en un CREATE TABLE o en el enum, esta prueba lo caza.
    sin_comentarios = re.sub(r"--[^\n]*", "", sql)
    assert "celular" not in sin_comentarios.lower()
    assert "celular_personal" not in _enum("canal_de_toque")


def test_el_check_del_desmentido_lista_exactamente_los_que_desmienten():
    m = re.search(r"solo_los_que_de_verdad_desmienten CHECK \((.*?)\)\)",
                  _sql(), re.S)
    assert m, "no existe el CHECK que separa los desenlaces que desmienten"
    en_el_check = set(re.findall(r"'([^']+)'", m.group(1)))
    # La division tiene que ser la MISMA que en `Dato.DESMIENTEN`. Si se separan,
    # la base acepta un desmentido que el codigo no reconoce, o al reves.
    assert en_el_check == set(Dato.DESMIENTEN)
    assert not (en_el_check & set(Dato.NO_DESMIENTEN))


def test_ninguna_vista_del_tablero_toca_las_tablas_de_personas():
    # El tablero se tiene que poder abrir, compartir y capturar en pantalla sin
    # exponer a nadie. Las dos unicas tablas con datos personales son `contacto`
    # y `toque_destinatario`, y la unica vista que puede leer `contacto` es la que
    # existe para filtrar correos enviables.
    sql = _sql()
    vistas = re.findall(r"CREATE VIEW (\w+) AS(.*?);", sql, re.S)
    permitidas = {"correo_que_si_se_puede_enviar"}
    for nombre, cuerpo in vistas:
        if nombre in permitidas:
            continue
        cuerpo_limpio = re.sub(r"--[^\n]*", "", cuerpo)
        for tabla in ("contacto", "toque_destinatario"):
            assert not re.search(rf"\b{tabla}\b", cuerpo_limpio), (
                f"la vista {nombre} lee {tabla}, que es una tabla con datos "
                "personales")


def test_el_repo_no_trae_semillas_del_esquema():
    # Un esquema es logica y puede vivir aqui. Un INSERT de personas no.
    for f in os.listdir(os.path.join(RAIZ, "datos")):
        if not f.endswith(".sql"):
            continue
        with open(os.path.join(RAIZ, "datos", f), encoding="utf-8") as fh:
            cuerpo = re.sub(r"--[^\n]*", "", fh.read())
        assert "INSERT INTO" not in cuerpo.upper(), (
            f"datos/{f} trae INSERTs: el repo guarda la logica, no las filas")


def test_una_sola_tarjeta_abierta_por_cuenta_es_regla_de_la_base():
    # Escrita como indice unico parcial y no como trigger a proposito: una regla
    # que el motor de la base sostiene no se puede rodear desde un flujo de n8n a
    # las 3 de la manana. Es el destino 2 del diseno convertido en restriccion.
    assert re.search(
        r"CREATE UNIQUE INDEX tarjeta_una_abierta_por_cuenta\s*\n?\s*"
        r"ON tarjeta \(cuenta_id\) WHERE estado = 'abierta';", _sql())


# =====================================================  2 · con Postgres, si hay
def _cluster():
    """(socket, puerto) de un cluster de prueba, o None si no se puede."""
    if not shutil.which("psql"):
        return None
    base = "/usr/lib/postgresql"
    if not os.path.isdir(base):
        return None
    vers = sorted(os.listdir(base), reverse=True)
    if not vers:
        return None
    binarios = os.path.join(base, vers[0], "bin")
    d = "/tmp/pgm3-test"
    env = dict(os.environ, PATH=f"{binarios}:{os.environ['PATH']}")
    subprocess.run(["rm", "-rf", d], check=False)
    os.makedirs(f"{d}/data", exist_ok=True)
    os.makedirs(f"{d}/run", exist_ok=True)
    # initdb se niega a correr como root, asi que el cluster lo levanta el usuario
    # `postgres` -- que es el que lo va a tener en produccion de todos modos--.
    if subprocess.run(["chown", "-R", "postgres:postgres", d],
                      capture_output=True).returncode:
        return None
    pre = f"PATH={binarios}:$PATH "
    if subprocess.run(
            ["su", "postgres", "-c", pre + f"initdb -D {d}/data -U postgres -A trust"],
            capture_output=True, env=env).returncode:
        return None
    if subprocess.run(
            ["su", "postgres", "-c",
             pre + f"pg_ctl -D {d}/data -o \"-k {d}/run -h '' -p 5434\" "
                   f"-l {d}/log -w start"],
            capture_output=True, env=env).returncode:
        return None
    return (f"{d}/run", "5434")


@pytest.fixture(scope="module")
def pg():
    c = _cluster()
    if c is None:
        pytest.skip("no hay un Postgres que se pueda levantar en este entorno")
    sock, puerto = c
    yield sock, puerto
    subprocess.run(["su", "postgres", "-c",
                    f"PATH=$(dirname $(readlink -f $(which psql))):$PATH "
                    f"pg_ctl -D /tmp/pgm3-test/data stop"], capture_output=True)


def _fresco(pg):
    """Aplica el esquema desde cero. CADA prueba lo necesita.

    Sin esto las pruebas se contaminaban entre si y el sintoma era confuso: la
    segunda prueba insertaba una cuenta con la misma `llave_de_corrida` UNICA que
    la primera, el bloque entero abortaba por ON_ERROR_STOP, y la tercera leia
    cero contactos donde esperaba uno -- y parecia un error de la VISTA--.
    Reaplicar el esquema encima no alcanza: `CREATE TYPE` falla si el tipo existe.
    """
    _psql(pg, "DROP SCHEMA IF EXISTS motor3 CASCADE;")
    r = _psql(pg, None, ESQUEMA)
    assert r.returncode == 0, r.stderr


def _psql(pg, sql, archivo=None):
    sock, puerto = pg
    cmd = ["psql", "-h", sock, "-U", "postgres", "-p", puerto, "-tA",
           "-v", "ON_ERROR_STOP=1"]
    cmd += ["-f", archivo] if archivo else ["-c", sql]
    return subprocess.run(cmd, capture_output=True, text=True)


def test_el_esquema_aplica_en_postgres_de_verdad(pg):
    r = _psql(pg, None, ESQUEMA)
    assert r.returncode == 0, r.stderr


def test_postgres_rechaza_una_segunda_tarjeta_abierta(pg):
    _fresco(pg)
    _psql(pg, """SET search_path TO motor3;
        INSERT INTO cuenta (llave_de_corrida, empresa) VALUES ('A/B','A');
        INSERT INTO tarjeta (cuenta_id) VALUES (1);""")
    r = _psql(pg, "SET search_path TO motor3; INSERT INTO tarjeta (cuenta_id) "
                  "VALUES (1);")
    assert r.returncode != 0
    assert "tarjeta_una_abierta_por_cuenta" in r.stderr


def test_postgres_rechaza_el_silencio_como_desmentido(pg):
    _fresco(pg)
    _psql(pg, """SET search_path TO motor3;
        INSERT INTO cuenta (llave_de_corrida, empresa) VALUES ('A/B','A');
        INSERT INTO contacto (cuenta_id, correo, nivel_correo)
        VALUES (1,'test@ejemplo.mx','confirmado');""")
    for no_desmiente in sorted(Dato.NO_DESMIENTEN):
        r = _psql(pg, f"SET search_path TO motor3; INSERT INTO desmentido "
                      f"(contacto_id, campo, que_paso) VALUES "
                      f"(1,'correo','{no_desmiente}');")
        assert r.returncode != 0, f"la base acepto '{no_desmiente}'"
        assert "solo_los_que_de_verdad_desmienten" in r.stderr


def test_postgres_saca_el_correo_desmentido_de_los_enviables(pg):
    _fresco(pg)
    _psql(pg, """SET search_path TO motor3;
        INSERT INTO cuenta (llave_de_corrida, empresa) VALUES ('A/B','A');
        INSERT INTO contacto (cuenta_id, correo, nivel_correo)
        VALUES (1,'test@ejemplo.mx','confirmado');""")
    antes = _psql(pg, "SET search_path TO motor3; SELECT count(*) FROM "
                      "correo_que_si_se_puede_enviar;").stdout.strip().splitlines()
    assert antes[-1] == "1"
    _psql(pg, "SET search_path TO motor3; INSERT INTO desmentido "
              "(contacto_id, campo, que_paso) VALUES (1,'correo','rebote');")
    # El `nivel_correo` de la fila SIGUE diciendo 'confirmado' -- no se edita--
    # y aun asi el correo ya no sale. El desmentido le gana a las fuentes.
    nivel = _psql(pg, "SET search_path TO motor3; SELECT nivel_correo FROM "
                      "contacto WHERE id=1;").stdout.strip().splitlines()
    assert nivel[-1] == "confirmado"
    despues = _psql(pg, "SET search_path TO motor3; SELECT count(*) FROM "
                        "correo_que_si_se_puede_enviar;").stdout.strip().splitlines()
    assert despues[-1] == "0"


def test_postgres_no_deja_aplicar_un_ajuste_prematuro(pg):
    _fresco(pg)
    r = _psql(pg, """SET search_path TO motor3;
        INSERT INTO ajuste_propuesto
          (lazo,celda,archivo,constante,n_observado,n_minimo,veredicto,propuesta,
           aplicado_el,aplicado_por)
        VALUES (1,'x','flujo/radar.py','FUERZA_DE_FUENTE',5,20,'prematuro','x',
                now(),'alguien');""")
    assert r.returncode != 0
    assert "solo_se_aplica_lo_que_alcanza" in r.stderr


def test_postgres_no_deja_un_ajuste_aplicado_sin_nombre(pg):
    _fresco(pg)
    r = _psql(pg, """SET search_path TO motor3;
        INSERT INTO ajuste_propuesto
          (lazo,celda,archivo,constante,n_observado,n_minimo,veredicto,propuesta,
           aplicado_el)
        VALUES (1,'x','flujo/radar.py','FUERZA_DE_FUENTE',25,20,'alcanza','x',
                now());""")
    assert r.returncode != 0
    assert "un_ajuste_aplicado_tiene_nombre" in r.stderr
