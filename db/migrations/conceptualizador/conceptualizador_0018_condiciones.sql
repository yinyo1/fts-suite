-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0018 · V1.54 E1 (fts-conceptualizador#11 y #10): condiciones de la cotización
--
-- 1. INTERRUPTORES nuevos, todos en '0' (con todos apagados = V1.53b.1 de hoy):
--      condiciones_caso    tarjeta «Revisa las condiciones» y su candado antes del borrador
--      nucleo_chat         V1.53c: la pantalla del conceptualizador con el núcleo shared/chat
--      machote_chat        E2: tabla del machote de 3 columnas colapsada y el popup «Abrir machote»
--      enviar_cliente      E3: Ver / Descargar PDF de Odoo / Enviar al cliente
--      rastreo_respuestas  E3: leer las respuestas del cliente en sales@ y ligarlas al caso
-- 2. TABLAS VACÍAS. Los textos del catálogo NO van aquí: este archivo se publica en fts-suite (público). Los sube el motor
--    desde el repo privado (modo `terminos_cargar`). Las condiciones de cada caso las propone el motor (`condiciones_proponer`)
--    y las aprueba el humano (evento `condicion` de la pantalla, o `condiciones_decidir` del motor cuando fue por voz o texto).
-- 3. `condiciones_de(caso)`: lo que pinta la tarjeta (renglones con su estado, faltan) y `condiciones_listas(caso)`: el
--    candado (true solo si no queda ningún crítico sin check ni dato por preguntar). `hilo` los trae con el interruptor prendido.
-- Lo que NO cambia: ningún interruptor existente, ningún valor de config, ningún modo existente.
-- Reversa: db/reversas/018_reversa.sql (borra las envolturas y devuelve los nombres; no borra datos).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente (los renombres van una sola vez).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · interruptores ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in18$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas']
$in18$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── 2 · tablas ─────────────────────────────────────────────────────────────
-- Catálogo (vacío al migrar). Una fila por clave e idioma.
CREATE TABLE IF NOT EXISTS conceptualizador.termino (
  clave      text        NOT NULL,
  idioma     text        NOT NULL CHECK (idioma IN ('es','en')),
  bloque     text        NOT NULL CHECK (bloque IN ('proyecto','legal')),
  paquetes   text[]      NOT NULL,
  paises     text[]      NOT NULL,
  orden      int         NOT NULL DEFAULT 0,
  titulo     text,
  texto      text        NOT NULL,
  critico    boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (clave, idioma)
);
CREATE TABLE IF NOT EXISTS conceptualizador.termino_meta (
  id            int         PRIMARY KEY CHECK (id = 1),
  version       text        NOT NULL,
  revisado_legal boolean    NOT NULL DEFAULT false,
  cargado_at    timestamptz NOT NULL DEFAULT now()
);
-- La propuesta completa del motor para un caso (hitos, datos clave, condiciones, legal, faltan), una por caso.
CREATE TABLE IF NOT EXISTS conceptualizador.condicion_propuesta (
  caso_id    uuid        PRIMARY KEY REFERENCES conceptualizador.caso(id) ON DELETE CASCADE,
  propuesta  jsonb       NOT NULL,
  version    text,
  at         timestamptz NOT NULL DEFAULT now()
);
-- Un renglón de la tarjeta por clave. Gana la última decisión del dueño o de Esteban (V1.42).
CREATE TABLE IF NOT EXISTS conceptualizador.condicion_caso (
  caso_id    uuid        NOT NULL REFERENCES conceptualizador.caso(id) ON DELETE CASCADE,
  clave      text        NOT NULL,
  critico    boolean     NOT NULL DEFAULT true,
  titulo     text        NOT NULL,
  propuesto  text        NOT NULL,
  fuente     text,
  estado     text        NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto','aprobado','corregido','quitado')),
  valor      text,
  por        text,
  camino     text        CHECK (camino IN ('boton','texto','voz')),
  decidido_at timestamptz,
  orden      int         NOT NULL DEFAULT 0,
  PRIMARY KEY (caso_id, clave)
);
-- La bitácora: quién, cuándo, por qué camino, antes y después (también lo que el motor reabrió al cambiar la propuesta).
CREATE TABLE IF NOT EXISTS conceptualizador.condicion_cambio (
  id         bigserial   PRIMARY KEY,
  caso_id    uuid        NOT NULL,
  clave      text        NOT NULL,
  accion     text        NOT NULL,
  antes      text,
  despues    text,
  por        text        NOT NULL,
  camino     text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS condicion_cambio_caso ON conceptualizador.condicion_cambio (caso_id, id);

-- ── 3 · lectura y candado ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.condiciones_de(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $cd18$
  SELECT jsonb_build_object(
    'renglones', coalesce((SELECT jsonb_agg(jsonb_build_object('clave', c.clave, 'critico', c.critico, 'titulo', c.titulo,
                   'propuesto', c.propuesto, 'fuente', c.fuente, 'estado', c.estado, 'valor', coalesce(c.valor, c.propuesto),
                   'por', c.por, 'camino', c.camino, 'decidido_at', c.decidido_at) ORDER BY c.orden, c.clave)
                 FROM conceptualizador.condicion_caso c WHERE c.caso_id = p_caso), '[]'::jsonb),
    'faltan_check', (SELECT count(*) FROM conceptualizador.condicion_caso c WHERE c.caso_id = p_caso AND c.critico AND c.estado = 'propuesto'),
    'sin_dato', coalesce((SELECT jsonb_array_length(p.propuesta->'faltan') FROM conceptualizador.condicion_propuesta p WHERE p.caso_id = p_caso), 0),
    'faltan', coalesce((SELECT p.propuesta->'faltan' FROM conceptualizador.condicion_propuesta p WHERE p.caso_id = p_caso), '[]'::jsonb),
    'hitos', (SELECT p.propuesta->'hitos' FROM conceptualizador.condicion_propuesta p WHERE p.caso_id = p_caso),
    'propuesta_at', (SELECT p.at FROM conceptualizador.condicion_propuesta p WHERE p.caso_id = p_caso),
    'borrador_legal', NOT coalesce((SELECT m.revisado_legal FROM conceptualizador.termino_meta m WHERE m.id = 1), false))
$cd18$;

-- true solo con propuesta, sin críticos sin check y sin datos por preguntar. Sin propuesta = false (no hay nada que aprobar).
CREATE OR REPLACE FUNCTION conceptualizador.condiciones_listas(p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $cl18$
  SELECT EXISTS (SELECT 1 FROM conceptualizador.condicion_propuesta p WHERE p.caso_id = p_caso)
     AND NOT EXISTS (SELECT 1 FROM conceptualizador.condicion_caso c WHERE c.caso_id = p_caso AND c.critico AND c.estado = 'propuesto')
     AND coalesce((SELECT jsonb_array_length(p.propuesta->'faltan') FROM conceptualizador.condicion_propuesta p WHERE p.caso_id = p_caso), 0) = 0
$cl18$;

-- Una decisión sobre un renglón (de la pantalla o del motor). Devuelve la línea para el chat o NULL si no aplica.
CREATE OR REPLACE FUNCTION conceptualizador.condicion_aplicar(p_caso uuid, p_clave text, p_accion text, p_valor text, p_por text, p_camino text)
RETURNS text LANGUAGE plpgsql AS $ca18$
DECLARE
  v_c conceptualizador.condicion_caso%ROWTYPE;
  v_estado text;
  v_antes text;
BEGIN
  SELECT * INTO v_c FROM conceptualizador.condicion_caso WHERE caso_id = p_caso AND clave = p_clave FOR UPDATE;
  IF v_c.caso_id IS NULL THEN RETURN NULL; END IF;
  v_estado := CASE p_accion WHEN 'aprobar' THEN 'aprobado' WHEN 'corregir' THEN 'corregido' WHEN 'quitar' THEN 'quitado'
                            WHEN 'reabrir' THEN 'propuesto' ELSE NULL END;
  IF v_estado IS NULL THEN RETURN NULL; END IF;
  IF v_estado = 'corregido' AND char_length(btrim(coalesce(p_valor, ''))) = 0 THEN RETURN NULL; END IF;
  v_antes := v_c.estado || ':' || coalesce(v_c.valor, v_c.propuesto);
  UPDATE conceptualizador.condicion_caso
     SET estado = v_estado,
         valor = CASE WHEN v_estado = 'corregido' THEN left(btrim(p_valor), 500) WHEN v_estado = 'propuesto' THEN NULL ELSE valor END,
         por = p_por, camino = p_camino, decidido_at = now()
   WHERE caso_id = p_caso AND clave = p_clave;
  INSERT INTO conceptualizador.condicion_cambio (caso_id, clave, accion, antes, despues, por, camino)
  VALUES (p_caso, p_clave, p_accion, v_antes, v_estado || ':' || coalesce(CASE WHEN v_estado = 'corregido' THEN left(btrim(p_valor), 500) END, v_c.valor, v_c.propuesto), p_por, p_camino);
  RETURN CASE v_estado WHEN 'aprobado' THEN 'aprobé ' || v_c.titulo
                       WHEN 'corregido' THEN v_c.titulo || ': ' || left(btrim(p_valor), 200)
                       WHEN 'quitado' THEN 'quité ' || v_c.titulo
                       ELSE 'reabrí ' || v_c.titulo END;
END
$ca18$;

-- ── 4 · API del motor (envoltura) ──────────────────────────────────────────
DO $ren18m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0018prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0018prev;
  END IF;
END
$ren18m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot18$
DECLARE
  v_modo  text := p->>'modo';
  v_motor text := p->>'motor';
  v_caso  uuid;
  v_e     jsonb;
  v_n     int := 0;
  v_claves text[] := '{}';
  v_prev  conceptualizador.condicion_caso%ROWTYPE;
  v_lin   text;
  v_lineas text[] := '{}';
BEGIN
  IF v_modo IS NULL OR v_modo NOT IN ('terminos_cargar','condiciones_proponer','condiciones_decidir','condiciones') THEN
    RETURN conceptualizador.api_motor_0018prev(p);
  END IF;
  IF v_motor IS NULL OR v_motor NOT IN ('principal','respaldo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO');
  END IF;

  -- El catálogo completo, del repo privado. Reemplaza al anterior.
  IF v_modo = 'terminos_cargar' THEN
    IF jsonb_typeof(p->'filas') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'filas') > 400 OR coalesce(p->>'version', '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CATALOGO_INVALIDO');
    END IF;
    DELETE FROM conceptualizador.termino;
    FOR v_e IN SELECT * FROM jsonb_array_elements(p->'filas') LOOP
      CONTINUE WHEN coalesce(v_e->>'clave', '') = '' OR coalesce(v_e->>'texto', '') = '' OR coalesce(v_e->>'idioma', '') NOT IN ('es','en')
                 OR coalesce(v_e->>'bloque', '') NOT IN ('proyecto','legal');
      INSERT INTO conceptualizador.termino (clave, idioma, bloque, paquetes, paises, orden, titulo, texto, critico)
      VALUES (left(v_e->>'clave', 60), v_e->>'idioma', v_e->>'bloque',
              ARRAY(SELECT jsonb_array_elements_text(coalesce(v_e->'paquetes', '[]'::jsonb))),
              ARRAY(SELECT jsonb_array_elements_text(coalesce(v_e->'paises', '[]'::jsonb))),
              coalesce((v_e->>'orden')::int, 0), left(v_e->>'titulo', 200), left(v_e->>'texto', 4000), coalesce((v_e->>'critico')::boolean, false))
      ON CONFLICT (clave, idioma) DO NOTHING;
      v_n := v_n + 1;
    END LOOP;
    INSERT INTO conceptualizador.termino_meta (id, version, revisado_legal, cargado_at)
    VALUES (1, left(p->>'version', 40), coalesce((p->>'revisado_legal')::boolean, false), now())
    ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, revisado_legal = EXCLUDED.revisado_legal, cargado_at = now();
    RETURN jsonb_build_object('ok', true, 'cargadas', v_n);
  END IF;

  BEGIN v_caso := (p->>'caso_id')::uuid; EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_INVALIDO'); END;
  IF NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;

  IF v_modo = 'condiciones' THEN
    RETURN jsonb_build_object('ok', true, 'condiciones', conceptualizador.condiciones_de(v_caso), 'listas', conceptualizador.condiciones_listas(v_caso));
  END IF;
  IF NOT conceptualizador.prendido('condiciones_caso') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'condiciones_caso');
  END IF;

  -- La propuesta del motor. Un renglón ya decidido se respeta si su valor propuesto NO cambió; si cambió, se reabre
  -- (queda en la bitácora como «reabierto por el motor»): un check viejo nunca aprueba un valor nuevo.
  IF v_modo = 'condiciones_proponer' THEN
    IF jsonb_typeof(p->'propuesta') IS DISTINCT FROM 'object' OR jsonb_typeof(p->'propuesta'->'renglones') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p->'propuesta'->'renglones') > 60 OR length((p->'propuesta')::text) > 60000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PROPUESTA_INVALIDA');
    END IF;
    FOR v_e IN SELECT x FROM jsonb_array_elements(p->'propuesta'->'renglones') WITH ORDINALITY AS a(x, o) ORDER BY o LOOP
      CONTINUE WHEN coalesce(v_e->>'clave', '') = '' OR coalesce(v_e->>'valor', '') = '';
      v_claves := v_claves || left(v_e->>'clave', 60);
      SELECT * INTO v_prev FROM conceptualizador.condicion_caso WHERE caso_id = v_caso AND clave = left(v_e->>'clave', 60);
      IF v_prev.caso_id IS NOT NULL AND v_prev.propuesto IS DISTINCT FROM left(v_e->>'valor', 500) AND v_prev.estado <> 'propuesto' THEN
        INSERT INTO conceptualizador.condicion_cambio (caso_id, clave, accion, antes, despues, por, camino)
        VALUES (v_caso, v_prev.clave, 'reabierto', v_prev.estado || ':' || coalesce(v_prev.valor, v_prev.propuesto), 'propuesto:' || left(v_e->>'valor', 500), 'motor', NULL);
      END IF;
      INSERT INTO conceptualizador.condicion_caso (caso_id, clave, critico, titulo, propuesto, fuente, orden)
      VALUES (v_caso, left(v_e->>'clave', 60), coalesce((v_e->>'critico')::boolean, true), left(coalesce(v_e->>'titulo', v_e->>'clave'), 200),
              left(v_e->>'valor', 500), left(v_e->>'fuente', 200), v_n)
      ON CONFLICT (caso_id, clave) DO UPDATE SET
        critico = EXCLUDED.critico, titulo = EXCLUDED.titulo, fuente = EXCLUDED.fuente, orden = EXCLUDED.orden,
        estado = CASE WHEN conceptualizador.condicion_caso.propuesto IS DISTINCT FROM EXCLUDED.propuesto THEN 'propuesto' ELSE conceptualizador.condicion_caso.estado END,
        valor  = CASE WHEN conceptualizador.condicion_caso.propuesto IS DISTINCT FROM EXCLUDED.propuesto THEN NULL ELSE conceptualizador.condicion_caso.valor END,
        propuesto = EXCLUDED.propuesto;
      v_n := v_n + 1;
    END LOOP;
    DELETE FROM conceptualizador.condicion_caso WHERE caso_id = v_caso AND NOT (clave = ANY (v_claves));
    INSERT INTO conceptualizador.condicion_propuesta (caso_id, propuesta, version, at)
    VALUES (v_caso, (p->'propuesta') - 'renglones'::text, left(p->>'version', 40), now())
    ON CONFLICT (caso_id) DO UPDATE SET propuesta = EXCLUDED.propuesta, version = EXCLUDED.version, at = now();
    RETURN jsonb_build_object('ok', true, 'renglones', v_n, 'condiciones', conceptualizador.condiciones_de(v_caso));
  END IF;

  -- Decisiones que el motor ligó desde voz o texto («aprueba todo menos la garantía»). Quién: el autor del mensaje.
  IF v_modo = 'condiciones_decidir' THEN
    IF jsonb_typeof(p->'decisiones') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'decisiones') > 60
       OR coalesce(p->>'por', '') = '' OR coalesce(p->>'camino', '') NOT IN ('texto','voz') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DECISIONES_INVALIDAS');
    END IF;
    FOR v_e IN SELECT * FROM jsonb_array_elements(p->'decisiones') LOOP
      v_lin := conceptualizador.condicion_aplicar(v_caso, left(v_e->>'clave', 60), v_e->>'accion', v_e->>'valor', left(p->>'por', 80), p->>'camino');
      IF v_lin IS NOT NULL THEN v_lineas := v_lineas || v_lin; END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'aplicadas', coalesce(array_length(v_lineas, 1), 0), 'lineas', to_jsonb(v_lineas),
                              'condiciones', conceptualizador.condiciones_de(v_caso));
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$mot18$;

