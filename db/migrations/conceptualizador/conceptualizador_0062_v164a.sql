-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0062 · V1.64a (fts-conceptualizador#20, Esteban 29-oct-2026 14:55 CST, D231) · una sola cotización por caso
--
-- 8894ce (Quimitec, Montalvo): el 27-oct el robot creó COT-0062 y de ahí SO11936; la tarjeta «Crear el machote a tu nombre» del
-- trabajo 922 (anterior al robot) seguía viva, Montalvo la tocó el 28-oct y la pantalla creó COT-0064 y le puso al caso ese machote,
-- que no tenía orden. Desde ahí cada actualización salía SIN_ORDEN (orden-odoo busca la orden en el machote) y CONTRADICE_DECISION (el
-- candado veía COT-0064 v1): 4 clics de Montalvo guardaron COT-0062 v3–v6 y SO11936 se quedó en 725,810.
-- Con el interruptor una_cotizacion_v164 (nace APAGADO; apagado = igual que antes):
--   1 · orden_del_caso_v164(machote): la orden del CASO de ese machote. orden-odoo la usa cuando el machote no tiene la suya
--       («Postgres - Leer machote»: COALESCE(m.odoo_so_id, la del caso)).
--   2 · religar_orden_v164(machote, so, actor): antes de «Postgres - Guardar orden», suelta la orden de OTRO machote del mismo caso
--       (sin borrar nada: el otro queda archivado como superado) para que el índice único machote_odoo_so_uq no la frene.
--   3 · ligar_machote_robot_v163e (envoltura): cuando el robot liga su machote al caso, las tarjetas «Crear el machote» que siguen
--       propuestas en ese caso se descartan (ya hay machote: la siguiente sale como «Actualizar»).
--   4 · api_suite (envoltura): una tarjeta «Crear el machote» hecha en un caso que YA tiene machote no le cambia el machote al caso;
--       el nuevo queda archivado como superado y la respuesta lo dice (la pantalla con el interruptor ya no crea el segundo).
-- ORDEN: 0061 → 0062. Aditiva e idempotente. Reversa: reversas/062_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in62$
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
$in62$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── 1 · la orden del caso de un machote ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.orden_del_caso_v164(p_machote uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $od62$
  SELECT CASE WHEN conceptualizador.prendido('una_cotizacion_v164') THEN
    (SELECT jsonb_build_object('caso_id', k.id, 'orden_id', k.orden_id, 'orden_nombre', k.orden_nombre)
       FROM conceptualizador.caso k WHERE k.machote_id = p_machote AND k.orden_id IS NOT NULL ORDER BY k.created_at DESC LIMIT 1)
  END
$od62$;
ALTER FUNCTION conceptualizador.orden_del_caso_v164(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_del_caso_v164(uuid) FROM PUBLIC;

-- ── 2 · soltar la orden de otro machote del mismo caso ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.religar_orden_v164(p_machote uuid, p_so int, p_actor text) RETURNS jsonb
LANGUAGE plpgsql AS $rl62$
DECLARE
  v_caso uuid;
  v_n    int := 0;
  v_fol  text;
BEGIN
  IF NOT conceptualizador.prendido('una_cotizacion_v164') OR p_so IS NULL THEN RETURN jsonb_build_object('ok', true, 'apagado', true); END IF;
  SELECT k.id INTO v_caso FROM conceptualizador.caso k WHERE k.machote_id = p_machote ORDER BY k.created_at DESC LIMIT 1;
  IF v_caso IS NULL THEN RETURN jsonb_build_object('ok', true, 'sin_caso', true); END IF;
  SELECT folio_txt INTO v_fol FROM comercial.machote WHERE id = p_machote;
  -- solo machotes que son de ESTE caso (los ligó alguna tarjeta o el robot), nunca uno de otro caso
  UPDATE comercial.machote m
     SET odoo_so_id = NULL, odoo_so_name = NULL, odoo_so_claim_at = NULL,
         archivado_at = coalesce(m.archivado_at, now()),
         archivado_por = coalesce(m.archivado_por, left('una_cotizacion_v164: superado por ' || coalesce(v_fol, p_machote::text) || ' (' || coalesce(p_actor, 'orden-odoo') || ')', 200)),
         updated_by = coalesce(p_actor, m.updated_by)
   WHERE m.odoo_so_id = p_so AND m.id <> p_machote AND m.deleted_at IS NULL
     AND m.id IN (SELECT (a.resultado->>'machote_id')::uuid FROM conceptualizador.accion a
                   WHERE a.caso_id = v_caso AND a.tipo = 'crear_machote' AND a.estado = 'hecha' AND a.resultado->>'machote_id' ~ '^[0-9a-f-]{36}\Z');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'soltados', v_n, 'caso_id', v_caso);
END
$rl62$;
ALTER FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) FROM PUBLIC;
DO $gr62$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_del_caso_v164(uuid) TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) TO comercial_app;
  END IF;
END
$gr62$;

-- ── 3 · el robot liga su machote: las tarjetas «Crear el machote» que seguían propuestas se retiran ────────────
DO $ren62r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'ligar_machote_robot_v163e_0062prev') THEN
    ALTER FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) RENAME TO ligar_machote_robot_v163e_0062prev;
  END IF;
