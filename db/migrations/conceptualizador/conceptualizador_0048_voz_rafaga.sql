-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0048 · V1.63g (fts-conceptualizador#12, paso 2 de la voz en la vista ejecutiva): la ráfaga de notas
--
-- Esteban, 25-oct 23:10 CST y 26-oct (prototipo aprobado con «🌐 General»): la vista ejecutiva graba varias notas con la línea de
-- tiempo de qué había en pantalla segundo a segundo, «Enviar N notas» las manda como UN trabajo, y el motor contesta UNA tarjeta
-- «Esto entendí» que se aprueba toda o por cambio.
--   · tabla `voz_rafaga`: una fila por ráfaga enviada (el mensaje con sus N audios), con su línea de tiempo y la medición:
--     notas, segundos de audio, propuestos / aprobados / rechazados, y de la grabación a «Esto entendí».
--   · api_suite modo `enviar` con `datos.rafaga` y `voz_visor_v163g` prendido: valida la línea de tiempo, guarda el mensaje por la
--     cadena de siempre y la ráfaga; si la cadena no encoló trabajo (levantamiento antes del disparador) lo encola: una ráfaga de la
--     vista ejecutiva siempre se contesta (D150, «no esperar»). Pasado el tope de mensajes NO: el tope manda.
--   · api_motor modo `rafaga`: el motor lee la línea de tiempo de un mensaje.
--   · acción nueva `voz_entendi` (la tarjeta «Esto entendí»), que el motor manda en `entregar` (la cadena de antes solo guarda los
--     tipos viejos; ésta se guarda aquí, ligada a su ráfaga, con la hora de inicio de cada nota para oírla); un disparador la liga a su ráfaga (cuándo llegó y cuántos cambios
--     propuso) y, al decidirla, cuenta aprobados y rechazados.
--   · `voz_metricas(dias)`: la medición; api_motor modo `salud` la trae en `salud.voz` (día y semana) para el correo diario.
--   · alarma `voz_sin_entendi`: una ráfaga enviada que en `alarma_voz_min` (10) minutos no tiene «Esto entendí».
--   · interruptor `voz_visor_v163g` en '0': apagado, la pantalla no muestra el micrófono de la vista y la base ignora `datos.rafaga`
--     (el mensaje se guarda como siempre).
-- Aditiva: no cambia ningún valor ni ninguna fila existente. Reversa: reversas/048_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in48$
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
               'voz_visor_v163g']
$in48$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('alarma_voz_min', '10') ON CONFLICT (clave) DO NOTHING;

-- ── la acción nueva ──
ALTER TABLE conceptualizador.accion DROP CONSTRAINT IF EXISTS accion_tipo_check;
ALTER TABLE conceptualizador.accion ADD CONSTRAINT accion_tipo_check
  CHECK (tipo IN ('conjetura','alta_contacto','crear_machote','crear_borrador','enviada','cerrar','actualizar_cliente','voz_entendi'));

-- ── la ráfaga y su medición ──
CREATE TABLE IF NOT EXISTS conceptualizador.voz_rafaga (
  id           bigserial   PRIMARY KEY,
  caso_id      uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  mensaje_id   bigint      NOT NULL UNIQUE REFERENCES conceptualizador.mensaje(id),
  autor        text        NOT NULL,
  notas        jsonb       NOT NULL,
  n_notas      int         NOT NULL CHECK (n_notas BETWEEN 1 AND 20),
  audio_s      numeric     NOT NULL DEFAULT 0,
  grabada_at   timestamptz,
  enviada_at   timestamptz NOT NULL DEFAULT now(),
  entendi_at   timestamptz,
  accion_id    bigint,
  propuestos   int,
  aprobados    int,
  rechazados   int,
  decidida_at  timestamptz
);
CREATE INDEX IF NOT EXISTS voz_rafaga_pend ON conceptualizador.voz_rafaga (enviada_at) WHERE entendi_at IS NULL;
REVOKE ALL ON conceptualizador.voz_rafaga FROM PUBLIC;

