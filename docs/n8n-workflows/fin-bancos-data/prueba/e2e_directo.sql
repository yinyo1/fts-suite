-- Camino DIRECTO para cotejar las descargas del e2e (#370): General …3326, 2026-01-01 a 2026-09-30, "spei".
SET LOCAL ROLE bancos_lector;
WITH f AS (
  SELECT movimiento_id, fecha_operacion, moneda::text AS mon, abono - cargo AS monto
  FROM bancos.v_movimientos_validados
  WHERE numero_mask LIKE '%3326' AND fecha_operacion BETWEEN DATE '2026-01-01' AND DATE '2026-09-30'
    AND (descripcion ILIKE '%spei%' OR coalesce(referencia, '') ILIKE '%spei%'))
SELECT json_build_object(
  'n', (SELECT count(*) FROM f),
  'por_moneda', (SELECT json_agg(x ORDER BY x.mon) FROM (SELECT mon, count(*) AS n,
      coalesce(sum(monto) FILTER (WHERE monto > 0), 0)::text AS abonos, coalesce(sum(monto) FILTER (WHERE monto < 0), 0)::text AS cargos,
      sum(monto)::text AS neto FROM f GROUP BY mon) x),
  'primera', (SELECT json_build_object('fecha', fecha_operacion::text, 'monto', monto::text) FROM f ORDER BY fecha_operacion DESC, movimiento_id DESC LIMIT 1),
  'ultima',  (SELECT json_build_object('fecha', fecha_operacion::text, 'monto', monto::text) FROM f ORDER BY fecha_operacion ASC, movimiento_id ASC LIMIT 1)
) AS d;
