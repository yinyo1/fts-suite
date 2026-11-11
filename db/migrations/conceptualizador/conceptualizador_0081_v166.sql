-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0081 · V1.66 (fts-conceptualizador#20, Esteban 10-nov-2026) · SUPERVISOR COMERCIAL EN EL CHAT y LIGA MACHOTE · CHAT
--
-- Dos interruptores NUEVOS, los dos APAGADOS (sin renglón = apagado):
--
--   supervisor_caso_v166 (prendido_para: caso, persona, global)
--     El supervisor comercial (perfil Supervisor comercial: scope comercial:supervisor del TOKEN, el mismo que usa
--     comercial/machote-guardar) puede leer y escribir el chat de CUALQUIER caso. La bandera la pone conceptualizador/suite en
--     `p.supervisor` (campo de arriba, nunca de `datos`) a partir del token verificado; aquí se copia a una variable local de la
--     transacción con el nombre del actor, y puede_escribir_caso solo la acepta si coincide con el actor que pregunta.
--     No le da nada más: renombrar, archivar, fijar y compartir siguen siendo del dueño o del admin. Nada con nombres de personas.
--
--   liga_machote_v166 (prendido_caso: caso, dueño del caso, global)
--     Un machote y su chat van juntos (el caso guarda su machote en caso.machote_id). Todo se CALCULA en un solo lugar
--     (nivel_por_machote y machote_por_chat): no se copia ningún permiso, así que quitar uno quita el otro sin sincronizar nada.
--       · machote PRESTADO a alguien (machote_prestamo vivo)  → su chat en LECTURA;
--       · machote CEDIDO a alguien (es el dueño del machote y no el autor del caso) → su chat en EDICIÓN;
--       · se recoge o vence el préstamo, o el machote se cede a otro  → el chat desaparece solo;
--       · al revés: el chat compartido en EDICIÓN (caso_compartido) deja escribir su machote (comercial/machote-guardar llama a
--         machote_por_chat). En LECTURA no hace falta: el machote ya se lee en el módulo comercial.
--     Un caso sin machote o un machote sin caso no falla: liga_de y liga_de_machote lo dicen (sin_machote / sin_caso).
--
--   Además, para quien recibe: la lista de casos trae lo compartido por chat, por machote o por supervisión, marcado
--   `compartido` (nivel), `via` (chat · machote · supervisor), `puede_editar` y `de` (el dueño), aunque casos_propios_v164 filtre.
--
-- Apagados: las respuestas son las de la 0080 tal cual.
-- ORDEN: 0080 → 0081. Aditiva e idempotente. Reversa: reversas/081_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── la liga, en un solo lugar ────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.liga_de(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ld81$
  SELECT CASE
    WHEN k.id IS NULL THEN jsonb_build_object('caso_id', p_caso, 'estado', 'caso_no_existe')
    WHEN k.machote_id IS NULL THEN jsonb_build_object('caso_id', k.id, 'autor_caso', k.autor, 'estado', 'sin_machote',
      'mensaje', 'Este caso todavía no tiene machote: lo que se comparta aquí es solo el chat.')
    WHEN m.id IS NULL OR m.deleted_at IS NOT NULL THEN jsonb_build_object('caso_id', k.id, 'autor_caso', k.autor, 'machote_id', k.machote_id,
      'estado', 'machote_borrado', 'mensaje', 'El machote de este caso ya no existe: lo que se comparta aquí es solo el chat.')
    ELSE jsonb_build_object('caso_id', k.id, 'autor_caso', k.autor, 'machote_id', m.id, 'folio', m.folio_txt, 'machote_dueno', m.dueno,
      'estado', 'ligado') END
  FROM (SELECT p_caso AS id) z
  LEFT JOIN conceptualizador.caso k ON k.id = z.id
  LEFT JOIN comercial.machote m ON m.id = k.machote_id
$ld81$;

CREATE OR REPLACE FUNCTION conceptualizador.liga_de_machote(p_machote uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $lm81$
  SELECT CASE
    WHEN m.id IS NULL THEN jsonb_build_object('machote_id', p_machote, 'estado', 'machote_no_existe')
    WHEN k.id IS NULL THEN jsonb_build_object('machote_id', m.id, 'folio', m.folio_txt, 'estado', 'sin_caso',
      'mensaje', 'Este machote no nació de un caso del conceptualizador: lo que se comparta es solo el machote.')
    ELSE jsonb_build_object('machote_id', m.id, 'folio', m.folio_txt, 'caso_id', k.id, 'autor_caso', k.autor, 'estado', 'ligado') END
  FROM (SELECT p_machote AS id) z
  LEFT JOIN comercial.machote m ON m.id = z.id
  LEFT JOIN LATERAL (SELECT c.id, c.autor FROM conceptualizador.caso c WHERE c.machote_id = m.id ORDER BY c.created_at DESC LIMIT 1) k ON true
$lm81$;

-- Nivel del chat que da el MACHOTE: cedido (dueño del machote que no es el autor del caso) = edicion; prestado vivo = lectura.
CREATE OR REPLACE FUNCTION conceptualizador.nivel_por_machote(p_actor text, p_caso uuid) RETURNS text
LANGUAGE sql STABLE AS $nm81$
  SELECT CASE WHEN p_actor IS NULL OR p_caso IS NULL OR NOT conceptualizador.prendido_caso('liga_machote_v166', p_caso) THEN NULL
    ELSE (SELECT CASE WHEN m.dueno = p_actor AND k.autor IS DISTINCT FROM p_actor THEN 'edicion'
                      WHEN EXISTS (SELECT 1 FROM comercial.machote_prestamo pr
                                    WHERE pr.machote_id = m.id AND pr.para = p_actor AND pr.revocado_at IS NULL AND pr.vence_at > now()) THEN 'lectura' END
            FROM conceptualizador.caso k JOIN comercial.machote m ON m.id = k.machote_id AND m.deleted_at IS NULL
           WHERE k.id = p_caso) END
$nm81$;

-- ── compartido_nivel: lo compartido por chat (0076) MÁS lo que da el machote. Es la función que ya leen el hilo, la lista y el
--    candado de escritura de la 0076, así que con esto el resto se acomoda solo. ──
DO $ren81c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'compartido_nivel_0081prev') THEN
    ALTER FUNCTION conceptualizador.compartido_nivel(text, uuid) RENAME TO compartido_nivel_0081prev;
  END IF;
END
$ren81c$;
CREATE OR REPLACE FUNCTION conceptualizador.compartido_nivel(p_actor text, p_caso uuid) RETURNS text
LANGUAGE sql STABLE AS $cn81$
  SELECT CASE WHEN x.a = 'edicion' OR x.b = 'edicion' THEN 'edicion' WHEN x.a = 'lectura' OR x.b = 'lectura' THEN 'lectura' END
    FROM (SELECT conceptualizador.compartido_nivel_0081prev(p_actor, p_caso) AS a, conceptualizador.nivel_por_machote(p_actor, p_caso) AS b) x
$cn81$;

-- Al revés: el chat compartido en EDICIÓN deja escribir su machote. Solo lo compartido por chat (no lo que ya viene del machote).
CREATE OR REPLACE FUNCTION conceptualizador.machote_por_chat(p_actor text, p_machote uuid) RETURNS boolean
LANGUAGE sql STABLE AS $mc81$
  SELECT coalesce(p_actor IS NOT NULL AND EXISTS (
    SELECT 1 FROM conceptualizador.caso k
     WHERE k.machote_id = p_machote AND conceptualizador.prendido_caso('liga_machote_v166', k.id)
       AND conceptualizador.compartido_nivel_0081prev(p_actor, k.id) = 'edicion'), false)
$mc81$;

-- ── el supervisor: la bandera es de la TRANSACCIÓN (la pone api_suite con el nombre del actor) y del interruptor ──
CREATE OR REPLACE FUNCTION conceptualizador.supervisor_ve(p_actor text, p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $sv81$
  SELECT coalesce(p_actor IS NOT NULL AND btrim(p_actor) <> ''
    AND current_setting('conceptualizador.supervisor', true) = p_actor
    AND conceptualizador.prendido_para('supervisor_caso_v166', p_caso, p_actor), false)
$sv81$;

DO $ren81p$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'puede_escribir_caso_0081prev') THEN
    ALTER FUNCTION conceptualizador.puede_escribir_caso(text, uuid) RENAME TO puede_escribir_caso_0081prev;
  END IF;
END
$ren81p$;
CREATE OR REPLACE FUNCTION conceptualizador.puede_escribir_caso(p_actor text, p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $pe81$
  SELECT conceptualizador.puede_escribir_caso_0081prev(p_actor, p_caso) OR conceptualizador.supervisor_ve(p_actor, p_caso)
$pe81$;

-- ── api_suite ──
DO $ren81s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0081prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0081prev;
  END IF;
END
$ren81s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui81$
DECLARE
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_modo  text := p->>'modo';
  v_sup   boolean;
  v_caso  uuid;
  v_r     jsonb;
  v_ya    uuid[];
  v_mas   jsonb;
BEGIN
  -- Solo el campo de ARRIBA (lo pone conceptualizador/suite desde el token); `datos` nunca cuenta.
  v_sup := v_actor IS NOT NULL AND jsonb_typeof(p->'supervisor') = 'boolean' AND (p->>'supervisor')::boolean;
  PERFORM set_config('conceptualizador.supervisor', CASE WHEN v_sup THEN v_actor ELSE '' END, true);

  v_r := conceptualizador.api_suite_0081prev(p);

  -- ── hilo: el supervisor abre un caso ajeno que la 0066 le negó (se lee como lo leía la 0076 para lo compartido) ──
  IF v_modo = 'hilo' AND v_sup AND v_r->>'error' = 'NO_AUTORIZADO' THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND conceptualizador.supervisor_ve(v_actor, v_caso) THEN
      v_r := conceptualizador.api_suite_0066prev(p || jsonb_build_object('nonce', (p->>'nonce') || '-s81'));
      IF coalesce((v_r->>'ok')::boolean, false) THEN v_r := v_r || jsonb_build_object('supervisor', true); END IF;
    END IF;
  END IF;

  -- ── hilo: la liga del caso (solo con liga_machote_v166 del caso) ──
  IF v_modo = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND conceptualizador.prendido_caso('liga_machote_v166', v_caso) THEN
      v_r := v_r || jsonb_build_object('liga', conceptualizador.liga_de(v_caso));
    END IF;
  END IF;

  -- ── compartir: con la liga, la respuesta dice qué pasa con el machote ──
  IF v_modo = 'compartir' AND coalesce((v_r->>'ok')::boolean, false) THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL AND conceptualizador.prendido_caso('liga_machote_v166', v_caso) THEN
      v_r := v_r || jsonb_build_object('liga', conceptualizador.liga_de(v_caso));
    END IF;
  END IF;

  -- ── casos: lo que llega por machote o por supervisión, aunque casos_propios_v164 filtre. Se marca y se dice de quién es. ──
  IF v_modo = 'casos' AND v_actor IS NOT NULL AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'casos') = 'array' THEN
    SELECT coalesce(array_agg((x->>'id')::uuid), '{}'::uuid[]) INTO v_ya
      FROM jsonb_array_elements(v_r->'casos') x WHERE coalesce(x->>'id', '') ~ '^[0-9a-f-]{36}\Z';
    -- lo que ya venía (propio, del admin o compartido por la 0076): se le agrega `de` y `via` si no es suyo
    v_r := jsonb_set(v_r, ARRAY['casos'], coalesce((
      SELECT jsonb_agg(CASE WHEN a.x->>'autor' IS DISTINCT FROM v_actor AND conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid) IS NOT NULL
        THEN a.x || jsonb_build_object('compartido', conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid),
                                       'puede_editar', conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid) = 'edicion',
                                       'via', CASE WHEN conceptualizador.compartido_nivel_0081prev(v_actor, (a.x->>'id')::uuid) IS NOT NULL THEN 'chat' ELSE 'machote' END,
                                       'de', a.x->>'autor', 'de_nombre', a.x->>'autor_nombre')
        ELSE a.x END ORDER BY a.o)
        FROM jsonb_array_elements(v_r->'casos') WITH ORDINALITY AS a(x, o)), '[]'::jsonb));
    -- lo que falta: por machote, o (supervisor) todo lo demás
    IF v_sup AND conceptualizador.prendido_para('supervisor_caso_v166', NULL, v_actor)
       OR EXISTS (SELECT 1 FROM conceptualizador.caso k WHERE k.autor IS DISTINCT FROM v_actor AND NOT (k.id = ANY (v_ya))
                    AND conceptualizador.compartido_nivel(v_actor, k.id) IS NOT NULL) THEN
      SELECT coalesce(jsonb_agg(
               a.x || CASE WHEN conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid) IS NOT NULL
                 THEN jsonb_build_object('compartido', conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid),
                        'puede_editar', conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid) = 'edicion' OR conceptualizador.supervisor_ve(v_actor, (a.x->>'id')::uuid),
                        'via', CASE WHEN conceptualizador.compartido_nivel_0081prev(v_actor, (a.x->>'id')::uuid) IS NOT NULL THEN 'chat' ELSE 'machote' END)
                 ELSE jsonb_build_object('supervisor', true, 'puede_editar', true, 'via', 'supervisor') END
                 || jsonb_build_object('de', a.x->>'autor', 'de_nombre', a.x->>'autor_nombre') ORDER BY a.o), '[]'::jsonb)
        INTO v_mas
        FROM jsonb_array_elements(conceptualizador.api_suite_0066prev(p || jsonb_build_object('nonce', (p->>'nonce') || '-c81'))->'casos') WITH ORDINALITY AS a(x, o)
       WHERE coalesce(a.x->>'id', '') ~ '^[0-9a-f-]{36}\Z' AND NOT ((a.x->>'id')::uuid = ANY (v_ya)) AND a.x->>'autor' IS DISTINCT FROM v_actor
         AND (conceptualizador.compartido_nivel(v_actor, (a.x->>'id')::uuid) IS NOT NULL OR conceptualizador.supervisor_ve(v_actor, (a.x->>'id')::uuid));
      v_r := jsonb_set(v_r, ARRAY['casos'], (v_r->'casos') || v_mas);
    END IF;
  END IF;
  RETURN v_r;
END
$sui81$;

ALTER FUNCTION conceptualizador.liga_de(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.liga_de_machote(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.nivel_por_machote(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.compartido_nivel(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.compartido_nivel_0081prev(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.machote_por_chat(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.supervisor_ve(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.puede_escribir_caso(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.puede_escribir_caso_0081prev(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0081prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.liga_de(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.liga_de_machote(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.nivel_por_machote(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.compartido_nivel(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.compartido_nivel_0081prev(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.machote_por_chat(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.supervisor_ve(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.puede_escribir_caso(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.puede_escribir_caso_0081prev(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0081prev(jsonb) FROM PUBLIC;
DO $gr81$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0081prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
  -- comercial/machote-guardar (rol comercial_app) pregunta si el chat compartido deja escribir el machote, y lee la liga.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.machote_por_chat(text, uuid) TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.liga_de_machote(uuid) TO comercial_app;
  END IF;
END
$gr81$;
