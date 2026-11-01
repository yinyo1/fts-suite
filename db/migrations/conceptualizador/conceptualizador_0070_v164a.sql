-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0070 · V1.64a parte 6 (#20 prioridad 1, domingo 1-nov-2026) · la nota de voz del CHAT entra como ráfaga
--
-- Medido (pruebas/retroceso-canal-v164.js): en ZZ2 las notas entraron por la vista ejecutiva (datos.rafaga → voz_rafaga) y se
-- aplicaron solas por voz_decide_v164; en ZZ3b/ZZ3c entraron por el clip del chat, no hubo ráfaga y voz_decide nunca corrió: todas
-- esperaron el clic. El chat es por donde mandan notas Richard y Montalvo.
-- Qué agrega, SOLO con `voz_chat_v164` prendido para el caso (prendido_caso: renglón interruptor:voz_chat_v164@<caso>, o el global):
--   api_motor modo 'rafaga' (el que el motor ya llama por cada mensaje; sin parámetro nuevo, porque el workflow cz-motor filtra
--   los campos y no se edita): si el mensaje no tiene ráfaga y es una nota de voz del chat de quien decide, la base
--   la registra como ráfaga SIN pantalla (cada nota con ctx []: lo mismo que las de ZZ2, que tampoco traían línea de tiempo) y la
--   devuelve como cualquier otra. Así la tarjeta «Esto entendí», su trigger y la medición (voz_metricas) son los de siempre.
-- Reglas, todas en la base:
--   · el mensaje es de una persona (rol usuario), sin texto, con 1 a 20 adjuntos y TODOS audio;
--   · su autor decide: el autor del caso o esteban.delacruz (sin-ciclo.esDecisor) — nadie más;
--   · el caso no está archivado; ON CONFLICT (mensaje_id) DO NOTHING (una sola ráfaga por mensaje, nunca dos).
-- No cambia nada con el interruptor apagado: con voz_chat_v164 en 0 (o sin renglón) el modo 'rafaga' contesta exactamente lo mismo que antes.
-- ORDEN: 0069 → 0070. Aditiva e idempotente. Reversa: reversas/070_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
DO $ren70m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0070prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0070prev;
  END IF;
END
$ren70m$;

CREATE OR REPLACE FUNCTION conceptualizador.voz_rafaga_de_chat(p_msg bigint) RETURNS jsonb
LANGUAGE plpgsql AS $vch70$
DECLARE
  v_m  record;
  v_n  int;
  v_na int;
  v_id bigint;
BEGIN
  SELECT m.id, m.caso_id, m.autor, m.rol, coalesce(m.texto, '') AS texto, c.autor AS caso_autor, c.archivado_at
    INTO v_m FROM conceptualizador.mensaje m JOIN conceptualizador.caso c ON c.id = m.caso_id WHERE m.id = p_msg;
  IF v_m.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_MENSAJE'); END IF;
  IF NOT conceptualizador.prendido_caso('voz_chat_v164', v_m.caso_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'APAGADO'); END IF;
  IF v_m.archivado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVADO'); END IF;
  IF v_m.rol IS DISTINCT FROM 'usuario' OR btrim(v_m.texto) <> '' THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_SOLO_VOZ'); END IF;
  IF v_m.autor IS DISTINCT FROM v_m.caso_autor AND v_m.autor IS DISTINCT FROM 'esteban.delacruz' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_DECIDE');
  END IF;
  SELECT count(*), count(*) FILTER (WHERE a.clase = 'audio') INTO v_n, v_na FROM conceptualizador.adjunto a WHERE a.mensaje_id = p_msg;
  IF v_n NOT BETWEEN 1 AND 20 OR v_na <> v_n THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_SOLO_VOZ'); END IF;
  INSERT INTO conceptualizador.voz_rafaga (caso_id, mensaje_id, autor, notas, n_notas, audio_s, grabada_at)
  SELECT v_m.caso_id, p_msg, v_m.autor,
         jsonb_agg(jsonb_build_object('k', x.k, 'dur', x.dur, 'inicio', NULL, 'sha256', x.sha256, 'cortada', false, 'ctx', '[]'::jsonb, 'canal', 'chat') ORDER BY x.k),
         count(*), coalesce(sum(x.dur), 0), NULL
    FROM (SELECT row_number() OVER (ORDER BY a.escrito_at, a.created_at) AS k, least(coalesce(a.duracion_s, 0), 600) AS dur, a.sha256
            FROM conceptualizador.adjunto a WHERE a.mensaje_id = p_msg AND a.clase = 'audio') x
  ON CONFLICT (mensaje_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'rafaga_id', v_id);
END
$vch70$;
ALTER FUNCTION conceptualizador.voz_rafaga_de_chat(bigint) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.voz_rafaga_de_chat(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot70$
DECLARE
  v_r jsonb;
  v_c jsonb;
BEGIN
  v_r := conceptualizador.api_motor_0070prev(p);
  IF p->>'modo' = 'rafaga' AND coalesce((v_r->>'ok')::boolean, false) AND coalesce(p->>'mensaje_id', '') ~ '^[0-9]{1,15}\Z'
     AND jsonb_typeof(v_r->'rafaga') IS DISTINCT FROM 'object' THEN
    v_c := conceptualizador.voz_rafaga_de_chat((p->>'mensaje_id')::bigint);
    IF coalesce((v_c->>'ok')::boolean, false) THEN v_r := conceptualizador.api_motor_0070prev(p); END IF;
    IF v_c->>'error' IS DISTINCT FROM 'APAGADO' THEN v_r := v_r || jsonb_build_object('de_chat', v_c); END IF;
  END IF;
  RETURN v_r;
END
$mot70$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0070prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0070prev(jsonb) FROM PUBLIC;
DO $gr70$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_motor_0070prev(jsonb) FROM conceptualizador_app;
    REVOKE ALL ON FUNCTION conceptualizador.voz_rafaga_de_chat(bigint) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$gr70$;
