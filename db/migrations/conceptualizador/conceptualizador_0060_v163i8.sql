-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0060 · V1.63i.7 (fts-conceptualizador#16 punto 3, Esteban 28-oct-2026 14:50 MT, D227) · el rayito ya no causa ciclos
--
-- Richard veía el rayito con «3» y lo leía como pendientes suyos; por eso picaba «Vuelve a armar» una y otra vez (a3d9c8: 18:00 y
-- 18:14 UTC; d9159b: 04:00, 14:15 y 18:01 UTC del 28-oct). La pantalla (fts-suite comercial/conceptualizador, cz-rayito.js) cuenta solo
-- lo que de verdad espera a la persona, separa «Pendientes tuyos» de «Cosas que puedes hacer», pide confirmación antes de rehacer y
-- pone en gris lo que causaría descontrol. Esta migración solo hace la MEDICIÓN (regla de construcción 1) y su alarma:
--   · interruptor rayito_v163i, APAGADO ('0'). Apagado: el evento `rayito` contesta INTERRUPTOR_APAGADO, `hilo` y `config` no traen
--     nada nuevo y alarmas_motor es la de antes: todo como la 0058.
--   · evento `rayito` (por `evento`, como el `falla_odoo` de la 0030): cada clic del rayito, y del botón de la falla que rehace, con
--     su acción y su resultado (hecha · cancelada en la confirmación · bloqueada en gris). Se guarda en conceptualizador.rayito_clic
--     SIN trabajo para el motor y sin contar en el tope: medir no gasta modelo.
--   · `hilo` trae `rayito`: los clics del caso en las últimas 2 h (la pantalla los usa para «ya se pidió hace menos de 30 min»).
--   · `config` trae `rayito_24h`: por acción (hechas, canceladas, bloqueadas) y los 10 casos con más clics. Se ve en el panel.
--   · alarmas_motor (envoltura): `rayito_rehace_repetido` (la misma acción que rehace, hecha dos veces en 30 min en un caso: el gris no
--     frenó) y `rayito_sin_medicion` (un «Vuelve a armar» que salió del botón y no dejó su clic: la medición dejó de llegar).
--
-- interruptores_nombres(): conserva TODOS los nombres de la 0058 y además los de la 0059 (viaje_oculto_v163i, candado_persona_v163i, pregunta_primero_v163i),
-- que hace otra rama en paralelo. Así el orden 0059 → 0060 no los pierde; si la 0060 corre sin la 0059, esos tres quedan dados de
-- alta en '0' (lo mismo que haría la 0059) y nadie los lee hasta que llegue su código.
-- Aditiva e idempotente. Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, acento grave o
-- dígito, sin ampersand; etiquetas con nombre. Reversa: reversas/060_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in60$
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
               'rayito_v163i']
