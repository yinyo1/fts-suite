-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0014 · V1.52 (#5): estado real, panel y frenos en la base.
-- Contrato: fts-conceptualizador motor/DISENO-V152.md (§1–§12, la parte que vive aquí).
--
--   §1  config nueva + bitácora config_cambio; api_suite config / config_guardar (solo panel_admin,
--       validado aquí) y api_motor config.
--   §2  uso_hoy con exclusiones (continuación, prueba, detener, arranque, revisa, no-personas,
--       «dame los generales»); el acuse del tope dice de quién, cuántos y a qué hora se reinicia.
--   §3  cerrar_colgados(): tomados sin señal con intentos agotados → error + línea en el chat + aviso;
--       tomados vencidos de un motor no vivo → pendiente (para el respaldo).
--   §4  tabla proceso y modo motor proceso (inicio/paso/fin/consulta); avance, tomar, entregar y error
--       también lo mueven; agente_estado reescrita (trabajando | cola | null, nunca detenido).
--   §5  evento detener (no crea trabajo, no cuenta).
--   §6  caso.arranque_auto, arrancar_levantamientos() y modo suite caso_arranque (dueño o Esteban);
--       hilo y casos traen arranque_auto_efectivo y arranque_auto_min.
--   §7  latido sin_relevo + profundidad; estado_motor_v152(); avisos motor_caido, motor_linaje,
--       trabajo_fallido, experimento_techo.
--   §8  error con razon_persona y reintento; error_ultimo/razon_ultima; tomar da intento_anterior.
--   §9  consumo y consumo_avance: archivos, fotos_modelo, etapas, medicion.
--   §10 consumo_avance.resultado 'saltada'.
--   §11 experimento_par y modo experimento (muestra / registra).
--   §12 modo caso_moneda.
--
-- Patrón: api_motor → api_motor_0014prev, api_suite → api_suite_0014prev, api_respaldo →
-- api_respaldo_0014prev; la nueva atiende lo suyo y delega lo demás.
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, &, acento
-- grave o dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── §1 · configuración ─────────────────────────────────────────────────────
-- ★ = se actualiza aunque exista (y deja su renglón en la bitácora si cambió).
CREATE TABLE IF NOT EXISTS conceptualizador.config_cambio (
  id         bigserial   PRIMARY KEY,
  clave      text        NOT NULL CHECK (char_length(clave) BETWEEN 1 AND 100),
  antes      text,
  despues    text,
  por        text        NOT NULL CHECK (char_length(por) BETWEEN 1 AND 120),
  razon      text        NOT NULL CHECK (char_length(razon) BETWEEN 3 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS config_cambio_fecha ON conceptualizador.config_cambio (created_at DESC);

INSERT INTO conceptualizador.config_cambio (clave, antes, despues, por, razon)
SELECT s.clave, c.valor, s.valor, 'migracion_0014', 'Semilla V1.52 (DISENO-V152 §1)'
  FROM (VALUES ('tope_mensajes_dia', '80'), ('tope_mensajes_dia:esteban.delacruz', '150')) s(clave, valor)
  LEFT JOIN conceptualizador.config c ON c.clave = s.clave
 WHERE c.valor IS DISTINCT FROM s.valor;
INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('tope_mensajes_dia', '80'),
  ('tope_mensajes_dia:esteban.delacruz', '150')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('tope_sesiones_dia', '8'),
  ('robot_desde', '07:00'),
  ('robot_hasta', '22:00'),
  ('robot_dias', '1,2,3,4,5'),
  ('robot_zona', 'America/Mexico_City'),
  ('robot_por_caso_dia_pasadas', '3'),
  ('robot_por_caso_dia_ponderado', '1500000'),
  ('robot_pasadas_por_hora', '3'),
  ('consumo_tope_semana', '60000000'),
  ('consumo_aviso_pct', '80'),
  ('arranque_auto_min', '15'),
  ('pasada_sin_novedad_salta', '1'),
  ('contexto_modo', 'completo'),
  ('experimento_pct', '15'),
  ('experimento_techo_semana', '5000000'),
  ('motor_caido_aviso_min', '15'),
  ('motor_caido_desde', '07:00'),
  ('motor_caido_hasta', '22:00'),
  ('panel_admin', 'esteban.delacruz')
ON CONFLICT (clave) DO NOTHING;

-- ── Columnas y CHECKs nuevos ───────────────────────────────────────────────
ALTER TABLE conceptualizador.caso    ADD COLUMN IF NOT EXISTS arranque_auto boolean;
ALTER TABLE conceptualizador.trabajo ADD COLUMN IF NOT EXISTS error_ultimo text,
                                     ADD COLUMN IF NOT EXISTS razon_ultima text,
                                     ADD COLUMN IF NOT EXISTS motor_ultimo text;
ALTER TABLE conceptualizador.latido  ADD COLUMN IF NOT EXISTS profundidad int,
                                     ADD COLUMN IF NOT EXISTS activo_at timestamptz,
                                     ADD COLUMN IF NOT EXISTS estado_desde timestamptz;
ALTER TABLE conceptualizador.consumo ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb,
                                     ADD COLUMN IF NOT EXISTS fotos_modelo int NOT NULL DEFAULT 0,
                                     ADD COLUMN IF NOT EXISTS etapas jsonb NOT NULL DEFAULT '{}'::jsonb,
                                     ADD COLUMN IF NOT EXISTS medicion text NOT NULL DEFAULT 'transcripcion';
ALTER TABLE conceptualizador.consumo_avance ADD COLUMN IF NOT EXISTS archivos jsonb NOT NULL DEFAULT '[]'::jsonb,
                                     ADD COLUMN IF NOT EXISTS fotos_modelo int NOT NULL DEFAULT 0,
                                     ADD COLUMN IF NOT EXISTS etapas jsonb NOT NULL DEFAULT '{}'::jsonb,
                                     ADD COLUMN IF NOT EXISTS medicion text NOT NULL DEFAULT 'transcripcion';
-- Lo que ya estaba en consumo_aviso ya se avisó; lo nuevo que encolan cerrar_colgados y experimento nace en NULL.
ALTER TABLE conceptualizador.consumo_aviso ADD COLUMN IF NOT EXISTS avisado_at timestamptz DEFAULT now();

ALTER TABLE conceptualizador.consumo DROP CONSTRAINT IF EXISTS consumo_medicion_check;
ALTER TABLE conceptualizador.consumo ADD CONSTRAINT consumo_medicion_check
  CHECK (medicion IN ('transcripcion','sin_medicion') AND fotos_modelo >= 0);
ALTER TABLE conceptualizador.consumo_avance DROP CONSTRAINT IF EXISTS consumo_avance_medicion_check;
ALTER TABLE conceptualizador.consumo_avance ADD CONSTRAINT consumo_avance_medicion_check
  CHECK (medicion IN ('transcripcion','sin_medicion') AND fotos_modelo >= 0);

ALTER TABLE conceptualizador.evento DROP CONSTRAINT IF EXISTS evento_tipo_check;
ALTER TABLE conceptualizador.evento ADD CONSTRAINT evento_tipo_check
  CHECK (tipo IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra','accion','ejecucion','continuacion',
                  'palomeada','prueba','que_falta','ciudad','detener','arranque'));
ALTER TABLE conceptualizador.trabajo DROP CONSTRAINT IF EXISTS trabajo_estado_check;
ALTER TABLE conceptualizador.trabajo ADD CONSTRAINT trabajo_estado_check
  CHECK (estado IN ('pendiente','tomado','listo','error','detenido'));
ALTER TABLE conceptualizador.latido DROP CONSTRAINT IF EXISTS latido_estado_check;
ALTER TABLE conceptualizador.latido ADD CONSTRAINT latido_estado_check
  CHECK (estado IN ('activo','pausado','apagado','sin_relevo'));
ALTER TABLE conceptualizador.consumo_avance DROP CONSTRAINT IF EXISTS consumo_avance_resultado_check;
ALTER TABLE conceptualizador.consumo_avance ADD CONSTRAINT consumo_avance_resultado_check
  CHECK (resultado IN ('avanzo','sin_cambio','cortado_tope','rechazado_decreto','error','saltada'));
ALTER TABLE conceptualizador.consumo_aviso DROP CONSTRAINT IF EXISTS consumo_aviso_tipo_check;
ALTER TABLE conceptualizador.consumo_aviso ADD CONSTRAINT consumo_aviso_tipo_check
  CHECK (tipo IN ('pct80','pct100','diario','pausa24','motor_caido','motor_linaje','trabajo_fallido','experimento_techo'));
ALTER TABLE conceptualizador.cambio_sesion DROP CONSTRAINT IF EXISTS cambio_sesion_tipo_check;
ALTER TABLE conceptualizador.cambio_sesion ADD CONSTRAINT cambio_sesion_tipo_check
  CHECK (tipo IN ('renombrar','archivar','desarchivar','fijar','desfijar','prueba','no_prueba','empresa','ciudad','modo','moneda'));

-- ── §4 · proceso: lo que el agente hace AHORA, con señal propia ─────────────
CREATE TABLE IF NOT EXISTS conceptualizador.proceso (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  quien       text        NOT NULL CHECK (quien IN ('motor','respaldo','robot')),
  trabajo_id  bigint,
  pasada      text        CHECK (pasada IS NULL OR char_length(pasada) <= 30),
  pasos       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  paso_i      int         NOT NULL DEFAULT 0,
  paso        text        CHECK (paso IS NULL OR char_length(paso) <= 120),
  hechos      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  inicio      timestamptz NOT NULL DEFAULT now(),
  senal       timestamptz NOT NULL DEFAULT now(),
  fin         timestamptz,
  resultado   text        CHECK (resultado IS NULL OR resultado IN ('listo','error','detenido','vencido','saltado')),
  gasto       bigint      NOT NULL DEFAULT 0 CHECK (gasto >= 0),
  detener_por text        CHECK (detener_por IS NULL OR char_length(detener_por) <= 120),
  detener_at  timestamptz
);
CREATE INDEX IF NOT EXISTS proceso_caso_vivo ON conceptualizador.proceso (caso_id, senal DESC) WHERE fin IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS proceso_vivo_trabajo ON conceptualizador.proceso (trabajo_id) WHERE fin IS NULL AND trabajo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS proceso_vivo_pasada  ON conceptualizador.proceso (pasada) WHERE fin IS NULL AND pasada IS NOT NULL;

-- ── §11 · experimento de contexto ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.experimento_par (
  id              bigserial   PRIMARY KEY,
  trabajo_id      bigint      NOT NULL UNIQUE,
  caso_id         uuid        REFERENCES conceptualizador.caso(id),
  grupo           text        CHECK (grupo IS NULL OR grupo IN ('corto','largo')),
  sombra          boolean     NOT NULL DEFAULT false,
  motivo          text        CHECK (motivo IS NULL OR char_length(motivo) <= 40),
  costo_completo  bigint      CHECK (costo_completo IS NULL OR costo_completo >= 0),
  costo_sombra    bigint      CHECK (costo_sombra IS NULL OR costo_sombra >= 0),
  igual_conceptos boolean,
  igual_precios   boolean,
  igual_preguntas boolean,
  faltantes       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  dia             date        NOT NULL,
  muestra_at      timestamptz NOT NULL DEFAULT now(),
  registrado_at   timestamptz
);
CREATE INDEX IF NOT EXISTS experimento_par_dia ON conceptualizador.experimento_par (dia);

-- El gasto de la sombra cuenta en el freno semanal (consumo_registro), como renglón aparte 'sombra'.
CREATE OR REPLACE VIEW conceptualizador.consumo_registro AS
 SELECT k.created_at, conceptualizador.dia_uso(k.created_at) AS dia, k.caso_id, ca.carpeta, false AS proactivo,
        k.tipo_trabajo AS motivo, k.trabajo_id, NULL::text AS pasada, k.input_tokens, k.output_tokens, k.cache_leida, k.cache_escrita,
        round(k.input_tokens::numeric + 1.25 * k.cache_escrita::numeric + 0.10 * k.cache_leida::numeric + (5 * k.output_tokens)::numeric)::bigint AS ponderado,
        k.llamadas_modelo, COALESCE(k.busquedas_precio, (k.pasos ->> 'web'::text)::integer, 0) AS busquedas_precio,
        k.renglones, k.segundos, COALESCE(k.resultado, 'atendido'::text) AS resultado, NULL::text AS tope
   FROM conceptualizador.consumo k
   JOIN conceptualizador.caso ca ON ca.id = k.caso_id
 UNION ALL
 SELECT a.created_at, a.dia, a.caso_id, a.carpeta, true AS proactivo, a.motivo, NULL::bigint AS trabajo_id, a.pasada,
        a.input_tokens, a.output_tokens, a.cache_leida, a.cache_escrita, a.ponderado, a.llamadas_modelo, a.busquedas_precio,
        a.renglones, a.segundos, a.resultado, a.tope
   FROM conceptualizador.consumo_avance a
 UNION ALL
 SELECT x.registrado_at, x.dia, x.caso_id, cx.carpeta, false AS proactivo, 'sombra'::text AS motivo, NULL::bigint AS trabajo_id,
        NULL::text AS pasada, 0::bigint, 0::bigint, 0::bigint, 0::bigint, x.costo_sombra AS ponderado, 0::integer, 0::integer,
        0::integer, NULL::numeric, 'sombra'::text, NULL::text
   FROM conceptualizador.experimento_par x
   LEFT JOIN conceptualizador.caso cx ON cx.id = x.caso_id
  WHERE coalesce(x.costo_sombra, 0) > 0;

-- ── Ayudas ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.a_entero(p text) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $ae14$
  SELECT CASE WHEN btrim(coalesce(p, '')) ~ '^[0-9]{1,15}\Z' THEN btrim(p)::bigint END
$ae14$;

CREATE OR REPLACE FUNCTION conceptualizador.a_uuid(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $au14$
  SELECT CASE WHEN lower(btrim(coalesce(p, ''))) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z'
              THEN lower(btrim(p))::uuid END
$au14$;

-- Zona de las horas que se le dicen a la persona (robot_zona; una sola para todos).
CREATE OR REPLACE FUNCTION conceptualizador.zona_robot() RETURNS text
LANGUAGE sql STABLE AS $zr14$
  SELECT coalesce(conceptualizador.zona_valida(conceptualizador.cfg_txt('robot_zona')),
                  conceptualizador.zona_valida(conceptualizador.cfg_txt('zona_uso')), 'America/Mexico_City')
$zr14$;

-- hh:mm en la zona del robot; con día (dd/mm) si no es hoy.
CREATE OR REPLACE FUNCTION conceptualizador.hora_local(p timestamptz, p_con_dia boolean DEFAULT true) RETURNS text
LANGUAGE sql STABLE AS $hl14$
  SELECT CASE WHEN p IS NULL THEN NULL
              WHEN p_con_dia AND (p AT TIME ZONE conceptualizador.zona_robot())::date <> (now() AT TIME ZONE conceptualizador.zona_robot())::date
                THEN to_char(p AT TIME ZONE conceptualizador.zona_robot(), 'DD/MM HH24:MI')
              ELSE to_char(p AT TIME ZONE conceptualizador.zona_robot(), 'HH24:MI') END
$hl14$;

-- ¿La hora actual (zona del robot) cae entre dos HH:MM? Admite ventana que cruza medianoche.
CREATE OR REPLACE FUNCTION conceptualizador.en_ventana(p_desde text, p_hasta text, p_ahora timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE plpgsql STABLE AS $ev14$
DECLARE v_t time := (p_ahora AT TIME ZONE conceptualizador.zona_robot())::time; v_d time; v_h time;
BEGIN
  BEGIN v_d := p_desde::time; v_h := p_hasta::time; EXCEPTION WHEN others THEN RETURN false; END;
  IF v_d <= v_h THEN RETURN v_t >= v_d AND v_t < v_h; END IF;
  RETURN v_t >= v_d OR v_t < v_h;
END
$ev14$;

CREATE OR REPLACE FUNCTION conceptualizador.es_panel_admin(p_actor text) RETURNS boolean
LANGUAGE sql STABLE AS $pa14$
  SELECT p_actor IS NOT NULL AND p_actor = btrim(coalesce(conceptualizador.cfg_txt('panel_admin'), ''))
$pa14$;

CREATE OR REPLACE FUNCTION conceptualizador.lunes_uso() RETURNS date
LANGUAGE sql STABLE AS $lu14$
  SELECT conceptualizador.dia_uso(now()) - (extract(isodow FROM conceptualizador.dia_uso(now()))::int - 1)
$lu14$;

-- ── §2 · tope por persona ──────────────────────────────────────────────────
-- «dame los generales» y variantes: pedir los datos del caso no gasta del tope.
CREATE OR REPLACE FUNCTION conceptualizador.es_generales(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $eg14$
  SELECT coalesce(btrim(regexp_replace(regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuaeiouu'),
           '[^a-zñ ]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))
         ~ '^((oye|hola|porfa|por favor) )?((dame|pasame|mandame|manda|ensename|muestrame|quiero|ver|cuales son|me das|me pasas) )?((los|tus|mis) )?(datos )?generales( (del|de la) (caso|proyecto|sesion|cotizacion))?( (por favor|porfa))?\Z', false)
$eg14$;

-- Los trabajos que cuentan para el tope de un día: de personas y que de verdad le piden algo al agente.
CREATE OR REPLACE FUNCTION conceptualizador.trabajos_que_cuentan(p_dia date) RETURNS TABLE (trabajo_id bigint, actor text)
LANGUAGE sql STABLE AS $tq14$
  SELECT t.id, coalesce(m.autor, e.autor)
    FROM conceptualizador.trabajo t
    LEFT JOIN conceptualizador.mensaje m ON m.id = t.mensaje_id
    LEFT JOIN conceptualizador.evento  e ON e.id = t.evento_id
   WHERE t.created_at >= (p_dia - 1)::timestamp AT TIME ZONE 'UTC'
     AND t.created_at <  (p_dia + 2)::timestamp AT TIME ZONE 'UTC'
     AND conceptualizador.dia_uso(t.created_at) = p_dia
     AND conceptualizador.es_persona(coalesce(m.autor, e.autor))
     AND coalesce(e.tipo, '') NOT IN ('continuacion','prueba','detener','arranque')
     AND NOT (coalesce(e.tipo, '') = 'correccion' AND coalesce(e.concepto, '') = 'revisa')
     AND NOT (t.tipo = 'mensaje' AND conceptualizador.es_generales(m.texto))
$tq14$;

CREATE OR REPLACE FUNCTION conceptualizador.uso_hoy(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $uh14$
  SELECT jsonb_build_object(
    'dia', conceptualizador.dia_uso(now()),
    'mensajes', (SELECT count(*) FROM conceptualizador.trabajos_que_cuentan(conceptualizador.dia_uso(now())) q WHERE q.actor = p_actor),
    'tope_mensajes', conceptualizador.tope('tope_mensajes_dia', p_actor),
    'sesiones', (SELECT count(*) FROM conceptualizador.caso c
                  WHERE c.autor = p_actor AND c.created_at > now() - interval '2 days'
                    AND conceptualizador.dia_uso(c.created_at) = conceptualizador.dia_uso(now())),
    'tope_sesiones', conceptualizador.tope('tope_sesiones_dia', p_actor),
    'reinicia', '00:00')
$uh14$;

-- El acuse dice de quién es el tope, cuántos lleva y cuándo se reinicia. El aviso a Esteban
-- se registra para los demás, nunca para él mismo.
CREATE OR REPLACE FUNCTION conceptualizador.aviso_tope(p_actor text, p_tipo text, p_uso jsonb) RETURNS text
LANGUAGE plpgsql AS $at14$
DECLARE
  v_admin boolean := conceptualizador.es_admin(p_actor) OR conceptualizador.es_panel_admin(p_actor);
  v_z     text := coalesce(conceptualizador.cfg_txt('zona_uso'), 'America/Mexico_City');
  v_que   text; v_n text; v_t text;
BEGIN
  IF NOT v_admin THEN
    INSERT INTO conceptualizador.aviso (tipo, actor, dia, detalle)
    VALUES (p_tipo, p_actor, conceptualizador.dia_uso(now()), p_uso)
    ON CONFLICT (tipo, actor, dia) WHERE tipo IN ('tope_mensajes','tope_sesiones','fuera_de_tema') DO UPDATE SET detalle = EXCLUDED.detalle;
  END IF;
  IF p_tipo = 'tope_sesiones' THEN
    v_que := 'sesiones nuevas'; v_n := coalesce(p_uso->>'sesiones', '?'); v_t := coalesce(p_uso->>'tope_sesiones', '?');
  ELSE
    v_que := 'mensajes'; v_n := coalesce(p_uso->>'mensajes', '?'); v_t := coalesce(p_uso->>'tope_mensajes', '?');
  END IF;
  RETURN 'Llegaste a tu tope de ' || v_que || ' de hoy (' || v_n || ' de ' || v_t || '). Se reinicia a las 00:00 ('
         || CASE WHEN v_z = 'America/Mexico_City' THEN 'hora del centro de México' ELSE 'hora de ' || v_z END || ').';
END
$at14$;

-- ── §1 · validación de un valor del panel (NULL = válido) ──────────────────
CREATE OR REPLACE FUNCTION conceptualizador.config_valida(p_clave text, p_valor text) RETURNS text
LANGUAGE plpgsql STABLE AS $cv14$
DECLARE
  v   text := btrim(coalesce(p_valor, ''));
  k   text := coalesce(p_clave, '');
  v_n numeric; v_min numeric; v_max numeric;
BEGIN
  IF char_length(v) > 200 THEN RETURN 'valor demasiado largo'; END IF;
  IF k IN ('robot_desde','robot_hasta','motor_caido_desde','motor_caido_hasta') THEN
    IF v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]\Z' THEN RETURN 'hora en formato HH:MM (00:00 a 23:59)'; END IF;
    RETURN NULL;
  ELSIF k = 'robot_dias' THEN
    IF v !~ '^[1-7](,[1-7]){0,6}\Z' THEN RETURN 'días ISO separados por coma (lunes = 1, domingo = 7)'; END IF;
    IF (SELECT count(*) <> count(DISTINCT d) FROM unnest(string_to_array(v, ',')) d) THEN RETURN 'un día repetido'; END IF;
    RETURN NULL;
  ELSIF k = 'robot_zona' THEN
    IF conceptualizador.zona_valida(v) IS NULL THEN RETURN 'zona horaria no reconocida'; END IF;
    RETURN NULL;
  ELSIF k = 'contexto_modo' THEN
    IF v NOT IN ('completo','experimento','incremental') THEN RETURN 'completo, experimento o incremental'; END IF;
    RETURN NULL;
  ELSIF k = 'panel_admin' THEN
    IF v !~ '^[a-z0-9][a-z0-9._-]{1,59}\Z' THEN RETURN 'usuario de la suite (minúsculas, punto o guion)'; END IF;
    RETURN NULL;
  END IF;
  SELECT r.mn, r.mx INTO v_min, v_max FROM (VALUES
      ('tope_mensajes_dia', 1, 2000), ('tope_sesiones_dia', 1, 200),
      ('robot_por_caso_dia_pasadas', 0, 48), ('robot_por_caso_dia_ponderado', 0, 100000000),
      ('robot_pasadas_por_hora', 0, 60), ('consumo_tope_semana', 0, 1000000000), ('consumo_aviso_pct', 1, 100),
      ('arranque_auto_min', 1, 1440), ('pasada_sin_novedad_salta', 0, 1), ('experimento_pct', 0, 100),
      ('experimento_techo_semana', 0, 100000000), ('motor_caido_aviso_min', 1, 1440)) r(clave, mn, mx)
   WHERE r.clave = k;
  IF v_min IS NULL THEN
    IF k ~ '^tope_mensajes_dia:[a-z0-9][a-z0-9._-]{1,59}\Z' THEN v_min := 0; v_max := 2000;
    ELSIF k ~ '^tope_sesiones_dia:[a-z0-9][a-z0-9._-]{1,59}\Z' THEN v_min := 0; v_max := 200;
    ELSIF k ~ '^arranque_auto:[a-z0-9][a-z0-9._-]{1,59}\Z' THEN v_min := 0; v_max := 1;
    ELSE RETURN 'esa clave no se edita desde el panel';
    END IF;
  END IF;
  IF v !~ '^[0-9]{1,12}\Z' THEN RETURN 'número entero sin signo'; END IF;
  v_n := v::numeric;
  IF v_n < v_min OR v_n > v_max THEN RETURN 'fuera de rango (' || v_min || ' a ' || v_max || ')'; END IF;
  RETURN NULL;
END
$cv14$;

-- ── §7 · estado del motor para la pantalla ─────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.estado_motor_v152() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $em14$
DECLARE
  l       conceptualizador.latido%ROWTYPE;
  v_vivo  interval := make_interval(secs => coalesce(conceptualizador.cfg('latido_vivo_segundos'), 120));
  v_min   int := coalesce(conceptualizador.cfg('motor_caido_aviso_min'), 15);
  v_fres  boolean;
  v_est   text;
  v_causa text;
  v_desde timestamptz;
  v_ult   timestamptz;
  v_zomb  timestamptz;
  v_aten  int := 0;
  v_txt   text;
BEGIN
  SELECT * INTO l FROM conceptualizador.latido WHERE motor = 'principal';
  v_fres := l.motor IS NOT NULL AND l.visto_at > now() - v_vivo;
  SELECT max(listo_at) INTO v_ult FROM conceptualizador.trabajo WHERE estado = 'listo' AND tomado_por = 'principal';
  IF v_fres AND l.estado = 'sin_relevo' THEN
    v_est := 'sin_relevo'; v_causa := 'sin_relevo'; v_desde := coalesce(l.estado_desde, l.visto_at);
  ELSIF v_fres AND l.estado = 'activo' THEN
    -- Late pero no procesa: el respaldo entregó después de lo último del principal y hace más de N min.
    SELECT min(listo_at) INTO v_zomb FROM conceptualizador.trabajo
     WHERE estado = 'listo' AND tomado_por = 'respaldo'
       AND listo_at > greatest(coalesce(v_ult, '-infinity'::timestamptz), coalesce(l.estado_desde, '-infinity'::timestamptz));
    IF v_zomb IS NOT NULL AND v_zomb < now() - make_interval(mins => v_min) THEN
      v_est := 'caido'; v_causa := 'sin_proceso'; v_desde := coalesce(v_ult, l.estado_desde, v_zomb);
    ELSE
      v_est := 'activo'; v_desde := l.estado_desde;
    END IF;
  ELSE
    v_est := 'caido'; v_causa := 'sin_latido'; v_desde := coalesce(l.activo_at, l.visto_at);
  END IF;
  IF v_est <> 'activo' THEN
    SELECT count(*) INTO v_aten FROM conceptualizador.trabajo
     WHERE estado = 'listo' AND tomado_por = 'respaldo' AND (v_desde IS NULL OR listo_at >= v_desde);
  END IF;
  v_txt := CASE v_est
    WHEN 'activo' THEN 'Motor principal activo'
    WHEN 'sin_relevo' THEN 'Motor principal sin poder relevarse' || coalesce(' desde ' || conceptualizador.hora_local(v_desde), '')
    ELSE 'Motor principal caído' || coalesce(' desde ' || conceptualizador.hora_local(v_desde), '') || ' · te contesta el respaldo (tarda unos minutos)' END;
  RETURN jsonb_build_object(
    'principal', jsonb_build_object('estado', v_est, 'causa', v_causa, 'desde', v_desde, 'visto_at', l.visto_at,
                                    'ultimo_trabajo_at', v_ult, 'profundidad', l.profundidad, 'sesion', l.sesion),
    'respaldo', jsonb_build_object('atendidos_desde_caida', v_aten),
    'texto', v_txt);
END
$em14$;

-- ── §4 · agente_estado: proceso vivo | cola | null ─────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.agente_estado(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ag14$
  WITH c AS (SELECT * FROM conceptualizador.caso WHERE id = p_caso),
  vivo AS (SELECT * FROM conceptualizador.proceso pr
            WHERE pr.caso_id = p_caso AND pr.fin IS NULL
              AND pr.senal > now() - make_interval(secs => conceptualizador.cfg('lease_segundos'))
            ORDER BY pr.senal DESC LIMIT 1),
  cola AS (SELECT t.* FROM conceptualizador.trabajo t, c
            WHERE t.caso_id = p_caso AND t.lote_de IS NULL AND t.estado = 'pendiente'
              AND NOT (c.modo = 'levantamiento' AND c.disparado_at IS NULL)
            ORDER BY t.created_at LIMIT 1)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM vivo) THEN (SELECT jsonb_build_object('estado', 'trabajando', 'quien', v.quien, 'paso', v.paso,
        'pasos', v.pasos, 'paso_i', v.paso_i, 'hechos', v.hechos, 'desde', v.inicio, 'senal', v.senal, 'gasto', v.gasto,
        'proceso_id', v.id, 'trabajo_id', v.trabajo_id, 'pasada', v.pasada,
        'deteniendo', v.detener_at IS NOT NULL, 'detener_por', v.detener_por) FROM vivo v)
    WHEN EXISTS (SELECT 1 FROM cola) THEN (SELECT jsonb_build_object('estado', 'cola', 'trabajo_id', id, 'desde', created_at) FROM cola)
    ELSE NULL END
$ag14$;

-- ── §3 · trabajos colgados ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.cerrar_colgados() RETURNS jsonb
LANGUAGE plpgsql AS $cc14$
DECLARE
  v_lease interval := make_interval(secs => coalesce(conceptualizador.cfg('lease_segundos'), 600));
  v_vivo  boolean := coalesce((conceptualizador.estado_motor()->>'principal_vivo')::boolean, false);
  t       record;
  v_err   text;
  v_cerr  int := 0;
  v_dev   int := 0;
  v_venc  int := 0;
  v_n     int;
BEGIN
  -- a) Intentos agotados y sin señal: error, una línea para la persona y un aviso a Esteban.
  FOR t IN SELECT tr.*, c.carpeta, c.titulo, c.autor AS dueno
             FROM conceptualizador.trabajo tr JOIN conceptualizador.caso c ON c.id = tr.caso_id
            WHERE tr.estado = 'tomado' AND tr.lote_de IS NULL AND tr.intentos >= tr.max_intentos
              AND coalesce(greatest(tr.tomado_at, tr.avance_at), tr.created_at) < now() - v_lease
            ORDER BY tr.id FOR UPDATE OF tr SKIP LOCKED LOOP
    v_err := 'SIN_SENAL_' || t.intentos || '_INTENTOS';
    UPDATE conceptualizador.trabajo SET estado = 'error', error = v_err, error_ultimo = v_err,
           razon_ultima = 'el agente se quedó sin señal', motor_ultimo = t.tomado_por, avance = NULL
     WHERE id = t.id AND estado = 'tomado';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    CONTINUE WHEN v_n = 0;
    UPDATE conceptualizador.trabajo SET estado = 'pendiente', tomado_por = NULL, sesion = NULL, tomado_at = NULL,
           lote_de = NULL, avance = NULL, avance_at = NULL
     WHERE lote_de = t.id AND estado = 'tomado';
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
    VALUES (t.caso_id, 'motor', 'sistema', 'No te pude contestar: el agente se quedó sin señal ' || t.intentos
            || ' veces seguidas. Escríbeme de nuevo para retomarlo.');
    INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
    VALUES ('trabajo_fallido', t.id::text, jsonb_build_object('trabajo_id', t.id, 'caso_id', t.caso_id, 'carpeta', t.carpeta,
            'titulo', t.titulo, 'dueno', t.dueno, 'error', v_err, 'intentos', t.intentos, 'tomado_por', t.tomado_por,
            'tomado_at', t.tomado_at, 'avance', t.avance, 'avance_at', t.avance_at), NULL)
    ON CONFLICT (tipo, clave) DO NOTHING;
    UPDATE conceptualizador.proceso SET fin = now(), resultado = 'error' WHERE trabajo_id = t.id AND fin IS NULL;
    v_cerr := v_cerr + 1;
  END LOOP;

  -- b) C7 · lease vencido de un motor que no está vivo, con intentos que le quedan: a la cola, sin gastar intento.
  --    El respaldo no late (es una rutina por trabajo): un tomado suyo vencido se considera muerto.
  FOR t IN SELECT tr.* FROM conceptualizador.trabajo tr
            WHERE tr.estado = 'tomado' AND tr.lote_de IS NULL AND tr.intentos < tr.max_intentos
              AND coalesce(greatest(tr.tomado_at, tr.avance_at), tr.created_at) < now() - v_lease
              AND (tr.tomado_por IS NULL OR tr.tomado_por = 'respaldo' OR (tr.tomado_por = 'principal' AND NOT v_vivo))
            ORDER BY tr.id FOR UPDATE SKIP LOCKED LOOP
    UPDATE conceptualizador.trabajo SET estado = 'pendiente', tomado_por = NULL, sesion = NULL, tomado_at = NULL,
           avance = NULL, avance_at = NULL, respaldo_disparado_at = NULL,
           error_ultimo = 'SIN_SENAL', razon_ultima = 'el agente se quedó sin señal', motor_ultimo = t.tomado_por
     WHERE id = t.id AND estado = 'tomado';
    UPDATE conceptualizador.trabajo SET estado = 'pendiente', tomado_por = NULL, sesion = NULL, tomado_at = NULL,
           lote_de = NULL, avance = NULL, avance_at = NULL
     WHERE lote_de = t.id AND estado = 'tomado';
    UPDATE conceptualizador.proceso SET fin = now(), resultado = 'vencido' WHERE trabajo_id = t.id AND fin IS NULL;
    v_dev := v_dev + 1;
  END LOOP;

  -- c) Mensajes de un lote cuyo trabajo ya no está en proceso: vuelven a la cola.
  UPDATE conceptualizador.trabajo o SET estado = 'pendiente', tomado_por = NULL, sesion = NULL, tomado_at = NULL,
         lote_de = NULL, avance = NULL, avance_at = NULL
   WHERE o.estado = 'tomado' AND o.lote_de IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo pa WHERE pa.id = o.lote_de AND pa.estado = 'tomado');

  -- d) Procesos sin señal: se cierran (lo vencido no se pinta).
  UPDATE conceptualizador.proceso SET fin = now(), resultado = 'vencido'
   WHERE fin IS NULL AND senal < now() - v_lease;
  GET DIAGNOSTICS v_venc = ROW_COUNT;
  RETURN jsonb_build_object('cerrados', v_cerr, 'devueltos', v_dev, 'procesos_vencidos', v_venc);
END
$cc14$;

-- ── §6 · arranque automático de levantamientos ─────────────────────────────
-- Valor efectivo: caso > persona (arranque_auto:<actor>) > config (arranque_auto, por omisión 1).
CREATE OR REPLACE FUNCTION conceptualizador.arranque_efectivo(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ae6$
  SELECT jsonb_build_object(
    'valor', CASE WHEN c.arranque_auto IS NOT NULL THEN c.arranque_auto
                  WHEN conceptualizador.cfg_txt('arranque_auto:' || c.autor) IS NOT NULL THEN conceptualizador.cfg_txt('arranque_auto:' || c.autor) <> '0'
                  ELSE coalesce(conceptualizador.cfg_txt('arranque_auto'), '1') <> '0' END,
    'fuente', CASE WHEN c.arranque_auto IS NOT NULL THEN 'caso'
                   WHEN conceptualizador.cfg_txt('arranque_auto:' || c.autor) IS NOT NULL THEN 'persona' ELSE 'config' END,
    'caso', c.arranque_auto,
    'min', greatest(coalesce(conceptualizador.cfg('arranque_auto_min'), 15), 1))
  FROM conceptualizador.caso c WHERE c.id = p_caso
$ae6$;

CREATE OR REPLACE FUNCTION conceptualizador.arrancar_levantamientos() RETURNS int
LANGUAGE plpgsql AS $al14$
DECLARE
  v_min int := greatest(coalesce(conceptualizador.cfg('arranque_auto_min'), 15), 1);
  k     record;
  v_n   int;
  v_tot int := 0;
BEGIN
  FOR k IN SELECT c.id, c.autor, x.ult
             FROM conceptualizador.caso c
             CROSS JOIN LATERAL (SELECT greatest(
                 (SELECT max(m.created_at) FROM conceptualizador.mensaje m
                   WHERE m.caso_id = c.id AND m.rol = 'usuario' AND conceptualizador.es_persona(m.autor)),
                 (SELECT max(a.created_at) FROM conceptualizador.adjunto a
                   WHERE a.caso_id = c.id AND conceptualizador.es_persona(a.autor))) AS ult) x
            WHERE c.estado = 'abierto' AND c.archivado_at IS NULL AND NOT c.demo
              AND c.modo = 'levantamiento' AND c.disparado_at IS NULL
              AND (conceptualizador.arranque_efectivo(c.id)->>'valor')::boolean
              AND NOT EXISTS (SELECT 1 FROM conceptualizador.agente_pausa ap WHERE ap.caso_id = c.id AND ap.hasta IS NULL)
              AND x.ult IS NOT NULL AND x.ult < now() - make_interval(mins => v_min)
            ORDER BY x.ult LIMIT 20 LOOP
    UPDATE conceptualizador.caso SET disparado_at = now() WHERE id = k.id AND disparado_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    CONTINUE WHEN v_n = 0;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
    VALUES (k.id, 'motor', 'sistema', 'Arranqué solo: pasaron ' || v_min
            || ' min sin nada nuevo. Lo nuevo que mandes entra en la siguiente vuelta.');
    PERFORM conceptualizador.encolar_evento(k.id, 'arranque', NULL, NULL,
              jsonb_build_object('min', v_min, 'ultima_actividad', k.ult), 'sistema');
    v_tot := v_tot + 1;
  END LOOP;
  RETURN v_tot;
END
$al14$;

-- ── §8 · la razón para la persona, sin datos internos ──────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.razon_limpia(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $rl14$
  SELECT CASE WHEN r IS NULL OR char_length(r) < 3 OR r ~* '(https?:|www[.]|[/{}<>@]|[0-9a-f]{8}-[0-9a-f]{4}-)' THEN NULL ELSE r END
    FROM (SELECT left(rtrim(btrim(regexp_replace(coalesce(p, ''), '[[:space:]]+', ' ', 'g')), '. '), 200) AS r) s
$rl14$;

CREATE OR REPLACE FUNCTION conceptualizador.codigo_de(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $cd14$
  SELECT coalesce(substring(coalesce(p, '') FROM '[A-Z][A-Z0-9_]{2,40}'), 'ERROR')
$cd14$;

-- ── §9 · lo que se mide además de los tokens ───────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.archivos_limpios(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $ar14$
  SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('ruta', left(x->>'ruta', 300),
            'bytes', coalesce(conceptualizador.a_entero(x->>'bytes'), 0)) ORDER BY o)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) WITH ORDINALITY e(x, o)
    WHERE jsonb_typeof(x) = 'object' AND coalesce(x->>'ruta', '') <> '' AND o <= 300), '[]'::jsonb)
$ar14$;

CREATE OR REPLACE FUNCTION conceptualizador.etapas_limpias(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $et14$
  SELECT coalesce((SELECT jsonb_object_agg(k.key, conceptualizador.a_entero(k.value))
     FROM jsonb_each_text(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) k
    WHERE k.key IN ('lectura','fotos','precios','machote','respuesta','otro') AND conceptualizador.a_entero(k.value) IS NOT NULL), '{}'::jsonb)
$et14$;

-- ── Renombres (una sola vez) ───────────────────────────────────────────────
DO $ren14$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0014prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0014prev;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0014prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0014prev;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_respaldo_0014prev') THEN
    ALTER FUNCTION conceptualizador.api_respaldo(jsonb) RENAME TO api_respaldo_0014prev;
  END IF;
END
$ren14$;

-- ── API del motor ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot14$
DECLARE
  v_modo   text := p->>'modo';
  v_motor  text := p->>'motor';
  v_sesion text := coalesce(p->>'sesion', '');
  v_acc    text := p->>'accion';
  v_id     bigint := conceptualizador.a_entero(p->>'trabajo_id');
  v_lease  interval := make_interval(secs => coalesce(conceptualizador.cfg('lease_segundos'), 600));
  v_r      jsonb;
  v_x      jsonb;
  v_c      jsonb;
  v_reg    jsonb;
  t        conceptualizador.trabajo%ROWTYPE;
  t2       conceptualizador.trabajo%ROWTYPE;
  pr       conceptualizador.proceso%ROWTYPE;
  k        conceptualizador.caso%ROWTYPE;
  l        conceptualizador.latido%ROWTYPE;
  v_caso   uuid;
  v_pid    bigint;
  v_pas    text;
  v_quien  text;
  v_pasos  jsonb;
  v_paso   text;
  v_pi     int;
  v_txt    text;
  v_razon  text;
  v_rein   text;
  v_hechos text;
  v_resto  text;
  v_quien_p text;
  v_med    text;
  v_exist  boolean;
  v_lunes  date;
  v_gasto  bigint;
  v_ng     int;
  v_sg     int;
  v_sombra boolean;
  v_mon    text;
  v_e      jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_n      int;
BEGIN
  IF v_modo IS NULL OR v_modo NOT IN ('config','proceso','experimento','caso_moneda','siguiente','latido','tomar','avance',
                                      'entregar','error','consumo','registro_avance','avisos_consumo') THEN
    RETURN conceptualizador.api_motor_0014prev(p);
  END IF;
  IF v_motor IS NULL OR v_motor NOT IN ('principal','respaldo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO');
  END IF;

  -- §1 · todo el panel, sin filtrar (lo lee presupuesto.js con caché de 60 s).
  IF v_modo = 'config' THEN
    RETURN jsonb_build_object('ok', true, 'valores',
      (SELECT coalesce(jsonb_object_agg(clave, valor ORDER BY clave), '{}'::jsonb) FROM conceptualizador.config));

  -- §3 / §6 · antes de decir qué sigue: cerrar lo colgado y arrancar levantamientos quietos.
  ELSIF v_modo = 'siguiente' THEN
    PERFORM conceptualizador.cerrar_colgados();
    PERFORM conceptualizador.arrancar_levantamientos();
    RETURN conceptualizador.api_motor_0014prev(p);

  -- §7 · latido con sin_relevo y profundidad; marca desde cuándo está en ese estado.
  ELSIF v_modo = 'latido' THEN
    SELECT * INTO l FROM conceptualizador.latido WHERE motor = v_motor;
    v_r := conceptualizador.api_motor_0014prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      UPDATE conceptualizador.latido la SET
        profundidad = CASE WHEN coalesce(p->>'profundidad', '') ~ '^[0-9]{1,3}\Z' THEN (p->>'profundidad')::int
                           WHEN la.sesion IS DISTINCT FROM l.sesion THEN NULL ELSE la.profundidad END,
        activo_at = CASE WHEN la.estado = 'activo' THEN now() ELSE la.activo_at END,
        estado_desde = CASE WHEN l.motor IS NULL OR l.estado IS DISTINCT FROM la.estado
                              OR l.visto_at < now() - make_interval(secs => coalesce(conceptualizador.cfg('latido_vivo_segundos'), 120))
                            THEN now() ELSE coalesce(la.estado_desde, now()) END
       WHERE la.motor = v_motor;
      PERFORM conceptualizador.cerrar_colgados();
      v_r := v_r || jsonb_build_object('motor', conceptualizador.estado_motor(), 'motor_v152', conceptualizador.estado_motor_v152());
    END IF;
    RETURN v_r;

  -- §4 / §8b · tomar abre el proceso del trabajo y devuelve lo que falló la vez anterior.
  ELSIF v_modo = 'tomar' THEN
    v_r := conceptualizador.api_motor_0014prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
      UPDATE conceptualizador.proceso SET fin = now(), resultado = 'vencido' WHERE trabajo_id = t.id AND fin IS NULL;
      INSERT INTO conceptualizador.proceso (caso_id, quien, trabajo_id, paso)
      VALUES (t.caso_id, CASE WHEN v_motor = 'respaldo' THEN 'respaldo' ELSE 'motor' END, t.id, 'empezando')
      RETURNING id INTO v_pid;
      v_r := v_r || jsonb_build_object('proceso_id', v_pid);
      IF t.error_ultimo IS NOT NULL THEN
        v_r := v_r || jsonb_build_object('intento_anterior', jsonb_build_object('error', t.error_ultimo, 'razon', t.razon_ultima, 'motor', t.motor_ultimo));
      END IF;
    END IF;
    RETURN v_r;

  -- §4 · el paso viejo también mueve el proceso (y lo abre si el código viejo no lo abrió).
  ELSIF v_modo = 'avance' THEN
    v_r := conceptualizador.api_motor_0014prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
      v_paso := nullif(left(btrim(coalesce(p->>'paso', '')), 120), '');
      UPDATE conceptualizador.proceso pz SET senal = now(), paso = coalesce(v_paso, pz.paso),
             paso_i = coalesce((SELECT (o - 1)::int FROM jsonb_array_elements_text(pz.pasos) WITH ORDINALITY e(x, o) WHERE x = v_paso LIMIT 1), pz.paso_i)
       WHERE pz.trabajo_id = v_id AND pz.fin IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        INSERT INTO conceptualizador.proceso (caso_id, quien, trabajo_id, paso)
        VALUES (t.caso_id, CASE WHEN v_motor = 'respaldo' THEN 'respaldo' ELSE 'motor' END, t.id, coalesce(v_paso, 'trabajando'));
      END IF;
    END IF;
    RETURN v_r;

  ELSIF v_modo = 'entregar' THEN
    v_r := conceptualizador.api_motor_0014prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      UPDATE conceptualizador.proceso SET fin = now(), resultado = 'listo' WHERE trabajo_id = v_id AND fin IS NULL;
    END IF;
    RETURN v_r;

  -- §8 · error: guarda la falla aunque se reintente y deja UNA línea para la persona.
  ELSIF v_modo = 'error' THEN
    v_r := conceptualizador.api_motor_0014prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      v_rein := CASE WHEN p->>'reintento' = 'persona' THEN 'persona' ELSE 'auto' END;
      v_razon := conceptualizador.razon_limpia(p->>'razon_persona');
      IF v_rein = 'persona' THEN
        UPDATE conceptualizador.trabajo SET estado = 'error' WHERE id = v_id AND estado = 'pendiente';
      END IF;
      UPDATE conceptualizador.trabajo SET error_ultimo = left(coalesce(p->>'causa', 'sin causa'), 500), razon_ultima = v_razon,
             motor_ultimo = v_motor
       WHERE id = v_id RETURNING * INTO t;
      UPDATE conceptualizador.proceso SET fin = now(), resultado = 'error' WHERE trabajo_id = v_id AND fin IS NULL;
      INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
      VALUES (t.caso_id, 'motor', 'sistema', 'No te pude contestar: '
              || coalesce(v_razon, 'algo falló de mi lado (' || conceptualizador.codigo_de(p->>'causa') || ')')
              || CASE WHEN t.estado = 'error' THEN '. Escríbeme de nuevo para retomarlo.' ELSE '. Ya lo estoy reintentando.' END);
      v_r := v_r || jsonb_build_object('estado', t.estado, 'razon_persona', v_razon, 'reintento', v_rein);
    END IF;
    RETURN v_r;

  -- §9 · consumo: además de tokens, archivos, fotos, etapas y medición (sin_medicion = ceros, se acepta).
  ELSIF v_modo = 'consumo' THEN
    v_c := CASE WHEN jsonb_typeof(p->'consumo') = 'object' THEN p->'consumo' ELSE '{}'::jsonb END;
    v_med := CASE WHEN coalesce(v_c->>'medicion', p->>'medicion') = 'sin_medicion' THEN 'sin_medicion' ELSE 'transcripcion' END;
    IF v_med = 'sin_medicion' AND (jsonb_typeof(v_c->'tokens') IS DISTINCT FROM 'object' OR (v_c->'tokens'->>'input') IS NULL) THEN
      v_c := v_c || jsonb_build_object('tokens', jsonb_build_object('input', 0, 'output', 0, 'cache_leida', 0, 'cache_escrita', 0, 'llamadas_modelo', 0),
                                       'fuente', 'sin_medicion');
    END IF;
    v_r := conceptualizador.api_motor_0014prev(p || jsonb_build_object('consumo', v_c));
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      UPDATE conceptualizador.consumo SET
        archivos = conceptualizador.archivos_limpios(coalesce(v_c->'archivos', p->'archivos')),
        fotos_modelo = coalesce(conceptualizador.a_entero(coalesce(v_c->>'fotos_modelo', p->>'fotos_modelo')), 0),
        etapas = conceptualizador.etapas_limpias(coalesce(v_c->'etapas', p->'etapas')),
        medicion = v_med
       WHERE trabajo_id = v_id;
      v_r := v_r || jsonb_build_object('medicion', v_med);
    END IF;
    RETURN v_r;

  -- §9 / §10 · la pasada del robot: lo mismo, y 'saltada' (sin nada nuevo) con ponderado 0.
  ELSIF v_modo = 'registro_avance' THEN
    v_reg := CASE WHEN jsonb_typeof(p->'registro') = 'object' THEN p->'registro' ELSE '{}'::jsonb END;
    v_exist := EXISTS (SELECT 1 FROM conceptualizador.consumo_avance WHERE pasada = v_reg->>'pasada');
    v_r := conceptualizador.api_motor_0014prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) AND NOT v_exist THEN
      v_med := CASE WHEN coalesce(v_reg->>'medicion', p->>'medicion') = 'sin_medicion' THEN 'sin_medicion' ELSE 'transcripcion' END;
      UPDATE conceptualizador.consumo_avance SET
        archivos = conceptualizador.archivos_limpios(coalesce(v_reg->'archivos', p->'archivos')),
        fotos_modelo = coalesce(conceptualizador.a_entero(coalesce(v_reg->>'fotos_modelo', p->>'fotos_modelo')), 0),
        etapas = conceptualizador.etapas_limpias(coalesce(v_reg->'etapas', p->'etapas')),
        medicion = v_med,
        resultado = CASE WHEN v_reg->>'resultado' = 'saltada' THEN 'saltada' ELSE resultado END,
        ponderado = CASE WHEN v_reg->>'resultado' = 'saltada' THEN 0 ELSE ponderado END
       WHERE pasada = v_reg->>'pasada';
    END IF;
    RETURN v_r;

  -- §7 / §3 / §11 · avisos nuevos para Esteban, con la misma regla de dry_run que los de antes.
  ELSIF v_modo = 'avisos_consumo' THEN
    v_r := conceptualizador.api_motor_0014prev(p);
    IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
    v_e := conceptualizador.estado_motor_v152();
    -- motor_caido: uno por incidente (clave = inicio), solo dentro del horario.
    IF v_e->'principal'->>'estado' <> 'activo' AND (v_e->'principal'->>'desde') IS NOT NULL
       AND (v_e->'principal'->>'desde')::timestamptz < now() - make_interval(mins => coalesce(conceptualizador.cfg('motor_caido_aviso_min'), 15))
       AND conceptualizador.en_ventana(coalesce(conceptualizador.cfg_txt('motor_caido_desde'), '07:00'), coalesce(conceptualizador.cfg_txt('motor_caido_hasta'), '22:00'))
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.consumo_aviso WHERE tipo = 'motor_caido'
                        AND clave = to_char((v_e->'principal'->>'desde')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) THEN
      v_avisos := v_avisos || jsonb_build_object('tipo', 'motor_caido',
        'clave', to_char((v_e->'principal'->>'desde')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'desde_utc', to_char((v_e->'principal'->>'desde')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
        'desde_cst', to_char((v_e->'principal'->>'desde')::timestamptz AT TIME ZONE conceptualizador.zona_robot(), 'YYYY-MM-DD HH24:MI') || ' CST',
        'causa', v_e->'principal'->>'causa', 'estado', v_e->'principal'->>'estado',
        'atendidos_respaldo', (v_e->'respaldo'->>'atendidos_desde_caida')::int, 'texto', v_e->>'texto',
        'desde', v_e->'principal'->>'desde', 'visto_at', v_e->'principal'->>'visto_at');
    END IF;
    -- motor_linaje: la cadena de relevos se acerca al límite de 8; una vez por sesión.
    SELECT * INTO l FROM conceptualizador.latido WHERE motor = 'principal';
    IF l.motor IS NOT NULL AND coalesce(l.profundidad, 0) >= 6
       AND l.visto_at > now() - make_interval(secs => coalesce(conceptualizador.cfg('latido_vivo_segundos'), 120))
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.consumo_aviso WHERE tipo = 'motor_linaje' AND clave = coalesce(l.sesion, '?')) THEN
      v_avisos := v_avisos || jsonb_build_object('tipo', 'motor_linaje', 'clave', coalesce(l.sesion, '?'), 'sesion', l.sesion,
                                                  'profundidad', l.profundidad, 'limite', 8, 'at', l.visto_at);
    END IF;
    -- Encolados (trabajo_fallido, experimento_techo): las filas que nacieron sin avisar.
    v_avisos := v_avisos || coalesce((SELECT jsonb_agg(a.detalle || jsonb_build_object('tipo', a.tipo, 'clave', a.clave) ORDER BY a.id)
                                        FROM conceptualizador.consumo_aviso a WHERE a.avisado_at IS NULL), '[]'::jsonb);
    IF NOT coalesce((p->>'dry_run')::boolean, true) THEN
      INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
        SELECT x->>'tipo', x->>'clave', x - 'tipo' - 'clave', now() FROM jsonb_array_elements(v_avisos) x
         WHERE x->>'tipo' IN ('motor_caido','motor_linaje')
      ON CONFLICT (tipo, clave) DO NOTHING;
      UPDATE conceptualizador.consumo_aviso SET avisado_at = now() WHERE avisado_at IS NULL;
    END IF;
    RETURN jsonb_set(v_r, '{avisos}', coalesce(v_r->'avisos', '[]'::jsonb) || v_avisos) || jsonb_build_object('motor_v152', v_e);

  -- §4 · proceso: inicio, paso, fin, consulta.
  ELSIF v_modo = 'proceso' THEN
    IF v_acc = 'inicio' THEN
      v_quien := p->>'quien';
      IF v_quien IS NULL OR v_quien NOT IN ('motor','respaldo','robot') THEN RETURN jsonb_build_object('ok', false, 'error', 'QUIEN_INVALIDO'); END IF;
      v_pas := nullif(btrim(coalesce(p->>'pasada', '')), '');
      IF v_pas IS NOT NULL AND v_pas !~ '^A[0-9]{10}-[a-z0-9]{1,8}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'PASADA_INVALIDA'); END IF;
      IF v_id IS NULL AND v_pas IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_TRABAJO_NI_PASADA'); END IF;
      v_caso := conceptualizador.a_uuid(p->>'caso_id');
      IF v_id IS NOT NULL THEN
        SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
        IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
        IF v_caso IS NOT NULL AND v_caso <> t.caso_id THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_COINCIDE'); END IF;
        IF t.estado <> 'tomado' THEN RETURN jsonb_build_object('ok', false, 'error', 'TRABAJO_NO_TOMADO', 'estado', t.estado); END IF;
        v_caso := t.caso_id;
      END IF;
      IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
      END IF;
      v_pasos := coalesce((SELECT jsonb_agg(left(x, 120) ORDER BY o) FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(p->'pasos') = 'array' THEN p->'pasos' ELSE '[]'::jsonb END) WITH ORDINALITY e(x, o)
                  WHERE o <= 30 AND btrim(x) <> ''), '[]'::jsonb);
      v_paso := nullif(left(btrim(coalesce(p->>'paso', '')), 120), '');
      SELECT * INTO pr FROM conceptualizador.proceso
       WHERE fin IS NULL AND ((v_id IS NOT NULL AND trabajo_id = v_id) OR (v_id IS NULL AND pasada = v_pas))
       ORDER BY id DESC LIMIT 1 FOR UPDATE;
      IF pr.id IS NULL THEN
        BEGIN
          INSERT INTO conceptualizador.proceso (caso_id, quien, trabajo_id, pasada, pasos, paso)
          VALUES (v_caso, v_quien, v_id, v_pas, v_pasos, coalesce(v_paso, v_pasos->>0, 'empezando')) RETURNING id INTO v_pid;
          RETURN jsonb_build_object('ok', true, 'proceso_id', v_pid);
        EXCEPTION WHEN unique_violation THEN
          SELECT * INTO pr FROM conceptualizador.proceso
           WHERE fin IS NULL AND ((v_id IS NOT NULL AND trabajo_id = v_id) OR (v_id IS NULL AND pasada = v_pas))
           ORDER BY id DESC LIMIT 1;
        END;
      END IF;
      UPDATE conceptualizador.proceso SET quien = v_quien, senal = now(),
             pasos = CASE WHEN jsonb_array_length(pasos) = 0 THEN v_pasos ELSE pasos END, paso = coalesce(v_paso, paso)
       WHERE id = pr.id;
      RETURN jsonb_build_object('ok', true, 'proceso_id', pr.id, 'ya_estaba', true,
                                'detener', pr.detener_at IS NOT NULL, 'detener_por', pr.detener_por);
    END IF;

    v_pid := conceptualizador.a_entero(p->>'proceso_id');
    SELECT * INTO pr FROM conceptualizador.proceso WHERE id = v_pid FOR UPDATE;
    IF pr.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'PROCESO_NO_EXISTE'); END IF;

    IF v_acc = 'consulta' THEN
      RETURN jsonb_build_object('ok', true, 'proceso_id', pr.id, 'detener', pr.detener_at IS NOT NULL, 'detener_por', pr.detener_por,
                                'detener_at', pr.detener_at, 'fin', pr.fin, 'resultado', pr.resultado);

    ELSIF v_acc = 'paso' THEN
      IF pr.fin IS NOT NULL THEN
        -- Cerrado por falta de señal pero el trabajo sigue en manos de este motor: se reabre.
        IF pr.resultado = 'vencido' AND (pr.trabajo_id IS NULL OR EXISTS (SELECT 1 FROM conceptualizador.trabajo
               WHERE id = pr.trabajo_id AND estado = 'tomado' AND tomado_por = v_motor)) THEN
          UPDATE conceptualizador.proceso SET fin = NULL, resultado = NULL WHERE id = pr.id;
        ELSE
          RETURN jsonb_build_object('ok', false, 'error', 'PROCESO_CERRADO', 'resultado', pr.resultado,
                                    'detener', pr.resultado = 'detenido', 'detener_por', pr.detener_por);
        END IF;
      END IF;
      v_paso := nullif(left(btrim(coalesce(p->>'paso', '')), 120), '');
      v_pi := coalesce(conceptualizador.a_entero(p->>'paso_i')::int,
                       (SELECT (o - 1)::int FROM jsonb_array_elements_text(pr.pasos) WITH ORDINALITY e(x, o) WHERE x = v_paso LIMIT 1),
                       pr.paso_i);
      v_txt := nullif(left(btrim(coalesce(p->>'hecho', '')), 200), '');
      UPDATE conceptualizador.proceso SET senal = now(), paso = coalesce(v_paso, paso), paso_i = v_pi,
             hechos = CASE WHEN v_txt IS NULL OR jsonb_array_length(hechos) >= 60 THEN hechos ELSE hechos || to_jsonb(v_txt) END,
             gasto = greatest(gasto, coalesce(conceptualizador.a_entero(p->>'gasto'), 0))
       WHERE id = pr.id;
      IF pr.trabajo_id IS NOT NULL THEN
        UPDATE conceptualizador.trabajo SET avance = left(coalesce(v_paso, pr.paso, ''), 80), avance_at = now()
         WHERE (id = pr.trabajo_id OR lote_de = pr.trabajo_id) AND estado = 'tomado' AND tomado_por = v_motor;
      END IF;
      RETURN jsonb_build_object('ok', true, 'proceso_id', pr.id, 'detener', pr.detener_at IS NOT NULL, 'detener_por', pr.detener_por);

    ELSIF v_acc = 'fin' THEN
      IF pr.fin IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'ya_estaba', true, 'resultado', pr.resultado); END IF;
      v_txt := p->>'resultado';
      IF v_txt IS NULL OR v_txt NOT IN ('listo','error','detenido','vencido','saltado') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'RESULTADO_INVALIDO');
      END IF;
      UPDATE conceptualizador.proceso SET fin = now(), resultado = v_txt,
             gasto = greatest(gasto, coalesce(conceptualizador.a_entero(p->>'gasto'), 0))
       WHERE id = pr.id;
      IF v_txt = 'detenido' THEN
        SELECT * INTO k FROM conceptualizador.caso WHERE id = pr.caso_id;
        SELECT coalesce(string_agg(x, ', ' ORDER BY o), 'nada') INTO v_hechos FROM jsonb_array_elements_text(pr.hechos) WITH ORDINALITY e(x, o);
        SELECT coalesce(string_agg(x, ', ' ORDER BY o), 'nada') INTO v_resto
          FROM jsonb_array_elements_text(pr.pasos) WITH ORDINALITY e(x, o)
         WHERE o - 1 >= pr.paso_i AND NOT (pr.hechos ? x);
        v_quien_p := CASE WHEN pr.detener_por IS NULL THEN 'el agente'
                          WHEN pr.detener_por = k.autor AND nullif(btrim(coalesce(k.autor_nombre, '')), '') IS NOT NULL THEN k.autor_nombre
                          ELSE pr.detener_por END;
        INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
        VALUES (pr.caso_id, 'motor', 'sistema', 'Detenido por ' || v_quien_p || ' a las '
                || conceptualizador.hora_local(coalesce(pr.detener_at, now()), false)
                || ' · quedó hecho: ' || v_hechos || ' · no se hizo: ' || v_resto);
        IF pr.trabajo_id IS NOT NULL THEN
          UPDATE conceptualizador.trabajo SET estado = 'detenido', error = 'DETENIDO', avance = NULL
           WHERE (id = pr.trabajo_id OR lote_de = pr.trabajo_id) AND estado IN ('tomado','pendiente');
        END IF;
      END IF;
      RETURN jsonb_build_object('ok', true, 'proceso_id', pr.id, 'resultado', v_txt);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'ACCION_INVALIDA');

  -- §11 · experimento: la base decide quién lleva sombra.
  ELSIF v_modo = 'experimento' THEN
    SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
    IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
    v_lunes := conceptualizador.lunes_uso();
    IF v_acc = 'muestra' THEN
      IF coalesce(p->>'grupo', '') NOT IN ('corto','largo') THEN RETURN jsonb_build_object('ok', false, 'error', 'GRUPO_INVALIDO'); END IF;
      SELECT sombra INTO v_sombra FROM conceptualizador.experimento_par WHERE trabajo_id = t.id;
      IF FOUND THEN RETURN jsonb_build_object('ok', true, 'sombra', v_sombra, 'ya_estaba', true); END IF;
      IF coalesce(conceptualizador.cfg_txt('contexto_modo'), 'completo') <> 'experimento' THEN
        RETURN jsonb_build_object('ok', true, 'sombra', false, 'motivo', 'contexto_modo');
      END IF;
      SELECT coalesce(sum(costo_sombra), 0) INTO v_gasto FROM conceptualizador.experimento_par WHERE dia >= v_lunes;
      IF v_gasto >= coalesce(conceptualizador.cfg('experimento_techo_semana'), 0) THEN
        INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
        VALUES ('experimento_techo', v_lunes::text, jsonb_build_object('semana_desde', v_lunes, 'gastado', v_gasto,
                'techo', conceptualizador.cfg('experimento_techo_semana')), NULL)
        ON CONFLICT (tipo, clave) DO NOTHING;
        INSERT INTO conceptualizador.experimento_par (trabajo_id, caso_id, grupo, sombra, motivo, dia)
        VALUES (t.id, t.caso_id, p->>'grupo', false, 'techo', conceptualizador.dia_uso(now()));
        RETURN jsonb_build_object('ok', true, 'sombra', false, 'motivo', 'techo');
      END IF;
      -- % por grupo: cada grupo lleva su parte, así corto y largo quedan mitad y mitad.
      SELECT count(*) + 1, count(*) FILTER (WHERE sombra) INTO v_ng, v_sg FROM conceptualizador.experimento_par
       WHERE dia >= v_lunes AND grupo = p->>'grupo';
      v_sombra := floor(v_ng * coalesce(conceptualizador.cfg('experimento_pct'), 0) / 100.0) > v_sg;
      INSERT INTO conceptualizador.experimento_par (trabajo_id, caso_id, grupo, sombra, motivo, dia)
      VALUES (t.id, t.caso_id, p->>'grupo', v_sombra, CASE WHEN v_sombra THEN 'muestra' ELSE 'fuera_de_muestra' END, conceptualizador.dia_uso(now()));
      RETURN jsonb_build_object('ok', true, 'sombra', v_sombra, 'grupo', p->>'grupo');
    ELSIF v_acc = 'registra' THEN
      UPDATE conceptualizador.experimento_par SET
        costo_completo = conceptualizador.a_entero(p->>'costo_completo'), costo_sombra = conceptualizador.a_entero(p->>'costo_sombra'),
        igual_conceptos = CASE WHEN p->>'igual_conceptos' IN ('true','false') THEN (p->>'igual_conceptos')::boolean END,
        igual_precios   = CASE WHEN p->>'igual_precios'   IN ('true','false') THEN (p->>'igual_precios')::boolean END,
        igual_preguntas = CASE WHEN p->>'igual_preguntas' IN ('true','false') THEN (p->>'igual_preguntas')::boolean END,
        faltantes = coalesce((SELECT jsonb_agg(left(x, 200) ORDER BY o) FROM jsonb_array_elements_text(
                      CASE WHEN jsonb_typeof(p->'faltantes') = 'array' THEN p->'faltantes' ELSE '[]'::jsonb END) WITH ORDINALITY e(x, o)
                     WHERE o <= 50), '[]'::jsonb),
        registrado_at = now()
       WHERE trabajo_id = t.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_MUESTREADO'); END IF;
      RETURN jsonb_build_object('ok', true, 'trabajo_id', t.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'ACCION_INVALIDA');

  -- §12 · moneda por decreto: solo el motor que tiene el trabajo.
  ELSE  -- caso_moneda
    SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
    IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
    IF t.estado <> 'tomado' OR t.tomado_por IS DISTINCT FROM v_motor OR coalesce(t.sesion, '') <> v_sesion THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO');
    END IF;
    v_mon := upper(btrim(coalesce(p->>'moneda', '')));
    IF v_mon NOT IN ('USD','MXN') THEN RETURN jsonb_build_object('ok', false, 'error', 'MONEDA_INVALIDA'); END IF;
    SELECT * INTO k FROM conceptualizador.caso WHERE id = t.caso_id FOR UPDATE;
    IF k.moneda = v_mon THEN RETURN jsonb_build_object('ok', true, 'caso_id', k.id, 'moneda', v_mon, 'ya_estaba', true); END IF;
    IF k.empresa_id = 6 AND v_mon = 'MXN' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'EMPRESA_SOLO_USD', 'mensaje', 'FTS USA cotiza solo en USD.');
    END IF;
    UPDATE conceptualizador.caso SET moneda = v_mon, ultima_actividad_at = now() WHERE id = k.id;
    INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues) VALUES (k.id, 'motor-' || v_motor, 'moneda', k.moneda, v_mon);
    RETURN jsonb_build_object('ok', true, 'caso_id', k.id, 'moneda', v_mon, 'antes', k.moneda);
  END IF;
