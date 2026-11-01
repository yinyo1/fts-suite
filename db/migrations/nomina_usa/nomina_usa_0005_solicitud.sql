-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0005 · Solicitud del miércoles, revisión y archivo para Auris (#448, fase E)
--
-- Flujo de la semana FTS (viernes a jueves; Auris paga el viernes):
--   Richard ENVÍA antes de las 9:00 del miércoles (miércoles y jueves estimados)
--   → Magaly VALIDA checadas e incidencias → Erick AUTORIZA línea por línea
--   → Gerardo descarga el ARCHIVO de netos y marca SUBIDO antes de las 12:00.
--
-- Candados que mueven dinero, aquí y no solo en pantalla:
--   · SO sin bolsa: no se pide pago.
--   · pagado acumulado (previo + autorizado) + lo pedido ≤ bolsa × avance estimado al jueves, y nunca > bolsa.
--   · estimado del jueves ≥ miércoles ≥ último reportado.
--   · incidencia EN DISPUTA de una persona de la solicitud: BLOQUEA el envío («Valídala con Magaly»).
--   · persona con día sin validar por RH: no se puede autorizar.
--   · Erick no autoriza más de lo pedido sin folio de Esteban.
-- Todo monto es NETO en USD. Cada línea lleva su cuenta analítica: la SO o COMERCIAL-USA.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nomina_usa.solicitud (
  id              bigserial   PRIMARY KEY,
  semana          date        NOT NULL,
  estado          text        NOT NULL DEFAULT 'enviada',
  enviada_por     text        NOT NULL,
  enviada_at      timestamptz NOT NULL DEFAULT now(),
  validada_por    text,  validada_at   timestamptz,
  autorizada_por  text,  autorizada_at timestamptz,
  archivo_por     text,  archivo_at    timestamptz,
  subida_por      text,  subida_at     timestamptz,
  devuelta_motivo text,
  envio           jsonb       NOT NULL,
  CONSTRAINT sol_estado_ck CHECK (estado IN ('enviada','validada','autorizada','subida','devuelta')),
  CONSTRAINT sol_viernes_ck CHECK (extract(isodow FROM semana) = 5)
);
-- Una solicitud viva por semana; una devuelta deja reenviar.
CREATE UNIQUE INDEX IF NOT EXISTS sol_semana_uq ON nomina_usa.solicitud (semana) WHERE estado <> 'devuelta';

CREATE TABLE IF NOT EXISTS nomina_usa.solicitud_so (
  solicitud_id  bigint  NOT NULL REFERENCES nomina_usa.solicitud(id),
  so_id         integer NOT NULL,
  so_nombre     text,
  avance_ultimo integer NOT NULL,
  est_mie       integer NOT NULL,
  est_jue       integer NOT NULL,
  PRIMARY KEY (solicitud_id, so_id),
  CONSTRAINT ss_est_ck CHECK (est_mie BETWEEN 0 AND 100 AND est_jue BETWEEN 0 AND 100 AND est_jue >= est_mie AND est_mie >= avance_ultimo)
);

CREATE TABLE IF NOT EXISTS nomina_usa.solicitud_linea (
  id               bigserial   PRIMARY KEY,
  solicitud_id     bigint      NOT NULL REFERENCES nomina_usa.solicitud(id),
  tipo             text        NOT NULL,
  employee_id      integer     NOT NULL,
  so_id            integer,
  rol              text,
  fecha            date,
  monto            numeric(12,2) NOT NULL,
  sugerido         numeric(12,2),
  excepcion        boolean     NOT NULL DEFAULT false,
  explicacion      text,
  cuenta           text        NOT NULL,
  autorizado_monto numeric(12,2),
  decision         text,
  folio_esteban    text,
  detalle          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT sl_tipo_ck CHECK (tipo IN ('so','comercial','fijo','ajuste')),
  CONSTRAINT sl_rol_ck  CHECK (tipo <> 'so' OR rol IN ('supervisor','tecnicos')),
  CONSTRAINT sl_monto_ck CHECK (tipo = 'ajuste' OR monto >= 0),
  CONSTRAINT sl_cuenta_ck CHECK (length(btrim(cuenta)) > 0),
  -- Más de lo pedido solo con folio de Esteban.
  CONSTRAINT sl_tope_ck CHECK (autorizado_monto IS NULL OR autorizado_monto <= monto OR length(btrim(coalesce(folio_esteban, ''))) >= 3)
);
CREATE INDEX IF NOT EXISTS sl_sol ON nomina_usa.solicitud_linea (solicitud_id);

-- Cuenta analítica de una SO: su nombre corto («SO11842»).
CREATE OR REPLACE FUNCTION nomina_usa.cuenta_so(p_nombre text, p_so integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$ SELECT coalesce(nullif(split_part(coalesce(p_nombre, ''), ' - ', 1), ''), 'SO-' || p_so) $fn$;

-- Pagado acumulado de un rol de una SO: previo + lo autorizado en solicitudes autorizadas o subidas.
CREATE OR REPLACE FUNCTION nomina_usa.pagado(p_so integer, p_rol text, p_excluir bigint DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce((SELECT CASE WHEN p_rol = 'supervisor' THEN pagado_previo_supervisor ELSE pagado_previo_tecnicos END
                     FROM nomina_usa.bolsa WHERE so_id = p_so AND vigente), 0)
       + coalesce((SELECT sum(coalesce(l.autorizado_monto, l.monto)) FROM nomina_usa.solicitud_linea l JOIN nomina_usa.solicitud s ON s.id = l.solicitud_id
                    WHERE l.so_id = p_so AND l.rol = p_rol AND l.tipo = 'so' AND s.estado IN ('autorizada','subida')
                      AND (p_excluir IS NULL OR s.id <> p_excluir)), 0)
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.disponible(p_so integer, p_rol text, p_avance integer, p_excluir bigint DEFAULT NULL) RETURNS numeric
LANGUAGE sql STABLE AS $fn$
  SELECT greatest(0, least(b.monto, round(b.monto * least(100, greatest(0, p_avance)) / 100.0, 2)) - nomina_usa.pagado(p_so, p_rol, p_excluir))
    FROM (SELECT CASE WHEN p_rol = 'supervisor' THEN supervisor ELSE tecnicos END AS monto FROM nomina_usa.bolsa WHERE so_id = p_so AND vigente) b
$fn$;

-- Personas, incidencias y días pendientes que bloquean.
CREATE OR REPLACE FUNCTION nomina_usa.bloqueos(p_semana date, p_personas integer[]) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'disputas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'employee_id', a.employee_id, 'fecha', a.fecha, 'tipo', a.tipo,
                     'revision_pedida', a.revision_pedida_at IS NOT NULL)) FROM nomina_usa.alerta a
                   WHERE a.estado = 'en_disputa' AND a.employee_id = ANY (p_personas)), '[]'::jsonb),
    'dias_pendientes', coalesce((SELECT jsonb_agg(jsonb_build_object('employee_id', d.employee_id, 'fecha', d.fecha)) FROM nomina_usa.dia d
                   WHERE d.pendiente_rh AND d.employee_id = ANY (p_personas) AND d.fecha BETWEEN p_semana AND p_semana + 6), '[]'::jsonb))
