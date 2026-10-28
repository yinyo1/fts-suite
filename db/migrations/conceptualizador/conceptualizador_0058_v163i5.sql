-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0058 · V1.63i.6 (fts-conceptualizador#16 puntos C y E.2, Esteban 28-oct-2026 12:25 MT) · que no vuelva a ciclarse
--
-- Casos reales del 28-oct: a3d9c8 (COT-0066, renta 71 → 73 del robot, choque de versión, «Dame los generales» sin respuesta, v4 encima de
-- la v3 de Richard, el robot pasando con Richard activo) y d9159b (COT-0042, la v7 del plano armada por su instrucción y nunca guardada; el
-- agente alternó v7 / v6 en cada «Vuelve a armar»). Todo detrás de interruptores nuevos, APAGADOS ('0'); apagados, todo como antes.
--   · interruptores: sin_ciclo_v163i (C1-C3 y el lote silencioso), alarma_ciclo_v163i (C4), version_vigente_v163i (E.2) y pdf_odoo_v163i
--     (lo usa el botón del PDF de Odoo en la suite; aquí solo se da de alta).
--   · actividad_persona(caso): lo último que hizo una PERSONA en el caso (mensaje, clic, apertura de la vista) y sus trabajos pendientes.
--     La apertura es la consulta `hilo` de la pantalla (push_visto, 0010), SIN la lectura de un golpe que hace la pantalla al cambiar de
--     versión para mandar el «revisa» de todos sus casos (V1.46): ese «revisa» sale en ráfaga en todos los casos y no es abrir ninguno.
--   · api_motor `config` (con sin_ciclo_v163i): trae `actividad_persona` de los casos abiertos con algo en las últimas 2 h. El robot lo lee
--     con la misma caché de 60 s de los interruptores. Sin modo nuevo: el verificador de cz-motor no cambia.
--   · agente_gate (con version_vigente_v163i): una CONTINUACIÓN hereda la instrucción del mensaje de la persona que la dejó (cadena de
--     hasta 5), y un clic con un mensaje de persona en su lote (lote_de) es instrucción de esa persona. Mismas reglas que la 0034: trabajo
--     tomado, instrucción de menos de 2 h, machote del caso, dueño o puede_mover. Solo se mira si la cadena de antes dijo SIN_INSTRUCCION.
--   · alarmas_motor (con alarma_ciclo_v163i): «Vuelve a armar» dos veces en 30 min, de la misma persona en el mismo caso, en las últimas 2 h
--     → alarma `ciclo_vuelve_a_armar` al correo de Esteban (encolar_alarmas → consumo_aviso, el camino de siempre).
-- Aditiva e idempotente. Reversa: reversas/058_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in58$
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
               'sin_ciclo_v163i','alarma_ciclo_v163i','version_vigente_v163i','pdf_odoo_v163i']
