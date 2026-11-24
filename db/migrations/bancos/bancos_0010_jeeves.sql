-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0010 · base de Jeeves: segunda fuente de la base bancaria (issue #352, enlazado a #331/#346/#348)
--
-- Jeeves es la tarjeta de crédito corporativa. Dos documentos propios:
--   A) PDF mensual del estado de cuenta, por ciclo → jeeves_ciclos + jeeves_movimientos_pdf
--   B) CSV de transacciones, un archivo por año, se vuelve a descargar cada mes → jeeves_transacciones
--      (una fila por Unique ID y VERSIÓN: si una transacción cambia entre descargas, se guarda la nueva
--      y la anterior deja de ser vigente; nada se borra ni se actualiza)
-- Validaciones V1–V4 en jeeves_validaciones (sólo inserción: la última por ciclo y prueba es la vigente).
-- Tablas editables de la clasificación: jeeves_palabras_personales y jeeves_categorias_destino.
--
-- Sólo agrega: no toca tablas, vistas ni funciones existentes. Etiquetas de dólar con nombre y ningún
-- signo de pesos seguido de comilla, dígito, ampersand, acento grave o '<' (§20 #10). Sin datos
-- bancarios (repo público): las tablas llegan vacías y las siembras son sólo palabras y categorías.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ciclos del PDF ──
CREATE TABLE IF NOT EXISTS bancos.jeeves_ciclos (
  id               bigserial     PRIMARY KEY,
  archivo_id       bigint        NOT NULL REFERENCES bancos.archivos(id),
  parser_version   text          NOT NULL,
  ciclo            char(7)       NOT NULL CHECK (ciclo ~ '^[0-9]{4}-(0[1-9]|1[0-2])'),   -- mes del fin del Statement Period
  statement_date   date,
  periodo_inicio   date          NOT NULL,
  periodo_fin      date          NOT NULL,
  billing_method   text,
  razon_social_fts boolean       NOT NULL,
  previous_balance numeric(18,2) NOT NULL,
  payments         numeric(18,2) NOT NULL,
  cashback         numeric(18,2) NOT NULL,
  new_charges      numeric(18,2) NOT NULL,
  late_fee         numeric(18,2) NOT NULL,
  pay_fee          numeric(18,2) NOT NULL,
  adjustment       numeric(18,2) NOT NULL,
  amount_due       numeric(18,2) NOT NULL,
  paginas          integer       NOT NULL,
  num_renglones    integer       NOT NULL,
  v1_ok            boolean       NOT NULL,
  v1_detalle       jsonb         NOT NULL DEFAULT '{}'::jsonb,
  huella           text          NOT NULL,
  corrida_id       bigint        REFERENCES bancos.corridas(id),
  creado_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (archivo_id, parser_version),
  CHECK (periodo_fin >= periodo_inicio)
);
CREATE INDEX IF NOT EXISTS jeeves_ciclos_ciclo ON bancos.jeeves_ciclos (ciclo);

-- ── 2. renglones de detalle del PDF ──
CREATE TABLE IF NOT EXISTS bancos.jeeves_movimientos_pdf (
  id          bigserial     PRIMARY KEY,
  ciclo_id    bigint        NOT NULL REFERENCES bancos.jeeves_ciclos(id),
  pagina      integer       NOT NULL,
  renglon     integer       NOT NULL,
  fecha       date,
  fecha_hora  timestamp,                        -- como viene impresa (hora local)
  usuario     text,
  comercio    text,
  tarjeta     char(4),                          -- últimos 4
  monto_mxn   numeric(18,2) NOT NULL,           -- positivo = cargo; negativo = pago, devolución o abono
  monto_usd   numeric(18,2),
  tipo        text          NOT NULL CHECK (tipo IN ('consumo','devolucion','pago','cargo_jeeves','ajuste','cashback','recargo','pay_fee')),
  hash        text          NOT NULL,
  UNIQUE (ciclo_id, renglon)
);
CREATE INDEX IF NOT EXISTS jeeves_movimientos_pdf_ciclo ON bancos.jeeves_movimientos_pdf (ciclo_id);

-- ── 3. cargas de CSV (una por archivo) ──
CREATE TABLE IF NOT EXISTS bancos.jeeves_csv_cargas (
  id              bigserial   PRIMARY KEY,
  archivo_id      bigint      NOT NULL UNIQUE REFERENCES bancos.archivos(id),
  parser_version  text        NOT NULL,
  anio            integer     NOT NULL,
  fecha_descarga  date        NOT NULL,
  fecha_de        text        NOT NULL CHECK (fecha_de IN ('nombre','subida','procesamiento')),
  columnas        integer     NOT NULL,
  filas           integer     NOT NULL,
  nuevas          integer     NOT NULL,
  versiones_nuevas integer    NOT NULL,
  repetidas       integer     NOT NULL,
  razon_social    text        NOT NULL CHECK (razon_social IN ('columna','tarjetas','sin_verificar')),
  avisos          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  corrida_id      bigint      REFERENCES bancos.corridas(id),
  creado_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 4. transacciones del CSV (una fila por Unique ID y versión) ──
CREATE TABLE IF NOT EXISTS bancos.jeeves_transacciones (
  id                   bigserial     PRIMARY KEY,
  unique_id            text          NOT NULL,
  version_hash         text          NOT NULL,
  carga_id             bigint        NOT NULL REFERENCES bancos.jeeves_csv_cargas(id),
  fecha_descarga       date          NOT NULL,
  renglon_csv          integer       NOT NULL,
  tipo                 text          NOT NULL CHECK (tipo IN ('consumo','devolucion','pago','cargo_jeeves','ajuste','cashback','recargo','pay_fee')),
  credit_debit         text,
  transaction_type     text,
  sub_transaction_type text,
  created_at_utc       timestamptz,
  posted_at_utc        timestamptz,
  usuario              text,
  usuario_email        text,
  status               text,
  monto_origen         numeric(18,2),
  moneda_origen        text,
  monto_mxn            numeric(18,2),
  monto_firmado        numeric(18,2),                -- MXN, + cargo / − abono (pago o devolución)
  tipo_cambio          numeric(18,6),
  fx_fees              numeric(18,2),
  payment_description  text,
  memo                 text,
  payee                text,
  categoria            text,
  tiene_comprobante    boolean       NOT NULL DEFAULT false,
  comprobantes         text,                         -- ligas: PRIVADO, nunca en una vista pública ni en un reporte
  tarjeta_nombre       text,
  tarjeta              char(4),
  tarjeta_tipo         text,
  sat_uuid             text,
  sat_uuid_valido      boolean       NOT NULL DEFAULT false,
  sat_subtotal         numeric(18,2),
  sat_tax              numeric(18,2),
  sat_total            numeric(18,2),
  sat_emisor_rfc       text,
  sat_emisor_nombre    text,
  sat_status           text,
  extra                jsonb         NOT NULL DEFAULT '{}'::jsonb,
  creado_at            timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (unique_id, version_hash)
);
CREATE INDEX IF NOT EXISTS jeeves_transacciones_uid ON bancos.jeeves_transacciones (unique_id, fecha_descarga DESC, id DESC);
CREATE INDEX IF NOT EXISTS jeeves_transacciones_posted ON bancos.jeeves_transacciones (posted_at_utc);

-- ── 5. validaciones (V1 del PDF, V2 CSV contra PDF, V3 continuidad, V4 contra BBVA, ODOO cotejo) ──
CREATE TABLE IF NOT EXISTS bancos.jeeves_validaciones (
  id          bigserial     PRIMARY KEY,
  ciclo       char(7)       NOT NULL,
  prueba      text          NOT NULL CHECK (prueba IN ('V1','V2','V3','V4','ODOO')),
  resultado   text          NOT NULL CHECK (resultado IN ('ok','falla','pendiente','no_aplica')),
  ciclo_id    bigint        REFERENCES bancos.jeeves_ciclos(id),
  diferencia  numeric(18,2),
  detalle     jsonb         NOT NULL DEFAULT '{}'::jsonb,       -- PRIVADO: puede listar transacciones
  corrida_id  bigint        REFERENCES bancos.corridas(id),
  creado_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jeeves_validaciones_ciclo ON bancos.jeeves_validaciones (ciclo, prueba, id DESC);

-- ── 6. tablas editables de la clasificación (con el usuario administrador de la base) ──
CREATE TABLE IF NOT EXISTS bancos.jeeves_palabras_personales (
  id       serial  PRIMARY KEY,
  patron   text    NOT NULL UNIQUE,     -- expresión regular (sintaxis de JavaScript) sobre el memo, sin distinguir mayúsculas ni acentos
  activa   boolean NOT NULL DEFAULT true,
  nota     text
);
INSERT INTO bancos.jeeves_palabras_personales (patron, nota) VALUES
  ('\bpersonal(es)?\b', 'gasto personal'),
  ('\bdepartamentos?\b', 'gasto de departamentos, ajeno a FTS'),
  ('\bno\s+es\s+de\s+fts\b|\bajen[oa]s?\b', 'gasto ajeno a FTS')
ON CONFLICT (patron) DO NOTHING;

CREATE TABLE IF NOT EXISTS bancos.jeeves_categorias_destino (
  id            serial  PRIMARY KEY,
  prioridad     integer NOT NULL,
  patron        text    NOT NULL UNIQUE,  -- expresión regular (JavaScript) sobre Category, la categoría del comercio en Jeeves
  destino       text    NOT NULL CHECK (destino IN ('costo','administrativo')),
  subcategoria  text    NOT NULL,
  activa        boolean NOT NULL DEFAULT true,
  nota          text
);
INSERT INTO bancos.jeeves_categorias_destino (prioridad, patron, destino, subcategoria, nota) VALUES
  (10, 'hardware|home\s*improvement|building\s+materials?|lumber|ferreter', 'costo', 'ferreteria_materiales', 'ferreterías y materiales'),
  (11, 'electrical|electric\s+parts|electronic', 'costo', 'electrico_mecanico', 'material eléctrico'),
  (12, 'industrial\s+suppl|machinery|equipment\s+suppl|tools?|plumbing|heating', 'costo', 'suministros_industriales', 'suministros industriales'),
  (20, 'gas\s+station|service\s+station|fuel|petroleum|automated\s+fuel', 'costo', 'combustible', 'gasolineras'),
  (21, 'car\s+rental|truck.*rental|auto\s+rental', 'costo', 'renta_equipo', 'renta de autos'),
  (22, 'airline|air\s+carrier|aerol', 'costo', 'viaticos_foraneos', 'aerolíneas (viajes a obra)'),
  (23, 'hotel|lodging|motel|resort', 'costo', 'viaticos_foraneos', 'hoteles (viajes a obra)'),
  (24, 'tolls?|bridge\s+fees|peaje', 'costo', 'casetas', 'casetas'),
  (30, 'computer\s+software|software|information\s+retrieval|data\s+processing|computer\s+network|saas|digital\s+goods', 'administrativo', 'software_suscripciones', 'software y servicios de información'),
  (31, 'stationery|office\s+suppl|office.*printing|book\s+stores|papeler', 'administrativo', 'papeleria_oficina', 'papelería'),
  (32, 'restaurant|eating\s+places|fast\s+food|caterers|bakeries|coffee', 'administrativo', 'restaurantes_mty', 'restaurantes (se toman como de Monterrey)'),
  (33, 'telecommunication|cable|utilities|electric\s+utilit', 'administrativo', 'software_suscripciones', 'telefonía y servicios')
ON CONFLICT (patron) DO NOTHING;

-- ── 7. vistas ──
-- el ciclo que vale de cada archivo: su lectura más reciente (como bancos.estados_vigentes)
CREATE OR REPLACE VIEW bancos.jeeves_ciclos_vigentes AS
SELECT DISTINCT ON (c.archivo_id) c.* FROM bancos.jeeves_ciclos c ORDER BY c.archivo_id, c.id DESC;

-- un ciclo por mes: el del archivo validado (el primero que se validó; uno posterior distinto es conflicto)
CREATE OR REPLACE VIEW bancos.v_jeeves_ciclos AS
SELECT DISTINCT ON (c.ciclo)
  c.id AS ciclo_id, c.ciclo, c.statement_date, c.periodo_inicio, c.periodo_fin, c.billing_method,
  c.previous_balance, c.payments, c.cashback, c.new_charges, c.late_fee, c.pay_fee, c.adjustment, c.amount_due,
  c.paginas, c.num_renglones, c.v1_ok, c.huella, c.parser_version, a.id AS archivo_id, a.nombre_canonico AS archivo, a.sha256
FROM bancos.jeeves_ciclos_vigentes c JOIN bancos.archivos a ON a.id = c.archivo_id
WHERE a.estado = 'validado' AND c.v1_ok
ORDER BY c.ciclo, c.id;

CREATE OR REPLACE VIEW bancos.v_jeeves_movimientos_pdf AS
SELECT m.id AS movimiento_id, v.ciclo, m.pagina, m.renglon, m.fecha, m.fecha_hora, m.usuario, m.comercio, m.tarjeta,
       m.monto_mxn, m.monto_usd, m.tipo, m.hash
FROM bancos.jeeves_movimientos_pdf m JOIN bancos.v_jeeves_ciclos v ON v.ciclo_id = m.ciclo_id;

-- la versión vigente de cada transacción: la de la descarga más reciente. Sin las ligas de comprobantes.
CREATE OR REPLACE VIEW bancos.v_jeeves_transacciones AS
SELECT DISTINCT ON (t.unique_id)
  t.id AS transaccion_id, t.unique_id, t.version_hash, t.fecha_descarga, t.tipo, t.credit_debit, t.transaction_type,
  t.sub_transaction_type, t.created_at_utc, t.posted_at_utc,
  (t.posted_at_utc AT TIME ZONE 'America/Monterrey') AS posted_mty, (t.created_at_utc AT TIME ZONE 'America/Monterrey') AS created_mty,
  t.usuario, t.status, t.monto_origen, t.moneda_origen, t.monto_mxn, t.monto_firmado, t.tipo_cambio, t.fx_fees,
  t.payment_description, t.memo, t.payee, t.categoria, t.tiene_comprobante, t.tarjeta_nombre, t.tarjeta, t.tarjeta_tipo,
  t.sat_uuid, t.sat_uuid_valido, t.sat_subtotal, t.sat_tax, t.sat_total, t.sat_emisor_rfc, t.sat_emisor_nombre, t.sat_status,
  cg.anio, cg.archivo_id
FROM bancos.jeeves_transacciones t
JOIN bancos.jeeves_csv_cargas cg ON cg.id = t.carga_id
JOIN bancos.archivos a ON a.id = cg.archivo_id AND a.estado = 'validado'
ORDER BY t.unique_id, t.fecha_descarga DESC, t.id DESC;

CREATE OR REPLACE VIEW bancos.v_jeeves_validaciones AS
SELECT DISTINCT ON (v.ciclo, v.prueba) v.ciclo, v.prueba, v.resultado, v.diferencia, v.detalle, v.creado_at
FROM bancos.jeeves_validaciones v ORDER BY v.ciclo, v.prueba, v.id DESC;

-- ── 8. permisos ──
-- bancos_app (servicio): SELECT e INSERT llegan por los privilegios por defecto de bancos_0001; nada de UPDATE ni DELETE.
-- Las tablas editables no las escribe el servicio.
REVOKE INSERT ON bancos.jeeves_palabras_personales, bancos.jeeves_categorias_destino FROM bancos_app;
-- bancos_lector (y bancos_er, que lo hereda): sólo vistas y tablas editables. Nunca las ligas de comprobantes.
REVOKE ALL ON bancos.jeeves_ciclos, bancos.jeeves_movimientos_pdf, bancos.jeeves_csv_cargas, bancos.jeeves_transacciones,
              bancos.jeeves_validaciones FROM bancos_lector;
GRANT SELECT ON bancos.v_jeeves_ciclos, bancos.v_jeeves_movimientos_pdf, bancos.v_jeeves_transacciones,
                bancos.v_jeeves_validaciones, bancos.jeeves_palabras_personales, bancos.jeeves_categorias_destino TO bancos_lector;
DO $auditor$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bancos_auditor') THEN
    GRANT SELECT ON bancos.jeeves_ciclos, bancos.jeeves_ciclos_vigentes, bancos.jeeves_movimientos_pdf, bancos.jeeves_csv_cargas,
                    bancos.v_jeeves_ciclos, bancos.v_jeeves_movimientos_pdf, bancos.v_jeeves_transacciones,
                    bancos.v_jeeves_validaciones, bancos.jeeves_validaciones TO bancos_auditor;
  END IF;
END
$auditor$;
REVOKE DELETE, TRUNCATE ON bancos.jeeves_ciclos, bancos.jeeves_movimientos_pdf, bancos.jeeves_csv_cargas, bancos.jeeves_transacciones,
                           bancos.jeeves_validaciones FROM bancos_app, bancos_lector;

COMMENT ON TABLE bancos.jeeves_transacciones IS 'Transacciones del CSV de Jeeves: una fila por Unique ID y versión. La vigente es la de la descarga más reciente (v_jeeves_transacciones). comprobantes es PRIVADO.';
COMMENT ON TABLE bancos.jeeves_palabras_personales IS 'Editable: patrones del memo que marcan un gasto personal o ajeno a FTS (va a «Gastos personales o ajenos en tarjeta (por decidir)», debajo de la utilidad de operación).';
COMMENT ON TABLE bancos.jeeves_categorias_destino IS 'Editable: Category del comercio → costo o administrativo (paso 5 de la clasificación de Jeeves).';
