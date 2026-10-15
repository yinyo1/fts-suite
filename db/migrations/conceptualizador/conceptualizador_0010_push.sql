-- ═══════════════════════════════════════════════════════════════════════════
-- 010_conceptualizador.sql · notificaciones push (V1.41, punto 12 de #4) y el
-- recordatorio de levantamientos sin cotizar (DISENO-V135 §1, aprobado).
--
-- Qué guarda:
--   · push_suscripcion  una por navegador (persona y dispositivo): el endpoint y las
--              llaves que da el navegador (no son del teléfono: sin modelo, sin número,
--              sin ubicación) y su zona horaria IANA. Un 404/410 del servicio la da de baja.
--   · push_presencia / push_visto  cuándo pidió la pantalla `casos` u `hilo` por última
--              vez (solo lo hace con la pestaña a la vista, cada 20 s): así se sabe si la
--              persona ESTÁ en la app y si ya vio el caso. Lo escribe el envoltorio de
--              api_suite, sin cambiar la pantalla vieja.
--   · push_envio  la bitácora y la cola: una fila por aviso, con idempotencia por
--              (caso, tipo, clave). Para la oferta la clave es el trabajo que la hizo:
--              la misma oferta NUNCA se avisa dos veces. Para el recordatorio, r1..r3.
--   · push_ajuste (recordatorios y avisos por persona), permiso_estado (lo que dice cada
--              teléfono: activo/negado/pendiente), y en `caso`: push_n (avisos que
--              llegaron, tope 3 por sesión), recordatorios, recordar_en, sin_recordar.
--
-- Qué decide (todo en la base; el workflow conceptualizador/push solo pregunta y firma):
--   · api_push('pendientes')  lo que toca mandar AHORA. Respeta las horas de silencio
--              21:00–7:00 en la zona de CADA persona (con la zona IANA, así el cambio de
--              horario lo resuelve Postgres): lo que cae en silencio no se manda ni cuenta,
--              y sale en la primera vuelta después de las 7:00 de esa zona si sigue vigente.
--              Tope de 3 avisos por sesión (oferta y recordatorios juntos). Nada si la
--              persona está en la app (pidió `casos`/`hilo` hace menos de 90 s) o si ya
--              abrió el caso después de la oferta.
--   · api_push('resultado')   lo que contestó el servicio de push por suscripción:
--              2xx = llegó (cuenta), 404/410 = baja, lo demás = reintento (hasta 3).
--   · api_suite: modos push_estado, push_alta, push_baja, permisos, recordar,
--              push_ajustes y equipo_avisos (solo admins). La función de antes se renombra
--              a api_suite_0010prev y la nueva delega todo lo demás (patrón de la 0006–0009).
--
-- ORDEN: el runner exige 0008 y 0009 antes (FUERA_DE_ORDEN). La SQL no depende de ellas:
-- también entra sobre 001–007 y deja que la 0009 y la 0008 se apliquen encima (las tres
-- secuencias se prueban en pruebas/sql-0010.sh).
--
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre, sin llaves
-- dobles, sin dólar seguido de dígito, comilla, & o acento grave (por eso ningún
-- patrón lleva ancla de fin: se usan clases negadas).
-- ═══════════════════════════════════════════════════════════════════════════

DO $ren10$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0010prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0010prev;
  END IF;
END
$ren10$;

-- ── Tablas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.push_suscripcion (
  id              bigserial   PRIMARY KEY,
  actor           text        NOT NULL,
  endpoint        text        NOT NULL UNIQUE,
  p256dh          text        NOT NULL,
  auth            text        NOT NULL,
  plataforma      text        NOT NULL DEFAULT 'escritorio' CHECK (plataforma IN ('android','ios','escritorio')),
  en_inicio       boolean     NOT NULL DEFAULT false,
  zona            text,
  creada_at       timestamptz NOT NULL DEFAULT now(),
  actualizada_at  timestamptz NOT NULL DEFAULT now(),
  ultima_ok_at    timestamptz,
  ultimo_error    text,
  errores         int         NOT NULL DEFAULT 0,
  baja_at         timestamptz,
  baja_motivo     text        CHECK (baja_motivo IS NULL OR baja_motivo IN ('persona','404','410','errores','otra_persona')),
  -- p256dh = 65 bytes y auth = 16 bytes en base64url sin relleno.
  CONSTRAINT push_sus_forma CHECK (char_length(endpoint) BETWEEN 20 AND 1000 AND endpoint !~ '[[:space:]]'
    AND char_length(p256dh) = 87 AND p256dh !~ '[^A-Za-z0-9_-]' AND char_length(auth) = 22 AND auth !~ '[^A-Za-z0-9_-]')
);
CREATE INDEX IF NOT EXISTS push_sus_actor ON conceptualizador.push_suscripcion (actor) WHERE baja_at IS NULL;

CREATE TABLE IF NOT EXISTS conceptualizador.push_presencia (
  actor     text        PRIMARY KEY,
  visto_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conceptualizador.push_visto (
  actor     text        NOT NULL,
  caso_id   uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  visto_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor, caso_id)
);

CREATE TABLE IF NOT EXISTS conceptualizador.push_envio (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  actor       text        NOT NULL,
  tipo        text        NOT NULL CHECK (tipo IN ('oferta','recordatorio')),
  clave       text        NOT NULL,
  estado      text        NOT NULL DEFAULT 'enviando' CHECK (estado IN ('enviando','enviada','fallida','sin_destino')),
  intentos    int         NOT NULL DEFAULT 1,
  titulo      text,
  cuerpo      text,
  resultados  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tomado_at   timestamptz NOT NULL DEFAULT now(),
  enviada_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_envio_unico UNIQUE (caso_id, tipo, clave)
);

CREATE TABLE IF NOT EXISTS conceptualizador.push_ajuste (
  actor          text        PRIMARY KEY,
  recordatorios  boolean     NOT NULL DEFAULT true,
  avisos         boolean     NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conceptualizador.permiso_estado (
  actor          text        PRIMARY KEY,
  notif          text        NOT NULL DEFAULT 'pendiente' CHECK (notif IN ('activo','negado','pendiente')),
  mic            text        NOT NULL DEFAULT 'pendiente' CHECK (mic   IN ('activo','negado','pendiente')),
  cam            text        NOT NULL DEFAULT 'pendiente' CHECK (cam   IN ('activo','negado','pendiente')),
  ubi            text        NOT NULL DEFAULT 'pendiente' CHECK (ubi   IN ('activo','negado','pendiente')),
  plataforma     text        CHECK (plataforma IS NULL OR plataforma IN ('android','ios','escritorio')),
  en_inicio      boolean,
  no_molestar_at timestamptz,   -- su «Listo, ya lo hice» de la guía de No molestar (no se puede comprobar)
  visto_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conceptualizador.caso
  ADD COLUMN IF NOT EXISTS push_n         int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recordatorios  int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recordar_en    timestamptz,
  ADD COLUMN IF NOT EXISTS sin_recordar   boolean     NOT NULL DEFAULT false;

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('push_tope_caso',          '3'),    -- avisos que LLEGAN por sesión, oferta y recordatorios juntos
  ('push_ausente_segundos',   '90'),   -- sin pedir casos/hilo en 90 s = no está en la app (la pantalla pide cada 20 s)
  ('push_silencio_desde',     '21'),   -- 21:00 en la zona de la persona
  ('push_silencio_hasta',     '7'),    -- 7:00
  ('push_oferta_horas',       '48'),   -- una oferta de hace más de 48 h ya no se avisa (al encender no llueven viejas)
  ('push_reintento_minutos',  '10'),
  ('push_intentos_max',       '3'),
  ('recordar_min',            '30'),   -- DISENO-V135 §1a
  ('recordar_tope',           '3'),
  ('recordar_cada_min',       '120'),  -- entre un recordatorio y el siguiente, si nadie eligió «Recuérdame en…»
  ('recordar_dias',           '7'),    -- sesiones con actividad en los últimos 7 días (al encender no se recuerdan las viejas)
  ('push_permitir_local',     '0')     -- solo pruebas: acepta http://127.0.0.1 como servicio de push
ON CONFLICT (clave) DO NOTHING;

-- ── Apoyo ──────────────────────────────────────────────────────────────────
-- Una zona IANA que Postgres conozca («America/Monterrey»), o NULL. Nunca truena.
CREATE OR REPLACE FUNCTION conceptualizador.zona_valida(p text) RETURNS text
LANGUAGE plpgsql STABLE AS $zv10$
BEGIN
  IF p IS NULL OR char_length(p) NOT BETWEEN 3 AND 64 OR p ~ '[^A-Za-z0-9_/+-]' OR p !~ '^[A-Z][A-Za-z]+/' THEN RETURN NULL; END IF;
  PERFORM now() AT TIME ZONE p;
  RETURN p;
EXCEPTION WHEN others THEN RETURN NULL;
END
$zv10$;

-- La zona de la persona: la de su suscripción más reciente; si no hay, por el país del caso.
-- Nunca la del servidor (Railway corre en UTC).
CREATE OR REPLACE FUNCTION conceptualizador.zona_de(p_actor text, p_pais text) RETURNS text
LANGUAGE sql STABLE AS $zd10$
  SELECT coalesce((SELECT s.zona FROM conceptualizador.push_suscripcion s
                    WHERE s.actor = p_actor AND s.baja_at IS NULL AND s.zona IS NOT NULL
                    ORDER BY s.actualizada_at DESC, s.id DESC LIMIT 1),
                  CASE WHEN p_pais = 'usa' THEN 'America/Los_Angeles' ELSE 'America/Monterrey' END)
$zd10$;

CREATE OR REPLACE FUNCTION conceptualizador.en_silencio(p_zona text, p_ahora timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $sil10$
  SELECT extract(hour FROM p_ahora AT TIME ZONE p_zona) >= conceptualizador.cfg('push_silencio_desde')
      OR extract(hour FROM p_ahora AT TIME ZONE p_zona) <  conceptualizador.cfg('push_silencio_hasta')
$sil10$;

-- Cuándo sale lo que cae en silencio: las 7:00 de esa zona (de hoy si ya pasó la medianoche, si no de mañana).
CREATE OR REPLACE FUNCTION conceptualizador.sale_a(p_zona text, p_ahora timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE AS $sa10$
  SELECT CASE WHEN NOT conceptualizador.en_silencio(p_zona, p_ahora) THEN p_ahora
    ELSE ((p_ahora AT TIME ZONE p_zona)::date
          + CASE WHEN extract(hour FROM p_ahora AT TIME ZONE p_zona) >= conceptualizador.cfg('push_silencio_hasta') THEN 1 ELSE 0 END
          + make_time(conceptualizador.cfg('push_silencio_hasta'), 0, 0)) AT TIME ZONE p_zona END
$sa10$;

-- Solo servicios de push conocidos (el workflow le hace POST: nada de mandar a una dirección cualquiera).
CREATE OR REPLACE FUNCTION conceptualizador.push_endpoint_ok(p text) RETURNS boolean
LANGUAGE sql STABLE AS $pe10$
  SELECT p IS NOT NULL AND char_length(p) BETWEEN 20 AND 1000 AND p !~ '[[:space:]]' AND (
       p ~ '^https://fcm[.]googleapis[.]com/'
    OR p ~ '^https://updates[.]push[.]services[.]mozilla[.]com/'
    OR p ~ '^https://web[.]push[.]apple[.]com/'
    OR p ~ '^https://[a-z0-9-]+[.]notify[.]windows[.]com/'
    OR (conceptualizador.cfg('push_permitir_local') = 1 AND p ~ '^http://127[.]0[.]0[.]1:[0-9]+/'))
$pe10$;

-- ¿La persona está en la app? (pidió casos o hilo hace menos de push_ausente_segundos)
CREATE OR REPLACE FUNCTION conceptualizador.esta_en_app(p_actor text, p_ahora timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $ea10$
  SELECT EXISTS (SELECT 1 FROM conceptualizador.push_presencia pp WHERE pp.actor = p_actor
                  AND pp.visto_at > p_ahora - make_interval(secs => conceptualizador.cfg('push_ausente_segundos')))
$ea10$;

-- La oferta vigente del caso: la de la última respuesta que trae `verifica.oferta` (procesa.js la manda en cada una).
CREATE OR REPLACE FUNCTION conceptualizador.oferta_de(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $of10$
  SELECT jsonb_build_object('oferta', r.verifica->'oferta', 'respuesta_id', r.id, 'at', r.created_at)
    FROM conceptualizador.respuesta r
   WHERE r.caso_id = p_caso AND jsonb_typeof(r.verifica->'oferta') = 'object'
   ORDER BY r.id DESC LIMIT 1
$of10$;

-- ── Lo que toca mandar ─────────────────────────────────────────────────────
-- Una fila por aviso posible AHORA, con `silencio` y `sale_at`. No escribe nada.
CREATE OR REPLACE FUNCTION conceptualizador.push_candidatos(p_ahora timestamptz)
RETURNS TABLE (caso_id uuid, actor text, tipo text, clave text, zona text, silencio boolean, sale_at timestamptz)
LANGUAGE sql STABLE AS $pc10$
  WITH base AS (
    SELECT c.*, conceptualizador.zona_de(c.autor, c.pais) AS z
      FROM conceptualizador.caso c
     WHERE c.estado = 'abierto' AND c.archivado_at IS NULL AND c.disparado_at IS NULL
       AND c.push_n < conceptualizador.cfg('push_tope_caso')
       AND NOT conceptualizador.esta_en_app(c.autor, p_ahora)
       AND EXISTS (SELECT 1 FROM conceptualizador.push_suscripcion s WHERE s.actor = c.autor AND s.baja_at IS NULL)
  ), oferta AS (
    SELECT b.id AS caso_id, b.autor AS actor, 'oferta'::text AS tipo, (o.x->'oferta'->>'trabajo_id') AS clave, b.z AS zona
      FROM base b
      CROSS JOIN LATERAL (SELECT conceptualizador.oferta_de(b.id) AS x) o
     WHERE o.x IS NOT NULL AND o.x->'oferta'->>'estado' = 'ofrecida'
       AND (o.x->'oferta'->>'trabajo_id') ~ '^[0-9]' AND (o.x->'oferta'->>'trabajo_id') !~ '[^0-9]'
       AND (o.x->>'at')::timestamptz > p_ahora - make_interval(hours => conceptualizador.cfg('push_oferta_horas'))
       -- nadie contestó después de la oferta, y la persona no ha abierto el caso desde entonces
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.caso_id = b.id AND m.rol = 'usuario'
                        AND m.created_at > (o.x->>'at')::timestamptz)
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.push_visto v WHERE v.actor = b.autor AND v.caso_id = b.id
                        AND v.visto_at >= (o.x->>'at')::timestamptz)
       AND coalesce((SELECT a.avisos FROM conceptualizador.push_ajuste a WHERE a.actor = b.autor), true)
  ), recordatorio AS (
    SELECT b.id, b.autor, 'recordatorio'::text, 'r' || (b.recordatorios + 1), b.z
      FROM base b
     WHERE NOT b.demo AND NOT b.sin_recordar
       AND b.recordatorios < conceptualizador.cfg('recordar_tope')
       AND (b.recordar_en IS NULL OR b.recordar_en <= p_ahora)
       AND EXISTS (SELECT 1 FROM conceptualizador.adjunto a WHERE a.caso_id = b.id AND a.clase IN ('foto','audio','pdf'))
       AND (SELECT max(m.created_at) FROM conceptualizador.mensaje m WHERE m.caso_id = b.id)
             BETWEEN p_ahora - make_interval(days => conceptualizador.cfg('recordar_dias'))
                 AND p_ahora - make_interval(mins => conceptualizador.cfg('recordar_min'))
       -- con una oferta sin contestar, el aviso es la oferta, no el recordatorio
       AND coalesce(conceptualizador.oferta_de(b.id)->'oferta'->>'estado', '') <> 'ofrecida'
       AND coalesce((SELECT a.recordatorios FROM conceptualizador.push_ajuste a WHERE a.actor = b.autor), true)
  ), todos AS (SELECT * FROM oferta UNION ALL SELECT * FROM recordatorio)
  SELECT t.caso_id, t.actor, t.tipo, t.clave, t.zona,
         conceptualizador.en_silencio(t.zona, p_ahora), conceptualizador.sale_a(t.zona, p_ahora)
    FROM todos t
   WHERE NOT EXISTS (
     SELECT 1 FROM conceptualizador.push_envio e
      WHERE e.caso_id = t.caso_id AND e.tipo = t.tipo AND e.clave = t.clave
        -- se reintenta lo fallido (hasta push_intentos_max) y lo que se quedó «enviando» por una caída
        AND NOT (e.estado = 'fallida' AND e.intentos < conceptualizador.cfg('push_intentos_max')
                 AND e.tomado_at < p_ahora - make_interval(mins => conceptualizador.cfg('push_reintento_minutos')))
        AND NOT (e.estado = 'enviando' AND e.tomado_at < p_ahora - interval '15 minutes'))
$pc10$;

-- ── API del workflow conceptualizador/push ─────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_push(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ap10$
DECLARE
  v_modo   text := p->>'modo';
  v_ahora  timestamptz := coalesce(nullif(p->>'ahora','')::timestamptz, now());
  v_dry    boolean := coalesce((p->>'dry_run')::boolean, true);
  v_out    jsonb := '[]'::jsonb;
  v_apl    jsonb := '[]'::jsonb;
  v_id     bigint;
  v_e      conceptualizador.push_envio%ROWTYPE;
  v_c      conceptualizador.caso%ROWTYPE;
  v_ok     int := 0;
  v_bajas  int := 0;
  v_tot    int := 0;
  v_st     int;
  x        record;
  r        jsonb;
BEGIN
  IF v_modo = 'pendientes' THEN
    FOR x IN SELECT * FROM conceptualizador.push_candidatos(v_ahora) ORDER BY 1, 3 LOOP
      IF x.silencio THEN
        v_apl := v_apl || jsonb_build_object('caso_id', x.caso_id, 'actor', x.actor, 'tipo', x.tipo, 'clave', x.clave,
                                             'zona', x.zona, 'sale_at', x.sale_at);
        CONTINUE;
      END IF;
      v_id := NULL;
      IF NOT v_dry THEN
        INSERT INTO conceptualizador.push_envio (caso_id, actor, tipo, clave, tomado_at)
          VALUES (x.caso_id, x.actor, x.tipo, x.clave, v_ahora)
        ON CONFLICT (caso_id, tipo, clave) DO UPDATE SET estado = 'enviando', intentos = conceptualizador.push_envio.intentos + 1,
          tomado_at = excluded.tomado_at
          WHERE conceptualizador.push_envio.estado IN ('fallida','enviando')
        RETURNING id INTO v_id;
        IF v_id IS NULL THEN CONTINUE; END IF;   -- otra corrida la tomó
      END IF;
      SELECT * INTO v_c FROM conceptualizador.caso WHERE id = x.caso_id;
      v_out := v_out || jsonb_build_object(
        'envio_id', v_id, 'tipo', x.tipo, 'clave', x.clave, 'caso_id', x.caso_id, 'actor', x.actor, 'zona', x.zona,
        'titulo', v_c.titulo, 'cliente', v_c.cliente, 'ciudad', v_c.proyecto_ciudad, 'autor_nombre', v_c.autor_nombre,
        'apodo', CASE WHEN x.tipo = 'oferta' THEN conceptualizador.oferta_de(x.caso_id)->'oferta'->>'apodo' END,
        'recordatorio_n', CASE WHEN x.tipo = 'recordatorio' THEN v_c.recordatorios + 1 END,
        'recordar_tope', conceptualizador.cfg('recordar_tope'),
        'fotos',  (SELECT count(*) FROM conceptualizador.adjunto a WHERE a.caso_id = x.caso_id AND a.clase = 'foto'),
        'audios', (SELECT count(*) FROM conceptualizador.adjunto a WHERE a.caso_id = x.caso_id AND a.clase = 'audio'),
        'pdfs',   (SELECT count(*) FROM conceptualizador.adjunto a WHERE a.caso_id = x.caso_id AND a.clase = 'pdf'),
        'suscripciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
                            'plataforma', s.plataforma) ORDER BY s.id), '[]'::jsonb)
                            FROM conceptualizador.push_suscripcion s
                           WHERE s.actor = x.actor AND s.baja_at IS NULL AND conceptualizador.push_endpoint_ok(s.endpoint)));
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'dry_run', v_dry, 'ahora', v_ahora, 'envios', v_out, 'aplazados', v_apl,
      'local', conceptualizador.cfg('push_permitir_local') = 1);

  ELSIF v_modo = 'resultado' THEN
    -- La pública VAPID la deriva el workflow de la privada (es pública): la pantalla la lee de aquí.
    IF char_length(coalesce(p->>'vapid_publica','')) = 87 AND (p->>'vapid_publica') !~ '[^A-Za-z0-9_-]' THEN
      INSERT INTO conceptualizador.config (clave, valor) VALUES ('push_vapid_publica', p->>'vapid_publica')
        ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor;
    END IF;
    IF nullif(p->>'envio_id','') IS NULL THEN RETURN jsonb_build_object('ok', true, 'envio', null); END IF;
    SELECT * INTO v_e FROM conceptualizador.push_envio WHERE id = (p->>'envio_id')::bigint FOR UPDATE;
    IF v_e.id IS NULL OR v_e.estado <> 'enviando' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ENVIO_NO_ESTA_ENVIANDO', 'estado', v_e.estado);
    END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'resultados') = 'array' THEN p->'resultados' ELSE '[]'::jsonb END) LOOP
      v_tot := v_tot + 1;
      v_st := CASE WHEN (r->>'status') ~ '^[0-9]' AND (r->>'status') !~ '[^0-9]' AND char_length(r->>'status') <= 3 THEN (r->>'status')::int ELSE 0 END;
      IF v_st BETWEEN 200 AND 299 THEN
        v_ok := v_ok + 1;
        UPDATE conceptualizador.push_suscripcion SET ultima_ok_at = v_ahora, ultimo_error = NULL, errores = 0
         WHERE id = nullif(r->>'suscripcion_id','')::bigint;
      ELSIF v_st IN (404, 410) THEN
        v_bajas := v_bajas + 1;
        UPDATE conceptualizador.push_suscripcion SET baja_at = v_ahora, baja_motivo = v_st::text, ultimo_error = left(coalesce(r->>'error', v_st::text), 300)
         WHERE id = nullif(r->>'suscripcion_id','')::bigint AND baja_at IS NULL;
      ELSE
        UPDATE conceptualizador.push_suscripcion SET errores = errores + 1, ultimo_error = left(coalesce(r->>'error', 'HTTP ' || v_st), 300),
               baja_at = CASE WHEN errores + 1 >= 10 THEN v_ahora END, baja_motivo = CASE WHEN errores + 1 >= 10 THEN 'errores' END
         WHERE id = nullif(r->>'suscripcion_id','')::bigint;
      END IF;
    END LOOP;
    UPDATE conceptualizador.push_envio SET
      estado = CASE WHEN v_ok > 0 THEN 'enviada' WHEN v_tot > 0 AND v_bajas = v_tot THEN 'sin_destino' ELSE 'fallida' END,
      enviada_at = CASE WHEN v_ok > 0 THEN v_ahora END,
      titulo = left(p->>'titulo', 200), cuerpo = left(p->>'cuerpo', 600),
      resultados = resultados || jsonb_build_array(jsonb_build_object('at', v_ahora, 'r', coalesce(p->'resultados', '[]'::jsonb)))
     WHERE id = v_e.id;
    -- Solo lo que LLEGÓ cuenta para el tope (lo aplazado por silencio o lo fallido, no).
    IF v_ok > 0 THEN
      UPDATE conceptualizador.caso SET push_n = push_n + 1,
             recordatorios = recordatorios + CASE WHEN v_e.tipo = 'recordatorio' THEN 1 ELSE 0 END,
             recordar_en = CASE WHEN v_e.tipo = 'recordatorio' THEN v_ahora + make_interval(mins => conceptualizador.cfg('recordar_cada_min')) ELSE recordar_en END
       WHERE id = v_e.caso_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'envio', v_e.id,
      'estado', (SELECT estado FROM conceptualizador.push_envio WHERE id = v_e.id), 'llegaron', v_ok, 'bajas', v_bajas, 'de', v_tot);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$ap10$;

