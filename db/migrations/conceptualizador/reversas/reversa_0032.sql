-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0032 (V1.62a, #12): la lista de interruptores vuelve a la de la 0031; api_motor, api_suite,
-- alarmas_motor y config_valida a las de antes; se van orden_v162(), tarjetas_viejas_avisar(), vigente_de(), ciclo_de() y
-- titulo_de_origen(). Las columnas
-- caso.oportunidad_elegida, caso.titulo_auto y accion.aviso_viejo_at, la clave tarjeta_sin_aplicar_horas y los renglones de los cinco
-- interruptores se quedan, sin uso (quitarlos borraría lo que ya eligió la gente).
-- Antes de aplicarla, orden-odoo tiene que volver a su versión anterior (su consulta llama orden_v162()).
-- Solo si Esteban lo pide; se aplica con el runner de reversas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr32$
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
               'barra_v161']
$inr32$;

DO $revm32$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0032prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0032prev(jsonb) RENAME TO api_motor;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$revm32$;
DO $revs32$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0032prev') THEN
    DROP FUNCTION conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0032prev(jsonb) RENAME TO api_suite;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$revs32$;
DO $reva32$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0032prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0032prev(text) RENAME TO alarmas_motor;
  END IF;
END
$reva32$;
DO $revv32$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'config_valida_0032prev') THEN
    DROP FUNCTION conceptualizador.config_valida(text, text);
    ALTER FUNCTION conceptualizador.config_valida_0032prev(text, text) RENAME TO config_valida;
  END IF;
END
$revv32$;
DROP FUNCTION IF EXISTS conceptualizador.tarjetas_viejas_avisar(timestamptz);
DROP FUNCTION IF EXISTS conceptualizador.vigente_de(uuid);
DROP FUNCTION IF EXISTS conceptualizador.ciclo_de(uuid);
DROP FUNCTION IF EXISTS conceptualizador.titulo_de_origen(uuid);
DROP FUNCTION IF EXISTS conceptualizador.orden_v162();
