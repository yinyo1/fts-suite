-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0022 · V1.56 (fts-conceptualizador#12, decisiones de Esteban del 19-oct, puntos 4, 6 y 7)
--
-- 1. VER Y DESCARGAR la cotización, separado de enviar (punto 4): `api_correo` modo `cliente_ver` (el PDF de Odoo) y modo nuevo
--    `cliente_ficha` (solo lectura: la orden y el cliente del caso, para decir qué le falta a su ficha en Odoo) ya NO dependen
--    del interruptor `enviar_cliente`. Solo el dueño del caso o un admin del panel (Esteban); un lector (canario) no.
--    `cliente_preparar` / `cliente_enviar` / `cliente_resultado` siguen EXACTAMENTE igual: detrás de `enviar_cliente`.
-- 2. PROFUNDIDAD DEL MOTOR sin `relevo_v152` (punto 6): el latido guarda la profundidad que manda el motor aunque el
--    interruptor esté apagado (antes solo con él: por eso el latido decía `profundidad null`), y el aviso `motor_linaje`
--    (correo a Esteban por conceptualizador/consumo-avisos) sale con profundidad ≥ 6 aunque `relevo_v152` esté apagado.
--    Lo de `relevo_v152` (umbrales de relevo, sin_relevo) no cambia.
-- 3. CANARIO (punto 7): tabla `salud_canario` (un renglón por corrida) y modo de motor `canario` (lo escribe la tarea diaria
--    de las 6:50 CST); `salud` devuelve la última corrida para que el correo de las 7:00 la ponga en su primera línea.
-- Lo que NO cambia: ningún interruptor, ningún valor de config, ningún otro modo (todos pasan tal cual a las *_0022prev).
-- Reversa: db/reversas/022_reversa.sql (quita las envolturas y devuelve los nombres; no borra datos).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente (los renombres van una sola vez).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conceptualizador.salud_canario (
  id         bigserial   PRIMARY KEY,
  ok         boolean     NOT NULL,
  resumen    text        NOT NULL CHECK (char_length(resumen) <= 600),
  detalle    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sesion     text,
  creado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salud_canario_creado ON conceptualizador.salud_canario (creado_at DESC);

-- ── 1 · api_correo (envoltura) ─────────────────────────────────────────────
DO $ren22c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_correo_0022prev') THEN
    ALTER FUNCTION conceptualizador.api_correo(jsonb) RENAME TO api_correo_0022prev;
  END IF;
END
$ren22c$;

CREATE OR REPLACE FUNCTION conceptualizador.api_correo(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $cor22$
DECLARE
  v_modo  text := p->>'modo';
  v_actor text := nullif(btrim(coalesce(p->>'actor', '')), '');
  v_k     conceptualizador.caso%ROWTYPE;
BEGIN
  IF v_modo NOT IN ('cliente_ver', 'cliente_ficha') THEN RETURN conceptualizador.api_correo_0022prev(p); END IF;
  IF v_actor IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ACTOR'); END IF;
  IF conceptualizador.es_lector(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA', 'mensaje', 'Este usuario solo puede mirar: no escribe, no manda ni cambia nada.');
  END IF;
  -- El workflow pasa por aquí ANTES de preparar o enviar (`para`): eso sigue detrás de enviar_cliente, y se corta aquí, antes
  -- de leer Odoo o ponerle token del portal a la orden.
  IF coalesce(p->>'para', '') IN ('preparar', 'enviar') AND NOT conceptualizador.prendido('enviar_cliente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INTERRUPTOR_APAGADO', 'interruptor', 'enviar_cliente');
  END IF;
  SELECT * INTO v_k FROM conceptualizador.caso WHERE id = conceptualizador.a_uuid(p->>'caso_id');
  IF v_k.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
  IF v_k.autor <> v_actor AND NOT conceptualizador.es_panel_admin(v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_AUTORIZADO', 'mensaje', 'La cotización la ve quien cotiza o Esteban.');
  END IF;
  IF v_modo = 'cliente_ver' AND v_k.orden_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SIN_ORDEN', 'mensaje', 'Primero se crea la cotización en Odoo (borrador).');
  END IF;
  -- Ver: la orden del caso (el workflow baja su PDF del portal). Ficha: además el cliente del caso, aunque no haya orden.
  RETURN jsonb_build_object('ok', true, 'caso', jsonb_build_object('orden_id', v_k.orden_id, 'orden_nombre', v_k.orden_nombre,
    'oportunidad_id', v_k.oportunidad_id, 'contacto_odoo_id', v_k.contacto_odoo_id, 'cliente_odoo_id', v_k.cliente_odoo_id,
    'autor', v_k.autor, 'empresa_id', v_k.empresa_id));
END
$cor22$;

-- ── 2 y 3 · api_motor (envoltura) ──────────────────────────────────────────
DO $ren22m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0022prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0022prev;
  END IF;
END
$ren22m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot22$
DECLARE
  v_modo  text := p->>'modo';
  v_motor text := p->>'motor';
  v_r     jsonb;
  v_l     conceptualizador.latido%ROWTYPE;
  v_av    jsonb := '[]'::jsonb;
  v_c     jsonb;
BEGIN
  -- Canario (punto 7): un renglón por corrida. Lo escribe la tarea programada de las 6:50 CST con la llave del motor.
  IF v_modo = 'canario' THEN
    IF v_motor IS NULL OR v_motor NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
    IF jsonb_typeof(p->'ok') IS DISTINCT FROM 'boolean' OR coalesce(btrim(p->>'resumen'), '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PARAMETROS');
    END IF;
    IF jsonb_typeof(coalesce(p->'detalle', '{}'::jsonb)) IS DISTINCT FROM 'object' OR length(coalesce(p->'detalle', '{}'::jsonb)::text) > 20000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DETALLE_INVALIDO');
    END IF;
    INSERT INTO conceptualizador.salud_canario (ok, resumen, detalle, sesion)
    VALUES ((p->>'ok')::boolean, left(p->>'resumen', 600), coalesce(p->'detalle', '{}'::jsonb), left(p->>'sesion', 120));
    RETURN jsonb_build_object('ok', true, 'canario', (SELECT to_jsonb(c) - 'detalle' FROM conceptualizador.salud_canario c ORDER BY id DESC LIMIT 1));
  END IF;

  v_r := conceptualizador.api_motor_0022prev(p);

  -- Profundidad (punto 6): la de antes solo la guardaba con relevo_v152. Ahora siempre que el motor la mande.
  IF v_modo = 'latido' AND coalesce((v_r->>'ok')::boolean, false) AND NOT conceptualizador.prendido('relevo_v152')
     AND coalesce(p->>'profundidad', '') ~ '^[0-9]{1,3}\Z' AND v_motor = 'principal' THEN
    UPDATE conceptualizador.latido SET profundidad = (p->>'profundidad')::int WHERE motor = 'principal' AND sesion = p->>'sesion';
  END IF;

  -- Aviso de linaje (correo a Esteban) aunque relevo_v152 esté apagado. Con él prendido ya lo arma la de antes.
  IF v_modo = 'avisos_consumo' AND coalesce((v_r->>'ok')::boolean, false) AND NOT conceptualizador.prendido('relevo_v152')
     AND conceptualizador.prendido('aviso_motor_caido') THEN
    SELECT * INTO v_l FROM conceptualizador.latido WHERE motor = 'principal';
    IF v_l.motor IS NOT NULL AND coalesce(v_l.profundidad, 0) >= 6
       AND v_l.visto_at > now() - make_interval(secs => coalesce(conceptualizador.cfg('latido_vivo_segundos'), 120))
       AND NOT EXISTS (SELECT 1 FROM conceptualizador.consumo_aviso WHERE tipo = 'motor_linaje' AND clave = coalesce(v_l.sesion, '?')) THEN
      v_av := jsonb_build_array(jsonb_build_object('tipo', 'motor_linaje', 'clave', coalesce(v_l.sesion, '?'), 'sesion', v_l.sesion,
                                                   'profundidad', v_l.profundidad, 'limite', 8, 'at', v_l.visto_at));
      IF NOT coalesce((p->>'dry_run')::boolean, true) THEN
        INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
        VALUES ('motor_linaje', coalesce(v_l.sesion, '?'), (v_av->0) - 'tipo' - 'clave', now()) ON CONFLICT (tipo, clave) DO NOTHING;
      END IF;
      v_r := jsonb_set(v_r, '{avisos}', coalesce(v_r->'avisos', '[]'::jsonb) || v_av);
    END IF;
  END IF;

  -- Salud: la última corrida del canario (el correo de las 7:00 la pone en la primera línea).
  IF v_modo = 'salud' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'salud') = 'object' THEN
    SELECT to_jsonb(c) INTO v_c FROM conceptualizador.salud_canario c ORDER BY c.id DESC LIMIT 1;
    v_r := jsonb_set(v_r, '{salud,canario}', coalesce(v_c, 'null'::jsonb));
  END IF;
  RETURN v_r;
END
$mot22$;

-- ── Permisos: la app solo ejecuta las puertas ──────────────────────────────
ALTER FUNCTION conceptualizador.api_correo(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_correo_0022prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0022prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0022prev(jsonb), conceptualizador.api_motor_0022prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_correo_0022prev(jsonb), conceptualizador.api_motor_0022prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_correo(jsonb), conceptualizador.api_motor(jsonb) TO conceptualizador_app;
REVOKE ALL ON TABLE conceptualizador.salud_canario FROM PUBLIC;
