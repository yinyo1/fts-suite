-- ═══════════════════════════════════════════════════════════════════════════
-- asistencia_0001 · fundación del esquema `asistencia` (issue #396, fase a)
--
-- Lo que el kiosko sabe de cada checada y Odoo no guarda: zona (sitio, usa,
-- fuera…), zona horaria del teléfono, regla aplicada y motivo de «fuera de
-- zona». Más el TIPO DE DÍA de nómina (quién paga el día): el que propone el
-- sistema y el que confirma Felipe en Confirmar Horas.
--
-- Decisión de Esteban (8-oct-2026, #396): NO se crean campos Studio en Odoo.
-- Todo vive aquí, ligado por attendance_id de hr.attendance. A Odoo sólo va una
-- nota en el chatter al confirmar el tipo.
--
-- Numeración POR MÓDULO (asistencia_0001, asistencia_0002…), igual que
-- retardos: schema_migrations.version queda 'asistencia_0001'.
--
-- Reglas de este archivo (las mismas de retardos_0001):
--   1. Sin datos personales: el repo es público.
--   2. Nada se borra: el rol de aplicación no tiene DELETE ni TRUNCATE.
--   3. La bitácora del tipo de día es inmutable (trigger).
--   4. Idempotente: correr dos veces no rompe nada.
--   5. Etiquetas de dólar CON NOMBRE; nunca dos signos de dólar juntos, ni un
--      dólar seguido de comilla, ampersand, acento grave o dígito; nunca dos
--      llaves juntas (db/README.md reglas 4, 7 y 8). Por eso las funciones usan
--      parámetros con nombre y no posicionales.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS asistencia;
COMMENT ON SCHEMA asistencia IS
  'Eventos del kiosko por asistencia de Odoo (zona, zona horaria, regla, motivo) y tipo de día de nómina (#396). Odoo es registro; esto complementa sin campos Studio.';

-- ── Rol de aplicación ──────────────────────────────────────────────────────
DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asistencia_app') THEN
    CREATE ROLE asistencia_app NOLOGIN;
  END IF;
END
$rol$;
GRANT USAGE ON SCHEMA asistencia TO asistencia_app;

-- ══ TIPOS ══════════════════════════════════════════════════════════════════
-- mexico        : paga nómina México; costo a SO o centro de costos MX.
-- proyecto_usa  : paga FTS USA.
-- viaje_usa     : sale de México y llega a USA; paga FTS USA.
-- viaje_mexico  : sale de USA y llega a México; paga México. Con SO de la
--                 empresa 6 el cargo va a ADMIN DE OPERACIONES (3096) con marca
--                 de recobro a USA (D-7).

-- ══ EVENTO: una fila por asistencia de Odoo ═══════════════════════════════
CREATE TABLE IF NOT EXISTS asistencia.evento (
  attendance_id        integer     PRIMARY KEY,              -- hr.attendance.id
  employee_id          integer     NOT NULL,
  fecha                date        NOT NULL,                 -- día CST del check_in
  check_in_utc         timestamptz,
  check_out_utc        timestamptz,
  -- lo que mandó el kiosko en la entrada y en la salida
  zona_in              text        CHECK (zona_in  IS NULL OR char_length(zona_in)  <= 60),
  zona_out             text        CHECK (zona_out IS NULL OR char_length(zona_out) <= 60),
  tz_in                text        CHECK (tz_in    IS NULL OR char_length(tz_in)    <= 60),
  tz_out               text        CHECK (tz_out   IS NULL OR char_length(tz_out)   <= 60),
  utc_offset_in        smallint    CHECK (utc_offset_in  IS NULL OR utc_offset_in  BETWEEN -840 AND 840),
  utc_offset_out       smallint    CHECK (utc_offset_out IS NULL OR utc_offset_out BETWEEN -840 AND 840),
  regla_in             text        CHECK (regla_in  IS NULL OR char_length(regla_in)  <= 40),
  regla_out            text        CHECK (regla_out IS NULL OR char_length(regla_out) <= 40),
  geo_status_in        text        CHECK (geo_status_in  IS NULL OR geo_status_in  IN ('autorizado','pendiente_aprobacion')),
  geo_status_out       text        CHECK (geo_status_out IS NULL OR geo_status_out IN ('autorizado','pendiente_aprobacion')),
  geo_motivo_in        text        CHECK (geo_motivo_in  IS NULL OR char_length(geo_motivo_in)  <= 500),
  geo_motivo_out       text        CHECK (geo_motivo_out IS NULL OR char_length(geo_motivo_out) <= 500),
  plan_id              text        CHECK (plan_id IS NULL OR char_length(plan_id) <= 40),
  -- cargo con el que cerró (lo que escribió kiosk/checkin en Odoo)
  so_id                integer,                              -- project.project.id
  so_company_id        integer,
  cuenta_id            integer,                              -- bolsa (x_studio_many2one_field_GUbBF)
  -- tipo de día
  tipo_dia_propuesto   text        CHECK (tipo_dia_propuesto IS NULL OR tipo_dia_propuesto IN ('mexico','proyecto_usa','viaje_usa','viaje_mexico')),
  origen_propuesto     text        CHECK (origen_propuesto   IS NULL OR origen_propuesto   IN ('zona','empresa_proyecto')),
  tipo_dia             text        CHECK (tipo_dia           IS NULL OR tipo_dia           IN ('mexico','proyecto_usa','viaje_usa','viaje_mexico')),
  confirmado_por       text,
  confirmado_at        timestamptz,
  -- D-7: viaje a México con SO de la empresa 6 → cargo a 3096, recobro a USA
  recobro_usa          boolean     NOT NULL DEFAULT false,
  so_original_id       integer,
  so_original_company_id integer,
  origen               text        NOT NULL DEFAULT 'kiosko' CHECK (origen IN ('kiosko','confirmacion')),
  creado_at            timestamptz NOT NULL DEFAULT now(),
  actualizado_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo_dia IS NULL) = (confirmado_at IS NULL)),
  CHECK (NOT recobro_usa OR (tipo_dia = 'viaje_mexico' AND cuenta_id = 3096))
);
CREATE INDEX IF NOT EXISTS evento_emp_fecha ON asistencia.evento (employee_id, fecha);
CREATE INDEX IF NOT EXISTS evento_fecha     ON asistencia.evento (fecha);
COMMENT ON TABLE asistencia.evento IS
  'Una fila por hr.attendance. La escribe kiosk/checkin (entrada y salida) y asistencia/tipo-dia (confirmación de Felipe). tipo_dia NULL = sin confirmar.';

