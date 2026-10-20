-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0025 · V1.57a (fts-conceptualizador#12, 20-oct): el motor nunca se da por relevado sin una sesión nueva
-- latiendo, y el arrancador se vigila.
--
-- Las dos condiciones de Esteban para prender el arrancador por mensaje:
-- 1. Si 5 min después de pedirle el relevo al arrancador no late un motor nuevo, el relevo cae a create_session y sale una
--    alarma. El motor no se da por relevado hasta ver latir a la sesión nueva (antes bastaba con que create_session devolviera
--    un id, y con el arrancador ni eso: send_message solo dice «entregado»).
-- 2. Si la sesión del arrancador no responde o se perdió, alarma con su «qué hacer».
--
-- Cómo: SIN modos nuevos ni cambios en n8n. El vigía usa el modo `arriendo` que ya existe, con `accion = relevo` y una
-- `razon` que empieza con `relevo:` o `arrancador:`. Esas razones se anotan en `relevo_senal` (tabla nueva) en lugar de ir
-- al arriendo, así que funcionan con `arriendo_v157` apagado. Cualquier otra razón sigue el camino de la 0023 tal cual.
--   relevo:arrancador <sesión>      el motor le mandó el mensaje al arrancador
--   relevo:create_session <sesión>  el motor creó su relevo con create_session (directo o como respaldo)
--   arrancador:ok|perdido|no_responde <detalle>   lo que vio el motor del arrancador (get_session o send_message)
-- El latido del principal devuelve `relevo_senal`: el último pedido de esa sesión (3 h) y, si ya late, la sesión NUEVA
-- (otra sesión principal que empezó a latir después del pedido y latió en los últimos 120 s). Con eso el vigía se marca
-- relevado, o a los 5 min cae a create_session.
-- Alarmas nuevas (salen por el correo de siempre con alarmas_v157 y en la sesión): relevo_no_late y arrancador_perdido.
--
-- Lo que NO cambia: el arriendo, los demás modos, las demás alarmas. Reversa: db/reversas/025_reversa.sql (devuelve
-- api_motor y alarmas_motor a la 0024 y deja la tabla, que no estorba). Reglas del runner: sin llaves dobles, sin dos dólares
-- juntos, sin dólar antes de comilla, ampersand, acento grave o dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conceptualizador.relevo_senal (
  id            bigserial   PRIMARY KEY,
  llave         text        NOT NULL,
  sesion_claude text        NOT NULL,
  tipo          text        NOT NULL CHECK (tipo IN ('relevo_arrancador','relevo_create_session','arrancador_ok','arrancador_perdido','arrancador_no_responde')),
  detalle       text,
  at            timestamptz NOT NULL DEFAULT now(),
  latio_sesion  text,
  latio_at      timestamptz,
  latio_prof    int
);
CREATE INDEX IF NOT EXISTS relevo_senal_ses ON conceptualizador.relevo_senal (llave, sesion_claude, at DESC);
CREATE INDEX IF NOT EXISTS relevo_senal_at ON conceptualizador.relevo_senal (llave, at DESC);
REVOKE ALL ON TABLE conceptualizador.relevo_senal FROM PUBLIC;

/** La sesión principal NUEVA que late después de un pedido de relevo (o null). */
CREATE OR REPLACE FUNCTION conceptualizador.relevo_nuevo(p_llave text, p_sc text, p_desde timestamptz) RETURNS jsonb
LANGUAGE sql STABLE AS $rn25$
  SELECT jsonb_build_object('sesion', s.sesion_claude, 'vigia', s.sesion_vigia, 'primer_at', s.primer_at, 'visto_at', s.visto_at,
                            'profundidad', s.profundidad, 'version', s.version)
    FROM conceptualizador.latido_sesion s
   WHERE s.llave = p_llave AND s.motor = 'principal' AND s.sesion_claude IS NOT NULL AND s.sesion_claude <> p_sc
     AND s.primer_at >= p_desde - interval '1 minute'
     AND s.visto_at > now() - make_interval(secs => coalesce(conceptualizador.cfg('latido_vivo_segundos'), 120))
     AND coalesce(s.estado, 'activo') NOT IN ('apagado','relevo')
   ORDER BY s.primer_at DESC LIMIT 1
$rn25$;

/** Lo que el latido le dice al vigía: su último pedido de relevo y la sesión nueva si ya late. Anota cuándo latió. */
CREATE OR REPLACE FUNCTION conceptualizador.relevo_estado(p_llave text, p_sc text) RETURNS jsonb
LANGUAGE plpgsql AS $re25$
DECLARE v_u conceptualizador.relevo_senal; v_d timestamptz; v_n jsonb;
BEGIN
  IF p_sc IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_u FROM conceptualizador.relevo_senal
   WHERE llave = p_llave AND sesion_claude = p_sc AND tipo LIKE 'relevo%' AND at > now() - interval '3 hours'
   ORDER BY at DESC LIMIT 1;
  IF v_u.id IS NULL THEN RETURN NULL; END IF;
  -- Desde el PRIMER pedido de la cadena: si el arrancador tardó y llegó después del respaldo, también cuenta.
  SELECT min(at) INTO v_d FROM conceptualizador.relevo_senal
   WHERE llave = p_llave AND sesion_claude = p_sc AND tipo LIKE 'relevo%' AND at > now() - interval '3 hours';
  v_n := conceptualizador.relevo_nuevo(p_llave, p_sc, v_d);
  IF v_n IS NOT NULL THEN
    UPDATE conceptualizador.relevo_senal SET latio_sesion = v_n->>'sesion', latio_at = now(),
           latio_prof = CASE WHEN (v_n->>'profundidad') ~ '^[0-9]{1,3}\Z' THEN (v_n->>'profundidad')::int END
     WHERE llave = p_llave AND sesion_claude = p_sc AND tipo LIKE 'relevo%' AND at >= v_d AND latio_at IS NULL;
  END IF;
  RETURN jsonb_build_object('id', v_u.id, 'tipo', v_u.tipo, 'at', v_u.at, 'desde', v_d,
                            'segundos', round(extract(epoch FROM now() - v_u.at))::int, 'nuevo', v_n);
END
$re25$;

-- ── alarmas (envoltura de la 0024) ─────────────────────────────────────────
DO $ren25a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0025prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0025prev;
  END IF;
END
$ren25a$;

/** Las de la 0024 más: relevo que no late (por arrancador o por create_session) y arrancador perdido. */
CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am25$
DECLARE
  v_r   jsonb := conceptualizador.alarmas_motor_0025prev(p_llave);
  v_s   conceptualizador.relevo_senal;
  v_min int := coalesce(conceptualizador.cfg('alarma_relevo_min'), 5);
BEGIN
  -- 1 · un pedido de relevo de hace más de N min sin sesión nueva latiendo. Se cierra sola si la nueva latió (aunque la
  --     vieja ya no esté para anotarlo) o si un pedido posterior de la misma sesión ya se resolvió. Máximo 3 h.
  FOR v_s IN
    SELECT * FROM conceptualizador.relevo_senal r
     WHERE r.llave = p_llave AND r.tipo LIKE 'relevo%' AND r.latio_at IS NULL
       AND r.at < now() - make_interval(mins => v_min) AND r.at > now() - interval '3 hours'
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.relevo_senal q
                        WHERE q.llave = r.llave AND q.sesion_claude = r.sesion_claude AND q.tipo LIKE 'relevo%' AND q.at >= r.at AND q.latio_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.latido_sesion s
                        WHERE s.llave = r.llave AND s.motor = 'principal' AND s.sesion_claude IS NOT NULL
                          AND s.sesion_claude <> r.sesion_claude AND s.primer_at >= r.at - interval '1 minute')
     ORDER BY r.at
  LOOP
    IF v_s.tipo = 'relevo_arrancador' THEN
      v_r := v_r || conceptualizador.alarma('relevo_no_late', v_s.id::text, v_s.at,
        'El motor le pidió el relevo al arrancador hace más de ' || v_min || ' min y ningún motor nuevo está latiendo. El motor cae solo a create_session (el camino de antes) y sigue trabajando mientras tanto.',
        'Abre la sesión «Arrancador del motor (no cerrar)»: si espera un permiso, apruébalo. Si no existe o está archivada, sigue el manual «El arrancador no responde». Si en 10 min tampoco late el relevo de create_session, llega otra alarma.',
        'el-arrancador-no-responde', jsonb_build_object('sesion', v_s.sesion_claude, 'via', 'arrancador', 'arrancador', v_s.detalle));
    ELSE
      v_r := v_r || conceptualizador.alarma('relevo_no_late', v_s.id::text, v_s.at,
        'El motor creó su relevo con create_session hace más de ' || v_min || ' min y la sesión nueva no está latiendo. El motor viejo sigue trabajando y lo reintenta solo.',
        'Abre la sesión «Motor Conceptualizador» más reciente: si espera un permiso, apruébalo; si no existe o no arrancó, abre el motor desde cero (manual, «Cómo abrir un motor desde cero»).',
        'relevo-que-no-late', jsonb_build_object('sesion', v_s.sesion_claude, 'via', 'create_session', 'nueva', v_s.detalle));
    END IF;
  END LOOP;
  -- 2 · lo último que se supo del arrancador (24 h) es que se perdió o no respondió. Se cierra con un `arrancador:ok`.
  SELECT * INTO v_s FROM conceptualizador.relevo_senal
   WHERE llave = p_llave AND tipo LIKE 'arrancador%' AND at > now() - interval '24 hours' ORDER BY at DESC, id DESC LIMIT 1;
  IF v_s.id IS NOT NULL AND v_s.tipo IN ('arrancador_perdido','arrancador_no_responde') THEN
    v_r := v_r || conceptualizador.alarma('arrancador_perdido', v_s.id::text, v_s.at,
      'El arrancador ' || CASE WHEN v_s.tipo = 'arrancador_perdido' THEN 'se perdió' ELSE 'no responde' END || ' (' || coalesce(v_s.detalle, 'sin detalle') || '). Los relevos van por create_session y la cadena vuelve a crecer: en la profundidad 8 ya no hay relevo.',
      'Sigue el manual «El arrancador no responde»: abre una sesión nueva «Arrancador del motor (no cerrar)» y pon su id en motor/arrancador.json, o pon activo:false si no hay tiempo. Nada se pierde mientras tanto: el motor sigue trabajando.',
      'el-arrancador-no-responde', jsonb_build_object('sesion', v_s.sesion_claude, 'estado', v_s.tipo));
  END IF;
  RETURN v_r;
