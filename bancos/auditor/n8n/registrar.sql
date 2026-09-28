-- fts_bancos_auditor_registrar (issue #346). Guarda UNA auditoría con su informe privado y cierra las
-- pendientes que atendió. Rol bancos_auditor: sólo escribe en bancos.auditorias*. El JSON llega en base64
-- (sólo letras, dígitos, +, / y =) incrustado por la expresión: sin parámetros ni signos de pesos (§20 #10).
SET LOCAL ROLE bancos_auditor;
WITH p AS (SELECT convert_from(decode('__B64__', 'base64'), 'UTF8')::jsonb AS j),
aud AS (
  INSERT INTO bancos.auditorias (tipo, objetivo, iniciada_en, terminada_en, veredicto, n_estados, n_movimientos, conteos, salud,
                                 auditor_version, sesion, execution_id, informe_html)
  SELECT j->>'tipo', coalesce((j->>'objetivo')::int, 1), (j->>'iniciada_en')::timestamptz, now(), j->>'veredicto',
         (j->>'n_estados')::int, (j->>'n_movimientos')::int, coalesce(j->'conteos', '{}'), coalesce(j->'salud', '{}'),
         j->>'auditor_version', j->>'sesion', '__EXEC__', j->>'informe_html'
  FROM p RETURNING id
),
inf AS (
  INSERT INTO bancos.auditorias_informe (auditoria_id, estado_id, archivo_id, pata, resultado, codigo, evidencia)
  SELECT aud.id, (h->>'estado_id')::bigint, (h->>'archivo_id')::bigint, (h->>'pata')::int, h->>'resultado', h->>'codigo', coalesce(h->'evidencia', '{}')
  FROM aud, p, jsonb_array_elements(coalesce(p.j->'hallazgos', '[]')) h
  UNION ALL
  -- y una fila por estado y pata (VERDE o ROJO), a partir de por_estado
  SELECT aud.id, (e->>'estado_id')::bigint, (e->>'archivo_id')::bigint, x.pata, e->>x.col, 'P' || x.pata || '_' || (e->>x.col),
         jsonb_build_object('cuenta_id', e->'cuenta_id', 'periodo', e->'periodo', 'movimientos', e->'movimientos')
  FROM aud, p, jsonb_array_elements(coalesce(p.j->'por_estado', '[]')) e,
       (VALUES (1, 'pata1'), (2, 'pata2'), (3, 'pata3')) x(pata, col)
  RETURNING 1
),
pen AS (
  UPDATE bancos.auditorias_pendientes q SET cerrada_en = now(), tomada_en = coalesce(q.tomada_en, now()),
         veredicto = (SELECT j->>'veredicto' FROM p), auditoria_id = (SELECT id FROM aud)
  WHERE q.cerrada_en IS NULL AND q.id IN (SELECT (x #>> '{}')::bigint FROM p, jsonb_array_elements(coalesce(p.j->'pendientes', '[]')) x)
  RETURNING 1
)
SELECT (SELECT id FROM aud) AS auditoria_id, (SELECT count(*) FROM inf) AS hallazgos, (SELECT count(*) FROM pen) AS pendientes_cerradas,
       (SELECT j->>'veredicto' FROM p) AS veredicto, (SELECT j->>'tipo' FROM p) AS tipo;
