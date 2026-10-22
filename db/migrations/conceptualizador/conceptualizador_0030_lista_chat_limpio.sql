-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0030 · V1.60 (fts-conceptualizador#12): lista y chat limpio
--
-- Tres interruptores nuevos, todos en '0'. Con los tres apagados, todo se comporta como en la V1.59:
--   lista_v160        `casos` trae, por caso, `grupo`, `etapa` y `monto`; la pantalla agrupa con ellos (un solo filtro)
--   chat_limpio_v160  el chat no pinta lo que no aporta; el evento `falla_odoo` guarda el error de un clic en Odoo
--   seleccion_v160    seleccionar parte del texto de un mensaje (es solo de la pantalla; aquí solo se da de alta)
--
-- La etapa la decide la base, una sola regla (conceptualizador.etapa_de), y la pantalla solo agrupa:
--   grupo «cotizar»:  platicando (sin disparo) · preguntas (sin machote) · machote (sin orden) · odoo (orden sin enviar)
--   grupo «enviado»:  esperando (enviada, actividad hace menos de `dias_enfriada` días) · enfriada (esos días o más)
--   grupo «cerradas» (regla de Esteban, #12, 22-oct): ganada (cerrado_por orden_confirmada) · perdida (cerrado_por oportunidad_perdida,
--   o orden_cancelada: la orden del caso en cancel; hoy ningún cierre lo escribe, lo agrega la V1.61) · sinres (lo demás). NO el won del crm.lead.
--   grupo «archivada»: archivada a mano o por los cierres (la lista ya las enseña aparte)
-- «Enviada» = estado 'enviada', o una acción `enviada` hecha, o un `crear_borrador` hecho cuyo resultado dice estado 'sent'.
-- El monto: `total` y `moneda` de la última comercial.machote_version del machote del caso. Sin esquema comercial (las
-- bases de prueba) o sin machote, `monto` va en null y la pantalla dice «sin monto». Nunca se suman monedas distintas aquí.
--
-- `dias_enfriada` (por omisión 30, de 1 a 365) se edita en el panel: config_valida (envoltura 0030) lo acepta.
--
-- Evento `falla_odoo` (chat_limpio_v160): la pantalla manda el error de un clic que escribe en Odoo (crear o actualizar el
-- borrador, marcar enviada). Se guarda en conceptualizador.falla_odoo SIN trabajo para el motor y sin contar en el tope, y
-- el `hilo` lo trae (`fallas_odoo`, las 20 más nuevas) para que la tarjeta de estado se vea igual al recargar y se pueda
-- dar por resuelta. Medición: el panel (`config`) trae `fallas_odoo_24h` por código. Antes de esto el código del error no
-- quedaba en ningún lado (orden-odoo no guarda ejecuciones; GEPP 98f4ce, 21-oct, 5 intentos sin rastro).
--
-- Lo que NO cambia: ningún interruptor existente, ningún modo nuevo de api_suite (el evento entra por `evento`, como la
-- `condicion` de la 0018), ni api_motor. Reversa: reversas/030_reversa.sql. Reglas del runner: sin llaves dobles, sin dos
-- dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in30$
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
               'lista_v160','chat_limpio_v160','seleccion_v160']
$in30$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('dias_enfriada', '30') ON CONFLICT (clave) DO NOTHING;

-- ── dias_enfriada se edita en el panel ─────────────────────────────────────────────────────
DO $ren30v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'config_valida_0030prev') THEN
    ALTER FUNCTION conceptualizador.config_valida(text, text) RENAME TO config_valida_0030prev;
  END IF;
END
$ren30v$;

CREATE OR REPLACE FUNCTION conceptualizador.config_valida(p_clave text, p_valor text) RETURNS text
LANGUAGE plpgsql STABLE AS $cv30$
DECLARE v text := btrim(coalesce(p_valor, ''));
BEGIN
  IF coalesce(p_clave, '') = 'dias_enfriada' THEN
    IF v !~ '^[1-9][0-9]{0,2}\Z' OR v::int > 365 THEN RETURN 'días enteros de 1 a 365'; END IF;
    RETURN NULL;
  END IF;
  RETURN conceptualizador.config_valida_0030prev(p_clave, p_valor);
