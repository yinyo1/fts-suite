-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0011 · Costo de la nómina USA en Odoo, por SO (#448, MVP paso 3)
--
-- Al marcar Gerardo «subido», la base arma el ASIENTO de costo de la semana:
--   DEBE  gasto de nómina (Salary Expenses)   una línea por persona y cuenta analítica
--         · línea de SO      → analítica de la SO (plan «Gasto directo a proyectos USA»),
--                              de project.project.account_id, en nomina_usa.analitica_so
--         · comercial/ajuste → analítica de comercial (COMERCIAL-USA)
--         · fijo de Rissia   → su cuenta de la ficha («Sales FTS USA»)
--   HABER puente «Nómina USA por pagar»        el total
-- Con costo_odoo_activo=false (nace así) SOLO se guarda el payload y se ve en la pantalla
-- de Gerardo. Con la bandera prendida, nomina-usa/costo-odoo lo crea en Odoo en BORRADOR
-- (nunca publicado). Si falta el diario, la cuenta puente o una analítica, el asiento queda
-- con «faltantes» y el workflow NO lo toma: no se manda un asiento incompleto.
-- Las cuentas y el diario de la empresa 6 se ponen en config costo_odoo_mapa (clic de
-- Esteban): hoy la empresa 6 no tiene diario de varios ni cuenta puente.
-- Reglas de db/README.md: idempotente, etiquetas con nombre, sin dólar seguido de comilla o
-- dígito, sin llaves dobles. Nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO nomina_usa.config (clave, valor, nota) VALUES
  ('costo_odoo_activo', 'false'::jsonb, 'false = el asiento de costo solo se arma y se ve (vista previa). true = nomina-usa/costo-odoo lo crea en Odoo en BORRADOR. Solo Esteban.'),
  ('costo_odoo_mapa', '{"company_id":6,"journal_id":null,"cuenta_gasto_id":301,"cuenta_puente_id":null,"analiticas":{"COMERCIAL-USA":3089,"Sales FTS USA":3089}}'::jsonb,
   'Diario, cuentas y analíticas de FTS Full Technology Systems LLC (company 6) para el asiento de costo. journal_id y cuenta_puente_id vacíos hasta que existan en Odoo.')
ON CONFLICT (clave) DO NOTHING;

-- SO (project.project) → cuenta analítica de Odoo. La llena nomina-usa/odoo-lectura (solo lectura).
CREATE TABLE IF NOT EXISTS nomina_usa.analitica_so (
  so_id        integer     PRIMARY KEY,
  analytic_id  integer     NOT NULL,
  nombre       text,
  fuente       text        NOT NULL DEFAULT 'odoo',
  leido_at     timestamptz NOT NULL DEFAULT now()
);
-- Leídos el 2-nov-2026 con odoo_query project.project [2361, 2362] → account_id.
INSERT INTO nomina_usa.analitica_so (so_id, analytic_id, nombre, fuente) VALUES
  (2361, 3103, 'SO11791', 'odoo project.project.account_id 2-nov-2026'),
  (2362, 3104, 'SO11842', 'odoo project.project.account_id 2-nov-2026')
ON CONFLICT (so_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS nomina_usa.asiento (
  id             bigserial   PRIMARY KEY,
  solicitud_id   bigint      NOT NULL UNIQUE REFERENCES nomina_usa.solicitud(id),
  semana         date        NOT NULL,
  estado         text        NOT NULL DEFAULT 'vista_previa',
  payload        jsonb       NOT NULL,
  faltantes      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  total          numeric(12,2) NOT NULL,
  odoo_move_id   integer,
  error          text,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asiento_estado_ck CHECK (estado IN ('vista_previa', 'borrador_creado', 'error')),
  CONSTRAINT asiento_move_ck   CHECK ((estado = 'borrador_creado') = (odoo_move_id IS NOT NULL))
);

-- Analítica de una línea de la solicitud.
CREATE OR REPLACE FUNCTION nomina_usa.analitica_de(p_tipo text, p_so integer, p_cuenta text) RETURNS integer
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN p_tipo = 'so' THEN (SELECT analytic_id FROM nomina_usa.analitica_so WHERE so_id = p_so)
              ELSE nullif(nomina_usa.cfg('costo_odoo_mapa')->'analiticas'->>p_cuenta, '')::integer END
$fn$;

-- Cálculo puro (no escribe): el asiento de una solicitud autorizada o subida.
CREATE OR REPLACE FUNCTION nomina_usa.costo_calculo(p_sol bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE s nomina_usa.solicitud; m jsonb := nomina_usa.cfg('costo_odoo_mapa'); v_lin jsonb; v_tot numeric; v_falt jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM nomina_usa.solicitud WHERE id = p_sol;
  IF NOT FOUND OR s.estado NOT IN ('autorizada', 'subida') THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADA'); END IF;
  WITH l AS (
    SELECT l.employee_id, coalesce(f.alias, 'empleado ' || l.employee_id) AS alias, l.cuenta,
           nomina_usa.analitica_de(l.tipo, l.so_id, l.cuenta) AS analytic_id, sum(coalesce(l.autorizado_monto, 0)) AS monto
      FROM nomina_usa.solicitud_linea l LEFT JOIN nomina_usa.ficha f USING (employee_id)
     WHERE l.solicitud_id = s.id GROUP BY 1, 2, 3, 4 HAVING sum(coalesce(l.autorizado_monto, 0)) <> 0
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'persona', alias, 'cuenta', cuenta, 'analytic_id', analytic_id, 'monto', monto,
           'name', 'Nómina USA ' || to_char(s.semana, 'DD/MM/YYYY') || ' · ' || alias || ' · ' || cuenta) ORDER BY cuenta, alias), '[]'::jsonb),
         coalesce(sum(monto), 0)
    INTO v_lin, v_tot FROM l;
  IF nullif(m->>'journal_id', '') IS NULL THEN v_falt := v_falt || '"DIARIO: no hay diario de operaciones varias en la empresa 6 (costo_odoo_mapa.journal_id)"'::jsonb; END IF;
  IF nullif(m->>'cuenta_puente_id', '') IS NULL THEN v_falt := v_falt || '"CUENTA_PUENTE: falta la cuenta «Nómina USA por pagar» (costo_odoo_mapa.cuenta_puente_id)"'::jsonb; END IF;
  IF nullif(m->>'cuenta_gasto_id', '') IS NULL THEN v_falt := v_falt || '"CUENTA_GASTO: falta costo_odoo_mapa.cuenta_gasto_id"'::jsonb; END IF;
  v_falt := v_falt || coalesce((SELECT jsonb_agg(DISTINCT 'ANALITICA: sin cuenta analítica para ' || (x->>'cuenta')) FROM jsonb_array_elements(v_lin) x WHERE x->>'analytic_id' IS NULL), '[]'::jsonb);
  RETURN jsonb_build_object('ok', true, 'solicitud_id', s.id, 'semana', s.semana, 'total', v_tot, 'faltantes', v_falt,
    'payload', jsonb_build_object(
      'company_id', (m->>'company_id')::integer, 'journal_id', nullif(m->>'journal_id', '')::integer, 'move_type', 'entry',
      'date', to_char(s.semana + 7, 'YYYY-MM-DD'), 'ref', 'NUSA-SOL-' || s.id || ' · Nómina USA semana ' || to_char(s.semana, 'DD/MM/YYYY'),
      'lineas', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', x->>'name', 'account_id', nullif(m->>'cuenta_gasto_id', '')::integer,
                   'debit', greatest((x->>'monto')::numeric, 0), 'credit', greatest(-(x->>'monto')::numeric, 0),
                   'analytic_distribution', CASE WHEN x->>'analytic_id' IS NULL THEN NULL ELSE jsonb_build_object(x->>'analytic_id', 100) END,
                   'employee_id', (x->>'employee_id')::integer, 'cuenta', x->>'cuenta', 'persona', x->>'persona')), '[]'::jsonb) FROM jsonb_array_elements(v_lin) x)
               || jsonb_build_array(jsonb_build_object('name', 'Nómina USA por pagar · semana ' || to_char(s.semana, 'DD/MM/YYYY'),
                   'account_id', nullif(m->>'cuenta_puente_id', '')::integer, 'debit', greatest(-v_tot, 0), 'credit', greatest(v_tot, 0), 'cuenta', 'PUENTE'))));
