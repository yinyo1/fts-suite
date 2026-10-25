-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0039 · V1.63e punto 1 (fts-conceptualizador#12): el agente trabaja sábado y domingo
--
-- Decreto de Esteban del 25-oct-2026 10:12 CST (#12 6400000342): «El agente trabaja sábado y domingo en el mismo horario,
-- para todos». Interruptor nuevo, en '0':
--   fin_semana_v163e · el robot (avance.js → presupuesto.cfgViva) corre los 7 días con la misma ventana y los mismos topes
--                      (diario 3 M, semanal 15 M de lo proactivo, freno total de la semana); y con el freno total rebasado,
--                      lo que pide una persona en sábado o domingo se atiende completo, igual que de lunes a viernes (P8).
-- Y su alarma (regla 1 de construcción): `fin_semana_sin_robot` · con el interruptor prendido desde antes del sábado, si de
-- lunes a viernes la semana anterior no tuvo NINGUNA pasada proactiva (ni «saltada») en sábado y domingo, y el freno total de
-- esa semana no estaba rebasado, la alarma sale (correo de alarmas y #4). Se cierra sola el sábado siguiente.
-- Apagado, todo sale igual que con la 0038. Reversa: reversas/039_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in39$
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
               'fin_semana_v163e']
$in39$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── alarma `fin_semana_sin_robot` (regla 1: toda función sale con su alarma) ──
DO $ren39a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0039prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0039prev;
  END IF;
END
$ren39a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am39$
DECLARE
  v_r    jsonb := conceptualizador.alarmas_motor_0039prev(p_llave);
  v_hoy  date;
  v_dow  int;
  v_sab  date;
  v_n    bigint;
  v_sem  bigint;
  v_tope bigint;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('fin_semana_v163e') THEN RETURN v_r; END IF;
  -- cz.hoy_prueba solo lo pone pruebas/sql-0039.sh (producción nunca lo define: vale hoy en la zona del robot)
  v_hoy := coalesce(nullif(current_setting('cz.hoy_prueba', true), '')::date, (now() AT TIME ZONE conceptualizador.zona_robot())::date);
  v_dow := extract(isodow FROM v_hoy)::int;
  IF v_dow > 5 THEN RETURN v_r; END IF;                                   -- sábado o domingo: el fin de semana todavía corre
  v_sab := v_hoy - (v_dow + 1);                                           -- el sábado pasado
  -- solo si estaba prendido desde antes de ese sábado (hora local de inicio del sábado)
  IF conceptualizador.prendido_desde('fin_semana_v163e') > (v_sab::timestamp AT TIME ZONE conceptualizador.zona_robot()) THEN RETURN v_r; END IF;
  SELECT count(*) INTO v_n FROM conceptualizador.consumo_registro WHERE proactivo AND dia IN (v_sab, v_sab + 1);
  IF v_n > 0 THEN RETURN v_r; END IF;
  SELECT coalesce(sum(ponderado), 0) INTO v_sem FROM conceptualizador.consumo_registro WHERE dia BETWEEN v_sab - 5 AND v_sab + 1;
  v_tope := coalesce(conceptualizador.cfg('consumo_tope_semana')::bigint, 75000000);
  IF v_sem >= v_tope THEN RETURN v_r; END IF;                             -- el freno total explica el silencio: no es esta alarma
  v_r := v_r || conceptualizador.alarma('fin_semana_sin_robot', v_sab::text, ((v_sab + 2)::timestamp AT TIME ZONE conceptualizador.zona_robot()),
    'El agente no corrió el fin de semana (sábado ' || v_sab || ' y domingo ' || (v_sab + 1) || '): 0 pasadas proactivas, con fin_semana_v163e prendido y la semana en ' ||
      round(v_sem / 1e6, 1) || ' M de ' || round(v_tope / 1e6, 1) || ' M del freno total.',
    'Revisa que el principal y el vigía estuvieran vivos (relevo, arrancador) y que AVANCE_APAGADO no estuviera puesto a mano. Si el interruptor sigue prendido y el motor vivo, el próximo fin de semana debería correr; si no, apaga fin_semana_v163e y avisa en #12.',
    'fin-semana', jsonb_build_object('sabado', v_sab, 'semana_ponderado', v_sem, 'tope', v_tope));
  RETURN v_r;
END
$am39$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0039prev(text) FROM PUBLIC;
