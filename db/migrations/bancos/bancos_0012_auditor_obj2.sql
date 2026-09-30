-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0012 · el auditor lee lo que necesita el Objetivo 2 (issue #365)
--
-- Sólo AGREGA permisos de lectura al rol bancos_auditor (bancos_0006): la clasificación
-- vigente, las reglas del servicio y del estado de resultados, y el cotejo del servicio
-- contra Odoo (el segundo camino del cotejo propio del auditor). No escribe datos,
-- no cambia tablas ni quita nada.
-- ═══════════════════════════════════════════════════════════════════════════
GRANT SELECT ON bancos.clasificacion, bancos.reglas, bancos.reglas_edo_resultados, bancos.cotejo_odoo TO bancos_auditor;
GRANT SELECT ON bancos.clasificacion_vigente TO bancos_auditor;
