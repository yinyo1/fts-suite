-- ═══════════════════════════════════════════════════════════════════════════
-- 005_conceptualizador.sql · sesiones a mano (renombrar, archivar, fijar),
-- candado de uso por usuario, fuera de tema y trabajo doble.
-- MVP rector #4 de fts-conceptualizador, V1.31 (14-oct-2026).
--
-- Sobre la 001 a la 004 (no se editan):
--   · caso.renombrado_*  quién y cuándo le cambió el nombre una persona; desde
--                        ahí el motor ya no se lo cambia.
--   · caso.archivado_*   archivar a mano NO cambia el estado ni borra nada: la
--                        sesión sigue en la base, sigue cerrándose y, si tiene
--                        machote, sigue enseñando. Solo sale de la lista.
--   · fijado             «fijar arriba» por usuario (cada quien su lista).
--   · cambio_sesion      bitácora de renombrar, archivar y fijar.
--   · Candado de uso     tope de mensajes procesados y de sesiones nuevas por
--                        usuario y día CST, en `config` (no en código). Va en
--                        la BASE: si no se encola, ni el principal ni el
--                        respaldo lo pueden tomar.
--   · aviso              lo que hay que decirle a Esteban (topes, fuera de
--                        tema). El motor lo publica y lo marca entregado.
--   · fuera_tema         usuario, fecha y un resumen de 10 palabras; nunca el
--                        texto del mensaje.
--   · Trabajo doble      un evento ahora también absorbe los mensajes
--                        posteriores del mismo caso (como ya lo hacía un
--                        mensaje desde la 0003).
--   · api_motor          modos `avisos`, `aviso_entregado` y `uso`.
--
-- Nadie renombra ni archiva sesiones ajenas, salvo los de `config.admins`.
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE conceptualizador.caso
  ADD COLUMN IF NOT EXISTS renombrado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS renombrado_por text,
  ADD COLUMN IF NOT EXISTS archivado_at   timestamptz,
  ADD COLUMN IF NOT EXISTS archivado_por  text;
CREATE INDEX IF NOT EXISTS caso_autor_creado ON conceptualizador.caso (autor, created_at);

CREATE TABLE IF NOT EXISTS conceptualizador.fijado (
  actor       text        NOT NULL,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  fijado      boolean     NOT NULL DEFAULT true,     -- desfijar no borra: el rol de la app no tiene DELETE
  cambiado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor, caso_id)
);

