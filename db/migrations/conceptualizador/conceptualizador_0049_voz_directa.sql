-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0049 · V1.63g.2 (fts-conceptualizador#12, Esteban 26-oct 08:50 CST): lo dicho por voz se aplica por código
--
-- Caso real: 21fec6, ráfaga 1. «Vigencia 15 días» se entendió y se aprobó (acción 495, 14:46 UTC) y SO11926 siguió con la vigencia
-- vieja: el trabajo de la aprobación es un EVENTO, y `agente_gate` solo dejaba escribir con un trabajo de MENSAJE (o el barrido).
--   · `agente_gate` (envoltura): con `voz_directo_v163g` prendido, el trabajo de una aprobación de «Esto entendí» —y la continuación
--     que deja para lo de criterio— es la instrucción de QUIEN APROBÓ: la acción `voz_entendi` hecha por esa persona, del caso del
--     trabajo, de menos de 2 horas, trabajo en curso, el machote del caso y su permiso de siempre (puede_mover). Lo demás, como antes.
--   · `voz_rafaga` + columnas de la medición: cuántos cambios se aplicaron directo al enviar, y los segundos de Enviar a aplicado
--     (directo_s) y de Aprobar a aplicado (aplicada_s), con lo que releyó Odoo (so, vence_el, odoo_ok) y si se deshizo.
--   · api_motor modo `voz_aplicada`: el motor lo manda al terminar de aplicar (herramientas/motor/procesa.js).
--   · `voz_metricas` suma esa medición (el correo de las 7:00 la pinta) y la alarma `voz_lenta` suena si pasan más de
--     `alarma_voz_lenta_s` (120) segundos de Enviar o de Aprobar a aplicado, o si lo aplicado no quedó en Odoo.
--   · interruptor `voz_directo_v163g` en '0'.
-- Aditiva: no cambia ningún valor ni ninguna fila existente. Reversa: reversas/049_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in49$
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
               'voz_directo_v163g']
$in49$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('alarma_voz_lenta_s', '120') ON CONFLICT (clave) DO NOTHING;

-- ── la medición ──
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS directos    int;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS directo_at  timestamptz;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS directo_s   numeric;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS aplicada_at timestamptz;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS aplicada_s  numeric;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS odoo_ok     boolean;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS odoo_so     text;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS vence_el    date;
ALTER TABLE conceptualizador.voz_rafaga ADD COLUMN IF NOT EXISTS deshecha_at timestamptz;

-- La tarjeta «Esto entendí» que llega con lo aplicado directo (`datos.directos`) lo cuenta; lo demás, como en la 0048.
CREATE OR REPLACE FUNCTION conceptualizador.voz_rafaga_accion() RETURNS trigger
LANGUAGE plpgsql AS $vra49$
DECLARE
  v_rid bigint;
  v_ap  int;
BEGIN
  IF NEW.tipo <> 'voz_entendi' THEN RETURN NEW; END IF;
  v_rid := CASE WHEN coalesce(NEW.datos->>'rafaga_id', '') ~ '^[0-9]{1,15}\Z' THEN (NEW.datos->>'rafaga_id')::bigint END;
  IF v_rid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE conceptualizador.voz_rafaga SET entendi_at = coalesce(entendi_at, now()), accion_id = NEW.id,
           propuestos = CASE WHEN jsonb_typeof(NEW.datos->'cambios') = 'array' THEN jsonb_array_length(NEW.datos->'cambios') ELSE 0 END,
           directos = CASE WHEN jsonb_typeof(NEW.datos->'directos') = 'array' THEN jsonb_array_length(NEW.datos->'directos') ELSE directos END
     WHERE id = v_rid AND caso_id = NEW.caso_id;
  ELSIF NEW.estado IN ('hecha','descartada') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    v_ap := CASE WHEN NEW.estado = 'hecha' AND jsonb_typeof(NEW.resultado->'aprobados') = 'array' THEN jsonb_array_length(NEW.resultado->'aprobados') ELSE 0 END;
    UPDATE conceptualizador.voz_rafaga SET aprobados = v_ap, rechazados = greatest(0, coalesce(propuestos, 0) - v_ap), decidida_at = now()
     WHERE id = v_rid AND caso_id = NEW.caso_id;
  END IF;
  RETURN NEW;