$in58$;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── C1 · lo último que hizo una persona en el caso ──
CREATE OR REPLACE FUNCTION conceptualizador.es_maquina(p_autor text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $em58$
  SELECT p_autor IS NULL OR p_autor ~* '^(motor|robot|agente|avance|conceptualizador|sistema|alarma)'
$em58$;

CREATE OR REPLACE FUNCTION conceptualizador.actividad_persona(p_caso uuid, p_ahora timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE sql STABLE AS $ap58$
  WITH k AS (SELECT * FROM conceptualizador.caso WHERE id = p_caso),
  msg AS (SELECT 'mensaje'::text AS fuente, m.created_at AS at, m.autor FROM conceptualizador.mensaje m
           WHERE m.caso_id = p_caso AND m.rol = 'usuario' AND m.created_at <= p_ahora ORDER BY m.created_at DESC LIMIT 1),
  clic AS (SELECT 'clic'::text AS fuente, e.created_at AS at, e.autor FROM conceptualizador.evento e
            WHERE e.caso_id = p_caso AND NOT conceptualizador.es_maquina(e.autor) AND e.tipo NOT IN ('continuacion','barrido','prueba')
              AND NOT (coalesce(e.concepto, '') = 'revisa' AND coalesce(e.datos->>'aviso', '') = 'true') AND e.created_at <= p_ahora
            ORDER BY e.created_at DESC LIMIT 1),
  vista AS (SELECT 'vista'::text AS fuente, pv.visto_at AS at, pv.actor AS autor FROM conceptualizador.push_visto pv, k
             WHERE pv.caso_id = p_caso AND (pv.actor = k.autor OR pv.actor = 'esteban.delacruz') AND pv.visto_at <= p_ahora
               AND NOT EXISTS (SELECT 1 FROM conceptualizador.evento e WHERE e.caso_id = p_caso AND e.autor = pv.actor
                                 AND coalesce(e.concepto, '') = 'revisa' AND coalesce(e.datos->>'aviso', '') = 'true'
                                 AND e.created_at BETWEEN pv.visto_at - interval '10 seconds' AND pv.visto_at + interval '3 minutes')
             ORDER BY pv.visto_at DESC LIMIT 1),
  todo AS (SELECT * FROM msg UNION ALL SELECT * FROM clic UNION ALL SELECT * FROM vista),
  ult AS (SELECT * FROM todo ORDER BY at DESC LIMIT 1),
  pend AS (SELECT count(*) AS n FROM conceptualizador.trabajo t
             LEFT JOIN conceptualizador.mensaje m ON m.id = t.mensaje_id LEFT JOIN conceptualizador.evento e ON e.id = t.evento_id
            WHERE t.caso_id = p_caso AND t.estado IN ('pendiente','tomado') AND t.lote_de IS NULL
              AND ((t.tipo = 'mensaje' AND m.rol = 'usuario')
                OR (t.tipo = 'evento' AND NOT conceptualizador.es_maquina(e.autor) AND e.tipo NOT IN ('continuacion','barrido','prueba')
                    AND NOT (coalesce(e.concepto, '') = 'revisa' AND coalesce(e.datos->>'aviso', '') = 'true'))))
  SELECT jsonb_build_object('at', (SELECT at FROM ult), 'fuente', (SELECT fuente FROM ult), 'autor', (SELECT autor FROM ult),
    'pendientes', (SELECT n FROM pend), 'mensaje_at', (SELECT at FROM msg), 'clic_at', (SELECT at FROM clic), 'vista_at', (SELECT at FROM vista))
$ap58$;
REVOKE ALL ON FUNCTION conceptualizador.actividad_persona(uuid, timestamptz) FROM PUBLIC;

-- ── api_motor (envoltura): `config` trae la actividad de las personas ──
DO $ren58m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0058prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0058prev;
  END IF;
END
$ren58m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot58$
DECLARE
  v_r jsonb := conceptualizador.api_motor_0058prev(p);
BEGIN
  IF coalesce(p->>'modo', '') <> 'config' OR NOT coalesce((v_r->>'ok')::boolean, false) OR NOT conceptualizador.prendido('sin_ciclo_v163i') THEN RETURN v_r; END IF;
  RETURN v_r || jsonb_build_object('actividad_persona', (
    SELECT coalesce(jsonb_object_agg(k.id::text, a.x), '{}'::jsonb)
      FROM conceptualizador.caso k CROSS JOIN LATERAL (SELECT conceptualizador.actividad_persona(k.id) AS x) a
     WHERE k.estado NOT IN ('cerrado','archivado') AND NOT k.demo AND k.archivado_at IS NULL
       AND (coalesce((a.x->>'at')::timestamptz, '-infinity'::timestamptz) > now() - interval '2 hours' OR coalesce((a.x->>'pendientes')::int, 0) > 0)));
END
$mot58$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0058prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0058prev(jsonb) FROM PUBLIC;
DO $gr58m$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_motor_0058prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$gr58m$;

-- ── E.2 · agente_gate (envoltura): la continuación y el clic con mensaje en su lote heredan la instrucción de la persona ──
DO $ren58g$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'agente_gate_0058prev') THEN
    ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) RENAME TO agente_gate_0058prev;
  END IF;
END
$ren58g$;

