-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0016 · V1.53a (fts-conceptualizador#6, alcance definitivo V1.53a puntos 1 a 9)
--
-- 1. INTERRUPTORES nuevos, todos en '0' (con todos apagados = V1.52.1 de hoy): bajar_solo_nuevo, contestar_guardado,
--    acciones_sin_modelo, robot_al_100, motor_v153, supuesto_usd, decretos_destino, duplicados, vista_decretos,
--    salud_diaria. Los respeta el motor (procesa.js, avance.js, cotizacion-odoo.js, tabla-machote.js), salvo
--    `decretos_destino` (también la base: la línea al dueño en el chat) y `salud_diaria` (el workflow del correo).
-- 2. DECRETOS EN SU DESTINO (regla A3): el motor traduce cada decreto vigente de un caso a un ESPERADO medible y lo publica
--    (modo motor `destinos`): moneda, precio o margen por sección, comisión FTS, exclusión, pausa y cierre. Tabla
--    `decreto_destino` (una fila por caso y clave; lo que ya no viene se borra). El workflow diario los compara contra el
--    destino real: el caso y el machote guardado (aquí, modo `salud`) y la orden en Odoo (el workflow, con el nodo Odoo).
-- 3. CORREO DE SALUD (sección C): modo `salud` (solo lectura, dry_run) arma todo lo de la base para el correo de las 7:00;
--    modo `salud_registrar` guarda el día (`salud_dia`, uno por día: el correo sale una vez) y, con `decretos_destino`
--    prendido, escribe UNA línea al dueño por decreto que no llegó (`salud_linea` evita repetirla).
-- 4. Lo que el motor sabe y la base no (los `aviso-pendiente.md` del repo y su edad): modo `salud_motor`.
--
-- Lo que NO cambia: ningún interruptor existente, ningún valor de config, ningún modo existente (todos pasan tal cual a
-- api_motor_0016prev). Reversa: db/reversas/016_reversa.sql (borra la envoltura y le devuelve el nombre; no borra datos).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, &, acento grave o dígito;
-- etiquetas con nombre. Idempotente (el renombre va una sola vez).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · interruptores ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in16$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria']
$in16$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── 2 · tablas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conceptualizador.decreto_destino (
  caso_id        uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  clave          text        NOT NULL CHECK (char_length(clave) BETWEEN 1 AND 120),
  tipo           text        NOT NULL CHECK (tipo IN ('moneda','precio_seccion','margen_seccion','comision_fts','exclusion','pausa','cierre')),
  esperado       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  decreto        text        CHECK (decreto IS NULL OR char_length(decreto) <= 40),
  texto          text        CHECK (texto IS NULL OR char_length(texto) <= 300),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caso_id, clave)
);
CREATE TABLE IF NOT EXISTS conceptualizador.salud_dia (
  dia        date        PRIMARY KEY,
  resultado  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conceptualizador.salud_linea (
  caso_id    uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  clave      text        NOT NULL,
  huella     text        NOT NULL,
  dia        date        NOT NULL,
  mensaje_id bigint,
  creado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caso_id, clave, huella)
);
CREATE TABLE IF NOT EXISTS conceptualizador.salud_motor (
  id     int         PRIMARY KEY CHECK (id = 1),
  datos  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  at     timestamptz NOT NULL DEFAULT now()
);

-- ── 3 · lo de la base para el correo de salud (solo lectura) ───────────────
-- Día de uso en CST (zona_uso, igual que el tope). «Ayer» = el día de uso anterior al de hoy.
CREATE OR REPLACE FUNCTION conceptualizador.salud_datos() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $sd16$
DECLARE
  v_zona  text := coalesce((SELECT valor FROM conceptualizador.config WHERE clave = 'zona_uso'), 'America/Mexico_City');
  v_hoy   date := (now() AT TIME ZONE v_zona)::date;
  v_ayer  date := v_hoy - 1;
  v_lunes date := v_hoy - (extract(isodow FROM v_hoy)::int - 1);
  v_tope  numeric := coalesce(conceptualizador.cfg('consumo_tope_semana'), 60000000);
  v_techo numeric := coalesce(conceptualizador.cfg('experimento_techo_semana'), 5000000);
  v_r     jsonb;
