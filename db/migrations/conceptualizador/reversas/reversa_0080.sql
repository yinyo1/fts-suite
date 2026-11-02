-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0080 (#20, cola atorada): api_suite y alarmas_motor vuelven a las de la 0079/0074.
-- La tabla cola_atorada se CONSERVA (son avisos de campo; borrarla perdería la evidencia). No toca otros datos.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv80$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0080prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0080prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0080prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0080prev(text) RENAME TO alarmas_motor;
  END IF;
END
$rv80$;
DROP FUNCTION IF EXISTS conceptualizador.ms_a_ts(text);
DO $rg80$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$rg80$;
