-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0057 · V1.63i.3 (fts-conceptualizador#16 C1) · orden-odoo lee `rfc_usa_v163i` con SU credencial (comercial_app)
--
-- La V1.63i.3 leía `conceptualizador.prendido('rfc_usa_v163i')` directo en «Postgres - Leer machote». Esa función no es SECURITY
-- DEFINER y lee conceptualizador.config, que comercial_app no puede leer: el nodo tronó en producción (28-oct-2026 17:19–17:27 UTC,
-- ejecuciones 883825 del robot de a3d9c8 y 883967) y se restauró la versión anterior. Como los demás interruptores del servidor
-- (orden_v162(), orden_v163(), orden_v163e()…), va en una función SECURITY DEFINER con EXECUTE para comercial_app.
-- Aditiva. Reversa: reversas/057_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.orden_v163i3() RETURNS jsonb
LANGUAGE sql STABLE AS $o57$
  SELECT jsonb_build_object('rfc_usa', conceptualizador.prendido('rfc_usa_v163i'))
$o57$;
ALTER FUNCTION conceptualizador.orden_v163i3() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v163i3() FROM PUBLIC;
DO $gr57$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_v163i3() TO comercial_app;
  END IF;
END
$gr57$;
