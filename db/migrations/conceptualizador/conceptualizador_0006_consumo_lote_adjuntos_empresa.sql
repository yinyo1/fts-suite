-- ═══════════════════════════════════════════════════════════════════════════
-- 006_conceptualizador.sql · consumo medido, palomeada en lote, cada adjunto
-- se analiza una vez, empresa y moneda por sesión, «es una prueba».
-- MVP rector #4 de fts-conceptualizador (14-oct-2026, después de V1.31).
--
-- Sobre la 001 a la 005 (no se editan):
--   · consumo          tokens REALES de cada trabajo del motor (entrada, salida,
--                      caché leída y escrita), leídos de la transcripción del
--                      subagente: caso, persona, tipo de trabajo, pasos y
--                      segundos. Nunca se estima: si no hay transcripción, no
--                      hay renglón.
--   · adjunto.analisis la descripción técnica de una foto o un PDF, o el resumen
--                      de una nota de voz, hecha UNA vez cuando llega. Los
--                      trabajos siguientes la leen y no vuelven a abrir el
--                      archivo (`adjunto_reabierto` registra las excepciones).
--   · Palomeada en lote aceptar o rechazar un concepto YA NO encola un trabajo
--                      por clic. Se encola UN evento `palomeada` cuando no queda
--                      ningún concepto sin decidir de esa propuesta, o con el
--                      botón «Listo, sigue» (modo `palomeada_lista`).
--   · caso.empresa_id / caso.moneda   FTS México · MXN (1/MXN), FTS México · USD
--                      (1/USD) o FTS USA · USD (6/USD). Se cambia con el modo
--                      `empresa` mientras no exista machote.
--   · Modo `prueba`    «Es una prueba (no enseña)» y deshacer, solo el autor o un
--                      admin. Cambia caso.demo y encola un evento `prueba` que el
--                      motor resuelve SIN modelo (marca demo en el repo).
--   · El caso 0b43c8 (prueba de Esteban, 14-oct) queda demo = true.
--
-- Cómo se agregan modos sin reescribir la 0005: las funciones de la 0005 se
-- renombran a api_suite_0005 / api_motor_0005 (una sola vez) y las nuevas
-- api_suite / api_motor atienden lo nuevo y delegan lo demás. n8n no cambia
-- de función; los verificadores sí, porque los modos nuevos no están en su lista.
--
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Las funciones de la 0005 quedan como base (una sola vez) ───────────────
DO $ren$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0005') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0005;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0005') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0005;
  END IF;
END
$ren$;

-- ── Columnas y tablas ──────────────────────────────────────────────────────
ALTER TABLE conceptualizador.caso
  ADD COLUMN IF NOT EXISTS empresa_id int,
  ADD COLUMN IF NOT EXISTS moneda     text;
UPDATE conceptualizador.caso SET empresa_id = CASE WHEN pais = 'usa' THEN 6 ELSE 1 END WHERE empresa_id IS NULL;
UPDATE conceptualizador.caso SET moneda = CASE WHEN pais = 'usa' THEN 'USD' ELSE 'MXN' END WHERE moneda IS NULL;
ALTER TABLE conceptualizador.caso ALTER COLUMN empresa_id SET DEFAULT 1;
ALTER TABLE conceptualizador.caso ALTER COLUMN moneda SET DEFAULT 'MXN';
ALTER TABLE conceptualizador.caso DROP CONSTRAINT IF EXISTS caso_empresa_check;
ALTER TABLE conceptualizador.caso ADD CONSTRAINT caso_empresa_check
  CHECK (empresa_id IN (1, 6) AND moneda IN ('MXN', 'USD') AND NOT (empresa_id = 6 AND moneda = 'MXN'));

ALTER TABLE conceptualizador.adjunto
  ADD COLUMN IF NOT EXISTS analisis              text,
  ADD COLUMN IF NOT EXISTS analizado_at          timestamptz,
  ADD COLUMN IF NOT EXISTS analizado_en_trabajo  bigint;

