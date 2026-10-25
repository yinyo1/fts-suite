-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0041 · V1.63e bloque 2b (fts-conceptualizador#12): el PDF borrador sale solo
--
-- Decisión de Esteban del 25-oct-2026 11:40 CST. Dos interruptores nuevos, en '0':
--   borrador_n5_v163e    · orden-odoo acepta crear o actualizar el BORRADOR aunque el machote tenga renglones N5 (sin precio). El
--                          motor marca esos renglones «precio por confirmar» (USA: «price TBC»). «Ya la mandé» sigue frenado hasta
--                          cero N5 (PENDIENTES_PROVEEDOR también en modo enviada). Lo decide orden-odoo con `orden_v163e()`.
--   borrador_robot_v163e · el robot (avance) crea y ACTUALIZA ese borrador por su cuenta, sin la instrucción de una persona: una sola
--                          orden por caso, nunca la marca enviada, nunca la confirma, nunca manda correo. La base revisa aquí
--                          (`robot_gate_v163e`) que el caso sea real, abierto, no enviado, sin pausa, del mismo autor, y que no tenga
--                          ya OTRA orden.
-- Y su alarma (regla 1 de construcción), solo con borrador_robot_v163e prendido y contada desde que se prendió:
--   borrador_robot_frenado · el mismo caso juntó 3 o más rechazos de orden-odoo por el camino del motor en 24 h (el robot insiste
--                            y no pasa: hay algo que el robot no resuelve y nadie se está enterando).
-- Y el borrador que hizo el robot queda en el caso: api_motor `publicar` con `borrador_robot` deja `crear_borrador` hecha.
-- Apagado, orden-odoo, api_motor y las alarmas salen igual que con la 0040. Reversa: reversas/041_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in41$
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
               'borrador_n5_v163e','borrador_robot_v163e']
