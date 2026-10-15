-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0008_conversaciones.sql · Una conversación por empresa, etapas, niveles y enfriamiento (Marketing v3, #421)
--
-- ADITIVA. Nada se borra ni se reescribe: las tarjetas, fichas, señales y sesiones de antes se quedan
-- y se ligan a su conversación (columna conversacion_id). El mapeo de lo existente va APARTE, en
-- marketing_0009, y se aplica solo después del merge del PR de pantallas.
--
--   · marketing.conversacion: una por empresa (clave sin sufijos de sociedad) y planta (ciudad).
--     Plantas de la misma marca en otra ciudad o país = otra conversación, ligada por `grupo`.
--     La conversación ES una chat.sesion de tipo 'conversacion' (el hilo del chat).
--   · Etapa 1 · Prospección (dueño: quien prospecta, el motor investiga) → Etapa 2 · Seguimiento
--     (dueño: quien da seguimiento, el motor acompaña) → cierre: Por cotizar, o perdida con motivo.
--   · Nivel de intención con EVIDENCIA (liga y fecha): N1 ya nos busca · N2 señal fuerte vigente ·
--     N3 encaje sin señal. Nunca N1 sin evidencia de la demanda.
--   · Enfriamiento «por nosotros» (sin toque en 2/5/10 días hábiles), «por mercado» (cadencia agotada),
--     cuarentena (archivada; el lead SIGUE abierto en Odoo con etiqueta y actividad a 90 días) y
--     reactivación (al vencer, o con una señal nueva de la empresa).
--   · Toques en etapa 2 SIN un trabajo por mensaje: el gancho «enviar» contesta sin_trabajo (chat_0004);
--     el motor entra en ráfaga (toques_por_rafaga) o cuando la persona pide sugerencia.
--   · Una conversación que abre la persona cuenta para el tope de sesiones (cuenta_tope = true, chat_0003);
--     las que crea el radar, el mapeo o un envío, no.
--
-- Valores por omisión configurables en marketing.config. Requiere chat_0003 y chat_0004.
-- Sin datos personales: los casos de aprendizaje se guardan sin correos ni teléfonos (CHECK).
-- Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO marketing.config (clave, valor, nota) VALUES
  ('senal_vigente_dias',  '365', 'días que una señal con fecha sostiene el N2 (Marketing v3)'),
  ('frio_nos_n1',         '2',   'días hábiles sin ningún toque para «enfriándose por nosotros» en N1'),
  ('frio_nos_n2',         '5',   'ídem N2'),
  ('frio_nos_n3',         '10',  'ídem N3'),
  ('cadencia_n3_toques',  '6',   'N3: toques sin respuesta para «fría por mercado»'),
  ('cadencia_n3_canales', '3',   'N3: canales distintos mínimos en esa cadencia'),
  ('cadencia_n3_dias',    '30',  'N3: ventana de la cadencia en días naturales'),
  ('cadencia_n2_toques',  '8',   'N2: toques sin respuesta para «fría por mercado»'),
  ('cadencia_n2_dias',    '45',  'N2: ventana de la cadencia en días naturales'),
  ('cuarentena_dias',     '90',  'días hasta la actividad de reactivación'),
  ('toques_por_rafaga',   '3',   'toques sin revisar que hacen entrar al motor en ráfaga'),
  ('avisos_repetidos_n',  '2',   'avisos de enfriamiento a la misma persona que escalan a dirección…'),
  ('avisos_repetidos_dias','30', '…dentro de estos días'),
  ('odoo_tag_cuarentena', '0',   'id de crm.tag «Cuarentena» (0 = falta: odoo-lead queda pendiente_config)')
ON CONFLICT (clave) DO NOTHING;

-- Configuración de texto (marketing.config es numérica). Vacío = se deriva.
CREATE TABLE IF NOT EXISTS marketing.config_texto (
  clave text PRIMARY KEY,
  valor text NOT NULL DEFAULT '',
  nota  text
);
INSERT INTO marketing.config_texto (clave, valor, nota) VALUES
  ('dueno_senales',   '', 'usuario de la suite que recibe las conversaciones nuevas del radar; vacío = quien más conversaciones tiene en etapa 1'),
  ('actor_direccion', '', 'usuario de la suite que recibe los avisos repetidos; vacío = el aviso queda sin actor y lo ve el tablero')
ON CONFLICT (clave) DO NOTHING;
CREATE OR REPLACE FUNCTION marketing.cfg_texto(p text) RETURNS text
LANGUAGE sql STABLE AS $cft$ SELECT nullif(btrim(valor), '') FROM marketing.config_texto WHERE clave = p $cft$;

-- ── Claves de empresa y de ciudad ───────────────────────────────────────────
-- Sobre marketing.norm (que ya quita «S. de R.L.», «S.A.»…): quita también los sufijos que norm deja
-- sueltos cuando vienen sin «de» (s r l, sapi, de c v).
CREATE OR REPLACE FUNCTION marketing.conv_clave(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $ck$
  SELECT btrim(regexp_replace(regexp_replace(marketing.norm(p), '\m(s ?r ?l|srl|s ?a ?p ?i|sapi|s ?a ?b|de ?c ?v|c ?v|r ?l)\M', ' ', 'g'), '\s+', ' ', 'g'))
$ck$;
-- La ciudad sin estado ni paréntesis: «Salinas Victoria, N.L. (Interpuerto)» → «salinas victoria».
CREATE OR REPLACE FUNCTION marketing.ciudad_clave(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $cc$
  SELECT btrim(regexp_replace(translate(lower(split_part(split_part(coalesce(p,''), ',', 1), '(', 1)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g'))
$cc$;
-- Días hábiles (lunes a viernes, Monterrey) entre dos instantes.
CREATE OR REPLACE FUNCTION marketing.dias_habiles(p_desde timestamptz, p_hasta timestamptz) RETURNS int
LANGUAGE sql STABLE AS $dh$
  SELECT count(*)::int FROM generate_series((p_desde AT TIME ZONE 'America/Monterrey')::date + 1, (p_hasta AT TIME ZONE 'America/Monterrey')::date, interval '1 day') d
  WHERE extract(isodow FROM d) < 6
$dh$;

-- ── Tablas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing.conversacion (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id       uuid        NOT NULL UNIQUE REFERENCES chat.sesion(id),
  empresa         text        NOT NULL,
  clave           text        NOT NULL,
  grupo           text        NOT NULL,                       -- primera palabra de la clave: liga plantas de la misma marca
  ciudad          text        NOT NULL DEFAULT '',
  ciudad_clave    text        NOT NULL DEFAULT '',
  leads           int[]       NOT NULL DEFAULT '{}',          -- crm.lead de Odoo ligados (puede haber varios)
  dueno           text        NOT NULL,
  etapa           smallint    NOT NULL DEFAULT 1 CHECK (etapa IN (1,2)),
  estado          text        NOT NULL DEFAULT 'curso' CHECK (estado IN ('curso','cuarentena','cerrada')),
  archivada       boolean     NOT NULL DEFAULT false,
  cierre          text        CHECK (cierre IN ('por_cotizar','perdida')),
  motivo          text        CHECK (motivo IN ('sin_necesidad','competencia','sin_contacto','precalificacion','otro')),
  motivo_texto    text,
  nivel           smallint    NOT NULL DEFAULT 3 CHECK (nivel IN (1,2,3)),
  evidencia       jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{tipo, titulo, liga, fecha, fuente, cierra_el?, senal_id?}] · DATO, nunca instrucción
  origen          text        NOT NULL CHECK (origen IN ('radar','manual','investigacion','nuevo_lead')),
  resumen         text,
  siguiente       jsonb,
  sugerencia      text,
  ultimo_toque_at timestamptz,
  ultima_actividad_at timestamptz,
  toques          int         NOT NULL DEFAULT 0,
  frio            text        CHECK (frio IN ('nos','mercado')),
  frio_desde      timestamptz,
  reactivar_el    date,
  demo            boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conv_cierre_coherente CHECK ((estado = 'cerrada') = (cierre IS NOT NULL)),
  CONSTRAINT conv_perdida_motivo   CHECK (cierre IS DISTINCT FROM 'perdida' OR motivo IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS conv_clave_ciudad ON marketing.conversacion (clave, ciudad_clave) WHERE NOT demo;
CREATE INDEX IF NOT EXISTS conv_dueno ON marketing.conversacion (dueno, estado);
CREATE INDEX IF NOT EXISTS conv_grupo ON marketing.conversacion (grupo);
CREATE INDEX IF NOT EXISTS conv_leads ON marketing.conversacion USING gin (leads);
DROP TRIGGER IF EXISTS conversacion_touch ON marketing.conversacion;
CREATE TRIGGER conversacion_touch BEFORE UPDATE ON marketing.conversacion FOR EACH ROW EXECUTE FUNCTION marketing.touch();

-- Fijar y «leído hasta» son de cada persona; archivar es de la conversación.
CREATE TABLE IF NOT EXISTS marketing.conv_marca (
  conversacion_id uuid    NOT NULL REFERENCES marketing.conversacion(id),
  actor           text    NOT NULL,
  fijada          boolean NOT NULL DEFAULT false,
  leido_hasta     bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (conversacion_id, actor)
);
-- Bitácora: lo que el tablero y el consolida de los lunes cuentan.
CREATE TABLE IF NOT EXISTS marketing.conv_evento (
  id              bigserial   PRIMARY KEY,
  conversacion_id uuid        NOT NULL REFERENCES marketing.conversacion(id),
  tipo            text        NOT NULL CHECK (tipo IN ('creada','mapeada','reasignacion','etapa','nivel','frio','cuarentena','reactivacion','cierre','reapertura','archivo','senal','falto','puente','sugerencia','crm')),
  actor           text,
  datos           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conv_evento_c ON marketing.conv_evento (conversacion_id, id);
CREATE INDEX IF NOT EXISTS conv_evento_tipo ON marketing.conv_evento (tipo, created_at);
-- Cada toque de etapa 2 es evidencia de comportamiento del cliente.
CREATE TABLE IF NOT EXISTS marketing.conv_toque (
  id                bigserial   PRIMARY KEY,
  conversacion_id   uuid        NOT NULL REFERENCES marketing.conversacion(id),
  cliente_id        text,
  actor             text        NOT NULL,
  texto             text        NOT NULL DEFAULT '',
  canal             text        CHECK (canal IS NULL OR canal IN ('conmutador','llamada','correo','whatsapp','visita','linkedin','portal','otro')),
  resultado         text        CHECK (resultado IS NULL OR resultado IN ('sin_respuesta','transferido','contesto','cita','envio_info','rechazo','alta_proveedor','otro')),
  avanzo            boolean     NOT NULL DEFAULT false,
  propuesta         jsonb,                       -- la mecánica (toque-base.js), al instante
  revisado          boolean     NOT NULL DEFAULT false,
  motor             jsonb,                       -- lo que corrigió el motor en la ráfaga
  horas_a_respuesta numeric,
  hora_local        smallint,                    -- 0-23, Monterrey: para aprender horarios
  demo              boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conv_toque_cliente_uq UNIQUE (conversacion_id, cliente_id)
);
CREATE INDEX IF NOT EXISTS conv_toque_c ON marketing.conv_toque (conversacion_id, id);
-- Casos de aprendizaje por etapa: «faltó» (la persona aportó lo que el motor no encontró) y «puente»
-- (en etapa 2 el contacto no estaba o no compraba: cuenta EN CONTRA de la lección de búsqueda).
CREATE TABLE IF NOT EXISTS marketing.conv_caso (
  id              bigserial   PRIMARY KEY,
  conversacion_id uuid        NOT NULL REFERENCES marketing.conversacion(id),
  etapa           smallint    NOT NULL CHECK (etapa IN (1,2)),
  tipo            text        NOT NULL CHECK (tipo IN ('falto','puente')),
  leccion_id      text,
  actor           text,
  datos           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conv_caso_sin_contacto CHECK (datos::text !~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]' AND datos::text !~ '[0-9][0-9 ()-]{8,}[0-9]')
);
-- Lo que hay que escribir en Odoo por una conversación (cuarentena, reactivación): lo toma odoo-lead.
CREATE TABLE IF NOT EXISTS marketing.conv_odoo (
  id              bigserial   PRIMARY KEY,
  conversacion_id uuid        NOT NULL REFERENCES marketing.conversacion(id),
  accion          text        NOT NULL CHECK (accion IN ('cuarentena','reactivar')),
  lead_id         int,
  estado          text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pendiente_config','sin_lead','escrito','error')),
  datos           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  readback        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Sesiones de antes que ahora son historia de una conversación (otra tarjeta del mismo lead, el Prospectador…).
CREATE TABLE IF NOT EXISTS marketing.conv_sesion (
  sesion_id       uuid        PRIMARY KEY,
  conversacion_id uuid        NOT NULL REFERENCES marketing.conversacion(id),
  rol             text        NOT NULL DEFAULT 'historial'
);
-- Uniones explícitas para el mapeo: dos leads que son la misma empresa aunque su nombre no lo diga.
CREATE TABLE IF NOT EXISTS marketing.conv_union (
  lead_a int NOT NULL, lead_b int NOT NULL, nota text,
  PRIMARY KEY (lead_a, lead_b)
);

ALTER TABLE marketing.seg_tarjeta   ADD COLUMN IF NOT EXISTS conversacion_id uuid;
ALTER TABLE marketing.ficha         ADD COLUMN IF NOT EXISTS conversacion_id uuid;
ALTER TABLE marketing.bandeja_senal ADD COLUMN IF NOT EXISTS conversacion_id uuid;
ALTER TABLE marketing.lead_rapido   ADD COLUMN IF NOT EXISTS conversacion_id uuid;

-- ── Nivel, enfriamiento y vista ─────────────────────────────────────────────
-- N1 solo con evidencia de la demanda (liga y fecha). N2: señal fuerte vigente con liga y fecha.
CREATE OR REPLACE FUNCTION marketing.conv_nivel_de(p_ev jsonb) RETURNS smallint
LANGUAGE sql STABLE AS $cn$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_ev,'[]'::jsonb)) e
                 WHERE e->>'tipo' IN ('invitacion','licitacion','portal','solicitud')
                   AND coalesce(e->>'liga','') ~ '^https?://' AND coalesce(e->>'fecha','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}') THEN 1
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_ev,'[]'::jsonb)) e
                 WHERE e->>'tipo' IN ('obra','ampliacion','vacantes','inversion','senal')
                   AND coalesce(e->>'liga','') ~ '^https?://' AND coalesce(e->>'fecha','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                   AND (e->>'fecha')::date >= chat.hoy() - marketing.cfg('senal_vigente_dias')) THEN 2
    ELSE 3 END::smallint
$cn$;

-- La evidencia que aporta una señal de la bandeja (tipo «senal»; N1 si su puerta lo es Y trae liga y fecha).
CREATE OR REPLACE FUNCTION marketing.senal_evidencia(b marketing.bandeja_senal) RETURNS jsonb
LANGUAGE sql STABLE AS $se8$
  SELECT jsonb_build_object('tipo', CASE WHEN b.puerta IN ('invitacion','solicitud') THEN b.puerta ELSE 'senal' END,
    'titulo', left(b.titulo, 300), 'liga', coalesce(b.evidencia->>'liga',''), 'fecha', coalesce(b.evidencia->>'fecha',''),
    'fuente', coalesce(b.evidencia->>'fuente', b.corrida), 'senal_id', b.id)
$se8$;

-- ¿Se está enfriando? 'nos' = sin ningún toque en el plazo de su nivel; 'mercado' = cadencia agotada sin respuesta.
CREATE OR REPLACE FUNCTION marketing.conv_frio_calc(c marketing.conversacion) RETURNS text
LANGUAGE plpgsql STABLE AS $cf$
DECLARE n int; ncan int; resp boolean; dias int;
BEGIN
  IF c.estado <> 'curso' THEN RETURN NULL; END IF;
  IF c.nivel = 1 THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(c.evidencia) e WHERE coalesce(e->>'cierra_el','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND (e->>'cierra_el')::date < chat.hoy()) THEN
      RETURN 'mercado';
    END IF;
  ELSE
    dias := marketing.cfg(CASE c.nivel WHEN 2 THEN 'cadencia_n2_dias' ELSE 'cadencia_n3_dias' END);
    SELECT count(*), count(DISTINCT canal), bool_or(resultado IN ('contesto','cita','envio_info','alta_proveedor','rechazo'))
      INTO n, ncan, resp FROM marketing.conv_toque WHERE conversacion_id = c.id AND created_at > now() - make_interval(days => dias);
    IF NOT coalesce(resp, false) AND n >= marketing.cfg(CASE c.nivel WHEN 2 THEN 'cadencia_n2_toques' ELSE 'cadencia_n3_toques' END)
       AND (c.nivel = 2 OR ncan >= marketing.cfg('cadencia_n3_canales')) THEN
      RETURN 'mercado';
    END IF;
  END IF;
  IF marketing.dias_habiles(greatest(c.ultimo_toque_at, c.ultima_actividad_at, c.created_at), now())
     >= marketing.cfg('frio_nos_n' || c.nivel) THEN
    RETURN 'nos';
  END IF;
  RETURN NULL;
END
$cf$;

-- Aplica las transiciones que dependen del tiempo: aviso de enfriamiento (y escalación si se repite),
-- cuarentena por mercado y reactivación al vencer. Se llama al leer: no hace falta cron.
CREATE OR REPLACE FUNCTION marketing.conv_revisar(p_id uuid) RETURNS marketing.conversacion
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $cr$
DECLARE c marketing.conversacion; f text; n int;
BEGIN
  SELECT * INTO c FROM marketing.conversacion WHERE id = p_id FOR UPDATE;
  IF c.id IS NULL OR c.demo THEN RETURN c; END IF;
  -- Reactivación al vencer la actividad de cuarentena.
  IF c.estado = 'cuarentena' AND c.reactivar_el IS NOT NULL AND c.reactivar_el <= chat.hoy() THEN
    RETURN marketing.conv_reactivar(c.id, 'vencimiento', NULL);
  END IF;
  f := marketing.conv_frio_calc(c);
  IF f IS NOT DISTINCT FROM c.frio THEN RETURN c; END IF;
  UPDATE marketing.conversacion SET frio = f, frio_desde = CASE WHEN f IS NULL THEN NULL ELSE now() END WHERE id = c.id RETURNING * INTO c;
  IF f IS NULL THEN RETURN c; END IF;
  INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'frio', NULL, jsonb_build_object('frio', f, 'nivel', c.nivel, 'dueno', c.dueno));
  IF f = 'nos' THEN
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      'Enfriándose por nosotros: ' || marketing.cfg('frio_nos_n' || c.nivel) || ' días hábiles sin ningún toque (N' || c.nivel || '). Aviso a ' || c.dueno || '.',
      jsonb_build_object('conv', 'frio_nos'));
    INSERT INTO chat.aviso (producto, tipo, actor, texto) VALUES ('marketing', 'frio_nos', c.dueno,
      c.empresa || ' se está enfriando: sin toque en el plazo de N' || c.nivel || '.');
    SELECT count(*) INTO n FROM marketing.conv_evento e JOIN marketing.conversacion x ON x.id = e.conversacion_id
      WHERE e.tipo = 'frio' AND e.datos->>'frio' = 'nos' AND e.datos->>'dueno' = c.dueno AND e.created_at > now() - make_interval(days => marketing.cfg('avisos_repetidos_dias'));
    IF n >= marketing.cfg('avisos_repetidos_n') THEN
      INSERT INTO chat.aviso (producto, tipo, actor, texto) VALUES ('marketing', 'frio_nos_repetido', marketing.cfg_texto('actor_direccion'),
        'Aviso repetido de enfriamiento: ' || n || ' en ' || marketing.cfg('avisos_repetidos_dias') || ' días con la misma persona (' || c.dueno || ').');
    END IF;
  ELSE
    c := marketing.conv_cuarentena(c.id, 'mercado', NULL);
  END IF;
  RETURN c;
END
$cr$;

CREATE OR REPLACE FUNCTION marketing.conv_cuarentena(p_id uuid, p_por text, p_actor text) RETURNS marketing.conversacion
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $cq$
DECLARE c marketing.conversacion; v_lead int; v_hasta date := chat.hoy() + marketing.cfg('cuarentena_dias');
BEGIN
  UPDATE marketing.conversacion SET estado = 'cuarentena', archivada = true, reactivar_el = v_hasta,
    frio = CASE WHEN p_por = 'mercado' THEN 'mercado' ELSE frio END WHERE id = p_id AND estado = 'curso' RETURNING * INTO c;
  IF c.id IS NULL THEN SELECT * INTO c FROM marketing.conversacion WHERE id = p_id; RETURN c; END IF;
  INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'cuarentena', p_actor, jsonb_build_object('por', p_por, 'hasta', v_hasta, 'nivel', c.nivel));
  INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
    CASE WHEN p_por = 'mercado' THEN 'Fría por mercado: cadencia agotada sin respuesta. ' ELSE '' END ||
    'Pasa a cuarentena: la conversación se archiva. En Odoo el lead SIGUE ABIERTO, con etiqueta «Cuarentena» y actividad de reactivación el ' || to_char(v_hasta, 'YYYY-MM-DD') || '.',
    jsonb_build_object('conv', 'cuarentena'));
  v_lead := c.leads[array_length(c.leads, 1)];
  INSERT INTO marketing.conv_odoo (conversacion_id, accion, lead_id, estado, datos)
  VALUES (c.id, 'cuarentena', v_lead,
    CASE WHEN v_lead IS NULL THEN 'sin_lead' WHEN marketing.cfg('odoo_tag_cuarentena') = 0 THEN 'pendiente_config' ELSE 'pendiente' END,
    jsonb_build_object('tag_id', marketing.cfg('odoo_tag_cuarentena'), 'actividad_fecha', to_char(v_hasta, 'YYYY-MM-DD'), 'responsable', c.dueno));
  RETURN c;
END
$cq$;

CREATE OR REPLACE FUNCTION marketing.conv_reactivar(p_id uuid, p_por text, p_actor text) RETURNS marketing.conversacion
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $cra$
DECLARE c marketing.conversacion; antes smallint;
BEGIN
  SELECT * INTO c FROM marketing.conversacion WHERE id = p_id;
  IF c.id IS NULL OR c.estado <> 'cuarentena' THEN RETURN c; END IF;
  antes := c.nivel;
  UPDATE marketing.conversacion SET estado = 'curso', archivada = false, reactivar_el = NULL, frio = NULL, frio_desde = NULL,
    nivel = marketing.conv_nivel_de(evidencia), ultima_actividad_at = now() WHERE id = p_id RETURNING * INTO c;
  INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'reactivacion', p_actor, jsonb_build_object('por', p_por, 'nivel_antes', antes, 'nivel', c.nivel));
  INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
    'Reactivada' || CASE p_por WHEN 'senal' THEN ' por una señal nueva' WHEN 'vencimiento' THEN ' al vencer la cuarentena' ELSE '' END ||
    ': N' || antes || CASE WHEN antes <> c.nivel THEN ' → N' || c.nivel ELSE '' END || '. Aviso a ' || c.dueno || '.', jsonb_build_object('conv', 'reactivacion'));
  INSERT INTO chat.aviso (producto, tipo, actor, texto) VALUES ('marketing', 'reactivada', c.dueno, c.empresa || ' salió de cuarentena (N' || c.nivel || ').');
  INSERT INTO marketing.conv_odoo (conversacion_id, accion, lead_id, estado, datos)
  VALUES (c.id, 'reactivar', c.leads[array_length(c.leads, 1)],
    CASE WHEN c.leads[array_length(c.leads, 1)] IS NULL THEN 'sin_lead' WHEN marketing.cfg('odoo_tag_cuarentena') = 0 THEN 'pendiente_config' ELSE 'pendiente' END,
    jsonb_build_object('tag_id', marketing.cfg('odoo_tag_cuarentena')));
  RETURN c;
END
$cra$;

-- Recalcula el nivel con la evidencia; deja evento y mensaje si cambió.
CREATE OR REPLACE FUNCTION marketing.conv_renivelar(p_id uuid, p_actor text) RETURNS marketing.conversacion
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $crn$
DECLARE c marketing.conversacion; nv smallint;
BEGIN
  SELECT * INTO c FROM marketing.conversacion WHERE id = p_id;
  nv := marketing.conv_nivel_de(c.evidencia);
  IF nv = c.nivel THEN RETURN c; END IF;
  INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'nivel', p_actor, jsonb_build_object('de', c.nivel, 'a', nv));
  INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
    'Nivel N' || c.nivel || ' → N' || nv || ' con la evidencia de la ficha.', jsonb_build_object('conv', 'nivel'));
  UPDATE marketing.conversacion SET nivel = nv WHERE id = p_id RETURNING * INTO c;
  RETURN c;