END
$fn$;

-- Guarda (o refresca) el asiento de una solicitud subida. No toca uno ya creado en Odoo.
CREATE OR REPLACE FUNCTION nomina_usa.costo_preparar(p_sol bigint) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE c jsonb := nomina_usa.costo_calculo(p_sol); a nomina_usa.asiento;
BEGIN
  IF coalesce((c->>'ok')::boolean, false) = false THEN RETURN c; END IF;
  SELECT * INTO a FROM nomina_usa.asiento WHERE solicitud_id = p_sol FOR UPDATE;
  IF FOUND AND a.estado = 'borrador_creado' THEN RETURN jsonb_build_object('ok', true, 'asiento_id', a.id, 'estado', a.estado, 'sin_cambios', true); END IF;
  INSERT INTO nomina_usa.asiento (solicitud_id, semana, payload, faltantes, total)
  VALUES (p_sol, (c->>'semana')::date, c->'payload', c->'faltantes', (c->>'total')::numeric)
  ON CONFLICT (solicitud_id) DO UPDATE SET payload = excluded.payload, faltantes = excluded.faltantes, total = excluded.total,
    estado = 'vista_previa', error = NULL, actualizado_at = now()
  RETURNING * INTO a;
  RETURN jsonb_build_object('ok', true, 'asiento_id', a.id, 'estado', a.estado, 'faltantes', a.faltantes, 'total', a.total);