END
$mot14$;

-- ── API de la suite ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui14$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_ts    bigint;
  v_n     int;
  v_r     jsonb;
  v_c     conceptualizador.caso%ROWTYPE;
  pr      conceptualizador.proceso%ROWTYPE;
  v_cam   jsonb;
  v_razon text;
  v_conf  boolean;
  v_x     record;
  v_err   text;
  v_des   text;
  v_has   text;
  v_min   int;
  v_ant   text;
  v_hechos jsonb := '[]'::jsonb;
  v_ev    bigint;
  v_lunes date := conceptualizador.lunes_uso();
BEGIN
  IF v_modo IS NULL OR NOT (v_modo IN ('config','config_guardar','caso_arranque') OR (v_modo = 'evento' AND p->>'tipo' = 'detener')) THEN
    v_r := conceptualizador.api_suite_0014prev(p);
    IF v_modo IN ('casos','estado') AND coalesce((v_r->>'ok')::boolean, false) THEN
      v_r := v_r || jsonb_build_object('motor_v152', conceptualizador.estado_motor_v152());
    END IF;
    -- §6 · el arranque automático efectivo de cada caso, para pintarlo.
    IF v_modo = 'casos' AND jsonb_typeof(v_r->'casos') = 'array' THEN
      v_r := jsonb_set(v_r, '{casos}', (SELECT coalesce(jsonb_agg(x || jsonb_build_object(
               'arranque_auto_efectivo', (conceptualizador.arranque_efectivo((x->>'id')::uuid)->>'valor')::boolean,
               'arranque_auto_min', (conceptualizador.arranque_efectivo((x->>'id')::uuid)->>'min')::int) ORDER BY o), '[]'::jsonb)
             FROM jsonb_array_elements(v_r->'casos') WITH ORDINALITY AS a(x, o)));
    ELSIF v_modo = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id')) THEN
      v_r := v_r || jsonb_build_object(
        'arranque_auto_efectivo', (conceptualizador.arranque_efectivo(conceptualizador.a_uuid(p->>'caso_id'))->>'valor')::boolean,
        'arranque_auto_min', (conceptualizador.arranque_efectivo(conceptualizador.a_uuid(p->>'caso_id'))->>'min')::int,
        'arranque_auto_fuente', conceptualizador.arranque_efectivo(conceptualizador.a_uuid(p->>'caso_id'))->>'fuente');
    END IF;
    RETURN v_r;
  END IF;

  -- Mismos candados de entrada que los demás modos: actor, ventana y nonce único.
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
  v_ts := conceptualizador.a_entero(p->>'ts');
  IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
  INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;

  -- §5 · detener: dueño del caso o Esteban. Marca el proceso; no crea trabajo ni cuenta en el tope.
  IF v_modo = 'evento' THEN
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) AND NOT conceptualizador.es_panel_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Solo el dueño del caso o Esteban detienen al agente.');
    END IF;
    SELECT * INTO pr FROM conceptualizador.proceso WHERE id = conceptualizador.a_entero(v_d->>'proceso_id') FOR UPDATE;
    IF pr.id IS NULL OR pr.caso_id <> v_c.id THEN RETURN jsonb_build_object('ok', false, 'error', 'PROCESO_NO_EXISTE'); END IF;
    IF pr.fin IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'proceso_id', pr.id, 'ya_termino', true, 'resultado', pr.resultado);
    END IF;
    UPDATE conceptualizador.proceso SET detener_por = coalesce(detener_por, v_actor), detener_at = coalesce(detener_at, now()) WHERE id = pr.id;
    INSERT INTO conceptualizador.evento (caso_id, tipo, datos, autor)
    VALUES (v_c.id, 'detener', jsonb_build_object('proceso_id', pr.id), v_actor) RETURNING id INTO v_ev;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'proceso_id', pr.id, 'detener', true, 'evento_id', v_ev, 'trabajo_id', NULL);
  END IF;

  -- §6 · arranque automático por caso: dueño o Esteban. No crea trabajo ni cuenta en el tope.
  IF v_modo = 'caso_arranque' THEN
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id') FOR UPDATE;
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) AND NOT conceptualizador.es_panel_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Solo el dueño del caso o Esteban cambian el arranque automático.');
    END IF;
    IF NOT (v_d ? 'valor') OR jsonb_typeof(v_d->'valor') NOT IN ('boolean','null') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO', 'mensaje', 'El valor es true, false o null (sigue a la persona).');
    END IF;
    UPDATE conceptualizador.caso SET arranque_auto = CASE WHEN jsonb_typeof(v_d->'valor') = 'null' THEN NULL ELSE (v_d->>'valor')::boolean END
     WHERE id = v_c.id;
    v_r := conceptualizador.arranque_efectivo(v_c.id);
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'arranque_auto', v_r->'caso', 'arranque_auto_efectivo', (v_r->>'valor')::boolean,
                              'arranque_auto_fuente', v_r->>'fuente', 'arranque_auto_min', (v_r->>'min')::int, 'trabajo_id', NULL);
  END IF;

  -- §1 · el panel: solo panel_admin, lo decide el servidor.
  IF NOT conceptualizador.es_panel_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'La configuración del conceptualizador solo la ve y la cambia Esteban.');
  END IF;

  IF v_modo = 'config_guardar' THEN
    v_cam := v_d->'cambios';
    IF jsonb_typeof(v_cam) IS DISTINCT FROM 'object' OR v_cam = '{}'::jsonb THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SIN_CAMBIOS', 'mensaje', 'No hay nada que guardar.');
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_cam)) > 40 THEN RETURN jsonb_build_object('ok', false, 'error', 'DEMASIADOS_CAMBIOS'); END IF;
    v_razon := btrim(coalesce(v_d->>'razon', p->>'razon', ''));
    IF char_length(v_razon) < 3 OR char_length(v_razon) > 200 OR v_razon ~ '[[:cntrl:]]' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RAZON_OBLIGATORIA', 'mensaje', 'Escribe la razón del cambio en una línea (3 a 200 caracteres).');
    END IF;
    v_conf := coalesce(v_d->>'confirmar', p->>'confirmar', '') = 'true';
    FOR v_x IN SELECT key, value FROM jsonb_each_text(v_cam) LOOP
      v_err := conceptualizador.config_valida(v_x.key, v_x.value);
      IF v_err IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO', 'clave', v_x.key, 'mensaje', v_x.key || ': ' || v_err);
      END IF;
    END LOOP;
    IF NOT v_conf THEN
      IF v_cam ? 'consumo_tope_semana' AND (v_cam->>'consumo_tope_semana')::bigint > 100000000 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'CONFIRMAR', 'clave', 'consumo_tope_semana',
          'mensaje', 'El freno semanal pasaría de 100 M ponderados. Confírmalo para guardarlo.');
      END IF;
      v_des := coalesce(v_cam->>'robot_desde', conceptualizador.cfg_txt('robot_desde'), '07:00');
      v_has := coalesce(v_cam->>'robot_hasta', conceptualizador.cfg_txt('robot_hasta'), '22:00');
      v_min := ((extract(epoch FROM v_has::time - v_des::time) / 60)::int + 1440) % 1440;
      IF (v_cam ? 'robot_desde' OR v_cam ? 'robot_hasta') AND (v_min > 18 * 60 OR v_min = 0) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'CONFIRMAR', 'clave', 'robot_horario',
          'mensaje', 'El robot trabajaría más de 18 h al día (' || v_des || ' a ' || v_has || '). Confírmalo para guardarlo.');
      END IF;
      IF v_cam ? 'panel_admin' AND v_cam->>'panel_admin' <> v_actor THEN
        RETURN jsonb_build_object('ok', false, 'error', 'CONFIRMAR', 'clave', 'panel_admin',
          'mensaje', 'Le pasarías el panel a ' || (v_cam->>'panel_admin') || ' y tú ya no lo verías. Confírmalo para guardarlo.');
      END IF;
    END IF;
    FOR v_x IN SELECT key, btrim(value) AS value FROM jsonb_each_text(v_cam) ORDER BY key LOOP
      SELECT valor INTO v_ant FROM conceptualizador.config WHERE clave = v_x.key;
      IF NOT FOUND THEN v_ant := NULL; END IF;
      CONTINUE WHEN v_ant IS NOT DISTINCT FROM v_x.value;
      INSERT INTO conceptualizador.config (clave, valor) VALUES (v_x.key, v_x.value)
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
      INSERT INTO conceptualizador.config_cambio (clave, antes, despues, por, razon) VALUES (v_x.key, v_ant, v_x.value, v_actor, v_razon);
      v_hechos := v_hechos || to_jsonb(v_x.key);
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'cambiados', v_hechos,
      'valores', (SELECT coalesce(jsonb_object_agg(clave, valor ORDER BY clave), '{}'::jsonb) FROM conceptualizador.config));
  END IF;

  -- config (lectura)
  RETURN jsonb_build_object('ok', true,
    'valores', (SELECT coalesce(jsonb_object_agg(clave, valor ORDER BY clave), '{}'::jsonb) FROM conceptualizador.config),
    'gasto', jsonb_build_object(
      'hoy', (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE dia = conceptualizador.dia_uso(now())),
      'semana', (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE dia >= v_lunes),
      'semana_desde', v_lunes,
      'experimento_semana', (SELECT coalesce(sum(costo_sombra), 0) FROM conceptualizador.experimento_par WHERE dia >= v_lunes),
      'por_persona_hoy', (SELECT coalesce(jsonb_object_agg(q.actor, q.n), '{}'::jsonb)
                            FROM (SELECT actor, count(*) n FROM conceptualizador.trabajos_que_cuentan(conceptualizador.dia_uso(now())) GROUP BY actor) q)),
    'motor', conceptualizador.estado_motor_v152(),
    'bitacora', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'clave', b.clave, 'antes', b.antes, 'despues', b.despues,
                   'por', b.por, 'razon', b.razon, 'created_at', b.created_at) ORDER BY b.id DESC), '[]'::jsonb)
                   FROM (SELECT * FROM conceptualizador.config_cambio ORDER BY id DESC LIMIT 50) b),
    'limites', jsonb_build_object('freno_max_sin_confirmar', 100000000, 'horario_max_horas_sin_confirmar', 18));
