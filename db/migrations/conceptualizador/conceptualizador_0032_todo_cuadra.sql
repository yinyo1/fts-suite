-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0032 · V1.62a (fts-conceptualizador#12): todo cuadra
--
-- Cinco interruptores nuevos, todos en '0'. Apagados, `tomar`, `entregar`, `accion`, `evento`, `hilo`, `config` y las alarmas
-- salen IGUAL que con la 0031 (pruebas/sql-0032.sh lo compara).
--
--   cuadre_v162       · `tomar` trae `hilo.caso.machote_vigente` (versión, total y moneda del machote GUARDADO, monto_de de la 0030):
--                       el motor no propone un borrador que no cuadre con lo guardado (Nalco COT-0053). orden_v162() le dice a
--                       orden-odoo que diga el NO_CUADRA en palabras y que revise nota = hitos (PAGO_NO_CUADRA, Qualtia SO11928).
--   tarjetas_v162     · `entregar` con `respuesta.recalculo.precio` descarta las tarjetas `crear_machote` y `crear_borrador`
--                       propuestas con OTRO total (también cuando la respuesta salió con observaciones y sin botón: la 0023 solo
--                       lo hacía con `machote.precio`, que esa respuesta no trae). `accion` hecha sobre una tarjeta descartada
--                       contesta TARJETA_REEMPLAZADA. Una tarjeta de cotizar que lleva más de `tarjeta_sin_aplicar_horas` (24)
--                       sin aplicarse avisa UNA vez al dueño en el chat (con el `latido` del principal, de 7 a 21 h de Monterrey).
--   oportunidad_v162  · evento `oportunidad_elegida`: la elección de la ventana «¿De qué oportunidad es?» queda en
--                       `caso.oportunidad_elegida` al elegirla (sin trabajo, sin tope); si trae `creada` con su id (la creó
--                       orden-odoo aunque la orden fallara), queda también en `caso.oportunidad_id`. `hilo` la trae.
--   n0_v162           · el evento `correccion` con `datos.n0` (precio corregido en la vista ejecutiva interna) solo entra con el
--                       interruptor prendido: apagado lo rechaza (si no, le llegaría al modelo como una corrección suelta).
--   ruido_v162        · `entregar` con `respuesta.silencio` y el texto exacto «Sin cambios pendientes en este caso.» y sin
--                       acciones: el trabajo queda listo SIN mensaje y sin mover la actividad del caso (146 de 588 respuestas).
--
-- Medición: el panel (`config`) trae `v162_24h` (silencios, tarjetas descartadas, viejas vivas y avisadas, elecciones sin
-- oportunidad, correcciones N0 y las fallas de cuadre). Alarmas (viajan como las demás): `tarjeta_vieja` (una tarjeta de cotizar
-- lleva X + 24 h sin aplicarse), `oportunidad_perdida` (una elección «crear» sin oportunidad por más de 1 h), `no_cuadra`
-- (NO_CUADRA o PAGO_NO_CUADRA en 24 h), `ruido` (un «Sin cambios pendientes» publicado en 24 h con el interruptor prendido).
--
-- Lo que NO cambia: `siguiente`, ningún interruptor existente, ningún modo nuevo de api_suite ni de api_motor (el evento entra
-- por `evento`). Reversa: reversas/032_reversa.sql. Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes
-- de comilla, ampersand, acento grave o dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in32$
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
               'cuadre_v162','tarjetas_v162','oportunidad_v162','n0_v162','ruido_v162']
$in32$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('tarjeta_sin_aplicar_horas', '24') ON CONFLICT (clave) DO NOTHING;

-- El panel puede mover las horas del aviso de tarjeta vieja (holgado: de 1 a 720).
DO $ren32v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'config_valida_0032prev') THEN
    ALTER FUNCTION conceptualizador.config_valida(text, text) RENAME TO config_valida_0032prev;
  END IF;
END
$ren32v$;

CREATE OR REPLACE FUNCTION conceptualizador.config_valida(p_clave text, p_valor text) RETURNS text
LANGUAGE plpgsql STABLE AS $cv32$
DECLARE v text := btrim(coalesce(p_valor, ''));
BEGIN
  IF coalesce(p_clave, '') = 'tarjeta_sin_aplicar_horas' THEN
    IF v !~ '^[1-9][0-9]{0,2}\Z' OR v::int > 720 THEN RETURN 'horas enteras de 1 a 720'; END IF;
    RETURN NULL;
  END IF;
  RETURN conceptualizador.config_valida_0032prev(p_clave, p_valor);
END
$cv32$;

