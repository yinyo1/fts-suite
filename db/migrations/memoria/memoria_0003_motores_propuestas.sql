-- ═══════════════════════════════════════════════════════════════════════════
-- memoria_0003_motores_propuestas.sql · F8, F10, F12, F13, F14 (#328)
--
-- Motores con cursor, propuestas, decisiones (con diferencia propuesta vs
-- aprobada), ejecuciones, y los motores en MODO SIMULADO:
--   derivados (proveedor enchufable), resumen_so, tickets, requis, alertas.
-- Ningún motor llama APIs de pago (D10) ni escribe en Odoo: sólo PROPONE.
-- Idempotente. Sin dólar-dólar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Motores y cursores ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.motor (
  clave        text PRIMARY KEY,
  descripcion  text NOT NULL,
  version      text NOT NULL,
  filtro       jsonb NOT NULL,
  modo         text NOT NULL DEFAULT 'simulado',
  activo       boolean NOT NULL DEFAULT false,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT motor_modo_ck CHECK (modo IN ('simulado','real'))
);
COMMENT ON COLUMN memoria.motor.activo IS
  'Nace en false. Ningún motor se activa con horario hasta resolver la capacidad de n8n (ajuste 3 de #328).';

INSERT INTO memoria.motor (clave, descripcion, version, filtro) VALUES
  ('derivados',  'Transcripción, descripción de imagen y OCR de los binarios', 'v0',
     '{"tipos":["audio","video","imagen","documento"]}'),
  ('resumen_so', 'Resumen diario por SO con citas', 'v0', '{"tipos":["mensaje","audio","imagen","video","documento","edicion"]}'),
  ('tickets',    'Tickets de compras → bill/PO propuesto (FTS USA)', 'v0', '{"tipos_canal":["compras"],"tipos":["imagen","documento","mensaje"]}'),
  ('requis',     'Mensajes de materiales → requisición propuesta', 'v0', '{"tipos_canal":["materiales"],"tipos":["mensaje","edicion"]}'),
  ('alertas',    'Faltantes, adicionales no cotizados, compromisos de fecha, seguridad', 'v0', '{"tipos":["mensaje","edicion"]}')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS memoria.motor_cursor (   -- ÚNICA tabla mutable del flujo, por diseño
  motor          text PRIMARY KEY REFERENCES memoria.motor(clave),
  ultimo_seq     bigint NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO memoria.motor_cursor (motor) SELECT clave FROM memoria.motor ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS memoria.motor_corrida (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  motor        text NOT NULL REFERENCES memoria.motor(clave),
  modo         text NOT NULL,
  desde_seq    bigint NOT NULL,
  hasta_seq    bigint NOT NULL,
  leidos       int NOT NULL,
  producidos   int NOT NULL,
  errores      int NOT NULL DEFAULT 0,
  detalle      jsonb NULL,
  n8n_execution_id text NULL,
  inicio       timestamptz NOT NULL,
  fin          timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS motor_corrida_solo_insert ON memoria.motor_corrida;
CREATE TRIGGER motor_corrida_solo_insert BEFORE UPDATE OR DELETE ON memoria.motor_corrida
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

-- Eventos que le tocan a un motor: después de su cursor, con ventana de
-- estabilidad de 2 min (ARQUITECTURA §3.8), filtrados por su filtro.
CREATE OR REPLACE FUNCTION memoria.motor_pendientes(p_motor text, p_limite int DEFAULT 500, p_ventana interval DEFAULT interval '2 minutes')
RETURNS SETOF memoria.v_evento LANGUAGE sql STABLE AS $pend$
  SELECT e.* FROM memoria.v_evento e, memoria.motor m, memoria.motor_cursor c
   WHERE m.clave = p_motor AND c.motor = p_motor
     AND e.seq > c.ultimo_seq
     AND e.capturado_en < now() - p_ventana
     AND (NOT (m.filtro ? 'tipos')       OR e.tipo      IN (SELECT jsonb_array_elements_text(m.filtro->'tipos')))
     AND (NOT (m.filtro ? 'tipos_canal') OR e.tipo_canal IN (SELECT jsonb_array_elements_text(m.filtro->'tipos_canal')))
   ORDER BY e.seq LIMIT p_limite;
$pend$;

-- ── Propuestas, decisiones, ejecuciones ───────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.propuesta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motor          text NOT NULL REFERENCES memoria.motor(clave),
  motor_version  text NOT NULL,
  modo           text NOT NULL DEFAULT 'simulado',
  tipo           text NOT NULL,
  destino        text NOT NULL,
  clave          text NOT NULL,          -- idempotencia: misma clave = misma propuesta (re-procesar no duplica)
  payload        jsonb NOT NULL,
  citas          jsonb NOT NULL,
  confianza      numeric(4,3) NOT NULL,
  odoo_so        text NULL,
  es_prueba      boolean NOT NULL DEFAULT false,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT propuesta_uq UNIQUE (motor, motor_version, clave),
  CONSTRAINT propuesta_tipo_ck CHECK (tipo IN ('resumen_diario','alerta','po','bill','requisicion','acta',
    'reporte_avance','publicar','vinculo','lead','machote','cotizacion','so_borrador')),
  -- "Sin cita literal no hay propuesta" (ROADMAP #127 §3): regla del esquema, no del código.
  CONSTRAINT propuesta_citas_ck CHECK (jsonb_typeof(citas) = 'array' AND jsonb_array_length(citas) > 0),
  CONSTRAINT propuesta_confianza_ck CHECK (confianza BETWEEN 0 AND 1),
  CONSTRAINT propuesta_modo_ck CHECK (modo IN ('simulado','real'))
);
CREATE INDEX IF NOT EXISTS propuesta_so_idx ON memoria.propuesta (odoo_so);
DROP TRIGGER IF EXISTS propuesta_solo_insert ON memoria.propuesta;
CREATE TRIGGER propuesta_solo_insert BEFORE UPDATE OR DELETE ON memoria.propuesta
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

-- Diferencia estructural entre dos jsonb (por llave, recursiva en objetos).
CREATE OR REPLACE FUNCTION memoria.jsonb_diferencia(a jsonb, b jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $dif$
DECLARE k text; r jsonb := '{}'::jsonb; va jsonb; vb jsonb;
BEGIN
  IF a IS NULL OR b IS NULL OR jsonb_typeof(a) <> 'object' OR jsonb_typeof(b) <> 'object' THEN
    IF a IS DISTINCT FROM b THEN RETURN jsonb_build_object('antes', a, 'despues', b); END IF;
    RETURN '{}'::jsonb;
  END IF;
  FOR k IN SELECT jsonb_object_keys(a) UNION SELECT jsonb_object_keys(b) LOOP
    va := a -> k; vb := b -> k;
    IF va IS DISTINCT FROM vb THEN
      IF jsonb_typeof(va) = 'object' AND jsonb_typeof(vb) = 'object' THEN
        r := r || jsonb_build_object(k, memoria.jsonb_diferencia(va, vb));
      ELSE
        r := r || jsonb_build_object(k, jsonb_build_object('antes', va, 'despues', vb));
      END IF;
    END IF;
  END LOOP;
  RETURN r;
END
$dif$;

CREATE TABLE IF NOT EXISTS memoria.decision (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id   uuid NOT NULL REFERENCES memoria.propuesta(id),
  resultado      text NOT NULL,
  payload_final  jsonb NULL,
  diferencia     jsonb NULL,       -- la calcula el trigger: materia prima del aprendizaje del cotizador
  motivo         text NULL,
  decidido_por   text NOT NULL,
  decidido_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decision_resultado_ck CHECK (resultado IN ('aprobada','corregida','rechazada','pospuesta')),
  CONSTRAINT decision_motivo_ck CHECK (resultado IN ('aprobada','pospuesta') OR motivo IS NOT NULL),
  CONSTRAINT decision_payload_ck CHECK (resultado NOT IN ('aprobada','corregida') OR payload_final IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS decision_propuesta_idx ON memoria.decision (propuesta_id);

CREATE OR REPLACE FUNCTION memoria.decision_calcular_diferencia()
RETURNS trigger LANGUAGE plpgsql AS $ddif$
DECLARE p jsonb;
BEGIN
  SELECT payload INTO p FROM memoria.propuesta WHERE id = NEW.propuesta_id;
  IF NEW.resultado IN ('aprobada','corregida') THEN
    NEW.diferencia := memoria.jsonb_diferencia(p, NEW.payload_final);
    IF NEW.resultado = 'corregida' AND NEW.diferencia = '{}'::jsonb THEN
      RAISE EXCEPTION 'decision: una corrección debe cambiar algo (payload_final igual a lo propuesto)';
    END IF;
  END IF;
  RETURN NEW;
END
$ddif$;
DROP TRIGGER IF EXISTS decision_diferencia_trg ON memoria.decision;
CREATE TRIGGER decision_diferencia_trg BEFORE INSERT ON memoria.decision
  FOR EACH ROW EXECUTE FUNCTION memoria.decision_calcular_diferencia();
DROP TRIGGER IF EXISTS decision_solo_insert ON memoria.decision;
CREATE TRIGGER decision_solo_insert BEFORE UPDATE OR DELETE ON memoria.decision
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

CREATE TABLE IF NOT EXISTS memoria.ejecucion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id      uuid NOT NULL REFERENCES memoria.decision(id),
  n8n_execution_id text NULL,
  destino_ref      text NULL,
  resultado        text NOT NULL,
  readback         jsonb NULL,
  error            text NULL,
  en               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ejecucion_resultado_ck CHECK (resultado IN ('ok','fallo','verificado'))
);
DROP TRIGGER IF EXISTS ejecucion_solo_insert ON memoria.ejecucion;
CREATE TRIGGER ejecucion_solo_insert BEFORE UPDATE OR DELETE ON memoria.ejecucion
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

CREATE OR REPLACE VIEW memoria.v_bandeja AS
  SELECT p.* FROM memoria.propuesta p
  WHERE NOT EXISTS (SELECT 1 FROM memoria.decision d
                    WHERE d.propuesta_id = p.id AND d.resultado <> 'pospuesta');

-- Única puerta hacia afuera (D11): un evento es publicable sólo si una
-- propuesta 'publicar' que lo cita fue aprobada o corregida.
CREATE OR REPLACE VIEW memoria.v_evento_publicable AS
  SELECT e.* FROM memoria.v_evento e
  WHERE EXISTS (
    SELECT 1 FROM memoria.propuesta p JOIN memoria.decision d ON d.propuesta_id = p.id
     WHERE p.tipo = 'publicar' AND d.resultado IN ('aprobada','corregida')
       AND (coalesce(d.payload_final, p.payload) -> 'evento_seqs') @> to_jsonb(e.seq));

-- Utilidad: cita de un evento.
CREATE OR REPLACE FUNCTION memoria.cita(e memoria.v_evento)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $cita$
  SELECT jsonb_build_object('evento_seq', e.seq, 'ocurrido_en', e.ocurrido_en, 'tipo', e.tipo,
                            'fragmento', left(coalesce(e.texto, '[' || e.tipo || ']'), 280));
$cita$;

-- Utilidad: SO de un evento (por canal o texto).
CREATE OR REPLACE FUNCTION memoria.so_de_evento(e memoria.v_evento)
RETURNS text LANGUAGE sql STABLE AS $sode$
  SELECT coalesce(
    (SELECT s.odoo_so FROM memoria.v_evento_so s WHERE s.seq = e.seq ORDER BY s.confianza DESC LIMIT 1),
    'SO' || substring(lower(coalesce(e.texto, '')) from '\mso\s?-?(\d{4,5})\M'));
$sode$;

-- ── Motor: derivados (F8) ─────────────────────────────────────────────────
-- Proveedor enchufable: una fila por (tipo de derivado, proveedor). En modo
-- 'simulado' el propio SQL produce un derivado marcado es_simulado=true; en
-- modo 'http' un workflow de n8n llamará al endpoint (D10, pendiente).
CREATE TABLE IF NOT EXISTS memoria.proveedor_derivado (
  clave     text PRIMARY KEY,
  tipo      text NOT NULL,
  modo      text NOT NULL DEFAULT 'simulado',
  endpoint  text NULL,
  version   text NOT NULL DEFAULT 'v0',
  activo    boolean NOT NULL DEFAULT true,
  CONSTRAINT proveedor_modo_ck CHECK (modo IN ('simulado','http')),
  CONSTRAINT proveedor_tipo_ck CHECK (tipo IN ('transcripcion','descripcion_imagen','ocr','resumen_video'))
);
INSERT INTO memoria.proveedor_derivado (clave, tipo) VALUES
  ('simulado-transcripcion', 'transcripcion'), ('simulado-vision', 'descripcion_imagen'), ('simulado-ocr', 'ocr')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION memoria.motor_derivados_simulado(p_limite int DEFAULT 200, p_ventana interval DEFAULT interval '2 minutes')
RETURNS jsonb LANGUAGE plpgsql AS $mder$
DECLARE c memoria.motor_cursor; e memoria.v_evento; t text; prov record; hecho int := 0; leidos int := 0;
        desde bigint; hasta bigint; ini timestamptz := clock_timestamp(); n int;
BEGIN
  SELECT * INTO c FROM memoria.motor_cursor WHERE motor = 'derivados' FOR UPDATE;
  desde := c.ultimo_seq; hasta := c.ultimo_seq;
  FOR e IN SELECT * FROM memoria.motor_pendientes('derivados', p_limite, p_ventana) LOOP
    leidos := leidos + 1; hasta := e.seq;
    IF e.archivo_sha256 IS NULL THEN CONTINUE; END IF;
    t := CASE e.tipo WHEN 'audio' THEN 'transcripcion' WHEN 'video' THEN 'transcripcion'
                     WHEN 'imagen' THEN 'descripcion_imagen' WHEN 'documento' THEN 'ocr' END;
    SELECT * INTO prov FROM memoria.proveedor_derivado WHERE tipo = t AND activo AND modo = 'simulado' LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    INSERT INTO memoria.archivo_derivado (sha256, tipo, proveedor, version, idioma, contenido, confianza, costo_usd, es_simulado)
    VALUES (e.archivo_sha256, t, prov.clave, prov.version, 'es',
            '[SIMULADO] ' || t || ' pendiente de proveedor real (D10). Evento ' || e.seq || '.', 0, 0, true)
    ON CONFLICT (sha256, tipo, proveedor, version) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; hecho := hecho + n;
  END LOOP;
  UPDATE memoria.motor_cursor SET ultimo_seq = hasta, actualizado_en = now() WHERE motor = 'derivados';
  INSERT INTO memoria.motor_corrida (motor, modo, desde_seq, hasta_seq, leidos, producidos, inicio)
  VALUES ('derivados', 'simulado', desde, hasta, leidos, hecho, ini);
  RETURN jsonb_build_object('motor','derivados','leidos',leidos,'producidos',hecho,'desde',desde,'hasta',hasta);
END
$mder$;

-- ── Motor: resumen diario por SO (F10) ────────────────────────────────────
-- No usa cursor: resume un día completo (re-ejecutable, idempotente por clave).
CREATE OR REPLACE FUNCTION memoria.motor_resumen_so(p_dia date, p_modo text DEFAULT 'simulado')
RETURNS jsonb LANGUAGE plpgsql AS $mres$
DECLARE r record; n int := 0; k int; ini timestamptz := clock_timestamp(); tot int := 0;
BEGIN
  IF p_modo <> 'simulado' THEN RAISE EXCEPTION 'resumen_so: sólo modo simulado hasta decidir D10'; END IF;
  FOR r IN
    WITH ev AS (
      SELECT e.seq, e.ocurrido_en, e.tipo, e.texto, e.es_prueba, s.odoo_so
        FROM memoria.v_evento e JOIN memoria.v_evento_so s ON s.seq = e.seq
       WHERE e.ocurrido_en >= p_dia AND e.ocurrido_en < p_dia + 1
         AND e.tipo IN ('mensaje','audio','imagen','video','documento','edicion'))
    SELECT ev.odoo_so, bool_or(ev.es_prueba) AS es_prueba, count(*) AS n,
           (SELECT jsonb_object_agg(t.tipo, t.c) FROM (SELECT e3.tipo, count(*) AS c FROM ev e3
              WHERE e3.odoo_so = ev.odoo_so GROUP BY e3.tipo) t) AS por_tipo,
           (SELECT jsonb_agg(jsonb_build_object('evento_seq', x.seq, 'ocurrido_en', x.ocurrido_en, 'tipo', x.tipo,
                                                'fragmento', left(x.texto, 280)) ORDER BY x.seq)
              FROM (SELECT * FROM ev e2 WHERE e2.odoo_so = ev.odoo_so AND e2.texto IS NOT NULL ORDER BY e2.seq LIMIT 8) x) AS citas
      FROM ev GROUP BY ev.odoo_so
  LOOP
    tot := tot + 1;
    IF r.citas IS NULL THEN CONTINUE; END IF;   -- sin texto citable no hay propuesta
    INSERT INTO memoria.propuesta (motor, motor_version, modo, tipo, destino, clave, payload, citas, confianza, odoo_so, es_prueba)
    VALUES ('resumen_so', 'v0', 'simulado', 'resumen_diario', 'suite', r.odoo_so || '|' || p_dia,
            jsonb_build_object('odoo_so', r.odoo_so, 'dia', p_dia, 'eventos', r.n, 'por_tipo', r.por_tipo,
              'resumen', '[SIMULADO] ' || r.n || ' eventos del día. Puntos citados abajo; el resumen redactado llega con el proveedor de IA (D10).'),
            r.citas, 0.5, r.odoo_so, r.es_prueba)
    ON CONFLICT (motor, motor_version, clave) DO NOTHING;
    GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  END LOOP;
  INSERT INTO memoria.motor_corrida (motor, modo, desde_seq, hasta_seq, leidos, producidos, detalle, inicio)
  VALUES ('resumen_so', 'simulado', 0, 0, 0, n, jsonb_build_object('dia', p_dia), ini);
  RETURN jsonb_build_object('motor','resumen_so','dia',p_dia,'propuestas_nuevas',n);
END
$mres$;

-- ── Extractores simulados (reglas, sin IA) ────────────────────────────────
CREATE OR REPLACE FUNCTION memoria.extraer_monto(t text, OUT monto numeric, OUT moneda text)
LANGUAGE plpgsql IMMUTABLE AS $ext$
DECLARE s text := lower(coalesce(t, '')); m text;
BEGIN
  m := substring(s from '\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)');
  IF m IS NULL THEN m := substring(s from '([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:usd|dls|dlls|dolares|mxn|pesos)'); END IF;
  IF m IS NOT NULL THEN monto := replace(m, ',', '')::numeric; END IF;
  moneda := CASE WHEN s ~ '(usd|dls|dlls|dolar|dólar|us\$)' THEN 'USD'
                 WHEN s ~ '(mxn|pesos|m\.n\.)' THEN 'MXN' ELSE NULL END;
END
$ext$;

-- ── Motor: tickets → bill/PO propuesto (F12) ──────────────────────────────
CREATE OR REPLACE FUNCTION memoria.motor_tickets_simulado(p_limite int DEFAULT 200, p_ventana interval DEFAULT interval '2 minutes')
RETURNS jsonb LANGUAGE plpgsql AS $mtic$
DECLARE c memoria.motor_cursor; e memoria.v_evento; x record; txt text; prov text; n int := 0; k int; leidos int := 0;
        desde bigint; hasta bigint; ini timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO c FROM memoria.motor_cursor WHERE motor = 'tickets' FOR UPDATE;
  desde := c.ultimo_seq; hasta := c.ultimo_seq;
  FOR e IN SELECT * FROM memoria.motor_pendientes('tickets', p_limite, p_ventana) LOOP
    leidos := leidos + 1; hasta := e.seq;
    -- Texto disponible: pie de foto + OCR (si ya existe un derivado).
    txt := coalesce(e.texto, '') || ' ' || coalesce((SELECT string_agg(d.contenido, ' ') FROM memoria.archivo_derivado d
                                                      WHERE d.sha256 = e.archivo_sha256 AND d.tipo = 'ocr' AND NOT d.es_simulado), '');
    SELECT * INTO x FROM memoria.extraer_monto(txt);
    IF x.monto IS NULL THEN CONTINUE; END IF;
    -- Proveedor: lo que sigue a "proveedor:/tienda:" hasta la cifra; se corta en " por", " de $", coma o paréntesis.
    prov := substring(txt from '(?i)(?:proveedor|tienda)\s*:?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9&.\- ]{3,60})');
    prov := nullif(btrim(regexp_replace(coalesce(prov, ''), '\s+(por|de|con)(\s.*)?\Z', '')), '');
    INSERT INTO memoria.propuesta (motor, motor_version, modo, tipo, destino, clave, payload, citas, confianza, odoo_so, es_prueba)
    VALUES ('tickets', 'v0', 'simulado', 'bill', 'odoo:account.move', 'evento:' || e.evento_id,
      jsonb_build_object('company_id', 6, 'empresa', 'FTS USA', 'move_type', 'in_invoice',
        'proveedor_texto', coalesce(prov, 'SIN_DATO'), 'fecha', (e.ocurrido_en AT TIME ZONE 'America/Monterrey')::date,
        'monto', x.monto, 'moneda', coalesce(x.moneda, 'SIN_DATO'), 'odoo_so', memoria.so_de_evento(e),
        'archivo_sha256', e.archivo_sha256,
        'cruce_tarjeta', jsonb_build_object('estado', 'SIN_FUENTE', 'nota', 'La fuente banco aún no está en la memoria; el cruce contra cargos de tarjeta se hará en modo lectura cuando exista.')),
      jsonb_build_array(memoria.cita(e)),
      CASE WHEN x.moneda IS NOT NULL AND prov IS NOT NULL THEN 0.6 ELSE 0.35 END,
      memoria.so_de_evento(e), e.es_prueba)
    ON CONFLICT (motor, motor_version, clave) DO NOTHING;
    GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  END LOOP;
  UPDATE memoria.motor_cursor SET ultimo_seq = hasta, actualizado_en = now() WHERE motor = 'tickets';
  INSERT INTO memoria.motor_corrida (motor, modo, desde_seq, hasta_seq, leidos, producidos, inicio)
  VALUES ('tickets', 'simulado', desde, hasta, leidos, n, ini);
  RETURN jsonb_build_object('motor','tickets','leidos',leidos,'propuestas',n);
END
$mtic$;

-- ── Motor: requis → requisición (F13) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION memoria.motor_requis_simulado(p_limite int DEFAULT 200, p_ventana interval DEFAULT interval '2 minutes')
RETURNS jsonb LANGUAGE plpgsql AS $mreq$
DECLARE c memoria.motor_cursor; e memoria.v_evento; m text[]; linea text; items jsonb; n int := 0; k int; leidos int := 0;
        desde bigint; hasta bigint; ini timestamptz := clock_timestamp(); urg text;
BEGIN
  SELECT * INTO c FROM memoria.motor_cursor WHERE motor = 'requis' FOR UPDATE;
  desde := c.ultimo_seq; hasta := c.ultimo_seq;
  FOR e IN SELECT * FROM memoria.motor_pendientes('requis', p_limite, p_ventana) LOOP
    leidos := leidos + 1; hasta := e.seq;
    items := '[]'::jsonb;
    FOREACH linea IN ARRAY regexp_split_to_array(coalesce(e.texto, ''), '[\n;]+') LOOP
      m := regexp_match(lower(linea),
        '(\d+(?:[.,]\d+)?)\s*(pzas?|piezas?|pz|m|mts?|metros?|kg|kilos?|rollos?|cajas?|tramos?|lts?|litros?|cubetas?|bultos?|juegos?)\.?\s+(?:de\s+)?([a-z0-9áéíóúñ"/ .\-]{3,80})');
      IF m IS NOT NULL THEN
        items := items || jsonb_build_object('cantidad', replace(m[1], ',', '.')::numeric, 'unidad', m[2], 'material', btrim(m[3]));
      END IF;
    END LOOP;
    IF jsonb_array_length(items) = 0 THEN CONTINUE; END IF;
    urg := CASE WHEN lower(e.texto) ~ '(urgente|para hoy|\mhoy\M|ya mismo|paro de línea|paro de linea|asap)' THEN 'alta'
                WHEN lower(e.texto) ~ '(mañana|manana)' THEN 'media' ELSE 'normal' END;
    INSERT INTO memoria.propuesta (motor, motor_version, modo, tipo, destino, clave, payload, citas, confianza, odoo_so, es_prueba)
    VALUES ('requis', 'v0', 'simulado', 'requisicion', 'odoo:purchase.order', 'evento:' || e.evento_id,
      jsonb_build_object('odoo_so', memoria.so_de_evento(e), 'urgencia', urg, 'partidas', items,
                         'solicitante_employee_id', e.autor_employee_id, 'estado_sugerido', 'borrador'),
      jsonb_build_array(memoria.cita(e)), 0.5, memoria.so_de_evento(e), e.es_prueba)
    ON CONFLICT (motor, motor_version, clave) DO NOTHING;
    GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  END LOOP;
  UPDATE memoria.motor_cursor SET ultimo_seq = hasta, actualizado_en = now() WHERE motor = 'requis';
  INSERT INTO memoria.motor_corrida (motor, modo, desde_seq, hasta_seq, leidos, producidos, inicio)
  VALUES ('requis', 'simulado', desde, hasta, leidos, n, ini);
  RETURN jsonb_build_object('motor','requis','leidos',leidos,'propuestas',n);
END
$mreq$;

-- ── Motor: alertas (F14) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.regla_alerta (
  clave        text PRIMARY KEY,
  patron       text NOT NULL,       -- expresión regular (minúsculas)
  severidad    text NOT NULL,
  destinatario text NOT NULL,       -- ROL sugerido, nunca una persona escrita en el repo
  activa       boolean NOT NULL DEFAULT true,
  CONSTRAINT regla_severidad_ck CHECK (severidad IN ('baja','media','alta'))
);
INSERT INTO memoria.regla_alerta (clave, patron, severidad, destinatario) VALUES
  ('faltante_material', '(falta|faltan|faltó|no llegó|no llego|no hay|se acabó|se acabo|sin material)', 'media', 'compras + supervisor del proyecto'),
  ('adicional_no_cotizado', '(adicional|extra|no estaba en (la )?cotizaci|fuera de alcance|cambio de alcance|nos pidieron tambi)', 'alta', 'comercial (cotizador) + dirección'),
  ('compromiso_fecha', '(para el (lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)|a más tardar|a mas tardar|queda listo el|entregamos el|\mel \d{1,2} de )', 'media', 'PM / supervisor del proyecto'),
  ('seguridad', '(accidente|lesion|lesión|herido|casi (se )?cae|incidente|sin arn[eé]s|sin epp|peligro|conato|quemadura)', 'alta', 'seguridad + dirección')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION memoria.motor_alertas_simulado(p_limite int DEFAULT 500, p_ventana interval DEFAULT interval '2 minutes')
RETURNS jsonb LANGUAGE plpgsql AS $malr$
DECLARE c memoria.motor_cursor; e memoria.v_evento; r memoria.regla_alerta; n int := 0; k int; leidos int := 0;
        desde bigint; hasta bigint; ini timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO c FROM memoria.motor_cursor WHERE motor = 'alertas' FOR UPDATE;
  desde := c.ultimo_seq; hasta := c.ultimo_seq;
  FOR e IN SELECT * FROM memoria.motor_pendientes('alertas', p_limite, p_ventana) LOOP
    leidos := leidos + 1; hasta := e.seq;
    FOR r IN SELECT * FROM memoria.regla_alerta WHERE activa LOOP
      IF lower(coalesce(e.texto, '')) ~ r.patron THEN
        INSERT INTO memoria.propuesta (motor, motor_version, modo, tipo, destino, clave, payload, citas, confianza, odoo_so, es_prueba)
        VALUES ('alertas', 'v0', 'simulado', 'alerta', 'suite', r.clave || '|evento:' || e.evento_id,
          jsonb_build_object('regla', r.clave, 'severidad', r.severidad, 'destinatario_sugerido', r.destinatario,
                             'odoo_so', memoria.so_de_evento(e), 'canal', e.canal),
          jsonb_build_array(memoria.cita(e)), 0.5, memoria.so_de_evento(e), e.es_prueba)
        ON CONFLICT (motor, motor_version, clave) DO NOTHING;
        GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
      END IF;
    END LOOP;
  END LOOP;
  UPDATE memoria.motor_cursor SET ultimo_seq = hasta, actualizado_en = now() WHERE motor = 'alertas';
  INSERT INTO memoria.motor_corrida (motor, modo, desde_seq, hasta_seq, leidos, producidos, inicio)
  VALUES ('alertas', 'simulado', desde, hasta, leidos, n, ini);
  RETURN jsonb_build_object('motor','alertas','leidos',leidos,'propuestas',n);
END
$malr$;

-- Regresar el cursor (re-procesar). Las propuestas NO se duplican: clave única.
CREATE OR REPLACE FUNCTION memoria.motor_rebobinar(p_motor text, p_seq bigint)
RETURNS void LANGUAGE sql AS $reb$
  UPDATE memoria.motor_cursor SET ultimo_seq = greatest(p_seq, 0), actualizado_en = now() WHERE motor = p_motor;
$reb$;

-- ── Permisos ──────────────────────────────────────────────────────────────
GRANT SELECT ON memoria.motor, memoria.motor_cursor, memoria.motor_corrida, memoria.propuesta,
               memoria.decision, memoria.ejecucion, memoria.v_bandeja, memoria.v_evento_publicable,
               memoria.proveedor_derivado, memoria.regla_alerta
  TO memoria_motor, memoria_admin;
GRANT UPDATE (ultimo_seq, actualizado_en) ON memoria.motor_cursor TO memoria_motor;
GRANT INSERT ON memoria.motor_corrida, memoria.propuesta TO memoria_motor;
GRANT INSERT ON memoria.decision, memoria.ejecucion TO memoria_admin;
GRANT INSERT ON memoria.propuesta TO memoria_lector;          -- contrato §7: otros módulos pueden PROPONER
GRANT SELECT ON memoria.v_bandeja, memoria.v_evento_publicable TO memoria_lector;
GRANT EXECUTE ON FUNCTION memoria.motor_pendientes(text, int, interval), memoria.motor_derivados_simulado(int, interval),
  memoria.motor_resumen_so(date, text), memoria.motor_tickets_simulado(int, interval),
  memoria.motor_requis_simulado(int, interval), memoria.motor_alertas_simulado(int, interval),
  memoria.motor_rebobinar(text, bigint), memoria.cita(memoria.v_evento), memoria.so_de_evento(memoria.v_evento),
  memoria.extraer_monto(text), memoria.jsonb_diferencia(jsonb, jsonb)
  TO memoria_motor, memoria_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA memoria TO memoria_captura, memoria_motor, memoria_admin;
