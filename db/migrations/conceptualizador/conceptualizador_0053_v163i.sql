-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0053 · V1.63i (fts-conceptualizador#16, Esteban 27-oct-2026): revisión rápida y reglas de campo
--
-- Todo nace APAGADO; apagado, cada función sale igual que con la 0052.
--   · 10 interruptores: criterio_v163i (B6–B9, solo motor), ruido_v163i (A5), voz_previa_v163i (A1), por_confirmar_v163i (A2),
--     un_paso_v163i (A3, motor y suite), cambio_no_llegado_v163i (A4) y frenos_v163i (URGENTE 21fec6: la regla 6 no frena un N3 ni lo
--     aceptado, el N3 se completa solo, el margen real en el texto y la vigencia no es «a mano»; solo motor).
--   · A4 · tabla cambio_pedido: el motor anota el cambio que pidió una persona (api_motor `cambio_pedido`) y cuándo lo releyó
--     en Odoo (`cambio_llego`). A las `alarma_cambio_no_llegado_min` (120) sin llegar: alarma `cambio_no_llegado` en el correo de
--     Esteban (alarmas_motor) y UNA línea en el chat del dueño (encolar_alarmas): «el cambio del msg X no ha llegado a Odoo».
--   · A5 · robot_sin_pasadas no suena cuando el vigía dice que la causa se resuelve sola: tope de ritmo, del día o de la
--     semana, nada nuevo, ningún caso con trabajo o una pasada en curso.
--   · A (agregado 27-oct, 21fec6 trabajo 960) · agente_gate (envoltura, `un_paso_v163i`): confirmar «Esto voy a poner en Odoo»
--     (conjetura `odoo.vista` hecha) es la instrucción de quien la confirmó, con los mismos candados que la aprobación de voz (0049):
--     la acción es de esa persona, del caso del trabajo, de menos de 2 horas, trabajo en curso, el machote del caso y puede_mover.
--   · 2 interruptores más: regla_nueva_v163i (B: una regla nueva no frena lo ya aceptado, solo motor) y freno_arriba_v163i
--     (C y D: el freno va arriba y nada lleva ✓ si algo quedó frenado o sin comprobar; relectura del renglón en Odoo; solo motor).
--   · fallas_odoo_v163i (#16, 70f5e9): el mismo error de Odoo 2 veces en un caso en 24 h es alarma `falla_odoo_repetida` a Esteban.
--   · A1 · voz_rafaga_normal conserva por nota la transcripción revisada en el teléfono (`texto`, `texto_editado`), el
--     audio ya subido (`adjunto_id`) y el ligado que la persona eligió en la previa (`liga`).
-- Reversa: reversas/053_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in53$
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
               'frenos_v163i','regla_nueva_v163i','freno_arriba_v163i','fallas_odoo_v163i']
$in53$;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('alarma_cambio_no_llegado_min', '120') ON CONFLICT (clave) DO NOTHING;

-- ── A4 · el cambio pedido y si ya llegó a Odoo ──
CREATE TABLE IF NOT EXISTS conceptualizador.cambio_pedido (
  id          bigserial   PRIMARY KEY,
  caso_id     uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  mensaje_id  bigint      NOT NULL,
  autor       text        NOT NULL,
  que         text        NOT NULL,
  clase       text        NOT NULL DEFAULT 'texto' CHECK (clase IN ('texto','precio')),
  pedido_at   timestamptz NOT NULL DEFAULT now(),
  llego_at    timestamptz,
  odoo_so     text,
  descartado_at timestamptz,
  avisado_at  timestamptz,
  UNIQUE (caso_id, mensaje_id, que)
);
CREATE INDEX IF NOT EXISTS cambio_pedido_abierto ON conceptualizador.cambio_pedido (pedido_at) WHERE llego_at IS NULL AND descartado_at IS NULL;

/** Los cambios pedidos que no han llegado a Odoo en `alarma_cambio_no_llegado_min`, de casos vivos: UNO por mensaje, con lo que falta. */
CREATE OR REPLACE FUNCTION conceptualizador.cambio_no_llegado(p_ahora timestamptz DEFAULT now())
RETURNS TABLE (caso_id uuid, mensaje_id bigint, autor text, que text, desde timestamptz, titulo text, dueno text, avisado boolean)
LANGUAGE sql STABLE AS $cn53$
  SELECT cp.caso_id, cp.mensaje_id, min(cp.autor), string_agg(cp.que, '; ' ORDER BY cp.id), min(cp.pedido_at), min(c.titulo), min(c.autor), bool_and(cp.avisado_at IS NOT NULL)
    FROM conceptualizador.cambio_pedido cp JOIN conceptualizador.caso c ON c.id = cp.caso_id
   WHERE conceptualizador.prendido('cambio_no_llegado_v163i')
     AND cp.llego_at IS NULL AND cp.descartado_at IS NULL AND c.archivado_at IS NULL AND coalesce(c.estado, '') NOT IN ('archivado','cerrado')
     AND cp.pedido_at < p_ahora - make_interval(mins => greatest(1, coalesce(conceptualizador.cfg('alarma_cambio_no_llegado_min'), 120)))
     -- Llegó también si DESPUÉS del pedido hay una orden escrita en Odoo (la tarjeta hecha por el agente o por el clic de la persona)
     -- cuyo cambio no se releyó como faltante.
     AND NOT EXISTS (SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = cp.caso_id AND a.tipo = 'crear_borrador' AND a.estado = 'hecha'
                      AND a.hecha_at > cp.pedido_at AND coalesce(a.resultado->>'cambio_ok', 'true') <> 'false'
                      AND NOT coalesce((a.datos->>'deshacer')::boolean, false))
   GROUP BY cp.caso_id, cp.mensaje_id
   ORDER BY min(cp.pedido_at)
$cn53$;
REVOKE ALL ON FUNCTION conceptualizador.cambio_no_llegado(timestamptz) FROM PUBLIC;

-- ── api_motor (envoltura): cambio_pedido y cambio_llego ──
DO $ren53m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0053prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0053prev;
  END IF;
END
$ren53m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot53$
DECLARE
  v_caso uuid;
  v_e    jsonb;
  v_n    int := 0;
BEGIN
  IF coalesce(p->>'modo', '') NOT IN ('cambio_pedido','cambio_llego') THEN RETURN conceptualizador.api_motor_0053prev(p); END IF;
  IF coalesce(p->>'motor', '') NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
  IF NOT conceptualizador.prendido('cambio_no_llegado_v163i') THEN RETURN jsonb_build_object('ok', true, 'apagado', true); END IF;
  BEGIN v_caso := nullif(p->>'caso_id','')::uuid; EXCEPTION WHEN others THEN v_caso := NULL; END;
  IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_INVALIDO'); END IF;
  IF p->>'modo' = 'cambio_pedido' THEN
    IF jsonb_typeof(p->'cambios') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'cambios') > 40 THEN RETURN jsonb_build_object('ok', false, 'error', 'PARAMETROS'); END IF;
    FOR v_e IN SELECT * FROM jsonb_array_elements(p->'cambios') LOOP
      CONTINUE WHEN coalesce(v_e->>'mensaje_id', '') !~ '^[0-9]{1,15}\Z' OR char_length(btrim(coalesce(v_e->>'que', ''))) < 3;
      -- Solo mensajes de una PERSONA del mismo caso.
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM conceptualizador.mensaje m WHERE m.id = (v_e->>'mensaje_id')::bigint AND m.caso_id = v_caso AND m.rol = 'usuario');
      INSERT INTO conceptualizador.cambio_pedido (caso_id, mensaje_id, autor, que, clase, pedido_at)
      SELECT v_caso, m.id, m.autor, left(btrim(v_e->>'que'), 300), CASE WHEN v_e->>'clase' = 'precio' THEN 'precio' ELSE 'texto' END, m.created_at
        FROM conceptualizador.mensaje m WHERE m.id = (v_e->>'mensaje_id')::bigint
      ON CONFLICT (caso_id, mensaje_id, que) DO NOTHING;
      IF FOUND THEN v_n := v_n + 1; END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'anotados', v_n);
  END IF;
  -- cambio_llego: la orden releída en Odoo ya tiene lo pedido hasta `hasta_mensaje_id` (o los `ids` de cambio_pedido), o se descartó.
  IF coalesce(p->>'hasta_mensaje_id', '') ~ '^[0-9]{1,15}\Z' THEN
    UPDATE conceptualizador.cambio_pedido SET llego_at = now(), odoo_so = left(p->>'so', 40)
     WHERE caso_id = v_caso AND mensaje_id <= (p->>'hasta_mensaje_id')::bigint AND llego_at IS NULL AND descartado_at IS NULL
       AND (CASE WHEN p->>'clase' IN ('texto','precio') THEN clase = p->>'clase' ELSE true END);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF coalesce((p->>'descartar')::boolean, false) THEN
    UPDATE conceptualizador.cambio_pedido SET descartado_at = now() WHERE caso_id = v_caso AND llego_at IS NULL AND descartado_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE RETURN jsonb_build_object('ok', false, 'error', 'PARAMETROS');
  END IF;
  RETURN jsonb_build_object('ok', true, 'llegaron', v_n, 'pendientes', (SELECT count(*) FROM conceptualizador.cambio_pedido WHERE caso_id = v_caso AND llego_at IS NULL AND descartado_at IS NULL));