END
$cv30$;

-- ── La etapa: una sola regla ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.etapa_de(p_caso uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $et30$
DECLARE
  c        conceptualizador.caso%ROWTYPE;
  v_env    boolean;
  v_dias   int := coalesce(conceptualizador.cfg('dias_enfriada'), 30);
  v_g      text;
  v_e      text;
BEGIN
  SELECT * INTO c FROM conceptualizador.caso WHERE id = p_caso;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  IF c.archivado_at IS NOT NULL OR c.estado = 'archivado' THEN
    v_g := 'archivada'; v_e := 'archivada';
  ELSIF c.estado = 'cerrado' THEN
    v_g := 'cerradas';
    v_e := CASE WHEN c.cerrado_por = 'orden_confirmada' THEN 'ganada'
                WHEN c.cerrado_por IN ('oportunidad_perdida','orden_cancelada') THEN 'perdida' ELSE 'sinres' END;
  ELSE
    v_env := c.estado = 'enviada' OR EXISTS (
      SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = c.id AND a.estado = 'hecha'
         AND (a.tipo = 'enviada' OR (a.tipo = 'crear_borrador' AND a.resultado->>'estado' = 'sent')));
    IF v_env THEN
      v_g := 'enviado';
      v_e := CASE WHEN c.ultima_actividad_at < now() - make_interval(days => v_dias) THEN 'enfriada' ELSE 'esperando' END;
    ELSE
      v_g := 'cotizar';
      v_e := CASE WHEN c.disparado_at IS NULL THEN 'platicando'
                  WHEN c.machote_id IS NULL THEN 'preguntas'
                  WHEN c.orden_id IS NULL THEN 'machote'
                  ELSE 'odoo' END;
    END IF;
  END IF;
  RETURN jsonb_build_object('grupo', v_g, 'etapa', v_e);
END
$et30$;
REVOKE ALL ON FUNCTION conceptualizador.etapa_de(uuid) FROM PUBLIC;

-- El monto del machote del caso: la última versión. Una base sin el esquema comercial (las de prueba) contesta null.
CREATE OR REPLACE FUNCTION conceptualizador.monto_de(p_machote uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $mo30$
DECLARE v jsonb;
BEGIN
  IF p_machote IS NULL OR to_regclass('comercial.machote_version') IS NULL THEN RETURN NULL; END IF;
  BEGIN
    SELECT jsonb_build_object('total', mv.total, 'moneda', mv.moneda, 'version', mv.version) INTO v
      FROM comercial.machote_version mv WHERE mv.machote_id = p_machote AND mv.total IS NOT NULL
     ORDER BY mv.version DESC LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v := NULL;
  END;
  RETURN v;
END
$mo30$;
REVOKE ALL ON FUNCTION conceptualizador.monto_de(uuid) FROM PUBLIC;

-- ── El error de un clic en Odoo ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.falla_odoo (
  id         bigserial   PRIMARY KEY,
  caso_id    uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  accion_id  bigint,
  actor      text        NOT NULL,
  codigo     text        NOT NULL,
  mensaje    text,
  que        text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS falla_odoo_caso_idx ON conceptualizador.falla_odoo (caso_id, id DESC);
CREATE INDEX IF NOT EXISTS falla_odoo_at_idx ON conceptualizador.falla_odoo (at);
REVOKE ALL ON conceptualizador.falla_odoo FROM PUBLIC;

-- ── api_suite (envoltura 0030) ─────────────────────────────────────────────────────────────
DO $ren30s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0030prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0030prev;
  END IF;
END
$ren30s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui30$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_caso  uuid;
  v_ts    bigint;
  v_n     int;
  v_d     jsonb := CASE WHEN jsonb_typeof(p->'datos') = 'object' THEN p->'datos' ELSE '{}'::jsonb END;
  v_r     jsonb;
BEGIN
  -- Evento `falla_odoo`: se guarda AL MOMENTO, sin trabajo para el motor y sin contar en el tope.
  IF v_modo = 'evento' AND p->>'tipo' = 'falla_odoo' THEN
    IF NOT conceptualizador.prendido('chat_limpio_v160') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'chat_limpio_v160');
    END IF;
    IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
    IF conceptualizador.es_lector(v_actor) THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
    v_ts := conceptualizador.a_entero(p->>'ts');
    IF v_ts IS NULL OR abs(extract(epoch FROM now()) * 1000 - v_ts) > conceptualizador.cfg('ventana_replay_segundos') * 1000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FUERA_DE_VENTANA');
    END IF;
    IF char_length(coalesce(p->>'nonce', '')) < 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_NONCE'); END IF;
    INSERT INTO conceptualizador.nonce (nonce, actor) VALUES (p->>'nonce', v_actor) ON CONFLICT (nonce) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'REPETIDA'); END IF;
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE');
    END IF;
    IF coalesce(v_d->>'codigo', '') !~ '^[A-Z][A-Z0-9_]{1,59}\Z' THEN RETURN jsonb_build_object('ok', false, 'error', 'CODIGO_INVALIDO'); END IF;
    INSERT INTO conceptualizador.falla_odoo (caso_id, accion_id, actor, codigo, mensaje, que)
    VALUES (v_caso, CASE WHEN coalesce(v_d->>'accion_id', '') ~ '^[0-9]{1,18}\Z' THEN (v_d->>'accion_id')::bigint END,
            v_actor, v_d->>'codigo', left(v_d->>'mensaje', 500), left(v_d->>'que', 60));
    RETURN jsonb_build_object('ok', true, 'guardada', true);
  END IF;

  v_r := conceptualizador.api_suite_0030prev(p);
  IF NOT coalesce((v_r->>'ok')::boolean, false) THEN RETURN v_r; END IF;

  IF v_modo = 'casos' AND conceptualizador.prendido('lista_v160') AND jsonb_typeof(v_r->'casos') = 'array' THEN
    v_r := jsonb_set(v_r, ARRAY['casos'], coalesce((SELECT jsonb_agg(
             a.x || coalesce(conceptualizador.etapa_de((a.x->>'id')::uuid), '{}'::jsonb)
                 || jsonb_build_object('monto', conceptualizador.monto_de((SELECT k.machote_id FROM conceptualizador.caso k WHERE k.id = (a.x->>'id')::uuid)))
             ORDER BY a.o) FROM jsonb_array_elements(v_r->'casos') WITH ORDINALITY AS a(x, o)), '[]'::jsonb));
    v_r := v_r || jsonb_build_object('dias_enfriada', coalesce(conceptualizador.cfg('dias_enfriada'), 30));
  ELSIF v_modo = 'hilo' AND conceptualizador.prendido('chat_limpio_v160') THEN
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NOT NULL THEN
      v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object('fallas_odoo', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', f.id, 'accion_id', f.accion_id, 'actor', f.actor, 'codigo', f.codigo,
                                            'mensaje', f.mensaje, 'que', f.que, 'at', f.at) ORDER BY f.id)
          FROM (SELECT * FROM conceptualizador.falla_odoo WHERE caso_id = v_caso ORDER BY id DESC LIMIT 20) f), '[]'::jsonb)));
    END IF;
  ELSIF v_modo = 'config' THEN
    v_r := v_r || jsonb_build_object('fallas_odoo_24h', coalesce((
      SELECT jsonb_object_agg(codigo, n) FROM (SELECT codigo, count(*) n FROM conceptualizador.falla_odoo
                                               WHERE at > now() - interval '24 hours' GROUP BY codigo) q), '{}'::jsonb));
  END IF;
  RETURN v_r;
END
$sui30$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0030prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0030prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0030prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;
