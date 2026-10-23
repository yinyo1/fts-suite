-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0036 · V1.63a (fts-conceptualizador#12): flujo, ruido, PDF y vendedor
--
-- Va de Esteban del 23-oct-2026 para construir la V1.63a detrás de interruptores apagados. Cinco interruptores nuevos, todos en '0':
--   pdf_menu_v163  · la pantalla pinta «Ver cotización» y «⬇ Descargar PDF» en el ⋮ de todo caso con orden (falla de Mattel,
--                    23-oct 14:46 CST). La base no cambia nada: cotizacion-cliente ya decide quién puede bajar el PDF (db/022).
--   flujo_v163     · el motor: la vista confirmada no es decreto, último hito sin cola, huella v2 sin los «no aplica», total
--                    idéntico = nada que guardar, un mensaje = una acción. Aquí: una orden que se recalculó descarta las tarjetas
--                    de borrador propuestas con OTRA huella de precios aunque el total sea igual (Nalco 2e5783, el traslado).
--   pdf_v163       · el motor revisa el documento v10 antes de entregar (bloques, texto de relleno, hitos = nota = «Pagos»).
--   vendedor_v163  · orden-odoo no reescribe user_id en una orden que ya existe (R6): `orden_v163()` se lo dice.
--   rechazos_v163  · orden-odoo guarda cada rechazo (orden_rechazo) y la alarma `orden_rechazo_repetido` sale con el mismo código
--                    dos veces en 24 h en el mismo caso.
-- Y la alarma `decreto_sin_odoo`: una tarjeta de borrador propuesta lleva más de 2 h sin llegar a Odoo (flujo_v163 prendido).
-- Apagado, todo sale igual que con la 0035. Reversa: reversas/036_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in36$
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
               'pdf_menu_v163','flujo_v163','pdf_v163','vendedor_v163','rechazos_v163']
$in36$;


INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── lo que orden-odoo necesita saber (credencial comercial_app), sin abrirle la tabla config ──
CREATE OR REPLACE FUNCTION conceptualizador.orden_v163() RETURNS jsonb
LANGUAGE sql STABLE AS $ov36$
  SELECT jsonb_build_object('vendedor', conceptualizador.prendido('vendedor_v163'), 'rechazos', conceptualizador.prendido('rechazos_v163'))
$ov36$;
ALTER FUNCTION conceptualizador.orden_v163() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v163() FROM PUBLIC;

-- ── cada rechazo de orden-odoo, en la base (B14) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.orden_rechazo (
  id          bigserial   PRIMARY KEY,
  error       text        NOT NULL,
  mensaje     text,
  modo        text,
  actor       text,
  caso_id     uuid,
  machote_id  uuid,
  via_motor   boolean     NOT NULL DEFAULT false,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orden_rechazo_at ON conceptualizador.orden_rechazo (at DESC);

-- Lo llama el nodo «Postgres - Rechazo» de orden-odoo. Nunca lanza: con el interruptor apagado o datos raros, no escribe y lo dice.
CREATE OR REPLACE FUNCTION conceptualizador.orden_rechazo_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $or36$
DECLARE
  v_id bigint;
  uu   text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z';
BEGIN
  IF NOT conceptualizador.prendido('rechazos_v163') THEN RETURN jsonb_build_object('ok', true, 'guardado', false, 'razon', 'apagado'); END IF;
  IF coalesce(p->>'error', '') !~ '^[A-Z0-9_]{2,60}\Z' THEN RETURN jsonb_build_object('ok', true, 'guardado', false, 'razon', 'sin_codigo'); END IF;
  INSERT INTO conceptualizador.orden_rechazo (error, mensaje, modo, actor, caso_id, machote_id, via_motor)
  VALUES (p->>'error', left(p->>'mensaje', 400), left(p->>'modo', 30), left(p->>'actor', 80),
          CASE WHEN lower(coalesce(p->>'caso_id', '')) ~ uu THEN (p->>'caso_id')::uuid END,
          CASE WHEN lower(coalesce(p->>'machote_id', '')) ~ uu THEN (p->>'machote_id')::uuid END,
          coalesce(p->>'via_motor', '') = 'true')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'guardado', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', true, 'guardado', false, 'razon', 'error');
END
$or36$;
ALTER FUNCTION conceptualizador.orden_rechazo_registrar(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_rechazo_registrar(jsonb) FROM PUBLIC;
DO $gr36$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_v163() TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_rechazo_registrar(jsonb) TO comercial_app;
  END IF;
END
$gr36$;

-- ── api_motor: una orden recalculada descarta las tarjetas de borrador con otra huella (h) ───
DO $ren36m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0036prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0036prev;
  END IF;
END
$ren36m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot36$
DECLARE
  v_id   bigint := conceptualizador.a_entero(p->>'trabajo_id');
  v_h    text := p->'respuesta'->'recalculo'->>'huella';
  v_r    jsonb := conceptualizador.api_motor_0036prev(p);
  v_caso uuid;
  v_n    int;
BEGIN
  IF p->>'modo' <> 'entregar' OR NOT coalesce((v_r->>'ok')::boolean, false) OR coalesce((v_r->>'ya_estaba')::boolean, false)
     OR NOT conceptualizador.prendido('flujo_v163') OR coalesce(v_h, '') !~ '^[0-9a-f]{16}\Z' THEN RETURN v_r; END IF;
  SELECT caso_id INTO v_caso FROM conceptualizador.trabajo WHERE id = v_id;
  IF v_caso IS NULL THEN RETURN v_r; END IF;
  UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
         resultado = jsonb_build_object('reemplazada_por_calculo', v_id, 'huella_nueva', v_h, 'razon', 'otra huella de precios (V1.63a)')
   WHERE a.caso_id = v_caso AND a.estado = 'propuesta' AND a.tipo = 'crear_borrador' AND coalesce(a.trabajo_id, 0) < v_id
     AND a.datos->'cotizacion'->'huella_precios'->>'v' = '2'   -- solo se comparan huellas de la misma versión (v2, la del motor V1.63a)
     AND coalesce(a.datos->'cotizacion'->'huella_precios'->>'total', '') ~ '^[0-9a-f]{16}\Z'
     AND a.datos->'cotizacion'->'huella_precios'->>'total' <> v_h;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_r := v_r || jsonb_build_object('tarjetas_otra_huella', v_n); END IF;
  RETURN v_r;
END
$mot36$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0036prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0036prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0036prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── medición (I) ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.metrica_v163(p_desde timestamptz DEFAULT now() - interval '7 days') RETURNS jsonb
LANGUAGE sql STABLE AS $me36$
  WITH bor AS (
    SELECT a.id, a.caso_id, a.created_at, a.hecha_at, a.hecha_por, a.estado,
           (SELECT max(m.created_at) FROM conceptualizador.mensaje m WHERE m.caso_id = a.caso_id AND m.rol = 'usuario' AND m.created_at <= a.created_at) AS pidio_at
      FROM conceptualizador.accion a JOIN conceptualizador.caso k ON k.id = a.caso_id
     WHERE a.tipo = 'crear_borrador' AND NOT k.demo AND a.created_at >= p_desde)
  SELECT jsonb_build_object(
    'desde', p_desde,
    -- horas del pedido de la persona a Odoo, y cuántas las hizo el agente sin clic
    'borradores_hechos', (SELECT count(*) FROM bor WHERE estado = 'hecha'),
    'hechos_por_agente', (SELECT count(*) FROM bor WHERE estado = 'hecha' AND hecha_por = 'agente'),
    'horas_pedido_a_odoo_mediana', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM hecha_at - pidio_at) / 3600))::numeric, 2)
                                      FROM bor WHERE estado = 'hecha' AND pidio_at IS NOT NULL AND hecha_at >= pidio_at),
    'propuestos_sin_aplicar_2h', (SELECT count(*) FROM bor WHERE estado = 'propuesta' AND created_at < now() - interval '2 hours'),
    'rechazos', (SELECT coalesce(jsonb_object_agg(error, n), '{}'::jsonb) FROM (SELECT error, count(*) AS n FROM conceptualizador.orden_rechazo
                   WHERE at >= p_desde GROUP BY error) r),
    'sin_cambios_publicados', (SELECT count(*) FROM conceptualizador.mensaje m WHERE m.rol = 'motor' AND m.texto = 'Sin cambios pendientes en este caso.' AND m.created_at >= p_desde))