END
$crn$;

CREATE OR REPLACE FUNCTION marketing.conv_vista(c marketing.conversacion, p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $cv$
  SELECT jsonb_build_object('id', c.id, 'sesion_id', c.sesion_id, 'empresa', c.empresa, 'clave', c.clave, 'grupo', c.grupo,
    'ciudad', c.ciudad, 'leads', to_jsonb(c.leads), 'dueno', c.dueno, 'etapa', c.etapa, 'estado', c.estado, 'archivada', c.archivada,
    'cierre', c.cierre, 'motivo', c.motivo, 'motivo_texto', c.motivo_texto, 'nivel', c.nivel, 'evidencia', c.evidencia, 'origen', c.origen,
    'resumen', c.resumen, 'siguiente', c.siguiente, 'sugerencia', c.sugerencia, 'toques', c.toques, 'frio', c.frio,
    'reactivar_el', c.reactivar_el, 'ultimo_toque_at', c.ultimo_toque_at, 'demo', c.demo, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'vence_hoy', c.estado = 'curso' AND coalesce(c.siguiente->>'fecha','') ~ '^[0-9]{4}' AND (c.siguiente->>'fecha') <= to_char(chat.hoy(), 'YYYY-MM-DD'),
    'fijada', coalesce((SELECT m.fijada FROM marketing.conv_marca m WHERE m.conversacion_id = c.id AND m.actor = p_actor), false),
    'no_leidos', (SELECT count(*) FROM chat.mensaje x WHERE x.sesion_id = c.sesion_id AND NOT (x.rol = 'persona' AND x.autor = p_actor)
                    AND x.id > coalesce((SELECT m.leido_hasta FROM marketing.conv_marca m WHERE m.conversacion_id = c.id AND m.actor = p_actor), 0)),
    'ultimo', (SELECT jsonb_build_object('id', x.id, 'rol', x.rol, 'autor', x.autor, 'texto', left(x.texto, 140), 'at', coalesce(x.escrito_at, x.created_at))
               FROM chat.mensaje x WHERE x.sesion_id = c.sesion_id ORDER BY x.id DESC LIMIT 1),
    'trabajo', (SELECT jsonb_build_object('estado', t.estado, 'paso', t.paso) FROM chat.trabajo t WHERE t.sesion_id = c.sesion_id AND t.estado IN ('pendiente','tomado') ORDER BY t.id DESC LIMIT 1))
$cv$;

-- ── Crear y encontrar ───────────────────────────────────────────────────────
-- Busca la conversación de una empresa: por lead de Odoo, luego por clave y ciudad; una de ciudad vacía
-- adopta la primera ciudad que llegue; si la clave ya existe con OTRA ciudad, es otra planta.
CREATE OR REPLACE FUNCTION marketing.conv_buscar(p_empresa text, p_ciudad text, p_lead int, p_demo boolean DEFAULT false) RETURNS marketing.conversacion
LANGUAGE plpgsql STABLE AS $cb$
DECLARE c marketing.conversacion; k text := marketing.conv_clave(p_empresa); kc text := marketing.ciudad_clave(p_ciudad);
BEGIN
  IF p_lead IS NOT NULL THEN
    SELECT * INTO c FROM marketing.conversacion WHERE p_lead = ANY (leads) AND demo = coalesce(p_demo,false) ORDER BY created_at LIMIT 1;
    IF c.id IS NOT NULL THEN RETURN c; END IF;
    SELECT x.* INTO c FROM marketing.conversacion x JOIN marketing.conv_union u ON (u.lead_a = p_lead AND u.lead_b = ANY (x.leads)) OR (u.lead_b = p_lead AND u.lead_a = ANY (x.leads))
     WHERE x.demo = coalesce(p_demo,false) ORDER BY x.created_at LIMIT 1;
    IF c.id IS NOT NULL THEN RETURN c; END IF;
  END IF;
  IF k = '' THEN RETURN c; END IF;
  SELECT * INTO c FROM marketing.conversacion WHERE clave = k AND ciudad_clave = kc AND demo = coalesce(p_demo,false);
  IF c.id IS NOT NULL THEN RETURN c; END IF;
  IF kc = '' THEN
    -- Sin ciudad: la más vieja de esa clave (la persona puede separarla después).
    SELECT * INTO c FROM marketing.conversacion WHERE clave = k AND demo = coalesce(p_demo,false) ORDER BY created_at LIMIT 1;
  ELSE
    SELECT * INTO c FROM marketing.conversacion WHERE clave = k AND ciudad_clave = '' AND demo = coalesce(p_demo,false) ORDER BY created_at LIMIT 1;
  END IF;
  RETURN c;
END
$cb$;

CREATE OR REPLACE FUNCTION marketing.conv_crear(p_empresa text, p_ciudad text, p_dueno text, p_nombre text, p_origen text, p_etapa smallint,
  p_cuenta_tope boolean, p_demo boolean, p_actor text) RETURNS marketing.conversacion
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $ccr$
DECLARE c marketing.conversacion; v_ses uuid; k text := marketing.conv_clave(p_empresa);
BEGIN
  INSERT INTO chat.sesion (producto, tipo, titulo, autor, autor_nombre, demo, datos, cuenta_tope)
  VALUES ('marketing', 'conversacion', left(btrim(p_empresa) || coalesce(' · ' || nullif(btrim(p_ciudad),''), ''), 120), p_dueno, p_nombre,
          coalesce(p_demo, false), jsonb_build_object('empresa', btrim(p_empresa), 'ciudad', coalesce(btrim(p_ciudad),'')), coalesce(p_cuenta_tope, false))
  RETURNING id INTO v_ses;
  INSERT INTO marketing.conversacion (sesion_id, empresa, clave, grupo, ciudad, ciudad_clave, dueno, etapa, origen, demo, ultima_actividad_at)
  VALUES (v_ses, btrim(p_empresa), k, split_part(k, ' ', 1), coalesce(btrim(p_ciudad),''), marketing.ciudad_clave(p_ciudad), p_dueno,
          coalesce(p_etapa, 1), p_origen, coalesce(p_demo, false), now())
  RETURNING * INTO c;
  UPDATE chat.sesion SET datos = datos || jsonb_build_object('conversacion_id', c.id) WHERE id = v_ses;
  INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'creada', p_actor, jsonb_build_object('origen', p_origen, 'etapa', c.etapa, 'dueno', p_dueno));
  RETURN c;
