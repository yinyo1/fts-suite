-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0002 · lógica del ciclo (Retardos v2, issue #334)
--
-- n8n sólo mueve datos: lee Odoo, llama UNA función de aquí, y manda lo que
-- la función dejó en el outbox. Todas las decisiones (qué es retardo, qué
-- caso se abre, a quién se escribe, qué se vence) viven en estas funciones,
-- para que se puedan probar contra un Postgres local sin tocar n8n.
--
-- Etiquetas de dólar CON NOMBRE (db/README.md regla 4). Sin datos personales.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── utilidades ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION retardos.cfg(p_clave text) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT valor FROM retardos.config WHERE clave = p_clave
$fn$;

CREATE OR REPLACE FUNCTION retardos.cfg_txt(p_clave text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(valor) = 'string' THEN valor #>> '{}' ELSE valor::text END
  FROM retardos.config WHERE clave = p_clave
$fn$;

CREATE OR REPLACE FUNCTION retardos.email_valido(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT p IS NOT NULL
     AND p ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
     AND lower(split_part(p, '@', 2)) NOT IN ('gmai.com','gmial.com','hotmial.com','outlok.com','gmail.co','hotmail.co')
$fn$;

CREATE OR REPLACE FUNCTION retardos.es_habil(p_fecha date) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXTRACT(ISODOW FROM p_fecha)::int IN (SELECT jsonb_array_elements_text(retardos.cfg('dias_habiles'))::int)
     AND NOT EXISTS (SELECT 1 FROM retardos.festivo f WHERE f.fecha = p_fecha)
$fn$;

-- Suma N días hábiles a un instante; vence al final (23:59 local) del día N.
CREATE OR REPLACE FUNCTION retardos.sumar_habiles(p_desde timestamptz, p_n integer) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $fn$
DECLARE d date := (p_desde AT TIME ZONE 'America/Monterrey')::date; k integer := 0;
BEGIN
  IF p_n <= 0 THEN RETURN p_desde; END IF;
  WHILE k < p_n LOOP
    d := d + 1;
    IF retardos.es_habil(d) THEN k := k + 1; END IF;
  END LOOP;
  RETURN (d + time '23:59') AT TIME ZONE 'America/Monterrey';
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.hhmm(p numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p IS NULL THEN '' ELSE
    lpad(floor(p)::int::text, 2, '0') || ':' || lpad(round((p - floor(p)) * 60)::int::text, 2, '0') END
$fn$;

CREATE OR REPLACE FUNCTION retardos.render(p_txt text, p_vars jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE k text; v text; r text := p_txt;
BEGIN
  FOR k, v IN SELECT key, value FROM jsonb_each_text(p_vars) LOOP
    r := replace(r, '[[' || k || ']]', coalesce(v, ''));
  END LOOP;
  RETURN r;
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.nuevo_folio(p_fecha date) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE a integer := EXTRACT(YEAR FROM p_fecha)::int; n integer;
BEGIN
  INSERT INTO retardos.folio_seq (anio, ultimo) VALUES (a, 1)
  ON CONFLICT (anio) DO UPDATE SET ultimo = retardos.folio_seq.ultimo + 1
  RETURNING ultimo INTO n;
  RETURN 'RET-' || a || '-' || lpad(n::text, 4, '0');
END
$fn$;

-- ── bitácora y máquina de estados ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION retardos.log(p_caso bigint, p_evento text, p_actor text, p_motivo text,
                                        p_evid jsonb DEFAULT '{}'::jsonb, p_de text DEFAULT NULL, p_a text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $fn$
  INSERT INTO retardos.bitacora (caso_id, evento, de, a, actor, motivo, evidencia)
  VALUES (p_caso, p_evento, p_de, p_a, coalesce(p_actor, 'sistema'), p_motivo, coalesce(p_evid, '{}'::jsonb))
$fn$;

CREATE OR REPLACE FUNCTION retardos.transicionar(p_caso bigint, p_a text, p_actor text, p_motivo text,
                                                 p_evid jsonb DEFAULT '{}'::jsonb)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE c retardos.caso;
BEGIN
  SELECT * INTO c FROM retardos.caso WHERE id = p_caso FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASO_INEXISTENTE %', p_caso; END IF;
  IF c.estado = p_a THEN RETURN c.estado; END IF;           -- idempotente
  IF NOT EXISTS (SELECT 1 FROM retardos.transicion_valida WHERE de = c.estado AND a = p_a) THEN
    RAISE EXCEPTION 'TRANSICION_INVALIDA % -> % (caso %)', c.estado, p_a, c.folio;
  END IF;
  IF p_a = 'CANCELADO_POR_RH' AND char_length(coalesce(p_motivo, '')) < 5 THEN
    RAISE EXCEPTION 'MOTIVO_OBLIGATORIO: cancelar un caso exige motivo';
  END IF;
  UPDATE retardos.caso SET estado = p_a, actualizado_at = now(),
         cerrado_at = CASE WHEN p_a IN ('CERRADO','CANCELADO_POR_RH') THEN now() ELSE cerrado_at END,
         validado_at = CASE WHEN p_a = 'VALIDADO_RH' THEN now() ELSE validado_at END,
         validado_por = CASE WHEN p_a = 'VALIDADO_RH' THEN p_actor ELSE validado_por END
   WHERE id = p_caso;
  PERFORM retardos.log(p_caso, 'transicion', p_actor, p_motivo, p_evid, c.estado, p_a);
  RETURN p_a;
END
$fn$;

-- ── outbox ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION retardos.encolar(p_clave text, p_caso bigint, p_tipo text, p_para jsonb, p_cc jsonb,
                                            p_asunto text, p_html text, p_pdf text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE v_id bigint;
BEGIN
  INSERT INTO retardos.envio (clave_dedupe, caso_id, tipo, para, cc, asunto, cuerpo_html, pdf)
  VALUES (p_clave, p_caso, p_tipo, coalesce(p_para, '[]'::jsonb), coalesce(p_cc, '[]'::jsonb), p_asunto, p_html, p_pdf)
  ON CONFLICT (clave_dedupe) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;   -- NULL si ya existía: el reintento no duplica
END
$fn$;

-- Datos de un caso listos para plantilla y PDF (privado: incluye el nombre).
CREATE OR REPLACE FUNCTION retardos.caso_datos(p_caso bigint) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'folio', c.folio, 'nivel', c.nivel, 'accion', c.accion, 'estado', c.estado,
    'nombre_nivel', e.nombre, 'periodo', c.periodo, 'retardos_n', c.retardos_n,
    'motivo_apertura', c.motivo_apertura,
    'nombre', coalesce(m.nombre, 'Empleado ' || c.employee_id), 'puesto', coalesce(m.puesto, ''),
    'departamento', coalesce(m.departamento, ''), 'employee_id', c.employee_id,
    'email', m.email, 'email_valido', coalesce(m.email_valido, false),
    'supervisor', coalesce(s.nombre, ''), 'supervisor_email', CASE WHEN s.email_valido THEN s.email END,
    'vence', to_char(c.vence_at AT TIME ZONE 'America/Monterrey', 'DD/MM/YYYY'),
    'accion_desde', to_char(c.accion_desde, 'DD/MM/YYYY'), 'accion_hasta', to_char(c.accion_hasta, 'DD/MM/YYYY'),
    'dias_suspension', e.dias_suspension, 'requiere_testigos', e.requiere_testigos,
    'fecha_emision', to_char(c.abierto_at AT TIME ZONE 'America/Monterrey', 'DD/MM/YYYY'),
    'retardos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'fecha', to_char(r.fecha, 'DD/MM/YYYY'), 'llegada', retardos.hhmm(r.hora_local),
        'esperada', retardos.hhmm(r.hora_esperada), 'minutos', r.minutos_tarde) ORDER BY r.fecha)
      FROM retardos.caso_retardo cr JOIN retardos.retardo r ON r.id = cr.retardo_id
      WHERE cr.caso_id = c.id), '[]'::jsonb))
  FROM retardos.caso c
  JOIN retardos.escalera e ON e.nivel = c.nivel
  LEFT JOIN retardos.empleado m ON m.employee_id = c.employee_id
  LEFT JOIN retardos.empleado s ON s.employee_id = m.parent_id
  WHERE c.id = p_caso
$fn$;

CREATE OR REPLACE FUNCTION retardos.tabla_retardos(p_datos jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT '<table style="border-collapse:collapse;font-size:14px"><tr>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Fecha</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Hora de llegada</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Hora de entrada</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Minutos tarde</th></tr>'
      || coalesce(string_agg('<tr><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'fecha')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'llegada')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'esperada')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'minutos') || '</td></tr>', ''), '')
      || '</table>'
  FROM jsonb_array_elements(p_datos->'retardos') x
$fn$;

-- Encola un correo a partir de una plantilla y el caso.
CREATE OR REPLACE FUNCTION retardos.encolar_plantilla(p_caso bigint, p_plantilla text, p_tipo text, p_clave text,
                                                      p_para jsonb, p_cc jsonb, p_pdf text DEFAULT NULL,
                                                      p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE t retardos.plantilla; d jsonb; v jsonb;
BEGIN
  SELECT * INTO t FROM retardos.plantilla WHERE clave = p_plantilla;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLANTILLA_INEXISTENTE %', p_plantilla; END IF;
  d := coalesce(retardos.caso_datos(p_caso), '{}'::jsonb);
  v := (d - 'retardos') || jsonb_build_object('detalle', retardos.tabla_retardos(d),
         'responder_a', coalesce(retardos.cfg_txt('buzon_receptor'), retardos.cfg_txt('remitente'))) || coalesce(p_extra, '{}'::jsonb);
  RETURN retardos.encolar(p_clave, p_caso, p_tipo, p_para, p_cc,
                          retardos.render(t.asunto, v), retardos.render(t.cuerpo_html, v), p_pdf);
END
$fn$;

-- ── apertura de un caso ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION retardos.abrir_caso(p_emp integer, p_periodo text, p_nivel smallint, p_motivo text,
                                               p_corrida bigint)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE e retardos.escalera; m retardos.empleado; sup retardos.empleado; v_id bigint; v_folio text; n integer;
        v_para jsonb; v_cc jsonb; v_rh jsonb := coalesce(retardos.cfg('rh_destinatarios'), '[]'::jsonb);
BEGIN
  SELECT * INTO e FROM retardos.escalera WHERE nivel = p_nivel;
  SELECT count(*) INTO n FROM retardos.retardo WHERE employee_id = p_emp AND periodo = p_periodo AND estado = 'contado';
  v_folio := retardos.nuevo_folio(current_date);
  INSERT INTO retardos.caso (folio, employee_id, periodo, nivel, accion, motivo_apertura, estado, requiere_firma,
                             retardos_n, modo_al_abrir)
  VALUES (v_folio, p_emp, p_periodo, p_nivel, e.accion, p_motivo, 'DETECTADO', e.requiere_firma, n,
          retardos.cfg_txt('modo'))
  ON CONFLICT (employee_id, periodo, nivel) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO retardos.caso_retardo (caso_id, retardo_id)
  SELECT v_id, r.id FROM retardos.retardo r
   WHERE r.employee_id = p_emp AND r.periodo = p_periodo AND r.estado = 'contado'
  ON CONFLICT DO NOTHING;

  PERFORM retardos.log(v_id, 'apertura', 'sistema',
    'Nivel ' || p_nivel || ' (' || e.accion || ') por ' || p_motivo || ' con ' || n || ' retardos en ' || p_periodo,
    jsonb_build_object('corrida_id', p_corrida, 'retardos_n', n), NULL, 'DETECTADO');

  SELECT * INTO m FROM retardos.empleado WHERE employee_id = p_emp;
  SELECT * INTO sup FROM retardos.empleado WHERE employee_id = m.parent_id;
  v_cc := v_rh;
  IF sup.email_valido THEN v_cc := v_cc || to_jsonb(sup.email); END IF;

  IF m.email_valido THEN
    v_para := jsonb_build_array(m.email);
    PERFORM retardos.encolar_plantilla(v_id, 'notificacion_' || e.accion, 'notificacion', v_folio || ':notificacion',
                                       v_para, v_cc, CASE WHEN e.accion = 'aviso' THEN NULL ELSE e.accion END);
  ELSE
    -- Ruta alterna: sin correo válido, el caso va al supervisor (o a RH) para entrega en físico.
    UPDATE retardos.caso SET ruta = 'supervisor' WHERE id = v_id;
    v_para := CASE WHEN sup.email_valido THEN jsonb_build_array(sup.email) ELSE v_rh END;
    PERFORM retardos.encolar_plantilla(v_id, 'ruta_supervisor', 'ruta_supervisor', v_folio || ':ruta_supervisor',
                                       v_para, v_rh, CASE WHEN e.accion = 'aviso' THEN NULL ELSE e.accion END);
    PERFORM retardos.log(v_id, 'ruta_alterna', 'sistema', 'Empleado sin correo válido: entrega por supervisor o RH');
  END IF;
  RETURN v_id;
END
$fn$;

-- ── INGESTA (workflow retardos/detectar) ──────────────────────────────────
-- p = { workflow, desde, hasta,
--       empleados: [{employee_id, nombre, puesto, company_id, activo, hora_entrada, hora_calendario,
--                    email, parent_id, departamento}],
--       checadas:  [{attendance_id, employee_id, check_in_utc, disputa, incidencia_pendiente}],
--       olvido_entrada_att: [attendance_id, …] }
CREATE OR REPLACE FUNCTION retardos.ingestar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_corrida bigint; v_desde date := (p->>'desde')::date; v_hasta date := (p->>'hasta')::date;
  v_tol integer := coalesce(retardos.cfg_txt('tolerancia_min')::int, 20);
  v_fuente text := coalesce(retardos.cfg_txt('hora_fuente'), 'hora_entrada');
  v_contar date := coalesce(retardos.cfg_txt('contar_desde')::date, '2000-01-01');
  v_reinc integer := coalesce(retardos.cfg_txt('reincidencia_dias')::int, 30);
  v_emp_ok integer[] := ARRAY(SELECT jsonb_array_elements_text(retardos.cfg('empresa_ids'))::int);
  r record; v_n_chec integer := 0; v_nuevos integer := 0; v_contados integer := 0; v_excl integer := 0;
  v_anul integer := 0; v_sinhora integer := 0; v_casos text[] := '{}'; v_id bigint; v_estado text; v_motivo text;
  v_esperada numeric; v_min integer; L smallint; E smallint; v_periodo text; v_alta boolean;
BEGIN
  IF v_desde IS NULL OR v_hasta IS NULL THEN RAISE EXCEPTION 'RANGO_INVALIDO'; END IF;
  INSERT INTO retardos.corrida (workflow, leidos, resumen)
  VALUES (coalesce(p->>'workflow', 'retardos/detectar'), jsonb_array_length(coalesce(p->'checadas', '[]'::jsonb)),
          jsonb_build_object('desde', v_desde, 'hasta', v_hasta))
  RETURNING id INTO v_corrida;

  -- 1) espejo del padrón
  INSERT INTO retardos.empleado AS t (employee_id, nombre, puesto, company_id, activo, hora_entrada, hora_calendario,
                                     email, email_valido, parent_id, departamento, actualizado_at)
  SELECT (x->>'employee_id')::int, x->>'nombre', x->>'puesto', (x->>'company_id')::int, coalesce((x->>'activo')::boolean, true),
         nullif(x->>'hora_entrada', '')::numeric, nullif(x->>'hora_calendario', '')::numeric,
         lower(trim(x->>'email')), retardos.email_valido(lower(trim(x->>'email'))),
         nullif(x->>'parent_id', '')::int, x->>'departamento', now()
    FROM jsonb_array_elements(coalesce(p->'empleados', '[]'::jsonb)) x
  ON CONFLICT (employee_id) DO UPDATE SET nombre = EXCLUDED.nombre, puesto = EXCLUDED.puesto,
     company_id = EXCLUDED.company_id, activo = EXCLUDED.activo, hora_entrada = EXCLUDED.hora_entrada,
     hora_calendario = EXCLUDED.hora_calendario, email = EXCLUDED.email, email_valido = EXCLUDED.email_valido,
     parent_id = EXCLUDED.parent_id, departamento = EXCLUDED.departamento, actualizado_at = now();

  -- 2) checadas crudas
  WITH src AS (
    SELECT (x->>'attendance_id')::int AS att, (x->>'employee_id')::int AS emp,
           (x->>'check_in_utc')::timestamptz AS ci,
           coalesce((x->>'disputa')::boolean, false) OR coalesce(x->>'incidencia_pendiente', '') <> '' AS disp
      FROM jsonb_array_elements(coalesce(p->'checadas', '[]'::jsonb)) x
     WHERE x->>'employee_id' IS NOT NULL)
  INSERT INTO retardos.checada AS t (attendance_id, employee_id, fecha, hora_local, check_in_utc, disputa, olvido_entrada)
  SELECT att, emp, (ci AT TIME ZONE 'America/Monterrey')::date,
         EXTRACT(EPOCH FROM ((ci AT TIME ZONE 'America/Monterrey') - date_trunc('day', ci AT TIME ZONE 'America/Monterrey'))) / 3600.0,
         ci, disp,
         att IN (SELECT jsonb_array_elements_text(coalesce(p->'olvido_entrada_att', '[]'::jsonb))::int)
    FROM src
  ON CONFLICT (attendance_id) DO UPDATE SET employee_id = EXCLUDED.employee_id, fecha = EXCLUDED.fecha,
     hora_local = EXCLUDED.hora_local, check_in_utc = EXCLUDED.check_in_utc, disputa = EXCLUDED.disputa,
     olvido_entrada = EXCLUDED.olvido_entrada, visto_at = now();
  GET DIAGNOSTICS v_n_chec = ROW_COUNT;

  -- 3) primera checada por persona y día dentro del rango → retardo o no
  FOR r IN
    SELECT DISTINCT ON (c.employee_id, c.fecha) c.*, m.hora_entrada, m.hora_calendario, m.company_id
      FROM retardos.checada c
      JOIN retardos.empleado m ON m.employee_id = c.employee_id
     WHERE c.fecha BETWEEN v_desde AND v_hasta
       AND m.company_id = ANY (v_emp_ok)
     ORDER BY c.employee_id, c.fecha, c.hora_local, c.attendance_id
  LOOP
    IF NOT retardos.es_habil(r.fecha) AND NOT EXISTS (SELECT 1 FROM retardos.festivo WHERE fecha = r.fecha) THEN
      CONTINUE;                                        -- fin de semana: no existe retardo
    END IF;
    v_esperada := CASE WHEN v_fuente = 'calendario' THEN r.hora_calendario ELSE r.hora_entrada END;
    IF v_esperada IS NULL OR v_esperada <= 0 THEN v_sinhora := v_sinhora + 1; CONTINUE; END IF;
    v_min := floor((r.hora_local - v_esperada) * 60)::int;

    IF r.hora_local <= v_esperada + v_tol / 60.0 THEN
      -- Ya no es retardo (p. ej. RH corrigió la entrada): se anula si existía.
      UPDATE retardos.retardo SET estado = 'anulado', motivo = 'recalculo: ya no es retardo', actualizado_at = now()
       WHERE employee_id = r.employee_id AND fecha = r.fecha AND estado <> 'anulado';
      IF FOUND THEN v_anul := v_anul + 1; END IF;
      CONTINUE;
    END IF;

    v_estado := 'contado'; v_motivo := NULL;
    IF EXISTS (SELECT 1 FROM retardos.festivo WHERE fecha = r.fecha) THEN v_estado := 'excluido'; v_motivo := 'festivo';
    ELSIF r.olvido_entrada THEN v_estado := 'excluido'; v_motivo := 'olvido_entrada';
    ELSIF r.disputa THEN v_estado := 'excluido'; v_motivo := 'horario_en_disputa';
    ELSE
      SELECT 'exclusion:' || x.tipo INTO v_motivo FROM retardos.exclusion x
       WHERE x.activo AND x.employee_id = r.employee_id AND r.fecha BETWEEN x.desde AND x.hasta LIMIT 1;
      IF v_motivo IS NOT NULL THEN v_estado := 'excluido';
      ELSIF r.fecha < v_contar THEN v_estado := 'excluido'; v_motivo := 'antes_de_contar_desde';
      END IF;
    END IF;

    INSERT INTO retardos.retardo AS t (employee_id, fecha, attendance_id, hora_local, hora_esperada, tolerancia_min,
                                       minutos_tarde, estado, motivo, periodo, corrida_id)
    VALUES (r.employee_id, r.fecha, r.attendance_id, r.hora_local, v_esperada, v_tol, v_min, v_estado, v_motivo,
            to_char(r.fecha, 'YYYY-MM'), v_corrida)
    ON CONFLICT (employee_id, fecha) DO UPDATE
       SET attendance_id = EXCLUDED.attendance_id, hora_local = EXCLUDED.hora_local,
           hora_esperada = EXCLUDED.hora_esperada, minutos_tarde = EXCLUDED.minutos_tarde,
           estado = EXCLUDED.estado, motivo = EXCLUDED.motivo, actualizado_at = now()
     WHERE (t.estado, coalesce(t.motivo, ''), t.attendance_id) IS DISTINCT FROM (EXCLUDED.estado, coalesce(EXCLUDED.motivo, ''), EXCLUDED.attendance_id)
    RETURNING (xmax = 0) INTO v_alta;                 -- true si fue alta nueva; NULL si no cambió nada
    IF FOUND THEN
      IF v_alta THEN v_nuevos := v_nuevos + 1; END IF;
      IF v_estado = 'contado' THEN v_contados := v_contados + 1; ELSE v_excl := v_excl + 1; END IF;
    END IF;
    v_alta := NULL;
  END LOOP;

  -- 4) escalera por umbral: un caso por (persona, periodo, nivel); se abre sólo el nivel más alto alcanzado
  FOR r IN
    SELECT employee_id, periodo, count(*) AS n FROM retardos.retardo
     WHERE estado = 'contado' AND fecha BETWEEN v_desde AND v_hasta
     GROUP BY employee_id, periodo
  LOOP
    SELECT max(nivel) INTO L FROM retardos.escalera WHERE activo AND umbral <= r.n;
    SELECT max(nivel) INTO E FROM retardos.caso WHERE employee_id = r.employee_id AND periodo = r.periodo;
    IF L IS NOT NULL AND (E IS NULL OR L > E) THEN
      v_id := retardos.abrir_caso(r.employee_id, r.periodo, L, 'umbral', v_corrida);
      IF v_id IS NOT NULL THEN v_casos := v_casos || (SELECT folio FROM retardos.caso WHERE id = v_id); END IF;
    END IF;
  END LOOP;

  -- 5) reincidencia: retardo contado después de un caso con firma validada → siguiente nivel
  FOR r IN
    SELECT DISTINCT ON (c.employee_id) c.employee_id, c.nivel, c.validado_at, x.periodo
      FROM retardos.caso c
      JOIN retardos.retardo x ON x.employee_id = c.employee_id AND x.estado = 'contado'
       AND x.fecha > (c.validado_at AT TIME ZONE 'America/Monterrey')::date
       AND x.fecha <= (c.validado_at AT TIME ZONE 'America/Monterrey')::date + v_reinc
       AND x.fecha BETWEEN v_desde AND v_hasta
     WHERE c.requiere_firma AND c.validado_at IS NOT NULL
       AND c.estado IN ('VALIDADO_RH','ACCION_PROGRAMADA','ACCION_VERIFICADA','CERRADO')
     ORDER BY c.employee_id, c.nivel DESC, x.fecha
  LOOP
    SELECT min(nivel) INTO L FROM retardos.escalera WHERE activo AND nivel > r.nivel;
    IF L IS NOT NULL AND NOT EXISTS (SELECT 1 FROM retardos.caso WHERE employee_id = r.employee_id
                                     AND nivel >= L AND abierto_at >= r.validado_at) THEN
      v_id := retardos.abrir_caso(r.employee_id, r.periodo, L, 'reincidencia', v_corrida);
      IF v_id IS NOT NULL THEN v_casos := v_casos || (SELECT folio FROM retardos.caso WHERE id = v_id); END IF;
    END IF;
  END LOOP;

  UPDATE retardos.corrida SET terminada_at = now(), ok = true,
         resumen = resumen || jsonb_build_object('checadas', v_n_chec, 'retardos_nuevos', v_nuevos,
           'contados', v_contados, 'excluidos', v_excl, 'anulados', v_anul, 'sin_hora', v_sinhora,
           'casos_nuevos', to_jsonb(v_casos))
   WHERE id = v_corrida;
  RETURN (SELECT resumen || jsonb_build_object('corrida_id', id, 'leidos', leidos) FROM retardos.corrida WHERE id = v_corrida);
END
$fn$;

-- ── envío (workflow retardos/enviar) ──────────────────────────────────────
-- Devuelve los correos listos, con destinatarios EFECTIVOS según el modo vigente
-- al momento de enviar (no al de encolar). En sombra: todo a sombra_destinatarios,
-- [SOMBRA] en el asunto y el destinatario real escrito en el cuerpo.
CREATE OR REPLACE FUNCTION retardos.por_enviar(p_limite integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_modo text := coalesce(retardos.cfg_txt('modo'), 'sombra'); v_out jsonb := '[]'::jsonb; e retardos.envio;
        v_para jsonb; v_cc jsonb; v_asunto text; v_html text; v_real text;
BEGIN
  -- Las notas a Odoo no existen en sombra.
  UPDATE retardos.envio SET estado = 'omitido', modo_envio = 'sombra', error = 'sombra: sin escritura a Odoo'
   WHERE estado = 'pendiente' AND tipo = 'odoo_nota' AND v_modo = 'sombra';

  FOR e IN SELECT * FROM retardos.envio
            WHERE estado IN ('pendiente','fallido') AND intentos < 5 AND tipo <> 'odoo_nota'
            ORDER BY id LIMIT p_limite FOR UPDATE SKIP LOCKED
  LOOP
    v_real := 'Para: ' || coalesce((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(e.para) x), '(nadie)')
           || ' | CC: ' || coalesce((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(e.cc) x), '(nadie)');
    IF v_modo = 'real' THEN
      v_para := e.para; v_cc := e.cc; v_asunto := e.asunto; v_html := e.cuerpo_html;
    ELSE
      v_para := coalesce(retardos.cfg('sombra_destinatarios'), '[]'::jsonb); v_cc := '[]'::jsonb;
      v_asunto := '[SOMBRA] ' || e.asunto;
      v_html := '<div style="border:2px dashed #b45309;padding:8px;margin-bottom:12px;font-family:Arial;font-size:13px">'
             || '<b>MODO SOMBRA.</b> Este correo NO llegó a su destinatario real. Destinatario real: ' || v_real
             || '</div>' || e.cuerpo_html;
    END IF;
    IF jsonb_array_length(v_para) = 0 THEN
      UPDATE retardos.envio SET estado = 'fallido', intentos = intentos + 1, error = 'SIN_DESTINATARIO' WHERE id = e.id;
      CONTINUE;
    END IF;
    v_out := v_out || jsonb_build_object('id', e.id, 'tipo', e.tipo, 'modo', v_modo, 'para', v_para, 'cc', v_cc,
               'asunto', v_asunto, 'html', v_html, 'pdf', e.pdf,
               'responder_a', coalesce(retardos.cfg_txt('buzon_receptor'), retardos.cfg_txt('remitente')),
               'caso', CASE WHEN e.caso_id IS NULL THEN NULL ELSE retardos.caso_datos(e.caso_id) END);
  END LOOP;
  RETURN v_out;
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.marcar_envio(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE e retardos.envio; c retardos.caso; v_ok boolean := coalesce((p->>'ok')::boolean, false);
        v_plazo integer;
BEGIN
  SELECT * INTO e FROM retardos.envio WHERE id = (p->>'id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ENVIO_INEXISTENTE'); END IF;
  IF e.estado = 'enviado' THEN RETURN jsonb_build_object('ok', true, 'ya_enviado', true); END IF;
  IF NOT v_ok THEN
    UPDATE retardos.envio SET estado = 'fallido', intentos = intentos + 1, error = left(coalesce(p->>'error', 'desconocido'), 500)
     WHERE id = e.id;
    RETURN jsonb_build_object('ok', true, 'estado', 'fallido');
  END IF;
  UPDATE retardos.envio SET estado = 'enviado', intentos = intentos + 1, enviado_at = now(), error = NULL,
         modo_envio = p->>'modo', para_efectivo = p->'para_efectivo'
   WHERE id = e.id;
  IF e.caso_id IS NOT NULL AND e.tipo IN ('notificacion','ruta_supervisor') THEN
    SELECT * INTO c FROM retardos.caso WHERE id = e.caso_id;
    IF c.estado = 'DETECTADO' THEN
      PERFORM retardos.transicionar(c.id, 'NOTIFICADO', 'sistema', 'Correo enviado (' || coalesce(p->>'modo', '?') || ')',
                                    jsonb_build_object('envio_id', e.id));
      IF c.requiere_firma THEN
        SELECT dias_plazo_firma INTO v_plazo FROM retardos.escalera WHERE nivel = c.nivel;
        PERFORM retardos.transicionar(c.id, 'ESPERANDO_FIRMA', 'sistema', 'Plazo de ' || v_plazo || ' días hábiles');
        UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), v_plazo) WHERE id = c.id;
      ELSE
        PERFORM retardos.transicionar(c.id, 'CERRADO', 'sistema', 'Aviso informativo: no requiere firma');
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'estado', 'enviado');
END
$fn$;