CREATE TABLE IF NOT EXISTS conceptualizador.cambio_sesion (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  actor       text        NOT NULL,
  tipo        text        NOT NULL CHECK (tipo IN ('renombrar','archivar','desarchivar','fijar','desfijar')),
  antes       text,
  despues     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cambio_sesion_caso ON conceptualizador.cambio_sesion (caso_id, id);

CREATE TABLE IF NOT EXISTS conceptualizador.aviso (
  id           bigserial   PRIMARY KEY,
  tipo         text        NOT NULL CHECK (tipo IN ('tope_mensajes','tope_sesiones','fuera_de_tema')),
  actor        text        NOT NULL,
  dia          date        NOT NULL,
  detalle      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  entregado_at timestamptz,
  entregado_en text
);
-- Un aviso de tope por usuario, tipo y día: el usuario puede seguir chocando, Esteban se entera una vez.
CREATE UNIQUE INDEX IF NOT EXISTS aviso_uno_por_dia ON conceptualizador.aviso (tipo, actor, dia);
CREATE INDEX IF NOT EXISTS aviso_pendiente ON conceptualizador.aviso (entregado_at, id);

CREATE TABLE IF NOT EXISTS conceptualizador.fuera_tema (
  id          bigserial   PRIMARY KEY,
  actor       text        NOT NULL,
  caso_id     uuid        REFERENCES conceptualizador.caso(id),
  trabajo_id  bigint,
  resumen     text        NOT NULL,                  -- 10 palabras como máximo, nunca el texto
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuera_tema_resumen_corto CHECK (array_length(regexp_split_to_array(btrim(resumen), '[[:space:]]+'), 1) <= 10)
);
CREATE INDEX IF NOT EXISTS fuera_tema_actor ON conceptualizador.fuera_tema (actor, created_at);

-- Topes y quién administra: en la base, no en código. Un tope por persona se pone
-- con la clave `<tope>:<actor>` (p. ej. `tope_mensajes_dia:montalvo`).
INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('tope_mensajes_dia',      '60'),     -- mensajes procesados por el motor, por usuario y día CST
  ('tope_sesiones_dia',      '8'),      -- sesiones nuevas por usuario y día CST
  ('zona_uso',               'America/Mexico_City'),   -- el día del candado es el de CST
  ('admins',                 'esteban.delacruz'),      -- renombran y archivan cualquier sesión
  ('fuera_tema_aviso_n',     '3'),      -- 3 fuera de tema …
  ('fuera_tema_aviso_dias',  '7')       -- … en 7 días = aviso a Esteban
ON CONFLICT (clave) DO NOTHING;

-- ── Ayudantes ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.cfg_txt(p_clave text) RETURNS text
LANGUAGE sql STABLE AS $cfgt$
  SELECT valor FROM conceptualizador.config WHERE clave = p_clave
$cfgt$;

CREATE OR REPLACE FUNCTION conceptualizador.es_admin(p_actor text) RETURNS boolean
LANGUAGE sql STABLE AS $adm$
  SELECT coalesce(p_actor = ANY (string_to_array(replace(conceptualizador.cfg_txt('admins'), ' ', ''), ',')), false)
$adm$;

-- El día de uso de un instante, en la zona del candado (CST).
CREATE OR REPLACE FUNCTION conceptualizador.dia_uso(p_ts timestamptz) RETURNS date
LANGUAGE sql STABLE AS $dia$
  SELECT (p_ts AT TIME ZONE coalesce(conceptualizador.cfg_txt('zona_uso'), 'America/Mexico_City'))::date
$dia$;

-- Tope de una persona: el suyo si lo tiene, si no el general.
CREATE OR REPLACE FUNCTION conceptualizador.tope(p_clave text, p_actor text) RETURNS int
LANGUAGE sql STABLE AS $tope$
  SELECT coalesce((SELECT valor::int FROM conceptualizador.config WHERE clave = p_clave || ':' || p_actor),
                  conceptualizador.cfg(p_clave))
$tope$;

-- Una persona (no el motor, ni los cierres automáticos, ni el acuse).
CREATE OR REPLACE FUNCTION conceptualizador.es_persona(p_autor text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $per$
  SELECT p_autor IS NOT NULL AND p_autor NOT LIKE 'motor-%' AND p_autor NOT IN ('cierres','sistema','acuse')
$per$;

-- Lo que una persona ya gastó HOY (día CST): mensajes que el motor procesa y sesiones nuevas.
CREATE OR REPLACE FUNCTION conceptualizador.uso_hoy(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $uso$
  SELECT jsonb_build_object(
    'dia', conceptualizador.dia_uso(now()),
    'mensajes', (SELECT count(*) FROM conceptualizador.trabajo t
                  LEFT JOIN conceptualizador.mensaje m ON m.id = t.mensaje_id
                  LEFT JOIN conceptualizador.evento  e ON e.id = t.evento_id
                 WHERE t.created_at > now() - interval '2 days'
                   AND conceptualizador.dia_uso(t.created_at) = conceptualizador.dia_uso(now())
                   AND coalesce(m.autor, e.autor) = p_actor),
    'tope_mensajes', conceptualizador.tope('tope_mensajes_dia', p_actor),
    'sesiones', (SELECT count(*) FROM conceptualizador.caso c
                  WHERE c.autor = p_actor AND c.created_at > now() - interval '2 days'
                    AND conceptualizador.dia_uso(c.created_at) = conceptualizador.dia_uso(now())),
    'tope_sesiones', conceptualizador.tope('tope_sesiones_dia', p_actor))
$uso$;

-- Anota el aviso del tope (uno por persona, tipo y día) y devuelve el acuse.
CREATE OR REPLACE FUNCTION conceptualizador.aviso_tope(p_actor text, p_tipo text, p_uso jsonb) RETURNS text
LANGUAGE plpgsql AS $avt$
BEGIN
  INSERT INTO conceptualizador.aviso (tipo, actor, dia, detalle)
  VALUES (p_tipo, p_actor, conceptualizador.dia_uso(now()), p_uso)
  ON CONFLICT (tipo, actor, dia) DO UPDATE SET detalle = EXCLUDED.detalle;
  RETURN 'Llegaste al tope de hoy, avisé a Esteban.';
END
$avt$;

-- ── Eventos: también pasan por el candado si los pide una persona ──────────
-- (Los del motor —continuación— y los de los cierres automáticos no cuentan.)
CREATE OR REPLACE FUNCTION conceptualizador.encolar_evento(p_caso uuid, p_tipo text, p_concepto text,
  p_razon text, p_datos jsonb, p_autor text) RETURNS jsonb
LANGUAGE plpgsql AS $enc$
DECLARE v_ev bigint; v_trab bigint; v_uso jsonb; v_acuse text;
BEGIN
  INSERT INTO conceptualizador.evento (caso_id, tipo, concepto, razon, datos, autor)
  VALUES (p_caso, p_tipo, p_concepto, p_razon, coalesce(p_datos,'{}'::jsonb), p_autor) RETURNING id INTO v_ev;
  IF conceptualizador.es_persona(p_autor) THEN
    v_uso := conceptualizador.uso_hoy(p_autor);
    IF (v_uso->>'mensajes')::int >= (v_uso->>'tope_mensajes')::int THEN
      -- La decisión queda guardada (el evento), pero el motor no la trabaja hoy.
      v_acuse := conceptualizador.aviso_tope(p_autor, 'tope_mensajes', v_uso);
      INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (p_caso, 'motor', 'acuse', v_acuse);
      UPDATE conceptualizador.caso SET ultima_actividad_at = now() WHERE id = p_caso;
      RETURN jsonb_build_object('evento_id', v_ev, 'trabajo_id', NULL, 'tope', true, 'acuse', v_acuse);
    END IF;
  END IF;
  INSERT INTO conceptualizador.trabajo (caso_id, tipo, evento_id) VALUES (p_caso, 'evento', v_ev) RETURNING id INTO v_trab;
  UPDATE conceptualizador.caso SET ultima_actividad_at = now() WHERE id = p_caso;
  RETURN jsonb_build_object('evento_id', v_ev, 'trabajo_id', v_trab);
END
$enc$;

-- ── Lista de sesiones (por persona: su fijado y sus permisos) ──────────────
CREATE OR REPLACE FUNCTION conceptualizador.casos_de(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $casos$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.titulo, 'cliente', c.cliente,
        'pais', c.pais, 'autor', c.autor, 'autor_nombre', c.autor_nombre, 'estado', c.estado, 'demo', c.demo,
        'modo', c.modo, 'disparado_at', c.disparado_at,
        'carpeta', c.carpeta, 'machote_folio', c.machote_folio, 'cierre_motivo', c.cierre_motivo,
        'updated_at', c.updated_at, 'ultima_actividad_at', c.ultima_actividad_at,
        -- V1.31 · archivada = a mano (archivado_at) o por los cierres (estado archivado).
        'archivada', c.archivado_at IS NOT NULL OR c.estado = 'archivado',
        'archivado_at', c.archivado_at, 'archivado_por', c.archivado_por,
        'renombrado_at', c.renombrado_at, 'renombrado_por', c.renombrado_por,
        'fijado', coalesce(f.fijado, false), 'fijado_at', CASE WHEN f.fijado THEN f.cambiado_at END,
        'puede_editar', c.autor = p_actor OR conceptualizador.es_admin(p_actor),
        'ultimo', (SELECT jsonb_build_object('rol', m.rol, 'texto', left(m.texto, 120),
                     'adjuntos', jsonb_array_length(m.adjuntos), 'created_at', m.created_at)
                   FROM conceptualizador.mensaje m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1),
        'acciones', (SELECT count(*) FROM conceptualizador.accion a3 WHERE a3.caso_id = c.id AND a3.estado = 'propuesta'),
        'pendientes', (SELECT count(*) FROM conceptualizador.trabajo t
                       WHERE t.caso_id = c.id AND t.estado IN ('pendiente','tomado')))
        ORDER BY coalesce(f.fijado, false) DESC, CASE WHEN f.fijado THEN f.cambiado_at END DESC NULLS LAST, c.ultima_actividad_at DESC), '[]'::jsonb)
    FROM conceptualizador.caso c
    LEFT JOIN conceptualizador.fijado f ON f.caso_id = c.id AND f.actor = p_actor
$casos$;

-- ── API de la suite (la de la 0003 con los modos de V1.31 y el candado) ─────
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
  v_mcaso  text;
  v_disp   timestamptz;
  v_esdisp boolean;
  v_escie  boolean;
  v_acuse  text;
  v_uso    jsonb;
  v_tope   boolean := false;
  v_c      conceptualizador.caso%ROWTYPE;
  v_tit    text;
  v_fij    boolean;
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
    -- V1.31 · candado: sesiones nuevas por persona y día CST.
    v_uso := conceptualizador.uso_hoy(v_actor);
    IF (v_uso->>'sesiones')::int >= (v_uso->>'tope_sesiones')::int THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TOPE_SESIONES', 'uso', v_uso,
        'mensaje', conceptualizador.aviso_tope(v_actor, 'tope_sesiones', v_uso));
    END IF;
    INSERT INTO conceptualizador.caso (titulo, cliente, pais, autor, autor_nombre, demo, modo)
    VALUES (coalesce(nullif(btrim(p->>'titulo'),''), 'Cotización nueva'), nullif(btrim(p->>'cliente'),''),
            CASE WHEN p->>'pais' = 'usa' THEN 'usa' ELSE 'mx' END, v_actor, p->>'nombre',
            coalesce((p->>'demo')::boolean, false), CASE WHEN p->>'modo_sesion' IN ('acompanamiento','levantamiento') THEN p->>'modo_sesion' ELSE 'libre' END)
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
      v_uso := conceptualizador.uso_hoy(v_actor);
      IF (v_uso->>'sesiones')::int >= (v_uso->>'tope_sesiones')::int THEN
        RETURN jsonb_build_object('ok', false, 'error', 'TOPE_SESIONES', 'uso', v_uso,
          'mensaje', conceptualizador.aviso_tope(v_actor, 'tope_sesiones', v_uso));
      END IF;
      INSERT INTO conceptualizador.caso (titulo, cliente, pais, autor, autor_nombre, demo, modo)
      VALUES (coalesce(nullif(btrim(p->>'titulo'),''), left(btrim(p->>'texto'), 60)),
              nullif(btrim(p->>'cliente'),''),
              CASE WHEN p->>'pais' = 'usa' THEN 'usa' ELSE 'mx' END,
              v_actor, p->>'nombre', coalesce((p->>'demo')::boolean, false), CASE WHEN p->>'modo_sesion' IN ('acompanamiento','levantamiento') THEN p->>'modo_sesion' ELSE 'libre' END)
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
    -- Fase 9 · el modo de la sesión decide si el motor trabaja este mensaje.
    -- «Ya tengo el levantamiento»: antes del disparador NO se encola nada; se guarda y
    -- se acusa al instante. El motor lee todo junto cuando llega «ya es todo».
    SELECT k.modo, k.disparado_at INTO v_mcaso, v_disp FROM conceptualizador.caso k WHERE k.id = v_caso;
    v_esdisp := conceptualizador.es_disparador(p->>'texto');
    v_escie  := lower(btrim(coalesce(p->>'texto',''))) LIKE '/cierre%';
    IF v_mcaso = 'levantamiento' AND v_disp IS NULL AND NOT v_esdisp AND NOT v_escie THEN
      v_trab := NULL;
    ELSE
      -- V1.31 · candado de uso EN LA BASE: pasado el tope, el mensaje se guarda pero NO se
      -- encola, así que ni el principal ni el respaldo lo pueden tomar.
      v_uso := conceptualizador.uso_hoy(v_actor);
      v_tope := (v_uso->>'mensajes')::int >= (v_uso->>'tope_mensajes')::int;
      IF v_tope THEN
        v_trab := NULL;
      ELSE
        INSERT INTO conceptualizador.trabajo (caso_id, tipo, mensaje_id)
        VALUES (v_caso, 'mensaje', v_msg) RETURNING id INTO v_trab;
        UPDATE conceptualizador.mensaje SET trabajo_id = v_trab WHERE id = v_msg;
      END IF;
    END IF;
    -- Un disparador frenado por el tope no cuenta como disparado: el botón sigue ahí para mañana.
    UPDATE conceptualizador.caso SET ultima_actividad_at = now(),
           disparado_at = CASE WHEN v_esdisp AND NOT v_tope AND disparado_at IS NULL THEN now() ELSE disparado_at END
     WHERE id = v_caso;
    -- Fase 11 · lo que no necesita al modelo sale de aquí, al instante.
    v_acuse := CASE WHEN v_tope THEN conceptualizador.aviso_tope(v_actor, 'tope_mensajes', v_uso)
                    ELSE conceptualizador.acuse(v_meta, v_mcaso, v_disp IS NOT NULL, v_esdisp, v_escie) END;
    IF v_acuse IS NOT NULL THEN
      INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (v_caso, 'motor', 'acuse', v_acuse);
    END IF;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_caso, 'mensaje_id', v_msg, 'trabajo_id', v_trab,
                              'adjuntos', v_meta, 'acuse', v_acuse, 'tope', v_tope, 'motor', conceptualizador.estado_motor());

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
    -- El evento lleva TODO el lote (recorrido de prueba, 14-oct: solo traía la última y el motor tuvo
    -- que buscar las demás correcciones en estado.json).
    v_r := conceptualizador.encolar_evento(a.caso_id, 'accion', a.tipo, NULL,
      jsonb_build_object('accion_id', a.id, 'tipo', a.tipo, 'decision', p->>'decision',
        'resultado', coalesce(p->'resultado','{}'::jsonb), 'lote_trabajo_id', a.trabajo_id,
        'lote', CASE WHEN a.tipo = 'conjetura' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('accion_id', x.id, 'titulo', x.titulo,
            'datos', x.datos, 'decision', x.estado, 'resultado', x.resultado) ORDER BY x.id), '[]'::jsonb)
          FROM conceptualizador.accion x WHERE x.caso_id = a.caso_id AND x.tipo = 'conjetura'
           AND x.trabajo_id IS NOT DISTINCT FROM a.trabajo_id) ELSE NULL END), v_actor);
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
    -- V1.31 · fijadas primero (las de ESTA persona), archivada, permisos y uso de hoy.
    RETURN jsonb_build_object('ok', true, 'casos', conceptualizador.casos_de(v_actor),
      'uso', conceptualizador.uso_hoy(v_actor), 'admin', conceptualizador.es_admin(v_actor),
      'avisos_pendientes', CASE WHEN conceptualizador.es_admin(v_actor)
        THEN (SELECT count(*) FROM conceptualizador.aviso WHERE entregado_at IS NULL) END,
      'motor', conceptualizador.estado_motor());

  -- ── V1.31 · la sesión a mano: renombrar, archivar y fijar ──────────────────
  ELSIF v_modo IN ('renombrar','archivar','desarchivar','fijar','desfijar') THEN
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid FOR UPDATE;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_modo IN ('fijar','desfijar') THEN
      -- Fijar es de cada quien: cualquiera fija cualquier sesión, solo en SU lista.
      v_fij := v_modo = 'fijar';
      INSERT INTO conceptualizador.fijado (actor, caso_id, fijado, cambiado_at) VALUES (v_actor, v_c.id, v_fij, now())
      ON CONFLICT (actor, caso_id) DO UPDATE SET fijado = EXCLUDED.fijado, cambiado_at = now();
      INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo) VALUES (v_c.id, v_actor, v_modo);
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'fijado', v_fij);
    END IF;
    -- Renombrar y archivar: solo el autor de la sesión, o un admin (config.admins).
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYA',
        'mensaje', 'Solo quien abrió la sesión, o Esteban, puede ' || CASE WHEN v_modo = 'renombrar' THEN 'renombrarla.' ELSE 'archivarla.' END);
    END IF;
    IF v_modo = 'renombrar' THEN
      v_tit := left(regexp_replace(btrim(coalesce(p->>'texto','')), '[[:space:]]+', ' ', 'g'), 80);
      IF char_length(v_tit) < 3 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NOMBRE_CORTO', 'mensaje', 'El nombre necesita al menos 3 letras.');
      END IF;
      UPDATE conceptualizador.caso SET titulo = v_tit, renombrado_at = now(), renombrado_por = v_actor WHERE id = v_c.id;
      INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues) VALUES (v_c.id, v_actor, 'renombrar', v_c.titulo, v_tit);
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'titulo', v_tit, 'antes', v_c.titulo);
    ELSIF v_modo = 'archivar' THEN
      -- Nunca se borra ni cambia de estado: sigue cerrándose y, con machote, sigue enseñando.
      IF v_c.archivado_at IS NULL THEN
        UPDATE conceptualizador.caso SET archivado_at = now(), archivado_por = v_actor WHERE id = v_c.id;
        INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes) VALUES (v_c.id, v_actor, 'archivar', v_c.estado);
      END IF;
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'archivada', true);
    ELSE
      -- Desarchivar: quita la marca a mano y, si la archivaron los cierres por quieta, la reabre.
      UPDATE conceptualizador.caso SET archivado_at = NULL, archivado_por = NULL,
             estado = CASE WHEN estado = 'archivado' THEN 'abierto' ELSE estado END,
             cierre_motivo = CASE WHEN estado = 'archivado' THEN NULL ELSE cierre_motivo END,
             ultima_actividad_at = CASE WHEN estado = 'archivado' THEN now() ELSE ultima_actividad_at END
       WHERE id = v_c.id;
      INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues)
      VALUES (v_c.id, v_actor, 'desarchivar', v_c.estado, CASE WHEN v_c.estado = 'archivado' THEN 'abierto' ELSE v_c.estado END);
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'archivada', false);
    END IF;

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


