-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0003_senal_bandeja.sql · la bandeja del radar, sin cron (#407 §1g)
--
-- Las corridas del radar que hoy se hacen a mano en Claude Code escriben aquí por un
-- webhook fino (marketing/senal-registrar: JWT de servicio + firma + nonce). La
-- bandeja SOLO LEE. El día que el radar corra solo en el servidor, cambia el
-- escritor y la bandeja no se entera.
--
-- Se llama bandeja_senal y no `senal` porque el motor 3 ya tiene una tabla `senal`
-- (marketing_0002) con otro significado: la señal pegada a una cuenta del ciclo.
--
-- Estados: nueva → en_trabajo → enviada_crm | descartada (motivo obligatorio).
-- Responsable por defecto: quien prospecta (el que traiga el scope marketing:bandeja
-- y lo tome). Aviso visible si pasan N horas hábiles sin atender (config).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing.bandeja_senal (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  huella       char(64)    NOT NULL UNIQUE,         -- sha256 de corrida+empresa+ciudad+titulo: el radar puede repetir
  corrida      text        NOT NULL,                -- p. ej. 'radar-2026-10-05' (sin datos de nadie)
  empresa      text        NOT NULL,
  empresa_norm text        NOT NULL,
  ciudad       text        NOT NULL DEFAULT '',
  titulo       text        NOT NULL,                -- la señal en una línea
  puntaje      numeric,
  puerta       text,                                -- la puerta del radar que la vio
  evidencia    jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- fuente, fecha, liga: DATO, nunca instrucción
  estado       text        NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva','en_trabajo','enviada_crm','descartada')),
  responsable  text,
  sesion_id    uuid,
  motivo       text,
  categoria    text,
  registrada_por text      NOT NULL,
  demo         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  atendida_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT senal_descarte_motivo CHECK (estado <> 'descartada' OR char_length(btrim(coalesce(motivo,''))) >= 5)
);
CREATE INDEX IF NOT EXISTS bandeja_estado ON marketing.bandeja_senal (estado, created_at);
DROP TRIGGER IF EXISTS bandeja_touch ON marketing.bandeja_senal;
CREATE TRIGGER bandeja_touch BEFORE UPDATE ON marketing.bandeja_senal FOR EACH ROW EXECUTE FUNCTION marketing.touch();

-- Horas hábiles entre dos instantes: lunes a viernes cuentan las 24 h; sábado y domingo no.
-- (Supuesto del MVP, se cambia aquí si se quiere jornada de 9 a 18.)
CREATE OR REPLACE FUNCTION marketing.horas_habiles(p_desde timestamptz, p_hasta timestamptz) RETURNS numeric
LANGUAGE sql STABLE AS $hh$
  SELECT coalesce(sum(extract(epoch FROM (least(d + interval '1 day', p_hasta AT TIME ZONE 'America/Monterrey') - greatest(d, p_desde AT TIME ZONE 'America/Monterrey'))) / 3600), 0)
  FROM generate_series(date_trunc('day', p_desde AT TIME ZONE 'America/Monterrey'), p_hasta AT TIME ZONE 'America/Monterrey', interval '1 day') d
  WHERE extract(isodow FROM d) < 6
$hh$;

CREATE OR REPLACE FUNCTION marketing.senal_vista(b marketing.bandeja_senal) RETURNS jsonb
LANGUAGE sql STABLE AS $sv$
  SELECT jsonb_build_object('id', b.id, 'corrida', b.corrida, 'empresa', b.empresa, 'ciudad', b.ciudad, 'titulo', b.titulo,
    'puntaje', b.puntaje, 'puerta', b.puerta, 'evidencia', b.evidencia, 'estado', b.estado, 'responsable', b.responsable,
    'sesion_id', b.sesion_id, 'motivo', b.motivo, 'categoria', b.categoria, 'demo', b.demo, 'created_at', b.created_at, 'atendida_at', b.atendida_at,
    'horas_habiles', round(marketing.horas_habiles(b.created_at, coalesce(b.atendida_at, now())), 1),
    'vencida', b.estado = 'nueva' AND marketing.horas_habiles(b.created_at, now()) >= marketing.cfg('horas_habiles_aviso'))
$sv$;

-- ── El webhook del radar: marketing/senal-registrar ────────────────────────
-- req: actor (del JWT de servicio), ts, nonce, senales[] (hasta 50). Anti-replay en chat.nonce.
CREATE OR REPLACE FUNCTION marketing.api_senal(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $as$
DECLARE x jsonb; n_nuevas int := 0; n_repetidas int := 0; h text; v_id uuid;
BEGIN
  IF abs(extract(epoch FROM now()) * 1000 - (req->>'ts')::numeric) > 300000 THEN RETURN chat.err('FUERA_DE_VENTANA'); END IF;
  BEGIN
    INSERT INTO chat.nonce (nonce, actor, producto) VALUES (req->>'nonce', req->>'actor', 'marketing');
  EXCEPTION WHEN unique_violation THEN RETURN chat.err('REPETIDA');
  END;
  IF jsonb_typeof(req->'senales') <> 'array' OR jsonb_array_length(req->'senales') = 0 THEN RETURN chat.err('SIN_SENALES'); END IF;
  IF jsonb_array_length(req->'senales') > 50 THEN RETURN chat.err('DEMASIADAS', 'Hasta 50 señales por llamada.'); END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(req->'senales') LOOP
    IF coalesce(btrim(x->>'empresa'),'') = '' OR coalesce(btrim(x->>'titulo'),'') = '' OR coalesce(btrim(x->>'corrida'),'') = '' THEN
      RETURN chat.err('SENAL_INCOMPLETA', 'Cada señal lleva corrida, empresa y título.');
    END IF;
    h := encode(digest(lower(btrim(x->>'corrida')) || '|' || marketing.norm(x->>'empresa') || '|' || lower(coalesce(btrim(x->>'ciudad'),'')) || '|' || lower(btrim(x->>'titulo')), 'sha256'), 'hex');
    INSERT INTO marketing.bandeja_senal (huella, corrida, empresa, empresa_norm, ciudad, titulo, puntaje, puerta, evidencia, responsable, registrada_por, demo)
    VALUES (h, left(btrim(x->>'corrida'),60), left(btrim(x->>'empresa'),200), marketing.norm(x->>'empresa'), left(coalesce(btrim(x->>'ciudad'),''),120),
            left(btrim(x->>'titulo'),300), nullif(x->>'puntaje','')::numeric, left(x->>'puerta',60), coalesce(x->'evidencia','{}'::jsonb),
            nullif(btrim(coalesce(x->>'responsable','')),''), req->>'actor', coalesce((x->>'demo')::boolean, false))
    ON CONFLICT (huella) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN n_repetidas := n_repetidas + 1; ELSE n_nuevas := n_nuevas + 1; END IF;
    v_id := NULL;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'nuevas', n_nuevas, 'repetidas', n_repetidas);
END
$as$;

-- ── La bandeja desde la suite (modos de marketing.api_suite_ext, ampliados) ──
CREATE OR REPLACE FUNCTION marketing.api_bandeja(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $ab$
DECLARE modo text := req->>'modo'; actor text := req->>'actor'; b marketing.bandeja_senal; v_ses uuid; v_tid bigint;
BEGIN
  IF NOT coalesce(req->'scopes','[]'::jsonb) ? 'marketing:bandeja' THEN
    RETURN chat.err('SCOPE_INSUFICIENTE', 'La bandeja pide el permiso marketing:bandeja.');
  END IF;
  IF req ? 'senal_id' THEN
    BEGIN SELECT * INTO b FROM marketing.bandeja_senal WHERE id = (req->>'senal_id')::uuid; EXCEPTION WHEN others THEN RETURN chat.err('SENAL_INVALIDA'); END;
    IF b.id IS NULL THEN RETURN chat.err('SENAL_NO_EXISTE'); END IF;
  END IF;

  IF modo = 'bandeja' THEN
    RETURN jsonb_build_object('ok', true, 'aviso_horas', marketing.cfg('horas_habiles_aviso'),
      'senales', coalesce((SELECT jsonb_agg(marketing.senal_vista(x) ORDER BY (x.estado = 'nueva') DESC, x.puntaje DESC NULLS LAST, x.created_at)
        FROM marketing.bandeja_senal x
        WHERE (req->>'texto' IS NULL OR req->>'texto' = '' OR x.estado = req->>'texto')
          AND (x.estado IN ('nueva','en_trabajo') OR x.updated_at > now() - interval '30 days')), '[]'::jsonb));

  ELSIF modo = 'senal_trabajar' THEN
    -- «Trabajar» abre la señal como sesión del prospectador, con la ficha prellenada.
    IF b.estado IN ('enviada_crm','descartada') THEN RETURN chat.err('SENAL_CERRADA'); END IF;
    IF b.sesion_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'sesion_id', b.sesion_id, 'ya_existia', true); END IF;
    INSERT INTO chat.sesion (producto, tipo, titulo, autor, autor_nombre, demo, datos)
    VALUES ('marketing', 'senal', left(b.empresa || coalesce(' · ' || nullif(b.ciudad,''), ''), 120), actor, req->>'nombre', b.demo,
            jsonb_build_object('senal_id', b.id, 'empresa', b.empresa, 'ciudad', b.ciudad, 'senal', b.titulo, 'puntaje', b.puntaje))
    RETURNING id INTO v_ses;
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos)
    VALUES (v_ses, 'sistema', 'sistema', 'Señal del radar: ' || b.titulo || ' (' || b.corrida || '). La ficha arranca con lo que el radar ya sabía.', jsonb_build_object('senal_id', b.id));
    v_tid := chat.encolar(v_ses, 'senal', actor, jsonb_build_object('senal_id', b.id, 'senal', marketing.senal_vista(b)));
    UPDATE marketing.bandeja_senal SET estado = 'en_trabajo', responsable = coalesce(responsable, actor), sesion_id = v_ses, atendida_at = coalesce(atendida_at, now()) WHERE id = b.id;
    RETURN jsonb_build_object('ok', true, 'sesion_id', v_ses, 'trabajo_id', v_tid);

  ELSIF modo = 'senal_descartar' THEN
    IF char_length(btrim(coalesce(req->>'texto',''))) < 5 THEN RETURN chat.err('MOTIVO_OBLIGATORIO', 'Descartar pide el motivo: es lo que corrige al radar.'); END IF;
    UPDATE marketing.bandeja_senal SET estado = 'descartada', motivo = left(btrim(req->>'texto'),500), categoria = left(req->>'tipo',40),
      responsable = coalesce(responsable, actor), atendida_at = coalesce(atendida_at, now()) WHERE id = b.id;
    INSERT INTO marketing.evidencia (tipo, senal_id, actor, datos, demo)
    VALUES ('senal_descarte', b.id, actor, jsonb_build_object('motivo', left(btrim(req->>'texto'),500), 'categoria', req->>'tipo', 'puerta', b.puerta, 'puntaje', b.puntaje), b.demo);
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN NULL;
END
$ab$;

