-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0008 · Calendario tolerante a campos vacíos (#334, reglas R3)
--
-- La primera pasada de detectar con la 0007 falló con "cannot extract elements from a
-- scalar": una persona con un calendario que el lector no alcanzó a leer llega con
-- calendario.dias = null (JSON null, no ausente) y la 0007 lo trataba como arreglo.
-- Aquí se acepta cualquier forma: si no es arreglo, el calendario queda sin días.
-- Sin llaves dobles ni patrones de reemplazo de JS (retardos_0001 reglas 7 y 8).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION retardos.sincronizar_calendarios(p jsonb) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
  UPDATE retardos.empleado m SET
         calendario_id = CASE WHEN jsonb_typeof(x->'calendario'->'id') = 'number' THEN (x->'calendario'->>'id')::int END,
         calendario_nombre = CASE WHEN jsonb_typeof(x->'calendario'->'nombre') = 'string' THEN x->'calendario'->>'nombre' END,
         cal_horas_semana = CASE WHEN jsonb_typeof(x->'calendario'->'horas_semana') = 'number' THEN (x->'calendario'->>'horas_semana')::numeric END,
         cal_dias = CASE WHEN jsonb_typeof(x->'calendario'->'dias') = 'array'
                         THEN ARRAY(SELECT jsonb_array_elements_text(x->'calendario'->'dias')::int) END,
         cal_tiene_comida = CASE WHEN jsonb_typeof(x->'calendario'->'tiene_comida') = 'boolean' THEN (x->'calendario'->>'tiene_comida')::boolean END
    FROM jsonb_array_elements(coalesce(p->'empleados', '[]'::jsonb)) x
   WHERE m.employee_id = (x->>'employee_id')::int AND x ? 'calendario';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;