-- ── respuestas por correo (workflow retardos/lector) ──────────────────────
-- p = { message_id, remitente, asunto, recibido_at,
--       adjuntos: [{nombre, mime, contenido_b64}] }
CREATE OR REPLACE FUNCTION retardos.registrar_respuesta(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_folio text; c retardos.caso; m retardos.empleado; sup retardos.empleado; v_rem text := lower(trim(p->>'remitente'));
        v_clas text; a jsonb; v_bytes bytea; v_sha text; v_validos integer := 0; v_total integer;
        v_rh jsonb := coalesce(retardos.cfg('rh_destinatarios'), '[]'::jsonb); v_mid text := p->>'message_id';
BEGIN
  IF v_mid IS NULL THEN RAISE EXCEPTION 'SIN_MESSAGE_ID'; END IF;
  IF EXISTS (SELECT 1 FROM retardos.correo_entrante WHERE message_id = v_mid) THEN
    RETURN jsonb_build_object('ok', true, 'clasificacion', 'duplicado');
  END IF;
  v_folio := substring(coalesce(p->>'asunto', '') FROM 'RET-[0-9]{4}-[0-9]{4}');
  v_total := jsonb_array_length(coalesce(p->'adjuntos', '[]'::jsonb));

  IF v_folio IS NULL THEN
    v_clas := 'sin_folio';
  ELSE
    SELECT * INTO c FROM retardos.caso WHERE folio = v_folio;
    IF NOT FOUND THEN v_clas := 'folio_inexistente';
    ELSE
      SELECT * INTO m FROM retardos.empleado WHERE employee_id = c.employee_id;
      SELECT * INTO sup FROM retardos.empleado WHERE employee_id = m.parent_id;
      IF v_rem IS DISTINCT FROM m.email AND v_rem IS DISTINCT FROM sup.email THEN v_clas := 'remitente_distinto';
      ELSIF c.estado IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA') THEN v_clas := 'caso_cerrado';
      ELSIF v_total = 0 THEN v_clas := 'sin_adjunto';
      ELSE v_clas := 'ok';
      END IF;
    END IF;
  END IF;

  -- Guardar adjuntos (evidencia) cuando hay caso, sea o no válido el remitente: RH decide.
  IF c.id IS NOT NULL AND v_total > 0 THEN
    FOR a IN SELECT * FROM jsonb_array_elements(p->'adjuntos') LOOP
      BEGIN
        v_bytes := decode(a->>'contenido_b64', 'base64');
      EXCEPTION WHEN others THEN v_bytes := NULL;
      END;
      IF v_bytes IS NULL OR length(v_bytes) < 1024
         OR lower(coalesce(a->>'mime', '')) !~ '^(application/pdf|image/(jpeg|png|heic|heif|webp))$' THEN
        CONTINUE;                                       -- ilegible o de tipo no aceptado
      END IF;
      v_sha := encode(sha256(v_bytes), 'hex');
      INSERT INTO retardos.evidencia (caso_id, sha256, nombre, mime, bytes, contenido, origen, remitente, message_id)
      VALUES (c.id, v_sha, left(coalesce(a->>'nombre', 'adjunto'), 200), lower(a->>'mime'), length(v_bytes), v_bytes,
              'correo', v_rem, v_mid)
      ON CONFLICT (caso_id, sha256) DO NOTHING;
      v_validos := v_validos + 1;
    END LOOP;
    IF v_clas = 'ok' AND v_validos = 0 THEN v_clas := 'adjunto_invalido'; END IF;
  END IF;

  INSERT INTO retardos.correo_entrante (message_id, recibido_at, remitente, asunto, folio, caso_id, adjuntos, clasificacion)
  VALUES (v_mid, coalesce((p->>'recibido_at')::timestamptz, now()), coalesce(v_rem, ''), left(coalesce(p->>'asunto', ''), 300),
          v_folio, c.id, v_total, v_clas);

  IF v_clas = 'ok' THEN
    PERFORM retardos.transicionar(c.id, 'FIRMA_RECIBIDA', 'correo:' || v_rem, 'Hoja recibida por correo',
                                  jsonb_build_object('message_id', v_mid, 'adjuntos_validos', v_validos));
    PERFORM retardos.encolar_plantilla(c.id, 'aviso_rh_firma', 'aviso_rh', c.folio || ':aviso_rh:' || v_mid,
                                       v_rh, '[]'::jsonb);
    PERFORM retardos.encolar(c.folio || ':odoo_nota:' || v_mid, c.id, 'odoo_nota', '[]'::jsonb, '[]'::jsonb,
                             'Hoja firmada ' || c.folio, 'Hoja firmada recibida por correo para el caso ' || c.folio);
  ELSIF v_clas IN ('sin_adjunto','adjunto_invalido') THEN
    PERFORM retardos.log(c.id, 'respuesta_' || v_clas, 'correo:' || v_rem, 'Respuesta sin hoja válida',
                         jsonb_build_object('message_id', v_mid));
    PERFORM retardos.encolar_plantilla(c.id, 'pide_hoja', 'pide_hoja', c.folio || ':pide_hoja:' || v_mid,
                                       jsonb_build_array(v_rem), '[]'::jsonb);
  ELSIF v_clas IN ('remitente_distinto','sin_folio','folio_inexistente','caso_cerrado') THEN
    IF c.id IS NOT NULL THEN
      PERFORM retardos.log(c.id, 'respuesta_' || v_clas, 'correo:' || v_rem, 'Requiere revisión de RH',
                           jsonb_build_object('message_id', v_mid));
    END IF;
    PERFORM retardos.encolar('revision:' || v_mid, c.id, 'revision_rh', v_rh, '[]'::jsonb,
      'Retardos: respuesta que requiere revisión (' || v_clas || ')',
      '<p>Llegó un correo al buzón de retardos que el sistema no pudo asociar solo.</p><p>Clasificación: <b>'
      || v_clas || '</b><br>Folio en el asunto: ' || coalesce(v_folio, '(ninguno)') || '<br>Remitente: '
      || coalesce(v_rem, '') || '<br>Adjuntos: ' || v_total || '</p><p>Revísalo en el panel de Retardos.</p>');
  END IF;
  RETURN jsonb_build_object('ok', true, 'clasificacion', v_clas, 'folio', v_folio, 'adjuntos_validos', v_validos);
END
$fn$;

-- ── verificación diaria (workflow retardos/verificar) ─────────────────────
-- p = { nom: [{employee_id, desde, hasta, fuente}] }   ← lo que Nómina · Incidencias ya tiene registrado
CREATE OR REPLACE FUNCTION retardos.verificar(p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE c record; v_hoy date := (now() AT TIME ZONE 'America/Monterrey')::date; v_plazo integer;
        v_rh jsonb := coalesce(retardos.cfg('rh_destinatarios'), '[]'::jsonb);
        v_esc jsonb := coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb);
        v_dval integer := coalesce(retardos.cfg_txt('dias_validacion_rh')::int, 2);
        n_venc integer := 0; n_esc integer := 0; n_rec_rh integer := 0; n_verif integer := 0; n_alert integer := 0;
        v_chec integer; v_nom boolean; v_corrida bigint;
BEGIN
  INSERT INTO retardos.corrida (workflow) VALUES ('retardos/verificar') RETURNING id INTO v_corrida;

  -- 1) firma vencida por primera vez → VENCIDO + recordatorio con copia a supervisor y RH
  FOR c IN SELECT k.*, m.email AS emp_email, m.email_valido AS emp_ok, s.email AS sup_email, s.email_valido AS sup_ok
             FROM retardos.caso k LEFT JOIN retardos.empleado m ON m.employee_id = k.employee_id
             LEFT JOIN retardos.empleado s ON s.employee_id = m.parent_id
            WHERE k.estado = 'ESPERANDO_FIRMA' AND k.vence_at < now()
  LOOP
    SELECT dias_plazo_firma INTO v_plazo FROM retardos.escalera WHERE nivel = c.nivel;
    PERFORM retardos.transicionar(c.id, 'VENCIDO', 'sistema', 'Sin hoja firmada al vencer el plazo');
    UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), greatest(v_plazo, 1)), recordatorios = recordatorios + 1 WHERE id = c.id;
    PERFORM retardos.encolar_plantilla(c.id, 'recordatorio', 'recordatorio', c.folio || ':recordatorio:1',
      CASE WHEN c.emp_ok THEN jsonb_build_array(c.emp_email) ELSE v_rh END,
      v_rh || CASE WHEN c.sup_ok THEN jsonb_build_array(c.sup_email) ELSE '[]'::jsonb END,
      CASE WHEN c.accion = 'aviso' THEN NULL ELSE c.accion END);
    n_venc := n_venc + 1;
  END LOOP;

  -- 2) vencida otra vez → ESCALADO con copia a dirección
  FOR c IN SELECT k.*, m.email AS emp_email, m.email_valido AS emp_ok, s.email AS sup_email, s.email_valido AS sup_ok
             FROM retardos.caso k LEFT JOIN retardos.empleado m ON m.employee_id = k.employee_id
             LEFT JOIN retardos.empleado s ON s.employee_id = m.parent_id
            WHERE k.estado = 'VENCIDO' AND k.vence_at < now()
  LOOP
    PERFORM retardos.transicionar(c.id, 'ESCALADO', 'sistema', 'Segundo vencimiento sin hoja firmada');
    PERFORM retardos.encolar_plantilla(c.id, 'escalamiento', 'escalamiento', c.folio || ':escalamiento',
      v_rh || CASE WHEN c.sup_ok THEN jsonb_build_array(c.sup_email) ELSE '[]'::jsonb END,
      v_esc, NULL);
    n_esc := n_esc + 1;
  END LOOP;

  -- 3) hoja recibida sin validar por RH en N días hábiles → recordatorio diario a RH
  FOR c IN SELECT k.* FROM retardos.caso k
            WHERE k.estado = 'FIRMA_RECIBIDA'
              AND retardos.sumar_habiles(k.actualizado_at, v_dval) < now()
  LOOP
    IF retardos.encolar_plantilla(c.id, 'recordatorio_rh', 'aviso_rh', c.folio || ':rh_pendiente:' || v_hoy,
                                  v_rh, '[]'::jsonb) IS NOT NULL THEN n_rec_rh := n_rec_rh + 1; END IF;
  END LOOP;

  -- 4) suspensión programada: ¿se aplicó? (sin checadas esos días + registrada en Nómina)
  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'ACCION_PROGRAMADA' AND k.accion_desde IS NOT NULL LOOP
    v_nom := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'nom', '[]'::jsonb)) x
                      WHERE (x->>'employee_id')::int = c.employee_id
                        AND (x->>'desde')::date <= c.accion_hasta AND (x->>'hasta')::date >= c.accion_desde);
    IF c.accion_hasta < v_hoy THEN
      SELECT count(*) INTO v_chec FROM retardos.checada
       WHERE employee_id = c.employee_id AND fecha BETWEEN c.accion_desde AND c.accion_hasta;
      IF v_chec = 0 AND v_nom THEN
        PERFORM retardos.transicionar(c.id, 'ACCION_VERIFICADA', 'sistema',
          'Sin checadas en los días de suspensión y registrada en Nómina', jsonb_build_object('checadas', 0, 'nomina', true));
        PERFORM retardos.transicionar(c.id, 'CERRADO', 'sistema', 'Acción verificada');
        n_verif := n_verif + 1;
      ELSE
        IF retardos.encolar_plantilla(c.id, 'alerta_accion', 'alerta', c.folio || ':alerta_accion:' || v_hoy,
             v_rh || coalesce(retardos.cfg('alertas_destinatarios'), '[]'::jsonb), '[]'::jsonb, NULL,
             jsonb_build_object('hallazgo', CASE WHEN v_chec > 0 THEN 'Hay ' || v_chec || ' checadas en los días de suspensión.'
                                                 ELSE 'La suspensión no aparece en Nómina · Incidencias.' END)) IS NOT NULL
        THEN n_alert := n_alert + 1; END IF;
      END IF;
    ELSIF c.accion_desde <= v_hoy + 3 AND NOT v_nom THEN
      -- Antes del corte: todavía no está en Nómina.
      IF retardos.encolar_plantilla(c.id, 'alerta_accion', 'alerta', c.folio || ':pre_corte:' || v_hoy,
           v_rh, '[]'::jsonb, NULL,
           jsonb_build_object('hallazgo', 'La suspensión empieza pronto y todavía no está cargada en Nómina · Incidencias.')) IS NOT NULL
      THEN n_alert := n_alert + 1; END IF;
    END IF;
  END LOOP;

  UPDATE retardos.corrida SET terminada_at = now(), ok = true,
         resumen = jsonb_build_object('vencidos', n_venc, 'escalados', n_esc, 'recordatorios_rh', n_rec_rh,
                                      'acciones_verificadas', n_verif, 'alertas', n_alert)
   WHERE id = v_corrida;
  RETURN (SELECT resumen || jsonb_build_object('corrida_id', id) FROM retardos.corrida WHERE id = v_corrida);
