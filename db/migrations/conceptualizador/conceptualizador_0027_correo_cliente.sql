-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0027 · V1.57b (fts-conceptualizador#12): lo que ve el cliente — correo para envío, firma en imagen,
-- altas de contacto con el OK de Esteban, liberaciones de la regla 15 e interruptores de la V1.57b
--
-- Decisiones de Esteban sobre la fase 1 (comentario 6273937527):
--   2. Para y CC aceptan cualquier correo; si no es contacto del cliente en Odoo, aviso y opción de darlo de alta (con su OK).
--   3. Firma en imagen: cada ingeniero la sube desde su perfil en la suite (nunca al repo). El correo pasa a HTML.
--   4. Regla 15 bloquea desde el día 1 (eso lo cuida orden-odoo; aquí solo el interruptor).
--
-- 1. ENVÍO EDITABLE (`correo_v157`, con `enviar_cliente`): `envio_cliente` guarda la LISTA de Para y de CC (cualquier correo
--    válido; los que no son contacto del cliente en Odoo quedan en `no_contactos` y la pantalla los marca), lo que propuso el
--    agente (`asunto_propuesto`, `cuerpo_propuesto`, `tono`) junto a lo que de verdad salió, y quién guardó cambios. Modos nuevos
--    de `api_correo`: `cliente_guardar` (la vista previa 1 con «Guardar»). `cliente_preparar` toma el asunto y el cuerpo que
--    redactó el agente si los trae; `cliente_enviar` acepta las listas. APAGADO: todo igual que la 0022.
-- 2. FIRMA EN IMAGEN: `firma.imagen_b64` (PNG o JPEG, ya comprimida en el teléfono, máximo 110 KB en base64 ≈ 80 KB). Modos
--    `firma_imagen_guardar` / `firma_imagen_quitar` (solo la propia). El hilo NO la trae (pesa); la traen `cliente_preparar`
--    (para la vista previa) y `cliente_enviar` (para el workflow). Funciona con el interruptor apagado: subirla no cambia nada.
-- 3. ALTA DE CONTACTO PROPUESTA: `contacto_propuesto` (correo, nombre, empresa del cliente, quién lo propuso). Modos
--    `cliente_contacto_proponer` (el dueño o Esteban) y `cliente_contacto_resolver` (SOLO el administrador del panel: aprueba
--    con el id que devolvió Odoo, o rechaza). Los correos viven aquí, no en las acciones: nunca llegan al repo.
-- 4. Lo que el agente aprende del correo: modo de motor `envios_autor` {autor, dias} → lo propuesto y lo enviado de sus envíos.
-- 5. Interruptores nuevos, todos en '0': regla15_v157, pago_decreto, horario_autor, tarjeta_v157, correo_v157, vista_cliente.
-- Lo que NO cambia: ningún interruptor existente, ningún modo existente con `correo_v157` apagado.
-- Reversa: db/reversas/027_reversa.sql (quita las envolturas; no borra datos).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 5 · interruptores ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in27$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157',
               'regla15_v157','pago_decreto','horario_autor','tarjeta_v157','correo_v157','vista_cliente']
$in27$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('firma_imagen_max_kb', '110'),              -- base64; una imagen de ~80 KB
  ('correo_max_para', '5'),
  ('correo_max_cc', '8')
ON CONFLICT (clave) DO NOTHING;

-- ── 1 · envío editable ─────────────────────────────────────────────────────
ALTER TABLE conceptualizador.envio_cliente
  ADD COLUMN IF NOT EXISTS para_lista       text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS no_contactos     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS asunto_propuesto text,
  ADD COLUMN IF NOT EXISTS cuerpo_propuesto text,
  ADD COLUMN IF NOT EXISTS tono             jsonb,
  ADD COLUMN IF NOT EXISTS guardado_por     text,
  ADD COLUMN IF NOT EXISTS guardado_at      timestamptz;

-- ── 2 · firma en imagen ────────────────────────────────────────────────────
ALTER TABLE conceptualizador.firma
  ADD COLUMN IF NOT EXISTS imagen_b64  text,
  ADD COLUMN IF NOT EXISTS imagen_mime text,
  ADD COLUMN IF NOT EXISTS imagen_kb   int,
  ADD COLUMN IF NOT EXISTS imagen_at   timestamptz;

