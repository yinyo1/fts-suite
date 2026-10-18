-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0019 · V1.54 E3 (fts-conceptualizador#11): ver, descargar y ENVIAR la cotización al cliente
--
-- Sale de sales@fts.mx (workflow conceptualizador/cotizacion-cliente, Graph), con responder-a sales@, copia a quien cotiza y
-- al ingeniero comercial del caso, la firma de quien cotiza y el PDF de Odoo. NUNCA lo manda el agente: solo el clic de una
-- persona en «Enviar» de la vista previa (el motor no tiene modo para esto, y `cliente_enviar` exige `confirmado` + nonce).
--
-- 1. TABLA `envio_cliente` (vacía): un renglón por vista previa; los destinatarios posibles se guardan AL PREPARAR (los leyó
--    el workflow de Odoo: el contacto del caso y los contactos del cliente) y al enviar solo se acepta uno de ellos.
-- 2. `api_correo` (envoltura, la de antes queda como api_correo_0019prev): modos `cliente_ver` (Ver y Descargar),
--    `cliente_preparar`, `cliente_enviar`, `cliente_resultado`. Todo detrás de `enviar_cliente` (de la 0018, en '0'). Con `condiciones_caso` prendido y una
--    propuesta de condiciones en el caso, no se prepara hasta que estén listas (el mismo candado del borrador).
-- 3. `api_suite` (envoltura): `hilo` trae `envios_cliente` con el interruptor prendido.
-- 4. CONFIG nueva: tope_envios_cliente_dia = 10 (por persona).
-- 5. `condiciones_cerradas_machote(machote)`: el candado de condiciones para conceptualizador/orden-odoo (lo lee su consulta
--    «Postgres - Leer machote»; ese cambio del workflow va aparte, con el «va»).
-- Lo que NO cambia: ningún interruptor, ningún modo existente, ningún correo a proveedor.
-- Reversa: db/reversas/019_reversa.sql (borra las envolturas y devuelve los nombres; no borra datos).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conceptualizador.envio_cliente (
  id             bigserial   PRIMARY KEY,
  folio          text        NOT NULL UNIQUE,
  caso_id        uuid        NOT NULL REFERENCES conceptualizador.caso(id) ON DELETE CASCADE,
  orden_id       int         NOT NULL,
  orden_nombre   text,
  idioma         text        NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','en')),
  para_opciones  jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{nombre, correo}] leídos de Odoo al preparar
  para           text,
  cc             text[]      NOT NULL DEFAULT '{}',
  asunto         text,
  cuerpo         text,
  adjunto        text,
  estado         text        NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto','enviando','enviado','prueba','error','cancelado')),
  graph_status   int,
  error          text,
  preparado_por  text        NOT NULL,
  enviado_por    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  enviado_at     timestamptz
);
CREATE INDEX IF NOT EXISTS envio_cliente_caso ON conceptualizador.envio_cliente (caso_id, id);
CREATE SEQUENCE IF NOT EXISTS conceptualizador.envio_cliente_folio_seq;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('tope_envios_cliente_dia', '10') ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION conceptualizador.envios_cliente_de(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ecd19$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'folio', e.folio, 'orden', e.orden_nombre, 'para', e.para, 'estado', e.estado,
           'enviado_por', e.enviado_por, 'enviado_at', e.enviado_at, 'created_at', e.created_at) ORDER BY e.id), '[]'::jsonb)
    FROM conceptualizador.envio_cliente e WHERE e.caso_id = p_caso AND e.estado <> 'cancelado'
$ecd19$;

