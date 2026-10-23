-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0035 · V1.62 (fts-conceptualizador#12): el barrido retroactivo del decreto 6355360152
--
-- Decreto de Esteban (22-oct 19:42 CST): las mejoras de la V1.62 se aplican hacia atrás, a TODOS los casos abiertos reales de
-- Montalvo, Richard y Esteban, sin clic de nadie. Ensayo aprobado tal cual en 6358869693 (23-oct).
--
--   barrido_v162 (interruptor, arranca en '0')
--     · `barrido_encolar(motivo)` pone UN evento `barrido` (con su trabajo) por caso abierto real de los tres, si el caso no tiene
--       ya uno pendiente. Lo llama quien prende un interruptor (el TMP del despliegue), en la misma consulta.
--     · el motor lo trabaja SIN modelo (herramientas/motor/barrido.js): adopta la versión vigente de la base (lo editado por una
--       persona manda), nombre con sentido, N0 en los renglones que dio la persona, descarta las tarjetas viejas, y en una orden
--       en BORRADOR la actualiza (decisión a) para que nota e hitos digan lo mismo. Una orden ENVIADA no cambia montos ni alcance.
--   decreto_servidor · el decreto como instrucción de la persona EN EL SERVIDOR (condición 4 de 6353905357): agente_gate acepta un
--     trabajo `barrido` si hay un decreto vigente con alcance 'barrido'. Persona, origen y vigencia (7 días) los fija esta
--     migración; el motor no puede crear decretos (no hay modo para eso).
--   barrido_caso · lo que cambió en cada caso (antes → después) y lo que quedó descuadrado. Alarma `barrido_descuadrado` (cuenta
--     desde que se prendió el interruptor, como la 0033).
-- Apagado, todo sale igual que con la 0034. Reversa: reversas/035_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in35$
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
               'barrido_v162']
$in35$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE conceptualizador.evento DROP CONSTRAINT IF EXISTS evento_tipo_check;
ALTER TABLE conceptualizador.evento ADD CONSTRAINT evento_tipo_check
  CHECK (tipo IN ('aceptar','rechazar','correccion','precio_real','agregar','cierra','accion','ejecucion','continuacion',
                  'palomeada','prueba','que_falta','ciudad','detener','arranque','barrido'));

