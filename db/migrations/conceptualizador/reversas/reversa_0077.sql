-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0077 (#20 parte 14): api_motor vuelve a la de antes (hilo_caso sin machote_vigente). No toca datos.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv77$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0077prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0077prev(jsonb) RENAME TO api_motor;
  END IF;
END
$rv77$;
DO $rg77$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$rg77$;
