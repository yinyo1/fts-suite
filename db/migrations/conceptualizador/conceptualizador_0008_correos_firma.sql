-- ═══════════════════════════════════════════════════════════════════════════
-- 008_conceptualizador.sql · correos a proveedores (RFQ) y firma de quien cotiza.
-- MVP rector #4 de fts-conceptualizador (14-oct-2026, V1.34: D86, D87, decisión
-- (d) de Esteban y su regla de la firma de las 13:57 CST).
--
-- Sobre la 001 a la 007 (no se editan):
--   · correo   lo que PROPUSO el motor (nunca la pantalla): destinatario, asunto,
--              cuerpo y los items, cada uno anclado a un renglón del BOM o a un
--              concepto del caso. Ciclo: propuesto → enviado | bloqueado | error.
--              Folio CZ-<n> en el asunto para ligar la respuesta.
--   · firma    por persona de la suite: nombre de USO (del token, se confirma la
--              primera vez), puesto en español y en inglés, de Odoo
--              (hr.employee.job_title) o corregido a mano. Lo corregido a mano
--              se usa y queda registrado, pero NO se escribe en Odoo.
--   · api_correo(p)  la llama SOLO el workflow conceptualizador/correo-proveedor,
--              después de verificar el token. Aquí vive el CANDADO DE CONTEXTO
--              (D87), no en la pantalla:
--                1. el correo existe, lo propuso el motor y sigue `propuesto`;
--                2. el caso es de quien llama (o admin) y tiene levantamiento;
--                3. cada item sigue anclado a un renglón o concepto del caso, y si
--                   la persona editó el cuerpo, la clave de cada item sigue ahí;
--                4. el destinatario es el que propuso el motor, o del mismo dominio;
--                5. topes: 10 por caso y 20 por persona al día (CST).
--              Si falla: `bloqueado`, el texto exacto de Esteban y un aviso.
--
-- Como la 0006 y la 0007: api_suite/api_motor se renombran a *_0007 y las nuevas
-- delegan. Reglas de db/README.md de la suite: idempotente, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

DO $ren8$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0007') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0007;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0007') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0007;
  END IF;
END
$ren8$;

-- ── Tablas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.correo (
  id                   bigserial   PRIMARY KEY,
  folio                text        NOT NULL UNIQUE,
  caso_id              uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  trabajo_id           bigint      REFERENCES conceptualizador.trabajo(id),
  tipo                 text        NOT NULL DEFAULT 'rfq' CHECK (tipo IN ('rfq')),
  proveedor_partner_id int,
  proveedor_nombre     text        NOT NULL,
  -- Sin ancla de fin a propósito: un dólar seguido de comilla no pasa el runner (db/README regla 8).
  para                 text        NOT NULL CHECK (para !~ '[[:space:],;<>]' AND para ~* '^[^@]+@[^@]+[.][a-z]{2,}'),
  fuente_destino       text        NOT NULL CHECK (fuente_destino IN ('odoo','web')),
  fuente_ref           text,       -- id del contacto en Odoo, o la liga pública donde el motor vio el correo
  asunto               text        NOT NULL,
  cuerpo               text        NOT NULL,
  items                jsonb       NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  estado               text        NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto','enviado','bloqueado','error')),
  enviado_por          text,
  enviado_at           timestamptz,
  enviado_para         text,       -- a quién salió de verdad (en MODO_PRUEBA, sales@)
  modo_prueba          boolean,
  graph_status         int,
  bloqueo              text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS correo_caso ON conceptualizador.correo (caso_id, id);
CREATE SEQUENCE IF NOT EXISTS conceptualizador.correo_folio_seq;

CREATE TABLE IF NOT EXISTS conceptualizador.firma (
  actor          text        PRIMARY KEY,
  nombre_uso     text,       -- «Ricardo Hernández»: del token, confirmado por la persona
  empleado_id    int,        -- hr.employee
  correo         text,       -- hr.employee.work_email (para el CC)
  puesto_odoo    text,       -- hr.employee.job_title tal cual, la última vez que se leyó
  puesto_es      text,
  puesto_en      text,
  puesto_fuente  text        CHECK (puesto_fuente IN ('odoo','manual')),
  leido_odoo_at  timestamptz,
  confirmada_at  timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Lo corregido a mano queda registrado (nunca se escribe en Odoo).
CREATE TABLE IF NOT EXISTS conceptualizador.firma_cambio (
  id          bigserial   PRIMARY KEY,
  actor       text        NOT NULL,
  campo       text        NOT NULL,
  antes       text,
  despues     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conceptualizador.aviso DROP CONSTRAINT IF EXISTS aviso_tipo_check;
ALTER TABLE conceptualizador.aviso ADD CONSTRAINT aviso_tipo_check
  CHECK (tipo IN ('tope_mensajes','tope_sesiones','fuera_de_tema','correo_sin_contexto','correo_tope'));
-- Un correo bloqueado avisa CADA vez (no uno por día): el índice único de la 0005 es para topes.
DROP INDEX IF EXISTS conceptualizador.aviso_uno_por_dia;
CREATE UNIQUE INDEX IF NOT EXISTS aviso_uno_por_dia ON conceptualizador.aviso (tipo, actor, dia)
  WHERE tipo IN ('tope_mensajes','tope_sesiones','fuera_de_tema');

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('tope_correos_caso', '10'),
  ('tope_correos_dia',  '20')
ON CONFLICT (clave) DO NOTHING;

-- ── Funciones de apoyo ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.dominio_de(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $dom$
  SELECT lower(split_part(btrim(coalesce(p,'')), '@', 2))
$dom$;

-- Un item está anclado si su `ancla` es un concepto (id) o la descripción de un renglón del BOM del caso.
CREATE OR REPLACE FUNCTION conceptualizador.item_anclado(p_caso uuid, p_item jsonb) RETURNS boolean
LANGUAGE sql STABLE AS $anc$
  SELECT EXISTS (
    SELECT 1 FROM conceptualizador.respuesta r
     WHERE r.caso_id = p_caso AND (
       EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.conceptos) = 'array' THEN r.conceptos ELSE '[]'::jsonb END) c
                WHERE c->>'id' = p_item->>'ancla')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.bom->'materiales') = 'array' THEN r.bom->'materiales' ELSE '[]'::jsonb END) m
                   WHERE m->>'descripcion' = p_item->>'ancla')))