-- ── el decreto como instrucción en el servidor ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.decreto_servidor (
  id       bigserial   PRIMARY KEY,
  persona  text        NOT NULL,
  origen   text        NOT NULL UNIQUE,
  texto    text        NOT NULL,
  alcance  text        NOT NULL CHECK (alcance IN ('barrido')),
  dicho_at timestamptz NOT NULL,
  hasta    timestamptz NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO conceptualizador.decreto_servidor (persona, origen, texto, alcance, dicho_at, hasta)
VALUES ('esteban.delacruz', '#12 6355360152',
        'Que estas mejoras se hagan retroactivas a los proyectos que ya están creados, sin necesidad de que yo haga nada: a las de Montalvo, a las de Richard; que no dependa de que alguien le dé un clic.',
        'barrido', '2026-10-23 01:42:00+00', now() + interval '7 days')
ON CONFLICT (origen) DO NOTHING;

CREATE TABLE IF NOT EXISTS conceptualizador.barrido_caso (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  trabajo_id  bigint      NOT NULL UNIQUE,
  decreto_id  bigint      NOT NULL REFERENCES conceptualizador.decreto_servidor(id),
  cambios     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  propuestos  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  descuadre   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS barrido_caso_at ON conceptualizador.barrido_caso (at DESC);

CREATE OR REPLACE FUNCTION conceptualizador.decreto_barrido() RETURNS conceptualizador.decreto_servidor
LANGUAGE sql STABLE AS $db35$
  SELECT d.* FROM conceptualizador.decreto_servidor d WHERE d.alcance = 'barrido' AND d.hasta > now() ORDER BY d.id DESC LIMIT 1
$db35$;

-- ── encolar: un evento `barrido` por caso abierto real de los tres ─────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.barrido_encolar(p_motivo text) RETURNS jsonb
LANGUAGE plpgsql AS $be35$
DECLARE
  v_d  conceptualizador.decreto_servidor;
  k    record;
  v_ev bigint;
  v_n  int := 0;
  v_ya int := 0;
BEGIN
  IF NOT conceptualizador.prendido('barrido_v162') THEN RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO'); END IF;
  v_d := conceptualizador.decreto_barrido();
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_DECRETO'); END IF;
  FOR k IN SELECT c.id FROM conceptualizador.caso c
            WHERE NOT c.demo AND c.estado IN ('abierto','enviada') AND c.carpeta IS NOT NULL
              AND c.autor IN ('francisco.montalvo','ricardo.hernandez','esteban.delacruz') ORDER BY c.created_at LOOP
    IF EXISTS (SELECT 1 FROM conceptualizador.trabajo t JOIN conceptualizador.evento e ON e.id = t.evento_id
                WHERE t.caso_id = k.id AND e.tipo = 'barrido' AND t.estado IN ('pendiente','tomado')) THEN
      v_ya := v_ya + 1; CONTINUE;
    END IF;
    INSERT INTO conceptualizador.evento (caso_id, tipo, concepto, datos, autor)
    VALUES (k.id, 'barrido', left(coalesce(p_motivo, 'barrido'), 200), jsonb_build_object('decreto_id', v_d.id, 'origen', v_d.origen, 'persona', v_d.persona, 'dicho_at', v_d.dicho_at), 'decreto')
    RETURNING id INTO v_ev;
    INSERT INTO conceptualizador.trabajo (caso_id, tipo, evento_id) VALUES (k.id, 'evento', v_ev);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'encolados', v_n, 'ya_tenian', v_ya, 'decreto', v_d.origen);
END
$be35$;
ALTER FUNCTION conceptualizador.barrido_encolar(text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.barrido_encolar(text) FROM PUBLIC;

-- ── agente_gate: un trabajo `barrido` con decreto vigente cuenta como instrucción de la persona ─────
DO $ren35g$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'agente_gate_0035prev') THEN
    ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) RENAME TO agente_gate_0035prev;
  END IF;
END
$ren35g$;

CREATE OR REPLACE FUNCTION conceptualizador.agente_gate(p_trabajo bigint, p_machote uuid, p_para text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $ag35$
DECLARE
  v_sw   text := CASE WHEN p_para = 'orden' THEN 'todo_hecho_v162b' ELSE 'guardar_agente_v162b' END;
  t      record;
  v_d    conceptualizador.decreto_servidor;
  v_due  text;
  v_mach uuid;
BEGIN
  SELECT tr.id, tr.caso_id, tr.estado, e.tipo AS ev_tipo INTO t FROM conceptualizador.trabajo tr
    LEFT JOIN conceptualizador.evento e ON e.id = tr.evento_id WHERE tr.id = p_trabajo;
  IF t.id IS NULL OR t.ev_tipo IS DISTINCT FROM 'barrido' OR NOT conceptualizador.prendido('barrido_v162') OR NOT conceptualizador.prendido(v_sw) THEN
    RETURN conceptualizador.agente_gate_0035prev(p_trabajo, p_machote, p_para);
  END IF;
  v_d := conceptualizador.decreto_barrido();
  IF v_d.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_INSTRUCCION', 'mensaje', 'El decreto del barrido ya venció: que Esteban lo renueve.');
  END IF;
  IF t.estado <> 'tomado' THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_INSTRUCCION', 'mensaje', 'Ese trabajo ya no está en curso.'); END IF;
  SELECT k.machote_id INTO v_mach FROM conceptualizador.caso k WHERE k.id = t.caso_id;
  IF p_machote IS NULL OR v_mach IS DISTINCT FROM p_machote THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'Ese machote no es el del caso del barrido.');
  END IF;
  IF to_regclass('comercial.machote') IS NOT NULL THEN
    EXECUTE 'SELECT dueno FROM comercial.machote WHERE id = ' || quote_literal(p_machote::text) || '::uuid' INTO v_due;
  END IF;
  IF v_due IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_ENCONTRADO'); END IF;
  IF NOT (v_d.persona = v_due OR conceptualizador.puede_mover(v_d.persona, v_due)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_PUEDE_MOVER', 'persona', v_d.persona, 'dueno', v_due);
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', 'decreto', 'persona', v_d.persona, 'dueno', v_due, 'mensaje_id', v_d.origen,
    'caso_id', t.caso_id, 'msg_at', v_d.dicho_at, 'hora', to_char(v_d.dicho_at AT TIME ZONE 'America/Monterrey', 'HH24:MI "del" DD-MM'),
    'motivo', 'lo guardó el agente por decreto de Esteban del 22-oct (' || v_d.origen || ')');
