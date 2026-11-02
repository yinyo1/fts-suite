-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0015 · Bolsa «por confirmar» y ajuste de avance visible (#448, activación 2-nov)
--
-- 1) Esteban: SO11791 queda con pagado 0 y la marca «pagos previos por confirmar con
--    Richard», y el miércoles la pantalla de Richard tiene que mostrar ese aviso. La nota libre
--    de la bolsa no se pinta en la solicitud, y la SO puede no tener horas en la semana (entonces
--    ni aparece). Se agrega bolsa.por_confirmar (texto; null = nada que confirmar), una acción de
--    admin para ponerlo o quitarlo con motivo y bitácora, y el contexto de la solicitud trae la
--    lista de bolsas vigentes con esa marca, tenga o no horas la SO.
-- 2) Ajuste del viernes: el de comercial ya entra como línea precargada (0006). El de avance es
--    INFORMATIVO a propósito (el disponible ya se corrige con el avance real; sumarlo lo
--    descontaría dos veces) y la pantalla lo ocultaba. El contexto ahora lo trae en
--    ajustes_info para que Richard y Magaly lo vean, sin sumarlo.
-- Reglas de db/README.md: idempotente, etiquetas con nombre. Nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE nomina_usa.bolsa ADD COLUMN IF NOT EXISTS por_confirmar text;
COMMENT ON COLUMN nomina_usa.bolsa.por_confirmar IS
  'Aviso visible en la solicitud de Richard mientras no se confirme algo de la bolsa (ej. pagos previos). null = nada.';

-- Solo nomina_usa:admin. p = { so_id, texto (vacío o null = quitar), motivo }
CREATE OR REPLACE FUNCTION nomina_usa.a_bolsa_por_confirmar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v nomina_usa.bolsa := nomina_usa.bolsa_vigente((p->>'so_id')::integer); v_txt text := nullif(btrim(coalesce(p->>'texto', '')), '');
BEGIN
  IF (p->>'so_id') IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SO_REQUERIDA'); END IF;
  IF v.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_BOLSA_VIGENTE'); END IF;
  IF coalesce(btrim(p->>'motivo'), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_REQUERIDO'); END IF;
  UPDATE nomina_usa.bolsa SET por_confirmar = v_txt WHERE id = v.id;
  PERFORM nomina_usa.log(p->>'actor', 'bolsa_por_confirmar', 'so:' || v.so_id,
                         jsonb_build_object('por_confirmar', v.por_confirmar), jsonb_build_object('por_confirmar', v_txt), p->>'motivo');
  RETURN jsonb_build_object('ok', true, 'bolsa', to_jsonb(nomina_usa.bolsa_vigente(v.so_id)));
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.bolsas_por_confirmar() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object('so_id', so_id, 'so_nombre', so_nombre, 'folio', folio, 'texto', por_confirmar,
           'pagado_previo_supervisor', pagado_previo_supervisor, 'pagado_previo_tecnicos', pagado_previo_tecnicos) ORDER BY so_nombre), '[]'::jsonb)
    FROM nomina_usa.bolsa WHERE vigente AND por_confirmar IS NOT NULL
$fn$;

-- Contexto de la solicitud: el de 0006 + bolsas por confirmar + ajuste de avance informativo.
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_contexto_con_aviso(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE r jsonb := nomina_usa.a_solicitud_contexto_con_ajuste(p); v_sem date := (p->>'semana')::date;
BEGIN
  IF coalesce((r->>'ok')::boolean, false) = false THEN RETURN r; END IF;
  RETURN r || jsonb_build_object('bolsas_por_confirmar', nomina_usa.bolsas_por_confirmar(),
    'ajustes_info', (SELECT coalesce(jsonb_agg(x || jsonb_build_object('so_nombre',
                        (SELECT so_nombre FROM nomina_usa.bolsa b WHERE b.so_id = (x->>'so_id')::integer AND b.vigente))), '[]'::jsonb)
                       FROM jsonb_array_elements(nomina_usa.ajuste_calculo(v_sem - 7)->'ajustes') x
                      WHERE coalesce((x->>'informativo')::boolean, false)));
END
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('solicitud_contexto', 'nomina_usa.a_solicitud_contexto_con_aviso', '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar}'),
  ('bolsa_por_confirmar', 'nomina_usa.a_bolsa_por_confirmar', '{nomina_usa:admin}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
