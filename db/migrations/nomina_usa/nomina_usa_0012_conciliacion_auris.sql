-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0012 · Conciliación del registro de Auris contra el banco (#448, MVP paso 4)
--
-- Auris manda un registro de nómina por corrida: por persona neto, impuestos del empleado,
-- impuestos del patrón y fee. TODAVÍA NO CONOCEMOS SU FORMATO, así que el mapeo de columnas
-- vive en config (conciliacion_formato) y lo lee shared/nomina-usa/auris.js; la base vuelve a
-- validar cada número y calcula los totales ella (no confía en el navegador).
-- Cruce: los cargos del banco BUS COMPLETE CHK (diario 122 de la empresa 6) los copia
-- nomina-usa/odoo-lectura a nomina_usa.banco_cargo (SOLO LECTURA de Odoo). Auris puede cobrar
-- en 1, 2 o 3 cargos: se busca la combinación de hasta 3 que sume el total del registro.
-- Propuesta (no se escribe): neto → puente «Nómina USA por pagar»; impuestos del empleado y
-- del patrón → «impuestos de nómina pagados»; fee → gasto administrativo. Si el banco no
-- cuadra con el registro, aviso a Gerardo (respeta avisos_modo).
-- Prorrateo mensual de impuestos a las SO en proporción al neto pagado: vista previa.
-- conciliacion_activa nace false y en esta versión NADA escribe en Odoo: escribir es una
-- pieza aparte y un clic de Esteban.
-- Reglas de db/README.md: idempotente, etiquetas con nombre, sin dólar seguido de comilla o
-- dígito, sin llaves dobles. Nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO nomina_usa.config (clave, valor, nota) VALUES
  ('conciliacion_activa', 'false'::jsonb, 'false = la conciliación es vista previa. Escribir en Odoo es una pieza aparte y clic de Esteban.'),
  ('conciliacion_formato', '{"separador":",","columnas":{"employee_id":["employee id","employee_id","emp id"],"persona":["employee","employee name","name"],"neto":["net pay","net","neto"],"imp_empleado":["employee taxes","ee taxes","employee tax"],"imp_patron":["employer taxes","er taxes","employer tax"],"fee":["fee","service fee","auris fee"]},"banco_journal_id":122,"banco_patrones":["auris","payroll"],"dias_antes":3,"dias_despues":10,"tolerancia_usd":0.01}'::jsonb,
   'Columnas del registro de Auris (alias, sin mayúsculas), diario del banco, textos que identifican el cargo y ventana. Se ajusta cuando llegue el primer registro real.'),
  ('conciliacion_cuentas', '{"puente":null,"impuestos_pagados":null,"gasto_admin":null}'::jsonb, 'Cuentas de la empresa 6 para la propuesta. Vacías hasta que existan en Odoo.')
ON CONFLICT (clave) DO NOTHING;

-- Cargos del banco, copiados de account.bank.statement.line (solo lectura).
CREATE TABLE IF NOT EXISTS nomina_usa.banco_cargo (
  id          integer     PRIMARY KEY,
  journal_id  integer     NOT NULL,
  fecha       date        NOT NULL,
  ref         text,
  monto       numeric(12,2) NOT NULL,
  conciliado  boolean,
  leido_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS banco_fecha ON nomina_usa.banco_cargo (fecha);

CREATE TABLE IF NOT EXISTS nomina_usa.auris_registro (
  id             bigserial   PRIMARY KEY,
  solicitud_id   bigint      REFERENCES nomina_usa.solicitud(id),
  semana         date        NOT NULL,
  fecha_pago     date        NOT NULL,
  filas          jsonb       NOT NULL,
  totales        jsonb       NOT NULL,
  vigente        boolean     NOT NULL DEFAULT true,
  practica       boolean     NOT NULL DEFAULT false,
  importado_por  text        NOT NULL,
  importado_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ar_viernes_ck CHECK (extract(isodow FROM semana) = 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS ar_vigente_uq ON nomina_usa.auris_registro (semana) WHERE vigente AND NOT practica;

CREATE OR REPLACE FUNCTION nomina_usa.banco_parametros() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('journal_id', coalesce((nomina_usa.cfg('conciliacion_formato')->>'banco_journal_id')::integer, 122),
                            'dias', 35, 'so_ids', nomina_usa.analitica_faltante())
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.banco_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE x jsonb; n integer := 0;
BEGIN
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'cargos', '[]'::jsonb)) LOOP
    INSERT INTO nomina_usa.banco_cargo (id, journal_id, fecha, ref, monto, conciliado, leido_at)
    VALUES ((x->>'id')::integer, (x->>'journal_id')::integer, (x->>'fecha')::date, left(x->>'ref', 200), (x->>'monto')::numeric, (x->>'conciliado')::boolean, now())
    ON CONFLICT (id) DO UPDATE SET fecha = excluded.fecha, ref = excluded.ref, monto = excluded.monto, conciliado = excluded.conciliado, leido_at = now();
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'cargos', n);
END
$fn$;

-- ── Importar el registro (Gerardo) ─────────────────────────────────────────
-- p = { semana, fecha_pago, practica?, filas:[{employee_id, persona, neto, imp_empleado, imp_patron, fee}] }
CREATE OR REPLACE FUNCTION nomina_usa.a_auris_importar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_sem date := (p->>'semana')::date; v_pago date := coalesce((p->>'fecha_pago')::date, (p->>'semana')::date + 7);
        v_pr boolean := coalesce((p->>'practica')::boolean, false); x jsonb; v_err jsonb := '[]'::jsonb; v_filas jsonb := '[]'::jsonb;
        v_sol bigint; v_id bigint; v_tot jsonb; k text; v_num numeric; v_rev jsonb;
BEGIN
  IF v_sem IS NULL OR extract(isodow FROM v_sem) <> 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'SEMANA_INVALIDA'); END IF;
  IF jsonb_array_length(coalesce(p->'filas', '[]'::jsonb)) = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REGISTRO_VACIO'); END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p->'filas') LOOP
    FOREACH k IN ARRAY ARRAY['neto', 'imp_empleado', 'imp_patron', 'fee'] LOOP
      BEGIN v_num := round(coalesce(nullif(x->>k, '')::numeric, 0), 2);
      EXCEPTION WHEN OTHERS THEN v_err := v_err || jsonb_build_object('codigo', 'NUMERO_INVALIDO', 'campo', k, 'valor', x->>k, 'persona', x->>'persona'); v_num := 0; END;
      IF v_num < 0 THEN v_err := v_err || jsonb_build_object('codigo', 'NEGATIVO', 'campo', k, 'persona', x->>'persona'); END IF;
      x := jsonb_set(x, ARRAY[k], to_jsonb(v_num));
    END LOOP;
    v_filas := v_filas || jsonb_build_array(x);
  END LOOP;
  IF jsonb_array_length(v_err) > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REGISTRO_INVALIDO', 'errores', v_err); END IF;
  SELECT jsonb_build_object('neto', sum((f->>'neto')::numeric), 'imp_empleado', sum((f->>'imp_empleado')::numeric),
           'imp_patron', sum((f->>'imp_patron')::numeric), 'fee', sum((f->>'fee')::numeric),
           'total', sum((f->>'neto')::numeric + (f->>'imp_empleado')::numeric + (f->>'imp_patron')::numeric + (f->>'fee')::numeric), 'personas', count(*))
    INTO v_tot FROM jsonb_array_elements(v_filas) f;
  SELECT id INTO v_sol FROM nomina_usa.solicitud WHERE semana = v_sem AND estado IN ('autorizada', 'subida') ORDER BY id DESC LIMIT 1;
  UPDATE nomina_usa.auris_registro SET vigente = false WHERE semana = v_sem AND vigente AND practica = v_pr;
  INSERT INTO nomina_usa.auris_registro (solicitud_id, semana, fecha_pago, filas, totales, practica, importado_por)
  VALUES (v_sol, v_sem, v_pago, v_filas, v_tot, v_pr, coalesce(p->>'actor', 'desconocido')) RETURNING id INTO v_id;
  PERFORM nomina_usa.log(p->>'actor', 'auris_importado', 'auris:' || v_id, NULL, v_tot, CASE WHEN v_pr THEN 'práctica' END);
  v_rev := nomina_usa.conciliacion_revisar(v_id, now());
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'totales', v_tot, 'revision', v_rev);
END
$fn$;