END
$ag35$;
ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.agente_gate_0035prev(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate_0035prev(bigint, uuid, text) FROM PUBLIC;
DO $gr35$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) TO comercial_app;
  END IF;
END
$gr35$;

-- ── api_motor: entregar de un barrido registra lo que cambió y descarta las tarjetas que el motor nombra ─────
DO $ren35m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0035prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0035prev;
  END IF;
END
$ren35m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot35$
DECLARE
  v_id   bigint := conceptualizador.a_entero(p->>'trabajo_id');
  v_b    jsonb := CASE WHEN jsonb_typeof(p->'respuesta'->'barrido') = 'object' THEN p->'respuesta'->'barrido' ELSE NULL END;
  v_r    jsonb;
  t      record;
  x      jsonb;
  v_n    int := 0;
  v_d    conceptualizador.decreto_servidor;
BEGIN
  IF p->>'modo' = 'entregar' AND v_b IS NOT NULL AND conceptualizador.prendido('barrido_v162') THEN
    SELECT tr.id, tr.caso_id, tr.estado, e.tipo AS ev_tipo, e.datos AS ev_datos INTO t FROM conceptualizador.trabajo tr
      LEFT JOIN conceptualizador.evento e ON e.id = tr.evento_id WHERE tr.id = v_id;
    IF t.id IS NOT NULL AND t.ev_tipo = 'barrido' AND t.estado = 'tomado' THEN
      v_r := conceptualizador.api_motor_0035prev(p);
      IF coalesce((v_r->>'ok')::boolean, false) THEN
        FOR x IN SELECT * FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_b->'descartar') = 'array' THEN v_b->'descartar' ELSE '[]'::jsonb END) LOOP
          UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
                 resultado = jsonb_build_object('barrido', v_id, 'razon', left(coalesce(x->>'razon', ''), 300))
           WHERE a.id = conceptualizador.a_entero(x->>'id') AND a.caso_id = t.caso_id AND a.estado = 'propuesta'
             AND a.tipo IN ('crear_machote','crear_borrador','enviada');
          v_n := v_n + (SELECT count(*) FROM conceptualizador.accion a WHERE a.id = conceptualizador.a_entero(x->>'id') AND a.estado = 'descartada'
                          AND a.resultado->>'barrido' = v_id::text)::int;
        END LOOP;
        v_d := conceptualizador.decreto_barrido();
        INSERT INTO conceptualizador.barrido_caso (caso_id, trabajo_id, decreto_id, cambios, propuestos, descuadre)
        VALUES (t.caso_id, v_id, coalesce(conceptualizador.a_entero(t.ev_datos->>'decreto_id'), v_d.id),
                CASE WHEN jsonb_typeof(v_b->'cambios') = 'array' THEN v_b->'cambios' ELSE '[]'::jsonb END,
                CASE WHEN jsonb_typeof(v_b->'propuestos') = 'array' THEN v_b->'propuestos' ELSE '[]'::jsonb END,
                CASE WHEN jsonb_typeof(v_b->'descuadre') = 'array' THEN v_b->'descuadre' ELSE '[]'::jsonb END)
        ON CONFLICT (trabajo_id) DO NOTHING;
        v_r := v_r || jsonb_build_object('barrido', jsonb_build_object('descartadas', v_n));
      END IF;
      RETURN v_r;
    END IF;
  END IF;
  RETURN conceptualizador.api_motor_0035prev(p);
