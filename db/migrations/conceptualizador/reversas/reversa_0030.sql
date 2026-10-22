-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0030 (V1.60, #12): la lista de interruptores vuelve a la de la 0029, config_valida y
-- api_suite a las de antes, y se van etapa_de() y monto_de(). La tabla falla_odoo y los renglones de config
-- (`interruptor:*_v160`, `dias_enfriada`) se quedan, sin uso: son medición y no estorban.
-- Solo si Esteban lo pide; se aplica con el runner de reversas. La pantalla V1.60 con los interruptores apagados no la nota.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr30$
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
               'delegacion_v159','vendedor_v159','bom_observado_v159','tarjetas_v159']
$inr30$;

DO $revv30$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'config_valida_0030prev') THEN
    DROP FUNCTION conceptualizador.config_valida(text, text);
    ALTER FUNCTION conceptualizador.config_valida_0030prev(text, text) RENAME TO config_valida;
  END IF;
END
$revv30$;
DO $revs30$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0030prev') THEN
    DROP FUNCTION conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0030prev(jsonb) RENAME TO api_suite;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$revs30$;
DROP FUNCTION IF EXISTS conceptualizador.etapa_de(uuid);
DROP FUNCTION IF EXISTS conceptualizador.monto_de(uuid);
