-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0007 · Reglas definitivas: tolerancia de 15 min al segundo, sólo lunes a
--                 viernes, hora del centro y jornada semanal FTS de 48 h efectivas
--                 (viernes a jueves) (#334, reglas R3)
--
-- 1) Hora del centro en UN solo lugar: retardos.a_local(). Odoo manda UTC; todo cálculo,
--    corte y mensaje se hace en America/Monterrey (UTC-6 todo el año, sin horario de verano).
-- 2) Retardo = primera checada MAYOR a hora de entrada + tolerancia, al segundo: a los
--    15:00 exactos no es retardo, a los 15:01 sí. Sábado y domingo nunca generan retardo
--    (es_habil() sólo puede restringir de lunes a viernes).
-- 3) Jornada semanal FTS (viernes 00:00:00 a jueves 23:59:59, hora del centro): horas
--    brutas, comida descontada por día laborado, horas efectivas contra 48 (o la jornada
--    del calendario si difiere), prorrateo de días que no se trabajan, y bandeja "Jornada
--    por revisar" cuando los datos están incompletos. La numeración de semanas es la de
--    Nómina · Incidencias (ancla jueves 23-jul-2026 = S30).
-- 4) Escalera de incumplimiento con casos propios (folio JOR-AAAA-NNNN) en la misma tabla
--    caso, con la misma máquina de estados y bitácora. El 3er aviso lleva hoja con QR que
--    RH recolecta y abre una PROPUESTA de medida. Las medidas quedan RETENIDAS
--    (modo_medidas_jornada) hasta que Legal confirme: el sistema nunca las aplica.
-- 5) Plantillas marcadas "texto pendiente de validación de RH".
-- Todo valor nuevo nace confirmado = false. Sin datos personales.
-- Sin llaves dobles ni patrones de reemplazo de JS (retardos_0001 reglas 7 y 8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1. CONFIGURACIÓN ═════════════════════════════════════════════════════════
UPDATE retardos.config
   SET valor = '15'::jsonb, actualizado_por = 'retardos_0007', actualizado_at = now(),
       descripcion = 'Minutos de tolerancia sobre la hora de entrada. Es retardo si la primera checada es MAYOR a la hora de entrada más estos minutos, al segundo: a los 15:00 exactos no es retardo, a los 15:01 sí. Regla de Esteban del 28-sep-2026 (reemplaza los 20 min recuperados del sistema anterior).'
 WHERE clave = 'tolerancia_min' AND NOT confirmado;

UPDATE retardos.config
   SET descripcion = 'Días ISO que cuentan para retardos (1=lunes). Sólo puede RESTRINGIR lunes a viernes: sábado y domingo nunca generan retardo aunque aparezcan aquí o en el calendario de la persona (sus horas sí cuentan para la jornada semanal).'
 WHERE clave = 'dias_habiles';

INSERT INTO retardos.config (clave, valor, descripcion) VALUES
 ('zona_horaria', '"America/Monterrey"'::jsonb,
  'Zona de todos los cálculos, cortes y mensajes: hora del centro (CST, UTC-6 todo el año). Odoo guarda en UTC; la conversión vive sólo en retardos.a_local().'),
 ('jornada_umbral_horas', '48'::jsonb,
  'Horas EFECTIVAS por semana FTS (viernes a jueves). Referencia: 5 días de lunes a viernes a 9.6 h efectivas (9 h 36 min) más 30 min de comida diaria.'),
 ('jornada_comida_min', '30'::jsonb,
  'Minutos de comida que se descuentan a cada día laborado de lunes a viernes (día laborado = día con al menos una asistencia). Si Odoo ya descontó un descanso en esa asistencia, sólo se descuenta la diferencia.'),
 ('jornada_comida_fin_de_semana', '"desde_horas"'::jsonb,
  'Comida en sábado y domingo: siempre | desde_horas (sólo si el día suma al menos jornada_comida_fds_min_horas brutas) | nunca. RH lo está definiendo.'),
 ('jornada_comida_fds_min_horas', '6'::jsonb,
  'Horas brutas mínimas de un sábado o domingo para descontar comida cuando jornada_comida_fin_de_semana = desde_horas. Propuesta: 6.'),
 ('jornada_usar_calendario', 'true'::jsonb,
  'Si la jornada efectiva del calendario de la persona difiere de jornada_umbral_horas por más de jornada_tolerancia_calendario_h, se usa la del calendario y se marca en Calidad de datos para que RH la confirme.'),
 ('jornada_tolerancia_calendario_h', '0.5'::jsonb,
  'Diferencia máxima (horas por semana) entre la jornada del calendario y el umbral FTS para seguir usando el umbral FTS. Los calendarios de 50 h de presencia sin comida dan 47.5 efectivas: con 0.5 se quedan en 48.'),
 ('jornada_horas_max_asistencia', '16'::jsonb,
  'Una asistencia más larga que esto se trata como dato incompleto (olvido de salida o turno fantasma) y la semana va a Jornada por revisar.'),
 ('jornada_ventana_dias', '90'::jsonb,
  'Ventana móvil en días para contar los avisos de incumplimiento de jornada (1.º, 2.º y 3.º). RH la está definiendo. Propuesta: 90.'),
 ('jornada_plazo_correccion_dias', '3'::jsonb,
  'Días hábiles que tiene la persona, desde el aviso, para pedir a RH una corrección de sus horas.'),
 ('jornada_desde', '"2026-10-02"'::jsonb,
  'Viernes de la primera semana FTS que puede generar avisos de jornada. Las semanas anteriores se calculan (panel y simulación) pero no abren casos. Propuesta: 2-oct-2026, la primera semana completa después del arranque del 1-oct.'),
 ('jornada_envio', '"inmediato"'::jsonb,
  'Cuándo sale el aviso de jornada: inmediato (al corte del viernes 08:00) | lunes (el lunes siguiente a las 08:00, para dar tiempo a que RH capture la semana en Nómina).'),
 ('jornada_tipos_nomina_prorrateo', '["vacaciones","falta_justificada","incapacidad","permiso_con_goce","permiso_sin_goce","dia_cumpleanos","trabajo_usa","dia_festivo"]'::jsonb,
  'Tipos de Nómina · Incidencias (declaraciones de la semana) cuyos días se descuentan del umbral. Falta injustificada NO prorratea.'),
 ('jornada_tipo_nomina_descuento', '"tiempo_no_laborado"'::jsonb,
  'Tipo que debe aparecer en Nómina · Incidencias para dar por registrado un descuento de tiempo no laborado. Hoy ese tipo NO existe en el catálogo de Nómina: la verificación alertará hasta que se agregue.'),
 ('modo_medidas_jornada', '"retenidas"'::jsonb,
  'retenidas: RH registra su decisión y la evidencia, pero la medida NO se aplica ni se manda a Nómina hasta que Legal confirme el Reglamento y el procedimiento. habilitadas: la medida registrada se verifica contra Nómina. El sistema nunca cambia este valor.'),
 ('comunicado_destinatarios', '[]'::jsonb,
  'Lista de distribución para el comunicado general de arranque (por ejemplo, un grupo de toda la empresa). Vacío: sólo se prepara, no se encola.')
ON CONFLICT (clave) DO NOTHING;

-- Firmas del 3er aviso de jornada (misma lógica del lector que carta y acta).
UPDATE retardos.config SET valor = valor || '{"aviso_jornada_3":["trabajador","rh"]}'::jsonb
 WHERE clave = 'firmas_requeridas' AND NOT (valor ? 'aviso_jornada_3');

-- ══ 2. HORA DEL CENTRO Y DÍAS ════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.tz() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(retardos.cfg_txt('zona_horaria'), 'America/Monterrey')
$fn$;

-- ÚNICO lugar donde un instante UTC se vuelve hora local.
CREATE OR REPLACE FUNCTION retardos.a_local(p timestamptz) RETURNS timestamp
LANGUAGE sql STABLE AS $fn$
  SELECT p AT TIME ZONE retardos.tz()
$fn$;

-- Y su inverso: una hora local (de un día) a instante.
CREATE OR REPLACE FUNCTION retardos.de_local(p timestamp) RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$
  SELECT p AT TIME ZONE retardos.tz()
$fn$;

CREATE OR REPLACE FUNCTION retardos.hoy_local() RETURNS date
LANGUAGE sql STABLE AS $fn$
  SELECT retardos.a_local(now())::date
$fn$;

-- Segundos desde la medianoche local.
CREATE OR REPLACE FUNCTION retardos.seg_local(p timestamptz) RETURNS integer
LANGUAGE sql STABLE AS $fn$
  SELECT EXTRACT(EPOCH FROM (retardos.a_local(p) - date_trunc('day', retardos.a_local(p))))::integer
$fn$;

CREATE OR REPLACE FUNCTION retardos.hhmmss(p_seg integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_seg IS NULL THEN '' ELSE
    lpad((p_seg / 3600)::text, 2, '0') || ':' || lpad(((p_seg % 3600) / 60)::text, 2, '0') || ':' || lpad((p_seg % 60)::text, 2, '0') END
$fn$;

-- Horas decimales a "H:MM" (para correos y panel).
CREATE OR REPLACE FUNCTION retardos.horas_txt(p numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p IS NULL THEN '' ELSE
    (CASE WHEN p < 0 THEN '-' ELSE '' END) || floor(abs(p))::int::text || ':' ||
    lpad(round((abs(p) - floor(abs(p))) * 60)::int::text, 2, '0') END
$fn$;

-- Lunes a viernes SIEMPRE; dias_habiles sólo puede restringir.
CREATE OR REPLACE FUNCTION retardos.es_habil(p_fecha date) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT EXTRACT(ISODOW FROM p_fecha)::int <= 5
     AND EXTRACT(ISODOW FROM p_fecha)::int IN (SELECT jsonb_array_elements_text(coalesce(retardos.cfg('dias_habiles'), '[1,2,3,4,5]'::jsonb))::int)
$fn$;

-- ── Semana FTS: viernes a jueves, numeración de Nómina · Incidencias ──
CREATE OR REPLACE FUNCTION retardos.semana_desde(p date) RETURNS date
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT p - ((EXTRACT(ISODOW FROM p)::int - 5 + 7) % 7)
$fn$;

CREATE OR REPLACE FUNCTION retardos.semana_id(p_desde date) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT 'S' || (30 + ((p_desde + 6) - date '2026-07-23') / 7)::text || '/' || EXTRACT(YEAR FROM p_desde + 6)::int::text
$fn$;

CREATE OR REPLACE FUNCTION retardos.semana_de_id(p_id text) RETURNS date
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p_id ~ '^S[0-9]+/[0-9]{4}' AND char_length(split_part(p_id, '/', 2)) = 4
              THEN date '2026-07-23' + (split_part(substr(p_id, 2), '/', 1)::int - 30) * 7 - 6 END
$fn$;

-- Semana FTS que cerró más recientemente (el jueves que ya pasó).
CREATE OR REPLACE FUNCTION retardos.semana_cerrada() RETURNS date
LANGUAGE sql STABLE AS $fn$
  SELECT retardos.semana_desde(retardos.hoy_local()) - 7
$fn$;

-- ══ 3. FESTIVOS: días de descanso obligatorio art. 74 LFT (semilla, RH puede quitarlos) ══
INSERT INTO retardos.festivo (fecha, nombre, creado_por) VALUES
 ('2026-01-01', 'Año Nuevo (art. 74 LFT)', 'semilla_lft_art74'),
 ('2026-02-02', 'Día de la Constitución (art. 74 LFT)', 'semilla_lft_art74'),
 ('2026-03-16', 'Natalicio de Benito Juárez (art. 74 LFT)', 'semilla_lft_art74'),
 ('2026-05-01', 'Día del Trabajo (art. 74 LFT)', 'semilla_lft_art74'),
 ('2026-09-16', 'Día de la Independencia (art. 74 LFT)', 'semilla_lft_art74'),
 ('2026-11-16', 'Día de la Revolución (art. 74 LFT)', 'semilla_lft_art74'),
 ('2026-12-25', 'Navidad (art. 74 LFT)', 'semilla_lft_art74'),
 ('2027-01-01', 'Año Nuevo (art. 74 LFT)', 'semilla_lft_art74'),
 ('2027-02-01', 'Día de la Constitución (art. 74 LFT)', 'semilla_lft_art74'),
 ('2027-03-15', 'Natalicio de Benito Juárez (art. 74 LFT)', 'semilla_lft_art74'),
 ('2027-05-01', 'Día del Trabajo (art. 74 LFT)', 'semilla_lft_art74'),
 ('2027-09-16', 'Día de la Independencia (art. 74 LFT)', 'semilla_lft_art74'),
 ('2027-11-15', 'Día de la Revolución (art. 74 LFT)', 'semilla_lft_art74'),
 ('2027-12-25', 'Navidad (art. 74 LFT)', 'semilla_lft_art74')
ON CONFLICT (fecha) DO NOTHING;

-- ══ 4. ESPEJO DE ODOO: salida, horas, modo y calendario ═══════════════════════
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS check_out_utc timestamptz;
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS worked_hours numeric(8,4);
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS in_mode text;
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS out_mode text;
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS seg_local integer;
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS tag_disputa boolean NOT NULL DEFAULT false;
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS incidencia_pendiente boolean NOT NULL DEFAULT false;
ALTER TABLE retardos.checada ADD COLUMN IF NOT EXISTS con_salida_leida boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN retardos.checada.con_salida_leida IS 'true si la última lectura de Odoo ya traía check_out/worked_hours (lecturas anteriores a retardos_0007 sólo traían check_in).';
UPDATE retardos.checada SET seg_local = retardos.seg_local(check_in_utc) WHERE seg_local IS NULL;

ALTER TABLE retardos.retardo ADD COLUMN IF NOT EXISTS seg_local integer;

ALTER TABLE retardos.empleado ADD COLUMN IF NOT EXISTS calendario_id integer;
ALTER TABLE retardos.empleado ADD COLUMN IF NOT EXISTS calendario_nombre text;
ALTER TABLE retardos.empleado ADD COLUMN IF NOT EXISTS cal_horas_semana numeric(6,2);
ALTER TABLE retardos.empleado ADD COLUMN IF NOT EXISTS cal_dias integer[];
ALTER TABLE retardos.empleado ADD COLUMN IF NOT EXISTS cal_tiene_comida boolean;
COMMENT ON COLUMN retardos.empleado.cal_horas_semana IS 'Horas de presencia por semana del calendario de Odoo, sin contar renglones de comida.';

-- Se actualiza el calendario del padrón en cada ingesta (el payload trae empleados[].calendario).
CREATE OR REPLACE FUNCTION retardos.sincronizar_calendarios(p jsonb) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
  UPDATE retardos.empleado m SET
         calendario_id = nullif(x->'calendario'->>'id', '')::int,
         calendario_nombre = x->'calendario'->>'nombre',
         cal_horas_semana = nullif(x->'calendario'->>'horas_semana', '')::numeric,
         cal_dias = CASE WHEN x->'calendario'->'dias' IS NULL THEN NULL
                         ELSE ARRAY(SELECT jsonb_array_elements_text(x->'calendario'->'dias')::int) END,
         cal_tiene_comida = (x->'calendario'->>'tiene_comida')::boolean
    FROM jsonb_array_elements(coalesce(p->'empleados', '[]'::jsonb)) x
   WHERE m.employee_id = (x->>'employee_id')::int AND x ? 'calendario';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;

-- Jornada efectiva semanal que dice el calendario (presencia menos comida si el calendario no la trae).
CREATE OR REPLACE FUNCTION retardos.jornada_calendario(p_emp integer) RETURNS numeric
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN m.cal_horas_semana IS NULL THEN NULL
              WHEN coalesce(m.cal_tiene_comida, false) THEN m.cal_horas_semana
              ELSE m.cal_horas_semana - coalesce(cardinality(m.cal_dias), 5) * coalesce(retardos.cfg_txt('jornada_comida_min')::numeric, 30) / 60.0 END
    FROM retardos.empleado m WHERE m.employee_id = p_emp
$fn$;

-- Umbral semanal de la persona y de dónde sale.
CREATE OR REPLACE FUNCTION retardos.jornada_umbral_persona(p_emp integer) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH b AS (
    SELECT coalesce(retardos.cfg_txt('jornada_umbral_horas')::numeric, 48) AS base,
           retardos.jornada_calendario(p_emp) AS cal,
           coalesce(retardos.cfg_txt('jornada_usar_calendario'), 'true') = 'true' AS usar,
           coalesce(retardos.cfg_txt('jornada_tolerancia_calendario_h')::numeric, 0.5) AS tol)
  SELECT CASE WHEN b.usar AND b.cal IS NOT NULL AND abs(b.cal - b.base) > b.tol
              THEN jsonb_build_object('umbral', round(b.cal, 2), 'fuente', 'calendario', 'calendario', round(b.cal, 2), 'base', b.base)
              ELSE jsonb_build_object('umbral', b.base, 'fuente', 'fts', 'calendario', round(b.cal, 2), 'base', b.base) END
    FROM b
$fn$;

-- ══ 5. INGESTA: retardo al segundo, lunes a viernes ══════════════════════════
CREATE OR REPLACE FUNCTION retardos.ingestar_base(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_corrida bigint; v_desde date := (p->>'desde')::date; v_hasta date := (p->>'hasta')::date;
  v_tol integer := coalesce(retardos.cfg_txt('tolerancia_min')::int, 15);
  v_fuente text := coalesce(retardos.cfg_txt('hora_fuente'), 'hora_entrada');
  v_contar date := coalesce(retardos.cfg_txt('contar_desde')::date, '2000-01-01');
  v_reinc integer := coalesce(retardos.cfg_txt('reincidencia_dias')::int, 30);
  v_emp_ok integer[] := ARRAY(SELECT jsonb_array_elements_text(retardos.cfg('empresa_ids'))::int);
  r record; v_n_chec integer := 0; v_nuevos integer := 0; v_contados integer := 0; v_excl integer := 0;
  v_anul integer := 0; v_sinhora integer := 0; v_casos text[] := '{}'; v_id bigint; v_estado text; v_motivo text;
  v_esperada numeric; v_esp_seg integer; v_min integer; L smallint; E smallint; v_alta boolean;
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
  PERFORM retardos.sincronizar_calendarios(p);

  -- 2) checadas crudas (entrada, salida, horas, modo). La hora local sale de a_local().
  WITH src AS (
    SELECT (x->>'attendance_id')::int AS att, (x->>'employee_id')::int AS emp,
           (x->>'check_in_utc')::timestamptz AS ci, nullif(x->>'check_out_utc', '')::timestamptz AS co,
           nullif(x->>'worked_hours', '')::numeric AS wh, x->>'in_mode' AS im, x->>'out_mode' AS om,
           x ? 'check_out_utc' AS con_salida,
           coalesce((x->>'disputa')::boolean, false) AS tag,
           coalesce(x->>'incidencia_pendiente', '') <> '' OR coalesce((x->>'incidencia_abierta')::boolean, false) AS incp
      FROM jsonb_array_elements(coalesce(p->'checadas', '[]'::jsonb)) x
     WHERE x->>'employee_id' IS NOT NULL)
  INSERT INTO retardos.checada AS t (attendance_id, employee_id, fecha, hora_local, seg_local, check_in_utc, check_out_utc,
                                     worked_hours, in_mode, out_mode, tag_disputa, incidencia_pendiente, disputa,
                                     olvido_entrada, con_salida_leida)
  SELECT att, emp, retardos.a_local(ci)::date, retardos.seg_local(ci) / 3600.0, retardos.seg_local(ci), ci, co, wh, im, om,
         tag, incp, tag OR incp,
         att IN (SELECT jsonb_array_elements_text(coalesce(p->'olvido_entrada_att', '[]'::jsonb))::int),
         con_salida
    FROM src
  ON CONFLICT (attendance_id) DO UPDATE SET employee_id = EXCLUDED.employee_id, fecha = EXCLUDED.fecha,
     hora_local = EXCLUDED.hora_local, seg_local = EXCLUDED.seg_local, check_in_utc = EXCLUDED.check_in_utc,
     check_out_utc = CASE WHEN EXCLUDED.con_salida_leida THEN EXCLUDED.check_out_utc ELSE t.check_out_utc END,
     worked_hours = CASE WHEN EXCLUDED.con_salida_leida THEN EXCLUDED.worked_hours ELSE t.worked_hours END,
     in_mode = coalesce(EXCLUDED.in_mode, t.in_mode), out_mode = CASE WHEN EXCLUDED.con_salida_leida THEN EXCLUDED.out_mode ELSE t.out_mode END,
     tag_disputa = EXCLUDED.tag_disputa, incidencia_pendiente = EXCLUDED.incidencia_pendiente,
     disputa = EXCLUDED.disputa, olvido_entrada = EXCLUDED.olvido_entrada,
     con_salida_leida = t.con_salida_leida OR EXCLUDED.con_salida_leida, visto_at = now();
  GET DIAGNOSTICS v_n_chec = ROW_COUNT;

  -- 3) primera checada por persona y día → retardo o no. Al segundo.
  FOR r IN
    SELECT DISTINCT ON (c.employee_id, c.fecha) c.*, m.hora_entrada, m.hora_calendario, m.company_id
      FROM retardos.checada c
      JOIN retardos.empleado m ON m.employee_id = c.employee_id
     WHERE c.fecha BETWEEN v_desde AND v_hasta
       AND m.company_id = ANY (v_emp_ok)
     ORDER BY c.employee_id, c.fecha, c.seg_local, c.attendance_id
  LOOP
    -- Sábado y domingo: nunca hay retardo (sus horas cuentan para la jornada semanal).
    IF NOT retardos.es_habil(r.fecha) THEN
      UPDATE retardos.retardo SET estado = 'anulado', motivo = 'fin de semana: nunca es retardo', actualizado_at = now()
       WHERE employee_id = r.employee_id AND fecha = r.fecha AND estado <> 'anulado';
      CONTINUE;
    END IF;
    v_esperada := CASE WHEN v_fuente = 'calendario' THEN r.hora_calendario ELSE r.hora_entrada END;
    IF v_esperada IS NULL OR v_esperada <= 0 THEN v_sinhora := v_sinhora + 1; CONTINUE; END IF;
    v_esp_seg := (round(v_esperada * 60) * 60)::int;
    v_min := floor((r.seg_local - v_esp_seg) / 60.0)::int;

    IF r.seg_local <= v_esp_seg + v_tol * 60 THEN
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

    INSERT INTO retardos.retardo AS t (employee_id, fecha, attendance_id, hora_local, seg_local, hora_esperada, tolerancia_min,
                                       minutos_tarde, estado, motivo, periodo, corrida_id)
    VALUES (r.employee_id, r.fecha, r.attendance_id, r.hora_local, r.seg_local, v_esperada, v_tol, v_min, v_estado, v_motivo,
            to_char(r.fecha, 'YYYY-MM'), v_corrida)
    ON CONFLICT (employee_id, fecha) DO UPDATE
       SET attendance_id = EXCLUDED.attendance_id, hora_local = EXCLUDED.hora_local, seg_local = EXCLUDED.seg_local,
           hora_esperada = EXCLUDED.hora_esperada, tolerancia_min = EXCLUDED.tolerancia_min, minutos_tarde = EXCLUDED.minutos_tarde,
           estado = EXCLUDED.estado, motivo = EXCLUDED.motivo, actualizado_at = now()
     WHERE (t.estado, coalesce(t.motivo, ''), t.attendance_id, t.tolerancia_min, coalesce(t.seg_local, -1))
           IS DISTINCT FROM (EXCLUDED.estado, coalesce(EXCLUDED.motivo, ''), EXCLUDED.attendance_id, EXCLUDED.tolerancia_min, EXCLUDED.seg_local)
    RETURNING (xmax = 0) INTO v_alta;
    IF FOUND THEN
      IF v_alta THEN v_nuevos := v_nuevos + 1; END IF;
      IF v_estado = 'contado' THEN v_contados := v_contados + 1; ELSE v_excl := v_excl + 1; END IF;
    END IF;
    v_alta := NULL;
  END LOOP;

  -- 4) escalera por umbral (sólo casos de retardo)
  FOR r IN
    SELECT employee_id, periodo, count(*) AS n FROM retardos.retardo
     WHERE estado = 'contado' AND fecha BETWEEN v_desde AND v_hasta
     GROUP BY employee_id, periodo
  LOOP
    SELECT max(nivel) INTO L FROM retardos.escalera WHERE activo AND umbral <= r.n;
    SELECT max(nivel) INTO E FROM retardos.caso WHERE employee_id = r.employee_id AND periodo = r.periodo AND tipo = 'retardo';
    IF L IS NOT NULL AND (E IS NULL OR L > E) THEN
      v_id := retardos.abrir_caso(r.employee_id, r.periodo, L, 'umbral', v_corrida);
      IF v_id IS NOT NULL THEN v_casos := v_casos || (SELECT folio FROM retardos.caso WHERE id = v_id); END IF;
    END IF;
  END LOOP;

  -- 5) reincidencia (sólo casos de retardo)
  FOR r IN
    SELECT DISTINCT ON (c.employee_id) c.employee_id, c.nivel, c.validado_at, x.periodo
      FROM retardos.caso c
      JOIN retardos.retardo x ON x.employee_id = c.employee_id AND x.estado = 'contado'
       AND x.fecha > retardos.a_local(c.validado_at)::date
       AND x.fecha <= retardos.a_local(c.validado_at)::date + v_reinc
       AND x.fecha BETWEEN v_desde AND v_hasta
     WHERE c.tipo = 'retardo' AND c.requiere_firma AND c.validado_at IS NOT NULL
       AND c.estado IN ('VALIDADO_RH','ACCION_PROGRAMADA','ACCION_VERIFICADA','CERRADO')
     ORDER BY c.employee_id, c.nivel DESC, x.fecha
  LOOP
    SELECT min(nivel) INTO L FROM retardos.escalera WHERE activo AND nivel > r.nivel;
    IF L IS NOT NULL AND NOT EXISTS (SELECT 1 FROM retardos.caso WHERE employee_id = r.employee_id AND tipo = 'retardo'
                                     AND nivel >= L AND abierto_at >= r.validado_at) THEN
      v_id := retardos.abrir_caso(r.employee_id, r.periodo, L, 'reincidencia', v_corrida);
      IF v_id IS NOT NULL THEN v_casos := v_casos || (SELECT folio FROM retardos.caso WHERE id = v_id); END IF;
    END IF;
  END LOOP;

  UPDATE retardos.corrida SET terminada_at = now(), ok = true,
         resumen = resumen || jsonb_build_object('checadas', v_n_chec, 'retardos_nuevos', v_nuevos,
           'contados', v_contados, 'excluidos', v_excl, 'anulados', v_anul, 'sin_hora', v_sinhora,
           'tolerancia_min', v_tol, 'casos_nuevos', to_jsonb(v_casos))
   WHERE id = v_corrida;
  RETURN (SELECT resumen || jsonb_build_object('corrida_id', id, 'leidos', leidos) FROM retardos.corrida WHERE id = v_corrida);
