-- La exportación lleva el conjunto filtrado COMPLETO, en el orden del prototipo: fecha descendente.
SELECT json_build_object(
  'total',      (SELECT count(*) FROM flt),
  'por_moneda', (SELECT j FROM por_moneda),
  'filas', (SELECT coalesce(json_agg(json_build_object(
              'fecha', to_char(fecha, 'YYYY-MM-DD'), 'monto', monto::text, 'mon', mon, 'desc', descr, 'banco', banco,
              'cuenta', cuenta, 'cid', cid, 'ref', ref, 'tipo', tipo, 'periodo', periodo, 'fuente', fuente, 'sha', sha256)
              ORDER BY fecha DESC, src, ord DESC), '[]')
            FROM flt)
) AS r;