-- El hilo trae la firma de quien lee: SIN la imagen (pesa); solo si la tiene.
CREATE OR REPLACE FUNCTION conceptualizador.firma_de(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $fd27$
  SELECT (to_jsonb(f) - 'updated_at' - 'imagen_b64') || jsonb_build_object('tiene_imagen', f.imagen_b64 IS NOT NULL)
    FROM conceptualizador.firma f WHERE f.actor = p_actor
$fd27$;

-- ── 3 · alta de contacto propuesta ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.contacto_propuesto (
  id             bigserial   PRIMARY KEY,
  caso_id        uuid        NOT NULL REFERENCES conceptualizador.caso(id) ON DELETE CASCADE,
  correo         text        NOT NULL,
  nombre         text,
  puesto         text,
  empresa_odoo_id int,
  propuesto_por  text        NOT NULL,
  estado         text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','hecha','rechazada')),
  partner_id     int,
  resuelto_por   text,
  resuelto_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caso_id, correo)
);

CREATE OR REPLACE FUNCTION conceptualizador.correo_valido(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $cv27$
  -- El ancla de fin va como chr(36): el runner no acepta un dólar pegado a una comilla.
  SELECT coalesce(lower(btrim(p)) ~ ('^[^@ ,;<>]+@[^@ ,;<>]+[.][^@ ,;<>]+' || chr(36)), false) AND char_length(btrim(p)) <= 120
$cv27$;

/** Una lista de correos del cuerpo (arreglo JSON de texto): limpios, en minúsculas, sin repetir. NULL si alguno no es válido. */
CREATE OR REPLACE FUNCTION conceptualizador.lista_correos(p jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $lc27$
DECLARE v text[] := '{}'; x text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN '{}'; END IF;
  FOR x IN SELECT lower(btrim(e)) FROM jsonb_array_elements_text(p) e LOOP
    IF x = '' THEN CONTINUE; END IF;
    IF NOT conceptualizador.correo_valido(x) THEN RETURN NULL; END IF;
    IF NOT x = ANY (v) THEN v := v || x; END IF;
  END LOOP;
  RETURN v;
END
$lc27$;

CREATE OR REPLACE FUNCTION conceptualizador.envios_cliente_de(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ecd27$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'folio', e.folio, 'orden', e.orden_nombre, 'para', e.para, 'estado', e.estado,
           'para_lista', to_jsonb(e.para_lista), 'n_cc', coalesce(array_length(e.cc, 1), 0),
           'enviado_por', e.enviado_por, 'enviado_at', e.enviado_at, 'created_at', e.created_at) ORDER BY e.id), '[]'::jsonb)
    FROM conceptualizador.envio_cliente e WHERE e.caso_id = p_caso AND e.estado <> 'cancelado'
$ecd27$;

-- ── api_correo (envoltura 0027) ────────────────────────────────────────────
DO $ren27c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0027prev') THEN
    ALTER FUNCTION conceptualizador.api_correo(jsonb) RENAME TO api_correo_0027prev;
  END IF;
END
$ren27c$;

CREATE OR REPLACE FUNCTION conceptualizador.api_correo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cor27$
DECLARE
  v_modo   text := p->>'modo';
  v_actor  text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_on     boolean := conceptualizador.prendido('correo_v157') AND conceptualizador.prendido('enviar_cliente');
  v_k      conceptualizador.caso%ROWTYPE;
  v_e      conceptualizador.envio_cliente%ROWTYPE;
  v_f      conceptualizador.firma%ROWTYPE;
  v_r      jsonb;
  v_para   text[];
  v_cc     text[];
  v_opc    text[];
  v_no     jsonb;
  v_asunto text;
  v_cuerpo text;
  v_b64    text;
  v_n      int;
  v_ts     bigint;
