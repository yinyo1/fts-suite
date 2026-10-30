-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0065 · V1.65 (fts-suite#442, Esteban 29-oct-2026) · al ADOPTAR una orden, el caso toma su oportunidad y su cliente
--
-- La 0064 adopta la orden (respaldo, las dos ligas, el PDF previo) pero el caso se quedaba sin la oportunidad del CRM: en una
-- orden nacida a mano la oportunidad vive en sale.order.opportunity_id, y el caso solo la tomaba del machote (odoo_lead_id), que
-- en COT-0018 está vacío. Sin ella, el caso de recotización queda sin oportunidad y `oportunidad_nace` podría CREAR otra al ver
-- un cliente sin oportunidad (duplicado en el CRM, justo lo que Esteban pidió evitar).
--
--   adoptar_orden_v165 se envuelve (la de la 0064 queda como adoptar_orden_v165_0065prev, intacta): si la adopción salió bien y
--   orden-odoo mandó la oportunidad y el cliente QUE TIENE LA ORDEN EN ODOO, en la MISMA transacción:
--     · caso.oportunidad_id y caso.oportunidad_elegida (modo ligar) — solo si el caso no tenía (nunca pisa una elección);
--     · caso.cliente_odoo_id — solo si no tenía (el de la orden: el cliente NO se cambia aquí, decisión 3 de #442);
--     · machote.odoo_lead_id — solo si no tenía.
--   El read-back trae los tres. Nunca escribe en Odoo.
-- ORDEN: 0064 → 0065. Aditiva e idempotente. Reversa: reversas/065_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
DO $ren65$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'adoptar_orden_v165_0065prev') THEN
    ALTER FUNCTION conceptualizador.adoptar_orden_v165(jsonb) RENAME TO adoptar_orden_v165_0065prev;
  END IF;
END
$ren65$;

CREATE OR REPLACE FUNCTION conceptualizador.adoptar_orden_v165(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ad65$
DECLARE
  v_r    jsonb;
  v_caso uuid;
  v_mid  uuid := CASE WHEN coalesce(p->>'machote_id', '') ~ '^[0-9a-f-]{36}\Z' THEN (p->>'machote_id')::uuid END;
  v_op   int  := CASE WHEN coalesce(p->>'oportunidad_id', '') ~ '^[1-9][0-9]{0,9}\Z' THEN (p->>'oportunidad_id')::int END;
  v_cli  int  := CASE WHEN coalesce(p->'respaldo'->>'partner_id', '') ~ '^[1-9][0-9]{0,9}\Z' THEN (p->'respaldo'->>'partner_id')::int END;
  v_act  text := nullif(btrim(p->>'actor'), '');
BEGIN
  v_r := conceptualizador.adoptar_orden_v165_0065prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
  v_caso := conceptualizador.a_uuid(v_r->>'caso_id');
  IF v_caso IS NOT NULL THEN
    UPDATE conceptualizador.caso k SET
           oportunidad_id = coalesce(k.oportunidad_id, v_op),
           oportunidad_elegida = CASE WHEN k.oportunidad_elegida IS NULL AND v_op IS NOT NULL
             THEN jsonb_build_object('modo', 'ligar', 'id', v_op, 'nombre', NULL, 'creada', false, 'por', v_act, 'at', now(), 'v165', 'adopcion')
             ELSE k.oportunidad_elegida END,
           cliente_odoo_id = coalesce(k.cliente_odoo_id, v_cli)
     WHERE k.id = v_caso;
  END IF;
  IF v_mid IS NOT NULL AND v_op IS NOT NULL THEN
    UPDATE comercial.machote SET odoo_lead_id = v_op WHERE id = v_mid AND odoo_lead_id IS NULL;
  END IF;
  RETURN jsonb_set(v_r, ARRAY['readback', 'oportunidad'], coalesce((
    SELECT jsonb_build_object('caso_oportunidad_id', k.oportunidad_id, 'caso_cliente_odoo_id', k.cliente_odoo_id,
             'machote_lead_id', (SELECT x.odoo_lead_id FROM comercial.machote x WHERE x.id = v_mid), 'de_la_orden', v_op)
      FROM conceptualizador.caso k WHERE k.id = v_caso), jsonb_build_object('de_la_orden', v_op)));
END
$ad65$;
ALTER FUNCTION conceptualizador.adoptar_orden_v165(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.adoptar_orden_v165_0065prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.adoptar_orden_v165(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.adoptar_orden_v165_0065prev(jsonb) FROM PUBLIC;
DO $gr65$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.adoptar_orden_v165_0065prev(jsonb) FROM comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.adoptar_orden_v165(jsonb) TO comercial_app;
  END IF;
END
$gr65$;
