-- ═══════════════════════════════════════════════════════════════════════════
-- 012_conceptualizador.sql · V1.50 (#4): el agente que aprende y trabaja sobre lo que falta.
--
-- Qué agrega (dos modos de api_motor, una tabla; nada se borra):
--   · asumir_conjeturas  {caso_id, conjeturas:[{accion_id, supuesto, fuente}]} → la pregunta deja de estar abierta
--                        (estado 'descartada', hecha_por 'motor', resultado {asumida:true, supuesto, fuente}) y queda
--                        como «Supuse esto». Regla V1.50: máximo 5 preguntas ABIERTAS por caso (16-oct había casos con
--                        13 y 14). Solo conjeturas 'propuesta' del MISMO caso, nunca de proyecto/diagnóstico, y deja
--                        siempre al menos 5 abiertas si había más (las de más arriba las elige el motor por dinero).
--                        Como hecha_por = 'motor', NO es decreto (decretos.js solo toma lo que hizo una persona).
--   · aviso_aprendizaje  {dia, decisiones, aprendidos, correcciones_repetidas, detalle} → guarda la revisión diaria
--                        del aprendizaje (la hace herramientas/avance/aprender.js por código, sin modelo). Si hubo
--                        decisiones humanas y no salió nada aprendido, `avisos_consumo` la devuelve como tipo
--                        'aprendizaje' y conceptualizador/consumo-avisos manda el correo a Esteban (una vez por día).
--   · aviso_aprendizaje  tabla de la revisión diaria (idempotente por día).
--
-- Patrón de 0006–0011: la función de antes se renombra (api_motor_0012prev) y la nueva delega lo demás.
-- Reglas de db/README.md de la suite: idempotente, etiquetas de dólar con nombre, sin dólar seguido de dígito, regex con \Z.
-- Requiere 0011 aplicada (avisos_consumo).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conceptualizador.aviso_aprendizaje (
  dia                     date        PRIMARY KEY,
  decisiones              int         NOT NULL DEFAULT 0 CHECK (decisiones >= 0),
  aprendidos              int         NOT NULL DEFAULT 0 CHECK (aprendidos >= 0),
  correcciones_repetidas  int         NOT NULL DEFAULT 0 CHECK (correcciones_repetidas >= 0),
  detalle                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
  avisado_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

DO $ren12$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0012prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0012prev;
  END IF;
END
$ren12$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot12$
DECLARE
  v_modo  text := p->>'modo';
  v_caso  uuid;
  v_x     jsonb;
  v_abier int;
  v_pedid int;
  v_n     int := 0;
  v_r     jsonb;
  v_dia   date;
BEGIN
  IF v_modo IS NULL OR v_modo NOT IN ('asumir_conjeturas','aviso_aprendizaje','avisos_consumo') THEN
    RETURN conceptualizador.api_motor_0012prev(p);
  END IF;

  IF v_modo = 'asumir_conjeturas' THEN
    v_caso := nullif(p->>'caso_id','')::uuid;
    IF v_caso IS NULL OR jsonb_typeof(p->'conjeturas') <> 'array' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PARAMETROS');
    END IF;
    SELECT count(*) INTO v_abier FROM conceptualizador.accion a
     WHERE a.caso_id = v_caso AND a.tipo = 'conjetura' AND a.estado = 'propuesta'
       AND coalesce(a.datos->>'campo','') !~ '^(proyecto|diagnostico)[.]';
    -- Solo cuentan las pedidas que de verdad se pueden asumir (abiertas, de este caso, que no son proyecto/diagnóstico).
    SELECT count(*) INTO v_pedid FROM conceptualizador.accion a
     WHERE a.caso_id = v_caso AND a.tipo = 'conjetura' AND a.estado = 'propuesta'
       AND coalesce(a.datos->>'campo','') !~ '^(proyecto|diagnostico)[.]'
       AND a.id::text IN (SELECT x->>'accion_id' FROM jsonb_array_elements(p->'conjeturas') x);
    IF v_abier - v_pedid < 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'QUEDARIAN_MENOS_DE_5', 'abiertas', v_abier, 'pedidas', v_pedid);
    END IF;
    FOR v_x IN SELECT * FROM jsonb_array_elements(p->'conjeturas') LOOP
      IF char_length(btrim(coalesce(v_x->>'supuesto',''))) < 8 OR char_length(btrim(coalesce(v_x->>'fuente',''))) < 3 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'SUPUESTO_SIN_TEXTO_O_FUENTE', 'accion_id', v_x->>'accion_id');
      END IF;
      UPDATE conceptualizador.accion a
         SET estado = 'descartada', hecha_por = 'motor', hecha_at = now(),
             resultado = jsonb_build_object('asumida', true, 'supuesto', left(btrim(v_x->>'supuesto'), 600), 'fuente', left(btrim(v_x->>'fuente'), 300))
       WHERE a.id = nullif(v_x->>'accion_id','')::bigint AND a.caso_id = v_caso AND a.tipo = 'conjetura' AND a.estado = 'propuesta'
         AND coalesce(a.datos->>'campo','') !~ '^(proyecto|diagnostico)[.]';
      GET DIAGNOSTICS v_pedid = ROW_COUNT;
      v_n := v_n + v_pedid;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'asumidas', v_n, 'abiertas', v_abier - v_n);

  ELSIF v_modo = 'aviso_aprendizaje' THEN
    v_dia := nullif(p->>'dia','')::date;
    IF v_dia IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'PARAMETROS'); END IF;
    INSERT INTO conceptualizador.aviso_aprendizaje (dia, decisiones, aprendidos, correcciones_repetidas, detalle)
    VALUES (v_dia, greatest(0, coalesce((p->>'decisiones')::int, 0)), greatest(0, coalesce((p->>'aprendidos')::int, 0)),
            greatest(0, coalesce((p->>'correcciones_repetidas')::int, 0)),
            CASE WHEN jsonb_typeof(p->'detalle') = 'object' THEN p->'detalle' ELSE '{}'::jsonb END)
    ON CONFLICT (dia) DO UPDATE SET decisiones = EXCLUDED.decisiones, aprendidos = EXCLUDED.aprendidos,
           correcciones_repetidas = EXCLUDED.correcciones_repetidas, detalle = EXCLUDED.detalle, updated_at = now();
    RETURN jsonb_build_object('ok', true, 'dia', v_dia);

  ELSE  -- avisos_consumo: lo de 0011 más la revisión del aprendizaje que toca avisar
    v_r := conceptualizador.api_motor_0012prev(p);
    IF coalesce((v_r->>'ok')::boolean, false) THEN
      FOR v_x IN SELECT jsonb_build_object('tipo', 'aprendizaje', 'clave', a.dia::text, 'decisiones', a.decisiones, 'aprendidos', a.aprendidos,
                         'correcciones_repetidas', a.correcciones_repetidas, 'detalle', a.detalle)
                   FROM conceptualizador.aviso_aprendizaje a
                  WHERE a.avisado_at IS NULL AND ((a.decisiones > 0 AND a.aprendidos = 0) OR a.correcciones_repetidas > 0)
                  ORDER BY a.dia LOOP
        v_r := jsonb_set(v_r, '{avisos}', coalesce(v_r->'avisos', '[]'::jsonb) || jsonb_build_array(v_x));
        IF NOT coalesce((p->>'dry_run')::boolean, true) THEN
          UPDATE conceptualizador.aviso_aprendizaje SET avisado_at = now() WHERE dia = (v_x->>'clave')::date;
        END IF;
      END LOOP;
    END IF;
    RETURN v_r;
  END IF;
END
$mot12$;

ALTER FUNCTION conceptualizador.api_motor(jsonb)          SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0012prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0012prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON conceptualizador.aviso_aprendizaje FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
DO $grp12$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_push') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION conceptualizador.api_push(jsonb) TO conceptualizador_app';
  END IF;
END
$grp12$;
