-- ═══════════════════════════════════════════════════════════════════════════
-- 002_conceptualizador.sql · adjuntos, sesiones con estado, acciones del
-- motor (botones) y cierres. MVP rector #4 de fts-conceptualizador, Fase 3.
--
-- Sobre la 001 (ya aplicada o por aplicar; no se edita):
--   · adjunto      fotos, notas de voz y PDFs en bytea (≤ 10 MB c/u, una
--                  petición por archivo). Mismo criterio que retardos (#334):
--                  sin bucket, la base es lo único que ya está respaldado.
--   · caso         estados abierto · enviada · cerrado · archivado, y la liga
--                  a Odoo y al machote (ids, nunca datos del cliente).
--   · mensaje      escrito_at = hora REAL en que se escribió (la cola sin
--                  señal la conserva) y cliente_id = llave de idempotencia
--                  del teléfono (un reintento no duplica).
--   · accion       los botones que propone el motor (confirmar conjetura,
--                  alta de contacto, crear machote, crear borrador, cerrar,
--                  ya la mandé). La pantalla hace la escritura con un clic y
--                  aquí queda el resultado.
--   · api_cierres  candidatos y aplicación de los cierres automáticos.
--
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Caso = sesión de cotización ────────────────────────────────────────────
ALTER TABLE conceptualizador.caso DROP CONSTRAINT IF EXISTS caso_estado_check;
ALTER TABLE conceptualizador.caso ADD CONSTRAINT caso_estado_check
  CHECK (estado IN ('abierto','enviada','cerrado','archivado'));
ALTER TABLE conceptualizador.caso
  ADD COLUMN IF NOT EXISTS cliente_odoo_id   int,
  ADD COLUMN IF NOT EXISTS oportunidad_id    int,
  ADD COLUMN IF NOT EXISTS contacto_odoo_id  int,
  ADD COLUMN IF NOT EXISTS machote_id        uuid,
  ADD COLUMN IF NOT EXISTS machote_folio     text,
  ADD COLUMN IF NOT EXISTS orden_id          int,
  ADD COLUMN IF NOT EXISTS orden_nombre      text,
  ADD COLUMN IF NOT EXISTS enviada_at        timestamptz,
  ADD COLUMN IF NOT EXISTS pregunto_cierre_at timestamptz,
  ADD COLUMN IF NOT EXISTS cerrado_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cerrado_por       text,
  ADD COLUMN IF NOT EXISTS cierre_motivo     text,
  ADD COLUMN IF NOT EXISTS ultima_actividad_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE conceptualizador.caso DROP CONSTRAINT IF EXISTS caso_cerrado_por_check;
ALTER TABLE conceptualizador.caso ADD CONSTRAINT caso_cerrado_por_check
  CHECK (cerrado_por IS NULL OR cerrado_por IN ('manual','orden_confirmada','oportunidad_perdida','sin_machote','motor'));

-- ── Mensaje: hora real e idempotencia ──────────────────────────────────────
ALTER TABLE conceptualizador.mensaje DROP CONSTRAINT IF EXISTS mensaje_rol_check;
ALTER TABLE conceptualizador.mensaje ADD CONSTRAINT mensaje_rol_check
  CHECK (rol IN ('usuario','motor','sistema'));
ALTER TABLE conceptualizador.mensaje
  ADD COLUMN IF NOT EXISTS escrito_at timestamptz,
  ADD COLUMN IF NOT EXISTS cliente_id text;
CREATE UNIQUE INDEX IF NOT EXISTS mensaje_cliente_id
  ON conceptualizador.mensaje (autor, cliente_id) WHERE cliente_id IS NOT NULL;

ALTER TABLE conceptualizador.evento DROP CONSTRAINT IF EXISTS evento_tipo_check;
ALTER TABLE conceptualizador.evento ADD CONSTRAINT evento_tipo_check
  CHECK (tipo IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra','accion','ejecucion'));

-- ── Adjuntos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.adjunto (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id       uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  mensaje_id    bigint      REFERENCES conceptualizador.mensaje(id),
  autor         text        NOT NULL,
  nombre        text        NOT NULL,
  tipo          text        NOT NULL,                  -- mime
  clase         text        NOT NULL CHECK (clase IN ('foto','audio','pdf','otro')),
  bytes         int         NOT NULL,
  sha256        text        NOT NULL,
  contenido     bytea       NOT NULL,
  duracion_s    numeric,
  escrito_at    timestamptz,
  transcripcion text,
  transcrito_por text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adjunto_tope CHECK (octet_length(contenido) <= 10485760),
  CONSTRAINT adjunto_unico UNIQUE (caso_id, sha256)
);
CREATE INDEX IF NOT EXISTS adjunto_mensaje ON conceptualizador.adjunto (mensaje_id);

-- ── Acciones (botones del motor) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.accion (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  trabajo_id  bigint,
  tipo        text        NOT NULL CHECK (tipo IN ('conjetura','alta_contacto','crear_machote',
                                                   'crear_borrador','enviada','cerrar')),
  titulo      text        NOT NULL,
  datos       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  estado      text        NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta','hecha','descartada')),
  resultado   jsonb,
  hecha_por   text,
  hecha_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accion_caso ON conceptualizador.accion (caso_id, id);

ALTER TABLE conceptualizador.respuesta
  ADD COLUMN IF NOT EXISTS machote jsonb,
  ADD COLUMN IF NOT EXISTS odoo    jsonb;

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('dias_preguntar_cierre',  '5'),    -- machote enviado y chat quieto: pregunta «¿la cierro?»
  ('dias_archivar_sin_machote','30'), -- sin machote nunca se cierra por tiempo: se archiva
  ('dias_volver_a_preguntar', '7')
ON CONFLICT (clave) DO NOTHING;

-- ── Lecturas ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.adjuntos_meta(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $adm$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mensaje_id', a.mensaje_id, 'nombre', a.nombre,
      'tipo', a.tipo, 'clase', a.clase, 'bytes', a.bytes, 'duracion_s', a.duracion_s,
      'transcripcion', a.transcripcion, 'escrito_at', a.escrito_at, 'created_at', a.created_at) ORDER BY a.created_at), '[]'::jsonb)
  FROM conceptualizador.adjunto a WHERE a.caso_id = p_caso
$adm$;

CREATE OR REPLACE FUNCTION conceptualizador.hilo(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $hilo$
  SELECT jsonb_build_object(
    'caso', to_jsonb(c),
    'mensajes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'rol', m.rol, 'autor', m.autor, 'texto', m.texto, 'adjuntos', m.adjuntos,
        'trabajo_id', m.trabajo_id, 'created_at', m.created_at, 'escrito_at', m.escrito_at,
        'cliente_id', m.cliente_id,
        'estado', t.estado, 'tomado_por', t.tomado_por, 'error', t.error) ORDER BY m.id)
      FROM conceptualizador.mensaje m
      LEFT JOIN conceptualizador.trabajo t ON t.id = m.trabajo_id
      WHERE m.caso_id = c.id), '[]'::jsonb),
    'adjuntos', conceptualizador.adjuntos_meta(c.id),
    'acciones', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
      FROM conceptualizador.accion a WHERE a.caso_id = c.id), '[]'::jsonb),
    'eventos', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM conceptualizador.evento e WHERE e.caso_id = c.id), '[]'::jsonb),
    'trabajos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'tipo', t.tipo,
        'estado', t.estado, 'tomado_por', t.tomado_por, 'intentos', t.intentos, 'error', t.error,
        'created_at', t.created_at, 'tomado_at', t.tomado_at, 'listo_at', t.listo_at) ORDER BY t.id)
      FROM conceptualizador.trabajo t WHERE t.caso_id = c.id), '[]'::jsonb),
    'ultima', (SELECT jsonb_build_object('trabajo_id', r.trabajo_id, 'motor', r.motor,
        'conceptos', r.conceptos, 'bom', r.bom, 'preguntas', r.preguntas,
        'lecciones', r.lecciones, 'verifica', r.verifica, 'segundos', r.segundos,
        'machote', r.machote, 'odoo', r.odoo, 'created_at', r.created_at)
      FROM conceptualizador.respuesta r WHERE r.caso_id = c.id
      ORDER BY r.id DESC LIMIT 1),
    -- La última respuesta que trajo conceptos o machote: la pantalla la sigue
    -- mostrando aunque después el motor conteste otras cosas.
    'propuesta', (SELECT jsonb_build_object('trabajo_id', r.trabajo_id, 'conceptos', r.conceptos, 'bom', r.bom,
        'preguntas', r.preguntas, 'machote', r.machote, 'odoo', r.odoo, 'created_at', r.created_at)
      FROM conceptualizador.respuesta r WHERE r.caso_id = c.id
       AND (jsonb_array_length(r.conceptos) > 0 OR r.machote IS NOT NULL OR r.bom <> '{}'::jsonb)
      ORDER BY r.id DESC LIMIT 1))
  FROM conceptualizador.caso c WHERE c.id = p_caso