END
$mot35$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0035prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0035prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0035prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── medición y alarma ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.barrido_medir() RETURNS jsonb
LANGUAGE sql STABLE AS $bm35$
  WITH ult AS (SELECT DISTINCT ON (b.caso_id) b.* FROM conceptualizador.barrido_caso b ORDER BY b.caso_id, b.id DESC)
  SELECT jsonb_build_object(
    'casos_barridos', (SELECT count(*) FROM ult),
    'corregidos', (SELECT count(*) FROM ult WHERE jsonb_array_length(cambios) > 0),
    'descuadrados', (SELECT count(*) FROM ult WHERE jsonb_array_length(descuadre) > 0),
    'propuestos', (SELECT count(*) FROM ult WHERE jsonb_array_length(propuestos) > 0),
    'pendientes', (SELECT count(*) FROM conceptualizador.trabajo t JOIN conceptualizador.evento e ON e.id = t.evento_id
                    WHERE e.tipo = 'barrido' AND t.estado IN ('pendiente','tomado')),
    'detalle', (SELECT coalesce(jsonb_agg(jsonb_build_object('caso', k.carpeta, 'trabajo', u.trabajo_id, 'cambios', u.cambios,
                  'propuestos', u.propuestos, 'descuadre', u.descuadre, 'at', u.at) ORDER BY u.at), '[]'::jsonb)
                 FROM ult u JOIN conceptualizador.caso k ON k.id = u.caso_id))
$bm35$;
ALTER FUNCTION conceptualizador.barrido_medir() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.barrido_medir() FROM PUBLIC;

DO $ren35a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0035prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0035prev;
  END IF;
END
$ren35a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am35$
DECLARE
  v_r jsonb := conceptualizador.alarmas_motor_0035prev(p_llave);
  x   record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('barrido_v162') THEN RETURN v_r; END IF;
  SELECT b.id, b.at, k.carpeta, b.descuadre INTO x FROM conceptualizador.barrido_caso b JOIN conceptualizador.caso k ON k.id = b.caso_id
   WHERE jsonb_array_length(b.descuadre) > 0 AND b.at > conceptualizador.prendido_desde('barrido_v162')
     AND NOT EXISTS (SELECT 1 FROM conceptualizador.barrido_caso b2 WHERE b2.caso_id = b.caso_id AND b2.id > b.id)
   ORDER BY b.id DESC LIMIT 1;
  IF x.id IS NOT NULL THEN
    v_r := v_r || conceptualizador.alarma('barrido_descuadrado', x.id::text, x.at,
      'Después del barrido, el caso ' || coalesce(x.carpeta, '?') || ' sigue descuadrado: ' || left(x.descuadre::text, 200),
      'Revisa ese caso: lo que el barrido no pudo arreglar solo (una orden enviada, una edición de la persona que no se pudo adoptar).',
      'barrido-descuadrado', jsonb_build_object('caso', x.carpeta));
  END IF;
  -- Lo que el barrido NO cambia solo y deja propuesto UNA vez con sus dos cifras (una orden enviada; una versión que la persona
  -- guardó a mano muy distinta de la del agente, como GEPP v7 contra v6): llega al correo de Esteban y al chat del dueño.
  SELECT b.id, b.at, k.carpeta, b.propuestos INTO x FROM conceptualizador.barrido_caso b JOIN conceptualizador.caso k ON k.id = b.caso_id
   WHERE jsonb_array_length(b.propuestos) > 0 AND b.at > conceptualizador.prendido_desde('barrido_v162')
     AND NOT EXISTS (SELECT 1 FROM conceptualizador.barrido_caso b2 WHERE b2.caso_id = b.caso_id AND b2.id > b.id)
   ORDER BY b.id DESC LIMIT 1;
  IF x.id IS NOT NULL THEN
    v_r := v_r || conceptualizador.alarma('barrido_por_confirmar', x.id::text, x.at,
      'El barrido dejó algo por confirmar en ' || coalesce(x.carpeta, '?') || ': ' || left(coalesce(x.propuestos->0->>'texto', x.propuestos::text), 240),
      'Que el dueño lo confirme en su chat antes de enviar; el barrido no cambia montos de lo enviado ni pisa lo que editó una persona.',
      'barrido-por-confirmar', jsonb_build_object('caso', x.carpeta, 'propuestos', x.propuestos));
  END IF;
  RETURN v_r;
END
$am35$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0035prev(text) FROM PUBLIC;
