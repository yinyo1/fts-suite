-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0003 · Alertas de checada en MODO SOMBRA (#448, fase C)
--
-- Entrada faltante (hora de referencia + 15 min, L-V) y salida faltante (14 h desde la
-- entrada; al día siguiente, a RH). USA y México.
--
-- REUTILIZA Retardos v2 (#334/#344), no lo duplica: festivos, exclusiones, padrón con
-- hora de entrada (retardos.empleado), destinatarios (retardos.destinatarios / rh_para)
-- y la bandeja de salida (retardos.encolar → retardos.envio, que ya tiene tipo 'alerta').
-- NO escribe en ninguna tabla de retardos mientras alertas_modo = 'sombra': en sombra la
-- alerta se registra aquí y ningún correo entra a la cola. Pasar a real = clic de Esteban.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nomina_usa.alerta (
  id             bigserial   PRIMARY KEY,
  clave          text        NOT NULL UNIQUE,
  tipo           text        NOT NULL,
  employee_id    integer     NOT NULL,
  fecha          date        NOT NULL,
  attendance_id  integer,
  detalle        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  modo_al_crear  text        NOT NULL,
  encolada       boolean     NOT NULL DEFAULT false,
  estado         text        NOT NULL DEFAULT 'abierta',
  marcado_por    text,
  marcado_at     timestamptz,
  nota           text,
  revision_pedida_por text,
  revision_pedida_at  timestamptz,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerta_tipo_ck   CHECK (tipo IN ('entrada_faltante','salida_faltante','salida_faltante_rh','incidencia_periodo')),
  CONSTRAINT alerta_modo_ck   CHECK (modo_al_crear IN ('sombra','real')),
  CONSTRAINT alerta_estado_ck CHECK (estado IN ('abierta','falta_justificada','falta_injustificada','error_corregido','en_disputa')),
  -- En sombra jamás se encola: la base lo garantiza aunque el código falle.
  CONSTRAINT alerta_sombra_ck CHECK (NOT (modo_al_crear = 'sombra' AND encolada))
);
CREATE INDEX IF NOT EXISTS alerta_emp_fecha ON nomina_usa.alerta (employee_id, fecha);
CREATE INDEX IF NOT EXISTS alerta_estado ON nomina_usa.alerta (estado) WHERE estado IN ('abierta','en_disputa');

-- A quién evaluar y con qué hora. Ficha de Nómina USA (hora y zona locales) gana; si no,
-- el padrón de Retardos (hora decimal de Monterrey). Sin hora = no se evalúa la entrada.
CREATE OR REPLACE FUNCTION nomina_usa.alertas_personas() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH f AS (
    SELECT employee_id, to_char(hora_entrada_ref, 'HH24:MI') AS hora_ref, coalesce(zona_horaria, 'America/Monterrey') AS zona, 'ficha' AS fuente
      FROM nomina_usa.ficha WHERE activo
  ), r AS (
    SELECT e.employee_id,
           CASE WHEN e.hora_entrada > 0 THEN lpad(floor(e.hora_entrada)::int::text, 2, '0') || ':' || lpad(round((e.hora_entrada - floor(e.hora_entrada)) * 60)::int::text, 2, '0') END AS hora_ref,
           'America/Monterrey' AS zona, 'retardos' AS fuente
      FROM retardos.empleado e
     WHERE e.activo AND NOT EXISTS (SELECT 1 FROM nomina_usa.ficha x WHERE x.employee_id = e.employee_id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('employee_id', u.employee_id, 'hora_ref', u.hora_ref, 'zona', u.zona, 'fuente', u.fuente,
           'excluido_hoy', EXISTS (SELECT 1 FROM retardos.exclusion x WHERE x.activo AND x.employee_id = u.employee_id
                                     AND (now() AT TIME ZONE u.zona)::date BETWEEN x.desde AND x.hasta
                                     AND NOT (u.fuente = 'ficha' AND x.tipo = 'usa')))), '[]'::jsonb)
    FROM (SELECT * FROM f UNION ALL SELECT * FROM r) u
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.alertas_parametros() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('modo', nomina_usa.cfg('alertas_modo'), 'tolerancia_min', nomina_usa.cfg('entrada_tolerancia_min'),
    'salida_horas', nomina_usa.cfg('salida_faltante_horas'), 'personas', nomina_usa.alertas_personas(),
    'festivos', coalesce((SELECT jsonb_agg(to_char(fecha, 'YYYY-MM-DD')) FROM retardos.festivo WHERE fecha >= current_date - 7), '[]'::jsonb))
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.jefe_de(p_emp integer) RETURNS integer
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce((SELECT jefe_employee_id FROM nomina_usa.ficha WHERE employee_id = p_emp),
                  (SELECT parent_id FROM retardos.empleado WHERE employee_id = p_emp))
$fn$;

-- Registra las alertas que calculó nomina-usa/alertas. Idempotente por clave.
-- p = { alertas: [{clave, tipo, employee_id, fecha, attendance_id, detalle}] }
CREATE OR REPLACE FUNCTION nomina_usa.alertas_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE a jsonb; v_modo text := coalesce(nomina_usa.cfg('alertas_modo') #>> '{}', 'sombra'); v_id bigint;
        v_nuevas integer := 0; v_enc integer := 0; v_para jsonb; v_cc jsonb; v_asunto text; v_html text; v_jefe integer;
BEGIN
  IF v_modo NOT IN ('sombra', 'real') THEN v_modo := 'sombra'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p->'alertas', '[]'::jsonb)) LOOP
    INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, attendance_id, detalle, modo_al_crear)
    VALUES (a->>'clave', a->>'tipo', (a->>'employee_id')::integer, (a->>'fecha')::date, nullif(a->>'attendance_id', '')::integer,
            coalesce(a->'detalle', '{}'::jsonb), v_modo)
    ON CONFLICT (clave) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN CONTINUE; END IF;
    v_nuevas := v_nuevas + 1;
    IF v_modo = 'real' THEN
      v_jefe := nomina_usa.jefe_de((a->>'employee_id')::integer);
      IF a->>'tipo' = 'entrada_faltante' THEN
        v_para := retardos.destinatarios((a->>'employee_id')::integer);
        v_cc := retardos.unicos(retardos.rh_para() || coalesce(retardos.destinatarios(v_jefe), '[]'::jsonb));
        v_asunto := 'No registramos tu entrada de hoy';
        v_html := '<p>Hola:</p><p>No registramos tu entrada de hoy ' || to_char((a->>'fecha')::date, 'DD/MM/YYYY') ||
                  '. Si ya estás trabajando, checa en el kiosko o avisa a tu jefe y a Recursos Humanos.</p><p>Recursos Humanos</p>';
      ELSIF a->>'tipo' = 'salida_faltante' THEN
        v_para := retardos.destinatarios((a->>'employee_id')::integer); v_cc := '[]'::jsonb;
        v_asunto := 'Tienes una entrada sin salida';
        v_html := '<p>Hola:</p><p>Tu entrada del ' || to_char((a->>'fecha')::date, 'DD/MM/YYYY') ||
                  ' sigue sin salida. Si ya terminaste, registra tu salida con «Olvidé checar salida» en el kiosko.</p><p>Recursos Humanos</p>';
      ELSE
        v_para := retardos.rh_para(); v_cc := '[]'::jsonb;
        v_asunto := 'Salida sin registrar desde ayer: empleado ' || (a->>'employee_id');
        v_html := '<p>La entrada del ' || to_char((a->>'fecha')::date, 'DD/MM/YYYY') || ' del empleado ' || (a->>'employee_id') ||
                  ' sigue sin salida. Revísala en Nómina USA, pestaña Alertas.</p>';
      END IF;
      IF jsonb_array_length(coalesce(v_para, '[]'::jsonb)) > 0 THEN
        PERFORM retardos.encolar('nomina_usa:' || (a->>'clave'), NULL, 'alerta', v_para, v_cc, v_asunto, v_html);
        UPDATE nomina_usa.alerta SET encolada = true WHERE id = v_id;
        v_enc := v_enc + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'modo', v_modo, 'nuevas', v_nuevas, 'encoladas', v_enc);
