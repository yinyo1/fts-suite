-- ═══════════════════════════════════════════════════════════════════════════
-- 004_conceptualizador.sql · respuesta corta primero, lo pesado después.
-- MVP rector #4 de fts-conceptualizador (después de la Fase 12).
--
-- Sobre la 001, la 002 y la 003 (no se editan):
--   · evento.tipo      + 'continuacion'.
--   · Cuando el motor entrega una respuesta corta y deja trabajo pesado para
--     después (buscar en Odoo, armar conceptos, BOM, precios, viajes), manda
--     `verifica.sigue` = qué le falta hacer. Un disparador sobre `respuesta`
--     encola en ese momento un evento `continuacion` para el MISMO caso: el
--     candado por caso (0003) hace que corra en cuanto se libera, y lo pesado
--     llega como la respuesta siguiente. No cambia `api_motor` ni n8n.
--   · Una continuación no puede pedir otra (no hay cadenas): si trae `sigue`,
--     no se encola nada. Además procesa.js solo deja mandar `sigue` en la
--     respuesta a un mensaje.
--
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE conceptualizador.evento DROP CONSTRAINT IF EXISTS evento_tipo_check;
ALTER TABLE conceptualizador.evento ADD CONSTRAINT evento_tipo_check
  CHECK (tipo IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra','accion','ejecucion','continuacion'));

CREATE OR REPLACE FUNCTION conceptualizador.encolar_continuacion() RETURNS trigger
LANGUAGE plpgsql AS $cont$
DECLARE v_que text; v_es_cont boolean;
BEGIN
  v_que := left(btrim(coalesce(NEW.verifica->>'sigue', '')), 500);
  IF v_que = '' THEN RETURN NEW; END IF;
  SELECT coalesce(e.tipo = 'continuacion', false) INTO v_es_cont
    FROM conceptualizador.trabajo t LEFT JOIN conceptualizador.evento e ON e.id = t.evento_id
   WHERE t.id = NEW.trabajo_id;
  IF coalesce(v_es_cont, false) THEN RETURN NEW; END IF;
  PERFORM conceptualizador.encolar_evento(NEW.caso_id, 'continuacion', NULL, v_que,
    jsonb_build_object('de_trabajo', NEW.trabajo_id, 'que', v_que), 'motor-' || NEW.motor);
  RETURN NEW;
END
$cont$;

DROP TRIGGER IF EXISTS respuesta_continuacion ON conceptualizador.respuesta;
CREATE TRIGGER respuesta_continuacion AFTER INSERT ON conceptualizador.respuesta
  FOR EACH ROW EXECUTE FUNCTION conceptualizador.encolar_continuacion();

-- ── Permisos ───────────────────────────────────────────────────────────────
-- La función del disparador corre dentro de `api_motor` (SECURITY DEFINER);
-- nadie la llama directo.
REVOKE ALL ON FUNCTION conceptualizador.encolar_continuacion() FROM PUBLIC;
