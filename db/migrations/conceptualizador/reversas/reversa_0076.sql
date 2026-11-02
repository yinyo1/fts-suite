-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0076 (#20 parte 13): api_suite y puede_escribir_caso vuelven a las de la 0075 y se quita
-- compartido_nivel. La tabla caso_compartido SE QUEDA (es bitácora de quién dio y quién recogió acceso; sin las funciones nadie la lee).
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv76$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0076prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0076prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'puede_escribir_caso_0076prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.puede_escribir_caso(text, uuid);
    ALTER FUNCTION conceptualizador.puede_escribir_caso_0076prev(text, uuid) RENAME TO puede_escribir_caso;
  END IF;
END
$rv76$;
DROP FUNCTION IF EXISTS conceptualizador.compartido_nivel(text, uuid);
DO $rg76$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$rg76$;