$hilo$;

-- Encola un trabajo para el motor a partir de un evento (lo usan acciones y cierres).
CREATE OR REPLACE FUNCTION conceptualizador.encolar_evento(p_caso uuid, p_tipo text, p_concepto text,
  p_razon text, p_datos jsonb, p_autor text) RETURNS jsonb
LANGUAGE plpgsql AS $enc$
DECLARE v_ev bigint; v_trab bigint;
BEGIN
  INSERT INTO conceptualizador.evento (caso_id, tipo, concepto, razon, datos, autor)
  VALUES (p_caso, p_tipo, p_concepto, p_razon, coalesce(p_datos,'{}'::jsonb), p_autor) RETURNING id INTO v_ev;
  INSERT INTO conceptualizador.trabajo (caso_id, tipo, evento_id) VALUES (p_caso, 'evento', v_ev) RETURNING id INTO v_trab;
  UPDATE conceptualizador.caso SET ultima_actividad_at = now() WHERE id = p_caso;
  RETURN jsonb_build_object('evento_id', v_ev, 'trabajo_id', v_trab);
END
$enc$;

-- ── API de la suite ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $api$
DECLARE
  v_actor  text := nullif(btrim(p->>'actor'), '');
  v_modo   text := p->>'modo';
  v_caso   uuid;
  v_msg    bigint;
  v_trab   bigint;
  v_ts     bigint;
  v_n      int;
  v_bin    bytea;
  v_adj    uuid;
  v_meta   jsonb;
  v_esc    timestamptz;
  a        conceptualizador.accion%ROWTYPE;
  v_r      jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR');
  END IF;

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

  -- Hora real en que se escribió (la cola sin señal la conserva). Se acepta
  -- hasta 30 días atrás y nunca en el futuro.
  v_esc := CASE WHEN nullif(p->>'escrito_at','') IS NULL THEN NULL
                ELSE to_timestamp((p->>'escrito_at')::bigint / 1000.0) END;
  IF v_esc IS NOT NULL AND (v_esc > now() + interval '5 minutes' OR v_esc < now() - interval '30 days') THEN
    v_esc := NULL;
  END IF;

  IF v_modo = 'nueva' THEN
    INSERT INTO conceptualizador.caso (titulo, cliente, pais, autor, autor_nombre, demo)
    VALUES (coalesce(nullif(btrim(p->>'titulo'),''), 'Cotización nueva'), nullif(btrim(p->>'cliente'),''),
            CASE WHEN p->>'pais' = 'usa' THEN 'usa' ELSE 'mx' END, v_actor, p->>'nombre',
            coalesce((p->>'demo')::boolean, false))
    RETURNING id INTO v_caso;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_caso);

  ELSIF v_modo = 'subir' THEN
    v_caso := nullif(p->>'caso_id','')::uuid;
    IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
    END IF;
    BEGIN
      v_bin := decode(coalesce(p->>'b64',''), 'base64');
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ADJUNTO_ILEGIBLE');
    END;
    IF octet_length(v_bin) = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'ADJUNTO_VACIO'); END IF;
    IF octet_length(v_bin) > 10485760 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ADJUNTO_GRANDE', 'mensaje', 'El archivo pasa de 10 MB.');
    END IF;
    -- El sha256 viene firmado por la pantalla: si el contenido no cuadra, se rechaza.
    IF encode(digest(v_bin, 'sha256'), 'hex') <> lower(coalesce(p->>'sha256','')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ADJUNTO_ALTERADO');
    END IF;
    INSERT INTO conceptualizador.adjunto (caso_id, autor, nombre, tipo, clase, bytes, sha256, contenido, duracion_s, escrito_at)
    VALUES (v_caso, v_actor, coalesce(nullif(btrim(p->>'archivo'),''), 'archivo'), coalesce(nullif(p->>'mime',''), 'application/octet-stream'),
            CASE WHEN p->>'clase' IN ('foto','audio','pdf') THEN p->>'clase' ELSE 'otro' END,
            octet_length(v_bin), lower(p->>'sha256'), v_bin, nullif(p->>'duracion_s','')::numeric, v_esc)
    ON CONFLICT (caso_id, sha256) DO UPDATE SET nombre = conceptualizador.adjunto.nombre
    RETURNING id INTO v_adj;
    RETURN jsonb_build_object('ok', true, 'adjunto_id', v_adj, 'bytes', octet_length(v_bin));

  ELSIF v_modo = 'enviar' THEN
    IF char_length(btrim(coalesce(p->>'texto',''))) = 0 AND jsonb_array_length(coalesce(p->'adjuntos','[]'::jsonb)) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TEXTO_VACIO');
    END IF;
    -- Idempotencia: el mismo cliente_id del mismo autor ya entró → se devuelve lo que ya existe.
    IF nullif(p->>'cliente_id','') IS NOT NULL THEN
      SELECT m.id, m.caso_id, m.trabajo_id INTO v_msg, v_caso, v_trab FROM conceptualizador.mensaje m
       WHERE m.autor = v_actor AND m.cliente_id = p->>'cliente_id';
      IF v_msg IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'ya_estaba', true, 'caso_id', v_caso, 'mensaje_id', v_msg,
                                  'trabajo_id', v_trab, 'motor', conceptualizador.estado_motor());
      END IF;
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
    -- Adjuntos: una lista de ids ya subidos a ESTE caso (o, por compatibilidad, objetos de texto).
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', a2.id, 'nombre', a2.nombre, 'tipo', a2.tipo,
             'clase', a2.clase, 'bytes', a2.bytes, 'duracion_s', a2.duracion_s) ORDER BY a2.created_at), '[]'::jsonb)
      INTO v_meta
      FROM conceptualizador.adjunto a2
     WHERE a2.caso_id = v_caso
       AND a2.id::text IN (SELECT jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(p->'adjuntos') = 'array' THEN
               (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(p->'adjuntos') x WHERE jsonb_typeof(x) = 'string')
             ELSE '[]'::jsonb END));
    IF jsonb_array_length(v_meta) = 0 AND jsonb_typeof(p->'adjuntos') = 'array' THEN
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_meta FROM jsonb_array_elements(p->'adjuntos') x WHERE jsonb_typeof(x) = 'object';
    END IF;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto, adjuntos, escrito_at, cliente_id)
    VALUES (v_caso, 'usuario', v_actor, coalesce(p->>'texto',''), v_meta, v_esc, nullif(p->>'cliente_id',''))
    RETURNING id INTO v_msg;
    UPDATE conceptualizador.adjunto SET mensaje_id = v_msg
     WHERE caso_id = v_caso AND mensaje_id IS NULL
       AND id::text IN (SELECT x->>'id' FROM jsonb_array_elements(v_meta) x);
    INSERT INTO conceptualizador.trabajo (caso_id, tipo, mensaje_id)
    VALUES (v_caso, 'mensaje', v_msg) RETURNING id INTO v_trab;
    UPDATE conceptualizador.mensaje SET trabajo_id = v_trab WHERE id = v_msg;
    UPDATE conceptualizador.caso SET ultima_actividad_at = now() WHERE id = v_caso;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_caso, 'mensaje_id', v_msg, 'trabajo_id', v_trab,
                              'adjuntos', v_meta, 'motor', conceptualizador.estado_motor());

  ELSIF v_modo = 'evento' THEN
    v_caso := nullif(p->>'caso_id','')::uuid;
    IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
    END IF;
    IF p->>'tipo' = 'rechazar' AND char_length(btrim(coalesce(p->>'razon',''))) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RAZON_OBLIGATORIA',
        'mensaje', 'Para rechazar un concepto hay que decir por qué.');
    END IF;
    IF p->>'tipo' NOT IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TIPO_INVALIDO');
    END IF;
    v_r := conceptualizador.encolar_evento(v_caso, p->>'tipo', p->>'concepto', p->>'razon', p->'datos', v_actor);
    RETURN jsonb_build_object('ok', true, 'caso_id', v_caso) || v_r;

  ELSIF v_modo = 'accion' THEN
    -- La pantalla ya hizo lo que el botón pedía (con su propio endpoint y el
    -- clic del usuario); aquí se registra el resultado y se avisa al motor.
    SELECT * INTO a FROM conceptualizador.accion WHERE id = nullif(p->>'accion_id','')::bigint FOR UPDATE;
    IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ACCION_NO_EXISTE'); END IF;
    IF a.estado <> 'propuesta' THEN
      RETURN jsonb_build_object('ok', true, 'ya_estaba', true, 'estado', a.estado);
    END IF;
    IF p->>'decision' NOT IN ('hecha','descartada') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DECISION_INVALIDA');
    END IF;
    IF a.tipo = 'conjetura' AND p->>'decision' = 'descartada' AND char_length(btrim(coalesce(p->'resultado'->>'correccion',''))) < 2 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CORRECCION_OBLIGATORIA',
        'mensaje', 'Si la suposición no es correcta, escribe cuál es lo correcto.');
    END IF;
    UPDATE conceptualizador.accion SET estado = p->>'decision', resultado = coalesce(p->'resultado','{}'::jsonb),
           hecha_por = v_actor, hecha_at = now() WHERE id = a.id;
    IF p->>'decision' = 'hecha' THEN
      UPDATE conceptualizador.caso c SET
        machote_id = CASE WHEN a.tipo = 'crear_machote' THEN nullif(p->'resultado'->>'machote_id','')::uuid ELSE c.machote_id END,
        machote_folio = CASE WHEN a.tipo = 'crear_machote' THEN coalesce(p->'resultado'->>'folio', c.machote_folio) ELSE c.machote_folio END,
        orden_id = CASE WHEN a.tipo = 'crear_borrador' THEN nullif(p->'resultado'->>'orden_id','')::int ELSE c.orden_id END,
        orden_nombre = CASE WHEN a.tipo = 'crear_borrador' THEN coalesce(p->'resultado'->>'orden_nombre', c.orden_nombre) ELSE c.orden_nombre END,
        contacto_odoo_id = CASE WHEN a.tipo = 'alta_contacto' THEN nullif(p->'resultado'->>'contacto_id','')::int ELSE c.contacto_odoo_id END,
        estado = CASE WHEN a.tipo = 'enviada' AND c.estado = 'abierto' THEN 'enviada'
                      WHEN a.tipo = 'cerrar' THEN 'cerrado' ELSE c.estado END,
        enviada_at = CASE WHEN a.tipo = 'enviada' THEN now() ELSE c.enviada_at END,
        cerrado_at = CASE WHEN a.tipo = 'cerrar' THEN now() ELSE c.cerrado_at END,
        cerrado_por = CASE WHEN a.tipo = 'cerrar' THEN 'manual' ELSE c.cerrado_por END
       WHERE c.id = a.caso_id;
    END IF;
    -- Las conjeturas de una misma respuesta se juntan: el motor recibe UN
    -- trabajo cuando ya no queda ninguna propuesta de ese lote.
    IF a.tipo = 'conjetura' AND EXISTS (SELECT 1 FROM conceptualizador.accion x
         WHERE x.caso_id = a.caso_id AND x.tipo = 'conjetura' AND x.estado = 'propuesta'
           AND x.trabajo_id IS NOT DISTINCT FROM a.trabajo_id) THEN
      RETURN jsonb_build_object('ok', true, 'accion_id', a.id, 'espera_lote', true);
    END IF;
    v_r := conceptualizador.encolar_evento(a.caso_id, 'accion', a.tipo, NULL,
      jsonb_build_object('accion_id', a.id, 'tipo', a.tipo, 'decision', p->>'decision',
        'resultado', coalesce(p->'resultado','{}'::jsonb), 'lote_trabajo_id', a.trabajo_id), v_actor);
    RETURN jsonb_build_object('ok', true, 'accion_id', a.id, 'caso_id', a.caso_id) || v_r;

  ELSIF v_modo = 'ver_adjunto' THEN
    SELECT jsonb_build_object('ok', true, 'id', x.id, 'nombre', x.nombre, 'tipo', x.tipo, 'clase', x.clase,
             'b64', encode(x.contenido, 'base64'))
      INTO v_r FROM conceptualizador.adjunto x WHERE x.id = nullif(p->>'adjunto_id','')::uuid;
    RETURN coalesce(v_r, jsonb_build_object('ok', false, 'error', 'ADJUNTO_NO_EXISTE'));

  ELSIF v_modo = 'hilo' THEN
    v_caso := nullif(p->>'caso_id','')::uuid;
    RETURN jsonb_build_object('ok', v_caso IS NOT NULL, 'hilo', conceptualizador.hilo(v_caso),
                              'motor', conceptualizador.estado_motor());

  ELSIF v_modo = 'casos' THEN
    RETURN jsonb_build_object('ok', true, 'casos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.titulo, 'cliente', c.cliente,
        'pais', c.pais, 'autor', c.autor, 'autor_nombre', c.autor_nombre, 'estado', c.estado, 'demo', c.demo,
        'carpeta', c.carpeta, 'machote_folio', c.machote_folio, 'cierre_motivo', c.cierre_motivo,
        'updated_at', c.updated_at, 'ultima_actividad_at', c.ultima_actividad_at,
        'ultimo', (SELECT jsonb_build_object('rol', m.rol, 'texto', left(m.texto, 120),
                     'adjuntos', jsonb_array_length(m.adjuntos), 'created_at', m.created_at)
                   FROM conceptualizador.mensaje m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1),
        'acciones', (SELECT count(*) FROM conceptualizador.accion a3 WHERE a3.caso_id = c.id AND a3.estado = 'propuesta'),
        'pendientes', (SELECT count(*) FROM conceptualizador.trabajo t
                       WHERE t.caso_id = c.id AND t.estado IN ('pendiente','tomado'))) ORDER BY c.ultima_actividad_at DESC)
      FROM conceptualizador.caso c), '[]'::jsonb),
      'motor', conceptualizador.estado_motor());

  ELSIF v_modo = 'aprendio' THEN
    RETURN jsonb_build_object('ok', true, 'aprendizaje',
      (SELECT jsonb_build_object('resumen', a4.resumen, 'created_at', a4.created_at, 'motor', a4.motor)
       FROM conceptualizador.aprendizaje a4 ORDER BY a4.id DESC LIMIT 1));

  ELSIF v_modo = 'estado' THEN
    RETURN jsonb_build_object('ok', true, 'motor', conceptualizador.estado_motor());
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$api$;

