-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0028 (V1.58, #12): la lista de interruptores vuelve a la de la 0027. Los 6 renglones
-- `interruptor:*_v158` de config se quedan (sin uso). Solo si Esteban lo pide; se aplica con el runner de reversas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr28$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157',
               'regla15_v157','pago_decreto','horario_autor','tarjeta_v157','correo_v157','vista_cliente']
$inr28$;

-- V1.58 · piso_v158: comercial_app deja de leer caso, mensaje y adjunto, y api_motor vuelve a la de la 0027. (Antes de esta
-- reversa, regresar orden-odoo a su versión anterior: su «Postgres - Leer machote» lee esas columnas y piso_v158_prendido().)
-- El USAGE del esquema se queda: lo dio la 0027 (la firma) y lo quita su reversa.
DO $pisr28$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    REVOKE SELECT (id, machote_id) ON conceptualizador.caso FROM comercial_app;
    REVOKE SELECT (id, caso_id, rol, autor) ON conceptualizador.mensaje FROM comercial_app;
    REVOKE SELECT (mensaje_id, tipo, clase) ON conceptualizador.adjunto FROM comercial_app;
  END IF;
END
$pisr28$;
DROP FUNCTION IF EXISTS conceptualizador.piso_v158_prendido();

DO $renr28m$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0028prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0028prev(jsonb) RENAME TO api_motor;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$renr28m$;
DROP FUNCTION IF EXISTS conceptualizador.excepciones_piso_24h();
