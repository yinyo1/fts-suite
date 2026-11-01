-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0007 · Catálogo de SO para la pestaña Bolsas (#448, corrección de la fase D)
--
-- `bolsas` devolvía solo las bolsas vigentes, así que en modo real el formulario de la
-- provisional no tenía de dónde elegir la SO (en práctica sí, por eso no se vio). Ahora trae
-- también el catálogo: toda SO con horas, avance o SO al entrar registrados, con o sin bolsa.
-- El id es el del kiosko (project.project). La pantalla además deja escribir una SO a mano.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION nomina_usa.a_bolsas(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'bolsas', coalesce((SELECT jsonb_agg(to_jsonb(b) || jsonb_build_object('avance', nomina_usa.avance_vigente(b.so_id)) ORDER BY b.so_nombre)
                          FROM nomina_usa.bolsa b WHERE b.vigente), '[]'::jsonb),
    'catalogo', coalesce((SELECT jsonb_agg(jsonb_build_object('so_id', so_id, 'so_nombre', so_nombre,
                            'sale_order_id', (SELECT sale_order_id FROM nomina_usa.bolsa x WHERE x.so_id = c.so_id AND x.vigente)) ORDER BY so_nombre)
                          FROM (SELECT so_id, max(so_nombre) AS so_nombre FROM (
                                  SELECT so_id, so_nombre FROM nomina_usa.horas_dia WHERE so_id IS NOT NULL
                                  UNION ALL SELECT so_id, so_nombre FROM nomina_usa.avance_so
                                  UNION ALL SELECT (payload->'so'->>'id')::integer, payload->'so'->>'nombre' FROM nomina_usa.evento_kiosko
                                             WHERE tipo = 'entrada_so' AND payload->'so'->>'id' IS NOT NULL
                                  UNION ALL SELECT so_id, so_nombre FROM nomina_usa.bolsa WHERE vigente) u GROUP BY so_id) c), '[]'::jsonb))
$fn$;
