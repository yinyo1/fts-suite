-- Reversa de conceptualizador_0052 (V1.63g.5): deja la base como con la 0051. Las conjeturas que la 0052 ya cerró como supuesto
-- se quedan cerradas (es lo que pide la D154); para reabrir una, se hace a mano con su id.
DROP FUNCTION IF EXISTS conceptualizador.api_motor(jsonb);
ALTER FUNCTION conceptualizador.api_motor_0052prev(jsonb) RENAME TO api_motor;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
DO $gr52r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$gr52r$;
CREATE OR REPLACE FUNCTION conceptualizador.api_motor_0007(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'conceptualizador', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION conceptualizador.trabajos_antes(p_caso uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in52r$
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
               'libro_v163','procura_v163','secciones_v163','oportunidad_nace_v163','aviso_personas_v163',
               'pdf_unico_v163',
               'fin_semana_v163e',
               'analisis_v163e','tarifas_usa_v163e','deshacer_v163e',
               'borrador_n5_v163e','borrador_robot_v163e',
               'machote_robot_v163e',
               'alarmas_robot_v163e',
               'terminos_robot_v163e','sin_avance_v163e',
               'equipo_estimado_v163e','viaticos_costo_v163e',
               'candados_v163f','supuesto20_v163f','precios_v163f','avance_robot_v163f',
               'voz_visor_v163g',
               'voz_directo_v163g',
               'estimados_v163h','sentido_v163h',
               'no_esperar_v163g4']
$in52r$;
DELETE FROM conceptualizador.config WHERE clave = 'interruptor:superadas_v163g5';