$in60$;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── La medición: un renglón por clic ──
CREATE TABLE IF NOT EXISTS conceptualizador.rayito_clic (
  id         bigserial   PRIMARY KEY,
  caso_id    uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  actor      text        NOT NULL,
  accion     text        NOT NULL CHECK (accion ~ '^[a-z][a-z0-9_]{1,39}\Z'),
  resultado  text        NOT NULL CHECK (resultado IN ('hecha','cancelada','bloqueada')),
  razon      text        CHECK (razon IS NULL OR razon IN ('trabajando','ya_pedida','sin_contestar','coincide')),
  origen     text        NOT NULL DEFAULT 'rayito' CHECK (origen IN ('rayito','tarjeta')),
  grupo      text        CHECK (grupo IS NULL OR grupo IN ('pendiente','opcional')),
  texto      text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rayito_clic_caso_idx ON conceptualizador.rayito_clic (caso_id, at DESC);
CREATE INDEX IF NOT EXISTS rayito_clic_at_idx ON conceptualizador.rayito_clic (at);
REVOKE ALL ON conceptualizador.rayito_clic FROM PUBLIC;

-- Las acciones que REHACEN o sobreescriben: las únicas que piden confirmación y pueden salir en gris.
CREATE OR REPLACE FUNCTION conceptualizador.rayito_rehace(p_accion text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $rr60$
  SELECT coalesce(p_accion, '') IN ('rearmar','act_odoo','act_machote')
$rr60$;
-- El texto EXACTO que manda el botón «Volver a armar la cotización» (fts-suite cz-limpio.js REARMAR).
CREATE OR REPLACE FUNCTION conceptualizador.rayito_texto_rearmar() RETURNS text
LANGUAGE sql IMMUTABLE AS $rt60$
  SELECT 'Vuelve a armar la cotización para Odoo con la versión vigente del machote y propón el borrador otra vez.'::text
$rt60$;

CREATE OR REPLACE FUNCTION conceptualizador.rayito_24h(p_ahora timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE sql STABLE AS $r2460$
  WITH r AS (SELECT * FROM conceptualizador.rayito_clic WHERE at > p_ahora - interval '24 hours' AND at <= p_ahora),
  pa AS (SELECT accion, count(*) FILTER (WHERE resultado = 'hecha') AS hecha, count(*) FILTER (WHERE resultado = 'cancelada') AS cancelada,
                count(*) FILTER (WHERE resultado = 'bloqueada') AS bloqueada FROM r GROUP BY accion),
  pc AS (SELECT r.caso_id, count(*) AS n, count(*) FILTER (WHERE resultado = 'hecha') AS hecha, count(*) FILTER (WHERE resultado = 'cancelada') AS cancelada,
                count(*) FILTER (WHERE resultado = 'bloqueada') AS bloqueada,
                count(*) FILTER (WHERE resultado = 'hecha' AND conceptualizador.rayito_rehace(accion)) AS rehace_hechas
           FROM r GROUP BY r.caso_id ORDER BY count(*) DESC LIMIT 10)
  SELECT jsonb_build_object('total', (SELECT count(*) FROM r),
    'por_accion', coalesce((SELECT jsonb_object_agg(accion, jsonb_build_object('hecha', hecha, 'cancelada', cancelada, 'bloqueada', bloqueada)) FROM pa), '{}'::jsonb),
    'por_caso', coalesce((SELECT jsonb_agg(jsonb_build_object('caso_id', pc.caso_id, 'titulo', k.titulo, 'n', pc.n, 'hecha', pc.hecha, 'cancelada', pc.cancelada,
                          'bloqueada', pc.bloqueada, 'rehace_hechas', pc.rehace_hechas) ORDER BY pc.n DESC)
                         FROM pc JOIN conceptualizador.caso k ON k.id = pc.caso_id), '[]'::jsonb))
$r2460$;
REVOKE ALL ON FUNCTION conceptualizador.rayito_24h(timestamptz) FROM PUBLIC;

-- ── api_suite (envoltura 0060) ──
DO $ren60s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0060prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0060prev;
  END IF;
END
$ren60s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui60$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_caso  uuid;
  v_ts    bigint;
  v_n     int;
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_r     jsonb;
BEGIN
  -- Evento `rayito`: se guarda AL MOMENTO, sin trabajo para el motor y sin contar en el tope.
  IF v_modo = 'evento' AND p->>'tipo' = 'rayito' THEN
    IF NOT conceptualizador.prendido('rayito_v163i') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'rayito_v163i');
    END IF;
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
    IF conceptualizador.es_lector(v_actor) THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
    v_ts := conceptualizador.a_entero(p->>'ts');
    IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA');
    END IF;
    IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA'); END IF;
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
    END IF;
    IF coalesce(v_d->>'accion', '') !~ '^[a-z][a-z0-9_]{1,39}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'ACCION_INVALIDA'); END IF;
    IF coalesce(v_d->>'resultado', '') NOT IN ('hecha','cancelada','bloqueada') THEN RETURN jsonb_build_object('ok', false, 'error', 'RESULTADO_INVALIDO'); END IF;
    IF v_d->>'razon' IS NOT NULL AND v_d->>'razon' NOT IN ('trabajando','ya_pedida','sin_contestar','coincide') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RAZON_INVALIDA');
    END IF;
    INSERT INTO conceptualizador.rayito_clic (caso_id, actor, accion, resultado, razon, origen, grupo, texto)
    VALUES (v_caso, v_actor, v_d->>'accion', v_d->>'resultado', v_d->>'razon',
            CASE WHEN v_d->>'origen' = 'tarjeta' THEN 'tarjeta' ELSE 'rayito' END,
            CASE WHEN v_d->>'grupo' IN ('pendiente','opcional') THEN v_d->>'grupo' END, left(v_d->>'texto', 200));
    RETURN jsonb_build_object('ok', true, 'guardada', true);
  END IF;

  v_r := conceptualizador.api_suite_0060prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) OR NOT conceptualizador.prendido('rayito_v163i') THEN RETURN v_r; END IF;

  IF v_modo = 'hilo' THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND jsonb_typeof(v_r->'hilo') = 'object' THEN
      v_r := jsonb_set(v_r, ARRAY['hilo', 'rayito'], coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'accion', r.accion, 'resultado', r.resultado, 'razon', r.razon, 'origen', r.origen,
                                            'actor', r.actor, 'at', r.at) ORDER BY r.id)
          FROM (SELECT * FROM conceptualizador.rayito_clic WHERE caso_id = v_caso AND at > now() - interval '2 hours' ORDER BY id DESC LIMIT 50) r), '[]'::jsonb));
    END IF;
  ELSIF v_modo = 'config' THEN
    v_r := v_r || jsonb_build_object('rayito_24h', conceptualizador.rayito_24h());
  END IF;
  RETURN v_r;
