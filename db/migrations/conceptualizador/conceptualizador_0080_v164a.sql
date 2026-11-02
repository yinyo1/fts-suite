-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0080 · V1.64a (fts-conceptualizador#20, la cola de Richard) · COLA ATORADA: el teléfono avisa y suena la alarma
--
-- Falla de campo (2-nov-2026): la cola del iPhone de Richard pasó ~5 días atorada (desde el 28-oct) sin que nada lo detectara: el
-- servidor nunca veía un error porque el pedido nunca salía del teléfono. Desde la pantalla V1.65.8, cuando un mensaje lleva 3 fallas
-- seguidas, o más de 30 min en la cola con alguna falla, o el servidor lo rechaza, la pantalla manda UNA vez:
--   modo `evento`, tipo `cola_atorada`, datos {cliente_id, codigo, motivo, fallas, escrito_at, encolado_at, adjuntos, sin_subir, clases,
--   estado, navegador}.
-- Aquí:
--   · tabla cola_atorada (una fila por actor + cliente_id; un segundo aviso del mismo mensaje la actualiza, no la duplica);
--   · api_suite: acepta ese evento (dueño del caso o quien pueda escribir en él), y cuando un `enviar` del mismo cliente_id entra bien,
--     la marca resuelta: el mensaje que por fin llegó cierra su propia alarma;
--   · alarmas_motor: `cola_atorada` por cada fila abierta reportada en los últimos 7 días → correo diario y alarma_incidente.
-- Sin interruptor: es solo un aviso, no cambia ninguna respuesta existente (cualquier otro evento sigue igual que en la 0079).
-- ORDEN: 0079 → 0080. Aditiva e idempotente. Reversa: reversas/080_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conceptualizador.cola_atorada (
  id            bigserial   PRIMARY KEY,
  actor         text        NOT NULL,
  caso_id       uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  cliente_id    text        NOT NULL,
  codigo        text,
  motivo        text,
  fallas        int         NOT NULL DEFAULT 0,
  escrito_at    timestamptz,
  encolado_at   timestamptz,
  sin_subir     int         NOT NULL DEFAULT 0,
  datos         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reportado_at  timestamptz NOT NULL DEFAULT now(),
  visto_at      timestamptz NOT NULL DEFAULT now(),
  resuelto_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS cola_atorada_unica ON conceptualizador.cola_atorada (actor, cliente_id);
REVOKE ALL ON TABLE conceptualizador.cola_atorada FROM PUBLIC;

DO $ren80$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0080prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0080prev;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0080prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0080prev;
  END IF;
END
$ren80$;

/** De milisegundos (texto o número) a timestamptz; basura → null. */
CREATE OR REPLACE FUNCTION conceptualizador.ms_a_ts(p text) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $mt80$
  SELECT CASE WHEN coalesce(p, '') ~ '^[0-9]{10,16}\Z' THEN to_timestamp(p::bigint / 1000.0) END
$mt80$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui80$
DECLARE
  v_r     jsonb;
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_ts    bigint;
  v_caso  uuid;
  v_n     int;
  v_cid   text;
BEGIN
  IF p->>'modo' = 'evento' AND p->>'tipo' = 'cola_atorada' THEN
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
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
    IF NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso AND autor = v_actor)
       AND NOT coalesce(conceptualizador.puede_escribir_caso(v_actor, v_caso), false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO');
    END IF;
    v_cid := left(coalesce(v_d->>'cliente_id', ''), 80);
    IF v_cid !~ '^[A-Za-z0-9_-]{4,80}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'CLIENTE_ID_INVALIDO'); END IF;
    INSERT INTO conceptualizador.cola_atorada AS c (actor, caso_id, cliente_id, codigo, motivo, fallas, escrito_at, encolado_at, sin_subir, datos)
    VALUES (v_actor, v_caso, v_cid, left(v_d->>'codigo', 40), left(v_d->>'motivo', 200),
            coalesce(conceptualizador.a_entero(v_d->>'fallas'), 0)::int,
            conceptualizador.ms_a_ts(v_d->>'escrito_at'), conceptualizador.ms_a_ts(v_d->>'encolado_at'),
            coalesce(conceptualizador.a_entero(v_d->>'sin_subir'), 0)::int,
            jsonb_build_object('adjuntos', v_d->'adjuntos', 'clases', v_d->'clases', 'estado', left(v_d->>'estado', 20), 'navegador', left(v_d->>'navegador', 160)))
    ON CONFLICT (actor, cliente_id) DO UPDATE SET codigo = excluded.codigo, motivo = excluded.motivo, fallas = excluded.fallas,
      sin_subir = excluded.sin_subir, datos = excluded.datos, visto_at = now()
    WHERE c.resuelto_at IS NULL;
    RETURN jsonb_build_object('ok', true, 'guardado', true);
  END IF;

  v_r := conceptualizador.api_suite_0080prev(p);
  -- El mensaje que por fin entró cierra su propia alarma.
  IF p->>'modo' = 'enviar' AND v_actor IS NOT NULL AND coalesce((v_r->>'ok')::boolean, false) AND nullif(p->>'cliente_id', '') IS NOT NULL THEN
    UPDATE conceptualizador.cola_atorada SET resuelto_at = now() WHERE actor = v_actor AND cliente_id = p->>'cliente_id' AND resuelto_at IS NULL;
  END IF;
  RETURN v_r;
END
$sui80$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0080prev(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am80$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0080prev(p_llave);
  v_ahora timestamptz;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' THEN RETURN v_r; END IF;
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  FOR f IN SELECT c.*, k.titulo FROM conceptualizador.cola_atorada c JOIN conceptualizador.caso k ON k.id = c.caso_id
            WHERE c.resuelto_at IS NULL AND c.reportado_at > v_ahora - interval '7 days' AND c.reportado_at <= v_ahora
              AND c.actor NOT LIKE 'zz.%' AND NOT k.demo
            ORDER BY c.reportado_at LOOP
    v_r := v_r || conceptualizador.alarma('cola_atorada', f.actor || ':' || f.cliente_id, coalesce(f.encolado_at, f.escrito_at, f.reportado_at),
      'A ' || f.actor || ' no se le ha podido mandar un mensaje' || CASE WHEN f.sin_subir > 0 THEN ' con ' || f.sin_subir || ' archivo(s) sin subir' ELSE '' END ||
        ' en «' || left(f.titulo, 60) || '» (escrito ' || coalesce(to_char(f.escrito_at AT TIME ZONE conceptualizador.zona_robot(), 'DD-Mon HH24:MI'), '¿?') ||
        ', ' || f.fallas || ' falla(s)): ' || coalesce(f.motivo, f.codigo, 'sin motivo') || '. Sigue en su teléfono.',
      'Pídele que abra el caso con señal y toque «Reintentar». Si dice que el teléfono ya no puede leer el audio, que use «Guardar en el teléfono» y lo mande otra vez desde la grabadora o como archivo. La alarma se cierra sola cuando el mensaje entra.',
      'cola-atorada', jsonb_build_object('caso_id', f.caso_id, 'actor', f.actor, 'cliente_id', f.cliente_id, 'codigo', f.codigo));
  END LOOP;
  RETURN v_r;
END
$am80$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0080prev(text) FROM PUBLIC;

DO $gr80$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0080prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr80$;