END
$ren62r$;
CREATE OR REPLACE FUNCTION conceptualizador.ligar_machote_robot_v163e(p_caso uuid, p_machote uuid, p_version int, p_folio text) RETURNS jsonb
LANGUAGE plpgsql AS $lm62$
DECLARE
  v_r jsonb := conceptualizador.ligar_machote_robot_v163e_0062prev(p_caso, p_machote, p_version, p_folio);
  v_n int := 0;
BEGIN
  IF conceptualizador.prendido('una_cotizacion_v164') AND coalesce((v_r->>'ok')::boolean, false) THEN
    UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_por = 'motor', hecha_at = now(),
           resultado = jsonb_build_object('reemplazada_por_machote', p_machote, 'por', 'una_cotizacion_v164', 'texto', 'El caso ya tiene machote: esta tarjeta crearía otro.')
     WHERE a.caso_id = p_caso AND a.tipo = 'crear_machote' AND a.estado = 'propuesta' AND (a.datos->'actualiza') IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_r := v_r || jsonb_build_object('tarjetas_retiradas', v_n); END IF;
  END IF;
  RETURN v_r;
END
$lm62$;
ALTER FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.ligar_machote_robot_v163e_0062prev(uuid, uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.ligar_machote_robot_v163e_0062prev(uuid, uuid, int, text) FROM PUBLIC;
DO $gl62$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) TO comercial_app;
    REVOKE ALL ON FUNCTION conceptualizador.ligar_machote_robot_v163e_0062prev(uuid, uuid, int, text) FROM comercial_app;
  END IF;
END
$gl62$;

-- ── 3b · la puerta del robot: la orden del machote puede ser la de su caso (el resto, igual que la 0041) ─────────────
CREATE OR REPLACE FUNCTION conceptualizador.robot_gate_v163e(p_machote uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rg62$
DECLARE
  k     record;
  v_so  int;
  v_due text;
BEGIN
  IF NOT conceptualizador.prendido('borrador_robot_v163e') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ROBOT_APAGADO', 'mensaje', 'El robot todavía no crea el borrador solo (borrador_robot_v163e apagado).');
  END IF;
  SELECT m.odoo_so_id, m.dueno INTO v_so, v_due FROM comercial.machote m WHERE m.id = p_machote;
  -- V1.64a (#20, una_cotizacion_v164) · sin orden en el machote, la orden es la de su caso (orden_del_caso_v164): así un caso con un
  -- solo machote vigente y la orden colgada del anterior no se queda en OTRA_ORDEN.
  IF v_so IS NULL THEN v_so := (conceptualizador.orden_del_caso_v164(p_machote)->>'orden_id')::int; END IF;
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
$rg62$;
ALTER FUNCTION conceptualizador.robot_gate_v163e(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.robot_gate_v163e(uuid, text) FROM PUBLIC;

-- ── 4 · una tarjeta «Crear el machote» hecha en un caso que ya tiene machote no le cambia el machote al caso ─────────
DO $ren62s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0062prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0062prev;
  END IF;
END
$ren62s$;
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui62$
DECLARE
  v_a   conceptualizador.accion%ROWTYPE;
  v_m0  uuid;
  v_f0  text;
  v_r   jsonb;
  v_new uuid;
BEGIN
  IF p->>'modo' = 'accion' AND p->>'decision' = 'hecha' AND conceptualizador.prendido('una_cotizacion_v164') THEN
    SELECT * INTO v_a FROM conceptualizador.accion WHERE id = conceptualizador.a_entero(p->>'accion_id');
    IF v_a.id IS NOT NULL AND v_a.tipo = 'crear_machote' AND v_a.estado = 'propuesta' THEN
      SELECT machote_id, machote_folio INTO v_m0, v_f0 FROM conceptualizador.caso WHERE id = v_a.caso_id;
    END IF;
  END IF;
  v_r := conceptualizador.api_suite_0062prev(p);
  IF v_m0 IS NOT NULL AND coalesce((v_r->>'ok')::boolean, false) THEN
    v_new := CASE WHEN coalesce(p->'resultado'->>'machote_id', '') ~ '^[0-9a-f-]{36}\Z' THEN (p->'resultado'->>'machote_id')::uuid END;
    IF v_new IS NOT NULL AND v_new <> v_m0 THEN
      UPDATE conceptualizador.caso SET machote_id = v_m0, machote_folio = coalesce(v_f0, machote_folio) WHERE id = v_a.caso_id;
      UPDATE comercial.machote SET archivado_at = coalesce(archivado_at, now()),
             archivado_por = coalesce(archivado_por, left('una_cotizacion_v164: el caso ya tenía ' || coalesce(v_f0, v_m0::text), 200))
       WHERE id = v_new AND odoo_so_id IS NULL;
      v_r := v_r || jsonb_build_object('machote_superado', jsonb_build_object('nuevo', v_new, 'vigente', v_m0, 'folio_vigente', v_f0));
    END IF;
  END IF;
  RETURN v_r;
END
$sui62$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0062prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0062prev(jsonb) FROM PUBLIC;
DO $gr62s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0062prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr62s$;
