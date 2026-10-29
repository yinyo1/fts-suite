-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0063 (V1.64a, #20, D5): las 4 funciones regresan al texto EXACTO de la 0062 (copiado de
-- db/062_conceptualizador.sql por herramientas, sin teclear) y se quitan prendido_caso e interruptores_caso. Los renglones
-- interruptor:<nombre>@<caso> NO se borran (el motor los sigue leyendo): se apagan aparte.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.orden_del_caso_v164(p_machote uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $od62$
  SELECT CASE WHEN conceptualizador.prendido('una_cotizacion_v164') THEN
    (SELECT jsonb_build_object('caso_id', k.id, 'orden_id', k.orden_id, 'orden_nombre', k.orden_nombre)
       FROM conceptualizador.caso k WHERE k.machote_id = p_machote AND k.orden_id IS NOT NULL ORDER BY k.created_at DESC LIMIT 1)
  END
$od62$;
ALTER FUNCTION conceptualizador.orden_del_caso_v164(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_del_caso_v164(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.religar_orden_v164(p_machote uuid, p_so int, p_actor text) RETURNS jsonb
LANGUAGE plpgsql AS $rl62$
DECLARE
  v_caso uuid;
  v_n    int := 0;
  v_fol  text;
BEGIN
  IF NOT conceptualizador.prendido('una_cotizacion_v164') OR p_so IS NULL THEN RETURN jsonb_build_object('ok', true, 'apagado', true); END IF;
  SELECT k.id INTO v_caso FROM conceptualizador.caso k WHERE k.machote_id = p_machote ORDER BY k.created_at DESC LIMIT 1;
  IF v_caso IS NULL THEN RETURN jsonb_build_object('ok', true, 'sin_caso', true); END IF;
  SELECT folio_txt INTO v_fol FROM comercial.machote WHERE id = p_machote;
  -- solo machotes que son de ESTE caso (los ligó alguna tarjeta o el robot), nunca uno de otro caso
  UPDATE comercial.machote m
     SET odoo_so_id = NULL, odoo_so_name = NULL, odoo_so_claim_at = NULL,
         archivado_at = coalesce(m.archivado_at, now()),
         archivado_por = coalesce(m.archivado_por, left('una_cotizacion_v164: superado por ' || coalesce(v_fol, p_machote::text) || ' (' || coalesce(p_actor, 'orden-odoo') || ')', 200)),
         updated_by = coalesce(p_actor, m.updated_by)
   WHERE m.odoo_so_id = p_so AND m.id <> p_machote AND m.deleted_at IS NULL
     AND m.id IN (SELECT (a.resultado->>'machote_id')::uuid FROM conceptualizador.accion a
                   WHERE a.caso_id = v_caso AND a.tipo = 'crear_machote' AND a.estado = 'hecha' AND a.resultado->>'machote_id' ~ '^[0-9a-f-]{36}\Z');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'soltados', v_n, 'caso_id', v_caso);
END
$rl62$;
ALTER FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION conceptualizador.ligar_machote_robot_v163e(p_caso uuid, p_machote uuid, p_version int, p_folio text) RETURNS jsonb
LANGUAGE plpgsql AS $lm62$
DECLARE
  v_r jsonb := conceptualizador.ligar_machote_robot_v163e_0062prev(p_caso, p_machote, p_version, p_folio);
  v_n int := 0;
BEGIN
  IF conceptualizador.prendido('una_cotizacion_v164') AND coalesce((v_r->>'ok')::boolean, false) THEN
    UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_por = 'motor', hecha_at = now(),
           resultado = jsonb_build_object('reemplazada_por_machote', p_machote, 'por', 'una_cotizacion_v164', 'texto', 'El caso ya tiene machote: esta tarjeta crearía otro.')
     WHERE a.caso_id = p_caso AND a.tipo = 'crear_machote' AND a.estado = 'propuesta' AND (a.datos->'actualiza') IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_r := v_r || jsonb_build_object('tarjetas_retiradas', v_n); END IF;
  END IF;
  RETURN v_r;
END
$lm62$;
ALTER FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui62$
DECLARE
  v_a   conceptualizador.accion%ROWTYPE;
  v_m0  uuid;
  v_f0  text;
  v_r   jsonb;
  v_new uuid;
BEGIN
  IF p->>'modo' = 'accion' AND p->>'decision' = 'hecha' AND conceptualizador.prendido('una_cotizacion_v164') THEN
    SELECT * INTO v_a FROM conceptualizador.accion WHERE id = conceptualizador.a_entero(p->>'accion_id');
    IF v_a.id IS NOT NULL AND v_a.tipo = 'crear_machote' AND v_a.estado = 'propuesta' THEN
      SELECT machote_id, machote_folio INTO v_m0, v_f0 FROM conceptualizador.caso WHERE id = v_a.caso_id;
    END IF;
  END IF;
  v_r := conceptualizador.api_suite_0062prev(p);
  IF v_m0 IS NOT NULL AND coalesce((v_r->>'ok')::boolean, false) THEN
    v_new := CASE WHEN coalesce(p->'resultado'->>'machote_id', '') ~ '^[0-9a-f-]{36}\Z' THEN (p->'resultado'->>'machote_id')::uuid END;
    IF v_new IS NOT NULL AND v_new <> v_m0 THEN
      UPDATE conceptualizador.caso SET machote_id = v_m0, machote_folio = coalesce(v_f0, machote_folio) WHERE id = v_a.caso_id;
      UPDATE comercial.machote SET archivado_at = coalesce(archivado_at, now()),
             archivado_por = coalesce(archivado_por, left('una_cotizacion_v164: el caso ya tenía ' || coalesce(v_f0, v_m0::text), 200))
       WHERE id = v_new AND odoo_so_id IS NULL;
      v_r := v_r || jsonb_build_object('machote_superado', jsonb_build_object('nuevo', v_new, 'vigente', v_m0, 'folio_vigente', v_f0));
    END IF;
  END IF;
  RETURN v_r;
END
$sui62$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
DO $gr63r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_del_caso_v164(uuid) TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) TO comercial_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr63r$;
DROP FUNCTION IF EXISTS conceptualizador.interruptores_caso();
DROP FUNCTION IF EXISTS conceptualizador.prendido_caso(text, uuid);