$anc$;

CREATE OR REPLACE FUNCTION conceptualizador.firma_de(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $fir$
  SELECT to_jsonb(f) - 'updated_at' FROM conceptualizador.firma f WHERE f.actor = p_actor
$fir$;

-- ── API del motor: el motor PROPONE (nunca envía) ──────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot8$
DECLARE
  v_motor text := p->>'motor';
  t       conceptualizador.trabajo%ROWTYPE;
  v_c     jsonb := p->'correo';
  v_it    jsonb;
  v_id    bigint;
  v_folio text;
BEGIN
  IF p->>'modo' <> 'correo_propuesto' THEN RETURN conceptualizador.api_motor_0007(p); END IF;
  IF v_motor NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
  SELECT * INTO t FROM conceptualizador.trabajo WHERE id = nullif(p->>'trabajo_id','')::bigint;
  IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
  IF t.tomado_por IS DISTINCT FROM v_motor THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO'); END IF;
  IF jsonb_typeof(v_c) <> 'object' OR jsonb_typeof(v_c->'items') <> 'array' OR jsonb_array_length(v_c->'items') = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_ITEMS', 'mensaje', 'Un correo a proveedor lleva al menos un item anclado al caso.');
  END IF;
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_c->'items') LOOP
    IF NOT conceptualizador.item_anclado(t.caso_id, v_it) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ITEM_SIN_ANCLA', 'item', v_it,
        'mensaje', 'Cada item va anclado a un concepto (id) o a la descripción exacta de un renglón del BOM de este caso.');
    END IF;
  END LOOP;
  IF v_c->>'fuente_destino' NOT IN ('odoo','web') OR nullif(btrim(coalesce(v_c->>'fuente_ref','')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_FUENTE_DESTINO', 'mensaje', 'El destinatario sale del contacto en Odoo o de la liga pública del distribuidor.');
  END IF;
  v_folio := 'CZ-' || nextval('conceptualizador.correo_folio_seq');
  INSERT INTO conceptualizador.correo (folio, caso_id, trabajo_id, proveedor_partner_id, proveedor_nombre, para, fuente_destino, fuente_ref, asunto, cuerpo, items)
  VALUES (v_folio, t.caso_id, t.id, nullif(v_c->>'proveedor_partner_id','')::int, left(v_c->>'proveedor_nombre', 120), lower(btrim(v_c->>'para')),
          v_c->>'fuente_destino', left(v_c->>'fuente_ref', 500),
          left(btrim(v_c->>'asunto'), 200) || ' [' || v_folio || ']', left(v_c->>'cuerpo', 8000), v_c->'items')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'correo_id', v_id, 'folio', v_folio);
END
$mot8$;

-- ── API de la suite: el hilo trae los correos del caso y la firma de quien lee ──
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $api8$
DECLARE v_r jsonb; v_caso uuid;
BEGIN
  v_r := conceptualizador.api_suite_0007(p);
  IF p->>'modo' = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) THEN
    v_caso := nullif(p->>'caso_id','')::uuid;
    v_r := v_r || jsonb_build_object(
      'correos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'folio', c.folio, 'proveedor', c.proveedor_nombre, 'para', c.para,
                    'asunto', c.asunto, 'cuerpo', c.cuerpo, 'items', c.items, 'estado', c.estado, 'enviado_at', c.enviado_at,
                    'modo_prueba', c.modo_prueba, 'bloqueo', c.bloqueo) ORDER BY c.id), '[]'::jsonb)
                    FROM conceptualizador.correo c WHERE c.caso_id = v_caso),
      'firma', conceptualizador.firma_de(p->>'actor'));
  END IF;
  RETURN v_r;