BEGIN
  IF v_modo NOT IN ('cliente_preparar','cliente_guardar','cliente_enviar','cliente_contacto_proponer','cliente_contacto_resolver',
                    'firma_imagen_guardar','firma_imagen_quitar') THEN
    RETURN conceptualizador.api_correo_0027prev(p);
  END IF;
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;

  -- ── firma en imagen: la propia, con el interruptor apagado también ──
  IF v_modo = 'firma_imagen_quitar' THEN
    UPDATE conceptualizador.firma SET imagen_b64 = NULL, imagen_mime = NULL, imagen_kb = NULL, imagen_at = now() WHERE actor = v_actor;
    RETURN jsonb_build_object('ok', true, 'firma', conceptualizador.firma_de(v_actor));
  END IF;
  IF v_modo = 'firma_imagen_guardar' THEN
    v_b64 := regexp_replace(coalesce(p->>'imagen_b64', ''), '[^A-Za-z0-9+/=]', '', 'g');
    IF coalesce(p->>'mime', '') NOT IN ('image/png', 'image/jpeg') THEN RETURN jsonb_build_object('ok', false, 'error', 'FORMATO', 'mensaje', 'La firma va en PNG o JPG.'); END IF;
    IF char_length(v_b64) < 200 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_IMAGEN'); END IF;
    IF char_length(v_b64) > conceptualizador.cfg('firma_imagen_max_kb') * 1024 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MUY_GRANDE', 'mensaje', 'La firma pesa de más: tiene que quedar abajo de ' || round(conceptualizador.cfg('firma_imagen_max_kb') * 0.74) || ' KB.');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM conceptualizador.firma WHERE actor = v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_SIN_CONFIRMAR', 'mensaje', 'Primero confirma tu firma (nombre, puesto y correo).');
    END IF;
    UPDATE conceptualizador.firma SET imagen_b64 = v_b64, imagen_mime = p->>'mime', imagen_kb = (char_length(v_b64) * 3 / 4 / 1024)::int, imagen_at = now()
     WHERE actor = v_actor;
    RETURN jsonb_build_object('ok', true, 'firma', conceptualizador.firma_de(v_actor));
  END IF;

  -- Con el interruptor apagado, lo de la 0022 tal cual (y los modos nuevos no existen).
  IF NOT v_on THEN
    IF v_modo IN ('cliente_preparar', 'cliente_enviar') THEN RETURN conceptualizador.api_correo_0027prev(p); END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'correo_v157');
  END IF;

  SELECT * INTO v_k FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
  IF v_k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
  IF v_k.autor <> v_actor AND NOT conceptualizador.es_panel_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'La cotización al cliente la envía quien cotiza o Esteban.');
  END IF;

  -- ── alta de contacto: la propone el dueño o Esteban; la resuelve SOLO el administrador del panel ──
  IF v_modo = 'cliente_contacto_proponer' THEN
    IF NOT conceptualizador.correo_valido(p->>'correo') THEN RETURN jsonb_build_object('ok', false, 'error', 'CORREO_INVALIDO'); END IF;
    INSERT INTO conceptualizador.contacto_propuesto (caso_id, correo, nombre, puesto, empresa_odoo_id, propuesto_por)
    VALUES (v_k.id, lower(btrim(p->>'correo')), left(nullif(btrim(coalesce(p->>'nombre', '')), ''), 120), left(nullif(btrim(coalesce(p->>'puesto', '')), ''), 120),
            v_k.cliente_odoo_id, v_actor)
    ON CONFLICT (caso_id, correo) DO UPDATE SET nombre = coalesce(EXCLUDED.nombre, conceptualizador.contacto_propuesto.nombre),
      puesto = coalesce(EXCLUDED.puesto, conceptualizador.contacto_propuesto.puesto)
    RETURNING to_jsonb(conceptualizador.contacto_propuesto.*) INTO v_r;
    RETURN jsonb_build_object('ok', true, 'propuesta', v_r);
  END IF;
  IF v_modo = 'cliente_contacto_resolver' THEN
    IF NOT conceptualizador.es_panel_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SOLO_ADMIN', 'mensaje', 'El alta de un contacto la aprueba Esteban.');
    END IF;
    IF coalesce((p->>'aprobar')::boolean, false) AND conceptualizador.a_entero(p->>'partner_id') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FALTA_PARTNER', 'mensaje', 'Aprobar pide el id del contacto que devolvió Odoo.');
    END IF;
    UPDATE conceptualizador.contacto_propuesto SET estado = CASE WHEN coalesce((p->>'aprobar')::boolean, false) THEN 'hecha' ELSE 'rechazada' END,
           partner_id = conceptualizador.a_entero(p->>'partner_id'), resuelto_por = v_actor, resuelto_at = now()
     WHERE id = conceptualizador.a_entero(p->>'propuesta_id') AND caso_id = v_k.id AND estado = 'pendiente'
    RETURNING to_jsonb(conceptualizador.contacto_propuesto.*) INTO v_r;
    IF v_r IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'PROPUESTA_NO_PENDIENTE'); END IF;
    RETURN jsonb_build_object('ok', true, 'propuesta', v_r);
  END IF;

  -- ── preparar: la 0022 arma la vista previa; aquí se le pone lo que redactó el agente y las listas ──
  IF v_modo = 'cliente_preparar' THEN
    v_r := conceptualizador.api_correo_0027prev(p);
    IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
    v_asunto := nullif(btrim(coalesce(p->>'asunto_agente', '')), '');
    v_cuerpo := nullif(btrim(coalesce(p->>'cuerpo_agente', '')), '');
    IF v_asunto IS NOT NULL AND char_length(v_asunto) NOT BETWEEN 3 AND 200 THEN v_asunto := NULL; END IF;
    IF v_cuerpo IS NOT NULL AND char_length(v_cuerpo) NOT BETWEEN 3 AND 6000 THEN v_cuerpo := NULL; END IF;
    UPDATE conceptualizador.envio_cliente e
       SET para_lista = CASE WHEN e.para IS NULL THEN '{}' ELSE ARRAY[e.para] END,
           asunto = coalesce(v_asunto, e.asunto), cuerpo = coalesce(v_cuerpo, e.cuerpo),
           asunto_propuesto = coalesce(v_asunto, e.asunto), cuerpo_propuesto = coalesce(v_cuerpo, e.cuerpo),
           tono = CASE WHEN jsonb_typeof(p->'tono') = 'object' THEN p->'tono' ELSE NULL END
     WHERE e.id = conceptualizador.a_entero(v_r->'borrador'->>'envio_id')
    RETURNING * INTO v_e;
    SELECT * INTO v_f FROM conceptualizador.firma WHERE actor = v_k.autor;
    RETURN jsonb_set(v_r, ARRAY['borrador'], (v_r->'borrador') || jsonb_build_object(
      'version', 2, 'asunto', v_e.asunto, 'cuerpo', v_e.cuerpo, 'para_lista', to_jsonb(v_e.para_lista), 'tono', v_e.tono,
      'cc_editable', true, 'propuesto_por_agente', v_cuerpo IS NOT NULL)
      || jsonb_build_object('firma', (v_r->'borrador'->'firma') || jsonb_build_object('imagen_b64', v_f.imagen_b64, 'imagen_mime', v_f.imagen_mime,
         'telefono_de', 'hr.employee')));
  END IF;

  SELECT * INTO v_e FROM conceptualizador.envio_cliente WHERE id = conceptualizador.a_entero(p->>'envio_id') AND caso_id = v_k.id FOR UPDATE;
  IF v_e.id IS NULL OR v_e.estado <> 'propuesto' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VISTA_PREVIA_VENCIDA', 'mensaje', 'Esa vista previa ya no está vigente: vuelve a abrir «Correo para envío».');
  END IF;
  -- Las listas: cualquier correo válido. Los que no son contacto del cliente en Odoo se marcan (la pantalla ofrece el alta).
  v_para := conceptualizador.lista_correos(coalesce(p->'para_lista', to_jsonb(v_e.para_lista)));
  v_cc   := conceptualizador.lista_correos(coalesce(p->'cc', to_jsonb(v_e.cc)));
  IF v_para IS NULL OR v_cc IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CORREO_INVALIDO', 'mensaje', 'Hay un correo mal escrito en Para o CC.'); END IF;
  IF coalesce(array_length(v_para, 1), 0) NOT BETWEEN 1 AND conceptualizador.cfg('correo_max_para') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PARA_INVALIDO', 'mensaje', 'Para lleva de 1 a ' || conceptualizador.cfg('correo_max_para') || ' correos.');
  END IF;
  IF coalesce(array_length(v_cc, 1), 0) > conceptualizador.cfg('correo_max_cc') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CC_INVALIDO', 'mensaje', 'CC lleva hasta ' || conceptualizador.cfg('correo_max_cc') || ' correos.');
  END IF;
  SELECT coalesce(array_agg(lower(o->>'correo')), '{}') INTO v_opc FROM jsonb_array_elements(v_e.para_opciones) o;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_no FROM unnest(v_para || v_cc) x WHERE NOT x = ANY (v_opc) AND right(x, 7) <> '@fts.mx';
  v_asunto := btrim(coalesce(p->>'asunto', v_e.asunto));
  v_cuerpo := coalesce(p->>'cuerpo', v_e.cuerpo);
  IF char_length(v_asunto) NOT BETWEEN 3 AND 200 OR char_length(btrim(v_cuerpo)) NOT BETWEEN 3 AND 6000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TEXTO_INVALIDO', 'mensaje', 'El asunto o el cuerpo están vacíos o son demasiado largos.');
  END IF;

  IF v_modo = 'cliente_guardar' THEN
    UPDATE conceptualizador.envio_cliente SET para_lista = v_para, para = v_para[1], cc = v_cc, no_contactos = v_no, asunto = v_asunto, cuerpo = v_cuerpo,
           guardado_por = v_actor, guardado_at = now() WHERE id = v_e.id;
    RETURN jsonb_build_object('ok', true, 'guardado', jsonb_build_object('envio_id', v_e.id, 'para_lista', to_jsonb(v_para), 'cc', to_jsonb(v_cc),
      'no_contactos', v_no, 'asunto', v_asunto, 'cuerpo', v_cuerpo, 'guardado_at', now()));
  END IF;

  -- cliente_enviar · SOLO con el clic de una persona: confirmado + ts + nonce, la vista previa viva de ESTE caso y la firma.
  IF coalesce((p->>'confirmado')::boolean, false) IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_CONFIRMAR'); END IF;
  v_ts := conceptualizador.a_entero(p->>'ts');
  IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
  INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;
  IF v_e.orden_id IS DISTINCT FROM v_k.orden_id THEN RETURN jsonb_build_object('ok', false, 'error', 'ORDEN_DISTINTA'); END IF;
  SELECT * INTO v_f FROM conceptualizador.firma WHERE actor = v_k.autor;
  IF v_f.confirmada_at IS NULL OR v_f.correo IS NULL OR nullif(v_f.puesto_es, '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_SIN_CONFIRMAR', 'mensaje', 'Antes del primer correo, quien cotiza confirma su firma: nombre, puesto y correo de FTS.');
  END IF;
  SELECT count(*) INTO v_n FROM conceptualizador.envio_cliente WHERE enviado_por = v_actor AND estado IN ('enviado','enviando')
     AND enviado_at >= now() - interval '1 day';
  IF v_n >= conceptualizador.cfg('tope_envios_cliente_dia') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOPE', 'mensaje', 'Tope de ' || conceptualizador.cfg('tope_envios_cliente_dia') || ' envíos al día.');
  END IF;
  UPDATE conceptualizador.envio_cliente SET estado = 'enviando', para = v_para[1], para_lista = v_para, cc = v_cc, no_contactos = v_no,
         asunto = v_asunto, cuerpo = v_cuerpo, enviado_por = v_actor, enviado_at = now() WHERE id = v_e.id;
  RETURN jsonb_build_object('ok', true, 'enviar', jsonb_build_object('version', 2, 'envio_id', v_e.id, 'folio', v_e.folio, 'orden_id', v_e.orden_id,
    'idioma', v_e.idioma, 'para', v_para[1], 'para_lista', to_jsonb(v_para), 'cc', to_jsonb(v_cc), 'responder_a', 'sales@fts.mx',
    'asunto', v_asunto, 'cuerpo', v_cuerpo, 'adjunto', v_e.adjunto, 'firma_nombre', v_f.nombre_uso,
    'firma_puesto', CASE WHEN v_e.idioma = 'en' THEN coalesce(v_f.puesto_en, v_f.puesto_es) ELSE v_f.puesto_es END,
    'firma_correo', v_f.correo, 'empleado_id', v_f.empleado_id, 'empresa_id', v_k.empresa_id,
    'firma_imagen_b64', v_f.imagen_b64, 'firma_imagen_mime', v_f.imagen_mime));