END
$am25$;

-- ── api_motor (envoltura de la 0023) ───────────────────────────────────────
DO $ren25m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0025prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0025prev;
  END IF;
END
$ren25m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot25$
DECLARE
  v_modo  text := p->>'modo';
  v_llave text := conceptualizador.llave_motor(p);
  v_sc    text := conceptualizador.sesion_valida(p->>'sesion_claude');
  v_raz   text := coalesce(p->>'razon', '');
  v_m     text[];
  v_tipo  text;
  v_id    bigint;
  v_r     jsonb;
BEGIN
  -- Las señales del relevo y del arrancador viajan por el modo `arriendo` (accion relevo) con su prefijo en la razón.
  IF v_modo = 'arriendo' AND p->>'accion' = 'relevo' AND v_raz ~ '^(relevo|arrancador):' THEN
    IF p->>'motor' IS DISTINCT FROM 'principal' THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
    IF v_sc IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SESION_INVALIDA'); END IF;
    v_m := regexp_match(v_raz, '^(relevo|arrancador):([a-z_]+)[ ]*(.*)\Z');
    v_tipo := CASE WHEN v_m IS NULL THEN NULL ELSE v_m[1] || '_' || v_m[2] END;
    IF v_tipo IS NULL OR v_tipo NOT IN ('relevo_arrancador','relevo_create_session','arrancador_ok','arrancador_perdido','arrancador_no_responde') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SENAL_INVALIDA');
    END IF;
    INSERT INTO conceptualizador.relevo_senal (llave, sesion_claude, tipo, detalle)
    VALUES (v_llave, v_sc, v_tipo, nullif(left(v_m[3], 160), '')) RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'senal', jsonb_build_object('id', v_id, 'tipo', v_tipo),
                              'relevo_senal', conceptualizador.relevo_estado(v_llave, v_sc));
  END IF;

  v_r := conceptualizador.api_motor_0025prev(p);
  IF v_modo = 'latido' AND p->>'motor' = 'principal' AND coalesce((v_r->>'ok')::boolean, false) AND v_sc IS NOT NULL THEN
    v_r := v_r || jsonb_build_object('relevo_senal', conceptualizador.relevo_estado(v_llave, v_sc));
  END IF;
  RETURN v_r;
END
$mot25$;

ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0025prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0025prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0025prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text), conceptualizador.alarmas_motor_0025prev(text),
                       conceptualizador.relevo_nuevo(text, text, timestamptz), conceptualizador.relevo_estado(text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
