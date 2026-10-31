-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0066 · V1.64a (#20 punto 1, sábado 31-oct-2026, Esteban) · SEGURIDAD: la lista de casos se filtra en el SERVIDOR
--
-- Medido el 31-oct 15:56 UTC (n8n ejecución 1028371): conceptualizador.casos_de() le devuelve a CUALQUIER usuario los 34 casos de
-- todos (canario 1 propio, francisco.montalvo 8, ricardo.hernandez 11, zz.prueba 1; solo esteban.delacruz es admin). La pantalla
-- filtraba «Mis proyectos», pero los datos ya habían llegado al navegador. Con el interruptor:
--   · modo casos: cada usuario recibe SOLO los casos de los que es autor; un admin (config.admins, hoy esteban.delacruz) recibe todos.
--   · modo hilo: el hilo de un caso ajeno contesta NO_AUTORIZADO sin leerlo (antes de tocar nada: abrir la vista cuenta como
--     actividad de la persona en db/058, y un ajeno no debe dejar esa marca).
--   La delegación (puede_mover) NO abre la lista: es permiso para mover machotes, no para leer la conversación (decisión de esta
--   sesión; medido: en 30 días nadie que no sea admin escribió en un caso ajeno).
-- Interruptor casos_propios_v164 (global, por persona o por caso vía prendido_para; nace APAGADO para todos). Apagado = como antes.
-- ORDEN: 0065 → 0066. Aditiva e idempotente. Reversa: reversas/066_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in66$
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
               'casos_propios_v164']
$in66$;

INSERT INTO conceptualizador.config (clave, valor) VALUES ('interruptor:casos_propios_v164', '0') ON CONFLICT (clave) DO NOTHING;

DO $ren66s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0066prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0066prev;
  END IF;
END
$ren66s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui66$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_modo  text := p->>'modo';
  v_on    boolean;
  v_autor text;
  v_r     jsonb;
BEGIN
  v_on := v_actor IS NOT NULL AND v_modo IN ('casos', 'hilo')
          AND conceptualizador.prendido_para('casos_propios_v164', NULL, v_actor)
          AND NOT conceptualizador.es_admin(v_actor);
  IF v_on AND v_modo = 'hilo' THEN
    SELECT c.autor INTO v_autor FROM conceptualizador.caso c WHERE c.id = conceptualizador.a_uuid(p->>'caso_id');
    IF v_autor IS NOT NULL AND v_autor <> v_actor THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Este caso no es tuyo.');
    END IF;
  END IF;
  v_r := conceptualizador.api_suite_0066prev(p);
  IF v_on AND v_modo = 'casos' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'casos') = 'array' THEN
    v_r := jsonb_set(v_r, ARRAY['casos'], coalesce((SELECT jsonb_agg(a.x ORDER BY a.o) FROM jsonb_array_elements(v_r->'casos') WITH ORDINALITY AS a(x, o)
                                                     WHERE a.x->>'autor' = v_actor), '[]'::jsonb));
  END IF;
  RETURN v_r;
END
$sui66$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0066prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0066prev(jsonb) FROM PUBLIC;
DO $gr66s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0066prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr66s$;
