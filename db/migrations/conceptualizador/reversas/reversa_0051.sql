-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0051 (V1.63g.4, #12): api_suite, alarmas_motor y encolar_alarmas vuelven a las de la 0050
-- (las _0051prev), se van sin_respuesta() y sin_respuesta_avisar(), interruptores_nombres() vuelve a la lista de la 0050 y se van
-- las filas de config de la 0051. La columna mensaje.sin_respuesta_avisado_at se queda (aditiva, nadie más la lee).
-- ⚠ Con `no_esperar_v163g4` en '0' no hace falta correrla: apagado todo sale como con la 0050.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv51$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0051prev') THEN
    DROP FUNCTION conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0051prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0051prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0051prev(text) RENAME TO alarmas_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'encolar_alarmas_0051prev') THEN
    DROP FUNCTION conceptualizador.encolar_alarmas(text);
    ALTER FUNCTION conceptualizador.encolar_alarmas_0051prev(text) RENAME TO encolar_alarmas;
  END IF;
END
$rv51$;
DROP FUNCTION IF EXISTS conceptualizador.sin_respuesta_avisar(timestamptz);
DROP FUNCTION IF EXISTS conceptualizador.sin_respuesta(timestamptz);
DO $gr51r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr51r$;
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr51$
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
               'analisis_v163e','tarifas_usa_v163e','deshacer_v163e',
               'borrador_n5_v163e','borrador_robot_v163e',
               'machote_robot_v163e',
               'alarmas_robot_v163e',
               'terminos_robot_v163e','sin_avance_v163e',
               'equipo_estimado_v163e','viaticos_costo_v163e',
               'candados_v163f','supuesto20_v163f','precios_v163f','avance_robot_v163f',
               'voz_visor_v163g',
               'voz_directo_v163g',
               'estimados_v163h','sentido_v163h']
$inr51$;
DELETE FROM conceptualizador.config WHERE clave IN ('interruptor:no_esperar_v163g4', 'alarma_sin_respuesta_min');
