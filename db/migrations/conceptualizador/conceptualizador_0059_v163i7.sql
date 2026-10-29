-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0059 · V1.63i.7 (fts-conceptualizador#16 d, e y f, Esteban 28-oct-2026 14:10 MT) · «que no salga» es ocultar, y el
-- candado de una persona no frena su propia decisión; y una pregunta se contesta primero (#16 1c)
--
-- Caso real 70f5e9 (Calbee Clarifier, Richard, COT-0044, SO11938): «que en la cotización no salga nada de viáticos» (msg 1908) se aplicó
-- como quitar del costo (10,546.71 → 9,946.71) y luego dos candados frenaron la decisión de Richard (la versión 10 que él mismo aceptó, y
-- el reparto por sección 14,731 que hizo el agente de su total 20,150). Lo decide el motor (herramientas/motor/viaje-oculto.js y
-- candado-persona.js); la base solo da de alta los dos interruptores, APAGADOS ('0'):
--   · viaje_oculto_v163i     (D224) guardia «quitar → ocultar» y «viaje incluido en el precio (no se muestra)»
--   · candado_persona_v163i  (D225) el total que dijo la persona es el candado (no el reparto del agente); su decisión nueva levanta el
--                                   candado de su versión; una pregunta no desbloquea
--   · pregunta_primero_v163i (D226) una pregunta directa de la persona se contesta primero y con lo guardado (pregunta-primero.js)
-- Ni funciones nuevas ni cambios a api_motor, agente_gate u orden-odoo: el workflow de n8n no cambia.
-- Aditiva e idempotente. Reversa: reversas/059_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in59$
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
               'viaje_oculto_v163i','candado_persona_v163i','pregunta_primero_v163i']
$in59$;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── V1.63i.7b (#16, 28-oct 18:00 CST) · la pantalla recibe la versión VIGENTE del machote ─────────────────────────────────────
-- Medido antes de prender pdf_odoo_v163i: el `hilo` de la pantalla (api_suite) no traía `caso.machote_vigente` (solo el `tomar` del
-- motor, 0032). Sin él, la pantalla tomaba como vigente la ÚLTIMA tarjeta «crear machote» hecha, que no existe cuando el machote lo
-- guardó el agente: en a3d9c8 decía «la vigente: USD 8,378» (la v4) con la v5 de USD 8,363.79 guardada. Con pdf_odoo_v163i o
-- numero_directo_v163i (los dos pintan la versión), el hilo trae la última versión de comercial.machote_version, SIN el documento.
CREATE OR REPLACE FUNCTION conceptualizador.vigente_corto(p_machote uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $vc59$
  SELECT CASE WHEN v IS NULL THEN NULL ELSE v - 'documento' END FROM (SELECT conceptualizador.vigente_de(p_machote) AS v) x
$vc59$;
REVOKE ALL ON FUNCTION conceptualizador.vigente_corto(uuid) FROM PUBLIC;

DO $ren59s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0059prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0059prev;
  END IF;
END
$ren59s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui59$
DECLARE
  v_r jsonb := conceptualizador.api_suite_0059prev(p);
  v_m jsonb;
BEGIN
  IF coalesce(p->>'modo', '') <> 'hilo' OR NOT coalesce((v_r->>'ok')::boolean, false) OR jsonb_typeof(v_r->'hilo'->'caso') IS DISTINCT FROM 'object'
     OR NOT (conceptualizador.prendido('pdf_odoo_v163i') OR conceptualizador.prendido('numero_directo_v163i')) THEN RETURN v_r; END IF;
  v_m := conceptualizador.vigente_corto(conceptualizador.a_uuid(v_r->'hilo'->'caso'->>'machote_id'));
  IF v_m IS NOT NULL THEN v_r := jsonb_set(v_r, ARRAY['hilo','caso','machote_vigente'], v_m); END IF;
  RETURN v_r;
END
$sui59$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0059prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0059prev(jsonb) FROM PUBLIC;
DO $gr59s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0059prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr59s$;
