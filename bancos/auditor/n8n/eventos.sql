-- fts_bancos_auditor_eventos (issue #346): encola auditorías por evento. Corre como bancos_app, que en
-- bancos.auditorias_pendientes SÓLO puede insertar. Idempotente por clave (ON CONFLICT DO NOTHING, sin
-- objetivo, que no pide SELECT sobre la cola). Sólo mira lo ocurrido después del arranque del auditor.
-- SET LOCAL: el rol vale sólo dentro de esta consulta (una transacción implícita) y no se queda pegado en el
-- pool de conexiones de n8n, que comparten otros workflows con la misma credencial.
SET LOCAL ROLE bancos_app;
-- a) lote del buzón con al menos un archivo
INSERT INTO bancos.auditorias_pendientes (motivo, clave, corrida_id, detalle)
SELECT 'lote_buzon', 'lote:' || c.id, c.id, jsonb_build_object('leidos', c.leidos, 'validados', c.validados, 'rechazados', c.rechazados, 'duplicados', c.duplicados)
FROM bancos.corridas c
WHERE c.origen IN ('cron', 'manual') AND c.terminada_at > timestamptz '2026-09-28 10:21:51+00' AND c.leidos > 0
ON CONFLICT DO NOTHING;
-- b) un mes queda completo: las tres cuentas BBVA con estado validado vigente
INSERT INTO bancos.auditorias_pendientes (motivo, clave, periodo, detalle)
SELECT 'mes_completo', 'mes:' || e.periodo, e.periodo, jsonb_build_object('cuentas', count(DISTINCT e.cuenta_id))
FROM bancos.estados_vigentes e JOIN bancos.archivos a ON a.id = e.archivo_id AND a.estado = 'validado'
JOIN bancos.cuentas k ON k.id = e.cuenta_id AND k.banco = 'BBVA' AND k.activa
GROUP BY e.periodo
HAVING count(DISTINCT e.cuenta_id) = (SELECT count(*) FROM bancos.cuentas WHERE banco = 'BBVA' AND activa)
   AND max(a.recibido_at) > timestamptz '2026-09-28 10:21:51+00'
ON CONFLICT DO NOTHING;
-- c) corrida fallida, archivo rechazado, descuadre
INSERT INTO bancos.auditorias_pendientes (motivo, clave, corrida_id, detalle)
SELECT 'corrida_fallida', 'falla:' || c.id, c.id, jsonb_build_object('origen', c.origen, 'graph_ok', c.graph_ok, 'con_error', c.error IS NOT NULL)
FROM bancos.corridas c
WHERE c.iniciada_at > timestamptz '2026-09-28 10:21:51+00' AND (c.error IS NOT NULL OR c.graph_ok = false)
ON CONFLICT DO NOTHING;
INSERT INTO bancos.auditorias_pendientes (motivo, clave, archivo_id, corrida_id, periodo, detalle)
SELECT 'archivo_rechazado', 'rechazo:' || a.id, a.id, a.corrida_id, a.periodo, jsonb_build_object('estado', a.estado, 'origen', a.origen)
FROM bancos.archivos a
WHERE a.recibido_at > timestamptz '2026-09-28 10:21:51+00' AND a.estado IN ('rechazado', 'no_cuadra', 'sospechoso') AND a.origen = 'buzon'
ON CONFLICT DO NOTHING;
INSERT INTO bancos.auditorias_pendientes (motivo, clave, corrida_id, detalle)
SELECT 'descuadre', 'v3:' || v.id, v.corrida_id, jsonb_build_object('estado_id', v.estado_id)
FROM bancos.validaciones_v3 v
WHERE v.creado_at > timestamptz '2026-09-28 10:21:51+00' AND v.resultado = 'descuadre'
ON CONFLICT DO NOTHING;
-- d) correos fuera de lo esperado: solicitud duplicada, solicitud que no salió, acuse que no salió
INSERT INTO bancos.auditorias_pendientes (motivo, clave, detalle)
SELECT 'correo_fuera_de_lo_esperado', 'solicitud_duplicada:' || k.hoy, jsonb_build_object('dia', k.hoy, 'n', count(*))
FROM bancos.correos k WHERE k.modo = 'real' AND k.tipo = 'solicitud' AND k.hoy >= date '2026-09-28'
GROUP BY k.hoy HAVING count(*) > 1
ON CONFLICT DO NOTHING;
INSERT INTO bancos.auditorias_pendientes (motivo, clave, detalle)
SELECT 'correo_fuera_de_lo_esperado', 'solicitud_no_salio:' || d::date, jsonb_build_object('dia', d::date)
FROM generate_series(date '2026-09-28', bancos.hoy_mty(), interval '1 day') g(d)
WHERE bancos.es_dia_habil(d::date)
  AND (now() AT TIME ZONE 'America/Monterrey') > d::date + CASE WHEN d::date = date '2026-09-28' THEN time '10:20' ELSE time '09:20' END
  AND EXISTS (SELECT 1 FROM bancos.huecos h WHERE h.resuelto_en IS NULL)
  AND NOT EXISTS (SELECT 1 FROM bancos.correos k WHERE k.modo = 'real' AND k.tipo = 'solicitud' AND k.hoy = d::date)
ON CONFLICT DO NOTHING;
INSERT INTO bancos.auditorias_pendientes (motivo, clave, corrida_id, detalle)
SELECT 'correo_fuera_de_lo_esperado', 'acuse_no_salio:' || c.id, c.id, jsonb_build_object('leidos', c.leidos)
FROM bancos.corridas c
WHERE c.origen = 'cron' AND c.leidos > 0 AND c.terminada_at > timestamptz '2026-09-28 10:21:51+00' AND c.terminada_at < now() - interval '1 hour'
  AND NOT EXISTS (SELECT 1 FROM bancos.correos k WHERE k.modo = 'real' AND k.tipo IN ('acuse', 'final') AND k.corrida_id = c.id)
ON CONFLICT DO NOTHING;
SET LOCAL ROLE bancos_auditor;
SELECT count(*) FILTER (WHERE cerrada_en IS NULL) AS abiertas, count(*) AS total, max(creada_en) AS ultima FROM bancos.auditorias_pendientes;
