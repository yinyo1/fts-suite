-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0041 (V1.63e bloque 2b, #12): alarmas_motor y api_motor vuelven a los de antes (las _0041prev), se van
-- orden_v163e y robot_gate_v163e, la lista de interruptores vuelve a la de la 0040 y se van las filas de borrador_n5_v163e y
-- borrador_robot_v163e (config_cambio se queda).
-- ⚠ ANTES de correrla, el workflow orden-odoo tiene que volver a su versión sin `orden_v163e` (su consulta la llama): primero
--   restore_workflow_version de orden-odoo, después esta reversa. Con los dos interruptores en '0' no hace falta correrla: apagados,
--   orden-odoo y el robot hacen lo de la 0040.
-- ═══════════════════════════════════════════════════════════════════════════

DO $rv41$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0041prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0041prev(text) RENAME TO alarmas_motor;
  END IF;
END
$rv41$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;

DO $rv41m$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0041prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0041prev(jsonb) RENAME TO api_motor;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$rv41m$;

DROP FUNCTION IF EXISTS conceptualizador.orden_v163e(uuid, text, boolean);
DROP FUNCTION IF EXISTS conceptualizador.robot_gate_v163e(uuid, text);

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr41$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157',
               'regla15_v157','pago_decreto','horario_autor','tarjeta_v157','correo_v157','vista_cliente',
               'piso_v158','estado_odoo_v158','niveles_v158','menu_vista_v158','actualizar_v158','ligas_v158',
               'delegacion_v159','vendedor_v159','bom_observado_v159','tarjetas_v159',
               'lista_v160','chat_limpio_v160','seleccion_v160',
               'barra_v161',
               'cuadre_v162','tarjetas_v162','oportunidad_v162','n0_v162','ruido_v162',
               'guardar_agente_v162b','todo_hecho_v162b','pdf_v162b','revision_v162b',
               'barrido_v162',
               'pdf_menu_v163','flujo_v163','pdf_v163','vendedor_v163','rechazos_v163','una_orden_v163',
               'freno_robot_v163','oportunidad_v163','machote_n5_v163',
               'libro_v163','procura_v163','secciones_v163','oportunidad_nace_v163','aviso_personas_v163',
               'pdf_unico_v163',
               'fin_semana_v163e',
               'analisis_v163e','tarifas_usa_v163e','deshacer_v163e']
$inr41$;

DELETE FROM conceptualizador.config WHERE clave IN ('interruptor:borrador_n5_v163e', 'interruptor:borrador_robot_v163e');
