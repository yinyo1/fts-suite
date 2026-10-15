-- ═══════════════════════════════════════════════════════════════════════════
-- chat_0004_mensaje_sin_trabajo.sql · Un producto puede guardar un mensaje SIN encolar trabajo (Marketing v3, #421)
--
-- Por qué: en Marketing v3 un toque de seguimiento no debe disparar un trabajo del motor por cada
-- mensaje. La pantalla responde al instante con la propuesta mecánica, y el motor entra en ráfaga:
-- un trabajo por conversación cuando se juntan toques o cuando la persona pide sugerencia.
--
-- ADITIVA y genérica: chat.api_suite (modo enviar) respeta lo que conteste el gancho «enviar» del
-- producto: {sin_trabajo:true} guarda el mensaje sin trabajo; {sin_trabajo:true, encolar:true,
-- datos_trabajo:{…}} lo encola de todos modos (la ráfaga: chat.encolar junta los mensajes en el
-- trabajo pendiente). Un producto que no contesta eso se comporta igual que antes.
-- El conceptualizador no usa el esquema chat: no lo toca.
--
-- El cuerpo de api_suite sale del de chat_0003 con UN cambio (el encolar del modo enviar); se
-- generó por programa, no a mano. Correrla dos veces no hace nada la segunda.
-- Reversa: otra migración con el cuerpo de chat_0003.
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

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
    SELECT count(*) INTO n FROM chat.sesion WHERE producto = prod AND autor = actor AND (created_at AT TIME ZONE 'America/Monterrey')::date = chat.hoy() AND NOT demo AND cuenta_tope;
    IF n >= chat.cfg(prod, 'tope_sesiones_dia') THEN RETURN chat.err('TOPE_SESIONES', 'Llegaste al tope de sesiones de hoy.'); END IF;
    g := chat.ext(prod, 'gancho', 'nueva', req);
    IF g IS NOT NULL AND (g->>'ok')::boolean IS FALSE THEN RETURN g; END IF;
    INSERT INTO chat.sesion (producto, tipo, titulo, autor, autor_nombre, local_id, demo, datos, cuenta_tope)
    VALUES (prod, coalesce(nullif(req->>'tipo',''), 'libre'), left(coalesce(nullif(btrim(req->>'titulo'),''), 'Sesión nueva'), 120), actor, req->>'nombre',
            req->>'local_id', coalesce((req->>'demo')::boolean, false), coalesce(req->'datos', '{}'::jsonb), true)
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
    -- chat_0004: el producto puede decir que este mensaje NO dispara trabajo (gancho enviar → sin_trabajo).
    -- Marketing v3: un toque de seguimiento se guarda y la pantalla responde al instante; el motor entra en ráfaga.
    IF coalesce((g->>'sin_trabajo')::boolean, false) THEN
      v_tid := NULL;
      IF coalesce((g->>'encolar')::boolean, false) THEN
        v_tid := chat.encolar(s.id, 'mensaje', actor, coalesce(g->'datos_trabajo', '{}'::jsonb), v_mid);
      END IF;
    ELSE
      v_tid := chat.encolar(s.id, 'mensaje', actor, '{}'::jsonb, v_mid);
    END IF;
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

ALTER FUNCTION chat.api_suite(jsonb) OWNER TO chat_app;
