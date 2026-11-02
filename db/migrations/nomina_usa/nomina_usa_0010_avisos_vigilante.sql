-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0010 · Avisos entre pasos y vigilante (#448, MVP de punta a punta)
--
-- 1. AVISOS ENTRE PASOS (bandera avisos_modo, nace 'sombra'):
--      Richard envía          → Magaly           Magaly valida   → Erick
--      Erick autoriza         → Gerardo (liga)   Gerardo sube    → Richard, Magaly, Erick
--      Magaly/Erick devuelven → Richard (motivo) «Pedir a Magaly» → Magaly
--      miércoles 8:00 CST sin envío → recordatorio a Richard
--      miércoles 9:00 CST sin envío → Magaly y Erick
--      viernes 11:00 CST            → resumen del ajuste a Richard y Erick
--    Los de transición los dispara la BITÁCORA (trigger AFTER INSERT): cada paso de la
--    solicitud ya deja su renglón ahí, así que no se reescribe ninguna función de 0005/0009.
--    Si armar el aviso falla, la acción del usuario NO se cae: se registra 'aviso_fallido'.
-- 2. VIGILANTE (bandera vigilante_modo, nace 'sombra'), a Esteban y Erick:
--      alertas sin correr 30 min · sin envío 9:30 · sin autorizar 11:00 · sin subir 12:00
--      (miércoles CST) · ajuste del viernes sin correr · SO con bolsa y checadas de la
--      cuadrilla sin avance por más de 2 días.
--    Un aviso por EVENTO: la clave lleva lo que lo identifica (semana, latido, SO + último
--    avance), así que repetir la corrida no repite el correo.
-- En sombra se registra en nomina_usa.aviso y NO se toca retardos.envio. Un CHECK lo
-- garantiza aunque el código falle (aviso_sombra_ck), igual que alerta_sombra_ck.
-- Reutiliza la bandeja de Retardos: retardos.encolar con clave 'nomina_usa:aviso:<clave>'.
-- Reglas de db/README.md: idempotente, etiquetas con nombre, sin dólar seguido de comilla o
-- dígito (regla 8), sin llaves dobles (regla 7). Nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO nomina_usa.config (clave, valor, nota) VALUES
  ('avisos_modo',     '"sombra"'::jsonb, 'Avisos entre pasos de la solicitud. sombra = se registran en nomina_usa.aviso y NO se encolan. real = retardos.envio. Solo Esteban.'),
  ('vigilante_modo',  '"sombra"'::jsonb, 'Avisos del vigilante a Esteban y Erick. sombra = se registran y NO se encolan. Solo Esteban.'),
  ('avisos_personas', '{"richard":[98],"magaly":[63],"erick":[149],"gerardo":[59],"esteban":[32]}'::jsonb,
                      'hr.employee de cada papel del ciclo. Los correos salen de retardos.destinatarios() de cada id.'),
  ('avisos_liga',     '"https://yinyo1.github.io/fts-suite/modulos/rh/nomina-usa/"'::jsonb, 'Liga de la pantalla que va en los avisos.')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS nomina_usa.aviso (
  id             bigserial   PRIMARY KEY,
  clave          text        NOT NULL UNIQUE,
  origen         text        NOT NULL,
  evento         text        NOT NULL,
  roles          text[]      NOT NULL,
  para           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  asunto         text        NOT NULL,
  html           text        NOT NULL,
  objeto         text,
  modo_al_crear  text        NOT NULL,
  encolada       boolean     NOT NULL DEFAULT false,
  envio_id       bigint,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aviso_origen_ck CHECK (origen IN ('aviso', 'vigilante')),
  CONSTRAINT aviso_modo_ck   CHECK (modo_al_crear IN ('sombra', 'real')),
  -- En sombra jamás se encola: la base lo garantiza aunque el código falle.
  CONSTRAINT aviso_sombra_ck CHECK (NOT (modo_al_crear = 'sombra' AND (encolada OR envio_id IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS aviso_creado ON nomina_usa.aviso (creado_at DESC);

CREATE OR REPLACE FUNCTION nomina_usa.usd(p numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$ SELECT 'USD ' || to_char(coalesce(p, 0), 'FM999,999,990.00') $fn$;

CREATE OR REPLACE FUNCTION nomina_usa.modo_de(p_clave text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN nomina_usa.cfg(p_clave) #>> '{}' = 'real' THEN 'real' ELSE 'sombra' END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.avisos_ids(p_roles text[]) RETURNS integer[]
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(array_agg(DISTINCT x::integer), '{}')
    FROM unnest(coalesce(p_roles, '{}')) r, jsonb_array_elements_text(coalesce(nomina_usa.cfg('avisos_personas')->r, '[]'::jsonb)) x
   WHERE x ~ '^[0-9]' AND x !~ '[^0-9]'
$fn$;

-- Registra un aviso (una vez por clave) y, solo en real, lo encola en la bandeja de Retardos.
CREATE OR REPLACE FUNCTION nomina_usa.avisar(p_clave text, p_origen text, p_evento text, p_roles text[],
                                             p_asunto text, p_html text, p_objeto text, p_tipo text DEFAULT 'notificacion')
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE v_modo text := nomina_usa.modo_de(CASE WHEN p_origen = 'vigilante' THEN 'vigilante_modo' ELSE 'avisos_modo' END);
        v_para jsonb := nomina_usa.correos_de_lista(nomina_usa.avisos_ids(p_roles)); v_id bigint; v_env bigint;
BEGIN
  INSERT INTO nomina_usa.aviso (clave, origen, evento, roles, para, asunto, html, objeto, modo_al_crear)
  VALUES (p_clave, p_origen, p_evento, p_roles, coalesce(v_para, '[]'::jsonb), p_asunto, p_html, p_objeto, v_modo)
  ON CONFLICT (clave) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('nuevo', false, 'clave', p_clave); END IF;
  IF v_modo = 'real' AND jsonb_array_length(coalesce(v_para, '[]'::jsonb)) > 0 THEN
    v_env := retardos.encolar('nomina_usa:aviso:' || p_clave, NULL, p_tipo, v_para, '[]'::jsonb, p_asunto, p_html);
    UPDATE nomina_usa.aviso SET encolada = true, envio_id = v_env WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('nuevo', true, 'clave', p_clave, 'modo', v_modo, 'encolada', v_modo = 'real');
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.total_solicitud(p_id bigint, p_autorizado boolean) RETURNS numeric
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(sum(CASE WHEN p_autorizado THEN coalesce(autorizado_monto, 0) ELSE monto END), 0)
    FROM nomina_usa.solicitud_linea WHERE solicitud_id = p_id
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.pie_aviso() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT '<p><a href="' || coalesce(nomina_usa.cfg('avisos_liga') #>> '{}', '') || '">Abrir Nómina USA</a></p><p>Nómina USA · FTS</p>'
$fn$;

-- ══ 1 · Avisos de transición, desde la bitácora ═════════════════════════════
CREATE OR REPLACE FUNCTION nomina_usa.aviso_evento(p_bit bigint, p_evento text, p_objeto text, p_actor text, p_motivo text, p_despues jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE v_id bigint; s nomina_usa.solicitud; v_sem text; a nomina_usa.alerta; v_al text;
BEGIN
  IF p_evento = 'solicitud_enviada' THEN v_id := (p_despues->>'id')::bigint;
  ELSIF p_evento IN ('solicitud_validada', 'solicitud_autorizada', 'subida_auris', 'solicitud_devuelta') THEN
    v_id := nullif(split_part(coalesce(p_objeto, ''), ':', 2), '')::bigint;
  END IF;
  IF v_id IS NOT NULL THEN
    SELECT * INTO s FROM nomina_usa.solicitud WHERE id = v_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_sem := to_char(s.semana, 'DD/MM') || ' al ' || to_char(s.semana + 6, 'DD/MM/YYYY');
  END IF;
  IF p_evento = 'solicitud_enviada' THEN
    RETURN nomina_usa.avisar('enviada:' || s.id, 'aviso', 'enviada', '{magaly}',
      'Nómina USA: Richard envió la solicitud de la semana ' || v_sem,
      '<p>Richard envió la solicitud de nómina USA de la semana ' || v_sem || ' por ' || nomina_usa.usd(nomina_usa.total_solicitud(s.id, false)) ||
      '.</p><p>Te toca validar checadas e incidencias en la pestaña Revisión.</p>' || nomina_usa.pie_aviso(), 'solicitud:' || s.id);
  ELSIF p_evento = 'solicitud_validada' THEN
    RETURN nomina_usa.avisar('validada:' || s.id, 'aviso', 'validada', '{erick}',
      'Nómina USA: Magaly validó la solicitud de la semana ' || v_sem,
      '<p>Magaly validó la solicitud de la semana ' || v_sem || ' (' || nomina_usa.usd(nomina_usa.total_solicitud(s.id, false)) ||
      ' pedidos).</p><p>Te toca autorizar en la pestaña Revisión' ||
      CASE WHEN EXISTS (SELECT 1 FROM nomina_usa.solicitud_linea WHERE solicitud_id = s.id AND excepcion) THEN '. Trae comercial con excepción: apruébalo o bájalo al sugerido' ELSE '' END ||
      '.</p>' || nomina_usa.pie_aviso(), 'solicitud:' || s.id);
  ELSIF p_evento = 'solicitud_autorizada' THEN
    RETURN nomina_usa.avisar('autorizada:' || s.id, 'aviso', 'autorizada', '{gerardo}',
      'Nómina USA: autorizada la semana ' || v_sem || ', súbela a Auris',
      '<p>Erick autorizó la solicitud de la semana ' || v_sem || ' por ' || nomina_usa.usd(nomina_usa.total_solicitud(s.id, true)) ||
      '.</p><p>Descarga el archivo para Auris, súbelo antes de las 12:00 y marca «subido» en la pestaña Revisión.</p>' || nomina_usa.pie_aviso(), 'solicitud:' || s.id);
  ELSIF p_evento = 'subida_auris' THEN
    RETURN nomina_usa.avisar('subida:' || s.id, 'aviso', 'subida', '{richard,magaly,erick}',
      'Nómina USA: la semana ' || v_sem || ' ya está en Auris',
      '<p>Gerardo subió a Auris la nómina de la semana ' || v_sem || ' por ' || nomina_usa.usd(nomina_usa.total_solicitud(s.id, true)) ||
      '. Auris deposita el viernes.</p>' || nomina_usa.pie_aviso(), 'solicitud:' || s.id);
  ELSIF p_evento = 'solicitud_devuelta' THEN
    RETURN nomina_usa.avisar('devuelta:' || s.id, 'aviso', 'devuelta', '{richard}',
      'Nómina USA: te devolvieron la solicitud de la semana ' || v_sem,
      '<p>La solicitud de la semana ' || v_sem || ' regresó con este motivo:</p><p><b>' || coalesce(replace(replace(p_motivo, '<', '&lt;'), '>', '&gt;'), '') ||
      '</b></p><p>Corrígela y vuelve a enviarla.</p>' || nomina_usa.pie_aviso(), 'solicitud:' || s.id);
  ELSIF p_evento = 'revision_pedida' THEN
    SELECT * INTO a FROM nomina_usa.alerta WHERE id = nullif(split_part(coalesce(p_objeto, ''), ':', 2), '')::bigint;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_al := coalesce((SELECT alias FROM nomina_usa.ficha WHERE employee_id = a.employee_id), 'empleado ' || a.employee_id);
    RETURN nomina_usa.avisar('revision:' || a.id, 'aviso', 'revision_pedida', '{magaly}',
      'Nómina USA: revisa una incidencia en disputa de ' || v_al,
      '<p>Richard pide que revises la incidencia en disputa de ' || v_al || ' del ' || to_char(a.fecha, 'DD/MM/YYYY') ||
      '. La solicitud de nómina está detenida hasta que la liberes en «Alertas e incidencias».</p>' || nomina_usa.pie_aviso(), 'alerta:' || a.id);
  END IF;
  RETURN NULL;
END
$fn$;

-- Nunca tumba la acción del usuario: si el aviso falla, se registra el fallo y sigue.
CREATE OR REPLACE FUNCTION nomina_usa.bitacora_avisa() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    PERFORM nomina_usa.aviso_evento(NEW.id, NEW.evento, NEW.objeto, NEW.actor, NEW.motivo, NEW.despues);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO nomina_usa.aviso (clave, origen, evento, roles, asunto, html, objeto, modo_al_crear)
      VALUES ('fallo:' || NEW.id, 'aviso', 'aviso_fallido', '{esteban}', 'Nómina USA: no se pudo armar un aviso',
              left(SQLERRM, 300), NEW.evento || ' ' || coalesce(NEW.objeto, ''), 'sombra')
      ON CONFLICT (clave) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS bitacora_avisa ON nomina_usa.bitacora;
CREATE TRIGGER bitacora_avisa AFTER INSERT ON nomina_usa.bitacora
  FOR EACH ROW EXECUTE FUNCTION nomina_usa.bitacora_avisa();

-- ══ 2 · Avisos por reloj (miércoles y viernes, hora de Monterrey = CST) ══════
CREATE OR REPLACE FUNCTION nomina_usa.semana_de(p_dia date) RETURNS date
LANGUAGE sql IMMUTABLE AS $fn$ SELECT p_dia - ((extract(isodow FROM p_dia)::integer + 2) % 7) $fn$;

CREATE OR REPLACE FUNCTION nomina_usa.solicitud_viva(p_semana date) RETURNS nomina_usa.solicitud
LANGUAGE sql STABLE AS $fn$ SELECT * FROM nomina_usa.solicitud WHERE semana = p_semana AND estado <> 'devuelta' ORDER BY id DESC LIMIT 1 $fn$;

CREATE OR REPLACE FUNCTION nomina_usa.avisos_reloj(p_ahora timestamptz) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_loc timestamp := p_ahora AT TIME ZONE 'America/Monterrey'; v_hoy date := (p_ahora AT TIME ZONE 'America/Monterrey')::date;
        v_h time := (p_ahora AT TIME ZONE 'America/Monterrey')::time; v_dow integer := extract(isodow FROM (p_ahora AT TIME ZONE 'America/Monterrey'))::integer;
        v_sem date; s nomina_usa.solicitud; r jsonb := '[]'::jsonb; c jsonb; v_txt text; v_n integer;
BEGIN
  IF v_dow = 3 THEN
    v_sem := nomina_usa.semana_de(v_hoy);
    s := nomina_usa.solicitud_viva(v_sem);
    IF s.id IS NULL AND v_h >= time '08:00' THEN
      r := r || nomina_usa.avisar('recordatorio:' || v_sem, 'aviso', 'recordatorio_envio', '{richard}',
        'Nómina USA: hoy se envía la solicitud de la semana ' || to_char(v_sem, 'DD/MM'),
        '<p>Buenos días. Hoy miércoles se envía la solicitud de nómina USA de la semana ' || to_char(v_sem, 'DD/MM') || ' al ' ||
        to_char(v_sem + 6, 'DD/MM/YYYY') || ' antes de las 9:00 CST: avance por SO, estimado de miércoles y jueves, reparto y comercial.</p>' || nomina_usa.pie_aviso(),
        'semana:' || v_sem, 'recordatorio');
    END IF;
    IF s.id IS NULL AND v_h >= time '09:00' THEN
      r := r || nomina_usa.avisar('sin_envio_9:' || v_sem, 'aviso', 'sin_envio_9', '{magaly,erick}',
        'Nómina USA: Richard no ha enviado la solicitud (9:00)',
        '<p>Son las 9:00 CST del miércoles y la solicitud de la semana ' || to_char(v_sem, 'DD/MM') || ' al ' || to_char(v_sem + 6, 'DD/MM/YYYY') ||
        ' todavía no llega. Auris necesita el archivo antes de las 12:00.</p>' || nomina_usa.pie_aviso(), 'semana:' || v_sem, 'escalamiento');
    END IF;
  ELSIF v_dow = 5 AND v_h >= time '11:00' THEN
    v_sem := v_hoy - 7;
    IF EXISTS (SELECT 1 FROM nomina_usa.solicitud WHERE semana = v_sem AND estado IN ('autorizada', 'subida')) THEN
      c := nomina_usa.ajuste_calculo(v_sem);
      SELECT count(*), string_agg(CASE WHEN x->>'tipo' = 'comercial'
               THEN '<li>Comercial ' || to_char((x->>'fecha')::date, 'DD/MM') || ': estimado ' || (x->>'estimado') || ' %, real ' || (x->>'real') || ' % → ' || nomina_usa.usd((x->>'monto')::numeric) || ' a la siguiente solicitud</li>'
               ELSE '<li>Avance SO ' || (x->>'so_id') || ' ' || (x->>'rol') || ': estimado ' || (x->>'estimado') || ' %, real ' || (x->>'real') || ' % (informativo: ' || nomina_usa.usd((x->>'monto')::numeric) || ')</li>' END, '')
        INTO v_n, v_txt FROM jsonb_array_elements(coalesce(c->'ajustes', '[]'::jsonb)) x;
      r := r || nomina_usa.avisar('resumen_ajuste:' || v_sem, 'aviso', 'resumen_ajuste', '{richard,erick}',
        'Nómina USA: ajuste del viernes, semana ' || to_char(v_sem, 'DD/MM'),
        '<p>Ajuste de lo estimado el miércoles contra lo real, semana ' || to_char(v_sem, 'DD/MM') || ' al ' || to_char(v_sem + 6, 'DD/MM/YYYY') || ':</p>' ||
        CASE WHEN coalesce(v_n, 0) = 0 THEN '<p>Sin diferencias.</p>' ELSE '<ul>' || v_txt || '</ul>' END || nomina_usa.pie_aviso(), 'semana:' || v_sem, 'resumen');
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', nomina_usa.modo_de('avisos_modo'), 'avisos', r);
END
$fn$;

-- ══ 3 · Vigilante ═══════════════════════════════════════════════════════════
-- Latido de nomina-usa/alertas: cada corrida reescribe horas_dia (ON CONFLICT … updated_at = now()).
CREATE OR REPLACE FUNCTION nomina_usa.latido_alertas() RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$ SELECT max(updated_at) FROM nomina_usa.horas_dia $fn$;

CREATE OR REPLACE FUNCTION nomina_usa.vigilante(p_ahora timestamptz) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_hoy date := (p_ahora AT TIME ZONE 'America/Monterrey')::date; v_h time := (p_ahora AT TIME ZONE 'America/Monterrey')::time;
        v_dow integer := extract(isodow FROM (p_ahora AT TIME ZONE 'America/Monterrey'))::integer;
        v_sem date; s nomina_usa.solicitud; r jsonb := '[]'::jsonb; v_lat timestamptz := nomina_usa.latido_alertas(); x record; c jsonb; v_falt integer;
        E text[] := '{esteban,erick}';
BEGIN
  -- 1. nomina-usa/alertas no corrió en 30 min.
  IF v_lat IS NULL OR v_lat < p_ahora - interval '30 minutes' THEN
    r := r || nomina_usa.avisar('vig_alertas:' || coalesce(to_char(v_lat AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), 'nunca'), 'vigilante', 'alertas_sin_correr', E,
      'Vigilante nómina USA: las alertas de checada no han corrido',
      '<p>nomina-usa/alertas no ha corrido desde ' || coalesce(to_char(v_lat AT TIME ZONE 'America/Monterrey', 'DD/MM HH24:MI') || ' CST', 'nunca') ||
      '. Sin esa corrida no hay alertas ni horas para la solicitud. Revisa el workflow en n8n.</p>', 'workflow:nomina-usa/alertas', 'alerta');
  END IF;
  -- 2 a 4. Miércoles: envío 9:30, autorización 11:00, subida 12:00 (CST).
  IF v_dow = 3 THEN
    v_sem := nomina_usa.semana_de(v_hoy); s := nomina_usa.solicitud_viva(v_sem);
    IF v_h >= time '09:30' AND s.id IS NULL THEN
      r := r || nomina_usa.avisar('vig_sin_envio:' || v_sem, 'vigilante', 'sin_envio_930', E, 'Vigilante nómina USA: 9:30 y no hay solicitud',
        '<p>Son las 9:30 CST y Richard no ha enviado la solicitud de la semana ' || to_char(v_sem, 'DD/MM') || '.</p>', 'semana:' || v_sem, 'alerta');
    END IF;
    IF v_h >= time '11:00' AND coalesce(s.estado, '') NOT IN ('autorizada', 'subida') THEN
      r := r || nomina_usa.avisar('vig_sin_autorizar:' || v_sem, 'vigilante', 'sin_autorizar_11', E, 'Vigilante nómina USA: 11:00 y la solicitud no está autorizada',
        '<p>Son las 11:00 CST y la solicitud de la semana ' || to_char(v_sem, 'DD/MM') || ' está ' || coalesce('«' || s.estado || '»', 'sin enviar') || '.</p>', 'semana:' || v_sem, 'alerta');
    END IF;
    IF v_h >= time '12:00' AND coalesce(s.estado, '') <> 'subida' THEN
      r := r || nomina_usa.avisar('vig_sin_subir:' || v_sem, 'vigilante', 'sin_subir_12', E, 'Vigilante nómina USA: 12:00 y no se ha subido a Auris',
        '<p>Son las 12:00 CST y la nómina de la semana ' || to_char(v_sem, 'DD/MM') || ' no está marcada como subida (estado: ' || coalesce(s.estado, 'sin enviar') || ').</p>', 'semana:' || v_sem, 'alerta');
    END IF;
  END IF;
  -- 5. Viernes 11:00: el ajuste de la semana que cerró tiene diferencias que no se guardaron.
  IF v_dow = 5 AND v_h >= time '11:00' THEN
    v_sem := v_hoy - 7; c := nomina_usa.ajuste_calculo(v_sem);
    SELECT count(*) INTO v_falt FROM jsonb_array_elements(coalesce(c->'ajustes', '[]'::jsonb)) a
     WHERE NOT EXISTS (SELECT 1 FROM nomina_usa.ajuste j WHERE j.semana_origen = v_sem AND j.tipo = a->>'tipo'
                         AND coalesce(j.employee_id, 0) = coalesce((a->>'employee_id')::integer, 0) AND coalesce(j.so_id, 0) = coalesce((a->>'so_id')::integer, 0)
                         AND coalesce(j.rol, '') = coalesce(a->>'rol', '') AND coalesce(j.fecha, '2000-01-01') = coalesce((a->>'fecha')::date, '2000-01-01'));
    IF v_falt > 0 THEN
      r := r || nomina_usa.avisar('vig_ajuste:' || v_sem, 'vigilante', 'ajuste_sin_correr', E, 'Vigilante nómina USA: el ajuste del viernes no corrió',
        '<p>La semana ' || to_char(v_sem, 'DD/MM') || ' tiene ' || v_falt || ' diferencia(s) entre lo estimado y lo real que no se guardaron. ' ||
        'Revisa nomina-usa/ajuste-viernes. Si no corre, el envío de la semana siguiente lo hace.</p>', 'semana:' || v_sem, 'alerta');
    END IF;
  END IF;
  -- 6. SO con bolsa vigente, checadas de la cuadrilla (fichas USA/HÍBRIDO) y sin avance en más de 2 días con checada.
  FOR x IN
    SELECT b.so_id, b.so_nombre, (SELECT max(a.fecha) FROM nomina_usa.avance_so a WHERE a.so_id = b.so_id) AS ult_av,
           (SELECT count(DISTINCT h.fecha) FROM nomina_usa.horas_dia h JOIN nomina_usa.ficha f ON f.employee_id = h.employee_id AND f.activo AND f.pais_nomina <> 'MX'
             WHERE h.so_id = b.so_id AND h.fecha BETWEEN v_hoy - 14 AND v_hoy
               AND h.fecha > coalesce((SELECT max(a.fecha) FROM nomina_usa.avance_so a WHERE a.so_id = b.so_id), date '1900-01-01')) AS dias
      FROM nomina_usa.bolsa b WHERE b.vigente
  LOOP
    IF x.dias > 2 THEN
      r := r || nomina_usa.avisar('vig_so_sin_avance:' || x.so_id || ':' || coalesce(x.ult_av::text, 'nunca'), 'vigilante', 'so_sin_avance', E,
        'Vigilante nómina USA: ' || coalesce(split_part(x.so_nombre, ' - ', 1), 'SO ' || x.so_id) || ' sin avance',
        '<p>' || coalesce(split_part(x.so_nombre, ' - ', 1), 'SO ' || x.so_id) || ' tiene ' || x.dias || ' días con checadas de la cuadrilla y ' ||
        coalesce('ningún avance desde el ' || to_char(x.ult_av, 'DD/MM'), 'ningún avance reportado') || '. Sin avance no hay disponible para pagar.</p>',
        'so:' || x.so_id, 'alerta');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'modo', nomina_usa.modo_de('vigilante_modo'), 'latido_alertas', v_lat, 'avisos', r);
END
$fn$;

-- ══ 4 · Panel ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION nomina_usa.a_avisos(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'modos', jsonb_build_object('avisos', nomina_usa.modo_de('avisos_modo'), 'vigilante', nomina_usa.modo_de('vigilante_modo')),
    'latido_alertas', nomina_usa.latido_alertas(),
    'avisos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'clave', a.clave, 'origen', a.origen, 'evento', a.evento, 'roles', to_jsonb(a.roles),
                 'n_para', jsonb_array_length(a.para), 'asunto', a.asunto, 'html', a.html, 'modo', a.modo_al_crear, 'encolada', a.encolada, 'creado_at', a.creado_at)
                 ORDER BY a.id DESC) FROM (SELECT * FROM nomina_usa.aviso ORDER BY id DESC LIMIT 100) a), '[]'::jsonb))
$fn$;

-- config_guardar: mismas reglas que 0009 más las banderas nuevas (las de 0011/0012 se validan aquí también).
CREATE OR REPLACE FUNCTION nomina_usa.a_config_guardar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_clave text := p->>'clave'; v_antes jsonb;
BEGIN
  IF v_clave = 'alertas_modo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CLAVE_OBSOLETA', 'usa', jsonb_build_array('alertas_modo_usa', 'alertas_modo_mx'));
  END IF;
  SELECT valor INTO v_antes FROM nomina_usa.config WHERE clave = v_clave;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'CLAVE_DESCONOCIDA'); END IF;
  IF v_clave IN ('alertas_modo_usa', 'alertas_modo_mx', 'avisos_modo', 'vigilante_modo') AND NOT (p->'valor' IN ('"sombra"'::jsonb, '"real"'::jsonb)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MODO_INVALIDO');
  END IF;
  IF v_clave IN ('kiosko_activo', 'evidencia_activa', 'costo_odoo_activo', 'conciliacion_activa') AND jsonb_typeof(p->'valor') <> 'boolean' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;
  IF v_clave IN ('avisos_personas', 'costo_odoo_mapa', 'conciliacion_formato', 'conciliacion_cuentas') AND jsonb_typeof(p->'valor') <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;
  IF coalesce(btrim(p->>'motivo'), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_REQUERIDO'); END IF;
  UPDATE nomina_usa.config SET valor = p->'valor', updated_at = now(), updated_by = coalesce(p->>'actor', current_user)
   WHERE clave = v_clave;
  PERFORM nomina_usa.log(p->>'actor', 'config', v_clave, v_antes, p->'valor', p->>'motivo');
  RETURN jsonb_build_object('ok', true, 'clave', v_clave, 'antes', v_antes, 'despues', p->'valor');
END
$fn$;

INSERT INTO nomina_usa.accion (nombre, funcion, scopes) VALUES
  ('avisos', 'nomina_usa.a_avisos', '{nomina_usa:validar,nomina_usa:autorizar,nomina_usa:archivo,nomina_usa:kiosko}')
ON CONFLICT (nombre) DO UPDATE SET funcion = excluded.funcion, scopes = excluded.scopes;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