END
$api8$;

-- ── API del workflow conceptualizador/correo-proveedor ─────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_correo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cor8$
DECLARE
  v_actor  text := nullif(btrim(p->>'actor'), '');
  v_modo   text := p->>'modo';
  v_co     conceptualizador.correo%ROWTYPE;
  v_k      conceptualizador.caso%ROWTYPE;
  v_f      conceptualizador.firma%ROWTYPE;
  v_d      jsonb := coalesce(p->'datos', '{}'::jsonb);
  v_cuerpo text;
  v_asunto text;
  v_para   text;
  v_it     jsonb;
  v_falla  text;
  v_n      int;
  v_txt    text := 'Esto no tiene contexto en el caso y no puedo enviarlo; envíalo desde tu bandeja personal.';
BEGIN
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;

  IF v_modo = 'firma_leer' THEN
    RETURN jsonb_build_object('ok', true, 'firma', conceptualizador.firma_de(v_actor));

  ELSIF v_modo = 'firma_odoo' THEN
    -- Lo que leyó el workflow de hr.employee (por empleado_id del token o por work_email). Solo lectura de Odoo.
    INSERT INTO conceptualizador.firma (actor, nombre_uso, empleado_id, correo, puesto_odoo, puesto_es, puesto_en, puesto_fuente, leido_odoo_at)
    VALUES (v_actor, nullif(p->>'nombre',''), nullif(v_d->>'empleado_id','')::int, lower(nullif(v_d->>'correo','')), nullif(v_d->>'job_title',''),
            nullif(v_d->>'job_title',''), NULL, CASE WHEN nullif(v_d->>'job_title','') IS NULL THEN NULL ELSE 'odoo' END, now())
    ON CONFLICT (actor) DO UPDATE SET
      empleado_id = EXCLUDED.empleado_id, correo = EXCLUDED.correo, puesto_odoo = EXCLUDED.puesto_odoo, leido_odoo_at = now(),
      nombre_uso = coalesce(conceptualizador.firma.nombre_uso, EXCLUDED.nombre_uso),
      -- Lo corregido a mano manda sobre Odoo hasta que la persona lo quite.
      puesto_es = CASE WHEN conceptualizador.firma.puesto_fuente = 'manual' THEN conceptualizador.firma.puesto_es ELSE EXCLUDED.puesto_es END,
      puesto_fuente = CASE WHEN conceptualizador.firma.puesto_fuente = 'manual' THEN 'manual' ELSE EXCLUDED.puesto_fuente END,
      updated_at = now();
    RETURN jsonb_build_object('ok', true, 'firma', conceptualizador.firma_de(v_actor));

  ELSIF v_modo = 'firma_guardar' THEN
    -- La persona confirma su nombre de uso y su puesto (y la traducción, una vez). No escribe en Odoo.
    SELECT * INTO v_f FROM conceptualizador.firma WHERE actor = v_actor;
    IF v_f.actor IS NULL THEN INSERT INTO conceptualizador.firma (actor) VALUES (v_actor); SELECT * INTO v_f FROM conceptualizador.firma WHERE actor = v_actor; END IF;
    IF char_length(btrim(coalesce(v_d->>'nombre_uso',''))) BETWEEN 3 AND 80 AND btrim(v_d->>'nombre_uso') IS DISTINCT FROM v_f.nombre_uso THEN
      INSERT INTO conceptualizador.firma_cambio (actor, campo, antes, despues) VALUES (v_actor, 'nombre_uso', v_f.nombre_uso, btrim(v_d->>'nombre_uso'));
      UPDATE conceptualizador.firma SET nombre_uso = btrim(v_d->>'nombre_uso') WHERE actor = v_actor;
    END IF;
    IF char_length(btrim(coalesce(v_d->>'puesto_es',''))) BETWEEN 2 AND 80 AND btrim(v_d->>'puesto_es') IS DISTINCT FROM v_f.puesto_es THEN
      INSERT INTO conceptualizador.firma_cambio (actor, campo, antes, despues) VALUES (v_actor, 'puesto_es', v_f.puesto_es, btrim(v_d->>'puesto_es'));
      UPDATE conceptualizador.firma SET puesto_es = btrim(v_d->>'puesto_es'),
             puesto_fuente = CASE WHEN btrim(v_d->>'puesto_es') = coalesce(v_f.puesto_odoo, '') THEN 'odoo' ELSE 'manual' END WHERE actor = v_actor;
    END IF;
    IF char_length(btrim(coalesce(v_d->>'puesto_en',''))) BETWEEN 2 AND 80 AND btrim(v_d->>'puesto_en') IS DISTINCT FROM v_f.puesto_en THEN
      INSERT INTO conceptualizador.firma_cambio (actor, campo, antes, despues) VALUES (v_actor, 'puesto_en', v_f.puesto_en, btrim(v_d->>'puesto_en'));
      UPDATE conceptualizador.firma SET puesto_en = btrim(v_d->>'puesto_en') WHERE actor = v_actor;
    END IF;
    UPDATE conceptualizador.firma SET confirmada_at = coalesce(confirmada_at, now()), updated_at = now() WHERE actor = v_actor;
    RETURN jsonb_build_object('ok', true, 'firma', conceptualizador.firma_de(v_actor));

  ELSIF v_modo = 'preparar' THEN
    SELECT * INTO v_co FROM conceptualizador.correo WHERE id = nullif(p->>'correo_id','')::bigint FOR UPDATE;
    IF v_co.id IS NULL THEN v_falla := 'el correo no lo propuso el motor';
    ELSIF v_co.estado <> 'propuesto' THEN RETURN jsonb_build_object('ok', false, 'error', 'YA_' || upper(v_co.estado), 'estado', v_co.estado);
    END IF;
    IF v_falla IS NULL THEN
      SELECT * INTO v_k FROM conceptualizador.caso WHERE id = v_co.caso_id;
      IF v_k.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYA', 'mensaje', 'Solo quien cotiza manda los correos de su caso.');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.caso_id = v_k.id AND m.rol = 'usuario')
         AND NOT EXISTS (SELECT 1 FROM conceptualizador.adjunto a WHERE a.caso_id = v_k.id) THEN
        v_falla := 'el caso no tiene levantamiento';
      END IF;
    END IF;
    v_cuerpo := coalesce(nullif(btrim(coalesce(v_d->>'cuerpo','')), ''), v_co.cuerpo);
    v_asunto := coalesce(nullif(btrim(coalesce(v_d->>'asunto','')), ''), v_co.asunto);
    v_para   := lower(coalesce(nullif(btrim(coalesce(v_d->>'para','')), ''), v_co.para));
    IF v_falla IS NULL THEN
      FOR v_it IN SELECT * FROM jsonb_array_elements(v_co.items) LOOP
        IF NOT conceptualizador.item_anclado(v_co.caso_id, v_it) THEN v_falla := 'un item ya no está en el caso: ' || coalesce(v_it->>'ancla', '?'); EXIT; END IF;
        IF nullif(v_it->>'clave','') IS NOT NULL AND position(lower(v_it->>'clave') IN lower(v_cuerpo)) = 0 THEN
          v_falla := 'al editarlo se quitó «' || (v_it->>'clave') || '»'; EXIT;
        END IF;
      END LOOP;
    END IF;
    IF v_falla IS NULL AND conceptualizador.dominio_de(v_para) <> conceptualizador.dominio_de(v_co.para) THEN
      v_falla := 'el destinatario cambió a otro dominio';
    END IF;
    IF v_falla IS NULL AND position(v_co.folio IN v_asunto) = 0 THEN v_asunto := v_asunto || ' [' || v_co.folio || ']'; END IF;
    IF v_falla IS NOT NULL THEN
      IF v_co.id IS NOT NULL THEN UPDATE conceptualizador.correo SET estado = 'bloqueado', bloqueo = v_falla WHERE id = v_co.id; END IF;
      INSERT INTO conceptualizador.aviso (tipo, actor, dia, detalle)
      VALUES ('correo_sin_contexto', v_actor, conceptualizador.dia_uso(now()),
              jsonb_build_object('correo_id', v_co.id, 'folio', v_co.folio, 'caso', v_co.caso_id, 'motivo', v_falla, 'para', conceptualizador.dominio_de(v_para)));
      RETURN jsonb_build_object('ok', false, 'error', 'SIN_CONTEXTO', 'mensaje', v_txt, 'motivo', v_falla);
    END IF;
    -- Topes (cuentan los enviados).
    SELECT count(*) INTO v_n FROM conceptualizador.correo WHERE caso_id = v_co.caso_id AND estado = 'enviado';
    IF v_n >= conceptualizador.cfg('tope_correos_caso') THEN v_falla := 'tope de ' || conceptualizador.cfg('tope_correos_caso') || ' correos en este caso'; END IF;
    SELECT count(*) INTO v_n FROM conceptualizador.correo WHERE enviado_por = v_actor AND estado = 'enviado'
       AND conceptualizador.dia_uso(enviado_at) = conceptualizador.dia_uso(now());
    IF v_falla IS NULL AND v_n >= conceptualizador.cfg('tope_correos_dia') THEN v_falla := 'tope de ' || conceptualizador.cfg('tope_correos_dia') || ' correos al día'; END IF;
    IF v_falla IS NOT NULL THEN
      INSERT INTO conceptualizador.aviso (tipo, actor, dia, detalle)
      VALUES ('correo_tope', v_actor, conceptualizador.dia_uso(now()), jsonb_build_object('correo_id', v_co.id, 'folio', v_co.folio, 'motivo', v_falla));
      RETURN jsonb_build_object('ok', false, 'error', 'TOPE_CORREOS', 'mensaje', 'Llegaste al ' || v_falla || '. Esteban ya lo sabe.');
    END IF;
    SELECT * INTO v_f FROM conceptualizador.firma WHERE actor = v_actor;
    IF v_f.confirmada_at IS NULL OR v_f.correo IS NULL OR nullif(v_f.puesto_es, '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_PENDIENTE', 'firma', conceptualizador.firma_de(v_actor),
        'mensaje', 'Antes del primer correo confirma tu firma: nombre, puesto y correo de FTS.');
    END IF;
    IF v_k.pais = 'usa' AND nullif(v_f.puesto_en, '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FIRMA_SIN_INGLES', 'firma', conceptualizador.firma_de(v_actor),
        'mensaje', 'Este caso es de USA: ¿cómo se dice tu puesto en inglés? Se pregunta una vez y se guarda.');
    END IF;
    UPDATE conceptualizador.correo SET asunto = v_asunto, cuerpo = v_cuerpo, para = v_para WHERE id = v_co.id;
    RETURN jsonb_build_object('ok', true, 'enviar', jsonb_build_object(
      'correo_id', v_co.id, 'folio', v_co.folio, 'para', v_para, 'asunto', v_asunto, 'cuerpo', v_cuerpo,
      'idioma', CASE WHEN v_k.pais = 'usa' THEN 'en' ELSE 'es' END,
      'cc', v_f.correo, 'firma_nombre', v_f.nombre_uso,
      'firma_puesto', CASE WHEN v_k.pais = 'usa' THEN v_f.puesto_en ELSE v_f.puesto_es END,
      'oportunidad_id', v_k.oportunidad_id, 'orden_id', v_k.orden_id));

  ELSIF v_modo = 'resultado' THEN
    -- Solo un 202 de Graph cuenta como enviado.
    UPDATE conceptualizador.correo SET
      estado = CASE WHEN (p->>'graph_status')::int = 202 THEN 'enviado' ELSE 'error' END,
      graph_status = (p->>'graph_status')::int, enviado_por = v_actor,
      enviado_at = CASE WHEN (p->>'graph_status')::int = 202 THEN now() END,
      enviado_para = lower(nullif(p->>'enviado_para','')), modo_prueba = coalesce((p->>'modo_prueba')::boolean, true)
     WHERE id = nullif(p->>'correo_id','')::bigint AND estado = 'propuesto';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN jsonb_build_object('ok', v_n = 1, 'estado', (SELECT estado FROM conceptualizador.correo WHERE id = nullif(p->>'correo_id','')::bigint));
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$cor8$;

-- ── Permisos ───────────────────────────────────────────────────────────────
ALTER FUNCTION conceptualizador.api_suite(jsonb)      SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb)      SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo(jsonb)     SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0007(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0007(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0007(jsonb), conceptualizador.api_motor_0007(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb)   TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
