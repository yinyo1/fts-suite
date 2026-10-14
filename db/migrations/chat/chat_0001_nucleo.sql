-- ═══════════════════════════════════════════════════════════════════════════
-- chat_0001_nucleo.sql · esquema `chat` en fts-suite-db (Marketing · MVP, #407 §2.2)
--
-- El núcleo de conversación que comparten los productos de la suite que trabajan
-- «tipo WhatsApp» con un motor (una sesión de Claude Code que contesta). Nace
-- VACÍO y lo estrena Marketing. El conceptualizador NO se migra aquí: sigue en su
-- esquema `conceptualizador` hasta su propia sesión (decisión M3 de #407).
--
-- Qué es genérico (aquí) y qué es de cada producto (en su esquema):
--   · aquí: sesión, mensaje, adjunto, trabajo (cola con arrendamiento), respuesta,
--     latido, nonce (anti-replay), consumo medido, avisos y topes por persona.
--   · en `<producto>`: lo que solo ese producto entiende. Se engancha con DOS
--     funciones opcionales de su esquema, que el núcleo llama si existen:
--       <esquema>.gancho(evento text, req jsonb) → jsonb  (puede rechazar: ok=false)
--       <esquema>.api_suite_ext(req) / <esquema>.api_motor_ext(req) → modos propios.
--
-- n8n solo autentica (JWT + firma + ventana) y llama UNA función por endpoint:
-- chat.api_suite(req) y chat.api_motor(req). El producto viaja en req.producto y
-- tiene que estar dado de alta en chat.producto.
--
-- Reglas de la suite (db/README.md): idempotente; roles NOLOGIN sin contraseña;
-- cuerpos con etiqueta con nombre; sin llaves dobles; sin dólar seguido de dígito,
-- comilla, ampersand o acento grave (por eso los EXECUTE dinámicos usan format %L).
--
-- Funciones SECURITY DEFINER con dueño chat_app: quien las llame (la credencial de
-- n8n) solo puede lo que chat_app puede, que es su esquema.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version      text        PRIMARY KEY,
  nombre       text        NOT NULL,
  sha256       text        NOT NULL,
  aplicada_at  timestamptz NOT NULL DEFAULT now(),
  aplicada_por text        NOT NULL DEFAULT current_user
);

CREATE SCHEMA IF NOT EXISTS chat;
COMMENT ON SCHEMA chat IS
  'Núcleo de conversación de la suite (#407): sesiones, mensajes, adjuntos, cola de trabajos del motor, consumo y topes. Lo propio de cada producto vive en su esquema.';

DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chat_app') THEN
    CREATE ROLE chat_app NOLOGIN;
  END IF;
END
$rol$;
GRANT USAGE ON SCHEMA chat TO chat_app;
-- Quien migra (fts_admin) necesita poder pasarle la propiedad a chat_app (PG16: SET sobre el rol).
GRANT chat_app TO CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA chat TO chat_app;

-- ── Productos dados de alta ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat.producto (
  clave        text PRIMARY KEY CHECK (clave ~ '^[a-z][a-z0-9_]{1,30}'),
  esquema      text NOT NULL,                 -- dónde viven sus ganchos
  scope_usar   text NOT NULL,                 -- el que exige n8n (aquí solo se documenta)
  activo       boolean NOT NULL DEFAULT true,
  descripcion  text
);
INSERT INTO chat.producto (clave, esquema, scope_usar, descripcion) VALUES
  ('marketing', 'marketing', 'marketing:usar', 'Prospectador, Lead rápido y Bandeja del radar (#407)')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS chat.config (
  producto text NOT NULL REFERENCES chat.producto(clave),
  clave    text NOT NULL,
  valor    text NOT NULL,
  PRIMARY KEY (producto, clave)
);
INSERT INTO chat.config (producto, clave, valor) VALUES
  ('marketing', 'latido_vivo_segundos',    '120'),
  ('marketing', 'lease_segundos',          '1200'),  -- una ficha tarda más que una respuesta del conceptualizador
  ('marketing', 'ventana_replay_segundos', '300'),
  ('marketing', 'tope_mensajes_dia',       '80'),
  ('marketing', 'tope_sesiones_dia',       '20'),
  ('marketing', 'max_intentos',            '3'),
  ('marketing', 'adjunto_max_bytes',       '10485760')
ON CONFLICT (producto, clave) DO NOTHING;

-- ── Conversación ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat.sesion (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  producto     text        NOT NULL REFERENCES chat.producto(clave),
  tipo         text        NOT NULL DEFAULT 'libre' CHECK (tipo ~ '^[a-z_]{2,20}'),
  titulo       text        NOT NULL,
  autor        text        NOT NULL,
  autor_nombre text,
  local_id     text,                           -- id que le puso el teléfono sin señal (idempotencia)
  estado       text        NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','archivada')),
  demo         boolean     NOT NULL DEFAULT false,
  datos        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sesion_local_uq UNIQUE (producto, autor, local_id)
);
CREATE INDEX IF NOT EXISTS sesion_producto ON chat.sesion (producto, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat.adjunto (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid        NOT NULL REFERENCES chat.sesion(id),
  sha256        char(64)    NOT NULL CHECK (sha256 !~ '[^0-9a-f]'),
  nombre        text        NOT NULL,
  mime          text        NOT NULL,
  clase         text        NOT NULL CHECK (clase IN ('foto','audio','pdf','otro','ficha')),
  bytes         int         NOT NULL,
  contenido     bytea       NOT NULL,
  duracion_s    int,
  transcripcion text,
  autor         text        NOT NULL,
  escrito_at    timestamptz,
  retener_hasta date,                          -- fotos de gafete: retención (la fija el producto)
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adjunto_sesion_sha_uq UNIQUE (sesion_id, sha256)
);

CREATE TABLE IF NOT EXISTS chat.mensaje (
  id          bigserial   PRIMARY KEY,
  sesion_id   uuid        NOT NULL REFERENCES chat.sesion(id),
  rol         text        NOT NULL CHECK (rol IN ('persona','motor','sistema')),
  autor       text        NOT NULL,
  texto       text        NOT NULL DEFAULT '',
  adjuntos    uuid[]      NOT NULL DEFAULT '{}',
  cliente_id  text,
  escrito_at  timestamptz,
  trabajo_id  bigint,
  datos       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mensaje_cliente_uq UNIQUE (sesion_id, cliente_id)
);
CREATE INDEX IF NOT EXISTS mensaje_sesion ON chat.mensaje (sesion_id, id);

CREATE TABLE IF NOT EXISTS chat.trabajo (
  id           bigserial   PRIMARY KEY,
  producto     text        NOT NULL REFERENCES chat.producto(clave),
  sesion_id    uuid        NOT NULL REFERENCES chat.sesion(id),
  tipo         text        NOT NULL CHECK (tipo ~ '^[a-z_]{2,30}'),
  actor        text        NOT NULL,
  mensaje_id   bigint,
  datos        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  estado       text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','tomado','listo','error')),
  intentos     int         NOT NULL DEFAULT 0,
  tomado_por   text,
  sesion_motor text,
  tomado_at    timestamptz,
  lease_hasta  timestamptz,
  listo_at     timestamptz,
  error        text,
  paso         text,
  paso_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trabajo_pend ON chat.trabajo (producto, estado, id);

CREATE TABLE IF NOT EXISTS chat.respuesta (
  id          bigserial   PRIMARY KEY,
  trabajo_id  bigint      NOT NULL UNIQUE REFERENCES chat.trabajo(id),
  sesion_id   uuid        NOT NULL REFERENCES chat.sesion(id),
  motor       text        NOT NULL,
  texto       text        NOT NULL,
  datos       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.latido (
  producto   text NOT NULL REFERENCES chat.producto(clave),
  motor      text NOT NULL CHECK (motor IN ('principal','respaldo')),
  sesion     text,
  estado     text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','pausado','apagado','relevo')),
  atendidos  int  NOT NULL DEFAULT 0,
  errores    int  NOT NULL DEFAULT 0,
  version    text,
  visto_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto, motor)
);

-- Anti-replay de la suite Y del motor (#407 §2.2 punto 3: el camino HMAC del motor ahora lleva nonce).
CREATE TABLE IF NOT EXISTS chat.nonce (
  nonce      text        PRIMARY KEY,
  actor      text        NOT NULL,
  producto   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consumo MEDIDO (consumo.js lee el `usage` de la transcripción). Sin tokens no hay renglón.
CREATE TABLE IF NOT EXISTS chat.consumo (
  trabajo_id    bigint      PRIMARY KEY REFERENCES chat.trabajo(id),
  producto      text        NOT NULL,
  actor         text        NOT NULL,
  tokens        jsonb       NOT NULL,
  por_modelo    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  pasos         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  consultas_web int         NOT NULL DEFAULT 0,
  segundos      numeric,
  modelo        text,
  output_parcial boolean    NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.aviso (
  id           bigserial   PRIMARY KEY,
  producto     text        NOT NULL,
  tipo         text        NOT NULL,
  actor        text,
  texto        text        NOT NULL,
  entregado_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Ayudantes ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION chat.touch() RETURNS trigger
LANGUAGE plpgsql AS $touch$
BEGIN NEW.updated_at := now(); RETURN NEW; END
$touch$;
DROP TRIGGER IF EXISTS sesion_touch ON chat.sesion;
CREATE TRIGGER sesion_touch BEFORE UPDATE ON chat.sesion FOR EACH ROW EXECUTE FUNCTION chat.touch();

CREATE OR REPLACE FUNCTION chat.cfg(p_producto text, p_clave text) RETURNS int
LANGUAGE sql STABLE AS $cfg$
  SELECT valor::int FROM chat.config WHERE producto = p_producto AND clave = p_clave
$cfg$;

-- El día de la suite es el de Monterrey (CST, sin horario de verano desde 2022).
CREATE OR REPLACE FUNCTION chat.hoy() RETURNS date
LANGUAGE sql STABLE AS $hoy$ SELECT (now() AT TIME ZONE 'America/Monterrey')::date $hoy$;

CREATE OR REPLACE FUNCTION chat.err(p_error text, p_mensaje text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $err$
  SELECT jsonb_build_object('ok', false, 'error', p_error) || CASE WHEN p_mensaje IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('mensaje', p_mensaje) END
$err$;

/** Llama <esquema>.<fn>(...) del producto si existe. Sin función: NULL (el núcleo sigue). */
CREATE OR REPLACE FUNCTION chat.ext(p_producto text, p_fn text, p_evento text, p_req jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ext$
DECLARE esq text; r jsonb;
BEGIN
  SELECT esquema INTO esq FROM chat.producto WHERE clave = p_producto AND activo;
  IF esq IS NULL THEN RETURN NULL; END IF;
  IF to_regprocedure(format('%I.%I(%s)', esq, p_fn, CASE WHEN p_evento IS NULL THEN 'jsonb' ELSE 'text,jsonb' END)) IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_evento IS NULL THEN
    EXECUTE format('SELECT %I.%I(%L::jsonb)', esq, p_fn, p_req::text) INTO r;
  ELSE
    EXECUTE format('SELECT %I.%I(%L, %L::jsonb)', esq, p_fn, p_evento, p_req::text) INTO r;
  END IF;
  RETURN r;
END
$ext$;

/** Encola un trabajo del motor. La usan el núcleo y los productos (rebuscar, trabajar una señal…). */
CREATE OR REPLACE FUNCTION chat.encolar(p_sesion uuid, p_tipo text, p_actor text, p_datos jsonb DEFAULT '{}'::jsonb, p_mensaje bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public AS $enc$
DECLARE s chat.sesion; tid bigint;
BEGIN
  SELECT * INTO s FROM chat.sesion WHERE id = p_sesion;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SESION_NO_EXISTE'; END IF;
  -- Ráfaga = UN trabajo (D67 del conceptualizador): si ya hay uno pendiente del mismo tipo, se le suma.
  IF p_tipo = 'mensaje' THEN
    SELECT id INTO tid FROM chat.trabajo WHERE sesion_id = p_sesion AND estado = 'pendiente' AND tipo = 'mensaje' ORDER BY id LIMIT 1;
    IF tid IS NOT NULL THEN RETURN tid; END IF;
  END IF;
  INSERT INTO chat.trabajo (producto, sesion_id, tipo, actor, mensaje_id, datos)
  VALUES (s.producto, p_sesion, p_tipo, p_actor, p_mensaje, coalesce(p_datos, '{}'::jsonb)) RETURNING id INTO tid;
  RETURN tid;
END
$enc$;

CREATE OR REPLACE FUNCTION chat.estado_motor(p_producto text) RETURNS jsonb
LANGUAGE sql STABLE AS $est$
  SELECT jsonb_build_object(
    'vivo', coalesce(l.estado = 'activo' AND l.visto_at > now() - make_interval(secs => chat.cfg(p_producto, 'latido_vivo_segundos')), false),
    'estado', l.estado,
    'visto_hace_s', CASE WHEN l.visto_at IS NULL THEN NULL ELSE round(extract(epoch FROM now() - l.visto_at))::int END,
    'pendientes', (SELECT count(*) FROM chat.trabajo WHERE producto = p_producto AND estado = 'pendiente'),
    'en_proceso', (SELECT count(*) FROM chat.trabajo WHERE producto = p_producto AND estado = 'tomado'))
  FROM (SELECT 1) x LEFT JOIN chat.latido l ON l.producto = p_producto AND l.motor = 'principal'
$est$;

CREATE OR REPLACE FUNCTION chat.adj_meta(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $am$
  SELECT jsonb_build_object('id', a.id, 'nombre', a.nombre, 'mime', a.mime, 'clase', a.clase, 'bytes', a.bytes,
    'sha256', a.sha256, 'duracion_s', a.duracion_s, 'transcripcion', a.transcripcion, 'escrito_at', a.escrito_at)
  FROM chat.adjunto a WHERE a.id = p_id
$am$;

CREATE OR REPLACE FUNCTION chat.hilo(p_sesion uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $hilo$
  SELECT jsonb_build_object(
    'sesion', jsonb_build_object('id', s.id, 'producto', s.producto, 'tipo', s.tipo, 'titulo', s.titulo, 'autor', s.autor,
       'autor_nombre', s.autor_nombre, 'estado', s.estado, 'demo', s.demo, 'datos', s.datos, 'created_at', s.created_at, 'updated_at', s.updated_at),
    'mensajes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'rol', m.rol, 'autor', m.autor, 'texto', m.texto,
        'adjuntos', coalesce((SELECT jsonb_agg(chat.adj_meta(x)) FROM unnest(m.adjuntos) x), '[]'::jsonb),
        'cliente_id', m.cliente_id, 'escrito_at', m.escrito_at, 'trabajo_id', m.trabajo_id, 'datos', m.datos, 'created_at', m.created_at) ORDER BY m.id)
      FROM chat.mensaje m WHERE m.sesion_id = s.id), '[]'::jsonb),
    'trabajo', (SELECT jsonb_build_object('id', t.id, 'tipo', t.tipo, 'estado', t.estado, 'paso', t.paso, 'paso_at', t.paso_at, 'error', t.error)
      FROM chat.trabajo t WHERE t.sesion_id = s.id AND t.estado IN ('pendiente','tomado') ORDER BY t.id DESC LIMIT 1))
  FROM chat.sesion s WHERE s.id = p_sesion
$hilo$;

-- ── API de la suite ────────────────────────────────────────────────────────
-- req: producto, actor, nombre, modo, ts, nonce + campos del modo. El actor SALE DEL TOKEN (n8n).
CREATE OR REPLACE FUNCTION chat.api_suite(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public AS $api$
DECLARE
  prod text := req->>'producto'; modo text := req->>'modo'; actor text := req->>'actor';
  s chat.sesion; g jsonb; r jsonb; v_id uuid; v_mid bigint; v_tid bigint; v_bytes bytea; n int; v_sha text;
BEGIN
  IF prod IS NULL OR NOT EXISTS (SELECT 1 FROM chat.producto WHERE clave = prod AND activo) THEN RETURN chat.err('PRODUCTO_DESCONOCIDO'); END IF;
  IF actor IS NULL OR actor = '' THEN RETURN chat.err('SIN_ACTOR'); END IF;
  IF abs(extract(epoch FROM now()) * 1000 - (req->>'ts')::numeric) > chat.cfg(prod, 'ventana_replay_segundos') * 1000 THEN
    RETURN chat.err('FUERA_DE_VENTANA', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  BEGIN
    INSERT INTO chat.nonce (nonce, actor, producto) VALUES (req->>'nonce', actor, prod);
  EXCEPTION WHEN unique_violation THEN RETURN chat.err('REPETIDA', 'Esta petición ya se había recibido.');
  END;

  -- La sesión del pedido, si la trae: debe ser de ESTE producto.
  IF req ? 'sesion_id' THEN
    BEGIN v_id := (req->>'sesion_id')::uuid; EXCEPTION WHEN others THEN RETURN chat.err('SESION_INVALIDA'); END;
    SELECT * INTO s FROM chat.sesion WHERE id = v_id AND producto = prod;
    IF s.id IS NULL THEN RETURN chat.err('SESION_NO_EXISTE'); END IF;
  END IF;

  IF modo = 'nueva' THEN
    IF req ? 'local_id' THEN
      SELECT * INTO s FROM chat.sesion WHERE producto = prod AND autor = actor AND local_id = req->>'local_id';
      IF s.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'sesion_id', s.id, 'ya_existia', true); END IF;
    END IF;
    SELECT count(*) INTO n FROM chat.sesion WHERE producto = prod AND autor = actor AND (created_at AT TIME ZONE 'America/Monterrey')::date = chat.hoy() AND NOT demo;
    IF n >= chat.cfg(prod, 'tope_sesiones_dia') THEN RETURN chat.err('TOPE_SESIONES', 'Llegaste al tope de sesiones de hoy.'); END IF;
    g := chat.ext(prod, 'gancho', 'nueva', req);
    IF g IS NOT NULL AND (g->>'ok')::boolean IS FALSE THEN RETURN g; END IF;
    INSERT INTO chat.sesion (producto, tipo, titulo, autor, autor_nombre, local_id, demo, datos)
    VALUES (prod, coalesce(nullif(req->>'tipo',''), 'libre'), left(coalesce(nullif(btrim(req->>'titulo'),''), 'Sesión nueva'), 120), actor, req->>'nombre',
            req->>'local_id', coalesce((req->>'demo')::boolean, false), coalesce(req->'datos', '{}'::jsonb))
    RETURNING * INTO s;
    g := chat.ext(prod, 'gancho', 'creada', req || jsonb_build_object('sesion_id', s.id));
    RETURN jsonb_build_object('ok', true, 'sesion_id', s.id) || coalesce(g - 'ok', '{}'::jsonb);

  ELSIF modo = 'subir' THEN
    IF s.id IS NULL THEN RETURN chat.err('SIN_SESION'); END IF;
    BEGIN v_bytes := decode(req->>'b64', 'base64'); EXCEPTION WHEN others THEN RETURN chat.err('ADJUNTO_ILEGIBLE'); END;
    IF v_bytes IS NULL OR length(v_bytes) = 0 THEN RETURN chat.err('ADJUNTO_VACIO'); END IF;
    IF length(v_bytes) > chat.cfg(prod, 'adjunto_max_bytes') THEN RETURN chat.err('ADJUNTO_GRANDE', 'El archivo pasa de 10 MB.'); END IF;
    v_sha := encode(digest(v_bytes, 'sha256'), 'hex');
    IF v_sha <> lower(coalesce(req->>'sha256','')) THEN RETURN chat.err('SHA_NO_CUADRA', 'El archivo llegó distinto de como salió del teléfono.'); END IF;
    SELECT id INTO v_id FROM chat.adjunto WHERE sesion_id = s.id AND sha256 = v_sha;
    IF v_id IS NULL THEN
      INSERT INTO chat.adjunto (sesion_id, sha256, nombre, mime, clase, bytes, contenido, duracion_s, autor, escrito_at)
      VALUES (s.id, v_sha, left(coalesce(req->>'archivo','archivo'),160), left(coalesce(req->>'mime','application/octet-stream'),100),
              CASE WHEN req->>'clase' IN ('foto','audio','pdf','otro') THEN req->>'clase' ELSE 'otro' END, length(v_bytes), v_bytes,
              nullif(req->>'duracion_s','')::numeric::int, actor,
              CASE WHEN req->>'escrito_at' ~ '^[0-9]{10,15}' THEN to_timestamp((req->>'escrito_at')::numeric / 1000) END)
      RETURNING id INTO v_id;
      g := chat.ext(prod, 'gancho', 'subido', req - 'b64' || jsonb_build_object('sesion_id', s.id, 'adjunto_id', v_id));
    END IF;
    RETURN jsonb_build_object('ok', true, 'adjunto_id', v_id, 'sha256', v_sha);

  ELSIF modo = 'enviar' THEN
    IF s.id IS NULL THEN RETURN chat.err('SIN_SESION'); END IF;
    IF req ? 'cliente_id' THEN
      SELECT id, trabajo_id INTO v_mid, v_tid FROM chat.mensaje WHERE sesion_id = s.id AND cliente_id = req->>'cliente_id';
      IF v_mid IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'mensaje_id', v_mid, 'trabajo_id', v_tid, 'ya_existia', true); END IF;
    END IF;
    SELECT count(*) INTO n FROM chat.mensaje m JOIN chat.sesion x ON x.id = m.sesion_id
      WHERE x.producto = prod AND m.autor = actor AND m.rol = 'persona' AND (m.created_at AT TIME ZONE 'America/Monterrey')::date = chat.hoy() AND NOT x.demo;
    IF n >= chat.cfg(prod, 'tope_mensajes_dia') THEN RETURN chat.err('TOPE_MENSAJES', 'Llegaste al tope de mensajes de hoy. Mañana se reinicia.'); END IF;
    IF coalesce(btrim(req->>'texto'),'') = '' AND jsonb_array_length(coalesce(req->'adjuntos','[]'::jsonb)) = 0 THEN RETURN chat.err('MENSAJE_VACIO'); END IF;
    g := chat.ext(prod, 'gancho', 'enviar', req);
    IF g IS NOT NULL AND (g->>'ok')::boolean IS FALSE THEN RETURN g; END IF;
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, adjuntos, cliente_id, escrito_at)
    VALUES (s.id, 'persona', actor, left(coalesce(req->>'texto',''), 20000),
            coalesce((SELECT array_agg(a.id) FROM chat.adjunto a WHERE a.sesion_id = s.id
                       AND a.id::text IN (SELECT jsonb_array_elements_text(coalesce(req->'adjuntos','[]'::jsonb)))), '{}'),
            req->>'cliente_id', CASE WHEN req->>'escrito_at' ~ '^[0-9]{10,15}' THEN to_timestamp((req->>'escrito_at')::numeric / 1000) ELSE now() END)
    RETURNING id INTO v_mid;
    v_tid := chat.encolar(s.id, 'mensaje', actor, '{}'::jsonb, v_mid);
    UPDATE chat.mensaje SET trabajo_id = v_tid WHERE id = v_mid;
    UPDATE chat.sesion SET updated_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('ok', true, 'mensaje_id', v_mid, 'trabajo_id', v_tid);

  ELSIF modo = 'hilo' THEN
    IF s.id IS NULL THEN RETURN chat.err('SIN_SESION'); END IF;
    r := chat.hilo(s.id);
    g := chat.ext(prod, 'gancho', 'hilo', req || jsonb_build_object('sesion_id', s.id));
    RETURN jsonb_build_object('ok', true, 'hilo', r || coalesce(g - 'ok', '{}'::jsonb), 'motor', chat.estado_motor(prod));

  ELSIF modo = 'sesiones' THEN
    RETURN jsonb_build_object('ok', true, 'motor', chat.estado_motor(prod), 'sesiones', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'updated_at') DESC) FROM (
        SELECT jsonb_build_object('id', s2.id, 'tipo', s2.tipo, 'titulo', s2.titulo, 'autor', s2.autor, 'autor_nombre', s2.autor_nombre,
          'estado', s2.estado, 'demo', s2.demo, 'datos', s2.datos, 'created_at', s2.created_at, 'updated_at', s2.updated_at,
          'ultimo', (SELECT jsonb_build_object('rol', m.rol, 'texto', left(m.texto, 140), 'at', m.created_at) FROM chat.mensaje m WHERE m.sesion_id = s2.id ORDER BY m.id DESC LIMIT 1),
          'trabajo', (SELECT jsonb_build_object('estado', t.estado, 'paso', t.paso) FROM chat.trabajo t WHERE t.sesion_id = s2.id AND t.estado IN ('pendiente','tomado') ORDER BY t.id DESC LIMIT 1)) AS x
        FROM chat.sesion s2
        WHERE s2.producto = prod AND (s2.estado = 'abierta' OR coalesce((req->>'archivadas')::boolean, false))
          AND (req->>'tipo' IS NULL OR s2.tipo = req->>'tipo')
        ORDER BY s2.updated_at DESC LIMIT 200) q), '[]'::jsonb));

  ELSIF modo = 'ver_adjunto' THEN
    RETURN coalesce((SELECT jsonb_build_object('ok', true, 'adjunto', chat.adj_meta(a.id) || jsonb_build_object('b64', encode(a.contenido, 'base64')))
            FROM chat.adjunto a JOIN chat.sesion x ON x.id = a.sesion_id WHERE a.id = (req->>'adjunto_id')::uuid AND x.producto = prod), chat.err('ADJUNTO_NO_EXISTE'));

  ELSIF modo IN ('archivar','desarchivar','renombrar') THEN
    IF s.id IS NULL THEN RETURN chat.err('SIN_SESION'); END IF;
    IF s.autor <> actor THEN RETURN chat.err('NO_ES_TUYA', 'Solo quien abrió la sesión puede cambiarla.'); END IF;
    IF modo = 'renombrar' THEN
      IF coalesce(btrim(req->>'texto'),'') = '' THEN RETURN chat.err('NOMBRE_VACIO'); END IF;
      UPDATE chat.sesion SET titulo = left(btrim(req->>'texto'), 120) WHERE id = s.id;
    ELSE
      UPDATE chat.sesion SET estado = CASE WHEN modo = 'archivar' THEN 'archivada' ELSE 'abierta' END WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF modo = 'estado' THEN
    g := chat.ext(prod, 'gancho', 'estado', req);
    RETURN jsonb_build_object('ok', true, 'motor', chat.estado_motor(prod)) || coalesce(g - 'ok', '{}'::jsonb);

  ELSE
    r := chat.ext(prod, 'api_suite_ext', NULL, req || CASE WHEN s.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('sesion_id', s.id) END);
    IF r IS NULL THEN RETURN chat.err('MODO_DESCONOCIDO'); END IF;
    RETURN r;
  END IF;
EXCEPTION WHEN invalid_text_representation THEN RETURN chat.err('ID_INVALIDO');
END
$api$;

-- ── API del motor ──────────────────────────────────────────────────────────
-- req: producto, motor, sesion (de la sesión motor), modo + campos. El nonce lo verifica n8n
-- llamando aquí con modo y nonce: se registra igual que el de la suite.
CREATE OR REPLACE FUNCTION chat.api_motor(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public AS $mot$
DECLARE
  prod text := req->>'producto'; modo text := req->>'modo'; mtr text := coalesce(req->>'motor','principal');
  t chat.trabajo; r jsonb; v_mid bigint; lst jsonb; n int;
BEGIN
  IF prod IS NULL OR NOT EXISTS (SELECT 1 FROM chat.producto WHERE clave = prod AND activo) THEN RETURN chat.err('PRODUCTO_DESCONOCIDO'); END IF;
  IF req ? 'nonce' THEN
    BEGIN INSERT INTO chat.nonce (nonce, actor, producto) VALUES (req->>'nonce', 'motor:' || mtr, prod);
    EXCEPTION WHEN unique_violation THEN RETURN chat.err('REPETIDA'); END;
  END IF;
  IF req ? 'trabajo_id' THEN
    SELECT * INTO t FROM chat.trabajo WHERE id = (req->>'trabajo_id')::bigint AND producto = prod;
    IF t.id IS NULL THEN RETURN chat.err('TRABAJO_NO_EXISTE'); END IF;
  END IF;

  IF modo = 'latido' THEN
    INSERT INTO chat.latido (producto, motor, sesion, estado, atendidos, errores, version, visto_at)
    VALUES (prod, mtr, req->>'sesion', coalesce(req->>'estado','activo'), coalesce((req->>'atendidos')::int,0), coalesce((req->>'errores')::int,0), req->>'version', now())
    ON CONFLICT (producto, motor) DO UPDATE SET sesion = EXCLUDED.sesion, estado = EXCLUDED.estado, atendidos = EXCLUDED.atendidos,
      errores = EXCLUDED.errores, version = EXCLUDED.version, visto_at = now();
    RETURN jsonb_build_object('ok', true, 'motor', chat.estado_motor(prod));

  ELSIF modo = 'siguiente' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('trabajo_id', x.id, 'tipo', x.tipo, 'sesion_id', x.sesion_id) ORDER BY x.id), '[]'::jsonb) INTO lst
    FROM (SELECT DISTINCT ON (t2.sesion_id) t2.id, t2.tipo, t2.sesion_id FROM chat.trabajo t2
          WHERE t2.producto = prod AND (t2.estado = 'pendiente' OR (t2.estado = 'tomado' AND t2.lease_hasta < now()))
            AND NOT EXISTS (SELECT 1 FROM chat.trabajo o WHERE o.sesion_id = t2.sesion_id AND o.id <> t2.id AND o.estado = 'tomado' AND o.lease_hasta >= now())
          ORDER BY t2.sesion_id, t2.id LIMIT 50) x;
    lst := (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM (SELECT e FROM jsonb_array_elements(lst) e ORDER BY (e->>'trabajo_id')::bigint LIMIT greatest(1, least(5, coalesce((req->>'max')::int, 1)))) q);
    RETURN jsonb_build_object('ok', true, 'trabajos', lst);

  ELSIF modo = 'tomar' THEN
    UPDATE chat.trabajo SET estado = 'tomado', intentos = intentos + 1, tomado_por = mtr, sesion_motor = req->>'sesion', tomado_at = now(),
      lease_hasta = now() + make_interval(secs => chat.cfg(prod, 'lease_segundos')), paso = 'leyendo la conversación', paso_at = now()
    WHERE id = t.id AND (estado = 'pendiente' OR (estado = 'tomado' AND lease_hasta < now()))
      AND NOT EXISTS (SELECT 1 FROM chat.trabajo o WHERE o.sesion_id = t.sesion_id AND o.id <> t.id AND o.estado = 'tomado' AND o.lease_hasta >= now())
    RETURNING * INTO t;
    IF t.id IS NULL THEN RETURN chat.err('YA_TOMADO'); END IF;
    r := chat.ext(prod, 'gancho', 'tomar', jsonb_build_object('sesion_id', t.sesion_id, 'trabajo_id', t.id));
    RETURN jsonb_build_object('ok', true, 'trabajo', to_jsonb(t), 'hilo', chat.hilo(t.sesion_id) || coalesce(r - 'ok', '{}'::jsonb));

  ELSIF modo = 'adjunto' THEN
    RETURN coalesce((SELECT jsonb_build_object('ok', true, 'adjunto', chat.adj_meta(a.id) || jsonb_build_object('b64', encode(a.contenido, 'base64')))
            FROM chat.adjunto a JOIN chat.sesion x ON x.id = a.sesion_id WHERE a.id = (req->>'adjunto_id')::uuid AND x.producto = prod), chat.err('ADJUNTO_NO_EXISTE'));

  ELSIF modo = 'transcripcion' THEN
    UPDATE chat.adjunto a SET transcripcion = left(req->>'texto', 50000) FROM chat.sesion x
      WHERE a.id = (req->>'adjunto_id')::uuid AND x.id = a.sesion_id AND x.producto = prod;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN jsonb_build_object('ok', n = 1);

  ELSIF modo = 'avance' THEN
    UPDATE chat.trabajo SET paso = left(req->>'paso', 80), paso_at = now() WHERE id = t.id AND estado = 'tomado';
    RETURN jsonb_build_object('ok', true);

  ELSIF modo = 'entregar' THEN
    IF t.estado <> 'tomado' THEN RETURN chat.err('NO_ESTA_TOMADO'); END IF;
    IF coalesce(btrim(req->'respuesta'->>'texto'),'') = '' THEN RETURN chat.err('RESPUESTA_VACIA'); END IF;
    INSERT INTO chat.respuesta (trabajo_id, sesion_id, motor, texto, datos)
    VALUES (t.id, t.sesion_id, mtr, req->'respuesta'->>'texto', coalesce(req->'respuesta'->'datos', '{}'::jsonb));
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, trabajo_id, datos)
    VALUES (t.sesion_id, 'motor', 'motor:' || mtr, req->'respuesta'->>'texto', t.id, coalesce(req->'respuesta'->'datos', '{}'::jsonb)) RETURNING id INTO v_mid;
    UPDATE chat.trabajo SET estado = 'listo', listo_at = now(), paso = NULL WHERE id = t.id;
    UPDATE chat.sesion SET updated_at = now() WHERE id = t.sesion_id;
    r := chat.ext(prod, 'gancho', 'entregado', jsonb_build_object('sesion_id', t.sesion_id, 'trabajo_id', t.id, 'respuesta', req->'respuesta'));
    RETURN jsonb_build_object('ok', true, 'mensaje_id', v_mid) || coalesce(r - 'ok', '{}'::jsonb);

  ELSIF modo = 'error' THEN
    IF t.intentos >= chat.cfg(prod, 'max_intentos') THEN
      UPDATE chat.trabajo SET estado = 'error', error = left(req->>'causa', 500), paso = NULL WHERE id = t.id;
      INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, trabajo_id)
      VALUES (t.sesion_id, 'sistema', 'sistema', 'No se pudo terminar este paso después de ' || t.intentos || ' intentos. Vuelve a escribir o avisa a Esteban.', t.id);
    ELSE
      UPDATE chat.trabajo SET estado = 'pendiente', error = left(req->>'causa', 500), lease_hasta = NULL, paso = NULL WHERE id = t.id;
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF modo = 'consumo' THEN
    IF coalesce((req->'consumo'->'tokens'->>'input')::bigint,0) + coalesce((req->'consumo'->'tokens'->>'output')::bigint,0)
       + coalesce((req->'consumo'->'tokens'->>'cache_leida')::bigint,0) + coalesce((req->'consumo'->'tokens'->>'cache_escrita')::bigint,0) = 0 THEN
      RETURN chat.err('SIN_TOKENS', 'Sin tokens medidos no se registra nada: no se estima.');
    END IF;
    INSERT INTO chat.consumo (trabajo_id, producto, actor, tokens, por_modelo, pasos, consultas_web, segundos, modelo, output_parcial)
    VALUES (t.id, prod, t.actor, req->'consumo'->'tokens', coalesce(req->'consumo'->'por_modelo','{}'::jsonb), coalesce(req->'consumo'->'pasos','{}'::jsonb),
            coalesce((req->'consumo'->'pasos'->>'web')::int, 0), (req->'consumo'->>'segundos')::numeric, req->'consumo'->>'modelo',
            coalesce((req->'consumo'->>'output_parcial')::boolean, false))
    ON CONFLICT (trabajo_id) DO UPDATE SET tokens = EXCLUDED.tokens, por_modelo = EXCLUDED.por_modelo, pasos = EXCLUDED.pasos,
      consultas_web = EXCLUDED.consultas_web, segundos = EXCLUDED.segundos, modelo = EXCLUDED.modelo, output_parcial = EXCLUDED.output_parcial, updated_at = now();
    RETURN jsonb_build_object('ok', true);

  ELSIF modo = 'avisos' THEN
    RETURN jsonb_build_object('ok', true, 'avisos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'actor', actor, 'texto', texto) ORDER BY id)
      FROM chat.aviso WHERE producto = prod AND entregado_at IS NULL), '[]'::jsonb));

  ELSIF modo = 'aviso_entregado' THEN
    UPDATE chat.aviso SET entregado_at = now() WHERE id = (req->>'aviso_id')::bigint AND producto = prod;
    RETURN jsonb_build_object('ok', true);

  ELSE
    r := chat.ext(prod, 'api_motor_ext', NULL, req || CASE WHEN t.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('sesion_id', t.sesion_id, 'actor', t.actor) END);
    IF r IS NULL THEN RETURN chat.err('MODO_DESCONOCIDO'); END IF;
    RETURN r;
  END IF;
