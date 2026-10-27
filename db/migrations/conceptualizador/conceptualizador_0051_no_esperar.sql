-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0051 · V1.63g.4 (#12, Esteban 27-oct-2026 15:30 CST, punto 1 URGENTE): «no esperar» de verdad
--
-- Caso real: «Tanque de Mario Quimitec» (8894cebe, Montalvo, 27-oct 13:04 CST). El caso nació en modo `levantamiento`; la cadena
-- de api_suite (db/003, Fase 9, la D58) no encola trabajo en levantamiento antes del disparador («Ya es todo»), y la 0042 (V1.63e)
-- solo cambió el TEXTO del acuse: dejó el arranque a la pasada del robot. Pero el robot solo recorre las carpetas de casos/ del
-- repo, y la carpeta la crea el motor al procesar el primer trabajo: sin trabajo no hay carpeta, y sin carpeta el robot nunca lo
-- ve. Resultado: 11 mensajes y el botón «Arma todo, yo corrijo» con el acuse «En cuanto dejes de mandar unos minutos empiezo…»
-- y CERO trabajos, de 13:04 a 15:26 CST.
--
-- Con `no_esperar_v163g4` prendido:
--   · api_suite `enviar`: si la cadena guardó el mensaje SIN encolar trabajo (levantamiento antes del disparador), lo encola,
--     marca el caso como disparado (los mensajes que siguen se encolan por la cadena de siempre) y el acuse dice
--     «Ya empecé; si mandas más lo sumo.» en lugar de pedir que deje de escribir. El tope de mensajes sigue mandando.
--   · alarma `sin_respuesta` en alarmas_motor: un caso con un mensaje de persona sin ninguna respuesta del motor (el acuse no
--     cuenta) en `alarma_sin_respuesta_min` (5) minutos. Sale por encolar_alarmas como las demás (correo a Esteban, aunque el
--     motor esté caído: lo llama el cron de consumo-avisos).
--   · aviso al dueño en su chat: encolar_alarmas (envuelta) deja UNA línea de sistema por caso y por tramo sin respuesta.
-- Apagado, todo sale exactamente como con la 0050. Columna nueva `mensaje.sin_respuesta_avisado_at` (aditiva).
-- Reversa: reversas/051_reversa.sql. Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin ampersand, etiquetas
-- con nombre.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in51$
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
$in51$;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('alarma_sin_respuesta_min', '5') ON CONFLICT (clave) DO NOTHING;

ALTER TABLE conceptualizador.mensaje ADD COLUMN IF NOT EXISTS sin_respuesta_avisado_at timestamptz;

-- ── api_suite (envoltura): en levantamiento el mensaje de la persona también se encola ──
DO $ren51s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0051prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0051prev;
  END IF;
END
$ren51s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui51$
DECLARE
  v_r    jsonb;
  v_msg  bigint;
  v_caso uuid;
  v_trab bigint;
  v_modo text;
  v_ac   text;
  v_aut  text;
  v_uso  jsonb;
BEGIN
  v_r := conceptualizador.api_suite_0051prev(p);
  IF p->>'modo' <> 'enviar' OR NOT conceptualizador.prendido('no_esperar_v163g4')
     OR NOT coalesce((v_r->>'ok')::boolean, false) OR coalesce(v_r->>'mensaje_id', '') = '' OR coalesce(v_r->>'trabajo_id', '') <> '' THEN
    RETURN v_r;
  END IF;
  v_msg := (v_r->>'mensaje_id')::bigint;
  SELECT m.caso_id, m.trabajo_id, k.modo, m.autor INTO v_caso, v_trab, v_modo, v_aut
    FROM conceptualizador.mensaje m JOIN conceptualizador.caso k ON k.id = m.caso_id WHERE m.id = v_msg;
  -- Solo el levantamiento antes del disparador (D58). El tope de mensajes y /cierre siguen como estaban.
  IF v_trab IS NOT NULL OR v_modo IS DISTINCT FROM 'levantamiento' OR coalesce((v_r->>'tope')::boolean, false) THEN RETURN v_r; END IF;
  -- El tope de mensajes del día (V1.31) lo revisa la cadena solo cuando encola; aquí se revisa igual: pasado el tope, no se encola.
  v_uso := conceptualizador.uso_hoy(v_aut);
  IF (v_uso->>'mensajes')::int >= (v_uso->>'tope_mensajes')::int THEN RETURN v_r; END IF;
  INSERT INTO conceptualizador.trabajo (caso_id, tipo, mensaje_id) VALUES (v_caso, 'mensaje', v_msg) RETURNING id INTO v_trab;
  UPDATE conceptualizador.mensaje SET trabajo_id = v_trab WHERE id = v_msg;
  UPDATE conceptualizador.caso SET disparado_at = coalesce(disparado_at, now()) WHERE id = v_caso;
  -- El acuse ya se escribió con el texto de esperar: se corrige el mismo renglón.
  v_ac := regexp_replace(coalesce(v_r->>'acuse', 'Anotado.'), ' Sigue mandando.*', '') || ' Ya empecé; si mandas más lo sumo.';
  UPDATE conceptualizador.mensaje SET texto = v_ac
   WHERE caso_id = v_caso AND rol = 'motor' AND autor = 'acuse' AND id > v_msg;
  RETURN v_r || jsonb_build_object('trabajo_id', v_trab, 'acuse', v_ac, 'no_esperar', true);
END
$sui51$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0051prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0051prev(jsonb) FROM PUBLIC;
DO $gr51s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0051prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr51s$;

-- ── los casos con un mensaje de persona sin respuesta del motor (el acuse no cuenta) ──
CREATE OR REPLACE FUNCTION conceptualizador.sin_respuesta(p_ahora timestamptz DEFAULT now()) RETURNS TABLE
  (caso_id uuid, titulo text, autor text, mensaje_id bigint, desde timestamptz, mensajes int, avisado boolean)
LANGUAGE sql STABLE AS $sr51$
  SELECT k.id, k.titulo, k.autor, min(m.id), min(m.created_at), count(*)::int, bool_or(m.sin_respuesta_avisado_at IS NOT NULL)
    FROM conceptualizador.mensaje m JOIN conceptualizador.caso k ON k.id = m.caso_id
   WHERE m.rol = 'usuario' AND NOT k.demo AND k.estado = 'abierto'
     AND m.created_at > p_ahora - interval '1 day'
     AND m.created_at <= p_ahora - make_interval(mins => greatest(1, coalesce(conceptualizador.cfg('alarma_sin_respuesta_min'), 5)))
     AND NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje r
                      WHERE r.caso_id = m.caso_id AND r.id > m.id AND r.rol = 'motor' AND r.autor <> 'acuse')
   GROUP BY k.id, k.titulo, k.autor