-- Hasta 3 cargos que sumen el total. Prefiere menos cargos y más cercanos a la fecha de pago.
CREATE OR REPLACE FUNCTION nomina_usa.conciliacion_calculo(p_reg bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE r nomina_usa.auris_registro; f jsonb := nomina_usa.cfg('conciliacion_formato'); cu jsonb := nomina_usa.cfg('conciliacion_cuentas');
        v_tol numeric; v_total numeric; v_cand jsonb; v_comb jsonb; v_dif jsonb; v_sol jsonb;
BEGIN
  SELECT * INTO r FROM nomina_usa.auris_registro WHERE id = p_reg;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'REGISTRO_INEXISTENTE'); END IF;
  v_tol := coalesce((f->>'tolerancia_usd')::numeric, 0.01); v_total := (r.totales->>'total')::numeric;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'fecha', b.fecha, 'ref', b.ref, 'monto', -b.monto) ORDER BY b.fecha, b.id), '[]'::jsonb) INTO v_cand
    FROM nomina_usa.banco_cargo b
   WHERE b.journal_id = coalesce((f->>'banco_journal_id')::integer, 122) AND b.monto < 0
     AND b.fecha BETWEEN r.fecha_pago - coalesce((f->>'dias_antes')::integer, 3) AND r.fecha_pago + coalesce((f->>'dias_despues')::integer, 10)
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(f->'banco_patrones', '[]'::jsonb)) pt WHERE b.ref ILIKE '%' || pt || '%')
     AND NOT EXISTS (SELECT 1 FROM nomina_usa.auris_registro o WHERE o.id <> r.id AND o.vigente AND NOT o.practica
                       AND (nomina_usa.conciliacion_cargos_usados(o.id)) ? b.id::text);
  WITH c0 AS (SELECT * FROM jsonb_to_recordset(v_cand) AS x(id integer, fecha date, ref text, monto numeric))
  SELECT to_jsonb(q) INTO v_comb FROM (
    SELECT ARRAY[a.id] AS ids, a.monto AS suma, 1 AS n, abs(a.fecha - r.fecha_pago) AS dist FROM c0 a WHERE abs(a.monto - v_total) <= v_tol
    UNION ALL
    SELECT ARRAY[a.id, b.id], a.monto + b.monto, 2, abs(a.fecha - r.fecha_pago) + abs(b.fecha - r.fecha_pago) FROM c0 a JOIN c0 b ON b.id > a.id
     WHERE abs(a.monto + b.monto - v_total) <= v_tol
    UNION ALL
    SELECT ARRAY[a.id, b.id, c.id], a.monto + b.monto + c.monto, 3, abs(a.fecha - r.fecha_pago) + abs(b.fecha - r.fecha_pago) + abs(c.fecha - r.fecha_pago)
      FROM c0 a JOIN c0 b ON b.id > a.id JOIN c0 c ON c.id > b.id
     WHERE abs(a.monto + b.monto + c.monto - v_total) <= v_tol
    ORDER BY n, dist LIMIT 1) q;
  -- Diferencias por persona contra lo autorizado en la solicitud (neto que Auris pagó vs. el que pedimos).
  IF r.solicitud_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('employee_id', coalesce(a.employee_id, b.employee_id), 'autorizado', coalesce(a.neto, 0), 'auris', coalesce(b.neto, 0),
             'diferencia', coalesce(b.neto, 0) - coalesce(a.neto, 0)) ORDER BY coalesce(a.employee_id, b.employee_id)), '[]'::jsonb) INTO v_dif
      FROM (SELECT employee_id, sum(autorizado_monto) AS neto FROM nomina_usa.solicitud_linea WHERE solicitud_id = r.solicitud_id GROUP BY 1 HAVING sum(autorizado_monto) <> 0) a
      FULL JOIN (SELECT nullif(x->>'employee_id', '')::integer AS employee_id, sum((x->>'neto')::numeric) AS neto FROM jsonb_array_elements(r.filas) x GROUP BY 1) b USING (employee_id)
     WHERE abs(coalesce(b.neto, 0) - coalesce(a.neto, 0)) > v_tol;
  END IF;
  RETURN jsonb_build_object('ok', true, 'registro_id', r.id, 'semana', r.semana, 'fecha_pago', r.fecha_pago, 'practica', r.practica,
    'totales', r.totales, 'candidatos', v_cand, 'cuadra', v_comb IS NOT NULL, 'cargos', coalesce(v_comb->'ids', '[]'::jsonb),
    'suma_banco', coalesce((v_comb->>'suma')::numeric, (SELECT sum((c->>'monto')::numeric) FROM jsonb_array_elements(v_cand) c)),
    'diferencias_persona', coalesce(v_dif, '[]'::jsonb),
    'propuesta', jsonb_build_array(
      jsonb_build_object('concepto', 'Neto pagado a empleados', 'cuenta', 'Nómina USA por pagar (puente)', 'cuenta_id', cu->'puente', 'debe', r.totales->'neto'),
      jsonb_build_object('concepto', 'Impuestos del empleado y del patrón', 'cuenta', 'Impuestos de nómina pagados', 'cuenta_id', cu->'impuestos_pagados',
                         'debe', ((r.totales->>'imp_empleado')::numeric + (r.totales->>'imp_patron')::numeric)),
      jsonb_build_object('concepto', 'Fee de Auris', 'cuenta', 'Gasto administrativo', 'cuenta_id', cu->'gasto_admin', 'debe', r.totales->'fee'),
      jsonb_build_object('concepto', 'Cargo(s) del banco', 'cuenta', 'BUS COMPLETE CHK', 'haber', v_total)),
    'activa', nomina_usa.cfg('conciliacion_activa'));
