-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0002 · estados vigentes (fts-bancos, issue #331)
--
-- Regla 2 del esquema: un archivo reprocesado con otro parser crea un estado
-- NUEVO y el anterior se queda. Esta vista es la única forma de leer "el
-- estado que vale hoy" de cada archivo: el de id más alto (el más reciente).
-- Todo lo que se lee para reportes, V3, huecos, pares y cotejo pasa por aquí;
-- los renglones viejos siguen en bancos.estados como historia.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW bancos.estados_vigentes AS
SELECT DISTINCT ON (e.archivo_id) e.*
FROM bancos.estados e
ORDER BY e.archivo_id, e.id DESC;

COMMENT ON VIEW bancos.estados_vigentes IS
  'Un renglón por archivo: su estado más reciente (último parser). Los anteriores se conservan en bancos.estados.';

GRANT SELECT ON bancos.estados_vigentes TO bancos_app;
