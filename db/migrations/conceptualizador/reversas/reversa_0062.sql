-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0062 (V1.64a, #20, D231): regresa api_suite y ligar_machote_robot_v163e a como estaban (las _0062prev),
-- quita orden_del_caso_v164 y religar_orden_v164, deja la lista de interruptores como la deja la 0061 y borra el renglón
-- interruptor:una_cotizacion_v164. Apagar una_cotizacion_v164 basta para volver al comportamiento de antes. Los renglones
-- interruptor:voz_decide_v164[@caso] NO se tocan (son de la prueba de voz y se apagan aparte).
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv62$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0062prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0062prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'ligar_machote_robot_v163e_0062prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text);
    ALTER FUNCTION conceptualizador.ligar_machote_robot_v163e_0062prev(uuid, uuid, int, text) RENAME TO ligar_machote_robot_v163e;
  END IF;
END
$rv62$;
DO $gv62$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) TO comercial_app;
  END IF;
END
$gv62$;
-- la puerta del robot vuelve a la de la 0041 (antes de quitar orden_del_caso_v164, que la nueva llama)
CREATE OR REPLACE FUNCTION conceptualizador.robot_gate_v163e(p_machote uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rgr62$
DECLARE
  k     record;
  v_so  int;
  v_due text;
BEGIN
  IF NOT conceptualizador.prendido('borrador_robot_v163e') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ROBOT_APAGADO', 'mensaje', 'El robot todavía no crea el borrador solo (borrador_robot_v163e apagado).');
  END IF;
  SELECT m.odoo_so_id, m.dueno INTO v_so, v_due FROM comercial.machote m WHERE m.id = p_machote;
  SELECT c.id, c.autor, c.estado, c.demo, c.archivado_at, c.enviada_at, c.orden_id INTO k
    FROM conceptualizador.caso c WHERE c.machote_id = p_machote ORDER BY c.created_at DESC LIMIT 1;
  IF k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_CASO', 'mensaje', 'Ese machote no es de ningún caso: el robot solo mueve lo de sus casos.'); END IF;
  IF k.demo THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_DEMO', 'mensaje', 'Caso demo: el robot no crea órdenes.'); END IF;
  IF k.archivado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_ARCHIVADO', 'mensaje', 'El caso está archivado.'); END IF;
  IF k.estado IS DISTINCT FROM 'abierto' OR k.enviada_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = k.id AND a.tipo = 'enviada' AND a.estado = 'hecha') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_ENVIADO', 'mensaje', 'El caso ya se envió o se cerró: lo enviado no se toca.');
  END IF;
  IF EXISTS (SELECT 1 FROM conceptualizador.agente_pausa z WHERE z.caso_id = k.id AND z.hasta IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_EN_PAUSA', 'mensaje', 'El dueño pausó al agente en este caso.');
  END IF;
  IF k.autor IS DISTINCT FROM p_actor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_EL_AUTOR', 'mensaje', 'El robot mueve la orden a nombre del autor del caso (' || coalesce(k.autor, '¿?') || '), no de ' || coalesce(p_actor, '¿?') || '.');
  END IF;
  IF NOT conceptualizador.puede_mover(p_actor, v_due) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO', 'mensaje', 'El machote es de ' || coalesce(v_due, '¿?') || ' y el autor del caso no lo puede mover.');
  END IF;
  -- una sola orden por caso: si el caso ya tiene una y no es la de este machote, no se crea otra.
  IF k.orden_id IS NOT NULL AND k.orden_id IS DISTINCT FROM v_so THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OTRA_ORDEN', 'mensaje', 'El caso ya tiene la orden ' || k.orden_id || ' de otro machote: una sola orden por caso.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'caso_id', k.id, 'autor', k.autor);
END
$rgr62$;
ALTER FUNCTION conceptualizador.robot_gate_v163e(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.robot_gate_v163e(uuid, text) FROM PUBLIC;
DROP FUNCTION IF EXISTS conceptualizador.orden_del_caso_v164(uuid);
DROP FUNCTION IF EXISTS conceptualizador.religar_orden_v164(uuid, int, text);
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr62$
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
               'estimados_v163h','sentido_v163h',
               'no_esperar_v163g4',
               'superadas_v163g5',
               'criterio_v163i','ruido_v163i','voz_previa_v163i','por_confirmar_v163i','un_paso_v163i','cambio_no_llegado_v163i',
               'frenos_v163i','regla_nueva_v163i','freno_arriba_v163i','fallas_odoo_v163i',
               'idioma_persona_v163i','mic_visible_v163i','rafaga_vacia_v163i',
               'rfc_usa_v163i','cliente_grupo_v163i',
               'ruido_chat_v163i','numero_directo_v163i',
               'sin_ciclo_v163i','alarma_ciclo_v163i','version_vigente_v163i','pdf_odoo_v163i',
               'viaje_oculto_v163i','candado_persona_v163i','pregunta_primero_v163i',
               'rayito_v163i',
               'limpieza_v163i']
$inr62$;
DELETE FROM conceptualizador.config WHERE clave = 'interruptor:una_cotizacion_v164';