END
$mot53$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0053prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0053prev(jsonb) FROM PUBLIC;
DO $gr53m$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.api_motor_0053prev(jsonb) FROM conceptualizador_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
  END IF;
END
$gr53m$;

-- ── alarmas_motor (envoltura): cambio_no_llegado y robot_sin_pasadas sin ruido ──
DO $ren53a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0053prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0053prev;
  END IF;
END
$ren53a$;

/** La razón del vigía para no correr pasadas se resuelve sola (la misma lista que herramientas/motor/destinos.js CAUSA_LEGITIMA). */
CREATE OR REPLACE FUNCTION conceptualizador.causa_legitima(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $cl53$
  SELECT coalesce(btrim(p), '') ~* '^(ritmo\M|AVANCE_APAGADO|.*sin nada nuevo|los candidatos tocaron su tope|ning[uú]n caso tiene trabajo|pasada [^ ]+ en curso|tope)'
$cl53$;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am53$
DECLARE
  v_r     jsonb := conceptualizador.alarmas_motor_0053prev(p_llave);
  v_ahora timestamptz;
  f       record;
BEGIN
  IF p_llave <> 'conceptualizador' THEN RETURN v_r; END IF;
  IF conceptualizador.prendido('ruido_v163i') THEN
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_r FROM jsonb_array_elements(v_r) x
     WHERE NOT (x->>'alarma' = 'robot_sin_pasadas' AND conceptualizador.causa_legitima(x->>'porque'));
  END IF;
  IF conceptualizador.prendido('cambio_no_llegado_v163i') THEN
    v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
    FOR f IN SELECT * FROM conceptualizador.cambio_no_llegado(v_ahora) LOOP
      v_r := v_r || conceptualizador.alarma('cambio_no_llegado', f.caso_id::text || ':' || f.mensaje_id, f.desde,
        'El cambio del msg ' || f.mensaje_id || ' («' || left(f.que, 120) || '», de ' || f.autor || ', caso «' || left(f.titulo, 60) || '») no ha llegado a Odoo desde las ' ||
          coalesce(conceptualizador.hora_local(f.desde) || ' CST', '?') || '.',
        'Abre el caso: si hay una tarjeta para Odoo sin tocar, tócala o pídele al dueño que la toque; si la orden está bloqueada, el chat dice por qué.',
        'cambio-no-llegado', jsonb_build_object('caso_id', f.caso_id, 'mensaje_id', f.mensaje_id, 'autor', f.autor, 'dueno', f.dueno));
    END LOOP;
  END IF;
  -- V1.63i (#16, 70f5e9, Esteban 28-oct 07:15 MT) · el mismo error de Odoo dos veces en un caso (24 h) = alarma a Esteban: «Volver a armar»
  -- que da el mismo error no lo arregla (Richard, OPCIONAL_INVALIDO, msg 1667 y después).
  IF conceptualizador.prendido('fallas_odoo_v163i') THEN
    v_ahora := coalesce(nullif(current_setting('cz.ahora_prueba', true), '')::timestamptz, now());
    FOR f IN SELECT fo.caso_id, fo.codigo, count(*) AS n, min(fo.at) AS desde, max(fo.at) AS ultima, (array_agg(fo.mensaje ORDER BY fo.id DESC))[1] AS mensaje,
                    (array_agg(fo.actor ORDER BY fo.id DESC))[1] AS actor, k.titulo, k.autor
               FROM conceptualizador.falla_odoo fo JOIN conceptualizador.caso k ON k.id = fo.caso_id
              WHERE fo.at > v_ahora - interval '24 hours' AND fo.at <= v_ahora AND k.archivado_at IS NULL
              GROUP BY fo.caso_id, fo.codigo, k.titulo, k.autor HAVING count(*) >= 2 LOOP
      v_r := v_r || conceptualizador.alarma('falla_odoo_repetida', f.caso_id::text || ':' || f.codigo, f.desde,
        'El mismo error de Odoo (' || f.codigo || ') ' || f.n || ' veces en el caso «' || left(f.titulo, 60) || '» (' || f.autor || '), la última a las ' ||
          coalesce(conceptualizador.hora_local(f.ultima) || ' CST', '?') || ': ' || left(coalesce(f.mensaje, 'sin mensaje'), 200),
        'Reintentar o volver a armar da lo mismo: hay que arreglar la causa. Abre el caso y el error dice qué la produce.',
        'falla-odoo-repetida', jsonb_build_object('caso_id', f.caso_id, 'codigo', f.codigo, 'veces', f.n, 'actor', f.actor));
    END LOOP;
  END IF;
  RETURN v_r;
END
$am53$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0053prev(text) FROM PUBLIC;

-- ── el aviso al dueño en su chat (una vez por cambio) ──
CREATE OR REPLACE FUNCTION conceptualizador.cambio_no_llegado_avisar(p_ahora timestamptz DEFAULT now()) RETURNS int
LANGUAGE plpgsql AS $ca53$
DECLARE
  f   record;
  v_n int := 0;
BEGIN
  IF NOT conceptualizador.prendido('cambio_no_llegado_v163i') THEN RETURN 0; END IF;
  FOR f IN SELECT * FROM conceptualizador.cambio_no_llegado(p_ahora) WHERE NOT avisado LOOP
    UPDATE conceptualizador.cambio_pedido SET avisado_at = now() WHERE caso_id = f.caso_id AND mensaje_id = f.mensaje_id AND avisado_at IS NULL;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (f.caso_id, 'sistema', 'alarma',
      'El cambio del msg ' || f.mensaje_id || ' («' || left(f.que, 120) || '») no ha llegado a Odoo en ' ||
      round(greatest(1, coalesce(conceptualizador.cfg('alarma_cambio_no_llegado_min'), 120)) / 60.0, 1)::text || ' h. Ya le avisé a Esteban.');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$ca53$;
REVOKE ALL ON FUNCTION conceptualizador.cambio_no_llegado_avisar(timestamptz) FROM PUBLIC;

DO $ren53e$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'encolar_alarmas_0053prev') THEN
    ALTER FUNCTION conceptualizador.encolar_alarmas(text) RENAME TO encolar_alarmas_0053prev;
  END IF;
END
$ren53e$;
CREATE OR REPLACE FUNCTION conceptualizador.encolar_alarmas(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql AS $ea53$
BEGIN
  IF p_llave = 'conceptualizador' THEN PERFORM conceptualizador.cambio_no_llegado_avisar(); END IF;
  RETURN conceptualizador.encolar_alarmas_0053prev(p_llave);
END
$ea53$;
REVOKE ALL ON FUNCTION conceptualizador.encolar_alarmas(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.encolar_alarmas_0053prev(text) FROM PUBLIC;

-- ── A1 · voz_rafaga_normal (envoltura): lo revisado en la previa del teléfono ──
DO $ren53v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'voz_rafaga_normal_0053prev') THEN
    ALTER FUNCTION conceptualizador.voz_rafaga_normal(jsonb) RENAME TO voz_rafaga_normal_0053prev;
  END IF;
END
$ren53v$;
CREATE OR REPLACE FUNCTION conceptualizador.voz_rafaga_normal(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $vrn53$
DECLARE
  v_out jsonb := conceptualizador.voz_rafaga_normal_0053prev(p);
  v_n   jsonb;
  v_x   jsonb := '[]'::jsonb;
  v_i   int := 0;
  v_l   jsonb;
BEGIN
  IF v_out IS NULL OR NOT conceptualizador.prendido('voz_previa_v163i') THEN RETURN v_out; END IF;
  FOR v_n IN SELECT * FROM jsonb_array_elements(v_out) LOOP
    v_l := p->'notas'->v_i->'liga';
    v_x := v_x || (v_n
      || CASE WHEN char_length(btrim(coalesce(p->'notas'->v_i->>'texto', ''))) BETWEEN 1 AND 4000
              THEN jsonb_build_object('texto', btrim(p->'notas'->v_i->>'texto'), 'texto_editado', coalesce((p->'notas'->v_i->>'texto_editado')::boolean, false))
              ELSE '{}'::jsonb END
      || CASE WHEN coalesce(p->'notas'->v_i->>'adjunto_id', '') ~ '^[0-9]{1,15}\Z' THEN jsonb_build_object('adjunto_id', (p->'notas'->v_i->>'adjunto_id')::bigint) ELSE '{}'::jsonb END
      || CASE WHEN jsonb_typeof(v_l) = 'object' AND coalesce(v_l->>'fuente', '') IN ('elegido','general')
              THEN jsonb_build_object('liga', jsonb_build_object('fuente', v_l->>'fuente',
                     'sec', CASE WHEN v_l->>'fuente' = 'general' THEN NULL ELSE left(v_l->>'sec', 160) END,
                     'ren', CASE WHEN v_l->>'fuente' = 'general' THEN NULL ELSE left(v_l->>'ren', 160) END, 'txt', left(v_l->>'txt', 160)))
              ELSE '{}'::jsonb END);
    v_i := v_i + 1;
  END LOOP;
  RETURN v_x;
EXCEPTION WHEN others THEN RETURN v_out;
END
$vrn53$;

-- ── A (21fec6 trabajo 960) · agente_gate (envoltura): confirmar «Esto voy a poner en Odoo» es la instrucción de quien la confirmó ──
DO $ren53g$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'agente_gate_0053prev') THEN
    ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) RENAME TO agente_gate_0053prev;
  END IF;
END
$ren53g$;

CREATE OR REPLACE FUNCTION conceptualizador.agente_gate(p_trabajo bigint, p_machote uuid, p_para text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $ag53$
DECLARE
  v_sw   text := CASE WHEN p_para = 'orden' THEN 'todo_hecho_v162b' ELSE 'guardar_agente_v162b' END;
  t      record;
  v_ac   record;
  v_ids  bigint[];
  v_due  text;
  v_mach uuid;
BEGIN
  SELECT tr.id, tr.caso_id, tr.estado, e.id AS ev_id, e.tipo AS ev_tipo, e.datos AS ev_datos, e.autor AS ev_autor INTO t
    FROM conceptualizador.trabajo tr LEFT JOIN conceptualizador.evento e ON e.id = tr.evento_id WHERE tr.id = p_trabajo;
  IF t.id IS NULL OR t.ev_tipo IS DISTINCT FROM 'accion' OR coalesce(t.ev_datos->>'tipo', '') <> 'conjetura'
     OR coalesce(t.ev_datos->>'decision', '') <> 'hecha' OR t.ev_autor IS NULL
     OR NOT conceptualizador.prendido('un_paso_v163i') OR NOT conceptualizador.prendido(v_sw) THEN
    RETURN conceptualizador.agente_gate_0053prev(p_trabajo, p_machote, p_para);
  END IF;
  -- la acción del evento, o las del lote que se confirmaron
  SELECT array_agg(x::bigint) INTO v_ids FROM (
    SELECT t.ev_datos->>'accion_id' AS x
    UNION ALL SELECT l->>'accion_id' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.ev_datos->'lote') = 'array' THEN t.ev_datos->'lote' ELSE '[]'::jsonb END) l
     WHERE coalesce(l->>'decision', '') = 'hecha') q WHERE x ~ '^[0-9]{1,15}\Z';
  SELECT a.id, a.hecha_por, a.hecha_at INTO v_ac FROM conceptualizador.accion a
   WHERE a.id = ANY (coalesce(v_ids, '{}'::bigint[])) AND a.caso_id = t.caso_id AND a.tipo = 'conjetura' AND a.estado = 'hecha'
     AND coalesce(a.datos->>'campo', '') = 'odoo.vista' AND a.hecha_por = t.ev_autor
   ORDER BY a.hecha_at DESC LIMIT 1;
  IF v_ac.id IS NULL THEN RETURN conceptualizador.agente_gate_0053prev(p_trabajo, p_machote, p_para); END IF;
  IF t.estado <> 'tomado' THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_INSTRUCCION', 'mensaje', 'Ese trabajo ya no está en curso.'); END IF;
  IF v_ac.hecha_at < now() - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSTRUCCION_VIEJA', 'mensaje', 'La confirmación tiene más de 2 horas: que la persona lo vuelva a pedir.');
  END IF;
  SELECT k.machote_id INTO v_mach FROM conceptualizador.caso k WHERE k.id = t.caso_id;
  IF p_machote IS NULL OR v_mach IS DISTINCT FROM p_machote THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'Ese machote no es el del caso de la confirmación.');
  END IF;
  IF to_regclass('comercial.machote') IS NOT NULL THEN
    EXECUTE 'SELECT dueno FROM comercial.machote WHERE id = ' || quote_literal(p_machote::text) || '::uuid' INTO v_due;
  END IF;
  IF v_due IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'MACHOTE_NO_ENCONTRADO'); END IF;
  IF NOT (t.ev_autor = v_due OR conceptualizador.puede_mover(t.ev_autor, v_due)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_PUEDE_MOVER', 'persona', t.ev_autor, 'dueno', v_due,
      'mensaje', t.ev_autor || ' no tiene permiso para mover lo de ' || v_due || ': no guardé nada.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', 'vista_odoo', 'persona', t.ev_autor, 'dueno', v_due, 'mensaje_id', NULL, 'accion_id', v_ac.id,
    'caso_id', t.caso_id, 'msg_at', v_ac.hecha_at, 'hora', to_char(v_ac.hecha_at AT TIME ZONE 'America/Monterrey', 'HH24:MI'),
    'motivo', 'lo aplicó el agente porque ' || t.ev_autor || ' confirmó «Esto voy a poner en Odoo» (acción ' || v_ac.id || ')');
END
$ag53$;
ALTER FUNCTION conceptualizador.agente_gate(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.agente_gate_0053prev(bigint, uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.agente_gate_0053prev(bigint, uuid, text) FROM PUBLIC;
DO $gr53g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.agente_gate(bigint, uuid, text) TO comercial_app;
  END IF;
END
$gr53g$;