END
$fn$;

-- ── Panel: bandeja de RH ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nomina_usa.a_alertas(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'modo', nomina_usa.cfg('alertas_modo'), 'alertas', coalesce(jsonb_agg(to_jsonb(a) ||
           jsonb_build_object('alias', coalesce(f.alias, 'empleado ' || a.employee_id)) ORDER BY a.fecha DESC, a.id DESC), '[]'::jsonb))
    FROM nomina_usa.alerta a LEFT JOIN nomina_usa.ficha f USING (employee_id)
   WHERE a.fecha BETWEEN coalesce((p->>'desde')::date, current_date - 14) AND coalesce((p->>'hasta')::date, current_date + 1)
     AND (NOT coalesce((p->>'solo_abiertas')::boolean, false) OR a.estado IN ('abierta', 'en_disputa'))
     AND (p->>'employee_id' IS NULL OR a.employee_id = (p->>'employee_id')::integer)
$fn$;

-- RH marca: falta justificada / falta injustificada / error de checada corregido / en disputa.
-- Sacarla de «en disputa» con cualquier otra marca = liberarla. Todo a bitácora.
CREATE OR REPLACE FUNCTION nomina_usa.a_alerta_marcar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v nomina_usa.alerta;
BEGIN
  SELECT * INTO v FROM nomina_usa.alerta WHERE id = (p->>'id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ALERTA_INEXISTENTE'); END IF;
  IF coalesce(p->>'estado', '') NOT IN ('falta_justificada','falta_injustificada','error_corregido','en_disputa') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ESTADO_INVALIDO');
  END IF;
  IF coalesce(btrim(p->>'nota'), '') = '' AND p->>'estado' IN ('falta_justificada', 'en_disputa') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_REQUERIDO');
  END IF;
  UPDATE nomina_usa.alerta SET estado = p->>'estado', marcado_por = p->>'actor', marcado_at = now(), nota = p->>'nota' WHERE id = v.id;
  PERFORM nomina_usa.log(p->>'actor', CASE WHEN v.estado = 'en_disputa' AND p->>'estado' <> 'en_disputa' THEN 'alerta_liberada' ELSE 'alerta_marcada' END,
                         'alerta:' || v.id, jsonb_build_object('estado', v.estado), jsonb_build_object('estado', p->>'estado'), p->>'nota');
  RETURN jsonb_build_object('ok', true, 'id', v.id, 'estado', p->>'estado');
