-- ═══════════════════════════════════════════════════════════════════════════
-- memoria_0006 · Endurecimiento tras la revisión adversarial (issue #328)
--
-- Hallazgos de la revisión de la noche del 28-sep-2026. Se corrigen aquí, sin
-- editar migraciones ya aplicadas:
--   1. Una fila en evento_default bloqueaba crear la partición de su mes, y como
--      asegurar_particiones_desde era todo-o-nada, tumbaba también los meses
--      siguientes. Ahora cada mes va en su propio bloque y el fallo se reporta.
--   7. TRUNCATE directo a una partición (o a huella, decision, etc.) no disparaba
--      nada: el candado sólo vivía en la tabla padre de evento.
--   8. Una propuesta podía recibir dos decisiones terminales (doble clic).
--   9. memoria_captura podía pedir miles de particiones; no lo necesita.
--  10. memoria_admin tenía EXECUTE sobre funciones de motor que no puede usar.
--  12. Dos entregas simultáneas del mismo archivo creaban dos 'alta' de ubicación.
--  14. memoria_captura podía LEER identidad (teléfonos) sin necesitarlo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 + 7 + 9. Particiones: por mes, con candado de TRUNCATE, y con tope ────
CREATE OR REPLACE FUNCTION memoria.asegurar_particiones_desde(desde date, meses_adelante int DEFAULT 3)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp AS $part$
DECLARE
  d      date := date_trunc('month', desde)::date;
  fin    date;
  nombre text;
  n      int := 0;
BEGIN
  IF desde < date '2015-01-01' THEN
    RAISE EXCEPTION 'asegurar_particiones_desde: fecha % sospechosa (antes de 2015)', desde;
  END IF;
  IF meses_adelante IS NULL OR meses_adelante < 0 OR meses_adelante > 12 THEN
    RAISE EXCEPTION 'asegurar_particiones_desde: meses_adelante=% fuera de 0..12', meses_adelante;
  END IF;
  fin := (date_trunc('month', now()) + make_interval(months => meses_adelante))::date;
  WHILE d <= fin LOOP
    nombre := format('evento_%s', to_char(d, 'YYYY_MM'));
    IF to_regclass('memoria.' || nombre) IS NULL THEN
      -- Cada mes en su propio bloque: si la partición default ya tiene filas de
      -- ese mes, ESE mes falla con aviso y los demás siguen.
      BEGIN
        EXECUTE format('CREATE TABLE memoria.%I PARTITION OF memoria.evento FOR VALUES FROM (%L) TO (%L)',
                       nombre, d, (d + interval '1 month')::date);
        EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON memoria.%I '
                       'FOR EACH STATEMENT EXECUTE FUNCTION memoria.prohibir_truncate()', nombre || '_sin_truncate', nombre);
        n := n + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'asegurar_particiones_desde: % no se creó (%). Revisar filas de ese mes en evento_default',
                      nombre, SQLERRM;
      END;
    END IF;
    d := (d + interval '1 month')::date;
  END LOOP;
  RETURN n;
END
$part$;

-- La captura nunca crea particiones (lo hace el mantenimiento con fts_admin).
REVOKE EXECUTE ON FUNCTION memoria.asegurar_particiones(int) FROM memoria_captura;

-- Candado de TRUNCATE en todo lo que es de solo inserción: las particiones
-- existentes de evento (incluida la default) y cada tabla con trigger *_solo_insert.
DO $trunc$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = 'memoria.evento'::regclass
    UNION
    SELECT c.relname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace s ON s.oid = c.relnamespace
     WHERE s.nspname = 'memoria' AND NOT t.tgisinternal AND t.tgname LIKE '%\_solo\_insert'
       AND c.relname <> 'evento'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON memoria.%I', r.relname || '_sin_truncate', r.relname);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON memoria.%I '
                   'FOR EACH STATEMENT EXECUTE FUNCTION memoria.prohibir_truncate()', r.relname || '_sin_truncate', r.relname);
  END LOOP;
