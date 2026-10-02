-- fts_bancos_auditor_obj2_lectura (issue #365): la auditoría anterior del Objetivo 2, con el rol del auditor
-- (sólo él lee bancos.auditorias*). Sirve para saber qué es NUEVO (lo nuevo es lo único que puede ser ROJO).
SET LOCAL ROLE bancos_auditor;
SELECT json_build_object(
  'rol', current_user,
  'dias_inhabiles', (SELECT json_agg(d.fecha ORDER BY d.fecha) FROM bancos.dias_inhabiles d),
  'ultima_obj2', (SELECT row_to_json(u) FROM (SELECT id, iniciada_en, veredicto, conteos FROM bancos.auditorias
                   WHERE objetivo = 2 AND tipo <> 'prueba' ORDER BY id DESC LIMIT 1) u),
  'marcados_prev', (SELECT json_agg(x) FROM (
                SELECT i.codigo, i.evidencia->'movimientos' AS movimientos FROM bancos.auditorias_informe i
                WHERE i.auditoria_id = (SELECT max(id) FROM bancos.auditorias WHERE objetivo = 2 AND tipo <> 'prueba')
                  AND jsonb_typeof(i.evidencia->'movimientos') = 'array') x)
) AS d;