END
$fn$;

-- ── latido genérico y errores ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION retardos.latido(p jsonb) RETURNS bigint
LANGUAGE sql AS $fn$
  INSERT INTO retardos.corrida (workflow, terminada_at, ok, leidos, resumen, error)
  VALUES (p->>'workflow', now(), coalesce((p->>'ok')::boolean, true), coalesce((p->>'leidos')::int, 0),
          coalesce(p->'resumen', '{}'::jsonb), p->>'error')
  RETURNING id
$fn$;

-- ── salud (workflow retardos/latido, el dead man's switch) ────────────────
CREATE OR REPLACE FUNCTION retardos.salud() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_prob jsonb := '[]'::jsonb; v_ult retardos.corrida; v_h numeric; v_hoy date := (now() AT TIME ZONE 'America/Monterrey')::date;
        v_n integer; v_dias integer := coalesce(retardos.cfg_txt('latido_dias_sin_retardos')::int, 5);
        v_hmax integer := coalesce(retardos.cfg_txt('latido_horas_detectar')::int, 30);
        v_hout integer := coalesce(retardos.cfg_txt('latido_horas_outbox')::int, 3); d date; k integer := 0;
BEGIN
  SELECT * INTO v_ult FROM retardos.corrida WHERE workflow = 'retardos/detectar' AND ok ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'DETECTAR_NUNCA_CORRIO', 'detalle', 'No hay ninguna corrida exitosa de detectar.');
  ELSE
    v_h := EXTRACT(EPOCH FROM (now() - v_ult.iniciada_at)) / 3600.0;
    IF v_h > v_hmax AND retardos.es_habil(v_hoy) THEN
      v_prob := v_prob || jsonb_build_object('codigo', 'DETECTAR_SIN_CORRER',
        'detalle', 'La última corrida exitosa de detectar fue hace ' || round(v_h) || ' horas.');
    END IF;
    IF v_ult.leidos = 0 THEN
      v_prob := v_prob || jsonb_build_object('codigo', 'DETECTAR_LEYO_CERO',
        'detalle', 'La última corrida de detectar leyó 0 asistencias de Odoo. O Odoo no contestó, o cambió un campo.');
    END IF;
  END IF;

  SELECT count(*) INTO v_n FROM retardos.corrida WHERE workflow LIKE 'retardos/%' AND ok = false
     AND iniciada_at > now() - interval '24 hours';
  IF v_n > 0 THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'CORRIDAS_CON_ERROR', 'detalle', v_n || ' corridas con error en 24 h.');
  END IF;

  SELECT count(*) INTO v_n FROM retardos.envio WHERE estado IN ('pendiente','fallido')
     AND creado_at < now() - make_interval(hours => v_hout);
  IF v_n > 0 THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'OUTBOX_ATORADO', 'detalle', v_n || ' correos llevan más de ' || v_hout || ' h sin salir.');
  END IF;

  -- Silencio sospechoso: N días hábiles seguidos sin un solo retardo detectado.
  d := v_hoy - 1;
  WHILE k < v_dias AND d > v_hoy - 30 LOOP
    IF retardos.es_habil(d) THEN k := k + 1; END IF;
    d := d - 1;
  END LOOP;
  SELECT count(*) INTO v_n FROM retardos.retardo WHERE fecha > d AND fecha < v_hoy;
  IF k = v_dias AND v_n = 0 AND EXISTS (SELECT 1 FROM retardos.corrida WHERE workflow = 'retardos/detectar' AND iniciada_at < now() - interval '7 days') THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'SILENCIO_SOSPECHOSO',
      'detalle', 'Cero retardos en ' || v_dias || ' días hábiles; históricamente hay varios por día.');
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(v_prob) = 0, 'problemas', v_prob,
    'modo', retardos.cfg_txt('modo'), 'medido_at', now(),
    'ultima_deteccion', v_ult.iniciada_at, 'ultima_deteccion_leidos', v_ult.leidos,
    'casos_abiertos', (SELECT count(*) FROM retardos.caso WHERE estado NOT IN ('CERRADO','CANCELADO_POR_RH')),
    'outbox_pendiente', (SELECT count(*) FROM retardos.envio WHERE estado IN ('pendiente','fallido')));