-- ── columnas nuevas ────────────────────────────────────────────────────────────────────────
ALTER TABLE conceptualizador.caso   ADD COLUMN IF NOT EXISTS oportunidad_elegida jsonb;
ALTER TABLE conceptualizador.accion ADD COLUMN IF NOT EXISTS aviso_viejo_at timestamptz;

-- ── lo que orden-odoo necesita saber (credencial comercial_app), sin abrirle la tabla config ──
CREATE OR REPLACE FUNCTION conceptualizador.orden_v162() RETURNS jsonb
LANGUAGE sql STABLE AS $ov32$
  SELECT jsonb_build_object('cuadre', conceptualizador.prendido('cuadre_v162'), 'oportunidad', conceptualizador.prendido('oportunidad_v162'))
$ov32$;
ALTER FUNCTION conceptualizador.orden_v162() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v162() FROM PUBLIC;
DO $gr32$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_v162() TO comercial_app;
  END IF;
END
$gr32$;

-- ── el aviso de la tarjeta que nadie aplicó (lo llama el latido del principal) ──────────────
CREATE OR REPLACE FUNCTION conceptualizador.tarjetas_viejas_avisar(p_ahora timestamptz DEFAULT now()) RETURNS int
LANGUAGE plpgsql AS $tv32$
DECLARE
  v_h int := coalesce(conceptualizador.cfg('tarjeta_sin_aplicar_horas'), 24);
  a   record;
  v_n int := 0;
BEGIN
  IF NOT conceptualizador.prendido('tarjetas_v162') OR NOT conceptualizador.en_ventana('07:00', '21:00', p_ahora) THEN RETURN 0; END IF;
  FOR a IN SELECT x.id, x.caso_id, x.tipo, x.titulo, x.created_at
             FROM conceptualizador.accion x JOIN conceptualizador.caso k ON k.id = x.caso_id
            WHERE x.estado = 'propuesta' AND x.tipo IN ('crear_machote','crear_borrador','enviada') AND x.aviso_viejo_at IS NULL
              AND x.created_at < p_ahora - make_interval(hours => v_h) AND NOT k.demo AND k.estado IN ('abierto','enviada')
            ORDER BY x.id LIMIT 20 FOR UPDATE OF x SKIP LOCKED LOOP
    UPDATE conceptualizador.accion SET aviso_viejo_at = now() WHERE id = a.id;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (a.caso_id, 'sistema', 'tarjetas',
      'La tarjeta «' || left(coalesce(a.titulo, a.tipo), 120) || '» lleva ' || floor(extract(epoch FROM p_ahora - a.created_at) / 3600)::int ||
      ' h sin aplicarse, así que ese cambio no ha llegado ' || CASE WHEN a.tipo = 'crear_machote' THEN 'al machote' ELSE 'a Odoo' END ||
      '. Si todavía va, tócala; si ya no, descártala.');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$tv32$;
REVOKE ALL ON FUNCTION conceptualizador.tarjetas_viejas_avisar(timestamptz) FROM PUBLIC;

-- ── api_motor: tomar (machote vigente), entregar (silencio y tarjetas viejas), latido (aviso) ──
DO $ren32m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0032prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0032prev;
  END IF;
END
$ren32m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot32$
DECLARE
  v_modo text := p->>'modo';
  v_id   bigint := conceptualizador.a_entero(p->>'trabajo_id');
  v_resp jsonb := CASE WHEN jsonb_typeof(p->'respuesta') = 'object' THEN p->'respuesta' ELSE '{}'::jsonb END;
  v_caso uuid;
  v_ua   timestamptz;
  v_r    jsonb;
  v_m    jsonb;
  v_n    int;
  v_pre  numeric;
  v_sil  boolean := false;
