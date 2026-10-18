-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0020 (V1.55, canario lector) · MIGRACIÓN DE EMERGENCIA, solo si Esteban la pide.
--
-- Vive fuera de la secuencia (db/reversas/): si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE
-- número libre y se corre con el runner como cualquier otra (ensayo primero).
-- Qué hace: quita las envolturas de api_suite y api_correo de la 0020 y les devuelve el nombre (0020prev → la de antes),
-- con el permiso de la app; deja `lectores` en '' (nadie es lector).
-- Qué NO hace: no borra el caso demo del canario ni sus 2 mensajes (demo = true, sin carpeta: nadie los usa) ni es_lector.
-- ⚠ Con la reversa el usuario `canario`, si existe en suite_usuarios, vuelve a poder escribir: desactívalo ANTES.
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev20$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0020prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0020prev(jsonb) RENAME TO api_suite;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0020prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_correo(jsonb);
    ALTER FUNCTION conceptualizador.api_correo_0020prev(jsonb) RENAME TO api_correo;
  END IF;
END
$rev20$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb), conceptualizador.api_correo(jsonb) TO conceptualizador_app;
UPDATE conceptualizador.config SET valor = '' WHERE clave = 'lectores';
