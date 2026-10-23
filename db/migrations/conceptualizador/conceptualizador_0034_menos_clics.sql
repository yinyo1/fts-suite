-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0034 · V1.62b (fts-conceptualizador#12): menos clics y PDF guardado
--
-- Cuatro interruptores nuevos, todos en '0'. Apagados, todo sale IGUAL que con la 0033 (pruebas/sql-0034.sh lo compara).
--
--   guardar_agente_v162b · el agente guarda una versión nueva del machote (comercial/machote-guardar, camino de servicio) SOLO
--                          por instrucción de una persona (6353905357, las 5 condiciones):
--                            1. misma regla puede_mover que orden-odoo;
--                            2. siempre versión n+1 (machote-guardar nunca sobrescribe; revertir = guardar la anterior como n+2);
--                            3. el motivo dice «por instrucción de <persona> (msg N) a las HH:MM»;
--                            4. el trabajo nace de un mensaje de una persona (rol usuario) de ese caso; un avance, una propagación o
--                               un evento sin persona se rechaza con SIN_INSTRUCCION. Lo revisa la BASE (agente_gate), no el modelo;
--                            5. cada guardado queda en `guardado_agente` (por día y dueño) con «cuadra» = el total guardado es el
--                               precio que calculó el motor, al centavo; uno que no cuadra dispara `guardado_no_cuadra`.
--                          Apagado, el camino de servicio sigue como la V1.47 (el avance sube versiones como hoy).
--   todo_hecho_v162b     · decisión a (6342519714): el motor crea o actualiza SOLO el borrador en Odoo (orden-odoo, camino del
--                          motor) cuando una persona lo pidió, la orden está en borrador (o no existe) y no hay N5. Nunca la marca
--                          enviada ni la confirma; si ya está enviada, no la toca: un solo botón. `entregar` registra lo que el
--                          agente ya hizo como acciones `hecha` (hecha_por 'agente') con su resultado.
--   pdf_v162b            · el PDF que bajó del portal de Odoo se guarda por orden y `write_date`: si la orden no cambió, no se vuelve
--                          a pedir a Odoo. `hilo.ultimo_pdf` lo trae para el ⋮ y la vista rápida.
--   revision_v162b       · «Cotizar con referencias» deja de frenar el borrador y pasa a la revisión final antes de «Ya la mandé»
--                          (6342660185): orden-odoo lo lee de orden_v162b().
--
-- Medición: el panel (`config`) trae `v162b_24h`. Alarma: `guardado_no_cuadra` (cuenta desde que se prendió su interruptor,
-- como la 0033). Reversa: reversas/034_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in34$
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
               'guardar_agente_v162b','todo_hecho_v162b','pdf_v162b','revision_v162b']
$in34$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── lo que guardó el agente (condición 5) y el PDF guardado ──────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.guardado_agente (
  id           bigserial   PRIMARY KEY,
  caso_id      uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  trabajo_id   bigint      NOT NULL,
  mensaje_id   bigint,
  persona      text        NOT NULL,
  dueno        text,
  machote_id   uuid        NOT NULL,
  version      int         NOT NULL,
  total        numeric(16,2),
  precio_motor numeric(16,2),
  cuadra       boolean     NOT NULL,
  que          text,
  at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machote_id, version)
);
CREATE INDEX IF NOT EXISTS guardado_agente_at ON conceptualizador.guardado_agente (at DESC);

CREATE TABLE IF NOT EXISTS conceptualizador.pdf_guardado (
  id           bigserial   PRIMARY KEY,
  caso_id      uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  orden_id     int         NOT NULL,
  orden_nombre text,
  write_date   text        NOT NULL,
  total        numeric(16,2),
  moneda       text,
  kb           int,
  nombre       text,
  b64          text        NOT NULL,
  por          text        NOT NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  descargas    int         NOT NULL DEFAULT 0,
  UNIQUE (orden_id, write_date)
);
CREATE INDEX IF NOT EXISTS pdf_guardado_caso ON conceptualizador.pdf_guardado (caso_id, id DESC);