BEGIN
  v_r := jsonb_build_object('hoy', v_hoy, 'ayer', v_ayer, 'lunes', v_lunes, 'zona', v_zona, 'leido_at', now(),
    'interruptores', conceptualizador.interruptores(),
    -- Motor: latidos, el texto de V1.52 y lo que atendió el respaldo ayer.
    'latidos', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.motor), '[]'::jsonb) FROM conceptualizador.latido l),
    'motor_v152', (SELECT conceptualizador.estado_motor_v152()),
    'respaldo_ayer', (SELECT count(*) FROM conceptualizador.trabajo t WHERE t.tomado_por = 'respaldo' AND t.estado = 'listo'
                       AND (t.listo_at AT TIME ZONE v_zona)::date = v_ayer),
    'principal_ayer', (SELECT count(*) FROM conceptualizador.trabajo t WHERE t.tomado_por = 'principal' AND t.estado = 'listo'
                       AND (t.listo_at AT TIME ZONE v_zona)::date = v_ayer),
    -- Trabajos colgados o fallidos de las últimas 24 h, con caso y causa.
    'fallidos', (SELECT coalesce(jsonb_agg(jsonb_build_object('trabajo', t.id, 'estado', t.estado, 'caso', c.titulo, 'carpeta', c.carpeta, 'dueno', c.autor,
                    'causa', left(coalesce(t.razon_ultima, t.error, t.error_ultimo, ''), 200), 'intentos', t.intentos, 'at', coalesce(t.listo_at, t.tomado_at, t.created_at)) ORDER BY t.id), '[]'::jsonb)
                   FROM conceptualizador.trabajo t JOIN conceptualizador.caso c ON c.id = t.caso_id
                  WHERE (t.estado IN ('error','detenido') AND t.created_at > now() - interval '24 hours')
                     OR (t.estado = 'tomado' AND t.tomado_at < now() - interval '15 minutes')),
    -- Consumo de ayer y de la semana, contra el tope; cobertura del registro; pasadas saltadas.
    'consumo', jsonb_build_object(
       'ayer', (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE dia = v_ayer),
       'ayer_mensajes', (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE dia = v_ayer AND NOT proactivo AND motivo <> 'sombra'),
       'ayer_robot', (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE dia = v_ayer AND proactivo),
       'semana', (SELECT coalesce(sum(ponderado), 0) FROM conceptualizador.consumo_registro WHERE dia >= v_lunes),
       'tope', v_tope,
       'listos_ayer', (SELECT count(*) FROM conceptualizador.trabajo t WHERE t.estado = 'listo' AND (t.listo_at AT TIME ZONE v_zona)::date = v_ayer),
       'con_consumo_ayer', (SELECT count(*) FROM conceptualizador.trabajo t JOIN conceptualizador.consumo k ON k.trabajo_id = t.id
                             WHERE t.estado = 'listo' AND (t.listo_at AT TIME ZONE v_zona)::date = v_ayer),
       'sin_medicion_ayer', (SELECT count(*) FROM conceptualizador.trabajo t JOIN conceptualizador.consumo k ON k.trabajo_id = t.id
                              WHERE t.estado = 'listo' AND (t.listo_at AT TIME ZONE v_zona)::date = v_ayer AND k.medicion = 'sin_medicion'),
       'sin_modelo_ayer', (SELECT count(*) FROM conceptualizador.respuesta r WHERE (r.created_at AT TIME ZONE v_zona)::date = v_ayer
                            AND (r.verifica ? 'guardado' OR r.verifica ? 'silencio' OR r.verifica ? 'aviso')),
       'pasadas_ayer', (SELECT count(*) FROM conceptualizador.consumo_avance WHERE dia = v_ayer),
       'saltadas_ayer', (SELECT count(*) FROM conceptualizador.consumo_avance WHERE dia = v_ayer AND resultado = 'saltada'),
       'experimento_semana', (SELECT coalesce(sum(costo_sombra), 0) FROM conceptualizador.experimento_par WHERE dia >= v_lunes),
       'experimento_techo', v_techo),
    -- Casos que avanzaron ayer, y atorados: abiertos, sin movimiento en más de 2 días hábiles, con preguntas pendientes.
    'avanzaron', (SELECT coalesce(jsonb_agg(DISTINCT c.titulo), '[]'::jsonb) FROM conceptualizador.caso c
                   WHERE NOT c.demo AND (EXISTS (SELECT 1 FROM conceptualizador.consumo_avance a WHERE a.caso_id = c.id AND a.dia = v_ayer AND a.resultado = 'avanzo')
                      OR EXISTS (SELECT 1 FROM conceptualizador.trabajo t WHERE t.caso_id = c.id AND t.estado = 'listo' AND (t.listo_at AT TIME ZONE v_zona)::date = v_ayer))),
    'atorados', (SELECT coalesce(jsonb_agg(jsonb_build_object('caso', x.titulo, 'carpeta', x.carpeta, 'dueno', x.autor, 'preguntas', x.np,
                    'quieto_desde', x.ult) ORDER BY x.ult), '[]'::jsonb) FROM (
                   SELECT c.titulo, c.carpeta, c.autor, c.ultima_actividad_at AS ult,
                          (SELECT count(*) FROM conceptualizador.accion a WHERE a.caso_id = c.id AND a.tipo = 'conjetura' AND a.estado = 'propuesta') AS np
                     FROM conceptualizador.caso c
                    WHERE NOT c.demo AND c.estado = 'abierto' AND c.carpeta IS NOT NULL
                      AND (SELECT count(*) FROM generate_series((coalesce(c.ultima_actividad_at, c.created_at) AT TIME ZONE v_zona)::date + 1, v_hoy, interval '1 day') g
                            WHERE extract(isodow FROM g) < 6) > 2) x WHERE x.np > 0),
    -- Decretos con su destino en la base: el caso y el último machote guardado. Odoo lo lee el workflow.
    'destinos', (SELECT coalesce(jsonb_agg(jsonb_build_object('caso_id', d.caso_id, 'caso', c.titulo, 'carpeta', c.carpeta, 'dueno', c.autor,
                    'clave', d.clave, 'tipo', d.tipo, 'esperado', d.esperado, 'decreto', d.decreto, 'texto', d.texto,
                    'caso_moneda', c.moneda, 'orden_id', c.orden_id, 'orden', c.orden_nombre, 'estado_caso', c.estado,
                    'machote', (SELECT jsonb_build_object('version', v.version, 'moneda', coalesce(v.documento->>'moneda', v.moneda), 'total', v.total,
                                  'comision_fts', v.documento->'comision_fts',
                                  'secciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', s->>'nombre', 'precio_decretado', s->'precio_decretado')), '[]'::jsonb)
                                                  FROM jsonb_array_elements(coalesce(v.documento->'secciones', '[]'::jsonb)) s),
                                  'creada_at', v.creada_at)
                                  FROM comercial.machote_version v WHERE v.machote_id = c.machote_id ORDER BY v.version DESC LIMIT 1),
                    'pausa', (SELECT jsonb_build_object('desde', ap.desde, 'pasadas_despues', (SELECT count(*) FROM conceptualizador.consumo_avance a WHERE a.caso_id = c.id AND a.created_at > ap.desde AND a.resultado <> 'saltada'))
                                FROM conceptualizador.agente_pausa ap WHERE ap.caso_id = c.id AND ap.hasta IS NULL ORDER BY ap.desde DESC LIMIT 1),
                    'pasadas_despues', CASE WHEN d.tipo IN ('cierre','pausa') AND d.esperado ? 'desde' THEN
                                (SELECT count(*) FROM conceptualizador.consumo_avance a WHERE a.caso_id = c.id AND a.resultado = 'avanzo'
                                    AND a.created_at > (d.esperado->>'desde')::timestamptz) ELSE NULL END)
                    ORDER BY c.titulo, d.clave), '[]'::jsonb)
                   FROM conceptualizador.decreto_destino d JOIN conceptualizador.caso c ON c.id = d.caso_id
                  WHERE c.estado IN ('abierto','enviada') AND NOT c.demo),
    'casos_con_destinos', (SELECT count(DISTINCT d.caso_id) FROM conceptualizador.decreto_destino d),
    'motor_repo', (SELECT jsonb_build_object('datos', m.datos, 'at', m.at) FROM conceptualizador.salud_motor m WHERE m.id = 1),
    'ya_registrado', EXISTS (SELECT 1 FROM conceptualizador.salud_dia s WHERE s.dia = v_hoy));
  RETURN v_r;
