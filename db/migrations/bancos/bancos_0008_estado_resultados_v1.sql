-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0008 · estado de resultados v1: tablas editables, versiones y recálculo (issue #348)
--
--   1. reglas_edo_resultados: más destinos (activo fijo, casa de cambio, Jeeves por comercio) y más
--      campos (comercio de Jeeves, cliente de Odoo, plan analítico). Reglas nuevas sembradas.
--   2. nomina_oficina         EDITABLE. Personal de oficina: lo que coincida va a gastos administrativos.
--                             Nace VACÍA (la llena RH); mientras esté vacía toda la nómina es costo.
--   3. partidas_identificadas EDITABLE. Partidas grandes sin concepto ni factura. El recálculo inserta
--                             las nuevas como pendientes (clasificacion NULL); Esteban decide.
--   4. er_parametros          EDITABLE. Parámetros del cálculo (depreciación, umbral de partidas,
--                             costo estimado de Conmet).
--   5. er_calculos            bitácora de cada recálculo: huella de insumos y de resultados, versión.
--   6. v_auditoria_estados    último resultado del auditor (#346) por estado: sólo la bandera ROJO,
--                             sin evidencia.
--   7. rol bancos_er          el del workflow fts_bancos_estado_resultados: lee como bancos_lector y
--                             SÓLO inserta en er_calculos y partidas_identificadas. Sin UPDATE ni DELETE.
--
-- Sin datos bancarios ni montos (repo público), sin signos de pesos (§20 #10), nada se borra.
-- OJO: bancos_0001 dejó ALTER DEFAULT PRIVILEGES (SELECT, INSERT a bancos_app): se revoca en cada tabla.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. reglas ──
ALTER TABLE bancos.reglas_edo_resultados DROP CONSTRAINT IF EXISTS reglas_edo_resultados_destino_check;
ALTER TABLE bancos.reglas_edo_resultados DROP CONSTRAINT IF EXISTS reglas_edo_resultados_campo_check;
ALTER TABLE bancos.reglas_edo_resultados ADD CONSTRAINT reglas_edo_resultados_destino_check CHECK (destino IN (
  'administrativo','excluir_fondeo_payana','excluir_fondeo_jeeves','excluir_traspaso','excluir_financiamiento',
  'impuestos_cuotas','nomina_directa','conmet','activo_fijo','casa_cambio','jeeves_admin','jeeves_costo','jeeves_extranjero'));
ALTER TABLE bancos.reglas_edo_resultados ADD CONSTRAINT reglas_edo_resultados_campo_check CHECK (campo IN (
  'descripcion','proveedor_odoo','categoria','comercio_jeeves','cliente_odoo','plan_analitico'));

INSERT INTO bancos.reglas_edo_resultados (prioridad, destino, campo, patron, subcategoria, nota) VALUES
  -- administrativo literal por proveedor de Odoo (D2)
  (79, 'administrativo', 'proveedor_odoo', 'CONTAB|FISCAL|AUDITOR', 'contabilidad_legal', 'despacho contable'),
  (80, 'administrativo', 'proveedor_odoo', 'NOTARI|ABOGAD|JURIDIC', 'contabilidad_legal', 'legal'),
  (81, 'administrativo', 'proveedor_odoo', 'RENTA|ARRENDAMIENTO|BIENES RAICES', 'renta_oficina', NULL),
  (82, 'administrativo', 'plan_analitico', '^2$', 'payana_indirecto', 'Payana: factura con analítica plan 2 (indirecto) y sin proyecto'),
  -- activo fijo (D6): compras de vehículos
  (55, 'activo_fijo', 'proveedor_odoo', 'TOYOTA|NISSAN|FORD MOTOR|CHEVROLET|GENERAL MOTORS|VOLKSWAGEN|HONDA|MAZDA|HYUNDAI|AUTOMOTRIZ', 'vehiculos', 'depreciación 25 % anual'),
  (56, 'activo_fijo', 'descripcion', 'HILUX|UNITEDAUTO|AGENCIA AUTOMOTRIZ', 'vehiculos', 'depreciación 25 % anual'),
  -- casa de cambio (D6)
  (57, 'casa_cambio', 'descripcion', 'MONEX|CASA DE CAMBIO|INTERCAM|CIBANCO', 'casa_cambio', 'traspaso propio si hay entrada equivalente ±5 días ±3 %'),
  -- cliente Conmet (Vista C)
  (62, 'conmet', 'cliente_odoo', 'CONMET', 'conmet_cliente', 'facturas del contrato Conmet'),
  -- Jeeves por comercio (D3). Las de costo foráneo van antes que restaurantes.
  (200, 'jeeves_extranjero', 'comercio_jeeves', 'HOUSTON|USA|\bTX\b|DALLAS|LAREDO TX|ADOBE|LINKEDIN|OPENAI|ANTHROPIC|GITHUB|CANVA|ZOOM|DROPBOX|NETFLIX|SPOTIFY|AMAZON WEB|AWS|AIRBNB|BOOKING|HOTELCOM|EXPEDIA|AMERICAN AIRLINES', 'extranjero', 'sin IVA mexicano: queda como está'),
  (210, 'jeeves_costo', 'comercio_jeeves', 'HOUSTON|USA|\bTX\b|DALLAS|AEROMEXICO|VOLARIS|VIVA ?AEROBUS|AMERICAN AIRLINES|UNITED AIR|DELTA|AIRBNB|HOTEL|\bINNS?\b|SUITES|MOTEL|BOOKING|EXPEDIA|MARRIOTT|HILTON|HOLIDAY|CITY EXPRESS|FIESTA INN', 'viaticos_foraneos', 'viajes y hospedaje'),
  (220, 'jeeves_admin', 'comercio_jeeves', 'ADOBE|LINKEDIN|GOOGLE|MICROSOFT|OPENAI|ANTHROPIC|CHATGPT|ZOOM|CANVA|DROPBOX|APPLE|MACSTORE|AUTODESK|GITHUB|NOTION|SLACK|AMAZON WEB|AWS|STARLINK|TELCEL|CFE|NATURGY', 'software_suscripciones', 'software, suscripciones, telefonía y servicios'),
  (221, 'jeeves_admin', 'comercio_jeeves', 'OFFICE|OFFICEMAX|LUMEN|PAPELER|COPIAS|IMPRENTA', 'papeleria_oficina', NULL),
  (222, 'jeeves_admin', 'comercio_jeeves', 'DENNYS|PIZZA|TACOS|\bREST\b|RESTAURANT|CAFE|DOMINO|KENTUCKY|POLLO|UBER EATS|DIDI ?FOOD|STARBUCKS|GOURMET|PASTELERIA|BURGER|SUSHI|CARNES|TAQUERIA|BISTRO|COMEDOR', 'restaurantes_mty', 'restaurantes en Monterrey'),
  (230, 'jeeves_costo', 'comercio_jeeves', 'FERR|HOME DEPOT|MELLSA|TORNILLO|PLOMERAMA|SODIMAC|TRUPER|MANGUERA|TUBERIA|INTEGRINOX|ACERO|PERFILES|GRAINGER|BIRLOS|MATERIAL|HARBOR|EMPAQUE|CONEXIONES|AUTOZONE|REFACC|POCEROS|PLASTIC|MADERA', 'ferreteria_materiales', NULL),
  (231, 'jeeves_costo', 'comercio_jeeves', 'ELECTR|STEREN|GASES|AUTELIN|INFRA|SIGAL|PANAMERICANA|NAZO|DOMINION|RODAFACIL|SILVERPLAS|REFRIGERACION|PROFIRE|MOTOR|HIDRAUL|NEUMAT|RODAMIENTO|BALERO', 'electrico_mecanico', NULL),
  (232, 'jeeves_costo', 'comercio_jeeves', 'RENTA|ANDAMIO|EQUIPO|EUROPCAR|\bAVIS\b|SIXT|HERTZ|MAQUINARIA', 'renta_equipo', NULL),
  (233, 'jeeves_costo', 'comercio_jeeves', 'FLETE|PAQUETE|DHL|FEDEX|ESTAFETA|MUDANZA|ENVIO', 'fletes', NULL),
  (234, 'jeeves_costo', 'comercio_jeeves', '\bGAS\b|GASOL|PETRO|OXXOGAS|CHEVRON|SHELL|SUNOCO|MOBIL|PEMEX|G500|\bBP\b|ARCO|COMBUST', 'combustible', NULL),
  (235, 'jeeves_costo', 'comercio_jeeves', 'CASETA|CAPUFE|IAVE|AUTOPISTA|PEAJE|TELEPEAJE|PASE URBANO', 'casetas', NULL)
ON CONFLICT (destino, campo, patron) DO NOTHING;

-- ── 2. personal de oficina (EDITABLE, nace vacía) ──
CREATE TABLE IF NOT EXISTS bancos.nomina_oficina (
  id             serial      PRIMARY KEY,
  beneficiario   text,                          -- nombre tal como aparece en el concepto del banco
  cuenta_mask    text        CHECK (cuenta_mask IS NULL OR cuenta_mask ~ '^[0-9]{4}$'),  -- últimos 4 dígitos de la cuenta o CLABE
  vigente_desde  date        NOT NULL DEFAULT DATE '2026-01-01',
  vigente_hasta  date,
  nota           text,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (beneficiario IS NOT NULL OR cuenta_mask IS NOT NULL)
);

-- ── 3. partidas por identificar (EDITABLE en clasificacion, nota, fecha_decision) ──
CREATE TABLE IF NOT EXISTS bancos.partidas_identificadas (
  id              serial      PRIMARY KEY,
  movimiento_hash text        NOT NULL UNIQUE,  -- hash del movimiento en v_movimientos_validados (estable al reprocesar)
  movimiento_id   bigint,                       -- referencia al renglón de la vista cuando se detectó
  periodo         char(7),
  clasificacion   text        CHECK (clasificacion IS NULL OR clasificacion IN
                    ('costo','pago_prestamo','devolucion_aportacion','traspaso_propio','otro')),
  nota            text,
  fecha_decision  date,
  origen          text        NOT NULL DEFAULT 'manual' CHECK (origen IN ('auto','manual')),
  detectada_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 4. parámetros (EDITABLE) ──
CREATE TABLE IF NOT EXISTS bancos.er_parametros (
  clave  text PRIMARY KEY,
  valor  numeric,
  nota   text
);
INSERT INTO bancos.er_parametros (clave, valor, nota) VALUES
  ('depreciacion_vehiculos_anual_pct', 25, 'línea recta, desde el mes de compra, prorrateada por mes'),
  ('umbral_partida_por_identificar_mxn', 100000, 'cargo sin CFDI desde este monto (pesos) sale del costo a Partidas por identificar'),
  ('casa_cambio_ventana_dias', 5, 'búsqueda de la entrada equivalente'),
  ('casa_cambio_tolerancia_pct', 3, 'diferencia admitida por tipo de cambio'),
  ('conmet_costo_total_estimado_mxn', NULL, 'vacío = margen cero: venta reconocida = costo incurrido (NIIF 15 párrafo 45)'),
  ('correo_umbral_cambio_utilidad_pct', 1, 'correo si la utilidad de operación de A, B o C cambia más que esto')
ON CONFLICT (clave) DO NOTHING;

-- ── 5. bitácora de recálculos y versiones ──
CREATE TABLE IF NOT EXISTS bancos.er_calculos (
  id                bigserial   PRIMARY KEY,
  calculado_at      timestamptz NOT NULL DEFAULT now(),
  disparo           text        NOT NULL,                   -- cada30 · diario18 · manual
  firma_base        text,                                   -- estados + tablas editables (lo que vigila el disparo cada 30 min)
  firma_tablas      text,                                   -- sólo tablas editables (motivo 3 de correo)
  huella_insumos    text        NOT NULL,
  huella_resultados text        NOT NULL,
  version           integer,                                -- N de ER_2026_vN; NULL si los números no cambiaron
  motivo_correo     text,
  correo_status     integer,
  archivos          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  resumen           jsonb       NOT NULL DEFAULT '{}'::jsonb, -- conteos, cobertura, utilidades por vista (base privada)
  execution_id      text
);
CREATE INDEX IF NOT EXISTS er_calculos_version ON bancos.er_calculos (version) WHERE version IS NOT NULL;

-- ── 6. bandera del auditor por estado (sin evidencia) ──
CREATE OR REPLACE VIEW bancos.v_auditoria_estados AS
SELECT estado_id,
       bool_or(resultado = 'ROJO') AS rojo,
       max(auditoria_id)           AS auditoria_id
FROM (
  SELECT DISTINCT ON (i.estado_id, i.pata) i.estado_id, i.pata, i.resultado, i.auditoria_id
  FROM bancos.auditorias_informe i
  WHERE i.estado_id IS NOT NULL AND i.pata IN (1, 2, 3)
  ORDER BY i.estado_id, i.pata, i.auditoria_id DESC, i.id DESC
) u
GROUP BY estado_id;

-- ── 7. permisos ──
DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bancos_er') THEN
    CREATE ROLE bancos_er NOLOGIN;
  END IF;
END
$rol$;
GRANT bancos_lector TO bancos_er;
GRANT USAGE ON SCHEMA bancos TO bancos_er;

REVOKE ALL ON bancos.nomina_oficina, bancos.partidas_identificadas, bancos.er_parametros, bancos.er_calculos,
              bancos.v_auditoria_estados FROM PUBLIC, bancos_app, bancos_lector;
REVOKE ALL ON SEQUENCE bancos.nomina_oficina_id_seq, bancos.partidas_identificadas_id_seq, bancos.er_calculos_id_seq
              FROM PUBLIC, bancos_app, bancos_lector;

GRANT SELECT ON bancos.nomina_oficina, bancos.partidas_identificadas, bancos.er_parametros TO bancos_lector;
GRANT SELECT ON bancos.er_calculos, bancos.v_auditoria_estados TO bancos_er;
GRANT INSERT ON bancos.er_calculos, bancos.partidas_identificadas TO bancos_er;
GRANT USAGE ON SEQUENCE bancos.er_calculos_id_seq, bancos.partidas_identificadas_id_seq TO bancos_er;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA bancos FROM bancos_app, bancos_lector, bancos_er;
