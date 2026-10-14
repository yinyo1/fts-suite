-- ═══════════════════════════════════════════════════════════════════════════
-- 007_conceptualizador.sql · ciudad del proyecto y de la persona, y modo
-- intermedio de acompañamiento. MVP rector #4 de fts-conceptualizador
-- (14-oct-2026, V1.34: D89 ciudad del proyecto y decisión (a) de Esteban).
--
-- Sobre la 001 a la 006 (no se editan):
--   · caso.proyecto_*   ciudad, estado y país DEL PROYECTO (de aquí sale la
--                       procura), de dónde salió y cuándo se confirmó.
--   · caso.persona_*    dónde estaba QUIEN LEVANTA al abrir la sesión. Aparte:
--                       nunca se mezcla con la del proyecto.
--   · Sin coordenadas   la base rechaza cualquier campo de ciudad que traiga un
--                       número con decimales (una latitud o longitud).
--                       Las coordenadas no salen del teléfono.
--   · Modo `ciudad`     cambiar o confirmar la ciudad del proyecto desde el ⋮.
--                       Solo el autor o un admin. Se puede aunque haya machote:
--                       cambia precios y viáticos, y el motor lo sabe.
--   · Modo `que_falta`  botón «¿Qué me falta?»: un trabajo a demanda con la lista
--                       consolidada de pendientes.
--   · Ventana de silencio (acompañamiento): un mensaje no se entrega al motor
--                       hasta 90 s sin mensajes nuevos de la persona en ese caso.
--                       La ráfaga entera la contesta UN trabajo (el lote de la
--                       003). Una pregunta escrita (con «?») no espera.
--   · «Al final consolidamos» (escrito) pasa la sesión a levantamiento en el
--                       acto. Dicho en nota de voz, lo detecta el motor con la
--                       transcripción y llama `pasa_levantamiento`. La frase la
--                       decide UNA función: conceptualizador.es_consolidar().
--
-- Como la 0006: las funciones de la 0006 se renombran a api_suite_0006 /
-- api_motor_0006 (una sola vez) y las nuevas atienden lo nuevo y delegan.
-- Reglas de db/README.md de la suite: idempotente, etiquetas con nombre,
-- sin llaves dobles, sin dólar seguido de dígito, comilla, & o acento grave.
-- ═══════════════════════════════════════════════════════════════════════════

DO $ren7$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0006') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0006;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0006') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0006;
  END IF;
END
$ren7$;

-- ── Columnas ───────────────────────────────────────────────────────────────
ALTER TABLE conceptualizador.caso
  ADD COLUMN IF NOT EXISTS proyecto_ciudad        text,
  ADD COLUMN IF NOT EXISTS proyecto_estado        text,
  ADD COLUMN IF NOT EXISTS proyecto_pais          text,
  ADD COLUMN IF NOT EXISTS proyecto_fuente        text,
  ADD COLUMN IF NOT EXISTS proyecto_confirmada_at timestamptz,
  ADD COLUMN IF NOT EXISTS persona_ciudad         text,
  ADD COLUMN IF NOT EXISTS persona_estado         text,
  ADD COLUMN IF NOT EXISTS persona_fuente         text;

-- Ninguna ciudad lleva un número con decimales; una latitud o longitud sí, aunque sea de 2
-- («31.69, -106.42» es Cd. Juárez a ~1 km). Se rechaza cualquier número con punto o coma decimal.
CREATE OR REPLACE FUNCTION conceptualizador.sin_coordenadas(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $sinc$
  SELECT p IS NULL OR p !~ '[0-9][.,][0-9]'
$sinc$;

ALTER TABLE conceptualizador.caso DROP CONSTRAINT IF EXISTS caso_ciudad_check;
ALTER TABLE conceptualizador.caso ADD CONSTRAINT caso_ciudad_check CHECK (
      char_length(coalesce(proyecto_ciudad, '')) <= 60 AND char_length(coalesce(proyecto_estado, '')) <= 30
  AND char_length(coalesce(persona_ciudad, '')) <= 60  AND char_length(coalesce(persona_estado, '')) <= 30
  AND (proyecto_pais IS NULL OR proyecto_pais IN ('MX', 'US'))
  AND (proyecto_fuente IS NULL OR proyecto_fuente IN ('elegida', 'ubicacion', 'zona_horaria', 'odoo_planta', 'platica', 'persona'))
  AND (persona_fuente IS NULL OR persona_fuente IN ('elegida', 'ubicacion', 'zona_horaria'))
  AND conceptualizador.sin_coordenadas(proyecto_ciudad) AND conceptualizador.sin_coordenadas(proyecto_estado)
  AND conceptualizador.sin_coordenadas(persona_ciudad)  AND conceptualizador.sin_coordenadas(persona_estado));

ALTER TABLE conceptualizador.cambio_sesion DROP CONSTRAINT IF EXISTS cambio_sesion_tipo_check;
ALTER TABLE conceptualizador.cambio_sesion ADD CONSTRAINT cambio_sesion_tipo_check
  CHECK (tipo IN ('renombrar','archivar','desarchivar','fijar','desfijar','prueba','no_prueba','empresa','ciudad','modo'));

ALTER TABLE conceptualizador.evento DROP CONSTRAINT IF EXISTS evento_tipo_check;
ALTER TABLE conceptualizador.evento ADD CONSTRAINT evento_tipo_check
  CHECK (tipo IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra','accion','ejecucion','continuacion',
                  'palomeada','prueba','que_falta','ciudad'));

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('ventana_acompanamiento_segundos', '90')
ON CONFLICT (clave) DO NOTHING;

