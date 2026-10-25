-- ═══════════════════════════════════════════════════════════════════════════
-- memoria_0005_api.sql · Puertas para los workflows memoria/* (F7, F8, F10–F16)
--
-- Cada función es SECURITY DEFINER y su DUEÑO es el rol mínimo que la
-- necesita (memoria_admin o memoria_motor), no el superusuario. Así, aunque el
-- workflow de n8n se conecte con la credencial fts_admin (no hay credenciales
-- por rol todavía, N12), lo que la función puede tocar es exactamente lo que
-- ese rol puede tocar. Sin dólar-dólar; sin dólar-dígito (el nodo Postgres de
-- n8n lo lee como parámetro).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Bandeja de grupos (memoria_admin) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION memoria.api_canales(p_incluir_prueba boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = memoria, pg_temp AS $a1$
  SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY (b.pendiente = 'ok'), b.primera_vez DESC), '[]'::jsonb)
    FROM memoria.v_canales_bandeja b
   WHERE p_incluir_prueba OR NOT b.es_prueba;
$a1$;

CREATE OR REPLACE FUNCTION memoria.api_canal_decidir(p_canal uuid, p_tipo text, p_estado text, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp AS $a2$
DECLARE c memoria.canal; v uuid;
BEGIN
  IF p_tipo IS NOT NULL AND p_tipo NOT IN ('proyecto','levantamiento','compras','materiales','general','excluido') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO'; END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('pendiente','capturando','pausado','excluido') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO'; END IF;
  c := memoria.canal_decidir(p_canal, p_tipo, p_estado, p_actor);
  IF coalesce(c.tipo_confirmado, c.tipo_detectado) IN ('proyecto','levantamiento') THEN
    v := memoria.vincular_canal_por_nombre(c.id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'canal', to_jsonb(c), 'vinculo_so', v);
END
$a2$;

-- ── Bandeja de propuestas (memoria_admin) ─────────────────────────────────
CREATE OR REPLACE FUNCTION memoria.api_propuestas(p_incluir_prueba boolean DEFAULT false, p_limite int DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = memoria, pg_temp AS $a3$
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.creado_en DESC), '[]'::jsonb)
    FROM (SELECT * FROM memoria.v_bandeja WHERE p_incluir_prueba OR NOT es_prueba ORDER BY creado_en DESC LIMIT p_limite) p;
$a3$;

-- payload_b64: el JSON aprobado/corregido en base64 (así no pasa por el
-- separador de comas de los parámetros del nodo Postgres).
CREATE OR REPLACE FUNCTION memoria.api_decidir(p_propuesta uuid, p_resultado text, p_payload_b64 text, p_motivo text, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp AS $a4$
DECLARE pay jsonb; d memoria.decision;
BEGIN
  IF coalesce(btrim(p_actor), '') = '' THEN RAISE EXCEPTION 'ACTOR_OBLIGATORIO'; END IF;
  IF nullif(p_payload_b64, '') IS NOT NULL THEN
    pay := convert_from(decode(p_payload_b64, 'base64'), 'UTF8')::jsonb;
  ELSIF p_resultado = 'aprobada' THEN
    SELECT payload INTO pay FROM memoria.propuesta WHERE id = p_propuesta;
  END IF;
  INSERT INTO memoria.decision (propuesta_id, resultado, payload_final, motivo, decidido_por)
  VALUES (p_propuesta, p_resultado, pay, nullif(p_motivo, ''), p_actor) RETURNING * INTO d;
  RETURN jsonb_build_object('ok', true, 'decision', to_jsonb(d));
END
$a4$;

-- ── Motores (memoria_motor) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION memoria.correr_motor(p_clave text, p_dia date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = memoria, pg_temp AS $a5$
DECLARE m memoria.motor;
BEGIN
  SELECT * INTO m FROM memoria.motor WHERE clave = p_clave;
  IF NOT FOUND THEN RAISE EXCEPTION 'MOTOR_DESCONOCIDO'; END IF;
  IF m.modo <> 'simulado' THEN RAISE EXCEPTION 'MOTOR_EN_MODO_REAL_NO_HABILITADO (D10)'; END IF;
  RETURN CASE p_clave
    WHEN 'derivados'  THEN memoria.motor_derivados_simulado()
    WHEN 'resumen_so' THEN memoria.motor_resumen_so(coalesce(p_dia, (now() AT TIME ZONE 'America/Monterrey')::date - 1))
    WHEN 'tickets'    THEN memoria.motor_tickets_simulado()
    WHEN 'requis'     THEN memoria.motor_requis_simulado()
    WHEN 'alertas'    THEN memoria.motor_alertas_simulado()
  END;
END
$a5$;

-- ── Retención (simulacro) y señales (memoria_admin) ───────────────────────
CREATE OR REPLACE FUNCTION memoria.api_retencion_simulacro(p_meses_adelante int DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = memoria, pg_temp AS $a6$
  SELECT jsonb_build_object(
    'ahora_simulado', now() + make_interval(months => p_meses_adelante),
    'archivos', (SELECT coalesce(jsonb_object_agg(accion, n), '{}'::jsonb) FROM
                  (SELECT accion, count(*) AS n FROM memoria.retencion_simular(now() + make_interval(months => p_meses_adelante)) GROUP BY accion) a),
    'ruido', (SELECT coalesce(jsonb_object_agg(accion, renglones), '{}'::jsonb) FROM memoria.ruido_simular(now() + make_interval(months => p_meses_adelante))),
    'nota', 'SIMULACRO: no se movió ni se borró nada.');
$a6$;

CREATE OR REPLACE FUNCTION memoria.api_senales()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = memoria, pg_temp AS $a7$
  SELECT jsonb_build_object(
    'alertas', (SELECT count(*) FROM memoria.v_senales_watchdog WHERE estado = 'alerta'),
    'senales', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM memoria.v_senales_watchdog s));
$a7$;

-- ── Dueños = rol mínimo ───────────────────────────────────────────────────
ALTER FUNCTION memoria.api_canales(boolean)                          OWNER TO memoria_admin;
ALTER FUNCTION memoria.api_canal_decidir(uuid, text, text, text)     OWNER TO memoria_admin;
ALTER FUNCTION memoria.api_propuestas(boolean, int)                  OWNER TO memoria_admin;
ALTER FUNCTION memoria.api_decidir(uuid, text, text, text, text)     OWNER TO memoria_admin;
ALTER FUNCTION memoria.api_retencion_simulacro(int)                  OWNER TO memoria_admin;
ALTER FUNCTION memoria.api_senales()                                 OWNER TO memoria_admin;
ALTER FUNCTION memoria.correr_motor(text, date)                      OWNER TO memoria_motor;

REVOKE ALL ON FUNCTION memoria.api_canales(boolean), memoria.api_canal_decidir(uuid, text, text, text),
  memoria.api_propuestas(boolean, int), memoria.api_decidir(uuid, text, text, text, text),
  memoria.api_retencion_simulacro(int), memoria.api_senales(), memoria.correr_motor(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memoria.api_canales(boolean), memoria.api_canal_decidir(uuid, text, text, text),
  memoria.api_propuestas(boolean, int), memoria.api_decidir(uuid, text, text, text, text),
  memoria.api_retencion_simulacro(int), memoria.api_senales() TO memoria_admin;
GRANT EXECUTE ON FUNCTION memoria.correr_motor(text, date) TO memoria_motor, memoria_admin;
GRANT EXECUTE ON FUNCTION memoria.api_senales() TO memoria_lector;

-- memoria_admin necesita leer propuesta para api_decidir y ejecutar las funciones de canal.
GRANT SELECT ON memoria.propuesta TO memoria_admin;
