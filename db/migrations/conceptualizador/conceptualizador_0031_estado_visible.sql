-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0031 · V1.61 (fts-conceptualizador#12): estado visible
--
-- Un interruptor nuevo, `barra_v161`, en '0'. Decide qué EXPONE el servidor (y qué pinta la pantalla). Apagado, `casos`,
-- `hilo`, `api_cierres`, las alarmas y el panel salen IGUAL que con la 0030 (pruebas/sql-0031.sh lo compara).
--
--   1 · Cuántos van antes. Con el interruptor, `agente_estado` en `cola` trae `antes`: los trabajos que `siguiente` (db 007,
--       la misma regla: uno por caso, el más viejo, sin otro tomado vivo en su caso, sin la ventana de silencio) va a dar
--       ANTES que el de este caso. Y en `trabajando` trae `marcas`: la hora a la que el proceso entró a cada paso, para que
--       la barra diga cuánto tardó cada uno. Las marcas se guardan SIEMPRE (un disparador en `proceso`, aditivo); el
--       interruptor solo decide si salen.
--   2 · Orden del caso en `cancel` = Perdida. `cerrado_por` admite `orden_cancelada`. `api_cierres` en `candidatos` dice si
--       el interruptor está prendido (`orden_cancelada_v161`), y en `aplicar` cierra con ese motivo y un mensaje en el chat
--       (solo prendido; apagado lo ignora como hoy). La regla de etapa (0030) ya lo cuenta como Perdida. NO el won del lead.
--   3 · Medición y alarma. El panel (`config`) trae `barra_v161_24h`: espera y trabajo de los trabajos de personas que se
--       entregaron en 24 h, por motor (principal y respaldo, para compararlos), y los pasos que se publicaron (la pantalla
--       marca los que su diccionario no conoce). Alarma `fila_larga`: un trabajo de una persona lleva más de
--       `alarma_fila_min` (10) min en fila con el principal activo (solo con el interruptor; viaja como las demás alarmas).
--
--   4 · Huella de precios: `orden_v161()` le dice a orden-odoo (credencial comercial_app) si el interruptor está prendido.
--   5 · El guardado del robot (api_motor `publicar` con `machote_guardado`) queda como `crear_machote` hecha (solo prendido).
--
-- Lo que NO cambia: `siguiente`, `tomar`, ningún interruptor existente; api_motor solo agrega lo del punto 5. Reversa: reversas/031_reversa.sql.
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o
-- dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in31$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157',
               'regla15_v157','pago_decreto','horario_autor','tarjeta_v157','correo_v157','vista_cliente',
               'piso_v158','estado_odoo_v158','niveles_v158','menu_vista_v158','actualizar_v158','ligas_v158',
               'delegacion_v159','vendedor_v159','bom_observado_v159','tarjetas_v159',
               'lista_v160','chat_limpio_v160','seleccion_v160',
               'barra_v161']
$in31$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('alarma_fila_min', '10') ON CONFLICT (clave) DO NOTHING;

-- ── 1a · la hora de cada paso del proceso ──────────────────────────────────────────────────
ALTER TABLE conceptualizador.proceso ADD COLUMN IF NOT EXISTS marcas jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION conceptualizador.proceso_marca() RETURNS trigger
LANGUAGE plpgsql AS $pm31$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.marcas := jsonb_build_array(jsonb_build_object('i', NEW.paso_i, 'paso', left(NEW.paso, 80), 'at', NEW.inicio));
  ELSIF NEW.fin IS NULL AND (NEW.paso_i IS DISTINCT FROM OLD.paso_i
                              OR split_part(coalesce(NEW.paso, ''), ' · ', 1) IS DISTINCT FROM split_part(coalesce(OLD.paso, ''), ' · ', 1))
        AND jsonb_array_length(coalesce(OLD.marcas, '[]'::jsonb)) < 40 THEN
    NEW.marcas := coalesce(OLD.marcas, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('i', NEW.paso_i, 'paso', left(NEW.paso, 80), 'at', now()));
  END IF;
  RETURN NEW;
