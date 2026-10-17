-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSA de la conceptualizador_0015 (V1.52.1) · MIGRACIÓN DE EMERGENCIA, solo si Esteban la pide (#5).
--
-- Vive fuera de la secuencia (db/reversas/): el runner exige las migraciones en orden y una reversa numerada sin
-- aplicar frenaría la siguiente. Si hace falta, se copia a db/migrations/conceptualizador/ con el SIGUIENTE número
-- libre (conceptualizador_00NN_reversa_0015.sql) y se corre con el runner como cualquier otra (ensayo primero).
--
-- Qué hace: borra la envoltura de api_suite de la 0015 y le devuelve el nombre a api_suite_0015prev (la de la 0014),
-- con el permiso de la app. Deja las ayudas (es_sin_aviso, robot_permiso, robot_horario) sin nadie que las llame.
-- Qué NO hace: no borra filas de config (los `robot_permiso:<caso>` que se hayan dado quedan, sin efecto en la base;
-- el robot los sigue leyendo de `config` mientras no venzan: para apagarlos, darles «quitar» ANTES de la reversa o
-- revertir también el commit del motor).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, &, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rev15$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0015prev') THEN
    DROP FUNCTION IF EXISTS conceptualizador.api_suite(jsonb);
    ALTER FUNCTION conceptualizador.api_suite_0015prev(jsonb) RENAME TO api_suite;
  END IF;
END
$rev15$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app, PUBLIC;
