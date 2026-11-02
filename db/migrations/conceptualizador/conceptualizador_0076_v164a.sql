-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0076 · V1.64a parte 13 (fts-conceptualizador#20 punto 5, Esteban 1-nov-2026 noche) · COMPARTIR CASO
--
-- Detrás de `compartir_caso_v165` (apagado; se lee caso → dueño del caso → global, prendido_caso de la 0071). Diseño: #20 6565285940.
--   · tabla caso_compartido: (caso, para, nivel lectura|edicion), con quién lo dio y quién lo recogió. Nunca se borra: se recoge.
--   · modos `compartir` y `dejar_de_compartir` (datos.para, datos.nivel): solo el dueño del caso o el admin. Con anti-replay (ts, nonce).
--     Los acepta el workflow conceptualizador/suite desde su lista de modos (va de Esteban, #20 parte 13 d).
--   · `hilo` de un caso compartido contigo: se ve (antes la 0066 contestaba NO_AUTORIZADO).
--   · `casos`: con casos_propios_v164, la lista trae lo tuyo MÁS lo compartido contigo, marcado `compartido` (nivel) y `puede_editar`.
--   · escribir (enviar, accion, subir… · la lista de la 0075): con nivel `edicion` sí; con `lectura`, NO_AUTORIZADO.
--   · renombrar, archivar, fijar: siguen siendo solo del dueño o del admin (no se tocan).
-- Apagado: nada de esto pasa; compartir y dejar_de_compartir contestan INTERRUPTOR_APAGADO sin escribir.
-- ORDEN: 0075 → 0076. Aditiva e idempotente. Reversa: reversas/076_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conceptualizador.caso_compartido (
  id            bigserial   PRIMARY KEY,
  caso_id       uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  para          text        NOT NULL CHECK (para ~ '^[a-z0-9._-]{3,60}\Z'),
  nivel         text        NOT NULL CHECK (nivel IN ('lectura','edicion')),
  otorgado_por  text        NOT NULL,
  otorgado_at   timestamptz NOT NULL DEFAULT now(),
  recogido_por  text,
  recogido_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS caso_compartido_vivo ON conceptualizador.caso_compartido (caso_id, para) WHERE recogido_at IS NULL;

CREATE OR REPLACE FUNCTION conceptualizador.compartido_nivel(p_actor text, p_caso uuid) RETURNS text
LANGUAGE sql STABLE AS $cn76$
  SELECT CASE WHEN conceptualizador.prendido_caso('compartir_caso_v165', p_caso)
              THEN (SELECT s.nivel FROM conceptualizador.caso_compartido s WHERE s.caso_id = p_caso AND s.para = p_actor AND s.recogido_at IS NULL LIMIT 1) END
$cn76$;
ALTER FUNCTION conceptualizador.compartido_nivel(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.compartido_nivel(text, uuid) FROM PUBLIC;

DO $ren76p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'puede_escribir_caso_0076prev') THEN
    ALTER FUNCTION conceptualizador.puede_escribir_caso(text, uuid) RENAME TO puede_escribir_caso_0076prev;
  END IF;
END
$ren76p$;
CREATE OR REPLACE FUNCTION conceptualizador.puede_escribir_caso(p_actor text, p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $pe76$
  SELECT conceptualizador.puede_escribir_caso_0076prev(p_actor, p_caso)
      OR coalesce(conceptualizador.compartido_nivel(p_actor, p_caso) = 'edicion', false)
$pe76$;
ALTER FUNCTION conceptualizador.puede_escribir_caso(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.puede_escribir_caso_0076prev(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.puede_escribir_caso(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.puede_escribir_caso_0076prev(text, uuid) FROM PUBLIC;

DO $ren76s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0076prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0076prev;
  END IF;
END
$ren76s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui76$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_modo  text := p->>'modo';
  v_caso  uuid;
  v_c     conceptualizador.caso%ROWTYPE;
  v_para  text;
  v_niv   text;
  v_ts    bigint;
  v_n     int;
  v_id    bigint;
  v_r     jsonb;
BEGIN
  -- ── compartir / dejar_de_compartir ──
  IF v_modo IN ('compartir', 'dejar_de_compartir') THEN
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
    v_ts := CASE WHEN coalesce(p->>'ts', '') ~ '^[0-9]{10,16}\Z' THEN (p->>'ts')::bigint END;
    IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA');
    END IF;
    IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = v_caso;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF NOT conceptualizador.prendido_caso('compartir_caso_v165', v_c.id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'mensaje', 'Compartir casos todavía no está prendido.');
    END IF;
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Solo el dueño del caso (o Esteban) lo comparte.');
    END IF;
    v_para := lower(btrim(coalesce(p->'datos'->>'para', '')));
    IF v_para !~ '^[a-z0-9._-]{3,60}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'PARA_INVALIDO'); END IF;
    IF v_para = v_c.autor THEN RETURN jsonb_build_object('ok', false, 'error', 'ES_EL_DUENO', 'mensaje', 'El caso ya es de ' || v_para || '.'); END IF;
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA'); END IF;
    -- lo vivo se recoge siempre (al compartir de nuevo, el nivel nuevo reemplaza al anterior, con su bitácora)
    UPDATE conceptualizador.caso_compartido SET recogido_at = now(), recogido_por = v_actor
     WHERE caso_id = v_c.id AND para = v_para AND recogido_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_modo = 'dejar_de_compartir' THEN
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'para', v_para, 'recogidos', v_n);
    END IF;
    v_niv := coalesce(p->'datos'->>'nivel', 'lectura');
    IF v_niv NOT IN ('lectura', 'edicion') THEN RETURN jsonb_build_object('ok', false, 'error', 'NIVEL_INVALIDO'); END IF;
    INSERT INTO conceptualizador.caso_compartido (caso_id, para, nivel, otorgado_por) VALUES (v_c.id, v_para, v_niv, v_actor) RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'para', v_para, 'nivel', v_niv, 'id', v_id, 'reemplazo', v_n > 0);
  END IF;

  -- ── hilo de un caso compartido contigo: se salta el NO_AUTORIZADO de la 0066 (lo demás de la cadena es igual) ──
  IF v_modo = 'hilo' AND v_actor IS NOT NULL THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND conceptualizador.compartido_nivel(v_actor, v_caso) IS NOT NULL THEN
      v_r := conceptualizador.api_suite_0066prev(p);
      IF coalesce((v_r->>'ok')::boolean, false) THEN
        v_r := v_r || jsonb_build_object('compartido', conceptualizador.compartido_nivel(v_actor, v_caso));
      END IF;
      RETURN v_r;
    END IF;
  END IF;

  v_r := conceptualizador.api_suite_0076prev(p);

  -- ── casos: lo tuyo más lo compartido contigo (solo si la lista viene filtrada por la 0066). La lista completa se pide otra vez a la
  --    0066prev con un nonce DERIVADO (el original ya lo gastó la primera llamada; el anti-replay sigue siendo el de la primera). ──
  IF v_modo = 'casos' AND v_actor IS NOT NULL AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'casos') = 'array'
     AND EXISTS (SELECT 1 FROM conceptualizador.caso_compartido s WHERE s.para = v_actor AND s.recogido_at IS NULL
                   AND conceptualizador.compartido_nivel(v_actor, s.caso_id) IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r->'casos') x
                      WHERE (x->>'id')::uuid IN (SELECT s.caso_id FROM conceptualizador.caso_compartido s WHERE s.para = v_actor AND s.recogido_at IS NULL)) THEN
    v_r := jsonb_set(v_r, ARRAY['casos'], (v_r->'casos') || coalesce((
      SELECT jsonb_agg(a.x || jsonb_build_object('compartido', conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid),
                                                 'puede_editar', conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid) = 'edicion') ORDER BY a.o)
        FROM jsonb_array_elements(conceptualizador.api_suite_0066prev(p || jsonb_build_object('nonce', (p->>'nonce') || '-c76'))->'casos') WITH ORDINALITY AS a(x, o)
       WHERE conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid) IS NOT NULL), '[]'::jsonb));
  END IF;
  RETURN v_r;
END
$sui76$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0076prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0076prev(jsonb) FROM PUBLIC;
DO $gr76$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0076prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr76$;
