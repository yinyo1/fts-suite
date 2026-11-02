-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0002 · Kiosko: día USA/MX, SO al entrar, plan, avance y «tu día» (#448, fase B)
--
-- Lo recibe el webhook nomina-usa/kiosko (sin sesión de la suite, igual que
-- kiosk/checkin). La checada de Odoo NO pasa por aquí ni cambia: esto es lo que la
-- nómina USA necesita además de la checada.
--
-- Principio: NADA de lo que manda el kiosko se tira. Un avance que baja o un día que
-- no suma 100 se guarda MARCADO (estado='rechazado' / valido=false) para que RH lo vea;
-- tirarlo dejaría al dispositivo reintentando para siempre y a RH sin saber.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fecha local de un instante para una persona: zona del dispositivo si es válida, si no
-- la de su ficha, si no Monterrey.
CREATE OR REPLACE FUNCTION nomina_usa.tz_valida(p text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN p IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p) THEN p END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.fecha_local(p_ts timestamptz, p_tz text, p_emp integer) RETURNS date
LANGUAGE sql STABLE AS $fn$
  SELECT (p_ts AT TIME ZONE coalesce(nomina_usa.tz_valida(p_tz),
            (SELECT zona_horaria FROM nomina_usa.ficha WHERE employee_id = p_emp), 'America/Monterrey'))::date
$fn$;

CREATE TABLE IF NOT EXISTS nomina_usa.evento_kiosko (
  id           bigserial   PRIMARY KEY,
  ev_id        text        NOT NULL UNIQUE,
  employee_id  integer     NOT NULL,
  tipo         text        NOT NULL,
  checada      text,
  ts_evento    timestamptz NOT NULL,
  fecha_local  date        NOT NULL,
  pais         text,
  pais_origen  text,
  pendiente_rh boolean     NOT NULL DEFAULT false,
  payload      jsonb       NOT NULL,
  recibido_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ek_tipo_ck   CHECK (tipo IN ('dia','entrada_so','plan','salida')),
  CONSTRAINT ek_pais_ck   CHECK (pais IS NULL OR pais IN ('USA','MX')),
  CONSTRAINT ek_origen_ck CHECK (pais_origen IS NULL OR pais_origen IN ('geo','declarado'))
);
CREATE INDEX IF NOT EXISTS ek_emp_fecha ON nomina_usa.evento_kiosko (employee_id, fecha_local);
CREATE INDEX IF NOT EXISTS ek_fecha_tipo ON nomina_usa.evento_kiosko (fecha_local, tipo);

-- Un renglón por persona y día. USA por ubicación gana sobre lo declarado; lo declarado
-- (sin ubicación) queda pendiente de RH hasta que Magaly lo valide.
CREATE TABLE IF NOT EXISTS nomina_usa.dia (
  employee_id  integer     NOT NULL,
  fecha        date        NOT NULL,
  pais         text        NOT NULL,
  origen       text        NOT NULL,
  pendiente_rh boolean     NOT NULL DEFAULT false,
  validado_por text,
  validado_at  timestamptz,
  nota_rh      text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, fecha),
  CONSTRAINT dia_pais_ck   CHECK (pais IN ('USA','MX')),
  CONSTRAINT dia_origen_ck CHECK (origen IN ('geo','declarado','rh'))
);

-- Avance reportado por SO. El vigente de una SO = el máximo 'aceptado'.
CREATE TABLE IF NOT EXISTS nomina_usa.avance_so (
  id           bigserial   PRIMARY KEY,
  so_id        integer     NOT NULL,
  so_nombre    text,
  fecha        date        NOT NULL,
  pct          integer     NOT NULL,
  ultimo_antes integer     NOT NULL DEFAULT 0,
  estado       text        NOT NULL DEFAULT 'aceptado',
  reporta      integer     NOT NULL,
  origen       text        NOT NULL DEFAULT 'kiosko',
  ev_id        text,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT av_pct_ck    CHECK (pct BETWEEN 0 AND 100),
  CONSTRAINT av_estado_ck CHECK (estado IN ('aceptado','rechazado')),
  CONSTRAINT av_origen_ck CHECK (origen IN ('kiosko','estimado','ajuste'))
);
CREATE INDEX IF NOT EXISTS av_so ON nomina_usa.avance_so (so_id, fecha);

