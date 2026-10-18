-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0019 (V1.54 E3) · MIGRACIÓN DE EMERGENCIA, solo si Esteban la pide (fts-conceptualizador#11).
--
-- Vive fuera de la secuencia (db/reversas/): si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE
-- número libre y se corre con el runner como cualquier otra (ensayo primero).
-- Qué hace: borra las envolturas de api_correo y api_suite de la 0019 y les devuelve el nombre (0019prev → la de antes),
-- con el permiso de la app; borra la clave tope_envios_cliente_dia si sigue en '10'; el candado de orden-odoo queda en false.
-- Qué NO hace: no borra la tabla envio_cliente ni sus filas (quedan sin nadie que las use).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev19$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0019prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_correo(jsonb);
    ALTER FUNCTION conceptualizador.api_correo_0019prev(jsonb) RENAME TO api_correo;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0019prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0019prev(jsonb) RENAME TO api_suite;
  END IF;
END
$rev19$;
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb), conceptualizador.api_suite(jsonb) TO conceptualizador_app;
DELETE FROM conceptualizador.config WHERE clave = 'tope_envios_cliente_dia' AND valor = '10';
-- El candado de orden-odoo responde siempre «abierto» (la consulta del workflow sigue funcionando si ya lo lee).
CREATE OR REPLACE FUNCTION conceptualizador.condiciones_cerradas_machote(p_machote uuid) RETURNS boolean
LANGUAGE sql STABLE AS $ccm19r$ SELECT false $ccm19r$;
