-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0068 · V1.64a parte 3 (#20 punto 2, sábado 31-oct-2026) · el permiso de prueba también al ACTUALIZAR
--
-- Medido en ZZ3b (caso eef3847d, 31-oct 19:14 UTC): «Actualizar machote y Odoo» desde la pantalla de zz.prueba →
-- machote-guardar contestó ZZ_SIN_CASO. La pantalla solo manda documento.origen.caso_id al CREAR el machote (cz-acciones.js);
-- al guardar una versión nueva no lo trae, y zz_machote_ok exigía el caso en la llamada.
-- Ahora, si no llega el caso pero el machote ya existe, el caso sale del propio machote (conceptualizador.caso.machote_id).
-- Todas las demás reglas siguen iguales y se revisan sobre ESE caso: usuario zz.*, interruptor machote_zz_v164 prendido,
-- caso demo cuyo autor es el usuario, machote cuyo dueño es el usuario. Un usuario real nunca pasa (primera regla).
-- Solo cambia zz_machote_ok, que solo llama machote-guardar con comercial:zz. Aditiva e idempotente.
-- ORDEN: 0067 → 0068. Reversa: reversas/068_reversa.sql (la función de la 0067 tal cual).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.zz_machote_ok(p_actor text, p_caso uuid, p_id_local text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $zz68$
DECLARE
  v_c record;
  v_m record;
  v_caso uuid := p_caso;
BEGIN
  IF p_actor IS NULL OR p_actor NOT LIKE 'zz.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_NO_ES_PRUEBA', 'mensaje', 'El permiso de prueba es solo para usuarios de prueba.');
  END IF;
  SELECT m.id, m.dueno INTO v_m FROM comercial.machote m WHERE m.id_local = p_id_local AND m.deleted_at IS NULL;
  IF v_caso IS NULL AND v_m.id IS NOT NULL THEN
    SELECT c.id INTO v_caso FROM conceptualizador.caso c WHERE c.machote_id = v_m.id ORDER BY c.created_at DESC LIMIT 1;
  END IF;
  IF NOT conceptualizador.prendido_para('machote_zz_v164', v_caso, p_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_APAGADO', 'mensaje', 'El permiso de prueba está apagado.');
  END IF;
  SELECT c.id, c.autor, c.demo INTO v_c FROM conceptualizador.caso c WHERE c.id = v_caso;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_SIN_CASO', 'mensaje', 'Falta el caso de prueba del machote.'); END IF;
  IF NOT coalesce(v_c.demo, false) THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_CASO_REAL', 'mensaje', 'Solo casos de prueba (demo).'); END IF;
  IF v_c.autor <> p_actor THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_CASO_AJENO', 'mensaje', 'El caso no es tuyo.'); END IF;
  IF v_m.id IS NOT NULL AND v_m.dueno <> p_actor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_MACHOTE_AJENO', 'mensaje', 'Ese machote no es tuyo.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'machote_id', v_m.id, 'caso_del_machote', p_caso IS NULL AND v_caso IS NOT NULL);
END
$zz68$;
ALTER FUNCTION conceptualizador.zz_machote_ok(text, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.zz_machote_ok(text, uuid, text) FROM PUBLIC;
DO $gr68$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.zz_machote_ok(text, uuid, text) TO comercial_app;
  END IF;
END
$gr68$;
