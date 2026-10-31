-- Reversa de conceptualizador_0068: vuelve zz_machote_ok a la versión de la 0067 (exige el caso en la llamada).
CREATE OR REPLACE FUNCTION conceptualizador.zz_machote_ok(p_actor text, p_caso uuid, p_id_local text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $zz67$
DECLARE
  v_c record;
  v_m record;
BEGIN
  IF p_actor IS NULL OR p_actor NOT LIKE 'zz.%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_NO_ES_PRUEBA', 'mensaje', 'El permiso de prueba es solo para usuarios de prueba.');
  END IF;
  IF NOT conceptualizador.prendido_para('machote_zz_v164', p_caso, p_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_APAGADO', 'mensaje', 'El permiso de prueba está apagado.');
  END IF;
  SELECT c.id, c.autor, c.demo INTO v_c FROM conceptualizador.caso c WHERE c.id = p_caso;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_SIN_CASO', 'mensaje', 'Falta el caso de prueba del machote.'); END IF;
  IF NOT coalesce(v_c.demo, false) THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_CASO_REAL', 'mensaje', 'Solo casos de prueba (demo).'); END IF;
  IF v_c.autor <> p_actor THEN RETURN jsonb_build_object('ok', false, 'error', 'ZZ_CASO_AJENO', 'mensaje', 'El caso no es tuyo.'); END IF;
  SELECT m.id, m.dueno INTO v_m FROM comercial.machote m WHERE m.id_local = p_id_local AND m.deleted_at IS NULL;
  IF v_m.id IS NOT NULL AND v_m.dueno <> p_actor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ZZ_MACHOTE_AJENO', 'mensaje', 'Ese machote no es tuyo.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'machote_id', v_m.id);
END
$zz67$;
ALTER FUNCTION conceptualizador.zz_machote_ok(text, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.zz_machote_ok(text, uuid, text) FROM PUBLIC;