-- ══ BITÁCORA DEL TIPO DE DÍA (inmutable) ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS asistencia.tipo_dia_bitacora (
  id             bigserial   PRIMARY KEY,
  attendance_id  integer     NOT NULL REFERENCES asistencia.evento(attendance_id),
  de             text,
  a              text        NOT NULL,
  propuesto      text,
  actor          text        NOT NULL,
  motivo         text,
  evidencia      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tdb_att ON asistencia.tipo_dia_bitacora (attendance_id, id);

CREATE OR REPLACE FUNCTION asistencia.bitacora_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $trg$
BEGIN
  RAISE EXCEPTION 'asistencia.tipo_dia_bitacora es inmutable: % no permitido', TG_OP;
END
$trg$;
DROP TRIGGER IF EXISTS tdb_no_update ON asistencia.tipo_dia_bitacora;
CREATE TRIGGER tdb_no_update BEFORE UPDATE OR DELETE ON asistencia.tipo_dia_bitacora
  FOR EACH ROW EXECUTE FUNCTION asistencia.bitacora_inmutable();
DROP TRIGGER IF EXISTS tdb_no_truncate ON asistencia.tipo_dia_bitacora;
CREATE TRIGGER tdb_no_truncate BEFORE TRUNCATE ON asistencia.tipo_dia_bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION asistencia.bitacora_inmutable();

-- ══ CORRIDAS (latido y vigía de cuadre) ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS asistencia.corrida (
  id            bigserial   PRIMARY KEY,
  workflow      text        NOT NULL,
  iniciada_at   timestamptz NOT NULL DEFAULT now(),
  ok            boolean     NOT NULL,
  leidos        integer     NOT NULL DEFAULT 0,
  resumen       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error         text
);
CREATE INDEX IF NOT EXISTS corrida_wf ON asistencia.corrida (workflow, iniciada_at DESC);

-- ══ FUNCIONES ══════════════════════════════════════════════════════════════

-- Zona → país del evento. Todo lo que no sea 'usa' cuenta como México.
CREATE OR REPLACE FUNCTION asistencia.pais_zona(p_zona text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_zona IS NULL THEN NULL
              WHEN lower(p_zona) = 'usa' THEN 'usa'
              ELSE 'mx' END
$fn$;

-- Tipo propuesto por el orden de las checadas.
CREATE OR REPLACE FUNCTION asistencia.tipo_por_zonas(p_zona_in text, p_zona_out text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE asistencia.pais_zona(p_zona_in) || '>' || asistencia.pais_zona(p_zona_out)
           WHEN 'mx>mx'   THEN 'mexico'
           WHEN 'usa>usa' THEN 'proyecto_usa'
           WHEN 'mx>usa'  THEN 'viaje_usa'
           WHEN 'usa>mx'  THEN 'viaje_mexico'
         END
$fn$;

-- Tipo propuesto para asistencias sin zona: por la empresa del proyecto.
CREATE OR REPLACE FUNCTION asistencia.tipo_por_empresa(p_so_company_id integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_so_company_id = 6 THEN 'proyecto_usa' ELSE 'mexico' END
$fn$;

-- Día CST de un instante UTC. México no tiene horario de verano desde 2022.
CREATE OR REPLACE FUNCTION asistencia.dia_cst(p_utc timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT (p_utc AT TIME ZONE 'America/Monterrey')::date
$fn$;

-- Texto vacío → NULL, recortado a un largo máximo.
CREATE OR REPLACE FUNCTION asistencia.txt(p text, p_max integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p IS NULL OR btrim(p) = '' THEN NULL ELSE left(btrim(p), p_max) END
$fn$;

-- registrar_evento: lo llama kiosk/checkin después de escribir en Odoo.
-- p = {momento:'entrada'|'salida', attendance_id, employee_id, check_in_utc,
--      check_out_utc?, geo_zona, tz_evento, utc_offset_min, geo_regla?,
--      geo_status, geo_motivo, plan_id?, so_id?, so_company_id?, cuenta_id?}
-- Idempotente por attendance_id. Nunca toca tipo_dia (eso es de Felipe).
CREATE OR REPLACE FUNCTION asistencia.registrar_evento(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_att     integer := nullif(p->>'attendance_id','')::integer;
  v_emp     integer := nullif(p->>'employee_id','')::integer;
  v_mom     text    := p->>'momento';
  v_in      timestamptz := nullif(p->>'check_in_utc','')::timestamptz;
  v_out     timestamptz := nullif(p->>'check_out_utc','')::timestamptz;
  v_zona    text := asistencia.txt(p->>'geo_zona', 60);
  v_tz      text := asistencia.txt(p->>'tz_evento', 60);
  v_off     smallint := nullif(p->>'utc_offset_min','')::smallint;
  v_regla   text := asistencia.txt(coalesce(p->>'geo_regla', p->>'geo_zona'), 40);
  v_status  text := CASE WHEN p->>'geo_status' IN ('autorizado','pendiente_aprobacion') THEN p->>'geo_status' END;
  v_motivo  text := asistencia.txt(p->>'geo_motivo', 500);
  v_plan    text := asistencia.txt(p->>'plan_id', 40);
  v_so      integer := nullif(p->>'so_id','')::integer;
  v_soc     integer := nullif(p->>'so_company_id','')::integer;
  v_cta     integer := nullif(p->>'cuenta_id','')::integer;
  r         asistencia.evento%ROWTYPE;
BEGIN
  IF v_att IS NULL OR v_emp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'FALTA_ID', 'mensaje', 'attendance_id y employee_id son obligatorios');
  END IF;
  IF v_mom NOT IN ('entrada','salida') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'MOMENTO_INVALIDO', 'mensaje', 'momento debe ser entrada o salida');
  END IF;
  IF v_mom = 'entrada' AND v_in IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'FALTA_CHECK_IN', 'mensaje', 'la entrada necesita check_in_utc');
  END IF;

  IF v_mom = 'entrada' THEN
    INSERT INTO asistencia.evento AS e (attendance_id, employee_id, fecha, check_in_utc,
           zona_in, tz_in, utc_offset_in, regla_in, geo_status_in, geo_motivo_in, plan_id)
    VALUES (v_att, v_emp, asistencia.dia_cst(v_in), v_in,
           v_zona, v_tz, v_off, v_regla, v_status, v_motivo, v_plan)
    ON CONFLICT (attendance_id) DO UPDATE SET
           check_in_utc   = EXCLUDED.check_in_utc,
           fecha          = EXCLUDED.fecha,
           zona_in        = EXCLUDED.zona_in,
           tz_in          = EXCLUDED.tz_in,
           utc_offset_in  = EXCLUDED.utc_offset_in,
           regla_in       = EXCLUDED.regla_in,
           geo_status_in  = EXCLUDED.geo_status_in,
           geo_motivo_in  = EXCLUDED.geo_motivo_in,
           plan_id        = coalesce(EXCLUDED.plan_id, e.plan_id),
           actualizado_at = now();
  ELSE
    -- La salida puede llegar sin fila de entrada (entrada anterior al cambio):
    -- se crea con lo que hay; la fecha sale del check_in si viene, si no del out.
    INSERT INTO asistencia.evento AS e (attendance_id, employee_id, fecha, check_in_utc, check_out_utc,
           zona_out, tz_out, utc_offset_out, regla_out, geo_status_out, geo_motivo_out, plan_id,
           so_id, so_company_id, cuenta_id)
    VALUES (v_att, v_emp, asistencia.dia_cst(coalesce(v_in, v_out, now())), v_in, v_out,
           v_zona, v_tz, v_off, v_regla, v_status, v_motivo, v_plan,
           v_so, v_soc, v_cta)
    ON CONFLICT (attendance_id) DO UPDATE SET
           check_out_utc  = EXCLUDED.check_out_utc,
           zona_out       = EXCLUDED.zona_out,
           tz_out         = EXCLUDED.tz_out,
           utc_offset_out = EXCLUDED.utc_offset_out,
           regla_out      = EXCLUDED.regla_out,
           geo_status_out = EXCLUDED.geo_status_out,
           geo_motivo_out = EXCLUDED.geo_motivo_out,
           plan_id        = coalesce(EXCLUDED.plan_id, e.plan_id),
           so_id          = EXCLUDED.so_id,
           so_company_id  = EXCLUDED.so_company_id,
           cuenta_id      = EXCLUDED.cuenta_id,
           actualizado_at = now();
  END IF;

  -- Propuesto: por zonas si están las dos; si falta la de entrada, por empresa
  -- del proyecto (sólo si el kiosko mandó la empresa).
  UPDATE asistencia.evento SET
    tipo_dia_propuesto = coalesce(asistencia.tipo_por_zonas(zona_in, zona_out),
                                  CASE WHEN zona_in IS NULL AND check_out_utc IS NOT NULL AND so_company_id IS NOT NULL
                                       THEN asistencia.tipo_por_empresa(so_company_id) END),
    origen_propuesto   = CASE WHEN asistencia.tipo_por_zonas(zona_in, zona_out) IS NOT NULL THEN 'zona'
                              WHEN zona_in IS NULL AND check_out_utc IS NOT NULL AND so_company_id IS NOT NULL THEN 'empresa_proyecto' END
  WHERE attendance_id = v_att
  RETURNING * INTO r;

  RETURN jsonb_build_object('ok', true, 'attendance_id', r.attendance_id, 'momento', v_mom,
                            'tipo_dia_propuesto', r.tipo_dia_propuesto, 'origen_propuesto', r.origen_propuesto);
END
$fn$;

-- leer: lo llama asistencia/eventos (Confirmar Horas) y rh/dias-mx-usa.
-- p = {filas:[{attendance_id, employee_id, check_in_utc, so_id, so_company_id, cuenta_id}]}
-- Devuelve cada fila con su evento (si existe) y el propuesto efectivo: el de
-- zona si existe; si no, por empresa del proyecto (origen 'empresa_proyecto').
CREATE OR REPLACE FUNCTION asistencia.leer(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH f AS (
    SELECT (x->>'attendance_id')::integer AS attendance_id,
           nullif(x->>'so_company_id','')::integer AS so_company_id
    FROM jsonb_array_elements(coalesce(p->'filas','[]'::jsonb)) x
    WHERE nullif(x->>'attendance_id','') IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'attendance_id',      f.attendance_id,
           'tiene_evento',       e.attendance_id IS NOT NULL,
           'zona_in',            e.zona_in,
           'zona_out',           e.zona_out,
           'tz_in',              e.tz_in,
           'tz_out',             e.tz_out,
           'regla_in',           e.regla_in,
           'regla_out',          e.regla_out,
           'geo_status_in',      e.geo_status_in,
           'geo_motivo_in',      e.geo_motivo_in,
           'geo_motivo_out',     e.geo_motivo_out,
           'plan_id',            e.plan_id,
           'tipo_dia_propuesto', coalesce(e.tipo_dia_propuesto, asistencia.tipo_por_empresa(f.so_company_id)),
           'origen_propuesto',   CASE WHEN e.tipo_dia_propuesto IS NOT NULL THEN e.origen_propuesto ELSE 'empresa_proyecto' END,
           'tipo_dia',           e.tipo_dia,
           'confirmado_por',     e.confirmado_por,
           'confirmado_at',      e.confirmado_at,
           'recobro_usa',        coalesce(e.recobro_usa, false),
           'so_original_id',     e.so_original_id
         ) ORDER BY f.attendance_id), '[]'::jsonb)
  FROM f LEFT JOIN asistencia.evento e ON e.attendance_id = f.attendance_id
$fn$;

-- confirmar_tipo: lo llama asistencia/tipo-dia cuando Felipe confirma.
-- p = {attendance_id, employee_id, check_in_utc, tipo_dia, actor,
--      so_id, so_company_id, cuenta_id, es_viaje?, recobro_usa?, so_original_id?,
--      so_original_company_id?, motivo?}
-- El cargo (so/cuenta) lo lee el workflow de Odoo; aquí sólo se valida.
CREATE OR REPLACE FUNCTION asistencia.confirmar_tipo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_att    integer := nullif(p->>'attendance_id','')::integer;
  v_emp    integer := nullif(p->>'employee_id','')::integer;
  v_in     timestamptz := nullif(p->>'check_in_utc','')::timestamptz;
  v_tipo   text := p->>'tipo_dia';
  v_actor  text := asistencia.txt(p->>'actor', 120);
  v_so     integer := nullif(p->>'so_id','')::integer;
  v_soc    integer := nullif(p->>'so_company_id','')::integer;
  v_cta    integer := nullif(p->>'cuenta_id','')::integer;
  v_viaje  boolean := coalesce((p->>'es_viaje')::boolean, false) OR v_tipo IN ('viaje_usa','viaje_mexico');
  v_rec    boolean := coalesce((p->>'recobro_usa')::boolean, false);
  v_soo    integer := nullif(p->>'so_original_id','')::integer;
  v_sooc   integer := nullif(p->>'so_original_company_id','')::integer;
  v_prev   text;
  v_prop   text;
BEGIN
  IF v_att IS NULL OR v_emp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'FALTA_ID', 'mensaje', 'attendance_id y employee_id son obligatorios');
  END IF;
  IF v_tipo IS NULL OR v_tipo NOT IN ('mexico','proyecto_usa','viaje_usa','viaje_mexico') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'TIPO_INVALIDO', 'mensaje', 'tipo_dia debe ser mexico, proyecto_usa, viaje_usa o viaje_mexico');
  END IF;
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'FALTA_ACTOR', 'mensaje', 'falta quién confirma');
  END IF;
  -- Un día de viaje no se confirma sin SO o centro de costos.
  IF v_viaje AND v_so IS NULL AND v_cta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'VIAJE_SIN_CARGO', 'mensaje', 'Un día de viaje necesita SO o centro de costos antes de confirmarse');
  END IF;
  -- Nómina México no puede cargar a un proyecto de FTS USA (Odoo _check_company).
  IF v_tipo IN ('mexico','viaje_mexico') AND v_soc = 6 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EMPRESA_INCOHERENTE',
      'mensaje', 'Un día que paga México no puede quedar cargado a una SO de FTS USA. Viaje a México: se carga a ADMIN DE OPERACIONES (3096) con recobro a USA.');
  END IF;
  IF v_rec AND NOT (v_tipo = 'viaje_mexico' AND v_cta = 3096 AND v_sooc = 6) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RECOBRO_INVALIDO',
      'mensaje', 'El recobro a USA sólo aplica a Viaje a México cargado a 3096 cuya SO original es de FTS USA');
  END IF;

  -- Fila retro: asistencia anterior al cambio, sin evento del kiosko.
  INSERT INTO asistencia.evento (attendance_id, employee_id, fecha, check_in_utc, origen,
                                 so_id, so_company_id, cuenta_id,
                                 tipo_dia_propuesto, origen_propuesto)
  VALUES (v_att, v_emp, asistencia.dia_cst(coalesce(v_in, now())), v_in, 'confirmacion',
          v_so, v_soc, v_cta,
          asistencia.tipo_por_empresa(coalesce(v_sooc, v_soc)), 'empresa_proyecto')
  ON CONFLICT (attendance_id) DO NOTHING;

  SELECT tipo_dia, tipo_dia_propuesto INTO v_prev, v_prop
  FROM asistencia.evento WHERE attendance_id = v_att FOR UPDATE;

  UPDATE asistencia.evento SET
    tipo_dia       = v_tipo,
    confirmado_por = v_actor,
    confirmado_at  = CASE WHEN v_prev IS DISTINCT FROM v_tipo OR confirmado_at IS NULL THEN now() ELSE confirmado_at END,
    so_id          = v_so,
    so_company_id  = v_soc,
    cuenta_id      = v_cta,
    recobro_usa    = v_rec,
    so_original_id = CASE WHEN v_rec THEN v_soo END,
    so_original_company_id = CASE WHEN v_rec THEN v_sooc END,
    actualizado_at = now()
  WHERE attendance_id = v_att;

  IF v_prev IS DISTINCT FROM v_tipo THEN
    INSERT INTO asistencia.tipo_dia_bitacora (attendance_id, de, a, propuesto, actor, motivo, evidencia)
    VALUES (v_att, v_prev, v_tipo, v_prop, v_actor, asistencia.txt(p->>'motivo', 500),
            jsonb_build_object('so_id', v_so, 'so_company_id', v_soc, 'cuenta_id', v_cta,
                               'recobro_usa', v_rec, 'so_original_id', v_soo));
  END IF;

  RETURN jsonb_build_object('ok', true, 'attendance_id', v_att, 'tipo_dia', v_tipo,
                            'anterior', v_prev, 'propuesto', v_prop,
                            'cambio', v_prev IS DISTINCT FROM v_tipo,
                            'cambiado_por_felipe', v_prop IS NOT NULL AND v_prop <> v_tipo);