END
$fn$;

-- ── resumen semanal ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION retardos.resumen_semanal() RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v jsonb; v_sem text := to_char(now() AT TIME ZONE 'America/Monterrey', 'IYYY-"S"IW'); v_html text;
        v_para jsonb := coalesce(retardos.cfg('rh_destinatarios'), '[]'::jsonb) || coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb);
BEGIN
  v := jsonb_build_object(
    'semana', v_sem,
    'por_estado', coalesce((SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) n FROM retardos.caso GROUP BY estado) s), '{}'::jsonb),
    'retardos_7d', (SELECT count(*) FROM retardos.retardo WHERE estado = 'contado' AND fecha > current_date - 7),
    'casos_nuevos_7d', (SELECT count(*) FROM retardos.caso WHERE abierto_at > now() - interval '7 days'),
    'vencidos', (SELECT count(*) FROM retardos.caso WHERE estado IN ('VENCIDO','ESCALADO')),
    'reincidentes', (SELECT count(*) FROM retardos.caso WHERE motivo_apertura = 'reincidencia' AND estado NOT IN ('CERRADO','CANCELADO_POR_RH')),
    'acciones_verificadas_7d', (SELECT count(*) FROM retardos.bitacora WHERE a = 'ACCION_VERIFICADA' AND creado_at > now() - interval '7 days'),
    'salud', retardos.salud());
  v_html := '<p>Resumen semanal de Retardos, semana ' || v_sem || '.</p>'
    || '<ul><li>Retardos contados en 7 días: <b>' || (v->>'retardos_7d') || '</b></li>'
    || '<li>Casos nuevos en 7 días: <b>' || (v->>'casos_nuevos_7d') || '</b></li>'
    || '<li>Casos vencidos o escalados: <b>' || (v->>'vencidos') || '</b></li>'
    || '<li>Reincidentes abiertos: <b>' || (v->>'reincidentes') || '</b></li>'
    || '<li>Acciones verificadas en 7 días: <b>' || (v->>'acciones_verificadas_7d') || '</b></li></ul>'
    || '<p>Casos por estado: ' || coalesce((SELECT string_agg(key || ' ' || value, ', ') FROM jsonb_each_text(v->'por_estado')), 'ninguno') || '</p>'
    || '<p>Salud del sistema: ' || CASE WHEN (v->'salud'->>'ok')::boolean THEN 'sin problemas' ELSE 'con problemas, revisa el panel' END || '.</p>';
  PERFORM retardos.encolar('resumen:' || v_sem, NULL, 'resumen', v_para, '[]'::jsonb,
                           'Retardos: resumen semanal ' || v_sem, v_html);
  RETURN v;