END
$fn$;

-- La primera checada ordenada al segundo.
CREATE OR REPLACE VIEW retardos.v_primera_checada AS
SELECT DISTINCT ON (c.employee_id, c.fecha)
       c.employee_id, c.fecha, c.hora_local, c.attendance_id, c.disputa, c.olvido_entrada
  FROM retardos.checada c
 ORDER BY c.employee_id, c.fecha, c.seg_local, c.attendance_id;

-- ══ 6. CASOS DE JORNADA EN LA MISMA TABLA ════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.escalera_jornada (
  nivel            smallint PRIMARY KEY CHECK (nivel BETWEEN 1 AND 3),
  accion           text     NOT NULL UNIQUE,
  nombre           text     NOT NULL,
  requiere_firma   boolean  NOT NULL,
  propone_medida   boolean  NOT NULL DEFAULT false,
  confirmado       boolean  NOT NULL DEFAULT false,
  activo           boolean  NOT NULL DEFAULT true,
  nota             text
);
INSERT INTO retardos.escalera_jornada (nivel, accion, nombre, requiere_firma, propone_medida, nota) VALUES
 (1, 'aviso_jornada_1', 'Primer aviso de jornada incompleta', false, false, 'Correo a la persona con copia a RH y al jefe.'),
 (2, 'aviso_jornada_2', 'Segundo aviso de jornada incompleta', false, false, 'Correo a la persona con copia a RH y al jefe.'),
 (3, 'aviso_jornada_3', 'Tercer aviso de jornada incompleta', true, true, 'Aviso más firme con hoja con QR que RH imprime y recolecta. Abre una propuesta de medida para RH, que queda retenida.')
ON CONFLICT (nivel) DO NOTHING;

ALTER TABLE retardos.caso ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'retardo';
ALTER TABLE retardos.caso DROP CONSTRAINT IF EXISTS caso_tipo_check;
ALTER TABLE retardos.caso ADD CONSTRAINT caso_tipo_check CHECK (tipo IN ('retardo','jornada'));
ALTER TABLE retardos.caso DROP CONSTRAINT IF EXISTS caso_folio_check;
ALTER TABLE retardos.caso ADD CONSTRAINT caso_folio_check CHECK (char_length(folio) = 13 AND folio ~ '^(RET|JOR)-[0-9]{4}-[0-9]{4}'
                                                                 AND (tipo = 'jornada') = (folio LIKE 'JOR-%'));
ALTER TABLE retardos.caso DROP CONSTRAINT IF EXISTS caso_motivo_apertura_check;
ALTER TABLE retardos.caso ADD CONSTRAINT caso_motivo_apertura_check CHECK (motivo_apertura IN ('umbral','reincidencia','jornada'));
ALTER TABLE retardos.caso DROP CONSTRAINT IF EXISTS caso_nivel_fkey;
CREATE UNIQUE INDEX IF NOT EXISTS caso_jornada_semana ON retardos.caso (employee_id, periodo) WHERE tipo = 'jornada';

-- El nivel se valida contra la escalera de su tipo (reemplaza la llave foránea).
CREATE OR REPLACE FUNCTION retardos.caso_nivel_valido() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.tipo = 'retardo' AND NOT EXISTS (SELECT 1 FROM retardos.escalera WHERE nivel = NEW.nivel) THEN
    RAISE EXCEPTION 'NIVEL_INVALIDO retardo %', NEW.nivel;
  END IF;
  IF NEW.tipo = 'jornada' AND NOT EXISTS (SELECT 1 FROM retardos.escalera_jornada WHERE nivel = NEW.nivel) THEN
    RAISE EXCEPTION 'NIVEL_INVALIDO jornada %', NEW.nivel;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS caso_nivel_valido ON retardos.caso;
CREATE TRIGGER caso_nivel_valido BEFORE INSERT OR UPDATE OF nivel, tipo ON retardos.caso
  FOR EACH ROW EXECUTE FUNCTION retardos.caso_nivel_valido();

CREATE TABLE IF NOT EXISTS retardos.folio_seq_jornada (
  anio   integer PRIMARY KEY,
  ultimo integer NOT NULL DEFAULT 0
);
CREATE OR REPLACE FUNCTION retardos.nuevo_folio_jornada(p_fecha date) RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE a integer := EXTRACT(YEAR FROM p_fecha)::int; n integer;
BEGIN
  INSERT INTO retardos.folio_seq_jornada (anio, ultimo) VALUES (a, 1)
  ON CONFLICT (anio) DO UPDATE SET ultimo = retardos.folio_seq_jornada.ultimo + 1
  RETURNING ultimo INTO n;
  RETURN 'JOR-' || a || '-' || lpad(n::text, 4, '0');
END
$fn$;

-- Outbox: hoja del 3er aviso, comunicado y envío diferido.
ALTER TABLE retardos.envio DROP CONSTRAINT IF EXISTS envio_pdf_check;
ALTER TABLE retardos.envio ADD CONSTRAINT envio_pdf_check CHECK (pdf IS NULL OR pdf IN ('aviso','carta_compromiso','acta','suspension','aviso_jornada_3'));
ALTER TABLE retardos.envio DROP CONSTRAINT IF EXISTS envio_tipo_check;
ALTER TABLE retardos.envio ADD CONSTRAINT envio_tipo_check CHECK (tipo IN (
  'notificacion','recordatorio','escalamiento','pide_hoja','aviso_rh','revision_rh','ruta_supervisor',
  'resumen','alerta','odoo_nota','aviso_trabajador','alerta_modo','comunicado'));
ALTER TABLE retardos.envio ADD COLUMN IF NOT EXISTS no_antes_de timestamptz;
COMMENT ON COLUMN retardos.envio.no_antes_de IS 'Si tiene valor, el correo no sale antes de ese instante (jornada_envio = lunes).';

-- Plantillas: estado del texto.
ALTER TABLE retardos.plantilla ADD COLUMN IF NOT EXISTS estado_texto text NOT NULL DEFAULT 'pendiente_validacion_rh';
ALTER TABLE retardos.plantilla DROP CONSTRAINT IF EXISTS plantilla_estado_texto_check;
ALTER TABLE retardos.plantilla ADD CONSTRAINT plantilla_estado_texto_check CHECK (estado_texto IN ('pendiente_validacion_rh','validado_rh'));
ALTER TABLE retardos.plantilla ADD COLUMN IF NOT EXISTS variables text;
COMMENT ON COLUMN retardos.plantilla.estado_texto IS 'pendiente_validacion_rh: texto base de sistemas, RH no lo ha validado. Se reemplaza con el procedimiento de docs/retardos/PLANTILLAS.md.';

-- ══ 7. SEMANAS DE JORNADA Y MEDIDAS ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.jornada_semana (
  id                 bigserial   PRIMARY KEY,
  employee_id        integer     NOT NULL,
  semana             text        NOT NULL,
  desde              date        NOT NULL,
  hasta              date        NOT NULL,
  horas_brutas       numeric(7,2) NOT NULL DEFAULT 0,
  comida_h           numeric(7,2) NOT NULL DEFAULT 0,
  horas_efectivas    numeric(7,2) NOT NULL DEFAULT 0,
  umbral_persona     numeric(7,2) NOT NULL,
  umbral_fuente      text        NOT NULL,
  dias_prorrateo     numeric(4,1) NOT NULL DEFAULT 0,
  umbral             numeric(7,2) NOT NULL,
  faltante           numeric(7,2) NOT NULL DEFAULT 0,
  estado             text        NOT NULL CHECK (estado IN ('cumple','incumple','revisar','exento','no_aplica')),
  motivos_revision   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  desglose           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  prorrateo          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  horas_corregidas   numeric(7,2),
  revisado_por       text,
  revisado_at        timestamptz,
  revision_nota      text,
  caso_id            bigint      REFERENCES retardos.caso(id),
  corrida_id         bigint      REFERENCES retardos.corrida(id),
  calculado_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, semana)
);
CREATE INDEX IF NOT EXISTS jornada_semana_estado ON retardos.jornada_semana (semana, estado);
COMMENT ON TABLE retardos.jornada_semana IS 'Una fila por persona y semana FTS. Si RH ya la revisó o ya abrió caso, un nuevo corte no la recalcula.';