END
$mot$;

-- Retención (fotos de gafete y tarjeta del lead rápido): vacía el CONTENIDO vencido y deja la
-- huella sha256, el nombre y el tamaño original en `datos` para poder deduplicar después. Sin DELETE.
-- No corre sola: el cron espera al Worker de n8n (M9). Se llama a mano o desde el motor.
ALTER TABLE chat.adjunto ADD COLUMN IF NOT EXISTS purgado_at timestamptz;
CREATE OR REPLACE FUNCTION chat.purgar_vencidos() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public AS $pur$
DECLARE n int;
BEGIN
  UPDATE chat.adjunto SET contenido = ''::bytea, purgado_at = now()
   WHERE retener_hasta IS NOT NULL AND retener_hasta < chat.hoy() AND purgado_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'purgados', n);
END
$pur$;

-- ── Dueños y permisos ──────────────────────────────────────────────────────
-- chat_app es dueño de sus tablas (sin DELETE para nadie más) y las API corren como chat_app.
DO $duenos$
DECLARE x record;
BEGIN
  FOR x IN SELECT tablename FROM pg_tables WHERE schemaname = 'chat' LOOP
    EXECUTE format('ALTER TABLE chat.%I OWNER TO chat_app', x.tablename);
  END LOOP;
  FOR x IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'chat' LOOP
    EXECUTE format('ALTER SEQUENCE chat.%I OWNER TO chat_app', x.sequencename);
  END LOOP;
  FOR x IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'chat' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO chat_app', x.f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', x.f);
  END LOOP;
END
$duenos$;
-- Solo quien aplica la migración (la credencial de n8n) llama las API; corren como chat_app.
GRANT EXECUTE ON FUNCTION chat.api_suite(jsonb), chat.api_motor(jsonb), chat.purgar_vencidos() TO CURRENT_USER;
-- Los productos encolan trabajos y leen sus sesiones desde sus propias funciones.
GRANT EXECUTE ON FUNCTION chat.encolar(uuid, text, text, jsonb, bigint), chat.cfg(text, text), chat.hoy(), chat.err(text, text) TO PUBLIC;
