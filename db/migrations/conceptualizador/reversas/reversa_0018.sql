-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0018 (V1.54 E1) · MIGRACIÓN DE EMERGENCIA, solo si Esteban la pide (fts-conceptualizador#11).
--
-- Vive fuera de la secuencia (db/reversas/): si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE
-- número libre y se corre con el runner como cualquier otra (ensayo primero).
-- Qué hace: borra las envolturas de api_motor y api_suite de la 0018 y les devuelve el nombre (0018prev → la de antes),
-- con el permiso de la app; deja `interruptores_nombres()` con los 27 de la 0017 y borra las 5 claves nuevas si siguen en '0'.
-- Qué NO hace: no borra tablas ni filas (termino, termino_meta, condicion_*): quedan sin nadie que las use.
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev18$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0018prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0018prev(jsonb) RENAME TO api_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0018prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0018prev(jsonb) RENAME TO api_suite;
  END IF;
END
$rev18$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_suite(jsonb) TO conceptualizador_app;
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in18r$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153']
$in18r$;
DELETE FROM conceptualizador.config
 WHERE clave IN ('interruptor:condiciones_caso','interruptor:nucleo_chat','interruptor:machote_chat','interruptor:enviar_cliente','interruptor:rastreo_respuestas')
   AND valor = '0';