END
$sui14$;

-- ── API del respaldo: antes de buscar, cerrar lo colgado y arrancar levantamientos ──
CREATE OR REPLACE FUNCTION conceptualizador.api_respaldo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $res14$
BEGIN
  IF coalesce(p->>'modo', 'buscar') = 'buscar' THEN
    PERFORM conceptualizador.cerrar_colgados();
    PERFORM conceptualizador.arrancar_levantamientos();
  END IF;
  RETURN conceptualizador.api_respaldo_0014prev(p);
END
$res14$;

-- ── Permisos: la app solo ejecuta las puertas; lo de antes y las ayudas quedan cerradas ──
ALTER FUNCTION conceptualizador.api_motor(jsonb)             SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0014prev(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb)             SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0014prev(jsonb)    SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_respaldo(jsonb)          SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_respaldo_0014prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0014prev(jsonb), conceptualizador.api_suite_0014prev(jsonb),
                       conceptualizador.api_respaldo_0014prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0014prev(jsonb), conceptualizador.api_suite_0014prev(jsonb),
                       conceptualizador.api_respaldo_0014prev(jsonb),
                       conceptualizador.a_entero(text), conceptualizador.a_uuid(text), conceptualizador.zona_robot(),
                       conceptualizador.hora_local(timestamptz, boolean), conceptualizador.en_ventana(text, text, timestamptz),
                       conceptualizador.es_panel_admin(text), conceptualizador.lunes_uso(), conceptualizador.es_generales(text),
                       conceptualizador.trabajos_que_cuentan(date), conceptualizador.config_valida(text, text),
                       conceptualizador.estado_motor_v152(), conceptualizador.cerrar_colgados(), conceptualizador.arrancar_levantamientos(),
                       conceptualizador.razon_limpia(text), conceptualizador.codigo_de(text),
                       conceptualizador.archivos_limpios(jsonb), conceptualizador.etapas_limpias(jsonb),
                       conceptualizador.arranque_efectivo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_suite(jsonb),
                          conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