END
$sui60$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0060prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0060prev(jsonb) FROM PUBLIC;
DO $gr60s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0060prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr60s$;

-- ── La alarma: el gris no frenó, o la medición dejó de llegar ──
DO $ren60a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0060prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0060prev;
  END IF;
END
$ren60a$;

CREATE OR REPLACE FUNCTION conceptualizador.rayito_alarmas(p_ahora timestamptz DEFAULT now())
RETURNS TABLE (tipo text, caso_id uuid, titulo text, accion text, primero bigint, segundo bigint, desde timestamptz, ultima timestamptz)
LANGUAGE sql STABLE AS $ra60$
  -- La misma acción que rehace, HECHA dos veces en 30 min en un caso (últimas 2 h): el gris de «ya se pidió» no frenó.
  SELECT DISTINCT ON (b.caso_id, b.accion) 'rayito_rehace_repetido'::text, b.caso_id, k.titulo, b.accion, a.id, b.id, a.at, b.at
    FROM conceptualizador.rayito_clic a
    JOIN conceptualizador.rayito_clic b ON b.caso_id = a.caso_id AND b.accion = a.accion AND b.id > a.id AND b.at - a.at <= interval '30 minutes'
    JOIN conceptualizador.caso k ON k.id = b.caso_id
   WHERE a.resultado = 'hecha' AND b.resultado = 'hecha' AND conceptualizador.rayito_rehace(b.accion)
     AND b.at > p_ahora - interval '2 hours' AND b.at <= p_ahora AND NOT k.demo AND k.archivado_at IS NULL
  UNION ALL
  -- Un «Vuelve a armar» que salió del botón (su texto exacto), desde que se prendió el interruptor, sin su clic medido alrededor.
  SELECT DISTINCT ON (m.caso_id) 'rayito_sin_medicion'::text, m.caso_id, k.titulo, 'rearmar'::text, m.id, NULL::bigint, m.created_at, m.created_at
    FROM conceptualizador.mensaje m JOIN conceptualizador.caso k ON k.id = m.caso_id
   WHERE m.rol = 'usuario' AND btrim(m.texto) = conceptualizador.rayito_texto_rearmar()
     AND m.created_at > greatest(p_ahora - interval '24 hours', conceptualizador.prendido_desde('rayito_v163i'))
     AND m.created_at <= p_ahora - interval '5 minutes' AND NOT k.demo AND k.archivado_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM conceptualizador.rayito_clic r WHERE r.caso_id = m.caso_id AND r.accion = 'rearmar' AND r.resultado = 'hecha'
                      AND r.at BETWEEN m.created_at - interval '5 minutes' AND m.created_at + interval '1 minute')
$ra60$;
REVOKE ALL ON FUNCTION conceptualizador.rayito_alarmas(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am60$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0060prev(p_llave);
  v_ahora timestamptz;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('rayito_v163i') THEN RETURN v_r; END IF;
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  FOR f IN SELECT * FROM conceptualizador.rayito_alarmas(v_ahora) LOOP
    IF f.tipo = 'rayito_rehace_repetido' THEN
      v_r := v_r || conceptualizador.alarma('rayito_rehace_repetido', f.caso_id::text || ':' || f.accion, f.desde,
        'En el caso «' || left(f.titulo, 60) || '» se hizo «' || f.accion || '» dos veces en menos de 30 min desde el rayito (clics ' || f.primero || ' y ' || f.segundo ||
          ', el último a las ' || coalesce(conceptualizador.hora_local(f.ultima) || ' CST', '?') || '): el gris de «ya se pidió» no frenó.',
        'Abre el caso y revisa si la pantalla trae la V1.63i.7 (el gris sale de cz-rayito.js) y si el hilo trae `rayito`; si las dos están, alguien lo pidió desde dos pantallas.',
        'rayito-rehace-repetido', jsonb_build_object('caso_id', f.caso_id, 'accion', f.accion, 'clics', jsonb_build_array(f.primero, f.segundo)));
    ELSE
      v_r := v_r || conceptualizador.alarma('rayito_sin_medicion', f.caso_id::text, f.desde,
        'En el caso «' || left(f.titulo, 60) || '» llegó un «Vuelve a armar» del botón (msg ' || f.primero || ', ' || coalesce(conceptualizador.hora_local(f.desde) || ' CST', '?') ||
          ') sin su clic medido: la medición del rayito dejó de llegar o alguien lo pidió desde una pantalla vieja.',
        'Revisa en el panel «Rayito · 24 h» si hay clics de hoy; si no hay ninguno, el evento `rayito` se está rechazando (revisa la respuesta de api_suite).',
        'rayito-sin-medicion', jsonb_build_object('caso_id', f.caso_id, 'mensaje', f.primero));
    END IF;
  END LOOP;
  RETURN v_r;
END
$am60$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0060prev(text) FROM PUBLIC;