-- ── Lo que ve Esteban en «Avisos del equipo» ───────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.equipo_avisos() RETURNS jsonb
LANGUAGE sql STABLE AS $eq10$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'actor', a.actor,
    'permisos', (SELECT jsonb_build_object('notif', pe.notif, 'mic', pe.mic, 'cam', pe.cam, 'ubi', pe.ubi, 'plataforma', pe.plataforma,
                   'en_inicio', pe.en_inicio, 'no_molestar_at', pe.no_molestar_at, 'visto_at', pe.visto_at)
                   FROM conceptualizador.permiso_estado pe WHERE pe.actor = a.actor),
    'suscripciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('plataforma', s.plataforma, 'en_inicio', s.en_inicio, 'zona', s.zona,
                   'ultima_ok_at', s.ultima_ok_at, 'ultimo_error', s.ultimo_error) ORDER BY s.actualizada_at DESC), '[]'::jsonb)
                   FROM conceptualizador.push_suscripcion s WHERE s.actor = a.actor AND s.baja_at IS NULL),
    'ultimo_aviso_at', (SELECT max(e.enviada_at) FROM conceptualizador.push_envio e WHERE e.actor = a.actor AND e.estado = 'enviada'),
    'ultimo_fallo', (SELECT e.estado || ' · ' || to_char(e.tomado_at AT TIME ZONE 'America/Monterrey', 'DD/MM HH24:MI') FROM conceptualizador.push_envio e
                      WHERE e.actor = a.actor AND e.estado IN ('fallida','sin_destino') ORDER BY e.id DESC LIMIT 1),
    'ajustes', (SELECT jsonb_build_object('recordatorios', j.recordatorios, 'avisos', j.avisos) FROM conceptualizador.push_ajuste j WHERE j.actor = a.actor))
    ORDER BY a.actor), '[]'::jsonb)
  FROM (SELECT actor FROM conceptualizador.push_suscripcion UNION SELECT actor FROM conceptualizador.permiso_estado
        UNION SELECT DISTINCT autor FROM conceptualizador.caso WHERE conceptualizador.es_persona(autor)) a
