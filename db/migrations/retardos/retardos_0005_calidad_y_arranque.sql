-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0005 · Calidad de datos, arranque suave y simulador de escalera (#334, sesión 2)
--
-- 1) Calidad de datos por persona (vista v_calidad + tabla calidad_revision), para que RH
--    revise la hora de entrada de cada quien antes de pasar a real. La hora sugerida es
--    SOLO referencia: nunca se aplica sola ni se escribe en Odoo.
-- 2) Arranque suave: nivel_maximo_habilitado y suspensiones_habilitadas. Un caso que
--    alcanza un nivel deshabilitado queda RETENIDO ("nivel alcanzado, no notificado"):
--    se registra, aparece en el panel y no se le escribe a la persona.
-- 3) simular_escalera(): simulación de sólo lectura sobre las checadas guardadas, para
--    comparar escaleras sin tocar los casos de sombra.
-- Sin llaves dobles ni patrones de reemplazo de JS (retardos_0001 reglas 7 y 8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Arranque suave ─────────────────────────────────────────────────────
INSERT INTO retardos.config (clave, valor, descripcion) VALUES
 ('nivel_maximo_habilitado', '2'::jsonb,
  'Nivel más alto que se notifica a la persona. 2 = carta compromiso. Un caso de nivel mayor queda RETENIDO: registrado y visible para RH, sin correo.'),
 ('suspensiones_habilitadas', 'false'::jsonb,
  'Si es false, ningún caso de suspensión se notifica aunque el nivel máximo lo permita.')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE retardos.caso DROP CONSTRAINT IF EXISTS caso_estado_check;
ALTER TABLE retardos.caso ADD CONSTRAINT caso_estado_check CHECK (estado IN (
  'DETECTADO','NOTIFICADO','ESPERANDO_FIRMA','FIRMA_RECIBIDA','VALIDADO_RH',
  'ACCION_PROGRAMADA','ACCION_VERIFICADA','CERRADO',
  'VENCIDO','ESCALADO','SE_NEGO_A_FIRMAR','IMPUGNADO','CANCELADO_POR_RH','RETENIDO'));

INSERT INTO retardos.transicion_valida (de, a) VALUES
 ('DETECTADO','RETENIDO'), ('RETENIDO','CERRADO'), ('RETENIDO','CANCELADO_POR_RH')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION retardos.nivel_habilitado(p_nivel smallint) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT p_nivel <= coalesce(retardos.cfg_txt('nivel_maximo_habilitado')::int, 2)
     AND (coalesce((SELECT accion FROM retardos.escalera WHERE nivel = p_nivel), '') <> 'suspension'
          OR coalesce(retardos.cfg_txt('suspensiones_habilitadas'), 'false') = 'true')
$fn$;

-- abrir_caso: igual que en 0002 más la compuerta del arranque suave.
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

  -- Arranque suave: el nivel no está habilitado. Se registra y no se escribe a nadie.
  IF NOT retardos.nivel_habilitado(p_nivel) THEN
    PERFORM retardos.transicionar(v_id, 'RETENIDO', 'sistema',
      'Nivel alcanzado, no notificado: el nivel ' || p_nivel || ' no está habilitado (arranque suave)',
      jsonb_build_object('nivel_maximo_habilitado', retardos.cfg('nivel_maximo_habilitado'),
                         'suspensiones_habilitadas', retardos.cfg('suspensiones_habilitadas')));
    RETURN v_id;
  END IF;

  SELECT * INTO m FROM retardos.empleado WHERE employee_id = p_emp;
  SELECT * INTO sup FROM retardos.empleado WHERE employee_id = m.parent_id;
  v_cc := v_rh;
  IF sup.email_valido THEN v_cc := v_cc || to_jsonb(sup.email); END IF;

  IF m.email_valido THEN
    v_para := jsonb_build_array(m.email);
    PERFORM retardos.encolar_plantilla(v_id, 'notificacion_' || e.accion, 'notificacion', v_folio || ':notificacion',
                                       v_para, v_cc, CASE WHEN e.accion = 'aviso' THEN NULL ELSE e.accion END);
  ELSE
    UPDATE retardos.caso SET ruta = 'supervisor' WHERE id = v_id;
    v_para := CASE WHEN sup.email_valido THEN jsonb_build_array(sup.email) ELSE v_rh END;
    PERFORM retardos.encolar_plantilla(v_id, 'ruta_supervisor', 'ruta_supervisor', v_folio || ':ruta_supervisor',
                                       v_para, v_rh, CASE WHEN e.accion = 'aviso' THEN NULL ELSE e.accion END);
    PERFORM retardos.log(v_id, 'ruta_alterna', 'sistema', 'Empleado sin correo válido: entrega por supervisor o RH');
  END IF;
  RETURN v_id;
END
$fn$;

-- ── 2. Calidad de datos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retardos.calidad_revision (
  employee_id   integer     PRIMARY KEY,
  revisado      boolean     NOT NULL DEFAULT false,
  nota          text,
  revisado_por  text,
  revisado_at   timestamptz
);
COMMENT ON TABLE retardos.calidad_revision IS 'Marca de RH "revisado" por persona en la pestaña Calidad de datos. Cada cambio queda en la bitácora.';

-- Primera checada de cada día por persona.
CREATE OR REPLACE VIEW retardos.v_primera_checada AS
SELECT DISTINCT ON (c.employee_id, c.fecha)
       c.employee_id, c.fecha, c.hora_local, c.attendance_id, c.disputa, c.olvido_entrada
  FROM retardos.checada c
 ORDER BY c.employee_id, c.fecha, c.hora_local, c.attendance_id;

-- Hora sugerida: el primer horario en punto o y media con el que la persona habría
-- llegado tarde en no más del 20% de sus días (percentil 80 de la primera checada, menos
-- la tolerancia, redondeado hacia arriba a la media hora). Describe la costumbre, no la
-- norma: sirve para que RH vea dónde la ficha no se parece a la realidad y decida.
CREATE OR REPLACE VIEW retardos.v_calidad AS
WITH par AS (
  SELECT coalesce(retardos.cfg_txt('tolerancia_min')::numeric, 20) AS tol,
         (now() AT TIME ZONE 'America/Monterrey')::date AS hoy
), emp AS (
  SELECT e.* FROM retardos.empleado e
   WHERE e.activo
     AND e.company_id IN (SELECT (jsonb_array_elements_text(coalesce(retardos.cfg('empresa_ids'), '[1]'::jsonb)))::int)
), pc AS (
  SELECT p.* FROM retardos.v_primera_checada p, par
   WHERE p.fecha > par.hoy - 90 AND p.fecha <= par.hoy AND retardos.es_habil(p.fecha)
), est AS (
  SELECT employee_id, count(*) AS dias,
         percentile_cont(0.5)  WITHIN GROUP (ORDER BY hora_local) AS mediana,
         percentile_cont(0.25) WITHIN GROUP (ORDER BY hora_local) AS p25,
         percentile_cont(0.8)  WITHIN GROUP (ORDER BY hora_local) AS p80
    FROM pc GROUP BY employee_id
), tarde AS (
  SELECT pc.employee_id,
         count(*) FILTER (WHERE pc.hora_local > emp.hora_entrada + par.tol / 60.0) AS dias_tarde,
         count(*) FILTER (WHERE (pc.hora_local - emp.hora_entrada) * 60 > 180) AS dias_mas_180
    FROM pc JOIN emp USING (employee_id), par
   GROUP BY pc.employee_id
), correo AS (
  SELECT lower(email) AS email, count(*) AS n FROM emp WHERE email IS NOT NULL GROUP BY 1
), base AS (
  SELECT e.employee_id, e.nombre, e.puesto, e.departamento, e.email, e.email_valido,
         e.hora_entrada, e.hora_calendario,
         coalesce(s.dias, 0) AS dias_con_checada,
         round(s.mediana::numeric, 4) AS mediana, round(s.p25::numeric, 4) AS p25,
         coalesce(t.dias_tarde, 0) AS dias_tarde, coalesce(t.dias_mas_180, 0) AS dias_mas_180,
         CASE WHEN coalesce(s.dias, 0) = 0 THEN NULL
              ELSE round(100.0 * coalesce(t.dias_tarde, 0) / s.dias, 1) END AS pct_tarde,
         CASE WHEN coalesce(s.dias, 0) < 10 THEN NULL
              ELSE ceil((s.p80 - par.tol / 60.0) * 2) / 2.0 END AS hora_p80,
         coalesce(c.n, 0) AS usos_correo,
         lower(split_part(coalesce(e.email, ''), '@', 2)) AS dominio
    FROM emp e CROSS JOIN par
    LEFT JOIN est s USING (employee_id)
    LEFT JOIN tarde t USING (employee_id)
    LEFT JOIN correo c ON c.email = lower(e.email)
)
SELECT b.employee_id, b.nombre, b.puesto, b.departamento, b.hora_entrada, b.hora_calendario,
       b.dias_con_checada, b.mediana, b.p25, b.dias_tarde, b.pct_tarde, b.dias_mas_180,
       CASE WHEN b.hora_p80 IS NULL THEN NULL
            WHEN b.pct_tarde <= 20 THEN b.hora_entrada
            ELSE greatest(b.hora_p80, b.hora_entrada) END AS hora_sugerida,
       jsonb_strip_nulls(jsonb_build_object(
         'ficha_vs_calendario', CASE WHEN b.hora_entrada IS NOT NULL AND b.hora_calendario IS NOT NULL
                                      AND b.hora_entrada <> b.hora_calendario THEN true END,
         'sin_correo',          CASE WHEN b.email IS NULL THEN true END,
         'correo_personal',     CASE WHEN b.email IS NOT NULL AND b.dominio <> 'fts.mx' THEN true END,
         'dominio_invalido',    CASE WHEN b.email IS NOT NULL AND (NOT b.email_valido
                                      OR b.dominio IN ('gmai.com','gmial.com','gmal.com','hotmial.com','hotmal.com','hotmai.com','outlok.com','yaho.com')) THEN true END,
         'correo_compartido',   CASE WHEN b.usos_correo > 1 THEN true END,
         'retrasos_mas_180',    CASE WHEN b.dias_mas_180 > 0 THEN true END,
         'sin_checadas',        CASE WHEN b.dias_con_checada = 0 THEN true END,
         'sin_hora_entrada',    CASE WHEN b.hora_entrada IS NULL OR b.hora_entrada <= 0 THEN true END
       )) AS banderas,
       coalesce(r.revisado, false) AS revisado, r.nota, r.revisado_por, r.revisado_at
  FROM base b LEFT JOIN retardos.calidad_revision r USING (employee_id);

CREATE OR REPLACE FUNCTION retardos.panel_calidad(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'personas', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.revisado, v.departamento, v.nombre) FROM retardos.v_calidad v), '[]'::jsonb),
    'tolerancia_min', coalesce(retardos.cfg_txt('tolerancia_min')::numeric, 20),
    'regla_sugerida', 'Primer horario en punto o y media con el que habría llegado tarde en no más del 20% de sus días hábiles de los últimos 90. Sólo referencia: no se aplica sola.')
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_calidad_revisar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_emp integer := (p->>'employee_id')::int; v_rev boolean := coalesce((p->>'revisado')::boolean, true);
BEGIN
  IF coalesce(p->>'rol', 'lector') <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
  IF NOT EXISTS (SELECT 1 FROM retardos.empleado WHERE employee_id = v_emp) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EMPLEADO_INEXISTENTE');
  END IF;
  INSERT INTO retardos.calidad_revision (employee_id, revisado, nota, revisado_por, revisado_at)
  VALUES (v_emp, v_rev, left(p->>'nota', 500), coalesce(p->>'actor', 'desconocido'), now())
  ON CONFLICT (employee_id) DO UPDATE
     SET revisado = EXCLUDED.revisado, nota = EXCLUDED.nota, revisado_por = EXCLUDED.revisado_por, revisado_at = now();
  PERFORM retardos.log(NULL, 'calidad_revisado', coalesce(p->>'actor', 'desconocido'), left(p->>'nota', 500),
                       jsonb_build_object('employee_id', v_emp, 'revisado', v_rev));
  RETURN jsonb_build_object('ok', true);