-- Valida y normaliza la línea de tiempo que manda la pantalla. NULL = no sirve.
CREATE OR REPLACE FUNCTION conceptualizador.voz_rafaga_normal(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $vrn48$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_n   jsonb;
  v_c   jsonb;
  v_ctx jsonb;
  v_i   int := 0;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'notas') IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  IF jsonb_array_length(p->'notas') NOT BETWEEN 1 AND 20 OR octet_length(p::text) > 300000 THEN RETURN NULL; END IF;
  FOR v_n IN SELECT * FROM jsonb_array_elements(p->'notas') LOOP
    IF jsonb_typeof(v_n) IS DISTINCT FROM 'object' OR jsonb_typeof(v_n->'ctx') IS DISTINCT FROM 'array' OR jsonb_array_length(v_n->'ctx') > 1200 THEN RETURN NULL; END IF;
    IF coalesce(v_n->>'dur', '') !~ '^[0-9]{1,3}(\.[0-9]+)?\Z' OR (v_n->>'dur')::numeric > 600 THEN RETURN NULL; END IF;
    v_ctx := '[]'::jsonb;
    FOR v_c IN SELECT * FROM jsonb_array_elements(v_n->'ctx') LOOP
      CONTINUE WHEN jsonb_typeof(v_c) IS DISTINCT FROM 'object' OR coalesce(v_c->>'fuente', '') NOT IN ('guia','toque','general')
                 OR coalesce(v_c->>'t', '') !~ '^[0-9]{1,3}\Z';
      v_ctx := v_ctx || jsonb_build_object('t', (v_c->>'t')::int, 'fuente', v_c->>'fuente',
        'sec', CASE WHEN v_c->>'fuente' = 'general' THEN NULL ELSE left(v_c->>'sec', 160) END,
        'ren', CASE WHEN v_c->>'fuente' = 'general' THEN NULL ELSE left(v_c->>'ren', 160) END,
        'txt', left(v_c->>'txt', 160));
    END LOOP;
    v_out := v_out || jsonb_build_object('k', v_i + 1, 'dur', (v_n->>'dur')::numeric,
      'inicio', CASE WHEN coalesce(v_n->>'inicio', '') ~ '^[0-9]{10,14}\Z' THEN (v_n->>'inicio')::bigint END,
      'sha256', CASE WHEN coalesce(v_n->>'sha256', '') ~ '^[0-9a-f]{64}\Z' THEN v_n->>'sha256' END,
      'cortada', coalesce((v_n->>'cortada')::boolean, false), 'ctx', v_ctx);
    v_i := v_i + 1;
  END LOOP;
  RETURN v_out;
EXCEPTION WHEN others THEN RETURN NULL;
END
$vrn48$;

-- ── api_suite (envoltura): la ráfaga entra por el `enviar` de siempre ──
DO $ren48s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0048prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0048prev;
  END IF;
END
$ren48s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui48$
DECLARE
  v_raf  jsonb;
  v_r    jsonb;
  v_msg  bigint;
  v_caso uuid;
  v_trab bigint;
  v_id   bigint;
