-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0037 · V1.63b (fts-conceptualizador#12): libro de reglas, procura N1, secciones, oportunidad al nacer y
-- el aviso de consumo de personas
--
-- Va de Esteban del 23-oct-2026 17:08 CST («construir la V1.63b y desplegarla hoy mismo»). Interruptores nuevos, todos en '0':
--   libro_v163        · el motor carga el libro de reglas único (conocimiento/comun/libro-de-reglas.json) en `contexto` y corre
--                       sus comprobaciones antes de entregar; una regla que aplica y no se cumple queda como «sabida y no usada».
--   procura_v163      · D2: N1 = compra en Odoo de 3 meses o menos (antes 12); lo de 4 a 12 meses es referencia N2 con su folio, y
--                       la solicitud a proveedores sale agrupada por proveedor (rfq.md del caso). Nadie la manda sola.
--   secciones_v163    · la vista ejecutiva trae la revisión por secciones (definición de conceptos, cosas por definir y contador).
--   oportunidad_nace_v163 · P9b: el motor propone ligar la oportunidad abierta del cliente o crear una al nacer el caso. NO escribe en
--                       Odoo: la crea el mismo `orden-odoo` de siempre, al primer borrador (R6, sin avisos).
--   aviso_personas_v163 · Esteban 23-oct 17:05 CST: correo cuando el consumo de PERSONAS pase el umbral de la semana (90 M por
--                       omisión, `aviso_personas_semana` en config), con el desglose por persona y por caso. Es AVISO, no freno.
-- Apagado, todo sale igual que con la 0036. Reversa: reversas/037_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in37$
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
               'barra_v161',
               'cuadre_v162','tarjetas_v162','oportunidad_v162','n0_v162','ruido_v162',
               'guardar_agente_v162b','todo_hecho_v162b','pdf_v162b','revision_v162b',
               'barrido_v162',
               'pdf_menu_v163','flujo_v163','pdf_v163','vendedor_v163','rechazos_v163','una_orden_v163',
               'freno_robot_v163','oportunidad_v163','machote_n5_v163',
               'libro_v163','procura_v163','secciones_v163','oportunidad_nace_v163','aviso_personas_v163']
$in37$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- El umbral del aviso (ponderado, la misma unidad del freno). Holgado: Esteban lo fijó en 90 M el 23-oct.
INSERT INTO conceptualizador.config (clave, valor) VALUES ('aviso_personas_semana', '90000000')
ON CONFLICT (clave) DO NOTHING;

-- ── el consumo de PERSONAS de la semana, por persona (autor del caso) y por caso. Lo usa la alarma y el panel. ──
CREATE OR REPLACE FUNCTION conceptualizador.consumo_personas_semana() RETURNS jsonb
LANGUAGE sql STABLE AS $cp37$
  WITH lun AS (SELECT conceptualizador.dia_uso(now()) - (extract(isodow FROM conceptualizador.dia_uso(now()))::int - 1) AS d),
  reg AS (
    -- la persona = quien escribió el mensaje que se atendió (consumo.actor); si no quedó, el dueño del caso
    SELECT r.caso_id, r.carpeta, r.ponderado, coalesce(nullif(c.actor, ''), k.autor, '?') AS autor
      FROM conceptualizador.consumo_registro r LEFT JOIN conceptualizador.caso k ON k.id = r.caso_id
      LEFT JOIN conceptualizador.consumo c ON c.trabajo_id = r.trabajo_id, lun
     WHERE r.dia >= lun.d AND NOT r.proactivo)
  SELECT jsonb_build_object(
    'semana_desde', (SELECT d FROM lun),
    'umbral', coalesce(conceptualizador.cfg('aviso_personas_semana'), 90000000),
    'total', (SELECT coalesce(sum(ponderado), 0) FROM reg),
    'por_persona', (SELECT coalesce(jsonb_agg(jsonb_build_object('persona', autor, 'ponderado', p) ORDER BY p DESC), '[]'::jsonb)
                      FROM (SELECT autor, sum(ponderado) AS p FROM reg GROUP BY autor) x),
    'por_caso', (SELECT coalesce(jsonb_agg(jsonb_build_object('caso', carpeta, 'persona', autor, 'ponderado', p) ORDER BY p DESC), '[]'::jsonb)
                   FROM (SELECT carpeta, autor, sum(ponderado) AS p FROM reg GROUP BY carpeta, autor ORDER BY sum(ponderado) DESC LIMIT 8) y))
$cp37$;
ALTER FUNCTION conceptualizador.consumo_personas_semana() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.consumo_personas_semana() FROM PUBLIC;