CREATE OR REPLACE FUNCTION nomina_usa.avance_vigente(p_so integer) RETURNS integer
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(max(pct), 0) FROM nomina_usa.avance_so WHERE so_id = p_so AND estado = 'aceptado' AND origen = 'kiosko'
$fn$;

-- Plan de la mañana y día real (Ricardo). Uno por persona, fecha y tipo; el último manda.
CREATE TABLE IF NOT EXISTS nomina_usa.reparto_dia (
  employee_id  integer     NOT NULL,
  fecha        date        NOT NULL,
  tipo         text        NOT NULL,
  lineas       jsonb       NOT NULL,
  valido       boolean     NOT NULL,
  comercial    jsonb,
  ev_id        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, fecha, tipo),
  CONSTRAINT rd_tipo_ck CHECK (tipo IN ('plan','real'))
);

-- Evidencia de horas comerciales (compras con tarjeta, ubicación; correo y suite en otra
-- fase). La alimentan otros procesos; el sugerido sale de aquí.
CREATE TABLE IF NOT EXISTS nomina_usa.evidencia_comercial (
  id           bigserial   PRIMARY KEY,
  employee_id  integer     NOT NULL,
  fecha        date        NOT NULL,
  horas        numeric(5,2) NOT NULL CHECK (horas >= 0 AND horas <= 24),
  fuente       text        NOT NULL CHECK (fuente IN ('tarjeta','ubicacion','checada','correo','suite')),
  referencia   text,
  creado_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION nomina_usa.suma_reparto(p jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(sum((x->>'pct')::integer), 0)::integer FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.reparto_valido(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) > 0 AND nomina_usa.suma_reparto(p) = 100
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p) x WHERE (x->>'pct')::integer NOT BETWEEN 0 AND 100)
$fn$;

-- Sugerido comercial = horas con evidencia / horas checadas, redondeado a 10 %.
CREATE OR REPLACE FUNCTION nomina_usa.sugerido_comercial(p_horas_evid numeric, p_horas_checadas numeric) RETURNS integer
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN coalesce(p_horas_checadas, 0) <= 0 THEN 0
              ELSE (round(least(1, greatest(0, coalesce(p_horas_evid, 0) / p_horas_checadas)) * 10) * 10)::integer END
$fn$;

