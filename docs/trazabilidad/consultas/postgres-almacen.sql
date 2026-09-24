-- TMP OTPD4IG2gZj5AxEs · nodo «PG - Resumen del almacen comercial»
-- SOLO LECTURA. Rol comercial_app. Ejecutado 2026-09-24, ejecucion 111884.
WITH ult AS (
  SELECT DISTINCT ON (machote_id) machote_id, version, documento, total, moneda, estado
    FROM comercial.machote_version ORDER BY machote_id, version DESC
), m AS (
  SELECT x.*, u.documento, u.version AS ult_version
    FROM comercial.machote x JOIN ult u ON u.machote_id = x.id
   WHERE x.deleted_at IS NULL
)
SELECT
  count(*)                                             AS machotes_no_borrados,
  count(*) FILTER (WHERE archivado_at IS NULL)         AS vivos,
  count(*) FILTER (WHERE odoo_lead_id IS NOT NULL)     AS con_lead,
  count(*) FILTER (WHERE odoo_so_id IS NOT NULL)       AS con_so_id,
  count(*) FILTER (WHERE confirmada_at IS NOT NULL)    AS confirmadas,
  count(*) FILTER (WHERE odoo_project_id IS NOT NULL)  AS con_proyecto,
  count(*) FILTER (WHERE pago_dias IS NOT NULL)        AS con_pago_dias,
  count(*) FILTER (WHERE incoterm_code IS NOT NULL)    AS con_incoterm,
  count(*) FILTER (WHERE vigencia_dias IS NOT NULL)    AS con_vigencia,
  count(*) FILTER (WHERE documento ? 'iva')            AS doc_con_iva,
  count(*) FILTER (WHERE documento ? 'viaje')          AS doc_con_viaje,
  count(*) FILTER (WHERE documento ? 'pais')           AS doc_con_pais
  FROM m;

-- nodo «PG - Conteo por tabla del esquema comercial»
SELECT 'machote' AS tabla, count(*) AS filas FROM comercial.machote
UNION ALL SELECT 'machote_version', count(*) FROM comercial.machote_version
UNION ALL SELECT 'evidencia',       count(*) FROM comercial.evidencia
UNION ALL SELECT 'propuesta',       count(*) FROM comercial.propuesta
UNION ALL SELECT 'expediente',      count(*) FROM comercial.expediente
UNION ALL SELECT 'compuerta_envio', count(*) FROM comercial.compuerta_envio
UNION ALL SELECT 'handoff',         count(*) FROM comercial.handoff
UNION ALL SELECT 'confirmacion',    count(*) FROM comercial.confirmacion
UNION ALL SELECT 'documento_orden', count(*) FROM comercial.documento_orden
ORDER BY 1;