-- Cada vez que el motor vuelve a abrir un adjunto ya analizado, con el porqué.
CREATE TABLE IF NOT EXISTS conceptualizador.adjunto_reabierto (
  id          bigserial   PRIMARY KEY,
  adjunto_id  uuid        NOT NULL REFERENCES conceptualizador.adjunto(id),
  trabajo_id  bigint,
  razon       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conceptualizador.consumo (
  trabajo_id      bigint      PRIMARY KEY REFERENCES conceptualizador.trabajo(id),
  caso_id         uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  actor           text,
  tipo_trabajo    text        NOT NULL,      -- mensaje · palomeada · continuacion · accion · cierre · …
  motor           text        NOT NULL,
  absorbidos      int         NOT NULL DEFAULT 0,
  input_tokens    bigint      NOT NULL DEFAULT 0,
  output_tokens   bigint      NOT NULL DEFAULT 0,
  cache_leida     bigint      NOT NULL DEFAULT 0,
  cache_escrita   bigint      NOT NULL DEFAULT 0,
  total_tokens    bigint      NOT NULL DEFAULT 0,
  llamadas_modelo int         NOT NULL DEFAULT 0,
  -- La transcripción del subagente guarda la salida a medio camino: es un mínimo, no el total.
  output_parcial  boolean     NOT NULL DEFAULT false,
  -- Lo que reportó la herramienta al terminar el subagente (si lo reportó), tal cual.
  total_reportado bigint,
  pasos           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  segundos        numeric,
  modelo          text,
  fuente          text        NOT NULL DEFAULT 'transcripcion',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consumo_no_negativo CHECK (input_tokens >= 0 AND output_tokens >= 0 AND cache_leida >= 0 AND cache_escrita >= 0)
);
CREATE INDEX IF NOT EXISTS consumo_fecha ON conceptualizador.consumo (created_at);

ALTER TABLE conceptualizador.evento DROP CONSTRAINT IF EXISTS evento_tipo_check;
ALTER TABLE conceptualizador.evento ADD CONSTRAINT evento_tipo_check
  CHECK (tipo IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra','accion','ejecucion','continuacion',
                  'palomeada','prueba'));
ALTER TABLE conceptualizador.cambio_sesion DROP CONSTRAINT IF EXISTS cambio_sesion_tipo_check;
ALTER TABLE conceptualizador.cambio_sesion ADD CONSTRAINT cambio_sesion_tipo_check
  CHECK (tipo IN ('renombrar','archivar','desarchivar','fijar','desfijar','prueba','no_prueba','empresa'));

-- ── Lecturas ───────────────────────────────────────────────────────────────
-- Igual que la 0002, más el análisis guardado (lo lee el motor en vez de reabrir el archivo).
CREATE OR REPLACE FUNCTION conceptualizador.adjuntos_meta(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $adm$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mensaje_id', a.mensaje_id, 'nombre', a.nombre,
      'tipo', a.tipo, 'clase', a.clase, 'bytes', a.bytes, 'duracion_s', a.duracion_s,
      'transcripcion', a.transcripcion, 'escrito_at', a.escrito_at, 'created_at', a.created_at,
      'analisis', a.analisis, 'analizado_at', a.analizado_at, 'analizado_en_trabajo', a.analizado_en_trabajo) ORDER BY a.created_at), '[]'::jsonb)
  FROM conceptualizador.adjunto a WHERE a.caso_id = p_caso
$adm$;

