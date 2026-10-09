-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0001 · fundación del esquema `bancos` (fts-bancos, issue #331)
--
-- Base bancaria propia de Servicios FTS: la verdad es el PDF del banco.
-- Numeración POR MÓDULO (bancos_0001, bancos_0002…): la aplica el runner
-- `bancos/db-migrate`, no `comercial/db-migrate` (ése exige versión de tres dígitos).
--
-- Reglas de este esquema:
--   1. Nada se borra. El rol de aplicación no tiene DELETE ni TRUNCATE.
--   2. Todo es append con versión: un archivo reprocesado con otro parser crea
--      un estado NUEVO (UNIQUE archivo+parser_version); el anterior se queda.
--   3. Montos en NUMERIC(18,2) y en la moneda original, siempre.
--   4. SIN DATOS: los números de cuenta completos los siembra el procesador
--      desde una variable de entorno, nunca desde git (el repo es público).
--   5. Etiquetas de dólar CON NOMBRE ($rol$, $inm$), nunca dos signos de dólar juntos (db/README.md regla 4).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS bancos;
COMMENT ON SCHEMA bancos IS
  'fts-bancos: estados de cuenta (PDF) como fuente de verdad, triple validación, clasificación y cotejo read-only contra Odoo. Issue #331.';

-- ── Rol de aplicación ──
-- NOLOGIN y sin contraseña: la contraseña no vive en git. Mientras no tenga
-- LOGIN, el procesador conecta con la cuenta de administración y hace
-- SET ROLE bancos_app, así los permisos EFECTIVOS son los de abajo.
DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bancos_app') THEN
    CREATE ROLE bancos_app NOLOGIN;
  END IF;
END
$rol$;

GRANT USAGE ON SCHEMA bancos TO bancos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA bancos GRANT SELECT, INSERT ON TABLES TO bancos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA bancos GRANT USAGE, SELECT ON SEQUENCES TO bancos_app;

-- ── cuentas ──
CREATE TABLE IF NOT EXISTS bancos.cuentas (
  id            serial PRIMARY KEY,
  banco         text        NOT NULL,
  alias         text        NOT NULL,
  numero        text        NOT NULL UNIQUE,
  numero_mask   text        GENERATED ALWAYS AS ('…' || right(numero, 4)) STORED,
  clabe         text        UNIQUE,
  moneda        char(3)     NOT NULL CHECK (moneda IN ('MXN','USD')),
  journal_odoo  integer,
  entidad       text        NOT NULL,
  rfc           text,
  tipo          text        NOT NULL DEFAULT 'cuenta' CHECK (tipo IN ('cuenta','tarjeta','plataforma')),
  carpeta       text,
  activa        boolean     NOT NULL DEFAULT true,
  creado_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bancos.cuentas IS 'Cuentas propias. La identificación de un estado es SIEMPRE por número/CLABE del encabezado del PDF, nunca por el nombre del archivo.';

-- ── corridas (log de cada ejecución) ──
CREATE TABLE IF NOT EXISTS bancos.corridas (
  id              bigserial PRIMARY KEY,
  iniciada_at     timestamptz NOT NULL DEFAULT now(),
  terminada_at    timestamptz,
  origen          text        NOT NULL,          -- cron | manual | fixture | reproceso | inventario
  disparada_por   text,
  parser_version  text        NOT NULL,
  leidos          integer     NOT NULL DEFAULT 0,
  validados       integer     NOT NULL DEFAULT 0,
  rechazados      integer     NOT NULL DEFAULT 0,
  duplicados      integer     NOT NULL DEFAULT 0,
  graph_ok        boolean,
  resumen         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error           text
);

CREATE TABLE IF NOT EXISTS bancos.corrida_eventos (
  id          bigserial PRIMARY KEY,
  corrida_id  bigint      NOT NULL REFERENCES bancos.corridas(id),
  nivel       text        NOT NULL CHECK (nivel IN ('info','aviso','rechazo','error')),
  archivo_sha text,
  codigo      text        NOT NULL,
  mensaje     text        NOT NULL,
  datos       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_at   timestamptz NOT NULL DEFAULT now()
);

-- ── blobs: los bytes originales, para reprocesar sin depender de OneDrive ──
CREATE TABLE IF NOT EXISTS bancos.blobs (
  sha256     text        PRIMARY KEY CHECK (char_length(sha256) = 64 AND sha256 !~ '[^0-9a-f]'),
  bytes      integer     NOT NULL,
  contenido  bytea       NOT NULL,
  creado_at  timestamptz NOT NULL DEFAULT now()
);

-- ── archivos: uno por sha256 (duplicado exacto = mismo renglón) ──
CREATE TABLE IF NOT EXISTS bancos.archivos (
  id               bigserial PRIMARY KEY,
  sha256           text        NOT NULL UNIQUE REFERENCES bancos.blobs(sha256),
  nombre_original  text        NOT NULL,
  nombre_canonico  text,
  zip_origen_id    bigint      REFERENCES bancos.archivos(id),
  ruta_en_zip      text,
  origen           text        NOT NULL,          -- buzon | onedrive | sharepoint | fixture | zip
  graph_drive_id   text,
  graph_item_id    text,
  ruta_origen      text,
  ruta_canonica    text,
  subido_por       text,
  subido_at        timestamptz,
  recibido_at      timestamptz NOT NULL DEFAULT now(),
  tipo_detectado   text,                           -- bbva_estado | zip | jeeves | payana | desconocido
  cuenta_id        integer     REFERENCES bancos.cuentas(id),
  periodo          char(7),                        -- AAAA-MM según el PDF
  estado           text        NOT NULL DEFAULT 'recibido'
                   CHECK (estado IN ('recibido','validado','rechazado','duplicado','sospechoso','formato_no_soportado','contenedor','no_cuadra')),
  motivo           text,
  corrida_id       bigint      REFERENCES bancos.corridas(id),
  actualizado_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS archivos_cuenta_periodo ON bancos.archivos (cuenta_id, periodo);

-- cada vez que el mismo contenido aparece en otro lugar/nombre
CREATE TABLE IF NOT EXISTS bancos.avistamientos (
  id               bigserial PRIMARY KEY,
  archivo_id       bigint      NOT NULL REFERENCES bancos.archivos(id),
  nombre           text        NOT NULL,
  origen           text        NOT NULL,
  graph_drive_id   text,
  graph_item_id    text,
  ruta             text,
  corrida_id       bigint      REFERENCES bancos.corridas(id),
  visto_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (archivo_id, graph_item_id)
);

-- ── estados: un estado de cuenta leído por una versión del parser ──
CREATE TABLE IF NOT EXISTS bancos.estados (
  id                bigserial PRIMARY KEY,
  archivo_id        bigint        NOT NULL REFERENCES bancos.archivos(id),
  cuenta_id         integer       NOT NULL REFERENCES bancos.cuentas(id),
  periodo           char(7)       NOT NULL,
  periodo_inicio    date          NOT NULL,
  periodo_fin       date          NOT NULL,
  parser            text          NOT NULL,
  parser_version    text          NOT NULL,
  moneda            char(3)       NOT NULL,
  saldo_inicial     numeric(18,2) NOT NULL,
  saldo_final       numeric(18,2) NOT NULL,
  total_cargos      numeric(18,2) NOT NULL,
  num_cargos        integer       NOT NULL,
  total_abonos      numeric(18,2) NOT NULL,
  num_abonos        integer       NOT NULL,
  comisiones        numeric(18,2),
  paginas           jsonb         NOT NULL DEFAULT '{}'::jsonb,   -- dato -> página
  num_movimientos   integer       NOT NULL,
  num_saldos_impresos integer     NOT NULL,
  v1_ok             boolean       NOT NULL,
  v1_detalle        jsonb         NOT NULL,
  v2_ok             boolean       NOT NULL,
  v2_detalle        jsonb         NOT NULL,
  huella            text          NOT NULL,        -- sha256 de los hashes de movimiento en orden
  corrida_id        bigint        REFERENCES bancos.corridas(id),
  creado_at         timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (archivo_id, parser_version)
);
CREATE INDEX IF NOT EXISTS estados_cuenta_periodo ON bancos.estados (cuenta_id, periodo);

-- V3 depende de los vecinos, que llegan después: se registra aparte, append.
CREATE TABLE IF NOT EXISTS bancos.validaciones_v3 (
  id              bigserial PRIMARY KEY,
  estado_id       bigint        NOT NULL REFERENCES bancos.estados(id),
  resultado       text          NOT NULL CHECK (resultado IN ('ok','hueco','descuadre','sin_anterior','primero')),
  estado_anterior_id bigint     REFERENCES bancos.estados(id),
  diferencia      numeric(18,2),
  detalle         jsonb         NOT NULL DEFAULT '{}'::jsonb,
  corrida_id      bigint        REFERENCES bancos.corridas(id),
  creado_at       timestamptz   NOT NULL DEFAULT now()
);

-- duplicado lógico: misma cuenta + periodo con OTRO sha256
CREATE TABLE IF NOT EXISTS bancos.duplicados_logicos (
  id            bigserial PRIMARY KEY,
  estado_id     bigint      NOT NULL REFERENCES bancos.estados(id),
  duplicado_de  bigint      NOT NULL REFERENCES bancos.estados(id),
  mismo_contenido boolean   NOT NULL,       -- misma huella de movimientos
  detalle       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estado_id, duplicado_de)
);

-- ── movimientos ──
CREATE TABLE IF NOT EXISTS bancos.movimientos (
  id                        bigserial PRIMARY KEY,
  estado_id                 bigint        NOT NULL REFERENCES bancos.estados(id),
  cuenta_id                 integer       NOT NULL REFERENCES bancos.cuentas(id),
  renglon                   integer       NOT NULL,
  pagina                    integer       NOT NULL,
  fecha_operacion           date          NOT NULL,
  fecha_liquidacion         date,
  codigo                    text,
  descripcion               text          NOT NULL,
  referencia                text,
  contraparte               text,
  cargo                     numeric(18,2) NOT NULL DEFAULT 0 CHECK (cargo >= 0),
  abono                     numeric(18,2) NOT NULL DEFAULT 0 CHECK (abono >= 0),
  saldo_operacion_impreso   numeric(18,2),
  saldo_liquidacion_impreso numeric(18,2),
  saldo_calculado           numeric(18,2) NOT NULL,
  hash                      text          NOT NULL,
  creado_at                 timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (estado_id, renglon),
  UNIQUE (estado_id, hash),
  CHECK ((cargo > 0) <> (abono > 0))
);
CREATE INDEX IF NOT EXISTS movimientos_cuenta_fecha ON bancos.movimientos (cuenta_id, fecha_operacion);

-- ── reglas y clasificación (append con versión) ──
CREATE TABLE IF NOT EXISTS bancos.reglas (
  id            serial PRIMARY KEY,
  prioridad     integer     NOT NULL,
  nombre        text        NOT NULL UNIQUE,
  codigo_banco  text,                        -- regex sobre el código (T17, S39…)
  patron        text,                        -- regex sobre descripción+referencia
  sentido       text        CHECK (sentido IN ('cargo','abono')),
  categoria     text        NOT NULL,
  subcategoria  text,
  contraparte   text,
  origen        text        NOT NULL DEFAULT 'base',   -- base | semilla_xlsx | manual
  activa        boolean     NOT NULL DEFAULT true,
  creado_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bancos.clasificacion (
  id                  bigserial PRIMARY KEY,
  movimiento_id       bigint        NOT NULL REFERENCES bancos.movimientos(id),
  version             integer       NOT NULL,
  categoria           text          NOT NULL,
  subcategoria        text,
  contraparte         text,
  es_traspaso_interno boolean       NOT NULL DEFAULT false,
  par_traspaso_id     bigint        REFERENCES bancos.movimientos(id),
  regla               text,
  origen_regla        text,
  confianza           numeric(4,3)  NOT NULL CHECK (confianza BETWEEN 0 AND 1),
  revisado_por        text,
  corrida_id          bigint        REFERENCES bancos.corridas(id),
  creado_at           timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (movimiento_id, version)
);

CREATE OR REPLACE VIEW bancos.clasificacion_vigente AS
SELECT DISTINCT ON (movimiento_id) *
FROM bancos.clasificacion
ORDER BY movimiento_id, version DESC;

-- ── cotejo contra Odoo (read-only del lado de Odoo) ──
CREATE TABLE IF NOT EXISTS bancos.cotejo_odoo (
  id              bigserial PRIMARY KEY,
  corrida_id      bigint        NOT NULL REFERENCES bancos.corridas(id),
  movimiento_id   bigint        REFERENCES bancos.movimientos(id),
  journal_id      integer       NOT NULL,
  odoo_line_id    integer,
  odoo_move_id    integer,
  odoo_payment_id integer,
  odoo_fecha      date,
  odoo_monto      numeric(18,2),
  odoo_ref        text,
  estado          text          NOT NULL CHECK (estado IN ('exacto','probable','sin_match','odoo_sin_banco')),
  dif_dias        integer,
  dif_monto       numeric(18,2),
  detalle         jsonb         NOT NULL DEFAULT '{}'::jsonb,
  creado_at       timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cotejo_corrida ON bancos.cotejo_odoo (corrida_id);

-- ── huecos ──
CREATE TABLE IF NOT EXISTS bancos.huecos (
  id                 bigserial PRIMARY KEY,
  cuenta_id          integer       NOT NULL REFERENCES bancos.cuentas(id),
  periodo            char(7)       NOT NULL,
  motivo             text          NOT NULL,     -- faltante | continuidad | no_cuadra
  monto_diferencia   numeric(18,2),
  detalle            jsonb         NOT NULL DEFAULT '{}'::jsonb,
  detectado_en       timestamptz   NOT NULL DEFAULT now(),
  solicitado_en      timestamptz,
  veces_solicitado   integer       NOT NULL DEFAULT 0,
  resuelto_en        timestamptz,
  resuelto_por_estado_id bigint    REFERENCES bancos.estados(id),
  UNIQUE (cuenta_id, periodo, motivo)
);

-- ── Permisos finos ──
-- Tablas inmutables: sólo SELECT/INSERT (vienen del default). Las que llevan
-- estado de vida reciben UPDATE sólo en las columnas que cambian.
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA bancos TO bancos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA bancos TO bancos_app;
GRANT UPDATE (terminada_at, leidos, validados, rechazados, duplicados, graph_ok, resumen, error)
  ON bancos.corridas TO bancos_app;
GRANT UPDATE (nombre_canonico, ruta_canonica, graph_drive_id, graph_item_id, ruta_origen, tipo_detectado,
              cuenta_id, periodo, estado, motivo, corrida_id, actualizado_at)
  ON bancos.archivos TO bancos_app;
GRANT UPDATE (monto_diferencia, detalle, solicitado_en, veces_solicitado, resuelto_en, resuelto_por_estado_id)
  ON bancos.huecos TO bancos_app;
GRANT UPDATE (activa) ON bancos.cuentas TO bancos_app;
GRANT UPDATE (activa, prioridad) ON bancos.reglas TO bancos_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA bancos FROM bancos_app;

-- El renglón de public.schema_migrations lo escribe el runner con el sha256 real.
