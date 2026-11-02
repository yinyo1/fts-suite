-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0075 (#20 parte 13): api_suite vuelve a ser la de la 0071 (la que quedó como api_suite_0075prev) y se
-- quitan las funciones del candado. No toca datos. OJO: vuelve a abrir el hueco de autor (enviar/accion/subir en caso ajeno).
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv75$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0075prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0075prev(jsonb) RENAME TO api_suite;
  END IF;
END
$rv75$;
DROP FUNCTION IF EXISTS conceptualizador.puede_escribir_caso(text, uuid);
DROP FUNCTION IF EXISTS conceptualizador.participo_antes_0075(text, uuid);
DROP FUNCTION IF EXISTS conceptualizador.modos_escritura_caso();
DO $rg75$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$rg75$;