END
$pm31$;
DROP TRIGGER IF EXISTS proceso_marca ON conceptualizador.proceso;
CREATE TRIGGER proceso_marca BEFORE INSERT OR UPDATE ON conceptualizador.proceso
  FOR EACH ROW EXECUTE FUNCTION conceptualizador.proceso_marca();

-- ── 1b · cuántos van antes: la regla de `siguiente` (db 007) ───────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.trabajos_antes(p_caso uuid) RETURNS int
LANGUAGE sql STABLE AS $ta31$
  WITH lease AS (SELECT make_interval(secs => coalesce(conceptualizador.cfg('lease_segundos'), 600)) AS l,
                        make_interval(secs => coalesce(conceptualizador.cfg('ventana_acompanamiento_segundos'), 90)) AS v),
  elegibles AS (
    SELECT DISTINCT ON (t2.caso_id) t2.id, t2.caso_id
      FROM conceptualizador.trabajo t2
      JOIN conceptualizador.caso k ON k.id = t2.caso_id, lease
     WHERE t2.lote_de IS NULL AND t2.intentos < t2.max_intentos
       AND (t2.estado = 'pendiente'
            OR (t2.estado = 'tomado' AND greatest(t2.tomado_at, coalesce(t2.avance_at, t2.tomado_at)) < now() - lease.l))
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo o
                        WHERE o.caso_id = t2.caso_id AND o.id <> t2.id AND o.estado = 'tomado'
                          AND greatest(o.tomado_at, coalesce(o.avance_at, o.tomado_at)) >= now() - lease.l)
       AND NOT (t2.tipo = 'mensaje' AND t2.estado = 'pendiente' AND k.modo = 'acompanamiento' AND k.disparado_at IS NULL
                AND EXISTS (SELECT 1 FROM conceptualizador.mensaje m
                             WHERE m.caso_id = t2.caso_id AND m.rol = 'usuario' AND m.created_at > now() - lease.v)
                AND NOT EXISTS (SELECT 1 FROM conceptualizador.trabajo q JOIN conceptualizador.mensaje mq ON mq.id = q.mensaje_id
                                 WHERE q.caso_id = t2.caso_id AND q.estado = 'pendiente' AND q.tipo = 'mensaje'
                                   AND mq.texto ~ '[?¿]'))
     ORDER BY t2.caso_id, t2.id),
  mio AS (SELECT min(t.id) AS id FROM conceptualizador.trabajo t
           WHERE t.caso_id = p_caso AND t.lote_de IS NULL AND t.estado = 'pendiente')
  SELECT CASE WHEN (SELECT id FROM mio) IS NULL THEN NULL
              ELSE (SELECT count(*)::int FROM elegibles e WHERE e.caso_id <> p_caso AND e.id < (SELECT id FROM mio)) END
$ta31$;