CREATE TABLE IF NOT EXISTS retardos.medida (
  id                 bigserial   PRIMARY KEY,
  caso_id            bigint      NOT NULL REFERENCES retardos.caso(id),
  employee_id        integer     NOT NULL,
  semana             text        NOT NULL,
  propuesta          text        NOT NULL DEFAULT 'descuento_tiempo_no_laborado',
  horas_propuestas   numeric(7,2) NOT NULL,
  estado             text        NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta','retenida','por_aplicar','verificada','descartada')),
  decision           jsonb,
  decidido_por       text,
  decidido_at        timestamptz,
  evidencia_id       bigint      REFERENCES retardos.evidencia(id),
  verificada_at      timestamptz,
  creado_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caso_id)
);
COMMENT ON TABLE retardos.medida IS 'Propuesta de medida del 3er aviso de jornada. Nunca se aplica sola: RH decide y registra; con modo_medidas_jornada = retenidas queda retenida.';

-- ══ 8. CÁLCULO DE UNA SEMANA (puro: no escribe) ═══════════════════════════════
-- p_nom = [{tipo, dias}] declaraciones de Nómina · Incidencias de esa persona y semana.
CREATE OR REPLACE FUNCTION retardos.jornada_calcular(p_emp integer, p_desde date, p_nom jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_ini timestamptz := retardos.de_local(p_desde::timestamp);
  v_fin timestamptz := retardos.de_local((p_desde + 7)::timestamp);
  v_comida numeric := coalesce(retardos.cfg_txt('jornada_comida_min')::numeric, 30) / 60.0;
  v_fds text := coalesce(retardos.cfg_txt('jornada_comida_fin_de_semana'), 'desde_horas');
  v_fds_min numeric := coalesce(retardos.cfg_txt('jornada_comida_fds_min_horas')::numeric, 6);
  v_max numeric := coalesce(retardos.cfg_txt('jornada_horas_max_asistencia')::numeric, 16);
  v_tipos jsonb := coalesce(retardos.cfg('jornada_tipos_nomina_prorrateo'), '[]'::jsonb);
  v_u jsonb := retardos.jornada_umbral_persona(p_emp);
  v_up numeric := (v_u->>'umbral')::numeric;
  d date; v_dias jsonb := '[]'::jsonb; v_mot jsonb := '[]'::jsonb; a record;
  v_b numeric; v_desc numeric; v_com numeric; v_ef numeric; v_lab boolean; v_flags jsonb; v_pr text;
  t_b numeric := 0; t_com numeric := 0; t_ef numeric := 0; n_fecha integer := 0; n_nom numeric := 0; n_fest integer := 0;
  n_asist integer := 0; v_exento boolean := false; v_nom_fest numeric := 0; v_prorr numeric; v_umbral numeric; v_estado text;
BEGIN
  -- Exento toda la semana: exclusión 'no_aplica' que cubre de viernes a jueves.
  v_exento := EXISTS (SELECT 1 FROM retardos.exclusion x WHERE x.activo AND x.employee_id = p_emp AND x.tipo = 'no_aplica'
                        AND x.desde <= p_desde AND x.hasta >= p_desde + 6);

  FOR i IN 0..6 LOOP
    d := p_desde + i;
    v_b := 0; v_desc := 0; v_flags := '[]'::jsonb; v_pr := NULL;
    -- Asistencias que EMPIEZAN este día local (una que cruza el corte del jueves se parte en el corte).
    FOR a IN
      SELECT c.*, greatest(c.check_in_utc, v_ini) AS pi,
             CASE WHEN c.check_out_utc IS NULL THEN NULL ELSE least(c.check_out_utc, v_fin) END AS po
        FROM retardos.checada c
       WHERE c.employee_id = p_emp
         AND c.check_in_utc < v_fin AND coalesce(c.check_out_utc, c.check_in_utc) >= v_ini
         AND retardos.a_local(greatest(c.check_in_utc, v_ini))::date = d
    LOOP
      n_asist := n_asist + 1;
      IF NOT a.con_salida_leida THEN
        v_flags := v_flags || '"salida_no_leida"'::jsonb;
      ELSIF a.check_out_utc IS NULL THEN
        v_flags := v_flags || '"sin_salida"'::jsonb;
      ELSE
        IF EXTRACT(EPOCH FROM (a.check_out_utc - a.check_in_utc)) / 3600.0 > v_max THEN
          v_flags := v_flags || '"asistencia_mas_de_max"'::jsonb;
        END IF;
        v_b := v_b + EXTRACT(EPOCH FROM (a.po - a.pi)) / 3600.0;
        -- Descanso que Odoo ya descontó (worked_hours menor a la duración), proporcional a la parte de esta semana.
        IF a.worked_hours IS NOT NULL AND a.check_out_utc > a.check_in_utc THEN
          v_desc := v_desc + greatest(EXTRACT(EPOCH FROM (a.check_out_utc - a.check_in_utc)) / 3600.0 - a.worked_hours, 0)
                    * (EXTRACT(EPOCH FROM (a.po - a.pi)) / EXTRACT(EPOCH FROM (a.check_out_utc - a.check_in_utc)));
        END IF;
      END IF;
      IF a.incidencia_pendiente THEN v_flags := v_flags || '"incidencia_pendiente"'::jsonb; END IF;
      IF a.tag_disputa AND NOT a.incidencia_pendiente THEN v_pr := 'horario_en_disputa'; END IF;
    END LOOP;
    v_lab := EXTRACT(ISODOW FROM d)::int <= 5;
    -- Comida del día laborado.
    v_com := 0;
    IF v_b > 0 THEN
      IF v_lab OR v_fds = 'siempre' OR (v_fds = 'desde_horas' AND v_b >= v_fds_min) THEN v_com := v_comida; END IF;
    END IF;
    v_com := greatest(least(greatest(v_com - v_desc, 0), v_b - v_desc), 0);
    v_ef := greatest(v_b - v_desc - v_com, 0);
    -- Prorrateo con fecha (sólo lunes a viernes).
    IF v_lab THEN
      IF EXISTS (SELECT 1 FROM retardos.festivo f WHERE f.fecha = d) THEN v_pr := 'festivo'; n_fest := n_fest + 1;
      ELSIF v_pr IS NULL THEN
        SELECT 'exclusion:' || x.tipo INTO v_pr FROM retardos.exclusion x
         WHERE x.activo AND x.employee_id = p_emp AND d BETWEEN x.desde AND x.hasta LIMIT 1;
      END IF;
      IF v_pr IS NOT NULL THEN n_fecha := n_fecha + 1; END IF;
    ELSE
      v_pr := NULL;
    END IF;
    -- Un día en disputa o cubierto no suma horas (se prorratea el umbral en su lugar).
    IF v_pr IS NOT NULL THEN v_ef := 0; END IF;
    IF jsonb_array_length(v_flags) > 0 THEN
      v_mot := v_mot || jsonb_build_object('fecha', d, 'motivos', v_flags);
    END IF;
    t_b := t_b + v_b; t_com := t_com + v_desc + v_com; t_ef := t_ef + v_ef;
    v_dias := v_dias || jsonb_build_object('fecha', d, 'dow', EXTRACT(ISODOW FROM d)::int, 'laborable', v_lab,
      'brutas', round(v_b, 2), 'comida', round(v_desc + v_com, 2), 'efectivas', round(v_ef, 2),
      'prorrateo', v_pr, 'motivos', v_flags);
  END LOOP;

  -- Días declarados en Nómina (sin fecha): se suman a los que sí traen fecha, con tope de 5.
  SELECT coalesce(sum(nullif(x->>'dias', '')::numeric) FILTER (WHERE v_tipos ? (x->>'tipo') AND x->>'tipo' <> 'dia_festivo'), 0),
         coalesce(sum(nullif(x->>'dias', '')::numeric) FILTER (WHERE x->>'tipo' = 'dia_festivo'), 0)
    INTO n_nom, v_nom_fest
    FROM jsonb_array_elements(coalesce(p_nom, '[]'::jsonb)) x;
  -- Un día festivo declarado en Nómina no se cuenta dos veces si ya está en retardos.festivo.
  IF v_tipos ? 'dia_festivo' THEN n_nom := n_nom + greatest(v_nom_fest - n_fest, 0); END IF;
  v_prorr := least(5, n_fecha + n_nom);
  v_umbral := round(v_up * (5 - v_prorr) / 5.0, 2);

  IF v_exento THEN v_estado := 'exento';
  ELSIF jsonb_array_length(v_mot) > 0 THEN v_estado := 'revisar';
  ELSIF n_asist = 0 AND v_umbral > 0 THEN
    v_estado := 'revisar'; v_mot := v_mot || jsonb_build_object('fecha', NULL, 'motivos', '["sin_asistencias"]'::jsonb);
  ELSIF round(t_ef, 4) >= v_umbral THEN v_estado := 'cumple';
  ELSE v_estado := 'incumple';
  END IF;

  RETURN jsonb_build_object(
    'employee_id', p_emp, 'semana', retardos.semana_id(p_desde), 'desde', p_desde, 'hasta', p_desde + 6,
    'horas_brutas', round(t_b, 2), 'comida_h', round(t_com, 2), 'horas_efectivas', round(t_ef, 2),
    'horas_efectivas_exactas', round(t_ef, 4),
    'umbral_persona', v_up, 'umbral_fuente', v_u->>'fuente', 'umbral_calendario', v_u->'calendario',
    'dias_prorrateo', v_prorr, 'umbral', v_umbral,
    'faltante', CASE WHEN v_estado IN ('incumple','revisar') THEN round(greatest(v_umbral - t_ef, 0), 2) ELSE 0 END,
    'estado', v_estado, 'motivos_revision', v_mot, 'desglose', v_dias,
    'prorrateo', jsonb_build_object('dias_con_fecha', n_fecha, 'dias_nomina', n_nom, 'festivos', n_fest),
    'asistencias', n_asist);
END
$fn$;

-- ══ 9. CASO DE JORNADA ═══════════════════════════════════════════════════════
-- Número de aviso: 1 + avisos de jornada previos dentro de la ventana móvil, tope 3.
CREATE OR REPLACE FUNCTION retardos.jornada_nivel(p_emp integer, p_desde date) RETURNS smallint
LANGUAGE sql STABLE AS $fn$
  SELECT least(3, 1 + count(*))::smallint
    FROM retardos.caso c
   WHERE c.tipo = 'jornada' AND c.employee_id = p_emp AND c.estado <> 'CANCELADO_POR_RH'
     AND retardos.semana_de_id(c.periodo) < p_desde
     AND retardos.semana_de_id(c.periodo) >= p_desde - coalesce(retardos.cfg_txt('jornada_ventana_dias')::int, 90)
$fn$;

CREATE OR REPLACE FUNCTION retardos.no_antes_de_jornada() RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN coalesce(retardos.cfg_txt('jornada_envio'), 'inmediato') = 'lunes'
              THEN retardos.de_local((retardos.hoy_local() + ((8 - EXTRACT(ISODOW FROM retardos.hoy_local())::int) % 7
                                       + CASE WHEN EXTRACT(ISODOW FROM retardos.hoy_local())::int = 1 THEN 7 ELSE 0 END))::timestamp
                                     + time '08:00')
              ELSE NULL END
$fn$;

CREATE OR REPLACE FUNCTION retardos.abrir_caso_jornada(p_js bigint, p_corrida bigint) RETURNS bigint
LANGUAGE plpgsql AS $fn$
DECLARE s retardos.jornada_semana; e retardos.escalera_jornada; v_nivel smallint; v_id bigint; v_folio text;
        v_rh jsonb := retardos.rh_para(); v_jefe jsonb; v_dest jsonb; v_env bigint; v_nad timestamptz := retardos.no_antes_de_jornada();
        v_extra jsonb;
BEGIN
  SELECT * INTO s FROM retardos.jornada_semana WHERE id = p_js FOR UPDATE;
  IF s.caso_id IS NOT NULL THEN RETURN NULL; END IF;
  v_nivel := retardos.jornada_nivel(s.employee_id, s.desde);
  SELECT * INTO e FROM retardos.escalera_jornada WHERE nivel = v_nivel;
  v_folio := retardos.nuevo_folio_jornada(retardos.hoy_local());
  INSERT INTO retardos.caso (folio, tipo, employee_id, periodo, nivel, accion, motivo_apertura, estado, requiere_firma,
                             retardos_n, modo_al_abrir)
  VALUES (v_folio, 'jornada', s.employee_id, s.semana, v_nivel, e.accion, 'jornada', 'DETECTADO', e.requiere_firma, 0,
          retardos.cfg_txt('modo'))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  UPDATE retardos.jornada_semana SET caso_id = v_id WHERE id = s.id;
  PERFORM retardos.log(v_id, 'apertura', 'sistema',
    'Aviso ' || v_nivel || ' de jornada: ' || retardos.horas_txt(coalesce(s.horas_corregidas, s.horas_efectivas)) || ' h efectivas contra '
      || retardos.horas_txt(s.umbral) || ' h en la semana ' || s.semana,
    jsonb_build_object('corrida_id', p_corrida, 'jornada_semana_id', s.id, 'faltante', s.faltante), NULL, 'DETECTADO');

  v_jefe := coalesce(retardos.jefe_de(s.employee_id), '[]'::jsonb);
  v_dest := retardos.destinatarios(s.employee_id);
  v_extra := jsonb_build_object('plazo_correccion',
    to_char(retardos.a_local(retardos.sumar_habiles(coalesce(v_nad, now()), coalesce(retardos.cfg_txt('jornada_plazo_correccion_dias')::int, 3))), 'DD/MM/YYYY'));
  IF jsonb_array_length(v_dest) = 0 THEN
    UPDATE retardos.caso SET ruta = 'supervisor' WHERE id = v_id;
    PERFORM retardos.log(v_id, 'sin_correo', 'sistema', 'La persona no tiene correo utilizable: el aviso va a su jefe y a RH',
                         jsonb_build_object('correos', retardos.correos_de(s.employee_id)));
  END IF;

  IF NOT e.requiere_firma THEN
    IF jsonb_array_length(v_dest) > 0 THEN
      v_env := retardos.encolar_plantilla(v_id, 'jornada_aviso', 'notificacion', v_folio || ':notificacion',
                                          retardos.solo_emails(v_dest), retardos.unicos(v_rh || v_jefe), NULL, v_extra);
      UPDATE retardos.envio SET destinatarios_origen = v_dest, no_antes_de = v_nad WHERE id = v_env;
    ELSE
      v_env := retardos.encolar_plantilla(v_id, 'jornada_sin_correo', 'ruta_supervisor', v_folio || ':ruta_supervisor',
        CASE WHEN jsonb_array_length(v_jefe) > 0 THEN v_jefe ELSE v_rh END, v_rh, NULL, v_extra);
      UPDATE retardos.envio SET no_antes_de = v_nad WHERE id = v_env;
    END IF;
    RETURN v_id;
  END IF;

  -- 3er aviso: hoja con QR a RH (con copia al jefe), que la imprime y recolecta; aviso firme a la persona.
  v_env := retardos.encolar_plantilla(v_id, 'jornada_rh_recolectar', 'notificacion', v_folio || ':notificacion',
    v_rh, v_jefe, 'aviso_jornada_3',
    v_extra || jsonb_build_object('vence_rh', to_char(retardos.a_local(retardos.sumar_habiles(coalesce(v_nad, now()),
                                           coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3))), 'DD/MM/YYYY'),
                       'correo_trabajador', coalesce((SELECT string_agg(x->>'email', ', ') FROM jsonb_array_elements(v_dest) x),
                                                     'sin correo utilizable (entrega sólo en persona)')));
  UPDATE retardos.envio SET no_antes_de = v_nad WHERE id = v_env;
  IF jsonb_array_length(v_dest) > 0 THEN
    v_env := retardos.encolar_plantilla(v_id, 'jornada_aviso_3', 'aviso_trabajador', v_folio || ':aviso_trabajador',
                                        retardos.solo_emails(v_dest), '[]'::jsonb, 'aviso_jornada_3', v_extra);
    UPDATE retardos.envio SET destinatarios_origen = v_dest, no_antes_de = v_nad WHERE id = v_env;
  END IF;
  IF e.propone_medida THEN
    INSERT INTO retardos.medida (caso_id, employee_id, semana, horas_propuestas)
    VALUES (v_id, s.employee_id, s.semana, s.faltante)
    ON CONFLICT (caso_id) DO NOTHING;
    PERFORM retardos.log(v_id, 'medida_propuesta', 'sistema',
      'Propuesta para RH: descuento de ' || retardos.horas_txt(s.faltante) || ' h de tiempo no laborado u otra medida. '
      || 'Queda retenida hasta que Legal confirme (modo_medidas_jornada = ' || coalesce(retardos.cfg_txt('modo_medidas_jornada'), 'retenidas') || ').',
      jsonb_build_object('horas', s.faltante));
  END IF;
  RETURN v_id;
END
$fn$;

