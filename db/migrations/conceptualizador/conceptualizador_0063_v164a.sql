-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0063 · V1.64a (fts-conceptualizador#20, Esteban 29-oct-2026 16:00 CST, D5) · interruptor POR CASO en la base
--
-- Esteban: «una_cotizacion_v164: después de D1, préndelo primero solo para 8894ce y ccae8e». El motor ya lee
-- `interruptor:<nombre>@<caso_id>` (herramientas/motor/interruptores.js); la base y la pantalla solo leían el global. Esta migración:
--   1 · prendido_caso(nombre, caso): el renglón `interruptor:<nombre>@<caso>` manda si existe (prende O apaga ese caso);
--       si no existe, el global. Misma regla que el motor (`efectivo`).
--   2 · interruptores_caso(): {caso_id: {nombre: bool}} de los renglones por caso. Va en las respuestas que ya traen
--       `interruptores` (casos, hilo), para que la pantalla pregunte por el caso abierto.
--   3 · las 4 funciones de la 0062 que preguntaban prendido('una_cotizacion_v164') ahora preguntan por SU caso. Sin renglones
--       por caso, el resultado es idéntico al de la 0062.
-- ORDEN: 0062 → 0063. Aditiva e idempotente. Reversa: reversas/063_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.prendido_caso(p_nombre text, p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $pc63$
  SELECT coalesce(
    (SELECT btrim(c.valor) = '1' FROM conceptualizador.config c WHERE p_caso IS NOT NULL AND c.clave = 'interruptor:' || p_nombre || '@' || p_caso::text),
    conceptualizador.prendido(p_nombre))
$pc63$;
ALTER FUNCTION conceptualizador.prendido_caso(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.prendido_caso(text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_caso() RETURNS jsonb
LANGUAGE sql STABLE AS $ic63$
  SELECT coalesce(jsonb_object_agg(x.caso, x.m), '{}'::jsonb)
    FROM (SELECT substring(c.clave FROM '@([0-9a-f-]{36})\Z') AS caso,
                 jsonb_object_agg(substring(c.clave FROM '^interruptor:([a-z0-9_]+)@'), btrim(c.valor) = '1') AS m
            FROM conceptualizador.config c
           WHERE c.clave ~ '^interruptor:[a-z0-9_]+@[0-9a-f-]{36}\Z'
           GROUP BY 1) x
$ic63$;
ALTER FUNCTION conceptualizador.interruptores_caso() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.interruptores_caso() FROM PUBLIC;

-- ── 1 · la orden del caso de un machote (igual que la 0062, preguntando por SU caso) ──────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.orden_del_caso_v164(p_machote uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $od63$
  SELECT CASE WHEN conceptualizador.prendido_caso('una_cotizacion_v164', k.id) THEN
           jsonb_build_object('caso_id', k.id, 'orden_id', k.orden_id, 'orden_nombre', k.orden_nombre) END
    FROM conceptualizador.caso k WHERE k.machote_id = p_machote AND k.orden_id IS NOT NULL ORDER BY k.created_at DESC LIMIT 1
$od63$;
ALTER FUNCTION conceptualizador.orden_del_caso_v164(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_del_caso_v164(uuid) FROM PUBLIC;

-- ── 2 · soltar la orden de otro machote del mismo caso (igual que la 0062; el interruptor se lee ya con el caso) ───────
CREATE OR REPLACE FUNCTION conceptualizador.religar_orden_v164(p_machote uuid, p_so int, p_actor text) RETURNS jsonb
LANGUAGE plpgsql AS $rl63$
DECLARE
  v_caso uuid;
  v_n    int := 0;
  v_fol  text;
BEGIN
  IF p_so IS NULL THEN RETURN jsonb_build_object('ok', true, 'apagado', true); END IF;
  SELECT k.id INTO v_caso FROM conceptualizador.caso k WHERE k.machote_id = p_machote ORDER BY k.created_at DESC LIMIT 1;
  IF NOT conceptualizador.prendido_caso('una_cotizacion_v164', v_caso) THEN RETURN jsonb_build_object('ok', true, 'apagado', true); END IF;
  IF v_caso IS NULL THEN RETURN jsonb_build_object('ok', true, 'sin_caso', true); END IF;
  SELECT folio_txt INTO v_fol FROM comercial.machote WHERE id = p_machote;
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
$rl63$;
ALTER FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.religar_orden_v164(uuid, int, text) FROM PUBLIC;

-- ── 3 · el robot liga su machote (envoltura de la 0062, por caso) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.ligar_machote_robot_v163e(p_caso uuid, p_machote uuid, p_version int, p_folio text) RETURNS jsonb
LANGUAGE plpgsql AS $lm63$
DECLARE
  v_r jsonb := conceptualizador.ligar_machote_robot_v163e_0062prev(p_caso, p_machote, p_version, p_folio);
  v_n int := 0;
BEGIN
  IF conceptualizador.prendido_caso('una_cotizacion_v164', p_caso) AND coalesce((v_r->>'ok')::boolean, false) THEN
    UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_por = 'motor', hecha_at = now(),
           resultado = jsonb_build_object('reemplazada_por_machote', p_machote, 'por', 'una_cotizacion_v164', 'texto', 'El caso ya tiene machote: esta tarjeta crearía otro.')
     WHERE a.caso_id = p_caso AND a.tipo = 'crear_machote' AND a.estado = 'propuesta' AND (a.datos->'actualiza') IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_r := v_r || jsonb_build_object('tarjetas_retiradas', v_n); END IF;
  END IF;
  RETURN v_r;
END
$lm63$;
ALTER FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.ligar_machote_robot_v163e(uuid, uuid, int, text) FROM PUBLIC;

-- ── 4 · api_suite (envoltura de la 0062, por caso) + interruptores_caso en las respuestas que traen interruptores ─────
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui63$
DECLARE
  v_a   conceptualizador.accion%ROWTYPE;
  v_m0  uuid;
  v_f0  text;
  v_r   jsonb;
  v_new uuid;
BEGIN
  IF p->>'modo' = 'accion' AND p->>'decision' = 'hecha' THEN
    SELECT * INTO v_a FROM conceptualizador.accion WHERE id = conceptualizador.a_entero(p->>'accion_id');
    IF v_a.id IS NOT NULL AND v_a.tipo = 'crear_machote' AND v_a.estado = 'propuesta'
       AND conceptualizador.prendido_caso('una_cotizacion_v164', v_a.caso_id) THEN
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
  IF jsonb_typeof(v_r) = 'object' AND v_r ? 'interruptores' THEN
    v_r := v_r || jsonb_build_object('interruptores_caso', conceptualizador.interruptores_caso());
  END IF;
  RETURN v_r;
END
$sui63$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;

DO $gr63$
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
$gr63$;
