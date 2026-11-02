-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0013 · «Traer del machote» también por comercial.machote.odoo_so_id (#448, MVP paso 7)
--
-- bolsa_de_machote() solo buscaba en comercial.machote_orden (la liga múltiple de 011). Las
-- SO que se confirman desde su machote quedan ligadas en comercial.machote.odoo_so_id
-- (007_orden_y_compuerta) y no siempre en machote_orden, así que «Traer del machote» decía
-- SIN_MO_EN_MACHOTE para las SO nuevas. Ahora: primero machote_orden (principal, sin
-- desligar), y si no hay, el machote vivo con odoo_so_id = la orden. El cálculo de la bolsa
-- (roles, Σ personas × qty × pu) es el mismo de 0004.
-- Reglas de db/README.md: idempotente, etiquetas con nombre, sin dólar seguido de comilla o
-- dígito, sin llaves dobles. Nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nomina_usa.bolsa_de_machote(p_sale_order integer) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE r jsonb; v_orden boolean := to_regclass('comercial.machote_orden') IS NOT NULL;
BEGIN
  IF to_regclass('comercial.machote') IS NULL THEN RETURN NULL; END IF;
  EXECUTE format($q$
    WITH cand AS (
      %s
      SELECT m.id, 2 AS prioridad, m.updated_at FROM comercial.machote m
       WHERE m.odoo_so_id = %s AND m.deleted_at IS NULL
    ), m1 AS (SELECT id FROM cand ORDER BY prioridad, updated_at DESC NULLS LAST LIMIT 1),
    v AS (
      SELECT mv.id, mv.documento, mv.moneda FROM m1
        JOIN LATERAL (SELECT * FROM comercial.machote_version x WHERE x.machote_id = m1.id ORDER BY x.version DESC LIMIT 1) mv ON true
    ), l AS (
      SELECT v.id, v.moneda, x->>'rol' AS rol,
             coalesce(nullif(x->>'personas', '')::numeric, 1) * coalesce(nullif(x->>'qty', '')::numeric, 0) * coalesce(nullif(x->>'pu', '')::numeric, 0) AS imp,
             x->>'moneda' AS mon_linea
        FROM v, jsonb_array_elements(coalesce(v.documento->'secciones', '[]'::jsonb)) s, jsonb_array_elements(coalesce(s->'mo', '[]'::jsonb)) x
    )
    SELECT jsonb_build_object('machote_version_id', (SELECT id FROM v),
      'moneda', coalesce((SELECT moneda FROM v), (SELECT min(mon_linea) FROM l)),
      'supervisor', coalesce(round(sum(imp) FILTER (WHERE rol IN ('supervisor_sr','supervisor_jr','he_supervisor','he_jr')), 2), 0),
      'tecnicos',   coalesce(round(sum(imp) FILTER (WHERE rol IN ('tecnicos','he_tecnicos')), 2), 0))
      FROM l HAVING count(*) > 0
  $q$,
  CASE WHEN v_orden THEN format($o$
      SELECT m.id, 1 AS prioridad, m.updated_at FROM comercial.machote_orden mo
        JOIN comercial.machote m ON m.id = mo.machote_id AND m.deleted_at IS NULL
       WHERE mo.odoo_so_id = %s AND mo.principal AND mo.desligado_at IS NULL
      UNION ALL $o$, p_sale_order) ELSE '' END,
  p_sale_order) INTO r;
  RETURN r;
END
$fn$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
