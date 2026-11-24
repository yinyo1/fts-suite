-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0005 · arranque de la solicitud el lunes 28-sep-2026 (issue #331)
--
-- Decisión de Esteban (28-sep): el primer correo de solicitud sale HOY lunes
-- 28-sep-2026 a las 10:00 America/Monterrey, no el martes 29 a las 9:00.
-- bancos.f_solicitud() no envía antes de `solicitud_desde`; se adelanta un día.
-- La hora exacta (10:00, envío único) la pone el disparador del workflow
-- fts_bancos_solicitud_v2; desde el martes rige la regla normal (9:00 hábil).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE bancos.parametros
   SET valor = '2026-09-28',
       descripcion = 'Primer día en que la solicitud puede salir (arranque: lunes 28-sep-2026 a las 10:00, decisión de Esteban).',
       actualizado_at = now()
 WHERE clave = 'solicitud_desde';
