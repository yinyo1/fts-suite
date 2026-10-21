-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0029 · V1.59 (fts-conceptualizador#12): cotización correcta en Odoo
--
-- Cuatro interruptores nuevos, todos en '0'. Con los cuatro apagados, todo se comporta como en la V1.58:
--   delegacion_v159    quién mueve el machote y la orden de otro (puede_mover). Apagado: solo el dueño (y en la orden, el admin)
--   vendedor_v159      orden-odoo escribe user_id (vendedor_odoo del AUTOR DEL CASO) y opportunity_id; «Le atiende» del autor
--   bom_observado_v159 un BOM que no pasa `verifica` va a bom-observado.md y bom.md se queda con el último que pasó
--   tarjetas_v159      tarjetas de acción resueltas en su lugar, botón «Actualizar SO…», clic hecho sin mensaje doble
--
-- Dos mapas por persona en `conceptualizador.config`, editables desde el panel (config_guardar, con su config_cambio):
--   puede_mover:<usuario>    '*' (todos) o lista de dueños separada por coma. Sin clave: solo lo suyo.
--   vendedor_odoo:<usuario>  id de res.users de Odoo que va de vendedor (user_id) en las órdenes de los casos de esa persona.
-- Se siembran con la decisión de Esteban del 21-oct (#12, comentario 6326928651 y su respuesta):
--   esteban.delacruz → puede_mover '*', vendedor 2 · francisco.montalvo → los suyos y los de esteban.delacruz, vendedor 12
--   («Sales FTS», compartido mientras no tenga usuario propio) · ricardo.hernandez → los suyos, vendedor 12.
-- Las siembras usan ON CONFLICT DO NOTHING: si ya se editaron desde el panel, no se pisan.
--
-- La regla es UNA y la usan las dos puertas: comercial/machote-guardar (machote) y conceptualizador/orden-odoo (orden), las
-- dos con la credencial comercial_app, por `conceptualizador.puede_mover(actor, dueno)`. Con el interruptor apagado
-- contesta `actor = dueno` (lo de hoy); el préstamo de 24 h (comercial 005) sigue aparte y no cambia.
-- comercial_app lee además, del caso ligado al machote, el autor y la oportunidad (para el vendedor y «Le atiende»).
--
-- api_suite (envoltura 0029), solo con delegacion_v159 prendido: el `hilo` trae `machote_mueve` = {dueno, puede} para que la
--   pantalla no ofrezca un botón que el servidor va a rechazar. Lo que manda sigue siendo el servidor.
-- api_motor (envoltura 0029), solo con tarjetas_v159 prendido: al entregar, un «crear_borrador» propuesto IGUAL (mismo título)
--   a uno que la persona ya hizo MIENTRAS este trabajo corría se descarta solo, con `ya_hecha_por`. Calbee 4ae3f0, 21-oct: la 337
--   se hizo a las 16:49:15 y el trabajo 494 (la respuesta al clic del machote) volvió a proponer la misma como 338 a las 16:49:54.
-- Lo que NO cambia: ninguna tabla nueva, ningún interruptor existente, ningún modo nuevo de api_suite ni api_motor.
-- Reversa: reversas/029_reversa.sql. Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de
-- comilla, ampersand, acento grave o dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in29$
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
               'delegacion_v159','vendedor_v159','bom_observado_v159','tarjetas_v159']
$in29$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── Los dos mapas, validados igual que el resto de config (config_valida, envoltura 0029) ─────────────────────────────
DO $ren29v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'config_valida_0029prev') THEN
    ALTER FUNCTION conceptualizador.config_valida(text, text) RENAME TO config_valida_0029prev;
  END IF;
END
$ren29v$;

CREATE OR REPLACE FUNCTION conceptualizador.config_valida(p_clave text, p_valor text) RETURNS text
LANGUAGE plpgsql STABLE AS $cv29$
DECLARE
  v text := btrim(coalesce(p_valor, ''));
  k text := coalesce(p_clave, '');
  u text;
BEGIN
  IF k ~ '^puede_mover:[a-z0-9][a-z0-9._-]{1,59}\Z' THEN
    IF char_length(v) > 200 THEN RETURN 'valor demasiado largo'; END IF;
    IF v = '*' THEN RETURN NULL; END IF;
    IF v = '' THEN RETURN 'un * (todos) o los usuarios de la suite separados por coma'; END IF;
    FOREACH u IN ARRAY string_to_array(replace(v, ' ', ''), ',') LOOP
      IF u !~ '^[a-z0-9][a-z0-9._-]{1,59}\Z' THEN RETURN 'usuario de la suite no válido: ' || u; END IF;
    END LOOP;
    RETURN NULL;
  ELSIF k ~ '^vendedor_odoo:[a-z0-9][a-z0-9._-]{1,59}\Z' THEN
    IF v !~ '^[1-9][0-9]{0,8}\Z' THEN RETURN 'id del usuario de Odoo (número)'; END IF;
    RETURN NULL;
  END IF;
  RETURN conceptualizador.config_valida_0029prev(p_clave, p_valor);
END
$cv29$;

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('puede_mover:esteban.delacruz', '*'),
  ('puede_mover:francisco.montalvo', 'francisco.montalvo,esteban.delacruz'),
  ('puede_mover:ricardo.hernandez', 'ricardo.hernandez'),
  ('vendedor_odoo:esteban.delacruz', '2'),
  ('vendedor_odoo:francisco.montalvo', '12'),
  ('vendedor_odoo:ricardo.hernandez', '12')
ON CONFLICT (clave) DO NOTHING;