END
$fn$;

-- panel_seguro: igual que en 0004, más las dos acciones de calidad.
CREATE OR REPLACE FUNCTION retardos.panel_seguro(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    INSERT INTO retardos.nonce (nonce, actor, accion) VALUES (p->>'nonce', coalesce(p->>'actor', '?'), p->>'accion');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REPLAY');
  END;
  IF p->>'accion' = 'evidencia' THEN RETURN retardos.panel_evidencia(p); END IF;
  IF p->>'accion' = 'calidad' THEN RETURN retardos.panel_calidad(p); END IF;
  IF p->>'accion' = 'calidad_revisar' THEN RETURN retardos.panel_calidad_revisar(p); END IF;
  RETURN retardos.panel(p);
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('ok', false, 'error', split_part(SQLERRM, ' ', 1), 'detalle', left(SQLERRM, 200));
END
$fn$;

-- ── 3. Simulador de escalera (sólo lectura) ───────────────────────────────
-- p = { desde, hasta, umbrales: [1,3,5,7], nivel_max: 99, excluir_mas_de_min: null|180,
--       hora: 'actual'|'sugerida' }
-- Modela la operación real: detectar corre a diario, así que cada umbral que una persona
-- cruza en el mes abre su propio caso. No modela reincidencia (depende de firmas futuras).
CREATE OR REPLACE FUNCTION retardos.simular_escalera(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
WITH par AS (
  SELECT (p->>'desde')::date AS desde, (p->>'hasta')::date AS hasta,
         coalesce((p->>'nivel_max')::int, 99) AS nivel_max,
         (p->>'excluir_mas_de_min')::int AS excluir,
         coalesce(p->>'hora', 'actual') AS hora,
         coalesce(retardos.cfg_txt('tolerancia_min')::numeric, 20) AS tol
), umb AS (
  SELECT (u.val)::int AS umbral, u.ord::int AS nivel
    FROM jsonb_array_elements_text(p->'umbrales') WITH ORDINALITY AS u(val, ord)
), emp AS (
  SELECT e.employee_id,
         CASE WHEN par.hora = 'sugerida' THEN coalesce(v.hora_sugerida, e.hora_entrada) ELSE e.hora_entrada END AS hora
    FROM retardos.empleado e CROSS JOIN par
    LEFT JOIN retardos.v_calidad v USING (employee_id)
   WHERE e.company_id IN (SELECT (jsonb_array_elements_text(coalesce(retardos.cfg('empresa_ids'), '[1]'::jsonb)))::int)
), tarde AS (
  SELECT pc.employee_id, to_char(pc.fecha, 'YYYY-MM') AS mes, pc.fecha
    FROM retardos.v_primera_checada pc JOIN emp USING (employee_id) CROSS JOIN par
   WHERE pc.fecha BETWEEN par.desde AND par.hasta
     AND retardos.es_habil(pc.fecha)
     AND NOT EXISTS (SELECT 1 FROM retardos.festivo f WHERE f.fecha = pc.fecha)
     AND NOT pc.disputa AND NOT pc.olvido_entrada
     AND NOT EXISTS (SELECT 1 FROM retardos.exclusion x WHERE x.activo AND x.employee_id = pc.employee_id
                        AND pc.fecha BETWEEN x.desde AND x.hasta)
     AND emp.hora > 0
     AND pc.hora_local > emp.hora + par.tol / 60.0
     AND (par.excluir IS NULL OR (pc.hora_local - emp.hora) * 60 <= par.excluir)
), conteo AS (
  SELECT employee_id, mes, count(*) AS n FROM tarde GROUP BY 1, 2
), casos AS (
  SELECT c.employee_id, c.mes, umb.nivel, (umb.nivel <= par.nivel_max) AS notificado
    FROM conteo c JOIN umb ON umb.umbral <= c.n CROSS JOIN par
), maxn AS (
  SELECT employee_id, mes, max(nivel) AS nivel FROM casos GROUP BY 1, 2
), meses AS (
  SELECT DISTINCT mes FROM conteo
)
SELECT jsonb_build_object(
  'parametros', p,
  'por_mes', coalesce((SELECT jsonb_object_agg(m.mes, jsonb_build_object(
      'retardos', (SELECT coalesce(sum(n), 0) FROM conteo WHERE mes = m.mes),
      'personas_con_retardo', (SELECT count(*) FROM conteo WHERE mes = m.mes),
      'casos_notificados_por_nivel', coalesce((SELECT jsonb_object_agg(nivel, k) FROM (SELECT nivel, count(*) AS k FROM casos WHERE mes = m.mes AND notificado GROUP BY nivel) z), '{}'::jsonb),
      'casos_retenidos_por_nivel', coalesce((SELECT jsonb_object_agg(nivel, k) FROM (SELECT nivel, count(*) AS k FROM casos WHERE mes = m.mes AND NOT notificado GROUP BY nivel) z), '{}'::jsonb),
      'personas_por_nivel_maximo', coalesce((SELECT jsonb_object_agg(nivel, k) FROM (SELECT nivel, count(*) AS k FROM maxn WHERE mes = m.mes GROUP BY nivel) z), '{}'::jsonb),
      'correos_a_personas', (SELECT count(*) FROM casos WHERE mes = m.mes AND notificado)
    )) FROM meses m), '{}'::jsonb))
$fn$;

GRANT SELECT ON retardos.v_primera_checada, retardos.v_calidad TO retardos_app;
GRANT SELECT, INSERT, UPDATE ON retardos.calidad_revision TO retardos_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;
