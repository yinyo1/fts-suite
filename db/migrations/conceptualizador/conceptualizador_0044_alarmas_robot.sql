-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0044 · V1.63e (fts-conceptualizador#12): alarmas del robot que se quedó viejo o quieto
--
-- Esteban, 25-oct-2026 15:55 CST: «La sesión motor no tomó el código tras el relevo de las 21:06 UTC y el robot lleva desde las 21:17
-- UTC sin pasadas. Agrega alarma: si la sesión motor corre un commit distinto a main por más de 15 min, o si con el modo prueba prendido
-- pasan 30 min sin ninguna pasada del robot en horario, aviso a Esteban por correo y una línea en #12.» Un interruptor nuevo, en '0':
--   alarmas_robot_v163e · dos alarmas más en alarmas_motor (el correo sale por encolar_alarmas + consumo-avisos, como las demás; la
--                         línea en #12 la publica la sesión motor al recibir AVISO_MOTOR alarma, motor/MOTOR.md):
--     motor_codigo_viejo · el latido del principal (vigia-13) dice que corre un commit (head) distinto del de main (origin) desde hace
--                          más de alarma_codigo_viejo_min (15). HEAD adelante de main (sin subir) no cuenta: eso es sin_subir.
--     robot_sin_pasadas  · modo prueba vigente (lo dice el latido; sin el dato, con analisis_v163e prendido), en el horario del robot
--                          (robot_desde/robot_hasta, robot_dias o los 7 días con fin_semana_v163e) y más de alarma_sin_pasadas_min (30)
--                          sin una pasada registrada (consumo_avance), contado desde lo último de: la última pasada, el inicio del
--                          horario de hoy y el momento en que se prendió el interruptor. Trae el «por qué» que reporta el vigía.
-- Apagado, alarmas_motor sale igual que con la 0043. Reversa: reversas/044_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in44$
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
               'alarmas_robot_v163e']
$in44$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

DO $ren44a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0044prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0044prev;
  END IF;
END
$ren44a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am44$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0044prev(p_llave);
  v_ahora timestamptz;
  v_zona  text := conceptualizador.zona_robot();
  v_ls    conceptualizador.latido_sesion;
  v_min   int;
  v_t0    timestamptz;
  v_ult   timestamptz;
  v_ini   timestamptz;
  v_dias  int[];
  v_mp    boolean;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('alarmas_robot_v163e') THEN RETURN v_r; END IF;
  -- cz.ahora_prueba solo lo pone pruebas/sql-0044.sh (producción nunca lo define)
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  SELECT * INTO v_ls FROM conceptualizador.latido_sesion
   WHERE llave = p_llave AND motor = 'principal' AND visto_at > v_ahora - interval '3 minutes'
   ORDER BY dueno DESC NULLS LAST, visto_at DESC LIMIT 1;
  -- 1 · el motor corre un commit distinto de main
  v_min := coalesce(conceptualizador.cfg('alarma_codigo_viejo_min'), 15);
  IF v_ls.sesion IS NOT NULL AND coalesce(v_ls.salud->>'head', '') ~ '^[0-9a-f]{7,40}\Z' AND coalesce(v_ls.salud->>'origin', '') ~ '^[0-9a-f]{7,40}\Z'
     AND v_ls.salud->>'head' <> v_ls.salud->>'origin' AND coalesce(v_ls.salud->>'desfase_desde', '') ~ '^[0-9]{10,13}\Z' THEN
    v_t0 := to_timestamp((v_ls.salud->>'desfase_desde')::bigint / 1000.0);
    IF v_t0 < v_ahora - make_interval(mins => v_min) THEN
      v_r := v_r || conceptualizador.alarma('motor_codigo_viejo', v_ls.sesion || ':' || (v_ls.salud->>'origin'), v_t0,
        'La sesión motor ' || v_ls.sesion || ' corre el commit ' || (v_ls.salud->>'head') || ' y main va en ' || (v_ls.salud->>'origin') ||
          ' desde hace más de ' || v_min || ' min: el robot trabaja con código viejo.',
        'El vigía se pone al día solo cuando está quieto (git pull); si sigue, abre la sesión ' || v_ls.sesion || ' y escribe «estado motor» o pídele un git pull de main.',
        'motor-codigo-viejo', jsonb_build_object('sesion', v_ls.sesion, 'head', v_ls.salud->>'head', 'origin', v_ls.salud->>'origin'));
    END IF;
  END IF;
  -- 2 · con el modo prueba, 30 min sin pasadas del robot en horario
  v_min := coalesce(conceptualizador.cfg('alarma_sin_pasadas_min'), 30);
  v_mp := CASE WHEN v_ls.salud ? 'modo_prueba' THEN coalesce((v_ls.salud->>'modo_prueba')::boolean, false) ELSE conceptualizador.prendido('analisis_v163e') END;
  v_dias := CASE WHEN conceptualizador.prendido('fin_semana_v163e') THEN ARRAY[1,2,3,4,5,6,7]
                 ELSE coalesce((SELECT array_agg(btrim(x)::int) FROM unnest(string_to_array(coalesce(conceptualizador.cfg_txt('robot_dias'), '1,2,3,4,5'), ',')) x WHERE btrim(x) ~ '^[1-7]\Z'), ARRAY[1,2,3,4,5]) END;
  IF v_mp AND extract(isodow FROM v_ahora AT TIME ZONE v_zona)::int = ANY (v_dias)
     AND conceptualizador.en_ventana(coalesce(conceptualizador.cfg_txt('robot_desde'), '07:00'), coalesce(conceptualizador.cfg_txt('robot_hasta'), '22:00'), v_ahora) THEN
    SELECT max(created_at) INTO v_ult FROM conceptualizador.consumo_avance WHERE created_at <= v_ahora;
    BEGIN
      v_ini := ((v_ahora AT TIME ZONE v_zona)::date + coalesce(conceptualizador.cfg_txt('robot_desde'), '07:00')::time) AT TIME ZONE v_zona;
    EXCEPTION WHEN others THEN v_ini := v_ahora;
    END;
    v_t0 := greatest(coalesce(v_ult, '-infinity'::timestamptz), v_ini, coalesce(conceptualizador.prendido_desde('alarmas_robot_v163e'), '-infinity'::timestamptz));
    IF v_t0 < v_ahora - make_interval(mins => v_min) THEN
      v_r := v_r || conceptualizador.alarma('robot_sin_pasadas', to_char(v_t0 AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI'), v_t0,
        'Con el modo prueba prendido, el robot lleva más de ' || v_min || ' min sin ninguna pasada en horario (última: ' ||
          coalesce(conceptualizador.hora_local(v_ult) || ' CST', 'ninguna hoy') || ').' ||
          CASE WHEN coalesce(v_ls.salud->>'avance_porque', '') <> '' THEN ' El vigía dice: ' || left(v_ls.salud->>'avance_porque', 160) || '.'
               WHEN v_ls.sesion IS NULL THEN ' Ninguna sesión motor está latiendo.' ELSE '' END,
        'Abre la sesión motor y escribe «estado motor»; si es el ritmo o el tope del día, se resuelve solo; si dice error, apaga lo proactivo y avisa.',
        'robot-sin-pasadas', jsonb_build_object('ultima', v_ult, 'porque', v_ls.salud->>'avance_porque', 'sesion', v_ls.sesion));
    END IF;
  END IF;
  RETURN v_r;
END
$am44$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0044prev(text) FROM PUBLIC;
