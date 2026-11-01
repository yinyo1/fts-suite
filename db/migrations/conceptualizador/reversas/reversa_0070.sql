-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0070 (#20 parte 6): api_motor vuelve a la de antes y se quita voz_rafaga_de_chat.
-- Las ráfagas de chat ya creadas se quedan en voz_rafaga (son registros de lo que pasó; no estorban: son como las de la vista).
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv70$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0070prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0070prev(jsonb) RENAME TO api_motor;
  END IF;
  DROP FUNCTION IF EXISTS conceptualizador.voz_rafaga_de_chat(bigint);
END
$rv70$;
DO $gr70v$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$gr70v$;
