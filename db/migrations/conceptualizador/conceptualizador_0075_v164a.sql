-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0075 · V1.64a parte 13 (fts-conceptualizador#20 punto 2, Esteban 1-nov-2026 noche) · CANDADO DE AUTOR
--
-- Seguridad, SIN interruptor (decisión de Esteban: «no depende de compartir_caso_v165: va prendido porque es seguridad»).
-- Hasta la 0074 los modos que escriben en un caso (enviar, subir, evento, accion…) no revisaban que el actor fuera del caso: la 0066
-- solo cubría `casos` y `hilo`. Desde aquí api_suite contesta NO_AUTORIZADO, sin tocar nada, si el actor no puede escribir en el caso.
--
-- Puede escribir (conceptualizador.puede_escribir_caso):
--   · el autor del caso;
--   · el admin (es_admin: Esteban);
--   · quien el autor autorizó (puede_mover, delegación V1.59, la misma regla de la 0032 para la oportunidad);
--   · quien YA había escrito en ese caso antes del 2026-11-02 (mensaje de persona, evento, acción hecha o adjunto). Medido en producción
--     el 2-nov 01:57 UTC (TMP 1ySFNNOHikZW4OKw, ejec. 1103715 y 1103736): en 30 días la única escritura de una persona no admin en un caso
--     ajeno es francisco.montalvo en 21fec6ca (Quimitec, de Esteban), evento 739 y acción 497 del 26-oct. Sin esta cláusula se le
--     cerraría a media colaboración; con ella no se le cierra a nadie que ya trabajaba. La fecha es fija: nadie entra por esta vía después.
--   · (la 0076 agrega el caso compartido con nivel «edicion», detrás de compartir_caso_v165)
-- El motor, el robot y el agente NO pasan por api_suite (escriben con api_motor y las funciones del robot): no los toca.
-- Modos con candado: enviar, subir, evento, accion, palomeada_lista, prueba, empresa, ciudad, que_falta, recordar, caso_arranque,
-- historia. renombrar/archivar/desarchivar ya lo tenían (0005); fijar/desfijar son por persona; los demás no reciben un caso.
-- ORDEN: 0074 → 0075. Aditiva e idempotente. Reversa: reversas/075_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.participo_antes_0075(p_actor text, p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $pa75$
  SELECT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.caso_id = p_caso AND m.rol = 'usuario' AND m.autor = p_actor
                   AND m.created_at < '2026-11-02T00:00:00Z'::timestamptz)
      OR EXISTS (SELECT 1 FROM conceptualizador.evento e WHERE e.caso_id = p_caso AND e.autor = p_actor
                   AND e.created_at < '2026-11-02T00:00:00Z'::timestamptz)
      OR EXISTS (SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = p_caso AND a.hecha_por = p_actor
                   AND a.hecha_at < '2026-11-02T00:00:00Z'::timestamptz)
      OR EXISTS (SELECT 1 FROM conceptualizador.adjunto j WHERE j.caso_id = p_caso AND j.autor = p_actor
                   AND j.created_at < '2026-11-02T00:00:00Z'::timestamptz)
$pa75$;
ALTER FUNCTION conceptualizador.participo_antes_0075(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.participo_antes_0075(text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.puede_escribir_caso(p_actor text, p_caso uuid) RETURNS boolean
LANGUAGE plpgsql STABLE AS $pe75$
DECLARE v_autor text;
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN RETURN false; END IF;
  SELECT c.autor INTO v_autor FROM conceptualizador.caso c WHERE c.id = p_caso;
  IF v_autor IS NULL THEN RETURN true; END IF;  -- caso inexistente: lo contesta la función de abajo (CASO_NO_EXISTE)
  RETURN v_autor = p_actor OR conceptualizador.es_admin(p_actor) OR conceptualizador.puede_mover(p_actor, v_autor)
      OR conceptualizador.participo_antes_0075(p_actor, p_caso);
END
$pe75$;
ALTER FUNCTION conceptualizador.puede_escribir_caso(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.puede_escribir_caso(text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.modos_escritura_caso() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $me75$
  SELECT ARRAY['enviar','subir','evento','accion','palomeada_lista','prueba','empresa','ciudad','que_falta','recordar',
               'caso_arranque','historia']
$me75$;

DO $ren75s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0075prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0075prev;
  END IF;
END
$ren75s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui75$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_caso  uuid;
BEGIN
  IF v_actor IS NOT NULL AND (p->>'modo') = ANY (conceptualizador.modos_escritura_caso()) THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND NOT conceptualizador.puede_escribir_caso(v_actor, v_caso) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Este caso no es tuyo: pídele al dueño que te lo comparta.');
    END IF;
  END IF;
  RETURN conceptualizador.api_suite_0075prev(p);
END
$sui75$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0075prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0075prev(jsonb) FROM PUBLIC;
DO $gr75$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0075prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr75$;
