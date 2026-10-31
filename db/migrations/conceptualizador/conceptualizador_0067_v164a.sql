-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0067 · V1.64a (#20 punto 2, sábado 31-oct-2026, Esteban) · permiso de PRUEBA para machotes: comercial:zz
--
-- El banco de pruebas (#23) necesita que el usuario de prueba cree y lea machotes, pero comercial:read da lectura de TODOS los
-- machotes reales (machotes-leer, V1.24). comercial:zz es el permiso de prueba: solo machotes de casos DEMO del propio usuario.
-- La regla vive aquí, en la base, para que machote-guardar y machotes-leer solo pregunten:
--   zz_machote_ok(actor, caso, id_local) → {ok:true} solo si TODO se cumple:
--     · el interruptor machote_zz_v164 está prendido (global, @persona o @caso; nace APAGADO);
--     · el usuario es de prueba: su nombre empieza con «zz.» (un usuario real nunca pasa, aunque alguien le ponga el scope);
--     · el caso existe, es demo y su autor es el usuario;
--     · si el machote (id_local) ya existe, su dueño es el usuario.
--   zz_machotes_visibles(actor) → los id de los machotes que ese usuario puede leer: los suyos (dueño = él). Vacío si no pasa
--     las dos primeras reglas.
-- Nadie la llama todavía: el cambio de los dos workflows espera el «va» (#20). Aditiva e idempotente.
-- ORDEN: 0066 → 0067. Reversa: reversas/067_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO conceptualizador.config (clave, valor) VALUES ('interruptor:machote_zz_v164', '0') ON CONFLICT (clave) DO NOTHING;

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

CREATE OR REPLACE FUNCTION conceptualizador.zz_machotes_visibles(p_actor text) RETURNS uuid[]
LANGUAGE sql STABLE AS $zv67$
  SELECT coalesce((SELECT array_agg(m.id ORDER BY m.id) FROM comercial.machote m
                    WHERE p_actor LIKE 'zz.%' AND conceptualizador.prendido_para('machote_zz_v164', NULL, p_actor)
                      AND m.dueno = p_actor AND m.deleted_at IS NULL), ARRAY[]::uuid[])
$zv67$;

ALTER FUNCTION conceptualizador.zz_machote_ok(text, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.zz_machotes_visibles(text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.zz_machote_ok(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.zz_machotes_visibles(text) FROM PUBLIC;
DO $gr67$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.zz_machote_ok(text, uuid, text), conceptualizador.zz_machotes_visibles(text) TO comercial_app;
  END IF;
END
$gr67$;