-- ── API del motor ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot$
DECLARE
  v_motor  text := p->>'motor';
  v_sesion text := coalesce(p->>'sesion', '');
  v_modo   text := p->>'modo';
  v_id     bigint := nullif(p->>'trabajo_id','')::bigint;
  t        conceptualizador.trabajo%ROWTYPE;
  v_resp   jsonb;
  v_caso   jsonb;
  v_x      jsonb;
  v_r      jsonb;
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
    SELECT * INTO t FROM conceptualizador.trabajo
     WHERE estado = 'pendiente'
        OR (estado = 'tomado' AND tomado_at < now() - make_interval(secs => conceptualizador.cfg('lease_segundos')))
     ORDER BY id LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'trabajo_id', t.id, 'tipo', t.tipo, 'caso_id', t.caso_id);

  ELSIF v_modo = 'tomar' THEN
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

  ELSIF v_modo = 'adjunto' THEN
    -- El motor baja un adjunto (foto, audio, PDF) para verlo o transcribirlo.
    SELECT jsonb_build_object('ok', true, 'id', x.id, 'caso_id', x.caso_id, 'nombre', x.nombre, 'tipo', x.tipo,
             'clase', x.clase, 'bytes', x.bytes, 'sha256', x.sha256, 'b64', encode(x.contenido, 'base64'))
      INTO v_r FROM conceptualizador.adjunto x WHERE x.id = nullif(p->>'adjunto_id','')::uuid;
    RETURN coalesce(v_r, jsonb_build_object('ok', false, 'error', 'ADJUNTO_NO_EXISTE'));

  ELSIF v_modo = 'transcripcion' THEN
    UPDATE conceptualizador.adjunto SET transcripcion = left(p->>'texto', 50000), transcrito_por = coalesce(p->>'por', v_motor)
     WHERE id = nullif(p->>'adjunto_id','')::uuid;
    RETURN jsonb_build_object('ok', true);

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
    INSERT INTO conceptualizador.respuesta (trabajo_id, caso_id, motor, texto, conceptos, bom, preguntas, lecciones, verifica, segundos, machote, odoo)
    VALUES (t.id, t.caso_id, v_motor, v_resp->>'texto',
            coalesce(v_resp->'conceptos','[]'::jsonb), coalesce(v_resp->'bom','{}'::jsonb),
            coalesce(v_resp->'preguntas','[]'::jsonb), coalesce(v_resp->'lecciones','[]'::jsonb),
            coalesce(v_resp->'verifica','{}'::jsonb),
            round(extract(epoch FROM now() - t.created_at)::numeric, 1),
            v_resp->'machote', v_resp->'odoo');
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto, trabajo_id)
    VALUES (t.caso_id, 'motor', 'motor-' || v_motor, v_resp->>'texto', t.id);
    -- Botones que propone el motor. Cada uno lo resuelve una persona.
    IF jsonb_typeof(v_resp->'acciones') = 'array' THEN
      INSERT INTO conceptualizador.accion (caso_id, trabajo_id, tipo, titulo, datos)
      SELECT t.caso_id, t.id, x->>'tipo', left(coalesce(x->>'titulo', x->>'tipo'), 300), coalesce(x->'datos','{}'::jsonb)
        FROM jsonb_array_elements(v_resp->'acciones') x
       WHERE x->>'tipo' IN ('conjetura','alta_contacto','crear_machote','crear_borrador','enviada','cerrar');
    END IF;
    UPDATE conceptualizador.trabajo SET estado = 'listo', listo_at = now() WHERE id = t.id;
    v_caso := coalesce(v_resp->'caso', '{}'::jsonb);
    UPDATE conceptualizador.caso SET
      carpeta = coalesce(nullif(v_resp->>'carpeta',''), carpeta),
      titulo  = coalesce(nullif(left(v_caso->>'titulo', 120),''), titulo),
      cliente = coalesce(nullif(left(v_caso->>'cliente', 120),''), cliente),
      pais    = CASE WHEN v_caso->>'pais' IN ('mx','usa') THEN v_caso->>'pais' ELSE pais END,
      cliente_odoo_id = coalesce(nullif(v_caso->>'cliente_odoo_id','')::int, cliente_odoo_id),
      oportunidad_id  = coalesce(nullif(v_caso->>'oportunidad_id','')::int, oportunidad_id),
      contacto_odoo_id = coalesce(nullif(v_caso->>'contacto_odoo_id','')::int, contacto_odoo_id),
      estado  = CASE WHEN v_resp->>'caso_estado' IN ('abierto','enviada','cerrado','archivado') THEN v_resp->>'caso_estado' ELSE estado END,
      cerrado_at = CASE WHEN v_resp->>'caso_estado' = 'cerrado' AND cerrado_at IS NULL THEN now() ELSE cerrado_at END,
      cerrado_por = CASE WHEN v_resp->>'caso_estado' = 'cerrado' AND cerrado_por IS NULL THEN 'motor' ELSE cerrado_por END,
      ultima_actividad_at = now()
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

