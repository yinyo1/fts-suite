-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0021 (V1.55, #12) · MIGRACIÓN DE EMERGENCIA, solo si Esteban la pide.
--
-- Vive fuera de la secuencia (db/reversas/): si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE
-- número libre y se corre con el runner como cualquier otra (ensayo primero).
-- Qué hace: quita las envolturas de api_motor y api_suite de la 0021 y les devuelve el nombre (0021prev → la de antes),
-- con el permiso de la app. Las acciones `actualizar_cliente` que sigan propuestas quedan descartadas (nadie las pinta).
-- Qué NO hace: no borra las claves de los interruptores nuevos (en '0' no hacen nada) ni acciones ya resueltas; el CHECK
-- del tipo se queda con `actualizar_cliente` para no romper filas que ya existen.
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev21$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0021prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0021prev(jsonb) RENAME TO api_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0021prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0021prev(jsonb) RENAME TO api_suite;
  END IF;
END
$rev21$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_suite(jsonb) TO conceptualizador_app;
UPDATE conceptualizador.accion SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
       resultado = jsonb_build_object('reversa', 'conceptualizador_0021')
 WHERE tipo = 'actualizar_cliente' AND estado = 'propuesta';
