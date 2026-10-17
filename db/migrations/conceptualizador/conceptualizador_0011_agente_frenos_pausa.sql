-- ═══════════════════════════════════════════════════════════════════════════
-- 011_conceptualizador.sql · V1.47 (#4): el agente con frenos — registro de consumo,
-- presupuesto, publicar en un caso CON LA APP CERRADA y leer el hilo sin trabajo.
--
-- Qué agrega:
--   · consumo_avance   una fila por PASADA PROACTIVA del motor (no tiene trabajo: nadie escribió).
--                      Tokens, ponderado, llamadas, búsquedas de precio, renglones, duración y
--                      resultado (avanzo / sin_cambio / cortado_tope / rechazado_decreto / error).
--                      Sin datos personales: carpeta del caso (ya en el repo), números y resultado.
--   · consumo          (db/006, una fila por trabajo de persona) gana proactivo=false, búsquedas de
--                      precio, renglones y resultado, para que la vista los junte.
--   · consumo_registro VISTA con las dos: lo que lee el freno del motor y el workflow de avisos.
--                      ponderado = entrada + 1.25 × caché escrita + 0.10 × caché leída + 5 × salida.
--   · consumo_aviso    idempotencia de los correos a Esteban: el de 80 % y el de 100 % una sola vez
--                      por semana, el resumen diario una vez por día.
--   · publicacion      lo que el motor publicó SIN trabajo (pasada de avance): una por pasada.
--   · push_envio.tipo  acepta 'avance': el aviso push del mensaje proactivo, con la app cerrada.
--
-- Modos nuevos de api_motor (y del verificador de conceptualizador/motor, que hay que publicar):
--   · registro_avance  inserta la fila de una pasada (idempotente por pasada).
--   · presupuesto      {desde, hasta} → ponderados por mensaje y proactivos, y por día.
--   · publicar         {caso_id, texto, pasada, boton?} → mensaje del motor en el caso, sin trabajo.
--                      Solo casos abiertos y no archivados; uno por pasada; 6000 caracteres máx.
--                      El push lo decide push_candidatos (silencio 21–7 de cada persona, uno al día
--                      por caso, nada si la persona está en la app).
--   · hilo_caso        {caso_id} → el hilo del caso (para una pasada de un caso en levantamiento,
--                      cuyo hilo.md del repo no está al día porque ese modo no crea trabajos).
--   · avisos_consumo   lo que toca avisar por correo (80 %, 100 %, diario), para el workflow
--                      conceptualizador/consumo-avisos. Con dry_run no marca nada.
--
--
-- V1.47.1 (#4) · la PAUSA del agente por caso y su aviso de 24 h (misma migración: la 0011 no se había aplicado):
--   · agente_pausa     una fila por pausa (quién, razón ≥ 8 letras, camino, % al pausar, desde/hasta). Una viva por caso.
--   · api_motor 'pausa' {caso_id, accion: pausar|reanudar, por, razon, camino, pct}: la escribe procesa.js al pausar o
--                      reanudar (sin modelo). Solo el dueño del caso o un admin.
--   · avisos_consumo   suma 'pausa24': cada 24 h que una pausa sigue viva, UN correo a Esteban (lo arma consumo-avisos) y,
--                      al marcar (dry_run=false), UNA línea en el chat del dueño. Nunca reanuda nada.
--
--   · Las regex terminan en \Z y no en dólar: un dólar seguido de comilla lo rechaza el runner (DOLAR_PATRON, db/README regla 8).
--     Así venía en V1.47 y por eso esta migración nunca habría pasado el filtro.
--
-- Patrón de 0006–0010: la función de antes se renombra (api_motor_0011prev) y la nueva delega todo lo demás.
-- Reglas de db/README.md de la suite: idempotente, etiquetas de dólar con nombre, sin dólar seguido de dígito.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conceptualizador.consumo_avance (
  id               bigserial   PRIMARY KEY,
  pasada           text        NOT NULL UNIQUE CHECK (pasada ~ '^A[0-9]{10}-[a-z0-9]{1,8}\Z'),
  caso_id          uuid        REFERENCES conceptualizador.caso(id),
  carpeta          text        NOT NULL CHECK (char_length(carpeta) <= 200),
  motivo           text        NOT NULL CHECK (motivo IN ('levantamiento','avance','propagacion','aprende')),
  modelo           text,
  input_tokens     bigint      NOT NULL DEFAULT 0,
  output_tokens    bigint      NOT NULL DEFAULT 0,
  cache_leida      bigint      NOT NULL DEFAULT 0,
  cache_escrita    bigint      NOT NULL DEFAULT 0,
  ponderado        bigint      NOT NULL DEFAULT 0,
  llamadas_modelo  int         NOT NULL DEFAULT 0,
  busquedas_precio int         NOT NULL DEFAULT 0,
  renglones        int         NOT NULL DEFAULT 0,
  segundos         numeric,
  resultado        text        NOT NULL CHECK (resultado IN ('avanzo','sin_cambio','cortado_tope','rechazado_decreto','error')),
  tope             text        CHECK (char_length(tope) <= 200),
  dia              date        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consumo_avance_no_negativo CHECK (input_tokens >= 0 AND output_tokens >= 0 AND cache_leida >= 0 AND cache_escrita >= 0 AND ponderado >= 0)
);
CREATE INDEX IF NOT EXISTS consumo_avance_dia ON conceptualizador.consumo_avance (dia);

ALTER TABLE conceptualizador.consumo
  ADD COLUMN IF NOT EXISTS proactivo        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS busquedas_precio int,
  ADD COLUMN IF NOT EXISTS renglones        int,
  ADD COLUMN IF NOT EXISTS resultado        text;

CREATE OR REPLACE VIEW conceptualizador.consumo_registro AS
  SELECT k.created_at, conceptualizador.dia_uso(k.created_at) AS dia, k.caso_id, ca.carpeta, false AS proactivo,
         k.tipo_trabajo AS motivo, k.trabajo_id, NULL::text AS pasada, k.input_tokens, k.output_tokens, k.cache_leida, k.cache_escrita,
         round(k.input_tokens + 1.25 * k.cache_escrita + 0.10 * k.cache_leida + 5 * k.output_tokens)::bigint AS ponderado,
         k.llamadas_modelo, coalesce(k.busquedas_precio, (k.pasos->>'web')::int, 0) AS busquedas_precio, k.renglones, k.segundos,
         coalesce(k.resultado, 'atendido') AS resultado, NULL::text AS tope
    FROM conceptualizador.consumo k JOIN conceptualizador.caso ca ON ca.id = k.caso_id
  UNION ALL
  SELECT a.created_at, a.dia, a.caso_id, a.carpeta, true, a.motivo, NULL::bigint, a.pasada, a.input_tokens, a.output_tokens, a.cache_leida, a.cache_escrita,
         a.ponderado, a.llamadas_modelo, a.busquedas_precio, a.renglones, a.segundos, a.resultado, a.tope
    FROM conceptualizador.consumo_avance a;

CREATE TABLE IF NOT EXISTS conceptualizador.consumo_aviso (
  id         bigserial   PRIMARY KEY,
  tipo       text        NOT NULL,
  clave      text        NOT NULL,              -- semana (lunes) para pct80/pct100; día para diario; <pausa>:<n> para pausa24
  detalle    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consumo_aviso_unico UNIQUE (tipo, clave)
);
ALTER TABLE conceptualizador.consumo_aviso DROP CONSTRAINT IF EXISTS consumo_aviso_tipo_check;
ALTER TABLE conceptualizador.consumo_aviso ADD CONSTRAINT consumo_aviso_tipo_check CHECK (tipo IN ('pct80','pct100','diario','pausa24'));

-- V1.47.1 · pausa del agente por caso. La verdad del caso vive en el repo (analisis.json); esta tabla existe para el aviso de 24 h.
CREATE TABLE IF NOT EXISTS conceptualizador.agente_pausa (
  id             bigserial   PRIMARY KEY,
  caso_id        uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  por            text        NOT NULL CHECK (char_length(por) BETWEEN 1 AND 120),
  razon          text        NOT NULL CHECK (char_length(razon) BETWEEN 8 AND 300),
  camino         text        NOT NULL CHECK (camino IN ('boton','texto','voz','mensaje')),
  pct            int         CHECK (pct BETWEEN 0 AND 100),
  desde          timestamptz NOT NULL DEFAULT now(),
  hasta          timestamptz,
  reanudo_por    text        CHECK (char_length(reanudo_por) <= 120),
  reanudo_camino text        CHECK (reanudo_camino IN ('boton','texto','voz','mensaje'))
);
CREATE UNIQUE INDEX IF NOT EXISTS agente_pausa_viva ON conceptualizador.agente_pausa (caso_id) WHERE hasta IS NULL;

CREATE TABLE IF NOT EXISTS conceptualizador.publicacion (
  id         bigserial   PRIMARY KEY,
  pasada     text        NOT NULL UNIQUE,
  caso_id    uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  mensaje_id bigint      NOT NULL REFERENCES conceptualizador.mensaje(id),
  boton      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conceptualizador.push_envio DROP CONSTRAINT IF EXISTS push_envio_tipo_check;
ALTER TABLE conceptualizador.push_envio ADD CONSTRAINT push_envio_tipo_check CHECK (tipo IN ('oferta','recordatorio','avance'));

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('consumo_tope_semana', '60000000'),          -- freno total (ponderados), igual que conocimiento/comun/presupuesto-tokens.json
  ('consumo_aviso_pct',   '80'),
  ('consumo_avance_semana', '15000000')
ON CONFLICT (clave) DO NOTHING;

-- ── push: el mensaje proactivo del motor con la app cerrada ────────────────
-- Igual que 0010 (oferta y recordatorio) más 'avance': un mensaje publicado sin trabajo en las últimas 24 h que la persona
-- no ha visto, uno por caso al día (clave = la fecha de la zona de la persona). No cuenta para el tope de 3 de la sesión.
DO $ren11$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0011prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0011prev;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'push_candidatos_0011prev') THEN
    ALTER FUNCTION conceptualizador.push_candidatos(timestamptz) RENAME TO push_candidatos_0011prev;
  END IF;
END
$ren11$;

CREATE OR REPLACE FUNCTION conceptualizador.push_candidatos(p_ahora timestamptz)
RETURNS TABLE (caso_id uuid, actor text, tipo text, clave text, zona text, silencio boolean, sale_at timestamptz)
LANGUAGE sql STABLE AS $pc11$
  SELECT * FROM conceptualizador.push_candidatos_0011prev(p_ahora)
  UNION ALL
  SELECT t.caso_id, t.actor, t.tipo, t.clave, t.zona, conceptualizador.en_silencio(t.zona, p_ahora), conceptualizador.sale_a(t.zona, p_ahora)
    FROM (SELECT c.id AS caso_id, c.autor AS actor, 'avance'::text AS tipo,
                 to_char(p_ahora AT TIME ZONE conceptualizador.zona_de(c.autor, c.pais), 'YYYY-MM-DD') AS clave,
                 conceptualizador.zona_de(c.autor, c.pais) AS zona
            FROM conceptualizador.caso c
           WHERE c.estado = 'abierto' AND c.archivado_at IS NULL AND NOT c.demo
             AND NOT conceptualizador.esta_en_app(c.autor, p_ahora)
             AND EXISTS (SELECT 1 FROM conceptualizador.push_suscripcion s WHERE s.actor = c.autor AND s.baja_at IS NULL)
             AND coalesce((SELECT a.avisos FROM conceptualizador.push_ajuste a WHERE a.actor = c.autor), true)
             AND EXISTS (SELECT 1 FROM conceptualizador.publicacion pu JOIN conceptualizador.mensaje m ON m.id = pu.mensaje_id
                          WHERE pu.caso_id = c.id AND m.created_at > p_ahora - interval '24 hours'
                            AND NOT EXISTS (SELECT 1 FROM conceptualizador.push_visto v WHERE v.actor = c.autor AND v.caso_id = c.id AND v.visto_at >= m.created_at))) t
   WHERE NOT EXISTS (SELECT 1 FROM conceptualizador.push_envio e WHERE e.caso_id = t.caso_id AND e.tipo = 'avance' AND e.clave = t.clave
                      AND NOT (e.estado = 'fallida' AND e.intentos < conceptualizador.cfg('push_intentos_max')
                               AND e.tomado_at < p_ahora - make_interval(mins => conceptualizador.cfg('push_reintento_minutos')))
                      AND NOT (e.estado = 'enviando' AND e.tomado_at < p_ahora - interval '15 minutes'))
$pc11$;

-- ── api_motor: los modos nuevos; lo demás, igual ───────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot11$
DECLARE
  v_modo  text := p->>'modo';
  v_r     jsonb := CASE WHEN jsonb_typeof(p->'registro') = 'object' THEN p->'registro' ELSE '{}'::jsonb END;
  v_t     jsonb;
  v_caso  uuid;
  v_c     conceptualizador.caso%ROWTYPE;
  v_msg   bigint;
  v_desde date;
  v_hasta date;
  v_txt   text;
  v_tope  bigint;
  v_lunes date;
  v_sem   bigint;
  v_out   jsonb := '[]'::jsonb;
  v_x     jsonb;
  v_n     int;
  v_cam   text;
BEGIN
  IF v_modo IS NULL OR v_modo NOT IN ('registro_avance','presupuesto','publicar','hilo_caso','avisos_consumo','pausa') THEN
    RETURN conceptualizador.api_motor_0011prev(p);
  END IF;

  IF v_modo = 'registro_avance' THEN
    v_t := CASE WHEN jsonb_typeof(v_r->'tokens') = 'object' THEN v_r->'tokens' ELSE '{}'::jsonb END;
    IF coalesce(v_r->>'pasada','') !~ '^A[0-9]{10}-[a-z0-9]{1,8}\Z' OR coalesce(v_r->>'caso','') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'REGISTRO_INVALIDO');
    END IF;
    SELECT id INTO v_caso FROM conceptualizador.caso WHERE carpeta = v_r->>'caso' LIMIT 1;
    INSERT INTO conceptualizador.consumo_avance (pasada, caso_id, carpeta, motivo, modelo, input_tokens, output_tokens, cache_leida, cache_escrita,
        ponderado, llamadas_modelo, busquedas_precio, renglones, segundos, resultado, tope, dia)
    VALUES (v_r->>'pasada', v_caso, left(v_r->>'caso', 200),
        CASE WHEN v_r->>'motivo' IN ('levantamiento','avance','propagacion','aprende') THEN v_r->>'motivo' ELSE 'avance' END,
        left(v_r->>'modelo', 60),
        greatest(0, coalesce(nullif(v_t->>'input','')::bigint, 0)), greatest(0, coalesce(nullif(v_t->>'output','')::bigint, 0)),
        greatest(0, coalesce(nullif(v_t->>'cache_leida','')::bigint, 0)), greatest(0, coalesce(nullif(v_t->>'cache_escrita','')::bigint, 0)),
        greatest(0, coalesce(nullif(v_r->>'ponderado','')::numeric, 0))::bigint, coalesce(nullif(v_r->>'llamadas_modelo','')::int, 0),
        coalesce(nullif(v_r->>'busquedas_precio','')::int, 0), coalesce(nullif(v_r->>'renglones','')::int, 0), nullif(v_r->>'segundos','')::numeric,
        CASE WHEN v_r->>'resultado' IN ('avanzo','sin_cambio','cortado_tope','rechazado_decreto','error') THEN v_r->>'resultado' ELSE 'error' END,
        left(v_r->>'tope', 200), coalesce(nullif(v_r->>'dia','')::date, conceptualizador.dia_uso(now())))
    ON CONFLICT (pasada) DO NOTHING;
    RETURN jsonb_build_object('ok', true);

  ELSIF v_modo = 'presupuesto' THEN
    v_desde := coalesce(nullif(p->>'desde','')::date, conceptualizador.dia_uso(now()) - 6);
    v_hasta := coalesce(nullif(p->>'hasta','')::date, conceptualizador.dia_uso(now()));
    RETURN jsonb_build_object('ok', true, 'desde', v_desde, 'hasta', v_hasta,
      'mensajes',  (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE NOT proactivo AND dia BETWEEN v_desde AND v_hasta),
      'proactivo', (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE proactivo AND dia BETWEEN v_desde AND v_hasta),
      'por_dia',   (SELECT coalesce(jsonb_object_agg(d.dia, d.p), '{}'::jsonb) FROM (SELECT dia::text AS dia, sum(ponderado) AS p FROM conceptualizador.consumo_registro
                     WHERE NOT proactivo AND dia BETWEEN v_desde AND v_hasta GROUP BY dia) d),
      'por_dia_proactivo', (SELECT coalesce(jsonb_object_agg(d.dia, d.p), '{}'::jsonb) FROM (SELECT dia::text AS dia, sum(ponderado) AS p FROM conceptualizador.consumo_registro
                     WHERE proactivo AND dia BETWEEN v_desde AND v_hasta GROUP BY dia) d));

  ELSIF v_modo = 'publicar' THEN
    v_txt := btrim(coalesce(p->>'texto', ''));
    IF coalesce(p->>'pasada','') !~ '^A[0-9]{10}-[a-z0-9]{1,8}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'PASADA_INVALIDA'); END IF;
    IF char_length(v_txt) < 5 OR char_length(v_txt) > 6000 THEN RETURN jsonb_build_object('ok', false, 'error', 'TEXTO_INVALIDO'); END IF;
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_c.estado <> 'abierto' OR v_c.archivado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_ABIERTO', 'estado', v_c.estado); END IF;
    SELECT mensaje_id INTO v_msg FROM conceptualizador.publicacion WHERE pasada = p->>'pasada';
    IF v_msg IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'mensaje_id', v_msg, 'ya_estaba', true); END IF;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (v_c.id, 'motor', 'motor-avance', v_txt) RETURNING id INTO v_msg;
    INSERT INTO conceptualizador.publicacion (pasada, caso_id, mensaje_id, boton) VALUES (p->>'pasada', v_c.id, v_msg, left(p->>'boton', 20));
    RETURN jsonb_build_object('ok', true, 'mensaje_id', v_msg, 'push', 'lo decide push_candidatos (silencio 21–7, uno al día por caso)');

  ELSIF v_modo = 'pausa' THEN
    -- V1.47.1 · lo escribe procesa.js (sin modelo) cuando el dueño o Esteban pausa o reanuda al agente en un caso.
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF coalesce(p->>'por', '') = '' OR (p->>'por' <> v_c.autor AND NOT conceptualizador.es_admin(p->>'por')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_DUENO', 'mensaje', 'Solo el dueño del caso o Esteban pausan o reanudan al agente.');
    END IF;
    v_cam := CASE WHEN p->>'camino' IN ('boton','texto','voz','mensaje') THEN p->>'camino' ELSE 'mensaje' END;
    IF p->>'accion' = 'pausar' THEN
      v_txt := btrim(coalesce(p->>'razon', ''));
      IF char_length(v_txt) < 8 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_RAZON', 'mensaje', 'La pausa lleva razón.'); END IF;
      SELECT id INTO v_msg FROM conceptualizador.agente_pausa WHERE caso_id = v_c.id AND hasta IS NULL;
      IF v_msg IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'pausa_id', v_msg, 'ya_estaba', true); END IF;
      INSERT INTO conceptualizador.agente_pausa (caso_id, por, razon, camino, pct)
        VALUES (v_c.id, left(p->>'por', 120), left(v_txt, 300), v_cam,
                CASE WHEN (p->>'pct') ~ '^[0-9]{1,3}\Z' AND (p->>'pct')::int <= 100 THEN (p->>'pct')::int END)
        RETURNING id INTO v_msg;
      RETURN jsonb_build_object('ok', true, 'pausa_id', v_msg);
    ELSIF p->>'accion' = 'reanudar' THEN
      UPDATE conceptualizador.agente_pausa SET hasta = now(), reanudo_por = left(p->>'por', 120), reanudo_camino = v_cam
       WHERE caso_id = v_c.id AND hasta IS NULL RETURNING id INTO v_msg;
      RETURN jsonb_build_object('ok', true, 'pausa_id', v_msg, 'no_estaba', v_msg IS NULL);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'ACCION_INVALIDA');

  ELSIF v_modo = 'hilo_caso' THEN
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    RETURN jsonb_build_object('ok', true, 'hilo', conceptualizador.hilo(v_c.id));

  ELSE  -- avisos_consumo: qué correo toca (lo manda conceptualizador/consumo-avisos; esta función nunca envía nada)
    v_tope := conceptualizador.cfg('consumo_tope_semana');
    v_lunes := conceptualizador.dia_uso(now()) - (extract(isodow FROM conceptualizador.dia_uso(now()))::int - 1);
    SELECT coalesce(sum(ponderado), 0) INTO v_sem FROM conceptualizador.consumo_registro WHERE dia >= v_lunes;
    IF v_sem >= v_tope AND NOT EXISTS (SELECT 1 FROM conceptualizador.consumo_aviso WHERE tipo = 'pct100' AND clave = v_lunes::text) THEN
      v_out := v_out || jsonb_build_object('tipo', 'pct100', 'clave', v_lunes::text);
    ELSIF v_sem >= v_tope * conceptualizador.cfg('consumo_aviso_pct') / 100 AND NOT EXISTS (SELECT 1 FROM conceptualizador.consumo_aviso WHERE tipo = 'pct80' AND clave = v_lunes::text) THEN
      v_out := v_out || jsonb_build_object('tipo', 'pct80', 'clave', v_lunes::text);
    END IF;
    -- Resumen diario a las 7:00 CST, del día anterior, solo si hubo actividad.
    IF extract(hour FROM now() AT TIME ZONE 'America/Mexico_City') >= 7
       AND EXISTS (SELECT 1 FROM conceptualizador.consumo_registro WHERE dia = conceptualizador.dia_uso(now()) - 1)
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.consumo_aviso WHERE tipo = 'diario' AND clave = (conceptualizador.dia_uso(now()) - 1)::text) THEN
      v_out := v_out || jsonb_build_object('tipo', 'diario', 'clave', (conceptualizador.dia_uso(now()) - 1)::text);
    END IF;
    -- V1.47.1 · pausas vivas de 24 h o más: un aviso por cada 24 h cumplidas (n = 1, 2, …); si se juntan varias, solo la última n.
    SELECT v_out || coalesce(jsonb_agg(jsonb_build_object('tipo', 'pausa24', 'clave', q.id || ':' || q.n, 'pausa_id', q.id, 'n', q.n, 'horas', 24 * q.n,
             'caso_id', q.caso_id, 'carpeta', q.carpeta, 'titulo', q.titulo, 'dueno', q.autor, 'pais', q.pais, 'por', q.por, 'razon', q.razon,
             'camino', q.camino, 'pct', q.pct, 'desde', q.desde) ORDER BY q.desde), '[]'::jsonb)
      INTO v_out
      FROM (SELECT ap.*, c.carpeta, c.titulo, c.autor, c.pais, floor(extract(epoch FROM now() - ap.desde) / 86400)::int AS n
              FROM conceptualizador.agente_pausa ap JOIN conceptualizador.caso c ON c.id = ap.caso_id
             WHERE ap.hasta IS NULL AND ap.desde <= now() - interval '24 hours' AND c.archivado_at IS NULL AND NOT c.demo) q
     WHERE NOT EXISTS (SELECT 1 FROM conceptualizador.consumo_aviso a WHERE a.tipo = 'pausa24' AND a.clave = q.id || ':' || q.n);
    IF NOT coalesce((p->>'dry_run')::boolean, true) THEN
      INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle)
        SELECT x->>'tipo', x->>'clave', jsonb_build_object('semana', v_sem, 'tope', v_tope) FROM jsonb_array_elements(v_out) x WHERE x->>'tipo' <> 'pausa24'
      ON CONFLICT (tipo, clave) DO NOTHING;
      -- La pausa: el aviso queda marcado y, SOLO si se marcó ahora, una línea en el chat del dueño. Nada se reanuda solo.
      FOR v_x IN SELECT x FROM jsonb_array_elements(v_out) x WHERE x->>'tipo' = 'pausa24' LOOP
        INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle) VALUES ('pausa24', v_x->>'clave', v_x - 'tipo' - 'clave')
          ON CONFLICT (tipo, clave) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 1 THEN
          INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES ((v_x->>'caso_id')::uuid, 'motor', 'motor-avance',
            CASE WHEN v_x->>'pais' = 'usa' THEN 'I''ve been paused for ' || (v_x->>'horas') || ' h. Tap Resume when you want me to keep going.'
                 ELSE 'Llevo ' || (v_x->>'horas') || ' h en pausa. Toca Reanudar cuando quieras que siga.' END);
        END IF;
      END LOOP;
    END IF;
    RETURN jsonb_build_object('ok', true, 'dry_run', coalesce((p->>'dry_run')::boolean, true), 'semana_desde', v_lunes, 'semana', v_sem, 'tope', v_tope,
      'pct', CASE WHEN v_tope > 0 THEN round(100.0 * v_sem / v_tope, 1) END, 'avisos', v_out,
      'ayer', (SELECT jsonb_build_object('mensajes', coalesce(sum(ponderado) FILTER (WHERE NOT proactivo), 0), 'proactivo', coalesce(sum(ponderado) FILTER (WHERE proactivo), 0),
                 'trabajos', count(*) FILTER (WHERE NOT proactivo), 'pasadas', count(*) FILTER (WHERE proactivo),
                 'cortadas', count(*) FILTER (WHERE resultado = 'cortado_tope'), 'casos_avanzados', count(DISTINCT carpeta) FILTER (WHERE proactivo AND resultado = 'avanzo'))
                 FROM conceptualizador.consumo_registro WHERE dia = conceptualizador.dia_uso(now()) - 1),
      'ultimo_corte', (SELECT jsonb_build_object('carpeta', carpeta, 'ponderado', ponderado, 'tope', tope, 'at', created_at) FROM conceptualizador.consumo_registro
                        WHERE proactivo ORDER BY created_at DESC LIMIT 1));
  END IF;
END
$mot11$;

ALTER FUNCTION conceptualizador.api_motor(jsonb)          SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0011prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0011prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
DO $grp11$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_push') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION conceptualizador.api_push(jsonb) TO conceptualizador_app';
  END IF;
END
$grp11$;
