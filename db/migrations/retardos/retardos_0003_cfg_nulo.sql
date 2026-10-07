-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0003 · cfg_txt devuelve NULL para un valor JSON nulo (#334)
--
-- Medido el 28-sep-2026 en la primera corrida de retardos/enviar: con
-- buzon_receptor = null, cfg_txt devolvía el TEXTO 'null' y el coalesce que
-- debía caer al remitente no caía. Graph rechazó los 4 correos con
-- ErrorParticipantDoesntHaveAnEmailAddress (reply-to 'null'). Los correos
-- quedaron 'fallido' y se reintentan solos: nada se perdió.
-- Sin llaves dobles ni patrones de reemplazo de JS (retardos_0001 reglas 7 y 8).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION retardos.cfg_txt(p_clave text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE jsonb_typeof(valor)
           WHEN 'null'   THEN NULL
           WHEN 'string' THEN valor #>> '{}'
           ELSE valor::text END
  FROM retardos.config WHERE clave = p_clave
$fn$;
GRANT EXECUTE ON FUNCTION retardos.cfg_txt(text) TO retardos_app;
