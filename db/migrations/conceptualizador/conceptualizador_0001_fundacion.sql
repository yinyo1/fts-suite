-- ═══════════════════════════════════════════════════════════════════════════
-- 001_conceptualizador.sql · esquema `conceptualizador` en fts-suite-db
-- Sesión 1 (issue de fts-conceptualizador "Sesión 1 · MVP de punta a punta")
--
-- TODA la lógica de la cola vive aquí, en funciones. n8n solo autentica y
-- llama UNA función por endpoint (api_suite, api_motor, api_respaldo). Así:
--   · hay una sola implementación de "tomar un trabajo" (atómica, aquí);
--   · el simulador local corre EXACTAMENTE este SQL;
--   · cambiar una regla es una migración nueva, no editar tres workflows.
--
-- Reglas de la suite que respeta (fts-suite/db/README.md):
--   · idempotente (IF NOT EXISTS / CREATE OR REPLACE);
--   · rol de aplicación NOLOGIN, sin contraseña y SIN DELETE;
--   · cuerpos de función con etiqueta con nombre (nunca dos dólares juntos),
--     sin llaves dobles y sin dólar seguido de dígito o comilla.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version      text        PRIMARY KEY,
  nombre       text        NOT NULL,
  sha256       text        NOT NULL,
  aplicada_at  timestamptz NOT NULL DEFAULT now(),
  aplicada_por text        NOT NULL DEFAULT current_user
);

CREATE SCHEMA IF NOT EXISTS conceptualizador;
COMMENT ON SCHEMA conceptualizador IS
  'Cola y conversación del conceptualizador de cotizaciones. El conocimiento vive en el repo privado fts-conceptualizador; aquí solo la conversación, la cola y un snapshot de lo aprendido para pintarlo.';

DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    CREATE ROLE conceptualizador_app NOLOGIN;
  END IF;
END
$rol$;
GRANT USAGE ON SCHEMA conceptualizador TO conceptualizador_app;

