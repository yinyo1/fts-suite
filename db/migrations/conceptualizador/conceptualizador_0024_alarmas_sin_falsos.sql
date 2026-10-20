-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0024 · V1.57a (fts-conceptualizador#12, 20-oct): la alarma «principal sin tomar» ya no cuenta lo que contestó
-- el respaldo, el tramo SIN principal es su propio incidente, y las alarmas abiertas se recuerdan cada N horas.
--
-- Falso positivo del 20-oct 07:30 CST (#12): «el motor principal no está tomando trabajo (desde las 00:10 CST)» con 4 en la cola.
-- Los 4 eran los trabajos 398–401 de c663eb, ya `listo` (los contestó el respaldo de 06:23 a 06:44 UTC, sin principal). La 0023
-- contaba `tomado_por = 'respaldo'` como cola y medía desde que llegó el trabajo, aunque el principal volvió a las 13:19 UTC.
--
-- 1. principal_sin_tomar: solo con el principal ACTIVO (estado_motor_v152), solo trabajos TOMABLES (mismo criterio que
--    `siguiente`), y «desde» = el más tarde entre la llegada del trabajo y la vuelta del principal.
-- 2. sin_principal (nueva): no hay principal activo hace más de `alarma_sin_principal_min` (15). Su primer aviso lo sigue
--    mandando motor_caido (0014, una vez); ésta agrega los recordatorios y aparece en salud y en la sesión.
-- 3. Recordatorio: cada `alarma_recordatorio_h` (4) horas mientras la alarma siga abierta, un correo más («Sigue abierta desde
--    hace N h»). 0 = sin recordatorio. Todo dentro de `alarmas_v157` (apagarlo apaga también esto).
-- Lo que NO cambia: tablas, interruptores, el resto de las alarmas, ningún modo. Reversa: db/reversas/024_reversa.sql (vuelve a
-- las funciones de la 0023). Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla,
-- ampersand, acento grave o dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('alarma_sin_principal_min', '15'),           -- sin principal activo por más de esto
  ('alarma_recordatorio_h', '4')                -- recordatorio de una alarma abierta (0 = ninguno)
ON CONFLICT (clave) DO NOTHING;
/** Las alarmas abiertas AHORA (se calculan siempre; solo se encolan con alarmas_v157). */
CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am24$
DECLARE
  v_a    conceptualizador.arriendo;
  v_r    jsonb := '[]'::jsonb;
  v_ult  timestamptz;
  v_t0   timestamptz;
  v_n    int;
  v_ls   conceptualizador.latido_sesion;
  v_ses  text;
  v_min  int;
  v_em   jsonb := conceptualizador.estado_motor_v152();
  v_act  timestamptz;
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
    -- 0024 (#12, 20-oct): solo con el principal ACTIVO y solo trabajos TOMABLES (el mismo criterio que `siguiente`:
    -- pendiente, o tomado con el arriendo de 10 min vencido, con intentos). Los que ya contestó el respaldo NO son cola.
    -- La espera se mide desde que el trabajo llegó o desde que el principal volvió, lo que sea más tarde: sin principal,
    -- el incidente es `sin_principal`, no éste.
    v_min := coalesce(conceptualizador.cfg('alarma_sin_tomar_min'), 30);
    SELECT max(tomado_at) INTO v_ult FROM conceptualizador.trabajo WHERE tomado_por = 'principal';
    v_n := 0;
    IF v_em->'principal'->>'estado' = 'activo' THEN
      v_act := nullif(v_em->'principal'->>'desde', '')::timestamptz;
      SELECT min(t.created_at), count(*) INTO v_t0, v_n FROM conceptualizador.trabajo t
       WHERE t.lote_de IS NULL AND coalesce(t.motor_ultimo, '') <> 'juntado' AND t.intentos < t.max_intentos
         AND (t.estado = 'pendiente'
              OR (t.estado = 'tomado' AND greatest(t.tomado_at, coalesce(t.avance_at, t.tomado_at))
                                           < now() - make_interval(secs => coalesce(conceptualizador.cfg('lease_segundos'), 600))))
         AND greatest(t.created_at, coalesce(v_act, '-infinity'::timestamptz)) < now() - make_interval(mins => v_min)
         AND t.created_at > now() - interval '12 hours';
      v_t0 := greatest(v_t0, v_act);
    END IF;
    IF v_n > 0 THEN
      v_r := v_r || conceptualizador.alarma('principal_sin_tomar', to_char(v_t0 AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI'), v_t0,
        'El motor principal está activo pero lleva más de ' || v_min || ' min sin tomar trabajo y hay ' || v_n || ' esperando que nadie ha tomado.',
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
  -- 6 · 0024 (#12, 20-oct): SIN principal (caído, sin latido, o late y no procesa). Antes solo existía el aviso viejo
  -- motor_caido, que sale UNA vez; este incidente lleva recordatorio (encolar_alarmas) y se separa de principal_sin_tomar.
  IF p_llave = 'conceptualizador' AND coalesce(v_em->'principal'->>'estado', 'caido') <> 'activo'
     AND nullif(v_em->'principal'->>'desde', '') IS NOT NULL
     AND (v_em->'principal'->>'desde')::timestamptz < now() - make_interval(mins => coalesce(conceptualizador.cfg('alarma_sin_principal_min'), 15)) THEN
    v_r := v_r || conceptualizador.alarma('sin_principal', to_char((v_em->'principal'->>'desde')::timestamptz AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI'),
      (v_em->'principal'->>'desde')::timestamptz,
      'No hay motor principal activo (' || coalesce(v_em->'principal'->>'causa', v_em->'principal'->>'estado') || '): contesta el respaldo, más lento, y el agente de avance no corre. Trabajos que atendió el respaldo desde entonces: '
        || coalesce(v_em->'respaldo'->>'atendidos_desde_caida', '0') || '.',
      'Abre la sesión «Motor Conceptualizador» más reciente: si espera un permiso, apruébalo; si no existe o no responde, abre el motor desde cero (manual, «Cómo abrir un motor desde cero»).',
      'sin-principal', jsonb_build_object('causa', v_em->'principal'->>'causa', 'sesion', v_em->'principal'->>'sesion',
                                          'atendidos_respaldo', v_em->'respaldo'->'atendidos_desde_caida'));
  END IF;
  RETURN v_r;
END
$am24$;

/** Encola las alarmas nuevas (una por incidente) para el correo inmediato. Solo con alarmas_v157. */
CREATE OR REPLACE FUNCTION conceptualizador.encolar_alarmas(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql AS $ea24$
DECLARE v_al jsonb := conceptualizador.alarmas_motor(p_llave); v_e jsonb; v_h int; v_k int;
BEGIN
  IF NOT conceptualizador.prendido('alarmas_v157') THEN RETURN v_al; END IF;
  v_h := coalesce(conceptualizador.cfg('alarma_recordatorio_h'), 4);
  FOR v_e IN SELECT * FROM jsonb_array_elements(v_al) LOOP
    -- El primer aviso de sin_principal ya lo manda motor_caido (0014): aquí solo sus recordatorios.
    IF v_e->>'alarma' <> 'sin_principal' THEN
      INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
      VALUES ('motor_alarma', left(v_e->>'clave', 200), v_e - 'clave' || jsonb_build_object('llave', p_llave, 'cada_h', v_h), NULL)
      ON CONFLICT (tipo, clave) DO NOTHING;
    END IF;
    -- 0024 · recordatorio cada alarma_recordatorio_h horas mientras siga abierta (0 = sin recordatorio). Uno por tramo.
    v_k := CASE WHEN v_h > 0 THEN floor(extract(epoch FROM now() - (v_e->>'desde')::timestamptz) / (v_h * 3600))::int ELSE 0 END;
    IF v_k >= 1 THEN
      INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
      VALUES ('motor_alarma', left(v_e->>'clave', 190) || ':r' || v_k,
              (v_e - 'clave') || jsonb_build_object('llave', p_llave, 'recordatorio', v_k, 'cada_h', v_h,
                'texto', 'Sigue abierta desde hace ' || (v_k * v_h) || ' h o más. ' || (v_e->>'texto')), NULL)
      ON CONFLICT (tipo, clave) DO NOTHING;
    END IF;
  END LOOP;
  RETURN v_al;
END
$ea24$;
