-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0001_fundacion.sql · esquema `marketing` en fts-suite-db (#407 · Marketing MVP)
--
-- Lo que solo Marketing entiende, colgado del núcleo `chat` (chat_0001):
--   · ficha: una empresa prospectada (o un lead rápido, o una señal trabajada).
--     Cada ficha es un CASO de aprendizaje desde el día uno.
--   · ficha_version: cada vez que cambia (motor, edición a mano, rebuscar).
--   · evidencia: ediciones a mano, descartes con motivo, filtros, envíos a CRM.
--   · consulta: consultas web gastadas, por persona y día (el candado).
--   · crm_envio: «Enviar a CRM» en sus tres pasos, con su read-back.
--   · lead_rapido: la captura en planta o evento, con su retención.
--   · lista_negra: lo que no se prospecta (competidores, colegas).
--
-- AQUÍ NO HAY DATOS. El repo es público: ni empresas, ni personas, ni montos.
-- Las filas llegan por las API, desde la suite o desde el motor.
--
-- Se engancha al núcleo con marketing.gancho(evento, req), marketing.api_suite_ext(req)
-- y marketing.api_motor_ext(req) (ver chat.ext). Todas SECURITY DEFINER con dueño
-- marketing_app. Reglas de db/README.md: idempotente, NOLOGIN, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito/comilla/ampersand/acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS marketing;
COMMENT ON SCHEMA marketing IS
  'Marketing (#407): fichas de prospección, envíos a CRM, lead rápido, bandeja del radar y la base del motor 3. Sin datos en el repo.';

DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketing_app') THEN
    CREATE ROLE marketing_app NOLOGIN;
  END IF;
END
$rol$;
GRANT marketing_app TO CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA marketing TO marketing_app;
-- Las funciones del núcleo (que corren como chat_app) llaman a las de aquí.
GRANT USAGE ON SCHEMA marketing TO chat_app;
-- Y marketing toca lo justo del núcleo: leer sus sesiones, encolar y escribir avisos del sistema.
GRANT USAGE ON SCHEMA chat TO marketing_app;
GRANT SELECT ON chat.sesion, chat.trabajo, chat.consumo, chat.adjunto, chat.mensaje TO marketing_app;
GRANT INSERT ON chat.sesion, chat.mensaje, chat.adjunto, chat.nonce TO marketing_app;
GRANT UPDATE (datos, titulo) ON chat.sesion TO marketing_app;
GRANT UPDATE (retener_hasta) ON chat.adjunto TO marketing_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA chat TO marketing_app;
GRANT EXECUTE ON FUNCTION chat.encolar(uuid, text, text, jsonb, bigint) TO marketing_app;

-- ── Configuración (todo lo que alguien podría querer mover sin migración nueva) ──
CREATE TABLE IF NOT EXISTS marketing.config (
  clave text PRIMARY KEY,
  valor text NOT NULL,
  nota  text
);
INSERT INTO marketing.config (clave, valor, nota) VALUES
  ('tope_fichas_dia',        '10',  'fichas que una persona puede abrir al día (#407 §3)'),
  ('tope_consultas_dia',     '300', 'consultas web por persona y día'),
  ('consultas_por_ficha',    '30',  'presupuesto de consultas de una ficha (#384)'),
  ('tokens_por_ficha',       '4000000', 'estimado de tokens por ficha (se corrige con lo medido)'),
  ('lista_max',              '10',  'empresas por lista'),
  ('retencion_gafete_meses', '12',  'meses que se guardan fotos de gafete o tarjeta'),
  ('horas_habiles_aviso',    '48',  'horas hábiles (lunes a viernes) sin atender antes del aviso de la bandeja'),
  ('etapa_prospecto_id',     '17',  'crm.stage «Prospecto Lead»')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION marketing.cfg(p text) RETURNS int
LANGUAGE sql STABLE AS $cfg$ SELECT valor::int FROM marketing.config WHERE clave = p $cfg$;

-- Nombre normalizado: sin acentos, minúsculas, sin sufijos de sociedad ni signos.
-- La misma regla que herramientas/marketing/capas.js y prospector/flujo/padron.py.
CREATE OR REPLACE FUNCTION marketing.norm(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $norm$
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(
    translate(lower(coalesce(p,'')), 'áéíóúüñàèìòùâêîôûäëïö', 'aeiouunaeiouaeiouaeio'),
    '[^a-z0-9 ]', ' ', 'g'),
    '\m(s ?a ?p ?i|s ?a ?b|s ?de ?r ?l|s ?a|s ?c|c ?v|de|del|la|el|los|las|y|inc|llc|ltd|corp|co|sociedad|anonima|capital|variable|responsabilidad|limitada|mexico|grupo)\M', ' ', 'g'),
    '\s+', ' ', 'g'))