-- ══ 10. CORTE SEMANAL (viernes 08:00) ════════════════════════════════════════
-- p = { desde?: viernes de la semana (por omisión la que cerró el jueves), nomina: [{employee_id, semana, declaraciones}], workflow }
CREATE OR REPLACE FUNCTION retardos.jornada_corte(p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_desde date := coalesce(retardos.semana_desde(nullif(p->>'desde', '')::date), retardos.semana_cerrada());
  v_sem text := retardos.semana_id(v_desde);
  v_avisos_desde date := nullif(retardos.cfg_txt('jornada_desde'), '')::date;
  v_emp_ok integer[] := ARRAY(SELECT jsonb_array_elements_text(retardos.cfg('empresa_ids'))::int);
  v_corrida bigint; m record; j jsonb; v_nom jsonb; s retardos.jornada_semana; v_id bigint; v_casos text[] := '{}';
  n_calc integer := 0; n_omit integer := 0; v_cuenta jsonb := '{}'::jsonb; v_rev integer;
BEGIN
  IF v_desde + 7 > retardos.hoy_local() THEN RAISE EXCEPTION 'SEMANA_ABIERTA % (cierra el jueves %)', v_sem, v_desde + 6; END IF;
  INSERT INTO retardos.corrida (workflow, leidos, resumen)
  VALUES (coalesce(p->>'workflow', 'retardos/jornada'), jsonb_array_length(coalesce(p->'nomina', '[]'::jsonb)),
          jsonb_build_object('semana', v_sem, 'desde', v_desde))
  RETURNING id INTO v_corrida;

  FOR m IN SELECT e.employee_id FROM retardos.empleado e
            WHERE e.activo AND e.company_id = ANY (v_emp_ok) ORDER BY e.employee_id
  LOOP
    SELECT * INTO s FROM retardos.jornada_semana WHERE employee_id = m.employee_id AND semana = v_sem;
    -- Ya decidido (caso abierto, revisado por RH o marcado no aplica): no se recalcula.
    IF FOUND AND (s.caso_id IS NOT NULL OR s.revisado_por IS NOT NULL OR s.estado = 'no_aplica') THEN
      n_omit := n_omit + 1; CONTINUE;
    END IF;
    SELECT coalesce(jsonb_agg(d), '[]'::jsonb) INTO v_nom
      FROM jsonb_array_elements(coalesce(p->'nomina', '[]'::jsonb)) x,
           jsonb_array_elements(CASE WHEN jsonb_typeof(x->'declaraciones') = 'array' THEN x->'declaraciones' ELSE '[]'::jsonb END) dd,
           LATERAL (SELECT jsonb_build_object('tipo', dd->>'tipo', 'dias', dd->'valores'->>'dias') AS d) z
     WHERE (x->>'employee_id')::int = m.employee_id AND x->>'semana' = v_sem;
    j := retardos.jornada_calcular(m.employee_id, v_desde, v_nom);
    INSERT INTO retardos.jornada_semana AS t (employee_id, semana, desde, hasta, horas_brutas, comida_h, horas_efectivas,
      umbral_persona, umbral_fuente, dias_prorrateo, umbral, faltante, estado, motivos_revision, desglose, prorrateo,
      corrida_id, calculado_at)
    VALUES (m.employee_id, v_sem, v_desde, v_desde + 6, (j->>'horas_brutas')::numeric, (j->>'comida_h')::numeric,
      (j->>'horas_efectivas')::numeric, (j->>'umbral_persona')::numeric, j->>'umbral_fuente', (j->>'dias_prorrateo')::numeric,
      (j->>'umbral')::numeric, (j->>'faltante')::numeric, j->>'estado', j->'motivos_revision', j->'desglose',
      j->'prorrateo' || jsonb_build_object('nomina', v_nom), v_corrida, now())
    ON CONFLICT (employee_id, semana) DO UPDATE SET horas_brutas = EXCLUDED.horas_brutas, comida_h = EXCLUDED.comida_h,
      horas_efectivas = EXCLUDED.horas_efectivas, umbral_persona = EXCLUDED.umbral_persona, umbral_fuente = EXCLUDED.umbral_fuente,
      dias_prorrateo = EXCLUDED.dias_prorrateo, umbral = EXCLUDED.umbral, faltante = EXCLUDED.faltante, estado = EXCLUDED.estado,
      motivos_revision = EXCLUDED.motivos_revision, desglose = EXCLUDED.desglose, prorrateo = EXCLUDED.prorrateo,
      corrida_id = EXCLUDED.corrida_id, calculado_at = now()
    RETURNING * INTO s;
    n_calc := n_calc + 1;
    v_cuenta := jsonb_set(v_cuenta, ARRAY[s.estado], to_jsonb(coalesce((v_cuenta->>s.estado)::int, 0) + 1));
    IF s.estado = 'incumple' AND v_avisos_desde IS NOT NULL AND s.desde >= v_avisos_desde THEN
      v_id := retardos.abrir_caso_jornada(s.id, v_corrida);
      IF v_id IS NOT NULL THEN v_casos := v_casos || (SELECT folio FROM retardos.caso WHERE id = v_id); END IF;
    END IF;
  END LOOP;

  -- Aviso a RH si hay semanas por revisar (uno por semana).
  SELECT count(*) INTO v_rev FROM retardos.jornada_semana WHERE semana = v_sem AND estado = 'revisar' AND revisado_por IS NULL;
  IF v_rev > 0 THEN
    PERFORM retardos.encolar('jornada_revisar:' || v_sem, NULL, 'aviso_rh', retardos.rh_para(), '[]'::jsonb,
      'Jornada por revisar: ' || v_rev || ' personas en la semana ' || v_sem,
      retardos.render((SELECT cuerpo_html FROM retardos.plantilla WHERE clave = 'jornada_por_revisar'),
        jsonb_build_object('semana_id', v_sem, 'semana_desde', to_char(v_desde, 'DD/MM/YYYY'), 'semana_hasta', to_char(v_desde + 6, 'DD/MM/YYYY'),
                           'n', v_rev)));
  END IF;

  UPDATE retardos.corrida SET terminada_at = now(), ok = true,
         resumen = resumen || jsonb_build_object('calculadas', n_calc, 'ya_decididas', n_omit, 'por_estado', v_cuenta,
                                                 'casos_nuevos', to_jsonb(v_casos),
                                                 'avisos_habilitados', v_avisos_desde IS NOT NULL AND v_desde >= v_avisos_desde)
   WHERE id = v_corrida;
  RETURN (SELECT resumen || jsonb_build_object('corrida_id', id) FROM retardos.corrida WHERE id = v_corrida);
END
$fn$;

-- RH revisa una semana: confirmar (tal cual), corregir (horas efectivas nuevas) o no_aplica.
-- p = { employee_id, semana, decision, horas_efectivas?, motivo, actor, rol }
CREATE OR REPLACE FUNCTION retardos.jornada_revisar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE s retardos.jornada_semana; v_actor text := coalesce(p->>'actor', 'desconocido'); v_dec text := p->>'decision';
        v_h numeric; v_id bigint; v_est text; v_avisos_desde date := nullif(retardos.cfg_txt('jornada_desde'), '')::date;
BEGIN
  IF coalesce(p->>'rol', 'lector') <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
  IF char_length(coalesce(p->>'motivo', '')) < 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_OBLIGATORIO'); END IF;
  SELECT * INTO s FROM retardos.jornada_semana WHERE employee_id = (p->>'employee_id')::int AND semana = p->>'semana' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'SEMANA_INEXISTENTE'); END IF;
  IF s.caso_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'YA_TIENE_CASO'); END IF;
  IF v_dec = 'no_aplica' THEN
    v_est := 'no_aplica'; v_h := NULL;
  ELSIF v_dec IN ('confirmar','corregir') THEN
    v_h := CASE WHEN v_dec = 'corregir' THEN nullif(p->>'horas_efectivas', '')::numeric ELSE s.horas_efectivas END;
    IF v_h IS NULL OR v_h < 0 OR v_h > 168 THEN RETURN jsonb_build_object('ok', false, 'error', 'HORAS_INVALIDAS'); END IF;
    v_est := CASE WHEN v_h >= s.umbral THEN 'cumple' ELSE 'incumple' END;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'DECISION_INVALIDA');
  END IF;
  UPDATE retardos.jornada_semana SET estado = v_est, horas_corregidas = CASE WHEN v_dec = 'corregir' THEN v_h END,
         faltante = CASE WHEN v_est = 'incumple' THEN round(s.umbral - v_h, 2) ELSE 0 END,
         revisado_por = v_actor, revisado_at = now(), revision_nota = p->>'motivo'
   WHERE id = s.id;
  PERFORM retardos.log(NULL, 'jornada_revisada', v_actor, p->>'motivo',
    jsonb_build_object('employee_id', s.employee_id, 'semana', s.semana, 'decision', v_dec, 'horas_efectivas', v_h,
                       'estado_anterior', s.estado, 'estado_nuevo', v_est, 'motivos', s.motivos_revision));
  IF v_est = 'incumple' AND v_avisos_desde IS NOT NULL AND s.desde >= v_avisos_desde THEN
    v_id := retardos.abrir_caso_jornada(s.id, NULL);
  END IF;
  RETURN jsonb_build_object('ok', true, 'estado', v_est, 'folio', (SELECT folio FROM retardos.caso WHERE id = v_id));
END
$fn$;

-- RH decide sobre una propuesta de medida. Con modo_medidas_jornada = retenidas queda RETENIDA.
-- p = { medida_id, decision: descuento|otra|ninguna, horas?, detalle?, motivo, evidencia_id?, actor, rol }
CREATE OR REPLACE FUNCTION retardos.medida_decidir(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE md retardos.medida; v_actor text := coalesce(p->>'actor', 'desconocido'); v_dec text := p->>'decision'; v_est text;
        v_modo text := coalesce(retardos.cfg_txt('modo_medidas_jornada'), 'retenidas');
BEGIN
  IF coalesce(p->>'rol', 'lector') <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
  IF char_length(coalesce(p->>'motivo', '')) < 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_OBLIGATORIO'); END IF;
  SELECT * INTO md FROM retardos.medida WHERE id = (p->>'medida_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'MEDIDA_INEXISTENTE'); END IF;
  IF md.estado NOT IN ('propuesta','retenida') THEN RETURN jsonb_build_object('ok', false, 'error', 'MEDIDA_YA_DECIDIDA'); END IF;
  IF v_dec = 'ninguna' THEN v_est := 'descartada';
  ELSIF v_dec IN ('descuento','otra') THEN
    IF v_dec = 'descuento' AND (nullif(p->>'horas', '')::numeric IS NULL OR (p->>'horas')::numeric <= 0
                                OR (p->>'horas')::numeric > md.horas_propuestas) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'HORAS_INVALIDAS');
    END IF;
    v_est := CASE WHEN v_modo = 'habilitadas' THEN 'por_aplicar' ELSE 'retenida' END;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'DECISION_INVALIDA');
  END IF;
  UPDATE retardos.medida SET estado = v_est, decidido_por = v_actor, decidido_at = now(),
         evidencia_id = nullif(p->>'evidencia_id', '')::bigint,
         decision = jsonb_build_object('decision', v_dec, 'horas', nullif(p->>'horas', '')::numeric, 'detalle', p->>'detalle',
                                       'motivo', p->>'motivo', 'modo_medidas_jornada', v_modo)
   WHERE id = md.id;
  PERFORM retardos.log(md.caso_id, 'medida_decidida', v_actor, p->>'motivo',
    jsonb_build_object('medida_id', md.id, 'decision', v_dec, 'horas', p->>'horas', 'estado', v_est, 'modo_medidas_jornada', v_modo));
  RETURN jsonb_build_object('ok', true, 'estado', v_est,
    'nota', CASE WHEN v_est = 'retenida' THEN 'Decisión registrada. La medida queda RETENIDA: no se aplica ni se manda a Nómina hasta que Legal confirme.' END);
END
$fn$;

-- ══ 11. DATOS DE UN CASO PARA PLANTILLA Y PDF (retardo o jornada) ═════════════
CREATE OR REPLACE FUNCTION retardos.caso_datos(p_caso bigint) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'folio', c.folio, 'tipo', c.tipo, 'nivel', c.nivel, 'accion', c.accion, 'estado', c.estado,
    'nombre_nivel', coalesce(e.nombre, ej.nombre), 'periodo', c.periodo, 'retardos_n', c.retardos_n,
    'motivo_apertura', c.motivo_apertura,
    'nombre', coalesce(m.nombre, 'Empleado ' || c.employee_id), 'puesto', coalesce(m.puesto, ''),
    'departamento', coalesce(m.departamento, ''), 'employee_id', c.employee_id,
    'email', m.email, 'email_valido', coalesce(m.email_valido, false),
    'supervisor', coalesce(s.nombre, ''), 'supervisor_email', CASE WHEN s.email_valido THEN s.email END,
    'vence', to_char(retardos.a_local(c.vence_at), 'DD/MM/YYYY'),
    'accion_desde', to_char(c.accion_desde, 'DD/MM/YYYY'), 'accion_hasta', to_char(c.accion_hasta, 'DD/MM/YYYY'),
    'dias_suspension', e.dias_suspension, 'requiere_testigos', coalesce(e.requiere_testigos, false),
    'fecha_emision', to_char(retardos.a_local(c.abierto_at), 'DD/MM/YYYY'),
    'tolerancia_min', coalesce(retardos.cfg_txt('tolerancia_min')::int, 15),
    'umbral_carta', (SELECT min(umbral) FROM retardos.escalera WHERE activo AND accion = 'carta_compromiso'),
    'leyenda_hora', 'hora del centro, CST',
    'retardos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'fecha', to_char(r.fecha, 'DD/MM/YYYY'),
        'llegada', CASE WHEN r.seg_local IS NOT NULL THEN retardos.hhmmss(r.seg_local) ELSE retardos.hhmm(r.hora_local) END,
        'esperada', retardos.hhmm(r.hora_esperada), 'minutos', r.minutos_tarde) ORDER BY r.fecha)
      FROM retardos.caso_retardo cr JOIN retardos.retardo r ON r.id = cr.retardo_id
      WHERE cr.caso_id = c.id), '[]'::jsonb),
    'jornada', CASE WHEN c.tipo = 'jornada' THEN (
      SELECT jsonb_build_object('semana', js.semana, 'desde', to_char(js.desde, 'DD/MM/YYYY'), 'hasta', to_char(js.hasta, 'DD/MM/YYYY'),
        'horas_brutas', retardos.horas_txt(js.horas_brutas), 'comida', retardos.horas_txt(js.comida_h),
        'horas_efectivas', retardos.horas_txt(coalesce(js.horas_corregidas, js.horas_efectivas)),
        'umbral', retardos.horas_txt(js.umbral), 'faltante', retardos.horas_txt(js.faltante), 'aviso_n', c.nivel,
        'dias_prorrateo', js.dias_prorrateo,
        'dias', (SELECT jsonb_agg(jsonb_build_object('fecha', to_char((x->>'fecha')::date, 'DD/MM/YYYY'),
                   'dia', (ARRAY['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[(x->>'dow')::int],
                   'brutas', retardos.horas_txt((x->>'brutas')::numeric), 'comida', retardos.horas_txt((x->>'comida')::numeric),
                   'efectivas', retardos.horas_txt((x->>'efectivas')::numeric), 'nota', x->>'prorrateo') ORDER BY x->>'fecha')
                 FROM jsonb_array_elements(js.desglose) x))
        FROM retardos.jornada_semana js WHERE js.caso_id = c.id LIMIT 1) END)
  FROM retardos.caso c
  LEFT JOIN retardos.escalera e ON c.tipo = 'retardo' AND e.nivel = c.nivel
  LEFT JOIN retardos.escalera_jornada ej ON c.tipo = 'jornada' AND ej.nivel = c.nivel
  LEFT JOIN retardos.empleado m ON m.employee_id = c.employee_id
  LEFT JOIN retardos.empleado s ON s.employee_id = m.parent_id
  WHERE c.id = p_caso
$fn$;

CREATE OR REPLACE FUNCTION retardos.tabla_jornada(p_datos jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT '<table style="border-collapse:collapse;font-size:14px"><tr>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Día</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Horas registradas</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Comida descontada</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Horas efectivas</th></tr>'
      || coalesce(string_agg('<tr><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'dia') || ' ' || (x->>'fecha')
        || coalesce(' (' || (x->>'nota') || ')', '')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'brutas')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'comida')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'efectivas') || '</td></tr>', ''), '')
      || '</table><p style="font-size:12px;color:#555">Horas en formato horas:minutos. Semana del viernes al jueves, hora del centro, CST.</p>'
  FROM jsonb_array_elements(p_datos->'jornada'->'dias') x
$fn$;