-- ── La regla, en un solo lugar ───────────────────────────────────────────────────────────────────────────────────────
-- ¿Puede `p_actor` crear o mover el machote (y su orden) cuyo dueño es `p_dueno`? Con delegacion_v159 apagado: solo el
-- dueño, como hoy. Prendido: el dueño, o quien tenga '*' o al dueño en su lista. Nunca por omisión.
CREATE OR REPLACE FUNCTION conceptualizador.puede_mover(p_actor text, p_dueno text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $pm29$
DECLARE v text;
BEGIN
  IF p_actor IS NULL OR p_dueno IS NULL OR btrim(p_actor) = '' THEN RETURN false; END IF;
  IF p_actor = p_dueno THEN RETURN true; END IF;
  IF NOT conceptualizador.prendido('delegacion_v159') THEN RETURN false; END IF;
  SELECT valor INTO v FROM conceptualizador.config WHERE clave = 'puede_mover:' || p_actor;
  IF v IS NULL THEN RETURN false; END IF;
  v := replace(btrim(v), ' ', '');
  RETURN v = '*' OR p_dueno = ANY (string_to_array(v, ','));
END
$pm29$;
ALTER FUNCTION conceptualizador.puede_mover(text, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.puede_mover(text, text) FROM PUBLIC;

-- Lo que orden-odoo necesita saber de los interruptores V1.59 y del vendedor, sin abrirle la tabla config.
CREATE OR REPLACE FUNCTION conceptualizador.orden_v159(p_autor text) RETURNS jsonb
LANGUAGE sql STABLE AS $ov29$
  SELECT jsonb_build_object(
    'delegacion', conceptualizador.prendido('delegacion_v159'),
    'vendedor', conceptualizador.prendido('vendedor_v159'),
    'vendedor_odoo', (SELECT nullif(valor, '')::int FROM conceptualizador.config
                       WHERE clave = 'vendedor_odoo:' || coalesce(p_autor, '') AND valor ~ '^[1-9][0-9]{0,8}\Z'))
$ov29$;
ALTER FUNCTION conceptualizador.orden_v159(text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.orden_v159(text) FROM PUBLIC;

DO $gr29$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT SELECT (autor, oportunidad_id, created_at) ON conceptualizador.caso TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.puede_mover(text, text) TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.orden_v159(text) TO comercial_app;
  END IF;
END
$gr29$;
GRANT EXECUTE ON FUNCTION conceptualizador.puede_mover(text, text) TO conceptualizador_app;

-- ── api_suite (envoltura 0029): el hilo dice si quien lo lee puede mover el machote del caso ─────────────────────────────
DO $ren29s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0029prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0029prev;
  END IF;
END
$ren29s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui29$
DECLARE
  v_r     jsonb := conceptualizador.api_suite_0029prev(p);
  v_mach  uuid;
  v_dueno text;
BEGIN
  IF p->>'modo' = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND conceptualizador.prendido('delegacion_v159') THEN
    SELECT machote_id INTO v_mach FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
    IF v_mach IS NOT NULL THEN
      BEGIN
        SELECT m.dueno INTO v_dueno FROM comercial.machote m WHERE m.id = v_mach AND m.deleted_at IS NULL;
      EXCEPTION WHEN OTHERS THEN v_dueno := NULL;   -- una base sin el esquema comercial (las de prueba): no se dice nada
      END;
      IF v_dueno IS NOT NULL THEN
        v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object(
          'machote_mueve', jsonb_build_object('dueno', v_dueno, 'puede', conceptualizador.puede_mover(p->>'actor', v_dueno))));
      END IF;
    END IF;
  END IF;
  RETURN v_r;
END
$sui29$;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0029prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0029prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_suite_0029prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_suite(jsonb) TO conceptualizador_app;

-- ── api_motor (envoltura 0029): no volver a ofrecer un borrador que se hizo mientras el trabajo corría (tarjetas_v159) ───
DO $ren29m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0029prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0029prev;
  END IF;
END
$ren29m$;

-- Un «crear_borrador» propuesto por el trabajo `p_trabajo` que ya se hizo (mismo título) mientras ese trabajo corría.
CREATE OR REPLACE FUNCTION conceptualizador.descartar_borrador_ya_hecho(p_trabajo bigint) RETURNS int
LANGUAGE plpgsql AS $dbh29$
DECLARE v_n int;
BEGIN
  UPDATE conceptualizador.accion a SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
         resultado = jsonb_build_object('ya_hecha_por', h.id)
    FROM conceptualizador.trabajo t, conceptualizador.accion h
   WHERE t.id = p_trabajo AND a.trabajo_id = t.id AND a.tipo = 'crear_borrador' AND a.estado = 'propuesta'
     AND h.caso_id = a.caso_id AND h.tipo = 'crear_borrador' AND h.estado = 'hecha' AND h.id <> a.id
     AND h.titulo = a.titulo AND h.hecha_at >= t.created_at;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$dbh29$;
REVOKE ALL ON FUNCTION conceptualizador.descartar_borrador_ya_hecho(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot29$
DECLARE v_r jsonb := conceptualizador.api_motor_0029prev(p);
BEGIN
  IF p->>'modo' = 'entregar' AND coalesce((v_r->>'ok')::boolean, false) AND NOT coalesce((v_r->>'ya_estaba')::boolean, false)
     AND conceptualizador.prendido('tarjetas_v159') AND nullif(p->>'trabajo_id', '') ~ '^[0-9]{1,18}\Z' THEN
    PERFORM conceptualizador.descartar_borrador_ya_hecho((p->>'trabajo_id')::bigint);
  END IF;
  RETURN v_r;
END
$mot29$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0029prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0029prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0029prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
