-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0013 · fecha de apertura de cada cuenta, como dato con su evidencia (issue #352)
--
-- (El plan de #364 mencionaba un «bancos_0013» para el modelo del módulo en línea; esa
--  migración no existe todavía y tomará el siguiente número libre.)
--
-- Una cuenta no debe meses de antes de existir. Hasta hoy la solicitud pedía BBVA Nómina desde
-- enero 2024, y la cuenta se abrió el 19-abr-2024: enero a marzo eran imposibles de entregar.
--
--   1. bancos.cuentas.apertura (date) + apertura_evidencia (text). Una apertura sin evidencia no
--      se admite. Vacía = la cuenta ya existía antes del inicio de la cadena; NUNCA se inventa.
--   2. BBVA Nómina (journal 96): abrió el 2024-04-19. Evidencia: su estado de abril 2024 trae el
--      renglón C98 «APERTURA DE CUENTA», saldo inicial 0.00, periodo del 19 al 30 de abril.
--      General (journal 8) y USD (journal 75) quedan vacías: ya existían antes de enero 2024.
--   3. La solicitud de BBVA arranca en el mayor entre su periodo_inicio y el mes de apertura.
--      Es un UPDATE de datos sobre las filas BBVA: f_faltantes no cambia, ni Jeeves ni Payana.
--   El servicio (pipeline.v3_y_huecos) lee la misma columna: no exige meses antes de la apertura,
--   el mes de apertura es «primero» en V3, y los huecos de antes se cierran con una nota.
--
-- Sin datos bancarios. Sin signos de pesos (§20 #10). Nada se borra.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE bancos.cuentas ADD COLUMN IF NOT EXISTS apertura date;
ALTER TABLE bancos.cuentas ADD COLUMN IF NOT EXISTS apertura_evidencia text;
ALTER TABLE bancos.cuentas DROP CONSTRAINT IF EXISTS cuentas_apertura_con_evidencia;
ALTER TABLE bancos.cuentas ADD CONSTRAINT cuentas_apertura_con_evidencia
  CHECK (apertura IS NULL OR length(btrim(coalesce(apertura_evidencia, ''))) > 0);
COMMENT ON COLUMN bancos.cuentas.apertura IS 'Día en que se abrió la cuenta. Vacía = ya existía antes del inicio de la cadena (nunca se inventa). La cadena V3, los huecos y la solicitud arrancan en su mes.';
COMMENT ON COLUMN bancos.cuentas.apertura_evidencia IS 'De dónde sale la fecha de apertura (estado de cuenta, renglón, saldo inicial).';

UPDATE bancos.cuentas
   SET apertura = DATE '2024-04-19',
       apertura_evidencia = 'Estado BBVA Nómina abril 2024: renglón C98 APERTURA DE CUENTA del 19/04/2024, saldo inicial 0.00, periodo 19/04/2024 al 30/04/2024 (issue #352)'
 WHERE journal_odoo = 96 AND banco = 'BBVA' AND apertura IS NULL;

UPDATE bancos.fuentes_solicitud f
   SET periodo_inicio = to_char(c.apertura, 'YYYY-MM')
  FROM bancos.cuentas c
 WHERE f.tipo = 'bbva' AND c.journal_odoo = f.journal_odoo AND c.activa AND c.apertura IS NOT NULL
   AND to_char(c.apertura, 'YYYY-MM') > f.periodo_inicio;