CREATE OR REPLACE FUNCTION retardos.encolar_plantilla(p_caso bigint, p_plantilla text, p_tipo text, p_clave text,
                                                      p_para jsonb, p_cc jsonb, p_pdf text DEFAULT NULL,
                                                      p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE t retardos.plantilla; d jsonb; v jsonb; jn jsonb;
BEGIN
  SELECT * INTO t FROM retardos.plantilla WHERE clave = p_plantilla;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLANTILLA_INEXISTENTE %', p_plantilla; END IF;
  d := coalesce(retardos.caso_datos(p_caso), '{}'::jsonb);
  jn := d->'jornada';
  v := (d - 'retardos' - 'jornada') || jsonb_build_object(
         'detalle', CASE WHEN jsonb_typeof(jn) = 'object' THEN retardos.tabla_jornada(d) ELSE retardos.tabla_retardos(d) END,
         'responder_a', coalesce(retardos.cfg_txt('buzon_receptor'), retardos.cfg_txt('remitente')));
  IF jsonb_typeof(jn) = 'object' THEN
    v := v || jsonb_build_object('semana_id', jn->>'semana', 'semana_desde', jn->>'desde', 'semana_hasta', jn->>'hasta',
               'horas_efectivas', jn->>'horas_efectivas', 'umbral_horas', jn->>'umbral', 'faltante_horas', jn->>'faltante',
               'aviso_n', jn->>'aviso_n', 'horas_brutas', jn->>'horas_brutas', 'comida_horas', jn->>'comida');
  END IF;
  v := v || coalesce(p_extra, '{}'::jsonb);
  RETURN retardos.encolar(p_clave, p_caso, p_tipo, p_para, p_cc,
                          retardos.render(t.asunto, v), retardos.render(t.cuerpo_html, v), p_pdf);
END
$fn$;

-- El outbox respeta no_antes_de (envío diferido de jornada).
CREATE OR REPLACE FUNCTION retardos.por_enviar(p_limite integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_modo text := coalesce(retardos.cfg_txt('modo'), 'sombra'); v_out jsonb := '[]'::jsonb; e retardos.envio;
        v_para jsonb; v_cc jsonb; v_asunto text; v_html text; v_real text;
BEGIN
  UPDATE retardos.envio SET estado = 'omitido', modo_envio = 'sombra', error = 'sombra: sin escritura a Odoo'
   WHERE estado = 'pendiente' AND tipo = 'odoo_nota' AND v_modo = 'sombra';

  FOR e IN SELECT * FROM retardos.envio
            WHERE estado IN ('pendiente','fallido') AND intentos < 5 AND tipo <> 'odoo_nota'
              AND (no_antes_de IS NULL OR no_antes_de <= now())
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

-- ══ 12. PLANTILLAS (texto base, pendiente de validación de RH) ═════════════════
INSERT INTO retardos.plantilla (clave, asunto, cuerpo_html) VALUES
('notificacion_aviso', '[[[folio]]] Aviso de retardo',
 '<p>Hola [[nombre]]:</p><p>Llegar a tiempo es una forma de respetar el tiempo de tus compañeros: cuando alguien llega tarde, el equipo arranca incompleto. Por eso te compartimos este <b>aviso informativo</b>. No requiere respuesta.</p><p>En el periodo [[periodo]] el control de asistencia registró estos retardos (hora del centro, CST):</p>[[detalle]]<p>Tu hora de entrada es la que aparece en la tabla. La tolerancia es de <b>[[tolerancia_min]] minutos</b>: llegar a los [[tolerancia_min]] minutos exactos no es retardo; un segundo después, sí. Llevas <b>[[retardos_n]]</b> en el mes. A partir de <b>[[umbral_carta]] retardos</b> en el mes, Recursos Humanos te cita para firmar una carta compromiso.</p><p>Si alguno de estos días tenías permiso, estabas en campo o hubo un error en la checada, avisa a Recursos Humanos o a tu supervisor para corregirlo.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('jornada_aviso', '[[[folio]]] Aviso [[aviso_n]] de jornada semanal: semana del [[semana_desde]] al [[semana_hasta]]',
 '<p>Hola [[nombre]]:</p><p>En FTS la jornada se cuenta por semana, del viernes al jueves, y es de <b>[[umbral_horas]] horas efectivas</b>, ya descontados 30 minutos de comida por cada día que trabajas. Cumplirla es cuidar el tiempo de tus compañeros, que cuentan con tu parte del trabajo.</p><p>Semana del <b>viernes [[semana_desde]] al jueves [[semana_hasta]]</b> (hora del centro, CST):</p>[[detalle]]<p>Horas efectivas registradas: <b>[[horas_efectivas]]</b>. Jornada de la semana: <b>[[umbral_horas]]</b>. Faltante: <b>[[faltante_horas]]</b>.</p><p>Este es el aviso número <b>[[aviso_n]]</b>. Si hay un error (una checada que no se registró, un permiso o un día en campo), pide la corrección a Recursos Humanos a más tardar el <b>[[plazo_correccion]]</b>.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('jornada_aviso_3', '[[[folio]]] Tercer aviso de jornada semanal: semana del [[semana_desde]] al [[semana_hasta]]',
 '<p>Hola [[nombre]]:</p><p>Este es el <b>tercer aviso</b> de jornada semanal incompleta dentro del periodo que revisa Recursos Humanos. Te lo decimos con claridad porque el tiempo que falta lo cubren tus compañeros.</p><p>Semana del <b>viernes [[semana_desde]] al jueves [[semana_hasta]]</b> (hora del centro, CST):</p>[[detalle]]<p>Horas efectivas registradas: <b>[[horas_efectivas]]</b>. Jornada de la semana: <b>[[umbral_horas]]</b>. Faltante: <b>[[faltante_horas]]</b>.</p><p>Te adjuntamos la hoja. Recursos Humanos te va a citar para revisarla contigo; en la hoja hay un espacio para que escribas tu versión. Si hay un error en tus horas, pide la corrección a Recursos Humanos a más tardar el <b>[[plazo_correccion]]</b>.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('jornada_rh_recolectar', '[[[folio]]] Recolectar firma: tercer aviso de jornada de [[nombre]]',
 '<p>Hola:</p><p>Se abrió el folio <b>[[folio]]</b>: <b>tercer aviso de jornada incompleta</b> para <b>[[nombre]]</b> ([[puesto]], [[departamento]]), semana del [[semana_desde]] al [[semana_hasta]] (hora del centro, CST).</p>[[detalle]]<p>Horas efectivas: <b>[[horas_efectivas]]</b> de <b>[[umbral_horas]]</b>. Faltante: <b>[[faltante_horas]]</b>.</p><p>Adjuntamos la hoja lista para imprimir. Por favor cita a la persona, recolecta su firma (o la negativa con dos testigos) y súbela al panel de Retardos. Plazo: <b>[[vence_rh]]</b>. Correo a la persona: [[correo_trabajador]].</p><p>En el panel queda una <b>propuesta de medida</b> (descuento del tiempo no laborado u otra). La decide Recursos Humanos y queda retenida hasta que Legal confirme el procedimiento: el sistema no aplica nada.</p><p>Con copia al jefe directo.</p>'),
('jornada_sin_correo', '[[[folio]]] Entrega en persona: aviso [[aviso_n]] de jornada de [[nombre]]',
 '<p>Hola:</p><p>[[nombre]] no tiene un correo utilizable. Te pedimos compartirle este aviso de jornada semanal en persona.</p><p>Semana del <b>viernes [[semana_desde]] al jueves [[semana_hasta]]</b> (hora del centro, CST):</p>[[detalle]]<p>Horas efectivas: <b>[[horas_efectivas]]</b> de <b>[[umbral_horas]]</b>. Faltante: <b>[[faltante_horas]]</b>. Aviso número <b>[[aviso_n]]</b>. Plazo para pedir corrección a RH: <b>[[plazo_correccion]]</b>.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('jornada_por_revisar', 'Jornada por revisar: semana [[semana_id]]',
 '<p>Hay <b>[[n]]</b> personas con la semana del [[semana_desde]] al [[semana_hasta]] con datos incompletos (checadas sin salida, asistencias de más de 16 h, incidencias pendientes o sin asistencias).</p><p>No se les mandó aviso. Revísalas en el panel de Retardos, pestaña <b>Jornada semanal</b>, bandeja <b>Jornada por revisar</b>: confirmar, corregir las horas o marcar que no aplica.</p>'),
('comunicado_arranque', 'Puntualidad y jornada semanal en FTS',
 '<p>Hola equipo:</p><p>A partir del <b>[[fecha_arranque]]</b> el control de asistencia de FTS funciona con estas reglas. La idea central es sencilla: <b>llegar a tiempo y cumplir la jornada es respetar el tiempo de tus compañeros</b>.</p><ul><li><b>Hora de entrada y tolerancia.</b> Tu hora de entrada es la de tu ficha. La tolerancia es de [[tolerancia_min]] minutos: llegar a los [[tolerancia_min]] minutos exactos no es retardo; un segundo después, sí. Sólo cuentan lunes a viernes.</li><li><b>Retardos.</b> Con el primer retardo del mes recibes un aviso informativo. A partir de [[umbral_carta]] retardos en el mes, Recursos Humanos te cita para firmar una carta compromiso.</li><li><b>Jornada semanal.</b> La semana va del viernes al jueves y son [[umbral_horas]] horas efectivas, ya descontados 30 minutos de comida por cada día trabajado. Si una semana queda corta, recibes un aviso con el detalle por día.</li><li><b>Correcciones.</b> Si una checada no se registró o tenías un permiso, pide la corrección a Recursos Humanos. Todas las horas se expresan en hora del centro, CST.</li></ul><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>')
ON CONFLICT (clave) DO UPDATE SET asunto = EXCLUDED.asunto, cuerpo_html = EXCLUDED.cuerpo_html,
  actualizado_por = 'retardos_0007', actualizado_at = now();

UPDATE retardos.plantilla SET estado_texto = 'pendiente_validacion_rh' WHERE estado_texto IS DISTINCT FROM 'validado_rh';
UPDATE retardos.plantilla SET variables = v.vars FROM (VALUES
  ('notificacion_aviso', 'nombre, periodo, detalle (tabla: fecha, hora de checada con segundos, hora de entrada, minutos tarde), tolerancia_min, retardos_n, umbral_carta, folio'),
  ('jornada_aviso', 'nombre, folio, aviso_n, semana_desde, semana_hasta, detalle (tabla por día: horas registradas, comida, efectivas), horas_efectivas, umbral_horas, faltante_horas, plazo_correccion'),
  ('jornada_aviso_3', 'nombre, folio, semana_desde, semana_hasta, detalle, horas_efectivas, umbral_horas, faltante_horas, plazo_correccion'),
  ('jornada_rh_recolectar', 'folio, nombre, puesto, departamento, semana_desde, semana_hasta, detalle, horas_efectivas, umbral_horas, faltante_horas, vence_rh, correo_trabajador'),
  ('jornada_sin_correo', 'folio, nombre, aviso_n, semana_desde, semana_hasta, detalle, horas_efectivas, umbral_horas, faltante_horas, plazo_correccion'),
  ('jornada_por_revisar', 'n, semana_id, semana_desde, semana_hasta'),
  ('comunicado_arranque', 'fecha_arranque, tolerancia_min, umbral_carta, umbral_horas')
) AS v(clave, vars) WHERE plantilla.clave = v.clave;

-- Comunicado general: se PREPARA; sólo se encola si hay lista de distribución configurada.
CREATE OR REPLACE FUNCTION retardos.comunicado_arranque(p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE t retardos.plantilla; v jsonb; v_para jsonb := coalesce(retardos.cfg('comunicado_destinatarios'), '[]'::jsonb); v_id bigint;
BEGIN
  SELECT * INTO t FROM retardos.plantilla WHERE clave = 'comunicado_arranque';
  v := jsonb_build_object('fecha_arranque', coalesce(p->>'fecha_arranque', '1 de octubre de 2026'),
         'tolerancia_min', coalesce(retardos.cfg_txt('tolerancia_min'), '15'),
         'umbral_carta', (SELECT min(umbral) FROM retardos.escalera WHERE activo AND accion = 'carta_compromiso'),
         'umbral_horas', coalesce(retardos.cfg_txt('jornada_umbral_horas'), '48'));
  IF coalesce((p->>'encolar')::boolean, false) AND jsonb_array_length(v_para) > 0 THEN
    v_id := retardos.encolar('comunicado:' || coalesce(p->>'fecha_arranque', 'arranque'), NULL, 'comunicado', v_para, retardos.rh_para(),
                             retardos.render(t.asunto, v), retardos.render(t.cuerpo_html, v));
  END IF;
  RETURN jsonb_build_object('ok', true, 'asunto', retardos.render(t.asunto, v), 'html', retardos.render(t.cuerpo_html, v),
                            'encolado', v_id, 'estado_texto', t.estado_texto);
END
$fn$;

-- ══ 13. RETARDO: filtros por tipo donde había casos de cualquier clase ════════
CREATE OR REPLACE FUNCTION retardos.suspension_aplicable(p_emp integer, p_periodo text, p_nivel smallint, p_motivo text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_desde date := nullif(retardos.cfg_txt('modo_suspension_desde'), '')::date; v_umbral integer; n integer;
BEGIN
  IF v_desde IS NULL THEN RETURN true; END IF;
  SELECT count(*) INTO n FROM retardos.retardo
   WHERE employee_id = p_emp AND periodo = p_periodo AND estado = 'contado' AND fecha >= v_desde;
  IF p_motivo = 'umbral' THEN
    SELECT umbral INTO v_umbral FROM retardos.escalera WHERE nivel = p_nivel;
    RETURN n >= v_umbral;
  END IF;
  IF n = 0 THEN RETURN false; END IF;
  IF coalesce(retardos.cfg_txt('antecedentes_previos_cuentan'), 'false') = 'true' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM retardos.caso WHERE tipo = 'retardo' AND employee_id = p_emp AND nivel < p_nivel AND requiere_firma
                   AND validado_at >= retardos.de_local(v_desde::timestamp));
END
$fn$;

CREATE OR REPLACE VIEW retardos.v_reincidencia AS
WITH par AS (
  SELECT retardos.hoy_local() AS hoy,
         coalesce((retardos.cfg('alerta_disparadores')->'individual'->>'ventana_dias')::int, 90) AS ventana
), emp AS (
  SELECT e.employee_id, e.nombre, e.departamento FROM retardos.empleado e
   WHERE e.activo AND e.company_id IN (SELECT (jsonb_array_elements_text(coalesce(retardos.cfg('empresa_ids'), '[1]'::jsonb)))::int)
), cs AS (
  SELECT c.* FROM retardos.caso c WHERE c.estado <> 'CANCELADO_POR_RH' AND c.tipo = 'retardo'
), meses AS (
  SELECT employee_id, array_agg(DISTINCT periodo ORDER BY periodo DESC) AS ps FROM cs GROUP BY 1
), racha AS (
  SELECT m.employee_id, (SELECT count(*) FROM generate_subscripts(m.ps, 1) i
                          WHERE to_date(m.ps[i], 'YYYY-MM') = to_date(m.ps[1], 'YYYY-MM') - make_interval(months => i - 1)
                            AND NOT EXISTS (SELECT 1 FROM generate_subscripts(m.ps, 1) j
                                             WHERE j < i AND to_date(m.ps[j], 'YYYY-MM') <> to_date(m.ps[1], 'YYYY-MM') - make_interval(months => j - 1))) AS consecutivos,
         cardinality(m.ps) AS meses_con_casos, m.ps[1] AS ultimo_mes
    FROM meses m
), firm AS (
  SELECT cs.employee_id,
         count(*) FILTER (WHERE cs.accion = 'carta_compromiso' AND cs.validado_at > now() - interval '90 days')  AS cartas_90,
         count(*) FILTER (WHERE cs.accion = 'carta_compromiso' AND cs.validado_at > now() - interval '180 days') AS cartas_180,
         count(*) FILTER (WHERE cs.accion = 'acta' AND cs.validado_at > now() - interval '90 days')  AS actas_90,
         count(*) FILTER (WHERE cs.accion = 'acta' AND cs.validado_at > now() - interval '180 days') AS actas_180,
         count(*) FILTER (WHERE cs.accion = 'suspension' AND cs.estado = 'RETENIDO') AS susp_no_aplicada,
         count(DISTINCT cs.periodo) FILTER (WHERE cs.accion = 'suspension'
                                             AND cs.abierto_at > now() - make_interval(days => (SELECT ventana FROM par))) AS meses_susp_ventana
    FROM cs GROUP BY 1
), tend AS (
  SELECT r.employee_id,
         count(*) FILTER (WHERE r.fecha > (SELECT hoy FROM par) - 30) AS ret_30,
         round(count(*) FILTER (WHERE r.fecha <= (SELECT hoy FROM par) - 30 AND r.fecha > (SELECT hoy FROM par) - 120) / 3.0, 1) AS prom_30_previo
    FROM retardos.retardo r WHERE r.estado = 'contado' GROUP BY 1
), base AS (
  SELECT e.employee_id, e.nombre, e.departamento,
         coalesce(k.meses_con_casos, 0) AS meses_con_casos, coalesce(k.consecutivos, 0) AS meses_consecutivos, k.ultimo_mes,
         coalesce(f.cartas_90, 0) AS cartas_90, coalesce(f.cartas_180, 0) AS cartas_180,
         coalesce(f.actas_90, 0) AS actas_90, coalesce(f.actas_180, 0) AS actas_180,
         coalesce(f.susp_no_aplicada, 0) AS suspension_no_aplicada, coalesce(f.meses_susp_ventana, 0) AS meses_suspension_ventana,
         coalesce(t.ret_30, 0) AS retardos_30d, coalesce(t.prom_30_previo, 0) AS promedio_30d_previo
    FROM emp e LEFT JOIN racha k USING (employee_id) LEFT JOIN firm f USING (employee_id) LEFT JOIN tend t USING (employee_id)
)
SELECT b.*,
       CASE WHEN b.retardos_30d > b.promedio_30d_previo * 1.2 AND b.retardos_30d >= 2 THEN 'sube'
            WHEN b.retardos_30d < b.promedio_30d_previo * 0.8 THEN 'baja' ELSE 'igual' END AS tendencia,
       CASE WHEN EXISTS (SELECT 1 FROM retardos.alerta_modo a WHERE a.employee_id = b.employee_id AND a.estado IN ('abierta','pospuesta'))
              OR b.meses_suspension_ventana >= 2 OR b.actas_90 >= 2 THEN 'rojo'
            WHEN b.actas_180 > 0 OR b.suspension_no_aplicada > 0 OR b.meses_consecutivos >= 2 THEN 'amarillo'
            ELSE 'verde' END AS semaforo
  FROM base b;

-- Calidad de datos: tolerancia de 15 al segundo y la jornada del calendario.
CREATE OR REPLACE VIEW retardos.v_calidad AS
WITH par AS (
  SELECT coalesce(retardos.cfg_txt('tolerancia_min')::numeric, 15) AS tol, retardos.hoy_local() AS hoy
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
         lower(split_part(coalesce(e.email, ''), '@', 2)) AS dominio,
         e.calendario_nombre, e.cal_horas_semana, e.cal_dias, retardos.jornada_calendario(e.employee_id) AS jornada_cal,
         retardos.jornada_umbral_persona(e.employee_id) AS umbral_j
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
         'sin_hora_entrada',    CASE WHEN b.hora_entrada IS NULL OR b.hora_entrada <= 0 THEN true END,
         'jornada_calendario_distinta', CASE WHEN b.jornada_cal IS NOT NULL
                                      AND abs(b.jornada_cal - coalesce(retardos.cfg_txt('jornada_umbral_horas')::numeric, 48)) > 0.01 THEN true END,
         'jornada_usa_calendario', CASE WHEN b.umbral_j->>'fuente' = 'calendario' THEN true END,
         'calendario_con_fin_de_semana', CASE WHEN b.cal_dias && ARRAY[6,7] THEN true END,
         'sin_calendario',      CASE WHEN b.cal_horas_semana IS NULL THEN true END
       )) AS banderas,
       coalesce(r.revisado, false) AS revisado, r.nota, r.revisado_por, r.revisado_at,
       b.calendario_nombre, b.cal_horas_semana, round(b.jornada_cal, 2) AS jornada_calendario,
       (b.umbral_j->>'umbral')::numeric AS jornada_umbral, b.umbral_j->>'fuente' AS jornada_fuente
  FROM base b LEFT JOIN retardos.calidad_revision r USING (employee_id);

CREATE OR REPLACE FUNCTION retardos.panel_calidad(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'personas', coalesce((SELECT jsonb_agg(to_jsonb(v) || jsonb_build_object(
        'correos', retardos.correos_de(v.employee_id),
        'correo_usado', retardos.destinatarios(v.employee_id),
        'correo_motivo', CASE WHEN jsonb_array_length(retardos.destinatarios(v.employee_id)) = 0 THEN 'sin correo utilizable: la hoja va sólo a RH y al jefe'
                              WHEN coalesce(retardos.cfg_txt('correo_modo'), 'preferente') = 'ambos' THEN 'modo ambos'
                              WHEN retardos.destinatarios(v.employee_id)->0->>'tipo' = 'empresa' THEN 'correo de empresa'
                              ELSE 'no tiene correo de empresa utilizable: se usa el personal' END)
        ORDER BY v.revisado, v.departamento, v.nombre) FROM retardos.v_calidad v), '[]'::jsonb),
    'tolerancia_min', coalesce(retardos.cfg_txt('tolerancia_min')::numeric, 15),
    'jornada_umbral_horas', coalesce(retardos.cfg_txt('jornada_umbral_horas')::numeric, 48),
    'correo_modo', retardos.cfg('correo_modo'),
    'regla_sugerida', 'Primer horario en punto o y media con el que habría llegado tarde en no más del 20% de sus días hábiles de los últimos 90. Sólo referencia: no se aplica sola.')
$fn$;

-- ══ 14. VERIFICACIÓN: plazos (también del 3er aviso), suspensión y medidas ═════
CREATE OR REPLACE FUNCTION retardos.verificar(p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE c record; v_hoy date := retardos.hoy_local();
        v_plazo integer := coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3);
        v_rh jsonb := retardos.rh_para();
        v_esc jsonb := coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb);
        v_dval integer := coalesce(retardos.cfg_txt('dias_validacion_rh')::int, 2);
        v_tdesc text := coalesce(retardos.cfg_txt('jornada_tipo_nomina_descuento'), 'tiempo_no_laborado');
        n_venc integer := 0; n_esc integer := 0; n_rec_rh integer := 0; n_verif integer := 0; n_alert integer := 0;
        n_med_ok integer := 0; n_med_alert integer := 0;
        v_chec integer; v_nom boolean; v_corrida bigint; v_al jsonb; md record;
BEGIN
  INSERT INTO retardos.corrida (workflow) VALUES ('retardos/verificar') RETURNING id INTO v_corrida;

  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'ESPERANDO_FIRMA' AND k.vence_at < now() LOOP
    PERFORM retardos.transicionar(c.id, 'VENCIDO', 'sistema', 'RH no subió la hoja al vencer el plazo');
    UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), greatest(v_plazo, 1)), recordatorios = recordatorios + 1 WHERE id = c.id;
    PERFORM retardos.encolar_plantilla(c.id, 'recordatorio_rh_recolectar', 'recordatorio', c.folio || ':recordatorio:1',
      v_rh, coalesce(retardos.jefe_de(c.employee_id), '[]'::jsonb), NULL,
      jsonb_build_object('vence_rh', to_char(retardos.a_local(retardos.sumar_habiles(now(), greatest(v_plazo, 1))), 'DD/MM/YYYY')));
    n_venc := n_venc + 1;
  END LOOP;

  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'VENCIDO' AND k.vence_at < now() LOOP
    PERFORM retardos.transicionar(c.id, 'ESCALADO', 'sistema', 'Segundo vencimiento sin hoja: se escala a Dirección');
    PERFORM retardos.encolar_plantilla(c.id, 'escalamiento_rh', 'escalamiento', c.folio || ':escalamiento', v_esc,
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(v_rh) x WHERE NOT (to_jsonb(x) <@ v_esc)), NULL);
    n_esc := n_esc + 1;
  END LOOP;

  FOR c IN SELECT k.* FROM retardos.caso k
            WHERE k.estado = 'FIRMA_RECIBIDA' AND retardos.sumar_habiles(k.actualizado_at, v_dval) < now()
  LOOP
    IF retardos.encolar_plantilla(c.id, 'recordatorio_rh', 'aviso_rh', c.folio || ':rh_pendiente:' || v_hoy,
                                  v_rh, '[]'::jsonb) IS NOT NULL THEN n_rec_rh := n_rec_rh + 1; END IF;
  END LOOP;

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
      IF retardos.encolar_plantilla(c.id, 'alerta_accion', 'alerta', c.folio || ':pre_corte:' || v_hoy,
           v_rh, '[]'::jsonb, NULL,
           jsonb_build_object('hallazgo', 'La suspensión empieza pronto y todavía no está cargada en Nómina · Incidencias.')) IS NOT NULL
      THEN n_alert := n_alert + 1; END IF;
    END IF;
  END LOOP;

  -- Medidas de jornada registradas (sólo con modo_medidas_jornada = habilitadas): ¿llegaron a Nómina?
  -- p.nom_semana = [{employee_id, semana, declaraciones:[{tipo, valores}]}]
  FOR md IN SELECT m.*, k.folio FROM retardos.medida m JOIN retardos.caso k ON k.id = m.caso_id
             WHERE m.estado = 'por_aplicar' AND m.decision->>'decision' = 'descuento' LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'nom_semana', '[]'::jsonb)) x,
                             jsonb_array_elements(CASE WHEN jsonb_typeof(x->'declaraciones') = 'array' THEN x->'declaraciones' ELSE '[]'::jsonb END) d
                WHERE (x->>'employee_id')::int = md.employee_id AND d->>'tipo' = v_tdesc
                  AND retardos.semana_de_id(x->>'semana') >= retardos.semana_desde(retardos.a_local(md.decidido_at)::date)) THEN
      UPDATE retardos.medida SET estado = 'verificada', verificada_at = now() WHERE id = md.id;
      PERFORM retardos.log(md.caso_id, 'medida_verificada', 'sistema', 'El descuento aparece en Nómina · Incidencias',
                           jsonb_build_object('medida_id', md.id, 'tipo', v_tdesc));
      n_med_ok := n_med_ok + 1;
    ELSE
      IF retardos.encolar_plantilla(md.caso_id, 'alerta_accion', 'alerta', md.folio || ':medida_nomina:' || v_hoy,
           v_rh, '[]'::jsonb, NULL,
           jsonb_build_object('hallazgo', 'RH registró un descuento de tiempo no laborado que todavía no aparece en Nómina · Incidencias (tipo '
                                          || v_tdesc || '). Cárgalo antes del corte.')) IS NOT NULL
      THEN n_med_alert := n_med_alert + 1; END IF;
    END IF;
  END LOOP;

  v_al := retardos.evaluar_alertas();

  UPDATE retardos.corrida SET terminada_at = now(), ok = true,
         resumen = jsonb_build_object('vencidos', n_venc, 'escalados', n_esc, 'recordatorios_rh', n_rec_rh,
                                      'acciones_verificadas', n_verif, 'alertas', n_alert,
                                      'medidas_verificadas', n_med_ok, 'medidas_alertadas', n_med_alert) || v_al
   WHERE id = v_corrida;
  RETURN (SELECT resumen || jsonb_build_object('corrida_id', id) FROM retardos.corrida WHERE id = v_corrida);