END
$vra49$;

-- ── agente_gate (envoltura): la aprobación de voz es la instrucción de quien aprobó ──
DO $ren49g$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'agente_gate_0049prev') THEN
    ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) RENAME TO agente_gate_0049prev;
  END IF;
END
$ren49g$;

CREATE OR REPLACE FUNCTION conceptualizador.agente_gate(p_trabajo bigint, p_machote uuid, p_para text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $ag49$
DECLARE
  v_sw   text := CASE WHEN p_para = 'orden' THEN 'todo_hecho_v162b' ELSE 'guardar_agente_v162b' END;
  t      record;
  v_ev   record;
  v_ac   record;
  v_base text;
  v_due  text;
  v_mach uuid;
BEGIN
  SELECT tr.id, tr.caso_id, tr.estado, e.id AS ev_id, e.tipo AS ev_tipo, e.datos AS ev_datos INTO t
    FROM conceptualizador.trabajo tr LEFT JOIN conceptualizador.evento e ON e.id = tr.evento_id WHERE tr.id = p_trabajo;
  IF t.id IS NULL OR t.ev_tipo IS NULL OR t.ev_tipo NOT IN ('accion','continuacion')
     OR NOT conceptualizador.prendido('voz_directo_v163g') OR NOT conceptualizador.prendido(v_sw) THEN
    RETURN conceptualizador.agente_gate_0049prev(p_trabajo, p_machote, p_para);
  END IF;
  -- La continuación hereda la aprobación del trabajo que la dejó (mismo caso).
  IF t.ev_tipo = 'continuacion' THEN
    v_base := coalesce(t.ev_datos->>'de_trabajo', '');
    IF v_base !~ '^[0-9]{1,15}\Z' THEN RETURN conceptualizador.agente_gate_0049prev(p_trabajo, p_machote, p_para); END IF;
    SELECT e.id, e.tipo, e.datos, e.autor INTO v_ev FROM conceptualizador.trabajo tr JOIN conceptualizador.evento e ON e.id = tr.evento_id
     WHERE tr.id = v_base::bigint AND tr.caso_id = t.caso_id;
  ELSE
    SELECT e.id, e.tipo, e.datos, e.autor INTO v_ev FROM conceptualizador.evento e WHERE e.id = t.ev_id;
  END IF;
  IF v_ev.id IS NULL OR v_ev.tipo IS DISTINCT FROM 'accion' OR coalesce(v_ev.datos->>'tipo', '') <> 'voz_entendi'
     OR coalesce(v_ev.datos->>'decision', '') <> 'hecha' OR coalesce(v_ev.datos->>'accion_id', '') !~ '^[0-9]{1,15}\Z' THEN
    RETURN conceptualizador.agente_gate_0049prev(p_trabajo, p_machote, p_para);
  END IF;
  SELECT a.id, a.hecha_por, a.hecha_at INTO v_ac FROM conceptualizador.accion a
   WHERE a.id = (v_ev.datos->>'accion_id')::bigint AND a.caso_id = t.caso_id AND a.tipo = 'voz_entendi' AND a.estado = 'hecha';
  IF v_ac.id IS NULL OR v_ac.hecha_por IS NULL OR v_ac.hecha_por IS DISTINCT FROM v_ev.autor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_INSTRUCCION', 'mensaje', 'Esa aprobación por voz no es de una persona sobre este caso.');
  END IF;
  IF t.estado <> 'tomado' THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_INSTRUCCION', 'mensaje', 'Ese trabajo ya no está en curso.'); END IF;
  IF v_ac.hecha_at < now() - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSTRUCCION_VIEJA', 'mensaje', 'La aprobación tiene más de 2 horas: que la persona lo vuelva a pedir.');
  END IF;
  SELECT k.machote_id INTO v_mach FROM conceptualizador.caso k WHERE k.id = t.caso_id;
  IF p_machote IS NULL OR v_mach IS DISTINCT FROM p_machote THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'Ese machote no es el del caso de la aprobación.');
  END IF;
  IF to_regclass('comercial.machote') IS NOT NULL THEN
    EXECUTE 'SELECT dueno FROM comercial.machote WHERE id = ' || quote_literal(p_machote::text) || '::uuid' INTO v_due;
  END IF;
  IF v_due IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_ENCONTRADO'); END IF;
  IF NOT (v_ev.autor = v_due OR conceptualizador.puede_mover(v_ev.autor, v_due)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_PUEDE_MOVER', 'persona', v_ev.autor, 'dueno', v_due,
      'mensaje', v_ev.autor || ' no tiene permiso para mover lo de ' || v_due || ': no guardé nada.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', 'voz', 'persona', v_ev.autor, 'dueno', v_due, 'mensaje_id', NULL, 'accion_id', v_ac.id,
    'caso_id', t.caso_id, 'msg_at', v_ac.hecha_at, 'hora', to_char(v_ac.hecha_at AT TIME ZONE 'America/Monterrey', 'HH24:MI'),
    'motivo', 'lo aplicó el agente por la aprobación de voz de ' || v_ev.autor || ' (acción ' || v_ac.id || ')');
