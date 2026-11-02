-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0008 · Alimentador de evidencia comercial (#448, paso 6 de la sesión del 2-nov)
--
-- El sugerido de «Tu día» de Ricardo sale de nomina_usa.evidencia_comercial (0002), y
-- hasta hoy nadie la alimentaba: el sugerido salía 0 y todo comercial de más de 10 % se
-- marcaba como excepción. Esto agrega lo que el workflow nomina-usa/evidencia necesita:
--   · banderas en config, con evidencia_activa = false (APAGADO por omisión);
--   · evidencia_parametros(): a quién evaluar y con qué tarjeta y proveedores;
--   · evidencia_registrar(p): reemplaza, por persona y día, las horas comerciales que
--     calculó el alimentador. Con la bandera apagada NO escribe nada.
-- La regla vive en shared/nomina-usa/evidencia.js (la misma que prueba fase-g).
-- Reglas de db/README.md: idempotente, etiquetas de dólar con nombre, sin dólar seguido
-- de comilla o dígito (regla 8), nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO nomina_usa.config (clave, valor, nota) VALUES
  ('evidencia_activa',       'false'::jsonb, 'Alimentador de evidencia comercial (#448). false = no lee Odoo ni escribe evidencia; el sugerido sigue en 0. Solo Esteban.'),
  ('evidencia_tarjetas',     '{"123": 98}'::jsonb, 'Diario de tarjeta (account.journal id) -> employee_id. 123 = Chase Ink Unlimited 9207 (Ricardo).'),
  ('evidencia_radio_m',      '500'::jsonb, 'Metros alrededor de la planta de la SO para contar la checada como obra.'),
  ('evidencia_min_puntos',   '2'::jsonb, 'Checadas de otras personas con esa SO que tienen que coincidir para fijar la planta.'),
  ('evidencia_proveedores',  '["platt","grainger","home depot","lowe","elliott electric","graybar","ferguson","fastenal","mcmaster","border states","crescent electric","wesco","rexel","mayer electric","ced "]'::jsonb,
                             'Palabras que identifican una compra de material en payment_ref (minúsculas).')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE nomina_usa.evidencia_comercial ADD COLUMN IF NOT EXISTS origen  text;
ALTER TABLE nomina_usa.evidencia_comercial ADD COLUMN IF NOT EXISTS detalle jsonb;
CREATE INDEX IF NOT EXISTS evidencia_emp_fecha_idx ON nomina_usa.evidencia_comercial (employee_id, fecha);

CREATE OR REPLACE FUNCTION nomina_usa.evidencia_parametros() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'activa', coalesce(nomina_usa.cfg('evidencia_activa') = 'true'::jsonb, false),
    'tarjetas', coalesce(nomina_usa.cfg('evidencia_tarjetas'), '{}'::jsonb),
    'radio_m', coalesce(nomina_usa.cfg('evidencia_radio_m'), '500'::jsonb),
    'min_puntos', coalesce(nomina_usa.cfg('evidencia_min_puntos'), '2'::jsonb),
    'proveedores', coalesce(nomina_usa.cfg('evidencia_proveedores'), '[]'::jsonb),
    'tope_horas', coalesce(nomina_usa.cfg('salida_faltante_horas'), '14'::jsonb),
    'personas', coalesce((SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'zona', coalesce(zona_horaria, 'America/Monterrey')))
                            FROM nomina_usa.ficha WHERE activo AND tipo_pago_usa = 'supervisor_comercial'), '[]'::jsonb))
$fn$;

-- p = { dias: [{employee_id, fecha, horas_checadas, horas_comerciales, sugerido, bloques:[...], compras_material:[...]}] }
-- Por cada persona y día borra lo que puso el alimentador antes y vuelve a escribir: así
-- una asistencia que se cerró o se corrigió en Odoo se recalcula, y nada se duplica.
CREATE OR REPLACE FUNCTION nomina_usa.evidencia_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE d jsonb; n integer := 0; v_emp integer; v_fecha date;
BEGIN
  IF NOT coalesce(nomina_usa.cfg('evidencia_activa') = 'true'::jsonb, false) THEN
    RETURN jsonb_build_object('ok', true, 'activa', false, 'escritas', 0);
  END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p->'dias', '[]'::jsonb)) LOOP
    v_emp := (d->>'employee_id')::integer; v_fecha := (d->>'fecha')::date;
    IF v_emp IS NULL OR v_fecha IS NULL THEN CONTINUE; END IF;
    DELETE FROM nomina_usa.evidencia_comercial WHERE employee_id = v_emp AND fecha = v_fecha AND origen = 'alimentador';
    INSERT INTO nomina_usa.evidencia_comercial (employee_id, fecha, horas, fuente, referencia, origen, detalle)
    VALUES (v_emp, v_fecha, least(24, greatest(0, coalesce((d->>'horas_comerciales')::numeric, 0))), 'checada',
            'sugerido ' || coalesce(d->>'sugerido', '0') || ' %', 'alimentador',
            jsonb_build_object('horas_checadas', d->'horas_checadas', 'sugerido', d->'sugerido', 'bloques', d->'bloques', 'compras_material', d->'compras_material'));
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'activa', true, 'escritas', n);
END
$fn$;

GRANT SELECT, INSERT, UPDATE, DELETE ON nomina_usa.evidencia_comercial TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