CREATE OR REPLACE FUNCTION conceptualizador.agente_gate(p_trabajo bigint, p_machote uuid, p_para text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $ag58$
DECLARE
  v_r    jsonb := conceptualizador.agente_gate_0058prev(p_trabajo, p_machote, p_para);
  v_sw   text  := CASE WHEN p_para = 'orden' THEN 'todo_hecho_v162b' ELSE 'guardar_agente_v162b' END;
  t      record;
  v_cur  bigint := p_trabajo;
  v_ev   record;
  v_msg  record;
  v_i    int := 0;
  v_due  text;
  v_mach uuid;
BEGIN
  IF coalesce((v_r->>'ok')::boolean, false) OR coalesce(v_r->>'error', '') <> 'SIN_INSTRUCCION' OR coalesce(v_r->>'mensaje', '') = 'Ese trabajo ya no está en curso.'
     OR NOT conceptualizador.prendido('version_vigente_v163i') OR NOT conceptualizador.prendido(v_sw) OR p_trabajo IS NULL OR p_machote IS NULL THEN
    RETURN v_r;
  END IF;
  SELECT tr.id, tr.caso_id, tr.estado INTO t FROM conceptualizador.trabajo tr WHERE tr.id = p_trabajo;
  IF t.id IS NULL OR t.estado <> 'tomado' THEN RETURN v_r; END IF;
  -- 1 · un mensaje de la persona en el lote de ESTE trabajo
  SELECT m.id, m.autor, m.created_at INTO v_msg FROM conceptualizador.trabajo l JOIN conceptualizador.mensaje m ON m.id = l.mensaje_id
   WHERE l.lote_de = p_trabajo AND l.caso_id = t.caso_id AND l.tipo = 'mensaje' AND m.rol = 'usuario' ORDER BY m.id DESC LIMIT 1;
  -- 2 · si no, la cadena de continuaciones hasta el mensaje que la dejó
  WHILE v_msg.id IS NULL AND v_i < 5 LOOP
    v_i := v_i + 1;
    SELECT e.tipo, e.datos INTO v_ev FROM conceptualizador.trabajo tr JOIN conceptualizador.evento e ON e.id = tr.evento_id
     WHERE tr.id = v_cur AND tr.caso_id = t.caso_id;
    EXIT WHEN v_ev.tipo IS DISTINCT FROM 'continuacion' OR coalesce(v_ev.datos->>'de_trabajo', '') !~ '^[0-9]{1,15}\Z';
    v_cur := (v_ev.datos->>'de_trabajo')::bigint;
    SELECT m.id, m.autor, m.created_at INTO v_msg FROM conceptualizador.trabajo tr JOIN conceptualizador.mensaje m ON m.id = tr.mensaje_id
     WHERE tr.id = v_cur AND tr.caso_id = t.caso_id AND tr.tipo = 'mensaje' AND m.rol = 'usuario';
  END LOOP;
  IF v_msg.id IS NULL THEN RETURN v_r; END IF;
  IF v_msg.created_at < now() - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSTRUCCION_VIEJA', 'mensaje', 'La instrucción tiene más de 2 horas: que la persona lo vuelva a pedir.');
  END IF;
  SELECT k.machote_id INTO v_mach FROM conceptualizador.caso k WHERE k.id = t.caso_id;
  IF v_mach IS DISTINCT FROM p_machote THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'Ese machote no es el del caso de la instrucción.');
  END IF;
  IF to_regclass('comercial.machote') IS NOT NULL THEN
    EXECUTE 'SELECT dueno FROM comercial.machote WHERE id = ' || quote_literal(p_machote::text) || '::uuid' INTO v_due;
  END IF;
  IF v_due IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_ENCONTRADO'); END IF;
  IF NOT (v_msg.autor = v_due OR conceptualizador.puede_mover(v_msg.autor, v_due)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_PUEDE_MOVER', 'persona', v_msg.autor, 'dueno', v_due,
      'mensaje', v_msg.autor || ' no tiene permiso para mover lo de ' || v_due || ': no guardé nada.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', 'instruccion_heredada', 'persona', v_msg.autor, 'dueno', v_due, 'mensaje_id', v_msg.id,
    'caso_id', t.caso_id, 'msg_at', v_msg.created_at, 'hora', to_char(v_msg.created_at AT TIME ZONE 'America/Monterrey', 'HH24:MI'),
    'motivo', 'lo aplicó el agente por la instrucción de ' || v_msg.autor || ' (msg ' || v_msg.id || ')');
