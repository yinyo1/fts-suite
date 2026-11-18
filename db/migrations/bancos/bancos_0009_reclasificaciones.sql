-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0009 · reclasificación personalizada del estado de resultados: Vista E (issue #348)
--
-- La reclasificación es una CAPA encima de la base bancaria: los movimientos, estados y archivos
-- nunca se modifican. Todo es de sólo inserción; «vigente» se calcula en una vista (la última carga
-- de cada movimiento gana) y nada se borra ni se actualiza.
--   1. destinos_edo_resultados    catálogo editable de destinos (egresos e ingresos), con el renglón
--                                 del estado donde cae y si entra al resultado
--   2. reclasificaciones          una fila por movimiento y parte (particiones de hasta 5), con el
--                                 archivo CSV de origen y su huella
--   3. v_reclasificaciones        cada fila con su bandera «vigente»
--   4. reglas_edo_resultados      + columna origen ('v1' o 'reclasificación de Esteban'); destino
--                                 nuevo 'reclasificacion' (subcategoria = clave del catálogo) y campo
--                                 nuevo 'contraparte'
--   5. permisos                   bancos_er inserta en reclasificaciones y en reglas (sólo INSERT)
--
-- Sin datos bancarios ni montos (repo público), sin signos de pesos (§20 #10), nada se borra.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. catálogo de destinos ──
CREATE TABLE IF NOT EXISTS bancos.destinos_edo_resultados (
  clave          text    PRIMARY KEY,
  tipo           text    NOT NULL CHECK (tipo IN ('egreso', 'ingreso')),
  seccion        text    NOT NULL CHECK (seccion IN ('costo', 'administrativo', 'partidas', 'fuera', 'informativo', 'otros_ingresos')),
  etiqueta       text    NOT NULL,
  renglon        text,                       -- clave del renglón del estado; NULL = fuera del resultado
  entra          boolean NOT NULL,           -- entra o no al resultado
  destino_motor  text    NOT NULL,           -- destino interno de calcular.js
  orden          integer NOT NULL,
  activo         boolean NOT NULL DEFAULT true,
  creado_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bancos.destinos_edo_resultados (clave, tipo, seccion, etiqueta, renglon, entra, destino_motor, orden) VALUES
  ('costo_proveedores',        'egreso',  'costo',          'Costo · proveedores',                              'costo_prov',            true,  'costo_proveedor',           10),
  ('costo_subcontratos',       'egreso',  'costo',          'Costo · subcontratos',                             'costo_subcontratos',    true,  'costo_subcontratos',        11),
  ('costo_nomina_proyectos',   'egreso',  'costo',          'Costo · nómina de proyectos',                      'costo_nomina',          true,  'nomina_proyectos',          12),
  ('costo_jeeves',             'egreso',  'costo',          'Costo · Jeeves',                                   'costo_jeeves',          true,  'costo_jeeves_reclasificado', 13),
  ('costo_payana',             'egreso',  'costo',          'Costo · Payana',                                   'costo_payana_proy',     true,  'costo_payana_proyecto',     14),
  ('costo_otros',              'egreso',  'costo',          'Costo · otros costos',                             'costo_otros',           true,  'costo_otros',               15),
  ('admin_nomina_comun',       'egreso',  'administrativo', 'Administrativo · nómina de cuentas comunes',       'ga_nomina_oficina',     true,  'nomina_comun',              20),
  ('admin_renta',              'egreso',  'administrativo', 'Administrativo · renta',                           'ga_admin_renta_oficina', true, 'admin_renta_oficina',       21),
  ('admin_software',           'egreso',  'administrativo', 'Administrativo · software',                        'ga_admin_software',     true,  'admin_software',            22),
  ('admin_servicios_oficina',  'egreso',  'administrativo', 'Administrativo · servicios de oficina',            'ga_admin_servicios_oficina', true, 'admin_servicios_oficina', 23),
  ('admin_contabilidad_legal', 'egreso',  'administrativo', 'Administrativo · contabilidad y legal',            'ga_admin_contabilidad_legal', true, 'admin_contabilidad_legal', 24),
  ('admin_comisiones',         'egreso',  'administrativo', 'Administrativo · comisiones bancarias',            'ga_admin_comisiones_bancarias', true, 'admin_comisiones_bancarias', 25),
  ('admin_otros',              'egreso',  'administrativo', 'Administrativo · otros administrativos',           'ga_admin_otros',        true,  'admin_otros',               26),
  ('partidas',                 'egreso',  'partidas',       'Partidas por identificar',                         'partidas',              true,  'partida_reclasificada',     30),
  ('fuera_prestamo',           'egreso',  'fuera',          'Fuera del resultado · pago de préstamo',           NULL,                    false, 'excl_financiamiento',       40),
  ('fuera_devolucion_aportacion', 'egreso', 'fuera',        'Fuera del resultado · devolución de aportación a socios', NULL,             false, 'excl_devolucion_aportacion', 41),
  ('fuera_traspaso',           'egreso',  'fuera',          'Fuera del resultado · traspaso entre cuentas propias', NULL,                false, 'excl_traspaso',             42),
  ('fuera_activo_fijo',        'egreso',  'fuera',          'Fuera del resultado · activo fijo',                NULL,                    false, 'activo_fijo',               43),
  ('fuera_anticipo_proveedor', 'egreso',  'fuera',          'Fuera del resultado · anticipo a proveedor',       NULL,                    false, 'excl_anticipo_proveedor',   44),
  ('fuera_impuestos',          'egreso',  'fuera',          'Fuera del resultado · impuestos y cuotas (informativo)', NULL,              false, 'impuestos_reclasificado',   45),
  ('fuera_sin_clasificar',     'egreso',  'fuera',          'Fuera del resultado · excluir sin clasificar',     NULL,                    false, 'excl_sin_clasificar',       46),
  ('ingreso_cobro_cliente',    'ingreso', 'informativo',    'Informativo · cobro de cliente',                   NULL,                    false, 'info_cobro_cliente',        60),
  ('ingreso_anticipo_cliente', 'ingreso', 'informativo',    'Informativo · anticipo de cliente',                NULL,                    false, 'info_anticipo_cliente',     61),
  ('ingreso_financiamiento',   'ingreso', 'fuera',          'Fuera del resultado · financiamiento recibido',    NULL,                    false, 'info_entrada_financiamiento', 62),
  ('ingreso_aportacion_socio', 'ingreso', 'fuera',          'Fuera del resultado · aportación de socio',        NULL,                    false, 'info_aportacion_socio',     63),
  ('ingreso_traspaso',         'ingreso', 'fuera',          'Fuera del resultado · traspaso propio',            NULL,                    false, 'info_traspaso_recibido',    64),
  ('ingreso_devolucion',       'ingreso', 'fuera',          'Fuera del resultado · devolución',                 NULL,                    false, 'info_devolucion_recibida',  65),
  ('otros_ingresos',           'ingreso', 'otros_ingresos', 'Entra al resultado · otros ingresos',              'otros_ingresos',        true,  'otros_ingresos',            66)
ON CONFLICT (clave) DO NOTHING;

-- ── 2. reclasificaciones (sólo inserción) ──
CREATE TABLE IF NOT EXISTS bancos.reclasificaciones (
  id              bigserial   PRIMARY KEY,
  lote            text        NOT NULL,      -- huella del archivo CSV: todas las filas de un archivo comparten lote
  tipo            text        NOT NULL CHECK (tipo IN ('movimiento', 'regla')),
  movimiento_id   text,                      -- id estable (b:hash, j:id, y:id); NULL en reglas
  parte           integer     NOT NULL DEFAULT 1 CHECK (parte BETWEEN 1 AND 5),
  partes_total    integer     NOT NULL DEFAULT 1 CHECK (partes_total BETWEEN 1 AND 5),
  porcentaje      numeric(9,4) NOT NULL DEFAULT 100 CHECK (porcentaje > 0 AND porcentaje <= 100),
  destino         text        NOT NULL REFERENCES bancos.destinos_edo_resultados (clave),
  categoria_anterior text,
  proyecto        text,
  nota            text,
  regla_campo     text        CHECK (regla_campo IS NULL OR regla_campo IN ('contraparte', 'descripcion')),
  regla_texto     text,
  archivo_origen  text        NOT NULL,
  huella_archivo  text        NOT NULL,
  aplicada_en     timestamptz NOT NULL DEFAULT now(),
  aplicada_por    text        NOT NULL DEFAULT 'estebandelacruz@fts.mx',
  execution_id    text,
  CHECK ((tipo = 'movimiento' AND movimiento_id IS NOT NULL) OR (tipo = 'regla' AND regla_campo IS NOT NULL AND regla_texto IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS reclasificaciones_mov ON bancos.reclasificaciones (movimiento_id);

-- ── 3. vigencia: por movimiento gana el último lote aplicado (todas sus partes); nada se borra ──
CREATE OR REPLACE VIEW bancos.v_reclasificaciones AS
SELECT r.*,
       (r.tipo = 'movimiento' AND r.lote = u.lote AND r.aplicada_en = u.aplicada_en) AS vigente
FROM bancos.reclasificaciones r
LEFT JOIN LATERAL (
  SELECT x.lote, x.aplicada_en FROM bancos.reclasificaciones x
  WHERE x.tipo = 'movimiento' AND x.movimiento_id = r.movimiento_id
  ORDER BY x.aplicada_en DESC, x.id DESC LIMIT 1
) u ON true;

-- ── 4. reglas de Esteban ──
ALTER TABLE bancos.reglas_edo_resultados ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'v1';
ALTER TABLE bancos.reglas_edo_resultados DROP CONSTRAINT IF EXISTS reglas_edo_resultados_destino_check;
ALTER TABLE bancos.reglas_edo_resultados DROP CONSTRAINT IF EXISTS reglas_edo_resultados_campo_check;
ALTER TABLE bancos.reglas_edo_resultados ADD CONSTRAINT reglas_edo_resultados_destino_check CHECK (destino IN (
  'administrativo','excluir_fondeo_payana','excluir_fondeo_jeeves','excluir_traspaso','excluir_financiamiento',
  'impuestos_cuotas','nomina_directa','conmet','activo_fijo','casa_cambio','jeeves_admin','jeeves_costo','jeeves_extranjero',
  'reclasificacion'));
ALTER TABLE bancos.reglas_edo_resultados ADD CONSTRAINT reglas_edo_resultados_campo_check CHECK (campo IN (
  'descripcion','proveedor_odoo','categoria','comercio_jeeves','cliente_odoo','plan_analitico','contraparte'));

-- ── 5. permisos: sólo lectura para bancos_lector; bancos_er sólo inserta ──
REVOKE ALL ON bancos.destinos_edo_resultados, bancos.reclasificaciones, bancos.v_reclasificaciones FROM PUBLIC, bancos_app, bancos_lector;
REVOKE ALL ON SEQUENCE bancos.reclasificaciones_id_seq FROM PUBLIC, bancos_app, bancos_lector;
GRANT SELECT ON bancos.destinos_edo_resultados, bancos.reclasificaciones, bancos.v_reclasificaciones TO bancos_lector;
GRANT INSERT ON bancos.reclasificaciones, bancos.reglas_edo_resultados TO bancos_er;
GRANT USAGE ON SEQUENCE bancos.reclasificaciones_id_seq, bancos.reglas_edo_resultados_id_seq TO bancos_er;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA bancos FROM bancos_app, bancos_lector, bancos_er;