END
$ccr$;

-- Agrega evidencia (sin repetir la misma liga) y renivela.
CREATE OR REPLACE FUNCTION marketing.conv_agregar_evidencia(p_id uuid, p_ev jsonb, p_actor text) RETURNS marketing.conversacion
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $cae$
DECLARE c marketing.conversacion;
BEGIN
  SELECT * INTO c FROM marketing.conversacion WHERE id = p_id;
  IF c.id IS NULL OR p_ev IS NULL THEN RETURN c; END IF;
  IF coalesce(p_ev->>'liga','') <> '' AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.evidencia) e WHERE e->>'liga' = p_ev->>'liga' AND coalesce(e->>'tipo','') = coalesce(p_ev->>'tipo','')) THEN
    RETURN c;
  END IF;
  UPDATE marketing.conversacion SET evidencia = evidencia || jsonb_build_array(p_ev) WHERE id = p_id;
  RETURN marketing.conv_renivelar(p_id, p_actor);
END
$cae$;

-- El radar registra una señal: llega como conversación nueva, o se pega a la de su empresa
-- (y la saca de cuarentena con su nivel recalculado).
CREATE OR REPLACE FUNCTION marketing.conv_desde_senal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $cds$
DECLARE c marketing.conversacion; v_dueno text;
BEGIN
  IF NEW.conversacion_id IS NOT NULL THEN RETURN NEW; END IF;
  c := marketing.conv_buscar(NEW.empresa, NEW.ciudad, NULL, NEW.demo);
  IF c.id IS NULL THEN
    v_dueno := coalesce(NEW.responsable, marketing.cfg_texto('dueno_senales'),
      (SELECT dueno FROM marketing.conversacion WHERE etapa = 1 AND NOT demo GROUP BY dueno ORDER BY count(*) DESC, dueno LIMIT 1), NEW.registrada_por);
    c := marketing.conv_crear(NEW.empresa, NEW.ciudad, v_dueno, NULL, CASE WHEN NEW.origen = 'investigacion' THEN 'investigacion' ELSE 'radar' END,
                              1::smallint, false, NEW.demo, NEW.registrada_por);
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      'Señal nueva: ' || NEW.titulo || coalesce(' · ' || nullif(NEW.evidencia->>'fecha',''), ''), jsonb_build_object('conv', 'senal', 'senal_id', NEW.id));
  ELSE
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      'Señal nueva de esta empresa: ' || NEW.titulo || coalesce(' · ' || nullif(NEW.evidencia->>'fecha',''), ''), jsonb_build_object('conv', 'senal', 'senal_id', NEW.id));
  END IF;
  INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'senal', NEW.registrada_por, jsonb_build_object('senal_id', NEW.id));
  c := marketing.conv_agregar_evidencia(c.id, marketing.senal_evidencia(NEW), NEW.registrada_por);
  IF c.estado = 'cuarentena' THEN c := marketing.conv_reactivar(c.id, 'senal', NEW.registrada_por); END IF;
  UPDATE marketing.bandeja_senal SET conversacion_id = c.id WHERE id = NEW.id;
  RETURN NEW;
