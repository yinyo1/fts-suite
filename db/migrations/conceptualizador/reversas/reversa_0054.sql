-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0054 (V1.63i, #16, «1 hora más» de madrugada): api_suite vuelve a la cadena de la 0053.
-- ═══════════════════════════════════════════════════════════════════════════
DO $r54$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0054prev') THEN
    DROP FUNCTION conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0054prev(jsonb) RENAME TO api_suite;
  END IF;
END
$r54$;
DROP FUNCTION IF EXISTS conceptualizador.hora_mas_hasta(uuid, timestamptz);
DO $gr54r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr54r$;
