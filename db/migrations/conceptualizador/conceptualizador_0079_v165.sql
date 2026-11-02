-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0079 · V1.65 (fts-conceptualizador#20 parte 14, punto 4) · COMPARTIR: lo que necesita la pantalla
--
-- Detrás de `compartir_caso_v165` (apagado; caso → dueño → global, prendido_caso de la 0071). La 0076 dejó los modos `compartir` y
-- `dejar_de_compartir`, pero el dueño no tenía cómo ver con quién compartió ni a quién elegir. Aquí, solo lectura:
--   · `hilo` del dueño (o del admin) trae `compartir`: {compartidos: [{para, nivel, otorgado_por, otorgado_at}] (lo vivo), equipo: [usuarios]}.
--     `equipo` = quienes han tenido casos en los últimos 180 días o ya recibieron un caso compartido, sin el dueño. Para un usuario de
--     prueba (zz.*) solo usuarios de prueba (más zz.prueba2, el segundo usuario del banco); para uno real, nunca zz.* ni canario.
--   · A quien recibió el caso no le llega `compartir` (solo el `compartido` de la 0076).
-- Apagado: `hilo` idéntico. No escribe nada.
-- ORDEN: 0078 → 0079. Aditiva e idempotente. Reversa: reversas/079_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
DO $ren79$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0079prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0079prev;
  END IF;
END
$ren79$;

CREATE OR REPLACE FUNCTION conceptualizador.compartir_de(p_actor text, p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $cd79$
  WITH k AS (SELECT c.id, c.autor FROM conceptualizador.caso c WHERE c.id = p_caso),
  gente AS (SELECT DISTINCT x.u FROM (
              SELECT c.autor AS u FROM conceptualizador.caso c WHERE c.created_at > now() - interval '180 days'
              UNION SELECT s.para FROM conceptualizador.caso_compartido s
              UNION SELECT 'zz.prueba2') x, k
             WHERE x.u <> k.autor AND x.u ~ '^[a-z0-9._-]{3,60}\Z'
               AND CASE WHEN p_actor LIKE 'zz.%' THEN x.u LIKE 'zz.%' ELSE x.u NOT LIKE 'zz.%' AND x.u NOT LIKE 'canario%' END)
  SELECT jsonb_build_object(
    'compartidos', coalesce((SELECT jsonb_agg(jsonb_build_object('para', s.para, 'nivel', s.nivel, 'otorgado_por', s.otorgado_por, 'otorgado_at', s.otorgado_at)
                               ORDER BY s.otorgado_at) FROM conceptualizador.caso_compartido s WHERE s.caso_id = p_caso AND s.recogido_at IS NULL), '[]'::jsonb),
    'equipo', coalesce((SELECT jsonb_agg(u ORDER BY u) FROM gente), '[]'::jsonb))
$cd79$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui79$
DECLARE
  v_r     jsonb;
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_caso  uuid;
  v_autor text;
BEGIN
  v_r := conceptualizador.api_suite_0079prev(p);
  IF p->>'modo' = 'hilo' AND v_actor IS NOT NULL AND coalesce((v_r->>'ok')::boolean, false) AND NOT (v_r ? 'compartido') THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    SELECT c.autor INTO v_autor FROM conceptualizador.caso c WHERE c.id = v_caso;
    IF v_autor IS NOT NULL AND conceptualizador.prendido_caso('compartir_caso_v165', v_caso)
       AND (v_autor = v_actor OR conceptualizador.es_admin(v_actor)) THEN
      v_r := v_r || jsonb_build_object('compartir', conceptualizador.compartir_de(v_actor, v_caso));
    END IF;
  END IF;
  RETURN v_r;
END
$sui79$;
ALTER FUNCTION conceptualizador.compartir_de(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0079prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.compartir_de(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0079prev(jsonb) FROM PUBLIC;
DO $gr79$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0079prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr79$;