BEGIN
  -- Antes de entregar: el caso y su última actividad (un silencio no la mueve).
  IF v_modo = 'entregar' AND v_id IS NOT NULL THEN
    SELECT t.caso_id INTO v_caso FROM conceptualizador.trabajo t WHERE t.id = v_id;
    SELECT k.ultima_actividad_at INTO v_ua FROM conceptualizador.caso k WHERE k.id = v_caso;
    v_sil := conceptualizador.prendido('ruido_v162') AND coalesce(v_resp->>'silencio', '') = 'true'
             AND btrim(coalesce(v_resp->>'texto', '')) = 'Sin cambios pendientes en este caso.'
             AND (jsonb_typeof(v_resp->'acciones') IS DISTINCT FROM 'array' OR jsonb_array_length(v_resp->'acciones') = 0);
  END IF;

  v_r := conceptualizador.api_motor_0032prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;

  IF v_modo = 'tomar' AND conceptualizador.prendido('cuadre_v162') AND jsonb_typeof(v_r->'hilo'->'caso') = 'object'
     AND coalesce(v_r->'hilo'->'caso'->>'machote_id', '') <> '' THEN
    v_m := conceptualizador.monto_de(conceptualizador.a_uuid(v_r->'hilo'->'caso'->>'machote_id'));
    IF v_m IS NOT NULL THEN v_r := jsonb_set(v_r, ARRAY['hilo','caso','machote_vigente'], v_m); END IF;
    RETURN v_r;
  END IF;

  IF v_modo = 'latido' AND p->>'motor' = 'principal' THEN
    v_n := conceptualizador.tarjetas_viejas_avisar();
    IF v_n > 0 THEN v_r := v_r || jsonb_build_object('tarjetas_avisadas', v_n); END IF;
    RETURN v_r;
  END IF;

  IF v_modo <> 'entregar' OR coalesce((v_r->>'ya_estaba')::boolean, false) OR v_caso IS NULL THEN RETURN v_r; END IF;

  -- ruido_v162 · el «Sin cambios pendientes» sin botones no deja mensaje ni mueve la actividad.
  IF v_sil THEN
    DELETE FROM conceptualizador.mensaje WHERE trabajo_id = v_id AND rol = 'motor' AND texto = 'Sin cambios pendientes en este caso.';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE conceptualizador.caso SET ultima_actividad_at = v_ua WHERE id = v_caso AND v_ua IS NOT NULL;
    v_r := v_r || jsonb_build_object('silencio', v_n > 0);
  END IF;

  -- tarjetas_v162 · un cálculo nuevo descarta las tarjetas de machote y de orden propuestas con otro total.
  IF conceptualizador.prendido('tarjetas_v162') AND coalesce(v_resp->'recalculo'->>'precio', '') ~ '^[0-9]{1,12}([.][0-9]{1,2})?\Z' THEN
    v_pre := round((v_resp->'recalculo'->>'precio')::numeric, 2);
    UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
           resultado = jsonb_build_object('reemplazada_por_calculo', v_id, 'total_nuevo', v_pre)
     WHERE a.caso_id = v_caso AND a.estado = 'propuesta' AND a.tipo IN ('crear_machote','crear_borrador')
       AND coalesce(a.trabajo_id, 0) < v_id
       AND coalesce(a.datos->'resumen'->>'total', '') ~ '^-?[0-9]{1,12}([.][0-9]+)?\Z'
       AND round((a.datos->'resumen'->>'total')::numeric, 2) <> v_pre;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_r := v_r || jsonb_build_object('tarjetas_reemplazadas', v_n); END IF;
  END IF;
  RETURN v_r;
END
$mot32$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0032prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0032prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0032prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── api_suite: el evento de la oportunidad, el N0 con su interruptor, la tarjeta reemplazada, hilo y panel ──
DO $ren32s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0032prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0032prev;
  END IF;
END
$ren32s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui32$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_c     conceptualizador.caso%ROWTYPE;
  v_a     conceptualizador.accion%ROWTYPE;
  v_ts    bigint;
  v_n     int;
  v_el    jsonb;
  v_id    bigint;
  v_r     jsonb;
