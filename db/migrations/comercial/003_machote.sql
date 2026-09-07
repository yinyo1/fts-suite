-- ═══════════════════════════════════════════════════════════════════════════
-- 003_machote.sql · el machote y su historial de versiones
-- Issue #140 · decisiones de Esteban del 6-sep-2026
--
-- El requisito de negocio, en sus palabras: que funcione como el historial de
-- versiones de SharePoint —abrir cualquier versión anterior y verla completa
-- tal como estaba—, con dos diferencias:
--
--   · VER NO ES RESTAURAR. No se vuelve a una versión anterior. La orden se
--     confirma con la última y esa queda como definitiva.
--   · El MOTIVO del cambio es obligatorio cuando cambian comisiones o margen.
--     El caso que lo motivó: se modificaba el machote al final para cambiar el
--     reparto de comisiones y no quedaba rastro de qué había cambiado.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ La identidad estable ═══════════════════════════════════════════════════
-- Muta poco: es "de qué cotización estamos hablando". Todo lo que cambia vive
-- en las versiones.
CREATE TABLE IF NOT EXISTS comercial.machote (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- El id que trae el navegador ('M-1757…'). NO es la llave (regla 3): es
  -- único por navegador, no entre personas, y dos capturando a la vez pueden
  -- colisionar. Se guarda para poder reconciliar lo que ya está capturado y
  -- lo que llegue de los archivos de rescate.
  id_local       text,

  -- Referencias EXTERNAS a Odoo, sin llave foránea contra nada (regla 3).
  -- El día que un dominio salga de Odoo, esto no queda apuntando a ids que
  -- dejaron de existir.
  odoo_lead_id   integer,
  odoo_so_id     integer,
  odoo_partner_id integer,

  -- Quién es dueño de la cotización. `sub` del token de auth/suite-login
  -- (`ses.actor` del lado del navegador).
  dueno          text        NOT NULL,
  dueno_nombre   text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text        NOT NULL DEFAULT current_user,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     text,
  deleted_at     timestamptz,

  CONSTRAINT machote_dueno_no_vacio_ck CHECK (length(btrim(dueno)) > 0)
);

COMMENT ON TABLE comercial.machote IS
  'Identidad estable de una cotización. Lo que cambia vive en machote_version. No espejea Odoo (regla 6): guarda referencias, no copias.';
COMMENT ON COLUMN comercial.machote.id_local IS
  'El id del navegador. Para reconciliar lo capturado antes del servidor; NO es la llave.';

CREATE INDEX IF NOT EXISTS machote_dueno_idx
  ON comercial.machote (dueno) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS machote_so_idx
  ON comercial.machote (odoo_so_id) WHERE odoo_so_id IS NOT NULL AND deleted_at IS NULL;

-- Un id de navegador no se importa dos veces. Parcial para que el borrado
-- lógico libere el hueco, igual que el dedupe de evidencia en 002.
CREATE UNIQUE INDEX IF NOT EXISTS machote_id_local_uq
  ON comercial.machote (id_local) WHERE id_local IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS machote_touch ON comercial.machote;
CREATE TRIGGER machote_touch BEFORE UPDATE ON comercial.machote
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();


-- ══ El historial. APPEND-ONLY ══════════════════════════════════════════════
-- Cada revisión es una fila nueva. Ninguna se toca después de escrita: es lo
-- que permite comparar cotizado contra ejecutado, y sin eso el histórico se
-- pierde cada vez que alguien revisa una cotización.
--
-- `documento` es jsonb (decisión de Esteban, 6-sep): el machote va a cambiar
-- de forma varias veces este año y las columnas rígidas obligarían a migrar
-- en cada cambio. Las columnas de abajo son SÓLO lo que se consulta y ordena.
CREATE TABLE IF NOT EXISTS comercial.machote_version (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  machote_id     uuid        NOT NULL REFERENCES comercial.machote(id),
  version        integer     NOT NULL,

  -- Quién y cuándo. `autor` es el `sub` del token, no un campo que alguien
  -- teclea: hasta V1.16 el autor quedaba vacío en todo machote real.
  autor          text        NOT NULL,
  autor_nombre   text,
  creada_at      timestamptz NOT NULL DEFAULT now(),

  estado         text        NOT NULL,

  -- Por qué cambió. Obligatorio cuando cambian comisiones o margen; el
  -- trigger de abajo lo hace cumplir contra la versión anterior.
  motivo         text,

  -- ── EL CONGELADO ──
  -- El documento completo tal como estaba: precios, tipo de cambio y su
  -- fuente incluidos. Esto es lo que se abre al ver una versión vieja.
  documento      jsonb       NOT NULL,

  -- ── Lo consultable, extraído del documento al escribir ──
  -- Duplican lo que ya está en `documento` A PROPÓSITO: ordenar y filtrar por
  -- jsonb en cada consulta es caro, y estos cuatro no cambian de forma.
  total          numeric(16,2),
  margen         numeric(8,6),
  moneda         text,
  tc             numeric(14,6),
  tc_fuente      text,
  comision_fts     numeric(8,6),
  comision_cliente numeric(8,6),

  created_by     text        NOT NULL DEFAULT current_user,

  CONSTRAINT mv_version_positiva_ck CHECK (version >= 1),
  CONSTRAINT mv_autor_no_vacio_ck   CHECK (length(btrim(autor)) > 0),
  CONSTRAINT mv_documento_objeto_ck CHECK (jsonb_typeof(documento) = 'object'),
  CONSTRAINT mv_estado_ck CHECK (estado IN ('borrador', 'revision', 'enviado')),
  CONSTRAINT mv_moneda_ck CHECK (moneda IS NULL OR moneda IN ('MXN', 'USD')),

  -- ── CONCURRENCIA ──
  -- Ésta es la línea que impide que el último en guardar gane sin aviso. Dos
  -- personas que abren la versión 3 y guardan las dos: la primera escribe la
  -- 4, la segunda choca contra esta única y se rechaza en vez de pisar.
  -- El cliente manda la versión que leyó; el servidor escribe esa + 1.
  CONSTRAINT mv_machote_version_uq UNIQUE (machote_id, version)
);