END
$fn$;

-- ══ 15. SALUD: el corte del viernes tiene que haber corrido ═══════════════════
DO $ren3$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'retardos' AND p.proname = 'salud_hojas') THEN
    ALTER FUNCTION retardos.salud() RENAME TO salud_hojas;
  END IF;
END
$ren3$;

-- ¿Falta el corte del viernes? Desde el viernes 10:00 (hora del centro) debe existir un corte exitoso
-- iniciado después del viernes 07:30. Recibe la hora local para poder probarse en cualquier día.
CREATE OR REPLACE FUNCTION retardos.falta_corte_jornada(p_ahora timestamp) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT p_ahora >= retardos.semana_desde(p_ahora::date) + time '10:00'
     AND NOT EXISTS (SELECT 1 FROM retardos.corrida
                      WHERE workflow = 'retardos/jornada' AND ok
                        AND iniciada_at >= retardos.de_local(retardos.semana_desde(p_ahora::date) + time '07:30'))
$fn$;

CREATE OR REPLACE FUNCTION retardos.salud() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE s jsonb := retardos.salud_hojas(); v_prob jsonb := coalesce(s->'problemas', '[]'::jsonb);
        v_vie date := retardos.semana_desde(retardos.hoy_local());
BEGIN
  IF retardos.falta_corte_jornada(retardos.a_local(now())) THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'JORNADA_SIN_CORTE',
      'detalle', 'El corte semanal de jornada del viernes ' || to_char(v_vie, 'DD/MM/YYYY') || ' no ha corrido.');
  END IF;
  RETURN s || jsonb_build_object('ok', jsonb_array_length(v_prob) = 0, 'problemas', v_prob,
    'jornada_por_revisar', (SELECT count(*) FROM retardos.jornada_semana WHERE estado = 'revisar' AND revisado_por IS NULL),
    'medidas_propuestas', (SELECT count(*) FROM retardos.medida WHERE estado = 'propuesta'),
    'ultimo_corte_jornada', (SELECT max(terminada_at) FROM retardos.corrida WHERE workflow = 'retardos/jornada' AND ok));
END
$fn$;

-- ══ 16. RESUMEN SEMANAL: alineado al corte del viernes ═════════════════════════
-- Semana FTS que cerró el jueves. La llave de dedupe es la semana FTS: correrlo dos veces no manda dos.
CREATE OR REPLACE FUNCTION retardos.resumen_semanal() RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_desde date := retardos.semana_cerrada(); v_sem text := retardos.semana_id(v_desde); v jsonb; j jsonb; v_html text; v_m jsonb;
        v_para jsonb := retardos.unicos(retardos.rh_para() || coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb)); v_al text;
BEGIN
  v_m := retardos.metrica_lector(7);
  UPDATE retardos.alerta_modo SET veces_mostrada = veces_mostrada + 1 WHERE estado = 'abierta';
  j := jsonb_build_object(
    'semana', v_sem, 'desde', v_desde, 'hasta', v_desde + 6,
    'por_estado', coalesce((SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) n FROM retardos.jornada_semana WHERE semana = v_sem GROUP BY 1) z), '{}'::jsonb),
    'avisos', coalesce((SELECT jsonb_object_agg(nivel, n) FROM (SELECT nivel, count(*) n FROM retardos.caso WHERE tipo = 'jornada' AND periodo = v_sem GROUP BY 1) z), '{}'::jsonb),
    'por_revisar_abiertas', (SELECT count(*) FROM retardos.jornada_semana WHERE estado = 'revisar' AND revisado_por IS NULL),
    'medidas_propuestas', (SELECT count(*) FROM retardos.medida WHERE estado = 'propuesta'),
    'medidas_retenidas', (SELECT count(*) FROM retardos.medida WHERE estado = 'retenida'),
    'faltante_total', (SELECT round(sum(faltante), 2) FROM retardos.jornada_semana WHERE semana = v_sem AND estado = 'incumple'));
  v := jsonb_build_object(
    'semana', v_sem,
    'por_estado', coalesce((SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) n FROM retardos.caso WHERE tipo = 'retardo' GROUP BY estado) s), '{}'::jsonb),
    'retardos_semana', (SELECT count(*) FROM retardos.retardo WHERE estado = 'contado' AND fecha BETWEEN v_desde AND v_desde + 6),
    'casos_nuevos_semana', (SELECT count(*) FROM retardos.caso WHERE tipo = 'retardo' AND retardos.a_local(abierto_at)::date BETWEEN v_desde AND v_desde + 7),
    'firmas_por_recolectar', (SELECT count(*) FROM retardos.caso WHERE estado IN ('ESPERANDO_FIRMA','VENCIDO','ESCALADO')),
    'vencidos', (SELECT count(*) FROM retardos.caso WHERE estado IN ('VENCIDO','ESCALADO')),
    'hojas_por_confirmar', (SELECT count(*) FROM retardos.lectura WHERE estado = 'por_confirmar'),
    'suspension_no_aplicada', (SELECT count(*) FROM retardos.caso WHERE estado = 'RETENIDO'),
    'reincidentes', (SELECT count(*) FROM retardos.caso WHERE tipo = 'retardo' AND motivo_apertura = 'reincidencia' AND estado NOT IN ('CERRADO','CANCELADO_POR_RH')),
    'semaforo', coalesce((SELECT jsonb_object_agg(semaforo, n) FROM (SELECT semaforo, count(*) n FROM retardos.v_reincidencia GROUP BY 1) s), '{}'::jsonb),
    'alertas_abiertas', (SELECT count(*) FROM retardos.alerta_modo WHERE estado = 'abierta'),
    'lector', v_m,
    'acciones_verificadas_7d', (SELECT count(*) FROM retardos.bitacora WHERE a = 'ACCION_VERIFICADA' AND creado_at > now() - interval '7 days'),
    'jornada', j,
    'salud', retardos.salud());
  SELECT string_agg('<li>' || retardos.disparador_texto(a.disparador)
                    || coalesce(' Persona: ' || m.nombre, '') || ' (desde ' || to_char(retardos.a_local(a.creado_at), 'DD/MM/YYYY') || ')</li>', '')
    INTO v_al FROM retardos.alerta_modo a LEFT JOIN retardos.empleado m ON m.employee_id = a.employee_id WHERE a.estado = 'abierta';
  v_html := '<p>Resumen semanal de Retardos y jornada, semana ' || v_sem || ' (viernes ' || to_char(v_desde, 'DD/MM/YYYY')
    || ' a jueves ' || to_char(v_desde + 6, 'DD/MM/YYYY') || ', hora del centro, CST). Modo de sanciones: <b>'
    || coalesce(retardos.cfg_txt('modo_sanciones'), 'sin_suspension') || '</b>. Medidas de jornada: <b>'
    || coalesce(retardos.cfg_txt('modo_medidas_jornada'), 'retenidas') || '</b>.</p>'
    || '<p><b>Jornada semanal</b></p><ul>'
    || '<li>Cumplen: <b>' || coalesce(j->'por_estado'->>'cumple', '0') || '</b>. Incumplen: <b>' || coalesce(j->'por_estado'->>'incumple', '0')
    || '</b> (faltante total ' || coalesce(retardos.horas_txt((j->>'faltante_total')::numeric), '0:00') || ' h). Por revisar: <b>'
    || coalesce(j->'por_estado'->>'revisar', '0') || '</b>.</li>'
    || '<li>Avisos de la semana: 1.º ' || coalesce(j->'avisos'->>'1', '0') || ', 2.º ' || coalesce(j->'avisos'->>'2', '0')
    || ', 3.º ' || coalesce(j->'avisos'->>'3', '0') || '.</li>'
    || '<li>Semanas por revisar sin atender: <b>' || (j->>'por_revisar_abiertas') || '</b>. Propuestas de medida sin decidir: <b>'
    || (j->>'medidas_propuestas') || '</b>; decididas y retenidas: <b>' || (j->>'medidas_retenidas') || '</b>.</li></ul>'
    || '<p><b>Retardos</b></p><ul><li>Retardos contados en la semana: <b>' || (v->>'retardos_semana') || '</b></li>'
    || '<li>Casos nuevos en la semana: <b>' || (v->>'casos_nuevos_semana') || '</b></li>'
    || '<li>Firmas por recolectar (RH): <b>' || (v->>'firmas_por_recolectar') || '</b>, de ellas vencidas o escaladas: <b>' || (v->>'vencidos') || '</b></li>'
    || '<li>Hojas por confirmar: <b>' || (v->>'hojas_por_confirmar') || '</b></li>'
    || '<li>Nivel de suspensión alcanzado, no aplicado: <b>' || (v->>'suspension_no_aplicada') || '</b></li>'
    || '<li>Lector de hojas, últimos 7 días: <b>' || coalesce(v_m->>'aciertos', '0') || '</b> aciertos de <b>'
    || coalesce(v_m->>'decididas', '0') || '</b> hojas confirmadas por RH'
    || CASE WHEN v_m->>'pct_acierto' IS NOT NULL THEN ' (' || (v_m->>'pct_acierto') || '%)' ELSE '' END || '</li>'
    || '<li>Reincidencia acumulada: rojo ' || coalesce(v->'semaforo'->>'rojo', '0') || ', amarillo ' || coalesce(v->'semaforo'->>'amarillo', '0')
    || ', verde ' || coalesce(v->'semaforo'->>'verde', '0') || '</li></ul>'
    || CASE WHEN v_al IS NOT NULL THEN '<p><b>Alertas "Recomendación: activar modo suspensión" sin atender:</b></p><ul>' || v_al
            || '</ul><p>Atiéndelas en el panel (Reincidencia acumulada): cambiar a modo suspensión, posponer o descartar con motivo.</p>' ELSE '' END
    || '<p>Casos de retardo por estado: ' || coalesce((SELECT string_agg(key || ' ' || value, ', ') FROM jsonb_each_text(v->'por_estado')), 'ninguno') || '</p>'
    || '<p>Salud del sistema: ' || CASE WHEN (v->'salud'->>'ok')::boolean THEN 'sin problemas' ELSE 'con problemas, revisa el panel' END || '.</p>';
  PERFORM retardos.encolar('resumen:' || v_sem, NULL, 'resumen', v_para, '[]'::jsonb,
                           'Retardos y jornada: resumen semanal ' || v_sem, v_html);
  RETURN v;