-- ── 5 · API de la suite (envoltura): el ✓ / ✎ / quitar de la tarjeta, y las condiciones en el hilo ──
DO $ren18s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0018prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0018prev;
  END IF;
END
$ren18s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui18$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_r     jsonb;
  v_n     int;
  v_ts    bigint;
  v_caso  uuid;
  v_c     conceptualizador.caso%ROWTYPE;
  v_x     record;
  v_lin   text;
  v_lineas text[] := '{}';
  v_excl  text[];
BEGIN
  -- Evento `condicion` (la tarjeta): se aplica AL MOMENTO, sin trabajo para el motor y sin contar en el tope.
  IF v_modo = 'evento' AND p->>'tipo' = 'condicion' THEN
    IF NOT conceptualizador.prendido('condiciones_caso') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'condiciones_caso');
    END IF;
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
    v_ts := conceptualizador.a_entero(p->>'ts');
    IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
    END IF;
    IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = v_caso;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_panel_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Las condiciones las aprueba quien cotiza o Esteban.');
    END IF;
    IF v_c.estado NOT IN ('abierto','enviada') THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_CERRADO'); END IF;
    IF v_d->>'accion' = 'aprobar_todo' THEN
      v_excl := ARRAY(SELECT jsonb_array_elements_text(coalesce(v_d->'excepto', '[]'::jsonb)));
      FOR v_x IN SELECT clave FROM conceptualizador.condicion_caso WHERE caso_id = v_caso AND estado = 'propuesto' AND NOT (clave = ANY (v_excl)) ORDER BY orden LOOP
        v_lin := conceptualizador.condicion_aplicar(v_caso, v_x.clave, 'aprobar', NULL, v_actor, 'boton');
        IF v_lin IS NOT NULL THEN v_lineas := v_lineas || v_lin; END IF;
      END LOOP;
    ELSE
      v_lin := conceptualizador.condicion_aplicar(v_caso, left(v_d->>'clave', 60), v_d->>'accion', v_d->>'valor', v_actor, 'boton');
      IF v_lin IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CONDICION_INVALIDA', 'mensaje', 'Ese renglón o esa acción no existen.'); END IF;
      v_lineas := v_lineas || v_lin;
    END IF;
    RETURN jsonb_build_object('ok', true, 'aplicadas', coalesce(array_length(v_lineas, 1), 0), 'lineas', to_jsonb(v_lineas),
                              'condiciones', conceptualizador.condiciones_de(v_caso), 'listas', conceptualizador.condiciones_listas(v_caso));
  END IF;

  v_r := conceptualizador.api_suite_0018prev(p);
  IF v_modo = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND conceptualizador.prendido('condiciones_caso') THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND EXISTS (SELECT 1 FROM conceptualizador.condicion_propuesta WHERE caso_id = v_caso) THEN
      v_r := v_r || jsonb_build_object('condiciones', conceptualizador.condiciones_de(v_caso), 'condiciones_listas', conceptualizador.condiciones_listas(v_caso));
    END IF;
  END IF;
  RETURN v_r;
END
$sui18$;

-- ── Permisos: la app solo ejecuta las puertas ──────────────────────────────
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0018prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0018prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0018prev(jsonb), conceptualizador.api_suite_0018prev(jsonb),
  conceptualizador.condiciones_de(uuid), conceptualizador.condiciones_listas(uuid),
  conceptualizador.condicion_aplicar(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0018prev(jsonb), conceptualizador.api_suite_0018prev(jsonb),
  conceptualizador.condiciones_de(uuid), conceptualizador.condiciones_listas(uuid),
  conceptualizador.condicion_aplicar(uuid, text, text, text, text, text) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_suite(jsonb) TO conceptualizador_app;
