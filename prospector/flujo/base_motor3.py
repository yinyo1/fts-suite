"""Hablar con la base del motor 3 SIN un driver de Python.

POR QUE POR `psql` Y NO POR psycopg. El contenedor no trae driver de Python, y
agregar una dependencia para el piloto de la semana 1 tiene un costo que no hace
falta pagar todavia: lo unico que este modulo necesita es mandar SQL y leer JSON
de vuelta, y `psql` hace las dos cosas. Cuando la etapa 2 exista y haya un flujo
corriendo sin sesion abierta, ahi si conviene un driver -- y este modulo es la
frontera que habria que cambiar, un archivo--.

COMO SE PASAN LOS VALORES, y es la parte que importa. **Nunca por interpolacion
de cadenas.** Los valores viajan como parametros de `psql` (`-v`) y se citan con
`quote_literal`, o se mandan como un solo JSON y Postgres lo desarma. Armar SQL
pegando cadenas con un nombre de empresa adentro es como se rompe una base con una
comilla en "O'Brien Industries", y es la misma familia de descuido que meter un
dato personal en un repo publico: funciona hasta el dia que no.
"""
from __future__ import annotations
import json
import os
import shutil
import subprocess


class SinPostgres(RuntimeError):
    """No hay una base con la que hablar. Se dice, no se simula."""


class Base:
    """Una conexion a la base del motor 3, por `psql`."""

    def __init__(self, socket: str = "", puerto: str = "5440",
                 usuario: str = "postgres", base: str = "postgres"):
        self.socket = socket or os.environ.get("MOTOR3_SOCKET", "")
        self.puerto = str(puerto or os.environ.get("MOTOR3_PUERTO", "5440"))
        self.usuario = usuario
        self.base = base
        if not shutil.which("psql"):
            raise SinPostgres(
                "No hay `psql` en este entorno. La base del motor 3 no se puede "
                "consultar, y NO se inventa un resultado vacio: un reporte de "
                "aprendizaje que dice 'cero cierres' cuando lo que pasa es que no "
                "hay base es indistinguible de uno correcto.")

    def _cmd(self, extra: list[str]) -> list[str]:
        c = ["psql", "-U", self.usuario, "-p", self.puerto, "-d", self.base,
             "-tA", "-v", "ON_ERROR_STOP=1", "--no-psqlrc"]
        if self.socket:
            c += ["-h", self.socket]
        return c + extra

    def correr(self, sql: str) -> str:
        r = subprocess.run(self._cmd(["-c", sql]), capture_output=True, text=True)
        if r.returncode:
            raise SinPostgres(f"psql fallo: {r.stderr.strip()[:400]}")
        return r.stdout

    def archivo(self, ruta: str) -> str:
        r = subprocess.run(self._cmd(["-f", ruta]), capture_output=True, text=True)
        if r.returncode:
            raise SinPostgres(f"psql fallo con {ruta}: {r.stderr.strip()[:400]}")
        return r.stdout

    def json(self, sql: str):
        """Corre una consulta que devuelve UNA columna JSON."""
        salida = self.correr(sql).strip()
        if not salida:
            return None
        return json.loads(salida)

    def vive(self) -> bool:
        try:
            self.correr("select 1;")
            return True
        except SinPostgres:
            return False

    # ------------------------------------------------------------- escritura
    def cargar_json(self, tabla_destino: str, filas: list[dict]) -> int:
        """Inserta filas mandando UN json y dejando que Postgres lo desarme.

        Asi ningun valor se pega dentro del SQL: el JSON entra como un literal con
        dollar-quoting y `jsonb_populate_recordset` lo convierte en filas con los
        tipos de la tabla.

        EL INSERT LLEVA LISTA DE COLUMNAS EXPLICITA, y hizo falta: sin ella,
        `jsonb_populate_recordset` produce la fila COMPLETA y las columnas que no
        van en el JSON entran como NULL explicito, **pisando el DEFAULT de la
        tabla**. El sintoma fue claro -- `null value in column "creada" violates
        not-null constraint` en una columna que tiene `DEFAULT now()`-- y la causa
        no lo es: un NULL explicito y una columna omitida se ven iguales en el
        JSON y son cosas distintas para Postgres.

        Todas las filas tienen que traer las MISMAS llaves. Si una trae una menos,
        esa columna entraria como NULL para todas.
        """
        if not filas:
            return 0
        columnas = list(filas[0])
        for i, f in enumerate(filas[1:], 1):
            if list(f) != columnas:
                raise SinPostgres(
                    f"la fila {i} de {tabla_destino} trae llaves distintas de la "
                    f"primera: {sorted(set(f) ^ set(columnas))}. Con llaves "
                    "distintas, la columna que le falta a una entraria como NULL "
                    "para todas.")
        crudo = json.dumps(filas, ensure_ascii=False)
        # El literal se cita con dollar-quoting, que no necesita escapar comillas.
        # La etiqueta lleva un sufijo improbable para que no choque con el
        # contenido -- si el contenido la trajera, el SQL se partiria--.
        etiqueta = "m3carga"
        assert f"${etiqueta}$" not in crudo, (
            "el contenido trae la etiqueta del dollar-quoting; se aborta en vez "
            "de mandar SQL partido")
        cols = ", ".join(columnas)
        sql = (f"INSERT INTO {tabla_destino} ({cols}) "
               f"SELECT {cols} FROM jsonb_populate_recordset("
               f"NULL::{tabla_destino}, ${etiqueta}${crudo}${etiqueta}$::jsonb);")
        self.correr(sql)
        return len(filas)