$me36$;
ALTER FUNCTION conceptualizador.metrica_v163(timestamptz) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.metrica_v163(timestamptz) FROM PUBLIC;

-- ── alarmas: decreto sin Odoo (más de 2 h) y el mismo rechazo dos veces ─────────────────────
DO $ren36a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0036prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0036prev;
  END IF;
END
$ren36a$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am36$
DECLARE
  v_r jsonb := conceptualizador.alarmas_motor_0036prev(p_llave);
  x   record;
BEGIN
  IF p_llave <> 'conceptualizador' THEN RETURN v_r; END IF;
  IF conceptualizador.prendido('flujo_v163') THEN
    SELECT a.id, a.created_at, a.titulo, k.carpeta INTO x FROM conceptualizador.accion a JOIN conceptualizador.caso k ON k.id = a.caso_id
     WHERE a.estado = 'propuesta' AND a.tipo = 'crear_borrador' AND NOT k.demo AND k.estado = 'abierto'
       AND greatest(a.created_at, conceptualizador.prendido_desde('flujo_v163')) < now() - interval '2 hours' ORDER BY a.id LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('decreto_sin_odoo', x.id::text, x.created_at,
        'La tarjeta «' || left(coalesce(x.titulo, ''), 80) || '» (acción ' || x.id || ', caso ' || coalesce(x.carpeta, '?') || ') lleva más de 2 h sin llegar a Odoo.',
        'Mira por qué el agente no la aplicó solo (rechazo de orden-odoo, oportunidad, precios pendientes) y dile al dueño el clic que falta.',
        'decreto-sin-odoo', jsonb_build_object('accion_id', x.id, 'caso', x.carpeta));
    END IF;
  END IF;
  IF conceptualizador.prendido('rechazos_v163') THEN
    SELECT r.caso_id, r.error, count(*) AS n, min(r.at) AS desde, k.carpeta INTO x FROM conceptualizador.orden_rechazo r
      LEFT JOIN conceptualizador.caso k ON k.id = r.caso_id
     WHERE r.at > greatest(now() - interval '24 hours', conceptualizador.prendido_desde('rechazos_v163'))
     GROUP BY r.caso_id, r.error, k.carpeta HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 1;
    IF x.error IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('orden_rechazo_repetido', coalesce(x.caso_id::text, '') || ':' || x.error, x.desde,
        'orden-odoo rechazó ' || x.n || ' veces con ' || x.error || ' en 24 h' || CASE WHEN x.carpeta IS NOT NULL THEN ' (caso ' || x.carpeta || ')' ELSE '' END || '.',
        'Lee el renglón de conceptualizador.orden_rechazo: si el agente repite el mismo botón, es un ciclo; arréglalo antes de que lo toque otra persona.',
        'orden-rechazo-repetido', jsonb_build_object('caso', x.carpeta, 'error', x.error, 'veces', x.n));
    END IF;
  END IF;
  RETURN v_r;
END
$am36$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0036prev(text) FROM PUBLIC;
