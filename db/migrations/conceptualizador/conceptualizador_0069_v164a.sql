-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0069 · V1.64a parte 5 (#20 paso 1, domingo 1-nov-2026, «va» de Esteban) · el banco fija el cliente 2260
--
-- Medido en ZZ3b (31-oct): el banco no tiene forma de poner el cliente del caso desde la pantalla; se puso por SQL a mano.
-- Modo de servidor, SIN modo nuevo (la lista de modos de conceptualizador/suite es cerrada y no se toca): cuando un usuario zz.*
-- marca COMO PRUEBA (modo 'prueba', texto 'si') SU PROPIO caso, la base además le fija el cliente ZZ-PRUEBA A3 (res.partner 2260).
-- Reglas, todas en la base (nunca un if del navegador):
--   · el actor empieza con 'zz.' (un usuario real nunca entra: primera regla);
--   · el permiso de prueba machote_zz_v164 está prendido para ese caso o esa persona (el mismo del banco, db/067);
--   · el caso es suyo (autor = actor), queda demo y no está archivado;
--   · el cliente es SIEMPRE 2260: no se acepta otro id desde fuera.
-- Lo que escribe: caso.cliente_odoo_id = 2260, contacto_odoo_id = 2260, cliente = 'ZZ-PRUEBA A3'. Nada más: sin evento ni trabajo
-- (los CHECK de evento/cambio_sesion no se amplían por una ayuda de banco); el rastro es la respuesta, que trae el cliente de antes.
-- La respuesta trae zz_cliente {ok, partner_id} o zz_cliente {ok:false, error} para que el banco lo exija.
-- ORDEN: 0068 → 0069. Aditiva e idempotente. Reversa: reversas/069_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
DO $ren69s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0069prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0069prev;
  END IF;
END
$ren69s$;

CREATE OR REPLACE FUNCTION conceptualizador.zz_cliente_prueba(p_actor text, p_caso uuid) RETURNS jsonb
LANGUAGE plpgsql AS $zzc69$
DECLARE
  v_c record;
BEGIN
  IF p_actor IS NULL OR p_actor NOT LIKE 'zz.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_NO_ES_PRUEBA');
  END IF;
  IF NOT conceptualizador.prendido_para('machote_zz_v164', p_caso, p_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_APAGADO');
  END IF;
  SELECT c.id, c.autor, c.demo, c.archivado_at, c.cliente_odoo_id INTO v_c FROM conceptualizador.caso c WHERE c.id = p_caso;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_SIN_CASO'); END IF;
  IF v_c.autor <> p_actor THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_CASO_AJENO'); END IF;
  IF NOT coalesce(v_c.demo, false) THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_CASO_REAL'); END IF;
  IF v_c.archivado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_ARCHIVADO'); END IF;
  UPDATE conceptualizador.caso SET cliente_odoo_id = 2260, contacto_odoo_id = 2260, cliente = 'ZZ-PRUEBA A3' WHERE id = v_c.id;
  RETURN jsonb_build_object('ok', true, 'partner_id', 2260, 'antes', v_c.cliente_odoo_id);
END
$zzc69$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui69$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_r     jsonb := conceptualizador.api_suite_0069prev(p);
BEGIN
  IF p->>'modo' = 'prueba' AND v_actor LIKE 'zz.%' AND coalesce((v_r->>'ok')::boolean, false)
     AND coalesce((v_r->>'demo')::boolean, false) THEN
    v_r := v_r || jsonb_build_object('zz_cliente', conceptualizador.zz_cliente_prueba(v_actor, conceptualizador.a_uuid(v_r->>'caso_id')));
  END IF;
  RETURN v_r;
END
$sui69$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0069prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.zz_cliente_prueba(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0069prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.zz_cliente_prueba(text, uuid) FROM PUBLIC;
DO $gr69s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0069prev(jsonb) FROM conceptualizador_app;
    REVOKE ALL ON FUNCTION conceptualizador.zz_cliente_prueba(text, uuid) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr69s$;