END
$fn$;

-- Ids de los cargos que un registro ya tomó (para no usar el mismo cargo dos veces).
CREATE OR REPLACE FUNCTION nomina_usa.conciliacion_cargos_usados(p_reg bigint) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce((SELECT jsonb_object_agg(x, true) FROM jsonb_array_elements_text(coalesce(totales->'cargos_tomados', '[]'::jsonb)) x), '{}'::jsonb)
    FROM nomina_usa.auris_registro WHERE id = p_reg
$fn$;

-- Revisa un registro: guarda los cargos que cuadraron o avisa a Gerardo si el banco no cuadra.
-- No cuadra = hay cargos candidatos que no suman, o ya pasaron 3 días de la fecha de pago sin cargo.
CREATE OR REPLACE FUNCTION nomina_usa.conciliacion_revisar(p_reg bigint, p_ahora timestamptz) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE c jsonb := nomina_usa.conciliacion_calculo(p_reg); r nomina_usa.auris_registro; v_av jsonb;
BEGIN
  IF coalesce((c->>'ok')::boolean, false) = false THEN RETURN c; END IF;
  SELECT * INTO r FROM nomina_usa.auris_registro WHERE id = p_reg;
  IF (c->>'cuadra')::boolean THEN
    UPDATE nomina_usa.auris_registro SET totales = totales || jsonb_build_object('cargos_tomados', c->'cargos') WHERE id = p_reg;
  ELSIF NOT r.practica AND (jsonb_array_length(c->'candidatos') > 0 OR (p_ahora AT TIME ZONE 'America/Monterrey')::date > r.fecha_pago + 3) THEN
    v_av := nomina_usa.avisar('concilia_no_cuadra:' || p_reg, 'aviso', 'conciliacion_no_cuadra', '{gerardo}',
      'Nómina USA: el banco no cuadra con el registro de Auris (semana ' || to_char(r.semana, 'DD/MM') || ')',
      '<p>El registro de Auris de la semana ' || to_char(r.semana, 'DD/MM') || ' suma ' || nomina_usa.usd((c->'totales'->>'total')::numeric) ||
      ' (neto, impuestos y fee) y los cargos del banco que encontré suman ' || nomina_usa.usd((c->>'suma_banco')::numeric) ||
      '. Revísalo en Nómina USA, pestaña Revisión.</p>' || nomina_usa.pie_aviso(), 'auris:' || p_reg, 'alerta');
  END IF;
  RETURN jsonb_build_object('cuadra', c->'cuadra', 'cargos', c->'cargos', 'aviso', v_av);