END
$fn$;

-- ══ 17. SIMULACIÓN DE JORNADA (sólo lectura) ══════════════════════════════════
-- p = { semanas: 8, hasta?: viernes de la última semana, nomina?: [...] }
CREATE OR REPLACE FUNCTION retardos.simular_jornada(p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_n integer := coalesce((p->>'semanas')::int, 8);
  v_ult date := coalesce(retardos.semana_desde(nullif(p->>'hasta', '')::date), retardos.semana_cerrada());
  v_emp_ok integer[] := ARRAY(SELECT jsonb_array_elements_text(retardos.cfg('empresa_ids'))::int);
  v_vent integer := coalesce(retardos.cfg_txt('jornada_ventana_dias')::int, 90);
  w date; m record; j jsonb; v_nom jsonb; v_sem text; v_out jsonb := '[]'::jsonb; v_avisos jsonb := '{}'::jsonb;
  n_cumple integer; n_inc integer; n_rev integer; n_ex integer; s_ef numeric; n_dl integer; s_falt numeric; s_falt_rev numeric;
  n_aus integer; s_falt_aus numeric; v_mot jsonb; v_hist jsonb; n3 integer := 0; v_personas3 jsonb := '{}'::jsonb; lst date[]; k integer;
  dd jsonb; v_dias_sin integer; v_efd numeric;
BEGIN
  FOR i IN REVERSE (v_n - 1)..0 LOOP
    w := v_ult - 7 * i; v_sem := retardos.semana_id(w);
    n_cumple := 0; n_inc := 0; n_rev := 0; n_ex := 0; s_ef := 0; n_dl := 0; s_falt := 0; s_falt_rev := 0;
    n_aus := 0; s_falt_aus := 0; v_mot := '{}'::jsonb; v_hist := '{}'::jsonb;
    FOR m IN SELECT e.employee_id FROM retardos.empleado e WHERE e.activo AND e.company_id = ANY (v_emp_ok) LOOP
      SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', dd2->>'tipo', 'dias', dd2->'valores'->>'dias')), '[]'::jsonb) INTO v_nom
        FROM jsonb_array_elements(coalesce(p->'nomina', '[]'::jsonb)) x,
             jsonb_array_elements(CASE WHEN jsonb_typeof(x->'declaraciones') = 'array' THEN x->'declaraciones' ELSE '[]'::jsonb END) dd2
       WHERE (x->>'employee_id')::int = m.employee_id AND x->>'semana' = v_sem;
      j := retardos.jornada_calcular(m.employee_id, w, v_nom);
      -- promedio de horas efectivas por día laborado
      FOR dd IN SELECT * FROM jsonb_array_elements(j->'desglose') LOOP
        IF (dd->>'brutas')::numeric > 0 THEN n_dl := n_dl + 1; s_ef := s_ef + (dd->>'efectivas')::numeric; END IF;
      END LOOP;
      IF j->>'estado' = 'cumple' THEN n_cumple := n_cumple + 1;
      ELSIF j->>'estado' = 'exento' THEN n_ex := n_ex + 1;
      ELSIF j->>'estado' = 'revisar' THEN
        n_rev := n_rev + 1; s_falt_rev := s_falt_rev + (j->>'faltante')::numeric;
        SELECT v_mot || coalesce(jsonb_object_agg(mm, coalesce((v_mot->>mm)::int, 0) + 1), '{}'::jsonb) INTO v_mot
          FROM (SELECT DISTINCT jsonb_array_elements_text(x->'motivos') AS mm FROM jsonb_array_elements(j->'motivos_revision') x) z;
      ELSE
        n_inc := n_inc + 1; s_falt := s_falt + (j->>'faltante')::numeric;
        -- Parte del faltante explicada por días laborables sin ninguna asistencia (ausencia u olvido de checar todo el día).
        SELECT count(*) INTO v_dias_sin FROM jsonb_array_elements(j->'desglose') x
         WHERE (x->>'laborable')::boolean AND (x->>'brutas')::numeric = 0 AND x->>'prorrateo' IS NULL;
        IF v_dias_sin > 0 THEN
          n_aus := n_aus + 1;
          s_falt_aus := s_falt_aus + least((j->>'faltante')::numeric, v_dias_sin * (j->>'umbral_persona')::numeric / 5.0);
        END IF;
        -- Escalera simulada: avisos dentro de la ventana.
        lst := ARRAY(SELECT (jsonb_array_elements_text(coalesce(v_avisos->(m.employee_id::text), '[]'::jsonb)))::date);
        SELECT count(*) INTO k FROM unnest(lst) u WHERE u >= w - v_vent AND u < w;
        IF k + 1 >= 3 THEN n3 := n3 + 1; v_personas3 := v_personas3 || jsonb_build_object(m.employee_id::text, true); END IF;
        v_avisos := v_avisos || jsonb_build_object(m.employee_id::text, coalesce(v_avisos->(m.employee_id::text), '[]'::jsonb) || to_jsonb(w));
      END IF;
      v_efd := (j->>'horas_efectivas')::numeric;
      v_hist := v_hist || jsonb_build_object(CASE WHEN v_efd >= 48 THEN '48+' WHEN v_efd >= 45 THEN '45-48' WHEN v_efd >= 40 THEN '40-45'
                                                  WHEN v_efd >= 30 THEN '30-40' WHEN v_efd > 0 THEN '0-30' ELSE '0' END,
                                             coalesce((v_hist->>(CASE WHEN v_efd >= 48 THEN '48+' WHEN v_efd >= 45 THEN '45-48' WHEN v_efd >= 40 THEN '40-45'
                                                  WHEN v_efd >= 30 THEN '30-40' WHEN v_efd > 0 THEN '0-30' ELSE '0' END))::int, 0) + 1);
    END LOOP;
    v_out := v_out || jsonb_build_object('semana', v_sem, 'desde', w, 'cumple', n_cumple, 'incumple', n_inc, 'revisar', n_rev, 'exento', n_ex,
      'motivos_revision', v_mot, 'efectivas_prom_dia_laborado', CASE WHEN n_dl > 0 THEN round(s_ef / n_dl, 2) END,
      'faltante_total_incumple', round(s_falt, 2), 'faltante_por_dias_sin_asistencia', round(s_falt_aus, 2),
      'incumple_con_dias_sin_asistencia', n_aus, 'faltante_total_revisar', round(s_falt_rev, 2), 'efectivas_hist', v_hist);
  END LOOP;
  RETURN jsonb_build_object('semanas', v_out, 'personas_con_3er_aviso', (SELECT count(*) FROM jsonb_object_keys(v_personas3)),
    'terceros_avisos', n3, 'parametros', jsonb_build_object('umbral', retardos.cfg('jornada_umbral_horas'), 'comida_min', retardos.cfg('jornada_comida_min'),
      'fds', retardos.cfg('jornada_comida_fin_de_semana'), 'ventana_dias', v_vent, 'nomina_filas', jsonb_array_length(coalesce(p->'nomina', '[]'::jsonb))));
END
$fn$;

-- ══ 18. PANEL: jornada, revisión, medidas, festivos, plantillas ═════════════════
CREATE OR REPLACE FUNCTION retardos.panel_jornada(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH par AS (SELECT coalesce(retardos.semana_de_id(p->>'semana'), retardos.semana_cerrada()) AS desde),
  sem AS (SELECT par.desde, retardos.semana_id(par.desde) AS id FROM par),
  hist AS (
    SELECT js.employee_id,
           count(*) FILTER (WHERE js.estado = 'incumple' AND js.desde > (SELECT desde FROM sem) - 56) AS incumple_8s,
           (SELECT count(*) FROM retardos.caso c WHERE c.tipo = 'jornada' AND c.employee_id = js.employee_id AND c.estado <> 'CANCELADO_POR_RH'
              AND retardos.semana_de_id(c.periodo) > (SELECT desde FROM sem) - coalesce(retardos.cfg_txt('jornada_ventana_dias')::int, 90)) AS avisos_ventana,
           (SELECT max(c.nivel) FROM retardos.caso c WHERE c.tipo = 'jornada' AND c.employee_id = js.employee_id AND c.estado <> 'CANCELADO_POR_RH') AS max_aviso
      FROM retardos.jornada_semana js GROUP BY js.employee_id)
  SELECT jsonb_build_object('ok', true,
    'semana', (SELECT id FROM sem), 'desde', (SELECT desde FROM sem), 'hasta', (SELECT desde + 6 FROM sem),
    'semanas', coalesce((SELECT jsonb_agg(x ORDER BY x DESC) FROM (SELECT DISTINCT semana_desde AS x FROM (SELECT desde AS semana_desde FROM retardos.jornada_semana) z) q), '[]'::jsonb),
    'avisos_desde', retardos.cfg('jornada_desde'),
    'personas', coalesce((SELECT jsonb_agg(to_jsonb(js) - 'desglose' || jsonb_build_object(
        'nombre', m.nombre, 'departamento', m.departamento, 'desglose', js.desglose,
        'folio', c.folio, 'caso_estado', c.estado, 'aviso_n', c.nivel,
        'incumple_8s', coalesce(h.incumple_8s, 0), 'avisos_ventana', coalesce(h.avisos_ventana, 0),
        'semaforo', CASE WHEN js.estado = 'revisar' THEN 'gris'
                         WHEN coalesce(h.max_aviso, 0) >= 3 OR coalesce(h.incumple_8s, 0) >= 3 THEN 'rojo'
                         WHEN js.estado = 'incumple' OR coalesce(h.avisos_ventana, 0) > 0 THEN 'amarillo'
                         ELSE 'verde' END)
        ORDER BY CASE js.estado WHEN 'revisar' THEN 0 WHEN 'incumple' THEN 1 WHEN 'cumple' THEN 2 ELSE 3 END, m.nombre)
      FROM retardos.jornada_semana js LEFT JOIN retardos.empleado m ON m.employee_id = js.employee_id
      LEFT JOIN retardos.caso c ON c.id = js.caso_id LEFT JOIN hist h ON h.employee_id = js.employee_id
      WHERE js.semana = (SELECT id FROM sem)), '[]'::jsonb),
    'por_revisar', coalesce((SELECT jsonb_agg(jsonb_build_object('employee_id', js.employee_id, 'nombre', m.nombre, 'semana', js.semana,
        'desde', js.desde, 'horas_efectivas', js.horas_efectivas, 'umbral', js.umbral, 'motivos', js.motivos_revision, 'desglose', js.desglose)
        ORDER BY js.desde, m.nombre)
      FROM retardos.jornada_semana js LEFT JOIN retardos.empleado m ON m.employee_id = js.employee_id
      WHERE js.estado = 'revisar' AND js.revisado_por IS NULL), '[]'::jsonb),
    'reglas', jsonb_build_object('umbral', retardos.cfg('jornada_umbral_horas'), 'comida_min', retardos.cfg('jornada_comida_min'),
      'comida_fds', retardos.cfg('jornada_comida_fin_de_semana'), 'comida_fds_min_horas', retardos.cfg('jornada_comida_fds_min_horas'),
      'ventana_dias', retardos.cfg('jornada_ventana_dias'), 'modo_medidas', retardos.cfg('modo_medidas_jornada')))
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_medidas(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'modo_medidas_jornada', retardos.cfg('modo_medidas_jornada'),
    'medidas', coalesce((SELECT jsonb_agg(to_jsonb(md) || jsonb_build_object('folio', c.folio, 'caso_estado', c.estado, 'nombre', m.nombre,
                           'departamento', m.departamento) ORDER BY md.estado = 'propuesta' DESC, md.id DESC)
      FROM retardos.medida md JOIN retardos.caso c ON c.id = md.caso_id LEFT JOIN retardos.empleado m ON m.employee_id = md.employee_id), '[]'::jsonb))
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_festivo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_actor text := coalesce(p->>'actor', 'desconocido');
BEGIN
  IF coalesce(p->>'rol', 'lector') <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
  IF char_length(coalesce(p->>'motivo', p->>'nombre', '')) < 3 THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_OBLIGATORIO'); END IF;
  IF p->>'accion' = 'festivo_agregar' THEN
    INSERT INTO retardos.festivo (fecha, nombre, creado_por) VALUES ((p->>'fecha')::date, p->>'nombre', v_actor)
    ON CONFLICT (fecha) DO UPDATE SET nombre = EXCLUDED.nombre;
  ELSE
    DELETE FROM retardos.festivo WHERE fecha = (p->>'fecha')::date;
  END IF;
  PERFORM retardos.log(NULL, p->>'accion', v_actor, coalesce(p->>'motivo', p->>'nombre'), jsonb_build_object('fecha', p->>'fecha', 'nombre', p->>'nombre'));
  RETURN jsonb_build_object('ok', true);
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_config(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'config', (SELECT jsonb_object_agg(clave, jsonb_build_object('valor', valor, 'confirmado', confirmado, 'descripcion', descripcion)) FROM retardos.config),
    'escalera', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.nivel) FROM retardos.escalera e),
    'escalera_jornada', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.nivel) FROM retardos.escalera_jornada e),
    'exclusiones', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id DESC) FROM retardos.exclusion x WHERE x.activo),
    'festivos', (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.fecha) FROM retardos.festivo f WHERE f.fecha >= retardos.hoy_local() - 60),
    'plantillas', (SELECT jsonb_agg(jsonb_build_object('clave', t.clave, 'asunto', t.asunto, 'estado_texto', t.estado_texto, 'variables', t.variables) ORDER BY t.clave)
                   FROM retardos.plantilla t))
$fn$;

