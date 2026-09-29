"""Una RESPUESTA POSITIVA reabre una tarjeta que nacio vencida (#353, Tarea 5).

La opcion C de #340 dejo escrito que el destino 2 reabre una tarjeta
`vencida_sin_trabajar` cuando llega SENAL FRESCA. La corrida humana de #353 trajo
el otro caso, que el diseno no habia probado: lo que llega no es una senal, es una
RESPUESTA.

Y es el caso importante. La cuenta del tercer respondedor -- Qualtia, del grupo
Xignux-- tiene su senal fechada el 17-dic-2024: 651 dias, frescura 0.0, puntaje
0.0, `archiva`, y su tarjeta nace vencida desde el 16-abr-2025. El radar la
archivaria. Y sin embargo alguien de esa cuenta contesto el 23-sep-2026.

Una respuesta positiva es mas fuerte que una senal fresca: la senal dice que
puede haber necesidad, la respuesta dice que hay interlocutor. Esta prueba fija
que la maquinaria de reapertura sirva para las dos, y que la reapertura por
respuesta guarde lo que el lazo 1 necesita -- la caducidad original-- para tener
su contraejemplo medido.

Sin nombres: el contacto entra a la base con `nombre` NULL y solo su puesto.
"""
import os
import shutil
import subprocess
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))

from flujo.base_motor3 import Base

ESQUEMA = os.path.join(RAIZ, "datos", "esquema-motor3.sql")
DIR = "/tmp/pgm3-respuesta-353"
PUERTO = "5454"


def _levantar():
    if not shutil.which("psql") or not os.path.isdir("/usr/lib/postgresql"):
        return None
    vers = sorted(os.listdir("/usr/lib/postgresql"), reverse=True)
    if not vers:
        return None
    binarios = f"/usr/lib/postgresql/{vers[0]}/bin"
    subprocess.run(["rm", "-rf", DIR], check=False)
    os.makedirs(f"{DIR}/data", exist_ok=True)
    os.makedirs(f"{DIR}/run", exist_ok=True)
    if subprocess.run(["chown", "-R", "postgres:postgres", DIR],
                      capture_output=True).returncode:
        return None
    pre = f"PATH={binarios}:$PATH "
    if subprocess.run(["su", "postgres", "-c",
                       pre + f"initdb -D {DIR}/data -U postgres -A trust"],
                      capture_output=True).returncode:
        return None
    if subprocess.run(["su", "postgres", "-c",
                       pre + f"pg_ctl -D {DIR}/data -o \"-k {DIR}/run -h '' "
                             f"-p {PUERTO}\" -l {DIR}/log -w start"],
                      capture_output=True).returncode:
        return None
    b = Base(socket=f"{DIR}/run", puerto=PUERTO)
    # Que el cluster haya arrancado no es que CONTESTE: en un contenedor se
    # puede reapear a media corrida, y una prueba que falla por eso es floja.
    return b if b.vive() else None


@pytest.fixture(scope="module")
def base():
    b = _levantar()
    if b is None:
        pytest.skip("no hay un Postgres que se pueda levantar en este entorno")
    b.archivo(ESQUEMA)
    b.correr("""
        SET search_path TO motor3, public;
        INSERT INTO cuenta (llave_de_corrida, empresa, planta, giro)
             VALUES ('Xignux/Monterrey', 'Xignux / Qualtia Alimentos',
                     'Monterrey', 'embutidos y carnes frias');
        INSERT INTO senal (cuenta_id, fuente, tipo, texto, fecha_senal,
                           fecha_senal_precision)
             SELECT id, 'sitio_de_la_empresa', 'ampliacion_de_capacidad',
                    'primera piedra de la ampliacion de la Planta Monterrey',
                    DATE '2024-12-17', 'dia'
               FROM cuenta WHERE empresa LIKE 'Xignux%';
        -- NACE VENCIDA: 120 dias de ampliacion_de_capacidad sobre dic-2024.
        INSERT INTO tarjeta (cuenta_id, senal_id, estado, caduca_el,
                             caduca_por_que, caducidad_original)
             SELECT c.id, s.id, 'vencida_sin_trabajar', DATE '2025-04-16',
                    '120 dias de ampliacion_de_capacidad desde 2024-12-17',
                    DATE '2025-04-16'
               FROM cuenta c JOIN senal s ON s.cuenta_id = c.id
              WHERE c.empresa LIKE 'Xignux%';
    """)
    yield b
    subprocess.run(["su", "postgres", "-c",
                    f"pg_ctl -D {DIR}/data stop"], capture_output=True)


