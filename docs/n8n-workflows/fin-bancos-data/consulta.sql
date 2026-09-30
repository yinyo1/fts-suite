,
s AS (SELECT coalesce(p.f->>'sort', 'fecha') AS k, coalesce((p.f->>'dir')::int, -1) AS d, coalesce((p.f->>'offset')::int, 0) AS off FROM p),
pag AS (
  -- El orden va en row_number(): una CTE ordenada NO garantiza el orden de json_agg; `rn` sí.
  SELECT q.* FROM (
    SELECT flt.*, row_number() OVER (ORDER BY
    CASE WHEN s.k = 'fecha'   AND s.d =  1 THEN flt.fecha END ASC,
    CASE WHEN s.k = 'fecha'   AND s.d = -1 THEN flt.fecha END DESC,
    CASE WHEN s.k = 'monto'   AND s.d =  1 THEN abs(flt.monto) END ASC,     -- Monto ordena por MAGNITUD
    CASE WHEN s.k = 'monto'   AND s.d = -1 THEN abs(flt.monto) END DESC,
    CASE WHEN s.k = 'mon'     AND s.d =  1 THEN flt.mon     COLLATE "C" END ASC,
    CASE WHEN s.k = 'mon'     AND s.d = -1 THEN flt.mon     COLLATE "C" END DESC,
    CASE WHEN s.k = 'desc'    AND s.d =  1 THEN flt.descr   COLLATE "C" END ASC,
    CASE WHEN s.k = 'desc'    AND s.d = -1 THEN flt.descr   COLLATE "C" END DESC,
    CASE WHEN s.k = 'banco'   AND s.d =  1 THEN flt.banco   COLLATE "C" END ASC,
    CASE WHEN s.k = 'banco'   AND s.d = -1 THEN flt.banco   COLLATE "C" END DESC,
    CASE WHEN s.k = 'cuenta'  AND s.d =  1 THEN flt.cuenta  COLLATE "C" END ASC,
    CASE WHEN s.k = 'cuenta'  AND s.d = -1 THEN flt.cuenta  COLLATE "C" END DESC,
    CASE WHEN s.k = 'ref'     AND s.d =  1 THEN flt.ref     COLLATE "C" END ASC,
    CASE WHEN s.k = 'ref'     AND s.d = -1 THEN flt.ref     COLLATE "C" END DESC,
    CASE WHEN s.k = 'tipo'    AND s.d =  1 THEN flt.tipo    COLLATE "C" END ASC,
    CASE WHEN s.k = 'tipo'    AND s.d = -1 THEN flt.tipo    COLLATE "C" END DESC,
    CASE WHEN s.k = 'periodo' AND s.d =  1 THEN flt.periodo COLLATE "C" END ASC,
    CASE WHEN s.k = 'periodo' AND s.d = -1 THEN flt.periodo COLLATE "C" END DESC,
    CASE WHEN s.k = 'fuente'  AND s.d =  1 THEN flt.fuente  COLLATE "C" END ASC,
    CASE WHEN s.k = 'fuente'  AND s.d = -1 THEN flt.fuente  COLLATE "C" END DESC,
    flt.fecha DESC, flt.src, flt.ord DESC                                    -- desempate estable
    ) AS rn
    FROM flt CROSS JOIN s
  ) q
  WHERE q.rn > (SELECT off FROM s) AND q.rn <= (SELECT off FROM s) + 500
),
catalogo AS (
  SELECT coalesce(json_agg(json_build_object('cid', cid, 'banco', banco, 'nombre', alias, 'masc', masc, 'mon', mon,
                                             'n', n, 'periodos', periodos) ORDER BY banco, alias, masc), '[]') AS j
  FROM (SELECT x.cid, x.banco, x.alias, x.masc, x.mon, count(*) AS n,
               (SELECT json_agg(pp ORDER BY pp) FROM (
                  SELECT DISTINCT e.periodo AS pp FROM bancos.v_estados_validados e
                   WHERE lower(regexp_replace(e.banco || '-' || e.alias || '-' || right(e.numero_mask, 4), '[^A-Za-z0-9]+', '-', 'g')) = x.cid
                  UNION SELECT DISTINCT x2.periodo FROM x x2 WHERE x2.cid = x.cid) q) AS periodos
        FROM x GROUP BY x.cid, x.banco, x.alias, x.masc, x.mon) c
)
SELECT json_build_object(
  'total',      (SELECT count(*) FROM flt),
  'offset',     (SELECT off FROM s),
  'por_pagina', 500,
  'por_moneda', (SELECT j FROM por_moneda),
  'catalogo',   (SELECT j FROM catalogo),
  'actualizado', (SELECT max(creado_at) FROM bancos.v_estados_validados),
  'filas', (SELECT coalesce(json_agg(json_build_object(
              'fecha', to_char(fecha, 'YYYY-MM-DD'), 'monto', monto::text, 'mon', mon, 'desc', descr, 'banco', banco,
              'cuenta', cuenta, 'cid', cid, 'ref', ref, 'tipo', tipo, 'periodo', periodo, 'fuente', fuente, 'sha', sha256) ORDER BY rn), '[]')
            FROM pag)
) AS r;
