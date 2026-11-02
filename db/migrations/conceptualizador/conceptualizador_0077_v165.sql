-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0077 · V1.65 (fts-conceptualizador#20 parte 14, punto 1, Esteban 1-nov-2026 noche) · PRIMER MACHOTE POR EL MOTOR
--
-- Detrás de `machote_motor_v165` (apagado; se lee caso → dueño del caso → global, prendido_caso de la 0071). Diseño: #20 6565223533.
--   · api_motor `hilo_caso` trae `hilo.caso.machote_vigente` (versión, total, moneda, autor, fecha; SIN el documento), igual que `tomar`
--     desde la 0032. El motor lo usa para RELEER el machote que acaba de guardar y decir en el chat solo lo que está en la base.
-- Apagado: hilo_caso devuelve exactamente lo de antes.
-- ORDEN: 0076 → 0077. Aditiva e idempotente. Reversa: reversas/077_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
DO $ren77m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0077prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0077prev;
  END IF;
END
$ren77m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot77$
DECLARE
  v_r  jsonb;
  v_m  jsonb;
  v_id uuid;
BEGIN
  v_r := conceptualizador.api_motor_0077prev(p);
  IF p->>'modo' = 'hilo_caso' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'hilo'->'caso') = 'object'
     AND coalesce(v_r->'hilo'->'caso'->>'machote_id', '') <> '' THEN
    v_id := conceptualizador.a_uuid(v_r->'hilo'->'caso'->>'id');
    IF v_id IS NOT NULL AND conceptualizador.prendido_caso('machote_motor_v165', v_id) THEN
      v_m := conceptualizador.vigente_de(conceptualizador.a_uuid(v_r->'hilo'->'caso'->>'machote_id'));
      IF v_m IS NOT NULL THEN v_r := jsonb_set(v_r, ARRAY['hilo','caso','machote_vigente'], v_m - 'documento'); END IF;
    END IF;
  END IF;
  RETURN v_r;
END
$mot77$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0077prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0077prev(jsonb) FROM PUBLIC;
DO $gr77$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_motor_0077prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$gr77$;
