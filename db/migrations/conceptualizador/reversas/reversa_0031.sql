-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0031 (V1.61, #12): la lista de interruptores vuelve a la de la 0030, agente_estado a la
-- de la 0014, api_cierres / alarmas_motor / api_suite a las de antes, y se van trabajos_antes(), agente_barra() y el
-- disparador de las marcas, orden_v161() y la envoltura de api_motor. La columna proceso.marcas y el renglón `interruptor:barra_v161` se quedan, sin uso.
-- La CHECK de cerrado_por vuelve a la de la 0002 SOLO si ningún caso quedó cerrado con `orden_cancelada`; si hay, se
-- queda la ancha (quitarla tronaría) y la reversa lo dice con un NOTICE.
-- Solo si Esteban lo pide; se aplica con el runner de reversas. La pantalla V1.61 con el interruptor apagado no la nota.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr31$
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
               'lista_v160','chat_limpio_v160','seleccion_v160']
$inr31$;

CREATE OR REPLACE FUNCTION conceptualizador.agente_estado(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $agr31$
  SELECT CASE WHEN conceptualizador.prendido('estados_reales') THEN conceptualizador.agente_estado_v152(p_caso)
              ELSE conceptualizador.agente_estado_0013(p_caso) END
$agr31$;

DROP TRIGGER IF EXISTS proceso_marca ON conceptualizador.proceso;
DROP FUNCTION IF EXISTS conceptualizador.proceso_marca();
DROP FUNCTION IF EXISTS conceptualizador.agente_barra(jsonb, uuid);
DROP FUNCTION IF EXISTS conceptualizador.trabajos_antes(uuid);

DO $revc31$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_cierres_0031prev') THEN
    DROP FUNCTION conceptualizador.api_cierres(jsonb);
    ALTER FUNCTION conceptualizador.api_cierres_0031prev(jsonb) RENAME TO api_cierres;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb) TO conceptualizador_app;
  END IF;
END
$revc31$;
DO $reva31$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0031prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0031prev(text) RENAME TO alarmas_motor;
  END IF;
END
$reva31$;
DO $revm31$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0031prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0031prev(jsonb) RENAME TO api_motor;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$revm31$;
DROP FUNCTION IF EXISTS conceptualizador.orden_v161();
DO $revs31$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0031prev') THEN
    DROP FUNCTION conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0031prev(jsonb) RENAME TO api_suite;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$revs31$;
DO $revk31$
BEGIN
  IF EXISTS (SELECT 1 FROM conceptualizador.caso WHERE cerrado_por = 'orden_cancelada') THEN
    RAISE NOTICE 'reversa 0031: hay casos con cerrado_por = orden_cancelada; la CHECK ancha se queda';
  ELSE
    ALTER TABLE conceptualizador.caso DROP CONSTRAINT IF EXISTS caso_cerrado_por_check;
    ALTER TABLE conceptualizador.caso ADD CONSTRAINT caso_cerrado_por_check
      CHECK (cerrado_por IS NULL OR cerrado_por IN ('manual','orden_confirmada','oportunidad_perdida','sin_machote','motor'));
  END IF;
END
$revk31$;
