-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0078 (#20 parte 14): robot_machote_v163e vuelve a la de antes (todo caso demo = CASO_DEMO). No toca datos.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv78$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'robot_machote_v163e_0078prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.robot_machote_v163e(uuid, text);
    ALTER FUNCTION conceptualizador.robot_machote_v163e_0078prev(uuid, text) RENAME TO robot_machote_v163e;
  END IF;
END
$rv78$;
DROP FUNCTION IF EXISTS conceptualizador.zz_motor_machote_v165(uuid, text);
DO $rg78$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) TO comercial_app;
  END IF;
END
$rg78$;