$eq10$;

-- ── api_suite: los modos de push; presencia en casos/hilo; lo demás, igual ─
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $api10$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_modo  text := p->>'modo';
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_ts    bigint;
  v_n     int;
  v_r     jsonb;
  v_c     conceptualizador.caso%ROWTYPE;
  v_id    bigint;
  v_z     text;
  v_en    text;
  v_cuando timestamptz;
  v_pl    text;
  v_est   text[] := ARRAY['activo','negado','pendiente'];
BEGIN
  IF v_modo IS NULL OR v_modo NOT IN ('push_estado','push_alta','push_baja','permisos','recordar','push_ajustes','equipo_avisos') THEN
    v_r := conceptualizador.api_suite_0010prev(p);
    -- La pantalla pide `casos` y `hilo` solo con la pestaña a la vista: eso dice que la persona está en la app.
    IF v_actor IS NOT NULL AND v_modo IN ('casos','hilo') AND coalesce((v_r->>'ok')::boolean, false) THEN
      INSERT INTO conceptualizador.push_presencia (actor, visto_at) VALUES (v_actor, now())
        ON CONFLICT (actor) DO UPDATE SET visto_at = excluded.visto_at;
      IF v_modo = 'hilo' AND EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid) THEN
        INSERT INTO conceptualizador.push_visto (actor, caso_id, visto_at) VALUES (v_actor, (p->>'caso_id')::uuid, now())
          ON CONFLICT (actor, caso_id) DO UPDATE SET visto_at = excluded.visto_at;
      END IF;
    END IF;
    RETURN v_r;
  END IF;

  -- Los modos de push pasan por el mismo anti-replay que los demás (ventana y nonce único).
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
  v_ts := CASE WHEN (p->>'ts') ~ '^[0-9]' AND (p->>'ts') !~ '[^0-9]' AND char_length(p->>'ts') <= 15 THEN (p->>'ts')::bigint END;
  IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  IF char_length(coalesce(p->>'nonce','')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
  INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;

  IF v_modo = 'push_estado' THEN
    RETURN jsonb_build_object('ok', true,
      'vapid_publica', conceptualizador.cfg_txt('push_vapid_publica'),
      'suscripciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'plataforma', s.plataforma, 'en_inicio', s.en_inicio, 'zona', s.zona,
                          'fin', right(s.endpoint, 12), 'ultima_ok_at', s.ultima_ok_at, 'ultimo_error', s.ultimo_error) ORDER BY s.id), '[]'::jsonb)
                          FROM conceptualizador.push_suscripcion s WHERE s.actor = v_actor AND s.baja_at IS NULL),
      'ajustes', coalesce((SELECT jsonb_build_object('recordatorios', j.recordatorios, 'avisos', j.avisos) FROM conceptualizador.push_ajuste j WHERE j.actor = v_actor),
                          jsonb_build_object('recordatorios', true, 'avisos', true)),
      'zona', conceptualizador.zona_de(v_actor, 'mx'),
      'silencio', jsonb_build_object('desde', conceptualizador.cfg('push_silencio_desde'), 'hasta', conceptualizador.cfg('push_silencio_hasta')),
      'tope', conceptualizador.cfg('push_tope_caso'), 'recordar_tope', conceptualizador.cfg('recordar_tope'),
      'admin', conceptualizador.es_admin(v_actor));

  ELSIF v_modo = 'push_alta' THEN
    IF NOT conceptualizador.push_endpoint_ok(v_d->>'endpoint') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PUSH_ENDPOINT_INVALIDO', 'mensaje', 'Ese navegador manda los avisos por un servicio que no conozco.');
    END IF;
    v_pl := CASE WHEN v_d->>'plataforma' IN ('android','ios','escritorio') THEN v_d->>'plataforma' ELSE 'escritorio' END;
    BEGIN
      INSERT INTO conceptualizador.push_suscripcion (actor, endpoint, p256dh, auth, plataforma, en_inicio, zona)
        VALUES (v_actor, v_d->>'endpoint', v_d->>'p256dh', v_d->>'auth', v_pl, coalesce((v_d->>'en_inicio')::boolean, false),
                conceptualizador.zona_valida(v_d->>'zona'))
      ON CONFLICT (endpoint) DO UPDATE SET actor = excluded.actor, p256dh = excluded.p256dh, auth = excluded.auth,
        plataforma = excluded.plataforma, en_inicio = excluded.en_inicio, zona = coalesce(excluded.zona, conceptualizador.push_suscripcion.zona),
        actualizada_at = now(), baja_at = NULL, baja_motivo = NULL, errores = 0
      RETURNING id INTO v_id;
    EXCEPTION WHEN check_violation OR invalid_text_representation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PUSH_LLAVES_INVALIDAS', 'mensaje', 'Las llaves del navegador no tienen la forma esperada.');
    END;
    -- Si el navegador cambió de suscripción (llave nueva del servidor), la anterior se da de baja.
    IF nullif(v_d->>'anterior','') IS NOT NULL AND v_d->>'anterior' <> v_d->>'endpoint' THEN
      UPDATE conceptualizador.push_suscripcion SET baja_at = now(), baja_motivo = 'persona'
       WHERE endpoint = v_d->>'anterior' AND actor = v_actor AND baja_at IS NULL;
    END IF;
    RETURN jsonb_build_object('ok', true, 'suscripcion_id', v_id, 'zona', (SELECT zona FROM conceptualizador.push_suscripcion WHERE id = v_id));

  ELSIF v_modo = 'push_baja' THEN
    UPDATE conceptualizador.push_suscripcion SET baja_at = now(), baja_motivo = 'persona'
     WHERE endpoint = v_d->>'endpoint' AND actor = v_actor AND baja_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'bajas', v_n);

  ELSIF v_modo = 'permisos' THEN
    INSERT INTO conceptualizador.permiso_estado (actor, notif, mic, cam, ubi, plataforma, en_inicio, no_molestar_at, visto_at)
      VALUES (v_actor,
        CASE WHEN v_d->>'notif' = ANY (v_est) THEN v_d->>'notif' ELSE 'pendiente' END,
        CASE WHEN v_d->>'mic'   = ANY (v_est) THEN v_d->>'mic'   ELSE 'pendiente' END,
        CASE WHEN v_d->>'cam'   = ANY (v_est) THEN v_d->>'cam'   ELSE 'pendiente' END,
        CASE WHEN v_d->>'ubi'   = ANY (v_est) THEN v_d->>'ubi'   ELSE 'pendiente' END,
        CASE WHEN v_d->>'plataforma' IN ('android','ios','escritorio') THEN v_d->>'plataforma' END,
        CASE WHEN jsonb_typeof(v_d->'en_inicio') = 'boolean' THEN (v_d->>'en_inicio')::boolean END,
        CASE WHEN v_d->>'no_molestar' = 'true' THEN now() END, now())
    ON CONFLICT (actor) DO UPDATE SET notif = excluded.notif, mic = excluded.mic, cam = excluded.cam, ubi = excluded.ubi,
      plataforma = coalesce(excluded.plataforma, conceptualizador.permiso_estado.plataforma),
      en_inicio = coalesce(excluded.en_inicio, conceptualizador.permiso_estado.en_inicio),
      no_molestar_at = coalesce(excluded.no_molestar_at, conceptualizador.permiso_estado.no_molestar_at), visto_at = now();
    RETURN jsonb_build_object('ok', true);

  ELSIF v_modo = 'push_ajustes' THEN
    INSERT INTO conceptualizador.push_ajuste (actor, recordatorios, avisos)
      VALUES (v_actor, coalesce((v_d->>'recordatorios')::boolean, true), coalesce((v_d->>'avisos')::boolean, true))
    ON CONFLICT (actor) DO UPDATE SET
      recordatorios = CASE WHEN jsonb_typeof(v_d->'recordatorios') = 'boolean' THEN (v_d->>'recordatorios')::boolean ELSE conceptualizador.push_ajuste.recordatorios END,
      avisos = CASE WHEN jsonb_typeof(v_d->'avisos') = 'boolean' THEN (v_d->>'avisos')::boolean ELSE conceptualizador.push_ajuste.avisos END,
      updated_at = now();
    RETURN jsonb_build_object('ok', true, 'ajustes', (SELECT jsonb_build_object('recordatorios', recordatorios, 'avisos', avisos)
                                                       FROM conceptualizador.push_ajuste WHERE actor = v_actor));

  ELSIF v_modo = 'recordar' THEN
    -- «Recuérdame en…» (30, 60, 120 min, mañana 9:00 de la persona) o «No me recuerdes esta sesión». No gasta uno de los 3.
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid FOR UPDATE;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYA', 'mensaje', 'Solo quien abrió la sesión o Esteban.');
    END IF;
    v_en := coalesce(v_d->>'en', '');
    v_z := conceptualizador.zona_de(v_actor, v_c.pais);
    IF v_en IN ('30','60','120') THEN
      v_cuando := now() + make_interval(mins => v_en::int);
      UPDATE conceptualizador.caso SET recordar_en = v_cuando, sin_recordar = false WHERE id = v_c.id;
    ELSIF v_en = 'manana' THEN
      v_cuando := (((now() AT TIME ZONE v_z)::date + 1) + make_time(9, 0, 0)) AT TIME ZONE v_z;
      UPDATE conceptualizador.caso SET recordar_en = v_cuando, sin_recordar = false WHERE id = v_c.id;
    ELSIF v_en = 'nunca' THEN
      UPDATE conceptualizador.caso SET sin_recordar = true WHERE id = v_c.id;
    ELSIF v_en = 'si' THEN
      UPDATE conceptualizador.caso SET sin_recordar = false WHERE id = v_c.id;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'RECORDAR_INVALIDO', 'mensaje', 'Elige 30 min, 1 h, 2 h, mañana o no recordar.');
    END IF;
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = v_c.id;
    RETURN jsonb_build_object('ok', true, 'recordar_en', v_c.recordar_en, 'sin_recordar', v_c.sin_recordar, 'zona', v_z,
      'quedan', greatest(conceptualizador.cfg('recordar_tope') - v_c.recordatorios, 0));

  ELSIF v_modo = 'equipo_avisos' THEN
    IF NOT conceptualizador.es_admin(v_actor) THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_ADMIN', 'mensaje', 'Solo Esteban ve los avisos del equipo.'); END IF;
    RETURN jsonb_build_object('ok', true, 'equipo', conceptualizador.equipo_avisos());
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$api10$;

-- ── Permisos ───────────────────────────────────────────────────────────────
-- CREATE OR REPLACE regresa la función a SECURITY INVOKER: se vuelve a marcar.
ALTER FUNCTION conceptualizador.api_suite(jsonb)          SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0010prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_push(jsonb)           SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0010prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_push(jsonb)     TO conceptualizador_app;