$fn$;

-- ── Contexto para armar la solicitud ──────────────────────────────────────
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_contexto(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_sem date := (p->>'semana')::date; v_sos jsonb; v_pers integer[]; v_sol jsonb;
BEGIN
  IF v_sem IS NULL OR extract(isodow FROM v_sem) <> 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'SEMANA_INVALIDA'); END IF;
  -- SO con horas o avance en la semana, o con bolsa vigente y avance reportado.
  WITH s AS (
    SELECT DISTINCT so_id FROM nomina_usa.horas_dia WHERE so_id IS NOT NULL AND fecha BETWEEN v_sem AND v_sem + 6
    UNION SELECT DISTINCT so_id FROM nomina_usa.avance_so WHERE fecha BETWEEN v_sem AND v_sem + 6
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'so_id', s.so_id,
      'so_nombre', coalesce((SELECT so_nombre FROM nomina_usa.bolsa WHERE so_id = s.so_id AND vigente),
                            (SELECT max(so_nombre) FROM nomina_usa.horas_dia WHERE so_id = s.so_id), (SELECT max(so_nombre) FROM nomina_usa.avance_so WHERE so_id = s.so_id)),
      'bolsa', (SELECT jsonb_build_object('supervisor', supervisor, 'tecnicos', tecnicos, 'origen', origen, 'folio', folio) FROM nomina_usa.bolsa WHERE so_id = s.so_id AND vigente),
      'pagado', jsonb_build_object('supervisor', nomina_usa.pagado(s.so_id, 'supervisor'), 'tecnicos', nomina_usa.pagado(s.so_id, 'tecnicos')),
      'avance_ultimo', nomina_usa.avance_al(s.so_id, v_sem + 6),
      'dias', (SELECT jsonb_agg(jsonb_build_object('fecha', f, 'avance', (SELECT max(pct) FROM nomina_usa.avance_so a WHERE a.so_id = s.so_id AND a.fecha = f AND a.estado = 'aceptado'),
                  'horas', coalesce((SELECT jsonb_agg(jsonb_build_object('employee_id', h.employee_id, 'horas', h.horas)) FROM nomina_usa.horas_dia h WHERE h.so_id = s.so_id AND h.fecha = f), '[]'::jsonb)) ORDER BY f)
                 FROM generate_series(v_sem, v_sem + 6, interval '1 day') g(f0), LATERAL (SELECT f0::date AS f) x),
      'horas', coalesce((SELECT jsonb_object_agg(employee_id, h) FROM (SELECT employee_id, sum(horas) h FROM nomina_usa.horas_dia
                 WHERE so_id = s.so_id AND fecha BETWEEN v_sem AND v_sem + 6 GROUP BY employee_id) q), '{}'::jsonb)
    ) ORDER BY s.so_id), '[]'::jsonb) INTO v_sos FROM s;
  v_pers := ARRAY(SELECT employee_id FROM nomina_usa.ficha WHERE activo AND pais_nomina <> 'MX');
  SELECT to_jsonb(x) INTO v_sol FROM nomina_usa.solicitud x WHERE semana = v_sem AND estado <> 'devuelta';
  RETURN jsonb_build_object('ok', true, 'semana', v_sem, 'sos', v_sos,
    'personas', (SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'alias', alias, 'tipo_pago_usa', tipo_pago_usa,
                   'rol', CASE tipo_pago_usa WHEN 'supervisor_comercial' THEN 'supervisor' WHEN 'bolsa_avance' THEN 'tecnicos' END,
                   'fijo_semanal_usd', fijo_semanal_usd,
                   'faltas_injustificadas', (SELECT count(*) FROM nomina_usa.alerta a WHERE a.employee_id = f.employee_id AND a.estado = 'falta_injustificada'
                                               AND a.fecha BETWEEN v_sem AND v_sem + 6)) ORDER BY alias)
                 FROM nomina_usa.ficha f WHERE activo AND pais_nomina <> 'MX'),
    'comercial', (SELECT jsonb_agg(jsonb_build_object('employee_id', r.employee_id, 'fecha', r.fecha, 'pct',
                     coalesce((SELECT (l->>'pct')::integer FROM jsonb_array_elements(r.lineas) l WHERE l->>'clave' = 'COMERCIAL'), 0),
                     'sugerido', (r.comercial->>'sugerido')::integer, 'excepcion', coalesce(r.comercial->>'estado', '') = 'excepcion',
                     'explicacion', r.comercial->>'explicacion', 'valido', r.valido) ORDER BY r.fecha)
                   FROM nomina_usa.reparto_dia r WHERE r.tipo = 'real' AND r.fecha BETWEEN v_sem AND v_sem + 6),
    'tarifa_comercial_usd', nomina_usa.cfg('tarifa_comercial_usd'),
    'bloqueos', nomina_usa.bloqueos(v_sem, v_pers),
    'solicitud', v_sol);
