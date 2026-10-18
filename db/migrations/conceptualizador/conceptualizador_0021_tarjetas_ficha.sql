-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0021 · V1.55 (fts-conceptualizador#12): tarjetas que se cierran solas y la ficha del cliente
--
-- 1. INTERRUPTORES nuevos, todos en '0' (con todos apagados = V1.54 de hoy):
--      cierre_tarjetas  A, B, D: una corrección por chat cierra su tarjeta; una vista nueva de «Esto voy a poner en Odoo»
--                       descarta las viejas; un rubro con tarjetas abiertas no sale cerrado; una tarjeta reemplazada no
--                       tiene botones; la franja, el rayito, el rubro y la base cuentan lo mismo
--      resumen_v155     E: un resumen largo nunca impide contestar y se compacta solo
--      aprende_v155     F: el alcance de cada decreto lo decide el modelo; lo general entra como observación con condición
--      ligas_v155       G: liga de producto exacto, verificada, con foto, en el chat y en el machote
--      menos_texto      Mejora 4: tarjetas de rubros y supuestos solo con «Dame los generales» o cuando cambian
--      ficha_cliente    Mejora 5: «Esto voy a poner en la ficha de <cliente>» (razón social, RFC, dirección, régimen, contacto)
-- 2. Modo del motor `cerrar_acciones` {caso_id, cierres:[{accion_id, estado:'hecha'|'descartada', resultado}]}: solo con
--    `cierre_tarjetas`; solo conjeturas `propuesta` del MISMO caso; hecha_por = 'motor' (no es decreto: decretos.js toma
--    solo lo que hizo una persona) y `resultado` lleva el porqué (reemplazo por chat, vista nueva…). A diferencia de
--    `asumir_conjeturas` (0012), no exige dejar 5 abiertas: lo que se cierra ya está contestado o reemplazado.
-- 3. Mejora 4: con `menos_texto`, `hilo` trae `supuestos_vigentes` (los de la respuesta más nueva que los trajo), porque una
--    respuesta ya no los repite si no cambiaron (medido: en c663eb 113,608 de 350,529 bytes eran supuestos repetidos).
-- 4. Tipo de acción `actualizar_cliente` (Mejora 5): con `ficha_cliente`, `entregar` lo guarda (una propuesta nueva
--    reemplaza a la anterior sin resolver) y, cuando la persona lo hace, el caso queda ligado a la empresa y al contacto
--    que regresó Odoo (read-back del workflow conceptualizador/odoo-ficha). Apagado, `entregar` lo ignora como hoy.
-- Lo que NO cambia: ningún interruptor existente, ningún valor de config, ningún modo existente.
-- Reversa: db/reversas/021_reversa.sql (quita las envolturas y devuelve los nombres; no borra datos).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente (los renombres van una sola vez).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · interruptores ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in21$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente']
$in21$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── 2 · el tipo de acción nuevo ────────────────────────────────────────────
ALTER TABLE conceptualizador.accion DROP CONSTRAINT IF EXISTS accion_tipo_check;
ALTER TABLE conceptualizador.accion ADD CONSTRAINT accion_tipo_check
  CHECK (tipo IN ('conjetura','alta_contacto','crear_machote','crear_borrador','enviada','cerrar','actualizar_cliente'));

-- ── 3 · api_motor (envoltura) ──────────────────────────────────────────────
DO $ren21m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0021prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0021prev;
  END IF;
END
$ren21m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot21$
DECLARE
  v_modo  text := p->>'modo';
  v_motor text := p->>'motor';
  v_caso  uuid;
  v_r     jsonb;
  v_x     jsonb;
  v_n     int := 0;
  v_t     bigint;
BEGIN
  IF v_modo = 'cerrar_acciones' THEN
    IF v_motor IS NULL OR v_motor NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
    IF NOT conceptualizador.prendido('cierre_tarjetas') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'cierre_tarjetas');
    END IF;
    v_caso := conceptualizador.a_uuid(p->>'caso_id');
    IF v_caso IS NULL OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF jsonb_typeof(p->'cierres') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'cierres') > 40 THEN RETURN jsonb_build_object('ok', false, 'error', 'PARAMETROS'); END IF;
    FOR v_x IN SELECT * FROM jsonb_array_elements(p->'cierres') LOOP
      CONTINUE WHEN coalesce(v_x->>'estado', '') NOT IN ('hecha','descartada') OR coalesce(v_x->>'accion_id', '') !~ '^[0-9]{1,12}\Z';
      UPDATE conceptualizador.accion a
         SET estado = v_x->>'estado', hecha_por = 'motor', hecha_at = now(),
             resultado = jsonb_build_object('cerrada_por_motor', true, 'motivo', left(coalesce(v_x->'resultado'->>'motivo', ''), 60),
                           'detalle', left(coalesce(v_x->'resultado'->>'detalle', ''), 400), 'trabajo_id', nullif(p->>'trabajo_id', ''),
                           'reemplazada_por', nullif(v_x->'resultado'->>'reemplazada_por', ''), 'valor', left(coalesce(v_x->'resultado'->>'valor', ''), 600))
       WHERE a.id = (v_x->>'accion_id')::bigint AND a.caso_id = v_caso AND a.tipo = 'conjetura' AND a.estado = 'propuesta';
      IF FOUND THEN v_n := v_n + 1; END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'cerradas', v_n,
      'abiertas', (SELECT count(*) FROM conceptualizador.accion a WHERE a.caso_id = v_caso AND a.estado = 'propuesta'));
  END IF;

  v_r := conceptualizador.api_motor_0021prev(p);
  -- La ficha del cliente: `entregar` de antes ignora el tipo nuevo; aquí se guarda (solo con el interruptor).
  IF v_modo = 'entregar' AND coalesce((v_r->>'ok')::boolean, false) AND NOT coalesce((v_r->>'ya_estaba')::boolean, false)
     AND conceptualizador.prendido('ficha_cliente') AND jsonb_typeof(p->'respuesta'->'acciones') = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(p->'respuesta'->'acciones') x WHERE x->>'tipo' = 'actualizar_cliente') THEN
    v_t := nullif(p->>'trabajo_id', '')::bigint;
    SELECT caso_id INTO v_caso FROM conceptualizador.trabajo WHERE id = v_t;
    IF v_caso IS NOT NULL THEN
      UPDATE conceptualizador.accion SET estado = 'descartada', hecha_at = now(), hecha_por = 'motor',
             resultado = jsonb_build_object('reemplazada_por_trabajo', v_t)
       WHERE caso_id = v_caso AND estado = 'propuesta' AND tipo = 'actualizar_cliente';
      INSERT INTO conceptualizador.accion (caso_id, trabajo_id, tipo, titulo, datos)
      SELECT v_caso, v_t, 'actualizar_cliente', left(coalesce(x->>'titulo', 'Esto voy a poner en la ficha del cliente'), 300), coalesce(x->'datos', '{}'::jsonb)
        FROM jsonb_array_elements(p->'respuesta'->'acciones') x WHERE x->>'tipo' = 'actualizar_cliente' LIMIT 1;
    END IF;
  END IF;
  RETURN v_r;