-- ── API del motor (la de la 0003 con el lote de eventos, fuera de tema, avisos y uso)
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
  v_max    int;
  v_lease  interval := make_interval(secs => conceptualizador.cfg('lease_segundos'));
  v_abs    jsonb := '[]'::jsonb;
  v_actor  text;
  v_ft     text;
  v_n      int;
  v_desde  date;
  v_hasta  date;
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
    -- Fase 11 · hasta `motor_paralelo` trabajos, UNO por caso: el más viejo de cada caso
    -- que no tenga otro trabajo vivo. Un tomado se considera vivo mientras su último
    -- avance (o su toma) no pase del lease.
    v_max := least(greatest(coalesce(nullif(p->>'max','')::int, 1), 1), conceptualizador.cfg('motor_paralelo'));
    SELECT coalesce(jsonb_agg(jsonb_build_object('trabajo_id', x.id, 'tipo', x.tipo, 'caso_id', x.caso_id) ORDER BY x.id), '[]'::jsonb)
      INTO v_r
      FROM (SELECT * FROM (
              SELECT DISTINCT ON (t2.caso_id) t2.id, t2.tipo, t2.caso_id
                FROM conceptualizador.trabajo t2
               WHERE t2.lote_de IS NULL AND t2.intentos < t2.max_intentos
                 AND (t2.estado = 'pendiente'
                      OR (t2.estado = 'tomado' AND greatest(t2.tomado_at, coalesce(t2.avance_at, t2.tomado_at)) < now() - v_lease))
                 AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo o
                                  WHERE o.caso_id = t2.caso_id AND o.id <> t2.id AND o.estado = 'tomado'
                                    AND greatest(o.tomado_at, coalesce(o.avance_at, o.tomado_at)) >= now() - v_lease)
               ORDER BY t2.caso_id, t2.id) y
            ORDER BY y.id LIMIT v_max) x;
    RETURN jsonb_build_object('ok', true, 'trabajos', v_r,
      -- Compatibilidad con el vigía de una sola cola (vigia-1): el primero.
      'trabajo_id', v_r->0->'trabajo_id', 'tipo', v_r->0->>'tipo', 'caso_id', v_r->0->>'caso_id');

  ELSIF v_modo = 'tomar' THEN
    SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
    IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
    -- Candado por caso: se bloquea el caso y se decide con la fila fresca.
    PERFORM 1 FROM conceptualizador.caso WHERE id = t.caso_id FOR UPDATE;
    SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id FOR UPDATE;
    IF NOT ((t.estado = 'pendiente' OR (t.estado = 'tomado' AND greatest(t.tomado_at, coalesce(t.avance_at, t.tomado_at)) < now() - v_lease))
            AND t.intentos < t.max_intentos) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'YA_TOMADO', 'estado', t.estado, 'tomado_por', t.tomado_por, 'lote_de', t.lote_de);
    END IF;
    IF EXISTS (SELECT 1 FROM conceptualizador.trabajo o
                WHERE o.caso_id = t.caso_id AND o.id <> t.id AND o.estado = 'tomado'
                  AND o.lote_de IS DISTINCT FROM t.id
                  AND greatest(o.tomado_at, coalesce(o.avance_at, o.tomado_at)) >= now() - v_lease) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_OCUPADO', 'detalle', 'otro trabajo del mismo caso está en proceso');
    END IF;
    IF EXISTS (SELECT 1 FROM conceptualizador.trabajo o
                WHERE o.caso_id = t.caso_id AND o.id < t.id AND o.estado = 'pendiente' AND o.lote_de IS NULL
                  AND o.intentos < o.max_intentos) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_OCUPADO', 'detalle', 'hay un trabajo anterior del mismo caso');
    END IF;
    UPDATE conceptualizador.trabajo
       SET estado = 'tomado', tomado_por = v_motor, sesion = v_sesion, tomado_at = now(),
           intentos = intentos + 1, error = NULL, avance = NULL, avance_at = NULL, lote_de = NULL
     WHERE id = v_id
    RETURNING * INTO t;
    -- Lote: los mensajes que llegaron después en el mismo caso se contestan con ESTE
    -- trabajo (ráfaga de fotos o de textos = una sola vuelta del motor).
    -- V1.31 · también un EVENTO (p. ej. las conjeturas contestadas) absorbe los mensajes
    -- posteriores: antes los leía, los resolvía, y el trabajo del mensaje los volvía a
    -- anotar (trabajo doble del caso 4/5 y 7/8 del 14-oct).
    IF t.tipo IN ('mensaje','evento') THEN
      WITH a AS (
        UPDATE conceptualizador.trabajo
           SET estado = 'tomado', tomado_por = v_motor, sesion = v_sesion, tomado_at = now(), lote_de = t.id, error = NULL
         WHERE caso_id = t.caso_id AND id > t.id AND tipo = 'mensaje'
           AND (estado = 'pendiente' OR (estado = 'tomado' AND lote_de = t.id))
        RETURNING id, mensaje_id)
      SELECT coalesce(jsonb_agg(jsonb_build_object('trabajo_id', a.id, 'mensaje_id', a.mensaje_id) ORDER BY a.id), '[]'::jsonb)
        INTO v_abs FROM a;
    END IF;
    RETURN jsonb_build_object('ok', true, 'trabajo', to_jsonb(t), 'absorbidos', v_abs,
      'mensaje', (SELECT to_jsonb(m) FROM conceptualizador.mensaje m WHERE m.id = t.mensaje_id),
      'evento',  (SELECT to_jsonb(e) FROM conceptualizador.evento e WHERE e.id = t.evento_id),
      'hilo', conceptualizador.hilo(t.caso_id));

  ELSIF v_modo = 'avance' THEN
    -- El paso que se ve en la pantalla («escuchando el audio», «calculando el machote»).
    -- Solo el que tiene el trabajo puede escribirlo, y además renueva su lease.
    UPDATE conceptualizador.trabajo SET avance = left(btrim(coalesce(p->>'paso','')), 80), avance_at = now()
     WHERE id = v_id AND estado = 'tomado' AND tomado_por = v_motor AND coalesce(sesion,'') = v_sesion
    RETURNING * INTO t;
    IF t.id IS NOT NULL THEN
      UPDATE conceptualizador.trabajo SET avance = t.avance, avance_at = t.avance_at WHERE lote_de = t.id AND estado = 'tomado';
    END IF;
    RETURN jsonb_build_object('ok', t.id IS NOT NULL);

  ELSIF v_modo = 'por_preparar' THEN
    -- Notas de voz sin transcribir de los últimos 2 días: el vigía las transcribe
    -- en cuanto llegan, sin modelo, para que el análisis no las espere.
    RETURN jsonb_build_object('ok', true, 'adjuntos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('adjunto_id', x.id, 'caso_id', x.caso_id, 'clase', x.clase, 'tipo', x.tipo, 'nombre', x.nombre) ORDER BY x.created_at)
        FROM (SELECT * FROM conceptualizador.adjunto a
               WHERE a.clase = 'audio' AND a.transcripcion IS NULL AND a.created_at > now() - interval '2 days'
               ORDER BY a.created_at LIMIT 3) x), '[]'::jsonb));

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
      -- Una propuesta nueva del mismo tipo REEMPLAZA a la vieja sin resolver: un «Crear machote»
      -- de hace dos respuestas llevaría números viejos (recorrido de prueba, 14-oct).
      UPDATE conceptualizador.accion SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
             resultado = jsonb_build_object('reemplazada_por_trabajo', t.id)
       WHERE caso_id = t.caso_id AND estado = 'propuesta' AND tipo <> 'conjetura'
         AND tipo IN (SELECT x->>'tipo' FROM jsonb_array_elements(v_resp->'acciones') x);
      INSERT INTO conceptualizador.accion (caso_id, trabajo_id, tipo, titulo, datos)
      SELECT t.caso_id, t.id, x->>'tipo', left(coalesce(x->>'titulo', x->>'tipo'), 300), coalesce(x->'datos','{}'::jsonb)
        FROM jsonb_array_elements(v_resp->'acciones') x
       WHERE x->>'tipo' IN ('conjetura','alta_contacto','crear_machote','crear_borrador','enviada','cerrar');
    END IF;
    UPDATE conceptualizador.trabajo SET estado = 'listo', listo_at = now() WHERE id = t.id OR (lote_de = t.id AND estado = 'tomado');
    v_caso := coalesce(v_resp->'caso', '{}'::jsonb);
    UPDATE conceptualizador.caso SET
      carpeta = coalesce(nullif(v_resp->>'carpeta',''), carpeta),
      -- V1.31 · un nombre puesto por una persona ya no lo cambia el motor.
      titulo  = CASE WHEN renombrado_at IS NOT NULL THEN titulo ELSE coalesce(nullif(left(v_caso->>'titulo', 120),''), titulo) END,
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
    -- V1.31 · fuera de tema: usuario, fecha y un resumen de 10 palabras (nunca el texto).
    -- 3 en 7 días de la misma persona = aviso a Esteban (uno por semana).
    v_ft := btrim(coalesce(v_resp->'verifica'->'fuera_de_tema'->>'resumen', ''));
    IF v_ft <> '' THEN
      SELECT coalesce(m.autor, e.autor) INTO v_actor FROM conceptualizador.trabajo t3
        LEFT JOIN conceptualizador.mensaje m ON m.id = t3.mensaje_id
        LEFT JOIN conceptualizador.evento  e ON e.id = t3.evento_id
       WHERE t3.id = t.id;
      v_ft := array_to_string((regexp_split_to_array(v_ft, '[[:space:]]+'))[1:10], ' ');
      INSERT INTO conceptualizador.fuera_tema (actor, caso_id, trabajo_id, resumen)
      VALUES (coalesce(v_actor, 'desconocido'), t.caso_id, t.id, v_ft);
      SELECT count(*) INTO v_n FROM conceptualizador.fuera_tema
       WHERE actor = coalesce(v_actor, 'desconocido')
         AND created_at > now() - make_interval(days => conceptualizador.cfg('fuera_tema_aviso_dias'));
      IF v_n >= conceptualizador.cfg('fuera_tema_aviso_n') AND NOT EXISTS (
           SELECT 1 FROM conceptualizador.aviso a5 WHERE a5.tipo = 'fuera_de_tema' AND a5.actor = coalesce(v_actor, 'desconocido')
              AND a5.created_at > now() - make_interval(days => conceptualizador.cfg('fuera_tema_aviso_dias'))) THEN
        INSERT INTO conceptualizador.aviso (tipo, actor, dia, detalle)
        VALUES ('fuera_de_tema', coalesce(v_actor, 'desconocido'), conceptualizador.dia_uso(now()),
          jsonb_build_object('en_dias', conceptualizador.cfg('fuera_tema_aviso_dias'), 'veces', v_n,
            'resumenes', (SELECT jsonb_agg(jsonb_build_object('fecha', f.created_at, 'resumen', f.resumen) ORDER BY f.id)
                            FROM conceptualizador.fuera_tema f WHERE f.actor = coalesce(v_actor, 'desconocido')
                             AND f.created_at > now() - make_interval(days => conceptualizador.cfg('fuera_tema_aviso_dias')))))
        ON CONFLICT (tipo, actor, dia) DO NOTHING;
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', true, 'trabajo_id', t.id,
      'segundos', round(extract(epoch FROM now() - t.created_at)::numeric, 1));

  ELSIF v_modo = 'error' THEN
    UPDATE conceptualizador.trabajo
       SET estado = CASE WHEN intentos >= max_intentos THEN 'error' ELSE 'pendiente' END,
           error = left(coalesce(p->>'causa','sin causa'), 500),
           tomado_por = NULL, sesion = NULL, tomado_at = NULL, avance = NULL, avance_at = NULL
     WHERE id = v_id AND estado = 'tomado' AND tomado_por = v_motor AND coalesce(sesion,'') = v_sesion
    RETURNING * INTO t;
    -- El lote vuelve a la cola tal cual: sus mensajes no gastaron intento.
    UPDATE conceptualizador.trabajo SET estado = 'pendiente', tomado_por = NULL, sesion = NULL, tomado_at = NULL,
           lote_de = NULL, avance = NULL, avance_at = NULL
     WHERE lote_de = v_id AND estado = 'tomado';
    RETURN jsonb_build_object('ok', t.id IS NOT NULL, 'estado', t.estado);

  ELSIF v_modo = 'aprendizaje' THEN
    INSERT INTO conceptualizador.aprendizaje (resumen, motor) VALUES (coalesce(p->'aprendizaje','{}'::jsonb), v_motor);
    RETURN jsonb_build_object('ok', true);

  -- ── V1.31 · avisos para Esteban (topes y fuera de tema) ────────────────────
  ELSIF v_modo = 'avisos' THEN
    RETURN jsonb_build_object('ok', true, 'avisos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'actor', a.actor, 'dia', a.dia,
               'detalle', a.detalle, 'created_at', a.created_at) ORDER BY a.id)
        FROM conceptualizador.aviso a WHERE a.entregado_at IS NULL), '[]'::jsonb));

  ELSIF v_modo = 'aviso_entregado' THEN
    UPDATE conceptualizador.aviso SET entregado_at = now(), entregado_en = left(coalesce(p->>'canal',''), 200)
     WHERE id = nullif(p->>'aviso_id','')::bigint AND entregado_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'marcado', v_n = 1);

  -- ── V1.31 · uso por persona para el resumen semanal de consolida ───────────
  ELSIF v_modo = 'uso' THEN
    v_hasta := coalesce(nullif(p->>'hasta','')::date, conceptualizador.dia_uso(now()));
    v_desde := coalesce(nullif(p->>'desde','')::date, v_hasta - 6);
    RETURN jsonb_build_object('ok', true, 'desde', v_desde, 'hasta', v_hasta, 'zona', conceptualizador.cfg_txt('zona_uso'),
      'topes', jsonb_build_object('mensajes_dia', conceptualizador.cfg('tope_mensajes_dia'), 'sesiones_dia', conceptualizador.cfg('tope_sesiones_dia')),
      'usuarios', coalesce((
        SELECT jsonb_agg(jsonb_build_object('actor', u.actor,
          'mensajes', (SELECT count(*) FROM conceptualizador.trabajo t4
                         LEFT JOIN conceptualizador.mensaje m ON m.id = t4.mensaje_id
                         LEFT JOIN conceptualizador.evento  e ON e.id = t4.evento_id
                        WHERE coalesce(m.autor, e.autor) = u.actor
                          AND conceptualizador.dia_uso(t4.created_at) BETWEEN v_desde AND v_hasta),
          'sesiones', (SELECT count(*) FROM conceptualizador.caso c WHERE c.autor = u.actor
                          AND conceptualizador.dia_uso(c.created_at) BETWEEN v_desde AND v_hasta),
          'topes', (SELECT count(*) FROM conceptualizador.aviso a WHERE a.actor = u.actor AND a.tipo LIKE 'tope%'
                          AND a.dia BETWEEN v_desde AND v_hasta),
          'fuera_de_tema', (SELECT count(*) FROM conceptualizador.fuera_tema f WHERE f.actor = u.actor
                          AND conceptualizador.dia_uso(f.created_at) BETWEEN v_desde AND v_hasta)) ORDER BY u.actor)
          FROM (SELECT DISTINCT autor AS actor FROM conceptualizador.caso WHERE conceptualizador.es_persona(autor)) u), '[]'::jsonb));
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$mot$;


-- ── Permisos ───────────────────────────────────────────────────────────────
-- CREATE OR REPLACE regresa la función a SECURITY INVOKER: se vuelve a marcar.
-- Las tablas nuevas no se dan al rol de la app: todo pasa por estas funciones.
ALTER FUNCTION conceptualizador.api_suite(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.estado_motor(), conceptualizador.hilo(uuid),
                          conceptualizador.cfg(text), conceptualizador.adjuntos_meta(uuid),
                          conceptualizador.es_disparador(text),
                          conceptualizador.acuse(jsonb, text, boolean, boolean, boolean) TO conceptualizador_app;
