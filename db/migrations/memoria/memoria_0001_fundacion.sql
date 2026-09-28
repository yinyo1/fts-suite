-- ═══════════════════════════════════════════════════════════════════════════
-- memoria_0001_fundacion.sql · Memoria de FTS (frente WhatsApp, issue #328)
--
-- Esquema memoria: bitácora única de eventos, sólo inserción, particionada por
-- mes; huella de idempotencia; canales; archivos; identidades; ruido;
-- respaldos; pruebas. Más el esquema memoria_pasarela para la base propia de
-- la pasarela (Evolution API), aislada del resto.
--
-- Reglas de db/README.md: idempotente, sin dólar-dólar (etiquetas con nombre),
-- sin contraseñas (roles NOLOGIN; la contraseña la pone el servicio de
-- mantenimiento desde una variable de Railway, nunca git). Numeración POR
-- MÓDULO (decisión D9 de #328): memoria_0001, memoria_0002…
--
-- Lo aplica memoria/db-migrate (n8n), con read-back. Nadie más.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS memoria;
COMMENT ON SCHEMA memoria IS
  'Memoria de FTS: bitácora única de eventos (WhatsApp, correo, juntas, kiosko, bancos). Sólo inserción. Dueño: frente WhatsApp (#328).';

-- ── Roles ──────────────────────────────────────────────────────────────────
DO $rol$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['memoria_captura','memoria_motor','memoria_admin',
                           'memoria_lector','memoria_pasarela'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$rol$;

COMMENT ON ROLE memoria_captura  IS 'Receptor de captura: sólo INSERT en la bitácora.';
COMMENT ON ROLE memoria_motor    IS 'Motores: leen todo, escriben derivados y (desde 0003) propuestas.';
COMMENT ON ROLE memoria_admin    IS 'Suite y mantenimiento: bandeja de canales, particiones, retención, respaldos.';
COMMENT ON ROLE memoria_lector   IS 'Otros módulos: sólo las vistas del contrato.';
COMMENT ON ROLE memoria_pasarela IS 'Evolution API: dueño de su propio esquema memoria_pasarela y nada más.';

GRANT USAGE ON SCHEMA memoria
  TO memoria_captura, memoria_motor, memoria_admin, memoria_lector;

-- Esquema aparte para la base de la pasarela. Evolution crea ahí sus tablas
-- con Prisma; no ve el esquema memoria ni ningún otro.
CREATE SCHEMA IF NOT EXISTS memoria_pasarela AUTHORIZATION memoria_pasarela;
COMMENT ON SCHEMA memoria_pasarela IS
  'Base interna de Evolution API (sesión de WhatsApp, caché). No es la memoria: la memoria es el esquema memoria.';

-- ── Guarda de sólo inserción ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION memoria.prohibir_cambio()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE EXCEPTION 'memoria.%: tabla sólo de inserción (% prohibido)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$guard$;

-- ── Catálogos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.fuente (
  clave        text PRIMARY KEY,
  descripcion  text NOT NULL,
  activa       boolean NOT NULL DEFAULT true,
  creada_en    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO memoria.fuente (clave, descripcion) VALUES
  ('whatsapp',        'WhatsApp en vivo vía pasarela (Evolution API)'),
  ('whatsapp_export', 'Exportación manual de chat de WhatsApp (histórico)'),
  ('correo',          'Correo vía Graph (#122)'),
  ('plaud',           'Grabaciones Plaud'),
  ('teams',           'Juntas de Teams'),
  ('kiosko',          'Eventos de asistencia del kiosko'),
  ('banco',           'Movimientos bancarios'),
  ('manual',          'Captura manual desde la suite'),
  ('prueba',          'Datos SINTÉTICOS de prueba. Nunca reales.')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS memoria.tipo_evento (
  clave        text PRIMARY KEY,
  es_ruido     boolean NOT NULL DEFAULT false,
  descripcion  text NOT NULL
);
INSERT INTO memoria.tipo_evento (clave, es_ruido, descripcion) VALUES
  ('mensaje',   false, 'Texto'),
  ('audio',     false, 'Audio o nota de voz'),
  ('imagen',    false, 'Foto'),
  ('video',     false, 'Video'),
  ('documento', false, 'Documento (PDF, XLSX, …)'),
  ('ubicacion', false, 'Ubicación compartida'),
  ('contacto',  false, 'Tarjeta de contacto'),
  ('edicion',   false, 'Edición de un mensaje anterior (evento_ref)'),
  ('borrado_en_origen', false, 'Alguien borró un mensaje en el origen (evento_ref)'),
  ('sistema',   false, 'Evento de sistema: altas, bajas, cambio de nombre del grupo'),
  ('reaccion',  true,  'Reacción (emoji) — ruido'),
  ('sticker',   true,  'Sticker — ruido'),
  ('acuse',     true,  'Texto de acuse sin contenido ("ok", "👍") — ruido')
ON CONFLICT (clave) DO NOTHING;

-- ── Canales (grupos) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.canal (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente           text NOT NULL REFERENCES memoria.fuente(clave),
  id_externo       text NOT NULL,
  nombre_actual    text NOT NULL,
  tipo_detectado   text NOT NULL DEFAULT 'sin_asignar',
  tipo_confirmado  text NULL,
  regla_deteccion  text NULL,
  estado_captura   text NOT NULL DEFAULT 'pendiente',
  es_prueba        boolean NOT NULL DEFAULT false,
  primera_vez      timestamptz NOT NULL DEFAULT now(),
  ultimo_evento    timestamptz NULL,
  CONSTRAINT canal_externo_uq UNIQUE (fuente, id_externo),
  CONSTRAINT canal_tipo_det_ck CHECK (tipo_detectado IN
    ('proyecto','levantamiento','compras','materiales','general','sin_asignar')),
  CONSTRAINT canal_tipo_conf_ck CHECK (tipo_confirmado IS NULL OR tipo_confirmado IN
    ('proyecto','levantamiento','compras','materiales','general','excluido')),
  CONSTRAINT canal_estado_ck CHECK (estado_captura IN
    ('pendiente','capturando','pausado','excluido'))
);
COMMENT ON COLUMN memoria.canal.estado_captura IS
  'Todo canal nuevo nace pendiente y NO se captura (sólo se registra) hasta que una persona lo pase a capturando.';

CREATE TABLE IF NOT EXISTS memoria.canal_historial (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canal_id      uuid NOT NULL REFERENCES memoria.canal(id),
  campo         text NOT NULL,
  valor_antes   text NULL,
  valor_despues text NULL,
  cambiado_por  text NOT NULL,
  cambiado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION memoria.canal_registrar_cambio()
RETURNS trigger LANGUAGE plpgsql AS $hist$
DECLARE quien text := coalesce(nullif(current_setting('memoria.actor', true), ''), current_user);
BEGIN
  IF NEW.nombre_actual IS DISTINCT FROM OLD.nombre_actual THEN
    INSERT INTO memoria.canal_historial (canal_id, campo, valor_antes, valor_despues, cambiado_por)
    VALUES (NEW.id, 'nombre_actual', OLD.nombre_actual, NEW.nombre_actual, quien);
  END IF;
  IF NEW.tipo_confirmado IS DISTINCT FROM OLD.tipo_confirmado THEN
    INSERT INTO memoria.canal_historial (canal_id, campo, valor_antes, valor_despues, cambiado_por)
    VALUES (NEW.id, 'tipo_confirmado', OLD.tipo_confirmado, NEW.tipo_confirmado, quien);
  END IF;
  IF NEW.tipo_detectado IS DISTINCT FROM OLD.tipo_detectado THEN
    INSERT INTO memoria.canal_historial (canal_id, campo, valor_antes, valor_despues, cambiado_por)
    VALUES (NEW.id, 'tipo_detectado', OLD.tipo_detectado, NEW.tipo_detectado, quien);
  END IF;
  IF NEW.estado_captura IS DISTINCT FROM OLD.estado_captura THEN
    INSERT INTO memoria.canal_historial (canal_id, campo, valor_antes, valor_despues, cambiado_por)
    VALUES (NEW.id, 'estado_captura', OLD.estado_captura, NEW.estado_captura, quien);
  END IF;
  RETURN NEW;
END
$hist$;

DROP TRIGGER IF EXISTS canal_historial_trg ON memoria.canal;
CREATE TRIGGER canal_historial_trg AFTER UPDATE ON memoria.canal
  FOR EACH ROW EXECUTE FUNCTION memoria.canal_registrar_cambio();

DROP TRIGGER IF EXISTS canal_historial_solo_insert ON memoria.canal_historial;
CREATE TRIGGER canal_historial_solo_insert BEFORE UPDATE OR DELETE ON memoria.canal_historial
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

-- ── Identidades (el dato personal vive SÓLO aquí) ─────────────────────────
CREATE TABLE IF NOT EXISTS memoria.identidad (
  autor_ref        text PRIMARY KEY,     -- 'whatsapp:<hmac del número>' (con pimienta secreta)
  fuente           text NOT NULL REFERENCES memoria.fuente(clave),
  valor_externo    text NOT NULL,        -- número / correo real. NUNCA al repo.
  nombre_mostrado  text NULL,
  odoo_employee_id integer NULL,
  odoo_partner_id  integer NULL,
  es_externo       boolean NOT NULL DEFAULT false,
  primera_vez      timestamptz NOT NULL DEFAULT now()
);

-- ── Archivos (los binarios NO van en Postgres) ────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.archivo (
  sha256          char(64) PRIMARY KEY,
  bytes           bigint NOT NULL,
  mime            text NOT NULL,
  nombre_original text NULL,
  clase           text NOT NULL DEFAULT 'media_general',
  rol             text NOT NULL DEFAULT 'original',
  deriva_de       char(64) NULL REFERENCES memoria.archivo(sha256),
  nivel_objetivo  text NOT NULL DEFAULT 'caliente',
  primera_vez     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archivo_sha_ck   CHECK (length(sha256) = 64 AND sha256 !~ '[^0-9a-f]'),
  CONSTRAINT archivo_clase_ck CHECK (clase IN
    ('media_general','audio','video','documento','ticket','evidencia_acta','export_historico')),
  CONSTRAINT archivo_rol_ck   CHECK (rol IN ('original','comprimido','miniatura')),
  CONSTRAINT archivo_nivel_ck CHECK (nivel_objetivo IN ('caliente','frio')),
  CONSTRAINT archivo_deriva_ck CHECK ((rol = 'original') = (deriva_de IS NULL))
);
COMMENT ON COLUMN memoria.archivo.nivel_objetivo IS
  'Video original: frio desde el día uno (ajuste 2 de #328). Hasta que exista Azure vive en el bucket bajo el prefijo frio/.';

CREATE TABLE IF NOT EXISTS memoria.archivo_ubicacion (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256         char(64) NOT NULL REFERENCES memoria.archivo(sha256),
  proveedor      text NOT NULL,
  contenedor     text NOT NULL,
  ruta           text NOT NULL,
  nivel          text NOT NULL,
  evento         text NOT NULL,
  sha256_leido   char(64) NULL,
  registrado_en  timestamptz NOT NULL DEFAULT now(),
  registrado_por text NOT NULL DEFAULT current_user,
  CONSTRAINT ubic_proveedor_ck CHECK (proveedor IN
    ('railway_bucket','azure_blob','sharepoint','odoo_attachment')),
  CONSTRAINT ubic_nivel_ck  CHECK (nivel  IN ('caliente','tibio','frio','archivo')),
  CONSTRAINT ubic_evento_ck CHECK (evento IN ('alta','verificada','retirada')),
  CONSTRAINT ubic_verificada_ck CHECK (evento <> 'verificada' OR sha256_leido = sha256)
);
CREATE INDEX IF NOT EXISTS archivo_ubicacion_sha_idx ON memoria.archivo_ubicacion (sha256);

CREATE TABLE IF NOT EXISTS memoria.archivo_clase (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256  char(64) NOT NULL REFERENCES memoria.archivo(sha256),
  clase   text NOT NULL,
  motivo  text NOT NULL,
  por     text NOT NULL DEFAULT current_user,
  en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archivo_clase_hist_ck CHECK (clase IN
    ('media_general','audio','video','documento','ticket','evidencia_acta','export_historico'))
);

CREATE TABLE IF NOT EXISTS memoria.archivo_derivado (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sha256      char(64) NOT NULL REFERENCES memoria.archivo(sha256),
  tipo        text NOT NULL,
  proveedor   text NOT NULL,
  version     text NOT NULL,
  idioma      text NULL,
  contenido   text NOT NULL,
  confianza   numeric(4,3) NULL,
  costo_usd   numeric(10,5) NULL,
  es_simulado boolean NOT NULL DEFAULT false,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT derivado_tipo_ck CHECK (tipo IN
    ('transcripcion','descripcion_imagen','ocr','resumen_video')),
  CONSTRAINT derivado_uq UNIQUE (sha256, tipo, proveedor, version)
);

DO $trg$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['archivo_ubicacion','archivo_clase','archivo_derivado'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON memoria.%I', t || '_solo_insert', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON memoria.%I '
                   'FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio()', t || '_solo_insert', t);
  END LOOP;
END
$trg$;

-- ── Bitácora de eventos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.evento (
  seq            bigint GENERATED ALWAYS AS IDENTITY,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  ocurrido_en    timestamptz NOT NULL,
  capturado_en   timestamptz NOT NULL DEFAULT now(),
  fuente         text NOT NULL REFERENCES memoria.fuente(clave),
  tipo           text NOT NULL REFERENCES memoria.tipo_evento(clave),
  canal_id       uuid NULL REFERENCES memoria.canal(id),
  autor_ref      text NOT NULL,
  texto          text NULL,
  archivo_sha256 char(64) NULL REFERENCES memoria.archivo(sha256),
  evento_ref     uuid NULL,
  metadatos      jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibilidad    text NOT NULL DEFAULT 'interno',
  huella         char(64) NOT NULL,
  PRIMARY KEY (ocurrido_en, seq),
  CONSTRAINT evento_visibilidad_ck CHECK (visibilidad = 'interno')
) PARTITION BY RANGE (ocurrido_en);

COMMENT ON COLUMN memoria.evento.visibilidad IS
  'Siempre interno. Lo publicable sale SÓLO por la vista v_evento_publicable tras una decisión aprobada (D11).';
COMMENT ON COLUMN memoria.evento.seq IS
  'Orden de captura. Los motores leen por seq > cursor, con ventana de estabilidad de 2 min (ARQUITECTURA §3.8).';

CREATE TABLE IF NOT EXISTS memoria.evento_default PARTITION OF memoria.evento DEFAULT;
COMMENT ON TABLE memoria.evento_default IS
  'Red de seguridad. Debe estar VACÍA: si tiene renglones faltó una partición (señal al watchdog).';

-- Triggers de fila en la tabla padre se propagan a todas las particiones (PG ≥ 13).
DROP TRIGGER IF EXISTS evento_solo_insert ON memoria.evento;
CREATE TRIGGER evento_solo_insert BEFORE UPDATE OR DELETE ON memoria.evento
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

CREATE OR REPLACE FUNCTION memoria.prohibir_truncate()
RETURNS trigger LANGUAGE plpgsql AS $trunc$
BEGIN
  RAISE EXCEPTION 'memoria.%: TRUNCATE prohibido', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$trunc$;
DROP TRIGGER IF EXISTS evento_sin_truncate ON memoria.evento;
CREATE TRIGGER evento_sin_truncate BEFORE TRUNCATE ON memoria.evento
  FOR EACH STATEMENT EXECUTE FUNCTION memoria.prohibir_truncate();

CREATE INDEX IF NOT EXISTS evento_seq_idx     ON memoria.evento (seq);
CREATE INDEX IF NOT EXISTS evento_canal_idx   ON memoria.evento (canal_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS evento_tipo_idx    ON memoria.evento (tipo, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS evento_archivo_idx ON memoria.evento (archivo_sha256) WHERE archivo_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS evento_id_idx      ON memoria.evento (id);
CREATE INDEX IF NOT EXISTS evento_texto_fts   ON memoria.evento
  USING gin (to_tsvector('spanish', coalesce(texto, '')));

-- Idempotencia global (no particionada).
CREATE TABLE IF NOT EXISTS memoria.huella (
  huella        char(64) PRIMARY KEY,
  evento_id     uuid NOT NULL,
  ocurrido_en   timestamptz NOT NULL,
  registrada_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT huella_hex_ck CHECK (length(huella) = 64 AND huella !~ '[^0-9a-f]')
);
DROP TRIGGER IF EXISTS huella_solo_insert ON memoria.huella;
CREATE TRIGGER huella_solo_insert BEFORE UPDATE OR DELETE ON memoria.huella
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

-- ── Particiones automáticas ───────────────────────────────────────────────
-- SECURITY DEFINER: crea particiones con los permisos del dueño del esquema.
-- La llama un Schedule diario (inactivo hasta resolver la capacidad de n8n) y,
-- mientras tanto, el servicio de mantenimiento en cada corrida.
CREATE OR REPLACE FUNCTION memoria.asegurar_particiones_desde(desde date, meses_adelante int DEFAULT 3)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp AS $part$
DECLARE
  d      date := date_trunc('month', desde)::date;
  fin    date := (date_trunc('month', now()) + make_interval(months => meses_adelante))::date;
  nombre text;
  n      int := 0;
BEGIN
  IF desde < date '2015-01-01' THEN
    RAISE EXCEPTION 'asegurar_particiones_desde: fecha % sospechosa (antes de 2015)', desde;
  END IF;
  WHILE d <= fin LOOP
    nombre := format('evento_%s', to_char(d, 'YYYY_MM'));
    IF to_regclass('memoria.' || nombre) IS NULL THEN
      EXECUTE format('CREATE TABLE memoria.%I PARTITION OF memoria.evento FOR VALUES FROM (%L) TO (%L)',
                     nombre, d, (d + interval '1 month')::date);
      n := n + 1;
    END IF;
    d := (d + interval '1 month')::date;
  END LOOP;
  RETURN n;
END
$part$;

CREATE OR REPLACE FUNCTION memoria.asegurar_particiones(meses_adelante int DEFAULT 3)
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = memoria, pg_temp AS $part2$
  SELECT memoria.asegurar_particiones_desde((now() - interval '1 month')::date, meses_adelante);
$part2$;

REVOKE ALL ON FUNCTION memoria.asegurar_particiones_desde(date, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION memoria.asegurar_particiones(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memoria.asegurar_particiones(int)           TO memoria_admin, memoria_captura;
GRANT EXECUTE ON FUNCTION memoria.asegurar_particiones_desde(date, int) TO memoria_admin;

SELECT memoria.asegurar_particiones(3);

-- ── Ruido ─────────────────────────────────────────────────────────────────
-- Única tabla que se purga (a los 30 días), por eso NO es la bitácora.
CREATE TABLE IF NOT EXISTS memoria.ruido_buffer (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canal_id    uuid NULL REFERENCES memoria.canal(id),
  tipo        text NOT NULL REFERENCES memoria.tipo_evento(clave),
  autor_ref   text NOT NULL,
  ocurrido_en timestamptz NOT NULL,
  huella      char(64) NOT NULL UNIQUE,
  payload     jsonb NOT NULL,
  capturado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memoria.ruido_conteo (
  canal_id  uuid NOT NULL REFERENCES memoria.canal(id),
  dia       date NOT NULL,
  tipo      text NOT NULL,
  n         int  NOT NULL,
  PRIMARY KEY (canal_id, dia, tipo)
);

-- ── Respaldos y pruebas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.respaldo (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo        text NOT NULL,
  destino     text NOT NULL,
  bytes       bigint NULL,
  sha256      char(64) NULL,
  manifiesto  jsonb NULL,
  ok          boolean NOT NULL,
  error       text NULL,
  inicio      timestamptz NOT NULL,
  fin         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT respaldo_tipo_ck CHECK (tipo IN ('pg_dump','archivos_reconciliacion'))
);
CREATE TABLE IF NOT EXISTS memoria.respaldo_prueba (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  respaldo_id    bigint NULL REFERENCES memoria.respaldo(id),
  ok             boolean NOT NULL,
  verificaciones jsonb NOT NULL,
  duracion_s     int NOT NULL,
  en             timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memoria.prueba_corrida (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  corrida   uuid NOT NULL,
  suite     text NOT NULL,
  caso      text NOT NULL,
  esperado  text NOT NULL,
  obtenido  text NOT NULL,
  ok        boolean NOT NULL,
  en        timestamptz NOT NULL DEFAULT now()
);

DO $trg2$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['respaldo','respaldo_prueba','prueba_corrida'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON memoria.%I', t || '_solo_insert', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON memoria.%I '
                   'FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio()', t || '_solo_insert', t);
  END LOOP;
END
$trg2$;

-- ── Permisos ──────────────────────────────────────────────────────────────
-- Nadie tiene UPDATE/DELETE sobre la bitácora; el trigger lo cierra aunque
-- alguien lo otorgue por error.
REVOKE ALL ON ALL TABLES IN SCHEMA memoria FROM PUBLIC;

-- captura (receptor)
GRANT SELECT ON memoria.fuente, memoria.tipo_evento TO memoria_captura;
GRANT SELECT, INSERT ON memoria.canal TO memoria_captura;
GRANT UPDATE (nombre_actual, ultimo_evento, tipo_detectado, regla_deteccion) ON memoria.canal TO memoria_captura;
GRANT INSERT ON memoria.canal_historial TO memoria_captura;
GRANT INSERT ON memoria.evento, memoria.huella, memoria.archivo_ubicacion,
               memoria.ruido_buffer, memoria.prueba_corrida TO memoria_captura;
GRANT SELECT, INSERT ON memoria.archivo, memoria.identidad TO memoria_captura;
GRANT SELECT (huella, evento_id) ON memoria.huella TO memoria_captura;
GRANT SELECT (huella) ON memoria.ruido_buffer TO memoria_captura;

-- motor
GRANT SELECT ON memoria.fuente, memoria.tipo_evento, memoria.canal, memoria.canal_historial,
               memoria.evento, memoria.huella, memoria.archivo, memoria.archivo_ubicacion,
               memoria.archivo_clase, memoria.archivo_derivado, memoria.ruido_conteo
  TO memoria_motor;
GRANT SELECT (autor_ref, fuente, nombre_mostrado, odoo_employee_id, odoo_partner_id, es_externo, primera_vez)
  ON memoria.identidad TO memoria_motor;       -- sin valor_externo (el número)
GRANT INSERT ON memoria.archivo_derivado, memoria.prueba_corrida TO memoria_motor;

-- admin (suite y mantenimiento)
GRANT SELECT ON ALL TABLES IN SCHEMA memoria TO memoria_admin;
GRANT UPDATE (tipo_confirmado, estado_captura, es_prueba) ON memoria.canal TO memoria_admin;
GRANT INSERT ON memoria.canal_historial, memoria.archivo_ubicacion, memoria.archivo_clase,
               memoria.respaldo, memoria.respaldo_prueba, memoria.prueba_corrida TO memoria_admin;
GRANT INSERT, UPDATE ON memoria.ruido_conteo, memoria.identidad TO memoria_admin;
GRANT SELECT, DELETE ON memoria.ruido_buffer TO memoria_admin;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA memoria
  TO memoria_captura, memoria_motor, memoria_admin;

-- El renglón de public.schema_migrations lo inserta el runner con el sha256 real.