END
$ag49$;
ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.agente_gate_0049prev(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate_0049prev(bigint, uuid, text) FROM PUBLIC;
DO $gr49$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) TO comercial_app;
  END IF;
END
$gr49$;

-- ── api_motor (envoltura): la medición de lo aplicado ──
DO $ren49m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0049prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0049prev;
  END IF;
END
$ren49m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot49$
DECLARE
  v_caso uuid;
  v_f    conceptualizador.voz_rafaga%ROWTYPE;
  v_s    numeric;
  v_acc  bigint;
  v_vence date;
BEGIN
  IF p->>'modo' <> 'voz_aplicada' THEN RETURN conceptualizador.api_motor_0049prev(p); END IF;
  IF coalesce(p->>'motor', '') NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
  IF NOT conceptualizador.prendido('voz_directo_v163g') THEN RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO'); END IF;
  IF coalesce(p->>'trabajo_id', '') !~ '^[0-9]{1,15}\Z' OR coalesce(p->>'clave', '') !~ '^VD?[0-9]{1,15}\Z'
     OR coalesce(p->>'tipo', '') NOT IN ('directo','aprobada','deshacer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VOZ_INVALIDA');
  END IF;
  SELECT caso_id INTO v_caso FROM conceptualizador.trabajo WHERE id = (p->>'trabajo_id')::bigint;
  IF v_caso IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'TRABAJO_INVALIDO'); END IF;
  -- La ráfaga: por su id, o por la acción de la clave (V<acción>).
  IF coalesce(p->>'rafaga_id', '') ~ '^[0-9]{1,15}\Z' THEN
    SELECT * INTO v_f FROM conceptualizador.voz_rafaga WHERE id = (p->>'rafaga_id')::bigint AND caso_id = v_caso;
  END IF;
  IF v_f.id IS NULL AND p->>'clave' ~ '^V[0-9]' THEN
    v_acc := substr(p->>'clave', 2)::bigint;
    SELECT * INTO v_f FROM conceptualizador.voz_rafaga WHERE accion_id = v_acc AND caso_id = v_caso;
  END IF;
  IF v_f.id IS NULL AND p->>'clave' ~ '^VD[0-9]' THEN
    SELECT * INTO v_f FROM conceptualizador.voz_rafaga WHERE id = substr(p->>'clave', 3)::bigint AND caso_id = v_caso;
  END IF;
  IF v_f.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_RAFAGA'); END IF;
  v_vence := CASE WHEN coalesce(p->'odoo'->>'vence_el', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\Z' THEN (p->'odoo'->>'vence_el')::date END;
  IF p->>'tipo' = 'directo' THEN
    v_s := round(extract(epoch FROM now() - v_f.enviada_at)::numeric, 1);
    UPDATE conceptualizador.voz_rafaga SET directo_at = coalesce(directo_at, now()), directo_s = coalesce(directo_s, v_s),
           odoo_ok = coalesce((p->>'ok')::boolean, false), odoo_so = coalesce(left(p->'odoo'->>'so', 40), odoo_so), vence_el = coalesce(v_vence, vence_el)
     WHERE id = v_f.id;
  ELSIF p->>'tipo' = 'aprobada' THEN
    v_s := round(extract(epoch FROM now() - coalesce(v_f.decidida_at, v_f.enviada_at))::numeric, 1);
    UPDATE conceptualizador.voz_rafaga SET aplicada_at = coalesce(aplicada_at, now()), aplicada_s = coalesce(aplicada_s, v_s),
           odoo_ok = coalesce((p->>'ok')::boolean, false), odoo_so = coalesce(left(p->'odoo'->>'so', 40), odoo_so), vence_el = coalesce(v_vence, vence_el)
     WHERE id = v_f.id;
  ELSE
    UPDATE conceptualizador.voz_rafaga SET deshecha_at = coalesce(deshecha_at, now()) WHERE id = v_f.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'rafaga_id', v_f.id, 'segundos', v_s);
