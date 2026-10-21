-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0029 (V1.59, #12): la lista de interruptores vuelve a la de la 0028, config_valida a la de
-- antes, y se van puede_mover() y orden_v159(). Los renglones de config (`interruptor:*_v159`, `puede_mover:*`,
-- `vendedor_odoo:*`) se quedan, sin uso. ANTES de esta reversa, regresar comercial/machote-guardar y
-- conceptualizador/orden-odoo a sus versiones anteriores: sus consultas llaman puede_mover() y orden_v159().
-- Solo si Esteban lo pide; se aplica con el runner de reversas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr29$
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
               'piso_v158','estado_odoo_v158','niveles_v158','menu_vista_v158','actualizar_v158','ligas_v158']
$inr29$;

DO $revr29$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    REVOKE SELECT (autor, oportunidad_id, created_at) ON conceptualizador.caso FROM comercial_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'config_valida_0029prev') THEN
    DROP FUNCTION conceptualizador.config_valida(text, text);
    ALTER FUNCTION conceptualizador.config_valida_0029prev(text, text) RENAME TO config_valida;
  END IF;
END
$revr29$;
DO $rens29$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0029prev') THEN
    DROP FUNCTION conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0029prev(jsonb) RENAME TO api_suite;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$rens29$;
DO $renm29$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0029prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0029prev(jsonb) RENAME TO api_motor;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$renm29$;
DROP FUNCTION IF EXISTS conceptualizador.puede_mover(text, text);
DROP FUNCTION IF EXISTS conceptualizador.orden_v159(text);
DROP FUNCTION IF EXISTS conceptualizador.descartar_borrador_ya_hecho(bigint);