-- ── Contexto para el kiosko ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nomina_usa.kiosko_contexto(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_emp integer := (p->>'employee_id')::integer; f nomina_usa.ficha; v_hoy date; v_perfil text;
        v_entrada timestamptz; v_horas numeric; v_evid numeric; v_ult record; v_pend jsonb; v_hoy_sos jsonb; v_plan jsonb;
BEGIN
  SELECT * INTO f FROM nomina_usa.ficha WHERE employee_id = v_emp;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'activo', false); END IF;
  v_perfil := CASE WHEN f.tipo_pago_usa = 'supervisor_comercial' THEN 'plan_avance'
                   WHEN f.tipo_pago_usa = 'bolsa_avance' AND f.pide_so_entrada THEN 'so_entrada'
                   WHEN f.pais_nomina <> 'MX' THEN 'usa_simple' END;
  v_hoy := nomina_usa.fecha_local(now(), p->>'tz_evento', v_emp);

  -- SO con entrada HOY (de la cuadrilla con SO al entrar, y del propio plan).
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('so_id', (e.payload->'so'->>'id')::integer, 'so_nombre', e.payload->'so'->>'nombre')), '[]'::jsonb)
    INTO v_hoy_sos
    FROM nomina_usa.evento_kiosko e
   WHERE e.fecha_local = v_hoy AND e.tipo = 'entrada_so' AND e.payload->'so'->>'id' IS NOT NULL;
  SELECT lineas INTO v_plan FROM nomina_usa.reparto_dia WHERE employee_id = v_emp AND fecha = v_hoy AND tipo = 'plan';
  SELECT jsonb_agg(DISTINCT x) INTO v_hoy_sos FROM (
      SELECT jsonb_build_object('so_id', (s->>'so_id')::integer, 'so_nombre', s->>'so_nombre') x FROM jsonb_array_elements(v_hoy_sos) s
      UNION SELECT jsonb_build_object('so_id', (l->>'so_id')::integer, 'so_nombre', l->>'so_nombre') FROM jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) l WHERE l->>'so_id' IS NOT NULL) u;
  SELECT coalesce(jsonb_agg(x || jsonb_build_object('ultimo', nomina_usa.avance_vigente((x->>'so_id')::integer)) ORDER BY x->>'so_nombre'), '[]'::jsonb)
    INTO v_hoy_sos FROM jsonb_array_elements(coalesce(v_hoy_sos, '[]'::jsonb)) x;

  -- Pendientes: entradas de la cuadrilla DESPUÉS de su última salida de un día anterior,
  -- cuya SO no se reportó en esa salida ni después de la entrada.
  SELECT e.ts_evento, e.fecha_local, e.payload INTO v_ult FROM nomina_usa.evento_kiosko e
   WHERE e.employee_id = v_emp AND e.tipo = 'salida' AND e.fecha_local < v_hoy ORDER BY e.ts_evento DESC LIMIT 1;
  v_pend := '[]'::jsonb;
  IF v_ult.ts_evento IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('so_id', so, 'so_nombre', nom, 'ultimo', nomina_usa.avance_vigente(so))), '[]'::jsonb)
      INTO v_pend FROM (
        SELECT (e.payload->'so'->>'id')::integer so, e.payload->'so'->>'nombre' nom, e.ts_evento ts
          FROM nomina_usa.evento_kiosko e
         WHERE e.tipo = 'entrada_so' AND e.fecha_local = v_ult.fecha_local AND e.ts_evento > v_ult.ts_evento
           AND e.payload->'so'->>'id' IS NOT NULL) q
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_ult.payload->'avances', '[]'::jsonb)) a WHERE (a->>'so_id')::integer = q.so)
       AND NOT EXISTS (SELECT 1 FROM nomina_usa.avance_so a WHERE a.so_id = q.so AND a.reporta = v_emp AND a.creado_at > q.ts);
  END IF;

  SELECT min(e.ts_evento) INTO v_entrada FROM nomina_usa.evento_kiosko e
   WHERE e.employee_id = v_emp AND e.fecha_local = v_hoy AND e.checada = 'entrada';
  v_horas := CASE WHEN v_entrada IS NULL THEN 0 ELSE extract(epoch FROM (now() - v_entrada)) / 3600.0 END;
  SELECT coalesce(sum(horas), 0) INTO v_evid FROM nomina_usa.evidencia_comercial WHERE employee_id = v_emp AND fecha = v_hoy;

  RETURN jsonb_build_object('ok', true,
    'activo', (nomina_usa.cfg('kiosko_activo') = 'true'::jsonb) AND f.kiosko_usa AND f.activo,
    'perfil', v_perfil, 'fecha', v_hoy,
    'config', jsonb_build_object('tope_excepcion_puntos', nomina_usa.cfg('tope_excepcion_puntos'), 'tope_contra_plan_puntos', nomina_usa.cfg('tope_contra_plan_puntos')),
    'sos_avance_hoy', v_hoy_sos, 'pendientes_avance', v_pend, 'plan_hoy', coalesce(v_plan, '[]'::jsonb),
    'horas_checadas', round(v_horas, 2), 'horas_comerciales_evidencia', v_evid,
    'sugerido_comercial', nomina_usa.sugerido_comercial(v_evid, v_horas));