-- ── Tablas ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conceptualizador.caso (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      text        NOT NULL,
  cliente     text,
  pais        text        NOT NULL DEFAULT 'mx' CHECK (pais IN ('mx','usa')),
  autor       text        NOT NULL,
  autor_nombre text,
  carpeta     text,                         -- casos/<...> en el repo; la pone el motor
  estado      text        NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  demo        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conceptualizador.mensaje (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  rol         text        NOT NULL CHECK (rol IN ('usuario','motor')),
  autor       text        NOT NULL,
  texto       text        NOT NULL,
  adjuntos    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  trabajo_id  bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensaje_caso ON conceptualizador.mensaje (caso_id, id);

CREATE TABLE IF NOT EXISTS conceptualizador.evento (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  tipo        text        NOT NULL CHECK (tipo IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra')),
  concepto    text,
  razon       text,
  datos       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  autor       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Un rechazo sin razón no enseña nada: la base no lo acepta.
  CONSTRAINT rechazo_con_razon CHECK (tipo <> 'rechazar' OR char_length(btrim(coalesce(razon,''))) >= 3)
);
CREATE INDEX IF NOT EXISTS evento_caso ON conceptualizador.evento (caso_id, id);

CREATE TABLE IF NOT EXISTS conceptualizador.trabajo (
  id            bigserial   PRIMARY KEY,
  caso_id       uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  tipo          text        NOT NULL CHECK (tipo IN ('mensaje','evento')),
  mensaje_id    bigint,
  evento_id     bigint,
  estado        text        NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','tomado','listo','error')),
  intentos      int         NOT NULL DEFAULT 0,
  max_intentos  int         NOT NULL DEFAULT 3,
  tomado_por    text        CHECK (tomado_por IN ('principal','respaldo')),
  sesion        text,
  tomado_at     timestamptz,
  listo_at      timestamptz,
  error         text,
  respaldo_disparado_at timestamptz,
  respaldo_disparos     int  NOT NULL DEFAULT 0,
  respaldo_resultado    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trabajo_pend ON conceptualizador.trabajo (estado, id);

CREATE TABLE IF NOT EXISTS conceptualizador.respuesta (
  id          bigserial   PRIMARY KEY,
  trabajo_id  bigint      NOT NULL UNIQUE REFERENCES conceptualizador.trabajo(id),
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  motor       text        NOT NULL,
  texto       text        NOT NULL,
  conceptos   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  bom         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  preguntas   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  lecciones   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  verifica    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  segundos    numeric,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conceptualizador.latido (
  motor       text        PRIMARY KEY CHECK (motor IN ('principal','respaldo')),
  sesion      text,
  estado      text        NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','pausado','apagado')),
  atendidos   int         NOT NULL DEFAULT 0,
  errores     int         NOT NULL DEFAULT 0,
  version     text,
  visto_at    timestamptz NOT NULL DEFAULT now()
);

-- Anti-replay: cada petición de la suite trae un nonce único.
CREATE TABLE IF NOT EXISTS conceptualizador.nonce (
  nonce       text        PRIMARY KEY,
  actor       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Snapshot de "Lo que aprendió" que manda el motor (el conocimiento vive en git).
CREATE TABLE IF NOT EXISTS conceptualizador.aprendizaje (
  id          bigserial   PRIMARY KEY,
  resumen     jsonb       NOT NULL,
  motor       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Parámetros de la cola en un solo lugar.
CREATE TABLE IF NOT EXISTS conceptualizador.config (
  clave text PRIMARY KEY,
  valor text NOT NULL
);
INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('latido_vivo_segundos',   '120'),   -- sin latido en 2 min = principal caído
  ('espera_respaldo_segundos','45'),   -- trabajo sin tomar 45 s = respaldo
  ('lease_segundos',         '600'),   -- un tomado sin entregar en 10 min se puede re-tomar
  ('reintento_respaldo_segundos','300'),
  ('ventana_replay_segundos','300')
ON CONFLICT (clave) DO NOTHING;

-- ── Auditoría ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.touch() RETURNS trigger
LANGUAGE plpgsql AS $touch$
BEGIN NEW.updated_at := now(); RETURN NEW; END
$touch$;
DROP TRIGGER IF EXISTS caso_touch ON conceptualizador.caso;
CREATE TRIGGER caso_touch BEFORE UPDATE ON conceptualizador.caso
  FOR EACH ROW EXECUTE FUNCTION conceptualizador.touch();

CREATE OR REPLACE FUNCTION conceptualizador.cfg(p_clave text) RETURNS int
LANGUAGE sql STABLE AS $cfg$
  SELECT valor::int FROM conceptualizador.config WHERE clave = p_clave
$cfg$;

-- ── Lecturas compartidas ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION conceptualizador.estado_motor() RETURNS jsonb
LANGUAGE sql STABLE AS $est$
  SELECT jsonb_build_object(
    'principal_vivo', coalesce(l.estado = 'activo'
        AND l.visto_at > now() - make_interval(secs => conceptualizador.cfg('latido_vivo_segundos')), false),
    'principal_estado', l.estado,
    'principal_visto_hace_s', CASE WHEN l.visto_at IS NULL THEN NULL
        ELSE round(extract(epoch FROM now() - l.visto_at))::int END,
    'atendidos', coalesce(l.atendidos, 0),
    'errores', coalesce(l.errores, 0),
    'modo', CASE WHEN coalesce(l.estado = 'activo'
        AND l.visto_at > now() - make_interval(secs => conceptualizador.cfg('latido_vivo_segundos')), false)
        THEN 'rapido' ELSE 'respaldo' END,
    'pendientes', (SELECT count(*) FROM conceptualizador.trabajo WHERE estado = 'pendiente'),
    'en_proceso', (SELECT count(*) FROM conceptualizador.trabajo WHERE estado = 'tomado'))
  FROM (SELECT 1) x
  LEFT JOIN conceptualizador.latido l ON l.motor = 'principal'
$est$;

CREATE OR REPLACE FUNCTION conceptualizador.hilo(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $hilo$
  SELECT jsonb_build_object(
    'caso', to_jsonb(c),
    'mensajes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'rol', m.rol, 'autor', m.autor, 'texto', m.texto, 'adjuntos', m.adjuntos,
        'trabajo_id', m.trabajo_id, 'created_at', m.created_at,
        'estado', t.estado, 'tomado_por', t.tomado_por, 'error', t.error) ORDER BY m.id)
      FROM conceptualizador.mensaje m
      LEFT JOIN conceptualizador.trabajo t ON t.id = m.trabajo_id
      WHERE m.caso_id = c.id), '[]'::jsonb),
    'eventos', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM conceptualizador.evento e WHERE e.caso_id = c.id), '[]'::jsonb),
    'trabajos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'tipo', t.tipo,
        'estado', t.estado, 'tomado_por', t.tomado_por, 'intentos', t.intentos, 'error', t.error,
        'created_at', t.created_at, 'tomado_at', t.tomado_at, 'listo_at', t.listo_at) ORDER BY t.id)
      FROM conceptualizador.trabajo t WHERE t.caso_id = c.id), '[]'::jsonb),
    'ultima', (SELECT jsonb_build_object('trabajo_id', r.trabajo_id, 'motor', r.motor,
        'conceptos', r.conceptos, 'bom', r.bom, 'preguntas', r.preguntas,
        'lecciones', r.lecciones, 'verifica', r.verifica, 'segundos', r.segundos,
        'created_at', r.created_at)
      FROM conceptualizador.respuesta r WHERE r.caso_id = c.id
      ORDER BY r.id DESC LIMIT 1))
  FROM conceptualizador.caso c WHERE c.id = p_caso
