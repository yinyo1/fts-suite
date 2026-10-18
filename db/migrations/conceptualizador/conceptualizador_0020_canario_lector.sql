-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0020 · V1.55 (fts-conceptualizador#11 decisión 7, #12): el CANARIO de pantalla es solo LECTOR
--
-- Para la revisión diaria de la pantalla en producción (E5), un usuario de la suite, `canario`, entra a la pantalla real,
-- abre su caso demo y comprueba que pintó. Esta migración hace que la base lo trate como LECTOR:
--   · `lectores` (config, lista separada por comas; '' = nadie): quién es lector. Se siembra con 'canario'.
--   · es_lector(actor): true si el actor está en esa lista.
--   · api_suite: un lector solo puede `casos`, `hilo`, `estado`, `aprendio` y `push_estado`; cualquier otro modo
--     (mensaje, evento, acción, adjunto, renombrar, archivar, ciudad, config…) responde SOLO_LECTURA sin tocar nada.
--     Solo ve sus propios casos (los demás no salen en `casos` y `hilo` responde CASO_NO_EXISTE), y su `hilo` no lleva
--     `datos` (el «escribiendo» no se guarda). Los casos de un lector NO salen en la lista de nadie más.
--   · api_correo: un lector no prepara, no ve y no envía nada (SOLO_LECTURA).
--   · El caso demo del canario (demo = true, sin carpeta: el motor no lo ve, no genera trabajo ni cuenta en nada).
-- Lo que NO cambia: ningún interruptor, ningún modo, ninguna regla para quien no es lector.
-- Reversa: db/reversas/020_reversa.sql (quita las envolturas y devuelve los nombres; deja el caso demo y la clave en '').
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente (los renombres van una sola vez). Sin correos ni teléfonos de nadie.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO conceptualizador.config (clave, valor) VALUES ('lectores', 'canario') ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION conceptualizador.es_lector(p_actor text) RETURNS boolean
LANGUAGE sql STABLE AS $lec20$
  SELECT coalesce(btrim(p_actor), '') <> ''
     AND btrim(p_actor) = ANY (string_to_array(replace(coalesce((SELECT c.valor FROM conceptualizador.config c WHERE c.clave = 'lectores'), ''), ' ', ''), ','))
$lec20$;

-- El caso demo del canario: id fijo (idempotente), sin carpeta ni cliente real.
INSERT INTO conceptualizador.caso (id, titulo, autor, autor_nombre, pais, demo, modo)
VALUES ('c0000000-0000-4000-8000-00000000ca1a', 'Caso demo del canario', 'canario', 'Canario de pantalla', 'mx', true, 'libre')
ON CONFLICT (id) DO NOTHING;
INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
SELECT 'c0000000-0000-4000-8000-00000000ca1a', 'usuario', 'canario', 'Mensaje de prueba del canario de pantalla. No se contesta.'
 WHERE NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.caso_id = 'c0000000-0000-4000-8000-00000000ca1a' AND m.rol = 'usuario');
INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
SELECT 'c0000000-0000-4000-8000-00000000ca1a', 'motor', 'sistema', 'Este caso es del canario de pantalla: sirve para comprobar cada mañana que la pantalla pinta. No cuenta para nada.'
 WHERE NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.caso_id = 'c0000000-0000-4000-8000-00000000ca1a' AND m.rol = 'motor');

-- ── api_suite (envoltura) ───────────────────────────────────────────────────
DO $ren20s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0020prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0020prev;
  END IF;
END
$ren20s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui20$
DECLARE
  v_actor text := btrim(coalesce(p->>'actor', ''));
  v_modo  text := p->>'modo';
  v_lec   boolean := conceptualizador.es_lector(btrim(coalesce(p->>'actor', '')));
  v_caso  uuid;
  v_r     jsonb;
BEGIN
  IF v_lec THEN
    IF v_modo IS NULL OR v_modo NOT IN ('casos', 'hilo', 'estado', 'aprendio', 'push_estado') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA', 'mensaje', 'Este usuario solo puede mirar: no escribe, no manda ni cambia nada.');
    END IF;
    IF v_modo = 'hilo' THEN
      v_caso := conceptualizador.a_uuid(p->>'caso_id');
      IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso c WHERE c.id = v_caso AND c.autor = v_actor) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
      END IF;
      p := p - 'datos';
    END IF;
  END IF;
  v_r := conceptualizador.api_suite_0020prev(p);
  IF v_modo = 'casos' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'casos') = 'array' THEN
    v_r := jsonb_set(v_r, ARRAY['casos'], coalesce((SELECT jsonb_agg(a.x ORDER BY a.o) FROM jsonb_array_elements(v_r->'casos') WITH ORDINALITY AS a(x, o)
      WHERE CASE WHEN v_lec THEN a.x->>'autor' = v_actor ELSE NOT conceptualizador.es_lector(a.x->>'autor') END), '[]'::jsonb));
  END IF;
  IF v_lec THEN v_r := v_r || jsonb_build_object('solo_lectura', true); END IF;
  RETURN v_r;
END
$sui20$;

-- ── api_correo (envoltura) ──────────────────────────────────────────────────
DO $ren20c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0020prev') THEN
    ALTER FUNCTION conceptualizador.api_correo(jsonb) RENAME TO api_correo_0020prev;
  END IF;
END
$ren20c$;

CREATE OR REPLACE FUNCTION conceptualizador.api_correo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cor20$
BEGIN
  IF conceptualizador.es_lector(btrim(coalesce(p->>'actor', ''))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA', 'mensaje', 'Este usuario solo puede mirar: no escribe, no manda ni cambia nada.');
  END IF;
  RETURN conceptualizador.api_correo_0020prev(p);
END
$cor20$;

-- ── Permisos: la app solo ejecuta las puertas ──────────────────────────────
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0020prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo_0020prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0020prev(jsonb), conceptualizador.api_correo_0020prev(jsonb), conceptualizador.es_lector(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0020prev(jsonb), conceptualizador.api_correo_0020prev(jsonb), conceptualizador.es_lector(text) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb), conceptualizador.api_correo(jsonb) TO conceptualizador_app;
