-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0025 (V1.57a, #12) · solo si hace falta. Se copia a db/migrations/conceptualizador/ con el
-- SIGUIENTE número libre y se corre con el runner (ensayo primero). Devuelve api_motor y alarmas_motor a la 0024: el latido
-- ya no trae `relevo_senal`, las razones `relevo:`/`arrancador:` vuelven al arriendo de la 0023 (con el interruptor apagado
-- no hacen nada) y se van las alarmas relevo_no_late y arrancador_perdido. Deja la tabla relevo_senal (no estorba).
-- Antes de esto basta con `activo:false` en motor/arrancador.json: el vigía de la V1.57a sin señales se comporta como antes.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv25$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0025prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0025prev(jsonb) RENAME TO api_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0025prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0025prev(text) RENAME TO alarmas_motor;
  END IF;
END
$rv25$;
DROP FUNCTION IF EXISTS conceptualizador.relevo_estado(text, text);
DROP FUNCTION IF EXISTS conceptualizador.relevo_nuevo(text, text, timestamptz);
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