END
$trunc$;

-- ── 8. Una sola decisión terminal por propuesta ────────────────────────────
-- 'pospuesta' se puede repetir (se pospone y luego se decide); lo demás, una vez.
CREATE UNIQUE INDEX IF NOT EXISTS decision_una_terminal_uq
  ON memoria.decision (propuesta_id) WHERE resultado <> 'pospuesta';

-- ── 10. memoria_admin no corre motores directo (sólo vía correr_motor) ─────
REVOKE EXECUTE ON FUNCTION memoria.motor_pendientes(text, int, interval), memoria.motor_derivados_simulado(int, interval),
  memoria.motor_resumen_so(date, text), memoria.motor_tickets_simulado(int, interval),
  memoria.motor_requis_simulado(int, interval), memoria.motor_alertas_simulado(int, interval),
  memoria.motor_rebobinar(text, bigint)
  FROM memoria_admin, PUBLIC;          -- PUBLIC: Postgres da EXECUTE a todos por omisión

-- ── 12. Un solo 'alta' por archivo y ruta ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS archivo_ubicacion_alta_uq
  ON memoria.archivo_ubicacion (sha256, ruta) WHERE evento = 'alta';

-- ── 14. La captura escribe identidades pero no las lee ─────────────────────
-- (el receptor sólo hace INSERT … ON CONFLICT DO NOTHING, que no requiere SELECT)
REVOKE SELECT ON memoria.identidad FROM memoria_captura;

-- ── Batería de motores independiente del resto de la base ─────────────────
-- Antes contaba TODAS las propuestas del día / todas las es_prueba: los datos
-- sintéticos de la autoprueba del receptor (canal 'SO99001 …') la hacían fallar
-- aunque los motores estuvieran bien. Ahora cuenta sólo lo creado en esta corrida
-- (creado_en = now(), la hora de la transacción) y agrega el caso de la doble decisión.
CREATE OR REPLACE FUNCTION memoria.prueba_motores()
RETURNS jsonb LANGUAGE plpgsql AS $pm$
DECLARE res jsonb := '[]'::jsonb; corrida uuid := gen_random_uuid(); dia date := date '2026-09-27';
        ca uuid; cb uuid; cc uuid; x jsonb; pid uuid; n int; t text; ok_all boolean;