END
$cds$;
DROP TRIGGER IF EXISTS bandeja_conversacion ON marketing.bandeja_senal;
CREATE TRIGGER bandeja_conversacion AFTER INSERT ON marketing.bandeja_senal FOR EACH ROW EXECUTE FUNCTION marketing.conv_desde_senal();

-- Una tarjeta nueva (Enviar a CRM desde una conversación, o «Traer Prospecto Lead») queda en la conversación de su
-- empresa: la de su ficha; si no, la de su lead o su empresa y planta; y si no hay, se abre una conversación nueva
-- (origen Manual, etapa 1). La sesión de la tarjeta queda como historia. Lo traído de Odoo no cuenta para el tope.
CREATE OR REPLACE FUNCTION marketing.conv_desde_tarjeta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $cdt$
DECLARE c_id uuid; c marketing.conversacion;
BEGIN
  IF NEW.conversacion_id IS NOT NULL AND TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  c_id := NEW.conversacion_id;
  IF c_id IS NULL THEN SELECT f.conversacion_id INTO c_id FROM marketing.ficha f WHERE f.id = NEW.ficha_id; END IF;
  IF c_id IS NULL THEN
    c := marketing.conv_buscar(NEW.empresa, NEW.ciudad, NEW.odoo_lead_id, NEW.demo);
    c_id := c.id;
  END IF;
  IF c_id IS NULL THEN
    c := marketing.conv_crear(NEW.empresa, NEW.ciudad, NEW.responsable, NULL, 'manual', 1::smallint, false, NEW.demo, NEW.traida_por);
    c_id := c.id;
    UPDATE marketing.conversacion SET resumen = nullif(NEW.resumen,''), siguiente = NEW.siguiente WHERE id = c_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM marketing.conversacion x WHERE x.id = c_id AND x.sesion_id = NEW.sesion_id) THEN
    INSERT INTO marketing.conv_sesion (sesion_id, conversacion_id, rol) VALUES (NEW.sesion_id, c_id, 'tarjeta') ON CONFLICT (sesion_id) DO NOTHING;
  END IF;
  IF NEW.odoo_lead_id IS NOT NULL THEN
    UPDATE marketing.conversacion SET leads = CASE WHEN NEW.odoo_lead_id = ANY (leads) THEN leads ELSE leads || NEW.odoo_lead_id END WHERE id = c_id;
    IF NEW.origen = 'envio' THEN
      INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c_id, 'crm', NEW.traida_por, jsonb_build_object('lead', NEW.odoo_lead_id));
    END IF;
  END IF;
  IF NEW.conversacion_id IS DISTINCT FROM c_id THEN
    UPDATE marketing.seg_tarjeta SET conversacion_id = c_id WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END
