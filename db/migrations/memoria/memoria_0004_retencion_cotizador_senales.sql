-- ═══════════════════════════════════════════════════════════════════════════
-- memoria_0004_retencion_cotizador_senales.sql · F11, F15, F16 (#328)
--   · Retención en SIMULACRO (no mueve ni borra nada).
--   · Ganchos del cotizador: precio_observado y so_resultado (sólo estructura).
--   · Señales para el watchdog.
--   · Batería de pruebas de motores que corre DENTRO de la base y revierte sus
--     propios datos (sub-transacción), dejando sólo el resultado en prueba_corrida.
-- Idempotente. Sin dólar-dólar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Retención (F11) ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW memoria.v_archivo_estado AS
  SELECT a.sha256, a.bytes, a.mime, a.rol, a.nivel_objetivo, a.primera_vez,
         coalesce((SELECT c.clase FROM memoria.archivo_clase c WHERE c.sha256 = a.sha256 ORDER BY c.en DESC, c.id DESC LIMIT 1), a.clase) AS clase_vigente,
         EXISTS (SELECT 1 FROM memoria.archivo_ubicacion u WHERE u.sha256 = a.sha256 AND u.proveedor = 'azure_blob'
                   AND u.evento = 'verificada' AND u.registrado_en > now() - interval '24 hours') AS copia_fria_verificada_24h,
         EXISTS (SELECT 1 FROM memoria.vinculo_vigente v WHERE v.origen_tipo = 'archivo' AND v.origen_id = a.sha256
                   AND v.destino_tipo = 'memoria:acta') AS ligado_a_acta
    FROM memoria.archivo a;

-- Qué haría el job de retención si "ahora" fuera p_ahora. NO MUEVE NADA.
CREATE OR REPLACE FUNCTION memoria.retencion_simular(p_ahora timestamptz DEFAULT now())
RETURNS TABLE (sha256 char(64), clase text, rol text, edad_dias int, accion text, motivo text)
LANGUAGE sql STABLE AS $ret$
  SELECT s.sha256, s.clase_vigente, s.rol, (extract(epoch FROM p_ahora - s.primera_vez) / 86400)::int,
    CASE
      WHEN s.clase_vigente = 'evidencia_acta' OR s.ligado_a_acta THEN 'NO_MOVER'
      WHEN s.rol IN ('miniatura','comprimido') THEN 'RETENER'
      WHEN s.clase_vigente = 'ticket' AND p_ahora - s.primera_vez < interval '5 years' AND p_ahora - s.primera_vez >= interval '12 months'
        THEN CASE WHEN s.copia_fria_verificada_24h THEN 'MOVER_A_FRIO' ELSE 'BLOQUEADO' END
      WHEN s.clase_vigente = 'ticket' THEN 'RETENER'
      WHEN s.nivel_objetivo = 'frio' THEN CASE WHEN s.copia_fria_verificada_24h THEN 'MOVER_A_FRIO' ELSE 'PENDIENTE_FRIO' END
      WHEN p_ahora - s.primera_vez >= interval '12 months'
        THEN CASE WHEN s.copia_fria_verificada_24h THEN 'MOVER_A_FRIO' ELSE 'BLOQUEADO' END
      ELSE 'RETENER'
    END,
    CASE
      WHEN s.clase_vigente = 'evidencia_acta' OR s.ligado_a_acta THEN 'evidencia de acta: nunca se mueve'
      WHEN s.rol IN ('miniatura','comprimido') THEN 'versión para consulta: vive en caliente'
      WHEN s.clase_vigente = 'ticket' AND p_ahora - s.primera_vez < interval '12 months' THEN 'ticket de menos de 12 meses'
      WHEN s.clase_vigente = 'ticket' AND p_ahora - s.primera_vez < interval '5 years'
        THEN CASE WHEN s.copia_fria_verificada_24h THEN 'ticket >12 meses con copia fría verificada (inmutable 5 años en frío)'
                  ELSE 'ticket >12 meses SIN copia fría verificada por huella: no se toca' END
      WHEN s.clase_vigente = 'ticket' THEN 'ticket de más de 5 años: sólo se retira si ninguna decisión lo cita (revisión humana)'
      WHEN s.nivel_objetivo = 'frio' THEN CASE WHEN s.copia_fria_verificada_24h THEN 'original para frío con copia verificada'
                  ELSE 'original para frío: falta destino frío (Azure, D5) o su verificación' END
      WHEN p_ahora - s.primera_vez >= interval '12 months'
        THEN CASE WHEN s.copia_fria_verificada_24h THEN 'más de 12 meses y copia fría verificada <24 h'
                  ELSE 'más de 12 meses SIN copia fría verificada por huella: no se retira' END
      ELSE 'menos de 12 meses'
    END
  FROM memoria.v_archivo_estado s;
$ret$;

CREATE OR REPLACE FUNCTION memoria.ruido_simular(p_ahora timestamptz DEFAULT now())
RETURNS TABLE (accion text, renglones bigint)
LANGUAGE sql STABLE AS $rui$
  SELECT 'PURGAR_BUFFER_Y_CONTAR', count(*) FROM memoria.ruido_buffer WHERE capturado_en < p_ahora - interval '30 days'
  UNION ALL
  SELECT 'CONSERVAR_BUFFER', count(*) FROM memoria.ruido_buffer WHERE capturado_en >= p_ahora - interval '30 days';
$rui$;

-- ── Ganchos del cotizador (F15, sólo estructura) ──────────────────────────
CREATE OR REPLACE FUNCTION memoria.normalizar_descripcion(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $nor$
  SELECT btrim(regexp_replace(lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ"', 'AEIOUUNaeiouun ')), '[^a-z0-9/.]+', ' ', 'g'));
$nor$;

CREATE TABLE IF NOT EXISTS memoria.precio_observado (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fuente          text NOT NULL,
  fuente_ref      text NOT NULL,
  odoo_product_id integer NULL,
  descripcion     text NOT NULL,
  descripcion_norm text GENERATED ALWAYS AS (memoria.normalizar_descripcion(descripcion)) STORED,
  marca           text NULL,
  modelo          text NULL,
  proveedor_partner_id integer NULL,
  cantidad        numeric(14,4) NOT NULL,
  unidad          text NULL,
  precio_unitario numeric(14,4) NOT NULL,
  moneda          char(3) NOT NULL,
  tipo_cambio_mxn numeric(12,6) NULL,
  fecha           date NOT NULL,
  company_id      integer NOT NULL,
  odoo_so         text NULL,
  registrado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT precio_obs_uq UNIQUE (fuente, fuente_ref),
  CONSTRAINT precio_obs_fuente_ck CHECK (fuente IN ('odoo:purchase.order.line','odoo:account.move.line','cotizacion_proveedor','ticket')),
  CONSTRAINT precio_obs_positivo_ck CHECK (precio_unitario >= 0 AND cantidad > 0)
);
COMMENT ON TABLE memoria.precio_observado IS
  'Lo que DE VERDAD costó, con fecha y proveedor. Sólo lo alimentan POs/bills reales (nunca la IA). Regla de #127: precio de lista del fabricante es el costo base; descuentos de compras son margen realizado.';
DROP TRIGGER IF EXISTS precio_observado_solo_insert ON memoria.precio_observado;
CREATE TRIGGER precio_observado_solo_insert BEFORE UPDATE OR DELETE ON memoria.precio_observado
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

CREATE OR REPLACE VIEW memoria.v_precio_vigente AS
  SELECT DISTINCT ON (descripcion_norm, proveedor_partner_id, moneda)
         descripcion_norm, descripcion, proveedor_partner_id, moneda, precio_unitario, unidad, fecha, fuente, fuente_ref,
         count(*) OVER (PARTITION BY descripcion_norm, proveedor_partner_id, moneda) AS observaciones
    FROM memoria.precio_observado
   ORDER BY descripcion_norm, proveedor_partner_id, moneda, fecha DESC, id DESC;

CREATE TABLE IF NOT EXISTS memoria.so_resultado (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  odoo_so             text NOT NULL,
  corte_en            timestamptz NOT NULL DEFAULT now(),
  estado_comercial    text NOT NULL,
  motivo_perdida      text NULL,
  cotizado_venta      numeric(14,2) NULL,
  cotizado_mo_horas   numeric(10,2) NULL,
  cotizado_materiales numeric(14,2) NULL,
  real_mo_horas       numeric(10,2) NULL,
  real_mo_costo       numeric(14,2) NULL,
  real_materiales     numeric(14,2) NULL,
  cobertura_real      numeric(4,3) NULL,
  fuente_corte        jsonb NOT NULL,
  CONSTRAINT so_resultado_estado_ck CHECK (estado_comercial IN ('ganada','perdida','abierta')),
  CONSTRAINT so_resultado_cobertura_ck CHECK (cobertura_real IS NULL OR cobertura_real BETWEEN 0 AND 1)
);
COMMENT ON COLUMN memoria.so_resultado.cobertura_real IS
  'Qué fracción del costo real es atribuible a la SO. Hoy 95% de las PO no traen SO (AUDITORIA §4): sin esto, un costo 0 se lee como margen alto.';
DROP TRIGGER IF EXISTS so_resultado_solo_insert ON memoria.so_resultado;
CREATE TRIGGER so_resultado_solo_insert BEFORE UPDATE OR DELETE ON memoria.so_resultado
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

CREATE OR REPLACE VIEW memoria.v_so_cotizado_vs_real AS
  SELECT DISTINCT ON (odoo_so) odoo_so, corte_en, estado_comercial, cotizado_venta,
         cotizado_mo_horas, real_mo_horas, real_mo_horas - cotizado_mo_horas AS desvio_mo_horas,
         cotizado_materiales, real_materiales, real_materiales - cotizado_materiales AS desvio_materiales,
         cobertura_real,
         CASE WHEN cobertura_real IS NULL OR cobertura_real < 0.8 THEN 'NO_CONCLUYENTE' ELSE 'COMPARABLE' END AS lectura
    FROM memoria.so_resultado ORDER BY odoo_so, corte_en DESC, id DESC;

-- ── Señales para el watchdog (F16) ────────────────────────────────────────
CREATE OR REPLACE VIEW memoria.v_senales_watchdog AS
  SELECT 'respaldo_ultimo'::text AS senal,
         CASE WHEN r.id IS NULL THEN 'alerta' WHEN NOT r.ok THEN 'alerta' WHEN r.fin < now() - interval '36 hours' THEN 'alerta' ELSE 'ok' END AS estado,
         coalesce('último ' || to_char(r.fin AT TIME ZONE 'America/Monterrey', 'YYYY-MM-DD HH24:MI') || ' CST ok=' || r.ok, 'nunca ha corrido') AS detalle
    FROM (SELECT NULL::int) x LEFT JOIN LATERAL (SELECT * FROM memoria.respaldo WHERE tipo = 'pg_dump' ORDER BY fin DESC LIMIT 1) r ON true
  UNION ALL
  SELECT 'restauracion_ultima',
         CASE WHEN p.id IS NULL OR NOT p.ok OR p.en < now() - interval '35 days' THEN 'alerta' ELSE 'ok' END,
         coalesce('última ' || to_char(p.en AT TIME ZONE 'America/Monterrey', 'YYYY-MM-DD HH24:MI') || ' CST ok=' || p.ok, 'nunca ha corrido')
    FROM (SELECT NULL::int) x LEFT JOIN LATERAL (SELECT * FROM memoria.respaldo_prueba ORDER BY en DESC LIMIT 1) p ON true
  UNION ALL
  SELECT 'evento_default_vacia', CASE WHEN count(*) = 0 THEN 'ok' ELSE 'alerta' END, count(*) || ' renglones fuera de partición'
    FROM memoria.evento_default
  UNION ALL
  SELECT 'particion_mes_siguiente',
         CASE WHEN to_regclass('memoria.evento_' || to_char(now() + interval '1 month', 'YYYY_MM')) IS NULL THEN 'alerta' ELSE 'ok' END,
         'memoria.evento_' || to_char(now() + interval '1 month', 'YYYY_MM')
  UNION ALL
  SELECT 'motor_corridas_fallidas_24h', CASE WHEN count(*) = 0 THEN 'ok' ELSE 'alerta' END,
         count(*) || ' corridas con errores en 24 h'
    FROM memoria.motor_corrida WHERE errores > 0 AND fin > now() - interval '24 hours'
  UNION ALL
  SELECT 'captura_silencio_' || c.id, 'alerta', c.nombre_actual || ': sin eventos desde ' ||
         coalesce(to_char(c.ultimo_evento AT TIME ZONE 'America/Monterrey', 'YYYY-MM-DD HH24:MI') || ' CST', 'siempre')
    FROM memoria.canal c
   WHERE c.estado_captura = 'capturando' AND NOT c.es_prueba
     AND (c.ultimo_evento IS NULL OR c.ultimo_evento < now() - interval '48 hours');
COMMENT ON VIEW memoria.v_senales_watchdog IS
  'Una fila por señal, estado ok|alerta. El watchdog la lee y avisa sólo las alerta. Umbral de silencio: 48 h (cubre fin de semana corto; ajustar con datos del piloto).';

-- ── Batería de pruebas de motores (F8, F10–F14), autodestructiva ──────────
-- Corre todo dentro de un bloque con EXCEPTION: al final lanza una excepción
-- propia que REVIERTE todos los datos de prueba; sólo sobrevive el resultado,
-- que se guarda en memoria.prueba_corrida fuera del bloque.
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
    res := res || jsonb_build_object('caso','F10_resumen_propuestas','esperado','1','obtenido',x->>'propuestas_nuevas');
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

    -- F12 tickets
    x := memoria.motor_tickets_simulado(1000, interval '0');
    res := res || jsonb_build_object('caso','F12_tickets_propuestas','esperado','1','obtenido',x->>'propuestas');
    SELECT payload->>'monto' || ' ' || (payload->>'moneda') || ' ' || (payload->>'proveedor_texto') || ' company=' || (payload->>'company_id') INTO t
      FROM memoria.propuesta WHERE motor = 'tickets' AND es_prueba ORDER BY creado_en DESC LIMIT 1;
    res := res || jsonb_build_object('caso','F12_ticket_extraido','esperado','1234.50 USD Home Depot company=6','obtenido',t);

    -- F13 requis
    x := memoria.motor_requis_simulado(1000, interval '0');
    res := res || jsonb_build_object('caso','F13_requis_propuestas','esperado','1','obtenido',x->>'propuestas');
    SELECT jsonb_array_length(payload->'partidas') || ' partidas, urgencia ' || (payload->>'urgencia') || ', ' || (payload->>'odoo_so') INTO t
      FROM memoria.propuesta WHERE motor = 'requis' AND es_prueba LIMIT 1;
    res := res || jsonb_build_object('caso','F13_requi_estructurada','esperado','2 partidas, urgencia alta, SO99010','obtenido',t);

    -- F14 alertas
    x := memoria.motor_alertas_simulado(1000, interval '0');
    SELECT string_agg(payload->>'regla', ',' ORDER BY payload->>'regla') INTO t FROM memoria.propuesta WHERE motor = 'alertas' AND es_prueba;
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

-- ── Permisos ──────────────────────────────────────────────────────────────
GRANT SELECT ON memoria.v_archivo_estado, memoria.precio_observado, memoria.v_precio_vigente,
               memoria.so_resultado, memoria.v_so_cotizado_vs_real, memoria.v_senales_watchdog
  TO memoria_motor, memoria_admin;
GRANT SELECT ON memoria.v_senales_watchdog, memoria.v_precio_vigente, memoria.v_so_cotizado_vs_real TO memoria_lector;
GRANT INSERT ON memoria.precio_observado, memoria.so_resultado TO memoria_motor;
GRANT EXECUTE ON FUNCTION memoria.retencion_simular(timestamptz), memoria.ruido_simular(timestamptz),
  memoria.normalizar_descripcion(text) TO memoria_motor, memoria_admin;
REVOKE ALL ON FUNCTION memoria.prueba_motores() FROM PUBLIC;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA memoria TO memoria_captura, memoria_motor, memoria_admin;