END
$cor27$;

-- ── api_suite (envoltura 0027): el hilo trae las altas propuestas del caso (sin correos para quien no es dueño ni Esteban) ──
DO $ren27s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0027prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0027prev;
  END IF;
END
$ren27s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui27$
DECLARE
  v_r    jsonb := conceptualizador.api_suite_0027prev(p);
  v_caso uuid;
  v_aut  text;
BEGIN
  IF p->>'modo' = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND conceptualizador.prendido('correo_v157') AND conceptualizador.prendido('enviar_cliente') THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    SELECT autor INTO v_aut FROM conceptualizador.caso WHERE id = v_caso;
    IF v_caso IS NOT NULL AND (v_aut = p->>'actor' OR conceptualizador.es_panel_admin(p->>'actor')) THEN
      v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object(
        'altas_contacto', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'correo', c.correo, 'nombre', c.nombre, 'puesto', c.puesto, 'estado', c.estado,
            'propuesto_por', c.propuesto_por, 'partner_id', c.partner_id, 'resuelto_por', c.resuelto_por, 'created_at', c.created_at) ORDER BY c.id), '[]'::jsonb)
           FROM conceptualizador.contacto_propuesto c WHERE c.caso_id = v_caso)));
    END IF;
  END IF;
  RETURN v_r;
