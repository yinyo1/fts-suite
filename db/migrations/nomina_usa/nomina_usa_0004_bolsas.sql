-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0004 · Bolsas de mano de obra por SO, horas por día y avance diario (#448, fase D)
--
-- La mano de obra USA se paga por AVANCE desde la bolsa del machote de cada SO, no por día.
-- Bolsa por rol = Σ personas × qty × pu de las líneas de MO del machote digital ligado a la
-- SO (comercial.machote_orden principal → última comercial.machote_version):
--   supervisor = supervisor_sr, supervisor_jr, he_supervisor, he_jr
--   técnicos   = tecnicos, he_tecnicos
-- Sin machote con MO → Esteban captura una bolsa PROVISIONAL con folio. Sin bolsa no se
-- puede pedir pago de esa SO (el candado vive en nomina_usa_0005).
-- OJO CON EL ID: `so_id` en Nómina USA es el id que usa el kiosko, o sea el project.project
-- de Odoo (el mismo que va en hr.attendance.x_studio_project_id; ver #396 §0.4). La liga con
-- el machote es por la ORDEN de venta (comercial.machote_orden.odoo_so_id = sale.order.id),
-- que se guarda aparte en `sale_order_id`. Confundirlos daría la bolsa de otra SO.
-- `pagado_previo_*` = lo que ya se pagó de esa SO antes de este sistema (se captura con la
-- bolsa y cuenta como pagado: el disponible lo descuenta).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nomina_usa.bolsa (
  id                       bigserial   PRIMARY KEY,
  so_id                    integer     NOT NULL,
  so_nombre                text,
  sale_order_id            integer,
  origen                   text        NOT NULL,
  supervisor               numeric(12,2) NOT NULL DEFAULT 0,
  tecnicos                 numeric(12,2) NOT NULL DEFAULT 0,
  moneda                   text        NOT NULL DEFAULT 'USD',
  folio                    text,
  machote_version_id       uuid,
  pagado_previo_supervisor numeric(12,2) NOT NULL DEFAULT 0,
  pagado_previo_tecnicos   numeric(12,2) NOT NULL DEFAULT 0,
  vigente                  boolean     NOT NULL DEFAULT true,
  capturada_por            text        NOT NULL,
  capturada_at             timestamptz NOT NULL DEFAULT now(),
  nota                     text,
  CONSTRAINT bolsa_origen_ck CHECK (origen IN ('machote','provisional')),
  CONSTRAINT bolsa_moneda_ck CHECK (moneda = 'USD'),
  CONSTRAINT bolsa_montos_ck CHECK (supervisor >= 0 AND tecnicos >= 0 AND supervisor + tecnicos > 0),
  CONSTRAINT bolsa_previo_ck CHECK (pagado_previo_supervisor >= 0 AND pagado_previo_tecnicos >= 0
                                    AND pagado_previo_supervisor <= supervisor AND pagado_previo_tecnicos <= tecnicos),
  -- Una provisional sin folio de Esteban no existe.
  CONSTRAINT bolsa_folio_ck  CHECK (origen <> 'provisional' OR length(btrim(coalesce(folio, ''))) >= 3)
);
CREATE UNIQUE INDEX IF NOT EXISTS bolsa_vigente_uq ON nomina_usa.bolsa (so_id) WHERE vigente;

-- Horas por persona, día y SO, de las asistencias CERRADAS de Odoo (las sube nomina-usa/alertas).
CREATE TABLE IF NOT EXISTS nomina_usa.horas_dia (
  attendance_id  integer     PRIMARY KEY,
  employee_id    integer     NOT NULL,
  fecha          date        NOT NULL,
  so_id          integer,
  so_nombre      text,
  horas          numeric(6,2) NOT NULL CHECK (horas >= 0),
  check_in_utc   timestamptz,
  check_out_utc  timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS horas_so_fecha ON nomina_usa.horas_dia (so_id, fecha);

CREATE OR REPLACE FUNCTION nomina_usa.horas_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE h jsonb; n integer := 0;
BEGIN
  FOR h IN SELECT * FROM jsonb_array_elements(coalesce(p->'horas', '[]'::jsonb)) LOOP
    INSERT INTO nomina_usa.horas_dia (attendance_id, employee_id, fecha, so_id, so_nombre, horas, check_in_utc, check_out_utc)
    VALUES ((h->>'attendance_id')::integer, (h->>'employee_id')::integer, (h->>'fecha')::date, nullif(h->>'so_id', '')::integer,
            h->>'so_nombre', (h->>'horas')::numeric, (h->>'check_in_utc')::timestamptz, (h->>'check_out_utc')::timestamptz)
    ON CONFLICT (attendance_id) DO UPDATE SET employee_id = excluded.employee_id, fecha = excluded.fecha, so_id = excluded.so_id,
      so_nombre = excluded.so_nombre, horas = excluded.horas, check_in_utc = excluded.check_in_utc, check_out_utc = excluded.check_out_utc, updated_at = now();
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'horas', n);
END
$fn$;

-- Bolsa del machote digital de una SO, calculada desde comercial (si el esquema existe).
CREATE OR REPLACE FUNCTION nomina_usa.bolsa_de_machote(p_sale_order integer) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE r jsonb;
BEGIN
  IF to_regclass('comercial.machote_orden') IS NULL THEN RETURN NULL; END IF;
  EXECUTE $q$
    WITH v AS (
      SELECT mv.id, mv.documento, mv.moneda FROM comercial.machote_orden mo
        JOIN comercial.machote m ON m.id = mo.machote_id AND m.deleted_at IS NULL
        JOIN LATERAL (SELECT * FROM comercial.machote_version x WHERE x.machote_id = m.id ORDER BY x.version DESC LIMIT 1) mv ON true
       WHERE mo.odoo_so_id = $1 AND mo.principal AND mo.desligado_at IS NULL LIMIT 1
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
  $q$ INTO r USING p_sale_order;
  RETURN r;
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.bolsa_vigente(p_so integer) RETURNS nomina_usa.bolsa
LANGUAGE sql STABLE AS $fn$ SELECT * FROM nomina_usa.bolsa WHERE so_id = p_so AND vigente $fn$;

-- Avance vigente al cierre de una fecha (lo reportado por kiosko hasta ese día).
CREATE OR REPLACE FUNCTION nomina_usa.avance_al(p_so integer, p_fecha date) RETURNS integer
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(max(pct), 0) FROM nomina_usa.avance_so WHERE so_id = p_so AND estado = 'aceptado' AND origen = 'kiosko' AND fecha <= p_fecha
$fn$;

-- ── Panel ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nomina_usa.a_bolsas(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'bolsas', coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('avance', nomina_usa.avance_vigente(b.so_id))
           ORDER BY b.so_nombre), '[]'::jsonb))
    FROM nomina_usa.bolsa b WHERE b.vigente
$fn$;

-- Refresca la bolsa de una SO desde su machote. Si no hay machote con MO, lo dice y NO inventa.
CREATE OR REPLACE FUNCTION nomina_usa.a_bolsa_machote(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE m jsonb := nomina_usa.bolsa_de_machote((p->>'sale_order_id')::integer); v nomina_usa.bolsa;
BEGIN
  IF (p->>'so_id') IS NULL OR (p->>'sale_order_id') IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SO_Y_ORDEN_REQUERIDAS'); END IF;
  IF m IS NULL OR ((m->>'supervisor')::numeric + (m->>'tecnicos')::numeric) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_MO_EN_MACHOTE', 'mensaje', 'La SO no tiene machote ligado con mano de obra de campo. Captura una bolsa provisional con folio.');
  END IF;
  IF coalesce(m->>'moneda', 'USD') <> 'USD' THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_USD'); END IF;
  v := nomina_usa.bolsa_vigente((p->>'so_id')::integer);
  UPDATE nomina_usa.bolsa SET vigente = false WHERE so_id = (p->>'so_id')::integer AND vigente;
  INSERT INTO nomina_usa.bolsa (so_id, so_nombre, sale_order_id, origen, supervisor, tecnicos, machote_version_id, pagado_previo_supervisor, pagado_previo_tecnicos, capturada_por)
  VALUES ((p->>'so_id')::integer, coalesce(p->>'so_nombre', v.so_nombre), (p->>'sale_order_id')::integer, 'machote', (m->>'supervisor')::numeric, (m->>'tecnicos')::numeric,
          (m->>'machote_version_id')::uuid, coalesce(v.pagado_previo_supervisor, 0), coalesce(v.pagado_previo_tecnicos, 0), coalesce(p->>'actor', 'sistema'));
  PERFORM nomina_usa.log(p->>'actor', 'bolsa_machote', 'so:' || (p->>'so_id'), to_jsonb(v), m, NULL);
  RETURN jsonb_build_object('ok', true, 'bolsa', to_jsonb(nomina_usa.bolsa_vigente((p->>'so_id')::integer)));
END
$fn$;

-- Provisional: solo Esteban (nomina_usa:admin), con folio. No pisa una bolsa de machote.
CREATE OR REPLACE FUNCTION nomina_usa.a_bolsa_provisional(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v nomina_usa.bolsa := nomina_usa.bolsa_vigente((p->>'so_id')::integer);
BEGIN
  IF (p->>'so_id') IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SO_REQUERIDA'); END IF;
  IF v.origen = 'machote' THEN RETURN jsonb_build_object('ok', false, 'error', 'YA_TIENE_BOLSA_DE_MACHOTE'); END IF;
  IF length(btrim(coalesce(p->>'folio', ''))) < 3 THEN RETURN jsonb_build_object('ok', false, 'error', 'FOLIO_REQUERIDO'); END IF;
  UPDATE nomina_usa.bolsa SET vigente = false WHERE so_id = (p->>'so_id')::integer AND vigente;
  INSERT INTO nomina_usa.bolsa (so_id, so_nombre, sale_order_id, origen, supervisor, tecnicos, folio, pagado_previo_supervisor, pagado_previo_tecnicos, capturada_por, nota)
  VALUES ((p->>'so_id')::integer, p->>'so_nombre', nullif(p->>'sale_order_id', '')::integer, 'provisional', coalesce((p->>'supervisor')::numeric, 0), coalesce((p->>'tecnicos')::numeric, 0),
          btrim(p->>'folio'), coalesce((p->>'pagado_previo_supervisor')::numeric, 0), coalesce((p->>'pagado_previo_tecnicos')::numeric, 0),
          coalesce(p->>'actor', 'desconocido'), p->>'nota');
  PERFORM nomina_usa.log(p->>'actor', 'bolsa_provisional', 'so:' || (p->>'so_id'), to_jsonb(v), p - 'scopes' - 'nonce', p->>'folio');
  RETURN jsonb_build_object('ok', true, 'bolsa', to_jsonb(nomina_usa.bolsa_vigente((p->>'so_id')::integer)));
END
$fn$;

-- Avance diario de una SO en un rango: lo reportado por día + quién trabajó y cuántas horas.
CREATE OR REPLACE FUNCTION nomina_usa.a_avance_diario(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH d AS (SELECT generate_series((p->>'desde')::date, (p->>'hasta')::date, interval '1 day')::date AS fecha)
  SELECT jsonb_build_object('ok', true, 'so_id', (p->>'so_id')::integer, 'dias', coalesce(jsonb_agg(jsonb_build_object(
           'fecha', d.fecha,
           'avance', (SELECT max(a.pct) FROM nomina_usa.avance_so a WHERE a.so_id = (p->>'so_id')::integer AND a.fecha = d.fecha AND a.estado = 'aceptado'),
           'avance_al', nomina_usa.avance_al((p->>'so_id')::integer, d.fecha),
           'horas', coalesce((SELECT jsonb_agg(jsonb_build_object('employee_id', h.employee_id, 'horas', h.horas) ORDER BY h.employee_id)
                                FROM nomina_usa.horas_dia h WHERE h.so_id = (p->>'so_id')::integer AND h.fecha = d.fecha), '[]'::jsonb)) ORDER BY d.fecha), '[]'::jsonb))
    FROM d
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('bolsas',            'nomina_usa.a_bolsas',            '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar,nomina_usa:archivo}'),
  ('bolsa_machote',     'nomina_usa.a_bolsa_machote',     '{nomina_usa:admin}'),
  ('bolsa_provisional', 'nomina_usa.a_bolsa_provisional', '{nomina_usa:admin}'),
  ('avance_diario',     'nomina_usa.a_avance_diario',     '{nomina_usa:kiosko,nomina_usa:validar,nomina_usa:autorizar}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