END
$fn$;

-- «Subido» en la bitácora → arma el asiento. Nunca tumba la acción de Gerardo.
CREATE OR REPLACE FUNCTION nomina_usa.bitacora_costo() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.evento = 'subida_auris' THEN
    BEGIN
      PERFORM nomina_usa.costo_preparar(nullif(split_part(coalesce(NEW.objeto, ''), ':', 2), '')::bigint);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO nomina_usa.aviso (clave, origen, evento, roles, asunto, html, objeto, modo_al_crear)
        VALUES ('fallo_costo:' || NEW.id, 'aviso', 'aviso_fallido', '{esteban}', 'Nómina USA: no se pudo armar el asiento de costo', left(SQLERRM, 300), NEW.objeto, 'sombra')
        ON CONFLICT (clave) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END IF;
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS bitacora_costo ON nomina_usa.bitacora;
CREATE TRIGGER bitacora_costo AFTER INSERT ON nomina_usa.bitacora
  FOR EACH ROW EXECUTE FUNCTION nomina_usa.bitacora_costo();

-- Lo que toma nomina-usa/costo-odoo: solo con la bandera prendida y sin faltantes.
CREATE OR REPLACE FUNCTION nomina_usa.costo_pendientes() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('activo', coalesce((nomina_usa.cfg('costo_odoo_activo') #>> '{}')::boolean, false),
    'asientos', CASE WHEN coalesce((nomina_usa.cfg('costo_odoo_activo') #>> '{}')::boolean, false) THEN
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'solicitud_id', a.solicitud_id, 'payload', a.payload) ORDER BY a.id)
                  FROM nomina_usa.asiento a WHERE a.estado = 'vista_previa' AND jsonb_array_length(a.faltantes) = 0), '[]'::jsonb)
      ELSE '[]'::jsonb END)
$fn$;