END
$sui27$;

-- ── api_motor (envoltura 0027): `envios_autor` para aprender del correo (lo propuesto contra lo enviado) ──
DO $ren27m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0027prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0027prev;
  END IF;
END
$ren27m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot27$
BEGIN
  IF p->>'modo' IS DISTINCT FROM 'envios_autor' THEN RETURN conceptualizador.api_motor_0027prev(p); END IF;
  RETURN jsonb_build_object('ok', true, 'envios', (SELECT coalesce(jsonb_agg(jsonb_build_object('folio', e.folio, 'caso_id', e.caso_id, 'estado', e.estado,
      'idioma', e.idioma, 'tono', e.tono, 'asunto_propuesto', e.asunto_propuesto, 'cuerpo_propuesto', e.cuerpo_propuesto, 'asunto', e.asunto, 'cuerpo', e.cuerpo,
      'enviado_at', e.enviado_at) ORDER BY e.id), '[]'::jsonb)
    FROM conceptualizador.envio_cliente e JOIN conceptualizador.caso k ON k.id = e.caso_id
   WHERE k.autor = p->>'autor' AND e.estado IN ('enviado','prueba') AND e.cuerpo_propuesto IS NOT NULL
     AND e.enviado_at >= now() - make_interval(days => least(greatest(coalesce(conceptualizador.a_entero(p->>'dias'), 60), 1), 365)::int)));
END
$mot27$;

-- ── Permisos: la app solo ejecuta las puertas ──────────────────────────────
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo_0027prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0027prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0027prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0027prev(jsonb), conceptualizador.api_suite_0027prev(jsonb), conceptualizador.api_motor_0027prev(jsonb),
  conceptualizador.lista_correos(jsonb), conceptualizador.correo_valido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0027prev(jsonb), conceptualizador.api_suite_0027prev(jsonb), conceptualizador.api_motor_0027prev(jsonb),
  conceptualizador.lista_correos(jsonb), conceptualizador.correo_valido(text) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb), conceptualizador.api_suite(jsonb), conceptualizador.api_motor(jsonb) TO conceptualizador_app;
REVOKE ALL ON conceptualizador.contacto_propuesto FROM PUBLIC;