-- Cierra el 3er aviso de jornada cuando RH valida (la hoja firmada o la negativa).
CREATE OR REPLACE FUNCTION retardos.cerrar_jornada_validada(p_caso bigint, p_actor text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE c retardos.caso;
BEGIN
  SELECT * INTO c FROM retardos.caso WHERE id = p_caso;
  IF FOUND AND c.tipo = 'jornada' AND c.estado = 'VALIDADO_RH' THEN
    PERFORM retardos.transicionar(c.id, 'CERRADO', coalesce(p_actor, 'sistema'),
      'Tercer aviso de jornada firmado y validado; la medida sigue su propio curso (retenida hasta que Legal confirme)');
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_seguro(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_acc text := p->>'accion'; r jsonb; v_caso bigint;
BEGIN
  BEGIN
    INSERT INTO retardos.nonce (nonce, actor, accion) VALUES (p->>'nonce', coalesce(p->>'actor', '?'), v_acc);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REPLAY');
  END;
  IF v_acc = 'evidencia' THEN RETURN retardos.panel_evidencia(p); END IF;
  IF v_acc = 'calidad' THEN RETURN retardos.panel_calidad(p); END IF;
  IF v_acc = 'calidad_revisar' THEN RETURN retardos.panel_calidad_revisar(p); END IF;
  IF v_acc = 'hojas' THEN RETURN retardos.panel_hojas(p); END IF;
  IF v_acc = 'hoja_ver' THEN RETURN retardos.panel_hoja_ver(p); END IF;
  IF v_acc = 'reincidencia' THEN RETURN retardos.panel_reincidencia(p); END IF;
  IF v_acc = 'config' THEN RETURN retardos.panel_config(p); END IF;
  IF v_acc = 'jornada' THEN RETURN retardos.panel_jornada(p); END IF;
  IF v_acc = 'medidas' THEN RETURN retardos.panel_medidas(p); END IF;
  IF v_acc = 'jornada_revisar' THEN RETURN retardos.jornada_revisar(p); END IF;
  IF v_acc = 'medida_decidir' THEN RETURN retardos.medida_decidir(p); END IF;
  IF v_acc IN ('festivo_agregar','festivo_quitar') THEN RETURN retardos.panel_festivo(p); END IF;
  IF v_acc IN ('subir_hojas','subir_hoja') THEN
    RETURN retardos.panel_subir_hojas(CASE WHEN v_acc = 'subir_hoja'
      THEN p || jsonb_build_object('archivos', jsonb_build_array(jsonb_build_object('nombre', p->>'nombre', 'mime', p->>'mime',
                                   'contenido_b64', p->>'contenido_b64', 'folio', p->>'folio')))
      ELSE p END);
  END IF;
  IF v_acc IN ('hoja_confirmar','hoja_corregir','hoja_pedir_de_nuevo','hoja_descartar') THEN
    r := retardos.hoja_decidir(p);
    IF v_acc = 'hoja_confirmar' AND coalesce((r->>'ok')::boolean, false) THEN
      SELECT caso_id INTO v_caso FROM retardos.lectura WHERE id = (p->>'lectura_id')::bigint;
      PERFORM retardos.cerrar_jornada_validada(v_caso, p->>'actor');
    END IF;
    RETURN r;
  END IF;
  IF v_acc = 'alerta_atender' THEN RETURN retardos.alerta_atender(p); END IF;
  r := retardos.panel(p);
  IF v_acc = 'validar_firma' AND coalesce((r->>'ok')::boolean, false) THEN
    SELECT id INTO v_caso FROM retardos.caso WHERE folio = p->>'folio';
    PERFORM retardos.cerrar_jornada_validada(v_caso, p->>'actor');
  END IF;
  RETURN r;
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('ok', false, 'error', split_part(SQLERRM, ' ', 1), 'detalle', left(SQLERRM, 200));
END
$fn$;

-- ══ 19. FOLIOS JOR EN HOJAS Y RESPUESTAS POR CORREO ════════════════════════════
-- Mismas funciones de retardos_0006, con el folio (RET|JOR). Copiadas por programa, no a mano.
CREATE OR REPLACE FUNCTION retardos.hoja_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_bytes bytea; v_sha text; v_id bigint; v_mime text := lower(coalesce(p->>'mime', 'application/pdf'));
BEGIN
  BEGIN
    v_bytes := decode(p->>'contenido_b64', 'base64');
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_ILEGIBLE');
  END;
  IF v_bytes IS NULL OR length(v_bytes) < 1024 THEN RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_ILEGIBLE'); END IF;
  IF length(v_bytes) > 15000000 THEN RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_DEMASIADO_GRANDE'); END IF;
  IF v_mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp','image/tiff','image/heic','image/heif') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TIPO_NO_ACEPTADO');
  END IF;
  v_sha := encode(sha256(v_bytes), 'hex');
  SELECT id INTO v_id FROM retardos.hoja WHERE sha256 = v_sha;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'hoja_id', v_id, 'duplicada', true, 'sha256', v_sha); END IF;
  INSERT INTO retardos.hoja (sha256, nombre, mime, bytes, contenido, origen, folio_indicado, subido_por, graph_item_id, message_id)
  VALUES (v_sha, left(coalesce(p->>'nombre', 'hoja'), 200), v_mime, length(v_bytes), v_bytes,
          coalesce(p->>'origen', 'panel'), substring(coalesce(p->>'folio_indicado', '') FROM '(?:RET|JOR)-[0-9]{4}-[0-9]{4}'),
          p->>'subido_por', p->>'graph_item_id', p->>'message_id')
  ON CONFLICT (sha256) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM retardos.hoja WHERE sha256 = v_sha;
    RETURN jsonb_build_object('ok', true, 'hoja_id', v_id, 'duplicada', true, 'sha256', v_sha);
  END IF;
  PERFORM retardos.log(NULL, 'hoja_recibida', coalesce(p->>'subido_por', p->>'origen', 'sistema'), 'Hoja recibida por ' || coalesce(p->>'origen', 'panel'),
                       jsonb_build_object('hoja_id', v_id, 'sha256', v_sha, 'bytes', length(v_bytes)));
  RETURN jsonb_build_object('ok', true, 'hoja_id', v_id, 'duplicada', false, 'sha256', v_sha);
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.registrar_lectura(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE h retardos.hoja; pg jsonb; c retardos.caso; v_nombre text; v_sug text; v_det text; v_faltan text[];
        v_req text[]; v_neg boolean; v_folio text; v_lid bigint; v_out jsonb := '[]'::jsonb; v_coinc boolean;
        v_evid bigint; v_tipo text; v_ban jsonb; k text;
BEGIN
  SELECT * INTO h FROM retardos.hoja WHERE id = (p->>'hoja_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'HOJA_INEXISTENTE'); END IF;
  IF NOT coalesce((p->>'ok')::boolean, false) THEN
    UPDATE retardos.hoja SET estado = 'error', error = left(coalesce(p->>'error', 'desconocido'), 500) WHERE id = h.id;
    PERFORM retardos.latido(jsonb_build_object('workflow', 'retardos/hojas', 'ok', false, 'error',
                            'Procesador: ' || left(coalesce(p->>'error', 'desconocido'), 200)));
    RETURN jsonb_build_object('ok', true, 'estado', 'error');
  END IF;

  FOR pg IN SELECT * FROM jsonb_array_elements(coalesce(p->'paginas', '[]'::jsonb)) LOOP
    c := NULL; v_sug := NULL; v_det := NULL; v_faltan := '{}'; v_evid := NULL;
    v_ban := coalesce(pg->'banderas', '[]'::jsonb);
    v_folio := coalesce(substring(coalesce(pg->>'folio', '') FROM '(?:RET|JOR)-[0-9]{4}-[0-9]{4}'),
                        CASE WHEN jsonb_array_length(coalesce(p->'paginas', '[]'::jsonb)) = 1 THEN h.folio_indicado END);
    IF v_folio IS NOT NULL THEN SELECT * INTO c FROM retardos.caso WHERE folio = v_folio; END IF;
    v_neg := coalesce((pg->'negativa'->>'marcada')::boolean, false);

    IF coalesce((pg->>'qr_pagina')::int, 1) > 1 THEN
      v_sug := 'anexo';
    ELSIF v_ban ? 'posible_inyeccion' THEN
      v_sug := 'revisar_inyeccion';
    ELSIF c.id IS NULL THEN
      v_sug := 'revisar_folio'; v_det := CASE WHEN v_folio IS NULL THEN 'no se pudo leer el folio' ELSE 'el folio no existe' END;
    ELSIF c.estado IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA','RETENIDO') THEN
      v_sug := 'revisar_folio'; v_det := 'el caso ya no espera hoja (' || c.estado || ')';
    ELSIF coalesce(pg->>'legibilidad', 'mala') = 'mala' OR NOT coalesce((pg->>'geometria')::boolean, false) THEN
      v_sug := 'revisar_ilegible';
    ELSE
      SELECT m.nombre INTO v_nombre FROM retardos.empleado m WHERE m.employee_id = c.employee_id;
      v_coinc := retardos.nombre_coincide(v_nombre, pg->>'nombre_visible');
      IF v_coinc IS FALSE OR (pg->>'qr_nivel' IS NOT NULL AND (pg->>'qr_nivel')::int <> c.nivel) THEN
        v_sug := 'revisar_folio'; v_det := CASE WHEN v_coinc IS FALSE THEN 'el nombre impreso no es el del caso' ELSE 'el nivel no coincide' END;
      ELSIF coalesce((pg->'comentarios'->>'inconformidad')::boolean, false)
            OR (coalesce((pg->'comentarios'->>'presente')::boolean, false) AND pg->'comentarios'->>'inconformidad' IS NULL) THEN
        v_sug := 'revisar_impugnacion';
        v_det := CASE WHEN pg->'comentarios'->>'inconformidad' IS NULL THEN 'hay comentarios escritos que nadie ha leído' ELSE 'el comentario expresa inconformidad' END;
      ELSE
        v_req := ARRAY(SELECT jsonb_array_elements_text(retardos.cfg('firmas_requeridas')->(CASE WHEN v_neg THEN 'negativa' ELSE c.accion END)));
        FOREACH k IN ARRAY coalesce(v_req, '{}'::text[]) LOOP
          IF NOT coalesce((pg->'firmas'->k->>'presente')::boolean, false) THEN v_faltan := v_faltan || k; END IF;
        END LOOP;
        IF array_length(v_faltan, 1) > 0 THEN
          v_sug := 'revisar_falta_firma'; v_det := array_to_string(v_faltan, ', ');
        ELSE
          v_sug := 'lista_para_validar'; v_det := CASE WHEN v_neg THEN 'negativa a firmar con dos testigos' END;
        END IF;
      END IF;
    END IF;

    INSERT INTO retardos.lectura (hoja_id, pagina, folio_leido, folio_fuente, caso_id, resultado, sugerencia, sugerencia_texto,
                                  negativa, confianza, estado)
    VALUES (h.id, coalesce((pg->>'pagina')::int, 1), v_folio, pg->>'folio_fuente', c.id, pg, v_sug,
            retardos.sugerencia_texto(v_sug, v_det), v_neg, nullif(pg->>'confianza', '')::numeric,
            CASE WHEN v_sug = 'anexo' THEN 'anexo' ELSE 'por_confirmar' END)
    ON CONFLICT (hoja_id, pagina) DO NOTHING
    RETURNING id INTO v_lid;

    -- Ligar la hoja al caso como evidencia y dejar el caso esperando la confirmación de RH.
    IF v_lid IS NOT NULL AND c.id IS NOT NULL AND v_sug <> 'anexo'
       AND c.estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA','RETENIDO') THEN
      v_tipo := CASE WHEN v_neg THEN 'negativa_testigos' ELSE 'hoja_firmada' END;
      INSERT INTO retardos.evidencia (caso_id, sha256, nombre, mime, bytes, contenido, origen, tipo, subido_por, message_id)
      VALUES (c.id, h.sha256, h.nombre, h.mime, h.bytes, h.contenido,
              CASE WHEN h.origen IN ('correo','panel','carpeta','prueba') THEN h.origen ELSE 'panel' END,
              v_tipo, h.subido_por, h.message_id)
      ON CONFLICT (caso_id, sha256) DO NOTHING;
      IF c.estado IN ('ESPERANDO_FIRMA','VENCIDO','ESCALADO') THEN
        PERFORM retardos.transicionar(c.id, 'FIRMA_RECIBIDA', 'lector',
          'Hoja recibida (' || h.origen || '); pendiente de confirmar por RH. Sugerencia: ' || retardos.sugerencia_texto(v_sug, v_det),
          jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid, 'sugerencia', v_sug));
      ELSE
        PERFORM retardos.log(c.id, 'hoja_leida', 'lector', retardos.sugerencia_texto(v_sug, v_det),
                             jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid, 'sugerencia', v_sug));
      END IF;
      PERFORM retardos.encolar_plantilla(c.id, 'hoja_por_confirmar', 'aviso_rh', c.folio || ':hoja:' || h.id,
                                         retardos.rh_para(), '[]'::jsonb, NULL,
                                         jsonb_build_object('sugerencia', retardos.sugerencia_texto(v_sug, v_det)));
    ELSIF v_lid IS NOT NULL AND v_sug <> 'anexo' THEN
      PERFORM retardos.log(c.id, 'hoja_leida', 'lector', retardos.sugerencia_texto(v_sug, v_det),
                           jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid, 'sugerencia', v_sug));
    END IF;
    IF v_ban ? 'posible_inyeccion' THEN
      PERFORM retardos.log(c.id, 'posible_inyeccion', 'lector', 'La hoja trae texto que parece una instrucción. Se trató como dato y va a revisión de RH.',
                           jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid));
    END IF;
    v_out := v_out || jsonb_build_object('lectura_id', v_lid, 'pagina', pg->>'pagina', 'folio', v_folio, 'sugerencia', v_sug);
  END LOOP;

  UPDATE retardos.hoja SET estado = 'procesada', procesada_at = now(), error = NULL WHERE id = h.id;
  IF jsonb_array_length(v_out) = 0 THEN
    INSERT INTO retardos.lectura (hoja_id, pagina, resultado, sugerencia, sugerencia_texto, estado)
    VALUES (h.id, 1, jsonb_build_object('vacia', true), 'revisar_ilegible', retardos.sugerencia_texto('revisar_ilegible', 'no se encontró ninguna página legible'), 'por_confirmar')
    ON CONFLICT (hoja_id, pagina) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('ok', true, 'estado', 'procesada', 'lecturas', v_out);
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.registrar_respuesta(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_folio text; c retardos.caso; v_rem text := lower(trim(p->>'remitente')); v_clas text; a jsonb;
        v_validos integer := 0; v_total integer; v_mid text := p->>'message_id'; r jsonb; v_hojas jsonb := '[]'::jsonb;
        v_rh jsonb := retardos.rh_para();
BEGIN
  IF v_mid IS NULL THEN RAISE EXCEPTION 'SIN_MESSAGE_ID'; END IF;
  IF EXISTS (SELECT 1 FROM retardos.correo_entrante WHERE message_id = v_mid) THEN
    RETURN jsonb_build_object('ok', true, 'clasificacion', 'duplicado');
  END IF;
  v_folio := substring(coalesce(p->>'asunto', '') FROM '(?:RET|JOR)-[0-9]{4}-[0-9]{4}');
  v_total := jsonb_array_length(coalesce(p->'adjuntos', '[]'::jsonb));
  IF v_folio IS NOT NULL THEN SELECT * INTO c FROM retardos.caso WHERE folio = v_folio; END IF;

  -- Todo adjunto aceptable entra al procesador, venga de quien venga: RH decide.
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p->'adjuntos', '[]'::jsonb)) LOOP
    r := retardos.hoja_registrar(jsonb_build_object('nombre', a->>'nombre', 'mime', a->>'mime', 'contenido_b64', a->>'contenido_b64',
                                 'origen', 'correo', 'folio_indicado', v_folio, 'subido_por', 'correo:' || coalesce(v_rem, '?'),
                                 'message_id', v_mid));
    IF coalesce((r->>'ok')::boolean, false) THEN v_validos := v_validos + 1; v_hojas := v_hojas || (r->'hoja_id'); END IF;
  END LOOP;

  v_clas := CASE WHEN v_folio IS NULL THEN 'sin_folio'
                 WHEN c.id IS NULL THEN 'folio_inexistente'
                 WHEN c.estado IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA') THEN 'caso_cerrado'
                 WHEN v_total = 0 THEN 'sin_adjunto'
                 WHEN v_validos = 0 THEN 'adjunto_invalido'
                 WHEN NOT (v_rem IN (SELECT jsonb_array_elements_text(retardos.solo_emails(retardos.correos_de(c.employee_id))))
                           OR v_rem IN (SELECT jsonb_array_elements_text(coalesce(retardos.jefe_de(c.employee_id), '[]'::jsonb))))
                   THEN 'remitente_distinto'
                 ELSE 'ok' END;

  INSERT INTO retardos.correo_entrante (message_id, recibido_at, remitente, asunto, folio, caso_id, adjuntos, clasificacion)
  VALUES (v_mid, coalesce((p->>'recibido_at')::timestamptz, now()), coalesce(v_rem, ''), left(coalesce(p->>'asunto', ''), 300),
          v_folio, c.id, v_total, v_clas);

  IF c.id IS NOT NULL THEN
    PERFORM retardos.log(c.id, 'respuesta_' || v_clas, 'correo:' || coalesce(v_rem, '?'),
      CASE WHEN v_validos > 0 THEN 'Respuesta con hoja: entra al lector' ELSE 'Respuesta sin hoja válida' END,
      jsonb_build_object('message_id', v_mid, 'hojas', v_hojas));
  END IF;
  -- Sin hoja utilizable, o sin folio: lo ve RH (ya no se le pide nada al trabajador).
  IF v_validos = 0 OR v_clas IN ('sin_folio','folio_inexistente','caso_cerrado') THEN
    PERFORM retardos.encolar('revision:' || v_mid, c.id, 'revision_rh', v_rh, '[]'::jsonb,
      'Retardos: respuesta que requiere revisión (' || v_clas || ')',
      '<p>Llegó un correo al buzón de retardos que el sistema no pudo asociar a una hoja.</p><p>Clasificación: <b>'
      || v_clas || '</b><br>Folio en el asunto: ' || coalesce(v_folio, '(ninguno)') || '<br>Remitente: '
      || coalesce(v_rem, '') || '<br>Adjuntos: ' || v_total || ' (utilizables: ' || v_validos || ')</p>'
      || '<p>Si la persona escribió su versión, puede ser una impugnación: revísalo en el panel de Retardos.</p>');
  END IF;
  RETURN jsonb_build_object('ok', true, 'clasificacion', v_clas, 'folio', v_folio, 'adjuntos_validos', v_validos, 'hojas', v_hojas);
END
$fn$;

-- ══ 20. PERMISOS ══════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON retardos.jornada_semana, retardos.medida, retardos.escalera_jornada, retardos.folio_seq_jornada TO retardos_app;
GRANT DELETE ON retardos.festivo TO retardos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA retardos TO retardos_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;
