SET LOCAL ROLE bancos_auditor;
WITH p AS (SELECT convert_from(decode('__B64__', 'base64'), 'UTF8')::jsonb AS j)
UPDATE bancos.auditorias a SET onedrive_ruta = p.j->>'ruta', correo_status = (p.j->>'correo')::int,
       correo_at = CASE WHEN p.j->>'correo' IS NOT NULL THEN now() END
FROM p WHERE a.id = (p.j->>'id')::bigint
RETURNING a.id, a.veredicto, a.onedrive_ruta IS NOT NULL AS informe_en_onedrive, a.correo_status;
