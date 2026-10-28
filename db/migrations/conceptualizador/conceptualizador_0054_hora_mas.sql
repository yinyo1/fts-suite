-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0054 · V1.63i (fts-conceptualizador#16, Esteban 28-oct-2026 07:15 MT, punto 3): «Dale 1 hora más hoy» después de medianoche
--
-- Antes (db/015): la base de «1 hora más» es la mayor de ahora, el FIN DEL HORARIO DE HOY y el permiso vigente. De 00:00 a ~05:00 el «fin
-- del horario de hoy» son las 22:00 del día que apenas empieza: queda a más de 18 h y el servidor contesta PERMISO_LARGO («El permiso no
-- puede pasar de 18 horas desde ahora (pediste hasta 22:00).»). Lo encontró la regresión de C10 (pantalla-v153b y pantalla-v1521, de noche).
--   · conceptualizador.hora_mas_hasta(caso, ahora): la misma regla con el fin del horario del día que de verdad terminó: antes de que
--     empiece el horario del robot (`robot_desde`, madrugada), cuenta el de ayer, que ya pasó; o sea, una hora desde ahora (o desde el
--     permiso vigente).
--   · api_suite (envoltura): SOLO cuando la regla vieja daría PERMISO_LARGO, el «hora_mas» se pide como «hasta:HH:MM» con la hora de
--     hora_mas_hasta y el permiso queda guardado con tipo «hora_mas», como siempre. De día no cambia nada (lo prueba sql-0054.sh).
-- Sin interruptor: solo toca el camino que hoy truena. Aditiva. Reversa: reversas/054_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.hora_mas_hasta(p_caso uuid, p_ahora timestamptz DEFAULT now()) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $hm54$
DECLARE
  v_zona text := conceptualizador.zona_robot();
  v_fin  timestamptz;
  v_vig  timestamptz;
BEGIN
  v_fin := ((p_ahora AT TIME ZONE v_zona)::date + coalesce(conceptualizador.cfg_txt('robot_hasta'), '22:00')::time) AT TIME ZONE v_zona;
  -- Antes de que empiece el horario del robot (madrugada), el día que terminó es el de ayer: su fin ya pasó.
  IF (p_ahora AT TIME ZONE v_zona)::time < coalesce(conceptualizador.cfg_txt('robot_desde'), '07:00')::time THEN v_fin := v_fin - interval '1 day'; END IF;
  BEGIN v_vig := (conceptualizador.robot_permiso(p_caso)->>'hasta')::timestamptz; EXCEPTION WHEN others THEN v_vig := NULL; END;
  RETURN greatest(p_ahora, v_fin, coalesce(v_vig, p_ahora)) + interval '1 hour';
END
$hm54$;
REVOKE ALL ON FUNCTION conceptualizador.hora_mas_hasta(uuid, timestamptz) FROM PUBLIC;

DO $ren54s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0054prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0054prev;
  END IF;
END
$ren54s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui54$
DECLARE
  v_cam   jsonb := p->'datos'->'cambios';
  v_zona  text;
  v_x     record;
  v_caso  uuid;
  v_vieja timestamptz;
  v_vig   timestamptz;
  v_has   timestamptz;
  v_nuevo jsonb;
  v_hechas text[] := '{}';
  v_r     jsonb;
BEGIN
  IF coalesce(p->>'modo', '') <> 'config_guardar' OR jsonb_typeof(v_cam) IS DISTINCT FROM 'object'
     OR NOT EXISTS (SELECT 1 FROM jsonb_each_text(v_cam) e WHERE e.key LIKE 'robot_permiso:%' AND btrim(e.value) = 'hora_mas') THEN
    RETURN conceptualizador.api_suite_0054prev(p);
  END IF;
  v_zona := conceptualizador.zona_robot();
  v_nuevo := v_cam;
  FOR v_x IN SELECT key, btrim(value) AS value FROM jsonb_each_text(v_cam) WHERE key LIKE 'robot_permiso:%' AND btrim(value) = 'hora_mas' LOOP
    v_caso := conceptualizador.a_uuid(substr(v_x.key, 15));
    CONTINUE WHEN v_caso IS NULL;
    -- la regla de db/015 tal cual: si NO da más de 18 h, no se toca nada
    BEGIN v_vig := (conceptualizador.robot_permiso(v_caso)->>'hasta')::timestamptz; EXCEPTION WHEN others THEN v_vig := NULL; END;
    v_vieja := greatest(now(), ((now() AT TIME ZONE v_zona)::date + coalesce(conceptualizador.cfg_txt('robot_hasta'), '22:00')::time) AT TIME ZONE v_zona,
                        coalesce(v_vig, now())) + interval '1 hour';
    CONTINUE WHEN v_vieja <= now() + interval '18 hours';
    v_has := conceptualizador.hora_mas_hasta(v_caso, now());
    v_nuevo := jsonb_set(v_nuevo, ARRAY[v_x.key], to_jsonb('hasta:' || to_char(v_has AT TIME ZONE v_zona, 'HH24:MI')));
    v_hechas := v_hechas || v_x.key;
  END LOOP;
  IF array_length(v_hechas, 1) IS NULL THEN RETURN conceptualizador.api_suite_0054prev(p); END IF;
  v_r := conceptualizador.api_suite_0054prev(jsonb_set(p, '{datos,cambios}', v_nuevo));
  -- El permiso se pidió como «1 hora más»: se guarda con su tipo de siempre.
  IF coalesce((v_r->>'ok')::boolean, false) THEN
    UPDATE conceptualizador.config SET valor = jsonb_set(valor::jsonb, '{tipo}', '"hora_mas"')::text
     WHERE clave = ANY (v_hechas) AND valor::jsonb->>'tipo' = 'fuera_horario';
    v_r := v_r || jsonb_build_object('madrugada', to_jsonb(v_hechas));
  END IF;
  RETURN v_r;
END
$sui54$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0054prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.hora_mas_hasta(uuid, timestamptz) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0054prev(jsonb) FROM PUBLIC;
DO $gr54$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0054prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr54$;
