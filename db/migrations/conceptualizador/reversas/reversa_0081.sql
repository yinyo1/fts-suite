-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0081 (#20, supervisor comercial en el chat y liga machote · chat): api_suite, puede_escribir_caso y
-- compartido_nivel vuelven a los de la 0080; se quitan liga_de, liga_de_machote, nivel_por_machote, supervisor_ve y machote_por_chat.
-- ANTES de aplicarla: regresar comercial/machote-guardar a la versión sin machote_por_chat (si no, ese workflow se queda llamando a una
-- función que ya no existe). No toca datos: caso_compartido, préstamos y cesiones quedan como estén.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv81$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0081prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0081prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'puede_escribir_caso_0081prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.puede_escribir_caso(text, uuid);
    ALTER FUNCTION conceptualizador.puede_escribir_caso_0081prev(text, uuid) RENAME TO puede_escribir_caso;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'compartido_nivel_0081prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.compartido_nivel(text, uuid);
    ALTER FUNCTION conceptualizador.compartido_nivel_0081prev(text, uuid) RENAME TO compartido_nivel;
  END IF;
END
$rv81$;
DROP FUNCTION IF EXISTS conceptualizador.machote_por_chat(text, uuid);
DROP FUNCTION IF EXISTS conceptualizador.supervisor_ve(text, uuid);
DROP FUNCTION IF EXISTS conceptualizador.nivel_por_machote(text, uuid);
DROP FUNCTION IF EXISTS conceptualizador.liga_de_machote(uuid);
DROP FUNCTION IF EXISTS conceptualizador.liga_de(uuid);
DO $rg81$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$rg81$;