END
$fn$;

-- ── panel RH (webhook retardos/panel) ─────────────────────────────────────
-- p = { accion, actor, rol: 'editor'|'lector', … }
CREATE OR REPLACE FUNCTION retardos.panel(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_acc text := p->>'accion'; v_actor text := coalesce(p->>'actor', 'desconocido'); c retardos.caso;
        v_rol text := coalesce(p->>'rol', 'lector'); v_bytes bytea; v_desde date; v_dias integer;
BEGIN
  IF v_acc = 'listar' THEN
    RETURN jsonb_build_object('ok', true, 'casos', coalesce((SELECT jsonb_agg(x ORDER BY x->>'abierto_at' DESC) FROM (
      SELECT jsonb_build_object('folio', k.folio, 'employee_id', k.employee_id, 'nombre', m.nombre,
        'nivel', k.nivel, 'accion', k.accion, 'estado', k.estado, 'periodo', k.periodo, 'retardos_n', k.retardos_n,
        'abierto_at', k.abierto_at, 'vence_at', k.vence_at, 'ruta', k.ruta, 'modo_al_abrir', k.modo_al_abrir,
        'dias_abierto', (current_date - (k.abierto_at AT TIME ZONE 'America/Monterrey')::date),
        'evidencias', (SELECT count(*) FROM retardos.evidencia e WHERE e.caso_id = k.id)) x
      FROM retardos.caso k LEFT JOIN retardos.empleado m ON m.employee_id = k.employee_id
      WHERE (p->>'incluir_cerrados')::boolean IS TRUE OR k.estado NOT IN ('CERRADO','CANCELADO_POR_RH')) s), '[]'::jsonb),
      'salud', retardos.salud());
  END IF;

  IF v_acc IN ('caso','validar_firma','rechazar_firma','registrar_negativa','impugnar','programar_accion',
               'marcar_ejecutada','cerrar','cancelar','subir_hoja') THEN
    SELECT * INTO c FROM retardos.caso WHERE folio = p->>'folio';
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'FOLIO_INEXISTENTE'); END IF;
  END IF;

  IF v_acc = 'caso' THEN
    RETURN jsonb_build_object('ok', true, 'caso', retardos.caso_datos(c.id),
      'bitacora', (SELECT jsonb_agg(jsonb_build_object('at', b.creado_at, 'evento', b.evento, 'de', b.de, 'a', b.a,
                     'actor', b.actor, 'motivo', b.motivo) ORDER BY b.id) FROM retardos.bitacora b WHERE b.caso_id = c.id),
      'evidencias', (SELECT jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'mime', e.mime, 'bytes', e.bytes,
                     'sha256', e.sha256, 'origen', e.origen, 'tipo', e.tipo, 'at', e.creado_at) ORDER BY e.id)
                     FROM retardos.evidencia e WHERE e.caso_id = c.id),
      'envios', (SELECT jsonb_agg(jsonb_build_object('tipo', v.tipo, 'estado', v.estado, 'modo', v.modo_envio,
                     'enviado_at', v.enviado_at, 'asunto', v.asunto) ORDER BY v.id) FROM retardos.envio v WHERE v.caso_id = c.id));
  END IF;

  IF v_acc = 'config' THEN
    RETURN jsonb_build_object('ok', true,
      'config', (SELECT jsonb_object_agg(clave, jsonb_build_object('valor', valor, 'confirmado', confirmado, 'descripcion', descripcion)) FROM retardos.config),
      'escalera', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.nivel) FROM retardos.escalera e),
      'exclusiones', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id DESC) FROM retardos.exclusion x WHERE x.activo));
  END IF;

  -- De aquí en adelante todo escribe: sólo editores.
  IF v_rol <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;

  IF v_acc = 'subir_hoja' THEN
    v_bytes := decode(p->>'contenido_b64', 'base64');
    IF length(v_bytes) < 1024 THEN RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_ILEGIBLE'); END IF;
    INSERT INTO retardos.evidencia (caso_id, sha256, nombre, mime, bytes, contenido, origen, tipo, subido_por)
    VALUES (c.id, encode(sha256(v_bytes), 'hex'), left(coalesce(p->>'nombre', 'hoja'), 200), lower(coalesce(p->>'mime', 'application/pdf')),
            length(v_bytes), v_bytes, 'panel', coalesce(p->>'tipo', 'hoja_firmada'), v_actor)
    ON CONFLICT (caso_id, sha256) DO NOTHING;
    IF c.estado IN ('ESPERANDO_FIRMA','VENCIDO','ESCALADO') AND coalesce(p->>'tipo', 'hoja_firmada') = 'hoja_firmada' THEN
      PERFORM retardos.transicionar(c.id, 'FIRMA_RECIBIDA', v_actor, 'Hoja subida desde el panel');
    END IF;
    RETURN jsonb_build_object('ok', true);
  ELSIF v_acc = 'validar_firma' THEN
    IF NOT EXISTS (SELECT 1 FROM retardos.evidencia WHERE caso_id = c.id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SIN_EVIDENCIA');
    END IF;
    PERFORM retardos.transicionar(c.id, 'VALIDADO_RH', v_actor, coalesce(p->>'motivo', 'Firma validada por RH'));
    IF c.accion IN ('carta_compromiso','acta') THEN
      PERFORM retardos.transicionar(c.id, 'CERRADO', v_actor, 'Documento firmado y validado; queda en seguimiento de reincidencia');
    END IF;
  ELSIF v_acc = 'rechazar_firma' THEN
    PERFORM retardos.transicionar(c.id, 'ESPERANDO_FIRMA', v_actor, coalesce(p->>'motivo', 'Hoja ilegible o incompleta'));
    UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), 2) WHERE id = c.id;
    PERFORM retardos.encolar_plantilla(c.id, 'pide_hoja', 'pide_hoja', c.folio || ':pide_hoja:rh:' || extract(epoch FROM now())::bigint,
      (SELECT CASE WHEN email_valido THEN jsonb_build_array(email) ELSE '[]'::jsonb END FROM retardos.empleado WHERE employee_id = c.employee_id),
      coalesce(retardos.cfg('rh_destinatarios'), '[]'::jsonb));
  ELSIF v_acc = 'registrar_negativa' THEN
    IF char_length(coalesce(p->>'testigo1', '')) < 3 OR char_length(coalesce(p->>'testigo2', '')) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FALTAN_TESTIGOS');
    END IF;
    PERFORM retardos.transicionar(c.id, 'SE_NEGO_A_FIRMAR', v_actor, 'Se negó a firmar ante dos testigos',
      jsonb_build_object('testigo1', p->>'testigo1', 'testigo2', p->>'testigo2'));
  ELSIF v_acc = 'impugnar' THEN
    PERFORM retardos.transicionar(c.id, 'IMPUGNADO', v_actor, coalesce(p->>'motivo', 'El trabajador impugna'),
      jsonb_build_object('version_trabajador', p->>'version'));
  ELSIF v_acc = 'programar_accion' THEN
    v_desde := (p->>'desde')::date; v_dias := (p->>'dias')::int;
    IF c.accion <> 'suspension' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_SUSPENSION'); END IF;
    IF v_dias IS NULL OR v_dias < 1 OR v_dias > 8 THEN RETURN jsonb_build_object('ok', false, 'error', 'DIAS_FUERA_DE_LEY'); END IF;
    IF c.estado = 'SE_NEGO_A_FIRMAR' OR c.estado = 'IMPUGNADO' THEN
      PERFORM retardos.transicionar(c.id, 'VALIDADO_RH', v_actor, 'RH resuelve y procede');
    END IF;
    UPDATE retardos.caso SET accion_desde = v_desde,
           accion_hasta = (SELECT max(d)::date FROM (SELECT d FROM generate_series(v_desde, v_desde + 30, interval '1 day') d
                           WHERE retardos.es_habil(d::date) LIMIT v_dias) s)
     WHERE id = c.id;
    PERFORM retardos.transicionar(c.id, 'ACCION_PROGRAMADA', v_actor, 'Suspensión de ' || v_dias || ' días hábiles desde ' || v_desde,
      jsonb_build_object('desde', v_desde, 'dias', v_dias));
  ELSIF v_acc = 'marcar_ejecutada' THEN
    PERFORM retardos.transicionar(c.id, 'ACCION_VERIFICADA', v_actor, coalesce(p->>'motivo', 'RH confirma que se aplicó'));
    PERFORM retardos.transicionar(c.id, 'CERRADO', v_actor, 'Acción verificada');
  ELSIF v_acc = 'cerrar' THEN
    PERFORM retardos.transicionar(c.id, 'CERRADO', v_actor, coalesce(p->>'motivo', 'Cerrado por RH'));
  ELSIF v_acc = 'cancelar' THEN
    PERFORM retardos.transicionar(c.id, 'CANCELADO_POR_RH', v_actor, p->>'motivo');
  ELSIF v_acc = 'exclusion_agregar' THEN
    INSERT INTO retardos.exclusion (employee_id, desde, hasta, tipo, motivo, creado_por)
    VALUES ((p->>'employee_id')::int, (p->>'desde')::date, (p->>'hasta')::date, p->>'tipo', p->>'motivo', v_actor);
    PERFORM retardos.log(NULL, 'exclusion_agregar', v_actor, p->>'motivo', p - 'token');
  ELSIF v_acc = 'exclusion_quitar' THEN
    UPDATE retardos.exclusion SET activo = false WHERE id = (p->>'id')::bigint;
    PERFORM retardos.log(NULL, 'exclusion_quitar', v_actor, p->>'motivo', jsonb_build_object('id', p->>'id'));
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'ACCION_DESCONOCIDA');
  END IF;
  RETURN jsonb_build_object('ok', true, 'caso', CASE WHEN c.id IS NULL THEN NULL ELSE retardos.caso_datos(c.id) END);
