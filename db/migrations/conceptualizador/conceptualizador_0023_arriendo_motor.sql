-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0023 · V1.57a (fts-conceptualizador#12): un solo principal, alarmas que se ven y «revisa» que no se repite
--
-- Auditoría del 19-oct (#12, comentario 6271057965): de 05:41 a 15:22 UTC hubo SIEMPRE dos sesiones latiendo como principal
-- (y tres en cada relevo), porque la base guarda UN renglón de latido por motor y `siguiente`/`tomar` aceptan a quien diga
-- `motor: principal`. El renglón mezclaba la sesión de una con la profundidad de la otra.
--
-- 1. ARRIENDO de principal por llave (`conceptualizador`, `marketing`): la sesión de Claude real (session_… / cse_…), vence en
--    `arriendo_segundos` (180) y se renueva en cada latido del dueño. Modo nuevo `arriendo` {accion: tomar|forzar|soltar|
--    relevo|estado}. Con el interruptor `arriendo_v157` PRENDIDO:
--      · el latido de quien no es dueño NO toca el renglón `latido` y contesta `arriendo.dueno: false` (el vigía se retira);
--      · `siguiente` del principal que no es dueño contesta cero trabajos, y su `tomar` contesta NO_ES_DUENO;
--      · un vigía viejo (sin `sesion_claude`) solo trabaja si nadie tiene el arriendo vigente.
--    `avance`, `entregar` y `error` no miran el arriendo: un trabajo ya tomado se termina aunque su sesión haya perdido el papel
--    (el candado por trabajo de siempre, `tomado_por` + `sesion`, sigue mandando).
--    APAGADO: todo igual que la 0022. El arriendo se puede tomar y se registra, pero no frena a nadie.
-- 2. LATIDO POR SESIÓN (`latido_sesion`, siempre, con el interruptor apagado también): una fila por sesión que late, con su
--    profundidad, su versión y la salud que manda el vigía (commits sin subir, trabajo anunciado sin pasos, rebase a medias).
--    De aquí sale la alarma «más de una sesión latiendo como principal» y la medición de 24 h.
-- 3. ALARMAS (`alarmas_v157`): relevo que no late en 5 min · principal 30 min sin tomar habiendo cola · trabajo anunciado sin
--    pasos (permiso pendiente) · commits sin subir más de 5 min · más de una sesión latiendo como principal. Cada una con su
--    texto «qué hacer» y la liga a motor/OPERACION.md. Se encolan en `consumo_aviso` (tipo `motor_alarma`, una por incidente)
--    y salen por el correo inmediato de siempre (conceptualizador/consumo-avisos); el latido del dueño las devuelve para que
--    el vigía las diga en la sesión motor y en el #4. Apagado: se calculan (salud las enseña) pero no se encolan.
-- 4. «REVISA» QUE NO SE REPITE (`juntar_revisa`): un «revisa» pendiente que llegó a menos de 2 min de otro «revisa» del mismo
--    caso ya tomado o entregado, sin nada de la persona en medio, se cierra sin modelo (`motor_ultimo = 'juntado'`). Pasó el
--    19-oct en 21fec6: eventos 322 y 325, 11 s aparte, uno lo contestó el principal (360) y otro el respaldo (363).
-- 5. Interruptores nuevos, todos en '0': arriendo_v157, alarmas_v157, git_v157 (lo lee el motor: git sin stash), juntar_revisa,
--    acuse_v157 (la pantalla: «Recibido · en cola» / «Tomado por…»), recalculo_v157 (tarjeta vieja, supuestos con un número que
--    cambió, «Versión en Odoo desactualizada»), tokens_v157 (lo lee el motor: clics sin modelo, spec como parche, vista compacta).
-- 6. TARJETA VIEJA (`recalculo_v157`): un cálculo nuevo del machote que llega sin tarjeta nueva descarta la «Actualizar el machote»
--    propuesta con un total distinto (resultado `reemplazada_por_calculo`).
-- Lo que NO cambia: ningún interruptor existente, ningún valor de config existente, ningún modo existente con todo apagado.
-- Reversa: db/reversas/023_reversa.sql (quita las envolturas; no borra datos).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente (los renombres van una sola vez).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 5 · interruptores ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in23$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157']
$in23$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('arriendo_segundos', '180'),                 -- 3 latidos de 60 s sin renovar = arriendo libre
  ('alarma_relevo_min', '5'),                   -- relevo pedido y sin sesión nueva latiendo
  ('alarma_sin_tomar_min', '30'),               -- trabajo esperando y el principal sin tomar nada
  ('alarma_atorado_min', '5'),                  -- trabajo anunciado a la sesión sin un solo paso (permiso pendiente)
  ('alarma_sin_subir_min', '5'),                -- commits del motor en main local sin llegar a origin
  ('alarma_dos_principales_min', '4')           -- dos sesiones latiendo como principal por más de esto
ON CONFLICT (clave) DO NOTHING;

-- ── 1 y 2 · tablas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.arriendo (
  llave            text        PRIMARY KEY CHECK (llave IN ('conceptualizador','marketing')),
  sesion_claude    text        NOT NULL,
  sesion_vigia     text,
  profundidad      int,
  version          text,
  tomado_at        timestamptz NOT NULL DEFAULT now(),
  renovado_at      timestamptz NOT NULL DEFAULT now(),
  vence_at         timestamptz NOT NULL,
  relevo_pedido_at timestamptz,
  relevo_motivo    text
);

CREATE TABLE IF NOT EXISTS conceptualizador.arriendo_evento (
  id         bigserial   PRIMARY KEY,
  llave      text        NOT NULL,
  tipo       text        NOT NULL CHECK (tipo IN ('tomado','forzado','soltado','vencido','rechazado','relevo_pedido')),
  sesion     text,
  de_sesion  text,
  detalle    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arriendo_evento_at ON conceptualizador.arriendo_evento (llave, at DESC);

CREATE TABLE IF NOT EXISTS conceptualizador.latido_sesion (
  llave         text        NOT NULL,
  motor         text        NOT NULL,
  sesion        text        NOT NULL,              -- sesion_claude si la manda; si no, la sesión del vigía (principal-…)
  sesion_claude text,
  sesion_vigia  text,
  estado        text,
  profundidad   int,
  version       text,
  dueno         boolean,
  salud         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  latidos       int         NOT NULL DEFAULT 1,
  primer_at     timestamptz NOT NULL DEFAULT now(),
  visto_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (llave, motor, sesion)
);
CREATE INDEX IF NOT EXISTS latido_sesion_visto ON conceptualizador.latido_sesion (llave, visto_at DESC);

ALTER TABLE conceptualizador.consumo_aviso DROP CONSTRAINT IF EXISTS consumo_aviso_tipo_check;
ALTER TABLE conceptualizador.consumo_aviso ADD CONSTRAINT consumo_aviso_tipo_check
  CHECK (tipo IN ('pct80','pct100','diario','pausa24','motor_caido','motor_linaje','trabajo_fallido','experimento_techo','motor_alarma'));

-- ── ayudas ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.sesion_valida(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $sv23$
  SELECT CASE WHEN coalesce(s, '') ~ '^(session|cse)_[A-Za-z0-9]{10,60}\Z' THEN regexp_replace(s, '^cse_', 'session_') END
$sv23$;

CREATE OR REPLACE FUNCTION conceptualizador.llave_motor(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $lm23$
  SELECT CASE WHEN p->>'producto' = 'marketing' THEN 'marketing' ELSE 'conceptualizador' END
$lm23$;

/** El arriendo vigente (vence_at en el futuro) o NULL. */
CREATE OR REPLACE FUNCTION conceptualizador.arriendo_vigente(p_llave text) RETURNS conceptualizador.arriendo
LANGUAGE sql STABLE AS $av23$
  SELECT a.* FROM conceptualizador.arriendo a WHERE a.llave = p_llave AND a.vence_at > now()
$av23$;

/** ¿Esta petición del principal puede trabajar? Dueño vigente, o (vigía viejo sin sesion_claude) nadie con arriendo vigente. */
CREATE OR REPLACE FUNCTION conceptualizador.puede_trabajar(p jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE AS $pt23$
DECLARE
  v_a conceptualizador.arriendo;
  v_s text := conceptualizador.sesion_valida(p->>'sesion_claude');
BEGIN
  IF coalesce(p->>'motor', '') <> 'principal' OR NOT conceptualizador.prendido('arriendo_v157') THEN RETURN true; END IF;
  v_a := conceptualizador.arriendo_vigente(conceptualizador.llave_motor(p));
  IF v_a.llave IS NULL THEN RETURN true; END IF;
  RETURN v_s IS NOT NULL AND v_a.sesion_claude = v_s;
END
$pt23$;

CREATE OR REPLACE FUNCTION conceptualizador.arriendo_json(p_llave text, p_sesion text) RETURNS jsonb
LANGUAGE sql STABLE AS $aj23$
  SELECT jsonb_build_object('llave', p_llave,
    'dueno', coalesce(a.sesion_claude = p_sesion AND a.vence_at > now(), false),
    'de', CASE WHEN a.vence_at > now() THEN a.sesion_claude END,
    'vigente', coalesce(a.vence_at > now(), false), 'vence_at', a.vence_at, 'profundidad', a.profundidad,
    'relevo_pedido_at', a.relevo_pedido_at, 'enforzado', conceptualizador.prendido('arriendo_v157'))
  FROM (SELECT 1) x LEFT JOIN conceptualizador.arriendo a ON a.llave = p_llave
$aj23$;

/** Toma o renueva el arriendo. p_forzar: aunque otra sesión lo tenga vigente (la que arranca le gana a la que estaba). */
CREATE OR REPLACE FUNCTION conceptualizador.arriendo_tomar(p_llave text, p_sesion text, p_vigia text, p_prof int, p_version text, p_forzar boolean)
RETURNS jsonb LANGUAGE plpgsql AS $at23$
DECLARE
  v_a   conceptualizador.arriendo;
  v_seg int := coalesce(conceptualizador.cfg('arriendo_segundos'), 180);
BEGIN
  IF p_sesion IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SESION_INVALIDA'); END IF;
  SELECT * INTO v_a FROM conceptualizador.arriendo WHERE llave = p_llave FOR UPDATE;
  IF v_a.llave IS NOT NULL AND v_a.sesion_claude <> p_sesion AND v_a.vence_at > now() AND NOT p_forzar THEN
    RETURN jsonb_build_object('ok', true, 'arriendo', conceptualizador.arriendo_json(p_llave, p_sesion));
  END IF;
  IF v_a.llave IS NULL THEN
    INSERT INTO conceptualizador.arriendo (llave, sesion_claude, sesion_vigia, profundidad, version, vence_at)
    VALUES (p_llave, p_sesion, p_vigia, p_prof, p_version, now() + make_interval(secs => v_seg));
    INSERT INTO conceptualizador.arriendo_evento (llave, tipo, sesion, detalle)
    VALUES (p_llave, 'tomado', p_sesion, jsonb_build_object('profundidad', p_prof, 'vigia', p_vigia, 'version', p_version));
  ELSIF v_a.sesion_claude = p_sesion THEN
    UPDATE conceptualizador.arriendo SET renovado_at = now(), vence_at = now() + make_interval(secs => v_seg),
           sesion_vigia = coalesce(p_vigia, sesion_vigia), profundidad = coalesce(p_prof, profundidad), version = coalesce(p_version, version)
     WHERE llave = p_llave;
  ELSE
    INSERT INTO conceptualizador.arriendo_evento (llave, tipo, sesion, de_sesion, detalle)
    VALUES (p_llave, CASE WHEN v_a.vence_at > now() THEN 'forzado' ELSE 'tomado' END, p_sesion, v_a.sesion_claude,
            jsonb_build_object('profundidad', p_prof, 'vigia', p_vigia, 'version', p_version, 'vencia', v_a.vence_at,
                               'relevo_pedido_at', v_a.relevo_pedido_at));
    UPDATE conceptualizador.arriendo SET sesion_claude = p_sesion, sesion_vigia = p_vigia, profundidad = p_prof, version = p_version,
           tomado_at = now(), renovado_at = now(), vence_at = now() + make_interval(secs => v_seg), relevo_pedido_at = NULL, relevo_motivo = NULL
     WHERE llave = p_llave;
  END IF;
  RETURN jsonb_build_object('ok', true, 'arriendo', conceptualizador.arriendo_json(p_llave, p_sesion));
END
$at23$;

/** Una fila por sesión que late (siempre, con el interruptor apagado también). */
CREATE OR REPLACE FUNCTION conceptualizador.latido_sesion_anotar(p jsonb, p_dueno boolean) RETURNS void
LANGUAGE plpgsql AS $ls23$
DECLARE
  v_sc text := conceptualizador.sesion_valida(p->>'sesion_claude');
  v_s  text := coalesce(v_sc, left(coalesce(p->>'sesion', ''), 120));
  v_sa jsonb := CASE WHEN jsonb_typeof(p->'salud') = 'object' AND length((p->'salud')::text) <= 4000 THEN p->'salud' ELSE '{}'::jsonb END;
BEGIN
  IF v_s = '' OR coalesce(p->>'motor', '') NOT IN ('principal','respaldo') THEN RETURN; END IF;
  INSERT INTO conceptualizador.latido_sesion AS x (llave, motor, sesion, sesion_claude, sesion_vigia, estado, profundidad, version, dueno, salud)
  VALUES (conceptualizador.llave_motor(p), p->>'motor', v_s, v_sc, left(p->>'sesion', 120), left(coalesce(p->>'estado', 'activo'), 20),
          CASE WHEN coalesce(p->>'profundidad', '') ~ '^[0-9]{1,3}\Z' THEN (p->>'profundidad')::int END, left(p->>'version', 40), p_dueno, v_sa)
  ON CONFLICT (llave, motor, sesion) DO UPDATE SET
    estado = EXCLUDED.estado, profundidad = coalesce(EXCLUDED.profundidad, x.profundidad), version = coalesce(EXCLUDED.version, x.version),
    sesion_vigia = coalesce(EXCLUDED.sesion_vigia, x.sesion_vigia), dueno = EXCLUDED.dueno, salud = EXCLUDED.salud,
    latidos = x.latidos + 1, visto_at = now();
END
$ls23$;

-- ── 4 · «revisa» que no se repite ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.juntar_revisas() RETURNS int
LANGUAGE plpgsql AS $jr23$
DECLARE v_n int := 0;
BEGIN
  IF NOT conceptualizador.prendido('juntar_revisa') THEN RETURN 0; END IF;
  WITH dup AS (
    SELECT DISTINCT ON (t.id) t.id, o.id AS con
      FROM conceptualizador.trabajo t
      JOIN conceptualizador.evento e  ON e.id = t.evento_id AND e.tipo = 'correccion' AND e.concepto = 'revisa'
      JOIN conceptualizador.trabajo o ON o.caso_id = t.caso_id AND o.id <> t.id AND o.tipo = 'evento'
                                     AND o.estado IN ('tomado','listo') AND o.lote_de IS NULL
                                     AND o.created_at BETWEEN t.created_at - interval '120 seconds' AND t.created_at
      JOIN conceptualizador.evento eo ON eo.id = o.evento_id AND eo.tipo = 'correccion' AND eo.concepto = 'revisa'
     WHERE t.estado = 'pendiente' AND t.tipo = 'evento' AND t.lote_de IS NULL
       -- Nada de la persona entre los dos: ni un mensaje ni otro evento que no sea «revisa».
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.caso_id = t.caso_id AND m.rol <> 'motor'
                          AND m.created_at > o.created_at AND m.created_at <= t.created_at)
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.evento x WHERE x.caso_id = t.caso_id AND x.id > eo.id AND x.id < e.id
                          AND NOT (x.tipo = 'correccion' AND x.concepto = 'revisa'))
     ORDER BY t.id, o.id DESC)
  UPDATE conceptualizador.trabajo t SET estado = 'listo', listo_at = now(), motor_ultimo = 'juntado',
         respaldo_resultado = left('juntado con el trabajo ' || d.con || ' (otro «revisa» del mismo caso)', 300)
    FROM dup d WHERE t.id = d.id AND t.estado = 'pendiente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$jr23$;

-- ── 3 · alarmas ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.alarma(p_tipo text, p_clave text, p_desde timestamptz, p_texto text, p_hacer text, p_ancla text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $al23$
  SELECT jsonb_build_object('alarma', p_tipo, 'clave', p_tipo || ':' || p_clave, 'desde', p_desde,
    'desde_utc', to_char(p_desde AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
    'desde_cst', to_char(p_desde AT TIME ZONE conceptualizador.zona_robot(), 'YYYY-MM-DD HH24:MI') || ' CST',
    'texto', p_texto, 'que_hacer', p_hacer,
    'manual', 'https://github.com/yinyo1/fts-conceptualizador/blob/main/motor/OPERACION.md#' || p_ancla) || coalesce(p_extra, '{}'::jsonb)
$al23$;

/** Las alarmas abiertas AHORA (se calculan siempre; solo se encolan con alarmas_v157). */
CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am23$
DECLARE
  v_a    conceptualizador.arriendo;
  v_r    jsonb := '[]'::jsonb;
  v_ult  timestamptz;
  v_t0   timestamptz;
  v_n    int;
  v_ls   conceptualizador.latido_sesion;
  v_ses  text;
  v_min  int;
BEGIN
  SELECT * INTO v_a FROM conceptualizador.arriendo WHERE llave = p_llave;
  -- 1 · relevo pedido y nadie nuevo latiendo
  v_min := coalesce(conceptualizador.cfg('alarma_relevo_min'), 5);
  IF v_a.relevo_pedido_at IS NOT NULL AND v_a.relevo_pedido_at < now() - make_interval(mins => v_min) THEN
    v_r := v_r || conceptualizador.alarma('relevo_sin_latir', v_a.sesion_claude || ':' || extract(epoch FROM v_a.relevo_pedido_at)::bigint,
      v_a.relevo_pedido_at,
      'El motor pidió su relevo hace más de ' || v_min || ' min y ninguna sesión nueva está latiendo.',
      'Abre la sesión del motor nuevo (la más reciente titulada «Motor Conceptualizador») y mira si espera un permiso; si no existe, abre el motor desde cero (manual, «límite de linaje»).',
      'relevo-que-no-late', jsonb_build_object('sesion', v_a.sesion_claude, 'motivo', v_a.relevo_motivo));
  END IF;
  -- 2 · principal sin tomar habiendo cola (solo el conceptualizador tiene la tabla trabajo)
  IF p_llave = 'conceptualizador' THEN
    v_min := coalesce(conceptualizador.cfg('alarma_sin_tomar_min'), 30);
    SELECT max(tomado_at) INTO v_ult FROM conceptualizador.trabajo WHERE tomado_por = 'principal';
    SELECT min(t.created_at), count(*) INTO v_t0, v_n FROM conceptualizador.trabajo t
     WHERE t.lote_de IS NULL AND coalesce(t.motor_ultimo, '') <> 'juntado'
       AND t.created_at < now() - make_interval(mins => v_min) AND t.created_at > now() - interval '12 hours'
       AND t.created_at > coalesce(v_ult, '-infinity'::timestamptz)
       AND (t.estado = 'pendiente' OR t.tomado_por = 'respaldo');
    IF v_n > 0 THEN
      v_r := v_r || conceptualizador.alarma('principal_sin_tomar', to_char(v_t0 AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI'), v_t0,
        'El motor principal lleva más de ' || v_min || ' min sin tomar trabajo y hay ' || v_n || ' en la cola (los contesta el respaldo, más lento).',
        'Abre la sesión «Motor Conceptualizador» que tiene el arriendo: si espera un permiso, apruébalo; si está dormida, escribe «arranca motor».',
        'principal-sin-tomar', jsonb_build_object('trabajos', v_n, 'ultimo_principal', v_ult));
    END IF;
  END IF;
  -- 3 y 4 · lo que dice el vigía del dueño: trabajo sin pasos (permiso pendiente) y commits sin subir
  SELECT * INTO v_ls FROM conceptualizador.latido_sesion
   WHERE llave = p_llave AND motor = 'principal' AND visto_at > now() - interval '3 minutes'
   ORDER BY dueno DESC NULLS LAST, visto_at DESC LIMIT 1;
  IF v_ls.sesion IS NOT NULL AND jsonb_typeof(v_ls.salud->'atorado') = 'object'
     AND (v_ls.salud->'atorado'->>'desde') ~ '^[0-9]{10,13}\Z'
     AND to_timestamp((v_ls.salud->'atorado'->>'desde')::bigint / 1000.0) < now() - make_interval(mins => coalesce(conceptualizador.cfg('alarma_atorado_min'), 5)) THEN
    v_r := v_r || conceptualizador.alarma('permiso_pendiente', v_ls.sesion || ':' || coalesce(v_ls.salud->'atorado'->>'trabajo_id', '?'),
      to_timestamp((v_ls.salud->'atorado'->>'desde')::bigint / 1000.0),
      'El motor anunció el trabajo ' || coalesce(v_ls.salud->'atorado'->>'trabajo_id', '?') || ' y su subagente no ha publicado ni un paso: casi siempre es una sesión esperando un permiso.',
      'Abre la sesión ' || v_ls.sesion || ' y aprueba lo que pida (o contéstale «no»). Si no pide nada, escribe «estado motor».',
      'permiso-pendiente', jsonb_build_object('sesion', v_ls.sesion, 'trabajo_id', v_ls.salud->'atorado'->'trabajo_id'));
  END IF;
  IF v_ls.sesion IS NOT NULL AND jsonb_typeof(v_ls.salud->'sin_subir') = 'object'
     AND (v_ls.salud->'sin_subir'->>'desde') ~ '^[0-9]{10,13}\Z'
     AND to_timestamp((v_ls.salud->'sin_subir'->>'desde')::bigint / 1000.0) < now() - make_interval(mins => coalesce(conceptualizador.cfg('alarma_sin_subir_min'), 5)) THEN
    v_r := v_r || conceptualizador.alarma('sin_subir', v_ls.sesion || ':' || (v_ls.salud->'sin_subir'->>'desde'),
      to_timestamp((v_ls.salud->'sin_subir'->>'desde')::bigint / 1000.0),
      'El motor tiene ' || coalesce(v_ls.salud->'sin_subir'->>'n', '?') || ' commit(s) en main local sin subir a GitHub' ||
        CASE WHEN (v_ls.salud->>'rebase') = 'true' THEN ' y un rebase a medias' ELSE '' END || ': los demás no ven esas respuestas en el repo.',
      'El vigía reintenta solo (aborta el rebase y vuelve a subir). Si sigue, abre la sesión ' || v_ls.sesion || ' y escribe «estado motor».',
      'commits-sin-subir', jsonb_build_object('sesion', v_ls.sesion, 'n', v_ls.salud->'sin_subir'->'n'));
  END IF;
  -- 5 · más de una sesión latiendo como principal (cada una con más de N min latiendo y vista en los últimos 150 s)
  v_min := coalesce(conceptualizador.cfg('alarma_dos_principales_min'), 4);
  SELECT count(*), string_agg(sesion, ', ' ORDER BY sesion), min(greatest(primer_at, now() - interval '1 day')) INTO v_n, v_ses, v_t0
    FROM conceptualizador.latido_sesion
   WHERE llave = p_llave AND motor = 'principal' AND visto_at > now() - interval '150 seconds'
     AND visto_at - primer_at > make_interval(mins => v_min) AND coalesce(estado, 'activo') IN ('activo','sin_relevo','pausado');
  IF v_n > 1 THEN
    v_r := v_r || conceptualizador.alarma('dos_principales', md5(v_ses), v_t0,
      v_n || ' sesiones están latiendo como motor principal: ' || v_ses || '.',
      'Escribe «arranca motor» en la sesión que debe quedarse (toma el arriendo y retira a las demás). A las viejas no les escribas nada: se retiran solas en su siguiente latido.',
      'dos-principales', jsonb_build_object('sesiones', v_ses, 'n', v_n));
  END IF;
  RETURN v_r;
END
$am23$;

/** Encola las alarmas nuevas (una por incidente) para el correo inmediato. Solo con alarmas_v157. */
CREATE OR REPLACE FUNCTION conceptualizador.encolar_alarmas(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql AS $ea23$
DECLARE v_al jsonb := conceptualizador.alarmas_motor(p_llave); v_e jsonb;
BEGIN
  IF NOT conceptualizador.prendido('alarmas_v157') THEN RETURN v_al; END IF;
  FOR v_e IN SELECT * FROM jsonb_array_elements(v_al) LOOP
    INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
    VALUES ('motor_alarma', left(v_e->>'clave', 200), v_e - 'clave' || jsonb_build_object('llave', p_llave), NULL)
    ON CONFLICT (tipo, clave) DO NOTHING;
  END LOOP;
  RETURN v_al;
END
$ea23$;

-- ── api_motor (envoltura) ──────────────────────────────────────────────────
DO $ren23m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0023prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0023prev;
  END IF;
END
$ren23m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot23$
DECLARE
  v_modo  text := p->>'modo';
  v_motor text := p->>'motor';
  v_llave text := conceptualizador.llave_motor(p);
  v_sc    text := conceptualizador.sesion_valida(p->>'sesion_claude');
  v_on    boolean := conceptualizador.prendido('arriendo_v157');
  v_a     conceptualizador.arriendo;
  v_r     jsonb;
  v_ar    jsonb;
  v_acc   text;
  v_prof  int := CASE WHEN coalesce(p->>'profundidad', '') ~ '^[0-9]{1,3}\Z' THEN (p->>'profundidad')::int END;
  v_al    jsonb;
BEGIN
  -- ── modo nuevo `arriendo` (solo el principal; el respaldo nunca tiene arriendo) ──
  IF v_modo = 'arriendo' THEN
    IF v_motor IS DISTINCT FROM 'principal' THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
    v_acc := coalesce(p->>'accion', 'estado');
    IF v_acc NOT IN ('tomar','forzar','soltar','relevo','estado') THEN RETURN jsonb_build_object('ok', false, 'error', 'ACCION_INVALIDA'); END IF;
    IF v_acc = 'estado' THEN
      RETURN jsonb_build_object('ok', true, 'arriendo', conceptualizador.arriendo_json(v_llave, v_sc),
        'eventos', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id DESC), '[]'::jsonb)
                      FROM (SELECT * FROM conceptualizador.arriendo_evento WHERE llave = v_llave ORDER BY id DESC LIMIT 10) e));
    END IF;
    IF v_sc IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SESION_INVALIDA'); END IF;
    IF v_acc IN ('tomar','forzar') THEN
      RETURN conceptualizador.arriendo_tomar(v_llave, v_sc, left(p->>'sesion', 120), v_prof, left(p->>'version', 40), v_acc = 'forzar');
    END IF;
    SELECT * INTO v_a FROM conceptualizador.arriendo WHERE llave = v_llave FOR UPDATE;
    IF v_a.llave IS NULL OR v_a.sesion_claude <> v_sc THEN
      RETURN jsonb_build_object('ok', true, 'arriendo', conceptualizador.arriendo_json(v_llave, v_sc), 'nada', true);
    END IF;
    IF v_acc = 'soltar' THEN
      UPDATE conceptualizador.arriendo SET vence_at = now(), relevo_pedido_at = NULL WHERE llave = v_llave;
      INSERT INTO conceptualizador.arriendo_evento (llave, tipo, sesion, detalle) VALUES (v_llave, 'soltado', v_sc, jsonb_build_object('razon', left(p->>'razon', 200)));
    ELSE
      UPDATE conceptualizador.arriendo SET relevo_pedido_at = coalesce(relevo_pedido_at, now()), relevo_motivo = left(p->>'razon', 200) WHERE llave = v_llave;
      INSERT INTO conceptualizador.arriendo_evento (llave, tipo, sesion, detalle) VALUES (v_llave, 'relevo_pedido', v_sc, jsonb_build_object('razon', left(p->>'razon', 200)));
    END IF;
    RETURN jsonb_build_object('ok', true, 'arriendo', conceptualizador.arriendo_json(v_llave, v_sc));
  END IF;

  -- ── latido ──
  IF v_modo = 'latido' AND v_motor = 'principal' THEN
    IF v_on THEN
      v_a := conceptualizador.arriendo_vigente(v_llave);
      IF v_sc IS NOT NULL AND (v_a.llave IS NULL OR v_a.sesion_claude = v_sc) AND coalesce(p->>'estado', 'activo') <> 'apagado' THEN
        PERFORM conceptualizador.arriendo_tomar(v_llave, v_sc, left(p->>'sesion', 120), v_prof, left(p->>'version', 40), false);
      ELSIF v_a.llave IS NOT NULL AND (v_sc IS NULL OR v_a.sesion_claude <> v_sc) THEN
        -- No es el dueño: el renglón `latido` es del dueño y no se toca. El vigía se retira con esto.
        PERFORM conceptualizador.latido_sesion_anotar(p, false);
        RETURN jsonb_build_object('ok', true, 'arriendo', conceptualizador.arriendo_json(v_llave, v_sc), 'no_dueno', true);
      END IF;
      -- El dueño que se apaga suelta el arriendo: el siguiente lo toma sin esperar a que venza.
      IF v_sc IS NOT NULL AND coalesce(p->>'estado', '') = 'apagado' AND v_a.sesion_claude = v_sc THEN
        UPDATE conceptualizador.arriendo SET vence_at = now() WHERE llave = v_llave AND sesion_claude = v_sc;
        INSERT INTO conceptualizador.arriendo_evento (llave, tipo, sesion, detalle) VALUES (v_llave, 'soltado', v_sc, '{"razon":"latido apagado"}'::jsonb);
      END IF;
    END IF;
    v_r := conceptualizador.api_motor_0023prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      v_ar := conceptualizador.arriendo_json(v_llave, v_sc);
      PERFORM conceptualizador.latido_sesion_anotar(p, coalesce((v_ar->>'dueno')::boolean, false) OR NOT v_on);
      -- La profundidad del dueño la manda el motor (de get_session); con el arriendo prendido manda la del arriendo.
      IF v_on AND (v_ar->>'dueno')::boolean AND v_prof IS NOT NULL THEN
        UPDATE conceptualizador.latido SET profundidad = v_prof WHERE motor = 'principal';
      END IF;
      v_al := conceptualizador.encolar_alarmas(v_llave);
      v_r := v_r || jsonb_build_object('arriendo', v_ar, 'alarmas', v_al);
    END IF;
    RETURN v_r;
  END IF;

  -- ── siguiente / tomar: solo el dueño (con el interruptor) ──
  IF v_modo IN ('siguiente','tomar') THEN
    PERFORM conceptualizador.juntar_revisas();
    IF NOT conceptualizador.puede_trabajar(p) THEN
      IF v_modo = 'siguiente' THEN
        RETURN jsonb_build_object('ok', true, 'trabajos', '[]'::jsonb, 'trabajo_id', NULL, 'no_dueno', true,
                                  'arriendo', conceptualizador.arriendo_json(v_llave, v_sc));
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_DUENO', 'arriendo', conceptualizador.arriendo_json(v_llave, v_sc));
    END IF;
    -- Un «revisa» que se juntó con otro ya no se toma (llegó por un `siguiente` de antes).
    IF v_modo = 'tomar' AND EXISTS (SELECT 1 FROM conceptualizador.trabajo WHERE id = nullif(p->>'trabajo_id', '')::bigint AND motor_ultimo = 'juntado' AND estado = 'listo') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'YA_TOMADO', 'estado', 'listo', 'juntado', true);
    END IF;
  END IF;

  -- ── avisos para el correo inmediato: las alarmas entran a la cola de siempre ──
  IF v_modo = 'avisos_consumo' THEN PERFORM conceptualizador.encolar_alarmas('conceptualizador'); END IF;

  v_r := conceptualizador.api_motor_0023prev(p);

  -- ── 6 · una tarjeta «Actualizar el machote» con un cálculo viejo se descarta sola cuando llega uno nuevo (recalculo_v157) ──
  -- c663eb, 19-oct: tres recálculos en 20 min y Esteban descartó a mano las tarjetas de los cálculos anteriores. Una propuesta
  -- nueva del mismo tipo ya reemplazaba a la vieja (0005); faltaba el caso en que el cálculo nuevo llega SIN tarjeta nueva.
  IF v_modo = 'entregar' AND coalesce((v_r->>'ok')::boolean, false) AND NOT coalesce((v_r->>'ya_estaba')::boolean, false)
     AND conceptualizador.prendido('recalculo_v157') AND jsonb_typeof(p->'respuesta'->'machote') = 'object'
     AND coalesce(p->'respuesta'->'machote'->>'precio', '') ~ '^[0-9]+(\.[0-9]+)?\Z'
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'respuesta'->'acciones') = 'array' THEN p->'respuesta'->'acciones' ELSE '[]'::jsonb END) x
                      WHERE x->>'tipo' = 'crear_machote') THEN
    UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
           resultado = jsonb_build_object('reemplazada_por_calculo', (p->>'trabajo_id')::bigint)
      FROM conceptualizador.trabajo t
     WHERE t.id = nullif(p->>'trabajo_id', '')::bigint AND a.caso_id = t.caso_id AND a.tipo = 'crear_machote' AND a.estado = 'propuesta'
       AND a.trabajo_id < t.id
       AND round(coalesce(nullif(a.datos->'resumen'->>'total', '')::numeric, -1), 2) <> round((p->'respuesta'->'machote'->>'precio')::numeric, 2);
  END IF;

  -- ── salud: el arriendo, las sesiones que latieron en 24 h y las alarmas abiertas ──
  IF v_modo = 'salud' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'salud') = 'object' THEN
    v_r := jsonb_set(v_r, '{salud,arriendo}', conceptualizador.arriendo_json('conceptualizador', NULL) || jsonb_build_object(
      'sesion', (SELECT sesion_claude FROM conceptualizador.arriendo WHERE llave = 'conceptualizador'),
      'eventos_24h', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', e.tipo, 'sesion', e.sesion, 'de', e.de_sesion, 'at', e.at) ORDER BY e.id), '[]'::jsonb)
                        FROM conceptualizador.arriendo_evento e WHERE e.llave = 'conceptualizador' AND e.at > now() - interval '24 hours'),
      'sesiones_24h', (SELECT coalesce(jsonb_agg(jsonb_build_object('sesion', s.sesion, 'motor', s.motor, 'dueno', s.dueno, 'profundidad', s.profundidad,
                              'version', s.version, 'primer_at', s.primer_at, 'visto_at', s.visto_at, 'latidos', s.latidos) ORDER BY s.primer_at), '[]'::jsonb)
                         FROM conceptualizador.latido_sesion s WHERE s.llave = 'conceptualizador' AND s.visto_at > now() - interval '24 hours'),
      'alarmas', conceptualizador.alarmas_motor('conceptualizador'),
      'juntados_24h', (SELECT count(*) FROM conceptualizador.trabajo WHERE motor_ultimo = 'juntado' AND listo_at > now() - interval '24 hours')));
  END IF;
  RETURN v_r;