-- ── la compuerta del agente: ¿lo pidió una persona? ─────────────────────────────────────────
-- p_para: 'machote' (guardar_agente_v162b; apagado = como la V1.47) u 'orden' (todo_hecho_v162b; apagado = no).
CREATE OR REPLACE FUNCTION conceptualizador.agente_gate(p_trabajo bigint, p_machote uuid, p_para text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $ag34$
DECLARE
  v_sw  text := CASE WHEN p_para = 'orden' THEN 'todo_hecho_v162b' ELSE 'guardar_agente_v162b' END;
  t     record;
  v_due text;
  v_mach uuid;
  v_no  jsonb;
BEGIN
  IF NOT conceptualizador.prendido(v_sw) THEN
    IF p_para = 'orden' THEN RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', v_sw); END IF;
    RETURN jsonb_build_object('ok', true, 'modo', 'apagado');
  END IF;
  v_no := jsonb_build_object('ok', false, 'error', 'SIN_INSTRUCCION',
          'mensaje', 'El agente solo guarda o mueve la cotización cuando una persona se lo pide en el chat del caso.');
  IF p_trabajo IS NULL OR p_machote IS NULL THEN RETURN v_no; END IF;
  SELECT tr.id, tr.caso_id, tr.tipo, tr.estado, tr.mensaje_id, tr.created_at, m.rol, m.autor, m.created_at AS msg_at
    INTO t FROM conceptualizador.trabajo tr LEFT JOIN conceptualizador.mensaje m ON m.id = tr.mensaje_id WHERE tr.id = p_trabajo;
  IF t.id IS NULL OR t.tipo <> 'mensaje' OR t.rol IS DISTINCT FROM 'usuario' OR t.autor IS NULL THEN RETURN v_no; END IF;
  IF t.estado <> 'tomado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_INSTRUCCION', 'mensaje', 'Ese trabajo ya no está en curso.');
  END IF;
  IF t.created_at < now() - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSTRUCCION_VIEJA', 'mensaje', 'La instrucción tiene más de 2 horas: que la persona lo vuelva a pedir.');
  END IF;
  SELECT k.machote_id INTO v_mach FROM conceptualizador.caso k WHERE k.id = t.caso_id;
  IF v_mach IS DISTINCT FROM p_machote THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'Ese machote no es el del caso de la instrucción.');
  END IF;
  IF to_regclass('comercial.machote') IS NOT NULL THEN
    EXECUTE 'SELECT dueno FROM comercial.machote WHERE id = ' || quote_literal(p_machote::text) || '::uuid' INTO v_due;
  END IF;
  IF v_due IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_ENCONTRADO'); END IF;
  IF NOT (t.autor = v_due OR conceptualizador.puede_mover(t.autor, v_due)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_PUEDE_MOVER', 'persona', t.autor, 'dueno', v_due,
      'mensaje', t.autor || ' no tiene permiso para mover lo de ' || v_due || ': no guardé nada.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', 'instruccion', 'persona', t.autor, 'dueno', v_due, 'mensaje_id', t.mensaje_id,
    'caso_id', t.caso_id, 'msg_at', t.msg_at, 'hora', to_char(t.msg_at AT TIME ZONE 'America/Monterrey', 'HH24:MI'));
END
$ag34$;
ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) FROM PUBLIC;