END
$mot49$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0049prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0049prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0049prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── la medición, con los segundos ──
CREATE OR REPLACE FUNCTION conceptualizador.voz_metricas(p_dias int DEFAULT 7) RETURNS jsonb
LANGUAGE sql STABLE AS $vm49$
  SELECT jsonb_build_object('dias', p_dias, 'rafagas', count(*), 'notas', coalesce(sum(n_notas), 0),
    'notas_por_rafaga', round(avg(n_notas), 1), 'audio_min', round(coalesce(sum(audio_s), 0) / 60.0, 1),
    'con_entendi', count(entendi_at), 'sin_entendi', count(*) - count(entendi_at),
    'propuestos', coalesce(sum(propuestos), 0), 'aprobados', coalesce(sum(aprobados), 0), 'rechazados', coalesce(sum(rechazados), 0),
    'decididas', count(decidida_at),
    'min_a_entendi_mediana', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM entendi_at - coalesce(grabada_at, enviada_at)) / 60.0))::numeric, 1),
    'min_a_entendi_max', round(max(extract(epoch FROM entendi_at - coalesce(grabada_at, enviada_at)) / 60.0)::numeric, 1),
    -- V1.63g.2 · lo aplicado por código: directo al enviar y al aprobar, en segundos, y si quedó releído en Odoo
    'directos', coalesce(sum(directos), 0), 'con_directo', count(directo_at),
    'directo_s_mediana', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY directo_s))::numeric, 1), 'directo_s_max', max(directo_s),
    'aplicadas', count(aplicada_at),
    'aplicada_s_mediana', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY aplicada_s))::numeric, 1), 'aplicada_s_max', max(aplicada_s),
    'lentas', count(*) FILTER (WHERE directo_s > coalesce(conceptualizador.cfg('alarma_voz_lenta_s'), 120) OR aplicada_s > coalesce(conceptualizador.cfg('alarma_voz_lenta_s'), 120)),
    'odoo_fallas', count(*) FILTER (WHERE odoo_ok = false), 'deshechas', count(deshecha_at),
    'por_autor', (SELECT coalesce(jsonb_object_agg(autor, n), '{}'::jsonb) FROM (SELECT autor, count(*) n FROM conceptualizador.voz_rafaga
                   WHERE enviada_at > now() - make_interval(days => p_dias) GROUP BY autor) z))
    FROM conceptualizador.voz_rafaga WHERE enviada_at > now() - make_interval(days => p_dias)