END
$fn$;

-- Incidencias del periodo (sin checada, sin cerrar, sin SO) calculadas por la pantalla o el
-- workflow desde Odoo: se guardan como alertas tipo 'incidencia_periodo', nunca se envían.
CREATE OR REPLACE FUNCTION nomina_usa.a_incidencias_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE i jsonb; n integer := 0; v_id bigint;
BEGIN
  FOR i IN SELECT * FROM jsonb_array_elements(coalesce(p->'incidencias', '[]'::jsonb)) LOOP
    IF i->>'tipo' NOT IN ('sin_checada', 'sin_cerrar', 'sin_so') THEN CONTINUE; END IF;
    INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, attendance_id, detalle, modo_al_crear)
    VALUES ('inc:' || (p->>'employee_id') || ':' || (i->>'fecha') || ':' || (i->>'tipo'), 'incidencia_periodo', (p->>'employee_id')::integer,
            (i->>'fecha')::date, nullif(i->>'attendance_id', '')::integer, i, 'sombra')
    ON CONFLICT (clave) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'nuevas', n);
END
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('alertas',               'nomina_usa.a_alertas',               '{nomina_usa:validar,nomina_usa:autorizar}'),
  ('alerta_marcar',         'nomina_usa.a_alerta_marcar',         '{nomina_usa:validar}'),
  ('incidencias_registrar', 'nomina_usa.a_incidencias_registrar', '{nomina_usa:validar,nomina_usa:kiosko}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
