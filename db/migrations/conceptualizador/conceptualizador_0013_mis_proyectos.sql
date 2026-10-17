-- ═══════════════════════════════════════════════════════════════════════════
-- 013_conceptualizador.sql · V1.51 (#4): «Mis proyectos» por omisión y un «escribiendo…» que no miente (pedido H).
--
-- Qué cambia (nada se borra):
--   · casos_de(p_actor) devuelve además `participa`: true si p_actor es el dueño del caso o escribió al menos un
--     mensaje en él. La lista de la suite abre filtrada en esos («Mis proyectos») y el chip «Todos» muestra el resto.
--     Sin esta migración la pantalla usa el dueño (`autor`) como respaldo: nada se rompe si aún no se aplica.
--   · El resto de casos_de es IDÉNTICO al de la 0005 (copiado por programa, no a mano): mismos campos, mismo orden.
--
--   · Pedido H (16-oct 16:50): en f56c71 el chat decía «escribiendo… · empezando» con el trabajo 181 `tomado` desde
--     las 18:56 UTC y sin avance: la pantalla pintaba cualquier `tomado`, sin tope. Desde la 0013 lo DECIDE LA BASE en
--     cada `hilo` y cada `casos` (los pide la pantalla cada pocos segundos), con `agente_estado(caso)`:
--       escribiendo · trabajo tomado con señal (tomado_at o avance_at) más nueva que lease_segundos (10 min);
--       detenido    · tomado sin señal por más de ese tope: la pantalla dice «se detuvo · reintentar», no «escribiendo»;
--       cola        · solo pendientes (en levantamiento, solo después del disparador): «en la cola», no «escribiendo».
--     Entregado (listo) o con error: nada.
--   · Tecleo de PERSONAS («Montalvo está escribiendo…»): tabla `escribiendo`. La pantalla manda `datos.escribiendo`
--     (true/false, firmado) dentro de la misma petición `hilo` que ya hace cada 2.5 s: SIN modo nuevo y sin tocar n8n.
--     `hilo` devuelve `escriben` (otras personas en los últimos 8 s) y `agente`; `casos` agrega a cada caso los dos.
--     Solo el actor y la hora: nunca el texto.
--   · A (globitos): `casos` agrega `sin_leer` = mensajes del agente después de la última vez que esa persona abrió el
--     caso (push_visto de la 0010, que ya se escribe en cada `hilo`). Verde = sin leer; ámbar = `acciones` (ya existía).
--   · api_suite se envuelve (api_suite_0013prev, como la 0012 con api_motor): primero contesta la de antes, con su
--     candado de actor, ventana y nonce; si salió bien, se agrega lo de arriba.
--
-- Índice: el EXISTS usa mensaje_caso (caso_id, id) de la 0001; con decenas de casos y cientos de mensajes por caso no
-- hace falta otro.
-- Idempotente (CREATE OR REPLACE, IF NOT EXISTS y el renombre solo una vez). Reversa: casos_de de la 0005 y
--   ALTER FUNCTION api_suite_0013prev RENAME TO api_suite (después de borrar la envoltura).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.casos_de(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $casos$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'titulo', c.titulo, 'cliente', c.cliente,
        'pais', c.pais, 'autor', c.autor, 'autor_nombre', c.autor_nombre, 'estado', c.estado, 'demo', c.demo,
        'modo', c.modo, 'disparado_at', c.disparado_at,
        'carpeta', c.carpeta, 'machote_folio', c.machote_folio, 'cierre_motivo', c.cierre_motivo,
        'updated_at', c.updated_at, 'ultima_actividad_at', c.ultima_actividad_at,
        -- V1.31 · archivada = a mano (archivado_at) o por los cierres (estado archivado).
        'archivada', c.archivado_at IS NOT NULL OR c.estado = 'archivado',
        'archivado_at', c.archivado_at, 'archivado_por', c.archivado_por,
        'renombrado_at', c.renombrado_at, 'renombrado_por', c.renombrado_por,
        'fijado', coalesce(f.fijado, false), 'fijado_at', CASE WHEN f.fijado THEN f.cambiado_at END,
        'puede_editar', c.autor = p_actor OR conceptualizador.es_admin(p_actor),
        -- 0013 (V1.51) · «Mis proyectos»: la persona es dueña o escribió en la conversación.
        'participa', c.autor = p_actor OR EXISTS (SELECT 1 FROM conceptualizador.mensaje mp
                       WHERE mp.caso_id = c.id AND mp.rol = 'usuario' AND mp.autor = p_actor),
        'ultimo', (SELECT jsonb_build_object('rol', m.rol, 'texto', left(m.texto, 120),
                     'adjuntos', jsonb_array_length(m.adjuntos), 'created_at', m.created_at)
                   FROM conceptualizador.mensaje m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1),
        'acciones', (SELECT count(*) FROM conceptualizador.accion a3 WHERE a3.caso_id = c.id AND a3.estado = 'propuesta'),
        'pendientes', (SELECT count(*) FROM conceptualizador.trabajo t
                       WHERE t.caso_id = c.id AND t.estado IN ('pendiente','tomado')))
        ORDER BY coalesce(f.fijado, false) DESC, CASE WHEN f.fijado THEN f.cambiado_at END DESC NULLS LAST, c.ultima_actividad_at DESC), '[]'::jsonb)
    FROM conceptualizador.caso c
    LEFT JOIN conceptualizador.fijado f ON f.caso_id = c.id AND f.actor = p_actor