END
$fn$;

-- Revisa los registros vigentes sin cuadrar (lo llama nomina-usa/odoo-lectura después de leer el banco).
CREATE OR REPLACE FUNCTION nomina_usa.conciliacion_revisar_todo(p_ahora timestamptz) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT coalesce(jsonb_agg(nomina_usa.conciliacion_revisar(id, p_ahora)), '[]'::jsonb) FROM nomina_usa.auris_registro
   WHERE vigente AND NOT practica AND NOT (totales ? 'cargos_tomados') AND fecha_pago >= (p_ahora AT TIME ZONE 'America/Monterrey')::date - 30
$fn$;

-- Prorrateo mensual de impuestos (empleado + patrón) a las cuentas analíticas, en proporción al
-- neto pagado a cada una en las solicitudes de los registros del mes. Vista previa, no escribe.
CREATE OR REPLACE FUNCTION nomina_usa.prorrateo_impuestos(p_mes date, p_practica boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH r AS (
    SELECT * FROM nomina_usa.auris_registro
     WHERE vigente AND practica = p_practica AND date_trunc('month', fecha_pago) = date_trunc('month', p_mes)
  ), imp AS (SELECT coalesce(sum((totales->>'imp_empleado')::numeric + (totales->>'imp_patron')::numeric), 0) AS t FROM r),
  n AS (
    SELECT l.cuenta, nomina_usa.analitica_de(l.tipo, l.so_id, l.cuenta) AS analytic_id, sum(l.autorizado_monto) AS neto
      FROM nomina_usa.solicitud_linea l JOIN r ON r.solicitud_id = l.solicitud_id
     GROUP BY 1, 2 HAVING sum(l.autorizado_monto) > 0
  ), t AS (SELECT sum(neto) AS total FROM n),
  p AS (
    SELECT n.*, round((SELECT t FROM imp) * n.neto / nullif((SELECT total FROM t), 0), 2) AS asignado,
           row_number() OVER (ORDER BY n.neto DESC, n.cuenta) AS rk FROM n
  )
  SELECT jsonb_build_object('ok', true, 'mes', to_char(p_mes, 'YYYY-MM'), 'registros', (SELECT count(*) FROM r),
    'impuestos', (SELECT t FROM imp), 'neto_total', coalesce((SELECT total FROM t), 0),
    'lineas', coalesce((SELECT jsonb_agg(jsonb_build_object('cuenta', cuenta, 'analytic_id', analytic_id, 'neto', neto,
      -- El centavo que sobra del redondeo va a la cuenta con más neto: la suma da exacto.
      'impuestos', asignado + CASE WHEN rk = 1 THEN (SELECT t FROM imp) - (SELECT sum(asignado) FROM p) ELSE 0 END) ORDER BY rk) FROM p), '[]'::jsonb))
$fn$;

-- ══ Panel ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION nomina_usa.a_conciliacion_ver(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_id bigint := (p->>'registro_id')::bigint; v_pr boolean := coalesce((p->>'practica')::boolean, false);
BEGIN
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM nomina_usa.auris_registro WHERE semana = (p->>'semana')::date AND vigente AND practica = v_pr ORDER BY id DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object('ok', true, 'formato', nomina_usa.cfg('conciliacion_formato'), 'activa', nomina_usa.cfg('conciliacion_activa'),
    'conciliacion', CASE WHEN v_id IS NULL THEN NULL ELSE nomina_usa.conciliacion_calculo(v_id) END,
    'prorrateo', nomina_usa.prorrateo_impuestos(coalesce((SELECT fecha_pago FROM nomina_usa.auris_registro WHERE id = v_id), (p->>'semana')::date + 7), v_pr));
END
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('auris_importar',    'nomina_usa.a_auris_importar',    '{nomina_usa:archivo}'),
  ('conciliacion_ver',  'nomina_usa.a_conciliacion_ver',  '{nomina_usa:archivo,nomina_usa:autorizar}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