-- Empresa y moneda de la sesión a partir de lo que eligió la persona.
CREATE OR REPLACE FUNCTION conceptualizador.empresa_de(p text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $emp$
  SELECT CASE lower(btrim(coalesce(p, '')))
    WHEN 'mx_mxn'  THEN jsonb_build_object('pais', 'mx',  'empresa_id', 1, 'moneda', 'MXN', 'nombre', 'FTS México · MXN')
    WHEN 'mx_usd'  THEN jsonb_build_object('pais', 'mx',  'empresa_id', 1, 'moneda', 'USD', 'nombre', 'FTS México · USD')
    WHEN 'usa_usd' THEN jsonb_build_object('pais', 'usa', 'empresa_id', 6, 'moneda', 'USD', 'nombre', 'FTS USA · USD')
    ELSE NULL END
$emp$;

-- La propuesta vigente de un caso: la última respuesta que trajo conceptos.
CREATE OR REPLACE FUNCTION conceptualizador.propuesta_vigente(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $prop$
  SELECT jsonb_build_object('trabajo_id', r.trabajo_id, 'created_at', r.created_at,
           'ids', (SELECT coalesce(jsonb_agg(x->>'id'), '[]'::jsonb) FROM jsonb_array_elements(r.conceptos) x WHERE x ? 'id'))
    FROM conceptualizador.respuesta r
   WHERE r.caso_id = p_caso AND jsonb_array_length(r.conceptos) > 0
   ORDER BY r.id DESC LIMIT 1
$prop$;

-- Decisiones (la última por concepto) de una propuesta.
CREATE OR REPLACE FUNCTION conceptualizador.decisiones(p_caso uuid, p_prop jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $dec$
  SELECT coalesce(jsonb_agg(jsonb_build_object('evento_id', d.id, 'concepto', d.concepto, 'tipo', d.tipo, 'razon', d.razon,
           'datos', d.datos, 'autor', d.autor, 'created_at', d.created_at) ORDER BY d.id), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (e.concepto) e.*
            FROM conceptualizador.evento e
           WHERE e.caso_id = p_caso AND e.tipo IN ('aceptar','rechazar')
             AND e.concepto IN (SELECT jsonb_array_elements_text(p_prop->'ids'))
             AND e.created_at >= (p_prop->>'created_at')::timestamptz
           ORDER BY e.concepto, e.id DESC) d
$dec$;

-- Encola UN evento `palomeada` con las decisiones que todavía no viajaron al motor.
-- Devuelve el resultado de encolar_evento, o NULL si no hay nada nuevo que mandar.
CREATE OR REPLACE FUNCTION conceptualizador.encolar_palomeada(p_caso uuid, p_actor text, p_por_boton boolean) RETURNS jsonb
LANGUAGE plpgsql AS $pal$
DECLARE v_prop jsonb; v_dec jsonb; v_ya jsonb; v_nuevas jsonb; v_sin jsonb;
BEGIN
  v_prop := conceptualizador.propuesta_vigente(p_caso);
  IF v_prop IS NULL THEN RETURN NULL; END IF;
  v_dec := conceptualizador.decisiones(p_caso, v_prop);
  -- Conceptos que ya mandó un lote anterior de esta misma propuesta.
  SELECT coalesce(jsonb_agg(DISTINCT d->>'concepto'), '[]'::jsonb) INTO v_ya
    FROM conceptualizador.evento e, jsonb_array_elements(e.datos->'decisiones') d
   WHERE e.caso_id = p_caso AND e.tipo = 'palomeada'
     AND (e.datos->>'propuesta_trabajo_id')::bigint = (v_prop->>'trabajo_id')::bigint;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'evento_id')::bigint), '[]'::jsonb) INTO v_nuevas
    FROM jsonb_array_elements(v_dec) x WHERE NOT (v_ya ? (x->>'concepto'));
  IF jsonb_array_length(v_nuevas) = 0 THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(i), '[]'::jsonb) INTO v_sin
    FROM jsonb_array_elements_text(v_prop->'ids') i
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_dec) x WHERE x->>'concepto' = i);
  RETURN conceptualizador.encolar_evento(p_caso, 'palomeada', NULL, NULL,
    jsonb_build_object('propuesta_trabajo_id', (v_prop->>'trabajo_id')::bigint, 'decisiones', v_nuevas,
      'sin_decidir', v_sin, 'por_boton', p_por_boton,
      'aceptados', (SELECT count(*) FROM jsonb_array_elements(v_nuevas) x WHERE x->>'tipo' = 'aceptar'),
      'rechazados', (SELECT count(*) FROM jsonb_array_elements(v_nuevas) x WHERE x->>'tipo' = 'rechazar')), p_actor);
END
$pal$;

