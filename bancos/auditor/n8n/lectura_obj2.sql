-- fts_bancos_auditor_obj2_lectura (issue #365): lo que el Objetivo 2 lee de la base, con el rol del auditor.
-- Sólo movimientos de estados VALIDADOS y vigentes; el cotejo del servicio se lee como segundo camino.
SET LOCAL ROLE bancos_auditor;
SELECT json_build_object(
  'leido_at', now(), 'hoy', bancos.hoy_mty(), 'rol', current_user,
  'cuentas', (SELECT json_agg(c ORDER BY c.id) FROM (SELECT id, alias, numero_mask, moneda, journal_odoo, activa FROM bancos.cuentas) c),
  'estados', (SELECT json_agg(e ORDER BY e.id) FROM (
                SELECT e.id, e.archivo_id, e.cuenta_id, e.periodo, e.total_cargos, e.num_cargos, e.total_abonos, e.num_abonos
                FROM bancos.estados_vigentes e JOIN bancos.archivos a ON a.id = e.archivo_id WHERE a.estado = 'validado') e),
  'movimientos', (SELECT json_agg(m ORDER BY m.id) FROM (
                SELECT m.id, m.estado_id, m.cuenta_id, m.renglon, m.fecha_operacion, m.codigo, m.descripcion, m.referencia,
                       m.contraparte, m.cargo, m.abono, m.creado_at
                FROM bancos.movimientos m JOIN bancos.estados_vigentes e ON e.id = m.estado_id
                JOIN bancos.archivos a ON a.id = e.archivo_id WHERE a.estado = 'validado') m),
  'clasificacion', (SELECT json_agg(k ORDER BY k.movimiento_id) FROM (
                SELECT movimiento_id, categoria, subcategoria, contraparte, es_traspaso_interno, par_traspaso_id, regla
                FROM bancos.clasificacion_vigente) k),
  'reglas_er', (SELECT json_agg(r ORDER BY r.prioridad, r.id) FROM (
                SELECT id, prioridad, destino, campo, patron, subcategoria FROM bancos.reglas_edo_resultados WHERE activo) r),
  'cotejo_servicio', (SELECT json_build_object('corrida_id', c.cid,
                        'creado_at', (SELECT max(creado_at) FROM bancos.cotejo_odoo WHERE corrida_id = c.cid),
                        'filas', (SELECT json_agg(x) FROM (SELECT movimiento_id, journal_id, odoo_line_id, estado
                                                          FROM bancos.cotejo_odoo WHERE corrida_id = c.cid) x))
                      FROM (SELECT max(corrida_id) AS cid FROM bancos.cotejo_odoo) c),
  'dias_inhabiles', (SELECT json_agg(d.fecha ORDER BY d.fecha) FROM bancos.dias_inhabiles d),
  'ultima_obj2', (SELECT row_to_json(u) FROM (SELECT id, iniciada_en, veredicto, conteos FROM bancos.auditorias
                   WHERE objetivo = 2 AND tipo <> 'prueba' ORDER BY id DESC LIMIT 1) u),
  'marcados_prev', (SELECT json_agg(x) FROM (
                SELECT i.codigo, i.evidencia->'movimientos' AS movimientos FROM bancos.auditorias_informe i
                WHERE i.auditoria_id = (SELECT max(id) FROM bancos.auditorias WHERE objetivo = 2 AND tipo <> 'prueba')
                  AND i.evidencia ? 'movimientos') x)
) AS d;