-- ── Cierres automáticos (workflow diario conceptualizador/cierres) ────────
-- 'candidatos': sesiones vivas con lo que n8n necesita para preguntarle a
--   Odoo (orden, oportunidad) y los cortes por tiempo ya calculados aquí.
-- 'aplicar': lista de {caso_id, accion, motivo, datos}. accion ∈
--   cerrar (orden confirmada u oportunidad perdida) · archivar · preguntar ·
--   ejecucion (horas reales del kiosko por orden de venta).
-- Regla de negocio: SIN machote nunca se cierra por tiempo, solo se archiva.
CREATE OR REPLACE FUNCTION conceptualizador.api_cierres(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cie$
DECLARE
  x      jsonb;
  c      conceptualizador.caso%ROWTYPE;
  v_hech jsonb := '[]'::jsonb;
  v_r    jsonb;
  v_txt  text;
BEGIN
  IF coalesce(p->>'modo','candidatos') = 'candidatos' THEN
    RETURN jsonb_build_object('ok', true, 'casos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', k.id, 'titulo', k.titulo, 'estado', k.estado, 'demo', k.demo,
        'oportunidad_id', k.oportunidad_id, 'orden_id', k.orden_id, 'machote_id', k.machote_id,
        'enviada_at', k.enviada_at, 'ultima_actividad_at', k.ultima_actividad_at,
        'toca_preguntar', k.machote_id IS NOT NULL AND k.estado = 'enviada'
            AND k.ultima_actividad_at < now() - make_interval(days => conceptualizador.cfg('dias_preguntar_cierre'))
            AND (k.pregunto_cierre_at IS NULL OR k.pregunto_cierre_at < now() - make_interval(days => conceptualizador.cfg('dias_volver_a_preguntar'))),
        'toca_archivar', k.machote_id IS NULL AND k.estado = 'abierto'
            AND k.ultima_actividad_at < now() - make_interval(days => conceptualizador.cfg('dias_archivar_sin_machote'))) ORDER BY k.id)
      FROM conceptualizador.caso k WHERE k.estado IN ('abierto','enviada')), '[]'::jsonb),
      'ejecucion', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', k.id, 'orden_id', k.orden_id) ORDER BY k.id)
        FROM conceptualizador.caso k
       WHERE k.estado = 'cerrado' AND k.orden_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM conceptualizador.evento e WHERE e.caso_id = k.id AND e.tipo = 'ejecucion')), '[]'::jsonb));

  ELSIF p->>'modo' = 'aplicar' THEN
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'cierres','[]'::jsonb)) LOOP
      SELECT * INTO c FROM conceptualizador.caso WHERE id = nullif(x->>'caso_id','')::uuid FOR UPDATE;
      CONTINUE WHEN c.id IS NULL;
      IF x->>'accion' = 'cerrar' AND c.estado IN ('abierto','enviada') AND x->>'motivo' IN ('orden_confirmada','oportunidad_perdida') THEN
        v_txt := CASE WHEN x->>'motivo' = 'orden_confirmada'
                      THEN 'La orden se confirmó en Odoo: cierro la cotización y comparo lo propuesto contra lo que salió.'
                      ELSE 'La oportunidad se marcó perdida en Odoo' || coalesce(' (' || nullif(left(x->'datos'->>'razon', 200),'') || ')', '')
                           || ': cierro la cotización y anoto el motivo.' END;
        UPDATE conceptualizador.caso SET estado = 'cerrado', cerrado_at = now(), cerrado_por = x->>'motivo',
               cierre_motivo = left(coalesce(x->'datos'->>'razon', x->>'motivo'), 300) WHERE id = c.id;
        INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (c.id, 'sistema', 'cierres', v_txt);
        v_r := conceptualizador.encolar_evento(c.id, 'cierra', NULL, x->>'motivo', coalesce(x->'datos','{}'::jsonb), 'cierres');
        v_hech := v_hech || jsonb_build_object('caso_id', c.id, 'hecho', 'cerrado', 'motivo', x->>'motivo');
      ELSIF x->>'accion' = 'archivar' AND c.estado = 'abierto' AND c.machote_id IS NULL THEN
        UPDATE conceptualizador.caso SET estado = 'archivado', cierre_motivo = 'sin machote ' || conceptualizador.cfg('dias_archivar_sin_machote') || ' días'
         WHERE id = c.id;
        INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (c.id, 'sistema', 'cierres',
          'Sin machote y sin movimiento en ' || conceptualizador.cfg('dias_archivar_sin_machote') || ' días: la archivo. No cuenta como cierre ni enseña nada; si la retomas, escribe aquí.');
        v_hech := v_hech || jsonb_build_object('caso_id', c.id, 'hecho', 'archivado');
      ELSIF x->>'accion' = 'preguntar' AND c.estado = 'enviada' AND c.machote_id IS NOT NULL THEN
        UPDATE conceptualizador.caso SET pregunto_cierre_at = now() WHERE id = c.id;
        INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (c.id, 'sistema', 'cierres',
          'La cotización se mandó y el chat lleva ' || conceptualizador.cfg('dias_preguntar_cierre') || ' días quieto. ¿La cierro? Si ya hay respuesta del cliente, dímela y la cierro con eso.');
        INSERT INTO conceptualizador.accion (caso_id, tipo, titulo, datos)
        VALUES (c.id, 'cerrar', '¿La cierro?', jsonb_build_object('origen', 'tiempo'));
        v_hech := v_hech || jsonb_build_object('caso_id', c.id, 'hecho', 'pregunta');
      ELSIF x->>'accion' = 'ejecucion' AND c.estado = 'cerrado' AND c.orden_id IS NOT NULL THEN
        INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (c.id, 'sistema', 'cierres',
          'Terminó la obra: comparo las horas reales del kiosko contra lo cotizado y lo guardo como rendimiento real.');
        v_r := conceptualizador.encolar_evento(c.id, 'ejecucion', NULL, NULL, coalesce(x->'datos','{}'::jsonb), 'cierres');
        v_hech := v_hech || jsonb_build_object('caso_id', c.id, 'hecho', 'ejecucion');
      END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'aplicados', v_hech);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$cie$;

-- ── Permisos ───────────────────────────────────────────────────────────────
ALTER FUNCTION conceptualizador.api_suite(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_cierres(jsonb)  SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.estado_motor(), conceptualizador.hilo(uuid),
                          conceptualizador.cfg(text), conceptualizador.adjuntos_meta(uuid) TO conceptualizador_app;