END
$mot21$;

-- ── 4 · api_suite (envoltura): la ficha hecha liga el caso a la empresa y al contacto ─
DO $ren21s$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_suite_0021prev') THEN
    ALTER FUNCTION conceptualizador.api_suite(jsonb) RENAME TO api_suite_0021prev;
  END IF;
END
$ren21s$;

CREATE OR REPLACE FUNCTION conceptualizador.api_suite(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $sui21$
DECLARE
  v_r  jsonb := conceptualizador.api_suite_0021prev(p);
  v_a  conceptualizador.accion%ROWTYPE;
  v_c  uuid;
BEGIN
  -- Mejora 4 (`menos_texto`): una respuesta ya no repite los supuestos si no cambiaron; el hilo trae los vigentes (los de la
  -- respuesta más nueva que sí los trajo) para la tarjeta «Supuse esto» y para «↺ Cambiar».
  IF p->>'modo' = 'hilo' AND coalesce((v_r->>'ok')::boolean, false) AND conceptualizador.prendido('menos_texto') THEN
    v_c := conceptualizador.a_uuid(p->>'caso_id');
    IF v_c IS NOT NULL THEN
      v_r := jsonb_set(v_r, ARRAY['hilo'], coalesce(v_r->'hilo', '{}'::jsonb) || jsonb_build_object('supuestos_vigentes',
        coalesce((SELECT r.verifica->'supuestos' FROM conceptualizador.respuesta r WHERE r.caso_id = v_c AND r.verifica ? 'supuestos' ORDER BY r.id DESC LIMIT 1), '[]'::jsonb)));
    END IF;
  END IF;
  IF p->>'modo' = 'accion' AND p->>'decision' = 'hecha' AND coalesce((v_r->>'ok')::boolean, false) AND NOT coalesce((v_r->>'ya_estaba')::boolean, false) THEN
    SELECT * INTO v_a FROM conceptualizador.accion WHERE id = nullif(p->>'accion_id', '')::bigint;
    IF v_a.tipo = 'actualizar_cliente' THEN
      UPDATE conceptualizador.caso c SET
        cliente_odoo_id = coalesce(nullif(p->'resultado'->>'partner_id', '')::int, c.cliente_odoo_id),
        contacto_odoo_id = coalesce(nullif(p->'resultado'->>'contacto_id', '')::int, nullif(p->'resultado'->>'partner_id', '')::int, c.contacto_odoo_id),
        cliente = coalesce(nullif(left(p->'resultado'->>'partner_nombre', 120), ''), c.cliente)
       WHERE c.id = v_a.caso_id;
    END IF;
  END IF;
  RETURN v_r;
END
$sui21$;

-- ── Permisos: la app solo ejecuta las puertas ──────────────────────────────
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0021prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_suite_0021prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0021prev(jsonb), conceptualizador.api_suite_0021prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0021prev(jsonb), conceptualizador.api_suite_0021prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb), conceptualizador.api_suite(jsonb) TO conceptualizador_app;