$cdt$;
DROP TRIGGER IF EXISTS tarjeta_conversacion ON marketing.seg_tarjeta;
CREATE TRIGGER tarjeta_conversacion AFTER INSERT OR UPDATE OF odoo_lead_id ON marketing.seg_tarjeta FOR EACH ROW EXECUTE FUNCTION marketing.conv_desde_tarjeta();

-- La ficha que el motor guarda en una conversación queda ligada a ella.
CREATE OR REPLACE FUNCTION marketing.conv_ficha_liga() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $cfl$
BEGIN
  IF NEW.conversacion_id IS NULL THEN
    NEW.conversacion_id := (SELECT x.id FROM marketing.conversacion x WHERE x.sesion_id = NEW.sesion_id);
  END IF;
  RETURN NEW;
END
$cfl$;
DROP TRIGGER IF EXISTS ficha_conversacion ON marketing.ficha;
CREATE TRIGGER ficha_conversacion BEFORE INSERT ON marketing.ficha FOR EACH ROW EXECUTE FUNCTION marketing.conv_ficha_liga();

-- ── API de la suite ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.api_conv(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $ac$
DECLARE modo text := req->>'modo'; actor text := req->>'actor'; scopes jsonb := coalesce(req->'scopes','[]'::jsonb);
  d jsonb := coalesce(req->'datos','{}'::jsonb); c marketing.conversacion; n int; v_tid bigint; x record; r jsonb;
BEGIN
  -- conversacion_id viaja dentro de `datos` (firmado); chat/suite lo copia al pedido. Se aceptan los dos lugares.
  IF coalesce(req->>'conversacion_id', d->>'conversacion_id') IS NOT NULL THEN
    BEGIN SELECT * INTO c FROM marketing.conversacion WHERE id = coalesce(req->>'conversacion_id', d->>'conversacion_id')::uuid; EXCEPTION WHEN others THEN RETURN chat.err('CONVERSACION_INVALIDA'); END;
    IF c.id IS NULL THEN RETURN chat.err('CONVERSACION_NO_EXISTE'); END IF;
  END IF;
  -- «Volver a la conversación» desde una ficha, una tarjeta o una sesión de antes (historia).
  IF c.id IS NULL AND modo = 'conv' AND req ? 'ficha_id' THEN
    BEGIN SELECT cv.* INTO c FROM marketing.conversacion cv JOIN marketing.ficha f ON f.conversacion_id = cv.id WHERE f.id = (req->>'ficha_id')::uuid;
    EXCEPTION WHEN others THEN RETURN chat.err('FICHA_INVALIDA'); END;
  END IF;
  IF c.id IS NULL AND modo = 'conv' AND req ? 'sesion_id' THEN
    SELECT cv.* INTO c FROM marketing.conversacion cv WHERE cv.sesion_id = (req->>'sesion_id')::uuid;
    IF c.id IS NULL THEN SELECT cv.* INTO c FROM marketing.conversacion cv JOIN marketing.conv_sesion h ON h.conversacion_id = cv.id WHERE h.sesion_id = (req->>'sesion_id')::uuid; END IF;
  END IF;

  IF modo = 'conversaciones' THEN
    -- Revisa enfriamiento y reactivaciones de lo que se va a pintar (sin cron).
    FOR x IN SELECT id FROM marketing.conversacion WHERE NOT demo AND estado <> 'cerrada' AND (frio IS DISTINCT FROM marketing.conv_frio_calc(conversacion.*) OR (estado = 'cuarentena' AND reactivar_el <= chat.hoy())) LOOP
      PERFORM marketing.conv_revisar(x.id);
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'hoy', to_char(chat.hoy(), 'YYYY-MM-DD'), 'yo', actor, 'motor', chat.estado_motor('marketing'),
      'equipo', scopes ? 'marketing:equipo',
      'conversaciones', coalesce((SELECT jsonb_agg(marketing.conv_vista(v, actor) ORDER BY v.updated_at DESC) FROM marketing.conversacion v
        WHERE (coalesce((req->>'demo')::boolean, false) OR NOT v.demo)
          AND (v.estado <> 'cerrada' OR v.updated_at > now() - interval '90 days' OR coalesce((req->>'todas')::boolean, false))), '[]'::jsonb));

  ELSIF modo = 'conv' THEN
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    c := marketing.conv_revisar(c.id);
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(c, actor), 'hoy', to_char(chat.hoy(), 'YYYY-MM-DD'),
      'fichas', coalesce((SELECT jsonb_agg(marketing.ficha_corta(f) || jsonb_build_object('acceso', f.datos->'acceso', 'conmutador', f.datos->'conmutador', 'por_que', f.datos->'por_que') ORDER BY f.created_at) FROM marketing.ficha f WHERE f.conversacion_id = c.id), '[]'::jsonb),
      'senales', coalesce((SELECT jsonb_agg(marketing.senal_vista(b) ORDER BY b.created_at) FROM marketing.bandeja_senal b WHERE b.conversacion_id = c.id), '[]'::jsonb),
      'eventos', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', e.tipo, 'actor', e.actor, 'datos', e.datos, 'at', e.created_at) ORDER BY e.id) FROM marketing.conv_evento e WHERE e.conversacion_id = c.id), '[]'::jsonb),
      'tarjeta_id', (SELECT t.id FROM marketing.seg_tarjeta t WHERE t.conversacion_id = c.id AND t.odoo_lead_id IS NOT NULL ORDER BY t.updated_at DESC LIMIT 1),
      'toques', coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'cliente_id', q.cliente_id, 'actor', q.actor, 'canal', q.canal, 'resultado', q.resultado, 'revisado', q.revisado, 'propuesta', q.propuesta, 'motor', q.motor, 'at', q.created_at) ORDER BY q.id) FROM marketing.conv_toque q WHERE q.conversacion_id = c.id), '[]'::jsonb),
      'historial', coalesce((SELECT jsonb_agg(jsonb_build_object('sesion_id', h.sesion_id, 'rol', h.rol, 'titulo', s.titulo, 'tipo', s.tipo, 'at', s.created_at) ORDER BY s.created_at) FROM marketing.conv_sesion h JOIN chat.sesion s ON s.id = h.sesion_id WHERE h.conversacion_id = c.id), '[]'::jsonb),
      'odoo', coalesce((SELECT jsonb_agg(jsonb_build_object('accion', o.accion, 'estado', o.estado, 'lead_id', o.lead_id, 'at', o.created_at) ORDER BY o.id) FROM marketing.conv_odoo o WHERE o.conversacion_id = c.id), '[]'::jsonb));

  ELSIF modo = 'conv_abrir' THEN
    -- Prospectar o «Nuevo lead»: si la empresa ya tiene conversación, se abre ESA; si no, se crea y cuenta para el tope.
    IF coalesce(btrim(d->>'empresa'),'') = '' THEN RETURN chat.err('SIN_EMPRESA', 'Escribe la empresa.'); END IF;
    c := marketing.conv_buscar(d->>'empresa', d->>'ciudad', nullif(d->>'lead_id','')::int, coalesce((d->>'demo')::boolean, false));
    IF c.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'ya_existia', true, 'conversacion', marketing.conv_vista(c, actor)); END IF;
    SELECT count(*) INTO n FROM chat.sesion WHERE producto = 'marketing' AND autor = actor AND cuenta_tope AND NOT demo
      AND (created_at AT TIME ZONE 'America/Monterrey')::date = chat.hoy();
    IF n >= chat.cfg('marketing', 'tope_sesiones_dia') THEN RETURN chat.err('TOPE_SESIONES', 'Llegaste al tope de conversaciones nuevas de hoy.'); END IF;
    IF coalesce(d->>'origen','manual') <> 'nuevo_lead' AND (marketing.uso(actor)->>'tokens_hoy')::bigint >= (marketing.uso(actor)->>'tope_tokens_dia')::bigint THEN
      RETURN chat.err('TOPE_TOKENS', 'Hoy ya se gastó el tope de tokens de prospección. Mañana se reinicia.');
    END IF;
    c := marketing.conv_crear(d->>'empresa', d->>'ciudad', actor, req->>'nombre',
           CASE WHEN d->>'origen' IN ('radar','manual','investigacion','nuevo_lead') THEN d->>'origen' ELSE 'manual' END,
           1::smallint, true, coalesce((d->>'demo')::boolean, false), actor);
    RETURN jsonb_build_object('ok', true, 'ya_existia', false, 'conversacion', marketing.conv_vista(c, actor));

  ELSIF modo IN ('conv_fijar','conv_desfijar','conv_leido') THEN
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    INSERT INTO marketing.conv_marca (conversacion_id, actor, fijada, leido_hasta)
    VALUES (c.id, actor, modo = 'conv_fijar', CASE WHEN modo = 'conv_leido' THEN coalesce((coalesce(req->>'hasta', d->>'hasta'))::bigint, 0) ELSE 0 END)
    ON CONFLICT ON CONSTRAINT conv_marca_pkey DO UPDATE SET
      fijada = CASE WHEN modo = 'conv_leido' THEN marketing.conv_marca.fijada ELSE EXCLUDED.fijada END,
      leido_hasta = greatest(marketing.conv_marca.leido_hasta, EXCLUDED.leido_hasta);
    RETURN jsonb_build_object('ok', true);

  ELSIF modo IN ('conv_archivar','conv_desarchivar','conv_renombrar') THEN
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    IF c.dueno <> actor AND NOT scopes ? 'marketing:equipo' THEN RETURN chat.err('NO_ES_TUYA', 'Solo su dueño (o dirección) puede cambiarla.'); END IF;
    IF modo = 'conv_renombrar' THEN
      IF coalesce(btrim(req->>'texto'),'') = '' THEN RETURN chat.err('NOMBRE_VACIO'); END IF;
      UPDATE chat.sesion SET titulo = left(btrim(req->>'texto'), 120) WHERE id = c.sesion_id;
    ELSE
      UPDATE marketing.conversacion SET archivada = (modo = 'conv_archivar') WHERE id = c.id;
      INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'archivo', actor, jsonb_build_object('archivada', modo = 'conv_archivar'));
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF modo = 'conv_reasignar' THEN
    -- Reasignar conserva TODA la historia. «a seguimiento» además cierra la etapa 1 (sus lecciones se consolidan).
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    IF NOT scopes ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE', 'Reasignar pide marketing:crm.'); END IF;
    IF coalesce(btrim(req->>'texto'),'') !~ '^[a-z0-9._-]{3,60}' THEN RETURN chat.err('RESPONSABLE_INVALIDO', 'Escribe el usuario de la suite de quien la va a trabajar.'); END IF;
    IF btrim(req->>'texto') = c.dueno AND NOT coalesce((d->>'etapa')::int, c.etapa) <> c.etapa THEN RETURN chat.err('SIN_CAMBIOS'); END IF;
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'reasignacion', actor,
      jsonb_build_object('de', c.dueno, 'a', btrim(req->>'texto'), 'motivo', left(coalesce(req->>'razon', d->>'razon'), 300), 'etapa', c.etapa));
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      'Reasignada: ' || c.dueno || ' → ' || btrim(req->>'texto') || ' (la asignó ' || actor || '). La historia completa se queda.', jsonb_build_object('conv', 'reasignacion'));
    UPDATE marketing.conversacion SET dueno = btrim(req->>'texto') WHERE id = c.id RETURNING * INTO c;
    IF coalesce((d->>'etapa')::int, c.etapa) = 2 AND c.etapa = 1 THEN
      UPDATE marketing.conversacion SET etapa = 2 WHERE id = c.id RETURNING * INTO c;
      INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'etapa', actor, jsonb_build_object('de', 1, 'a', 2));
      INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
        'Pasa a Etapa 2 · Seguimiento. Se cierra la prospección y se consolidan sus lecciones de búsqueda.', jsonb_build_object('conv', 'etapa'));
      v_tid := chat.encolar(c.sesion_id, 'etapa_cierre', actor, jsonb_build_object('etapa', 1));
    END IF;
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(c, actor), 'trabajo_id', v_tid);

  ELSIF modo = 'conv_ligar' THEN
    -- «Nuevo lead»: la sesión de captura (tipo lead, de quien la capturó) se liga a la conversación de su empresa.
    IF NOT EXISTS (SELECT 1 FROM chat.sesion WHERE id = (req->>'sesion_id')::uuid AND autor = actor AND tipo = 'lead') THEN RETURN chat.err('NO_ES_TUYA'); END IF;
    RETURN marketing.api_motor_conv(req || jsonb_build_object('empresa', coalesce(req->>'empresa', d->>'empresa'), 'ciudad', coalesce(req->>'ciudad', d->>'ciudad', ''),
                                                              'resumen', coalesce(req->>'resumen', d->>'resumen', '')));

  ELSIF modo = 'conv_sugerir' THEN
    -- La persona pide sugerencia: un trabajo para la conversación (se junta con la ráfaga pendiente).
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    v_tid := chat.encolar(c.sesion_id, 'mensaje', actor, jsonb_build_object('sugerencia', true));
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor) VALUES (c.id, 'sugerencia', actor);
    RETURN jsonb_build_object('ok', true, 'trabajo_id', v_tid);

  ELSIF modo = 'conv_propuesta_base' THEN
    -- La pantalla guarda la propuesta mecánica que ya pintó (toque-base.js) en el toque de su mensaje.
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    d := d - 'conversacion_id';
    UPDATE marketing.conv_toque SET propuesta = d,
      canal = CASE WHEN d->>'canal' IN ('conmutador','llamada','correo','whatsapp','visita','linkedin','portal','otro') THEN d->>'canal' END,
      resultado = CASE WHEN d->>'resultado' IN ('sin_respuesta','transferido','contesto','cita','envio_info','rechazo','alta_proveedor','otro') THEN d->>'resultado' END,
      avanzo = coalesce((d->>'avanzo_etapa')::boolean, false)
     WHERE conversacion_id = c.id AND cliente_id = req->>'cliente_id' AND NOT revisado;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF d ? 'siguiente' AND coalesce(d->'siguiente'->>'fecha','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
      UPDATE marketing.conversacion SET siguiente = d->'siguiente', sugerencia = coalesce(left(d->>'sugerencia', 1500), sugerencia) WHERE id = c.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'toques', n);

  ELSIF modo = 'conv_cuarentena' THEN
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    IF c.estado <> 'curso' THEN RETURN chat.err('NO_EN_CURSO'); END IF;
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(marketing.conv_cuarentena(c.id, 'manual', actor), actor));

  ELSIF modo = 'conv_reactivar' THEN
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    IF c.estado <> 'cuarentena' THEN RETURN chat.err('NO_EN_CUARENTENA'); END IF;
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(marketing.conv_reactivar(c.id, 'manual', actor), actor));

  ELSIF modo = 'conv_cerrar' THEN
    -- Cierre: Por cotizar, o perdida con motivo explícito (es lo que aprende el consolida).
    IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;
    IF d->>'cierre' NOT IN ('por_cotizar','perdida') THEN RETURN chat.err('CIERRE_INVALIDO'); END IF;
    IF d->>'cierre' = 'perdida' AND coalesce(d->>'motivo','') NOT IN ('sin_necesidad','competencia','sin_contacto','precalificacion','otro') THEN
      RETURN chat.err('MOTIVO_OBLIGATORIO', 'Elige el motivo: no tiene la necesidad, eligió competencia, sin forma de contacto, no pasamos precalificación u otro.');
    END IF;
    IF d->>'motivo' = 'otro' AND char_length(btrim(coalesce(d->>'texto',''))) < 5 THEN RETURN chat.err('MOTIVO_OBLIGATORIO', 'Di cuál fue el motivo.'); END IF;
    UPDATE marketing.conversacion SET estado = 'cerrada', cierre = d->>'cierre', motivo = CASE WHEN d->>'cierre' = 'perdida' THEN d->>'motivo' END,
      motivo_texto = left(d->>'texto', 500), frio = NULL WHERE id = c.id RETURNING * INTO c;
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'cierre', actor,
      jsonb_build_object('cierre', c.cierre, 'motivo', c.motivo, 'nivel', c.nivel, 'etapa', c.etapa));
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      CASE WHEN c.cierre = 'por_cotizar' THEN 'Cerrada · Por cotizar.' ELSE 'Cerrada · perdida: ' || replace(c.motivo, '_', ' ') || coalesce(' · ' || nullif(c.motivo_texto,''), '') || '.' END,
      jsonb_build_object('conv', 'cierre'));
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(c, actor));

  ELSIF modo = 'conv_reabrir' THEN
    IF c.id IS NULL OR c.estado <> 'cerrada' THEN RETURN chat.err('NO_CERRADA'); END IF;
    UPDATE marketing.conversacion SET estado = 'curso', cierre = NULL, motivo = NULL, motivo_texto = NULL, archivada = false WHERE id = c.id RETURNING * INTO c;
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor) VALUES (c.id, 'reapertura', actor);
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(c, actor));

  ELSIF modo = 'tablero' THEN
    IF NOT scopes ? 'marketing:equipo' THEN RETURN chat.err('SCOPE_INSUFICIENTE', 'El tablero del equipo pide marketing:equipo.'); END IF;
    RETURN jsonb_build_object('ok', true, 'hoy', to_char(chat.hoy(), 'YYYY-MM-DD'),
      'por_persona', coalesce((SELECT jsonb_agg(q ORDER BY q->>'dueno') FROM (SELECT jsonb_build_object('dueno', dueno,
          'en_curso', count(*) FILTER (WHERE estado = 'curso'), 'n1', count(*) FILTER (WHERE estado = 'curso' AND nivel = 1),
          'etapa1', count(*) FILTER (WHERE estado = 'curso' AND etapa = 1), 'etapa2', count(*) FILTER (WHERE estado = 'curso' AND etapa = 2),
          'frio_nos', count(*) FILTER (WHERE frio = 'nos'), 'frio_mercado', count(*) FILTER (WHERE frio = 'mercado' OR estado = 'cuarentena'),
          'cuarentena', count(*) FILTER (WHERE estado = 'cuarentena'),
          'avisos_30d', (SELECT count(*) FROM marketing.conv_evento e WHERE e.tipo = 'frio' AND e.datos->>'frio' = 'nos' AND e.datos->>'dueno' = v.dueno AND e.created_at > now() - interval '30 days')) q
        FROM marketing.conversacion v WHERE NOT demo GROUP BY dueno) z), '[]'::jsonb),
      'curvas', coalesce((SELECT jsonb_agg(jsonb_build_object('nivel', nv, 'etapa', et, 'semana', sem, 'por_cotizar', pc, 'perdidas', pe)) FROM (
          SELECT (e.datos->>'nivel')::int nv, (e.datos->>'etapa')::int et, to_char(date_trunc('week', e.created_at AT TIME ZONE 'America/Monterrey'), 'YYYY-MM-DD') sem,
                 count(*) FILTER (WHERE e.datos->>'cierre' = 'por_cotizar') pc, count(*) FILTER (WHERE e.datos->>'cierre' = 'perdida') pe
          FROM marketing.conv_evento e WHERE e.tipo = 'cierre' AND e.created_at > now() - interval '8 weeks' GROUP BY 1, 2, 3) w), '[]'::jsonb),
      'motivos', coalesce((SELECT jsonb_object_agg(k, v) FROM (SELECT coalesce(motivo,'?') || ':N' || nivel k, count(*) v FROM marketing.conversacion WHERE cierre = 'perdida' AND NOT demo GROUP BY 1) m), '{}'::jsonb),
      'avisos', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', a.tipo, 'actor', a.actor, 'texto', a.texto, 'at', a.created_at) ORDER BY a.id DESC)
                          FROM (SELECT * FROM chat.aviso WHERE producto = 'marketing' AND tipo IN ('frio_nos','frio_nos_repetido','reactivada') ORDER BY id DESC LIMIT 30) a), '[]'::jsonb));
  END IF;
  RETURN NULL;