END
$fn$;

-- ── Envío (Richard) ────────────────────────────────────────────────────────
-- p.envio = { semana, sos:[{so_id, so_nombre, est_mie, est_jue, reparto:{supervisor:{emp:monto}, tecnicos:{emp:monto}}}],
--             comercial:[{employee_id, fecha, pct, estimado, sugerido, excepcion, explicacion}], fijos:[{employee_id}] }
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_enviar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE e jsonb := p->'envio'; v_sem date := (p->'envio'->>'semana')::date; so jsonb; r text; k text; v_ult integer; v_disp numeric; v_suma numeric;
        v_id bigint; v_err jsonb := '[]'::jsonb; v_pers integer[] := '{}'; v_bloq jsonb; c jsonb; f nomina_usa.ficha; v_tar numeric;
BEGIN
  IF v_sem IS NULL OR extract(isodow FROM v_sem) <> 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'SEMANA_INVALIDA'); END IF;
  IF EXISTS (SELECT 1 FROM nomina_usa.solicitud WHERE semana = v_sem AND estado <> 'devuelta') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'YA_ENVIADA', 'mensaje', 'La solicitud de esta semana ya se envió. Si hay que corregirla, que Magaly o Erick la devuelvan.');
  END IF;
  v_tar := coalesce((nomina_usa.cfg('tarifa_comercial_usd') #>> '{}')::numeric, 140);

  -- Personas de la solicitud (para disputas): las de los repartos, el comercial y los fijos.
  FOR so IN SELECT * FROM jsonb_array_elements(coalesce(e->'sos', '[]'::jsonb)) LOOP
    FOREACH r IN ARRAY ARRAY['supervisor', 'tecnicos'] LOOP
      FOR k IN SELECT jsonb_object_keys(coalesce(so->'reparto'->r, '{}'::jsonb)) LOOP
        IF coalesce((so->'reparto'->r->>k)::numeric, 0) > 0 THEN v_pers := v_pers || k::integer; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  v_pers := v_pers || ARRAY(SELECT (x->>'employee_id')::integer FROM jsonb_array_elements(coalesce(e->'comercial', '[]'::jsonb)) x WHERE coalesce((x->>'pct')::numeric, 0) > 0)
                   || ARRAY(SELECT (x->>'employee_id')::integer FROM jsonb_array_elements(coalesce(e->'fijos', '[]'::jsonb)) x);
  v_bloq := nomina_usa.bloqueos(v_sem, v_pers);
  IF jsonb_array_length(v_bloq->'disputas') > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EN_DISPUTA', 'mensaje', 'Hay una incidencia en disputa. Valídala con Magaly.', 'disputas', v_bloq->'disputas');
  END IF;

  -- Candados por SO y rol.
  FOR so IN SELECT * FROM jsonb_array_elements(coalesce(e->'sos', '[]'::jsonb)) LOOP
    v_ult := nomina_usa.avance_al((so->>'so_id')::integer, v_sem + 6);
    IF (so->>'est_mie')::integer < v_ult OR (so->>'est_jue')::integer < (so->>'est_mie')::integer OR (so->>'est_jue')::integer > 100 THEN
      v_err := v_err || jsonb_build_object('codigo', 'ESTIMADO_INVALIDO', 'so_id', so->'so_id', 'mensaje',
               coalesce(so->>'so_nombre', 'SO') || ': el jueves no puede ser menor al miércoles, ni el miércoles menor al último reportado (' || v_ult || '%).');
      CONTINUE;
    END IF;
    FOREACH r IN ARRAY ARRAY['supervisor', 'tecnicos'] LOOP
      SELECT coalesce(sum((value)::numeric), 0) INTO v_suma FROM jsonb_each_text(coalesce(so->'reparto'->r, '{}'::jsonb));
      IF v_suma <= 0 THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM nomina_usa.bolsa WHERE so_id = (so->>'so_id')::integer AND vigente) THEN
        v_err := v_err || jsonb_build_object('codigo', 'SIN_BOLSA', 'so_id', so->'so_id', 'mensaje', coalesce(so->>'so_nombre', 'SO') || ' no tiene bolsa. Pide a Esteban la provisional con folio.');
        EXIT;
      END IF;
      v_disp := nomina_usa.disponible((so->>'so_id')::integer, r, (so->>'est_jue')::integer);
      IF round(v_suma, 2) > v_disp THEN
        v_err := v_err || jsonb_build_object('codigo', 'EXCEDE_DISPONIBLE', 'so_id', so->'so_id', 'rol', r, 'disponible', v_disp, 'pedido', v_suma,
                 'mensaje', coalesce(so->>'so_nombre', 'SO') || ' · ' || r || ': pides ' || v_suma || ' y el disponible es ' || v_disp || '.');
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each_text(coalesce(so->'reparto'->r, '{}'::jsonb)) WHERE value::numeric < 0) THEN
        v_err := v_err || jsonb_build_object('codigo', 'MONTO_NEGATIVO', 'so_id', so->'so_id');
      END IF;
    END LOOP;
  END LOOP;
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(e->'comercial', '[]'::jsonb)) LOOP
    IF coalesce((c->>'excepcion')::boolean, false) AND length(btrim(coalesce(c->>'explicacion', ''))) < 10 THEN
      v_err := v_err || jsonb_build_object('codigo', 'EXCEPCION_SIN_EXPLICACION', 'fecha', c->'fecha');
    END IF;
  END LOOP;
  IF jsonb_array_length(v_err) > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'CANDADOS', 'errores', v_err); END IF;

  INSERT INTO nomina_usa.solicitud (semana, enviada_por, envio) VALUES (v_sem, coalesce(p->>'actor', 'desconocido'), e) RETURNING id INTO v_id;
  FOR so IN SELECT * FROM jsonb_array_elements(coalesce(e->'sos', '[]'::jsonb)) LOOP
    INSERT INTO nomina_usa.solicitud_so VALUES (v_id, (so->>'so_id')::integer, so->>'so_nombre', nomina_usa.avance_al((so->>'so_id')::integer, v_sem + 6),
                                                (so->>'est_mie')::integer, (so->>'est_jue')::integer);
    FOREACH r IN ARRAY ARRAY['supervisor', 'tecnicos'] LOOP
      FOR k IN SELECT jsonb_object_keys(coalesce(so->'reparto'->r, '{}'::jsonb)) LOOP
        IF coalesce((so->'reparto'->r->>k)::numeric, 0) > 0 THEN
          INSERT INTO nomina_usa.solicitud_linea (solicitud_id, tipo, employee_id, so_id, rol, monto, sugerido, cuenta, detalle)
          VALUES (v_id, 'so', k::integer, (so->>'so_id')::integer, r, round((so->'reparto'->r->>k)::numeric, 2),
                  nullif(so->'sugerido'->r->>k, '')::numeric, nomina_usa.cuenta_so(so->>'so_nombre', (so->>'so_id')::integer),
                  jsonb_build_object('est_jue', (so->>'est_jue')::integer));
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  -- Comercial: el servidor recalcula el monto (tarifa × %), no confía en el navegador.
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(e->'comercial', '[]'::jsonb)) LOOP
    IF coalesce((c->>'pct')::numeric, 0) <= 0 THEN CONTINUE; END IF;
    INSERT INTO nomina_usa.solicitud_linea (solicitud_id, tipo, employee_id, fecha, monto, sugerido, excepcion, explicacion, cuenta, detalle)
    VALUES (v_id, 'comercial', (c->>'employee_id')::integer, (c->>'fecha')::date, round(v_tar * (c->>'pct')::numeric / 100, 2),
            round(v_tar * coalesce((c->>'sugerido')::numeric, 0) / 100, 2), coalesce((c->>'excepcion')::boolean, false), c->>'explicacion', 'COMERCIAL-USA',
            jsonb_build_object('pct', (c->>'pct')::integer, 'sugerido_pct', (c->>'sugerido')::integer, 'estimado', coalesce((c->>'estimado')::boolean, false)));
  END LOOP;
  -- Fijos por asistencia: fijo × (5 − faltas injustificadas confirmadas por RH) / 5.
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(e->'fijos', '[]'::jsonb)) LOOP
    SELECT * INTO f FROM nomina_usa.ficha WHERE employee_id = (c->>'employee_id')::integer AND tipo_pago_usa = 'fijo_asistencia';
    IF NOT FOUND OR coalesce(f.fijo_semanal_usd, 0) <= 0 THEN
      v_err := v_err || jsonb_build_object('codigo', 'FIJO_SIN_MONTO', 'employee_id', c->'employee_id');
      CONTINUE;
    END IF;
    INSERT INTO nomina_usa.solicitud_linea (solicitud_id, tipo, employee_id, monto, cuenta, detalle)
    SELECT v_id, 'fijo', f.employee_id, round(f.fijo_semanal_usd * (5 - least(5, q.n)) / 5.0, 2), 'COMERCIAL-USA', jsonb_build_object('faltas', q.n, 'fijo', f.fijo_semanal_usd)
      FROM (SELECT count(*) n FROM nomina_usa.alerta a WHERE a.employee_id = f.employee_id AND a.estado = 'falta_injustificada' AND a.fecha BETWEEN v_sem AND v_sem + 6) q;
  END LOOP;
  IF jsonb_array_length(v_err) > 0 THEN RAISE EXCEPTION 'CANDADOS %', v_err; END IF;
  PERFORM nomina_usa.log(p->>'actor', 'solicitud_enviada', 'semana:' || v_sem, NULL, jsonb_build_object('id', v_id), NULL);
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$fn$;