-- Igual que la 0005, pero el trabajo «prueba» (lo pide una persona y lo resuelve el motor sin
-- modelo) no cuenta para el tope de mensajes.
CREATE OR REPLACE FUNCTION conceptualizador.uso_hoy(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $uso6$
  SELECT jsonb_build_object(
    'dia', conceptualizador.dia_uso(now()),
    'mensajes', (SELECT count(*) FROM conceptualizador.trabajo t
                  LEFT JOIN conceptualizador.mensaje m ON m.id = t.mensaje_id
                  LEFT JOIN conceptualizador.evento  e ON e.id = t.evento_id
                 WHERE t.created_at > now() - interval '2 days'
                   AND conceptualizador.dia_uso(t.created_at) = conceptualizador.dia_uso(now())
                   AND coalesce(e.tipo, '') <> 'prueba'
                   AND coalesce(m.autor, e.autor) = p_actor),
    'tope_mensajes', conceptualizador.tope('tope_mensajes_dia', p_actor),
    'sesiones', (SELECT count(*) FROM conceptualizador.caso c
                  WHERE c.autor = p_actor AND c.created_at > now() - interval '2 days'
                    AND conceptualizador.dia_uso(c.created_at) = conceptualizador.dia_uso(now())),
    'tope_sesiones', conceptualizador.tope('tope_sesiones_dia', p_actor))
$uso6$;

-- ── API de la suite ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $api6$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_modo  text := p->>'modo';
  v_caso  uuid;
  v_c     conceptualizador.caso%ROWTYPE;
  v_n     int;
  v_r     jsonb;
  v_prop  jsonb;
  v_dec   jsonb;
  v_ev    bigint;
  v_trab  bigint;
  v_emp   jsonb;
  v_demo  boolean;
  v_falta int;
BEGIN
  -- Lo que ya existía (y la ventana, el nonce y el actor de todo lo demás) lo atiende la 0005.
  IF v_modo NOT IN ('evento','palomeada_lista','prueba','empresa','nueva','enviar') THEN
    RETURN conceptualizador.api_suite_0005(p);
  END IF;
  IF v_modo IN ('nueva','enviar') THEN
    v_emp := conceptualizador.empresa_de(p->>'empresa');
    -- La empresa decide el país: «FTS USA · USD» es una sesión de USA aunque la pantalla diga mx.
    v_r := conceptualizador.api_suite_0005(CASE WHEN v_emp IS NULL THEN p ELSE p || jsonb_build_object('pais', v_emp->>'pais') END);
    IF v_emp IS NOT NULL AND coalesce((v_r->>'ok')::boolean, false) AND NOT coalesce((v_r->>'ya_estaba')::boolean, false)
       AND nullif(p->>'caso_id','') IS NULL AND nullif(v_r->>'caso_id','') IS NOT NULL THEN
      UPDATE conceptualizador.caso SET empresa_id = (v_emp->>'empresa_id')::int, moneda = v_emp->>'moneda'
       WHERE id = (v_r->>'caso_id')::uuid;
      v_r := v_r || jsonb_build_object('empresa', v_emp);
    END IF;
    RETURN v_r;
  END IF;
  -- Aceptar o rechazar UN concepto: se guarda la decisión, sin trabajo por clic.
  IF v_modo = 'evento' AND p->>'tipo' NOT IN ('aceptar','rechazar') THEN
    RETURN conceptualizador.api_suite_0005(p);
  END IF;

  -- Desde aquí: modos que no pasan por la 0005. Mismos candados de entrada.
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
  IF nullif(p->>'ts','') IS NULL OR abs(extract(epoch FROM now()) * 1000 - (p->>'ts')::bigint) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  IF char_length(coalesce(p->>'nonce','')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
  INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;

  SELECT * INTO v_c FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid FOR UPDATE;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;

  IF v_modo = 'evento' THEN
    IF p->>'tipo' = 'rechazar' AND char_length(btrim(coalesce(p->>'razon',''))) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RAZON_OBLIGATORIA', 'mensaje', 'Para rechazar un concepto hay que decir por qué.');
    END IF;
    v_prop := conceptualizador.propuesta_vigente(v_c.id);
    -- Un concepto que no es de la propuesta vigente (no debería pasar): como antes, un trabajo.
    IF v_prop IS NULL OR NOT (v_prop->'ids' ? coalesce(p->>'concepto','')) THEN
      RETURN conceptualizador.api_suite_0005(p || jsonb_build_object('nonce', p->>'nonce' || '-0005'));
    END IF;
    INSERT INTO conceptualizador.evento (caso_id, tipo, concepto, razon, datos, autor)
    VALUES (v_c.id, p->>'tipo', p->>'concepto', nullif(btrim(coalesce(p->>'razon','')), ''),
            coalesce(p->'datos','{}'::jsonb) || jsonb_build_object('propuesta_trabajo_id', (v_prop->>'trabajo_id')::bigint), v_actor)
    RETURNING id INTO v_ev;
    UPDATE conceptualizador.caso SET ultima_actividad_at = now() WHERE id = v_c.id;
    v_dec := conceptualizador.decisiones(v_c.id, v_prop);
    v_falta := jsonb_array_length(v_prop->'ids') - jsonb_array_length(v_dec);
    IF v_falta > 0 THEN
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'evento_id', v_ev, 'trabajo_id', NULL,
                                'espera_lote', true, 'faltan', v_falta);
    END IF;
    v_r := conceptualizador.encolar_palomeada(v_c.id, v_actor, false);
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'evento_id', v_ev, 'faltan', 0, 'espera_lote', false)
           || coalesce(v_r - 'evento_id', jsonb_build_object('trabajo_id', NULL));

  ELSIF v_modo = 'palomeada_lista' THEN
    -- «Listo, sigue»: lo decidido viaja ya; lo que quedó sin decidir va en `sin_decidir`.
    v_r := conceptualizador.encolar_palomeada(v_c.id, v_actor, true);
    IF v_r IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NADA_NUEVO', 'mensaje', 'Palomea al menos un concepto antes de seguir.');
    END IF;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id) || v_r;

  ELSIF v_modo IN ('prueba','empresa') THEN
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYA',
        'mensaje', 'Solo quien abrió la sesión, o Esteban, puede ' || CASE WHEN v_modo = 'prueba' THEN 'marcarla como prueba.' ELSE 'cambiar la empresa.' END);
    END IF;
    IF v_modo = 'prueba' THEN
      v_demo := lower(btrim(coalesce(p->>'texto',''))) IN ('si','sí','true','1');
      IF v_demo = v_c.demo THEN RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'demo', v_demo, 'ya_estaba', true); END IF;
      UPDATE conceptualizador.caso SET demo = v_demo, ultima_actividad_at = now() WHERE id = v_c.id;
      INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues)
      VALUES (v_c.id, v_actor, CASE WHEN v_demo THEN 'prueba' ELSE 'no_prueba' END, v_c.demo::text, v_demo::text);
      -- El motor lo resuelve sin modelo (marca demo en lo ya escrito en el repo): no cuenta para el tope.
      INSERT INTO conceptualizador.evento (caso_id, tipo, datos, autor)
      VALUES (v_c.id, 'prueba', jsonb_build_object('demo', v_demo), v_actor) RETURNING id INTO v_ev;
      INSERT INTO conceptualizador.trabajo (caso_id, tipo, evento_id) VALUES (v_c.id, 'evento', v_ev) RETURNING id INTO v_trab;
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'demo', v_demo, 'evento_id', v_ev, 'trabajo_id', v_trab);
    END IF;
    -- empresa
    v_emp := conceptualizador.empresa_de(p->>'texto');
    IF v_emp IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'EMPRESA_INVALIDA'); END IF;
    IF v_c.machote_id IS NOT NULL OR v_c.machote_folio IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_YA_EXISTE',
        'mensaje', 'Ya hay machote (' || coalesce(v_c.machote_folio, 'creado') || '): la empresa ya no se cambia aquí.');
    END IF;
    IF v_c.empresa_id = (v_emp->>'empresa_id')::int AND v_c.moneda = v_emp->>'moneda' THEN
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'empresa', v_emp, 'ya_estaba', true);
    END IF;
    UPDATE conceptualizador.caso SET empresa_id = (v_emp->>'empresa_id')::int, moneda = v_emp->>'moneda',
           pais = v_emp->>'pais', ultima_actividad_at = now() WHERE id = v_c.id;
    INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues)
    VALUES (v_c.id, v_actor, 'empresa', v_c.empresa_id || '/' || v_c.moneda, (v_emp->>'empresa_id') || '/' || (v_emp->>'moneda'));
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
    VALUES (v_c.id, 'motor', 'acuse', 'Cambié la empresa a ' || (v_emp->>'nombre') || '. Los precios y el machote van en ' || (v_emp->>'moneda') || '.');
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'empresa', v_emp);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$api6$;

