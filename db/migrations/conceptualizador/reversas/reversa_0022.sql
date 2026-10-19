-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0022 (V1.56, #12) · MIGRACIÓN DE EMERGENCIA, solo si hace falta.
--
-- Vive fuera de la secuencia (db/reversas/): si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE
-- número libre y se corre con el runner como cualquier otra (ensayo primero).
-- Qué hace: quita las envolturas de api_correo y api_motor de la 0022 y les devuelve el nombre (0022prev → la de antes),
-- con el permiso de la app. Ver y Descargar vuelven a depender de `enviar_cliente`; la profundidad vuelve a guardarse solo con
-- `relevo_v152`; el modo `canario` deja de existir (MODO_DESCONOCIDO) y `salud` deja de traer el canario.
-- Qué NO hace: no borra la tabla salud_canario (sus renglones son historial).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev22$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0022prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_correo(jsonb);
    ALTER FUNCTION conceptualizador.api_correo_0022prev(jsonb) RENAME TO api_correo;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0022prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0022prev(jsonb) RENAME TO api_motor;
  END IF;
END
$rev22$;
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb), conceptualizador.api_motor(jsonb) TO conceptualizador_app;
