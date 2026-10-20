-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0024 (V1.57a, #12) · solo si hace falta. Se copia a db/migrations/conceptualizador/ con el
-- SIGUIENTE número libre y se corre con el runner (ensayo primero). Devuelve alarmas_motor y encolar_alarmas a la 0023
-- (cuenta lo del respaldo como cola, sin sin_principal ni recordatorio). Antes de esto basta con apagar alarmas_v157.
-- Deja las dos claves de config (no estorban).
-- ═══════════════════════════════════════════════════════════════════════════
/** Las alarmas abiertas AHORA (se calculan siempre; solo se encolan con alarmas_v157). */
CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rv24a$
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
$rv24a$;

/** Encola las alarmas nuevas (una por incidente) para el correo inmediato. Solo con alarmas_v157. */
CREATE OR REPLACE FUNCTION conceptualizador.encolar_alarmas(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql AS $rv24e$
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
$rv24e$;
