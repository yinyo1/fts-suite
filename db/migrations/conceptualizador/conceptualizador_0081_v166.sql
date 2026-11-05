-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0081 · V1.66 Fase 1 (fts-conceptualizador#34) · la pantalla conoce los cuatro interruptores de la Fase 1
-- La pantalla solo lee los interruptores de interruptores_nombres(). Esta migración es la de la 0073 más cuatro nombres, todos APAGADOS:
--   pago_unico_v166 (una sola fuente de pagos, D255-D256) · excepcion_msg_v166 («msg N» → decreto y nuevo:<k>, D257)
--   impuesto_obra_v166 (NM GRT por el estado de la obra, D258) · descarte_v166 (la tarjeta descartada no vuelve, D256)
-- Nada más cambia. ORDEN: 0080 → 0081. Aditiva e idempotente. Reversa: reversas/081_reversa.sql (la lista de la 0073).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in81$
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
               'voz_decide_v164','una_cotizacion_v164',
               'recotizar_v165','historia_v165','adoptar_orden_v165','chatter_orden_v165',
               'casos_propios_v164',
               'limpio_v164',
               'pago_unico_v166','excepcion_msg_v166','impuesto_obra_v166','descarte_v166']
$in81$;