BEGIN
  -- oportunidad_v162 · la elección de la oportunidad se guarda AL ELEGIRLA: sin trabajo, sin tope.
  IF v_modo = 'evento' AND p->>'tipo' = 'oportunidad_elegida' THEN
    IF NOT conceptualizador.prendido('oportunidad_v162') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'oportunidad_v162');
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
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id') FOR UPDATE;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) AND NOT conceptualizador.puede_mover(v_actor, v_c.autor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Solo el dueño del caso (o quien él autorizó) elige su oportunidad.');
    END IF;
    IF coalesce(v_d->>'modo', '') NOT IN ('crear','ligar') THEN RETURN jsonb_build_object('ok', false, 'error', 'MODO_INVALIDO'); END IF;
    v_id := CASE WHEN coalesce(v_d->>'id', '') ~ '^[1-9][0-9]{0,9}\Z' THEN (v_d->>'id')::bigint END;
    IF v_d->>'modo' = 'ligar' AND v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ID'); END IF;
    IF v_d->>'modo' = 'crear' AND char_length(btrim(coalesce(v_d->>'nombre', ''))) < 3 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NOMBRE'); END IF;
    v_el := jsonb_build_object('modo', v_d->>'modo', 'id', v_id, 'nombre', nullif(left(btrim(coalesce(v_d->>'nombre', '')), 240), ''),
                               'creada', coalesce(v_d->>'creada', '') = 'true', 'por', v_actor, 'at', now());
    UPDATE conceptualizador.caso SET oportunidad_elegida = v_el,
           oportunidad_id = CASE WHEN coalesce(v_d->>'creada', '') = 'true' AND v_id IS NOT NULL AND oportunidad_id IS NULL THEN v_id ELSE oportunidad_id END
     WHERE id = v_c.id RETURNING oportunidad_id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'oportunidad_elegida', v_el, 'oportunidad_id', v_id, 'trabajo_id', NULL);
  END IF;

  -- n0_v162 · una corrección N0 solo entra con su interruptor (apagado le llegaría al modelo como corrección suelta).
  IF v_modo = 'evento' AND p->>'tipo' = 'correccion' AND v_d ? 'n0' AND NOT conceptualizador.prendido('n0_v162') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'n0_v162');
  END IF;

  -- tarjetas_v162 · aplicar una tarjeta que ya se reemplazó no se registra como hecha: se dice.
  IF v_modo = 'accion' AND p->>'decision' = 'hecha' AND conceptualizador.prendido('tarjetas_v162') THEN
    SELECT * INTO v_a FROM conceptualizador.accion WHERE id = conceptualizador.a_entero(p->>'accion_id');
    IF v_a.id IS NOT NULL AND v_a.estado = 'descartada' AND v_a.tipo IN ('crear_machote','crear_borrador')
       AND (v_a.resultado ? 'reemplazada_por_calculo' OR v_a.resultado ? 'reemplazada_por_trabajo') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TARJETA_REEMPLAZADA', 'accion_id', v_a.id,
        'mensaje', 'Esa tarjeta ya se reemplazó con un cálculo más nuevo: usa la tarjeta más reciente del chat.');
    END IF;
  END IF;

  v_r := conceptualizador.api_suite_0032prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;

  IF v_modo = 'hilo' AND conceptualizador.prendido('oportunidad_v162') THEN
    SELECT k.oportunidad_elegida INTO v_el FROM conceptualizador.caso k WHERE k.id = conceptualizador.a_uuid(p->>'caso_id');
    IF v_el IS NOT NULL THEN v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object('oportunidad_elegida', v_el)); END IF;
  ELSIF v_modo = 'config' AND (conceptualizador.prendido('cuadre_v162') OR conceptualizador.prendido('tarjetas_v162') OR conceptualizador.prendido('oportunidad_v162')
                                OR conceptualizador.prendido('n0_v162') OR conceptualizador.prendido('ruido_v162')) THEN
    v_r := v_r || jsonb_build_object('v162_24h', jsonb_build_object(
      'sin_cambios_respuestas', (SELECT count(*) FROM conceptualizador.respuesta r WHERE r.created_at > now() - interval '24 hours'
                                    AND r.texto = 'Sin cambios pendientes en este caso.'),
      'sin_cambios_publicados', (SELECT count(*) FROM conceptualizador.mensaje m WHERE m.created_at > now() - interval '24 hours'
                                    AND m.rol = 'motor' AND m.texto = 'Sin cambios pendientes en este caso.'),
      'tarjetas_reemplazadas', (SELECT count(*) FROM conceptualizador.accion a WHERE a.hecha_at > now() - interval '24 hours'
                                    AND a.resultado ? 'reemplazada_por_calculo'),
      'tarjetas_viejas_vivas', (SELECT count(*) FROM conceptualizador.accion a JOIN conceptualizador.caso k ON k.id = a.caso_id
                                   WHERE a.estado = 'propuesta' AND a.tipo IN ('crear_machote','crear_borrador','enviada') AND NOT k.demo
                                     AND a.created_at < now() - make_interval(hours => coalesce(conceptualizador.cfg('tarjeta_sin_aplicar_horas'), 24))),
      'tarjetas_avisadas', (SELECT count(*) FROM conceptualizador.accion a WHERE a.aviso_viejo_at > now() - interval '24 hours'),
      'elecciones_sin_oportunidad', (SELECT count(*) FROM conceptualizador.caso k WHERE k.oportunidad_elegida IS NOT NULL AND k.oportunidad_id IS NULL
                                        AND k.oportunidad_elegida->>'modo' = 'crear'),
      'correcciones_n0', (SELECT count(*) FROM conceptualizador.evento e WHERE e.created_at > now() - interval '24 hours'
                             AND e.tipo = 'correccion' AND e.datos ? 'n0'),
      'fallas_cuadre', (SELECT count(*) FROM conceptualizador.falla_odoo f WHERE f.at > now() - interval '24 hours'
                           AND f.codigo IN ('NO_CUADRA','PAGO_NO_CUADRA')),
      'tarjeta_sin_aplicar_horas', coalesce(conceptualizador.cfg('tarjeta_sin_aplicar_horas'), 24)));
  END IF;
  RETURN v_r;
