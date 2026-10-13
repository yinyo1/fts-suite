-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0004 · la solicitud sólo cita rechazos que llegaron por el buzón (issue #331)
--
-- Ensayo 116499 (datos reales): la sección "Archivos recibidos que no se pudieron usar"
-- traía PDFs de 2018/2019 que entraron por el INVENTARIO de carpetas viejas (Fase 3),
-- no por el buzón. A Gerardo no le toca corregirlos, y sus nombres traen números de
-- cuenta completos. Desde aquí f_rechazos sólo toma archivos cuya primera corrida fue
-- una lectura del buzón (corridas.origen = 'cron').
-- Sin signos de pesos seguidos de comilla, acento grave, ampersand, dígito o '<' (§20 #10).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION bancos.f_rechazos(p_hoy date)
RETURNS TABLE (archivo_id bigint, archivo text, pieza_de text, estado text, codigo text, motivo text, fuente text,
               numero_mask text, periodo char(7), recibido_at timestamptz, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
WITH abiertos AS (SELECT fuente, periodo FROM bancos.f_faltantes(p_hoy)),
dias AS (SELECT coalesce((SELECT valor::int FROM bancos.parametros WHERE clave = 'rechazos_dias'), 45) AS n)
SELECT a.id, a.nombre_original, z.nombre_original, a.estado,
  (SELECT ev.codigo FROM bancos.corrida_eventos ev WHERE ev.archivo_sha = a.sha256 AND ev.nivel IN ('rechazo','aviso')
     AND ev.codigo NOT IN ('VALIDADO','INSTRUCCION','AVISO','NOMBRE_OTRO_PERIODO') ORDER BY ev.id DESC LIMIT 1),
  a.motivo, f.clave, c.numero_mask, a.periodo, a.recibido_at, a.sha256
FROM bancos.archivos a
JOIN bancos.corridas k ON k.id = a.corrida_id AND k.origen = 'cron'
LEFT JOIN bancos.archivos z ON z.id = a.zip_origen_id
LEFT JOIN bancos.cuentas c ON c.id = a.cuenta_id
LEFT JOIN bancos.fuentes_solicitud f ON f.journal_odoo = c.journal_odoo OR (a.cuenta_id IS NULL AND f.tipo_archivo = a.tipo_detectado)
WHERE (a.estado IN ('rechazado','no_cuadra','sospechoso') OR (a.estado = 'formato_no_soportado' AND a.cuenta_id IS NULL))
  AND a.recibido_at::date <= p_hoy
  AND (
    (a.cuenta_id IS NOT NULL AND a.periodo IS NOT NULL AND EXISTS (SELECT 1 FROM abiertos x WHERE x.fuente = f.clave AND x.periodo = a.periodo))
    OR ((a.cuenta_id IS NULL OR a.periodo IS NULL) AND a.recibido_at::date > p_hoy - (SELECT n FROM dias))
  )
ORDER BY a.recibido_at, a.id
$fn$;

REVOKE EXECUTE ON FUNCTION bancos.f_rechazos(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bancos.f_rechazos(date) TO bancos_app;
