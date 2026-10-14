-- ═══════════════════════════════════════════════════════════════════════════
-- 003_conceptualizador.sql · modo de la sesión, acuses al instante y motor en
-- paralelo con candado por caso. MVP rector #4 de fts-conceptualizador,
-- Fases 9 y 11.
--
-- Sobre la 001 y la 002 (no se editan):
--   · caso.modo        libre · acompanamiento («voy a hacer un levantamiento»)
--                      · levantamiento («ya tengo el levantamiento»).
--   · caso.disparado_at cuándo se dijo «ya es todo» (o el botón fijo).
--   · trabajo.avance   el paso que el motor está haciendo, para la pantalla.
--   · trabajo.lote_de  mensajes de una ráfaga que contesta un solo trabajo.
--   · api_motor        `siguiente` en lote (hasta `motor_paralelo`, uno por
--                      caso), `tomar` con candado por caso, `avance`,
--                      `por_preparar` (notas de voz sin transcribir).
--   · api_respaldo     el mismo candado por caso.
--   · api_suite        guarda el modo, reconoce el disparador y contesta al
--                      instante lo que no necesita al modelo (acuses).
--
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE conceptualizador.caso
  ADD COLUMN IF NOT EXISTS modo         text NOT NULL DEFAULT 'libre',
  ADD COLUMN IF NOT EXISTS disparado_at timestamptz;
ALTER TABLE conceptualizador.caso DROP CONSTRAINT IF EXISTS caso_modo_check;
ALTER TABLE conceptualizador.caso ADD CONSTRAINT caso_modo_check
  CHECK (modo IN ('libre','acompanamiento','levantamiento'));

ALTER TABLE conceptualizador.trabajo
  ADD COLUMN IF NOT EXISTS avance    text,
  ADD COLUMN IF NOT EXISTS avance_at timestamptz,
  ADD COLUMN IF NOT EXISTS lote_de   bigint;
CREATE INDEX IF NOT EXISTS trabajo_caso ON conceptualizador.trabajo (caso_id, estado, id);

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('motor_paralelo', '3')   -- trabajos a la vez en el motor principal (uno por caso)
ON CONFLICT (clave) DO NOTHING;

-- ── El disparador: lo mismo escribirlo que tocar el botón fijo ─────────────
CREATE OR REPLACE FUNCTION conceptualizador.es_disparador(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $dis$
  -- \y = límite de palabra: «cotiza» dispara, «cotización de prueba…» no (recorrido Fase 11).
  SELECT coalesce(lower(btrim(p)) ~ '^(ya\s+es\s+todo|es\s+todo|ya\s+termin|cotiza\y)', false)
$dis$;

-- ── Acuse al instante: lo que no necesita al modelo ────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.acuse(p_meta jsonb, p_modo text, p_ya_disparado boolean,
  p_disparo boolean, p_cierre boolean) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $acu$
DECLARE
  f int; a int; d int; o int;
  lista text[] := ARRAY[]::text[];
  n int;
  r text;
BEGIN
  SELECT count(*) FILTER (WHERE x->>'clase' = 'foto'), count(*) FILTER (WHERE x->>'clase' = 'audio'),
         count(*) FILTER (WHERE x->>'clase' = 'pdf'),
         count(*) FILTER (WHERE coalesce(x->>'clase','otro') NOT IN ('foto','audio','pdf'))
    INTO f, a, d, o
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_meta) = 'array' THEN p_meta ELSE '[]'::jsonb END) x;
  IF f > 0 THEN lista := lista || (f || CASE WHEN f = 1 THEN ' foto' ELSE ' fotos' END); END IF;
  IF a > 0 THEN lista := lista || (a || CASE WHEN a = 1 THEN ' nota de voz' ELSE ' notas de voz' END); END IF;
  IF d > 0 THEN lista := lista || (d || CASE WHEN d = 1 THEN ' PDF' ELSE ' PDFs' END); END IF;
  IF o > 0 THEN lista := lista || (o || CASE WHEN o = 1 THEN ' archivo' ELSE ' archivos' END); END IF;
  n := coalesce(array_length(lista, 1), 0);
  r := CASE WHEN n = 0 THEN NULL WHEN n = 1 THEN lista[1]
            ELSE array_to_string(lista[1:n-1], ', ') || ' y ' || lista[n] END;
  IF p_cierre THEN
    RETURN 'Va, la cierro. Te voy a pedir lo que de verdad salió y la gente y los días reales, para compararlo con lo cotizado.';
  END IF;
  IF p_disparo AND NOT p_ya_disparado THEN
    RETURN coalesce('Recibí ' || r || '. ', '') || 'Ya con todo, lo reviso completo: te contesto con lo que entendí, el cliente en Odoo y las preguntas.';
  END IF;
  IF p_modo = 'levantamiento' AND NOT p_ya_disparado THEN
    RETURN coalesce('Recibí ' || r || '.', 'Anotado.') || ' Sigue mandando; cuando acabes toca «Ya es todo».';
  END IF;
  IF r IS NOT NULL THEN RETURN 'Recibí ' || r || '.'; END IF;
  RETURN NULL;
