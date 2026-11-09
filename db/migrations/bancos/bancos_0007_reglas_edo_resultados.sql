-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0007 · reglas editables del estado de resultados (issue #348, enlazado a #331 y #346)
--
-- El estado de resultados 2026 v0 lee la base bancaria SOLO por las vistas v_* con el rol
-- bancos_lector. Las decisiones de "a qué renglón va un egreso" viven aquí, en una tabla que
-- se edita sin desplegar nada:
--   destino = administrativo           gasto administrativo LITERAL (renta, luz, agua, internet,
--                                      teléfono, software, contabilidad/legal, comisiones, papelería)
--             excluir_fondeo_payana    fondeo a Payana (se usan sus pagos, diario 74)
--             excluir_fondeo_jeeves    fondeo a Jeeves (se usan sus consumos, diario 61)
--             excluir_traspaso         traspaso entre cuentas propias que no es General→Nómina
--             excluir_financiamiento   pago de préstamo / crédito
--             impuestos_cuotas         SAT, IMSS/SIPARE, INFONAVIT, ISN (renglón informativo)
--             nomina_directa           pago de nómina hecho desde la General (no por fondeo)
--             conmet                   pago ligado al proyecto Conmet (renglón propio)
--   campo   = descripcion              texto impreso en el estado de cuenta
--             proveedor_odoo           nombre del proveedor de la factura ligada en Odoo
--             categoria                categoría del clasificador del servicio (v_movimientos_validados)
--   patron  = expresión regular, sin distinguir mayúsculas.
-- Todo lo que no caiga en una regla es COSTO DE VENTAS (regla de Esteban).
--
-- Reglas del módulo: nada se borra (sin DELETE ni TRUNCATE para los roles de la aplicación), sin
-- datos bancarios ni montos (repo público), ningún signo de pesos (§20 #10).
-- OJO: bancos_0001 dejó ALTER DEFAULT PRIVILEGES (SELECT, INSERT a bancos_app en toda tabla
-- nueva). Aquí se revoca todo y se concede sólo SELECT a bancos_lector.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bancos.reglas_edo_resultados (
  id           serial      PRIMARY KEY,
  prioridad    integer     NOT NULL,
  destino      text        NOT NULL CHECK (destino IN ('administrativo','excluir_fondeo_payana','excluir_fondeo_jeeves',
                                                       'excluir_traspaso','excluir_financiamiento','impuestos_cuotas',
                                                       'nomina_directa','conmet')),
  campo        text        NOT NULL CHECK (campo IN ('descripcion','proveedor_odoo','categoria')),
  patron       text        NOT NULL,
  subcategoria text,
  activo       boolean     NOT NULL DEFAULT true,
  nota         text,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destino, campo, patron)
);

REVOKE ALL ON bancos.reglas_edo_resultados FROM bancos_app, bancos_lector;
REVOKE ALL ON SEQUENCE bancos.reglas_edo_resultados_id_seq FROM bancos_app, bancos_lector;
GRANT SELECT ON bancos.reglas_edo_resultados TO bancos_lector;

INSERT INTO bancos.reglas_edo_resultados (prioridad, destino, campo, patron, subcategoria, nota) VALUES
  (10, 'excluir_fondeo_payana', 'descripcion', 'PAYAN|PAYABA', 'payana', 'fondeo a Payana; tolera el error de dedo PAYABA'),
  (11, 'excluir_fondeo_jeeves', 'descripcion', 'JE+V+E+[SD]', 'jeeves', 'fondeo/pago a Jeeves; tolera JEVEES y JEEVED'),
  (20, 'excluir_traspaso', 'descripcion', 'TRASPASO ENTRE CUENTAS|(COMPRA|VENTA) (DE )?(DOLARES|DIVISAS)|CAMBIO DE DIVISAS', 'usd_mxn', 'MXN↔USD entre cuentas propias'),
  (30, 'excluir_financiamiento', 'descripcion', 'COBRO AUTOMATICO RECIBO PREST|PAGO DE CREDITO|AMORTIZACI', 'prestamo', 'pago de préstamo bancario'),
  (40, 'impuestos_cuotas', 'descripcion', '\bSAT\b|SERVICIO DE ADMINISTRACION TRIBUTARIA', 'sat', NULL),
  (41, 'impuestos_cuotas', 'descripcion', 'SIPARE|IMSS|INFONAVIT', 'imss_infonavit', 'SIPARE paga IMSS, RCV e INFONAVIT juntos'),
  (42, 'impuestos_cuotas', 'descripcion', 'SECRETARIA DE FINANZ|TESORERIA|IMPUESTO SOBRE N', 'isn', 'SUPUESTO: el pago mensual a la Secretaría de Finanzas de NL es el ISN'),
  (50, 'nomina_directa', 'descripcion', 'N[OÓ]MINA', 'directa_general', 'sólo cargos de la General que no son traspaso a Nómina'),
  (60, 'conmet', 'descripcion', 'CONMET', 'conmet', 'pagos del proyecto Conmet (SO11771)'),
  (61, 'conmet', 'proveedor_odoo', 'MAYOREO ELECTRICO', 'mayoreo_electrico', 'proveedor del proyecto Conmet'),
  (70, 'administrativo', 'categoria', 'comision_bancaria', 'comisiones_bancarias', NULL),
  (71, 'administrativo', 'descripcion', 'TELCEL|TELMEX|TOTALPLAY|TOTAL PLAY|IZZI|AXTEL|MEGACABLE', 'telefono_internet', NULL),
  (72, 'administrativo', 'descripcion', 'COMISION FEDERAL|\bCFE\b|AGUA Y DRENAJE|SERVICIOS DE AGUA', 'luz_agua', NULL),
  (73, 'administrativo', 'proveedor_odoo', 'TELCEL|TELMEX|TOTALPLAY|TOTAL PLAY|IZZI|AXTEL|MEGACABLE|RADIOMOVIL', 'telefono_internet', NULL),
  (74, 'administrativo', 'proveedor_odoo', 'COMISION FEDERAL|\bCFE\b|AGUA Y DRENAJE', 'luz_agua', NULL),
  (75, 'administrativo', 'proveedor_odoo', 'MICROSOFT|GOOGLE|ODOO|ADOBE|AMAZON WEB|ZOOM|DROPBOX|AUTODESK|OPENAI|ANTHROPIC', 'software', NULL),
  (76, 'administrativo', 'proveedor_odoo', 'OFFICE DEPOT|OFFICEMAX|LUMEN|PAPELER', 'papeleria', NULL),
  (77, 'administrativo', 'proveedor_odoo', 'CONTADOR|CONTABLE|NOTARI|ABOGAD|DESPACHO JURIDICO|LEGAL', 'contabilidad_legal', 'por nombre; revisar con Esteban'),
  (78, 'administrativo', 'proveedor_odoo', 'ARRENDA|INMOBILIARIA|RENTA DE OFICINA', 'renta_oficina', 'por nombre; revisar con Esteban')
ON CONFLICT (destino, campo, patron) DO NOTHING;
