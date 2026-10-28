-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0053 (V1.63i, #16): las funciones vuelven a la 0052. La tabla cambio_pedido y los renglones de
-- config se quedan (no estorban apagados). ⚠ Antes de correrla, los 10 interruptores de la V1.63i en '0'.
-- ═══════════════════════════════════════════════════════════════════════════
DO $r53$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0053prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0053prev(jsonb) RENAME TO api_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0053prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0053prev(text) RENAME TO alarmas_motor;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'encolar_alarmas_0053prev') THEN
    DROP FUNCTION conceptualizador.encolar_alarmas(text);
    ALTER FUNCTION conceptualizador.encolar_alarmas_0053prev(text) RENAME TO encolar_alarmas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'agente_gate_0053prev') THEN
    DROP FUNCTION conceptualizador.agente_gate(bigint, uuid, text);
    ALTER FUNCTION conceptualizador.agente_gate_0053prev(bigint, uuid, text) RENAME TO agente_gate;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'voz_rafaga_normal_0053prev') THEN
    DROP FUNCTION conceptualizador.voz_rafaga_normal(jsonb);
    ALTER FUNCTION conceptualizador.voz_rafaga_normal_0053prev(jsonb) RENAME TO voz_rafaga_normal;
  END IF;
END
$r53$;
DROP FUNCTION IF EXISTS conceptualizador.cambio_no_llegado_avisar(timestamptz);
DROP FUNCTION IF EXISTS conceptualizador.cambio_no_llegado(timestamptz);
DROP FUNCTION IF EXISTS conceptualizador.causa_legitima(text);
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr53$
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
               'superadas_v163g5']
$inr53$;
DELETE FROM conceptualizador.config WHERE clave IN ('interruptor:criterio_v163i','interruptor:ruido_v163i','interruptor:voz_previa_v163i',
  'interruptor:por_confirmar_v163i','interruptor:un_paso_v163i','interruptor:cambio_no_llegado_v163i','interruptor:frenos_v163i',
  'interruptor:regla_nueva_v163i','interruptor:freno_arriba_v163i','interruptor:fallas_odoo_v163i');
DO $gr53r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$gr53r$;