-- ── Funciones de apoyo ─────────────────────────────────────────────────────
-- «te voy a ir pasando todos los datos y al final vamos consolidando» (Montalvo, 14-oct 12:03).
CREATE OR REPLACE FUNCTION conceptualizador.es_consolidar(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $cons$
  -- «te voy pasando las fotos» NO basta: hace falta pedir que las preguntas o el resumen esperen al final.
  SELECT coalesce(lower(p) ~ '(al final|al terminar|al acabar|ya que acabe|cuando acabe|cuando termine)[^.?!]{0,40}(consolid|pregunt)'
               OR lower(p) ~ '(nada m[aá]s anota|solo anota|no me contestes|no me preguntes nada)', false)
$cons$;

-- Ciudad: texto limpio, sin coordenadas. NULL si no sirve.
CREATE OR REPLACE FUNCTION conceptualizador.ciudad_limpia(p text, p_max int) RETURNS text
LANGUAGE sql IMMUTABLE AS $cl$
  SELECT CASE WHEN nullif(btrim(p), '') IS NULL OR NOT conceptualizador.sin_coordenadas(p) THEN NULL
              ELSE left(btrim(regexp_replace(p, '[[:cntrl:]]', ' ', 'g')), p_max) END
$cl$;

-- ¿El objeto de ciudad trae coordenadas? (para rechazar antes de crear nada)
CREATE OR REPLACE FUNCTION conceptualizador.trae_coordenadas(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $tc$
  SELECT coalesce(p IS NOT NULL AND jsonb_typeof(p) = 'object' AND (
           NOT conceptualizador.sin_coordenadas(p->>'ciudad') OR NOT conceptualizador.sin_coordenadas(p->>'estado')
           OR p ? 'lat' OR p ? 'lon' OR p ? 'lng' OR p ? 'latitud' OR p ? 'longitud'), false)
$tc$;

-- ── API de la suite ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $api7$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_modo  text := p->>'modo';
  v_c     conceptualizador.caso%ROWTYPE;
  v_r     jsonb;
  v_n     int;
  v_pro   jsonb := p->'datos'->'proyecto';
  v_per   jsonb := p->'datos'->'persona';
  v_cid   uuid;
  v_ciu   text;
  v_est   text;
  v_pais  text;
  v_fte   text;
  v_ev    bigint;
  v_trab  bigint;
  v_acuse text;
BEGIN
  IF v_modo NOT IN ('nueva','enviar','ciudad','que_falta') THEN
    RETURN conceptualizador.api_suite_0006(p);
  END IF;

  IF v_modo = 'nueva' THEN
    -- Las coordenadas se rechazan ANTES de crear nada.
    IF conceptualizador.trae_coordenadas(v_pro) OR conceptualizador.trae_coordenadas(v_per) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'COORDENADAS_NO',
        'mensaje', 'La ubicación se manda como ciudad, no como coordenadas.');
    END IF;
    v_r := conceptualizador.api_suite_0006(p);
    v_cid := nullif(v_r->>'caso_id','')::uuid;
    IF coalesce((v_r->>'ok')::boolean, false) AND v_cid IS NOT NULL AND NOT coalesce((v_r->>'ya_estaba')::boolean, false)
       AND nullif(p->>'caso_id','') IS NULL THEN
      v_fte := CASE WHEN v_pro->>'fuente' IN ('elegida','ubicacion','zona_horaria','odoo_planta','platica','persona') THEN v_pro->>'fuente' END;
      UPDATE conceptualizador.caso SET
        proyecto_ciudad = conceptualizador.ciudad_limpia(v_pro->>'ciudad', 60),
        proyecto_estado = conceptualizador.ciudad_limpia(v_pro->>'estado', 30),
        proyecto_pais   = CASE WHEN upper(v_pro->>'pais') IN ('MX','US') THEN upper(v_pro->>'pais') END,
        proyecto_fuente = CASE WHEN conceptualizador.ciudad_limpia(v_pro->>'ciudad', 60) IS NULL THEN NULL ELSE v_fte END,
        -- Elegida a mano = confirmada. Prellenada (ubicación, zona horaria) se confirma después.
        proyecto_confirmada_at = CASE WHEN v_fte = 'elegida' AND conceptualizador.ciudad_limpia(v_pro->>'ciudad', 60) IS NOT NULL THEN now() END,
        persona_ciudad  = conceptualizador.ciudad_limpia(v_per->>'ciudad', 60),
        persona_estado  = conceptualizador.ciudad_limpia(v_per->>'estado', 30),
        persona_fuente  = CASE WHEN conceptualizador.ciudad_limpia(v_per->>'ciudad', 60) IS NULL THEN NULL
                               WHEN v_per->>'fuente' IN ('elegida','ubicacion','zona_horaria') THEN v_per->>'fuente' END
       WHERE id = v_cid;
      v_r := v_r || jsonb_build_object('proyecto', (SELECT jsonb_build_object('ciudad', proyecto_ciudad, 'estado', proyecto_estado,
               'pais', proyecto_pais, 'fuente', proyecto_fuente, 'confirmada', proyecto_confirmada_at IS NOT NULL)
               FROM conceptualizador.caso WHERE id = v_cid));
    END IF;
    RETURN v_r;
  END IF;

  IF v_modo = 'enviar' THEN
    v_r := conceptualizador.api_suite_0006(p);
    v_cid := nullif(v_r->>'caso_id','')::uuid;
    -- «Al final consolidamos», escrito: pasa a levantamiento en el acto.
    IF coalesce((v_r->>'ok')::boolean, false) AND v_cid IS NOT NULL AND conceptualizador.es_consolidar(p->>'texto') THEN
      v_r := v_r || conceptualizador.pasar_a_levantamiento(v_cid, v_actor, true);
    END IF;
    RETURN v_r;
  END IF;

  -- ciudad · que_falta: mismos candados de entrada que la 0006.
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
  IF nullif(p->>'ts','') IS NULL OR abs(extract(epoch FROM now()) * 1000 - (p->>'ts')::bigint) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA', 'mensaje', 'La petición es vieja o el reloj del teléfono está desfasado.');
  END IF;
  IF char_length(coalesce(p->>'nonce','')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
  INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se recibió.'); END IF;
  SELECT * INTO v_c FROM conceptualizador.caso WHERE id = nullif(p->>'caso_id','')::uuid FOR UPDATE;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;

  IF v_modo = 'que_falta' THEN
    -- A demanda: cualquiera que pueda escribir en el chat (la base ya validó el token). Cuenta para el tope.
    v_r := conceptualizador.encolar_evento(v_c.id, 'que_falta', NULL, NULL, '{}'::jsonb, v_actor);
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id) || v_r;
  END IF;

  -- ciudad: cambiar o confirmar la del proyecto. Solo el autor o un admin.
  IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYA', 'mensaje', 'Solo quien abrió la sesión, o Esteban, puede cambiar la ciudad del proyecto.');
  END IF;
  IF conceptualizador.trae_coordenadas(v_pro) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'COORDENADAS_NO', 'mensaje', 'La ubicación se manda como ciudad, no como coordenadas.');
  END IF;
  -- Solo confirmar lo que ya hay (la persona tocó «Sí, es ahí»).
  IF coalesce((p->'datos'->>'confirmar')::boolean, false) AND v_pro IS NULL THEN
    IF v_c.proyecto_ciudad IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_CIUDAD'); END IF;
    UPDATE conceptualizador.caso SET proyecto_confirmada_at = coalesce(proyecto_confirmada_at, now()), ultima_actividad_at = now() WHERE id = v_c.id;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'confirmada', true);
  END IF;
  v_ciu := conceptualizador.ciudad_limpia(v_pro->>'ciudad', 60);
  v_est := conceptualizador.ciudad_limpia(v_pro->>'estado', 30);
  v_pais := CASE WHEN upper(v_pro->>'pais') IN ('MX','US') THEN upper(v_pro->>'pais') END;
  IF v_ciu IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CIUDAD_INVALIDA', 'mensaje', 'Escribe la ciudad del proyecto.'); END IF;
  IF v_ciu IS NOT DISTINCT FROM v_c.proyecto_ciudad AND v_est IS NOT DISTINCT FROM v_c.proyecto_estado THEN
    UPDATE conceptualizador.caso SET proyecto_confirmada_at = coalesce(proyecto_confirmada_at, now()) WHERE id = v_c.id;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'ya_estaba', true, 'confirmada', true);
  END IF;
  UPDATE conceptualizador.caso SET proyecto_ciudad = v_ciu, proyecto_estado = v_est, proyecto_pais = coalesce(v_pais, proyecto_pais),
         proyecto_fuente = 'elegida', proyecto_confirmada_at = now(), ultima_actividad_at = now() WHERE id = v_c.id;
  INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues)
  VALUES (v_c.id, v_actor, 'ciudad', nullif(concat_ws(', ', v_c.proyecto_ciudad, v_c.proyecto_estado), ''), concat_ws(', ', v_ciu, v_est));
  -- Si ya hay propuesta o machote, el motor recalcula tiendas, fletes y viáticos: un trabajo.
  -- Si no, nada que recalcular: se anota y el motor la usa cuando le toque.
  IF conceptualizador.propuesta_vigente(v_c.id) IS NOT NULL OR v_c.machote_id IS NOT NULL OR v_c.machote_folio IS NOT NULL THEN
    v_r := conceptualizador.encolar_evento(v_c.id, 'ciudad', NULL, NULL,
             jsonb_build_object('antes', concat_ws(', ', v_c.proyecto_ciudad, v_c.proyecto_estado), 'despues', concat_ws(', ', v_ciu, v_est)), v_actor);
    v_ev := (v_r->>'evento_id')::bigint; v_trab := nullif(v_r->>'trabajo_id','')::bigint;
  END IF;
  v_acuse := 'Proyecto en ' || concat_ws(', ', v_ciu, v_est) || '. ' ||
             CASE WHEN v_trab IS NOT NULL THEN 'Reviso tiendas, fletes y viáticos con esa ciudad.' ELSE 'Busco precios y tiendas de ahí.' END;
  INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (v_c.id, 'motor', 'acuse', v_acuse);
  RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'proyecto', jsonb_build_object('ciudad', v_ciu, 'estado', v_est, 'pais', v_pais),
                            'evento_id', v_ev, 'trabajo_id', v_trab, 'acuse', v_acuse);
