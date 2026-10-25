-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0042 · V1.63e (#12, agregado de Esteban del 25-oct-2026 11:41 CST): la D58 queda SUPERADA
--
-- La D58 (14-oct, Fase 9) decía: en modo `levantamiento`, antes del disparador no se encola trabajo y el acuse pide tocar
-- «Ya es todo». Con `analisis_v163e` prendido ya no se espera el disparador: el robot arranca el análisis en la primera pausa
-- (10 min, libro de reglas D-levantamiento-avanza) y lo rehace con lo que siga llegando. La base sigue sin encolar un trabajo por
-- cada mensaje (lo lee la pasada del robot), pero el acuse ya no puede decirle a la persona que el análisis espera su botón.
--
-- Qué cambia: `acuse` (db/003) queda envuelta. Con `analisis_v163e` prendido, en un levantamiento sin disparar, el acuse dice que el
-- análisis arranca solo en cuanto deje de mandar. Apagado, sale exactamente el texto de antes (la _0042prev).
-- No hay interruptor nuevo. Reversa: reversas/042_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

DO $ren42$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'acuse_0042prev') THEN
    ALTER FUNCTION conceptualizador.acuse(jsonb, text, boolean, boolean, boolean) RENAME TO acuse_0042prev;
  END IF;
END
$ren42$;

CREATE OR REPLACE FUNCTION conceptualizador.acuse(p_meta jsonb, p_modo text, p_ya_disparado boolean,
  p_disparo boolean, p_cierre boolean) RETURNS text
LANGUAGE plpgsql STABLE AS $acu42$
DECLARE
  v_r text := conceptualizador.acuse_0042prev(p_meta, p_modo, p_ya_disparado, p_disparo, p_cierre);
BEGIN
  IF p_modo = 'levantamiento' AND NOT coalesce(p_ya_disparado, false) AND NOT coalesce(p_disparo, false) AND NOT coalesce(p_cierre, false)
     AND conceptualizador.prendido('analisis_v163e') AND v_r IS NOT NULL THEN
    RETURN regexp_replace(v_r, ' Sigue mandando; cuando acabes toca «Ya es todo»[.]',
      ' Sigue mandando. En cuanto dejes de mandar unos minutos empiezo a armarlo; lo que llegue después entra en la siguiente vuelta.');
  END IF;
  RETURN v_r;
END
$acu42$;
ALTER FUNCTION conceptualizador.acuse(jsonb, text, boolean, boolean, boolean) SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.acuse_0042prev(jsonb, text, boolean, boolean, boolean) FROM PUBLIC;
DO $gr42$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.acuse(jsonb, text, boolean, boolean, boolean) TO conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.acuse_0042prev(jsonb, text, boolean, boolean, boolean) TO conceptualizador_app;
  END IF;
END
$gr42$;