END
$ac$;

-- ── API del motor ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marketing.api_motor_conv(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $mc$
DECLARE modo text := req->>'modo'; c marketing.conversacion; p jsonb := coalesce(req->'propuesta','{}'::jsonb); ev jsonb := req->'evidencia'; n int; s chat.sesion;
BEGIN
  IF modo = 'conv_ligar' THEN
    -- Un «Nuevo lead» capturado sin señal (sesión tipo lead) o una sesión vieja del Prospectador: se liga a la
    -- conversación de su empresa; si no hay, se abre (origen Nuevo lead). No cuenta para el tope: la sesión ya contó.
    SELECT * INTO s FROM chat.sesion WHERE id = (req->>'sesion_id')::uuid AND producto = 'marketing';
    IF s.id IS NULL THEN RETURN chat.err('SESION_NO_EXISTE'); END IF;
    IF coalesce(btrim(req->>'empresa'),'') = '' THEN RETURN chat.err('SIN_EMPRESA'); END IF;
    c := marketing.conv_buscar(req->>'empresa', req->>'ciudad', nullif(req->>'lead_id','')::int, s.demo);
    IF c.id IS NULL THEN
      c := marketing.conv_crear(req->>'empresa', req->>'ciudad', s.autor, s.autor_nombre,
             CASE WHEN req->>'origen' IN ('radar','manual','investigacion','nuevo_lead') THEN req->>'origen' ELSE 'nuevo_lead' END, 1::smallint, false, s.demo, 'motor');
    END IF;
    IF c.sesion_id <> s.id THEN
      INSERT INTO marketing.conv_sesion (sesion_id, conversacion_id, rol) VALUES (s.id, c.id, CASE WHEN s.tipo = 'lead' THEN 'lead' ELSE 'prospectador' END) ON CONFLICT (sesion_id) DO NOTHING;
      INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
        CASE WHEN s.tipo = 'lead' THEN 'Nuevo lead capturado por ' || s.autor ELSE 'Sesión del Prospectador ligada' END || coalesce(': ' || nullif(left(req->>'resumen', 300),''), '') || '.',
        jsonb_build_object('conv', 'ligada', 'sesion_origen', s.id));
    END IF;
    UPDATE marketing.lead_rapido SET conversacion_id = c.id WHERE sesion_id = s.id AND conversacion_id IS NULL;
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(c, NULL));
  END IF;
  SELECT * INTO c FROM marketing.conversacion WHERE sesion_id = (req->>'sesion_id')::uuid;
  IF c.id IS NULL THEN RETURN chat.err('SIN_CONVERSACION'); END IF;

  IF modo = 'conv_propuesta' THEN
    -- Ráfaga de etapa 2: el motor corrige la propuesta mecánica de los toques sin revisar.
    IF p->'siguiente' IS NOT NULL AND (coalesce(p->'siguiente'->>'fecha','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' OR coalesce(p->'siguiente'->>'resumen','') = '') THEN
      RETURN chat.err('SIGUIENTE_INCOMPLETO');
    END IF;
    UPDATE marketing.conv_toque SET revisado = true, motor = p,
      canal = coalesce(CASE WHEN p->>'canal' IN ('conmutador','llamada','correo','whatsapp','visita','linkedin','portal','otro') THEN p->>'canal' END, canal),
      resultado = coalesce(CASE WHEN p->>'resultado' IN ('sin_respuesta','transferido','contesto','cita','envio_info','rechazo','alta_proveedor','otro') THEN p->>'resultado' END, resultado)
     WHERE conversacion_id = c.id AND NOT revisado;
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE marketing.conversacion SET resumen = coalesce(left(p->>'resumen', 2000), resumen), sugerencia = coalesce(left(p->>'sugerencia', 1500), sugerencia),
      siguiente = coalesce(p->'siguiente', siguiente) WHERE id = c.id RETURNING * INTO c;
    RETURN jsonb_build_object('ok', true, 'revisados', n, 'conversacion', marketing.conv_vista(c, NULL));

  ELSIF modo = 'conv_evidencia' THEN
    -- El motor sube o baja el nivel SOLO con evidencia: liga y fecha. N1 exige que sea demanda (invitación, licitación, portal, solicitud).
    IF ev IS NULL OR coalesce(ev->>'liga','') !~ '^https?://' OR coalesce(ev->>'fecha','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
      RETURN chat.err('EVIDENCIA_INCOMPLETA', 'La evidencia necesita liga (http) y fecha AAAA-MM-DD.');
    END IF;
    IF coalesce(ev->>'tipo','') NOT IN ('invitacion','licitacion','portal','solicitud','obra','ampliacion','vacantes','inversion','senal') THEN
      RETURN chat.err('EVIDENCIA_TIPO');
    END IF;
    c := marketing.conv_agregar_evidencia(c.id, jsonb_build_object('tipo', ev->>'tipo', 'titulo', left(ev->>'titulo', 300), 'liga', ev->>'liga', 'fecha', ev->>'fecha',
           'fuente', left(ev->>'fuente', 120), 'cierra_el', ev->>'cierra_el'), 'motor');
    IF c.estado = 'cuarentena' THEN c := marketing.conv_reactivar(c.id, 'senal', 'motor'); END IF;
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(c, NULL));

  ELSIF modo = 'conv_caso' THEN
    -- «faltó» (etapa 1) o «puente» (etapa 2 → en contra de una lección de búsqueda). Sin nombres, correos ni teléfonos.
    IF req->>'tipo' NOT IN ('falto','puente') THEN RETURN chat.err('CASO_TIPO'); END IF;
    BEGIN
      INSERT INTO marketing.conv_caso (conversacion_id, etapa, tipo, leccion_id, actor, datos)
      VALUES (c.id, c.etapa, req->>'tipo', left(req->>'leccion_id', 120), req->>'actor', coalesce(req->'datos','{}'::jsonb));
    EXCEPTION WHEN check_violation THEN RETURN chat.err('CASO_CON_CONTACTO', 'El caso no puede llevar correos ni teléfonos.');
    END;
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, (req->>'tipo'), 'motor', jsonb_build_object('leccion_id', req->>'leccion_id'));
    RETURN jsonb_build_object('ok', true);

  ELSIF modo = 'conv_leer' THEN
    RETURN jsonb_build_object('ok', true, 'conversacion', marketing.conv_vista(c, NULL),
      'toques_sin_revisar', coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'texto', q.texto, 'canal', q.canal, 'resultado', q.resultado, 'propuesta', q.propuesta, 'hora_local', q.hora_local, 'at', q.created_at) ORDER BY q.id)
        FROM marketing.conv_toque q WHERE q.conversacion_id = c.id AND NOT q.revisado), '[]'::jsonb),
      'fichas', coalesce((SELECT jsonb_agg(marketing.ficha_completa(f) ORDER BY f.created_at) FROM marketing.ficha f WHERE f.conversacion_id = c.id), '[]'::jsonb));
  END IF;
  RETURN NULL;