-- Cuando una ficha que vino de una señal se envía a CRM, la señal queda «enviada_crm».
CREATE OR REPLACE FUNCTION marketing.senal_enviada() RETURNS trigger
LANGUAGE plpgsql AS $se$
BEGIN
  UPDATE marketing.bandeja_senal s SET estado = 'enviada_crm'
    FROM marketing.ficha f WHERE f.id = NEW.ficha_id AND s.id = f.senal_id AND s.estado <> 'descartada' AND NEW.decision <> 'nada';
  UPDATE marketing.ficha SET estado = 'enviada' WHERE id = NEW.ficha_id AND NEW.decision <> 'nada' AND NEW.estado = 'escrito';
  RETURN NEW;
END
$se$;
DROP TRIGGER IF EXISTS crm_envio_senal ON marketing.crm_envio;
CREATE TRIGGER crm_envio_senal AFTER INSERT OR UPDATE OF estado ON marketing.crm_envio FOR EACH ROW EXECUTE FUNCTION marketing.senal_enviada();

-- El envío a CRM que sí escribe (marketing/odoo-lead) registra y cierra por aquí.
-- req: modo ('abrir' | 'cerrar'), actor, ficha_id / envio_id, y lo escrito y releído.
CREATE OR REPLACE FUNCTION marketing.api_crm(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $ac$
DECLARE e marketing.crm_envio; f marketing.ficha;
BEGIN
  IF NOT coalesce(req->'scopes','[]'::jsonb) ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE'); END IF;
  IF req->>'modo' = 'abrir' THEN
    IF abs(extract(epoch FROM now()) * 1000 - (req->>'ts')::numeric) > 300000 THEN RETURN chat.err('FUERA_DE_VENTANA'); END IF;
    BEGIN INSERT INTO chat.nonce (nonce, actor, producto) VALUES (req->>'nonce', req->>'actor', 'marketing');
    EXCEPTION WHEN unique_violation THEN RETURN chat.err('REPETIDA'); END;
    SELECT * INTO f FROM marketing.ficha WHERE id = (req->>'ficha_id')::uuid;
    IF f.id IS NULL THEN RETURN chat.err('FICHA_NO_EXISTE'); END IF;
    BEGIN
      INSERT INTO marketing.crm_envio (ficha_id, actor, actor_nombre, decision, busqueda, propuesta, motivo, actividad, origen, estado)
      VALUES (f.id, req->>'actor', req->>'nombre', req->>'decision', coalesce(req->'busqueda','{}'::jsonb), coalesce(req->'propuesta','{}'::jsonb),
              req->>'motivo', req->'actividad', CASE WHEN f.origen = 'radar' THEN 'radar' WHEN f.origen = 'lead' THEN 'lead' ELSE 'prospeccion' END, 'en_proceso')
      RETURNING * INTO e;
    EXCEPTION WHEN check_violation THEN RETURN chat.err('ENVIO_INCOMPLETO');
    END;
    RETURN jsonb_build_object('ok', true, 'envio_id', e.id, 'ficha', marketing.ficha_completa(f));
  ELSIF req->>'modo' = 'cerrar' THEN
    UPDATE marketing.crm_envio SET estado = CASE WHEN req->>'resultado' = 'escrito' THEN 'escrito' ELSE 'error' END,
      odoo = coalesce(req->'odoo','{}'::jsonb), readback = coalesce(req->'readback','{}'::jsonb), error = left(req->>'error',500),
      escrito_at = CASE WHEN req->>'resultado' = 'escrito' THEN now() END
     WHERE id = (req->>'envio_id')::uuid AND estado = 'en_proceso' RETURNING * INTO e;
    IF e.id IS NULL THEN RETURN chat.err('ENVIO_NO_ABIERTO'); END IF;
    RETURN jsonb_build_object('ok', true, 'estado', e.estado);
  END IF;
  RETURN chat.err('MODO_DESCONOCIDO');
END
$ac$;

-- Anti-replay de los webhooks finos que no pasan por chat.api_suite (marketing/odoo-buscar).
CREATE OR REPLACE FUNCTION marketing.api_nonce(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $an$
BEGIN
  IF abs(extract(epoch FROM now()) * 1000 - (req->>'ts')::numeric) > 300000 THEN RETURN chat.err('FUERA_DE_VENTANA'); END IF;
  BEGIN INSERT INTO chat.nonce (nonce, actor, producto) VALUES (req->>'nonce', req->>'actor', 'marketing');
  EXCEPTION WHEN unique_violation THEN RETURN chat.err('REPETIDA'); END;
  RETURN jsonb_build_object('ok', true);
END
$an$;

DO $duenos$
DECLARE x record;
BEGIN
  FOR x IN SELECT tablename FROM pg_tables WHERE schemaname = 'marketing' AND tableowner <> 'marketing_app' LOOP
    EXECUTE format('ALTER TABLE marketing.%I OWNER TO marketing_app', x.tablename);
  END LOOP;
  FOR x IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'marketing' AND pg_get_userbyid(p.proowner) <> 'marketing_app' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO marketing_app', x.f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', x.f);
  END LOOP;
END
$duenos$;
GRANT EXECUTE ON FUNCTION marketing.api_bandeja(jsonb) TO chat_app;
GRANT EXECUTE ON FUNCTION marketing.api_senal(jsonb), marketing.api_crm(jsonb), marketing.api_nonce(jsonb) TO CURRENT_USER;