$casos$;

-- ── Pedido H · quién escribe y qué hace el agente, decidido aquí ─────────────
CREATE TABLE IF NOT EXISTS conceptualizador.escribiendo (
  actor    text        NOT NULL,
  caso_id  uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor, caso_id)
);

CREATE OR REPLACE FUNCTION conceptualizador.agente_estado(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ag13$
  WITH c AS (SELECT * FROM conceptualizador.caso WHERE id = p_caso),
  t AS (SELECT t.*, greatest(t.tomado_at, coalesce(t.avance_at, t.tomado_at)) AS senal
          FROM conceptualizador.trabajo t, c
         WHERE t.caso_id = p_caso AND t.lote_de IS NULL AND t.estado IN ('pendiente','tomado')
           AND (t.estado = 'tomado' OR NOT (c.modo = 'levantamiento' AND c.disparado_at IS NULL))),
  vivo AS (SELECT * FROM t WHERE estado = 'tomado' AND senal > now() - make_interval(secs => conceptualizador.cfg('lease_segundos'))
            ORDER BY senal DESC LIMIT 1),
  muerto AS (SELECT * FROM t WHERE estado = 'tomado' AND senal <= now() - make_interval(secs => conceptualizador.cfg('lease_segundos'))
              ORDER BY senal DESC LIMIT 1),
  cola AS (SELECT * FROM t WHERE estado = 'pendiente' ORDER BY created_at LIMIT 1)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM vivo) THEN (SELECT jsonb_build_object('estado', 'escribiendo', 'trabajo_id', id, 'paso', avance, 'desde', tomado_at, 'senal', senal) FROM vivo)
    WHEN EXISTS (SELECT 1 FROM muerto) THEN (SELECT jsonb_build_object('estado', 'detenido', 'trabajo_id', id, 'desde', tomado_at, 'senal', senal,
                                            'tope_min', round(conceptualizador.cfg('lease_segundos') / 60.0)) FROM muerto)
    WHEN EXISTS (SELECT 1 FROM cola) THEN (SELECT jsonb_build_object('estado', 'cola', 'trabajo_id', id, 'desde', created_at) FROM cola)
    ELSE NULL END
$ag13$;

CREATE OR REPLACE FUNCTION conceptualizador.escriben_en(p_caso uuid, p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $esc13$
  SELECT coalesce(jsonb_agg(jsonb_build_object('actor', e.actor, 'at', e.at) ORDER BY e.at DESC), '[]'::jsonb)
    FROM conceptualizador.escribiendo e
   WHERE e.caso_id = p_caso AND e.actor <> coalesce(p_actor, '') AND e.at > now() - interval '8 seconds'
$esc13$;

DO $ren13$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0013prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0013prev;
  END IF;
END
$ren13$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui13$
DECLARE
  v_r     jsonb := conceptualizador.api_suite_0013prev(p);   -- actor, ventana, nonce y todo lo demás: igual que antes
  v_modo  text  := p->>'modo';
  v_actor text  := nullif(btrim(p->>'actor'), '');
  v_caso  uuid;
  v_esc   text  := p->'datos'->>'escribiendo';
BEGIN
  IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
  IF v_modo = 'hilo' THEN
    BEGIN v_caso := nullif(p->>'caso_id', '')::uuid; EXCEPTION WHEN others THEN v_caso := NULL; END;
    IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN RETURN v_r; END IF;
    IF v_esc = 'true' THEN
      INSERT INTO conceptualizador.escribiendo (actor, caso_id, at) VALUES (v_actor, v_caso, now())
        ON CONFLICT (actor, caso_id) DO UPDATE SET at = excluded.at;
    ELSIF v_esc = 'false' THEN
      DELETE FROM conceptualizador.escribiendo WHERE actor = v_actor AND caso_id = v_caso;
    END IF;
    RETURN v_r || jsonb_build_object('agente', conceptualizador.agente_estado(v_caso), 'escriben', conceptualizador.escriben_en(v_caso, v_actor));
  ELSIF v_modo = 'casos' AND jsonb_typeof(v_r->'casos') = 'array' THEN
    RETURN jsonb_set(v_r, '{casos}', (SELECT coalesce(jsonb_agg(x || jsonb_build_object(
             'agente', conceptualizador.agente_estado((x->>'id')::uuid),
             'escriben', conceptualizador.escriben_en((x->>'id')::uuid, v_actor),
             -- A · globito verde: mensajes del agente después de la última vez que ESTA persona abrió el caso (push_visto, 0010).
             'sin_leer', (SELECT count(*) FROM conceptualizador.mensaje m WHERE m.caso_id = (x->>'id')::uuid AND m.rol = 'motor'
                            AND m.created_at > coalesce((SELECT pv.visto_at FROM conceptualizador.push_visto pv
                                                          WHERE pv.actor = v_actor AND pv.caso_id = (x->>'id')::uuid), '-infinity'::timestamptz)))
           ORDER BY o), '[]'::jsonb)
           FROM jsonb_array_elements(v_r->'casos') WITH ORDINALITY AS a(x, o)));
  END IF;
  RETURN v_r;
END
$sui13$;

ALTER FUNCTION conceptualizador.api_suite(jsonb)           SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0013prev(jsonb)  SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0013prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0013prev(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
