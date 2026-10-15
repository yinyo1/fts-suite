-- ═══════════════════════════════════════════════════════════════════════════
-- 009_conceptualizador.sql · responder citando (gestos del chat, punto 11 de #4, V1.39).
--
-- Deslizar a la derecha sobre un mensaje lo cita: el mensaje nuevo viaja con
-- `datos.responde_a = <id del mensaje citado>`. `datos` ya va en la firma
-- (shared/chat/chat-firma.js, lista `conceptualizador`, campo json:datos), así
-- que la firma NO cambia. Lo que faltaba es dónde guardarlo:
--   · mensaje.responde_a  bigint, referencia a un mensaje del MISMO caso y
--              anterior al que responde. Si el id no es de ese caso (o no
--              existe, o no es número), se ignora y queda NULL: no truena.
--   · api_suite modo `enviar`  lo guarda desde datos.responde_a. La función de
--              antes se renombra a api_suite_0009prev y la nueva delega todo y
--              solo agrega este paso (mismo patrón que la 0006, 0007 y 0008).
--   · hilo()   cada mensaje trae su `responde_a` (la pantalla y el motor lo
--              leen). La de antes se renombra a hilo_0009prev y la nueva le
--              agrega la llave a cada mensaje, sin copiar su cuerpo.
--
-- ORDEN: funciona aplicada sobre 001–007 y sobre 001–008. Si después se aplica
-- la 0008 encima, la 0008 renombra ESTA api_suite a api_suite_0007 (todavía no
-- existe una con ese nombre) y la suya delega en ella: la cadena queda
-- api_suite(0008) → api_suite_0007 (= esta) → api_suite_0009prev (= la de la
-- 0007). La 0008 no toca hilo(), así que `responde_a` sigue saliendo. Probado
-- en pruebas/sql-0009.sh. No se reaplica la 0009 después de la 0008 (el runner
-- lo impide: YA_APLICADA): esa reaplicación pisaría la api_suite de la 0008.
--
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre, sin
-- llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE conceptualizador.mensaje
  ADD COLUMN IF NOT EXISTS responde_a bigint REFERENCES conceptualizador.mensaje(id) ON DELETE SET NULL;

DO $ren9$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0009prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0009prev;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'hilo_0009prev') THEN
    ALTER FUNCTION conceptualizador.hilo(uuid) RENAME TO hilo_0009prev;
  END IF;
END
$ren9$;

-- ── El id citado vale solo si es un mensaje anterior del mismo caso ────────
CREATE OR REPLACE FUNCTION conceptualizador.responde_a_valido(p_msg bigint, p_datos jsonb) RETURNS bigint
LANGUAGE sql STABLE AS $rva9$
  SELECT o.id
    FROM conceptualizador.mensaje m
    JOIN conceptualizador.mensaje o ON o.caso_id = m.caso_id AND o.id < m.id
   WHERE m.id = p_msg
     AND jsonb_typeof(p_datos) = 'object'
     AND jsonb_typeof(p_datos->'responde_a') IN ('number','string')
     AND char_length(p_datos->>'responde_a') BETWEEN 1 AND 18
     AND (p_datos->>'responde_a') !~ '[^0-9]'
     AND o.id = (p_datos->>'responde_a')::bigint
$rva9$;

-- ── hilo(): cada mensaje con su responde_a ─────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.hilo(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $hilo9$
  SELECT CASE WHEN s.h IS NULL OR jsonb_typeof(s.h->'mensajes') <> 'array' THEN s.h
         ELSE jsonb_set(s.h, ARRAY['mensajes'], coalesce((
           SELECT jsonb_agg(e.x || jsonb_build_object('responde_a', m.responde_a) ORDER BY e.o)
             FROM jsonb_array_elements(s.h->'mensajes') WITH ORDINALITY AS e(x, o)
             LEFT JOIN conceptualizador.mensaje m ON m.id = nullif(e.x->>'id','')::bigint), '[]'::jsonb)) END
    FROM (SELECT conceptualizador.hilo_0009prev(p_caso) AS h) s
$hilo9$;

-- ── api_suite: `enviar` guarda datos.responde_a; lo demás, igual ───────────
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $api9$
DECLARE
  v_r   jsonb;
  v_msg bigint;
  v_ref bigint;
BEGIN
  v_r := conceptualizador.api_suite_0009prev(p);
  IF p->>'modo' = 'enviar' AND coalesce((v_r->>'ok')::boolean, false) THEN
    v_msg := nullif(v_r->>'mensaje_id','')::bigint;
    IF v_msg IS NOT NULL THEN
      v_ref := conceptualizador.responde_a_valido(v_msg, p->'datos');
      -- Un reintento con el mismo cliente_id (ya_estaba) lo completa si la primera vez no llegó; nunca lo cambia.
      IF v_ref IS NOT NULL THEN
        UPDATE conceptualizador.mensaje SET responde_a = v_ref WHERE id = v_msg AND responde_a IS NULL;
      END IF;
      v_r := v_r || jsonb_build_object('responde_a', (SELECT responde_a FROM conceptualizador.mensaje WHERE id = v_msg));
    END IF;
  END IF;
  RETURN v_r;
END
$api9$;

-- ── Permisos ───────────────────────────────────────────────────────────────
-- CREATE OR REPLACE regresa la función a SECURITY INVOKER: se vuelve a marcar.
ALTER FUNCTION conceptualizador.api_suite(jsonb)          SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0009prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0009prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
-- hilo() se queda como estaba (SECURITY INVOKER, con EXECUTE para la app); la de antes también,
-- porque la nueva la llama con los permisos de quien llama.
GRANT EXECUTE ON FUNCTION conceptualizador.hilo(uuid), conceptualizador.hilo_0009prev(uuid),
                          conceptualizador.responde_a_valido(bigint, jsonb) TO conceptualizador_app;