BEGIN
  BEGIN
    -- Canales sintéticos
    INSERT INTO memoria.canal (fuente, id_externo, nombre_actual, tipo_detectado, estado_captura, es_prueba)
      VALUES ('prueba','prueba-motor-so','SO99010 Obra sintética','proyecto','capturando',true) RETURNING id INTO ca;
    INSERT INTO memoria.canal (fuente, id_externo, nombre_actual, tipo_detectado, estado_captura, es_prueba)
      VALUES ('prueba','prueba-motor-compras','Compras tickets USA sintético','compras','capturando',true) RETURNING id INTO cb;
    INSERT INTO memoria.canal (fuente, id_externo, nombre_actual, tipo_detectado, estado_captura, es_prueba)
      VALUES ('prueba','prueba-motor-mat','Materiales obra sintética SO99010','materiales','capturando',true) RETURNING id INTO cc;
    PERFORM memoria.vincular_canal_por_nombre(ca);
    PERFORM memoria.vincular_canal_por_nombre(cc);

    -- Archivos sintéticos (sólo registro; no hace falta el binario para los motores)
    INSERT INTO memoria.archivo (sha256, bytes, mime, clase) VALUES
      (repeat('a1',32), 100, 'audio/ogg', 'audio'), (repeat('b2',32), 100, 'image/jpeg', 'media_general'),
      (repeat('c3',32), 100, 'image/jpeg', 'media_general');

    -- Eventos (capturado_en en el pasado para pasar la ventana de estabilidad)
    INSERT INTO memoria.evento (ocurrido_en, capturado_en, fuente, tipo, canal_id, autor_ref, texto, archivo_sha256, huella) VALUES
      (dia + time '15:00', now() - interval '1 hour', 'prueba','mensaje', ca, 'prueba:a', 'Avance: tablero 1 energizado (sintético)', NULL, repeat('1',64)),
      (dia + time '15:10', now() - interval '1 hour', 'prueba','mensaje', ca, 'prueba:b', 'Faltan 3 interruptores y hubo un casi accidente, gente sin arnés (sintético)', NULL, repeat('2',64)),
      (dia + time '15:20', now() - interval '1 hour', 'prueba','mensaje', ca, 'prueba:a', 'El cliente pidió también una salida adicional que no estaba en la cotización; queda listo el viernes (sintético)', NULL, repeat('3',64)),
      (dia + time '15:30', now() - interval '1 hour', 'prueba','audio',   ca, 'prueba:a', NULL, repeat('a1',32), repeat('4',64)),
      (dia + time '16:00', now() - interval '1 hour', 'prueba','imagen',  cb, 'prueba:c', E'Ticket proveedor: Home Depot por \x241,234.50 USD (sintético)', repeat('b2',32), repeat('5',64)),
      (dia + time '16:05', now() - interval '1 hour', 'prueba','imagen',  cb, 'prueba:c', 'foto sin monto (sintético)', repeat('c3',32), repeat('6',64)),
      (dia + 1 + time '09:00', now() - interval '1 hour', 'prueba','mensaje', cc, 'prueba:d', E'Urgente para hoy\n10 pzas de codo 3/4 galvanizado\n25 m de cable THW calibre 12', NULL, repeat('7',64));

    -- Los motores sólo ven eventos NUEVOS: se pone el cursor justo antes de éstos.
    UPDATE memoria.motor_cursor SET ultimo_seq = (SELECT min(seq) - 1 FROM memoria.evento WHERE canal_id IN (ca, cb, cc));

    -- F8 derivados
    x := memoria.motor_derivados_simulado(1000, interval '0');
    res := res || jsonb_build_object('caso','F8_derivados_producidos','esperado','3','obtenido',x->>'producidos');
    PERFORM memoria.motor_rebobinar('derivados', (x->>'desde')::bigint);
    x := memoria.motor_derivados_simulado(1000, interval '0');
    res := res || jsonb_build_object('caso','F8_reprocesar_sin_duplicar','esperado','0','obtenido',x->>'producidos');
    SELECT count(*) INTO n FROM memoria.archivo_derivado WHERE sha256 IN (repeat('a1',32),repeat('b2',32),repeat('c3',32));
    res := res || jsonb_build_object('caso','F8_derivados_totales','esperado','3','obtenido',n::text);

    -- F10 resumen por SO
    x := memoria.motor_resumen_so(dia);
    SELECT count(*)::text INTO t FROM memoria.propuesta WHERE motor = 'resumen_so' AND odoo_so = 'SO99010' AND creado_en = now();
    res := res || jsonb_build_object('caso','F10_resumen_propuestas','esperado','1','obtenido',t);
    SELECT jsonb_array_length(citas)::text INTO t FROM memoria.propuesta WHERE motor = 'resumen_so' AND odoo_so = 'SO99010';
    res := res || jsonb_build_object('caso','F10_resumen_citas','esperado','3','obtenido',t);
    x := memoria.motor_resumen_so(dia);
    res := res || jsonb_build_object('caso','F10_resumen_rerun_sin_duplicar','esperado','0','obtenido',x->>'propuestas_nuevas');
    BEGIN
      INSERT INTO memoria.propuesta (motor, motor_version, tipo, destino, clave, payload, citas, confianza)
      VALUES ('resumen_so','v0','resumen_diario','suite','sin-citas','{}','[]', 0.9);
      t := 'SE_ACEPTO';
    EXCEPTION WHEN check_violation THEN t := 'RECHAZADA';
    END;
    res := res || jsonb_build_object('caso','F10_propuesta_sin_citas','esperado','RECHAZADA','obtenido',t);
    SELECT id INTO pid FROM memoria.propuesta WHERE motor = 'resumen_so' AND odoo_so = 'SO99010';
    INSERT INTO memoria.decision (propuesta_id, resultado, payload_final, motivo, decidido_por)
      SELECT pid, 'corregida', payload || '{"resumen":"Tablero 1 energizado; faltan 3 interruptores."}', 'redacción', 'prueba-esteban'
      FROM memoria.propuesta WHERE id = pid;
    SELECT (diferencia ? 'resumen')::text INTO t FROM memoria.decision WHERE propuesta_id = pid;
    res := res || jsonb_build_object('caso','F10_corregida_guarda_diferencia','esperado','true','obtenido',t);
    BEGIN
      INSERT INTO memoria.decision (propuesta_id, resultado, payload_final, motivo, decidido_por)
        SELECT pid, 'corregida', payload, 'sin cambios', 'prueba' FROM memoria.propuesta WHERE id = pid;
      t := 'SE_ACEPTO';
    EXCEPTION WHEN raise_exception THEN t := 'RECHAZADA';
    END;
    res := res || jsonb_build_object('caso','F10_corregida_sin_cambio','esperado','RECHAZADA','obtenido',t);
    BEGIN
      INSERT INTO memoria.decision (propuesta_id, resultado, decidido_por) VALUES (pid, 'rechazada', 'prueba');
      t := 'SE_ACEPTO';
    EXCEPTION WHEN check_violation THEN t := 'RECHAZADA';
    END;
    res := res || jsonb_build_object('caso','F10_rechazo_sin_motivo','esperado','RECHAZADA','obtenido',t);
    SELECT count(*)::text INTO t FROM memoria.v_evento_publicable WHERE canal_id = ca;
    res := res || jsonb_build_object('caso','D11_nada_publicable_sin_aprobacion','esperado','0','obtenido',t);
    INSERT INTO memoria.propuesta (motor, motor_version, tipo, destino, clave, payload, citas, confianza, es_prueba)
      SELECT 'resumen_so','v0','publicar','suite','publicar-prueba', jsonb_build_object('evento_seqs', jsonb_build_array(min(seq))),
             jsonb_build_array(jsonb_build_object('evento_seq', min(seq))), 0.9, true
        FROM memoria.evento WHERE canal_id = ca AND tipo = 'mensaje' RETURNING id INTO pid;
    INSERT INTO memoria.decision (propuesta_id, resultado, payload_final, decidido_por)
      SELECT pid, 'aprobada', payload, 'prueba-esteban' FROM memoria.propuesta WHERE id = pid;
    SELECT count(*)::text INTO t FROM memoria.v_evento_publicable WHERE canal_id = ca;
    res := res || jsonb_build_object('caso','D11_publicable_tras_aprobacion','esperado','1','obtenido',t);
    BEGIN
      INSERT INTO memoria.decision (propuesta_id, resultado, motivo, decidido_por) VALUES (pid, 'rechazada', 'doble clic', 'prueba');
      t := 'SE_ACEPTO';
    EXCEPTION WHEN unique_violation THEN t := 'RECHAZADA';
    END;
    res := res || jsonb_build_object('caso','0006_segunda_decision_terminal','esperado','RECHAZADA','obtenido',t);

    -- F12 tickets
    x := memoria.motor_tickets_simulado(1000, interval '0');
    res := res || jsonb_build_object('caso','F12_tickets_propuestas','esperado','1','obtenido',x->>'propuestas');
    SELECT payload->>'monto' || ' ' || (payload->>'moneda') || ' ' || (payload->>'proveedor_texto') || ' company=' || (payload->>'company_id') INTO t
      FROM memoria.propuesta WHERE motor = 'tickets' AND es_prueba AND creado_en = now() ORDER BY creado_en DESC LIMIT 1;
    res := res || jsonb_build_object('caso','F12_ticket_extraido','esperado','1234.50 USD Home Depot company=6','obtenido',t);

    -- F13 requis
    x := memoria.motor_requis_simulado(1000, interval '0');
    res := res || jsonb_build_object('caso','F13_requis_propuestas','esperado','1','obtenido',x->>'propuestas');
    SELECT jsonb_array_length(payload->'partidas') || ' partidas, urgencia ' || (payload->>'urgencia') || ', ' || (payload->>'odoo_so') INTO t
      FROM memoria.propuesta WHERE motor = 'requis' AND es_prueba AND creado_en = now() LIMIT 1;
    res := res || jsonb_build_object('caso','F13_requi_estructurada','esperado','2 partidas, urgencia alta, SO99010','obtenido',t);

    -- F14 alertas
    x := memoria.motor_alertas_simulado(1000, interval '0');
    SELECT string_agg(payload->>'regla', ',' ORDER BY payload->>'regla') INTO t FROM memoria.propuesta WHERE motor = 'alertas' AND es_prueba AND creado_en = now();
    res := res || jsonb_build_object('caso','F14_alertas_reglas','esperado','adicional_no_cotizado,compromiso_fecha,faltante_material,seguridad','obtenido',t);

    -- F11 retención (simulacro): 13 meses después; una foto marcada como evidencia de acta
    INSERT INTO memoria.archivo_clase (sha256, clase, motivo) VALUES (repeat('c3',32), 'evidencia_acta', 'prueba');
    SELECT string_agg(accion, ',' ORDER BY sha256) INTO t FROM memoria.retencion_simular(now() + interval '13 months')
     WHERE sha256 IN (repeat('b2',32), repeat('c3',32));
    res := res || jsonb_build_object('caso','F11_13_meses_foto_y_acta','esperado','BLOQUEADO,NO_MOVER','obtenido',t);

    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'memoria_prueba_revertir';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'memoria_prueba_revertir' THEN RAISE; END IF;
  END;
  -- Aquí ya se revirtió todo lo sintético. Sólo queda el resultado.
  SELECT bool_and((r->>'esperado') = (r->>'obtenido')) INTO ok_all FROM jsonb_array_elements(res) r;
  INSERT INTO memoria.prueba_corrida (corrida, suite, caso, esperado, obtenido, ok)
    SELECT corrida, 'motores', r->>'caso', r->>'esperado', coalesce(r->>'obtenido', '(null)'), (r->>'esperado') = (r->>'obtenido')
      FROM jsonb_array_elements(res) r;
  RETURN jsonb_build_object('corrida', corrida, 'ok', ok_all,
    'aprobados', (SELECT count(*) FROM jsonb_array_elements(res) r WHERE (r->>'esperado') = (r->>'obtenido')),
    'total', jsonb_array_length(res), 'casos', res);