$hilo$;

-- ── API de la suite (la llama el webhook ya con el actor verificado) ──────

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $api$
DECLARE
  v_actor  text := nullif(btrim(p->>'actor'), '');
  v_modo   text := p->>'modo';
  v_caso   uuid;
  v_msg    bigint;
  v_ev     bigint;
  v_trab   bigint;
  v_ts     bigint;
  v_n      int;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR');
  END IF;

  -- Anti-replay: ts dentro de la ventana y nonce nunca visto.
  v_ts := nullif(p->>'ts','')::bigint;
  IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA',
      'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  IF char_length(coalesce(p->>'nonce','')) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE');
  END IF;
  INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor)
    ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.');
  END IF;

  IF v_modo = 'enviar' THEN
    IF char_length(btrim(coalesce(p->>'texto',''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TEXTO_VACIO');
    END IF;
    v_caso := nullif(p->>'caso_id','')::uuid;
    IF v_caso IS NULL THEN
      INSERT INTO conceptualizador.caso (titulo, cliente, pais, autor, autor_nombre, demo)
      VALUES (coalesce(nullif(btrim(p->>'titulo'),''), left(btrim(p->>'texto'), 60)),
              nullif(btrim(p->>'cliente'),''),
              CASE WHEN p->>'pais' = 'usa' THEN 'usa' ELSE 'mx' END,
              v_actor, p->>'nombre', coalesce((p->>'demo')::boolean, false))
      RETURNING id INTO v_caso;
    ELSIF NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
    END IF;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto, adjuntos)
    VALUES (v_caso, 'usuario', v_actor, p->>'texto', coalesce(p->'adjuntos', '[]'::jsonb))
    RETURNING id INTO v_msg;
    INSERT INTO conceptualizador.trabajo (caso_id, tipo, mensaje_id)
    VALUES (v_caso, 'mensaje', v_msg) RETURNING id INTO v_trab;
    UPDATE conceptualizador.mensaje SET trabajo_id = v_trab WHERE id = v_msg;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_caso, 'mensaje_id', v_msg, 'trabajo_id', v_trab,
                              'motor', conceptualizador.estado_motor());

  ELSIF v_modo = 'evento' THEN
    v_caso := nullif(p->>'caso_id','')::uuid;
    IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
    END IF;
    IF p->>'tipo' = 'rechazar' AND char_length(btrim(coalesce(p->>'razon',''))) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RAZON_OBLIGATORIA',
        'mensaje', 'Para rechazar un concepto hay que decir por qué.');
    END IF;
    INSERT INTO conceptualizador.evento (caso_id, tipo, concepto, razon, datos, autor)
    VALUES (v_caso, p->>'tipo', p->>'concepto', p->>'razon', coalesce(p->'datos','{}'::jsonb), v_actor)
    RETURNING id INTO v_ev;
    INSERT INTO conceptualizador.trabajo (caso_id, tipo, evento_id)
    VALUES (v_caso, 'evento', v_ev) RETURNING id INTO v_trab;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_caso, 'evento_id', v_ev, 'trabajo_id', v_trab);

  ELSIF v_modo = 'hilo' THEN
    v_caso := nullif(p->>'caso_id','')::uuid;
    RETURN jsonb_build_object('ok', v_caso IS NOT NULL, 'hilo', conceptualizador.hilo(v_caso),
                              'motor', conceptualizador.estado_motor());

  ELSIF v_modo = 'casos' THEN
    RETURN jsonb_build_object('ok', true, 'casos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.titulo, 'cliente', c.cliente,
        'pais', c.pais, 'autor', c.autor, 'estado', c.estado, 'demo', c.demo, 'carpeta', c.carpeta,
        'updated_at', c.updated_at,
        'pendientes', (SELECT count(*) FROM conceptualizador.trabajo t
                       WHERE t.caso_id = c.id AND t.estado IN ('pendiente','tomado'))) ORDER BY c.updated_at DESC)
      FROM conceptualizador.caso c), '[]'::jsonb),
      'motor', conceptualizador.estado_motor());

  ELSIF v_modo = 'aprendio' THEN
    RETURN jsonb_build_object('ok', true, 'aprendizaje',
      (SELECT jsonb_build_object('resumen', a.resumen, 'created_at', a.created_at, 'motor', a.motor)
       FROM conceptualizador.aprendizaje a ORDER BY a.id DESC LIMIT 1));

  ELSIF v_modo = 'estado' THEN
    RETURN jsonb_build_object('ok', true, 'motor', conceptualizador.estado_motor());
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$api$;

