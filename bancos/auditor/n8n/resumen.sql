-- fts_bancos_auditor_resumen (issue #346): lo auditado HOY (Monterrey), para el resumen de las 17:30 a Esteban.
SET LOCAL ROLE bancos_auditor;
SELECT bancos.es_dia_habil(bancos.hoy_mty()) AS habil, to_char(bancos.hoy_mty(), 'DD/MM/YYYY') AS hoy,
  (SELECT coalesce(json_agg(a ORDER BY a.id), '[]') FROM (
     SELECT id, tipo, veredicto, n_estados, n_movimientos, objetivo, coalesce(conteos->>'objetivo1', conteos->>'objetivo2') AS objetivo1, conteos->'hallazgos_por_codigo' AS codigos,
            onedrive_ruta, correo_status, to_char(terminada_en AT TIME ZONE 'America/Monterrey', 'HH24:MI') AS hora
     FROM bancos.auditorias
     WHERE tipo <> 'prueba' AND (iniciada_en AT TIME ZONE 'America/Monterrey')::date = bancos.hoy_mty()) a) AS auditorias,
  (SELECT count(*) FROM bancos.auditorias_pendientes WHERE cerrada_en IS NULL) AS pendientes_abiertas;