END
$ag58$;
ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.agente_gate_0058prev(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate_0058prev(bigint, uuid, text) FROM PUBLIC;
DO $gr58g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) TO comercial_app;
  END IF;
END
$gr58g$;

-- ── C4 · alarmas_motor (envoltura): «Vuelve a armar» 2 veces en 30 min = señal de ciclo ──
DO $ren58a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0058prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0058prev;
  END IF;
END
$ren58a$;

CREATE OR REPLACE FUNCTION conceptualizador.vuelve_a_armar(p_texto text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $va58$
  SELECT coalesce(p_texto, '') ~* '(vuelve|volver|vuelvo) a armar|\mrearma|\marma(la|r)? (otra vez|de nuevo)|\mrebuild|\mredo the quote'
$va58$;

CREATE OR REPLACE FUNCTION conceptualizador.ciclos_vuelve_a_armar(p_ahora timestamptz DEFAULT now())
RETURNS TABLE (caso_id uuid, autor text, titulo text, primero bigint, segundo bigint, desde timestamptz, ultima timestamptz, veces int)
LANGUAGE sql STABLE AS $cv58$
  WITH v AS (SELECT m.id, m.caso_id, m.autor, m.created_at FROM conceptualizador.mensaje m
              WHERE m.rol = 'usuario' AND m.created_at > p_ahora - interval '150 minutes' AND m.created_at <= p_ahora AND conceptualizador.vuelve_a_armar(m.texto)),
  par AS (SELECT b.caso_id, b.autor, a.id AS primero, b.id AS segundo, a.created_at AS desde, b.created_at AS ultima
            FROM v a JOIN v b ON b.caso_id = a.caso_id AND b.autor = a.autor AND b.id > a.id
                            AND b.created_at - a.created_at <= make_interval(mins => coalesce(conceptualizador.cfg('alarma_ciclo_min'), 30))
           WHERE b.created_at > p_ahora - interval '2 hours')
  SELECT DISTINCT ON (p.caso_id) p.caso_id, p.autor, k.titulo, p.primero, p.segundo, p.desde, p.ultima,
         (SELECT count(*)::int FROM v WHERE v.caso_id = p.caso_id AND v.autor = p.autor AND v.created_at >= p.desde)
    FROM par p JOIN conceptualizador.caso k ON k.id = p.caso_id
   WHERE NOT k.demo AND k.archivado_at IS NULL
   ORDER BY p.caso_id, p.ultima DESC
$cv58$;
REVOKE ALL ON FUNCTION conceptualizador.ciclos_vuelve_a_armar(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am58$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0058prev(p_llave);
  v_ahora timestamptz;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('alarma_ciclo_v163i') THEN RETURN v_r; END IF;
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  FOR f IN SELECT * FROM conceptualizador.ciclos_vuelve_a_armar(v_ahora) LOOP
    v_r := v_r || conceptualizador.alarma('ciclo_vuelve_a_armar', f.caso_id::text, f.desde,
      f.autor || ' pidió «Vuelve a armar» ' || f.veces || ' veces en el caso «' || left(f.titulo, 60) || '» (msg ' || f.primero || ' y ' || f.segundo ||
        ', la última a las ' || coalesce(conceptualizador.hora_local(f.ultima) || ' CST', '?') || '): señal de que el agente está alternando versiones o no le contesta lo que pidió.',
      'Abre el caso: compara la versión guardada del machote con lo que el agente armó en sus dos últimas respuestas; si alternó, la vigente es la última decisión de la persona.',
      'ciclo-vuelve-a-armar', jsonb_build_object('caso_id', f.caso_id, 'autor', f.autor, 'mensajes', jsonb_build_array(f.primero, f.segundo), 'veces', f.veces));
  END LOOP;
  RETURN v_r;
END
$am58$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0058prev(text) FROM PUBLIC;