$sr51$;
REVOKE ALL ON FUNCTION conceptualizador.sin_respuesta(timestamptz) FROM PUBLIC;

-- ── alarmas_motor (envoltura): la alarma sin_respuesta ──
DO $ren51a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0051prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0051prev;
  END IF;
END
$ren51a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am51$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0051prev(p_llave);
  v_ahora timestamptz;
  v_min   int;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('no_esperar_v163g4') THEN RETURN v_r; END IF;
  -- cz.ahora_prueba solo lo pone pruebas/sql-0051.sh (producción nunca lo define)
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  v_min := greatest(1, coalesce(conceptualizador.cfg('alarma_sin_respuesta_min'), 5));
  FOR f IN SELECT * FROM conceptualizador.sin_respuesta(v_ahora) LOOP
    v_r := v_r || conceptualizador.alarma('sin_respuesta', f.caso_id::text || ':' || f.mensaje_id, f.desde,
      'El caso «' || left(f.titulo, 60) || '» de ' || f.autor || ' tiene ' || f.mensajes || ' mensaje(s) de la persona sin respuesta del motor desde las ' ||
        coalesce(conceptualizador.hora_local(f.desde) || ' CST', '?') || ' (más de ' || v_min || ' min).',
      'Mira si hay trabajo en la cola para ese caso (conceptualizador.trabajo); si no lo hay, el mensaje no se encoló: revisa el modo del caso. Si lo hay, abre la sesión «Motor Conceptualizador».',
      'sin-respuesta', jsonb_build_object('caso_id', f.caso_id, 'autor', f.autor, 'mensaje_id', f.mensaje_id, 'mensajes', f.mensajes));
  END LOOP;
  RETURN v_r;
END
$am51$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0051prev(text) FROM PUBLIC;

-- ── el aviso al dueño en su chat (una vez por tramo sin respuesta) ──
CREATE OR REPLACE FUNCTION conceptualizador.sin_respuesta_avisar(p_ahora timestamptz DEFAULT now()) RETURNS int
LANGUAGE plpgsql AS $sa51$
DECLARE
  f   record;
  v_n int := 0;
BEGIN
  IF NOT conceptualizador.prendido('no_esperar_v163g4') THEN RETURN 0; END IF;
  FOR f IN SELECT * FROM conceptualizador.sin_respuesta(p_ahora) WHERE NOT avisado LOOP
    UPDATE conceptualizador.mensaje SET sin_respuesta_avisado_at = now()
     WHERE caso_id = f.caso_id AND rol = 'usuario' AND id >= f.mensaje_id AND sin_respuesta_avisado_at IS NULL;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (f.caso_id, 'sistema', 'alarma',
      'Tu mensaje de las ' || coalesce(conceptualizador.hora_local(f.desde), '?') || ' lleva más de ' ||
      greatest(1, coalesce(conceptualizador.cfg('alarma_sin_respuesta_min'), 5)) || ' min sin respuesta del agente. Ya le avisé a Esteban; en cuanto lo tome, te contesto aquí.');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$sa51$;
REVOKE ALL ON FUNCTION conceptualizador.sin_respuesta_avisar(timestamptz) FROM PUBLIC;

-- ── encolar_alarmas (envoltura): antes de encolar, el aviso al dueño ──
DO $ren51e$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'encolar_alarmas_0051prev') THEN
    ALTER FUNCTION conceptualizador.encolar_alarmas(text) RENAME TO encolar_alarmas_0051prev;
  END IF;
END
$ren51e$;

CREATE OR REPLACE FUNCTION conceptualizador.encolar_alarmas(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql AS $ea51$
BEGIN
  IF p_llave = 'conceptualizador' THEN PERFORM conceptualizador.sin_respuesta_avisar(); END IF;
  RETURN conceptualizador.encolar_alarmas_0051prev(p_llave);
END
$ea51$;
REVOKE ALL ON FUNCTION conceptualizador.encolar_alarmas(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.encolar_alarmas_0051prev(text) FROM PUBLIC;