-- ── alarma `personas_semana`: el consumo de personas pasó el umbral. Una por semana (la clave es el lunes); el correo de
--    alarmas la manda, con su recordatorio, y la cierra el lunes siguiente. No frena nada. ──
DO $ren37a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0037prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0037prev;
  END IF;
END
$ren37a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am37$
DECLARE
  v_r   jsonb := conceptualizador.alarmas_motor_0037prev(p_llave);
  v_c   jsonb;
  v_tot bigint;
  v_umb bigint;
  v_txt text;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('aviso_personas_v163') THEN RETURN v_r; END IF;
  v_c := conceptualizador.consumo_personas_semana();
  v_tot := (v_c->>'total')::bigint;
  v_umb := (v_c->>'umbral')::bigint;
  IF v_tot > v_umb THEN
    v_txt := 'El consumo de personas de la semana (desde el lunes ' || (v_c->>'semana_desde') || ') va en ' ||
             round(v_tot / 1e6, 1) || ' M, arriba del aviso de ' || round(v_umb / 1e6, 1) || ' M. Por persona: ' ||
             (SELECT string_agg(e->>'persona' || ' ' || round((e->>'ponderado')::numeric / 1e6, 1) || ' M', ', ')
                FROM jsonb_array_elements(v_c->'por_persona') e) ||
             '. Casos que más gastan: ' ||
             (SELECT string_agg(coalesce(regexp_replace(e->>'caso', '^casos/', ''), '?') || ' ' || round((e->>'ponderado')::numeric / 1e6, 1) || ' M', '; ')
                FROM (SELECT e FROM jsonb_array_elements(v_c->'por_caso') e LIMIT 5) z) || '.';
    v_r := v_r || conceptualizador.alarma('personas_semana', v_c->>'semana_desde', (v_c->>'semana_desde')::date::timestamptz,
      v_txt,
      'Es un aviso, no un freno: las personas se siguen atendiendo completas. Mira si un caso se trabó en un ciclo (mismo botón, misma vista) y, si el gasto es real, decide si subes el umbral en el panel (aviso_personas_semana).',
      'personas-semana', jsonb_build_object('consumo', v_c));
  END IF;
  RETURN v_r;
END
$am37$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0037prev(text) FROM PUBLIC;

-- ── C · revisión por secciones (`secciones_v163`): qué secciones dio por revisadas el dueño, y en qué versión del machote ──
CREATE TABLE IF NOT EXISTS conceptualizador.seccion_revision (
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  seccion     text        NOT NULL,
  version     int,
  por         text        NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caso_id, seccion)
);

DO $ren37s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0037prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0037prev;
  END IF;
END
$ren37s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui37$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_c     conceptualizador.caso%ROWTYPE;
  v_ts    bigint;
  v_n     int;
  v_sec   text;
  v_r     jsonb;
BEGIN
  -- La sección se marca (o se desmarca) al tocarla: sin trabajo del motor y sin tope.
  IF v_modo = 'evento' AND p->>'tipo' = 'seccion_revisada' THEN
    IF NOT conceptualizador.prendido('secciones_v163') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'secciones_v163');
    END IF;
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
    IF conceptualizador.es_lector(v_actor) THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
    v_ts := conceptualizador.a_entero(p->>'ts');
    IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA');
    END IF;
    IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA'); END IF;
    SELECT * INTO v_c FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
    IF v_c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF v_c.autor <> v_actor AND NOT conceptualizador.es_admin(v_actor) AND NOT conceptualizador.puede_mover(v_actor, v_c.autor) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'Solo el dueño del caso (o quien él autorizó) revisa sus secciones.');
    END IF;
    v_sec := left(btrim(coalesce(v_d->>'seccion', '')), 120);
    IF v_sec = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_SECCION'); END IF;
    IF coalesce(v_d->>'revisada', 'true') = 'false' THEN
      DELETE FROM conceptualizador.seccion_revision WHERE caso_id = v_c.id AND seccion = v_sec;
    ELSE
      INSERT INTO conceptualizador.seccion_revision (caso_id, seccion, version, por)
      VALUES (v_c.id, v_sec, CASE WHEN coalesce(v_d->>'version', '') ~ '^[0-9]{1,6}\Z' THEN (v_d->>'version')::int END, v_actor)
      ON CONFLICT (caso_id, seccion) DO UPDATE SET version = excluded.version, por = excluded.por, at = now();
    END IF;
    RETURN jsonb_build_object('ok', true, 'caso_id', v_c.id, 'trabajo_id', NULL,
      'secciones_revisadas', (SELECT coalesce(jsonb_agg(jsonb_build_object('seccion', s.seccion, 'version', s.version, 'por', s.por, 'at', s.at) ORDER BY s.at), '[]'::jsonb)
                                FROM conceptualizador.seccion_revision s WHERE s.caso_id = v_c.id));
  END IF;

  v_r := conceptualizador.api_suite_0037prev(p);
  IF v_modo = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND conceptualizador.prendido('secciones_v163') THEN
    v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object('secciones_revisadas',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('seccion', s.seccion, 'version', s.version, 'por', s.por, 'at', s.at) ORDER BY s.at), '[]'::jsonb)
         FROM conceptualizador.seccion_revision s WHERE s.caso_id = conceptualizador.a_uuid(p->>'caso_id'))));
  ELSIF v_modo = 'config' AND coalesce((v_r->>'ok')::boolean, false) AND v_r ? 'gasto' AND conceptualizador.prendido('aviso_personas_v163') THEN
    v_r := jsonb_set(v_r, ARRAY['gasto'], (v_r->'gasto') || jsonb_build_object('personas_semana', conceptualizador.consumo_personas_semana()));
  END IF;
  RETURN v_r;