END
$api7$;

-- Pasa una sesión de acompañamiento a levantamiento: desde aquí solo se anota hasta «Ya es todo».
-- Lo pendiente de ese caso ya no lo contesta el motor (lo lee todo junto en el disparador).
-- p_acuse: la base escribe el aviso al chat (texto escrito). Desde el motor (nota de voz) es false:
-- el aviso sale como la respuesta del propio trabajo, para que no aparezca dos veces.
DROP FUNCTION IF EXISTS conceptualizador.pasar_a_levantamiento(uuid, text, bigint);
CREATE OR REPLACE FUNCTION conceptualizador.pasar_a_levantamiento(p_caso uuid, p_actor text, p_acuse boolean) RETURNS jsonb
LANGUAGE plpgsql AS $pal$
DECLARE v_n int; v_acuse text;
BEGIN
  UPDATE conceptualizador.caso SET modo = 'levantamiento', ultima_actividad_at = now()
   WHERE id = p_caso AND modo = 'acompanamiento' AND disparado_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('paso_a_levantamiento', false); END IF;
  INSERT INTO conceptualizador.cambio_sesion (caso_id, actor, tipo, antes, despues)
  VALUES (p_caso, coalesce(p_actor, 'motor'), 'modo', 'acompanamiento', 'levantamiento');
  -- Los mensajes que esperaban respuesta ya no la necesitan: quedan en el hilo para el disparador.
  -- El trabajo que lo pidió (si el motor ya lo tomó) lo cierra quien lo tomó.
  UPDATE conceptualizador.trabajo SET estado = 'listo', listo_at = now(), error = 'sin respuesta: pasó a levantamiento'
   WHERE caso_id = p_caso AND tipo = 'mensaje' AND estado = 'pendiente';
  v_acuse := 'Va. Desde aquí solo anoto, sin contestarte, hasta que me digas «Ya es todo». Si quieres ver qué falta, toca «¿Qué me falta?».';
  IF p_acuse THEN
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (p_caso, 'motor', 'acuse', v_acuse);
  END IF;
  RETURN jsonb_build_object('paso_a_levantamiento', true, 'acuse_modo', v_acuse);