-- «Pedir a Magaly que la revise»: deja la marca (y la notifica si las alertas están en real).
CREATE OR REPLACE FUNCTION nomina_usa.a_pedir_revision(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v nomina_usa.alerta; v_enc boolean := false;
BEGIN
  SELECT * INTO v FROM nomina_usa.alerta WHERE id = (p->>'id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ALERTA_INEXISTENTE'); END IF;
  IF v.estado <> 'en_disputa' THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_ESTA_EN_DISPUTA'); END IF;
  UPDATE nomina_usa.alerta SET revision_pedida_por = p->>'actor', revision_pedida_at = now() WHERE id = v.id;
  IF nomina_usa.cfg('alertas_modo') = '"real"'::jsonb THEN
    PERFORM retardos.encolar('nomina_usa:revision:' || v.id || ':' || extract(epoch FROM now())::bigint, NULL, 'alerta', retardos.rh_para(), '[]'::jsonb,
      'Nómina USA: revisa una incidencia en disputa', '<p>' || coalesce(p->>'actor', 'Ricardo') || ' pide que revises la incidencia en disputa del empleado ' ||
      v.employee_id || ' del ' || to_char(v.fecha, 'DD/MM/YYYY') || '. La solicitud de nómina está detenida hasta que la liberes.</p>');
    v_enc := true;
  END IF;
  PERFORM nomina_usa.log(p->>'actor', 'revision_pedida', 'alerta:' || v.id, NULL, NULL, NULL);
  RETURN jsonb_build_object('ok', true, 'notificada', v_enc, 'modo', nomina_usa.cfg('alertas_modo'));
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.personas_de(p_sol bigint) RETURNS integer[]
LANGUAGE sql STABLE AS $fn$ SELECT coalesce(array_agg(DISTINCT employee_id), '{}') FROM nomina_usa.solicitud_linea WHERE solicitud_id = p_sol $fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_ver(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'solicitud', to_jsonb(s),
    'sos', (SELECT jsonb_agg(to_jsonb(x)) FROM nomina_usa.solicitud_so x WHERE x.solicitud_id = s.id),
    'lineas', (SELECT jsonb_agg(to_jsonb(l) || jsonb_build_object('alias', f.alias) ORDER BY l.tipo, l.so_id, l.rol, l.fecha, l.employee_id)
                 FROM nomina_usa.solicitud_linea l LEFT JOIN nomina_usa.ficha f USING (employee_id) WHERE l.solicitud_id = s.id),
    'bloqueos', nomina_usa.bloqueos(s.semana, nomina_usa.personas_de(s.id)))
    FROM nomina_usa.solicitud s
   WHERE s.id = coalesce((p->>'id')::bigint, (SELECT id FROM nomina_usa.solicitud WHERE semana = (p->>'semana')::date AND estado <> 'devuelta'))
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_solicitudes(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'solicitudes', coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'semana', s.semana, 'estado', s.estado,
           'total', (SELECT sum(coalesce(autorizado_monto, monto)) FROM nomina_usa.solicitud_linea WHERE solicitud_id = s.id)) ORDER BY s.semana DESC, s.id DESC), '[]'::jsonb))
    FROM (SELECT * FROM nomina_usa.solicitud ORDER BY semana DESC LIMIT 20) s