-- ── API del motor ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot6$
DECLARE
  v_motor text := p->>'motor';
  v_modo  text := p->>'modo';
  v_id    bigint := nullif(p->>'trabajo_id','')::bigint;
  t       conceptualizador.trabajo%ROWTYPE;
  v_c     jsonb := coalesce(p->'consumo', '{}'::jsonb);
  v_tk    jsonb;
  v_tipo  text;
  v_actor text;
  v_abs   int;
  v_r     jsonb;
  v_desde date;
  v_hasta date;
  v_n     int;
BEGIN
  IF v_modo NOT IN ('consumo','analisis','reabierto','uso') THEN
    RETURN conceptualizador.api_motor_0005(p);
  END IF;
  IF v_motor NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;

  IF v_modo = 'consumo' THEN
    SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
    IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
    IF t.tomado_por IS DISTINCT FROM v_motor THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO'); END IF;
    v_tk := coalesce(v_c->'tokens', '{}'::jsonb);
    IF jsonb_typeof(v_tk) <> 'object' OR coalesce((v_tk->>'input')::bigint, -1) < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CONSUMO_INVALIDO', 'mensaje', 'Sin tokens medidos no se registra nada.');
    END IF;
    SELECT CASE WHEN t.tipo = 'mensaje' THEN 'mensaje'
                WHEN e.tipo = 'cierra' OR (e.tipo = 'accion' AND e.concepto = 'cerrar') THEN 'cierre'
                ELSE coalesce(e.tipo, t.tipo) END,
           coalesce(m.autor, e.autor)
      INTO v_tipo, v_actor
      FROM conceptualizador.trabajo t2
      LEFT JOIN conceptualizador.mensaje m ON m.id = t2.mensaje_id
      LEFT JOIN conceptualizador.evento e ON e.id = t2.evento_id
     WHERE t2.id = t.id;
    -- Una continuación la pide el motor; el consumo es de la persona del caso.
    IF NOT conceptualizador.es_persona(v_actor) THEN SELECT autor INTO v_actor FROM conceptualizador.caso WHERE id = t.caso_id; END IF;
    SELECT count(*) INTO v_abs FROM conceptualizador.trabajo WHERE lote_de = t.id;
    INSERT INTO conceptualizador.consumo (trabajo_id, caso_id, actor, tipo_trabajo, motor, absorbidos, input_tokens, output_tokens,
        cache_leida, cache_escrita, total_tokens, llamadas_modelo, output_parcial, total_reportado, pasos, segundos, modelo, fuente)
    VALUES (t.id, t.caso_id, v_actor, v_tipo, v_motor, v_abs,
        coalesce((v_tk->>'input')::bigint, 0), coalesce((v_tk->>'output')::bigint, 0),
        coalesce((v_tk->>'cache_leida')::bigint, 0), coalesce((v_tk->>'cache_escrita')::bigint, 0),
        coalesce((v_tk->>'input')::bigint, 0) + coalesce((v_tk->>'output')::bigint, 0) + coalesce((v_tk->>'cache_leida')::bigint, 0) + coalesce((v_tk->>'cache_escrita')::bigint, 0),
        coalesce((v_tk->>'llamadas_modelo')::int, 0), coalesce((v_c->>'output_parcial')::boolean, false),
        nullif(v_c->>'total_reportado','')::bigint,
        CASE WHEN jsonb_typeof(v_c->'pasos') = 'object' THEN v_c->'pasos' ELSE '{}'::jsonb END,
        nullif(v_c->>'segundos','')::numeric, left(v_c->>'modelo', 60), coalesce(left(v_c->>'fuente', 30), 'transcripcion'))
    ON CONFLICT (trabajo_id) DO UPDATE SET input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
        cache_leida = EXCLUDED.cache_leida, cache_escrita = EXCLUDED.cache_escrita, total_tokens = EXCLUDED.total_tokens,
        llamadas_modelo = EXCLUDED.llamadas_modelo, output_parcial = EXCLUDED.output_parcial,
        total_reportado = coalesce(EXCLUDED.total_reportado, conceptualizador.consumo.total_reportado),
        pasos = EXCLUDED.pasos, segundos = EXCLUDED.segundos, modelo = EXCLUDED.modelo, fuente = EXCLUDED.fuente;
    RETURN jsonb_build_object('ok', true, 'trabajo_id', t.id, 'tipo_trabajo', v_tipo, 'actor', v_actor);

  ELSIF v_modo = 'analisis' THEN
    -- UNA vez por adjunto. Volver a analizar exige `rehacer` (la persona lo pidió) y deja rastro.
    IF char_length(btrim(coalesce(p->>'texto',''))) < 20 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ANALISIS_CORTO', 'mensaje', 'La descripción técnica necesita al menos 20 caracteres.');
    END IF;
    UPDATE conceptualizador.adjunto SET analisis = left(btrim(p->>'texto'), 8000), analizado_at = now(), analizado_en_trabajo = v_id
     WHERE id = nullif(p->>'adjunto_id','')::uuid AND (analisis IS NULL OR coalesce((p->>'rehacer')::boolean, false));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM conceptualizador.adjunto WHERE id = nullif(p->>'adjunto_id','')::uuid) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ADJUNTO_NO_EXISTE');
    END IF;
    RETURN jsonb_build_object('ok', true, 'guardado', v_n = 1, 'ya_estaba', v_n = 0);

  ELSIF v_modo = 'reabierto' THEN
    IF char_length(btrim(coalesce(p->>'causa',''))) < 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SIN_RAZON', 'mensaje', 'Reabrir un adjunto ya analizado pide la razón.');
    END IF;
    INSERT INTO conceptualizador.adjunto_reabierto (adjunto_id, trabajo_id, razon)
    SELECT a.id, v_id, left(btrim(p->>'causa'), 300) FROM conceptualizador.adjunto a WHERE a.id = nullif(p->>'adjunto_id','')::uuid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('ok', v_n = 1);

  ELSE  -- uso: lo de la 0005 más el consumo de la semana
    v_r := conceptualizador.api_motor_0005(p);
    IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
    v_desde := (v_r->>'desde')::date; v_hasta := (v_r->>'hasta')::date;
    RETURN v_r || jsonb_build_object('consumo', (
      WITH c AS (SELECT k.*, ca.carpeta, ca.titulo, ca.demo FROM conceptualizador.consumo k
                   JOIN conceptualizador.caso ca ON ca.id = k.caso_id
                  WHERE conceptualizador.dia_uso(k.created_at) BETWEEN v_desde AND v_hasta)
      SELECT jsonb_build_object(
        'trabajos', (SELECT count(*) FROM c),
        'total', jsonb_build_object('input', coalesce(sum(input_tokens), 0), 'output', coalesce(sum(output_tokens), 0),
                   'cache_leida', coalesce(sum(cache_leida), 0), 'cache_escrita', coalesce(sum(cache_escrita), 0),
                   'total', coalesce(sum(total_tokens), 0), 'output_parcial', coalesce(bool_or(output_parcial), false)),
        'por_persona', (SELECT coalesce(jsonb_agg(jsonb_build_object('actor', x.actor, 'trabajos', x.n, 'total', x.tot) ORDER BY x.tot DESC), '[]'::jsonb)
                          FROM (SELECT actor, count(*) n, sum(total_tokens) tot FROM c GROUP BY actor) x),
        'por_caso', (SELECT coalesce(jsonb_agg(jsonb_build_object('caso', x.carpeta, 'titulo', x.titulo, 'demo', x.demo, 'trabajos', x.n, 'total', x.tot) ORDER BY x.tot DESC), '[]'::jsonb)
                       FROM (SELECT carpeta, titulo, demo, count(*) n, sum(total_tokens) tot FROM c GROUP BY carpeta, titulo, demo) x),
        'por_tipo', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', x.tipo_trabajo, 'trabajos', x.n, 'total', x.tot) ORDER BY x.tot DESC), '[]'::jsonb)
                       FROM (SELECT tipo_trabajo, count(*) n, sum(total_tokens) tot FROM c GROUP BY tipo_trabajo) x),
        -- Pasos: cuántas veces se usó cada clase y el total de los trabajos que la usaron.
        'por_paso', (SELECT coalesce(jsonb_agg(jsonb_build_object('paso', x.k, 'veces', x.veces, 'trabajos', x.n, 'total_trabajos', x.tot) ORDER BY x.tot DESC), '[]'::jsonb)
                       FROM (SELECT j.key k, sum(j.value::int) veces, count(*) n, sum(c.total_tokens) tot
                               FROM c, jsonb_each_text(c.pasos) j GROUP BY j.key) x),
        'top', (SELECT coalesce(jsonb_agg(jsonb_build_object('trabajo_id', x.trabajo_id, 'caso', x.carpeta, 'actor', x.actor,
                   'tipo', x.tipo_trabajo, 'total', x.total_tokens, 'segundos', x.segundos, 'pasos', x.pasos, 'absorbidos', x.absorbidos)
                   ORDER BY x.total_tokens DESC), '[]'::jsonb)
                  FROM (SELECT * FROM c ORDER BY total_tokens DESC LIMIT 5) x))
      FROM c));
  END IF;