END
$fn$;

-- Entrada única del webhook: registra el nonce (un segundo uso truena) y despacha.
CREATE OR REPLACE FUNCTION retardos.panel_seguro(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    INSERT INTO retardos.nonce (nonce, actor, accion) VALUES (p->>'nonce', coalesce(p->>'actor', '?'), p->>'accion');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REPLAY');
  END;
  RETURN retardos.panel(p);
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('ok', false, 'error', split_part(SQLERRM, ' ', 1), 'detalle', left(SQLERRM, 200));
END
$fn$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;

-- ── plantillas (sin guiones largos) ───────────────────────────────────────
INSERT INTO retardos.plantilla (clave, asunto, cuerpo_html) VALUES
('notificacion_aviso', '[[[folio]]] Aviso de retardo',
 '<p>Hola [[nombre]]:</p><p>El control de asistencia registró retardos en el periodo [[periodo]]. Este correo es un <b>aviso informativo</b> y no requiere respuesta.</p>[[detalle]]<p>Si alguno de estos días tenías permiso, estabas en campo o hubo un error en la checada, avisa a Recursos Humanos o a tu supervisor para corregirlo.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('notificacion_carta_compromiso', '[[[folio]]] Carta compromiso por retardos',
 '<p>Hola [[nombre]]:</p><p>En el periodo [[periodo]] acumulaste [[retardos_n]] retardos:</p>[[detalle]]<p>Te adjuntamos una <b>carta compromiso</b>. Por favor imprímela, fírmala y <b>responde a este mismo correo</b> con la hoja firmada (PDF o foto clara desde el celular) a más tardar el <b>[[vence]]</b>. No cambies el asunto: el folio [[folio]] nos ayuda a encontrar tu caso.</p><p>Si no estás de acuerdo con algún retardo, responde explicando el motivo: tienes derecho a ser escuchado.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('notificacion_acta', '[[[folio]]] Acta administrativa por retardos',
 '<p>Hola [[nombre]]:</p><p>En el periodo [[periodo]] acumulaste [[retardos_n]] retardos:</p>[[detalle]]<p>Se levanta un <b>acta administrativa</b> (adjunta). Preséntate con Recursos Humanos para firmarla ante dos testigos, o responde a este correo con la hoja firmada a más tardar el <b>[[vence]]</b>, sin cambiar el asunto.</p><p>Si no estás de acuerdo, responde explicando el motivo: tienes derecho a ser escuchado antes de cualquier medida.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('notificacion_suspension', '[[[folio]]] Citatorio por reincidencia en retardos',
 '<p>Hola [[nombre]]:</p><p>En el periodo [[periodo]] acumulaste [[retardos_n]] retardos, después de haber firmado documentos previos:</p>[[detalle]]<p>Recursos Humanos te citará para escucharte antes de decidir una medida disciplinaria conforme al Reglamento Interior de Trabajo y a la Ley Federal del Trabajo. Adjuntamos el documento. Responde a este correo con la hoja firmada a más tardar el <b>[[vence]]</b>, sin cambiar el asunto.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('ruta_supervisor', '[[[folio]]] Entrega en físico: [[nombre_nivel]] para [[nombre]]',
 '<p>Hola:</p><p>[[nombre]] no tiene un correo válido registrado. Te pedimos imprimir el documento adjunto ([[nombre_nivel]]), entregárselo en físico y pedirle que lo firme. Después entrégalo a Recursos Humanos o respóndelo a este correo con la foto de la hoja firmada, sin cambiar el asunto.</p>[[detalle]]<p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('pide_hoja', 'RE: [[[folio]]] Falta la hoja firmada',
 '<p>Hola:</p><p>Recibimos tu respuesta al folio [[folio]], pero no trae la hoja firmada o el archivo no se puede leer. Por favor responde a este correo adjuntando la hoja firmada en PDF o una foto clara tomada con el celular.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('recordatorio', 'Recordatorio: [[[folio]]] [[nombre_nivel]] pendiente de firma',
 '<p>Hola [[nombre]]:</p><p>Venció el plazo para entregar firmada la [[nombre_nivel]] del folio [[folio]]. Tienes hasta el <b>[[vence]]</b>. Responde a este correo con la hoja firmada, sin cambiar el asunto.</p><p>Con copia a tu supervisor y a Recursos Humanos.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('escalamiento', 'Escalamiento: [[[folio]]] sin firma después del recordatorio',
 '<p>El folio [[folio]] ([[nombre_nivel]] de [[nombre]], periodo [[periodo]]) venció dos veces sin hoja firmada.</p>[[detalle]]<p>Se requiere que RH cite a la persona y, si se niega a firmar, lo registre con dos testigos en el panel de Retardos.</p>'),
('aviso_rh_firma', 'Hoja recibida: [[[folio]]] [[nombre]]',
 '<p>Llegó la hoja firmada del folio [[folio]] ([[nombre_nivel]] de [[nombre]]). Revísala y valídala en el panel de Retardos.</p>'),
('recordatorio_rh', 'Pendiente de validar: [[[folio]]] [[nombre]]',
 '<p>La hoja del folio [[folio]] ([[nombre_nivel]] de [[nombre]]) lleva más de dos días hábiles sin validar. Revísala en el panel de Retardos.</p>'),
('alerta_accion', 'Alerta: [[[folio]]] la suspensión no cuadra',
 '<p>Folio [[folio]] ([[nombre]]), suspensión del [[accion_desde]] al [[accion_hasta]].</p><p><b>[[hallazgo]]</b></p><p>Revisa el caso en el panel de Retardos y en Nómina · Incidencias antes del corte.</p>')
ON CONFLICT (clave) DO NOTHING;