$norm$;

-- ── Fichas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.ficha (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id      uuid        NOT NULL,                -- chat.sesion
  actor          text        NOT NULL,                -- quien prospecta (del JWT, nunca del cuerpo)
  origen         text        NOT NULL DEFAULT 'prospeccion' CHECK (origen IN ('prospeccion','lead','radar')),
  empresa        text        NOT NULL,
  empresa_norm   text        NOT NULL,
  ciudad         text        NOT NULL DEFAULT '',
  estado         text        NOT NULL DEFAULT 'en_curso'
                 CHECK (estado IN ('en_curso','lista','filtrada','enviada','descartada')),
  filtro         jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- filtro barato: cliente/competidor/duplicado/lista_negra/limpio + evidencia
  datos          jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- la ficha del motor
  editado        jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- lo corregido a mano: un rebuscar NO lo pisa
  html_adjunto   uuid,                                     -- chat.adjunto clase 'ficha' (por sha256)
  consultas      int         NOT NULL DEFAULT 0,
  version        int         NOT NULL DEFAULT 1,
  senal_id       uuid,
  motivo_descarte text,
  demo           boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ficha_sesion_empresa_uq UNIQUE (sesion_id, empresa_norm, ciudad),
  CONSTRAINT ficha_descarte_motivo CHECK (estado <> 'descartada' OR char_length(btrim(coalesce(motivo_descarte,''))) >= 5)
);
CREATE INDEX IF NOT EXISTS ficha_sesion ON marketing.ficha (sesion_id);
CREATE INDEX IF NOT EXISTS ficha_norm   ON marketing.ficha (empresa_norm);