def _sql(b, q):
    return b.correr("SET search_path TO motor3, public;\n" + q)


# ---------------------------------------------------------------------------
def test_de_partida_nace_vencida_y_esta_en_la_vista(base):
    out = _sql(base, "SELECT count(*) FROM vencidas_sin_trabajar;")
    assert "1" in out, out


def test_la_respuesta_positiva_la_reabre_y_guarda_la_caducidad_original(base):
    _sql(base, """
        UPDATE tarjeta SET estado='abierta', reabierta_vencida=true,
                           reaperturas = reaperturas + 1,
                           caduca_el = DATE '2026-09-29' + 120,
                           caduca_por_que = 'REABIERTA por respuesta positiva'
         WHERE estado='vencida_sin_trabajar';
    """)
    out = _sql(base, """
        SELECT estado, caduca_el, caducidad_original, reabierta_vencida,
               reaperturas FROM tarjeta;
    """)
    assert "abierta" in out
    # La caducidad se recalcula DESDE HOY. Reabrirla con la original la mataria
    # en el acto.
    assert "2027-01-27" in out, out
    # Y la original NO se borra: es el numero que el lazo 1 necesita para tener
    # un contraejemplo medido de la curva de frescura.
    assert "2025-04-16" in out, out
    fila = [l for l in out.splitlines() if l.startswith("abierta|")]
    assert fila, out
    campos = fila[0].split("|")
    assert campos[3] == "t", out            # reabierta_vencida
    assert campos[4] == "1", out            # primera reapertura


def test_reabierta_ya_no_aparece_en_vencidas_sin_trabajar(base):
    out = _sql(base, "SELECT count(*) FROM vencidas_sin_trabajar;")
    assert "0" in out, out


def test_el_toque_de_respuesta_entra_sin_nombre(base):
    _sql(base, """
        INSERT INTO contacto (cuenta_id, nombre, puesto, cercania_decision,
                              canal_recomendado, canal_por_que, modulo_origen)
             SELECT id, NULL, 'Gerente de Proyectos Nuevos Negocio', 30,
                    'linkedin', 'respondio por ese canal',
                    'corrida_humana_sales_navigator'
               FROM cuenta;
        INSERT INTO toque (tarjeta_id, n, canal, programado_para, hecho_el,
                           resultado)
             SELECT id, 1, 'linkedin', DATE '2026-09-22', DATE '2026-09-23',
                    'respuesta_positiva' FROM tarjeta;
        INSERT INTO toque_destinatario (toque_id, contacto_id)
             SELECT t.id, c.id FROM toque t, contacto c;
    """)
    out = _sql(base, """
        SELECT t.resultado, c.puesto, (c.nombre IS NULL) AS sin_nombre
          FROM toque t JOIN toque_destinatario td ON td.toque_id = t.id
          JOIN contacto c ON c.id = td.contacto_id;
    """)
    assert "respuesta_positiva" in out
    assert "Gerente de Proyectos" in out
    fila = [l for l in out.splitlines() if l.startswith("respuesta_positiva|")]
    assert fila, out
    assert fila[0].split("|")[-1] == "t", (
        "el contacto entro CON nombre: la base del piloto guarda puesto y "
        "cercania, no personas")


def test_la_reapertura_sigue_respetando_una_abierta_por_cuenta(base):
    """La tarjeta reabierta OCUPA el lugar de la cuenta. Es lo que la hace
    trabajo de verdad, y lo que una `vencida_sin_trabajar` no hacia."""
    from flujo.base_motor3 import SinPostgres

    with pytest.raises(SinPostgres) as e:
        base.correr("""
            SET search_path TO motor3, public;
            INSERT INTO tarjeta (cuenta_id, estado, caduca_el, caduca_por_que)
                 SELECT id, 'abierta', DATE '2027-01-01', 'segunda abierta'
                   FROM cuenta;
        """)
    assert "tarjeta_una_abierta_por_cuenta" in str(e.value), str(e.value)