END
$pal$;

-- ── API del motor ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot7$
DECLARE
  v_motor  text := p->>'motor';
  v_modo   text := p->>'modo';
  v_id     bigint := nullif(p->>'trabajo_id','')::bigint;
  v_max    int;
  v_r      jsonb;
  v_lease  interval := make_interval(secs => conceptualizador.cfg('lease_segundos'));
  v_vent   interval := make_interval(secs => coalesce(conceptualizador.cfg('ventana_acompanamiento_segundos'), 0));
  t        conceptualizador.trabajo%ROWTYPE;
BEGIN
  IF v_modo NOT IN ('siguiente','pasa_levantamiento') THEN
    RETURN conceptualizador.api_motor_0006(p);
  END IF;
  IF v_motor NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;

  IF v_modo = 'siguiente' THEN
    -- Igual que la 0005 (hasta `motor_paralelo`, uno por caso, el más viejo), más la VENTANA DE SILENCIO:
    -- en acompañamiento sin disparar, un caso cuya persona escribió hace menos de 90 s todavía no se entrega,
    -- salvo que lo pendiente traiga una pregunta escrita. Así la ráfaga entera sale en UN trabajo.
    v_max := least(greatest(coalesce(nullif(p->>'max','')::int, 1), 1), conceptualizador.cfg('motor_paralelo'));
    SELECT coalesce(jsonb_agg(jsonb_build_object('trabajo_id', x.id, 'tipo', x.tipo, 'caso_id', x.caso_id) ORDER BY x.id), '[]'::jsonb)
      INTO v_r
      FROM (SELECT * FROM (
              SELECT DISTINCT ON (t2.caso_id) t2.id, t2.tipo, t2.caso_id
                FROM conceptualizador.trabajo t2
                JOIN conceptualizador.caso k ON k.id = t2.caso_id
               WHERE t2.lote_de IS NULL AND t2.intentos < t2.max_intentos
                 AND (t2.estado = 'pendiente'
                      OR (t2.estado = 'tomado' AND greatest(t2.tomado_at, coalesce(t2.avance_at, t2.tomado_at)) < now() - v_lease))
                 AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo o
                                  WHERE o.caso_id = t2.caso_id AND o.id <> t2.id AND o.estado = 'tomado'
                                    AND greatest(o.tomado_at, coalesce(o.avance_at, o.tomado_at)) >= now() - v_lease)
                 AND NOT (t2.tipo = 'mensaje' AND t2.estado = 'pendiente' AND k.modo = 'acompanamiento' AND k.disparado_at IS NULL
                          AND EXISTS (SELECT 1 FROM conceptualizador.mensaje m
                                       WHERE m.caso_id = t2.caso_id AND m.rol = 'usuario' AND m.created_at > now() - v_vent)
                          AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo q JOIN conceptualizador.mensaje mq ON mq.id = q.mensaje_id
                                           WHERE q.caso_id = t2.caso_id AND q.estado = 'pendiente' AND q.tipo = 'mensaje'
                                             AND mq.texto ~ '[?¿]'))
               ORDER BY t2.caso_id, t2.id) y
            ORDER BY y.id LIMIT v_max) x;
    RETURN jsonb_build_object('ok', true, 'trabajos', v_r,
      'trabajo_id', v_r->0->'trabajo_id', 'tipo', v_r->0->>'tipo', 'caso_id', v_r->0->>'caso_id');
  END IF;

  -- pasa_levantamiento: el motor la pide con la TRANSCRIPCIÓN de una nota de voz. La base decide con la
  -- misma regla que el texto escrito (es_consolidar). Solo el motor que tiene tomado el trabajo.
  SELECT * INTO t FROM conceptualizador.trabajo WHERE id = v_id;
  IF t.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_EXISTE'); END IF;
  IF t.tomado_por IS DISTINCT FROM v_motor OR t.estado <> 'tomado' THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO'); END IF;
  IF NOT conceptualizador.es_consolidar(p->>'texto') THEN
    RETURN jsonb_build_object('ok', true, 'paso_a_levantamiento', false, 'motivo', 'la frase no lo pide');
  END IF;
  RETURN jsonb_build_object('ok', true) || conceptualizador.pasar_a_levantamiento(t.caso_id, 'motor', false);
END
$mot7$;

-- ── Permisos ───────────────────────────────────────────────────────────────
ALTER FUNCTION conceptualizador.api_suite(jsonb)      SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb)      SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0006(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0006(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA conceptualizador FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0006(jsonb), conceptualizador.api_motor_0006(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb)    TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_respaldo(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb)  TO conceptualizador_app;
