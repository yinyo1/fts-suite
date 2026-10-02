-- fts_bancos_auditor_obj2_lectura (issue #365): los datos del Objetivo 2, con el rol de SÓLO LECTURA bancos_lector
-- (vistas v_*: sólo estados que pasaron V1 y V2, clasificación vigente, cotejo del servicio agregado por diario y mes).
-- Sin migración nueva: todo lo que se lee aquí ya lo expone bancos_0003/0007 a bancos_lector.
SET LOCAL ROLE bancos_lector;
SELECT json_build_object(
  'leido_at', now(), 'hoy', bancos.hoy_mty(), 'rol', current_user,
  'estados', (SELECT json_agg(e ORDER BY e.estado_id) FROM (
                SELECT estado_id, numero_mask, moneda, journal_odoo, periodo, total_cargos, num_cargos, total_abonos, num_abonos
                FROM bancos.v_estados_validados) e),
  'movimientos', (SELECT json_agg(m ORDER BY m.movimiento_id) FROM (
                SELECT movimiento_id, estado_id, journal_odoo, numero_mask, renglon, fecha_operacion, codigo, descripcion, referencia,
                       cargo, abono, categoria, subcategoria, contraparte, es_traspaso_interno, par_traspaso_id, regla, version_clasificacion
                FROM bancos.v_movimientos_validados) m),
  'reglas_er', (SELECT json_agg(r ORDER BY r.prioridad, r.id) FROM (
                SELECT id, prioridad, destino, campo, patron, subcategoria FROM bancos.reglas_edo_resultados WHERE activo) r),
  'cotejo_servicio', (SELECT json_build_object('corrida_id', c.cid, 'corrido_at', (SELECT max(corrido_at) FROM bancos.v_cotejo_odoo WHERE corrida_id = c.cid),
                        'por_mes', (SELECT json_agg(x) FROM (SELECT journal_id, periodo, sum(exactos) AS exactos, sum(probables) AS probables,
                                                                   sum(banco_sin_odoo) AS banco_sin_odoo, sum(odoo_sin_banco) AS odoo_sin_banco,
                                                                   sum(movimientos_banco) AS movimientos_banco
                                                            FROM bancos.v_cotejo_odoo WHERE corrida_id = c.cid GROUP BY journal_id, periodo) x))
                      FROM (SELECT max(corrida_id) AS cid FROM bancos.v_cotejo_odoo) c)
) AS d;