END
$fn$;

-- ── Evento del kiosko ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nomina_usa.kiosko_evento(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_emp integer := (p->>'employee_id')::integer; v_ts timestamptz; v_fecha date; v_tipo text := p->>'tipo';
        v_pais text := p->>'pais'; v_origen text := coalesce(p->>'pais_origen', 'geo'); a jsonb; v_ult integer; v_rech integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM nomina_usa.ficha WHERE employee_id = v_emp) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_FICHA');
  END IF;
  IF coalesce(p->>'ev_id', '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'EV_ID_REQUERIDO'); END IF;
  IF EXISTS (SELECT 1 FROM nomina_usa.evento_kiosko WHERE ev_id = p->>'ev_id') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DUPLICADO');
  END IF;
  v_ts := coalesce((p->>'ts_evento')::timestamptz, now());
  -- Un reloj de dispositivo con más de 12 h de diferencia no fecha el día.
  IF abs(extract(epoch FROM (v_ts - now()))) > 12 * 3600 AND coalesce((p->>'reintento')::boolean, false) = false THEN
    v_ts := least(v_ts, now());
  END IF;
  v_fecha := nomina_usa.fecha_local(v_ts, p->>'tz_evento', v_emp);

  INSERT INTO nomina_usa.evento_kiosko (ev_id, employee_id, tipo, checada, ts_evento, fecha_local, pais, pais_origen, pendiente_rh, payload)
  VALUES (p->>'ev_id', v_emp, v_tipo, p->>'checada', v_ts, v_fecha, v_pais, v_origen, coalesce((p->>'pendiente_rh')::boolean, false), p);

  IF v_pais IS NOT NULL THEN
    INSERT INTO nomina_usa.dia AS d (employee_id, fecha, pais, origen, pendiente_rh)
    VALUES (v_emp, v_fecha, v_pais, v_origen, v_origen = 'declarado')
    ON CONFLICT (employee_id, fecha) DO UPDATE SET
      -- La ubicación gana sobre lo declarado; lo ya validado por RH no se pisa.
      pais = CASE WHEN d.origen = 'rh' THEN d.pais WHEN excluded.origen = 'geo' OR d.origen = 'declarado' THEN excluded.pais ELSE d.pais END,
      origen = CASE WHEN d.origen = 'rh' THEN 'rh' WHEN excluded.origen = 'geo' THEN 'geo' ELSE d.origen END,
      pendiente_rh = CASE WHEN d.origen = 'rh' THEN false WHEN excluded.origen = 'geo' THEN false ELSE d.pendiente_rh OR excluded.pendiente_rh END,
      updated_at = now();
  END IF;

  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p->'avances', '[]'::jsonb)) LOOP
    v_ult := nomina_usa.avance_vigente((a->>'so_id')::integer);
    INSERT INTO nomina_usa.avance_so (so_id, so_nombre, fecha, pct, ultimo_antes, estado, reporta, ev_id)
    VALUES ((a->>'so_id')::integer, a->>'so_nombre', v_fecha, least(100, greatest(0, (a->>'pct')::integer)), v_ult,
            CASE WHEN (a->>'pct')::integer < v_ult OR (a->>'pct')::integer > 100 THEN 'rechazado' ELSE 'aceptado' END, v_emp, p->>'ev_id');
    IF (a->>'pct')::integer < v_ult THEN v_rech := v_rech + 1; END IF;
  END LOOP;

  IF v_tipo = 'plan' THEN
    INSERT INTO nomina_usa.reparto_dia (employee_id, fecha, tipo, lineas, valido, ev_id)
    VALUES (v_emp, v_fecha, 'plan', coalesce(p->'plan', '[]'::jsonb), nomina_usa.reparto_valido(p->'plan'), p->>'ev_id')
    ON CONFLICT (employee_id, fecha, tipo) DO UPDATE SET lineas = excluded.lineas, valido = excluded.valido, ev_id = excluded.ev_id, updated_at = now();
  ELSIF v_tipo = 'salida' THEN
    INSERT INTO nomina_usa.reparto_dia (employee_id, fecha, tipo, lineas, valido, comercial, ev_id)
    VALUES (v_emp, v_fecha, 'real', coalesce(p->'dia', '[]'::jsonb), nomina_usa.reparto_valido(p->'dia'), p->'comercial', p->>'ev_id')
    ON CONFLICT (employee_id, fecha, tipo) DO UPDATE SET lineas = excluded.lineas, valido = excluded.valido, comercial = excluded.comercial, ev_id = excluded.ev_id, updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'fecha', v_fecha, 'avances_rechazados', v_rech);
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.kiosko(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
BEGIN
  IF (p->>'employee_id') IS NULL OR (p->>'employee_id') = '' OR (p->>'employee_id') ~ '[^0-9]' THEN RETURN jsonb_build_object('ok', false, 'error', 'EMPLEADO_INVALIDO'); END IF;
  IF p->>'accion' = 'contexto' THEN RETURN nomina_usa.kiosko_contexto(p); END IF;
  IF p->>'accion' = 'evento' THEN RETURN nomina_usa.kiosko_evento(p); END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'ACCION_DESCONOCIDA');
