-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0016 (V1.53a) · MIGRACIÓN DE EMERGENCIA, solo si Esteban la pide (fts-conceptualizador#6).
--
-- Vive fuera de la secuencia (db/reversas/): si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE
-- número libre (conceptualizador_00NN_reversa_0016.sql) y se corre con el runner como cualquier otra (ensayo primero).
--
-- Qué hace: borra la envoltura de api_motor de la 0016 (modos destinos, salud_motor, salud, salud_registrar) y le devuelve
-- el nombre a api_motor_0016prev (la de la 0014), con el permiso de la app; deja `interruptores_nombres()` con los 13 de la
-- V1.52 (los 10 nuevos ya no se pueden prender desde el panel; sus filas `interruptor:*` quedan en config, sin efecto).
-- Qué NO hace: no borra tablas ni filas (decreto_destino, salud_dia, salud_linea, salud_motor quedan, sin nadie que las use).
-- El motor sin la 0016 recibe MODO_DESCONOCIDO en `destinos`/`salud_motor` y sigue igual (nunca frena por eso).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, &, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev16$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0016prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0016prev(jsonb) RENAME TO api_motor;
  END IF;
END
$rev16$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in16r$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base']
$in16r$;
