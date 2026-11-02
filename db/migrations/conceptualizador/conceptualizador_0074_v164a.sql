-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0074 · V1.64a parte 13 (fts-conceptualizador#20 punto 1, Esteban 1-nov-2026 noche) · MÉTRICAS: PRIMER MACHOTE Y ALARMA
--
-- Solo lectura, igual que la 0072. Dos cosas:
--   · metricas_caso (envoltura de la 0072, version_metricas 2): agrega `primer_machote` con su fuente, que el machote por el motor
--     (machote_motor_v165, punto 7) necesita para medirse:
--       primer_machote.at              min(comercial.machote_version.creada_at) del machote del caso
--       primer_machote.version_autor   autor de esa versión (persona o 'motor')
--       primer_machote.hecha_por       hecha_por de la primera accion crear_machote hecha (la persona, 'motor-avance' = robot, 'motor')
--       primer_machote.minutos         de la primera nota a la v1
--       primer_machote.toques_antes    mensajes de la persona + clics (evento sin motor + rayito_clic) ANTES de la v1
--     Lo demás de la 0072 sale idéntico.
--   · alarmas_motor (envoltura de la 0061): con metricas_caso_v164 prendido (global, persona o caso), `metricas_caso_falla` cuando
--     metricas_caso de un caso con actividad de la persona en las últimas 24 h truena o no contesta (regla de construcción 1: la
--     sección «Métricas del caso» dejaría de aparecer en silencio). Apagado: alarmas_motor devuelve lo mismo que la 0061.
-- ORDEN: 0073 → 0074. Aditiva e idempotente. Reversa: reversas/074_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
DO $ren74m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'metricas_caso_0074prev') THEN
    ALTER FUNCTION conceptualizador.metricas_caso(uuid) RENAME TO metricas_caso_0074prev;
  END IF;
END
$ren74m$;

CREATE OR REPLACE FUNCTION conceptualizador.metricas_primer_machote(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $pm74$
WITH k AS (SELECT * FROM conceptualizador.caso WHERE id = p_caso),
v1 AS (SELECT v.creada_at AS at, v.autor, v.version FROM comercial.machote_version v JOIN k ON v.machote_id = k.machote_id
        ORDER BY v.creada_at, v.version LIMIT 1),
pn AS (SELECT min(m.created_at) AS at FROM conceptualizador.mensaje m WHERE m.caso_id = p_caso AND m.rol = 'usuario'),
cm AS (SELECT a.hecha_por FROM conceptualizador.accion a WHERE a.caso_id = p_caso AND a.tipo = 'crear_machote' AND a.estado = 'hecha'
        ORDER BY a.hecha_at NULLS LAST, a.id LIMIT 1)
SELECT jsonb_build_object(
  'at', (SELECT at FROM v1),
  'version', (SELECT version FROM v1),
  'version_autor', (SELECT autor FROM v1),
  'hecha_por', (SELECT hecha_por FROM cm),
  'minutos', round(extract(epoch FROM ((SELECT at FROM v1) - (SELECT at FROM pn))) / 60.0, 1),
  'toques_antes', CASE WHEN (SELECT at FROM v1) IS NULL THEN NULL ELSE
       (SELECT count(*) FROM conceptualizador.mensaje m WHERE m.caso_id = p_caso AND m.rol = 'usuario' AND m.created_at < (SELECT at FROM v1))
     + (SELECT count(*) FROM conceptualizador.evento e WHERE e.caso_id = p_caso AND coalesce(e.autor, '') !~ '^motor' AND e.created_at < (SELECT at FROM v1))
     + (SELECT count(*) FROM conceptualizador.rayito_clic r WHERE r.caso_id = p_caso AND coalesce(r.actor, '') !~ '^motor' AND r.at < (SELECT at FROM v1)) END,
  'fuente', 'comercial.machote_version.creada_at (la primera) · accion crear_machote hecha_por · mensaje rol usuario + evento sin motor + rayito_clic antes de la v1')
$pm74$;
ALTER FUNCTION conceptualizador.metricas_primer_machote(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.metricas_primer_machote(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.metricas_caso(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $mc74$
  SELECT CASE WHEN s.m IS NULL THEN NULL
         ELSE s.m || jsonb_build_object('version_metricas', 2, 'primer_machote', conceptualizador.metricas_primer_machote(p_caso)) END
    FROM (SELECT conceptualizador.metricas_caso_0074prev(p_caso) AS m) s
$mc74$;
ALTER FUNCTION conceptualizador.metricas_caso(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.metricas_caso_0074prev(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.metricas_caso(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.metricas_caso_0074prev(uuid) FROM PUBLIC;

-- ── La alarma: metricas_caso dejó de contestar ──
DO $ren74a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0074prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0074prev;
  END IF;
END
$ren74a$;

CREATE OR REPLACE FUNCTION conceptualizador.metricas_alarmas(p_ahora timestamptz DEFAULT now())
RETURNS TABLE (caso_id uuid, titulo text, dueno text, desde timestamptz, error text)
LANGUAGE plpgsql STABLE AS $ma74$
DECLARE
  f   record;
  v_m jsonb;
BEGIN
  FOR f IN SELECT k.id, k.titulo, k.autor, max(m.created_at) AS ult
             FROM conceptualizador.caso k JOIN conceptualizador.mensaje m ON m.caso_id = k.id AND m.rol = 'usuario'
            WHERE NOT k.demo AND k.archivado_at IS NULL AND m.created_at > p_ahora - interval '24 hours' AND m.created_at <= p_ahora
            GROUP BY k.id, k.titulo, k.autor LOOP
    IF NOT conceptualizador.prendido_caso('metricas_caso_v164', f.id) THEN CONTINUE; END IF;
    BEGIN
      v_m := conceptualizador.metricas_caso(f.id);
      IF v_m IS NULL OR NOT (v_m ? 'toques') OR NOT (v_m ? 'primer_machote') THEN
        caso_id := f.id; titulo := f.titulo; dueno := f.autor; desde := f.ult; error := 'SIN_RESPUESTA'; RETURN NEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      caso_id := f.id; titulo := f.titulo; dueno := f.autor; desde := f.ult; error := left(SQLSTATE || ' ' || SQLERRM, 200); RETURN NEXT;
    END;
  END LOOP;
END
$ma74$;
ALTER FUNCTION conceptualizador.metricas_alarmas(timestamptz) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.metricas_alarmas(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am74$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0074prev(p_llave);
  v_ahora timestamptz;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' THEN RETURN v_r; END IF;
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  FOR f IN SELECT * FROM conceptualizador.metricas_alarmas(v_ahora) LOOP
    v_r := v_r || conceptualizador.alarma('metricas_caso_falla', f.caso_id::text, f.desde,
      'En el caso «' || left(f.titulo, 60) || '» (' || f.dueno || ') las métricas del caso no contestan (' || f.error ||
        '): la sección «Métricas del caso» de la vista interna dejó de salir.',
      'Corre por TMP de lectura SELECT conceptualizador.metricas_caso(<caso>) y lee el error. Si es de la base, la reversa es reversas/074_reversa.sql; mientras, apaga metricas_caso_v164.',
      'metricas-caso-falla', jsonb_build_object('caso_id', f.caso_id, 'error', f.error));
  END LOOP;
  RETURN v_r;
END
$am74$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0074prev(text) FROM PUBLIC;

DO $gr74$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.metricas_caso(uuid), conceptualizador.metricas_caso_0074prev(uuid),
                              conceptualizador.metricas_primer_machote(uuid) TO conceptualizador_app;
  END IF;
END
$gr74$;
