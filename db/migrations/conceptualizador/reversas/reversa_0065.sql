-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0065 (V1.65, fts-suite#442): adoptar_orden_v165 vuelve a ser la de la 0064. Lo escrito NO se
-- borra: la oportunidad y el cliente que la adopción dejó en el caso y en el machote se quedan (son los de la orden en Odoo).
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv65$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'adoptar_orden_v165_0065prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.adoptar_orden_v165(jsonb);
    ALTER FUNCTION conceptualizador.adoptar_orden_v165_0065prev(jsonb) RENAME TO adoptar_orden_v165;
  END IF;
END
$rv65$;
DO $gr65v$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.adoptar_orden_v165(jsonb) TO comercial_app;
  END IF;
END
$gr65v$;
