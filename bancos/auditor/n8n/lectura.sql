SET ROLE bancos_auditor;
SELECT json_build_object(
  'leido_at', now(), 'hoy', bancos.hoy_mty(), 'rol', current_user,
  'cuentas', (SELECT json_agg(c ORDER BY c.id) FROM (SELECT id, banco, alias, numero_mask, right(clabe, 4) AS clabe4, moneda, tipo, carpeta, activa FROM bancos.cuentas) c),
  'archivos', (SELECT json_agg(a ORDER BY a.id) FROM (SELECT id, sha256, nombre_original, nombre_canonico, zip_origen_id, ruta_en_zip, origen, graph_drive_id, graph_item_id,
                ruta_origen, ruta_canonica, recibido_at, tipo_detectado, cuenta_id, periodo, estado, motivo, corrida_id, actualizado_at FROM bancos.archivos) a),
  'avistamientos', (SELECT json_agg(v ORDER BY v.id) FROM (SELECT id, archivo_id, nombre, origen, graph_item_id, ruta, visto_at FROM bancos.avistamientos) v),
  'estados', (SELECT json_agg(e ORDER BY e.id) FROM (SELECT id, archivo_id, cuenta_id, periodo, periodo_inicio, periodo_fin, parser, parser_version, moneda, saldo_inicial, saldo_final,
                total_cargos, num_cargos, total_abonos, num_abonos, comisiones, paginas, num_movimientos, num_saldos_impresos, v1_ok, v1_detalle, v2_ok, v2_detalle, huella, corrida_id
              FROM bancos.estados) e),
  'vigentes', (SELECT json_agg(v.id ORDER BY v.id) FROM bancos.estados_vigentes v),
  'movimientos', (SELECT json_agg(m ORDER BY m.estado_id, m.renglon) FROM (SELECT id, estado_id, renglon, pagina, fecha_operacion, fecha_liquidacion, codigo, cargo, abono,
                saldo_operacion_impreso, saldo_liquidacion_impreso, saldo_calculado, hash FROM bancos.movimientos) m),
  'v3', (SELECT json_agg(x ORDER BY x.id) FROM (SELECT id, estado_id, resultado, estado_anterior_id, diferencia, corrida_id, creado_at FROM bancos.validaciones_v3) x),
  'duplicados_logicos', (SELECT json_agg(d ORDER BY d.id) FROM (SELECT id, estado_id, duplicado_de, mismo_contenido FROM bancos.duplicados_logicos) d),
  'huecos', (SELECT json_agg(h ORDER BY h.id) FROM (SELECT id, cuenta_id, periodo, motivo, detectado_en, solicitado_en, veces_solicitado, resuelto_en, resuelto_por_estado_id FROM bancos.huecos) h),
  'corridas', (SELECT json_agg(r ORDER BY r.id) FROM (SELECT id, iniciada_at, terminada_at, origen, leidos, validados, rechazados, duplicados, graph_ok, error FROM bancos.corridas
                WHERE iniciada_at > now() - interval '15 days') r),
  'correos', (SELECT json_agg(k ORDER BY k.id) FROM (SELECT id, tipo, modo, hoy, message_id, in_reply_to, asunto, para, cc, total_abiertos, corrida_id, graph_status, enviado_at FROM bancos.correos) k),
  'dias_inhabiles', (SELECT json_agg(d.fecha ORDER BY d.fecha) FROM bancos.dias_inhabiles d WHERE d.fecha BETWEEN bancos.hoy_mty() - 10 AND bancos.hoy_mty() + 120),
  'parametros', (SELECT json_object_agg(p.clave, p.valor) FROM bancos.parametros p),
  'pendientes', (SELECT json_agg(q ORDER BY q.id) FROM (SELECT id, motivo, clave, corrida_id, archivo_id, periodo, detalle, creada_en, tomada_en FROM bancos.auditorias_pendientes WHERE cerrada_en IS NULL) q),
  'ultima_auditoria', (SELECT row_to_json(u) FROM (SELECT id, tipo, veredicto, iniciada_en, terminada_en, n_estados, n_movimientos, conteos FROM bancos.auditorias ORDER BY id DESC LIMIT 1) u)
) AS d;