END
$sui37$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0037prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0037prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0037prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;

-- ── P9b (`oportunidad_nace_v163`) · la oportunidad en Odoo al nacer el caso. Lo llama conceptualizador/oportunidad-nace (camino
--    del motor, credencial conceptualizador_app). Leer dice si toca crearla; guardar la deja en el caso. Nunca pisa una oportunidad
--    que el caso ya tenga ni una elección de la persona. ──
CREATE OR REPLACE FUNCTION conceptualizador.oportunidad_nace_leer(p_caso uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $onl37$
DECLARE
  k  conceptualizador.caso%ROWTYPE;
  v  text;
BEGIN
  IF NOT conceptualizador.prendido('oportunidad_nace_v163') THEN RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO'); END IF;
  SELECT * INTO k FROM conceptualizador.caso WHERE id = p_caso;
  IF k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
  IF k.demo THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_DEMO'); END IF;
  IF k.estado <> 'abierto' THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_ABIERTO', 'estado', k.estado); END IF;
  IF k.oportunidad_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'YA_TIENE_OPORTUNIDAD', 'oportunidad_id', k.oportunidad_id); END IF;
  IF k.oportunidad_elegida IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'YA_ELEGIDA', 'oportunidad_elegida', k.oportunidad_elegida); END IF;
  IF k.cliente_odoo_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_CLIENTE'); END IF;
  SELECT valor INTO v FROM conceptualizador.config WHERE clave = 'vendedor_odoo:' || k.autor;
  RETURN jsonb_build_object('ok', true, 'caso_id', k.id, 'carpeta', k.carpeta, 'autor', k.autor,
    'nombre', left(btrim(coalesce(nullif(k.titulo_auto, ''), k.titulo)), 240), 'cliente_odoo_id', k.cliente_odoo_id,
    'empresa_id', coalesce(k.empresa_id, 1), 'vendedor_odoo', CASE WHEN coalesce(v, '') ~ '^[1-9][0-9]{0,8}\Z' THEN v::int END);
END
$onl37$;
ALTER FUNCTION conceptualizador.oportunidad_nace_leer(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;

CREATE OR REPLACE FUNCTION conceptualizador.oportunidad_nace_guardar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ong37$
DECLARE
  v_id  int := CASE WHEN coalesce(p->>'oportunidad_id', '') ~ '^[1-9][0-9]{0,9}\Z' THEN (p->>'oportunidad_id')::int END;
  v_c   uuid := conceptualizador.a_uuid(p->>'caso_id');
  v_n   int;
BEGIN
  IF NOT conceptualizador.prendido('oportunidad_nace_v163') THEN RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO'); END IF;
  IF v_c IS NULL OR v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'DATOS_INCOMPLETOS'); END IF;
  UPDATE conceptualizador.caso SET oportunidad_id = v_id,
         oportunidad_elegida = jsonb_build_object('modo', 'crear', 'id', v_id, 'nombre', left(coalesce(p->>'nombre', ''), 240), 'creada', true,
                                                  'por', 'agente', 'at', now(), 'v163', 'oportunidad_nace')
   WHERE id = v_c AND oportunidad_id IS NULL AND oportunidad_elegida IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n = 1, 'guardada', v_n = 1, 'oportunidad_id', v_id, 'error', CASE WHEN v_n = 1 THEN NULL ELSE 'YA_TENIA' END);
END
$ong37$;
ALTER FUNCTION conceptualizador.oportunidad_nace_guardar(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.oportunidad_nace_leer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.oportunidad_nace_guardar(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.oportunidad_nace_leer(uuid) TO conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.oportunidad_nace_guardar(jsonb) TO conceptualizador_app;
