-- ═══ fin/bancos-data · la base común de las dos consultas (issue #370) ═══
-- SÓLO LECTURA, como bancos_lector y sobre vistas. Este módulo jamás escribe en el esquema bancos.
-- Parámetro 1 = el filtro en JSON, codificado en base64 por `Code - Verificar` (una lista separada por comas
-- no aguanta un JSON; base64 no lleva comas). Ningún valor del usuario se concatena al SQL.
--
-- u   : BBVA (v_movimientos_validados) + Jeeves (PDF de ciclos validados) en una sola forma. Jeeves
--       hoy tiene 0 filas; el día que haya ciclos validados, sus tarjetas entran solas al catálogo.
--       Convención de la pantalla: cargo NEGATIVO, abono POSITIVO. En Jeeves monto_mxn positivo es
--       cargo, por eso se invierte. Jeeves es UNA cuenta (un estado por ciclo); la tarjeta de cada
--       movimiento va enmascarada a 4 dígitos en Referencia.
-- flt : el filtro del usuario. Cuentas NULL = todas; [] = ninguna.
SET LOCAL ROLE bancos_lector;
WITH p AS (SELECT convert_from(decode($1, 'base64'), 'UTF8')::jsonb AS f),
u AS (
  SELECT 'B' AS src, m.movimiento_id AS ord, m.fecha_operacion AS fecha, (m.abono - m.cargo) AS monto, m.moneda::text AS mon,
         coalesce(m.descripcion, '') AS descr, m.banco, m.alias, m.numero_mask AS masc,
         lower(regexp_replace(m.banco || '-' || m.alias || '-' || right(m.numero_mask, 4), '[^A-Za-z0-9]+', '-', 'g')) AS cid,
         coalesce(m.referencia, '') AS ref, m.periodo, m.archivo AS fuente, m.sha256
  FROM bancos.v_movimientos_validados m
  UNION ALL
  SELECT 'J', j.movimiento_id, coalesce(j.fecha, j.fecha_hora::date), -j.monto_mxn, 'MXN',
         coalesce(j.comercio, ''), 'Jeeves', 'Tarjeta corporativa', '',
         'jeeves', coalesce('Tarjeta …' || j.tarjeta, ''), j.ciclo, c.archivo, c.sha256
  FROM bancos.v_jeeves_movimientos_pdf j JOIN bancos.v_jeeves_ciclos c ON c.ciclo = j.ciclo
),
x AS (SELECT u.*, CASE WHEN u.monto < 0 THEN 'cargo' ELSE 'abono' END AS tipo, trim(u.alias || ' ' || u.masc) AS cuenta FROM u),
flt AS (
  SELECT x.* FROM x CROSS JOIN p
  WHERE (p.f->>'desde' IS NULL OR x.fecha >= (p.f->>'desde')::date)
    AND (p.f->>'hasta' IS NULL OR x.fecha <= (p.f->>'hasta')::date)
    AND (jsonb_typeof(p.f->'cuentas') IS DISTINCT FROM 'array' OR x.cid IN (SELECT jsonb_array_elements_text(p.f->'cuentas')))
    AND (coalesce(p.f->>'tipo', '') = '' OR x.tipo = p.f->>'tipo')
    AND (coalesce(p.f->>'texto', '') = '' OR strpos(lower(x.descr), lower(p.f->>'texto')) > 0
                                          OR strpos(lower(x.ref), lower(p.f->>'texto')) > 0)
),
por_moneda AS (
  SELECT coalesce(json_agg(json_build_object('mon', mon, 'n', n, 'abonos', abonos, 'cargos', cargos, 'neto', neto) ORDER BY mon), '[]') AS j
  FROM (SELECT mon, count(*) AS n,
               coalesce(sum(monto) FILTER (WHERE monto > 0), 0)::text AS abonos,
               coalesce(sum(monto) FILTER (WHERE monto < 0), 0)::text AS cargos,
               coalesce(sum(monto), 0)::text AS neto
        FROM flt GROUP BY mon) s
)
