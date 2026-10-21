-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0026 (V1.57a, #12) · solo si hace falta. Se copia a db/migrations/conceptualizador/ con el
-- SIGUIENTE número libre y se corre con el runner (ensayo primero). Devuelve encolar_alarmas a la 0024 (copiada tal cual),
-- latido_sesion_anotar a la 0023 (copiada tal cual) y api_motor a la 0025 (el latido de prueba vuelve a escribir). Deja la
-- tabla alarma_incidente y la clave alarma_cierre_min (no estorban). Antes de esto basta con apagar alarmas_v157.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv26$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0026prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0026prev(jsonb) RENAME TO api_motor;
  END IF;
END
$rv26$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

/** Encola las alarmas nuevas (una por incidente) para el correo inmediato. Solo con alarmas_v157. */
CREATE OR REPLACE FUNCTION conceptualizador.encolar_alarmas(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql AS $rv26e$
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
$rv26e$;

/** Una fila por sesión que late (siempre, con el interruptor apagado también). */
CREATE OR REPLACE FUNCTION conceptualizador.latido_sesion_anotar(p jsonb, p_dueno boolean) RETURNS void
LANGUAGE plpgsql AS $rv26l$
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
$rv26l$;
REVOKE ALL ON FUNCTION conceptualizador.encolar_alarmas(text), conceptualizador.latido_sesion_anotar(jsonb, boolean) FROM PUBLIC;