END
$pm$;

-- ── Read-back ──────────────────────────────────────────────────────────────
DO $rb$
DECLARE faltan int; puede bool;
BEGIN
  SELECT count(*) INTO faltan
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
   WHERE i.inhparent = 'memoria.evento'::regclass
     AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = c.relname || '_sin_truncate');
  IF faltan > 0 THEN RAISE EXCEPTION 'read-back 0006: % particiones sin candado de TRUNCATE', faltan; END IF;
  IF to_regclass('memoria.decision_una_terminal_uq') IS NULL THEN RAISE EXCEPTION 'read-back 0006: falta decision_una_terminal_uq'; END IF;
  IF to_regclass('memoria.archivo_ubicacion_alta_uq') IS NULL THEN RAISE EXCEPTION 'read-back 0006: falta archivo_ubicacion_alta_uq'; END IF;
  SELECT has_function_privilege('memoria_captura', 'memoria.asegurar_particiones(int)', 'EXECUTE') INTO puede;
  IF puede THEN RAISE EXCEPTION 'read-back 0006: memoria_captura aún ejecuta asegurar_particiones'; END IF;
  SELECT has_table_privilege('memoria_captura', 'memoria.identidad', 'SELECT') INTO puede;
  IF puede THEN RAISE EXCEPTION 'read-back 0006: memoria_captura aún lee identidad'; END IF;
END
$rb$;
