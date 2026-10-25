-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0045 · V1.63e (fts-conceptualizador#12): términos como supuestos y alarma de un caso que no avanza
--
-- Esteban, 25-oct-2026 16:07 CST. Dos interruptores nuevos, en '0':
--   terminos_robot_v163e · (punto 1) el robot arma los términos del caso como supuestos («Supuse esto») cuando no los escribió una
--                          persona ni el modelo, para que el borrador del 2b salga solo (herramientas/avance/terminos.js). Aquí solo
--                          se da de alta el nombre; lo lee el motor.
--   sin_avance_v163e     · (punto 4) alarma hermana de robot_sin_pasadas en alarmas_motor: robot_sin_avance, un caso con
--                          alarma_sin_avance_n (3) pasadas SEGUIDAS sin avanzar (resultado distinto de 'avanzo': no subió el % ni bajó
--                          ningún pendiente) y la última de hace menos de 3 h. No cuentan las saltadas (no se juzgó el trabajo).
--                          El correo sale por encolar_alarmas + consumo-avisos y la línea en #12 la publica la sesión motor
--                          (motor/MOTOR.md), como las demás. Una alarma por caso y por su última pasada.
-- Apagado, alarmas_motor sale igual que con la 0044. Reversa: reversas/045_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in45$
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
               'terminos_robot_v163e','sin_avance_v163e']
$in45$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

DO $ren45a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0045prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0045prev;
  END IF;
END
$ren45a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am45$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0045prev(p_llave);
  v_ahora timestamptz;
  v_n     int;
  c       record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('sin_avance_v163e') THEN RETURN v_r; END IF;
  -- cz.ahora_prueba solo lo pone pruebas/sql-0045.sh (producción nunca lo define)
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  v_n := greatest(2, coalesce(conceptualizador.cfg('alarma_sin_avance_n'), 3));
  FOR c IN
    WITH u AS (
      SELECT ca.caso_id, ca.carpeta, ca.pasada, ca.resultado, ca.created_at,
             row_number() OVER (PARTITION BY ca.caso_id ORDER BY ca.created_at DESC, ca.id DESC) AS k
        FROM conceptualizador.consumo_avance ca
       WHERE ca.caso_id IS NOT NULL AND ca.created_at <= v_ahora AND ca.resultado <> 'saltada'
         AND ca.created_at > v_ahora - interval '2 days')
    SELECT caso_id, max(carpeta) FILTER (WHERE k = 1) AS carpeta, max(pasada) FILTER (WHERE k = 1) AS ultima,
           max(created_at) AS ultima_at, string_agg(resultado, ', ' ORDER BY k) AS resultados
      FROM u WHERE k <= v_n
     GROUP BY caso_id
    HAVING count(*) = v_n AND bool_and(resultado <> 'avanzo') AND max(created_at) > v_ahora - interval '3 hours'
  LOOP
    v_r := v_r || conceptualizador.alarma('robot_sin_avance', c.caso_id::text || ':' || c.ultima, c.ultima_at,
      'El robot lleva ' || v_n || ' pasadas seguidas en ' || right(c.carpeta, 6) || ' sin subir el % ni bajar pendientes (' || c.resultados ||
        '; última ' || coalesce(conceptualizador.hora_local(c.ultima_at) || ' CST', '?') || ').',
      'Revisa la última pasada del caso (avance.json: por qué no aplicó) y la lista «falta»; si el caso espera algo que el robot no puede conseguir (un proveedor, una decisión), que lo diga en el chat del caso y deje de intentarlo.',
      'robot-sin-avance', jsonb_build_object('caso_id', c.caso_id, 'carpeta', c.carpeta, 'ultima', c.ultima, 'resultados', c.resultados));
  END LOOP;
  RETURN v_r;
END
$am45$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0045prev(text) FROM PUBLIC;
