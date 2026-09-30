-- Camino DIRECTO de la doble verificación (#370): otras palabras, mismas vistas, como bancos_lector.
-- No comparte una línea con el SQL del motor: si los dos coinciden, no es porque se copien.
SET LOCAL ROLE bancos_lector;
SELECT json_build_object(
  'todo', (SELECT json_agg(x ORDER BY x.mon) FROM (
      SELECT moneda::text AS mon, count(*) AS n, sum(abono)::text AS abonos, (-sum(cargo))::text AS cargos, sum(abono - cargo)::text AS neto
      FROM bancos.v_movimientos_validados GROUP BY moneda) x),
  'jeeves_n', (SELECT count(*) FROM bancos.v_jeeves_movimientos_pdf),
  's2', (SELECT json_agg(x ORDER BY x.mon) FROM (
      SELECT moneda::text AS mon, count(*) AS n, sum(abono)::text AS abonos, (-sum(cargo))::text AS cargos, sum(abono - cargo)::text AS neto
      FROM bancos.v_movimientos_validados
      WHERE numero_mask LIKE '%3326' AND fecha_operacion BETWEEN DATE '2026-01-01' AND DATE '2026-08-31'
        AND cargo > 0 AND (descripcion ILIKE '%spei%' OR coalesce(referencia, '') ILIKE '%spei%') GROUP BY moneda) x),
  's2_primera', (SELECT json_build_object('fecha', fecha_operacion::text, 'monto', (abono - cargo)::text, 'desc', descripcion)
      FROM bancos.v_movimientos_validados
      WHERE numero_mask LIKE '%3326' AND fecha_operacion BETWEEN DATE '2026-01-01' AND DATE '2026-08-31'
        AND cargo > 0 AND (descripcion ILIKE '%spei%' OR coalesce(referencia, '') ILIKE '%spei%')
      ORDER BY fecha_operacion DESC, movimiento_id DESC LIMIT 1),
  's2_ultima', (SELECT json_build_object('fecha', fecha_operacion::text, 'monto', (abono - cargo)::text, 'desc', descripcion)
      FROM bancos.v_movimientos_validados
      WHERE numero_mask LIKE '%3326' AND fecha_operacion BETWEEN DATE '2026-01-01' AND DATE '2026-08-31'
        AND cargo > 0 AND (descripcion ILIKE '%spei%' OR coalesce(referencia, '') ILIKE '%spei%')
      ORDER BY fecha_operacion ASC, movimiento_id ASC LIMIT 1),
  'max_abs', (SELECT max(greatest(cargo, abono))::text FROM bancos.v_movimientos_validados),
  'cuentas', (SELECT count(DISTINCT numero_mask) FROM bancos.v_estados_validados),
  'ult', (SELECT max(creado_at) FROM bancos.v_estados_validados)
) AS d;