-- ── 1c · agente_estado con lo de la barra (solo prendido) ──────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.agente_barra(v jsonb, p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ab31$
  SELECT CASE
    WHEN v IS NULL OR NOT conceptualizador.prendido('barra_v161') THEN v
    WHEN v->>'estado' = 'cola' THEN v || jsonb_build_object('antes', conceptualizador.trabajos_antes(p_caso),
           'paralelo', coalesce(conceptualizador.cfg('motor_paralelo'), 1))
    WHEN v->>'estado' = 'trabajando' AND (v->>'proceso_id') ~ '^[0-9]{1,18}\Z' THEN
      v || jsonb_build_object('marcas', coalesce((SELECT pr.marcas FROM conceptualizador.proceso pr WHERE pr.id = (v->>'proceso_id')::bigint), '[]'::jsonb),
                              'creado', (SELECT t.created_at FROM conceptualizador.trabajo t JOIN conceptualizador.proceso pr ON pr.trabajo_id = t.id
                                          WHERE pr.id = (v->>'proceso_id')::bigint))
    ELSE v END
$ab31$;

CREATE OR REPLACE FUNCTION conceptualizador.agente_estado(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $agd31$
  SELECT CASE WHEN conceptualizador.prendido('estados_reales') THEN conceptualizador.agente_barra(conceptualizador.agente_estado_v152(p_caso), p_caso)
              ELSE conceptualizador.agente_estado_0013(p_caso) END
$agd31$;

-- ── 2 · orden del caso en cancel = Perdida ─────────────────────────────────────────────────
ALTER TABLE conceptualizador.caso DROP CONSTRAINT IF EXISTS caso_cerrado_por_check;
ALTER TABLE conceptualizador.caso ADD CONSTRAINT caso_cerrado_por_check
  CHECK (cerrado_por IS NULL OR cerrado_por IN ('manual','orden_confirmada','oportunidad_perdida','sin_machote','motor','orden_cancelada'));

DO $ren31c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_cierres_0031prev') THEN
    ALTER FUNCTION conceptualizador.api_cierres(jsonb) RENAME TO api_cierres_0031prev;
  END IF;
END
$ren31c$;

CREATE OR REPLACE FUNCTION conceptualizador.api_cierres(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cie31$
DECLARE
  x      jsonb;
  c      conceptualizador.caso%ROWTYPE;
  v_on   boolean := conceptualizador.prendido('barra_v161');
  v_rest jsonb := '[]'::jsonb;
  v_hech jsonb := '[]'::jsonb;
  v_r    jsonb;
  v_so   text;
BEGIN
  IF coalesce(p->>'modo', 'candidatos') = 'candidatos' THEN
    v_r := conceptualizador.api_cierres_0031prev(p);
    IF v_on AND coalesce((v_r->>'ok')::boolean, false) THEN v_r := v_r || jsonb_build_object('orden_cancelada_v161', true); END IF;
    RETURN v_r;
  END IF;
  IF p->>'modo' <> 'aplicar' OR NOT v_on THEN RETURN conceptualizador.api_cierres_0031prev(p); END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'cierres', '[]'::jsonb)) LOOP
    IF x->>'accion' = 'cerrar' AND x->>'motivo' = 'orden_cancelada' THEN
      SELECT * INTO c FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(x->>'caso_id') FOR UPDATE;
      -- La orden que se canceló tiene que ser LA DEL CASO (no otra de la oportunidad).
      CONTINUE WHEN c.id IS NULL OR c.estado NOT IN ('abierto','enviada') OR c.orden_id IS NULL
                 OR coalesce(x->'datos'->>'orden_id', '') !~ '^[0-9]{1,12}\Z' OR (x->'datos'->>'orden_id')::bigint <> c.orden_id;
      v_so := nullif(left(coalesce(x->'datos'->>'orden', ''), 40), '');
      UPDATE conceptualizador.caso SET estado = 'cerrado', cerrado_at = now(), cerrado_por = 'orden_cancelada',
             cierre_motivo = left('orden ' || coalesce(v_so, c.orden_id::text) || ' cancelada en Odoo', 300) WHERE id = c.id;
      INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (c.id, 'sistema', 'cierres',
        'La orden ' || coalesce(v_so, c.orden_id::text) || ' se canceló en Odoo: cierro la cotización como perdida. Si fue un error, reábrela y escríbeme qué pasó.');
      v_r := conceptualizador.encolar_evento(c.id, 'cierra', NULL, 'orden_cancelada', coalesce(x->'datos', '{}'::jsonb), 'cierres');
      v_hech := v_hech || jsonb_build_object('caso_id', c.id, 'hecho', 'cerrado', 'motivo', 'orden_cancelada');
    ELSE
      v_rest := v_rest || jsonb_build_array(x);
    END IF;
  END LOOP;
  v_r := conceptualizador.api_cierres_0031prev(jsonb_set(p, ARRAY['cierres'], v_rest));
  IF coalesce((v_r->>'ok')::boolean, false) THEN
    v_r := jsonb_set(v_r, ARRAY['aplicados'], coalesce(v_r->'aplicados', '[]'::jsonb) || v_hech);
  END IF;
  RETURN v_r;
END
$cie31$;

-- ── 3a · alarma: un trabajo de una persona lleva más de N min en fila ──────────────────────
DO $ren31a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0031prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0031prev;
  END IF;
END
$ren31a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am31$
DECLARE
  v_r   jsonb := conceptualizador.alarmas_motor_0031prev(p_llave);
  v_min int := coalesce(conceptualizador.cfg('alarma_fila_min'), 10);
  v_t   record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('barra_v161')
     OR NOT coalesce((conceptualizador.estado_motor()->>'principal_vivo')::boolean, false) THEN RETURN v_r; END IF;
  SELECT t.id, t.created_at, k.carpeta INTO v_t
    FROM conceptualizador.trabajo t JOIN conceptualizador.caso k ON k.id = t.caso_id
   WHERE t.estado = 'pendiente' AND t.lote_de IS NULL AND t.tipo = 'mensaje' AND NOT k.demo
     AND t.created_at < now() - make_interval(mins => v_min) AND t.created_at > now() - interval '12 hours'
     AND NOT (k.modo = 'levantamiento' AND k.disparado_at IS NULL)
   ORDER BY t.id LIMIT 1;
  IF v_t.id IS NOT NULL THEN
    v_r := v_r || conceptualizador.alarma('fila_larga', v_t.id::text, v_t.created_at,
      'Un mensaje de una persona lleva más de ' || v_min || ' min esperando turno con el motor principal activo (trabajo ' || v_t.id || ').',
      'Abre la sesión «Motor Conceptualizador» que tiene el arriendo: si espera un permiso, apruébalo; si tiene 3 trabajos largos, deja que terminen. La persona ve su barra «Esperando turno» con el segundero.',
      'fila-larga', jsonb_build_object('trabajo_id', v_t.id, 'caso', v_t.carpeta));
  END IF;
  RETURN v_r;
END
$am31$;

-- ── 3b · el panel: espera y trabajo por motor, y los pasos publicados (24 h) ───────────────
DO $ren31s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0031prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0031prev;
  END IF;
END
$ren31s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui31$
DECLARE
  v_r jsonb := conceptualizador.api_suite_0031prev(p);
BEGIN
  IF p->>'modo' = 'config' AND conceptualizador.prendido('barra_v161') AND coalesce((v_r->>'ok')::boolean, false) THEN
    v_r := v_r || jsonb_build_object('barra_v161_24h', jsonb_build_object(
      'por_motor', coalesce((
        SELECT jsonb_object_agg(q.motor, jsonb_build_object('n', q.n, 'espera_p50_s', q.e50, 'espera_max_s', q.emax,
                                                            'trabajo_p50_s', q.t50, 'trabajo_max_s', q.tmax))
          FROM (SELECT t.tomado_por AS motor, count(*) AS n,
                       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.tomado_at - t.created_at)))::int AS e50,
                       round(max(extract(epoch FROM t.tomado_at - t.created_at)))::int AS emax,
                       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t.listo_at - t.tomado_at)))::int AS t50,
                       round(max(extract(epoch FROM t.listo_at - t.tomado_at)))::int AS tmax
                  FROM conceptualizador.trabajo t JOIN conceptualizador.caso k ON k.id = t.caso_id
                 WHERE t.estado = 'listo' AND t.tipo = 'mensaje' AND t.lote_de IS NULL AND NOT k.demo
                   AND t.tomado_at IS NOT NULL AND t.listo_at > now() - interval '24 hours'
                   AND t.tomado_por IN ('principal','respaldo')
                 GROUP BY t.tomado_por) q), '{}'::jsonb),
      'pasos', coalesce((
        SELECT jsonb_object_agg(q.paso, q.n) FROM (
          SELECT split_part(m->>'paso', ' · ', 1) AS paso, count(*) AS n
            FROM conceptualizador.proceso pr, jsonb_array_elements(pr.marcas) m
           WHERE pr.inicio > now() - interval '24 hours' AND coalesce(m->>'paso', '') <> ''
           GROUP BY 1 ORDER BY 2 DESC LIMIT 40) q), '{}'::jsonb),
      'en_fila_ahora', (SELECT count(*) FROM conceptualizador.trabajo t WHERE t.estado = 'pendiente' AND t.lote_de IS NULL))
    );
  END IF;
  RETURN v_r;
