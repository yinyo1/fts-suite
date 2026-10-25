-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0040 · V1.63e bloques 2 y 4 (fts-conceptualizador#12): modo análisis de un jalón y tarifas fijas USA
--
-- Va de Esteban del 25-oct-2026 11:05 CST. Tres interruptores nuevos, en '0':
--   analisis_v163e    · el motor supone y arma todo (una sola pregunta, solo sin supuesto posible y si mueve > 20 % del total);
--                       el robot deja de saltar «sin nada nuevo» un caso al que le falta algo que resuelve solo; el levantamiento
--                       arranca con el primer mensaje con alcance; el apagado por freno vence solo. Lo decide el motor.
--   tarifas_usa_v163e · MO FTS USA con la tabla fija (conocimiento/usa/tarifas-mo.json), L–V 8 h, nota fija, sin gasolina.
--                       Lo decide el motor (verifica, cotizacion-odoo).
--   deshacer_v163e    · «↺ Deshacer» regresa el texto de antes sin volver a pedir la liberación de la regla 15 que ya se dio
--                       (lo no liberado se marca como siempre). Lo decide el motor (todo-hecho.js).
-- Y sus alarmas (regla 1 de construcción), solo con analisis_v163e prendido y contadas desde que se prendió:
--   caso_sin_avance_48h · un caso abierto, no enviado, sin pausa, pasa 48 h sin una pasada que avance ni un trabajo terminado.
--   dia_sin_avances     · el día de ayer (zona del robot) terminó con CERO pasadas del robot que avanzaran.
--   caso_preguntas      · un caso nacido con el modo análisis prendido hizo más de 1 pregunta.
-- Apagado, todo sale igual que con la 0039. Reversa: reversas/040_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in40$
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
               'analisis_v163e','tarifas_usa_v163e','deshacer_v163e']
$in40$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

DO $ren40a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0040prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0040prev;
  END IF;
END
$ren40a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am40$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0040prev(p_llave);
  v_desde timestamptz;
  v_ahora timestamptz;
  v_zona  text := conceptualizador.zona_robot();
  v_ayer  date;
  v_n     bigint;
  v_lista text;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('analisis_v163e') THEN RETURN v_r; END IF;
  v_desde := conceptualizador.prendido_desde('analisis_v163e');
  -- cz.ahora_prueba solo lo pone pruebas/sql-0040.sh (producción nunca lo define)
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());

  -- 1 · caso abierto sin avanzar 48 h (contado desde que se prendió el interruptor)
  SELECT count(*), string_agg(x.nombre, '; ' ORDER BY x.ult) INTO v_n, v_lista FROM (
    SELECT c.id, coalesce(nullif(c.titulo, ''), c.id::text) || ' (' || split_part(c.autor, '.', 1) || ', ' || round(extract(epoch FROM v_ahora - u.ult) / 3600) || ' h)' AS nombre, u.ult
      FROM conceptualizador.caso c
      CROSS JOIN LATERAL (SELECT greatest(c.created_at, v_desde,
                 (SELECT max(a.created_at) FROM conceptualizador.consumo_avance a WHERE a.caso_id = c.id AND a.resultado = 'avanzo'),
                 (SELECT max(t.listo_at) FROM conceptualizador.trabajo t WHERE t.caso_id = c.id AND t.estado = 'listo')) AS ult) u
     WHERE c.estado = 'abierto' AND NOT c.demo
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.accion e WHERE e.caso_id = c.id AND e.tipo = 'enviada' AND e.estado = 'hecha')
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.agente_pausa z WHERE z.caso_id = c.id AND z.hasta IS NULL)
       AND u.ult < v_ahora - interval '48 hours') x;
  IF v_n > 0 THEN
    v_r := v_r || conceptualizador.alarma('caso_sin_avance_48h', to_char(v_ahora AT TIME ZONE v_zona, 'YYYY-MM-DD'), v_ahora - interval '48 hours',
      v_n || ' caso(s) abierto(s) y no enviado(s) llevan más de 48 h sin avanzar: ' || left(v_lista, 700) || '.',
      'Abre el caso más viejo y mira qué le falta: si es algo que el agente resuelve solo (suponer, precio, BOM, machote), revisa por qué el robot no lo tomó (freno, ritmo, «detenido»); si espera a una persona, que el dueño lo diga en el chat o lo pause con razón.',
      'caso-sin-avance', jsonb_build_object('casos', v_n));
  END IF;

  -- 2 · ayer terminó con cero avances del robot (solo si el interruptor ya estaba prendido todo ese día)
  v_ayer := (v_ahora AT TIME ZONE v_zona)::date - 1;
  IF v_desde <= (v_ayer::timestamp AT TIME ZONE v_zona) THEN
    SELECT count(*) INTO v_n FROM conceptualizador.consumo_avance WHERE dia = v_ayer AND resultado = 'avanzo';
    IF v_n = 0 THEN
      v_r := v_r || conceptualizador.alarma('dia_sin_avances', v_ayer::text, ((v_ayer + 1)::timestamp AT TIME ZONE v_zona),
        'El día ' || v_ayer || ' terminó con cero pasadas del robot que avanzaran un caso (modo análisis prendido).',
        'Revisa el motivo de las pasadas del día en aprendizaje/consumo (saltadas, freno, horario, AVANCE_APAGADO) y que el principal y el vigía estuvieran vivos.',
        'dia-sin-avances', jsonb_build_object('dia', v_ayer));
    END IF;
  END IF;

  -- 3 · un caso nacido con el modo análisis hizo más de 1 pregunta (la ciudad y el diagnóstico también cuentan; los clics de Odoo no)
  SELECT count(*), string_agg(x.nombre, '; ') INTO v_n, v_lista FROM (
    SELECT coalesce(nullif(c.titulo, ''), c.id::text) || ' (' || split_part(c.autor, '.', 1) || ', ' || count(*) || ' preguntas)' AS nombre
      FROM conceptualizador.caso c JOIN conceptualizador.accion a ON a.caso_id = c.id
     WHERE c.created_at >= v_desde AND NOT c.demo AND a.tipo = 'conjetura' AND coalesce(a.datos->>'campo', '') NOT LIKE 'odoo.%'
     GROUP BY c.id, c.titulo, c.autor HAVING count(*) > 1) x;
  IF v_n > 0 THEN
    v_r := v_r || conceptualizador.alarma('caso_preguntas', to_char(v_ahora AT TIME ZONE v_zona, 'YYYY-MM-DD'), v_ahora,
      v_n || ' caso(s) nuevo(s) con más de 1 pregunta en modo análisis: ' || left(v_lista, 700) || '.',
      'El modo análisis supone y arma todo; más de una pregunta quiere decir que el modelo no siguió PROCESAR §3a o que el código no la frenó. Revisa las acciones conjetura del caso.',
      'caso-preguntas', jsonb_build_object('casos', v_n));
  END IF;
  RETURN v_r;
END
$am40$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0040prev(text) FROM PUBLIC;