END
$mot23$;

-- ── api_respaldo (envoltura): antes de buscar, juntar los «revisa» repetidos ──
DO $ren23r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_respaldo_0023prev') THEN
    ALTER FUNCTION conceptualizador.api_respaldo(jsonb) RENAME TO api_respaldo_0023prev;
  END IF;
END
$ren23r$;

CREATE OR REPLACE FUNCTION conceptualizador.api_respaldo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $res23$
BEGIN
  IF coalesce(p->>'modo', 'buscar') = 'buscar' THEN
    PERFORM conceptualizador.juntar_revisas();
    -- Las alarmas se revisan también aquí (cada 15 s): si el principal no late, el latido no las revisa.
    PERFORM conceptualizador.encolar_alarmas('conceptualizador');
  END IF;
  RETURN conceptualizador.api_respaldo_0023prev(p);
END
$res23$;

-- ── Permisos: la app solo ejecuta las puertas ──────────────────────────────
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0023prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_respaldo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_respaldo_0023prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0023prev(jsonb), conceptualizador.api_respaldo_0023prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0023prev(jsonb), conceptualizador.api_respaldo_0023prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.arriendo_tomar(text, text, text, int, text, boolean), conceptualizador.latido_sesion_anotar(jsonb, boolean),
                       conceptualizador.juntar_revisas(), conceptualizador.encolar_alarmas(text), conceptualizador.alarmas_motor(text),
                       conceptualizador.puede_trabajar(jsonb), conceptualizador.arriendo_vigente(text), conceptualizador.arriendo_json(text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
REVOKE ALL ON TABLE conceptualizador.arriendo, conceptualizador.arriendo_evento, conceptualizador.latido_sesion FROM PUBLIC;
