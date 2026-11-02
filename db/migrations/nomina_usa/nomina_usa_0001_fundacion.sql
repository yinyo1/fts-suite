-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0001 · Fundación: banderas, ficha del empleado y bitácora (#448, fase A)
--
-- FTS Full Technology Systems LLC paga nómina por Auris desde el 6-nov-2026. La
-- mano de obra USA se paga por avance desde la bolsa del machote de cada SO.
-- Este esquema guarda lo que Odoo no tiene y no se puede escribir sin «va»:
-- país de nómina, tipo de pago, hora de referencia, banderas por persona.
--
-- Reglas de db/README.md: idempotente, sin el doble signo de dólar (etiquetas con nombre), nunca
-- se edita aplicado. TODO entra apagado: kiosko_activo=false y
-- alertas_modo='sombra'. Encender cualquiera es clic de Esteban.
--
-- El panel despacha por un REGISTRO de acciones (nomina_usa.accion): cada
-- migración posterior agrega sus funciones y sus renglones sin reescribir el
-- despachador. El scope que pide cada acción vive en el mismo renglón, así que
-- no hay forma de agregar una acción sin decir quién puede llamarla.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS nomina_usa;

DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nomina_usa_app') THEN
    CREATE ROLE nomina_usa_app NOLOGIN;
  END IF;
END
$rol$;
GRANT USAGE ON SCHEMA nomina_usa TO nomina_usa_app;

-- ══ 1 · Banderas ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS nomina_usa.config (
  clave       text        PRIMARY KEY,
  valor       jsonb       NOT NULL,
  nota        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text        NOT NULL DEFAULT current_user
);

INSERT INTO nomina_usa.config (clave, valor, nota) VALUES
  ('kiosko_activo',          'false'::jsonb,  'Interruptor general del kiosko USA. Además cada persona tiene su bandera en ficha.kiosko_usa.'),
  ('alertas_modo',           '"sombra"'::jsonb, 'sombra = registra alertas y NO encola correos. real = encola en retardos.envio. Solo Esteban.'),
  ('entrada_tolerancia_min', '15'::jsonb,     'Minutos después de la hora de referencia. 15:00 no alerta, 15:01 sí.'),
  ('salida_faltante_horas',  '14'::jsonb,     'Horas desde la entrada sin salida para avisar a la persona.'),
  ('tope_excepcion_puntos',  '10'::jsonb,     'Puntos de comercial arriba del sugerido que se aprueban solos.'),
  ('tope_contra_plan_puntos','20'::jsonb,     'Puntos de comercial arriba del plan de la mañana que se marcan.'),
  ('tarifa_comercial_usd',   '140'::jsonb,    'Neto USD por día comercial completo de Ricardo (× % comercial del día).')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION nomina_usa.cfg(p_clave text) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$ SELECT valor FROM nomina_usa.config WHERE clave = p_clave $fn$;

-- ══ 2 · Ficha del empleado ═════════════════════════════════════════════════
-- Llave: hr.employee.id de Odoo, sin llave foránea (regla 3 del almacén).
CREATE TABLE IF NOT EXISTS nomina_usa.ficha (
  employee_id       integer     PRIMARY KEY,
  alias             text        NOT NULL,
  pais_nomina       text        NOT NULL DEFAULT 'MX',
  tipo_pago_usa     text,
  pide_so_entrada   boolean     NOT NULL DEFAULT false,
  kiosko_usa        boolean     NOT NULL DEFAULT false,
  jefe_employee_id  integer,
  hora_entrada_ref  time,
  zona_horaria      text,
  fijo_semanal_usd  numeric(12,2),
  activo            boolean     NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text        NOT NULL DEFAULT current_user,
  CONSTRAINT ficha_pais_ck  CHECK (pais_nomina IN ('MX','USA','HIBRIDO')),
  CONSTRAINT ficha_tipo_ck  CHECK (tipo_pago_usa IS NULL OR tipo_pago_usa IN ('bolsa_avance','supervisor_comercial','fijo_asistencia')),
  -- Quien cobra en USA tiene que decir cómo; quien es solo de México no.
  CONSTRAINT ficha_tipo_req_ck CHECK ((pais_nomina = 'MX') = (tipo_pago_usa IS NULL)),
  -- «Pide SO al entrar» solo tiene sentido para quien cobra por bolsa.
  CONSTRAINT ficha_so_ck    CHECK (NOT pide_so_entrada OR tipo_pago_usa = 'bolsa_avance'),
  CONSTRAINT ficha_fijo_ck  CHECK (fijo_semanal_usd IS NULL OR fijo_semanal_usd >= 0),
  CONSTRAINT ficha_tz_ck    CHECK (zona_horaria IS NULL OR zona_horaria IN (
                               'America/Los_Angeles','America/Denver','America/Phoenix','America/Chicago','America/New_York','America/Monterrey'))
);

COMMENT ON TABLE nomina_usa.ficha IS
  'Lo que Odoo no tiene de cada persona que cobra en USA. Sin renglón aquí = flujo de México, igual que hoy.';
COMMENT ON COLUMN nomina_usa.ficha.hora_entrada_ref IS
  'Hora local de referencia en USA. NULL = la alerta de entrada faltante NO corre para esta persona (no se inventa una hora).';

-- Las cuatro personas de esta versión. TODO apagado (kiosko_usa=false) y sin
-- hora de referencia: son preguntas abiertas del #448. Sin datos personales.
INSERT INTO nomina_usa.ficha (employee_id, alias, pais_nomina, tipo_pago_usa, pide_so_entrada, jefe_employee_id) VALUES
  (75, 'Mateo',     'HIBRIDO', 'bolsa_avance',         true,  112),
  (79, 'José Luis', 'HIBRIDO', 'bolsa_avance',         true,  112),
  (98, 'Ricardo',   'HIBRIDO', 'supervisor_comercial', false, 32),
  (97, 'Rissia',    'USA',     'fijo_asistencia',      false, 32)
ON CONFLICT (employee_id) DO NOTHING;

-- ══ 3 · Bitácora inmutable ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS nomina_usa.bitacora (
  id          bigserial   PRIMARY KEY,
  creado_at   timestamptz NOT NULL DEFAULT now(),
  actor       text        NOT NULL,
  evento      text        NOT NULL,
  objeto      text,
  antes       jsonb,
  despues     jsonb,
  motivo      text
);

CREATE OR REPLACE FUNCTION nomina_usa.bitacora_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'BITACORA_INMUTABLE';
END
$fn$;
DROP TRIGGER IF EXISTS bitacora_sin_cambios ON nomina_usa.bitacora;
CREATE TRIGGER bitacora_sin_cambios BEFORE UPDATE OR DELETE ON nomina_usa.bitacora
  FOR EACH ROW EXECUTE FUNCTION nomina_usa.bitacora_inmutable();

CREATE OR REPLACE FUNCTION nomina_usa.log(p_actor text, p_evento text, p_objeto text, p_antes jsonb, p_despues jsonb, p_motivo text)
RETURNS void LANGUAGE sql AS $fn$
  INSERT INTO nomina_usa.bitacora (actor, evento, objeto, antes, despues, motivo)
  VALUES (coalesce(p_actor, 'desconocido'), p_evento, p_objeto, p_antes, p_despues, p_motivo)
$fn$;

-- ══ 4 · Registro de acciones y despachador ═════════════════════════════════
-- scope NULL = cualquier sesión válida de la suite.
CREATE TABLE IF NOT EXISTS nomina_usa.accion (
  nombre   text PRIMARY KEY,
  funcion  text NOT NULL,
  scopes   text[] NOT NULL,
  -- Sin ancla de fin (db/README regla 8): empieza con nomina_usa., un solo punto y nada fuera de [a-z_.].
  CONSTRAINT accion_funcion_ck CHECK (funcion ~ '^nomina_usa[.][a-z_]' AND funcion !~ '[^a-z_.]' AND funcion !~ '[.].*[.]')
);

CREATE TABLE IF NOT EXISTS nomina_usa.nonce (
  nonce     text PRIMARY KEY,
  actor     text NOT NULL,
  accion    text,
  creado_at timestamptz NOT NULL DEFAULT now()
);

-- p = { accion, actor, scopes:[...], ...datos }. Las scopes las pone la puerta
-- del webhook DESPUÉS de verificar el JWT; el navegador no las puede inventar
-- porque no llegan del body.
CREATE OR REPLACE FUNCTION nomina_usa.panel(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE a nomina_usa.accion; v_scopes text[]; r jsonb;
BEGIN
  SELECT * INTO a FROM nomina_usa.accion WHERE nombre = p->>'accion';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ACCION_DESCONOCIDA'); END IF;
  v_scopes := coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'scopes', '[]'::jsonb))), '{}');
  IF NOT (v_scopes && a.scopes OR 'nomina_usa:admin' = ANY (v_scopes)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SCOPE_INSUFICIENTE', 'pide', to_jsonb(a.scopes));
  END IF;
  -- El argumento va como literal (%L) y no como parámetro posicional: db/README regla 8.
  EXECUTE format('SELECT %s(%L::jsonb)', a.funcion, p::text) INTO r;
  RETURN r;
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.panel_seguro(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    INSERT INTO nomina_usa.nonce (nonce, actor, accion) VALUES (p->>'nonce', coalesce(p->>'actor', '?'), p->>'accion');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REPLAY');
  WHEN not_null_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NONCE_AUSENTE');
  END;
  RETURN nomina_usa.panel(p);
EXCEPTION WHEN raise_exception OR check_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', split_part(SQLERRM, ' ', 1), 'detalle', left(SQLERRM, 200));
END
$fn$;

-- ══ 5 · Acciones de la fase A ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION nomina_usa.a_config_ver(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'config', coalesce(jsonb_object_agg(clave, valor), '{}'::jsonb))
    FROM nomina_usa.config
$fn$;

-- Solo nomina_usa:admin (Esteban). Pasar alertas a real o prender el kiosko
-- es justo esto; la pantalla lo pide con confirmación y queda en bitácora.
CREATE OR REPLACE FUNCTION nomina_usa.a_config_guardar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_clave text := p->>'clave'; v_antes jsonb;
BEGIN
  SELECT valor INTO v_antes FROM nomina_usa.config WHERE clave = v_clave;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'CLAVE_DESCONOCIDA'); END IF;
  IF v_clave = 'alertas_modo' AND NOT (p->'valor' IN ('"sombra"'::jsonb, '"real"'::jsonb)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MODO_INVALIDO');
  END IF;
  IF v_clave = 'kiosko_activo' AND jsonb_typeof(p->'valor') <> 'boolean' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;
  IF coalesce(btrim(p->>'motivo'), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_REQUERIDO'); END IF;
  UPDATE nomina_usa.config SET valor = p->'valor', updated_at = now(), updated_by = coalesce(p->>'actor', current_user)
   WHERE clave = v_clave;
  PERFORM nomina_usa.log(p->>'actor', 'config', v_clave, v_antes, p->'valor', p->>'motivo');
  RETURN jsonb_build_object('ok', true, 'clave', v_clave, 'antes', v_antes, 'despues', p->'valor');
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_ficha_listar(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'fichas', coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.alias), '[]'::jsonb))
    FROM nomina_usa.ficha f
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_ficha_guardar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE f jsonb := p->'ficha'; v_id integer := (p->'ficha'->>'employee_id')::integer; v_antes jsonb;
BEGIN
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'EMPLEADO_REQUERIDO'); END IF;
  SELECT to_jsonb(x) INTO v_antes FROM nomina_usa.ficha x WHERE employee_id = v_id;
  INSERT INTO nomina_usa.ficha AS t (employee_id, alias, pais_nomina, tipo_pago_usa, pide_so_entrada, kiosko_usa,
      jefe_employee_id, hora_entrada_ref, zona_horaria, fijo_semanal_usd, activo, updated_at, updated_by)
  VALUES (v_id, coalesce(f->>'alias', 'empleado ' || v_id), coalesce(f->>'pais_nomina', 'MX'), nullif(f->>'tipo_pago_usa', ''),
      coalesce((f->>'pide_so_entrada')::boolean, false), coalesce((f->>'kiosko_usa')::boolean, false),
      nullif(f->>'jefe_employee_id', '')::integer, nullif(f->>'hora_entrada_ref', '')::time, nullif(f->>'zona_horaria', ''),
      nullif(f->>'fijo_semanal_usd', '')::numeric, coalesce((f->>'activo')::boolean, true), now(), coalesce(p->>'actor', current_user))
  ON CONFLICT (employee_id) DO UPDATE SET
      alias = excluded.alias, pais_nomina = excluded.pais_nomina, tipo_pago_usa = excluded.tipo_pago_usa,
      pide_so_entrada = excluded.pide_so_entrada, kiosko_usa = excluded.kiosko_usa, jefe_employee_id = excluded.jefe_employee_id,
      hora_entrada_ref = excluded.hora_entrada_ref, zona_horaria = excluded.zona_horaria, fijo_semanal_usd = excluded.fijo_semanal_usd,
      activo = excluded.activo, updated_at = now(), updated_by = excluded.updated_by;
  PERFORM nomina_usa.log(p->>'actor', 'ficha', v_id::text, v_antes,
                         (SELECT to_jsonb(x) FROM nomina_usa.ficha x WHERE employee_id = v_id), p->>'motivo');
  RETURN jsonb_build_object('ok', true, 'ficha', (SELECT to_jsonb(x) FROM nomina_usa.ficha x WHERE employee_id = v_id));
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_bitacora(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'bitacora', coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id DESC), '[]'::jsonb))
    FROM (SELECT * FROM nomina_usa.bitacora ORDER BY id DESC LIMIT 200) b
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('config_ver',     'nomina_usa.a_config_ver',     '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar,nomina_usa:archivo}'),
  ('config_guardar', 'nomina_usa.a_config_guardar', '{nomina_usa:admin}'),
  ('ficha_listar',   'nomina_usa.a_ficha_listar',   '{nomina_usa:validar,nomina_usa:autorizar}'),
  ('ficha_guardar',  'nomina_usa.a_ficha_guardar',  '{nomina_usa:admin}'),
  ('bitacora',       'nomina_usa.a_bitacora',       '{nomina_usa:validar,nomina_usa:autorizar}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
