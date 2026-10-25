-- ═══════════════════════════════════════════════════════════════════════════
-- memoria_0007 · Evidencia para comercial, reporte de avance/acta y segunda
-- revisión (issue #328, continuación nocturna del 28-sep-2026)
--
--   R2. Comercial cita evidencia por SO o por lead SIN leer la bitácora:
--       memoria.api_evidencia_so / api_evidencia_lead (sólo lectura, sólo lo
--       aprobado para publicar, sin teléfonos ni nombres de WhatsApp).
--   R3. Motor 'avance' (simulado): reporte de avance y acta de entrega armados
--       SÓLO con eventos aprobados; el acta sólo con fotos marcadas como
--       evidencia_acta, que quedan ligadas al acta y nunca se mueven.
--   R1. Correcciones de la segunda revisión adversarial (sección al final).
--   Batería: prueba_motores() suma los casos R2/R3 (y R1 cuando aplica).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── R2 · Evidencia para comercial (D6): SÓLO LECTURA, sólo lo publicable ────
-- Comercial nunca lee la bitácora: pide evidencia de una SO o de un lead y recibe
-- únicamente eventos aprobados para publicar (D11), sus archivos y sus derivados.
-- Sin teléfonos, sin nombres de WhatsApp, sin eventos internos.
CREATE OR REPLACE VIEW memoria.v_evento_destino AS
  SELECT s.seq, s.evento_id, 'odoo:sale.order'::text AS destino_tipo, s.odoo_so AS destino_id, s.via, s.confianza
    FROM memoria.v_evento_so s
  UNION ALL
  SELECT e.seq, e.id, 'odoo:crm.lead', v.destino_id, 'canal', v.confianza
    FROM memoria.evento e
    JOIN memoria.vinculo_vigente v
      ON v.origen_tipo = 'canal' AND v.origen_id = e.canal_id::text
     AND v.destino_tipo = 'odoo:crm.lead' AND v.relacion = 'pertenece_a'
     AND (v.vigente_desde IS NULL OR e.ocurrido_en >= v.vigente_desde)
  UNION ALL
  SELECT e.seq, e.id, 'odoo:crm.lead', v.destino_id, 'directo', v.confianza
    FROM memoria.evento e
    JOIN memoria.vinculo_vigente v
      ON v.origen_tipo = 'evento' AND v.origen_id = e.id::text
     AND v.destino_tipo = 'odoo:crm.lead';
COMMENT ON VIEW memoria.v_evento_destino IS
  'Evento → SO o lead (por canal o directo). Base de la evidencia para comercial. No expone texto.';

CREATE OR REPLACE FUNCTION memoria.evidencia_publicable(p_destino_tipo text, p_destino_id text,
                                                        p_incluir_prueba boolean DEFAULT false, p_limite int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = memoria, pg_temp AS $evid$
DECLARE r jsonb;
BEGIN
  IF p_destino_tipo NOT IN ('odoo:sale.order', 'odoo:crm.lead') THEN
    RAISE EXCEPTION 'DESTINO_INVALIDO: sólo odoo:sale.order u odoo:crm.lead';
  END IF;
  IF coalesce(btrim(p_destino_id), '') = '' THEN RAISE EXCEPTION 'DESTINO_VACIO'; END IF;
  WITH ev AS (
    SELECT DISTINCT ON (p.seq) p.seq, p.evento_id, p.ocurrido_en, p.tipo, p.texto, p.archivo_sha256,
           p.autor_employee_id, p.es_prueba, d.via
      FROM memoria.v_evento_publicable p
      JOIN memoria.v_evento_destino d ON d.seq = p.seq
     WHERE d.destino_tipo = p_destino_tipo AND d.destino_id = p_destino_id
       AND (p_incluir_prueba OR NOT coalesce(p.es_prueba, false))
     ORDER BY p.seq, d.confianza DESC
     LIMIT greatest(1, least(coalesce(p_limite, 200), 1000))),
  arch AS (   -- el original citado y sus versiones de consulta (miniatura, comprimido)
    SELECT a.sha256, a.mime, a.bytes, a.rol, a.deriva_de, s.clase_vigente, s.ligado_a_acta
      FROM memoria.archivo a JOIN memoria.v_archivo_estado s ON s.sha256 = a.sha256
     WHERE a.sha256 IN (SELECT archivo_sha256 FROM ev WHERE archivo_sha256 IS NOT NULL)
        OR a.deriva_de IN (SELECT archivo_sha256 FROM ev WHERE archivo_sha256 IS NOT NULL))
  SELECT jsonb_build_object(
    'contrato', 'memoria.evidencia v1',
    'destino', jsonb_build_object('tipo', p_destino_tipo, 'id', p_destino_id),
    'incluye_prueba', p_incluir_prueba,
    'eventos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'evento_seq', seq, 'evento_id', evento_id, 'ocurrido_en', ocurrido_en, 'tipo', tipo,
        'texto', texto, 'archivo_sha256', archivo_sha256, 'autor_employee_id', autor_employee_id, 'via', via,
        'cita', jsonb_build_object('evento_seq', seq, 'ocurrido_en', ocurrido_en, 'tipo', tipo,
                                   'fragmento', left(coalesce(texto, '[' || tipo || ']'), 280))) ORDER BY seq) FROM ev), '[]'::jsonb),
    'archivos', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'sha256', sha256, 'mime', mime, 'bytes', bytes, 'rol', rol, 'deriva_de', deriva_de,
        'clase', clase_vigente, 'evidencia_acta', (clase_vigente = 'evidencia_acta' OR ligado_a_acta),
        'ubicacion', (SELECT jsonb_build_object('proveedor', u.proveedor, 'contenedor', u.contenedor, 'ruta', u.ruta, 'nivel', u.nivel)
                        FROM memoria.archivo_ubicacion u WHERE u.sha256 = arch.sha256 AND u.evento = 'alta'
                       ORDER BY u.registrado_en DESC LIMIT 1)) ORDER BY sha256) FROM arch), '[]'::jsonb),
    'derivados', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'sha256', x.sha256, 'tipo', x.tipo, 'proveedor', x.proveedor, 'version', x.version, 'idioma', x.idioma,
        'contenido', x.contenido, 'confianza', x.confianza, 'es_simulado', x.es_simulado) ORDER BY x.sha256, x.tipo)
        FROM memoria.archivo_derivado x WHERE x.sha256 IN (SELECT sha256 FROM arch)), '[]'::jsonb),
    'nota', 'Sólo eventos aprobados para publicar (D11). Citar siempre por evento_seq.')
  INTO r;
  RETURN r;