BEGIN
  IF p->>'modo' <> 'enviar' OR jsonb_typeof(p->'datos'->'rafaga') IS DISTINCT FROM 'object' OR NOT conceptualizador.prendido('voz_visor_v163g') THEN
    RETURN conceptualizador.api_suite_0048prev(p);
  END IF;
  v_raf := conceptualizador.voz_rafaga_normal(p->'datos'->'rafaga');
  IF v_raf IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'RAFAGA_INVALIDA'); END IF;
  v_r := conceptualizador.api_suite_0048prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) OR coalesce(v_r->>'mensaje_id', '') = '' THEN RETURN v_r; END IF;
  v_msg := (v_r->>'mensaje_id')::bigint;
  SELECT caso_id, trabajo_id INTO v_caso, v_trab FROM conceptualizador.mensaje WHERE id = v_msg;
  IF v_trab IS NULL AND NOT coalesce((v_r->>'tope')::boolean, false) THEN
    INSERT INTO conceptualizador.trabajo (caso_id, tipo, mensaje_id) VALUES (v_caso, 'mensaje', v_msg) RETURNING id INTO v_trab;
    UPDATE conceptualizador.mensaje SET trabajo_id = v_trab WHERE id = v_msg;
    v_r := v_r || jsonb_build_object('trabajo_id', v_trab);
  END IF;
  INSERT INTO conceptualizador.voz_rafaga (caso_id, mensaje_id, autor, notas, n_notas, audio_s, grabada_at)
  SELECT v_caso, v_msg, m.autor, v_raf, jsonb_array_length(v_raf),
         (SELECT coalesce(sum((x->>'dur')::numeric), 0) FROM jsonb_array_elements(v_raf) x),
         (SELECT to_timestamp(min((x->>'inicio')::bigint) / 1000.0) FROM jsonb_array_elements(v_raf) x WHERE x->>'inicio' IS NOT NULL)
    FROM conceptualizador.mensaje m WHERE m.id = v_msg
  ON CONFLICT (mensaje_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_r || jsonb_build_object('rafaga_id', v_id);
END
$sui48$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0048prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0048prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0048prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;

-- ── api_motor (envoltura): el motor lee la ráfaga de un mensaje ──
DO $ren48m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0048prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0048prev;
  END IF;
END
$ren48m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot48$
DECLARE
  v_f conceptualizador.voz_rafaga%ROWTYPE;
  v_r jsonb;
  v_t bigint;
  v_a jsonb;
BEGIN
  IF p->>'modo' = 'rafaga' THEN
    IF coalesce(p->>'motor', '') NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
    IF coalesce(p->>'mensaje_id', '') !~ '^[0-9]{1,15}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'MENSAJE_INVALIDO'); END IF;
    SELECT * INTO v_f FROM conceptualizador.voz_rafaga WHERE mensaje_id = (p->>'mensaje_id')::bigint;
    IF v_f.id IS NULL THEN RETURN jsonb_build_object('ok', true, 'rafaga', NULL); END IF;
    RETURN jsonb_build_object('ok', true, 'rafaga', jsonb_build_object('id', v_f.id, 'caso_id', v_f.caso_id, 'mensaje_id', v_f.mensaje_id,
      'autor', v_f.autor, 'notas', v_f.notas, 'n_notas', v_f.n_notas, 'audio_s', v_f.audio_s, 'enviada_at', v_f.enviada_at,
      'entendi_at', v_f.entendi_at, 'accion_id', v_f.accion_id,
      'adjuntos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'sha256', a.sha256, 'duracion_s', a.duracion_s) ORDER BY a.escrito_at, a.created_at), '[]'::jsonb)
                     FROM conceptualizador.adjunto a WHERE a.mensaje_id = v_f.mensaje_id AND a.clase = 'audio')));
  END IF;
  v_r := conceptualizador.api_motor_0048prev(p);
  -- La medición de la voz en la vista, para el correo diario (salud-diaria la pinta; sin el interruptor, no viene).
  IF p->>'modo' = 'salud' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'salud') = 'object' AND conceptualizador.prendido('voz_visor_v163g') THEN
    v_r := jsonb_set(v_r, ARRAY['salud', 'voz'], jsonb_build_object('dia', conceptualizador.voz_metricas(1), 'semana', conceptualizador.voz_metricas(7)));
  END IF;
  -- La tarjeta «Esto entendí»: la cadena de `entregar` solo guarda los tipos de antes; ésta va aquí, ligada a su ráfaga.
  IF p->>'modo' = 'entregar' AND coalesce((v_r->>'ok')::boolean, false) AND NOT coalesce((v_r->>'ya_estaba')::boolean, false)
     AND conceptualizador.prendido('voz_visor_v163g') AND jsonb_typeof(p->'respuesta'->'acciones') = 'array' THEN
    v_t := CASE WHEN coalesce(p->>'trabajo_id', '') ~ '^[0-9]{1,15}\Z' THEN (p->>'trabajo_id')::bigint END;
    SELECT x INTO v_a FROM jsonb_array_elements(p->'respuesta'->'acciones') x WHERE x->>'tipo' = 'voz_entendi' LIMIT 1;
    IF v_t IS NOT NULL AND v_a IS NOT NULL AND jsonb_typeof(v_a->'datos'->'cambios') = 'array' AND jsonb_array_length(v_a->'datos'->'cambios') <= 60
       AND (jsonb_typeof(v_a->'datos'->'dudosas') IS NULL OR jsonb_typeof(v_a->'datos'->'dudosas') = 'array') AND octet_length((v_a->'datos')::text) <= 60000 THEN
      SELECT r.* INTO v_f FROM conceptualizador.voz_rafaga r JOIN conceptualizador.trabajo k ON k.caso_id = r.caso_id
       WHERE k.id = v_t AND (r.id::text = coalesce(v_a->'datos'->>'rafaga_id', '') OR r.mensaje_id = k.mensaje_id)
       ORDER BY (r.id::text = coalesce(v_a->'datos'->>'rafaga_id', '')) DESC LIMIT 1;
      IF v_f.id IS NOT NULL THEN
        INSERT INTO conceptualizador.accion (caso_id, trabajo_id, tipo, titulo, datos)
        VALUES (v_f.caso_id, v_t, 'voz_entendi', left(coalesce(v_a->>'titulo', 'Esto entendí'), 300),
                (v_a->'datos') || jsonb_build_object('rafaga_id', v_f.id, 'notas', v_f.n_notas,
                  'notas_inicio', (SELECT coalesce(jsonb_agg(x->'inicio' ORDER BY (x->>'k')::int), '[]'::jsonb) FROM jsonb_array_elements(v_f.notas) x)));
        v_r := v_r || jsonb_build_object('voz_entendi', true);
      ELSE
        v_r := v_r || jsonb_build_object('voz_entendi', false, 'voz_error', 'SIN_RAFAGA');
      END IF;
    END IF;
  END IF;
  RETURN v_r;
