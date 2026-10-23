-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0036 (V1.63a, #12): la lista de interruptores vuelve a la de la 0035; api_motor y alarmas_motor
-- a las de antes; se van orden_v163(), orden_rechazo_registrar() y metrica_v163(). La tabla orden_rechazo se queda, sin uso
-- (quitarla borraría la medición). Antes de correrla: el workflow orden-odoo debe ir sin «Postgres - Rechazo» ni `orden_v163()`
-- (restore_workflow_version a la versión de antes), porque los llama.
-- Solo si Esteban lo pide; se aplica con el runner de reversas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr36$
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
               'barrido_v162']
$inr36$;


DO $revmot36$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0036prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0036prev(jsonb) RENAME TO api_motor;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0036prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0036prev(text) RENAME TO alarmas_motor;
  END IF;
END
$revmot36$;
DROP FUNCTION IF EXISTS conceptualizador.orden_v163();
DROP FUNCTION IF EXISTS conceptualizador.orden_rechazo_registrar(jsonb);
DROP FUNCTION IF EXISTS conceptualizador.metrica_v163(timestamptz);
DELETE FROM conceptualizador.config WHERE clave IN ('interruptor:pdf_menu_v163','interruptor:flujo_v163','interruptor:pdf_v163','interruptor:vendedor_v163','interruptor:rechazos_v163','interruptor:una_orden_v163');
