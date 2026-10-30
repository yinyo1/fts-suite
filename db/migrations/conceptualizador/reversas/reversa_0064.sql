-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0064 (V1.65, fts-suite#442): las envolturas regresan a la función de antes (api_suite, hilo y las
-- dos puertas del robot), se quitan las funciones nuevas y la lista de interruptores vuelve a la de la 0062 (copiada de
-- db/062_conceptualizador.sql por herramienta, sin teclear). Lo escrito NO se borra: caso.recotizacion, mensaje.historia y
-- comercial.orden_respaldo se quedan (esquema de solo agregar); sin las funciones, nadie los usa. Los renglones
-- interruptor:<nombre>@<caso|persona> se quedan y no prenden nada (la 0062 no los lee).
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv64$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0064prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0064prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'hilo_0064prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.hilo(uuid);
    ALTER FUNCTION conceptualizador.hilo_0064prev(uuid) RENAME TO hilo;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'robot_gate_v163e_0064prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.robot_gate_v163e(uuid, text);
    ALTER FUNCTION conceptualizador.robot_gate_v163e_0064prev(uuid, text) RENAME TO robot_gate_v163e;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'robot_machote_v163e_0064prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.robot_machote_v163e(uuid, text);
    ALTER FUNCTION conceptualizador.robot_machote_v163e_0064prev(uuid, text) RENAME TO robot_machote_v163e;
  END IF;
END
$rv64$;
DO $gr64v$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb), conceptualizador.hilo(uuid) TO conceptualizador_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) TO comercial_app;
  END IF;
END
$gr64v$;
DROP FUNCTION IF EXISTS conceptualizador.recotizacion_bloquea_robot(uuid);
DROP FUNCTION IF EXISTS conceptualizador.orden_v165(uuid, text);
DROP FUNCTION IF EXISTS conceptualizador.respaldar_orden_v165(uuid, int, text, jsonb);
DROP FUNCTION IF EXISTS conceptualizador.adoptar_orden_v165(jsonb);
DROP FUNCTION IF EXISTS conceptualizador.historia_sembrar_v165(uuid, text, jsonb);
DROP FUNCTION IF EXISTS conceptualizador.recotizar_v165(uuid, text, uuid, int, boolean);
DROP FUNCTION IF EXISTS conceptualizador.interruptores_actor(text);
DROP FUNCTION IF EXISTS conceptualizador.prendido_para(text, uuid, text);
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in64r$
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
               'limpieza_v163i',
               'voz_decide_v164','una_cotizacion_v164']
$in64r$;