-- Lo que orden-odoo necesita saber de la V1.62b, sin abrirle la tabla config.
CREATE OR REPLACE FUNCTION conceptualizador.orden_v162b(p_trabajo bigint, p_machote uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $ob34$
  SELECT jsonb_build_object('todo_hecho', conceptualizador.prendido('todo_hecho_v162b'), 'revision', conceptualizador.prendido('revision_v162b'))
         || CASE WHEN p_trabajo IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('gate', conceptualizador.agente_gate(p_trabajo, p_machote, 'orden')) END
$ob34$;
ALTER FUNCTION conceptualizador.orden_v162b(bigint, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v162b(bigint, uuid) FROM PUBLIC;
DO $gr34$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_v162b(bigint, uuid) TO comercial_app;
  END IF;
END
$gr34$;

-- ── api_motor: entregar registra lo que el agente ya hizo ───────────────────────────────────
DO $ren34m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0034prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0034prev;
  END IF;
END
$ren34m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot34$
DECLARE
  v_modo text := p->>'modo';
  v_id   bigint := conceptualizador.a_entero(p->>'trabajo_id');
  v_resp jsonb := CASE WHEN jsonb_typeof(p->'respuesta') = 'object' THEN p->'respuesta' ELSE '{}'::jsonb END;
  v_r    jsonb;
  v_t    record;
  x      jsonb;
  v_n    int := 0;
  v_g    int := 0;
  v_nc   int := 0;
  v_mid  uuid;
  v_ver  int;
  v_tot  numeric;
  v_aut  text;
  v_due  text;
  v_cua  boolean;
BEGIN
  v_r := conceptualizador.api_motor_0034prev(p);
  IF v_modo <> 'entregar' OR NOT coalesce((v_r->>'ok')::boolean, false) OR coalesce((v_r->>'ya_estaba')::boolean, false) THEN RETURN v_r; END IF;
  IF NOT (conceptualizador.prendido('todo_hecho_v162b') OR conceptualizador.prendido('guardar_agente_v162b')) THEN RETURN v_r; END IF;
  SELECT tr.id, tr.caso_id, tr.mensaje_id, m.autor INTO v_t
    FROM conceptualizador.trabajo tr LEFT JOIN conceptualizador.mensaje m ON m.id = tr.mensaje_id WHERE tr.id = v_id;
  IF v_t.id IS NULL THEN RETURN v_r; END IF;

  -- Lo que el agente ya hizo (machote guardado, borrador en Odoo): queda como acción HECHA, con su resultado, a nombre del agente.
  IF jsonb_typeof(v_resp->'hechas_agente') = 'array' THEN
    FOR x IN SELECT * FROM jsonb_array_elements(v_resp->'hechas_agente') LOOP
      CONTINUE WHEN coalesce(x->>'tipo', '') NOT IN ('crear_machote', 'crear_borrador') OR jsonb_typeof(x->'resultado') IS DISTINCT FROM 'object';
      INSERT INTO conceptualizador.accion (caso_id, trabajo_id, tipo, titulo, datos, estado, resultado, hecha_por, hecha_at)
      VALUES (v_t.caso_id, v_id, x->>'tipo', left(coalesce(x->>'titulo', x->>'tipo'), 200),
              coalesce(CASE WHEN jsonb_typeof(x->'datos') = 'object' THEN x->'datos' END, '{}'::jsonb)
                || jsonb_build_object('por_instruccion', jsonb_build_object('persona', v_t.autor, 'mensaje_id', v_t.mensaje_id)),
              'hecha', x->'resultado', 'agente', now());
      v_n := v_n + 1;
    END LOOP;
  END IF;

  -- Condición 5: cada guardado del agente, contra la versión que de verdad quedó en la base.
  IF jsonb_typeof(v_resp->'guardado_agente') = 'object' AND to_regclass('comercial.machote_version') IS NOT NULL THEN
    x := v_resp->'guardado_agente';
    v_mid := conceptualizador.a_uuid(x->>'machote_id');
    v_ver := conceptualizador.a_entero(x->>'version');
    IF v_mid IS NOT NULL AND v_ver IS NOT NULL AND v_t.autor IS NOT NULL THEN
      EXECUTE 'SELECT v.total, v.autor, m.dueno FROM comercial.machote_version v JOIN comercial.machote m ON m.id = v.machote_id ' ||
              'WHERE v.machote_id = ' || quote_literal(v_mid::text) || '::uuid AND v.version = ' || v_ver INTO v_tot, v_aut, v_due;
      v_cua := v_aut = 'motor' AND v_tot IS NOT NULL AND coalesce(x->>'precio_motor', '') ~ '^-?[0-9]{1,12}([.][0-9]+)?\Z'
               AND abs(v_tot - (x->>'precio_motor')::numeric) <= 0.01;
      INSERT INTO conceptualizador.guardado_agente (caso_id, trabajo_id, mensaje_id, persona, dueno, machote_id, version, total, precio_motor, cuadra, que)
      VALUES (v_t.caso_id, v_id, v_t.mensaje_id, v_t.autor, v_due, v_mid, v_ver, v_tot,
              CASE WHEN coalesce(x->>'precio_motor', '') ~ '^-?[0-9]{1,12}([.][0-9]+)?\Z' THEN round((x->>'precio_motor')::numeric, 2) END,
              coalesce(v_cua, false), left(x->>'que', 300))
      ON CONFLICT (machote_id, version) DO NOTHING;
      GET DIAGNOSTICS v_g = ROW_COUNT;
      IF v_g > 0 AND NOT coalesce(v_cua, false) THEN v_nc := 1; END IF;
    END IF;
  END IF;
  IF v_n > 0 OR v_g > 0 THEN v_r := v_r || jsonb_build_object('hechas_agente', v_n, 'guardados_agente', v_g, 'guardado_no_cuadra', v_nc > 0); END IF;
  RETURN v_r;
END
$mot34$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0034prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0034prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0034prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── api_suite: el último PDF en el hilo y la medición del panel ─────────────────────────────
DO $ren34s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0034prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0034prev;
  END IF;
END
$ren34s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui34$
DECLARE
  v_modo text := p->>'modo';
  v_r    jsonb;
  v_pdf  jsonb;
BEGIN
  v_r := conceptualizador.api_suite_0034prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;
  IF v_modo = 'hilo' AND conceptualizador.prendido('pdf_v162b') THEN
    SELECT jsonb_build_object('id', g.id, 'orden_id', g.orden_id, 'orden_nombre', g.orden_nombre, 'total', g.total, 'moneda', g.moneda,
             'kb', g.kb, 'nombre', g.nombre, 'at', g.at, 'write_date', g.write_date,
             'version', (SELECT count(*) FROM conceptualizador.pdf_guardado z WHERE z.orden_id = g.orden_id AND z.id <= g.id))
      INTO v_pdf FROM conceptualizador.pdf_guardado g WHERE g.caso_id = conceptualizador.a_uuid(p->>'caso_id') ORDER BY g.id DESC LIMIT 1;
    IF v_pdf IS NOT NULL THEN v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object('ultimo_pdf', v_pdf)); END IF;
  ELSIF v_modo = 'config' AND (conceptualizador.prendido('guardar_agente_v162b') OR conceptualizador.prendido('todo_hecho_v162b')
                                OR conceptualizador.prendido('pdf_v162b') OR conceptualizador.prendido('revision_v162b')) THEN
    v_r := v_r || jsonb_build_object('v162b_24h', jsonb_build_object(
      'guardados_agente', (SELECT count(*) FROM conceptualizador.guardado_agente g WHERE g.at > now() - interval '24 hours'),
      'guardados_no_cuadran', (SELECT count(*) FROM conceptualizador.guardado_agente g WHERE g.at > now() - interval '24 hours' AND NOT g.cuadra),
      'por_dueno', (SELECT coalesce(jsonb_object_agg(d.dueno, jsonb_build_object('guardados', d.n, 'no_cuadran', d.nc)), '{}'::jsonb)
                      FROM (SELECT coalesce(g.dueno, '?') AS dueno, count(*) AS n, count(*) FILTER (WHERE NOT g.cuadra) AS nc
                              FROM conceptualizador.guardado_agente g WHERE g.at > now() - interval '24 hours' GROUP BY 1) d),
      'borradores_agente', (SELECT count(*) FROM conceptualizador.accion a WHERE a.hecha_at > now() - interval '24 hours'
                               AND a.hecha_por = 'agente' AND a.tipo = 'crear_borrador'),
      'pdfs_guardados', (SELECT count(*) FROM conceptualizador.pdf_guardado g WHERE g.at > now() - interval '24 hours'),
      'pdfs_sin_regenerar', (SELECT coalesce(sum(g.descargas), 0) FROM conceptualizador.pdf_guardado g WHERE g.at > now() - interval '7 days')));
  END IF;
  RETURN v_r;
END
$sui34$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0034prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0034prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0034prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;

-- ── api_correo: el PDF guardado (cotizacion-cliente) ────────────────────────────────────────
DO $ren34c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0034prev') THEN
    ALTER FUNCTION conceptualizador.api_correo(jsonb) RENAME TO api_correo_0034prev;
  END IF;
END
$ren34c$;

CREATE OR REPLACE FUNCTION conceptualizador.api_correo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cor34$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_k     conceptualizador.caso%ROWTYPE;
  v_g     conceptualizador.pdf_guardado%ROWTYPE;
  v_orden int := conceptualizador.a_entero(p->>'orden_id');
  v_wd    text := left(btrim(coalesce(p->>'write_date', '')), 40);
  v_b64   text;
BEGIN
  IF v_modo NOT IN ('pdf_buscar', 'pdf_guardar') THEN RETURN conceptualizador.api_correo_0034prev(p); END IF;
  IF NOT conceptualizador.prendido('pdf_v162b') THEN RETURN jsonb_build_object('ok', true, 'hay', false, 'apagado', true); END IF;
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
  SELECT * INTO v_k FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
  IF v_k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
  IF v_k.autor <> v_actor AND NOT conceptualizador.es_panel_admin(v_actor) THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO'); END IF;
  IF v_orden IS NULL OR v_wd = '' THEN RETURN jsonb_build_object('ok', true, 'hay', false); END IF;
  IF v_modo = 'pdf_buscar' THEN
    UPDATE conceptualizador.pdf_guardado SET descargas = descargas + 1 WHERE caso_id = v_k.id AND orden_id = v_orden AND write_date = v_wd
    RETURNING * INTO v_g;
    IF v_g.id IS NULL THEN RETURN jsonb_build_object('ok', true, 'hay', false); END IF;
    RETURN jsonb_build_object('ok', true, 'hay', true, 'pdf', jsonb_build_object('nombre', v_g.nombre, 'kb', v_g.kb, 'b64', v_g.b64,
      'guardado', jsonb_build_object('id', v_g.id, 'at', v_g.at, 'write_date', v_g.write_date, 'descargas', v_g.descargas)));
  END IF;
  -- pdf_guardar · solo un PDF de verdad (empieza con %PDF-, en base64 «JVBERi0»).
  v_b64 := coalesce(p->>'b64', '');
  IF left(v_b64, 7) <> 'JVBERi0' OR char_length(v_b64) > 6 * 1024 * 1024 THEN RETURN jsonb_build_object('ok', false, 'error', 'PDF_INVALIDO'); END IF;
  INSERT INTO conceptualizador.pdf_guardado (caso_id, orden_id, orden_nombre, write_date, total, moneda, kb, nombre, b64, por)
  VALUES (v_k.id, v_orden, left(p->>'orden_nombre', 40), v_wd,
          CASE WHEN coalesce(p->>'total', '') ~ '^-?[0-9]{1,12}([.][0-9]+)?\Z' THEN round((p->>'total')::numeric, 2) END,
          left(p->>'moneda', 3), conceptualizador.a_entero(p->>'kb'), left(p->>'nombre', 120), v_b64, v_actor)
  ON CONFLICT (orden_id, write_date) DO NOTHING
  RETURNING * INTO v_g;
  RETURN jsonb_build_object('ok', true, 'guardado', v_g.id IS NOT NULL, 'id', v_g.id);
END
$cor34$;
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo_0034prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0034prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0034prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb) TO conceptualizador_app;