EXCEPTION WHEN raise_exception OR check_violation OR invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
  RETURN jsonb_build_object('ok', false, 'error', 'EVENTO_INVALIDO', 'detalle', left(SQLERRM, 200));
END
$fn$;

-- Panel de RH: días pendientes de validar (sin ubicación) y validar uno.
CREATE OR REPLACE FUNCTION nomina_usa.a_dias(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'dias', coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('alias', f.alias) ORDER BY d.fecha DESC, f.alias), '[]'::jsonb))
    FROM nomina_usa.dia d JOIN nomina_usa.ficha f USING (employee_id)
   WHERE d.fecha BETWEEN coalesce((p->>'desde')::date, current_date - 14) AND coalesce((p->>'hasta')::date, current_date)
     AND (NOT coalesce((p->>'solo_pendientes')::boolean, false) OR d.pendiente_rh)
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_dia_validar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_antes jsonb; v_emp integer := (p->>'employee_id')::integer; v_f date := (p->>'fecha')::date;
BEGIN
  IF coalesce(p->>'pais', '') NOT IN ('USA', 'MX') THEN RETURN jsonb_build_object('ok', false, 'error', 'PAIS_INVALIDO'); END IF;
  SELECT to_jsonb(d) INTO v_antes FROM nomina_usa.dia d WHERE employee_id = v_emp AND fecha = v_f;
  INSERT INTO nomina_usa.dia AS d (employee_id, fecha, pais, origen, pendiente_rh, validado_por, validado_at, nota_rh)
  VALUES (v_emp, v_f, p->>'pais', 'rh', false, p->>'actor', now(), p->>'nota')
  ON CONFLICT (employee_id, fecha) DO UPDATE SET pais = excluded.pais, origen = 'rh', pendiente_rh = false,
     validado_por = excluded.validado_por, validado_at = now(), nota_rh = excluded.nota_rh, updated_at = now();
  PERFORM nomina_usa.log(p->>'actor', 'dia_validado', v_emp || '@' || v_f, v_antes, jsonb_build_object('pais', p->>'pais'), p->>'nota');
  RETURN jsonb_build_object('ok', true);
END
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('dias',        'nomina_usa.a_dias',        '{nomina_usa:validar,nomina_usa:autorizar,nomina_usa:kiosko}'),
  ('dia_validar', 'nomina_usa.a_dia_validar', '{nomina_usa:validar}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
