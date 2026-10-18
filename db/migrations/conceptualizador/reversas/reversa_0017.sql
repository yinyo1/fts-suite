-- Reversa de conceptualizador_0017 (V1.53b): vuelve a la lista de la 0016 y borra las 4 claves nuevas SOLO si siguen en '0'
-- (si alguien ya prendió una, se queda: apáguenla primero desde el panel). Fuera de la secuencia del runner.
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $rv17$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria']
$rv17$;
DELETE FROM conceptualizador.config
 WHERE clave IN ('interruptor:leer_mas','interruptor:bolita_acciones','interruptor:tarjetas_colapsadas','interruptor:pantalla_v153') AND valor = '0';