END
$mot48$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0048prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0048prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0048prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── la tarjeta «Esto entendí» se liga a su ráfaga y cuenta lo decidido ──
CREATE OR REPLACE FUNCTION conceptualizador.voz_rafaga_accion() RETURNS trigger
LANGUAGE plpgsql AS $vra48$
DECLARE
  v_rid bigint;
  v_ap  int;
BEGIN
  IF NEW.tipo <> 'voz_entendi' THEN RETURN NEW; END IF;
  v_rid := CASE WHEN coalesce(NEW.datos->>'rafaga_id', '') ~ '^[0-9]{1,15}\Z' THEN (NEW.datos->>'rafaga_id')::bigint END;
  IF v_rid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE conceptualizador.voz_rafaga SET entendi_at = coalesce(entendi_at, now()), accion_id = NEW.id,
           propuestos = CASE WHEN jsonb_typeof(NEW.datos->'cambios') = 'array' THEN jsonb_array_length(NEW.datos->'cambios') ELSE 0 END
     WHERE id = v_rid AND caso_id = NEW.caso_id;
  ELSIF NEW.estado IN ('hecha','descartada') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    v_ap := CASE WHEN NEW.estado = 'hecha' AND jsonb_typeof(NEW.resultado->'aprobados') = 'array' THEN jsonb_array_length(NEW.resultado->'aprobados') ELSE 0 END;
    UPDATE conceptualizador.voz_rafaga SET aprobados = v_ap, rechazados = greatest(0, coalesce(propuestos, 0) - v_ap), decidida_at = now()
     WHERE id = v_rid AND caso_id = NEW.caso_id;
  END IF;
  RETURN NEW;