END
$sd16$;

-- ── 4 · API del motor (envoltura) ──────────────────────────────────────────
DO $ren16$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0016prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0016prev;
  END IF;
END
$ren16$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot16$
DECLARE
  v_modo  text := p->>'modo';
  v_motor text := p->>'motor';
  v_caso  uuid;
  v_n     int := 0;
  v_e     jsonb;
  v_claves text[] := '{}';
  v_zona  text := coalesce((SELECT valor FROM conceptualizador.config WHERE clave = 'zona_uso'), 'America/Mexico_City');
  v_hoy   date := (now() AT TIME ZONE v_zona)::date;
  v_mid   bigint;
  v_ins   int := 0;
  v_nuevo boolean;
BEGIN
  IF v_modo IS NULL OR v_modo NOT IN ('destinos','salud_motor','salud','salud_registrar') THEN
    RETURN conceptualizador.api_motor_0016prev(p);
  END IF;
  IF v_motor IS NULL OR v_motor NOT IN ('principal','respaldo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO');
  END IF;

  -- Los esperados de un caso: reemplazan a los anteriores (lo que ya no viene se borra).
  IF v_modo = 'destinos' THEN
    BEGIN v_caso := (p->>'caso_id')::uuid; EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_INVALIDO'); END;
    IF NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF jsonb_typeof(p->'esperados') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'esperados') > 60 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ESPERADOS_INVALIDOS');
    END IF;
    FOR v_e IN SELECT * FROM jsonb_array_elements(p->'esperados') LOOP
      CONTINUE WHEN coalesce(v_e->>'clave', '') = '' OR coalesce(v_e->>'tipo', '') NOT IN ('moneda','precio_seccion','margen_seccion','comision_fts','exclusion','pausa','cierre');
      v_claves := v_claves || left(v_e->>'clave', 120);
      INSERT INTO conceptualizador.decreto_destino (caso_id, clave, tipo, esperado, decreto, texto, actualizado_at)
      VALUES (v_caso, left(v_e->>'clave', 120), v_e->>'tipo', coalesce(v_e->'esperado', '{}'::jsonb), left(v_e->>'decreto', 40), left(v_e->>'texto', 300), now())
      ON CONFLICT (caso_id, clave) DO UPDATE SET tipo = EXCLUDED.tipo, esperado = EXCLUDED.esperado, decreto = EXCLUDED.decreto,
             texto = EXCLUDED.texto, actualizado_at = now();
      v_n := v_n + 1;
    END LOOP;
    DELETE FROM conceptualizador.decreto_destino WHERE caso_id = v_caso AND NOT (clave = ANY (v_claves));
    RETURN jsonb_build_object('ok', true, 'guardados', v_n);
  END IF;

  -- Lo que solo sabe el motor (repo): avisos pendientes y su edad. Una sola fila, la última.
  IF v_modo = 'salud_motor' THEN
    IF jsonb_typeof(p->'datos') IS DISTINCT FROM 'object' OR length((p->'datos')::text) > 20000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DATOS_INVALIDOS');
    END IF;
    INSERT INTO conceptualizador.salud_motor (id, datos, at) VALUES (1, p->'datos', now())
    ON CONFLICT (id) DO UPDATE SET datos = EXCLUDED.datos, at = now();
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_modo = 'salud' THEN
    RETURN jsonb_build_object('ok', true, 'salud', conceptualizador.salud_datos());
  END IF;

  -- El día queda registrado (el correo sale una vez) y, con `decretos_destino`, una línea por decreto que no llegó.
  IF v_modo = 'salud_registrar' THEN
    IF coalesce((p->>'dry_run')::boolean, true) THEN
      RETURN jsonb_build_object('ok', true, 'dry_run', true, 'ya_registrado', EXISTS (SELECT 1 FROM conceptualizador.salud_dia WHERE dia = v_hoy));
    END IF;
    INSERT INTO conceptualizador.salud_dia (dia, resultado) VALUES (v_hoy, coalesce(p->'resultado', '{}'::jsonb))
    ON CONFLICT (dia) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_nuevo := v_n > 0;
    IF v_nuevo AND conceptualizador.prendido('decretos_destino') AND jsonb_typeof(p->'lineas') = 'array' THEN
      FOR v_e IN SELECT * FROM jsonb_array_elements(p->'lineas') LOOP
        BEGIN v_caso := (v_e->>'caso_id')::uuid; EXCEPTION WHEN others THEN CONTINUE; END;
        CONTINUE WHEN coalesce(v_e->>'texto', '') = '' OR NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso AND estado IN ('abierto','enviada'));
        INSERT INTO conceptualizador.salud_linea (caso_id, clave, huella, dia)
        VALUES (v_caso, left(coalesce(v_e->>'clave', ''), 120), left(coalesce(v_e->>'huella', md5(v_e->>'texto')), 64), v_hoy)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        CONTINUE WHEN v_n = 0;
        INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto)
        VALUES (v_caso, 'motor', 'sistema', left(v_e->>'texto', 600)) RETURNING id INTO v_mid;
        UPDATE conceptualizador.salud_linea SET mensaje_id = v_mid
         WHERE caso_id = v_caso AND clave = left(coalesce(v_e->>'clave', ''), 120) AND huella = left(coalesce(v_e->>'huella', md5(v_e->>'texto')), 64);
        v_ins := v_ins + 1;
      END LOOP;
    END IF;
    RETURN jsonb_build_object('ok', true, 'registrado', v_nuevo, 'lineas', v_ins, 'dia', v_hoy);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'MODO_DESCONOCIDO');
END
$mot16$;

-- ── Permisos: la app solo ejecuta la puerta ────────────────────────────────
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0016prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0016prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.salud_datos() FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0016prev(jsonb) FROM conceptualizador_app;
REVOKE ALL ON FUNCTION conceptualizador.salud_datos() FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