$vm49$;
REVOKE ALL ON FUNCTION conceptualizador.voz_metricas(int) FROM PUBLIC;

-- ── la alarma de los 2 minutos ──
DO $ren49a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0049prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0049prev;
  END IF;
END
$ren49a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am49$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0049prev(p_llave);
  v_ahora timestamptz;
  v_s     int;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('voz_directo_v163g') THEN RETURN v_r; END IF;
  -- cz.ahora_prueba solo lo pone pruebas/sql-0049.sh (producción nunca lo define)
  v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
  v_s := greatest(30, coalesce(conceptualizador.cfg('alarma_voz_lenta_s'), 120));
  FOR f IN
    SELECT r.*, k.titulo,
      CASE
        WHEN r.decidida_at IS NOT NULL AND coalesce(r.aprobados, 0) > 0 AND r.aplicada_at IS NULL AND r.decidida_at <= v_ahora - make_interval(secs => v_s) THEN 'aprobada_pendiente'
        WHEN r.aplicada_s > v_s THEN 'aprobada_lenta'
        WHEN r.entendi_at IS NULL AND r.enviada_at <= v_ahora - make_interval(secs => v_s) THEN 'enviada_sin_respuesta'
        WHEN coalesce(r.directos, 0) > 0 AND r.directo_at IS NULL AND r.enviada_at <= v_ahora - make_interval(secs => v_s) THEN 'directo_pendiente'
        WHEN r.directo_s > v_s THEN 'directo_lento'
        WHEN r.odoo_ok = false THEN 'odoo_no_quedo'
      END AS motivo
      FROM conceptualizador.voz_rafaga r JOIN conceptualizador.caso k ON k.id = r.caso_id
     WHERE r.enviada_at > v_ahora - interval '1 day' AND r.deshecha_at IS NULL
  LOOP
    CONTINUE WHEN f.motivo IS NULL;
    v_r := v_r || conceptualizador.alarma('voz_lenta', f.id::text || ':' || f.motivo, coalesce(f.decidida_at, f.enviada_at),
      'Voz de ' || f.autor || ' en «' || left(f.titulo, 60) || '»: ' || CASE f.motivo
        WHEN 'aprobada_pendiente' THEN 'aprobó a las ' || coalesce(conceptualizador.hora_local(f.decidida_at) || ' CST', '?') || ' y a los ' || v_s || ' s todavía no está aplicado.'
        WHEN 'aprobada_lenta' THEN 'de Aprobar a aplicado tardó ' || round(f.aplicada_s) || ' s (el tope es ' || v_s || ').'
        WHEN 'enviada_sin_respuesta' THEN 'envió a las ' || coalesce(conceptualizador.hora_local(f.enviada_at) || ' CST', '?') || ' y a los ' || v_s || ' s no hay ni «Esto entendí» ni nada aplicado.'
        WHEN 'directo_pendiente' THEN 'lo directo (' || f.directos || ') no quedó aplicado a los ' || v_s || ' s de enviar.'
        WHEN 'directo_lento' THEN 'de Enviar a aplicado tardó ' || round(f.directo_s) || ' s (el tope es ' || v_s || ').'
        ELSE 'lo aplicado no quedó en Odoo al releerlo' || coalesce(' (' || f.odoo_so || ')', '') || '.' END,
      'Revisa el trabajo de esa ráfaga en el motor (procesa.js · voz_aplica) y lo que releyó orden-odoo; si es la comprensión del modelo la que tarda, se ve en «Esto entendí».',
      'voz-lenta', jsonb_build_object('rafaga_id', f.id, 'caso_id', f.caso_id, 'autor', f.autor, 'motivo', f.motivo));
  END LOOP;
  RETURN v_r;
END
$am49$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0049prev(text) FROM PUBLIC;