$in41$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── el robot, sin instrucción de una persona: qué caso, de quién y si puede ──────────────────
CREATE OR REPLACE FUNCTION conceptualizador.robot_gate_v163e(p_machote uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rg41$
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
$rg41$;
ALTER FUNCTION conceptualizador.robot_gate_v163e(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.robot_gate_v163e(uuid, text) FROM PUBLIC;

-- ── lo que orden-odoo necesita saber (credencial comercial_app) ─────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.orden_v163e(p_machote uuid, p_actor text, p_robot boolean) RETURNS jsonb
LANGUAGE sql STABLE AS $ov41$
  SELECT jsonb_build_object('borrador_n5', conceptualizador.prendido('borrador_n5_v163e'),
                            'borrador_robot', conceptualizador.prendido('borrador_robot_v163e'))
         || CASE WHEN coalesce(p_robot, false) THEN jsonb_build_object('robot', conceptualizador.robot_gate_v163e(p_machote, p_actor)) ELSE '{}'::jsonb END
$ov41$;
ALTER FUNCTION conceptualizador.orden_v163e(uuid, text, boolean) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v163e(uuid, text, boolean) FROM PUBLIC;
DO $gr41$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_v163e(uuid, text, boolean) TO comercial_app;
  END IF;
END
$gr41$;

-- ── la alarma del robot que insiste y no pasa ──────────────────────────────────────────────
DO $ren41a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0041prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0041prev;
  END IF;
END
$ren41a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am41$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0041prev(p_llave);
  v_desde timestamptz;
  v_ahora timestamptz;
  v_zona  text := conceptualizador.zona_robot();
  v_n     bigint;
  v_lista text;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('borrador_robot_v163e') THEN RETURN v_r; END IF;
  v_desde := conceptualizador.prendido_desde('borrador_robot_v163e');
  -- cz.ahora_prueba solo lo pone pruebas/sql-0041.sh (producción nunca lo define)
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  SELECT count(*), string_agg(x.nombre, '; ' ORDER BY x.n DESC) INTO v_n, v_lista FROM (
    SELECT coalesce(nullif(c.titulo, ''), c.id::text) || ' (' || split_part(c.autor, '.', 1) || ', ' || count(*) || ' rechazos, ' ||
           string_agg(DISTINCT r.error, '/') || ')' AS nombre, count(*) AS n
      FROM conceptualizador.orden_rechazo r JOIN conceptualizador.caso c ON c.id = r.caso_id
     WHERE r.via_motor AND r.at >= greatest(v_desde, v_ahora - interval '24 hours') AND r.at <= v_ahora
     GROUP BY c.id, c.titulo, c.autor HAVING count(*) >= 3) x;
  IF v_n > 0 THEN
    v_r := v_r || conceptualizador.alarma('borrador_robot_frenado', to_char(v_ahora AT TIME ZONE v_zona, 'YYYY-MM-DD'), v_ahora - interval '24 hours',
      v_n || ' caso(s) con 3 o más rechazos de orden-odoo por el camino del motor en 24 h: ' || left(v_lista, 700) || '.',
      'Abre el caso y lee el código del rechazo: si es algo del machote (sin cliente, sin RFC, hitos), díselo al dueño en el chat; si es del robot, apaga borrador_robot_v163e y revisa avance.js.',
      'borrador-robot-frenado', jsonb_build_object('casos', v_n));
  END IF;
  RETURN v_r;
END
$am41$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0041prev(text) FROM PUBLIC;

-- ── el borrador del robot queda en el caso (api_motor `publicar` con `borrador_robot`) ────────
-- La pasada de avance que creó o actualizó el borrador lo manda en `publicar` (borrador_robot: orden_id, orden_nombre, estado,
-- subtotal, moneda, por_confirmar). Con el interruptor, la base deja `crear_borrador` hecha (la pantalla muestra el borrador y su PDF)
-- y apunta el caso a esa orden. Solo si la orden es la que orden-odoo ya escribió en el machote del caso (odoo_so_id): un número que
-- no sale de ahí se ignora. Apagado, se ignora.
DO $ren41m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0041prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0041prev;
  END IF;
END
$ren41m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot41$
DECLARE
  v_r  jsonb := conceptualizador.api_motor_0041prev(p);
  v_b  jsonb := CASE WHEN jsonb_typeof(p->'borrador_robot') = 'object' THEN p->'borrador_robot' ELSE NULL END;
  v_c  conceptualizador.caso%ROWTYPE;
  v_so int;
  v_id bigint;
BEGIN
  IF p->>'modo' <> 'publicar' OR v_b IS NULL OR NOT conceptualizador.prendido('borrador_robot_v163e')
     OR NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
  IF coalesce(v_b->>'orden_id', '') !~ '^[1-9][0-9]{0,9}\Z' THEN RETURN v_r || jsonb_build_object('borrador_robot', 'INVALIDO'); END IF;
  SELECT * INTO v_c FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
  IF v_c.id IS NULL OR v_c.machote_id IS NULL THEN RETURN v_r || jsonb_build_object('borrador_robot', 'SIN_CASO'); END IF;
  SELECT m.odoo_so_id INTO v_so FROM comercial.machote m WHERE m.id = v_c.machote_id;
  IF v_so IS DISTINCT FROM (v_b->>'orden_id')::int THEN RETURN v_r || jsonb_build_object('borrador_robot', 'NO_ES_LA_ORDEN_DEL_MACHOTE'); END IF;
  IF v_c.orden_id IS NOT NULL AND v_c.orden_id <> v_so THEN RETURN v_r || jsonb_build_object('borrador_robot', 'OTRA_ORDEN'); END IF;
  INSERT INTO conceptualizador.accion (caso_id, tipo, titulo, datos, estado, resultado, hecha_por, hecha_at)
  VALUES (v_c.id, 'crear_borrador', 'Borrador ' || coalesce(nullif(left(coalesce(v_b->>'orden_nombre', ''), 40), ''), v_so::text) || ' por el agente',
          jsonb_build_object('origen', 'avance', 'pasada', left(coalesce(p->>'pasada', ''), 40)), 'hecha',
          jsonb_build_object('orden_id', v_so, 'orden_nombre', nullif(left(coalesce(v_b->>'orden_nombre', ''), 40), ''),
                             'estado', CASE WHEN v_b->>'estado' IN ('draft','sent') THEN v_b->>'estado' ELSE 'draft' END,
                             'subtotal', CASE WHEN coalesce(v_b->>'subtotal', '') ~ '^[0-9]{1,12}([.][0-9]{1,2})?\Z' THEN (v_b->>'subtotal')::numeric END,
                             'moneda', CASE WHEN v_b->>'moneda' IN ('MXN','USD') THEN v_b->>'moneda' END,
                             'por_confirmar', CASE WHEN coalesce(v_b->>'por_confirmar', '') ~ '^[0-9]{1,3}\Z' THEN (v_b->>'por_confirmar')::int ELSE 0 END,
                             'por_agente', true, 'robot', true,
                             'texto', 'Borrador ' || coalesce(nullif(left(coalesce(v_b->>'orden_nombre', ''), 40), ''), v_so::text) || ' creado o actualizado por el agente (no se envió ni se confirmó).'),
          'motor-avance', now())
  RETURNING id INTO v_id;
  UPDATE conceptualizador.caso SET orden_id = v_so, orden_nombre = coalesce(nullif(left(coalesce(v_b->>'orden_nombre', ''), 40), ''), orden_nombre)
   WHERE id = v_c.id AND (orden_id IS NULL OR orden_id = v_so);
  RETURN v_r || jsonb_build_object('borrador_robot', jsonb_build_object('accion_id', v_id, 'orden_id', v_so));
END
$mot41$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0041prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0041prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0041prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