def cierres_para_el_aprendizaje(b: Base) -> list[dict]:
    """Los expedientes de cierre, con la forma que los tres lazos esperan.

    NO TOCA `contacto` NI `toque_destinatario`. Es la misma razon por la que
    `toque` no lleva a nadie: el corte de aprendizaje tiene que poder salir sin
    que nadie se acuerde de excluir columnas.
    """
    sql = """
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'llave', c.llave_de_corrida,
        'llave_de_reciclaje', c.llave_de_reciclaje,
        'empresa', c.empresa,
        'planta', c.planta,
        'senal_origen', jsonb_build_object(
            'fuente', s.fuente, 'tipo', s.tipo, 'familia', s.familia,
            'fecha_senal', s.fecha_senal, 'puntaje', s.puntaje,
            'veredicto', s.veredicto, 'desglose', s.desglose,
            'empata_padron', coalesce(s.empata_padron, false)),
        'destino', x.destino,
        'motivo', x.motivo,
        'convirtio', x.convirtio,
        'reaperturas_previas', x.reaperturas_previas,
        'dias_hasta_la_primera_respuesta', x.dias_hasta_primera_resp,
        'canal_que_funciono', x.canal_que_funciono,
        'proceso_del_cliente', x.proceso_del_cliente,
        'tipo_de_proyecto_cotizado', x.tipo_de_proyecto_cotizado,
        'toques', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                     'n', q.n, 'canal', q.canal, 'fecha', q.hecho_el,
                     'resultado', q.resultado,
                     'nivel_confianza_del_correo', q.nivel_del_correo)
                   ORDER BY q.n)
            FROM motor3.toque q WHERE q.tarjeta_id = x.tarjeta_id), '[]'::jsonb)
      ) AS x
      FROM motor3.cierre x
      JOIN motor3.cuenta c ON c.id = x.cuenta_id
      LEFT JOIN motor3.senal s ON s.id = x.senal_id
      ORDER BY x.emitido
    ) t;
    """
    return b.json(sql) or []


def resumen_del_piloto(b: Base) -> dict:
    """Lo que hay cargado, para poder decirlo en vez de suponerlo."""
    sql = """
    SELECT jsonb_build_object(
      'cuentas', (SELECT count(*) FROM motor3.cuenta),
      'senales', (SELECT count(*) FROM motor3.senal),
      'senales_evaluadas', (SELECT count(*) FROM motor3.senal WHERE evaluada),
      'senales_incompletas', (SELECT count(*) FROM motor3.senal_incompleta),
      'tarjetas_abiertas', (SELECT count(*) FROM motor3.tarjeta
                            WHERE estado = 'abierta'),
      'tarjetas_cerradas', (SELECT count(*) FROM motor3.tarjeta
                            WHERE estado = 'cerrada'),
      -- OPCION C de #340. Se cuenta APARTE de las cerradas a proposito: una
      -- cerrada se trabajo y termino, una vencida sin trabajar nunca se toco, y
      -- sumarlas esconde justo el numero que mide al equipo en vez del radar.
      'tarjetas_vencidas_sin_trabajar', (SELECT count(*) FROM motor3.tarjeta
                            WHERE estado = 'vencida_sin_trabajar'),
      'vencidas_reabiertas', (SELECT count(*) FROM motor3.tarjeta
                            WHERE reabierta_vencida),
      'toques', (SELECT count(*) FROM motor3.toque),
      'toques_pendientes', (SELECT count(*) FROM motor3.toque
                            WHERE resultado IS NULL),
      'cierres', (SELECT count(*) FROM motor3.cierre),
      'contactos', (SELECT count(*) FROM motor3.contacto),
      'desmentidos', (SELECT count(*) FROM motor3.desmentido)
    );
    """
    return b.json(sql) or {}
