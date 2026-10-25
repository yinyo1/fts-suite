-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0043 · V1.63e (fts-conceptualizador#12): el robot crea y liga el machote del caso
--
-- Esteban, 25-oct-2026 15:07 CST, punto 2: «6b4b5c llegó a la etapa machote pero no tiene machote guardado. Di por qué no se guardó
-- y corrígelo para que el borrador del 2b pueda salir». Causa: la decisión V1.47/V1.62b («el agente sube versión del mismo machote,
-- sin crear ni cambiar dueño, y solo por instrucción de una persona») seguía en tres frenos: machote-guardar no deja crear al motor,
-- la versión del motor pide agente_gate (un trabajo con mensaje de una persona) y caso.machote_id solo se llena con el clic.
-- Un interruptor nuevo, en '0':
--   machote_robot_v163e · el robot (avance) CREA el machote del caso si no tiene, a nombre del AUTOR del caso (dueño = autor; el autor
--                         de la versión queda «motor» y el motivo empieza con «Agente:»), o le sube versión al suyo, sin la instrucción
--                         de una persona. La base revisa aquí (`robot_machote_v163e`) que el caso sea real, abierto, no enviado, sin
--                         pausa, no demo, y que el machote sea el del caso (o que el caso no tenga). Y `ligar_machote_robot_v163e` (la llama machote-guardar)
--                         deja `crear_machote` hecha y llena caso.machote_id (lo mismo que hace el clic de la pantalla).
-- Apagado: machote-guardar sale igual que con la 0042. Reversa: reversas/043_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in43$
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
               'machote_robot_v163e']
$in43$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── el robot y el machote del caso: si puede crear, si puede subir versión, a nombre de quién ──────────────
-- modo «crear»: el caso no tiene machote y no existe uno con ese id_local. modo «actualizar»: el machote con ese id_local es el del
-- caso, o (si el caso todavía no lo tiene ligado) es del autor del caso y no está ligado a otro caso: una creación anterior que no
-- se alcanzó a ligar; así el reintento no crea otro.
CREATE OR REPLACE FUNCTION conceptualizador.robot_machote_v163e(p_caso uuid, p_id_local text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rm43$
DECLARE
  k    record;
  m    record;
BEGIN
  IF NOT conceptualizador.prendido('machote_robot_v163e') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ROBOT_APAGADO', 'mensaje', 'El robot todavía no crea el machote solo (machote_robot_v163e apagado).');
  END IF;
  SELECT c.id, c.autor, c.autor_nombre, c.estado, c.demo, c.archivado_at, c.enviada_at, c.machote_id INTO k
    FROM conceptualizador.caso c WHERE c.id = p_caso;
  IF k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_CASO', 'mensaje', 'Ese caso no existe.'); END IF;
  IF k.demo THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_DEMO', 'mensaje', 'Caso demo: el robot no crea machotes.'); END IF;
  IF k.archivado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_ARCHIVADO', 'mensaje', 'El caso está archivado.'); END IF;
  IF k.estado IS DISTINCT FROM 'abierto' OR k.enviada_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = k.id AND a.tipo = 'enviada' AND a.estado = 'hecha') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_ENVIADO', 'mensaje', 'El caso ya se envió o se cerró: lo enviado no se toca.');
  END IF;
  IF EXISTS (SELECT 1 FROM conceptualizador.agente_pausa z WHERE z.caso_id = k.id AND z.hasta IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_EN_PAUSA', 'mensaje', 'El dueño pausó al agente en este caso.');
  END IF;
  IF coalesce(p_id_local, '') !~ '^M-[0-9]{10,16}\Z' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ID_LOCAL_INVALIDO', 'mensaje', 'El id del machote no tiene la forma M-<epoch>.');
  END IF;
  SELECT x.id, x.dueno INTO m FROM comercial.machote x WHERE x.id_local = p_id_local AND x.deleted_at IS NULL;
  IF k.machote_id IS NOT NULL THEN
    IF m.id IS DISTINCT FROM k.machote_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'El caso ya tiene otro machote: el robot solo le sube versión al suyo.');
    END IF;
  ELSIF m.id IS NOT NULL THEN
    IF m.dueno IS DISTINCT FROM k.autor
       OR EXISTS (SELECT 1 FROM conceptualizador.caso o WHERE o.machote_id = m.id AND o.id <> k.id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'Ese machote no es del autor del caso o ya es de otro caso.');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', true, 'modo', 'crear', 'caso_id', k.id, 'autor', k.autor, 'autor_nombre', coalesce(k.autor_nombre, k.autor));
  END IF;
  IF NOT conceptualizador.puede_mover(k.autor, m.dueno) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO', 'mensaje', 'El machote es de ' || coalesce(m.dueno, '¿?') || ' y el autor del caso no lo puede mover.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', 'actualizar', 'caso_id', k.id, 'autor', k.autor, 'autor_nombre', coalesce(k.autor_nombre, k.autor), 'machote_id', m.id);
