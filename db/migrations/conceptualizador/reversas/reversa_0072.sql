-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0072 (#20 parte 12): hilo() vuelve a ser la de la 0064 (la que quedó como hilo_0072prev) y se
-- quitan metricas_caso y metricas_resumen. No toca datos: las métricas solo se leen.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv72$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'hilo_0072prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.hilo(uuid);
    ALTER FUNCTION conceptualizador.hilo_0072prev(uuid) RENAME TO hilo;
  END IF;
END
$rv72$;
DROP FUNCTION IF EXISTS conceptualizador.metricas_resumen(date, date);
DROP FUNCTION IF EXISTS conceptualizador.metricas_caso(uuid);
DO $rg72$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.hilo(uuid) TO conceptualizador_app;
  END IF;
END
$rg72$;
