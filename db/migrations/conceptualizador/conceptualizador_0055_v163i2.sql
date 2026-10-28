-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0055 · V1.63i.2 (fts-conceptualizador#16, Esteban 28-oct-2026 09:45 MT, puntos 1 y 2b)
--   · interruptores nuevos, APAGADOS:
--       idioma_persona_v163i (punto 1, D216): la conversación va en el idioma preferido de la persona; lo del cliente, en el del país.
--       mic_visible_v163i    (punto 2a): «No entendí nada, vuelve a grabar» en la pantalla para una ráfaga sin cambios.
--       rafaga_vacia_v163i   (punto 2b): el motor marca la tarjeta «Esto entendí» vacía (datos.vacia) y la base la cierra sola.
--   · disparador voz_rafaga_vacia (AFTER INSERT en accion, corre después de voz_rafaga_accion por orden de nombre): con
--     rafaga_vacia_v163i prendido, una voz_entendi que nace «propuesta» con datos.vacia = true pasa a «descartada» por el motor;
--     el UPDATE dispara voz_rafaga_accion, que deja la ráfaga decidida (aprobados 0). No toca ninguna otra tarjeta.
-- Aditiva. Reversa: reversas/055_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in55$
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
               'idioma_persona_v163i','mic_visible_v163i','rafaga_vacia_v163i']
$in55$;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION conceptualizador.voz_rafaga_vacia() RETURNS trigger
LANGUAGE plpgsql AS $vrv55$
BEGIN
  IF NEW.tipo = 'voz_entendi' AND NEW.estado = 'propuesta' AND coalesce(NEW.datos->>'vacia', '') = 'true'
     AND conceptualizador.prendido('rafaga_vacia_v163i') THEN
    UPDATE conceptualizador.accion
       SET estado = 'descartada', hecha_por = 'motor', hecha_at = now(),
           resultado = jsonb_build_object('cerrada_por_motor', true, 'motivo', 'rafaga_vacia',
                                          'detalle', 'No entendí nada, vuelve a grabar (0 cambios).')
     WHERE id = NEW.id AND estado = 'propuesta';
  END IF;
  RETURN NEW;
END
$vrv55$;
DROP TRIGGER IF EXISTS voz_rafaga_vacia ON conceptualizador.accion;
CREATE TRIGGER voz_rafaga_vacia AFTER INSERT ON conceptualizador.accion
  FOR EACH ROW EXECUTE FUNCTION conceptualizador.voz_rafaga_vacia();
REVOKE ALL ON FUNCTION conceptualizador.voz_rafaga_vacia() FROM PUBLIC;