-- ── API del motor (la llama el webhook ya con la llave del motor verificada) ─

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot$
DECLARE
  v_motor  text := p->>'motor';
  v_sesion text := coalesce(p->>'sesion', '');
  v_modo   text := p->>'modo';
  v_id     bigint := nullif(p->>'trabajo_id','')::bigint;
  t        conceptualizador.trabajo%ROWTYPE;
  v_resp   jsonb;
BEGIN
  IF v_motor NOT IN ('principal','respaldo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO');
  END IF;

  IF v_modo = 'latido' THEN
    INSERT INTO conceptualizador.latido (motor, sesion, estado, atendidos, errores, version, visto_at)
    VALUES (v_motor, v_sesion, coalesce(p->>'estado','activo'),
            coalesce((p->>'atendidos')::int, 0), coalesce((p->>'errores')::int, 0), p->>'version', now())
    ON CONFLICT (motor) DO UPDATE SET sesion = EXCLUDED.sesion, estado = EXCLUDED.estado,
      atendidos = EXCLUDED.atendidos, errores = EXCLUDED.errores, version = EXCLUDED.version,
      visto_at = now();
    RETURN jsonb_build_object('ok', true, 'motor', conceptualizador.estado_motor());

  ELSIF v_modo = 'siguiente' THEN
    -- Solo dice cuál; NO lo toma. Tomar es otra llamada, y es la atómica.
    SELECT * INTO t FROM conceptualizador.trabajo
     WHERE estado = 'pendiente'
        OR (estado = 'tomado' AND tomado_at < now() - make_interval(secs => conceptualizador.cfg('lease_segundos')))
     ORDER BY id LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'trabajo_id', t.id, 'tipo', t.tipo, 'caso_id', t.caso_id);

  ELSIF v_modo = 'tomar' THEN
    -- LA línea que garantiza que un trabajo lo procesa un solo motor: el
    -- UPDATE condicional es atómico en Postgres. Si dos motores lo intentan a
    -- la vez, uno ve la fila ya 'tomado' y su UPDATE afecta 0 filas.
    UPDATE conceptualizador.trabajo
       SET estado = 'tomado', tomado_por = v_motor, sesion = v_sesion, tomado_at = now(),
           intentos = intentos + 1, error = NULL
     WHERE id = v_id
       AND (estado = 'pendiente'
            OR (estado = 'tomado' AND tomado_at < now() - make_interval(secs => conceptualizador.cfg('lease_segundos'))))
       AND intentos < max_intentos
    RETURNING * INTO t;
    IF t.id IS NULL THEN
      SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
      RETURN jsonb_build_object('ok', false, 'error',
        CASE WHEN t.id IS NULL THEN 'NO_EXISTE' ELSE 'YA_TOMADO' END,
        'estado', t.estado, 'tomado_por', t.tomado_por);
    END IF;
    RETURN jsonb_build_object('ok', true, 'trabajo', to_jsonb(t),
      'mensaje', (SELECT to_jsonb(m) FROM conceptualizador.mensaje m WHERE m.id = t.mensaje_id),
      'evento',  (SELECT to_jsonb(e) FROM conceptualizador.evento e WHERE e.id = t.evento_id),
      'hilo', conceptualizador.hilo(t.caso_id));

  ELSIF v_modo = 'entregar' THEN
    v_resp := coalesce(p->'respuesta', '{}'::jsonb);
    SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id FOR UPDATE;
    IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
    IF t.estado = 'listo' THEN RETURN jsonb_build_object('ok', true, 'ya_estaba', true); END IF;
    IF t.estado <> 'tomado' OR t.tomado_por <> v_motor OR coalesce(t.sesion,'') <> v_sesion THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO', 'estado', t.estado, 'tomado_por', t.tomado_por);
    END IF;
    IF char_length(btrim(coalesce(v_resp->>'texto',''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RESPUESTA_SIN_TEXTO');
    END IF;
    INSERT INTO conceptualizador.respuesta (trabajo_id, caso_id, motor, texto, conceptos, bom, preguntas, lecciones, verifica, segundos)
    VALUES (t.id, t.caso_id, v_motor, v_resp->>'texto',
            coalesce(v_resp->'conceptos','[]'::jsonb), coalesce(v_resp->'bom','{}'::jsonb),
            coalesce(v_resp->'preguntas','[]'::jsonb), coalesce(v_resp->'lecciones','[]'::jsonb),
            coalesce(v_resp->'verifica','{}'::jsonb),
            round(extract(epoch FROM now() - t.created_at)::numeric, 1));
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto, trabajo_id)
    VALUES (t.caso_id, 'motor', 'motor-' || v_motor, v_resp->>'texto', t.id);
    UPDATE conceptualizador.trabajo SET estado = 'listo', listo_at = now() WHERE id = t.id;
    UPDATE conceptualizador.caso SET
      carpeta = coalesce(nullif(v_resp->>'carpeta',''), carpeta),
      estado  = CASE WHEN v_resp->>'caso_estado' IN ('abierto','cerrado') THEN v_resp->>'caso_estado' ELSE estado END
     WHERE id = t.caso_id;
    IF p ? 'aprendizaje' AND jsonb_typeof(p->'aprendizaje') = 'object' THEN
      INSERT INTO conceptualizador.aprendizaje (resumen, motor) VALUES (p->'aprendizaje', v_motor);
    END IF;
    RETURN jsonb_build_object('ok', true, 'trabajo_id', t.id,
      'segundos', round(extract(epoch FROM now() - t.created_at)::numeric, 1));

  ELSIF v_modo = 'error' THEN
    UPDATE conceptualizador.trabajo
       SET estado = CASE WHEN intentos >= max_intentos THEN 'error' ELSE 'pendiente' END,
           error = left(coalesce(p->>'causa','sin causa'), 500),
           tomado_por = NULL, sesion = NULL, tomado_at = NULL
     WHERE id = v_id AND estado = 'tomado' AND tomado_por = v_motor AND coalesce(sesion,'') = v_sesion
    RETURNING * INTO t;
    RETURN jsonb_build_object('ok', t.id IS NOT NULL, 'estado', t.estado);

  ELSIF v_modo = 'aprendizaje' THEN
    INSERT INTO conceptualizador.aprendizaje (resumen, motor) VALUES (coalesce(p->'aprendizaje','{}'::jsonb), v_motor);
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$mot$;

-- ── Regla de respaldo ──────────────────────────────────────────────────────
-- Devuelve los trabajos a los que hay que disparar la rutina de respaldo y
-- los MARCA en la misma sentencia (nadie los dispara dos veces).
-- Disparar si: el principal no está vivo, o el trabajo lleva más de 45 s
-- sin tomarse. No se vuelve a disparar el mismo trabajo antes de 5 min.
CREATE OR REPLACE FUNCTION conceptualizador.api_respaldo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $resp$
DECLARE
  v_vivo boolean := (conceptualizador.estado_motor()->>'principal_vivo')::boolean;
  v_ids  jsonb;
BEGIN
  IF coalesce(p->>'modo','buscar') = 'buscar' THEN
    WITH elegidos AS (
      SELECT id FROM conceptualizador.trabajo
       WHERE estado = 'pendiente'
         AND intentos < max_intentos
         AND (NOT v_vivo OR created_at < now() - make_interval(secs => conceptualizador.cfg('espera_respaldo_segundos')))
         AND (respaldo_disparado_at IS NULL
              OR respaldo_disparado_at < now() - make_interval(secs => conceptualizador.cfg('reintento_respaldo_segundos')))
       ORDER BY id LIMIT 5
       FOR UPDATE SKIP LOCKED),
    marcados AS (
      UPDATE conceptualizador.trabajo t
         SET respaldo_disparado_at = now(), respaldo_disparos = respaldo_disparos + 1
        FROM elegidos e WHERE t.id = e.id
      RETURNING t.id)
    SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_ids FROM marcados;
    RETURN jsonb_build_object('ok', true, 'principal_vivo', v_vivo, 'disparar', v_ids);

  ELSIF p->>'modo' = 'resultado' THEN
    -- Si la rutina dijo "límite excedido" (429) o falló, se libera para reintentar.
    UPDATE conceptualizador.trabajo
       SET respaldo_resultado = left(coalesce(p->>'detalle',''), 300),
           respaldo_disparado_at = CASE WHEN (p->>'ok')::boolean THEN respaldo_disparado_at ELSE NULL END
     WHERE id = nullif(p->>'trabajo_id','')::bigint;
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$resp$;

-- ── Permisos mínimos: solo ejecutar las tres puertas ──────────────────────
-- El rol de aplicación NO toca las tablas directo: todo pasa por las
-- funciones, que corren con los permisos de su dueño (SECURITY DEFINER).
ALTER FUNCTION conceptualizador.api_suite(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_respaldo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.estado_motor(), conceptualizador.hilo(uuid),
                          conceptualizador.cfg(text) TO conceptualizador_app;
