-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0012 · respaldo de workflows y candado de versiones del estado de resultados (#364, sesión 1)
--
-- (En el plan de #364 se llamó «bancos_0012a»; el runner bancos/db-migrate exige bancos_NNNN_, así que
--  va como bancos_0012 y el modelo del módulo en línea pasa a bancos_0013.)
--
--   1. respaldos_workflow   copia del JSON de un workflow publicado ANTES de editarlo. Sólo inserción
--                           (un disparador bloquea UPDATE, DELETE y TRUNCATE, también para el dueño).
--                           Sólo la lee y escribe el administrador de la base: ningún rol de aplicación
--                           tiene acceso, porque el JSON trae direcciones de correo.
--   2. er_candados          arrendamiento de sólo inserción para que dos recálculos del estado de
--                           resultados no calculen la misma versión a la vez. n8n corre cada nodo de
--                           Postgres en su propia transacción, así que un pg_advisory_xact_lock en
--                           «PG - Firma» se suelta al terminar ese nodo (medido en #364, sesión 1). El
--                           candado de transacción sólo sirve para volver ATÓMICO tomar el arrendamiento;
--                           el arrendamiento es el que dura del «PG - Candado» al «PG - Guardar».
--                           Vence solo (16 min > executionTimeout de 900 s) si la corrida truena.
--   3. índice único         er_calculos(version) WHERE version IS NOT NULL. Antes se comprueba que no haya
--                           versiones repetidas; si las hubiera, la migración entera se revierte y lo dice.
--
-- Sin datos bancarios. Etiquetas de dólar con nombre (§20 #10). Nada se borra.
-- ═══════════════════════════════════════════════════════════════════════════

-- disparador común: estas tablas son de sólo inserción, para todos
CREATE OR REPLACE FUNCTION bancos.solo_insercion() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'la tabla %.% es de sólo inserción: % no está permitido', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP;
END
$fn$;
REVOKE ALL ON FUNCTION bancos.solo_insercion() FROM PUBLIC;

-- ── 1. respaldo de workflows ──
CREATE TABLE IF NOT EXISTS bancos.respaldos_workflow (
  id            bigserial   PRIMARY KEY,
  workflow_id   text        NOT NULL,
  version_id    text        NOT NULL,
  capturado_en  timestamptz NOT NULL DEFAULT now(),
  sha256        text        NOT NULL CHECK (length(sha256) = 64 AND sha256 !~ '[^0-9a-f]'),   -- sha256 del JSON canónico (llaves ordenadas)
  json          jsonb       NOT NULL,
  motivo        text
);
CREATE INDEX IF NOT EXISTS respaldos_workflow_wf ON bancos.respaldos_workflow (workflow_id, id DESC);
DROP TRIGGER IF EXISTS respaldos_workflow_solo_insercion ON bancos.respaldos_workflow;
CREATE TRIGGER respaldos_workflow_solo_insercion BEFORE UPDATE OR DELETE ON bancos.respaldos_workflow
  FOR EACH ROW EXECUTE FUNCTION bancos.solo_insercion();
DROP TRIGGER IF EXISTS respaldos_workflow_sin_truncate ON bancos.respaldos_workflow;
CREATE TRIGGER respaldos_workflow_sin_truncate BEFORE TRUNCATE ON bancos.respaldos_workflow
  FOR EACH STATEMENT EXECUTE FUNCTION bancos.solo_insercion();
REVOKE ALL ON bancos.respaldos_workflow FROM PUBLIC, bancos_app, bancos_lector, bancos_er;
REVOKE ALL ON SEQUENCE bancos.respaldos_workflow_id_seq FROM PUBLIC, bancos_app, bancos_lector, bancos_er;
DO $roles$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bancos_auditor') THEN
    EXECUTE 'REVOKE ALL ON bancos.respaldos_workflow FROM bancos_auditor';
    EXECUTE 'REVOKE ALL ON SEQUENCE bancos.respaldos_workflow_id_seq FROM bancos_auditor';
  END IF;
END $roles$;

-- ── 2. candado de versiones (arrendamiento de sólo inserción) ──
CREATE TABLE IF NOT EXISTS bancos.er_candados (
  id            bigserial   PRIMARY KEY,
  execution_id  text        NOT NULL,
  accion        text        NOT NULL CHECK (accion IN ('tomar', 'soltar')),
  en            timestamptz NOT NULL DEFAULT now(),
  vence_en      timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS er_candados_vigentes ON bancos.er_candados (accion, vence_en DESC);
DROP TRIGGER IF EXISTS er_candados_solo_insercion ON bancos.er_candados;
CREATE TRIGGER er_candados_solo_insercion BEFORE UPDATE OR DELETE ON bancos.er_candados
  FOR EACH ROW EXECUTE FUNCTION bancos.solo_insercion();
DROP TRIGGER IF EXISTS er_candados_sin_truncate ON bancos.er_candados;
CREATE TRIGGER er_candados_sin_truncate BEFORE TRUNCATE ON bancos.er_candados
  FOR EACH STATEMENT EXECUTE FUNCTION bancos.solo_insercion();
REVOKE ALL ON bancos.er_candados FROM PUBLIC, bancos_app, bancos_lector, bancos_er;
REVOKE ALL ON SEQUENCE bancos.er_candados_id_seq FROM PUBLIC, bancos_app, bancos_lector, bancos_er;
GRANT SELECT ON bancos.er_candados TO bancos_er;

-- Toma el arrendamiento si nadie más lo tiene vigente. Devuelve también la última corrida y la última
-- versión LEÍDAS DESPUÉS de tomarlo, para que el cálculo numere sobre lo que de verdad hay.
CREATE OR REPLACE FUNCTION bancos.er_tomar_candado(p_execution text, p_minutos integer DEFAULT 16)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
DECLARE v_otro text;
BEGIN
  IF p_execution IS NULL OR p_execution = '' THEN RAISE EXCEPTION 'er_tomar_candado: falta el execution_id'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bancos.er_calculos'));     -- sólo para que revisar + insertar sea atómico
  SELECT t.execution_id INTO v_otro
    FROM bancos.er_candados t
   WHERE t.accion = 'tomar' AND t.vence_en > now() AND t.execution_id <> p_execution
     AND NOT EXISTS (SELECT 1 FROM bancos.er_candados s WHERE s.accion = 'soltar' AND s.execution_id = t.execution_id AND s.id > t.id)
   ORDER BY t.id DESC LIMIT 1;
  IF v_otro IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'ocupado_por', v_otro);
  END IF;
  INSERT INTO bancos.er_candados (execution_id, accion, vence_en)
  VALUES (p_execution, 'tomar', now() + make_interval(mins => greatest(1, least(p_minutos, 60))));
  RETURN jsonb_build_object('ok', true,
    'ultimo', (SELECT to_jsonb(c) FROM (SELECT id, calculado_at, disparo, firma_base, firma_tablas, huella_resultados, version, resumen
                                          FROM bancos.er_calculos ORDER BY id DESC LIMIT 1) c),
    'ultima_version', (SELECT to_jsonb(c) FROM (SELECT id, calculado_at, version, huella_resultados, resumen
                                                  FROM bancos.er_calculos WHERE version IS NOT NULL ORDER BY id DESC LIMIT 1) c));
END
$fn$;

-- Suelta el arrendamiento de esta corrida (inserta la marca; nada se borra). Devuelve 1 si había uno vigente.
CREATE OR REPLACE FUNCTION bancos.er_soltar_candado(p_execution text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
DECLARE v_habia integer;
BEGIN
  SELECT count(*) INTO v_habia FROM bancos.er_candados t
   WHERE t.accion = 'tomar' AND t.execution_id = p_execution
     AND NOT EXISTS (SELECT 1 FROM bancos.er_candados s WHERE s.accion = 'soltar' AND s.execution_id = t.execution_id AND s.id > t.id);
  IF v_habia > 0 THEN
    INSERT INTO bancos.er_candados (execution_id, accion, vence_en) VALUES (p_execution, 'soltar', now());
  END IF;
  RETURN least(v_habia, 1);
END
$fn$;
REVOKE ALL ON FUNCTION bancos.er_tomar_candado(text, integer), bancos.er_soltar_candado(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bancos.er_tomar_candado(text, integer), bancos.er_soltar_candado(text) TO bancos_er;

-- ── 3. índice único de versiones (con guarda: si hay repetidas, no se crea y se dice cuáles) ──
DO $guarda$
DECLARE v_rep text;
BEGIN
  SELECT string_agg('v' || version || ' ×' || n, ', ' ORDER BY version) INTO v_rep
    FROM (SELECT version, count(*) AS n FROM bancos.er_calculos WHERE version IS NOT NULL GROUP BY version HAVING count(*) > 1) d;
  IF v_rep IS NOT NULL THEN
    RAISE EXCEPTION 'bancos.er_calculos tiene versiones repetidas (%): no se crea el índice único; ver #364', v_rep;
  END IF;
END
$guarda$;
CREATE UNIQUE INDEX IF NOT EXISTS er_calculos_version_unica ON bancos.er_calculos (version) WHERE version IS NOT NULL;