END
$sui31$;

-- ── 4 · huella de precios (#12 B.7): lo que orden-odoo necesita saber, sin abrirle la tabla config ─────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.orden_v161() RETURNS jsonb
LANGUAGE sql STABLE AS $ov31$
  SELECT jsonb_build_object('barra', conceptualizador.prendido('barra_v161'))
$ov31$;
ALTER FUNCTION conceptualizador.orden_v161() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v161() FROM PUBLIC;
DO $gr31$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_v161() TO comercial_app;
  END IF;
END
$gr31$;

-- ── 5 · el guardado del robot queda como `crear_machote` hecha (#12 B.7) ────────────────────────────────────────────────
-- La pasada de avance que sube una versión nueva del machote la manda en `publicar` (machote_guardado: id_local, version,
-- folio). Con el interruptor, la base deja la acción hecha para que la pantalla sepa la versión vigente. Apagado, se ignora.
DO $ren31m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0031prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0031prev;
  END IF;
END
$ren31m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot31$
DECLARE
  v_r  jsonb := conceptualizador.api_motor_0031prev(p);
  v_g  jsonb := CASE WHEN jsonb_typeof(p->'machote_guardado') = 'object' THEN p->'machote_guardado' ELSE NULL END;
  v_c  conceptualizador.caso%ROWTYPE;
  v_v  int;
  v_id bigint;
BEGIN
  IF p->>'modo' <> 'publicar' OR v_g IS NULL OR NOT conceptualizador.prendido('barra_v161')
     OR NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
  IF coalesce(v_g->>'version', '') !~ '^[1-9][0-9]{0,5}\Z' OR coalesce(v_g->>'id_local', '') !~ '^M-[0-9A-Za-z_-]{1,40}\Z' THEN
    RETURN v_r || jsonb_build_object('machote_guardado', 'INVALIDO');
  END IF;
  v_v := (v_g->>'version')::int;
  SELECT * INTO v_c FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
  IF v_c.id IS NULL THEN RETURN v_r; END IF;
  -- Solo si sube la versión que la pantalla conoce del MISMO machote (la del último crear_machote hecho).
  IF NOT EXISTS (SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = v_c.id AND a.tipo = 'crear_machote' AND a.estado = 'hecha'
                    AND a.resultado->>'id_local' = v_g->>'id_local')
     OR EXISTS (SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = v_c.id AND a.tipo = 'crear_machote' AND a.estado = 'hecha'
                   AND a.resultado->>'id_local' = v_g->>'id_local' AND (a.resultado->>'version') ~ '^[0-9]{1,6}\Z' AND (a.resultado->>'version')::int >= v_v) THEN
    RETURN v_r || jsonb_build_object('machote_guardado', 'YA_ESTABA');
  END IF;
  INSERT INTO conceptualizador.accion (caso_id, tipo, titulo, datos, estado, resultado, hecha_por, hecha_at)
  VALUES (v_c.id, 'crear_machote', 'Versión ' || v_v || ' guardada por el agente', jsonb_build_object('origen', 'avance', 'pasada', p->>'pasada'), 'hecha',
          jsonb_build_object('machote_id', v_c.machote_id, 'id_local', v_g->>'id_local', 'version', v_v, 'folio', nullif(left(coalesce(v_g->>'folio', ''), 40), ''),
                             'actualizado', true, 'intacto', true, 'por', 'agente',
                             'texto', 'El agente guardó la versión ' || v_v || coalesce(' de ' || nullif(left(coalesce(v_g->>'folio', ''), 40), ''), '') || '.'),
          'motor-avance', now())
  RETURNING id INTO v_id;
  RETURN v_r || jsonb_build_object('machote_guardado', jsonb_build_object('accion_id', v_id, 'version', v_v));
END
$mot31$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0031prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0031prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0031prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── Permisos ───────────────────────────────────────────────────────────────────────────────
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0031prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_cierres(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_cierres_0031prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0031prev(jsonb), conceptualizador.api_cierres_0031prev(jsonb),
                       conceptualizador.alarmas_motor_0031prev(text), conceptualizador.trabajos_antes(uuid),
                       conceptualizador.agente_barra(jsonb, uuid), conceptualizador.proceso_marca() FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0031prev(jsonb), conceptualizador.api_cierres_0031prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_cierres(jsonb) TO conceptualizador_app;
