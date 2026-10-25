-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0038 · V1.63c (fts-conceptualizador#12): el PDF de la cotización en un solo lugar
--
-- Va de Esteban del 24-oct-2026 19:56 CST («construye y despliega el prototipo «un solo lugar para el PDF» tal como está»).
-- Interruptor nuevo, en '0':
--   pdf_unico_v163 · la respuesta que cambia la cotización trae el PDF nuevo como archivo (con «↺ Deshacer»); los borradores
--                    anteriores y «Ya la mandé» quedan plegados como historial, sin botones de PDF; «Correo para envío» y
--                    «Ya la mandé» salen una sola vez, al final, en el estado vigente; y el ⋮ trae UNA entrada, «PDF de la
--                    cotización (última versión)», que abre el visor con «⬇ Descargar» adentro. Siempre el último PDF de Odoo.
-- Solo pantalla: la base no cambia de comportamiento. Apagado, todo sale igual que con la 0037. Reversa: reversas/reversa_0038.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in38$
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
               'pdf_unico_v163']
$in38$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
