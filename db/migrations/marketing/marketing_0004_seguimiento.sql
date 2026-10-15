-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0004_seguimiento.sql · Lanzamiento 15-oct (#411 → «Marketing · Lanzamiento 15-oct»)
--
-- ADITIVA. Nada se borra ni se renombra a la vista de nadie:
--   · Seguimiento en la tarjeta: seg_tarjeta (una por prospecto enviado a CRM o traído de
--     «Prospecto Lead»), seg_toque (cada cosa que pasó: es evidencia), seg_asignacion (quién la
--     trajo, quién la trabaja, y cada cambio) y seg_odoo (la nota + actividad de un toque,
--     pendiente de credencial hasta que marketing/odoo-lead esté encendido).
--   · Ficha v2 (cuenta primero): la base RECHAZA una plataforma de compras o de contratistas
--     sin liga que la respalde, y un conmutador «verificado» sin las dos fuentes.
--   · Bandeja clasificada: origen (radar | manual | investigacion), tipo de prospecto,
--     región, plataformas y estatus comercial, como COLUMNAS nuevas (ADD COLUMN IF NOT EXISTS).
--   · Topes de tokens en la base: por ficha y por persona y día, además del de consultas.
--   · Las respuestas del motor de Marketing quedan amarradas a su producto (chat.consumo ya existía).
--
-- Los modos nuevos entran por DESPACHADORES: la función vieja se conserva con sufijo _0001 y la
-- nueva atiende lo suyo y le pasa el resto. Si la vieja se vuelve a aplicar (correr 0001 otra
-- vez), este archivo la vuelve a envolver sin perder nada (ver «despachadores» abajo).
--
-- Sin datos: el repo es público. Reglas de db/README.md: idempotente, NOLOGIN, etiquetas de dólar
-- con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Configuración nueva (se cambia sin migración) ──────────────────────────
INSERT INTO marketing.config (clave, valor, nota) VALUES
  ('tope_tokens_ficha',        '2500000', 'tokens por ficha (todo incluido): si una ficha lo pasa, queda un aviso y se dice en la sesión'),
  ('tope_tokens_dia',          '15000000', 'tokens por persona y día: con esto gastado, ya no se abren fichas hasta mañana'),
  ('consultas_por_ficha_v2',   '12', 'consultas web por ficha en el método de cuenta primero (la web va al final)'),
  ('bloques_secos_corte',      '2', 'bloques de búsqueda sin resultado útil antes de cortar la cascada'),
  ('decisores_max',            '5', 'decisores por planta en la ficha v2'),
  ('sin_toque_dias',           '7', 'días sin toque para que una tarjeta salga en «sin toque»'),
  ('odoo_user_id_omision',     '12', 'user_id del lead en Odoo (Sales FTS) cuando la persona no tiene uno propio'),
  ('etapa_prospecto_lead',     '17', 'stage_id de «Prospecto Lead» en crm.lead: lo ÚNICO donde Marketing crea o escribe un lead'),
  -- Ids de catálogo que el workflow ya NO lee de Odoo (ir.model, mail.activity.type y crm.tag están
  -- fuera de la lista blanca). En 0 = sin configurar: marketing/odoo-lead se niega a escribir y lo dice.
  ('odoo_modelo_crm_lead_id',  '0', 'ir.model.id de crm.lead (Ajustes > Técnico > Modelos). Lo pone Esteban'),
  ('odoo_modelo_res_partner_id','0', 'ir.model.id de res.partner. Lo pone Esteban'),
  ('odoo_tag_origen_id',       '0', 'crm.tag.id de la etiqueta de origen «Marketing · suite» (0 = sin etiqueta; el origen va en la nota)'),
  ('odoo_actividad_llamada_id','0', 'mail.activity.type.id de Llamada (0 = el tipo por omisión de Odoo; el tipo va en el resumen)'),
  ('odoo_actividad_correo_id', '0', 'mail.activity.type.id de Correo (0 = por omisión)'),
  ('odoo_actividad_visita_id', '0', 'mail.activity.type.id de Reunión (0 = por omisión)')
ON CONFLICT (clave) DO NOTHING;

-- Quién es quién en Odoo para el lead (user_id), por persona de la suite. Sin fila = Sales FTS.
-- El autor real NUNCA sale de aquí: sale del JWT y va en la nota, la etiqueta y marketing.*.
CREATE TABLE IF NOT EXISTS marketing.persona_odoo (
  actor        text PRIMARY KEY,
  odoo_user_id int  NOT NULL CHECK (odoo_user_id > 0),
  nota         text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION marketing.odoo_user(p_actor text) RETURNS int
LANGUAGE sql STABLE AS $ou$
  SELECT coalesce((SELECT odoo_user_id FROM marketing.persona_odoo WHERE actor = p_actor), marketing.cfg('odoo_user_id_omision'))
$ou$;
CREATE OR REPLACE FUNCTION marketing.odoo_cfg(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $oc$
  SELECT jsonb_build_object('user_id', marketing.odoo_user(p_actor), 'etapa_id', marketing.cfg('etapa_prospecto_lead'),
    'modelo_crm_lead_id', marketing.cfg('odoo_modelo_crm_lead_id'), 'modelo_res_partner_id', marketing.cfg('odoo_modelo_res_partner_id'),
    'tag_origen_id', marketing.cfg('odoo_tag_origen_id'),
    'actividad', jsonb_build_object('llamada', marketing.cfg('odoo_actividad_llamada_id'), 'correo', marketing.cfg('odoo_actividad_correo_id'),
                                    'visita', marketing.cfg('odoo_actividad_visita_id')))
$oc$;


-- ── Seguimiento en la tarjeta ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.seg_tarjeta (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id       uuid        NOT NULL UNIQUE,                 -- chat.sesion tipo 'seguimiento': el chat de la tarjeta
  ficha_id        uuid,                                         -- la ficha que la originó (si vino de «Enviar a CRM»)
  envio_id        uuid,                                         -- marketing.crm_envio
  odoo_lead_id    int,                                          -- crm.lead (escrito o traído de «Prospecto Lead»)
  empresa         text        NOT NULL,
  empresa_norm    text        NOT NULL,
  ciudad          text        NOT NULL DEFAULT '',
  etapa           text        NOT NULL DEFAULT 'Prospecto Lead',
  estado          text        NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','pausada','ganada','perdida')),
  origen          text        NOT NULL DEFAULT 'envio' CHECK (origen IN ('envio','odoo','manual')),
  traida_por      text        NOT NULL,                         -- quien prospectó (no cambia)
  responsable     text        NOT NULL,                         -- quien la trabaja hoy (reasignable)
  resumen         text        NOT NULL DEFAULT '',
  siguiente       jsonb,                                        -- {tipo, fecha, resumen}: el siguiente paso con fecha
  sugerencia      text,                                         -- qué decir o dónde más buscar (motor)
  ultimo_toque_at timestamptz,
  toques          int         NOT NULL DEFAULT 0,
  demo            boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seg_tarjeta_lead_uq ON marketing.seg_tarjeta (odoo_lead_id) WHERE odoo_lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS seg_tarjeta_ficha_uq ON marketing.seg_tarjeta (ficha_id) WHERE ficha_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS seg_tarjeta_resp ON marketing.seg_tarjeta (responsable, estado);
DROP TRIGGER IF EXISTS seg_tarjeta_touch ON marketing.seg_tarjeta;
CREATE TRIGGER seg_tarjeta_touch BEFORE UPDATE ON marketing.seg_tarjeta FOR EACH ROW EXECUTE FUNCTION marketing.touch();

-- Cada toque es evidencia: canal que funcionó, tiempo a respuesta, si avanzó de etapa.
CREATE TABLE IF NOT EXISTS marketing.seg_toque (
  id           bigserial   PRIMARY KEY,
  tarjeta_id   uuid        NOT NULL REFERENCES marketing.seg_tarjeta(id),
  actor        text        NOT NULL,
  texto        text        NOT NULL DEFAULT '',
  canal        text        CHECK (canal IS NULL OR canal IN ('conmutador','llamada','correo','whatsapp','visita','linkedin','portal','otro')),
  resultado    text        CHECK (resultado IS NULL OR resultado IN ('sin_respuesta','transferido','contesto','cita','envio_info','rechazo','alta_proveedor','otro')),
  avanzo_etapa boolean     NOT NULL DEFAULT false,
  horas_a_respuesta numeric,                                    -- desde el toque anterior con respuesta pendiente
  estado       text        NOT NULL DEFAULT 'sin_procesar' CHECK (estado IN ('sin_procesar','procesado')),
  propuesta    jsonb       NOT NULL DEFAULT '{}'::jsonb,        -- lo que propuso el motor: resumen, siguiente, sugerencia
  demo         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  procesado_at timestamptz
);
CREATE INDEX IF NOT EXISTS seg_toque_t ON marketing.seg_toque (tarjeta_id, id);

CREATE TABLE IF NOT EXISTS marketing.seg_asignacion (
  id          bigserial   PRIMARY KEY,
  tarjeta_id  uuid        NOT NULL REFERENCES marketing.seg_tarjeta(id),
  de          text,
  a           text        NOT NULL,
  actor       text        NOT NULL,
  motivo      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- La escritura a Odoo de un toque (nota + actividad en el lead). Igual que crm_envio: queda
-- REGISTRADA como pendiente de credencial hasta que marketing/odoo-lead esté encendido.
CREATE TABLE IF NOT EXISTS marketing.seg_odoo (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarjeta_id  uuid        NOT NULL REFERENCES marketing.seg_tarjeta(id),
  toque_id    bigint      REFERENCES marketing.seg_toque(id),
  actor       text        NOT NULL,
  actor_nombre text,
  odoo_lead_id int,
  nota        text        NOT NULL,
  actividad   jsonb       NOT NULL,
  estado      text        NOT NULL DEFAULT 'pendiente_credencial' CHECK (estado IN ('pendiente_credencial','en_proceso','escrito','error')),
  readback    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  escrito_at  timestamptz,
  CONSTRAINT seg_odoo_actividad CHECK (actividad ? 'fecha' AND actividad ? 'resumen' AND char_length(btrim(actividad->>'resumen')) >= 5)
);

-- La evidencia acepta los tipos nuevos (se ensancha el CHECK, no se quita nada).
ALTER TABLE marketing.evidencia DROP CONSTRAINT IF EXISTS evidencia_tipo_check;
ALTER TABLE marketing.evidencia ADD CONSTRAINT evidencia_tipo_check CHECK (tipo IN
  ('edicion','descarte','filtro','crm','rebuscar','senal_descarte','lead','toque','reasignacion','carga','correccion_carga'));

-- ── Bandeja clasificada (P4) y carga desde investigación (P3) ──────────────
ALTER TABLE marketing.bandeja_senal ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'radar';
ALTER TABLE marketing.bandeja_senal ADD COLUMN IF NOT EXISTS tipo_prospecto text;
ALTER TABLE marketing.bandeja_senal ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE marketing.bandeja_senal ADD COLUMN IF NOT EXISTS acceso jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE marketing.bandeja_senal ADD COLUMN IF NOT EXISTS estatus_comercial text;
ALTER TABLE marketing.bandeja_senal DROP CONSTRAINT IF EXISTS bandeja_origen_check;
ALTER TABLE marketing.bandeja_senal ADD CONSTRAINT bandeja_origen_check CHECK (origen IN ('radar','manual','investigacion'));
ALTER TABLE marketing.bandeja_senal DROP CONSTRAINT IF EXISTS bandeja_tipo_check;
ALTER TABLE marketing.bandeja_senal ADD CONSTRAINT bandeja_tipo_check CHECK (tipo_prospecto IS NULL OR tipo_prospecto IN ('usuario_final','epc','otro_partner'));

-- ── Reglas duras de la ficha v2 (valen para la ficha y para la bandeja) ────
-- Una plataforma (compras o contratistas) que no sea «no_encontrado» exige una liga http(s).
-- Un conmutador «verificado» exige que Google Maps y el sitio oficial coincidan.
CREATE OR REPLACE FUNCTION marketing.acceso_error(a jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $ae$
DECLARE k text; p jsonb;
BEGIN
  IF a IS NULL OR jsonb_typeof(a) <> 'object' THEN RETURN NULL; END IF;
  FOREACH k IN ARRAY ARRAY['compras','contratistas'] LOOP
    p := a->k;
    IF p IS NULL OR jsonb_typeof(p) = 'null' THEN CONTINUE; END IF;
    IF jsonb_typeof(p) = 'string' THEN p := jsonb_build_object('plataforma', p); END IF;
    IF coalesce(p->>'plataforma','') NOT IN ('', 'no_encontrado', 'sin_dato')
       AND coalesce(p->>'liga','') !~ '^https?://[^ ]+\.[^ ]+' THEN
      RETURN 'PLATAFORMA_SIN_LIGA:' || k;
    END IF;
    IF coalesce(p->>'confianza','sin_dato') NOT IN ('confirmado','indicio','sin_dato') THEN RETURN 'CONFIANZA_INVALIDA:' || k; END IF;
    IF coalesce(p->>'alcance','') NOT IN ('', 'mexico', 'eua', 'global') THEN RETURN 'ALCANCE_INVALIDO:' || k; END IF;
  END LOOP;
  RETURN NULL;
END
$ae$;

CREATE OR REPLACE FUNCTION marketing.ficha2_error(d jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $f2$
DECLARE e text; c jsonb; x jsonb;
BEGIN
  IF d IS NULL OR coalesce((d->>'v')::int, 1) < 2 THEN RETURN NULL; END IF;
  e := marketing.acceso_error(d->'acceso'); IF e IS NOT NULL THEN RETURN e; END IF;
  c := d->'conmutador';
  IF c IS NOT NULL AND coalesce((c->>'verificado')::boolean, false)
     AND NOT (coalesce(c->>'fuente_maps','') ~ '^https?://' AND coalesce(c->>'fuente_sitio','') ~ '^https?://'
              AND regexp_replace(coalesce(c->>'numero_maps',''), '[^0-9]', '', 'g') <> ''
              AND regexp_replace(coalesce(c->>'numero_maps',''), '[^0-9]', '', 'g') = regexp_replace(coalesce(c->>'numero_sitio',''), '[^0-9]', '', 'g')) THEN
    RETURN 'CONMUTADOR_NO_VERIFICADO';
  END IF;
  IF jsonb_typeof(d->'decisores') = 'array' AND jsonb_array_length(d->'decisores') > 5 THEN RETURN 'DEMASIADOS_DECISORES'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d->'por_que') = 'array' THEN d->'por_que' ELSE '[]'::jsonb END) LOOP
    IF coalesce(x->>'liga','') !~ '^https?://' OR coalesce(x->>'fecha','') = '' THEN RETURN 'SENAL_SIN_FUENTE'; END IF;
  END LOOP;
  IF d->>'tipo_prospecto' IS NOT NULL AND d->>'tipo_prospecto' NOT IN ('usuario_final','epc','otro_partner') THEN RETURN 'TIPO_INVALIDO'; END IF;
  RETURN NULL;
END
$f2$;

-- Red de seguridad: aunque alguien escriba por otro camino, la tabla no acepta lo que la regla prohíbe.
CREATE OR REPLACE FUNCTION marketing.ficha2_guardia() RETURNS trigger
LANGUAGE plpgsql AS $fg$
DECLARE e text;
BEGIN
  IF TG_TABLE_NAME = 'ficha' THEN e := marketing.ficha2_error(NEW.datos);
  ELSE e := marketing.acceso_error(NEW.acceso); END IF;
  IF e IS NOT NULL THEN RAISE EXCEPTION 'REGLA_FICHA2 %', e USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END
$fg$;
DROP TRIGGER IF EXISTS ficha2_guardia ON marketing.ficha;
CREATE TRIGGER ficha2_guardia BEFORE INSERT OR UPDATE OF datos ON marketing.ficha FOR EACH ROW EXECUTE FUNCTION marketing.ficha2_guardia();
DROP TRIGGER IF EXISTS bandeja_acceso_guardia ON marketing.bandeja_senal;
CREATE TRIGGER bandeja_acceso_guardia BEFORE INSERT OR UPDATE OF acceso ON marketing.bandeja_senal FOR EACH ROW EXECUTE FUNCTION marketing.ficha2_guardia();

-- ── Tokens en la base ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.tokens_de(t jsonb) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $tk$
  SELECT coalesce((t->>'input')::bigint,0) + coalesce((t->>'output')::bigint,0) + coalesce((t->>'cache_leida')::bigint,0) + coalesce((t->>'cache_escrita')::bigint,0)
$tk$;

CREATE OR REPLACE FUNCTION marketing.uso(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $uso$
  SELECT jsonb_build_object(
    'dia', (now() AT TIME ZONE 'America/Monterrey')::date,
    'fichas_hoy', (SELECT count(*) FROM marketing.ficha WHERE actor = p_actor AND NOT demo AND (created_at AT TIME ZONE 'America/Monterrey')::date = (now() AT TIME ZONE 'America/Monterrey')::date),
    'tope_fichas', marketing.cfg('tope_fichas_dia'),
    'consultas_hoy', coalesce((SELECT sum(n) FROM marketing.consulta WHERE actor = p_actor AND dia = (now() AT TIME ZONE 'America/Monterrey')::date), 0),
    'tope_consultas', marketing.cfg('tope_consultas_dia'),
    'consultas_por_ficha', marketing.cfg('consultas_por_ficha_v2'),
    'tokens_por_ficha', coalesce((SELECT round(avg(marketing.tokens_de(c.tokens)))
                                  FROM chat.consumo c JOIN chat.trabajo t ON t.id = c.trabajo_id WHERE c.producto = 'marketing' AND t.tipo IN ('mensaje','rebuscar','senal')), marketing.cfg('tokens_por_ficha')),
    'tokens_medidos', EXISTS (SELECT 1 FROM chat.consumo WHERE producto = 'marketing'),
    'tokens_hoy', coalesce((SELECT sum(marketing.tokens_de(c.tokens)) FROM chat.consumo c
                            WHERE c.producto = 'marketing' AND c.actor = p_actor AND (c.created_at AT TIME ZONE 'America/Monterrey')::date = (now() AT TIME ZONE 'America/Monterrey')::date), 0),
    'tope_tokens_dia', marketing.cfg('tope_tokens_dia'),
    'tope_tokens_ficha', marketing.cfg('tope_tokens_ficha'),
    'bloques_secos_corte', marketing.cfg('bloques_secos_corte'),
    'decisores_max', marketing.cfg('decisores_max'),
    'lista_max', marketing.cfg('lista_max'))
$uso$;

-- Una ficha que pasa su tope deja un aviso (el motor lo publica con conteos, nunca con nombres).
CREATE OR REPLACE FUNCTION marketing.consumo_tope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $ct$
DECLARE tk bigint := marketing.tokens_de(NEW.tokens);
BEGIN
  IF NEW.producto = 'marketing' AND tk > marketing.cfg('tope_tokens_ficha') THEN
    INSERT INTO chat.aviso (producto, tipo, actor, texto)
    SELECT 'marketing', 'tope_tokens_ficha', NEW.actor, 'Un trabajo gastó ' || tk || ' tokens (tope por ficha ' || marketing.cfg('tope_tokens_ficha') || ').'
    WHERE NOT EXISTS (SELECT 1 FROM chat.aviso WHERE producto = 'marketing' AND tipo = 'tope_tokens_ficha' AND texto LIKE 'Un trabajo gastó ' || tk || '%');
  END IF;
  RETURN NEW;
END
$ct$;
DO $trg$
BEGIN
  -- El trigger va sobre chat.consumo (dueño chat_app); se crea solo si quien migra puede.
  EXECUTE 'DROP TRIGGER IF EXISTS marketing_consumo_tope ON chat.consumo';
  EXECUTE 'CREATE TRIGGER marketing_consumo_tope AFTER INSERT OR UPDATE OF tokens ON chat.consumo FOR EACH ROW EXECUTE FUNCTION marketing.consumo_tope()';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'sin permiso para el trigger de tope por ficha: queda el tope por día';
END
$trg$;

-- ── Vistas de una tarjeta ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.seg_vista(t marketing.seg_tarjeta) RETURNS jsonb
LANGUAGE sql STABLE AS $sv$
  SELECT jsonb_build_object('id', t.id, 'sesion_id', t.sesion_id, 'ficha_id', t.ficha_id, 'odoo_lead_id', t.odoo_lead_id,
    'empresa', t.empresa, 'ciudad', t.ciudad, 'etapa', t.etapa, 'estado', t.estado, 'origen', t.origen,
    'traida_por', t.traida_por, 'responsable', t.responsable, 'resumen', t.resumen, 'siguiente', t.siguiente,
    'sugerencia', t.sugerencia, 'ultimo_toque_at', t.ultimo_toque_at, 'toques', t.toques, 'demo', t.demo,
    'created_at', t.created_at, 'updated_at', t.updated_at,
    'vencida', t.estado = 'abierta' AND (t.siguiente->>'fecha') < to_char(chat.hoy(), 'YYYY-MM-DD'),
    'hoy', t.estado = 'abierta' AND (t.siguiente->>'fecha') = to_char(chat.hoy(), 'YYYY-MM-DD'),
    'sin_toque', t.estado = 'abierta' AND coalesce(t.ultimo_toque_at, t.created_at) < now() - make_interval(days => marketing.cfg('sin_toque_dias')),
    'odoo_pendientes', (SELECT count(*) FROM marketing.seg_odoo o WHERE o.tarjeta_id = t.id AND o.estado = 'pendiente_credencial'))
$sv$;

/** Abre (o devuelve) la tarjeta de un prospecto. Una ficha o un lead de Odoo = UNA tarjeta. */
CREATE OR REPLACE FUNCTION marketing.seg_abrir(p_actor text, p_nombre text, p_ficha uuid, p_lead int, p_empresa text, p_ciudad text,
  p_origen text, p_traida text, p_resumen text, p_etapa text, p_demo boolean, p_envio uuid DEFAULT NULL) RETURNS marketing.seg_tarjeta
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $sa$
DECLARE t marketing.seg_tarjeta; v_ses uuid;
BEGIN
  IF p_ficha IS NOT NULL THEN SELECT * INTO t FROM marketing.seg_tarjeta WHERE ficha_id = p_ficha; END IF;
  IF t.id IS NULL AND p_lead IS NOT NULL THEN SELECT * INTO t FROM marketing.seg_tarjeta WHERE odoo_lead_id = p_lead; END IF;
  IF t.id IS NOT NULL THEN
    -- Si ya existía, se le completa lo que faltaba (el lead escrito después, la ficha que lo originó).
    UPDATE marketing.seg_tarjeta SET odoo_lead_id = coalesce(odoo_lead_id, p_lead), ficha_id = coalesce(ficha_id, p_ficha), envio_id = coalesce(envio_id, p_envio)
     WHERE id = t.id RETURNING * INTO t;
    RETURN t;
  END IF;
  INSERT INTO chat.sesion (producto, tipo, titulo, autor, autor_nombre, demo, datos)
  VALUES ('marketing', 'seguimiento', left(p_empresa || coalesce(' · ' || nullif(p_ciudad,''), ''), 120), coalesce(p_traida, p_actor), p_nombre, coalesce(p_demo, false),
          jsonb_build_object('ficha_id', p_ficha, 'odoo_lead_id', p_lead, 'empresa', p_empresa, 'ciudad', p_ciudad))
  RETURNING id INTO v_ses;
  INSERT INTO marketing.seg_tarjeta (sesion_id, ficha_id, envio_id, odoo_lead_id, empresa, empresa_norm, ciudad, etapa, origen, traida_por, responsable, resumen, demo)
  VALUES (v_ses, p_ficha, p_envio, p_lead, left(p_empresa,200), marketing.norm(p_empresa), left(coalesce(p_ciudad,''),120), coalesce(nullif(p_etapa,''), 'Prospecto Lead'),
          p_origen, coalesce(p_traida, p_actor), coalesce(p_traida, p_actor), left(coalesce(p_resumen,''), 2000), coalesce(p_demo, false))
  RETURNING * INTO t;
  INSERT INTO marketing.seg_asignacion (tarjeta_id, de, a, actor, motivo) VALUES (t.id, NULL, t.responsable, p_actor, 'alta (' || p_origen || ')');
  INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos)
  VALUES (v_ses, 'sistema', 'sistema', 'Tarjeta de seguimiento de ' || p_empresa || '. Cuenta aquí lo que pase (marcaste, te pasaron, no contestó…) y el motor propone el siguiente paso.',
          jsonb_build_object('tarjeta_id', t.id));
  RETURN t;
END
$sa$;

-- Todo lo que se envía a CRM (escrito o pendiente de credencial) nace con su tarjeta.
CREATE OR REPLACE FUNCTION marketing.seg_desde_envio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $sde$
DECLARE f marketing.ficha; lead int;
BEGIN
  IF NEW.decision = 'nada' OR NEW.estado IN ('error','en_proceso') THEN RETURN NEW; END IF;
  SELECT * INTO f FROM marketing.ficha WHERE id = NEW.ficha_id;
  IF f.id IS NULL THEN RETURN NEW; END IF;
  lead := coalesce(nullif(NEW.readback->>'lead_id','')::int, CASE WHEN NEW.decision = 'nota_lead' THEN nullif(NEW.busqueda->>'lead_destino','')::int END,
                   CASE WHEN NEW.decision = 'crear_lead' AND NEW.estado = 'escrito' THEN nullif(NEW.readback->>'id','')::int END);
  PERFORM marketing.seg_abrir(NEW.actor, NEW.actor_nombre, f.id, lead, f.empresa, f.ciudad, 'envio', f.actor,
    coalesce(f.editado->>'gancho', f.datos->>'gancho', f.datos->>'resumen', ''), 'Prospecto Lead', f.demo, NEW.id);
  IF NEW.actividad IS NOT NULL THEN
    UPDATE marketing.seg_tarjeta SET siguiente = coalesce(siguiente, NEW.actividad) WHERE ficha_id = f.id;
  END IF;
  RETURN NEW;
END
$sde$;
DROP TRIGGER IF EXISTS crm_envio_tarjeta ON marketing.crm_envio;
CREATE TRIGGER crm_envio_tarjeta AFTER INSERT OR UPDATE OF estado ON marketing.crm_envio FOR EACH ROW EXECUTE FUNCTION marketing.seg_desde_envio();

-- ── API de Seguimiento (suite) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.api_seguimiento(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $as$
DECLARE modo text := req->>'modo'; actor text := req->>'actor'; t marketing.seg_tarjeta; f marketing.ficha; v_id uuid; v_tid bigint;
  scopes jsonb := coalesce(req->'scopes','[]'::jsonb); d jsonb := coalesce(req->'datos','{}'::jsonb); n int; s chat.sesion;
BEGIN
  IF req ? 'tarjeta_id' THEN
    BEGIN SELECT * INTO t FROM marketing.seg_tarjeta WHERE id = (req->>'tarjeta_id')::uuid; EXCEPTION WHEN others THEN RETURN chat.err('TARJETA_INVALIDA'); END;
    IF t.id IS NULL THEN RETURN chat.err('TARJETA_NO_EXISTE'); END IF;
  END IF;

  IF modo = 'tarjetas' THEN
    RETURN jsonb_build_object('ok', true, 'hoy', to_char(chat.hoy(), 'YYYY-MM-DD'), 'sin_toque_dias', marketing.cfg('sin_toque_dias'),
      'tarjetas', coalesce((SELECT jsonb_agg(marketing.seg_vista(x) ORDER BY (x.siguiente->>'fecha') NULLS LAST, x.updated_at DESC)
        FROM marketing.seg_tarjeta x
        WHERE (coalesce(req->>'texto','mias') = 'todas' OR x.responsable = actor)
          AND (x.estado IN ('abierta','pausada') OR x.updated_at > now() - interval '30 days')), '[]'::jsonb));

  ELSIF modo = 'tarjeta' THEN
    IF t.id IS NULL THEN RETURN chat.err('SIN_TARJETA'); END IF;
    RETURN jsonb_build_object('ok', true, 'tarjeta', marketing.seg_vista(t), 'hoy', to_char(chat.hoy(), 'YYYY-MM-DD'),
      'toques', coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'actor', q.actor, 'texto', q.texto, 'canal', q.canal, 'resultado', q.resultado,
          'avanzo_etapa', q.avanzo_etapa, 'estado', q.estado, 'propuesta', q.propuesta, 'created_at', q.created_at,
          'odoo', (SELECT jsonb_build_object('estado', o.estado, 'id', o.id) FROM marketing.seg_odoo o WHERE o.toque_id = q.id ORDER BY o.created_at DESC LIMIT 1)) ORDER BY q.id)
        FROM marketing.seg_toque q WHERE q.tarjeta_id = t.id), '[]'::jsonb),
      'asignaciones', coalesce((SELECT jsonb_agg(jsonb_build_object('de', a.de, 'a', a.a, 'actor', a.actor, 'motivo', a.motivo, 'at', a.created_at) ORDER BY a.id)
        FROM marketing.seg_asignacion a WHERE a.tarjeta_id = t.id), '[]'::jsonb),
      'ficha', (SELECT marketing.ficha_corta(x) || jsonb_build_object('acceso', x.datos->'acceso', 'conmutador', x.datos->'conmutador', 'tipo_prospecto', x.datos->'tipo_prospecto')
                FROM marketing.ficha x WHERE x.id = t.ficha_id));

  ELSIF modo = 'tarjeta_abrir' THEN
    -- Desde una ficha (ya enviada o no) o desde un lead de «Prospecto Lead» que trajo el conector de solo lectura.
    IF NOT scopes ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE', 'Seguimiento pide el permiso marketing:crm.'); END IF;
    IF req ? 'ficha_id' THEN
      BEGIN SELECT * INTO f FROM marketing.ficha WHERE id = (req->>'ficha_id')::uuid; EXCEPTION WHEN others THEN RETURN chat.err('FICHA_INVALIDA'); END;
      IF f.id IS NULL THEN RETURN chat.err('FICHA_NO_EXISTE'); END IF;
      t := marketing.seg_abrir(actor, req->>'nombre', f.id, NULL, f.empresa, f.ciudad, 'manual', f.actor, coalesce(f.editado->>'gancho', f.datos->>'gancho', ''), 'Prospecto Lead', f.demo);
    ELSE
      IF coalesce(btrim(d->>'empresa'),'') = '' THEN RETURN chat.err('SIN_EMPRESA'); END IF;
      t := marketing.seg_abrir(actor, req->>'nombre', NULL, nullif(d->>'odoo_lead_id','')::int, btrim(d->>'empresa'), d->>'ciudad',
             CASE WHEN d ? 'odoo_lead_id' THEN 'odoo' ELSE 'manual' END, actor, d->>'resumen', d->>'etapa', coalesce((d->>'demo')::boolean, false));
    END IF;
    RETURN jsonb_build_object('ok', true, 'tarjeta', marketing.seg_vista(t));

  ELSIF modo = 'tarjeta_reasignar' THEN
    IF t.id IS NULL THEN RETURN chat.err('SIN_TARJETA'); END IF;
    IF NOT scopes ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE'); END IF;
    IF coalesce(btrim(req->>'texto'),'') !~ '^[a-z0-9._-]{3,60}' THEN RETURN chat.err('RESPONSABLE_INVALIDO', 'Escribe el usuario de la suite de quien la va a trabajar.'); END IF;
    IF btrim(req->>'texto') = t.responsable THEN RETURN chat.err('SIN_CAMBIOS'); END IF;
    INSERT INTO marketing.seg_asignacion (tarjeta_id, de, a, actor, motivo) VALUES (t.id, t.responsable, btrim(req->>'texto'), actor, left(req->>'razon', 300));
    UPDATE marketing.seg_tarjeta SET responsable = btrim(req->>'texto') WHERE id = t.id RETURNING * INTO t;
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (t.sesion_id, 'sistema', 'sistema',
      'Ahora la trabaja ' || t.responsable || ' (la asignó ' || actor || '). La historia completa se queda.', jsonb_build_object('tarjeta_id', t.id));
    INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('reasignacion', t.ficha_id, actor, jsonb_build_object('tarjeta_id', t.id, 'a', t.responsable), t.demo);
    RETURN jsonb_build_object('ok', true, 'tarjeta', marketing.seg_vista(t));

  ELSIF modo = 'tarjeta_estado' THEN
    IF t.id IS NULL THEN RETURN chat.err('SIN_TARJETA'); END IF;
    IF coalesce(req->>'texto','') NOT IN ('abierta','pausada','ganada','perdida') THEN RETURN chat.err('ESTADO_INVALIDO'); END IF;
    IF req->>'texto' IN ('perdida','pausada') AND char_length(btrim(coalesce(req->>'razon',''))) < 5 THEN RETURN chat.err('MOTIVO_OBLIGATORIO', 'Di por qué: es lo que aprende.'); END IF;
    UPDATE marketing.seg_tarjeta SET estado = req->>'texto' WHERE id = t.id RETURNING * INTO t;
    INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('toque', t.ficha_id, actor, jsonb_build_object('tarjeta_id', t.id, 'estado', t.estado, 'razon', req->>'razon'), t.demo);
    RETURN jsonb_build_object('ok', true, 'tarjeta', marketing.seg_vista(t));

  ELSIF modo = 'tarjeta_siguiente' THEN
    -- La persona acepta (o corrige) el siguiente paso que propuso el motor.
    IF t.id IS NULL THEN RETURN chat.err('SIN_TARJETA'); END IF;
    IF coalesce(d->>'fecha','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' OR char_length(btrim(coalesce(d->>'resumen',''))) < 5 THEN RETURN chat.err('SIGUIENTE_INCOMPLETO', 'El siguiente paso lleva fecha y qué se va a hacer.'); END IF;
    UPDATE marketing.seg_tarjeta SET siguiente = jsonb_build_object('tipo', coalesce(d->>'tipo','llamada'), 'fecha', d->>'fecha', 'resumen', left(btrim(d->>'resumen'),200)) WHERE id = t.id RETURNING * INTO t;
    RETURN jsonb_build_object('ok', true, 'tarjeta', marketing.seg_vista(t));

  ELSIF modo = 'toque_odoo' THEN
    -- «Con un toque escribe nota y actividad en el lead»: lo manda marketing/odoo-lead; si no está
    -- encendido, queda REGISTRADO aquí como pendiente de credencial (se manda después sin recapturar).
    IF t.id IS NULL THEN RETURN chat.err('SIN_TARJETA'); END IF;
    IF NOT scopes ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE'); END IF;
    IF coalesce(d->'actividad'->>'fecha','') < to_char(chat.hoy(), 'YYYY-MM-DD') THEN RETURN chat.err('ACTIVIDAD_OBLIGATORIA', 'La actividad necesita fecha de hoy en adelante.'); END IF;
    BEGIN
      INSERT INTO marketing.seg_odoo (tarjeta_id, toque_id, actor, actor_nombre, odoo_lead_id, nota, actividad)
      VALUES (t.id, nullif(d->>'toque_id','')::bigint, actor, req->>'nombre', t.odoo_lead_id, left(coalesce(d->>'nota',''), 4000), d->'actividad') RETURNING id INTO v_id;
    EXCEPTION WHEN check_violation THEN RETURN chat.err('ENVIO_INCOMPLETO', 'La actividad lleva fecha y qué se va a hacer.');
    END;
    UPDATE marketing.seg_tarjeta SET siguiente = d->'actividad' WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'seg_odoo_id', v_id, 'estado', 'pendiente_credencial', 'odoo_lead_id', t.odoo_lead_id);

  ELSIF modo = 'tarjetas_traer' THEN
    -- Trae «Prospecto Lead» de Odoo con el conector de SOLO LECTURA del motor (mientras odoo-buscar no esté encendido).
    IF NOT scopes ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE'); END IF;
    SELECT * INTO s FROM chat.sesion WHERE producto = 'marketing' AND tipo = 'odoo_traer' AND autor = actor AND estado = 'abierta' ORDER BY created_at DESC LIMIT 1;
    IF s.id IS NULL THEN
      INSERT INTO chat.sesion (producto, tipo, titulo, autor, autor_nombre) VALUES ('marketing', 'odoo_traer', 'Traer «Prospecto Lead» de Odoo', actor, req->>'nombre') RETURNING * INTO s;
    END IF;
    IF EXISTS (SELECT 1 FROM chat.trabajo WHERE sesion_id = s.id AND estado IN ('pendiente','tomado')) THEN
      RETURN jsonb_build_object('ok', true, 'ya_en_cola', true, 'sesion_id', s.id);
    END IF;
    v_tid := chat.encolar(s.id, 'odoo_traer', actor, jsonb_build_object('etapa_id', marketing.cfg('etapa_prospecto_lead')));
    RETURN jsonb_build_object('ok', true, 'trabajo_id', v_tid, 'sesion_id', s.id);
  END IF;
  RETURN NULL;
END
$as$;

-- ── API del motor: lo nuevo ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.api_motor_seg(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $ms$
DECLARE modo text := req->>'modo'; actor text := req->>'actor'; v_ses uuid := (req->>'sesion_id')::uuid;
  t marketing.seg_tarjeta; q marketing.seg_toque; p jsonb := coalesce(req->'propuesta','{}'::jsonb); x jsonb; n_nuevas int := 0; n_rep int := 0; n_mal int := 0;
  h text; v_id uuid; e text; errores jsonb := '[]'::jsonb; ant marketing.seg_toque;
BEGIN
  IF modo = 'tarjeta_propuesta' THEN
    -- El motor interpretó lo que contó la persona: clasifica el toque y propone resumen, siguiente paso y sugerencia.
    SELECT * INTO t FROM marketing.seg_tarjeta WHERE sesion_id = v_ses;
    IF t.id IS NULL THEN RETURN chat.err('SIN_TARJETA'); END IF;
    IF p->'siguiente' IS NOT NULL AND (coalesce(p->'siguiente'->>'fecha','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' OR coalesce(p->'siguiente'->>'resumen','') = '') THEN
      RETURN chat.err('SIGUIENTE_INCOMPLETO');
    END IF;
    SELECT * INTO q FROM marketing.seg_toque WHERE tarjeta_id = t.id AND estado = 'sin_procesar' ORDER BY id DESC LIMIT 1;
    IF q.id IS NOT NULL THEN
      SELECT * INTO ant FROM marketing.seg_toque WHERE tarjeta_id = t.id AND id < q.id ORDER BY id DESC LIMIT 1;
      UPDATE marketing.seg_toque SET canal = CASE WHEN p->>'canal' IN ('conmutador','llamada','correo','whatsapp','visita','linkedin','portal','otro') THEN p->>'canal' END,
        resultado = CASE WHEN p->>'resultado' IN ('sin_respuesta','transferido','contesto','cita','envio_info','rechazo','alta_proveedor','otro') THEN p->>'resultado' END,
        avanzo_etapa = coalesce((p->>'avanzo_etapa')::boolean, false), propuesta = p, estado = 'procesado', procesado_at = now(),
        horas_a_respuesta = CASE WHEN p->>'resultado' IN ('contesto','cita','envio_info','rechazo','alta_proveedor') AND ant.id IS NOT NULL
                                 THEN round(extract(epoch FROM q.created_at - ant.created_at) / 3600, 1) END
       WHERE id = q.id RETURNING * INTO q;
      UPDATE marketing.seg_toque SET estado = 'procesado', procesado_at = now() WHERE tarjeta_id = t.id AND estado = 'sin_procesar' AND id < q.id;
      INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('toque', t.ficha_id, q.actor,
        jsonb_build_object('tarjeta_id', t.id, 'canal', q.canal, 'resultado', q.resultado, 'avanzo_etapa', q.avanzo_etapa, 'horas_a_respuesta', q.horas_a_respuesta), t.demo);
    END IF;
    UPDATE marketing.seg_tarjeta SET resumen = coalesce(left(p->>'resumen', 2000), resumen), sugerencia = coalesce(left(p->>'sugerencia', 1500), sugerencia),
      siguiente = coalesce(p->'siguiente', siguiente), etapa = coalesce(nullif(left(p->>'etapa',60),''), etapa)
     WHERE id = t.id RETURNING * INTO t;
    RETURN jsonb_build_object('ok', true, 'tarjeta', marketing.seg_vista(t), 'toque_id', q.id);

  ELSIF modo = 'tarjetas_importar' THEN
    -- Lo que el conector de solo lectura leyó de «Prospecto Lead»: una tarjeta por lead, sin duplicar.
    IF jsonb_typeof(req->'leads') <> 'array' THEN RETURN chat.err('SIN_LEADS'); END IF;
    FOR x IN SELECT * FROM jsonb_array_elements(req->'leads') LOOP
      IF coalesce((x->>'id')::int, 0) <= 0 OR coalesce(btrim(x->>'empresa'),'') = '' THEN n_mal := n_mal + 1; CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM marketing.seg_tarjeta WHERE odoo_lead_id = (x->>'id')::int) THEN n_rep := n_rep + 1; CONTINUE; END IF;
      t := marketing.seg_abrir(actor, NULL, NULL, (x->>'id')::int, btrim(x->>'empresa'), x->>'ciudad', 'odoo',
             coalesce(nullif(x->>'responsable',''), actor), x->>'resumen', coalesce(x->>'etapa','Prospecto Lead'), false);
      IF x->>'siguiente_fecha' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
        UPDATE marketing.seg_tarjeta SET siguiente = jsonb_build_object('tipo', coalesce(x->>'siguiente_tipo','llamada'), 'fecha', x->>'siguiente_fecha',
          'resumen', coalesce(nullif(x->>'siguiente_resumen',''), 'Actividad de Odoo')), ultimo_toque_at = nullif(x->>'ultimo_toque_at','')::timestamptz WHERE id = t.id;
      END IF;
      n_nuevas := n_nuevas + 1;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'nuevas', n_nuevas, 'repetidas', n_rep, 'incompletas', n_mal);

  ELSIF modo = 'senales_cargar' THEN
    -- P3: filas de cuentas de un documento de investigación → señales de la bandeja, con su evidencia.
    IF jsonb_typeof(req->'senales') <> 'array' OR jsonb_array_length(req->'senales') = 0 THEN RETURN chat.err('SIN_SENALES'); END IF;
    IF jsonb_array_length(req->'senales') > 200 THEN RETURN chat.err('DEMASIADAS', 'Hasta 200 filas por carga.'); END IF;
    FOR x IN SELECT * FROM jsonb_array_elements(req->'senales') LOOP
      e := CASE WHEN coalesce(btrim(x->>'empresa'),'') = '' OR coalesce(btrim(x->>'titulo'),'') = '' THEN 'FILA_INCOMPLETA' ELSE marketing.acceso_error(x->'acceso') END;
      IF e IS NOT NULL THEN n_mal := n_mal + 1; errores := errores || jsonb_build_object('fila', x->>'fila', 'error', e); CONTINUE; END IF;
      h := encode(digest(lower(coalesce(req->>'corrida','investigacion')) || '|' || marketing.norm(x->>'empresa') || '|' || lower(coalesce(btrim(x->>'ciudad'),'')) || '|' || lower(btrim(x->>'titulo')), 'sha256'), 'hex');
      INSERT INTO marketing.bandeja_senal (huella, corrida, empresa, empresa_norm, ciudad, titulo, puntaje, puerta, evidencia, responsable, registrada_por, demo,
                                           origen, tipo_prospecto, region, acceso, estatus_comercial)
      VALUES (h, left(coalesce(req->>'corrida','investigacion'),60), left(btrim(x->>'empresa'),200), marketing.norm(x->>'empresa'), left(coalesce(btrim(x->>'ciudad'),''),120),
              left(btrim(x->>'titulo'),300), nullif(x->>'puntaje','')::numeric, 'investigacion', coalesce(x->'evidencia','{}'::jsonb), NULL, coalesce(actor,'motor'),
              coalesce((x->>'demo')::boolean, false), 'investigacion',
              CASE WHEN x->>'tipo_prospecto' IN ('usuario_final','epc','otro_partner') THEN x->>'tipo_prospecto' END,
              left(x->>'region',60), coalesce(x->'acceso','{}'::jsonb), left(x->>'estatus_comercial',120))
      ON CONFLICT (huella) DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NULL THEN n_rep := n_rep + 1; ELSE n_nuevas := n_nuevas + 1; END IF;
      v_id := NULL;
    END LOOP;
    INSERT INTO marketing.evidencia (tipo, actor, datos) VALUES ('carga', coalesce(actor,'motor'),
      jsonb_build_object('corrida', req->>'corrida', 'nuevas', n_nuevas, 'repetidas', n_rep, 'rechazadas', n_mal, 'documento', req->>'documento'));
    RETURN jsonb_build_object('ok', true, 'nuevas', n_nuevas, 'repetidas', n_rep, 'rechazadas', n_mal, 'errores', errores);

  ELSIF modo = 'presupuesto' THEN
    -- ¿Puede seguir esta ficha? Tokens de hoy de la persona contra su tope (la base manda).
    x := marketing.uso(actor);
    RETURN jsonb_build_object('ok', true, 'uso', x,
      'seguir', (x->>'tokens_hoy')::bigint < (x->>'tope_tokens_dia')::bigint AND (x->>'consultas_hoy')::int < (x->>'tope_consultas')::int);
  END IF;
  RETURN NULL;
END
$ms$;

-- ── Despachadores: los modos nuevos sin reescribir los viejos ──────────────
DO $desp$
DECLARE fn text; src text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['api_suite_ext','api_motor_ext','gancho'] LOOP
    SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'marketing' AND p.proname = fn;
    -- Si la actual NO es despachador (la de 0001, recién aplicada o vuelta a aplicar), pasa a _0001.
    IF src IS NOT NULL AND position('despachador_0004' IN src) = 0 THEN
      IF fn = 'gancho' THEN
        EXECUTE 'DROP FUNCTION IF EXISTS marketing.gancho_0001(text, jsonb)';
        EXECUTE 'ALTER FUNCTION marketing.gancho(text, jsonb) RENAME TO gancho_0001';
      ELSE
        EXECUTE format('DROP FUNCTION IF EXISTS marketing.%I(jsonb)', fn || '_0001');
        EXECUTE format('ALTER FUNCTION marketing.%I(jsonb) RENAME TO %I', fn, fn || '_0001');
      END IF;
    END IF;
  END LOOP;
END
$desp$;

CREATE OR REPLACE FUNCTION marketing.api_suite_ext(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $se$
DECLARE r jsonb;
BEGIN
  -- despachador_0004: Seguimiento primero; lo demás, como siempre.
  IF req->>'modo' IN ('tarjetas','tarjeta','tarjeta_abrir','tarjeta_reasignar','tarjeta_estado','tarjeta_siguiente','toque_odoo','tarjetas_traer') THEN
    RETURN marketing.api_seguimiento(req);
  END IF;
  r := marketing.api_suite_ext_0001(req);
  -- La ficha completa trae v2 tal cual (datos): nada que cambiar aquí.
  RETURN r;
END
$se$;

CREATE OR REPLACE FUNCTION marketing.api_motor_ext(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $me$
DECLARE e text; u jsonb;
BEGIN
  -- despachador_0004
  IF req->>'modo' IN ('tarjeta_propuesta','tarjetas_importar','senales_cargar','presupuesto') THEN RETURN marketing.api_motor_seg(req); END IF;
  IF req->>'modo' = 'ficha_guardar' THEN
    -- Regla dura v2 ANTES de escribir: el motor recibe el porqué, no un 500.
    e := marketing.ficha2_error(req->'ficha'->'datos');
    IF e IS NOT NULL THEN RETURN chat.err('REGLA_FICHA2', e); END IF;
  END IF;
  IF req->>'modo' = 'consultas' AND req->>'actor' IS NOT NULL THEN
    u := marketing.uso(req->>'actor');
    IF (u->>'tokens_hoy')::bigint >= (u->>'tope_tokens_dia')::bigint AND coalesce((req->>'n')::int, 0) > 0 THEN
      RETURN jsonb_build_object('ok', true, 'uso', u, 'quedan_hoy', 0, 'parar', 'TOPE_TOKENS_DIA');
    END IF;
  END IF;
  RETURN marketing.api_motor_ext_0001(req);
END
$me$;

CREATE OR REPLACE FUNCTION marketing.gancho(evento text, req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $gc$
DECLARE t marketing.seg_tarjeta; u jsonb; tipo text := coalesce(req->>'tipo','');
BEGIN
  -- despachador_0004
  IF evento = 'nueva' AND tipo IN ('empresa','lista','senal') THEN
    u := marketing.uso(req->>'actor');
    IF (u->>'tokens_hoy')::bigint >= (u->>'tope_tokens_dia')::bigint THEN
      RETURN chat.err('TOPE_TOKENS', 'Hoy ya se gastó el tope de tokens de prospección (' || (u->>'tope_tokens_dia') || '). Mañana se reinicia.');
    END IF;
  END IF;
  IF evento = 'enviar' THEN
    SELECT * INTO t FROM marketing.seg_tarjeta WHERE sesion_id = (req->>'sesion_id')::uuid;
    IF t.id IS NOT NULL AND coalesce(btrim(req->>'texto'),'') <> '' THEN
      -- Lo que contó la persona ES el toque, aunque el motor esté dormido.
      INSERT INTO marketing.seg_toque (tarjeta_id, actor, texto, demo) VALUES (t.id, req->>'actor', left(req->>'texto', 4000), t.demo);
      UPDATE marketing.seg_tarjeta SET ultimo_toque_at = now(), toques = toques + 1 WHERE id = t.id;
    END IF;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF evento IN ('hilo','tomar') THEN
    SELECT * INTO t FROM marketing.seg_tarjeta WHERE sesion_id = (req->>'sesion_id')::uuid;
    IF t.id IS NOT NULL THEN
      RETURN marketing.gancho_0001(evento, req) || jsonb_build_object('tarjeta', marketing.seg_vista(t),
        'ficha_tarjeta', (SELECT marketing.ficha_completa(f) FROM marketing.ficha f WHERE f.id = t.ficha_id));
    END IF;
  END IF;
  RETURN marketing.gancho_0001(evento, req);
END
$gc$;

-- Señales: la vista y el registro del radar entienden las columnas nuevas.
CREATE OR REPLACE FUNCTION marketing.senal_vista(b marketing.bandeja_senal) RETURNS jsonb
LANGUAGE sql STABLE AS $sv2$
  SELECT jsonb_build_object('id', b.id, 'corrida', b.corrida, 'empresa', b.empresa, 'ciudad', b.ciudad, 'titulo', b.titulo,
    'puntaje', b.puntaje, 'puerta', b.puerta, 'evidencia', b.evidencia, 'estado', b.estado, 'responsable', b.responsable,
    'sesion_id', b.sesion_id, 'motivo', b.motivo, 'categoria', b.categoria, 'demo', b.demo, 'created_at', b.created_at, 'atendida_at', b.atendida_at,
    'origen', b.origen, 'tipo_prospecto', b.tipo_prospecto, 'region', b.region, 'acceso', b.acceso, 'estatus_comercial', b.estatus_comercial,
    'horas_habiles', round(marketing.horas_habiles(b.created_at, coalesce(b.atendida_at, now())), 1),
    'vencida', b.estado = 'nueva' AND marketing.horas_habiles(b.created_at, now()) >= marketing.cfg('horas_habiles_aviso'))
$sv2$;

-- El radar (y una alta manual) pueden mandar las columnas nuevas; lo de antes sigue igual.
CREATE OR REPLACE FUNCTION marketing.api_senal(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $as2$
DECLARE x jsonb; n_nuevas int := 0; n_repetidas int := 0; h text; v_id uuid; e text;
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
    e := marketing.acceso_error(x->'acceso');
    IF e IS NOT NULL THEN RETURN chat.err('REGLA_FICHA2', e); END IF;
    h := encode(digest(lower(btrim(x->>'corrida')) || '|' || marketing.norm(x->>'empresa') || '|' || lower(coalesce(btrim(x->>'ciudad'),'')) || '|' || lower(btrim(x->>'titulo')), 'sha256'), 'hex');
    INSERT INTO marketing.bandeja_senal (huella, corrida, empresa, empresa_norm, ciudad, titulo, puntaje, puerta, evidencia, responsable, registrada_por, demo,
                                         origen, tipo_prospecto, region, acceso, estatus_comercial)
    VALUES (h, left(btrim(x->>'corrida'),60), left(btrim(x->>'empresa'),200), marketing.norm(x->>'empresa'), left(coalesce(btrim(x->>'ciudad'),''),120),
            left(btrim(x->>'titulo'),300), nullif(x->>'puntaje','')::numeric, left(x->>'puerta',60), coalesce(x->'evidencia','{}'::jsonb),
            nullif(btrim(coalesce(x->>'responsable','')),''), req->>'actor', coalesce((x->>'demo')::boolean, false),
            CASE WHEN x->>'origen' IN ('radar','manual','investigacion') THEN x->>'origen' ELSE 'radar' END,
            CASE WHEN x->>'tipo_prospecto' IN ('usuario_final','epc','otro_partner') THEN x->>'tipo_prospecto' END,
            left(x->>'region',60), coalesce(x->'acceso','{}'::jsonb), left(x->>'estatus_comercial',120))
    ON CONFLICT (huella) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN n_repetidas := n_repetidas + 1; ELSE n_nuevas := n_nuevas + 1; END IF;
    v_id := NULL;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'nuevas', n_nuevas, 'repetidas', n_repetidas);
END
$as2$;

-- marketing/odoo-lead: abrir y cerrar la escritura de un TOQUE (además del envío de una ficha).
CREATE OR REPLACE FUNCTION marketing.api_crm_toque(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $act$
DECLARE o marketing.seg_odoo; t marketing.seg_tarjeta;
BEGIN
  IF NOT coalesce(req->'scopes','[]'::jsonb) ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE'); END IF;
  IF req->>'modo' = 'abrir_toque' THEN
    IF abs(extract(epoch FROM now()) * 1000 - (req->>'ts')::numeric) > 300000 THEN RETURN chat.err('FUERA_DE_VENTANA'); END IF;
    BEGIN INSERT INTO chat.nonce (nonce, actor, producto) VALUES (req->>'nonce', req->>'actor', 'marketing');
    EXCEPTION WHEN unique_violation THEN RETURN chat.err('REPETIDA'); END;
    SELECT * INTO t FROM marketing.seg_tarjeta WHERE id = (req->>'tarjeta_id')::uuid;
    IF t.id IS NULL THEN RETURN chat.err('TARJETA_NO_EXISTE'); END IF;
    IF t.odoo_lead_id IS NULL THEN RETURN chat.err('SIN_LEAD', 'La tarjeta todavía no tiene lead en Odoo.'); END IF;
    BEGIN
      INSERT INTO marketing.seg_odoo (tarjeta_id, toque_id, actor, actor_nombre, odoo_lead_id, nota, actividad, estado)
      VALUES (t.id, nullif(req->>'toque_id','')::bigint, req->>'actor', req->>'nombre', t.odoo_lead_id, left(coalesce(req->>'nota',''),4000), req->'actividad', 'en_proceso')
      RETURNING * INTO o;
    EXCEPTION WHEN check_violation THEN RETURN chat.err('ENVIO_INCOMPLETO');
    END;
    RETURN jsonb_build_object('ok', true, 'envio_id', o.id, 'toque', true, 'tarjeta', marketing.seg_vista(t), 'odoo_lead_id', t.odoo_lead_id,
      'odoo_user_id', marketing.odoo_user(req->>'actor'), 'etapa_id', marketing.cfg('etapa_prospecto_lead'), 'odoo', marketing.odoo_cfg(req->>'actor'));
  ELSIF req->>'modo' = 'cerrar_toque' THEN
    UPDATE marketing.seg_odoo SET estado = CASE WHEN req->>'resultado' = 'escrito' THEN 'escrito' ELSE 'error' END,
      readback = coalesce(req->'readback','{}'::jsonb), error = left(req->>'error',500), escrito_at = CASE WHEN req->>'resultado' = 'escrito' THEN now() END
     WHERE id = (req->>'envio_id')::uuid AND estado = 'en_proceso' RETURNING * INTO o;
    IF o.id IS NULL THEN RETURN chat.err('ENVIO_NO_ABIERTO'); END IF;
    RETURN jsonb_build_object('ok', true, 'estado', o.estado);
  END IF;
  RETURN chat.err('MODO_DESCONOCIDO');
END
$act$;

-- api_crm: se le suma lo de los toques y el user_id de Odoo por persona (sin tocar el resto).
DO $crm$
DECLARE src text;
BEGIN
  SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'marketing' AND p.proname = 'api_crm';
  IF src IS NOT NULL AND position('despachador_0004' IN src) = 0 THEN
    EXECUTE 'DROP FUNCTION IF EXISTS marketing.api_crm_0001(jsonb)';
    EXECUTE 'ALTER FUNCTION marketing.api_crm(jsonb) RENAME TO api_crm_0001';
  END IF;
END
$crm$;
CREATE OR REPLACE FUNCTION marketing.api_crm(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $acd$
DECLARE r jsonb;
BEGIN
  -- despachador_0004
  IF req->>'modo' IN ('abrir_toque','cerrar_toque') THEN RETURN marketing.api_crm_toque(req); END IF;
  r := marketing.api_crm_0001(req);
  IF req->>'modo' = 'abrir' AND (r->>'ok')::boolean THEN
    r := r || jsonb_build_object('odoo_user_id', marketing.odoo_user(req->>'actor'), 'etapa_id', marketing.cfg('etapa_prospecto_lead'), 'odoo', marketing.odoo_cfg(req->>'actor'));
  END IF;
  RETURN r;
END
$acd$;

-- ── Dueños y permisos ──────────────────────────────────────────────────────
DO $duenos$
DECLARE x record;
BEGIN
  FOR x IN SELECT tablename FROM pg_tables WHERE schemaname = 'marketing' AND tableowner <> 'marketing_app' LOOP
    EXECUTE format('ALTER TABLE marketing.%I OWNER TO marketing_app', x.tablename);
  END LOOP;
  FOR x IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'marketing' LOOP
    EXECUTE format('ALTER SEQUENCE marketing.%I OWNER TO marketing_app', x.sequencename);
  END LOOP;
  FOR x IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'marketing' AND pg_get_userbyid(p.proowner) <> 'marketing_app' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO marketing_app', x.f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', x.f);
  END LOOP;
END
$duenos$;
GRANT UPDATE (updated_at) ON chat.sesion TO marketing_app;
GRANT SELECT, INSERT ON chat.aviso TO marketing_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA chat TO marketing_app;
GRANT SELECT ON chat.respuesta TO marketing_app;
GRANT EXECUTE ON FUNCTION marketing.gancho(text, jsonb), marketing.api_suite_ext(jsonb), marketing.api_motor_ext(jsonb) TO chat_app;
GRANT EXECUTE ON FUNCTION marketing.api_senal(jsonb), marketing.api_crm(jsonb) TO CURRENT_USER;