-- ── alarma: un guardado del agente que no cuadra (desde que se prendió su interruptor, como la 0033) ──
DO $ren34a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0034prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0034prev;
  END IF;
END
$ren34a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am34$
DECLARE
  v_r jsonb := conceptualizador.alarmas_motor_0034prev(p_llave);
  x   record;
BEGIN
  IF p_llave <> 'conceptualizador' OR NOT conceptualizador.prendido('guardar_agente_v162b') THEN RETURN v_r; END IF;
  SELECT g.id, g.at, g.version, g.total, g.precio_motor, g.persona, k.carpeta INTO x
    FROM conceptualizador.guardado_agente g JOIN conceptualizador.caso k ON k.id = g.caso_id
   WHERE NOT g.cuadra AND g.at > greatest(now() - interval '24 hours', conceptualizador.prendido_desde('guardar_agente_v162b'))
   ORDER BY g.id DESC LIMIT 1;
  IF x.id IS NOT NULL THEN
    v_r := v_r || conceptualizador.alarma('guardado_no_cuadra', x.id::text, x.at,
      'El agente guardó la versión ' || x.version || ' del machote del caso ' || coalesce(x.carpeta, '?') || ' por instrucción de ' || x.persona ||
      ' y no cuadra: la base tiene ' || coalesce(x.total::text, '¿?') || ' y el motor calculó ' || coalesce(x.precio_motor::text, '¿?') || '.',
      'Revisa esa versión contra la spec del caso; si está mal, se revierte guardando la anterior como versión nueva.', 'guardado-no-cuadra',
      jsonb_build_object('caso', x.carpeta, 'version', x.version, 'total', x.total, 'precio_motor', x.precio_motor));
  END IF;
  RETURN v_r;
END
$am34$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0034prev(text), conceptualizador.alarmas_motor(text) FROM PUBLIC;
