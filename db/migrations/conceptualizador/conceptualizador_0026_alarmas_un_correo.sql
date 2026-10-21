-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0026 · V1.57a (fts-conceptualizador#12, 21-oct): las alarmas del motor sin falsos positivos ni correos
-- de más. Tres fallas que Esteban vio en los correos del 20-oct:
--
-- 1. «Hay más de un motor principal (desde 07:19 CST)» era FALSO: la otra «sesión» era `comprobacion`, el latido de
--    prueba del paso 1 de motor/MOTOR.md (y de las pruebas). Ahora un latido con sesion `comprobacion` (o `comprobacion-…`)
--    y sin sesion_claude contesta ok (la llave y el entorno sí se comprueban) y NO escribe nada: ni el renglón `latido`
--    del principal ni `latido_sesion`. Se borran sus filas viejas y el incidente que abrieron se cierra con su «Resuelto».
-- 2. Correos en par y «cada 4 h» sin respetar: el recordatorio se contaba desde el `desde` de la alarma, así que una alarma
--    vieja (desde 07:19) que se encolaba a las 18:00 salía con su recordatorio en el mismo minuto, y una alarma con clave
--    nueva volvía a empezar la cuenta. Ahora hay INCIDENTES (`alarma_incidente`): uno por alarma abierta, un solo correo al
--    abrirlo, el recordatorio cuando pasaron `alarma_recordatorio_h` horas DESDE ESE CORREO y sigue abierto, y uno solo
--    por tramo.
-- 3. «Principal sin tomar» abrió 4 incidentes para la misma caída (00:10, 00:27, 00:42 y 10:25 CST): su clave era la hora
--    del trabajo más viejo en cola, que cambia cada vez que llega o sale uno. Ahora principal_sin_tomar, sin_principal y
--    dos_principales son UN incidente por tipo mientras sigan abiertos; un incidente se cierra cuando la alarma lleva
--    `alarma_cierre_min` (10) sin aparecer y entonces sale UN correo «Resuelto» con cuánto duró.
-- Lo que NO cambia: qué alarmas existen ni sus textos, el interruptor alarmas_v157 (apagado no encola nada), motor_caido
-- (primer aviso de sin_principal, como en la 0024). Reversa: db/reversas/026_reversa.sql (encolar_alarmas, api_motor y
-- latido_sesion_anotar a la 0025/0024/0023; deja la tabla). Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin
-- dólar antes de comilla, ampersand, acento grave o dígito; etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO conceptualizador.config (clave, valor) VALUES
  ('alarma_cierre_min', '10')                    -- un incidente se da por resuelto tras esto sin que la alarma aparezca
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS conceptualizador.alarma_incidente (
  id             bigserial   PRIMARY KEY,
  llave          text        NOT NULL,
  tipo           text        NOT NULL,
  ident          text        NOT NULL,             -- el tipo (una caída a la vez) o la clave de la alarma
  primera_clave  text,
  abierto_at     timestamptz NOT NULL DEFAULT now(),
  avisado_at     timestamptz,                      -- cuándo salió (o ya había salido) su correo de apertura
  visto_at       timestamptz NOT NULL DEFAULT now(),
  cerrado_at     timestamptz,
  recordatorios  int         NOT NULL DEFAULT 0,
  ultima         jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS alarma_incidente_abierto ON conceptualizador.alarma_incidente (llave, ident) WHERE cerrado_at IS NULL;
REVOKE ALL ON TABLE conceptualizador.alarma_incidente FROM PUBLIC;

-- ── 1 · el latido de prueba no es un motor ─────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.es_comprobacion(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $ec26$
  SELECT coalesce(p->>'sesion', '') ~ '^comprobacion(-[A-Za-z0-9_-]{1,40})?\Z' AND conceptualizador.sesion_valida(p->>'sesion_claude') IS NULL
$ec26$;

/** Una fila por sesión que late (0023), salvo el latido de prueba. */
CREATE OR REPLACE FUNCTION conceptualizador.latido_sesion_anotar(p jsonb, p_dueno boolean) RETURNS void
LANGUAGE plpgsql AS $ls26$
DECLARE
  v_sc text := conceptualizador.sesion_valida(p->>'sesion_claude');
  v_s  text := coalesce(v_sc, left(coalesce(p->>'sesion', ''), 120));
  v_sa jsonb := CASE WHEN jsonb_typeof(p->'salud') = 'object' AND length((p->'salud')::text) <= 4000 THEN p->'salud' ELSE '{}'::jsonb END;
BEGIN
  IF v_s = '' OR coalesce(p->>'motor', '') NOT IN ('principal','respaldo') OR conceptualizador.es_comprobacion(p) THEN RETURN; END IF;
  INSERT INTO conceptualizador.latido_sesion AS x (llave, motor, sesion, sesion_claude, sesion_vigia, estado, profundidad, version, dueno, salud)
  VALUES (conceptualizador.llave_motor(p), p->>'motor', v_s, v_sc, left(p->>'sesion', 120), left(coalesce(p->>'estado', 'activo'), 20),
          CASE WHEN coalesce(p->>'profundidad', '') ~ '^[0-9]{1,3}\Z' THEN (p->>'profundidad')::int END, left(p->>'version', 40), p_dueno, v_sa)
  ON CONFLICT (llave, motor, sesion) DO UPDATE SET
    estado = EXCLUDED.estado, profundidad = coalesce(EXCLUDED.profundidad, x.profundidad), version = coalesce(EXCLUDED.version, x.version),
    sesion_vigia = coalesce(EXCLUDED.sesion_vigia, x.sesion_vigia), dueno = EXCLUDED.dueno, salud = EXCLUDED.salud,
    latidos = x.latidos + 1, visto_at = now();
END
$ls26$;

-- ── 2 y 3 · incidentes: un correo al abrir, recordatorio desde ese correo, «Resuelto» al cerrar ──
/** Encola las alarmas como incidentes. Solo con alarmas_v157 (apagado devuelve las alarmas y no toca nada). */
CREATE OR REPLACE FUNCTION conceptualizador.encolar_alarmas(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql AS $ea26$
DECLARE
  v_al   jsonb := conceptualizador.alarmas_motor(p_llave);
  v_e    jsonb;
  v_i    conceptualizador.alarma_incidente;
  v_id   text;
  v_h    int := coalesce(conceptualizador.cfg('alarma_recordatorio_h'), 4);
  v_c    int := coalesce(conceptualizador.cfg('alarma_cierre_min'), 10);
  v_k    int;
  v_prev timestamptz;
BEGIN
  IF NOT conceptualizador.prendido('alarmas_v157') THEN RETURN v_al; END IF;
  FOR v_e IN SELECT * FROM jsonb_array_elements(v_al) LOOP
    v_id := CASE WHEN v_e->>'alarma' IN ('principal_sin_tomar','sin_principal','dos_principales') THEN v_e->>'alarma' ELSE v_e->>'clave' END;
    SELECT * INTO v_i FROM conceptualizador.alarma_incidente WHERE llave = p_llave AND ident = v_id AND cerrado_at IS NULL;
    IF v_i.id IS NULL THEN
      -- Si esta misma alarma ya se avisó antes de la 0026, el incidente nace avisado (no se repite el correo).
      SELECT min(created_at) INTO v_prev FROM conceptualizador.consumo_aviso
       WHERE tipo = 'motor_alarma' AND (clave = v_e->>'clave' OR clave LIKE (v_e->>'clave') || ':r%');
      INSERT INTO conceptualizador.alarma_incidente (llave, tipo, ident, primera_clave, abierto_at, avisado_at, ultima)
      VALUES (p_llave, v_e->>'alarma', v_id, v_e->>'clave', coalesce(v_prev, now()), v_prev, v_e)
      RETURNING * INTO v_i;
      -- El primer aviso de sin_principal lo manda motor_caido (0014): aquí solo su recordatorio y su «Resuelto».
      IF v_prev IS NULL THEN
        IF v_e->>'alarma' <> 'sin_principal' THEN
          INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
          VALUES ('motor_alarma', 'inc' || v_i.id, v_e - 'clave' || jsonb_build_object('llave', p_llave, 'cada_h', v_h, 'incidente', v_i.id), NULL)
          ON CONFLICT (tipo, clave) DO NOTHING;
        END IF;
        UPDATE conceptualizador.alarma_incidente SET avisado_at = now() WHERE id = v_i.id;
        v_i.avisado_at := now();
      END IF;
    ELSE
      UPDATE conceptualizador.alarma_incidente SET visto_at = now(), ultima = v_e WHERE id = v_i.id;
    END IF;
    -- Recordatorio: uno por tramo de v_h horas DESDE EL PRIMER CORREO, mientras siga abierto (0 = ninguno).
    v_k := CASE WHEN v_h > 0 AND v_i.avisado_at IS NOT NULL THEN floor(extract(epoch FROM now() - v_i.avisado_at) / (v_h * 3600))::int ELSE 0 END;
    IF v_k >= 1 AND v_k > v_i.recordatorios THEN
      INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
      VALUES ('motor_alarma', 'inc' || v_i.id || ':r' || v_k,
              (v_e - 'clave') || jsonb_build_object('llave', p_llave, 'recordatorio', v_k, 'cada_h', v_h, 'incidente', v_i.id,
                'texto', 'Sigue abierta desde hace ' || (v_k * v_h) || ' h o más. ' || (v_e->>'texto')), NULL)
      ON CONFLICT (tipo, clave) DO NOTHING;
      UPDATE conceptualizador.alarma_incidente SET recordatorios = v_k WHERE id = v_i.id;
    END IF;
  END LOOP;
  -- Cierre: la alarma lleva v_c min sin aparecer. Un «Resuelto» por incidente (solo si alguna vez se avisó).
  FOR v_i IN SELECT * FROM conceptualizador.alarma_incidente
              WHERE llave = p_llave AND cerrado_at IS NULL AND visto_at < now() - make_interval(mins => v_c) LOOP
    UPDATE conceptualizador.alarma_incidente SET cerrado_at = now() WHERE id = v_i.id;
    IF v_i.avisado_at IS NOT NULL THEN
      INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
      VALUES ('motor_alarma', 'inc' || v_i.id || ':resuelto',
              (v_i.ultima - 'clave') || jsonb_build_object('llave', p_llave, 'resuelto', true, 'incidente', v_i.id,
                'abierto_utc', to_char(v_i.abierto_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
                'abierto_cst', to_char(v_i.abierto_at AT TIME ZONE conceptualizador.zona_robot(), 'YYYY-MM-DD HH24:MI') || ' CST',
                'cerrado_utc', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
                'cerrado_cst', to_char(now() AT TIME ZONE conceptualizador.zona_robot(), 'YYYY-MM-DD HH24:MI') || ' CST',
                'ultimo_visto_cst', to_char(v_i.visto_at AT TIME ZONE conceptualizador.zona_robot(), 'YYYY-MM-DD HH24:MI') || ' CST'), NULL)
      ON CONFLICT (tipo, clave) DO NOTHING;
    END IF;
  END LOOP;
  RETURN v_al;
END
$ea26$;

-- ── api_motor (envoltura de la 0025): el latido de prueba contesta sin escribir ──
DO $ren26m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0026prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0026prev;
  END IF;
END
$ren26m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot26$
BEGIN
  IF p->>'modo' = 'latido' AND conceptualizador.es_comprobacion(p) THEN
    RETURN jsonb_build_object('ok', true, 'comprobacion', true, 'motor', conceptualizador.estado_motor());
  END IF;
  RETURN conceptualizador.api_motor_0026prev(p);
END
$mot26$;

ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0026prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0026prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0026prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.encolar_alarmas(text), conceptualizador.latido_sesion_anotar(jsonb, boolean),
                       conceptualizador.es_comprobacion(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;

-- ── datos: fuera los latidos de prueba y se cierra el falso «dos principales» del 20-oct ──
DELETE FROM conceptualizador.latido_sesion WHERE sesion ~ '^comprobacion(-[A-Za-z0-9_-]{1,40})?\Z' AND sesion_claude IS NULL;
INSERT INTO conceptualizador.alarma_incidente (llave, tipo, ident, primera_clave, abierto_at, avisado_at, visto_at, cerrado_at, ultima)
SELECT 'conceptualizador', 'dos_principales', 'dos_principales', min(a.clave), min(a.created_at), min(a.created_at), max(a.created_at), now(),
       (array_agg(a.detalle ORDER BY a.id DESC))[1]
  FROM conceptualizador.consumo_aviso a
 WHERE a.tipo = 'motor_alarma' AND a.clave LIKE 'dos_principales:%' AND a.created_at > now() - interval '3 days'
   AND NOT EXISTS (SELECT 1 FROM conceptualizador.alarma_incidente i WHERE i.tipo = 'dos_principales' AND i.primera_clave LIKE 'dos_principales:%')
HAVING count(*) > 0;
INSERT INTO conceptualizador.consumo_aviso (tipo, clave, detalle, avisado_at)
SELECT 'motor_alarma', 'inc' || i.id || ':resuelto',
       (i.ultima - 'clave') || jsonb_build_object('llave', 'conceptualizador', 'resuelto', true, 'incidente', i.id, 'falso_positivo', true,
         'texto', 'Era un falso positivo: la otra «sesión» era comprobacion, el latido de prueba del arranque. Desde la 0026 ese latido ya no cuenta como motor.',
         'abierto_utc', to_char(i.abierto_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
         'abierto_cst', to_char(i.abierto_at AT TIME ZONE conceptualizador.zona_robot(), 'YYYY-MM-DD HH24:MI') || ' CST',
         'cerrado_utc', to_char(i.cerrado_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
         'cerrado_cst', to_char(i.cerrado_at AT TIME ZONE conceptualizador.zona_robot(), 'YYYY-MM-DD HH24:MI') || ' CST'), NULL
  FROM conceptualizador.alarma_incidente i
 WHERE i.tipo = 'dos_principales' AND i.cerrado_at IS NOT NULL AND i.primera_clave LIKE 'dos_principales:%'
ON CONFLICT (tipo, clave) DO NOTHING;