END
$evid$;

CREATE OR REPLACE FUNCTION memoria.api_evidencia_so(p_so text, p_incluir_prueba boolean DEFAULT false, p_limite int DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = memoria, pg_temp AS $evso$
  SELECT memoria.evidencia_publicable('odoo:sale.order', p_so, p_incluir_prueba, p_limite);
$evso$;
CREATE OR REPLACE FUNCTION memoria.api_evidencia_lead(p_lead text, p_incluir_prueba boolean DEFAULT false, p_limite int DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = memoria, pg_temp AS $evld$
  SELECT memoria.evidencia_publicable('odoo:crm.lead', p_lead, p_incluir_prueba, p_limite);
$evld$;

ALTER VIEW memoria.v_evento_destino OWNER TO memoria_admin;
ALTER FUNCTION memoria.evidencia_publicable(text, text, boolean, int) OWNER TO memoria_admin;
ALTER FUNCTION memoria.api_evidencia_so(text, boolean, int)          OWNER TO memoria_admin;
ALTER FUNCTION memoria.api_evidencia_lead(text, boolean, int)        OWNER TO memoria_admin;
REVOKE ALL ON FUNCTION memoria.evidencia_publicable(text, text, boolean, int),
                       memoria.api_evidencia_so(text, boolean, int),
                       memoria.api_evidencia_lead(text, boolean, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memoria.api_evidencia_so(text, boolean, int),
                          memoria.api_evidencia_lead(text, boolean, int) TO memoria_lector, memoria_admin;
GRANT SELECT ON memoria.v_evento_destino TO memoria_motor;

-- ── R3 · Motor de reporte de avance y acta de entrega (SIMULADO) ────────────
-- Sólo lee v_evento_publicable: lo que no se aprobó para publicar no puede
-- aparecer. El acta sólo lleva fotos marcadas como evidencia_acta, y cada foto
-- queda ligada a su acta (vínculo) para que la retención nunca la mueva.
INSERT INTO memoria.motor (clave, descripcion, version, filtro) VALUES
  ('avance', 'Reporte de avance y acta de entrega, sólo con evidencia aprobada', 'v0', '{"fuente":"v_evento_publicable"}')
ON CONFLICT (clave) DO NOTHING;
INSERT INTO memoria.motor_cursor (motor) VALUES ('avance') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION memoria.motor_avance_simulado(p_hasta date, p_dias int DEFAULT 7, p_so text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $mav$
DECLARE r record; n_av int := 0; n_acta int := 0; n_vinc int := 0; k int; pid uuid; sha text;
        ini timestamptz := clock_timestamp();
        desde date := p_hasta - (greatest(coalesce(p_dias, 7), 1) - 1);
BEGIN
  FOR r IN
    WITH ev AS (
      SELECT DISTINCT ON (p.seq) p.seq, p.ocurrido_en, p.tipo, p.texto, p.archivo_sha256, p.es_prueba, s.odoo_so,
             (p.tipo = 'imagen' AND EXISTS (SELECT 1 FROM memoria.v_archivo_estado a
                                            WHERE a.sha256 = p.archivo_sha256 AND a.clase_vigente = 'evidencia_acta')) AS es_foto_acta
        FROM memoria.v_evento_publicable p
        JOIN memoria.v_evento_so s ON s.seq = p.seq
       WHERE p.ocurrido_en >= desde AND p.ocurrido_en < p_hasta + 1
         AND (p_so IS NULL OR s.odoo_so = p_so)
       ORDER BY p.seq, s.confianza DESC)
    SELECT odoo_so, bool_or(es_prueba) AS es_prueba, count(*) AS n, max(seq) AS max_seq,
           jsonb_agg(jsonb_build_object('evento_seq', seq, 'ocurrido_en', ocurrido_en, 'tipo', tipo,
                     'fragmento', left(coalesce(texto, '[' || tipo || ']'), 280)) ORDER BY seq) AS citas,
           jsonb_agg(jsonb_build_object('evento_seq', seq, 'ocurrido_en', ocurrido_en, 'tipo', tipo,
                     'fragmento', left(coalesce(texto, '[' || tipo || ']'), 280)) ORDER BY seq) FILTER (WHERE es_foto_acta) AS citas_acta,
           coalesce(jsonb_agg(DISTINCT archivo_sha256) FILTER (WHERE es_foto_acta), '[]'::jsonb) AS fotos_acta
      FROM ev GROUP BY odoo_so
  LOOP
    INSERT INTO memoria.propuesta (motor, motor_version, modo, tipo, destino, clave, payload, citas, confianza, odoo_so, es_prueba)
    VALUES ('avance', 'v0', 'simulado', 'reporte_avance', 'cliente',
            'avance|' || r.odoo_so || '|' || desde || '|' || p_hasta || '|' || r.max_seq,
            jsonb_build_object('odoo_so', r.odoo_so, 'desde', desde, 'hasta', p_hasta, 'eventos', r.n,
              'fotos_evidencia', r.fotos_acta,
              'resumen', '[SIMULADO] ' || r.n || ' puntos aprobados para publicar entre ' || desde || ' y ' || p_hasta
                         || '. El texto redactado llega con el proveedor de IA (D10).'),
            r.citas, 0.5, r.odoo_so, r.es_prueba)
    ON CONFLICT (motor, motor_version, clave) DO NOTHING;
    GET DIAGNOSTICS k = ROW_COUNT; n_av := n_av + k;

    IF jsonb_array_length(r.fotos_acta) > 0 THEN
      pid := NULL;
      INSERT INTO memoria.propuesta (motor, motor_version, modo, tipo, destino, clave, payload, citas, confianza, odoo_so, es_prueba)
      VALUES ('avance', 'v0', 'simulado', 'acta', 'cliente',
              'acta|' || r.odoo_so || '|' || r.max_seq,
              jsonb_build_object('odoo_so', r.odoo_so, 'hasta', p_hasta, 'evidencia', r.fotos_acta,
                'nota', '[SIMULADO] Acta de entrega con evidencia fotográfica aprobada. Requiere decisión humana.'),
              r.citas_acta, 0.5, r.odoo_so, r.es_prueba)
      ON CONFLICT (motor, motor_version, clave) DO NOTHING
      RETURNING id INTO pid;
      IF pid IS NOT NULL THEN
        n_acta := n_acta + 1;
        FOR sha IN SELECT jsonb_array_elements_text(r.fotos_acta) LOOP
          INSERT INTO memoria.vinculo (origen_tipo, origen_id, destino_tipo, destino_id, relacion, confianza, metodo)
          VALUES ('archivo', sha, 'memoria:acta', pid::text, 'evidencia_de', 1, 'motor_avance');
          n_vinc := n_vinc + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
  INSERT INTO memoria.motor_corrida (motor, modo, desde_seq, hasta_seq, leidos, producidos, detalle, inicio)
  VALUES ('avance', 'simulado', 0, 0, 0, n_av + n_acta,
          jsonb_build_object('desde', desde, 'hasta', p_hasta, 'so', p_so, 'vinculos_acta', n_vinc), ini);
  RETURN jsonb_build_object('motor', 'avance', 'desde', desde, 'hasta', p_hasta,
                            'reportes', n_av, 'actas', n_acta, 'vinculos_acta', n_vinc);
END
$mav$;
REVOKE ALL ON FUNCTION memoria.motor_avance_simulado(date, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memoria.motor_avance_simulado(date, int, text) TO memoria_motor;

-- correr_motor sabe correr 'avance' (semana que termina ayer, hora de Monterrey).
CREATE OR REPLACE FUNCTION memoria.correr_motor(p_clave text, p_dia date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp AS $a5$
DECLARE m memoria.motor;
BEGIN
  SELECT * INTO m FROM memoria.motor WHERE clave = p_clave;
  IF NOT FOUND THEN RAISE EXCEPTION 'MOTOR_DESCONOCIDO'; END IF;
  IF m.modo <> 'simulado' THEN RAISE EXCEPTION 'MOTOR_EN_MODO_REAL_NO_HABILITADO (D10)'; END IF;
  RETURN CASE p_clave
    WHEN 'derivados'  THEN memoria.motor_derivados_simulado()
    WHEN 'resumen_so' THEN memoria.motor_resumen_so(coalesce(p_dia, (now() AT TIME ZONE 'America/Monterrey')::date - 1))
    WHEN 'tickets'    THEN memoria.motor_tickets_simulado()
    WHEN 'requis'     THEN memoria.motor_requis_simulado()
    WHEN 'alertas'    THEN memoria.motor_alertas_simulado()
    WHEN 'avance'     THEN memoria.motor_avance_simulado(coalesce(p_dia, (now() AT TIME ZONE 'America/Monterrey')::date - 1))
  END;
END
$a5$;
ALTER FUNCTION memoria.correr_motor(text, date) OWNER TO memoria_motor;

-- ── R1 · Correcciones ──────────────────────────────────────────────────────
-- R1.0 (hallazgo propio, medido con la carga del histórico contra PG17):
-- memoria_0006 quitó SELECT sobre identidad a memoria_captura, y el receptor hace
-- INSERT … ON CONFLICT (autor_ref) DO NOTHING, que EXIGE poder leer la columna del
-- árbitro. Resultado: 'permission denied for table identidad' en cada evento, o sea
-- captura caída. Se devuelve SÓLO la columna autor_ref: el teléfono sigue oculto.
GRANT SELECT (autor_ref) ON memoria.identidad TO memoria_captura;

-- Carga del histórico (R4): crear las particiones de los meses que trae la
-- exportación ANTES de enviar, para que nada caiga en evento_default.
CREATE OR REPLACE FUNCTION memoria.api_preparar_historico(p_desde date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp AS $prep$
DECLARE n int;
BEGIN
  IF p_desde IS NULL OR p_desde > now()::date THEN RAISE EXCEPTION 'FECHA_INVALIDA'; END IF;
  n := memoria.asegurar_particiones_desde(p_desde, 3);
  RETURN jsonb_build_object('desde', date_trunc('month', p_desde)::date, 'particiones_nuevas', n,
    'default_vacia', NOT EXISTS (SELECT 1 FROM memoria.evento_default));
END
$prep$;
REVOKE ALL ON FUNCTION memoria.api_preparar_historico(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memoria.api_preparar_historico(date) TO memoria_admin;

-- R1.4 · evento_default deja de ser un sumidero silencioso. Una fila ahí bloquea
-- para siempre la partición de su mes (no se puede borrar: solo inserción). Ahora
-- se rechaza con FUERA_DE_PARTICION; el receptor contesta 422 y el cargador del
-- histórico pide correr api_preparar_historico antes de enviar.
CREATE OR REPLACE FUNCTION memoria.rechazar_fuera_de_particion()
RETURNS trigger LANGUAGE plpgsql AS $fdp$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'check_violation',
    MESSAGE = format('FUERA_DE_PARTICION: no hay partición para %s; correr memoria.api_preparar_historico(%L)',
                     NEW.ocurrido_en, date_trunc('month', NEW.ocurrido_en)::date);
END
$fdp$;
DROP TRIGGER IF EXISTS evento_default_rechaza ON memoria.evento_default;
CREATE TRIGGER evento_default_rechaza BEFORE INSERT ON memoria.evento_default
  FOR EACH ROW EXECUTE FUNCTION memoria.rechazar_fuera_de_particion();

-- R1.5 · Crear una partición toma un candado exclusivo sobre evento. Con una
-- lectura larga en curso, la captura se formaba detrás. Ahora espera 3 s como
-- máximo, avisa y sigue con el mes siguiente.
CREATE OR REPLACE FUNCTION memoria.asegurar_particiones_desde(desde date, meses_adelante int DEFAULT 3)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp SET lock_timeout = '3s' AS $part$
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
      BEGIN
        EXECUTE format('CREATE TABLE memoria.%I PARTITION OF memoria.evento FOR VALUES FROM (%L) TO (%L)',
                       nombre, d, (d + interval '1 month')::date);
        EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON memoria.%I '
                       'FOR EACH STATEMENT EXECUTE FUNCTION memoria.prohibir_truncate()', nombre || '_sin_truncate', nombre);
        n := n + 1;
      EXCEPTION
        WHEN lock_not_available THEN
          RAISE WARNING 'asegurar_particiones_desde: % no se creó: otra sesión tiene evento ocupado (lock_timeout 3 s). Reintentar', nombre;
        WHEN OTHERS THEN
          RAISE WARNING 'asegurar_particiones_desde: % no se creó (%)', nombre, SQLERRM;
      END;
    END IF;
    d := (d + interval '1 month')::date;
  END LOOP;
  RETURN n;
END
$part$;

-- R1.6 · memoria_lector puede PROPONER (contrato §7) pero no a nombre de un motor:
-- antes podía ganarle la llave de idempotencia a un motor real con un resumen falso.
-- RLS: el lector sólo inserta con motor = 'externo'. El dueño (fts_admin) no se ve afectado.
INSERT INTO memoria.motor (clave, descripcion, version, filtro) VALUES
  ('externo', 'Propuestas de otros módulos (comercial, suite) vía memoria_lector', 'v0', '{}')
ON CONFLICT (clave) DO NOTHING;
INSERT INTO memoria.motor_cursor (motor) VALUES ('externo') ON CONFLICT DO NOTHING;
ALTER TABLE memoria.propuesta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS propuesta_leer ON memoria.propuesta;
CREATE POLICY propuesta_leer ON memoria.propuesta FOR SELECT TO memoria_admin, memoria_motor USING (true);
DROP POLICY IF EXISTS propuesta_motores ON memoria.propuesta;
CREATE POLICY propuesta_motores ON memoria.propuesta FOR INSERT TO memoria_admin, memoria_motor WITH CHECK (true);
DROP POLICY IF EXISTS propuesta_externas ON memoria.propuesta;
CREATE POLICY propuesta_externas ON memoria.propuesta FOR INSERT TO memoria_lector WITH CHECK (motor = 'externo');

-- R1.8 · La captura no crea vínculos (eso es de motores y bandeja) y no puede
-- dar de alta un canal ya capturando: sólo los sintéticos 'prueba-…'.
REVOKE INSERT ON memoria.vinculo FROM memoria_captura;
CREATE OR REPLACE FUNCTION memoria.canal_nace_pendiente()
RETURNS trigger LANGUAGE plpgsql AS $cnp$
BEGIN
  IF current_user = 'memoria_captura' THEN
    NEW.estado_captura := CASE WHEN NEW.id_externo LIKE 'prueba-%' THEN 'capturando' ELSE 'pendiente' END;
    NEW.es_prueba := NEW.id_externo LIKE 'prueba-%' OR NEW.id_externo LIKE 'pruebapend-%';
  END IF;
  RETURN NEW;
END
$cnp$;
DROP TRIGGER IF EXISTS canal_nace_pendiente ON memoria.canal;
CREATE TRIGGER canal_nace_pendiente BEFORE INSERT ON memoria.canal
  FOR EACH ROW EXECUTE FUNCTION memoria.canal_nace_pendiente();

-- R1.11 · Una propuesta ya decidida no admite 'pospuesta' después (el índice
-- decision_una_terminal_uq sólo cuida las terminales). Corre DESPUÉS de las demás
-- validaciones ('z_'), para no cambiar qué error recibe cada caso.
CREATE OR REPLACE FUNCTION memoria.decision_ya_decidida()
RETURNS trigger LANGUAGE plpgsql AS $ydd$
BEGIN
  IF NEW.resultado = 'pospuesta'
     AND EXISTS (SELECT 1 FROM memoria.decision WHERE propuesta_id = NEW.propuesta_id AND resultado <> 'pospuesta') THEN
    RAISE EXCEPTION USING ERRCODE = 'unique_violation', MESSAGE = 'YA_DECIDIDA';
  END IF;
  RETURN NEW;
END
$ydd$;
DROP TRIGGER IF EXISTS decision_z_ya_decidida ON memoria.decision;
CREATE TRIGGER decision_z_ya_decidida BEFORE INSERT ON memoria.decision
  FOR EACH ROW EXECUTE FUNCTION memoria.decision_ya_decidida();

-- R1.12 · identidad también con candado de TRUNCATE.
DROP TRIGGER IF EXISTS identidad_sin_truncate ON memoria.identidad;
CREATE TRIGGER identidad_sin_truncate BEFORE TRUNCATE ON memoria.identidad
  FOR EACH STATEMENT EXECUTE FUNCTION memoria.prohibir_truncate();

CREATE OR REPLACE FUNCTION memoria.prueba_motores()
RETURNS jsonb LANGUAGE plpgsql AS $pm$
DECLARE res jsonb := '[]'::jsonb; corrida uuid := gen_random_uuid(); dia date := date '2026-09-27';
        ca uuid; cb uuid; cc uuid; cd uuid; ce uuid; x jsonb; x2 jsonb; pid uuid; n int; t text; ok_all boolean;
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

    -- memoria_0007 · R2 evidencia para comercial + R3 reporte de avance y acta
    INSERT INTO memoria.canal (fuente, id_externo, nombre_actual, tipo_detectado, estado_captura, es_prueba)
      VALUES ('prueba','prueba-motor-so2','SO99011 Obra sintética 2','proyecto','capturando',true) RETURNING id INTO cd;
    PERFORM memoria.vincular_canal_por_nombre(cd);
    INSERT INTO memoria.canal (fuente, id_externo, nombre_actual, tipo_detectado, estado_captura, es_prueba)
      VALUES ('prueba','prueba-motor-lead','Levantamiento sintético','levantamiento','capturando',true) RETURNING id INTO ce;
    INSERT INTO memoria.vinculo (origen_tipo, origen_id, destino_tipo, destino_id, relacion, confianza, metodo)
      VALUES ('canal', ce::text, 'odoo:crm.lead', 'LEAD99011', 'pertenece_a', 1, 'prueba');
    INSERT INTO memoria.identidad (autor_ref, fuente, valor_externo, nombre_mostrado)
      VALUES ('prueba:tel', 'prueba', '5210000099011@s.whatsapp.net', 'Nombre WhatsApp sintético');
    INSERT INTO memoria.archivo (sha256, bytes, mime, clase) VALUES
      (repeat('d4',32), 100, 'image/jpeg', 'media_general'), (repeat('e5',32), 100, 'image/jpeg', 'media_general');
    INSERT INTO memoria.archivo_clase (sha256, clase, motivo) VALUES (repeat('d4',32), 'evidencia_acta', 'prueba');
    INSERT INTO memoria.archivo_derivado (sha256, tipo, proveedor, version, contenido, es_simulado)
      VALUES (repeat('d4',32), 'descripcion_imagen', 'simulado', 'v0', 'Tablero energizado (sintético)', true);
    INSERT INTO memoria.evento (ocurrido_en, capturado_en, fuente, tipo, canal_id, autor_ref, texto, archivo_sha256, huella) VALUES
      (dia + time '10:00', now() - interval '1 hour', 'prueba','mensaje', cd, 'prueba:tel', 'Avance publicable: canalización terminada (sintético)', NULL, repeat('8',64)),
      (dia + time '10:05', now() - interval '1 hour', 'prueba','mensaje', cd, 'prueba:tel', 'INTERNO: pendiente de pago, no comentarlo (sintético)', NULL, repeat('9',64)),
      (dia + time '10:10', now() - interval '1 hour', 'prueba','imagen',  cd, 'prueba:tel', 'Foto de tablero para acta (sintético)', repeat('d4',32), repeat('a',64)),
      (dia + time '10:15', now() - interval '1 hour', 'prueba','imagen',  cd, 'prueba:tel', 'Foto general aprobada (sintético)', repeat('e5',32), repeat('b',64)),
      (dia + time '10:20', now() - interval '1 hour', 'prueba','mensaje', ce, 'prueba:tel', 'Levantamiento: 12 luminarias (sintético)', NULL, repeat('c',64));
    -- Se aprueba publicar todo MENOS el mensaje interno.
    INSERT INTO memoria.propuesta (motor, motor_version, tipo, destino, clave, payload, citas, confianza, es_prueba)
      SELECT 'resumen_so','v0','publicar','suite','publicar-prueba-0007',
             jsonb_build_object('evento_seqs', jsonb_agg(seq)), jsonb_agg(jsonb_build_object('evento_seq', seq)), 0.9, true
        FROM memoria.evento WHERE huella IN (repeat('8',64), repeat('a',64), repeat('b',64), repeat('c',64))
      RETURNING id INTO pid;
    INSERT INTO memoria.decision (propuesta_id, resultado, payload_final, decidido_por)
      SELECT pid, 'aprobada', payload, 'prueba-esteban' FROM memoria.propuesta WHERE id = pid;

    x := memoria.api_evidencia_so('SO99011');
    res := res || jsonb_build_object('caso','R2_evidencia_excluye_prueba_por_omision','esperado','0','obtenido',(jsonb_array_length(x->'eventos'))::text);
    x := memoria.api_evidencia_so('SO99011', true);
    res := res || jsonb_build_object('caso','R2_evidencia_so_solo_publicable','esperado','3','obtenido',(jsonb_array_length(x->'eventos'))::text);
    res := res || jsonb_build_object('caso','R2_evidencia_nada_interno','esperado','true','obtenido',(x::text NOT LIKE '%INTERNO%')::text);
    res := res || jsonb_build_object('caso','R2_evidencia_sin_telefono_ni_nombre','esperado','true',
      'obtenido',(x::text NOT LIKE '%5210000099011%' AND x::text NOT LIKE '%Nombre WhatsApp%')::text);
    res := res || jsonb_build_object('caso','R2_evidencia_archivos_derivados_acta','esperado','2|1|1',
      'obtenido', jsonb_array_length(x->'archivos') || '|' || jsonb_array_length(x->'derivados') || '|' ||
        (SELECT count(*) FROM jsonb_array_elements(x->'archivos') a WHERE (a->>'evidencia_acta')::boolean));
    x := memoria.api_evidencia_lead('LEAD99011', true);
    res := res || jsonb_build_object('caso','R2_evidencia_lead','esperado','1','obtenido',(jsonb_array_length(x->'eventos'))::text);
    BEGIN
      x := memoria.evidencia_publicable('odoo:res.partner', '1');
      t := 'SE_ACEPTO';
    EXCEPTION WHEN raise_exception THEN t := 'RECHAZADA';
    END;
    res := res || jsonb_build_object('caso','R2_destino_invalido','esperado','RECHAZADA','obtenido',t);

    x := memoria.motor_avance_simulado(dia, 7, 'SO99011');
    res := res || jsonb_build_object('caso','R3_avance_reporte_y_acta','esperado','1|1|1',
      'obtenido', (x->>'reportes') || '|' || (x->>'actas') || '|' || (x->>'vinculos_acta'));
    SELECT jsonb_array_length(citas) || '|' || (citas::text || payload::text NOT LIKE '%INTERNO%') INTO t
      FROM memoria.propuesta WHERE motor = 'avance' AND tipo = 'reporte_avance' AND odoo_so = 'SO99011' AND creado_en = now();
    res := res || jsonb_build_object('caso','R3_reporte_sin_interno','esperado','3|true','obtenido',t);
    SELECT ((payload->'evidencia') = jsonb_build_array(repeat('d4',32)) AND jsonb_array_length(citas) = 1)::text INTO t
      FROM memoria.propuesta WHERE motor = 'avance' AND tipo = 'acta' AND odoo_so = 'SO99011' AND creado_en = now();
    res := res || jsonb_build_object('caso','R3_acta_solo_evidencia_marcada','esperado','true','obtenido',t);
    x := memoria.motor_avance_simulado(dia, 7, 'SO99011');
    res := res || jsonb_build_object('caso','R3_avance_rerun_sin_duplicar','esperado','0|0',
      'obtenido', (x->>'reportes') || '|' || (x->>'actas'));
    SELECT r.accion || '|' || s.ligado_a_acta INTO t
      FROM memoria.retencion_simular(now() + interval '13 months') r JOIN memoria.v_archivo_estado s ON s.sha256 = r.sha256
     WHERE r.sha256 = repeat('d4',32);
    res := res || jsonb_build_object('caso','R3_foto_acta_nunca_se_mueve','esperado','NO_MOVER|true','obtenido',t);
    x := memoria.correr_motor('avance', dia);
    res := res || jsonb_build_object('caso','R3_correr_motor_avance_con_rol_motor','esperado','avance','obtenido',x->>'motor');

    -- memoria_0007 · R1 (segunda revisión)
    BEGIN
      INSERT INTO memoria.evento (ocurrido_en, capturado_en, fuente, tipo, canal_id, autor_ref, texto, huella)
      VALUES (timestamptz '2016-06-15 12:00+00', now(), 'prueba', 'mensaje', cd, 'prueba:tel', 'viejo (sintético)', repeat('f',64));
      t := 'SE_ACEPTO';
    EXCEPTION WHEN check_violation THEN t := CASE WHEN SQLERRM LIKE 'FUERA_DE_PARTICION%' THEN 'RECHAZADA' ELSE SQLERRM END;
    END;
    res := res || jsonb_build_object('caso','R1_evento_fuera_de_particion','esperado','RECHAZADA','obtenido',t);
    BEGIN
      INSERT INTO memoria.decision (propuesta_id, resultado, decidido_por) VALUES (pid, 'pospuesta', 'prueba');
      t := 'SE_ACEPTO';
    EXCEPTION WHEN unique_violation THEN t := SQLERRM;
    END;
    res := res || jsonb_build_object('caso','R1_nada_despues_de_decidir','esperado','YA_DECIDIDA','obtenido',t);

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
DO $rb7$
DECLARE dueno text; puede bool;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO dueno FROM pg_proc WHERE oid = 'memoria.api_evidencia_so(text, boolean, int)'::regprocedure;
  IF dueno <> 'memoria_admin' THEN RAISE EXCEPTION 'read-back 0007: api_evidencia_so con dueño %', dueno; END IF;
  SELECT pg_get_userbyid(proowner) INTO dueno FROM pg_proc WHERE oid = 'memoria.correr_motor(text, date)'::regprocedure;
  IF dueno <> 'memoria_motor' THEN RAISE EXCEPTION 'read-back 0007: correr_motor con dueño %', dueno; END IF;
  SELECT has_function_privilege('memoria_lector', 'memoria.api_evidencia_so(text, boolean, int)', 'EXECUTE') INTO puede;
  IF NOT puede THEN RAISE EXCEPTION 'read-back 0007: memoria_lector no puede pedir evidencia'; END IF;
  SELECT has_function_privilege('memoria_lector', 'memoria.evidencia_publicable(text, text, boolean, int)', 'EXECUTE') INTO puede;
  IF puede THEN RAISE EXCEPTION 'read-back 0007: evidencia_publicable quedó abierta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memoria.motor WHERE clave = 'avance' AND NOT activo AND modo = 'simulado') THEN
    RAISE EXCEPTION 'read-back 0007: falta el motor avance (simulado, inactivo)';
  END IF;
  IF NOT has_column_privilege('memoria_captura', 'memoria.identidad', 'autor_ref', 'SELECT') THEN
    RAISE EXCEPTION 'read-back 0007: la captura no puede resolver ON CONFLICT (autor_ref)';
  END IF;
  IF has_column_privilege('memoria_captura', 'memoria.identidad', 'valor_externo', 'SELECT') THEN
    RAISE EXCEPTION 'read-back 0007: la captura puede leer teléfonos';
  END IF;
  IF has_table_privilege('memoria_captura', 'memoria.vinculo', 'INSERT') THEN RAISE EXCEPTION 'read-back 0007: la captura aún crea vínculos'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'memoria.propuesta'::regclass) THEN RAISE EXCEPTION 'read-back 0007: propuesta sin RLS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'evento_default_rechaza') THEN RAISE EXCEPTION 'read-back 0007: default sin rechazo'; END IF;
  IF EXISTS (SELECT 1 FROM memoria.evento_default) THEN RAISE EXCEPTION 'read-back 0007: evento_default tiene filas'; END IF;
END
$rb7$;