COMMENT ON TABLE comercial.machote_version IS
  'APPEND-ONLY. Una fila por revisión, con el documento congelado en jsonb. No se actualiza ni se borra: al rol de aplicación se le revocan UPDATE y DELETE.';
COMMENT ON COLUMN comercial.machote_version.documento IS
  'El machote completo tal como estaba, con precios y tipo de cambio congelados. Es lo que se abre al ver una versión anterior.';
COMMENT ON CONSTRAINT mv_machote_version_uq ON comercial.machote_version IS
  'Bloqueo optimista: guardar exige la versión que se leyó. Si otro ya escribió esa, se rechaza en vez de pisar.';

CREATE INDEX IF NOT EXISTS mv_machote_idx
  ON comercial.machote_version (machote_id, version DESC);
CREATE INDEX IF NOT EXISTS mv_autor_idx
  ON comercial.machote_version (autor, creada_at DESC);


-- ══ El motivo obligatorio, impuesto por el ESQUEMA ══════════════════════════
-- No se puede con un CHECK: un CHECK sólo ve la fila que entra, y "cambió la
-- comisión" es una comparación contra la versión ANTERIOR. Un trigger sí la
-- ve, y rechaza la escritura: la base no acepta el cambio sin motivo, no es
-- que la pantalla lo pida amablemente.
--
-- Se comparan los cuatro números que mueven el reparto del dinero. Un cambio
-- de descripción o de cantidad no pide motivo: pedirlo en cada tecleo
-- convertiría el campo en un trámite que se llena con un punto.
CREATE OR REPLACE FUNCTION comercial.mv_exige_motivo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ant comercial.machote_version%ROWTYPE;
  cambio text[] := '{}';
BEGIN
  SELECT * INTO ant FROM comercial.machote_version
   WHERE machote_id = NEW.machote_id AND version = NEW.version - 1;

  IF NOT FOUND THEN
    RETURN NEW;                       -- la primera versión no cambia nada
  END IF;

  -- Los ::text no son adorno: sin ellos plpgsql lee el literal como literal de
  -- ARRAY y revienta con "malformed array literal" en CADA cambio de comisión,
  -- incluso trayendo motivo. Salió al correr la migración contra un Postgres
  -- de verdad; leyendo el SQL se ve bien.
  IF ant.comision_fts IS DISTINCT FROM NEW.comision_fts THEN
    cambio := array_append(cambio, 'comisión FTS'::text);
  END IF;
  IF ant.comision_cliente IS DISTINCT FROM NEW.comision_cliente THEN
    cambio := array_append(cambio, 'comisión cliente'::text);
  END IF;
  IF ant.margen IS DISTINCT FROM NEW.margen THEN
    cambio := array_append(cambio, 'margen'::text);
  END IF;

  IF array_length(cambio, 1) > 0 AND (NEW.motivo IS NULL OR length(btrim(NEW.motivo)) = 0) THEN
    RAISE EXCEPTION
      'Cambió % y no se dijo por qué. El motivo es obligatorio cuando cambian comisiones o margen.',
      array_to_string(cambio, ' y ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mv_exige_motivo_tg ON comercial.machote_version;
CREATE TRIGGER mv_exige_motivo_tg BEFORE INSERT ON comercial.machote_version
  FOR EACH ROW EXECUTE FUNCTION comercial.mv_exige_motivo();


-- ══ Que las versiones no salten ni se adelanten ════════════════════════════
-- La única de arriba impide DOS filas con la misma versión. Esto impide
-- escribir la 7 cuando va la 3: un hueco en el historial es un hueco en la
-- explicación de por qué el precio fue ese.
CREATE OR REPLACE FUNCTION comercial.mv_version_consecutiva()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ultima integer;
BEGIN
  SELECT COALESCE(max(version), 0) INTO ultima
    FROM comercial.machote_version WHERE machote_id = NEW.machote_id;

  IF NEW.version <> ultima + 1 THEN
    RAISE EXCEPTION
      'La versión que sigue es la %, no la %. Alguien más guardó mientras tanto: vuelve a abrir el machote.',
      ultima + 1, NEW.version
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS mv_version_consecutiva_tg ON comercial.machote_version;
CREATE TRIGGER mv_version_consecutiva_tg BEFORE INSERT ON comercial.machote_version
  FOR EACH ROW EXECUTE FUNCTION comercial.mv_version_consecutiva();


-- ══ Permisos ═══════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON comercial.machote          TO comercial_app;
GRANT SELECT, INSERT         ON comercial.machote_version  TO comercial_app;

-- ⚠ EL RENGLÓN QUE HACE REAL EL APPEND-ONLY.
-- 001 hace `ALTER DEFAULT PRIVILEGES … GRANT SELECT, INSERT, UPDATE`, así que
-- toda tabla nueva del esquema NACE con UPDATE. Correcto para las demás;
-- para el historial, no. Sin este REVOKE, "no se actualiza" sería una regla
-- escrita en un comentario y desmentida por los permisos.
REVOKE UPDATE ON comercial.machote_version FROM comercial_app;

-- DELETE no se otorga en ningún caso (regla 4), ni aquí ni en 001.

-- El renglon de public.schema_migrations lo inserta el runner, con el sha256
-- REAL del archivo.