END
$acu$;

-- ── Lecturas ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION conceptualizador.hilo(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $hilo$
  SELECT jsonb_build_object(
    'caso', to_jsonb(c),
    'mensajes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'rol', m.rol, 'autor', m.autor, 'texto', m.texto, 'adjuntos', m.adjuntos,
        'trabajo_id', m.trabajo_id, 'created_at', m.created_at, 'escrito_at', m.escrito_at,
        'cliente_id', m.cliente_id,
        'estado', t.estado, 'tomado_por', t.tomado_por, 'error', t.error,
        'avance', t.avance, 'avance_at', t.avance_at, 'lote_de', t.lote_de) ORDER BY m.id)
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
        'created_at', t.created_at, 'tomado_at', t.tomado_at, 'listo_at', t.listo_at,
        'avance', t.avance, 'avance_at', t.avance_at, 'lote_de', t.lote_de) ORDER BY t.id)
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
      INSERT INTO conceptualizador.trabajo (caso_id, tipo, mensaje_id)
      VALUES (v_caso, 'mensaje', v_msg) RETURNING id INTO v_trab;
      UPDATE conceptualizador.mensaje SET trabajo_id = v_trab WHERE id = v_msg;
    END IF;
    UPDATE conceptualizador.caso SET ultima_actividad_at = now(),
           disparado_at = CASE WHEN v_esdisp AND disparado_at IS NULL THEN now() ELSE disparado_at END
     WHERE id = v_caso;
    -- Fase 11 · lo que no necesita al modelo sale de aquí, al instante.
    v_acuse := conceptualizador.acuse(v_meta, v_mcaso, v_disp IS NOT NULL, v_esdisp, v_escie);
    IF v_acuse IS NOT NULL THEN
      INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (v_caso, 'motor', 'acuse', v_acuse);
    END IF;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_caso, 'mensaje_id', v_msg, 'trabajo_id', v_trab,
                              'adjuntos', v_meta, 'acuse', v_acuse, 'motor', conceptualizador.estado_motor());

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
    RETURN jsonb_build_object('ok', true, 'casos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.titulo, 'cliente', c.cliente,
        'pais', c.pais, 'autor', c.autor, 'autor_nombre', c.autor_nombre, 'estado', c.estado, 'demo', c.demo,
        'modo', c.modo, 'disparado_at', c.disparado_at,
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
    IF t.tipo = 'mensaje' THEN
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
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$mot$;


CREATE OR REPLACE FUNCTION conceptualizador.api_respaldo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $resp$
DECLARE
  v_vivo boolean := (conceptualizador.estado_motor()->>'principal_vivo')::boolean;
  v_ids  jsonb;
BEGIN
  IF coalesce(p->>'modo','buscar') = 'buscar' THEN
    WITH elegidos AS (
      SELECT t.id FROM conceptualizador.trabajo t
       WHERE t.estado = 'pendiente' AND t.lote_de IS NULL
         AND t.intentos < t.max_intentos
         -- Fase 11 · candado por caso: nunca se dispara un trabajo de un caso que ya
         -- tiene otro vivo, ni uno que se brinque a uno anterior del mismo caso.
         AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo o
                          WHERE o.caso_id = t.caso_id AND o.id <> t.id AND o.estado = 'tomado'
                            AND greatest(o.tomado_at, coalesce(o.avance_at, o.tomado_at))
                                >= now() - make_interval(secs => conceptualizador.cfg('lease_segundos')))
         AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo o
                          WHERE o.caso_id = t.caso_id AND o.id < t.id AND o.estado = 'pendiente'
                            AND o.intentos < o.max_intentos)
         AND (NOT v_vivo OR t.created_at < now() - make_interval(secs => conceptualizador.cfg('espera_respaldo_segundos')))
         AND (t.respaldo_disparado_at IS NULL
              OR t.respaldo_disparado_at < now() - make_interval(secs => conceptualizador.cfg('reintento_respaldo_segundos')))
       ORDER BY t.id LIMIT 5
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


-- ── Permisos ───────────────────────────────────────────────────────────────
-- CREATE OR REPLACE regresa la función a SECURITY INVOKER: se vuelve a marcar.
ALTER FUNCTION conceptualizador.api_suite(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_respaldo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.estado_motor(), conceptualizador.hilo(uuid),
                          conceptualizador.cfg(text), conceptualizador.adjuntos_meta(uuid),
                          conceptualizador.es_disparador(text),
                          conceptualizador.acuse(jsonb, text, boolean, boolean, boolean) TO conceptualizador_app;
