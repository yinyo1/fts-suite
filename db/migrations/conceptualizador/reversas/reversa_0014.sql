-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0015 · REVERSA DE LA 0014 · MIGRACIÓN DE EMERGENCIA.
--
--   ⚠ NO SE APLICA salvo que Esteban lo pida por escrito (#5). No forma parte del despliegue normal: es la
--     reversa escrita del paso a). Si la 0014 nunca se aplicó, correrla no cambia nada que importe.
--
-- Qué hace: deja la base contestando EXACTAMENTE como la 0013.
--   · api_motor, api_suite y api_respaldo: borra las envolturas de la 0014 y les devuelve el nombre a las de antes
--     (api_*_0014prev), con los mismos permisos que tenían en la 0013 (app; api_suite además PUBLIC, como estaba).
--   · agente_estado, uso_hoy y aviso_tope: vuelven al cuerpo de la 0013, tomado de las copias *_0013 que dejó la 0014
--     (copiadas por programa de la 0013, la 0006 y la 0005+0008).
--   · Vista consumo_registro: la de la 0011 (sin el renglón de la sombra).
--   · CHECKs que la 0014 abrió (trabajo, evento, latido, consumo_avance, consumo_aviso, cambio_sesion): vuelven a los
--     valores de la 0013. Si ya hay filas con valores de la 0014 (p. ej. un trabajo «detenido»), el CHECK se pone
--     NOT VALID: frena lo nuevo igual que la 0013 y no toca las filas que ya están.
-- Qué NO hace: no borra datos, tablas (proceso, config_cambio, experimento_par), columnas, índices ni filas de config
-- (interruptores incluidos). Las funciones nuevas de la 0014 quedan, sin nadie que las llame.
-- Límite conocido: las columnas nuevas aparecen en lo que la 0013 arma con to_jsonb(fila) (p. ej. caso.arranque_auto,
-- trabajo.error_ultimo); quitarlas exigiría borrar columnas con datos.
-- Para volver a V1.52: el runner no reaplica la 0014 (YA_APLICADA), así que se sube una 0016 con el MISMO contenido
-- de la 0014 (su renombre una sola vez vuelve a funcionar; sql-0015-reversa.sh lo prueba aplicándola encima).
-- El runner (conceptualizador/db-migrate) aplica UNA migración por corrida y solo la que se le nombra: tener este
-- archivo en el repo no lo aplica.
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, &, acento grave o dígito;
-- etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Puertas: la de antes recupera su nombre ────────────────────────────────
DO $rev15a$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['api_motor','api_suite','api_respaldo'] LOOP
    IF to_regprocedure('conceptualizador.' || v || '_0014prev(jsonb)') IS NOT NULL THEN
      EXECUTE format('DROP FUNCTION IF EXISTS conceptualizador.%I(jsonb)', v);
      EXECUTE format('ALTER FUNCTION conceptualizador.%I(jsonb) RENAME TO %I', v || '_0014prev', v);
    END IF;
  END LOOP;
