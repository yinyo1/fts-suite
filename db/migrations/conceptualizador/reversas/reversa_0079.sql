-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0079 (#20 parte 14): api_suite vuelve a la de la 0078 (hilo sin `compartir`). No toca datos.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv79$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0079prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0079prev(jsonb) RENAME TO api_suite;
  END IF;
END
$rv79$;
DROP FUNCTION IF EXISTS conceptualizador.compartir_de(text, uuid);
DO $rg79$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$rg79$;
