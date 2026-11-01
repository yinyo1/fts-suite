-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0006 · Ajuste del viernes (#448, fase F)
--
-- Richard envía el miércoles con miércoles y jueves ESTIMADOS. El viernes se compara contra
-- lo real y la diferencia queda PRECARGADA en la siguiente solicitud:
--   · comercial: tarifa × (real − estimado) de cada día estimado. Ej.: jueves estimado 20 %
--     y real 0 % → 140 × (0 − 20) % = −28 en la solicitud siguiente.
--   · avance: bolsa × (real − estimado al jueves) por rol. Es INFORMATIVO: el disponible de la
--     semana siguiente ya se calcula con el avance real y lo pagado, así que se corrige solo;
--     convertirlo además en línea lo descontaría dos veces.
-- El ajuste lo aplica la BASE al enviar (no lo manda el navegador) y una sola vez.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nomina_usa.ajuste (
  id             bigserial   PRIMARY KEY,
  semana_origen  date        NOT NULL,
  employee_id    integer,
  tipo           text        NOT NULL,
  so_id          integer,
  rol            text,
  fecha          date,
  estimado       integer,
  real           integer,
  monto          numeric(12,2) NOT NULL,
  informativo    boolean     NOT NULL DEFAULT false,
  aplicado_en    bigint      REFERENCES nomina_usa.solicitud(id),
  creado_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aj_tipo_ck CHECK (tipo IN ('comercial','avance')),
  CONSTRAINT aj_info_ck CHECK (NOT informativo OR aplicado_en IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS aj_uq ON nomina_usa.ajuste (semana_origen, tipo, coalesce(employee_id, 0), coalesce(so_id, 0), coalesce(rol, ''), coalesce(fecha, '2000-01-01'));

-- Cálculo puro (no escribe): qué ajustes salen de la solicitud autorizada de una semana.
CREATE OR REPLACE FUNCTION nomina_usa.ajuste_calculo(p_semana date) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH s AS (SELECT * FROM nomina_usa.solicitud WHERE semana = p_semana AND estado IN ('autorizada','subida') ORDER BY id DESC LIMIT 1),
  tar AS (SELECT coalesce((nomina_usa.cfg('tarifa_comercial_usd') #>> '{}')::numeric, 140) AS t),
  com AS (
    SELECT l.employee_id, l.fecha, (l.detalle->>'pct')::integer AS est,
           coalesce((SELECT (x->>'pct')::integer FROM nomina_usa.reparto_dia r, jsonb_array_elements(r.lineas) x
                      WHERE r.employee_id = l.employee_id AND r.fecha = l.fecha AND r.tipo = 'real' AND x->>'clave' = 'COMERCIAL'), 0) AS real
      FROM nomina_usa.solicitud_linea l JOIN s ON s.id = l.solicitud_id
     WHERE l.tipo = 'comercial' AND coalesce((l.detalle->>'estimado')::boolean, false)
  ),
  -- Días estimados en 0 % que no generaron línea también se comparan (si el real fue comercial, se paga).
  com0 AS (
    SELECT (x->>'employee_id')::integer AS employee_id, (x->>'fecha')::date AS fecha, 0 AS est,
           coalesce((SELECT (y->>'pct')::integer FROM nomina_usa.reparto_dia r, jsonb_array_elements(r.lineas) y
                      WHERE r.employee_id = (x->>'employee_id')::integer AND r.fecha = (x->>'fecha')::date AND r.tipo = 'real' AND y->>'clave' = 'COMERCIAL'), 0) AS real
      FROM s, jsonb_array_elements(coalesce(s.envio->'comercial', '[]'::jsonb)) x
     WHERE coalesce((x->>'estimado')::boolean, false) AND coalesce((x->>'pct')::numeric, 0) = 0
  ),
  av AS (
    SELECT ss.so_id, ss.est_jue, nomina_usa.avance_al(ss.so_id, p_semana + 6) AS real, b.supervisor, b.tecnicos
      FROM nomina_usa.solicitud_so ss JOIN s ON s.id = ss.solicitud_id LEFT JOIN nomina_usa.bolsa b ON b.so_id = ss.so_id AND b.vigente
  )
  SELECT jsonb_build_object('semana', p_semana, 'solicitud_id', (SELECT id FROM s), 'ajustes', coalesce((
    SELECT jsonb_agg(a) FROM (
      SELECT jsonb_build_object('tipo', 'comercial', 'employee_id', c.employee_id, 'fecha', c.fecha, 'estimado', c.est, 'real', c.real,
             'monto', round((SELECT t FROM tar) * (c.real - c.est) / 100.0, 2), 'informativo', false) a
        FROM (SELECT * FROM com UNION ALL SELECT * FROM com0) c WHERE c.real <> c.est
      UNION ALL
      SELECT jsonb_build_object('tipo', 'avance', 'so_id', v.so_id, 'rol', r.rol, 'estimado', v.est_jue, 'real', v.real,
             'monto', round(r.bolsa * (v.real - v.est_jue) / 100.0, 2), 'informativo', true)
        FROM av v, LATERAL (VALUES ('supervisor', coalesce(v.supervisor, 0)), ('tecnicos', coalesce(v.tecnicos, 0))) r(rol, bolsa)
       WHERE v.real <> v.est_jue AND r.bolsa > 0
    ) q), '[]'::jsonb))
$fn$;

-- Guarda los ajustes de una semana (idempotente). Lo corre el viernes nomina-usa/ajuste-viernes
-- y también, por si el cron no corrió, el envío de la semana siguiente.
CREATE OR REPLACE FUNCTION nomina_usa.ajuste_viernes(p_semana date) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE c jsonb := nomina_usa.ajuste_calculo(p_semana); a jsonb; n integer := 0; v_id bigint;
BEGIN
  FOR a IN SELECT * FROM jsonb_array_elements(c->'ajustes') LOOP
    INSERT INTO nomina_usa.ajuste (semana_origen, employee_id, tipo, so_id, rol, fecha, estimado, real, monto, informativo)
    VALUES (p_semana, nullif(a->>'employee_id', '')::integer, a->>'tipo', nullif(a->>'so_id', '')::integer, a->>'rol', nullif(a->>'fecha', '')::date,
            (a->>'estimado')::integer, (a->>'real')::integer, (a->>'monto')::numeric, (a->>'informativo')::boolean)
    ON CONFLICT DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'semana', p_semana, 'nuevos', n);
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.ajustes_pendientes(p_semana date) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('alias', f.alias) ORDER BY a.fecha, a.id), '[]'::jsonb)
    FROM nomina_usa.ajuste a LEFT JOIN nomina_usa.ficha f USING (employee_id)
   WHERE a.semana_origen < p_semana AND a.aplicado_en IS NULL AND NOT a.informativo
$fn$;

-- Contexto con ajuste: lo de 0005 + ajustes pendientes + la vista previa del viernes anterior.
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_contexto_con_ajuste(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE r jsonb := nomina_usa.a_solicitud_contexto(p); v_sem date := (p->>'semana')::date; prev jsonb;
BEGIN
  IF coalesce((r->>'ok')::boolean, false) = false THEN RETURN r; END IF;
  prev := nomina_usa.ajuste_calculo(v_sem - 7);
  RETURN r || jsonb_build_object('ajustes', nomina_usa.ajustes_pendientes(v_sem),
    -- lo que todavía no se guardó (si el cron del viernes no ha corrido): se muestra igual
    'ajustes_previos', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(prev->'ajustes') x
                         WHERE NOT EXISTS (SELECT 1 FROM nomina_usa.ajuste a WHERE a.semana_origen = v_sem - 7 AND a.tipo = x->>'tipo'
                                             AND coalesce(a.employee_id, 0) = coalesce((x->>'employee_id')::integer, 0)
                                             AND coalesce(a.so_id, 0) = coalesce((x->>'so_id')::integer, 0)
                                             AND coalesce(a.rol, '') = coalesce(x->>'rol', '')
                                             AND coalesce(a.fecha, '2000-01-01') = coalesce((x->>'fecha')::date, '2000-01-01'))));
END
$fn$;

-- Envío con ajuste: guarda el ajuste de la semana anterior, envía (0005) y aplica los pendientes como
-- líneas tipo 'ajuste' en la solicitud nueva, una sola vez.
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_enviar_con_ajuste(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_sem date := (p->'envio'->>'semana')::date; r jsonb; a nomina_usa.ajuste;
BEGIN
  IF v_sem IS NOT NULL THEN PERFORM nomina_usa.ajuste_viernes(v_sem - 7); END IF;
  r := nomina_usa.a_solicitud_enviar(p);
  IF coalesce((r->>'ok')::boolean, false) = false THEN RETURN r; END IF;
  FOR a IN SELECT * FROM nomina_usa.ajuste WHERE semana_origen < v_sem AND aplicado_en IS NULL AND NOT informativo FOR UPDATE LOOP
    INSERT INTO nomina_usa.solicitud_linea (solicitud_id, tipo, employee_id, fecha, monto, cuenta, detalle)
    VALUES ((r->>'id')::bigint, 'ajuste', a.employee_id, a.fecha, a.monto, CASE WHEN a.tipo = 'comercial' THEN 'COMERCIAL-USA' ELSE nomina_usa.cuenta_so(NULL, a.so_id) END,
            jsonb_build_object('ajuste_id', a.id, 'tipo', a.tipo, 'estimado', a.estimado, 'real', a.real, 'semana_origen', a.semana_origen));
    UPDATE nomina_usa.ajuste SET aplicado_en = (r->>'id')::bigint WHERE id = a.id;
  END LOOP;
  RETURN r;
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_ajuste_viernes(p jsonb) RETURNS jsonb
LANGUAGE sql AS $fn$ SELECT nomina_usa.ajuste_viernes((p->>'semana')::date) $fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('solicitud_contexto', 'nomina_usa.a_solicitud_contexto_con_ajuste', '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar}'),
  ('solicitud_enviar',   'nomina_usa.a_solicitud_enviar_con_ajuste',   '{nomina_usa:kiosko}'),
  ('ajuste_viernes',     'nomina_usa.a_ajuste_viernes',        '{nomina_usa:validar,nomina_usa:autorizar}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