$fn$;

-- Magaly valida checadas e incidencias. Con disputas o días pendientes no avanza.
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_validar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE s nomina_usa.solicitud; b jsonb;
BEGIN
  SELECT * INTO s FROM nomina_usa.solicitud WHERE id = (p->>'id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLICITUD_INEXISTENTE'); END IF;
  IF s.estado <> 'enviada' THEN RETURN jsonb_build_object('ok', false, 'error', 'ESTADO_INVALIDO', 'estado', s.estado); END IF;
  b := nomina_usa.bloqueos(s.semana, nomina_usa.personas_de(s.id));
  IF jsonb_array_length(b->'disputas') > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'EN_DISPUTA', 'disputas', b->'disputas'); END IF;
  IF jsonb_array_length(b->'dias_pendientes') > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'DIA_SIN_VALIDAR', 'dias', b->'dias_pendientes'); END IF;
  UPDATE nomina_usa.solicitud SET estado = 'validada', validada_por = p->>'actor', validada_at = now() WHERE id = s.id;
  PERFORM nomina_usa.log(p->>'actor', 'solicitud_validada', 'solicitud:' || s.id, NULL, NULL, p->>'nota');
  RETURN jsonb_build_object('ok', true);
END
$fn$;

-- Erick autoriza. decisiones: [{linea_id, decision: 'aprobar'|'bajar_sugerido'|'monto', monto?, folio_esteban?}].
-- Toda línea con excepción necesita decisión. Solo lo validado se autoriza.
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_autorizar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE s nomina_usa.solicitud; d jsonb; l nomina_usa.solicitud_linea; b jsonb; v_m numeric; so record; r text; v_suma numeric;
BEGIN
  SELECT * INTO s FROM nomina_usa.solicitud WHERE id = (p->>'id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLICITUD_INEXISTENTE'); END IF;
  IF s.estado <> 'validada' THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_VALIDADA', 'mensaje', 'Magaly tiene que validar antes de autorizar.'); END IF;
  b := nomina_usa.bloqueos(s.semana, nomina_usa.personas_de(s.id));
  IF jsonb_array_length(b->'dias_pendientes') > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'DIA_SIN_VALIDAR', 'dias', b->'dias_pendientes'); END IF;
  IF jsonb_array_length(b->'disputas') > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'EN_DISPUTA', 'disputas', b->'disputas'); END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p->'decisiones', '[]'::jsonb)) LOOP
    SELECT * INTO l FROM nomina_usa.solicitud_linea WHERE id = (d->>'linea_id')::bigint AND solicitud_id = s.id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'LINEA_INEXISTENTE'); END IF;
    v_m := CASE d->>'decision' WHEN 'aprobar' THEN l.monto WHEN 'bajar_sugerido' THEN coalesce(l.sugerido, 0) WHEN 'monto' THEN (d->>'monto')::numeric END;
    IF v_m IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'DECISION_INVALIDA'); END IF;
    UPDATE nomina_usa.solicitud_linea SET autorizado_monto = round(v_m, 2), decision = d->>'decision', folio_esteban = nullif(btrim(coalesce(d->>'folio_esteban', '')), '') WHERE id = l.id;
  END LOOP;
  IF EXISTS (SELECT 1 FROM nomina_usa.solicitud_linea WHERE solicitud_id = s.id AND excepcion AND decision IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EXCEPCION_SIN_DECISION', 'mensaje', 'Aprueba o baja al sugerido cada comercial con excepción.');
  END IF;
  UPDATE nomina_usa.solicitud_linea SET autorizado_monto = monto, decision = 'aprobar' WHERE solicitud_id = s.id AND decision IS NULL;
  -- Revalidar el candado de bolsa con lo autorizado (otra solicitud pudo autorizarse antes).
  FOR so IN SELECT * FROM nomina_usa.solicitud_so WHERE solicitud_id = s.id LOOP
    FOREACH r IN ARRAY ARRAY['supervisor', 'tecnicos'] LOOP
      SELECT coalesce(sum(autorizado_monto), 0) INTO v_suma FROM nomina_usa.solicitud_linea WHERE solicitud_id = s.id AND so_id = so.so_id AND rol = r AND tipo = 'so';
      IF v_suma > 0 AND v_suma > coalesce(nomina_usa.disponible(so.so_id, r, so.est_jue, s.id), 0)
         AND NOT EXISTS (SELECT 1 FROM nomina_usa.solicitud_linea WHERE solicitud_id = s.id AND so_id = so.so_id AND rol = r AND folio_esteban IS NOT NULL) THEN
        RAISE EXCEPTION 'EXCEDE_DISPONIBLE % %', so.so_id, r;
      END IF;
    END LOOP;
  END LOOP;
  UPDATE nomina_usa.solicitud SET estado = 'autorizada', autorizada_por = p->>'actor', autorizada_at = now() WHERE id = s.id;
  PERFORM nomina_usa.log(p->>'actor', 'solicitud_autorizada', 'solicitud:' || s.id, NULL, p->'decisiones', NULL);
  RETURN jsonb_build_object('ok', true);
END
$fn$;

-- Devolver (Magaly o Erick) para que Richard corrija y reenvíe.
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_devolver(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE s nomina_usa.solicitud;
BEGIN
  SELECT * INTO s FROM nomina_usa.solicitud WHERE id = (p->>'id')::bigint FOR UPDATE;
  IF NOT FOUND OR s.estado NOT IN ('enviada', 'validada') THEN RETURN jsonb_build_object('ok', false, 'error', 'ESTADO_INVALIDO'); END IF;
  IF length(btrim(coalesce(p->>'motivo', ''))) < 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_REQUERIDO'); END IF;
  UPDATE nomina_usa.solicitud SET estado = 'devuelta', devuelta_motivo = p->>'motivo' WHERE id = s.id;
  PERFORM nomina_usa.log(p->>'actor', 'solicitud_devuelta', 'solicitud:' || s.id, NULL, NULL, p->>'motivo');
  RETURN jsonb_build_object('ok', true);
END
$fn$;

-- Archivo de netos para Auris: una fila por persona y cuenta, con lo AUTORIZADO.
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_archivo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE s nomina_usa.solicitud; v jsonb;
BEGIN
  SELECT * INTO s FROM nomina_usa.solicitud WHERE id = (p->>'id')::bigint;
  IF NOT FOUND OR s.estado NOT IN ('autorizada', 'subida') THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADA'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('employee_id', q.employee_id, 'persona', coalesce(f.alias, 'empleado ' || q.employee_id),
           'cuenta', q.cuenta, 'neto', q.neto, 'semana', s.semana) ORDER BY f.alias, q.cuenta), '[]'::jsonb) INTO v
    FROM (SELECT employee_id, cuenta, sum(autorizado_monto) AS neto FROM nomina_usa.solicitud_linea WHERE solicitud_id = s.id GROUP BY 1, 2 HAVING sum(autorizado_monto) <> 0) q
    LEFT JOIN nomina_usa.ficha f USING (employee_id);
  UPDATE nomina_usa.solicitud SET archivo_por = coalesce(archivo_por, p->>'actor'), archivo_at = coalesce(archivo_at, now()) WHERE id = s.id;
  PERFORM nomina_usa.log(p->>'actor', 'archivo_descargado', 'solicitud:' || s.id, NULL, NULL, NULL);
  RETURN jsonb_build_object('ok', true, 'semana', s.semana, 'lineas', v);
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_subida(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE s nomina_usa.solicitud;
BEGIN
  SELECT * INTO s FROM nomina_usa.solicitud WHERE id = (p->>'id')::bigint FOR UPDATE;
  IF NOT FOUND OR s.estado <> 'autorizada' THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADA'); END IF;
  IF s.archivo_at IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_NO_DESCARGADO'); END IF;
  UPDATE nomina_usa.solicitud SET estado = 'subida', subida_por = p->>'actor', subida_at = now() WHERE id = s.id;
  PERFORM nomina_usa.log(p->>'actor', 'subida_auris', 'solicitud:' || s.id, NULL, NULL, NULL);
  RETURN jsonb_build_object('ok', true);
END
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('solicitud_contexto',  'nomina_usa.a_solicitud_contexto',  '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar}'),
  ('solicitud_enviar',    'nomina_usa.a_solicitud_enviar',    '{nomina_usa:kiosko}'),
  ('pedir_revision',      'nomina_usa.a_pedir_revision',      '{nomina_usa:kiosko}'),
  ('solicitud_ver',       'nomina_usa.a_solicitud_ver',       '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar,nomina_usa:archivo}'),
  ('solicitudes',         'nomina_usa.a_solicitudes',         '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar,nomina_usa:archivo}'),
  ('solicitud_validar',   'nomina_usa.a_solicitud_validar',   '{nomina_usa:validar}'),
  ('solicitud_autorizar', 'nomina_usa.a_solicitud_autorizar', '{nomina_usa:autorizar}'),
  ('solicitud_devolver',  'nomina_usa.a_solicitud_devolver',  '{nomina_usa:validar,nomina_usa:autorizar}'),
  ('solicitud_archivo',   'nomina_usa.a_solicitud_archivo',   '{nomina_usa:archivo}'),
  ('solicitud_subida',    'nomina_usa.a_solicitud_subida',    '{nomina_usa:archivo}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