CREATE TABLE IF NOT EXISTS marketing.ficha_version (
  id         bigserial   PRIMARY KEY,
  ficha_id   uuid        NOT NULL REFERENCES marketing.ficha(id),
  version    int         NOT NULL,
  causa      text        NOT NULL CHECK (causa IN ('motor','edicion','rebuscar','descarte','crm')),
  autor      text        NOT NULL,
  datos      jsonb       NOT NULL,
  editado    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ficha_version_f ON marketing.ficha_version (ficha_id, version);

-- La evidencia del aprendizaje: lo que una persona corrigió, descartó o decidió.
CREATE TABLE IF NOT EXISTS marketing.evidencia (
  id         bigserial   PRIMARY KEY,
  tipo       text        NOT NULL CHECK (tipo IN ('edicion','descarte','filtro','crm','rebuscar','senal_descarte','lead')),
  ficha_id   uuid,
  senal_id   uuid,
  actor      text        NOT NULL,
  datos      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  demo       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidencia_at ON marketing.evidencia (created_at);

-- Consultas web gastadas: el candado por persona y día (#407 §3).
CREATE TABLE IF NOT EXISTS marketing.consulta (
  id         bigserial   PRIMARY KEY,
  actor      text        NOT NULL,
  ficha_id   uuid,
  trabajo_id bigint,
  modulo     text        NOT NULL,
  n          int         NOT NULL CHECK (n > 0 AND n <= 200),
  dia        date        NOT NULL DEFAULT (now() AT TIME ZONE 'America/Monterrey')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consulta_dia ON marketing.consulta (actor, dia);

CREATE TABLE IF NOT EXISTS marketing.lista_negra (
  nombre_norm text        PRIMARY KEY,
  nombre      text        NOT NULL,
  motivo      text        NOT NULL CHECK (motivo IN ('competidor','colega','no_prospectar','otro')),
  nota        text,
  autor       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- «Enviar a CRM»: paso 1 (búsqueda), paso 2 (lo que escribiría) y paso 3 (lo escrito y releído).
CREATE TABLE IF NOT EXISTS marketing.crm_envio (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id    uuid        NOT NULL REFERENCES marketing.ficha(id),
  actor       text        NOT NULL,
  actor_nombre text,
  decision    text        NOT NULL CHECK (decision IN ('crear_lead','nota_lead','nota_partner','nada')),
  busqueda    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  propuesta   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  motivo      text,
  actividad   jsonb,
  origen      text        NOT NULL DEFAULT 'prospeccion' CHECK (origen IN ('prospeccion','radar','lead')),
  estado      text        NOT NULL DEFAULT 'pendiente_credencial'
              CHECK (estado IN ('pendiente_credencial','en_proceso','escrito','error','nada')),
  odoo        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  readback    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  escrito_at  timestamptz,
  -- Actividad fechada obligatoria (M10): sin siguiente paso el lead se muere en «Prospecto Lead».
  CONSTRAINT crm_actividad CHECK (decision = 'nada' OR (actividad ? 'fecha' AND actividad ? 'resumen' AND char_length(btrim(actividad->>'resumen')) >= 5)),
  -- Crear habiendo un lead abierto del grupo exige escribir el porqué (paso 2 de la maqueta).
  CONSTRAINT crm_motivo CHECK (decision <> 'crear_lead' OR coalesce((busqueda->>'lead_abierto_grupo')::boolean, false) = false
                               OR char_length(btrim(coalesce(motivo,''))) >= 10)
);
CREATE INDEX IF NOT EXISTS crm_envio_ficha ON marketing.crm_envio (ficha_id);

CREATE TABLE IF NOT EXISTS marketing.lead_rapido (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id      uuid        NOT NULL UNIQUE,
  actor          text        NOT NULL,
  donde          text        NOT NULL DEFAULT 'otro' CHECK (donde IN ('visita','evento','referencia','otro')),
  retener_hasta  date        NOT NULL,
  -- Outbox hacia la memoria (#328): la huella sha256 de cada binario para deduplicar contra WhatsApp.
  memoria_estado text        NOT NULL DEFAULT 'pendiente' CHECK (memoria_estado IN ('pendiente','registrado','no_aplica')),
  memoria_evento uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION marketing.touch() RETURNS trigger
LANGUAGE plpgsql AS $touch$ BEGIN NEW.updated_at := now(); RETURN NEW; END $touch$;
DROP TRIGGER IF EXISTS ficha_touch ON marketing.ficha;
CREATE TRIGGER ficha_touch BEFORE UPDATE ON marketing.ficha FOR EACH ROW EXECUTE FUNCTION marketing.touch();

-- ── Uso del día (lo que la pantalla enseña antes de correr) ────────────────
CREATE OR REPLACE FUNCTION marketing.uso(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $uso$
  SELECT jsonb_build_object(
    'dia', (now() AT TIME ZONE 'America/Monterrey')::date,
    'fichas_hoy', (SELECT count(*) FROM marketing.ficha WHERE actor = p_actor AND NOT demo AND (created_at AT TIME ZONE 'America/Monterrey')::date = (now() AT TIME ZONE 'America/Monterrey')::date),
    'tope_fichas', marketing.cfg('tope_fichas_dia'),
    'consultas_hoy', coalesce((SELECT sum(n) FROM marketing.consulta WHERE actor = p_actor AND dia = (now() AT TIME ZONE 'America/Monterrey')::date), 0),
    'tope_consultas', marketing.cfg('tope_consultas_dia'),
    'consultas_por_ficha', marketing.cfg('consultas_por_ficha'),
    'tokens_por_ficha', coalesce((SELECT round(avg(((c.tokens->>'input')::bigint + (c.tokens->>'output')::bigint + (c.tokens->>'cache_leida')::bigint + (c.tokens->>'cache_escrita')::bigint)))
                                  FROM chat.consumo c JOIN chat.trabajo t ON t.id = c.trabajo_id WHERE c.producto = 'marketing' AND t.tipo IN ('mensaje','rebuscar','senal')), marketing.cfg('tokens_por_ficha')),
    'tokens_medidos', EXISTS (SELECT 1 FROM chat.consumo WHERE producto = 'marketing'),
    'lista_max', marketing.cfg('lista_max'))
$uso$;

CREATE OR REPLACE FUNCTION marketing.ficha_corta(f marketing.ficha) RETURNS jsonb
LANGUAGE sql STABLE AS $fc$
  SELECT jsonb_build_object('id', f.id, 'empresa', f.empresa, 'ciudad', f.ciudad, 'estado', f.estado, 'origen', f.origen,
    'filtro', f.filtro, 'consultas', f.consultas, 'version', f.version, 'html_adjunto', f.html_adjunto,
    'puntaje', f.datos->'puntaje', 'resumen', f.datos->'resumen', 'motivo_descarte', f.motivo_descarte, 'updated_at', f.updated_at,
    'crm', (SELECT jsonb_build_object('estado', e.estado, 'decision', e.decision, 'at', e.created_at) FROM marketing.crm_envio e WHERE e.ficha_id = f.id ORDER BY e.created_at DESC LIMIT 1))
$fc$;

-- Mezcla lo del motor con lo editado a mano (lo editado gana, y se dice).
CREATE OR REPLACE FUNCTION marketing.ficha_completa(f marketing.ficha) RETURNS jsonb
LANGUAGE sql STABLE AS $fco$
  SELECT marketing.ficha_corta(f) || jsonb_build_object('datos', f.datos, 'editado', f.editado, 'senal_id', f.senal_id,
    'versiones', (SELECT count(*) FROM marketing.ficha_version v WHERE v.ficha_id = f.id),
    'envios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'decision', e.decision, 'estado', e.estado, 'odoo', e.odoo, 'readback', e.readback,
       'actividad', e.actividad, 'error', e.error, 'created_at', e.created_at, 'escrito_at', e.escrito_at) ORDER BY e.created_at) FROM marketing.crm_envio e WHERE e.ficha_id = f.id), '[]'::jsonb))
$fco$;

-- ── Gancho del núcleo ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.gancho(evento text, req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $gch$
DECLARE u jsonb; n int; tipo text := coalesce(req->>'tipo',''); v_s uuid; v_tid bigint;
BEGIN
  IF evento = 'nueva' THEN
    IF tipo IN ('empresa','lista','senal','lead') THEN
      u := marketing.uso(req->>'actor');
      n := CASE WHEN tipo = 'lista' THEN greatest(1, jsonb_array_length(coalesce(req->'datos'->'empresas','[]'::jsonb))) ELSE 1 END;
      IF tipo = 'lista' AND n > marketing.cfg('lista_max') THEN RETURN chat.err('LISTA_LARGA', 'Una lista lleva hasta ' || marketing.cfg('lista_max') || ' empresas.'); END IF;
      IF tipo <> 'lead' AND (u->>'fichas_hoy')::int + n > (u->>'tope_fichas')::int THEN
        RETURN chat.err('TOPE_FICHAS', 'Hoy llevas ' || (u->>'fichas_hoy') || ' de ' || (u->>'tope_fichas') || ' fichas. Mañana se reinicia.');
      END IF;
      IF tipo <> 'lead' AND (u->>'consultas_hoy')::int >= (u->>'tope_consultas')::int THEN
        RETURN chat.err('TOPE_CONSULTAS', 'Hoy ya se gastaron las ' || (u->>'tope_consultas') || ' consultas web. Mañana se reinicia.');
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF evento = 'creada' THEN
    v_s := (req->>'sesion_id')::uuid;
    IF tipo = 'lead' THEN
      INSERT INTO marketing.lead_rapido (sesion_id, actor, donde, retener_hasta)
      VALUES (v_s, req->>'actor', CASE WHEN req->'datos'->>'donde' IN ('visita','evento','referencia') THEN req->'datos'->>'donde' ELSE 'otro' END,
              (now() AT TIME ZONE 'America/Monterrey')::date + make_interval(months => marketing.cfg('retencion_gafete_meses')))
      ON CONFLICT (sesion_id) DO NOTHING;
    END IF;
    RETURN jsonb_build_object('ok', true, 'uso', marketing.uso(req->>'actor'));

  ELSIF evento = 'subido' THEN
    -- Fotos de un lead rápido (gafetes, tarjetas): retención configurable.
    UPDATE chat.adjunto a SET retener_hasta = l.retener_hasta FROM marketing.lead_rapido l
     WHERE a.id = (req->>'adjunto_id')::uuid AND l.sesion_id = a.sesion_id;
    RETURN jsonb_build_object('ok', true);

  ELSIF evento IN ('hilo','tomar') THEN
    RETURN jsonb_build_object('ok', true,
      'fichas', coalesce((SELECT jsonb_agg(CASE WHEN evento = 'tomar' THEN marketing.ficha_completa(f) ELSE marketing.ficha_corta(f) END ORDER BY f.created_at)
                          FROM marketing.ficha f WHERE f.sesion_id = (req->>'sesion_id')::uuid), '[]'::jsonb),
      'uso', CASE WHEN evento = 'hilo' THEN marketing.uso(req->>'actor') END);

  ELSIF evento = 'estado' THEN
    RETURN jsonb_build_object('ok', true, 'uso', marketing.uso(req->>'actor'));
  END IF;
  RETURN jsonb_build_object('ok', true);
END
$gch$;

-- ── Modos propios de la suite ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.api_suite_ext(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $ext$
DECLARE modo text := req->>'modo'; actor text := req->>'actor'; f marketing.ficha; v jsonb; k text; v_tid bigint; v_id uuid;
  scopes jsonb := coalesce(req->'scopes','[]'::jsonb);
BEGIN
  IF req ? 'ficha_id' THEN
    BEGIN SELECT * INTO f FROM marketing.ficha WHERE id = (req->>'ficha_id')::uuid; EXCEPTION WHEN others THEN RETURN chat.err('FICHA_INVALIDA'); END;
    IF f.id IS NULL THEN RETURN chat.err('FICHA_NO_EXISTE'); END IF;
  END IF;

  -- La bandeja del radar (marketing_0003). PL/pgSQL resuelve la función al llamarla.
  IF modo IN ('bandeja','senal_trabajar','senal_descartar') THEN RETURN marketing.api_bandeja(req); END IF;

  IF modo = 'uso' THEN
    RETURN jsonb_build_object('ok', true, 'uso', marketing.uso(actor));

  ELSIF modo = 'ficha' THEN
    IF f.id IS NULL THEN RETURN chat.err('SIN_FICHA'); END IF;
    RETURN jsonb_build_object('ok', true, 'ficha', marketing.ficha_completa(f));

  ELSIF modo = 'ficha_editar' THEN
    -- Lo editado a mano se guarda APARTE: un rebuscar del motor no lo pisa, y es evidencia.
    IF f.id IS NULL THEN RETURN chat.err('SIN_FICHA'); END IF;
    IF jsonb_typeof(req->'datos') <> 'object' OR req->'datos' = '{}'::jsonb THEN RETURN chat.err('SIN_CAMBIOS'); END IF;
    FOR k IN SELECT jsonb_object_keys(req->'datos') LOOP
      IF k !~ '^[a-z_][a-z0-9_.]{0,60}' THEN RETURN chat.err('CAMPO_INVALIDO', k); END IF;
    END LOOP;
    UPDATE marketing.ficha SET editado = editado || (req->'datos'), version = version + 1 WHERE id = f.id RETURNING * INTO f;
    INSERT INTO marketing.ficha_version (ficha_id, version, causa, autor, datos, editado) VALUES (f.id, f.version, 'edicion', actor, f.datos, f.editado);
    INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('edicion', f.id, actor, jsonb_build_object('cambios', req->'datos'), f.demo);
    RETURN jsonb_build_object('ok', true, 'ficha', marketing.ficha_completa(f));

  ELSIF modo = 'ficha_descartar' THEN
    IF f.id IS NULL THEN RETURN chat.err('SIN_FICHA'); END IF;
    IF char_length(btrim(coalesce(req->>'texto',''))) < 5 THEN RETURN chat.err('MOTIVO_OBLIGATORIO', 'Descartar pide el motivo: es lo que aprende.'); END IF;
    UPDATE marketing.ficha SET estado = 'descartada', motivo_descarte = left(btrim(req->>'texto'), 500), version = version + 1 WHERE id = f.id RETURNING * INTO f;
    INSERT INTO marketing.ficha_version (ficha_id, version, causa, autor, datos, editado) VALUES (f.id, f.version, 'descarte', actor, f.datos, f.editado);
    INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('descarte', f.id, actor, jsonb_build_object('motivo', f.motivo_descarte, 'categoria', req->>'tipo'), f.demo);
    RETURN jsonb_build_object('ok', true, 'ficha', marketing.ficha_corta(f));

  ELSIF modo = 'rebuscar' THEN
    -- Reabrir la corrida y correr UN módulo (#407 §1d: no existen modos sueltos; esto es lo equivalente).
    IF f.id IS NULL THEN RETURN chat.err('SIN_FICHA'); END IF;
    IF coalesce(req->>'texto','') NOT IN ('M2','M5','M6','M7','M8','M9','M10','M11','M12','M13','senal','patron','grupo') THEN
      RETURN chat.err('MODULO_INVALIDO');
    END IF;
    v := marketing.uso(actor);
    IF (v->>'consultas_hoy')::int >= (v->>'tope_consultas')::int THEN RETURN chat.err('TOPE_CONSULTAS', 'Hoy ya se gastaron las consultas web.'); END IF;
    v_tid := chat.encolar(f.sesion_id, 'rebuscar', actor, jsonb_build_object('ficha_id', f.id, 'modulo', req->>'texto'));
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, trabajo_id, datos)
    VALUES (f.sesion_id, 'sistema', 'sistema', 'Rebuscar ' || (req->>'texto') || ' en ' || f.empresa || ': en cola.', v_tid, jsonb_build_object('ficha_id', f.id));
    INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('rebuscar', f.id, actor, jsonb_build_object('modulo', req->>'texto'), f.demo);
    RETURN jsonb_build_object('ok', true, 'trabajo_id', v_tid);

  ELSIF modo = 'crm_registrar' THEN
    -- Paso 3 cuando la escritura todavía no puede salir (sin credencial): queda escrito QUÉ se iba a
    -- mandar, con su búsqueda y su actividad. Lo manda después marketing/odoo-lead, sin recapturar.
    IF NOT scopes ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE', 'Enviar a CRM pide el permiso marketing:crm.'); END IF;
    IF f.id IS NULL THEN RETURN chat.err('SIN_FICHA'); END IF;
    IF req->'datos'->>'decision' NOT IN ('crear_lead','nota_lead','nota_partner','nada') THEN RETURN chat.err('DECISION_INVALIDA'); END IF;
    IF req->'datos'->>'decision' <> 'nada' AND coalesce(req->'datos'->'actividad'->>'fecha','') < to_char(chat.hoy(), 'YYYY-MM-DD') THEN
      RETURN chat.err('ACTIVIDAD_OBLIGATORIA', 'La actividad necesita fecha de hoy en adelante.');
    END IF;
    BEGIN
      INSERT INTO marketing.crm_envio (ficha_id, actor, actor_nombre, decision, busqueda, propuesta, motivo, actividad, origen, estado)
      VALUES (f.id, actor, req->>'nombre', req->'datos'->>'decision', coalesce(req->'datos'->'busqueda','{}'::jsonb), coalesce(req->'datos'->'propuesta','{}'::jsonb),
              req->'datos'->>'motivo', req->'datos'->'actividad', CASE WHEN f.origen = 'radar' THEN 'radar' WHEN f.origen = 'lead' THEN 'lead' ELSE 'prospeccion' END,
              CASE WHEN req->'datos'->>'decision' = 'nada' THEN 'nada' ELSE 'pendiente_credencial' END)
      RETURNING id INTO v_id;
    EXCEPTION WHEN check_violation THEN
      RETURN chat.err('ENVIO_INCOMPLETO', 'Falta la actividad fechada o, si ya hay un lead abierto del grupo, el motivo para crear otro.');
    END;
    INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('crm', f.id, actor,
      jsonb_build_object('decision', req->'datos'->>'decision', 'motivo', req->'datos'->>'motivo', 'hallazgos', req->'datos'->'busqueda'->'resumen'), f.demo);
    RETURN jsonb_build_object('ok', true, 'envio_id', v_id);

  ELSIF modo = 'lista_negra' THEN
    RETURN jsonb_build_object('ok', true, 'lista', coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'motivo', motivo) ORDER BY nombre) FROM marketing.lista_negra), '[]'::jsonb));

  ELSIF modo = 'lista_negra_agregar' THEN
    IF char_length(btrim(coalesce(req->>'texto',''))) < 3 THEN RETURN chat.err('NOMBRE_VACIO'); END IF;
    INSERT INTO marketing.lista_negra (nombre_norm, nombre, motivo, nota, autor)
    VALUES (marketing.norm(req->>'texto'), left(btrim(req->>'texto'),160), CASE WHEN req->>'tipo' IN ('competidor','colega','no_prospectar') THEN req->>'tipo' ELSE 'otro' END, left(req->>'razon',500), actor)
    ON CONFLICT (nombre_norm) DO NOTHING;
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN NULL;   -- el núcleo contesta MODO_DESCONOCIDO
END
$ext$;

-- ── Modos propios del motor ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.api_motor_ext(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $mx$
DECLARE modo text := req->>'modo'; fx jsonb := req->'ficha'; f marketing.ficha; v_ses uuid := (req->>'sesion_id')::uuid; actor text := req->>'actor';
  v_id uuid; v_bytes bytea; v_sha text; u jsonb; s chat.sesion;
BEGIN
  IF v_ses IS NOT NULL THEN SELECT * INTO s FROM chat.sesion WHERE id = v_ses; END IF;

  IF modo = 'ficha_guardar' THEN
    IF s.id IS NULL THEN RETURN chat.err('SIN_TRABAJO'); END IF;
    IF jsonb_typeof(fx) <> 'object' OR coalesce(btrim(fx->>'empresa'),'') = '' THEN RETURN chat.err('FICHA_SIN_EMPRESA'); END IF;
    IF fx->>'estado' IS NOT NULL AND fx->>'estado' NOT IN ('en_curso','lista','filtrada') THEN RETURN chat.err('ESTADO_INVALIDO', 'El motor no envía ni descarta: eso es de una persona.'); END IF;
    INSERT INTO marketing.ficha (sesion_id, actor, origen, empresa, empresa_norm, ciudad, estado, filtro, datos, consultas, senal_id, demo)
    VALUES (s.id, s.autor, CASE s.tipo WHEN 'lead' THEN 'lead' WHEN 'senal' THEN 'radar' ELSE 'prospeccion' END,
            left(btrim(fx->>'empresa'),200), marketing.norm(fx->>'empresa'), left(coalesce(btrim(fx->>'ciudad'),''),120),
            coalesce(fx->>'estado','en_curso'), coalesce(fx->'filtro','{}'::jsonb), coalesce(fx->'datos','{}'::jsonb), coalesce((fx->>'consultas')::int,0),
            nullif(s.datos->>'senal_id','')::uuid, s.demo)
    ON CONFLICT (sesion_id, empresa_norm, ciudad) DO UPDATE SET
      estado = CASE WHEN marketing.ficha.estado IN ('enviada','descartada') THEN marketing.ficha.estado ELSE EXCLUDED.estado END,
      filtro = CASE WHEN EXCLUDED.filtro = '{}'::jsonb THEN marketing.ficha.filtro ELSE EXCLUDED.filtro END,
      datos = marketing.ficha.datos || EXCLUDED.datos, consultas = greatest(marketing.ficha.consultas, EXCLUDED.consultas),
      version = marketing.ficha.version + 1
    RETURNING * INTO f;
    INSERT INTO marketing.ficha_version (ficha_id, version, causa, autor, datos, editado)
    VALUES (f.id, f.version, CASE WHEN (req->>'causa') = 'rebuscar' THEN 'rebuscar' ELSE 'motor' END, 'motor', f.datos, f.editado);
    IF f.estado = 'filtrada' THEN
      INSERT INTO marketing.evidencia (tipo, ficha_id, actor, datos, demo) VALUES ('filtro', f.id, f.actor, f.filtro, f.demo);
    END IF;
    RETURN jsonb_build_object('ok', true, 'ficha_id', f.id, 'version', f.version);

  ELSIF modo = 'ficha_html' THEN
    SELECT * INTO f FROM marketing.ficha WHERE id = (req->>'ficha_id')::uuid AND sesion_id = s.id;
    IF f.id IS NULL THEN RETURN chat.err('FICHA_NO_EXISTE'); END IF;
    v_bytes := decode(req->>'b64', 'base64');
    v_sha := encode(digest(v_bytes, 'sha256'), 'hex');
    IF v_sha <> lower(coalesce(req->>'sha256','')) THEN RETURN chat.err('SHA_NO_CUADRA'); END IF;
    SELECT id INTO v_id FROM chat.adjunto WHERE sesion_id = s.id AND sha256 = v_sha;
    IF v_id IS NULL THEN
      INSERT INTO chat.adjunto (sesion_id, sha256, nombre, mime, clase, bytes, contenido, autor)
      VALUES (s.id, v_sha, left(coalesce(req->>'archivo','ficha.html'),160), 'text/html', 'ficha', length(v_bytes), v_bytes, 'motor') RETURNING id INTO v_id;
    END IF;
    UPDATE marketing.ficha SET html_adjunto = v_id WHERE id = f.id;
    RETURN jsonb_build_object('ok', true, 'adjunto_id', v_id, 'sha256', v_sha);

  ELSIF modo = 'consultas' THEN
    -- El motor registra lo que gastó ANTES de seguir; la respuesta dice cuánto queda.
    IF actor IS NULL THEN RETURN chat.err('SIN_TRABAJO'); END IF;
    IF coalesce((req->>'n')::int, 0) > 0 THEN
      INSERT INTO marketing.consulta (actor, ficha_id, trabajo_id, modulo, n)
      VALUES (actor, nullif(req->>'ficha_id','')::uuid, (req->>'trabajo_id')::bigint, left(coalesce(req->>'modulo','?'),20), (req->>'n')::int);
      IF req->>'ficha_id' IS NOT NULL THEN
        UPDATE marketing.ficha SET consultas = consultas + (req->>'n')::int WHERE id = (req->>'ficha_id')::uuid;
      END IF;
    END IF;
    u := marketing.uso(actor);
    RETURN jsonb_build_object('ok', true, 'uso', u, 'quedan_hoy', greatest(0, (u->>'tope_consultas')::int - (u->>'consultas_hoy')::int));

  ELSIF modo = 'lista_negra' THEN
    RETURN jsonb_build_object('ok', true, 'lista', coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'nombre_norm', nombre_norm, 'motivo', motivo)) FROM marketing.lista_negra), '[]'::jsonb));

  ELSIF modo = 'casos' THEN
    -- Para `consolida` de los lunes: casos y evidencia desde una fecha. Solo lo necesario.
    RETURN jsonb_build_object('ok', true,
      'fichas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'origen', origen, 'estado', estado, 'filtro', filtro->>'tipo', 'consultas', consultas,
                 'giro', datos->'giro', 'ciudad', ciudad, 'demo', demo, 'created_at', created_at, 'editado_campos', (SELECT jsonb_agg(k) FROM jsonb_object_keys(editado) k)))
                 FROM marketing.ficha WHERE updated_at >= coalesce((req->>'desde')::timestamptz, now() - interval '8 days')), '[]'::jsonb),
      'evidencia', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'ficha_id', ficha_id, 'senal_id', senal_id, 'datos', datos, 'demo', demo, 'created_at', created_at) ORDER BY id)
                 FROM marketing.evidencia WHERE created_at >= coalesce((req->>'desde')::timestamptz, now() - interval '8 days')), '[]'::jsonb));
  END IF;
  RETURN NULL;
END
$mx$;

-- ── Dueños y permisos ──────────────────────────────────────────────────────
DO $duenos$
DECLARE x record;
BEGIN
  FOR x IN SELECT tablename FROM pg_tables WHERE schemaname = 'marketing' LOOP
    EXECUTE format('ALTER TABLE marketing.%I OWNER TO marketing_app', x.tablename);
  END LOOP;
  FOR x IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'marketing' LOOP
    EXECUTE format('ALTER SEQUENCE marketing.%I OWNER TO marketing_app', x.sequencename);
  END LOOP;
  FOR x IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'marketing' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO marketing_app', x.f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', x.f);
  END LOOP;
END
$duenos$;
GRANT EXECUTE ON FUNCTION marketing.gancho(text, jsonb), marketing.api_suite_ext(jsonb), marketing.api_motor_ext(jsonb) TO chat_app;
GRANT EXECUTE ON FUNCTION marketing.norm(text), marketing.cfg(text), marketing.uso(text) TO chat_app;
