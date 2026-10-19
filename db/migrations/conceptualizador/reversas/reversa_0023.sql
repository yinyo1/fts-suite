-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0023 (V1.57a, #12) · MIGRACIÓN DE EMERGENCIA, solo si hace falta.
--
-- Vive fuera de la secuencia (db/reversas/): si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE
-- número libre y se corre con el runner como cualquier otra (ensayo primero).
-- Antes de esto basta con APAGAR los interruptores (arriendo_v157, alarmas_v157, juntar_revisa): con los tres en 0 la 0023
-- solo anota `latido_sesion` y todo lo demás pasa tal cual a la 0022.
-- Qué hace: quita las envolturas de api_motor y api_respaldo de la 0023 y les devuelve el nombre (0023prev → la de antes),
-- con el permiso de la app. El modo `arriendo` deja de existir (MODO_DESCONOCIDO).
-- Qué NO hace: no borra las tablas arriendo, arriendo_evento ni latido_sesion (son historial), ni los interruptores nuevos
-- (apagados no hacen nada), ni el tipo `motor_alarma` de consumo_aviso (renglones ya avisados).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev23$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0023prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0023prev(jsonb) RENAME TO api_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_respaldo_0023prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_respaldo(jsonb);
    ALTER FUNCTION conceptualizador.api_respaldo_0023prev(jsonb) RENAME TO api_respaldo;
  END IF;
END
$rev23$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_respaldo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
