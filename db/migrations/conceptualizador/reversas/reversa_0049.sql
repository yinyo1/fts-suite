-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0049 (V1.63g.2, #12, voz aplicada por código): agente_gate, api_motor y alarmas_motor vuelven a los
-- de la 0048, el disparador de la tarjeta y la medición vuelven a los de la 0048, se van las columnas nuevas de voz_rafaga (los
-- segundos medidos se pierden), la fila de alarma_voz_lenta_s y la del interruptor voz_directo_v163g.
-- ⚠ Antes de correrla, `voz_directo_v163g` en '0'. Con el interruptor en '0' no hace falta correrla: todo vuelve a lo de antes.
-- ═══════════════════════════════════════════════════════════════════════════
DO $rv49$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'agente_gate_0049prev') THEN
    DROP FUNCTION conceptualizador.agente_gate(bigint, uuid, text);
    ALTER FUNCTION conceptualizador.agente_gate_0049prev(bigint, uuid, text) RENAME TO agente_gate;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
      GRANT EXECUTE ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) TO comercial_app;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0049prev') THEN
    DROP FUNCTION conceptualizador.api_motor(jsonb);
    ALTER FUNCTION conceptualizador.api_motor_0049prev(jsonb) RENAME TO api_motor;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0049prev') THEN
    DROP FUNCTION conceptualizador.alarmas_motor(text);
    ALTER FUNCTION conceptualizador.alarmas_motor_0049prev(text) RENAME TO alarmas_motor;
  END IF;
END
$rv49$;

CREATE OR REPLACE FUNCTION conceptualizador.voz_rafaga_accion() RETURNS trigger
LANGUAGE plpgsql AS $vra48$
DECLARE
  v_rid bigint;
  v_ap  int;
BEGIN
  IF NEW.tipo <> 'voz_entendi' THEN RETURN NEW; END IF;
  v_rid := CASE WHEN coalesce(NEW.datos->>'rafaga_id', '') ~ '^[0-9]{1,15}\Z' THEN (NEW.datos->>'rafaga_id')::bigint END;
  IF v_rid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE conceptualizador.voz_rafaga SET entendi_at = coalesce(entendi_at, now()), accion_id = NEW.id,
           propuestos = CASE WHEN jsonb_typeof(NEW.datos->'cambios') = 'array' THEN jsonb_array_length(NEW.datos->'cambios') ELSE 0 END
     WHERE id = v_rid AND caso_id = NEW.caso_id;
  ELSIF NEW.estado IN ('hecha','descartada') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    v_ap := CASE WHEN NEW.estado = 'hecha' AND jsonb_typeof(NEW.resultado->'aprobados') = 'array' THEN jsonb_array_length(NEW.resultado->'aprobados') ELSE 0 END;
    UPDATE conceptualizador.voz_rafaga SET aprobados = v_ap, rechazados = greatest(0, coalesce(propuestos, 0) - v_ap), decidida_at = now()
     WHERE id = v_rid AND caso_id = NEW.caso_id;
  END IF;
  RETURN NEW;
END
$vra48$;

CREATE OR REPLACE FUNCTION conceptualizador.voz_metricas(p_dias int DEFAULT 7) RETURNS jsonb
LANGUAGE sql STABLE AS $vm48$
  SELECT jsonb_build_object('dias', p_dias, 'rafagas', count(*), 'notas', coalesce(sum(n_notas), 0),
    'notas_por_rafaga', round(avg(n_notas), 1), 'audio_min', round(coalesce(sum(audio_s), 0) / 60.0, 1),
    'con_entendi', count(entendi_at), 'sin_entendi', count(*) - count(entendi_at),
    'propuestos', coalesce(sum(propuestos), 0), 'aprobados', coalesce(sum(aprobados), 0), 'rechazados', coalesce(sum(rechazados), 0),
    'decididas', count(decidida_at),
    'min_a_entendi_mediana', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM entendi_at - coalesce(grabada_at, enviada_at)) / 60.0))::numeric, 1),
    'min_a_entendi_max', round(max(extract(epoch FROM entendi_at - coalesce(grabada_at, enviada_at)) / 60.0)::numeric, 1),
    'por_autor', (SELECT coalesce(jsonb_object_agg(autor, n), '{}'::jsonb) FROM (SELECT autor, count(*) n FROM conceptualizador.voz_rafaga
                   WHERE enviada_at > now() - make_interval(days => p_dias) GROUP BY autor) z))
    FROM conceptualizador.voz_rafaga WHERE enviada_at > now() - make_interval(days => p_dias)
$vm48$;
REVOKE ALL ON FUNCTION conceptualizador.voz_metricas(int) FROM PUBLIC;

ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS directos;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS directo_at;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS directo_s;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS aplicada_at;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS aplicada_s;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS odoo_ok;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS odoo_so;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS vence_el;
ALTER TABLE conceptualizador.voz_rafaga DROP COLUMN IF EXISTS deshecha_at;

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $inr49$
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
               'voz_visor_v163g']
$inr49$;

DELETE FROM conceptualizador.config WHERE clave IN ('interruptor:voz_directo_v163g', 'alarma_voz_lenta_s');