END
$fn$;

-- cuadre: lo llama el vigía diario. p = {desde:'YYYY-MM-DD', hasta:'YYYY-MM-DD',
-- odoo:[{id, fecha}…]} con TODAS las asistencias de Odoo de esos días (fecha =
-- día CST del check_in). Sólo cuenta como «sin evento» lo que es posterior al
-- ARRANQUE (el primer evento que mandó el kiosko): lo anterior al cambio nunca
-- tuvo evento y no es un descuadre. Escribe una corrida y devuelve los dos lados.
CREATE OR REPLACE FUNCTION asistencia.cuadre(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_desde    date := (p->>'desde')::date;
  v_hasta    date := (p->>'hasta')::date;
  v_arranque date;
  v_odoo     integer[];
  v_sin_evento integer[];
  v_sin_odoo   integer[];
  v_res      jsonb;
BEGIN
  IF v_desde IS NULL OR v_hasta IS NULL OR v_hasta < v_desde THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RANGO_INVALIDO');
  END IF;
  IF jsonb_typeof(p->'odoo') IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'FALTA_LISTA_ODOO');
  END IF;
  SELECT min(fecha) INTO v_arranque FROM asistencia.evento WHERE origen = 'kiosko';

  CREATE TEMP TABLE IF NOT EXISTS _cuadre_odoo (id integer PRIMARY KEY, fecha date) ON COMMIT DROP;
  TRUNCATE _cuadre_odoo;
  INSERT INTO _cuadre_odoo (id, fecha)
  SELECT DISTINCT ON (id) id, fecha FROM (
    SELECT CASE WHEN jsonb_typeof(x) = 'object' THEN (x->>'id')::integer ELSE (x #>> '{}')::integer END AS id,
           CASE WHEN jsonb_typeof(x) = 'object' THEN nullif(x->>'fecha','')::date END AS fecha
    FROM jsonb_array_elements(p->'odoo') x) t
  WHERE id IS NOT NULL;
  SELECT coalesce(array_agg(id), '{}') INTO v_odoo FROM _cuadre_odoo;

  SELECT coalesce(array_agg(o.id ORDER BY o.id), '{}') INTO v_sin_evento
  FROM _cuadre_odoo o
  WHERE v_arranque IS NOT NULL
    AND coalesce(o.fecha, v_hasta) >= v_arranque
    AND NOT EXISTS (SELECT 1 FROM asistencia.evento e WHERE e.attendance_id = o.id);

  SELECT coalesce(array_agg(e.attendance_id ORDER BY e.attendance_id), '{}') INTO v_sin_odoo
  FROM asistencia.evento e
  WHERE e.fecha BETWEEN v_desde AND v_hasta AND NOT (e.attendance_id = ANY(v_odoo));

  v_res := jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'arranque', v_arranque,
             'odoo', cardinality(v_odoo),
             'sin_evento', to_jsonb(v_sin_evento), 'sin_odoo', to_jsonb(v_sin_odoo),
             'n_sin_evento', cardinality(v_sin_evento), 'n_sin_odoo', cardinality(v_sin_odoo));
  INSERT INTO asistencia.corrida (workflow, ok, leidos, resumen)
  VALUES ('asistencia/vigia-cuadre', true, cardinality(v_odoo), v_res);
  RETURN jsonb_build_object('ok', true) || v_res;
END
$fn$;

-- Último cuadre, para mostrarlo en el reporte de RH.
CREATE OR REPLACE FUNCTION asistencia.ultimo_cuadre() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce((SELECT jsonb_build_object('at', iniciada_at, 'ok', ok) || resumen
                   FROM asistencia.corrida WHERE workflow = 'asistencia/vigia-cuadre'
                   ORDER BY iniciada_at DESC LIMIT 1), '{}'::jsonb)
$fn$;

-- ══ PERMISOS ══════════════════════════════════════════════════════════════
GRANT SELECT ON ALL TABLES IN SCHEMA asistencia TO asistencia_app;
GRANT INSERT, UPDATE ON asistencia.evento TO asistencia_app;
GRANT INSERT ON asistencia.tipo_dia_bitacora, asistencia.corrida TO asistencia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA asistencia TO asistencia_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA asistencia TO asistencia_app;