-- ── Candado de condiciones para conceptualizador/orden-odoo (que trabaja por machote, no por caso) ────────
-- true = NO se puede crear/actualizar el borrador: interruptor prendido, el caso del machote tiene propuesta y no está lista.
-- Sin caso, sin propuesta o apagado: false (lo de siempre). La app la puede llamar; no expone nada más que el booleano.
CREATE OR REPLACE FUNCTION conceptualizador.condiciones_cerradas_machote(p_machote uuid) RETURNS boolean
LANGUAGE sql STABLE AS $ccm19$
  SELECT conceptualizador.prendido('condiciones_caso') AND EXISTS (
    SELECT 1 FROM conceptualizador.caso k JOIN conceptualizador.condicion_propuesta cp ON cp.caso_id = k.id
     WHERE k.machote_id = p_machote AND NOT conceptualizador.condiciones_listas(k.id))
$ccm19$;
ALTER FUNCTION conceptualizador.condiciones_cerradas_machote(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.condiciones_cerradas_machote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.condiciones_cerradas_machote(uuid) TO conceptualizador_app;

-- ── api_correo (envoltura) ─────────────────────────────────────────────────
DO $ren19c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0019prev') THEN
    ALTER FUNCTION conceptualizador.api_correo(jsonb) RENAME TO api_correo_0019prev;
  END IF;
END
$ren19c$;

CREATE OR REPLACE FUNCTION conceptualizador.api_correo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cor19$
DECLARE
  v_modo   text := p->>'modo';
  v_actor  text := nullif(btrim(p->>'actor'), '');
  v_d      jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_k      conceptualizador.caso%ROWTYPE;
  v_e      conceptualizador.envio_cliente%ROWTYPE;
  v_f      conceptualizador.firma%ROWTYPE;
  v_opc    jsonb := '[]'::jsonb;
  v_x      jsonb;
  v_para   text;
  v_idioma text;
  v_asunto text;
  v_cuerpo text;
  v_cc     text[] := '{}';
  v_ing    text;
  v_n      int;
  v_ts     bigint;
  v_folio  text;
BEGIN
  IF v_modo NOT IN ('cliente_ver','cliente_preparar','cliente_enviar','cliente_resultado') THEN RETURN conceptualizador.api_correo_0019prev(p); END IF;
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
  IF NOT conceptualizador.prendido('enviar_cliente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'enviar_cliente');
  END IF;

  IF v_modo = 'cliente_resultado' THEN
    -- Lo llama el workflow DESPUÉS de Graph. Solo un 202 cuenta como enviado.
    SELECT * INTO v_e FROM conceptualizador.envio_cliente WHERE id = conceptualizador.a_entero(p->>'envio_id') FOR UPDATE;
    IF v_e.id IS NULL OR v_e.estado <> 'enviando' THEN RETURN jsonb_build_object('ok', false, 'error', 'ENVIO_NO_EN_CURSO'); END IF;
    IF conceptualizador.a_entero(p->>'graph_status') = 202 AND coalesce((p->>'modo_prueba')::boolean, false) THEN
      -- En prueba el correo salió SOLO a sales@: queda registrado, pero el caso y «Ya la mandé» no cambian.
      UPDATE conceptualizador.envio_cliente SET estado = 'prueba', graph_status = 202, enviado_at = now() WHERE id = v_e.id;
    ELSIF conceptualizador.a_entero(p->>'graph_status') = 202 THEN
      UPDATE conceptualizador.envio_cliente SET estado = 'enviado', graph_status = 202, enviado_at = now() WHERE id = v_e.id;
      -- Igual que «Ya la mandé» (0002): la acción `enviada` pendiente queda hecha y el caso pasa a enviada.
      UPDATE conceptualizador.accion SET estado = 'hecha', hecha_por = v_actor, hecha_at = now(),
             resultado = coalesce(resultado, '{}'::jsonb) || jsonb_build_object('via', 'correo', 'folio', v_e.folio)
       WHERE caso_id = v_e.caso_id AND tipo = 'enviada' AND estado = 'propuesta';
      UPDATE conceptualizador.caso SET estado = CASE WHEN estado = 'abierto' THEN 'enviada' ELSE estado END,
             enviada_at = coalesce(enviada_at, now()), updated_at = now() WHERE id = v_e.caso_id;
    ELSE
      UPDATE conceptualizador.envio_cliente SET estado = 'error', graph_status = conceptualizador.a_entero(p->>'graph_status'),
             error = left(coalesce(p->>'error', 'Graph no devolvió 202'), 300) WHERE id = v_e.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'envio', (SELECT to_jsonb(x) - 'para_opciones' - 'cuerpo' FROM conceptualizador.envio_cliente x WHERE x.id = v_e.id));
  END IF;

  SELECT * INTO v_k FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
  IF v_k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
  IF v_k.autor <> v_actor AND NOT conceptualizador.es_panel_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'La cotización al cliente la envía quien cotiza o Esteban.');
  END IF;
  IF v_k.estado NOT IN ('abierto','enviada') THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_CERRADO'); END IF;
  IF v_k.orden_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_ORDEN', 'mensaje', 'Primero se crea la cotización en Odoo (borrador).');
  END IF;
  -- Ver y Descargar: solo la orden del caso (el workflow la lee de Odoo y baja el PDF del portal). No pide firma ni condiciones.
  IF v_modo = 'cliente_ver' THEN
    RETURN jsonb_build_object('ok', true, 'caso', jsonb_build_object('orden_id', v_k.orden_id, 'orden_nombre', v_k.orden_nombre,
      'oportunidad_id', v_k.oportunidad_id, 'contacto_odoo_id', v_k.contacto_odoo_id, 'autor', v_k.autor));
  END IF;
  IF conceptualizador.prendido('condiciones_caso') AND EXISTS (SELECT 1 FROM conceptualizador.condicion_propuesta WHERE caso_id = v_k.id)
     AND NOT conceptualizador.condiciones_listas(v_k.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CONDICIONES_PENDIENTES', 'mensaje', 'Faltan condiciones por revisar en la tarjeta «Revisa las condiciones».');
  END IF;
  -- La firma es la de QUIEN COTIZA (el autor del caso), aunque el clic lo dé Esteban.
  SELECT * INTO v_f FROM conceptualizador.firma WHERE actor = v_k.autor;
  IF v_f.confirmada_at IS NULL OR v_f.correo IS NULL OR nullif(v_f.puesto_es, '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_SIN_CONFIRMAR', 'mensaje', 'Antes del primer correo, quien cotiza confirma su firma: nombre, puesto y correo de FTS.');
  END IF;
  v_idioma := CASE WHEN v_k.pais = 'usa' OR v_k.empresa_id = 6 THEN 'en' ELSE 'es' END;

  IF v_modo = 'cliente_preparar' THEN
    -- Lo leído de Odoo por el workflow: la orden (debe ser la del caso), sus contactos y el ingeniero comercial.
    IF conceptualizador.a_entero(v_d->>'orden_id') IS DISTINCT FROM v_k.orden_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ORDEN_DISTINTA', 'mensaje', 'La orden de Odoo no es la del caso.');
    END IF;
    IF v_d->>'state' NOT IN ('draft','sent') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ESTADO_NO_ENVIABLE', 'mensaje', 'Solo se envía una cotización en borrador o enviada.', 'estado', v_d->>'state');
    END IF;
    FOR v_x IN SELECT x FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_d->'contactos') = 'array' THEN v_d->'contactos' ELSE '[]'::jsonb END) x LIMIT 20 LOOP
      IF lower(btrim(coalesce(v_x->>'correo', ''))) ~ '^[^@ ]+@[^@ ]+[.][^@ ]+' AND position(' ' in btrim(v_x->>'correo')) = 0
         AND NOT v_opc @> jsonb_build_array(jsonb_build_object('correo', lower(btrim(v_x->>'correo')))) THEN
        v_opc := v_opc || jsonb_build_array(jsonb_build_object('nombre', left(coalesce(v_x->>'nombre', ''), 80), 'correo', lower(btrim(v_x->>'correo'))));
      END IF;
    END LOOP;
    IF jsonb_array_length(v_opc) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SIN_CORREO_CLIENTE', 'mensaje', 'El cliente no tiene correo en Odoo (ni la empresa ni sus contactos).');
    END IF;
    v_cc := ARRAY[v_f.correo];
    v_ing := lower(nullif(btrim(coalesce(v_d->>'ingeniero_correo', '')), ''));
    IF v_ing IS NOT NULL AND right(v_ing, 7) = '@fts.mx' AND NOT v_ing = ANY (v_cc) THEN v_cc := v_cc || v_ing; END IF;
    v_asunto := CASE WHEN v_idioma = 'en' THEN 'Quotation ' ELSE 'Cotización ' END || coalesce(v_d->>'orden_nombre', v_k.orden_nombre, '')
                || ' · ' || coalesce(nullif(v_k.titulo, ''), v_k.cliente, '');
    v_cuerpo := CASE WHEN v_idioma = 'en'
      THEN 'Hello,' || chr(10) || chr(10) || 'Attached is our quotation ' || coalesce(v_d->>'orden_nombre', '') || ' for ' || coalesce(nullif(v_k.titulo, ''), 'the project') || '.'
           || chr(10) || 'Let us know if you have any questions or would like to review it together.'
      ELSE 'Buen día,' || chr(10) || chr(10) || 'Le compartimos la cotización ' || coalesce(v_d->>'orden_nombre', '') || ' de ' || coalesce(nullif(v_k.titulo, ''), 'el proyecto') || '.'
           || chr(10) || 'Quedamos atentos a sus comentarios o para revisarla juntos.' END;
    -- Una vista previa viva por caso: la anterior sin enviar se cancela.
    UPDATE conceptualizador.envio_cliente SET estado = 'cancelado' WHERE caso_id = v_k.id AND estado = 'propuesto';
    v_folio := 'CZE-' || nextval('conceptualizador.envio_cliente_folio_seq');
    v_para := coalesce((SELECT o->>'correo' FROM jsonb_array_elements(v_opc) o WHERE o->>'correo' = lower(btrim(coalesce(v_d->>'contacto_correo', ''))) LIMIT 1), v_opc->0->>'correo');
    INSERT INTO conceptualizador.envio_cliente (folio, caso_id, orden_id, orden_nombre, idioma, para_opciones, para, cc, asunto, cuerpo, adjunto, preparado_por)
    VALUES (v_folio, v_k.id, v_k.orden_id, coalesce(v_d->>'orden_nombre', v_k.orden_nombre), v_idioma, v_opc, v_para, v_cc, v_asunto, v_cuerpo,
            coalesce(v_d->>'orden_nombre', v_k.orden_nombre, 'cotizacion') || '.pdf', v_actor)
    RETURNING * INTO v_e;
    RETURN jsonb_build_object('ok', true, 'borrador', jsonb_build_object('envio_id', v_e.id, 'folio', v_e.folio, 'idioma', v_idioma,
      'para', v_e.para, 'para_opciones', v_opc, 'cc', to_jsonb(v_e.cc), 'responder_a', 'sales@fts.mx', 'de', 'sales@fts.mx',
      'asunto', v_e.asunto, 'cuerpo', v_e.cuerpo, 'adjunto', v_e.adjunto,
      'firma', jsonb_build_object('nombre', v_f.nombre_uso, 'puesto', CASE WHEN v_idioma = 'en' THEN coalesce(v_f.puesto_en, v_f.puesto_es) ELSE v_f.puesto_es END,
                                  'correo', v_f.correo, 'empleado_id', v_f.empleado_id)));
  END IF;

  -- cliente_enviar · SOLO con el clic de una persona: confirmado + ts + nonce, y la vista previa viva de ESTE caso.
  IF coalesce((p->>'confirmado')::boolean, false) IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_CONFIRMAR'); END IF;
  v_ts := conceptualizador.a_entero(p->>'ts');
  IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
  INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;
  SELECT * INTO v_e FROM conceptualizador.envio_cliente WHERE id = conceptualizador.a_entero(p->>'envio_id') AND caso_id = v_k.id FOR UPDATE;
  IF v_e.id IS NULL OR v_e.estado <> 'propuesto' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VISTA_PREVIA_VENCIDA', 'mensaje', 'Esa vista previa ya no está vigente: vuelve a abrir «Enviar al cliente».');
  END IF;
  IF v_e.orden_id IS DISTINCT FROM v_k.orden_id THEN RETURN jsonb_build_object('ok', false, 'error', 'ORDEN_DISTINTA'); END IF;
  v_para := lower(btrim(coalesce(p->>'para', v_e.para, '')));
  IF NOT v_e.para_opciones @> jsonb_build_array(jsonb_build_object('correo', v_para)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PARA_NO_PERMITIDO', 'mensaje', 'Solo se envía a un contacto del cliente registrado en Odoo.');
  END IF;
  v_asunto := btrim(coalesce(p->>'asunto', v_e.asunto));
  v_cuerpo := coalesce(p->>'cuerpo', v_e.cuerpo);
  IF char_length(v_asunto) NOT BETWEEN 3 AND 200 OR char_length(btrim(v_cuerpo)) NOT BETWEEN 3 AND 6000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TEXTO_INVALIDO', 'mensaje', 'El asunto o el cuerpo están vacíos o son demasiado largos.');
  END IF;
  SELECT count(*) INTO v_n FROM conceptualizador.envio_cliente WHERE enviado_por = v_actor AND estado IN ('enviado','enviando')
     AND enviado_at >= now() - interval '1 day';
  IF v_n >= conceptualizador.cfg('tope_envios_cliente_dia') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOPE', 'mensaje', 'Tope de ' || conceptualizador.cfg('tope_envios_cliente_dia') || ' envíos al día.');
  END IF;
  UPDATE conceptualizador.envio_cliente SET estado = 'enviando', para = v_para, asunto = v_asunto, cuerpo = v_cuerpo,
         enviado_por = v_actor, enviado_at = now() WHERE id = v_e.id;
  RETURN jsonb_build_object('ok', true, 'enviar', jsonb_build_object('envio_id', v_e.id, 'folio', v_e.folio, 'orden_id', v_e.orden_id,
    'idioma', v_e.idioma, 'para', v_para, 'cc', to_jsonb(v_e.cc), 'responder_a', 'sales@fts.mx', 'asunto', v_asunto, 'cuerpo', v_cuerpo,
    'adjunto', v_e.adjunto, 'firma_nombre', v_f.nombre_uso,
    'firma_puesto', CASE WHEN v_e.idioma = 'en' THEN coalesce(v_f.puesto_en, v_f.puesto_es) ELSE v_f.puesto_es END,
    'firma_correo', v_f.correo, 'empleado_id', v_f.empleado_id));
END
$cor19$;

-- ── api_suite (envoltura): el hilo trae los envíos al cliente ──────────────
DO $ren19s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0019prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0019prev;
  END IF;
END
$ren19s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui19$
DECLARE
  v_r    jsonb := conceptualizador.api_suite_0019prev(p);
  v_caso uuid;
BEGIN
  IF p->>'modo' = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND conceptualizador.prendido('enviar_cliente') THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    -- Dentro de `hilo` (la pantalla lee r.hilo).
    IF v_caso IS NOT NULL THEN v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object('envios_cliente', conceptualizador.envios_cliente_de(v_caso))); END IF;
  END IF;
  RETURN v_r;
END
$sui19$;

-- ── Permisos: la app solo ejecuta las puertas ──────────────────────────────
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo_0019prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0019prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0019prev(jsonb), conceptualizador.api_suite_0019prev(jsonb),
  conceptualizador.envios_cliente_de(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0019prev(jsonb), conceptualizador.api_suite_0019prev(jsonb),
  conceptualizador.envios_cliente_de(uuid) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb), conceptualizador.api_suite(jsonb) TO conceptualizador_app;