END
$vra48$;
DROP TRIGGER IF EXISTS voz_rafaga_accion ON conceptualizador.accion;
CREATE TRIGGER voz_rafaga_accion AFTER INSERT OR UPDATE OF estado ON conceptualizador.accion
  FOR EACH ROW EXECUTE FUNCTION conceptualizador.voz_rafaga_accion();

-- ── la medición ──
CREATE OR REPLACE FUNCTION conceptualizador.voz_metricas(p_dias int DEFAULT 7) RETURNS jsonb
LANGUAGE sql STABLE AS $vm48$
  SELECT jsonb_build_object('dias', p_dias, 'rafagas', count(*), 'notas', coalesce(sum(n_notas), 0),
    'notas_por_rafaga', round(avg(n_notas), 1), 'audio_min', round(coalesce(sum(audio_s), 0) / 60.0, 1),
    'con_entendi', count(entendi_at), 'sin_entendi', count(*) - count(entendi_at),
    'propuestos', coalesce(sum(propuestos), 0), 'aprobados', coalesce(sum(aprobados), 0), 'rechazados', coalesce(sum(rechazados), 0),
    'decididas', count(decidida_at),
    'min_a_entendi_mediana', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM entendi_at - coalesce(grabada_at, enviada_at)) / 60.0))::numeric, 1),
    'min_a_entendi_max', round(max(extract(epoch FROM entendi_at - coalesce(grabada_at, enviada_at)) / 60.0)::numeric, 1),
    'por_autor', (SELECT coalesce(jsonb_object_agg(autor, n), '{}'::jsonb) FROM (SELECT autor, count(*) n FROM conceptualizador.voz_rafaga
                   WHERE enviada_at > now() - make_interval(days => p_dias) GROUP BY autor) z))
    FROM conceptualizador.voz_rafaga WHERE enviada_at > now() - make_interval(days => p_dias)
$vm48$;
REVOKE ALL ON FUNCTION conceptualizador.voz_metricas(int) FROM PUBLIC;

-- ── la alarma de los 10 minutos ──
DO $ren48a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0048prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0048prev;
  END IF;
END
$ren48a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am48$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0048prev(p_llave);
  v_ahora timestamptz;
  v_min   int;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('voz_visor_v163g') THEN RETURN v_r; END IF;
  -- cz.ahora_prueba solo lo pone pruebas/sql-0048.sh (producción nunca lo define)
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  v_min := greatest(2, coalesce(conceptualizador.cfg('alarma_voz_min'), 10));
  FOR f IN
    SELECT r.id, r.caso_id, r.autor, r.n_notas, r.enviada_at, k.titulo
      FROM conceptualizador.voz_rafaga r JOIN conceptualizador.caso k ON k.id = r.caso_id
     WHERE r.entendi_at IS NULL AND r.enviada_at <= v_ahora - make_interval(mins => v_min) AND r.enviada_at > v_ahora - interval '2 days'
  LOOP
    v_r := v_r || conceptualizador.alarma('voz_sin_entendi', f.id::text, f.enviada_at,
      'Una ráfaga de ' || f.n_notas || CASE WHEN f.n_notas = 1 THEN ' nota' ELSE ' notas' END || ' de ' || f.autor || ' en «' || left(f.titulo, 60) ||
        '» lleva más de ' || v_min || ' min sin «Esto entendí» (enviada ' || coalesce(conceptualizador.hora_local(f.enviada_at) || ' CST', '?') || ').',
      'Revisa que el motor haya tomado el trabajo del mensaje (api_motor modo rafaga) y que la transcripción no se haya atorado; si el motor está caído, el respaldo la toma.',
      'voz-sin-entendi', jsonb_build_object('rafaga_id', f.id, 'caso_id', f.caso_id, 'autor', f.autor));
  END LOOP;
  RETURN v_r;
END
$am48$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0048prev(text) FROM PUBLIC;