END
$mot6$;

-- ── El caso de prueba de Esteban del 14-oct (0b43c8) no enseña ─────────────
-- Ya se marcó demo: true en el repo (commit 18afb95); faltaba la base. El evento `prueba`
-- hace que el motor termine de marcar lo que se escribió después (eventos 14 y 15).
DO $fix$
DECLARE v_ev bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = '0b43c81f-45c2-45da-895a-049774dd5eae' AND NOT demo) THEN
    UPDATE conceptualizador.caso SET demo = true WHERE id = '0b43c81f-45c2-45da-895a-049774dd5eae';
    INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues)
    VALUES ('0b43c81f-45c2-45da-895a-049774dd5eae', 'esteban.delacruz', 'prueba', 'false', 'true');
    INSERT INTO conceptualizador.evento (caso_id, tipo, datos, autor)
    VALUES ('0b43c81f-45c2-45da-895a-049774dd5eae', 'prueba', jsonb_build_object('demo', true, 'por', 'migracion 0006'), 'esteban.delacruz')
    RETURNING id INTO v_ev;
    INSERT INTO conceptualizador.trabajo (caso_id, tipo, evento_id) VALUES ('0b43c81f-45c2-45da-895a-049774dd5eae', 'evento', v_ev);
  END IF;
END
$fix$;

-- ── Permisos ───────────────────────────────────────────────────────────────
-- CREATE OR REPLACE regresa la función a SECURITY INVOKER: se vuelven a marcar.
-- Las de la 0005 ya no se llaman directo: solo a través de las nuevas.
ALTER FUNCTION conceptualizador.api_suite(jsonb)      SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb)      SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0005(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0005(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0005(jsonb), conceptualizador.api_motor_0005(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.estado_motor(), conceptualizador.hilo(uuid),
                          conceptualizador.cfg(text), conceptualizador.adjuntos_meta(uuid),
                          conceptualizador.es_disparador(text),
                          conceptualizador.acuse(jsonb, text, boolean, boolean, boolean) TO conceptualizador_app;