-- Resultado del workflow: [{id, ok, move_id?, error?}]. Solo pasa a borrador_creado si la bandera sigue prendida.
CREATE OR REPLACE FUNCTION nomina_usa.costo_resultado(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE x jsonb; n integer := 0;
BEGIN
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'resultados', '[]'::jsonb)) LOOP
    IF coalesce((x->>'ok')::boolean, false) AND nullif(x->>'move_id', '') IS NOT NULL THEN
      UPDATE nomina_usa.asiento SET estado = 'borrador_creado', odoo_move_id = (x->>'move_id')::integer, error = NULL, actualizado_at = now()
       WHERE id = (x->>'id')::bigint AND estado <> 'borrador_creado';
      PERFORM nomina_usa.log('nomina-usa/costo-odoo', 'costo_borrador_odoo', 'asiento:' || (x->>'id'), NULL, jsonb_build_object('move_id', x->'move_id'), NULL);
    ELSE
      UPDATE nomina_usa.asiento SET estado = 'error', error = left(coalesce(x->>'error', 'ERROR'), 300), actualizado_at = now()
       WHERE id = (x->>'id')::bigint AND estado = 'vista_previa';
    END IF;
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'procesados', n);
END
$fn$;

-- SO que hace falta traducir a analítica (para nomina-usa/odoo-lectura) y registro de lo leído.
CREATE OR REPLACE FUNCTION nomina_usa.analitica_faltante() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(jsonb_agg(DISTINCT so_id), '[]'::jsonb) FROM (
    SELECT so_id FROM nomina_usa.bolsa WHERE vigente
    UNION SELECT so_id FROM nomina_usa.horas_dia WHERE so_id IS NOT NULL AND fecha >= current_date - 21
      AND employee_id IN (SELECT employee_id FROM nomina_usa.ficha WHERE activo AND pais_nomina <> 'MX')
  ) q WHERE so_id IS NOT NULL
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.analitica_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE x jsonb; n integer := 0;
BEGIN
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'analiticas', '[]'::jsonb)) LOOP
    IF nullif(x->>'analytic_id', '') IS NULL OR nullif(x->>'so_id', '') IS NULL THEN CONTINUE; END IF;
    INSERT INTO nomina_usa.analitica_so (so_id, analytic_id, nombre, fuente, leido_at)
    VALUES ((x->>'so_id')::integer, (x->>'analytic_id')::integer, x->>'nombre', 'odoo project.project.account_id', now())
    ON CONFLICT (so_id) DO UPDATE SET analytic_id = excluded.analytic_id, nombre = excluded.nombre, fuente = excluded.fuente, leido_at = now();
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'analiticas', n);
END
$fn$;

-- ══ Panel ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION nomina_usa.a_costo_ver(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE a nomina_usa.asiento; c jsonb;
BEGIN
  SELECT * INTO a FROM nomina_usa.asiento WHERE solicitud_id = (p->>'id')::bigint;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'guardado', true, 'activo', nomina_usa.cfg('costo_odoo_activo'), 'asiento', to_jsonb(a));
  END IF;
  c := nomina_usa.costo_calculo((p->>'id')::bigint);
  IF coalesce((c->>'ok')::boolean, false) = false THEN RETURN c; END IF;
  RETURN jsonb_build_object('ok', true, 'guardado', false, 'activo', nomina_usa.cfg('costo_odoo_activo'),
    'asiento', jsonb_build_object('estado', 'sin_guardar', 'payload', c->'payload', 'faltantes', c->'faltantes', 'total', c->'total', 'semana', c->'semana'));
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_costo_preparar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM nomina_usa.solicitud WHERE id = (p->>'id')::bigint AND estado = 'subida') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_SUBIDA', 'mensaje', 'El asiento se arma cuando la solicitud está marcada como subida.');
  END IF;
  r := nomina_usa.costo_preparar((p->>'id')::bigint);
  PERFORM nomina_usa.log(p->>'actor', 'costo_preparado', 'solicitud:' || (p->>'id'), NULL, r, NULL);
  RETURN r;
END
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('costo_ver',      'nomina_usa.a_costo_ver',      '{nomina_usa:archivo,nomina_usa:autorizar,nomina_usa:validar}'),
  ('costo_preparar', 'nomina_usa.a_costo_preparar', '{nomina_usa:archivo}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
