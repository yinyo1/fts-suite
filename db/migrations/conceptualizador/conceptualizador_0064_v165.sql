-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0064 · V1.65 (fts-suite#442, Esteban 29-oct-2026) · recotizar sobre un machote que ya existe y adoptar su SO
--
-- Caso que la motiva: Mission Foods Albuquerque. COT-0018 (191 versiones, cedido a Ricardo) y SO11875 (draft, USD 942,590, nacida a
-- mano en Odoo el 3-sep y mandada al cliente). Se recotiza por la visita del 28-oct conservando la MISMA SO11875.
--
--   1 · prendido_para(nombre, caso, actor): el renglón del CASO manda; si no hay, el de la PERSONA (`interruptor:<n>@<actor>`); si no,
--       el global. Las piezas nuevas nacen apagadas para todos y encendidas para esteban.delacruz; al nacer un caso de recotización
--       sus renglones del caso se prenden con él (no se queda nada apagado esperando un clic).
--   2 · caso.recotizacion (el machote base y su versión) y mensaje.historia (fecha original y fuente). La historia es de SISTEMA:
--       nunca crea trabajo ni parece un mensaje nuevo, y el hilo la pone arriba en orden cronológico.
--   3 · api_suite: `nueva` con datos.machote_base liga el caso al machote (mismo folio, versiones nuevas) con su versión base; modo
--       `historia` siembra mensajes históricos con su fecha y su fuente (idempotente por clave).
--   4 · comercial.orden_respaldo (solo agregar): las líneas de una SO antes de que la suite la toque. adoptar_orden_v165() hace en UNA
--       transacción el respaldo, las dos ligas (machote.odoo_so_id y machote_orden principal), la orden del caso y el PDF previo como
--       historia del caso. Nunca toca Odoo: eso lo hace conceptualizador/orden-odoo (modo adoptar) con su read-back.
--   5 · las puertas del robot (orden y machote) no mueven nada en un caso de recotización mientras la persona no lo pida: la
--       conciliación queda preparada, NO aplicada, y la SO adoptada no se reescribe sola.
--   6 · respaldar_orden_v165(): el respaldo antes de que «Actualizar» reescriba las líneas (lo llama «Guardar orden»).
-- ORDEN: 0063 → 0064. Aditiva e idempotente. Reversa: reversas/064_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · interruptor por caso, por persona o global ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.prendido_para(p_nombre text, p_caso uuid, p_actor text) RETURNS boolean
LANGUAGE sql STABLE AS $pp64$
  SELECT coalesce(
    (SELECT btrim(c.valor) = '1' FROM conceptualizador.config c WHERE p_caso IS NOT NULL AND c.clave = 'interruptor:' || p_nombre || '@' || p_caso::text),
    (SELECT btrim(c.valor) = '1' FROM conceptualizador.config c WHERE p_actor IS NOT NULL AND c.clave = 'interruptor:' || p_nombre || '@' || p_actor),
    conceptualizador.prendido(p_nombre))
$pp64$;
ALTER FUNCTION conceptualizador.prendido_para(text, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.prendido_para(text, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in64$
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
               'no_esperar_v163g4',
               'superadas_v163g5',
               'criterio_v163i','ruido_v163i','voz_previa_v163i','por_confirmar_v163i','un_paso_v163i','cambio_no_llegado_v163i',
               'frenos_v163i','regla_nueva_v163i','freno_arriba_v163i','fallas_odoo_v163i',
               'idioma_persona_v163i','mic_visible_v163i','rafaga_vacia_v163i',
               'rfc_usa_v163i','cliente_grupo_v163i',
               'ruido_chat_v163i','numero_directo_v163i',
               'sin_ciclo_v163i','alarma_ciclo_v163i','version_vigente_v163i','pdf_odoo_v163i',
               'viaje_oculto_v163i','candado_persona_v163i','pregunta_primero_v163i',
               'rayito_v163i',
               'limpieza_v163i',
               'voz_decide_v164','una_cotizacion_v164',
               'recotizar_v165','historia_v165','adoptar_orden_v165','chatter_orden_v165']
$in64$;

-- Apagados para todos; encendidos para Esteban (decisión de esta sesión, #442: nada se queda apagado esperando su clic).
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(ARRAY['recotizar_v165','historia_v165','adoptar_orden_v165','chatter_orden_v165']) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n || '@esteban.delacruz', '1' FROM unnest(ARRAY['recotizar_v165','historia_v165','adoptar_orden_v165','chatter_orden_v165']) n
ON CONFLICT (clave) DO NOTHING;

-- La pantalla pregunta por la PERSONA que la abre (además del global y del caso): {nombre: bool} de los renglones de esa persona.
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_actor(p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $ia64$
  SELECT coalesce(jsonb_object_agg(substring(c.clave FROM '^interruptor:([a-z0-9_]+)@'), btrim(c.valor) = '1'), '{}'::jsonb)
    FROM conceptualizador.config c
   WHERE p_actor IS NOT NULL AND c.clave LIKE 'interruptor:%@' || p_actor AND c.clave ~ '^interruptor:[a-z0-9_]+@[a-z0-9._-]+\Z'
$ia64$;
ALTER FUNCTION conceptualizador.interruptores_actor(text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.interruptores_actor(text) FROM PUBLIC;

-- ── 2 · columnas ─────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE conceptualizador.caso    ADD COLUMN IF NOT EXISTS recotizacion jsonb;
ALTER TABLE conceptualizador.mensaje ADD COLUMN IF NOT EXISTS historia jsonb;

-- ── 4 · respaldo de órdenes (solo agregar) ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comercial.orden_respaldo (
  id            bigserial   PRIMARY KEY,
  odoo_so_id    int         NOT NULL,
  odoo_so_name  text,
  machote_id    uuid,
  caso_id       uuid,
  motivo        text        NOT NULL CHECK (motivo IN ('adopcion','actualizar')),
  estado_odoo   text,
  empresa_id    int,
  moneda        text,
  partner_id    int,
  subtotal      numeric(16,2),
  vigencia      date,
  nota          text,
  lineas        jsonb       NOT NULL,
  n_lineas      int         NOT NULL,
  huella        text        NOT NULL,
  por           text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orden_respaldo_so ON comercial.orden_respaldo (odoo_so_id, id);
REVOKE UPDATE, DELETE, TRUNCATE ON comercial.orden_respaldo FROM PUBLIC;
DO $gr64r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT SELECT, INSERT ON comercial.orden_respaldo TO comercial_app;
    GRANT USAGE ON SEQUENCE comercial.orden_respaldo_id_seq TO comercial_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON comercial.orden_respaldo FROM comercial_app;
  END IF;
END
$gr64r$;

-- La adopción también es un origen de la liga machote ↔ orden (la 011 tenía manual · al_crear · migracion).
ALTER TABLE comercial.machote_orden DROP CONSTRAINT IF EXISTS machote_orden_origen_ck;
ALTER TABLE comercial.machote_orden ADD CONSTRAINT machote_orden_origen_ck CHECK (origen IN ('manual','al_crear','migracion','adopcion'));

-- ── 3a · la liga del caso con su machote base ────────────────────────────────────────────────────────────
-- p_aplicar = false: solo revisa (antes de crear el caso). true: liga. Devuelve {ok, error, mensaje, ...}.
CREATE OR REPLACE FUNCTION conceptualizador.recotizar_v165(p_caso uuid, p_actor text, p_machote uuid, p_version int, p_aplicar boolean) RETURNS jsonb
LANGUAGE plpgsql AS $rc64$
DECLARE
  m      record;
  v      record;
  v_otro uuid;
  v_ver  int;
  v_emp  int;
  v_mon  text;
  v_cli  int;
BEGIN
  IF NOT conceptualizador.prendido_para('recotizar_v165', p_caso, p_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RECOTIZAR_APAGADO', 'mensaje', 'Recotizar sobre un machote todavía no está habilitado para tu usuario.');
  END IF;
  SELECT x.id, x.folio_txt, x.dueno, x.dueno_nombre, x.odoo_so_id, x.odoo_so_name, x.odoo_partner_id, x.odoo_lead_id, x.archivado_at, x.deleted_at
    INTO m FROM comercial.machote x WHERE x.id = p_machote;
  IF m.id IS NULL OR m.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_EXISTE', 'mensaje', 'Ese machote no existe.');
  END IF;
  IF m.archivado_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_ARCHIVADO', 'mensaje', m.folio_txt || ' está archivado: desarchívalo antes de recotizar.');
  END IF;
  IF NOT (p_actor = m.dueno OR conceptualizador.puede_mover(p_actor, m.dueno) OR conceptualizador.es_admin(p_actor)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO', 'mensaje', m.folio_txt || ' es de ' || coalesce(m.dueno_nombre, m.dueno) || ': pídele que te lo ceda o te lo preste.');
  END IF;
  SELECT k.id INTO v_otro FROM conceptualizador.caso k
   WHERE k.machote_id = p_machote AND k.id IS DISTINCT FROM p_caso AND k.estado IN ('abierto','enviada') AND k.archivado_at IS NULL
   ORDER BY k.created_at DESC LIMIT 1;
  IF v_otro IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_EN_OTRO_CASO', 'caso_id', v_otro,
      'mensaje', m.folio_txt || ' ya es la cotización de otro caso abierto: ábrelo ahí o ciérralo primero.');
  END IF;
  v_ver := coalesce(p_version, (SELECT max(x.version) FROM comercial.machote_version x WHERE x.machote_id = p_machote));
  SELECT x.version, x.total, x.moneda, x.documento->>'empresa_id' AS empresa, x.documento->>'cliente_id' AS cliente,
         x.documento->>'nombre' AS nombre, x.documento->>'cliente' AS cliente_txt
    INTO v FROM comercial.machote_version x WHERE x.machote_id = p_machote AND x.version = v_ver;
  IF v.version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VERSION_NO_EXISTE', 'mensaje', m.folio_txt || ' no tiene la versión ' || coalesce(p_version::text, '¿?') || '.');
  END IF;
  IF v.total IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VERSION_SIN_TOTAL',
      'mensaje', 'La versión ' || v.version || ' de ' || m.folio_txt || ' no tiene total guardado (versión anterior a la V1.53): guárdalo una vez desde el editor y vuelve a intentar.');
  END IF;
  IF NOT p_aplicar THEN RETURN jsonb_build_object('ok', true, 'revisado', true, 'folio', m.folio_txt, 'version', v.version); END IF;

  v_emp := CASE WHEN v.empresa ~ '^[0-9]{1,6}\Z' THEN v.empresa::int END;
  v_mon := CASE WHEN v.moneda IN ('MXN','USD') THEN v.moneda END;
  v_cli := coalesce(m.odoo_partner_id, CASE WHEN v.cliente ~ '^[0-9]{1,9}\Z' THEN v.cliente::int END);
  UPDATE conceptualizador.caso k SET
         machote_id = m.id, machote_folio = m.folio_txt,
         orden_id = coalesce(m.odoo_so_id, k.orden_id), orden_nombre = coalesce(m.odoo_so_name, k.orden_nombre),
         cliente_odoo_id = coalesce(k.cliente_odoo_id, v_cli),
         oportunidad_id = coalesce(k.oportunidad_id, m.odoo_lead_id),
         empresa_id = coalesce(v_emp, k.empresa_id), moneda = coalesce(v_mon, k.moneda),
         cliente = coalesce(k.cliente, nullif(btrim(v.cliente_txt), '')),
         recotizacion = jsonb_build_object('machote_id', m.id, 'folio', m.folio_txt, 'version_base', v.version, 'total_base', v.total,
           'moneda', v_mon, 'nombre_base', v.nombre, 'dueno', m.dueno, 'por', p_actor, 'desde', now(), 'robot_libre', false)
   WHERE k.id = p_caso;
  -- El caso nace con sus piezas encendidas: no se queda nada apagado esperando un clic (#442).
  INSERT INTO conceptualizador.config (clave, valor)
  SELECT 'interruptor:' || n || '@' || p_caso::text, '1' FROM unnest(ARRAY['recotizar_v165','historia_v165','adoptar_orden_v165','chatter_orden_v165']) n
  ON CONFLICT (clave) DO UPDATE SET valor = '1';
  RETURN jsonb_build_object('ok', true, 'folio', m.folio_txt, 'version_base', v.version, 'total_base', v.total, 'orden_id', m.odoo_so_id, 'orden_nombre', m.odoo_so_name);
END
$rc64$;
ALTER FUNCTION conceptualizador.recotizar_v165(uuid, text, uuid, int, boolean) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.recotizar_v165(uuid, text, uuid, int, boolean) FROM PUBLIC;

-- ── 3b · la historia del caso: mensajes de sistema con su fecha original y su fuente ─────────────────────
-- p_items: [{clave, fecha, fuente, texto, adjuntos:[uuid]}]. Idempotente por clave (cliente_id = 'historia:' || clave).
CREATE OR REPLACE FUNCTION conceptualizador.historia_sembrar_v165(p_caso uuid, p_actor text, p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $hs64$
DECLARE
  k      record;
  it     jsonb;
  v_n    int := 0;
  v_ya   int := 0;
  v_msg  bigint;
  v_fec  timestamptz;
  v_meta jsonb;
  v_ids  uuid[];
  v_out  jsonb := '[]'::jsonb;
  i      int := 0;
BEGIN
  SELECT c.id, c.autor, c.estado INTO k FROM conceptualizador.caso c WHERE c.id = p_caso;
  IF k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
  IF NOT conceptualizador.prendido_para('historia_v165', p_caso, p_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'HISTORIA_APAGADA', 'mensaje', 'Sembrar historia todavía no está habilitado para tu usuario.');
  END IF;
  IF NOT (p_actor = k.autor OR conceptualizador.es_admin(p_actor)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO', 'mensaje', 'La historia la siembra el dueño del caso.');
  END IF;
  IF coalesce(jsonb_typeof(p_items), '') <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'HISTORIA_INVALIDA', 'mensaje', 'Entre 1 y 60 renglones de historia.');
  END IF;
  -- Primero se revisa TODO; si un renglón no sirve, no se escribe ninguno.
  FOR it IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    i := i + 1;
    IF coalesce(it->>'clave', '') !~ '^[a-z0-9-]{3,60}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'HISTORIA_CLAVE', 'renglon', i); END IF;
    IF char_length(btrim(coalesce(it->>'texto', ''))) NOT BETWEEN 3 AND 8000 THEN RETURN jsonb_build_object('ok', false, 'error', 'HISTORIA_TEXTO', 'renglon', i); END IF;
    IF char_length(btrim(coalesce(it->>'fuente', ''))) NOT BETWEEN 3 AND 240 THEN RETURN jsonb_build_object('ok', false, 'error', 'HISTORIA_FUENTE', 'renglon', i); END IF;
    BEGIN v_fec := (it->>'fecha')::timestamptz; EXCEPTION WHEN others THEN v_fec := NULL; END;
    IF v_fec IS NULL OR v_fec > now() + interval '1 day' THEN RETURN jsonb_build_object('ok', false, 'error', 'HISTORIA_FECHA', 'renglon', i); END IF;
  END LOOP;
  i := 0;
  FOR it IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    i := i + 1;
    v_fec := (it->>'fecha')::timestamptz;
    SELECT m.id INTO v_msg FROM conceptualizador.mensaje m WHERE m.autor = p_actor AND m.cliente_id = 'historia:' || (it->>'clave');
    IF v_msg IS NOT NULL THEN v_ya := v_ya + 1; v_out := v_out || jsonb_build_object('clave', it->>'clave', 'mensaje_id', v_msg, 'ya_estaba', true); CONTINUE; END IF;
    v_ids := ARRAY(SELECT (a)::uuid FROM jsonb_array_elements_text(coalesce(it->'adjuntos', '[]'::jsonb)) a WHERE a ~ '^[0-9a-f-]{36}\Z');
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', a2.id, 'nombre', a2.nombre, 'tipo', a2.tipo, 'clase', a2.clase, 'bytes', a2.bytes,
             'duracion_s', a2.duracion_s) ORDER BY a2.created_at), '[]'::jsonb)
      INTO v_meta FROM conceptualizador.adjunto a2 WHERE a2.caso_id = p_caso AND a2.id = ANY (v_ids);
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto, adjuntos, escrito_at, cliente_id, historia)
    VALUES (p_caso, 'sistema', p_actor, btrim(it->>'texto'), v_meta, v_fec, 'historia:' || (it->>'clave'),
            jsonb_build_object('fecha', v_fec, 'fuente', btrim(it->>'fuente'), 'clave', it->>'clave', 'orden', i, 'sembrado_por', p_actor, 'sembrado_at', now()))
    RETURNING id INTO v_msg;
    UPDATE conceptualizador.adjunto SET mensaje_id = v_msg WHERE caso_id = p_caso AND id = ANY (v_ids) AND mensaje_id IS NULL;
    v_n := v_n + 1;
    v_out := v_out || jsonb_build_object('clave', it->>'clave', 'mensaje_id', v_msg, 'adjuntos', jsonb_array_length(v_meta));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'sembrados', v_n, 'ya_estaban', v_ya, 'renglones', v_out);
END
$hs64$;
ALTER FUNCTION conceptualizador.historia_sembrar_v165(uuid, text, jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.historia_sembrar_v165(uuid, text, jsonb) FROM PUBLIC;

-- ── hilo(): la historia trae su marca y va ARRIBA, en orden cronológico; lo demás, igual ─────────────────
DO $ren64h$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'hilo_0064prev') THEN
    ALTER FUNCTION conceptualizador.hilo(uuid) RENAME TO hilo_0064prev;
  END IF;
END
$ren64h$;
CREATE OR REPLACE FUNCTION conceptualizador.hilo(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $hilo64$
  SELECT CASE WHEN s.h IS NULL OR jsonb_typeof(s.h->'mensajes') <> 'array'
              OR NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.caso_id = p_caso AND m.historia IS NOT NULL) THEN s.h
         ELSE jsonb_set(s.h, ARRAY['mensajes'], coalesce((
           SELECT jsonb_agg(e.x || CASE WHEN m.historia IS NOT NULL THEN jsonb_build_object('historia', m.historia) ELSE '{}'::jsonb END
                            ORDER BY (m.historia IS NULL), (m.historia->>'fecha')::timestamptz, (m.historia->>'orden')::int, e.o)
             FROM jsonb_array_elements(s.h->'mensajes') WITH ORDINALITY AS e(x, o)
             LEFT JOIN conceptualizador.mensaje m ON m.id = nullif(e.x->>'id','')::bigint), '[]'::jsonb)) END
    FROM (SELECT conceptualizador.hilo_0064prev(p_caso) AS h) s
$hilo64$;
DO $gr64h$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.hilo(uuid), conceptualizador.hilo_0064prev(uuid) TO conceptualizador_app;
  END IF;
END
$gr64h$;

-- ── 4b · adoptar una SO que ya existe (lo llama orden-odoo después de leer Odoo; nunca toca Odoo) ───────────────
-- p: {machote_id, so_id, so_name, actor, caso_id, nonce, respaldo:{estado, empresa_id, moneda, partner_id, subtotal, vigencia, nota,
--     lineas:[...]}, pdf_b64, pdf_nombre, pdf_fecha}
CREATE OR REPLACE FUNCTION conceptualizador.adoptar_orden_v165(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $ad64$
DECLARE
  v_act  text := nullif(btrim(p->>'actor'), '');
  v_mid  uuid := CASE WHEN coalesce(p->>'machote_id', '') ~ '^[0-9a-f-]{36}\Z' THEN (p->>'machote_id')::uuid END;
  v_so   int  := CASE WHEN coalesce(p->>'so_id', '') ~ '^[0-9]{1,9}\Z' THEN (p->>'so_id')::int END;
  v_nom  text := nullif(btrim(p->>'so_name'), '');
  v_caso uuid;
  m      record;
  r      jsonb := coalesce(p->'respaldo', '{}'::jsonb);
  v_otro text;
  v_rid  bigint;
  v_ya   boolean := false;
  v_bin  bytea;
  v_adj  uuid;
  v_msg  bigint;
  v_n    int;
BEGIN
  IF v_act IS NULL OR v_mid IS NULL OR v_so IS NULL OR v_nom IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ADOPCION_INCOMPLETA', 'mensaje', 'Faltan el machote, la orden o quién adopta.');
  END IF;
  SELECT x.id, x.folio_txt, x.dueno, x.dueno_nombre, x.odoo_so_id, x.odoo_so_name, x.deleted_at, x.archivado_at INTO m FROM comercial.machote x WHERE x.id = v_mid;
  IF m.id IS NULL OR m.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_EXISTE', 'mensaje', 'Ese machote no existe.'); END IF;
  v_caso := coalesce(CASE WHEN coalesce(p->>'caso_id', '') ~ '^[0-9a-f-]{36}\Z' THEN (p->>'caso_id')::uuid END,
                     (SELECT k.id FROM conceptualizador.caso k WHERE k.machote_id = v_mid ORDER BY k.created_at DESC LIMIT 1));
  IF v_caso IS NOT NULL AND NOT EXISTS (SELECT 1 FROM conceptualizador.caso k WHERE k.id = v_caso AND k.machote_id = v_mid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_DE_OTRO_MACHOTE', 'mensaje', 'Ese caso no es el de ' || m.folio_txt || '.');
  END IF;
  IF NOT conceptualizador.prendido_para('adoptar_orden_v165', v_caso, v_act) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ADOPTAR_APAGADO', 'mensaje', 'Ligar una orden existente todavía no está habilitado para tu usuario.');
  END IF;
  IF NOT (v_act = m.dueno OR conceptualizador.puede_mover(v_act, m.dueno) OR conceptualizador.es_admin(v_act)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO', 'mensaje', m.folio_txt || ' es de ' || coalesce(m.dueno_nombre, m.dueno) || '.');
  END IF;
  IF m.odoo_so_id IS NOT NULL AND m.odoo_so_id <> v_so THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_CON_OTRA_ORDEN', 'mensaje', m.folio_txt || ' ya es de la orden ' || coalesce(m.odoo_so_name, m.odoo_so_id::text) || ': una orden por machote.');
  END IF;
  SELECT x.folio_txt INTO v_otro FROM comercial.machote x WHERE x.odoo_so_id = v_so AND x.id <> v_mid AND x.deleted_at IS NULL LIMIT 1;
  IF v_otro IS NULL THEN
    SELECT x.folio_txt INTO v_otro FROM comercial.machote_orden mo JOIN comercial.machote x ON x.id = mo.machote_id
     WHERE mo.odoo_so_id = v_so AND mo.machote_id <> v_mid AND mo.desligado_at IS NULL AND mo.principal AND x.deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_otro IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORDEN_YA_LIGADA', 'mensaje', v_nom || ' ya es la orden de ' || v_otro || ': desligala ahí primero.');
  END IF;
  v_ya := coalesce(m.odoo_so_id = v_so, false);
  -- Anti-replay: el nonce de la pantalla se usa una sola vez (la firma ya la revisó orden-odoo).
  IF char_length(coalesce(p->>'nonce', '')) >= 16 THEN
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_act) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA', 'mensaje', 'Esa petición ya se usó: vuelve a tocar el botón.'); END IF;
  END IF;

  IF coalesce(jsonb_typeof(r->'lineas'), '') <> 'array' THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_RESPALDO', 'mensaje', 'No llegaron las líneas de la orden: no se adopta sin respaldo.'); END IF;
  -- El respaldo, una sola vez por adopción (si se reintenta, el de la primera vez manda).
  SELECT x.id INTO v_rid FROM comercial.orden_respaldo x WHERE x.odoo_so_id = v_so AND x.machote_id = v_mid AND x.motivo = 'adopcion' ORDER BY x.id LIMIT 1;
  IF v_rid IS NULL THEN
    INSERT INTO comercial.orden_respaldo (odoo_so_id, odoo_so_name, machote_id, caso_id, motivo, estado_odoo, empresa_id, moneda, partner_id, subtotal, vigencia, nota, lineas, n_lineas, huella, por)
    VALUES (v_so, v_nom, v_mid, v_caso, 'adopcion', r->>'estado', nullif(r->>'empresa_id', '')::int, r->>'moneda', nullif(r->>'partner_id', '')::int,
            nullif(r->>'subtotal', '')::numeric, nullif(r->>'vigencia', '')::date, r->>'nota', r->'lineas', jsonb_array_length(r->'lineas'),
            encode(digest(convert_to((r->'lineas')::text || coalesce(r->>'nota', ''), 'UTF8'), 'sha256'), 'hex'), v_act)
    RETURNING id INTO v_rid;
  END IF;
  IF NOT v_ya THEN
    -- orden_creada_* (CHECK de la 007): quién y cuándo la creó EN ODOO (la orden no la creó la suite); si Odoo no lo dijo, quién la adoptó.
    UPDATE comercial.machote SET odoo_so_id = v_so, odoo_so_name = v_nom, odoo_so_claim_at = NULL,
           orden_creada_at = coalesce(orden_creada_at, CASE WHEN coalesce(p->>'so_creada_at', '') ~ '^[0-9]{4}-' THEN (p->>'so_creada_at')::timestamptz END, now()),
           orden_creada_por = coalesce(orden_creada_por, nullif(left(btrim(coalesce(p->>'so_creada_por', '')), 120), ''), v_act),
           odoo_partner_id = coalesce(odoo_partner_id, nullif(r->>'partner_id', '')::int), updated_by = v_act
     WHERE id = v_mid AND odoo_so_id IS NULL;
  END IF;
  -- La liga explícita: principal y de adopción. Si ya hay una viva de este machote, se deja (una orden viva por machote, 011).
  IF NOT EXISTS (SELECT 1 FROM comercial.machote_orden mo WHERE mo.machote_id = v_mid AND mo.desligado_at IS NULL) THEN
    INSERT INTO comercial.machote_orden (machote_id, odoo_so_id, odoo_so_name, principal, origen, ligado_por, motivo)
    VALUES (v_mid, v_so, v_nom, true, 'adopcion', v_act, left('Adoptada por la suite (respaldo ' || v_rid || ')', 300));
  END IF;
  IF v_caso IS NOT NULL THEN
    UPDATE conceptualizador.caso SET orden_id = v_so, orden_nombre = v_nom, ultima_actividad_at = now() WHERE id = v_caso;
  END IF;
  -- El PDF de la orden tal como estaba: historia del caso, con su fecha (la de la orden) y su fuente.
  IF v_caso IS NOT NULL AND char_length(coalesce(p->>'pdf_b64', '')) > 100 THEN
    BEGIN v_bin := decode(p->>'pdf_b64', 'base64'); EXCEPTION WHEN others THEN v_bin := NULL; END;
    IF v_bin IS NOT NULL AND octet_length(v_bin) BETWEEN 1 AND 10485760 AND substring(v_bin FROM 1 FOR 4) = convert_to('%PDF', 'UTF8') THEN
      INSERT INTO conceptualizador.adjunto (caso_id, autor, nombre, tipo, clase, bytes, sha256, contenido, escrito_at)
      VALUES (v_caso, v_act, coalesce(nullif(btrim(p->>'pdf_nombre'), ''), v_nom || '.pdf'), 'application/pdf', 'pdf', octet_length(v_bin),
              encode(digest(v_bin, 'sha256'), 'hex'), v_bin, now())
      ON CONFLICT (caso_id, sha256) DO UPDATE SET nombre = conceptualizador.adjunto.nombre
      RETURNING id INTO v_adj;
      SELECT x.id INTO v_msg FROM conceptualizador.mensaje x WHERE x.caso_id = v_caso AND x.cliente_id = 'historia:pdf-' || lower(v_nom);
      IF v_msg IS NULL THEN
        INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto, adjuntos, escrito_at, cliente_id, historia)
        VALUES (v_caso, 'sistema', v_act,
                '📄 ' || v_nom || ' tal como está en Odoo (' || coalesce(r->>'moneda', '') || ' ' || coalesce(to_char(nullif(r->>'subtotal', '')::numeric, 'FM999,999,999,990.00'), '') || ' antes de impuestos, ' ||
                jsonb_array_length(r->'lineas') || ' renglones). Es la que conoce el cliente. El PDF se regeneró hoy desde Odoo con la plantilla vigente: ' ||
                'el contenido es el de la orden, el formato puede no ser idéntico al archivo que se mandó.',
                jsonb_build_array(jsonb_build_object('id', v_adj, 'nombre', coalesce(nullif(btrim(p->>'pdf_nombre'), ''), v_nom || '.pdf'), 'tipo', 'application/pdf',
                  'clase', 'pdf', 'bytes', octet_length(v_bin), 'duracion_s', NULL)),
                coalesce(nullif(p->>'pdf_fecha', '')::timestamptz, now()), 'historia:pdf-' || lower(v_nom),
                jsonb_build_object('fecha', coalesce(nullif(p->>'pdf_fecha', '')::timestamptz, now()), 'fuente', 'Odoo · ' || v_nom || ' (PDF regenerado al adoptarla)',
                  'clave', 'pdf-' || lower(v_nom), 'orden', 0, 'sembrado_por', v_act, 'sembrado_at', now()))
        RETURNING id INTO v_msg;
        UPDATE conceptualizador.adjunto SET mensaje_id = v_msg WHERE id = v_adj AND mensaje_id IS NULL;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'ya_estaba', v_ya, 'respaldo_id', v_rid, 'caso_id', v_caso, 'adjunto_id', v_adj, 'mensaje_id', v_msg,
    'readback', jsonb_build_object(
      'machote', (SELECT jsonb_build_object('folio', x.folio_txt, 'odoo_so_id', x.odoo_so_id, 'odoo_so_name', x.odoo_so_name) FROM comercial.machote x WHERE x.id = v_mid),
      'liga', (SELECT jsonb_build_object('odoo_so_id', mo.odoo_so_id, 'principal', mo.principal, 'origen', mo.origen) FROM comercial.machote_orden mo
                WHERE mo.machote_id = v_mid AND mo.desligado_at IS NULL ORDER BY mo.id DESC LIMIT 1),
      'caso', (SELECT jsonb_build_object('orden_id', k.orden_id, 'orden_nombre', k.orden_nombre) FROM conceptualizador.caso k WHERE k.id = v_caso),
      'respaldo', (SELECT jsonb_build_object('id', x.id, 'n_lineas', x.n_lineas, 'subtotal', x.subtotal, 'huella', left(x.huella, 12)) FROM comercial.orden_respaldo x WHERE x.id = v_rid)));
END
$ad64$;
ALTER FUNCTION conceptualizador.adoptar_orden_v165(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.adoptar_orden_v165(jsonb) FROM PUBLIC;

-- ── 6 · respaldo antes de «Actualizar» (lo llama «Guardar orden» con las líneas que leyó antes de reescribir) ─────────────
CREATE OR REPLACE FUNCTION conceptualizador.respaldar_orden_v165(p_machote uuid, p_so int, p_actor text, p_respaldo jsonb) RETURNS bigint
LANGUAGE plpgsql AS $ro64$
DECLARE
  v_caso uuid;
  v_id   bigint;
BEGIN
  IF p_respaldo IS NULL OR coalesce(jsonb_typeof(p_respaldo->'lineas'), '') <> 'array' OR p_so IS NULL THEN RETURN NULL; END IF;
  SELECT k.id INTO v_caso FROM conceptualizador.caso k WHERE k.machote_id = p_machote ORDER BY k.created_at DESC LIMIT 1;
  IF NOT conceptualizador.prendido_para('chatter_orden_v165', v_caso, p_actor) THEN RETURN NULL; END IF;
  INSERT INTO comercial.orden_respaldo (odoo_so_id, odoo_so_name, machote_id, caso_id, motivo, estado_odoo, subtotal, nota, lineas, n_lineas, huella, por)
  VALUES (p_so, p_respaldo->>'so_name', p_machote, v_caso, 'actualizar', p_respaldo->>'estado', nullif(p_respaldo->>'subtotal', '')::numeric, p_respaldo->>'nota',
          p_respaldo->'lineas', jsonb_array_length(p_respaldo->'lineas'),
          encode(digest(convert_to((p_respaldo->'lineas')::text || coalesce(p_respaldo->>'nota', ''), 'UTF8'), 'sha256'), 'hex'), coalesce(p_actor, 'orden-odoo'))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$ro64$;
ALTER FUNCTION conceptualizador.respaldar_orden_v165(uuid, int, text, jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.respaldar_orden_v165(uuid, int, text, jsonb) FROM PUBLIC;

-- Lo que orden-odoo necesita saber de las piezas V1.65 para UN machote y UNA persona, sin abrirle la tabla config.
CREATE OR REPLACE FUNCTION conceptualizador.orden_v165(p_machote uuid, p_actor text) RETURNS jsonb
LANGUAGE sql STABLE AS $ov64$
  SELECT jsonb_build_object(
    'caso_id', k.id,
    'adoptar', conceptualizador.prendido_para('adoptar_orden_v165', k.id, p_actor),
    'chatter', conceptualizador.prendido_para('chatter_orden_v165', k.id, p_actor),
    'recotizacion', k.recotizacion)
  FROM (SELECT (SELECT c.id FROM conceptualizador.caso c WHERE c.machote_id = p_machote ORDER BY c.created_at DESC LIMIT 1) AS id,
               (SELECT c.recotizacion FROM conceptualizador.caso c WHERE c.machote_id = p_machote ORDER BY c.created_at DESC LIMIT 1) AS recotizacion) k
$ov64$;
ALTER FUNCTION conceptualizador.orden_v165(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v165(uuid, text) FROM PUBLIC;

DO $gr64o$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.adoptar_orden_v165(jsonb), conceptualizador.respaldar_orden_v165(uuid, int, text, jsonb),
                              conceptualizador.orden_v165(uuid, text) TO comercial_app;
  END IF;
END
$gr64o$;

-- ── 5 · las puertas del robot: en una recotización no mueven nada sin la instrucción de la persona ──────────────
DO $ren64r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'robot_gate_v163e_0064prev') THEN
    ALTER FUNCTION conceptualizador.robot_gate_v163e(uuid, text) RENAME TO robot_gate_v163e_0064prev;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'robot_machote_v163e_0064prev') THEN
    ALTER FUNCTION conceptualizador.robot_machote_v163e(uuid, text) RENAME TO robot_machote_v163e_0064prev;
  END IF;
END
$ren64r$;

CREATE OR REPLACE FUNCTION conceptualizador.recotizacion_bloquea_robot(p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $rb64$
  SELECT coalesce((SELECT c.recotizacion IS NOT NULL AND coalesce((c.recotizacion->>'robot_libre')::boolean, false) = false
                     FROM conceptualizador.caso c WHERE c.id = p_caso), false)
$rb64$;
ALTER FUNCTION conceptualizador.recotizacion_bloquea_robot(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.recotizacion_bloquea_robot(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.robot_gate_v163e(p_machote uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rg64$
DECLARE v_caso uuid;
BEGIN
  SELECT c.id INTO v_caso FROM conceptualizador.caso c WHERE c.machote_id = p_machote ORDER BY c.created_at DESC LIMIT 1;
  IF conceptualizador.recotizacion_bloquea_robot(v_caso) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RECOTIZACION_SIN_INSTRUCCION',
      'mensaje', 'Caso de recotización: la orden adoptada no se reescribe sola. La Rev. 2 la pide la persona desde el caso.');
  END IF;
  RETURN conceptualizador.robot_gate_v163e_0064prev(p_machote, p_actor);
END
$rg64$;
ALTER FUNCTION conceptualizador.robot_gate_v163e(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.robot_gate_v163e(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.robot_gate_v163e_0064prev(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.robot_machote_v163e(p_caso uuid, p_id_local text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rm64$
BEGIN
  IF conceptualizador.recotizacion_bloquea_robot(p_caso) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RECOTIZACION_SIN_INSTRUCCION',
      'mensaje', 'Caso de recotización: la conciliación queda propuesta y no se aplica sola. La aplica la persona desde la tarjeta.');
  END IF;
  RETURN conceptualizador.robot_machote_v163e_0064prev(p_caso, p_id_local);
END
$rm64$;
ALTER FUNCTION conceptualizador.robot_machote_v163e(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.robot_machote_v163e_0064prev(uuid, text) FROM PUBLIC;
DO $gr64m$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) TO comercial_app;
  END IF;
END
$gr64m$;

-- ── 3c · api_suite: `nueva` con machote base, modo `historia` y los interruptores de la persona en las respuestas ─────────
DO $ren64s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0064prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0064prev;
  END IF;
END
$ren64s$;
CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui64$
DECLARE
  v_actor text := nullif(btrim(p->>'actor'), '');
  v_modo  text := p->>'modo';
  v_base  jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' AND jsonb_typeof(p->'datos'->'machote_base') = 'object' THEN p->'datos'->'machote_base' END;
  v_mid   uuid;
  v_ver   int;
  v_rev   jsonb;
  v_r     jsonb;
  v_cid   uuid;
  v_n     int;
BEGIN
  IF v_modo = 'nueva' AND v_base IS NOT NULL THEN
    v_mid := CASE WHEN coalesce(v_base->>'machote_id', '') ~ '^[0-9a-f-]{36}\Z' THEN (v_base->>'machote_id')::uuid END;
    v_ver := CASE WHEN coalesce(v_base->>'version', '') ~ '^[0-9]{1,6}\Z' THEN (v_base->>'version')::int END;
    IF v_mid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_BASE_INVALIDO', 'mensaje', 'Falta el machote base.'); END IF;
    -- Se revisa ANTES de crear el caso: si no se puede recotizar, no queda un caso a medias.
    v_rev := conceptualizador.recotizar_v165(NULL, v_actor, v_mid, v_ver, false);
    IF NOT coalesce((v_rev->>'ok')::boolean, false) THEN RETURN v_rev; END IF;
    v_r := conceptualizador.api_suite_0064prev(p);
    v_cid := nullif(v_r->>'caso_id', '')::uuid;
    IF coalesce((v_r->>'ok')::boolean, false) AND v_cid IS NOT NULL AND NOT coalesce((v_r->>'ya_estaba')::boolean, false) THEN
      v_rev := conceptualizador.recotizar_v165(v_cid, v_actor, v_mid, v_ver, true);
      v_r := v_r || jsonb_build_object('recotizacion', v_rev);
    END IF;
    RETURN v_r;
  END IF;

  IF v_modo = 'historia' THEN
    -- Mismo anti-replay que el resto de la API (la firma ya la revisó el workflow).
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
    IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA'); END IF;
    v_cid := CASE WHEN coalesce(p->>'caso_id', '') ~ '^[0-9a-f-]{36}\Z' THEN (p->>'caso_id')::uuid END;
    IF v_cid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    RETURN conceptualizador.historia_sembrar_v165(v_cid, v_actor, coalesce(p->'datos'->'items', '[]'::jsonb));
  END IF;

  v_r := conceptualizador.api_suite_0064prev(p);
  -- El hilo de un caso de recotización trae el DOCUMENTO de la versión guardada del machote: la pantalla compara contra él la
  -- propuesta del agente, sección por sección (cz-deltas.js). Solo en esos casos y con el interruptor prendido.
  IF v_modo = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'hilo'->'caso'->'recotizacion') = 'object' THEN
    v_cid := conceptualizador.a_uuid(v_r->'hilo'->'caso'->>'id');
    IF conceptualizador.prendido_para('recotizar_v165', v_cid, v_actor) THEN
      v_r := jsonb_set(v_r, ARRAY['hilo','machote_doc'], coalesce((
        SELECT jsonb_build_object('version', x.version, 'total', x.total, 'moneda', x.moneda, 'documento', x.documento)
          FROM comercial.machote_version x WHERE x.machote_id = conceptualizador.a_uuid(v_r->'hilo'->'caso'->>'machote_id') ORDER BY x.version DESC LIMIT 1), 'null'::jsonb));
    END IF;
  END IF;
  -- Las respuestas que ya traen `interruptores` traen también los de la persona (la pantalla los suma a los del caso).
  IF coalesce((v_r->>'ok')::boolean, false) AND v_r ? 'interruptores' AND v_actor IS NOT NULL THEN
    v_r := v_r || jsonb_build_object('interruptores_actor', conceptualizador.interruptores_actor(v_actor));
  END IF;
  RETURN v_r;
END
$sui64$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0064prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0064prev(jsonb) FROM PUBLIC;
DO $gr64s$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_suite_0064prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
  END IF;
END
$gr64s$;
