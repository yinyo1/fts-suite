-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0015 · V1.52.1 (fts-conceptualizador#5, hallazgos del sáb 17-oct en producción)
--
-- 1. Permiso de administrador del robot por caso («Dale 1 hora más hoy» / «Trabaja este caso fuera de horario
--    hasta HH:MM»). Viaja por `config_guardar` como clave `robot_permiso:<uuid del caso>`: así pasa por el
--    verificador de n8n que ya existe (claves ^[a-z0-9_:.-]{1,100}$) y no hay workflow que cambiar.
--    · Lo valida el servidor: SOLO `panel_admin` (hoy esteban.delacruz), razón obligatoria (3 a 200), bitácora en
--      `config_cambio` (antes → después, quién, razón) y una línea `sistema` en el caso.
--    · Valores que acepta: `hora_mas` (hasta = la mayor de ahora, el fin del horario de hoy y el permiso vigente, + 1 h),
--      `hasta:HH:MM` (hora del robot; si ya pasó hoy, mañana) o `quitar`. Nunca más de 18 h desde ahora.
--    · Se guarda como JSON {tipo, hasta, por, at}; `hasta` vencido = sin permiso: se apaga solo, nadie lo borra.
--    · Lo usa el robot (presupuesto.js/avance.js leen `config` con caché de 60 s): salta el horario y el tope POR CASO
--      de ese caso. NUNCA el freno semanal ni los topes diario y semanal de lo proactivo (eso vive en el código del
--      robot y no se toca aquí).
-- 2. `casos`: `ultimo` y `sin_leer` ya no cuentan el «Sin cambios pendientes en este caso.» que contesta el motor a
--    un «revisa» sin aviso (V1.46; la pantalla ya no lo pinta en el chat, pero la lista sí, #6 punto c).
-- 3. `hilo` y `casos` traen `robot_horario` (robot_desde, robot_hasta, robot_dias, robot_zona y si
--    `robot_config_base` está prendido) para que la pantalla diga UN solo horario, el del panel; `hilo` trae además
--    `robot_permiso` vigente del caso (o null).
--
-- Lo que NO cambia: ningún interruptor, ningún valor de config, ningún otro modo. Sin permiso dado, el robot hace lo
-- de hoy. Reversa: db/reversas/015_reversa.sql (borra la envoltura y le devuelve el nombre a api_suite_0015prev).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, &, acento grave o dígito;
-- etiquetas con nombre. Idempotente (el renombre va una sola vez).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ayudas ─────────────────────────────────────────────────────────────────
-- El texto que el motor contesta a un «revisa» sin aviso pendiente (procesa.js SIN_AVISO).
CREATE OR REPLACE FUNCTION conceptualizador.es_sin_aviso(p_rol text, p_texto text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $sa15$
  SELECT coalesce(p_rol = 'motor' AND btrim(p_texto) = 'Sin cambios pendientes en este caso.', false)
$sa15$;

-- El permiso vigente del robot en un caso (null si no hay o ya venció).
CREATE OR REPLACE FUNCTION conceptualizador.robot_permiso(p_caso uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rp15$
DECLARE v jsonb; v_h timestamptz;
BEGIN
  IF p_caso IS NULL THEN RETURN NULL; END IF;
  BEGIN v := (SELECT valor::jsonb FROM conceptualizador.config WHERE clave = 'robot_permiso:' || p_caso::text);
  EXCEPTION WHEN others THEN RETURN NULL; END;
  IF v IS NULL OR jsonb_typeof(v) <> 'object' OR v->>'tipo' NOT IN ('hora_mas','fuera_horario') THEN RETURN NULL; END IF;
  BEGIN v_h := (v->>'hasta')::timestamptz; EXCEPTION WHEN others THEN RETURN NULL; END;
  IF v_h IS NULL OR v_h <= now() THEN RETURN NULL; END IF;
  RETURN v || jsonb_build_object('hasta_local', conceptualizador.hora_local(v_h), 'zona', conceptualizador.zona_robot());
END
$rp15$;

-- El horario del panel, para que la pantalla diga uno solo.
CREATE OR REPLACE FUNCTION conceptualizador.robot_horario() RETURNS jsonb
LANGUAGE sql STABLE AS $rh15$
  SELECT jsonb_build_object('desde', coalesce(conceptualizador.cfg_txt('robot_desde'), '07:00'),
                            'hasta', coalesce(conceptualizador.cfg_txt('robot_hasta'), '22:00'),
                            'dias', coalesce(conceptualizador.cfg_txt('robot_dias'), '1,2,3,4,5'),
                            'zona', conceptualizador.zona_robot(),
                            'de_panel', conceptualizador.prendido('robot_config_base'))
$rh15$;

-- ── Renombre (una sola vez) ────────────────────────────────────────────────
DO $ren15$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0015prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0015prev;
  END IF;
END
$ren15$;

-- ── API de la suite ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui15$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_cam   jsonb;
  v_r     jsonb;
  v_n     int;
  v_ts    bigint;
  v_razon text;
  v_x     record;
  v_caso  uuid;
  v_c     conceptualizador.caso%ROWTYPE;
  v_ant   text;
  v_nuevo text;
  v_vig   jsonb;
  v_base  timestamptz;
  v_has   timestamptz;
  v_hh    time;
  v_zona  text := conceptualizador.zona_robot();
  v_hechos jsonb := '[]'::jsonb;
  v_quien text;
  v_txt   text;
BEGIN
  -- §1 · permiso del robot: config_guardar con SOLO claves robot_permiso:<uuid>. Con otras claves, lo de antes.
  v_cam := v_d->'cambios';
  IF v_modo = 'config_guardar' AND jsonb_typeof(v_cam) = 'object'
     AND EXISTS (SELECT 1 FROM jsonb_object_keys(v_cam) k WHERE k LIKE 'robot_permiso:%') THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_cam) k WHERE k NOT LIKE 'robot_permiso:%') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MEZCLA', 'mensaje', 'El permiso del robot se guarda solo, sin otros cambios del panel.');
    END IF;
    -- Mismos candados de entrada que el panel: actor, ventana y nonce único.
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
    v_ts := conceptualizador.a_entero(p->>'ts');
    IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
    END IF;
    IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;
    IF NOT conceptualizador.es_panel_admin(v_actor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'El permiso del robot fuera de horario solo lo da Esteban.');
    END IF;
    v_razon := btrim(coalesce(v_d->>'razon', ''));
    IF char_length(v_razon) < 3 OR char_length(v_razon) > 200 OR v_razon ~ '[[:cntrl:]]' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'RAZON_OBLIGATORIA', 'mensaje', 'Escribe la razón del permiso en una línea (3 a 200 caracteres).');
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_cam)) > 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'DEMASIADOS_CAMBIOS'); END IF;
    v_quien := initcap(split_part(v_actor, '.', 1));
    FOR v_x IN SELECT key, btrim(value) AS value FROM jsonb_each_text(v_cam) ORDER BY key LOOP
      v_caso := conceptualizador.a_uuid(substr(v_x.key, 15));
      SELECT * INTO v_c FROM conceptualizador.caso WHERE id = v_caso FOR UPDATE;
      IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE', 'clave', v_x.key); END IF;
      IF v_c.estado NOT IN ('abierto','enviada') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'CASO_CERRADO', 'clave', v_x.key, 'mensaje', 'El caso no está abierto: el robot no lo toca.');
      END IF;
      v_vig := conceptualizador.robot_permiso(v_c.id);
      SELECT valor INTO v_ant FROM conceptualizador.config WHERE clave = v_x.key;
      IF NOT FOUND THEN v_ant := NULL; END IF;
      IF v_x.value = 'quitar' THEN
        IF v_vig IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'error', 'SIN_PERMISO', 'clave', v_x.key, 'mensaje', 'Ese caso no tiene un permiso vigente.');
        END IF;
        v_nuevo := jsonb_build_object('tipo', 'quitado', 'hasta', now(), 'por', v_actor, 'at', now())::text;
        v_txt := v_quien || ' quitó el permiso del robot asistente en este caso. Vuelve a su horario normal.';
      ELSE
        IF v_x.value = 'hora_mas' THEN
          v_base := greatest(now(),
                             ((now() AT TIME ZONE v_zona)::date + coalesce(conceptualizador.cfg_txt('robot_hasta'), '22:00')::time) AT TIME ZONE v_zona,
                             coalesce((v_vig->>'hasta')::timestamptz, now()));
          v_has := v_base + interval '1 hour';
        ELSIF v_x.value ~ '^hasta:([01][0-9]|2[0-3]):[0-5][0-9]\Z' THEN
          v_hh := substr(v_x.value, 7)::time;
          v_has := ((now() AT TIME ZONE v_zona)::date + v_hh) AT TIME ZONE v_zona;
          IF v_has <= now() THEN v_has := v_has + interval '1 day'; END IF;
        ELSE
          RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO', 'clave', v_x.key, 'mensaje', 'El permiso es hora_mas, hasta:HH:MM o quitar.');
        END IF;
        IF v_has > now() + interval '18 hours' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'PERMISO_LARGO', 'clave', v_x.key,
            'mensaje', 'El permiso no puede pasar de 18 horas desde ahora (pediste hasta ' || conceptualizador.hora_local(v_has) || ').');
        END IF;
        v_nuevo := jsonb_build_object('tipo', CASE WHEN v_x.value = 'hora_mas' THEN 'hora_mas' ELSE 'fuera_horario' END,
                                      'hasta', v_has, 'por', v_actor, 'at', now())::text;
        v_txt := v_quien || ' le dio permiso al robot asistente de trabajar este caso hasta las ' || conceptualizador.hora_local(v_has)
                 || ' (hora del centro de México), aunque sea fuera de horario o pase el tope del caso. El freno semanal no se salta. Razón: «'
                 || v_razon || '».';
      END IF;
      INSERT INTO conceptualizador.config (clave, valor) VALUES (v_x.key, v_nuevo)
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
      INSERT INTO conceptualizador.config_cambio (clave, antes, despues, por, razon) VALUES (v_x.key, v_ant, v_nuevo, v_actor, v_razon);
      INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (v_c.id, 'sistema', 'sistema', v_txt);
      v_hechos := v_hechos || jsonb_build_object('clave', v_x.key, 'caso_id', v_c.id, 'permiso', conceptualizador.robot_permiso(v_c.id));
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'cambiados', v_hechos);
  END IF;

  v_r := conceptualizador.api_suite_0015prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;

  -- §2 · la lista: «Sin cambios pendientes» no es la vista previa ni cuenta como sin leer.
  IF v_modo = 'casos' AND jsonb_typeof(v_r->'casos') = 'array' THEN
    v_r := jsonb_set(v_r, '{casos}', (SELECT coalesce(jsonb_agg(
             x
             || CASE WHEN x ? 'ultimo' AND conceptualizador.es_sin_aviso(x->'ultimo'->>'rol', x->'ultimo'->>'texto') THEN
                  jsonb_build_object('ultimo', (SELECT jsonb_build_object('rol', m.rol, 'texto', left(m.texto, 120),
                                       'adjuntos', jsonb_array_length(m.adjuntos), 'created_at', m.created_at)
                                     FROM conceptualizador.mensaje m WHERE m.caso_id = (x->>'id')::uuid
                                      AND NOT conceptualizador.es_sin_aviso(m.rol, m.texto) ORDER BY m.id DESC LIMIT 1))
                ELSE '{}'::jsonb END
             -- sin_leer (0013): el mismo conteo, sin el «Sin cambios pendientes». Si el caso no traía la llave, no se agrega.
             || CASE WHEN x ? 'sin_leer' THEN
                  jsonb_build_object('sin_leer', (SELECT count(*) FROM conceptualizador.mensaje m WHERE m.caso_id = (x->>'id')::uuid AND m.rol = 'motor'
                       AND NOT conceptualizador.es_sin_aviso(m.rol, m.texto)
                       AND m.created_at > coalesce((SELECT pv.visto_at FROM conceptualizador.push_visto pv
                                                     WHERE pv.actor = v_actor AND pv.caso_id = (x->>'id')::uuid), '-infinity'::timestamptz)))
                ELSE '{}'::jsonb END
             || jsonb_build_object('robot_permiso_hasta', conceptualizador.robot_permiso((x->>'id')::uuid)->>'hasta')
           ORDER BY o), '[]'::jsonb)
           FROM jsonb_array_elements(v_r->'casos') WITH ORDINALITY AS a(x, o)));
    v_r := v_r || jsonb_build_object('robot_horario', conceptualizador.robot_horario());
  ELSIF v_modo = 'hilo' THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
      v_r := v_r || jsonb_build_object('robot_horario', conceptualizador.robot_horario(), 'robot_permiso', conceptualizador.robot_permiso(v_caso));
    END IF;
  END IF;
  RETURN v_r;
END
$sui15$;

-- ── Permisos: la app solo ejecuta la puerta; lo de antes y las ayudas quedan cerradas ──
ALTER FUNCTION conceptualizador.api_suite(jsonb)            SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0015prev(jsonb)   SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0015prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0015prev(jsonb), conceptualizador.es_sin_aviso(text, text),
                       conceptualizador.robot_permiso(uuid), conceptualizador.robot_horario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