END
$sui32$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0032prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0032prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0032prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;

-- ── alarmas: tarjeta vieja, oportunidad perdida, no cuadra y ruido ──────────────────────────
DO $ren32a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0032prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0032prev;
  END IF;
END
$ren32a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am32$
DECLARE
  v_r jsonb := conceptualizador.alarmas_motor_0032prev(p_llave);
  v_h int := coalesce(conceptualizador.cfg('tarjeta_sin_aplicar_horas'), 24);
  x   record;
BEGIN
  IF p_llave <> 'conceptualizador' THEN RETURN v_r; END IF;
  IF conceptualizador.prendido('tarjetas_v162') THEN
    SELECT a.id, a.created_at, a.titulo, k.carpeta INTO x FROM conceptualizador.accion a JOIN conceptualizador.caso k ON k.id = a.caso_id
     WHERE a.estado = 'propuesta' AND a.tipo IN ('crear_machote','crear_borrador','enviada') AND NOT k.demo AND k.estado IN ('abierto','enviada')
       AND a.created_at < now() - make_interval(hours => v_h + 24) ORDER BY a.id LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('tarjeta_vieja', x.id::text, x.created_at,
        'La tarjeta «' || left(coalesce(x.titulo, ''), 80) || '» (acción ' || x.id || ') lleva más de ' || (v_h + 24) || ' h sin aplicarse; su dueño ya tuvo el aviso en el chat.',
        'Pregúntale al dueño si ese cambio sigue: si sí, que toque la tarjeta; si no, que la descarte.', 'tarjeta-vieja', jsonb_build_object('accion_id', x.id, 'caso', x.carpeta));
    END IF;
  END IF;
  IF conceptualizador.prendido('oportunidad_v162') THEN
    SELECT k.id, (k.oportunidad_elegida->>'at')::timestamptz AS at, k.carpeta INTO x FROM conceptualizador.caso k
     WHERE k.oportunidad_elegida->>'modo' = 'crear' AND k.oportunidad_id IS NULL AND NOT k.demo
       AND (k.oportunidad_elegida->>'at')::timestamptz < now() - interval '1 hour' ORDER BY k.id LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('oportunidad_perdida', x.id::text, x.at,
        'Una oportunidad que la persona pidió crear lleva más de 1 h sin crearse (caso ' || coalesce(x.carpeta, x.id::text) || ').',
        'La elección está guardada en el caso: el siguiente «Crear borrador» la crea. Si la orden sigue frenada, revisa su falla de Odoo.', 'oportunidad-perdida',
        jsonb_build_object('caso', x.carpeta));
    END IF;
  END IF;
  IF conceptualizador.prendido('cuadre_v162') THEN
    SELECT f.id, f.at, f.codigo, k.carpeta INTO x FROM conceptualizador.falla_odoo f JOIN conceptualizador.caso k ON k.id = f.caso_id
     WHERE f.codigo IN ('NO_CUADRA','PAGO_NO_CUADRA') AND f.at > now() - interval '24 hours' AND NOT k.demo ORDER BY f.id DESC LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('no_cuadra', x.id::text, x.at,
        'Una cotización no salió a Odoo por ' || x.codigo || ' (caso ' || coalesce(x.carpeta, '?') || '): el machote, la cotización o los hitos no dicen lo mismo.',
        'La persona tiene el botón que lo arregla en su chat. Si se repite en el mismo caso, revisa por qué el motor propone algo que no cuadra.', 'no-cuadra',
        jsonb_build_object('falla_id', x.id, 'codigo', x.codigo, 'caso', x.carpeta));
    END IF;
  END IF;
  IF conceptualizador.prendido('ruido_v162') THEN
    SELECT m.id, m.created_at, k.carpeta INTO x FROM conceptualizador.mensaje m JOIN conceptualizador.caso k ON k.id = m.caso_id
     WHERE m.rol = 'motor' AND m.texto = 'Sin cambios pendientes en este caso.' AND m.created_at > now() - interval '24 hours' ORDER BY m.id DESC LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('ruido', x.id::text, x.created_at,
        'Se publicó un «Sin cambios pendientes» con ruido_v162 prendido (caso ' || coalesce(x.carpeta, '?') || ').',
        'Revisa que procesa.js mande `silencio` (un motor con código viejo no lo manda).', 'ruido', jsonb_build_object('mensaje_id', x.id));
    END IF;
  END IF;
  RETURN v_r;
END
$am32$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0032prev(text), conceptualizador.alarmas_motor(text) FROM PUBLIC;
