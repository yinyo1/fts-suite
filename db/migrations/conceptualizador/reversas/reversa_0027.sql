-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0027 (V1.57b, #12). Quita las envolturas de api_correo, api_suite y api_motor y vuelve
-- firma_de, envios_cliente_de e interruptores_nombres a lo de la 0023. NO borra datos: las columnas nuevas de envio_cliente
-- y firma, la tabla contacto_propuesto y los valores de config se quedan (sin uso). Solo si Esteban lo pide.
-- Para aplicarla: copiarla a fts-suite/db/migrations/conceptualizador/ con el SIGUIENTE número libre, ensayo y luego real.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev27$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0027prev') THEN
    DROP FUNCTION conceptualizador.api_correo(jsonb);
    ALTER FUNCTION conceptualizador.api_correo_0027prev(jsonb) RENAME TO api_correo;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0027prev') THEN
    DROP FUNCTION conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0027prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0027prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0027prev(jsonb) RENAME TO api_motor;
  END IF;
END
$rev27$;

CREATE OR REPLACE FUNCTION conceptualizador.firma_de(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $fdr27$
  SELECT to_jsonb(f) - 'updated_at' - 'imagen_b64' FROM conceptualizador.firma f WHERE f.actor = p_actor
$fdr27$;

CREATE OR REPLACE FUNCTION conceptualizador.envios_cliente_de(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ecr27$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'folio', e.folio, 'orden', e.orden_nombre, 'para', e.para, 'estado', e.estado,
           'enviado_por', e.enviado_por, 'enviado_at', e.enviado_at, 'created_at', e.created_at) ORDER BY e.id), '[]'::jsonb)
    FROM conceptualizador.envio_cliente e WHERE e.caso_id = p_caso AND e.estado <> 'cancelado'
$ecr27$;

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr27$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157']
$inr27$;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb), conceptualizador.api_suite(jsonb), conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- V1.57b · «Le atiende»: comercial_app deja de leer la firma. (Antes de esta reversa, regresar orden-odoo a su versión anterior:
-- su «Postgres - Leer machote» lee conceptualizador.firma.) Ninguna otra migración le da el esquema a comercial_app.
DO $atn27r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    REVOKE SELECT (actor, empleado_id) ON conceptualizador.firma FROM comercial_app;
    REVOKE USAGE ON SCHEMA conceptualizador FROM comercial_app;
  END IF;
END
$atn27r$;