END
$mc$;

-- ── Despachadores: los modos nuevos sin reescribir los viejos (patrón de 0004) ──
DO $desp8$
DECLARE fn text; src text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['api_suite_ext','api_motor_ext','gancho'] LOOP
    SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'marketing' AND p.proname = fn;
    IF src IS NOT NULL AND position('despachador_0008' IN src) = 0 THEN
      IF fn = 'gancho' THEN
        EXECUTE 'DROP FUNCTION IF EXISTS marketing.gancho_0004(text, jsonb)';
        EXECUTE 'ALTER FUNCTION marketing.gancho(text, jsonb) RENAME TO gancho_0004';
      ELSE
        EXECUTE format('DROP FUNCTION IF EXISTS marketing.%I(jsonb)', fn || '_0004');
        EXECUTE format('ALTER FUNCTION marketing.%I(jsonb) RENAME TO %I', fn, fn || '_0004');
      END IF;
    END IF;
  END LOOP;
END
$desp8$;

CREATE OR REPLACE FUNCTION marketing.api_suite_ext(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $se8x$
BEGIN
  -- despachador_0008: conversaciones primero; lo demás, como en 0004.
  IF req->>'modo' IN ('conversaciones','conv','conv_abrir','conv_fijar','conv_desfijar','conv_leido','conv_archivar','conv_desarchivar','conv_renombrar',
                      'conv_reasignar','conv_sugerir','conv_propuesta_base','conv_cuarentena','conv_reactivar','conv_cerrar','conv_reabrir','conv_ligar','tablero') THEN
    RETURN marketing.api_conv(req);
  END IF;
  RETURN marketing.api_suite_ext_0004(req);
END
$se8x$;

CREATE OR REPLACE FUNCTION marketing.api_motor_ext(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $me8$
BEGIN
  -- despachador_0008
  IF req->>'modo' IN ('conv_propuesta','conv_evidencia','conv_caso','conv_leer','conv_ligar') THEN RETURN marketing.api_motor_conv(req); END IF;
  RETURN marketing.api_motor_ext_0004(req);
END
$me8$;

CREATE OR REPLACE FUNCTION marketing.gancho(evento text, req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $gc8$
DECLARE c marketing.conversacion; n int; ant marketing.conv_toque;
BEGIN
  -- despachador_0008
  IF req ? 'sesion_id' AND evento IN ('enviar','hilo','tomar') THEN
    BEGIN SELECT * INTO c FROM marketing.conversacion WHERE sesion_id = (req->>'sesion_id')::uuid; EXCEPTION WHEN others THEN c := NULL; END;
  END IF;
  IF c.id IS NOT NULL AND evento = 'enviar' THEN
    UPDATE marketing.conversacion SET ultima_actividad_at = now() WHERE id = c.id;
    IF c.etapa = 2 AND c.estado = 'curso' AND coalesce(btrim(req->>'texto'),'') <> '' THEN
      -- Un toque de seguimiento: se guarda y NO dispara un trabajo por mensaje (chat_0004). La pantalla ya pintó la propuesta mecánica.
      SELECT * INTO ant FROM marketing.conv_toque WHERE conversacion_id = c.id ORDER BY id DESC LIMIT 1;
      INSERT INTO marketing.conv_toque (conversacion_id, cliente_id, actor, texto, hora_local, demo)
      VALUES (c.id, req->>'cliente_id', req->>'actor', left(req->>'texto', 4000), extract(hour FROM now() AT TIME ZONE 'America/Monterrey')::smallint, c.demo)
      ON CONFLICT (conversacion_id, cliente_id) DO NOTHING;
      UPDATE marketing.conversacion SET ultimo_toque_at = now(), toques = toques + 1, frio = CASE WHEN frio = 'nos' THEN NULL ELSE frio END WHERE id = c.id;
      SELECT count(*) INTO n FROM marketing.conv_toque WHERE conversacion_id = c.id AND NOT revisado;
      IF n >= marketing.cfg('toques_por_rafaga') THEN
        RETURN jsonb_build_object('ok', true, 'sin_trabajo', true, 'encolar', true, 'datos_trabajo', jsonb_build_object('rafaga', n));
      END IF;
      RETURN jsonb_build_object('ok', true, 'sin_trabajo', true);
    END IF;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF c.id IS NOT NULL AND evento IN ('hilo','tomar') THEN
    RETURN coalesce(marketing.gancho_0004(evento, req), '{}'::jsonb) || jsonb_build_object('conversacion', marketing.conv_vista(c, req->>'actor'));
  END IF;
  RETURN marketing.gancho_0004(evento, req);
END
$gc8$;

-- ── Dueños y permisos (igual que 0004) ──────────────────────────────────────
DO $duenos8$
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
$duenos8$;
GRANT EXECUTE ON FUNCTION chat.estado_motor(text), chat.hoy(), chat.cfg(text, text) TO marketing_app;
GRANT SELECT ON chat.latido, chat.config TO marketing_app;
-- El mapeo (0009) vuelve hilo de conversación la sesión de una tarjeta: cambia su tipo; una conversación nueva escribe cuenta_tope.
GRANT UPDATE (tipo, cuenta_tope, demo) ON chat.sesion TO marketing_app;
GRANT EXECUTE ON FUNCTION marketing.gancho(text, jsonb), marketing.api_suite_ext(jsonb), marketing.api_motor_ext(jsonb) TO chat_app;
GRANT EXECUTE ON FUNCTION marketing.norm(text), marketing.cfg(text), marketing.uso(text) TO chat_app;