END
$rm43$;
ALTER FUNCTION conceptualizador.robot_machote_v163e(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) FROM PUBLIC;
DO $gr43$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) TO comercial_app;
  END IF;
END
$gr43$;

-- ── ligar el machote que creó el robot al caso (lo mismo que el clic de la pantalla): crear_machote hecha y caso.machote_id ──────
-- La llama comercial/machote-guardar en «Postgres - Tocar machote», en el camino del robot, después de guardar la versión. Vuelve a
-- pasar por la puerta: solo liga si el machote es del caso (o el caso no tiene) y el interruptor sigue prendido. Ya ligado: ya_estaba.
CREATE OR REPLACE FUNCTION conceptualizador.ligar_machote_robot_v163e(p_caso uuid, p_machote uuid, p_version int, p_folio text) RETURNS jsonb
LANGUAGE plpgsql AS $lm43$
DECLARE
  v_g  jsonb;
  v_c  conceptualizador.caso%ROWTYPE;
  v_m  record;
  v_id bigint;
  v_f  text;
BEGIN
  SELECT x.id, x.id_local, x.folio_txt INTO v_m FROM comercial.machote x WHERE x.id = p_machote AND x.deleted_at IS NULL;
  IF v_m.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_ENCONTRADO'); END IF;
  v_g := conceptualizador.robot_machote_v163e(p_caso, v_m.id_local);
  IF NOT coalesce((v_g->>'ok')::boolean, false) THEN RETURN jsonb_build_object('ok', false) || (v_g - 'ok'); END IF;
  SELECT * INTO v_c FROM conceptualizador.caso WHERE id = p_caso;
  IF v_c.machote_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'ya_estaba', true, 'machote_id', v_c.machote_id); END IF;
  IF coalesce(p_version, 0) < 1 THEN RETURN jsonb_build_object('ok', false, 'error', 'VERSION_INVALIDA'); END IF;
  v_f := coalesce(nullif(left(coalesce(p_folio, ''), 40), ''), v_m.folio_txt);
  INSERT INTO conceptualizador.accion (caso_id, tipo, titulo, datos, estado, resultado, hecha_por, hecha_at)
  VALUES (v_c.id, 'crear_machote', 'Machote ' || coalesce(v_f || ' ', '') || 'creado por el agente', jsonb_build_object('origen', 'avance'), 'hecha',
          jsonb_build_object('machote_id', v_m.id, 'id_local', v_m.id_local, 'version', p_version, 'folio', v_f, 'por', 'agente', 'robot', true,
                             'texto', 'Machote ' || coalesce(v_f || ' ', '') || 'creado por el agente a nombre de ' || coalesce(v_c.autor_nombre, v_c.autor) || '.'),
          'motor-avance', now())
  RETURNING id INTO v_id;
  UPDATE conceptualizador.caso SET machote_id = v_m.id, machote_folio = coalesce(v_f, machote_folio) WHERE id = v_c.id AND machote_id IS NULL;
  RETURN jsonb_build_object('ok', true, 'accion_id', v_id, 'machote_id', v_m.id, 'folio', v_f);
EXCEPTION WHEN OTHERS THEN
  -- nunca tumba el guardado del machote (la versión ya quedó): el ligado se reintenta en la siguiente pasada
  RETURN jsonb_build_object('ok', false, 'error', 'FALLO_LIGAR', 'detalle', left(SQLERRM, 200));
END
$lm43$;
ALTER FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) FROM PUBLIC;
DO $gl43$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) TO comercial_app;
  END IF;
END
$gl43$;