END
$rev15a$;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_suite(jsonb),
                          conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_respaldo(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO PUBLIC;   -- así estaba en la 0013

-- ── agente_estado, uso_hoy, aviso_tope: el cuerpo de la 0013 ───────────────
DO $rev15b$
BEGIN
  IF to_regprocedure('conceptualizador.agente_estado_0013(uuid)') IS NOT NULL THEN
    EXECUTE format('CREATE OR REPLACE FUNCTION conceptualizador.agente_estado(p_caso uuid) RETURNS jsonb LANGUAGE sql STABLE AS %L',
                   (SELECT prosrc FROM pg_proc WHERE oid = 'conceptualizador.agente_estado_0013(uuid)'::regprocedure));
  END IF;
  IF to_regprocedure('conceptualizador.uso_hoy_0013(text)') IS NOT NULL THEN
    EXECUTE format('CREATE OR REPLACE FUNCTION conceptualizador.uso_hoy(p_actor text) RETURNS jsonb LANGUAGE sql STABLE AS %L',
                   (SELECT prosrc FROM pg_proc WHERE oid = 'conceptualizador.uso_hoy_0013(text)'::regprocedure));
  END IF;
  IF to_regprocedure('conceptualizador.aviso_tope_0013(text,text,jsonb)') IS NOT NULL THEN
    EXECUTE format('CREATE OR REPLACE FUNCTION conceptualizador.aviso_tope(p_actor text, p_tipo text, p_uso jsonb) RETURNS text LANGUAGE plpgsql AS %L',
                   (SELECT prosrc FROM pg_proc WHERE oid = 'conceptualizador.aviso_tope_0013(text,text,jsonb)'::regprocedure));
  END IF;
END
$rev15b$;

-- ── Vista del consumo: la de la 0011 ───────────────────────────────────────
CREATE OR REPLACE VIEW conceptualizador.consumo_registro AS
  SELECT k.created_at, conceptualizador.dia_uso(k.created_at) AS dia, k.caso_id, ca.carpeta, false AS proactivo,
         k.tipo_trabajo AS motivo, k.trabajo_id, NULL::text AS pasada, k.input_tokens, k.output_tokens, k.cache_leida, k.cache_escrita,
         round(k.input_tokens + 1.25 * k.cache_escrita + 0.10 * k.cache_leida + 5 * k.output_tokens)::bigint AS ponderado,
         k.llamadas_modelo, coalesce(k.busquedas_precio, (k.pasos->>'web')::int, 0) AS busquedas_precio, k.renglones, k.segundos,
         coalesce(k.resultado, 'atendido') AS resultado, NULL::text AS tope
    FROM conceptualizador.consumo k JOIN conceptualizador.caso ca ON ca.id = k.caso_id
  UNION ALL
  SELECT a.created_at, a.dia, a.caso_id, a.carpeta, true, a.motivo, NULL::bigint, a.pasada, a.input_tokens, a.output_tokens, a.cache_leida, a.cache_escrita,
         a.ponderado, a.llamadas_modelo, a.busquedas_precio, a.renglones, a.segundos, a.resultado, a.tope
    FROM conceptualizador.consumo_avance a;

-- ── CHECKs de la 0013 (NOT VALID solo si ya hay filas de la 0014) ──────────
DO $rev15c$
DECLARE x record;
BEGIN
  FOR x IN SELECT * FROM (VALUES
    ('cambio_sesion', 'cambio_sesion_tipo_check', 'tipo IN (''renombrar'',''archivar'',''desarchivar'',''fijar'',''desfijar'',''prueba'',''no_prueba'',''empresa'',''ciudad'',''modo'')'),
    ('consumo_avance', 'consumo_avance_resultado_check', 'resultado IN (''avanzo'',''sin_cambio'',''cortado_tope'',''rechazado_decreto'',''error'')'),
    ('consumo_aviso', 'consumo_aviso_tipo_check', 'tipo IN (''pct80'',''pct100'',''diario'',''pausa24'')'),
    ('evento', 'evento_tipo_check', 'tipo IN (''aceptar'',''rechazar'',''correccion'',''precio_real'',''agregar'',''cierra'',''accion'',''ejecucion'',''continuacion'',''palomeada'',''prueba'',''que_falta'',''ciudad'')'),
    ('latido', 'latido_estado_check', 'estado IN (''activo'',''pausado'',''apagado'')'),
    ('trabajo', 'trabajo_estado_check', 'estado IN (''pendiente'',''tomado'',''listo'',''error'')')) c(tabla, nombre, def) LOOP
    EXECUTE format('ALTER TABLE conceptualizador.%I DROP CONSTRAINT IF EXISTS %I', x.tabla, x.nombre);
    BEGIN
      EXECUTE format('ALTER TABLE conceptualizador.%I ADD CONSTRAINT %I CHECK (%s)', x.tabla, x.nombre, x.def);
    EXCEPTION WHEN check_violation THEN
      EXECUTE format('ALTER TABLE conceptualizador.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', x.tabla, x.nombre, x.def);
      RAISE NOTICE 'reversa 0015: % queda NOT VALID (hay filas con valores de la 0014; no se tocan)', x.nombre;
    END;
  END LOOP;
END
$rev15c$;
