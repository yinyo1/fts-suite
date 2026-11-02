-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0074 (#20 parte 13): metricas_caso vuelve a ser la de la 0072 y alarmas_motor la de la 0061.
-- No toca datos: las métricas y las alarmas solo se leen.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv74$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0074prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0074prev(text) RENAME TO alarmas_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'metricas_caso_0074prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.metricas_caso(uuid);
    ALTER FUNCTION conceptualizador.metricas_caso_0074prev(uuid) RENAME TO metricas_caso;
  END IF;
END
$rv74$;
DROP FUNCTION IF EXISTS conceptualizador.metricas_alarmas(timestamptz);
DROP FUNCTION IF EXISTS conceptualizador.metricas_primer_machote(uuid);
DO $rg74$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.metricas_caso(uuid) TO conceptualizador_app;
  END IF;
END
$rg74$;
