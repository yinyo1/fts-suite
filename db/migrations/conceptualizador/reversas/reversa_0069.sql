-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0069 (#20 parte 5 paso 1): api_suite vuelve a la de la 0066/0068 y se quita zz_cliente_prueba.
-- Los casos zz.* que ya tengan el cliente 2260 lo conservan (son demo; no estorba).
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv69$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0069prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0069prev(jsonb) RENAME TO api_suite;
  END IF;
  DROP FUNCTION IF EXISTS conceptualizador.zz_cliente_prueba(text, uuid);
END
$rv69$;
DO $gr69v$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr69v$;
