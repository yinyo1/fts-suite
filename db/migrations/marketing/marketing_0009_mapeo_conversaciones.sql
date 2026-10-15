-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0009_mapeo_conversaciones.sql · Lo existente a «una conversación por empresa» (Marketing v3, #421)
--
-- Se aplica SOLO después del merge del PR de pantallas (decisión de Esteban), con read-back de conteos.
-- No borra ni duplica nada:
--   · Tarjetas: se agrupan por empresa (marketing.conv_clave) y planta (ciudad). La sesión de la tarjeta
--     más vieja de cada empresa SE VUELVE el hilo de la conversación (tipo 'conversacion'); las otras
--     sesiones quedan como historia ligada (marketing.conv_sesion). Todos los leads quedan en `leads`.
--     Dueño = el responsable actual. Etapa 2 si la tarjeta ya tiene toques; si no, etapa 1.
--     Origen: lo traído de Odoo entra como «Manual» (supuesto aceptado en #421).
--   · Señales: se pegan a la conversación de su empresa y planta, o abren una conversación nueva (Radar),
--     con su evidencia (liga y fecha). Una señal de otra ciudad es otra planta.
--   · Fichas y sesiones del Prospectador: se ligan a la conversación de su empresa; si no hay, abren una.
--   · Nivel inicial con la evidencia: N2 si hay señal con liga y fecha de los últimos `senal_vigente_dias`;
--     N3 si no. N1 ninguno (nada de lo existente es una invitación ni una solicitud).
--   · Ninguna conversación mapeada cuenta para el tope de sesiones (cuenta_tope = false, chat_0003).
-- La ficha y la sesión de la MEDICIÓN de consumo del #413 (actor de prueba, sesión 7595193e) se marcan
-- demo: son de prueba y no deben abrir una conversación.
-- Correrla dos veces no hace nada la segunda (solo mapea lo que no tiene conversacion_id).
-- Reversa: otra migración que regrese esas sesiones a su tipo anterior (guardado en datos.tipo_antes).
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE chat.sesion SET demo = true WHERE id = '7595193e-a2ef-4929-b6d7-2c5c5c3456d6' AND NOT demo;
UPDATE marketing.ficha SET demo = true WHERE sesion_id = '7595193e-a2ef-4929-b6d7-2c5c5c3456d6' AND NOT demo;

CREATE OR REPLACE FUNCTION marketing.conv_mapear() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $map$
DECLARE t record; b marketing.bandeja_senal; f record; c marketing.conversacion; v_dueno text; n_t int := 0; n_b int := 0; n_f int := 0; n_nuevas int := 0;
  v_tipo text; mayor text;
BEGIN
  -- 1 · Tarjetas, de la más vieja a la más nueva.
  FOR t IN SELECT st.*, EXISTS (SELECT 1 FROM marketing.seg_toque q WHERE q.tarjeta_id = st.id) AS con_toques,
                  (SELECT fi.origen FROM marketing.ficha fi WHERE fi.id = st.ficha_id) AS ficha_origen
             FROM marketing.seg_tarjeta st WHERE st.conversacion_id IS NULL AND NOT st.demo
            ORDER BY st.created_at, st.odoo_lead_id NULLS LAST LOOP
    c := marketing.conv_buscar(t.empresa, t.ciudad, t.odoo_lead_id, false);
    IF c.id IS NULL THEN
      -- Su sesión se vuelve el hilo de la conversación: la historia se queda donde estaba.
      SELECT tipo INTO v_tipo FROM chat.sesion WHERE id = t.sesion_id;
      UPDATE chat.sesion SET tipo = 'conversacion', cuenta_tope = false,
        datos = datos || jsonb_build_object('tipo_antes', v_tipo, 'empresa', t.empresa, 'ciudad', coalesce(t.ciudad,''))
       WHERE id = t.sesion_id;
      INSERT INTO marketing.conversacion (sesion_id, empresa, clave, grupo, ciudad, ciudad_clave, dueno, etapa, origen, resumen, siguiente, sugerencia,
                                          ultimo_toque_at, ultima_actividad_at, toques, created_at)
      VALUES (t.sesion_id, t.empresa, marketing.conv_clave(t.empresa), split_part(marketing.conv_clave(t.empresa), ' ', 1), coalesce(t.ciudad,''),
              marketing.ciudad_clave(t.ciudad), t.responsable, CASE WHEN t.con_toques THEN 2 ELSE 1 END,
              CASE t.ficha_origen WHEN 'radar' THEN 'radar' WHEN 'lead' THEN 'nuevo_lead' ELSE 'manual' END,
              nullif(t.resumen,''), t.siguiente, nullif(t.sugerencia,''), t.ultimo_toque_at, coalesce(t.ultimo_toque_at, t.created_at), t.toques, t.created_at)
      RETURNING * INTO c;
      UPDATE chat.sesion SET datos = datos || jsonb_build_object('conversacion_id', c.id) WHERE id = t.sesion_id;
      INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'mapeada', 'mapeo_v3',
        jsonb_build_object('desde', 'tarjeta', 'tarjeta_id', t.id, 'etapa', c.etapa));
      n_nuevas := n_nuevas + 1;
    ELSE
      INSERT INTO marketing.conv_sesion (sesion_id, conversacion_id, rol) VALUES (t.sesion_id, c.id, 'tarjeta') ON CONFLICT (sesion_id) DO NOTHING;
      IF c.ciudad_clave = '' AND marketing.ciudad_clave(t.ciudad) <> ''
         AND NOT EXISTS (SELECT 1 FROM marketing.conversacion x WHERE x.clave = c.clave AND x.ciudad_clave = marketing.ciudad_clave(t.ciudad)) THEN
        UPDATE marketing.conversacion SET ciudad = t.ciudad, ciudad_clave = marketing.ciudad_clave(t.ciudad) WHERE id = c.id;
      END IF;
      IF t.con_toques THEN UPDATE marketing.conversacion SET etapa = 2 WHERE id = c.id; END IF;
      UPDATE marketing.conversacion SET siguiente = coalesce(siguiente, t.siguiente), resumen = coalesce(resumen, nullif(t.resumen,'')),
        ultimo_toque_at = greatest(ultimo_toque_at, t.ultimo_toque_at), toques = toques + t.toques WHERE id = c.id;
    END IF;
    IF t.odoo_lead_id IS NOT NULL THEN
      UPDATE marketing.conversacion SET leads = CASE WHEN t.odoo_lead_id = ANY (leads) THEN leads ELSE leads || t.odoo_lead_id END WHERE id = c.id;
    END IF;
    UPDATE marketing.seg_tarjeta SET conversacion_id = c.id WHERE id = t.id;
    n_t := n_t + 1;
  END LOOP;

  -- 2 · Señales: a la conversación de su empresa y planta, o una nueva (Radar).
  SELECT dueno INTO mayor FROM marketing.conversacion WHERE etapa = 1 AND NOT demo GROUP BY dueno ORDER BY count(*) DESC, dueno LIMIT 1;
  FOR b IN SELECT * FROM marketing.bandeja_senal WHERE conversacion_id IS NULL AND NOT demo ORDER BY created_at, id LOOP
    c := marketing.conv_buscar(b.empresa, b.ciudad, NULL, false);
    IF c.id IS NULL THEN
      v_dueno := coalesce(b.responsable, marketing.cfg_texto('dueno_senales'), mayor, b.registrada_por);
      c := marketing.conv_crear(b.empresa, b.ciudad, v_dueno, NULL, CASE WHEN b.origen = 'investigacion' THEN 'investigacion' ELSE 'radar' END,
                                1::smallint, false, false, 'mapeo_v3');
      UPDATE marketing.conv_evento SET tipo = 'mapeada', datos = datos || jsonb_build_object('desde', 'senal') WHERE conversacion_id = c.id AND tipo = 'creada';
      n_nuevas := n_nuevas + 1;
    ELSIF c.ciudad_clave = '' AND marketing.ciudad_clave(b.ciudad) <> ''
          AND NOT EXISTS (SELECT 1 FROM marketing.conversacion x WHERE x.clave = c.clave AND x.ciudad_clave = marketing.ciudad_clave(b.ciudad)) THEN
      UPDATE marketing.conversacion SET ciudad = b.ciudad, ciudad_clave = marketing.ciudad_clave(b.ciudad) WHERE id = c.id;
    END IF;
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos, created_at) VALUES (c.sesion_id, 'sistema', 'sistema',
      'Señal del radar: ' || b.titulo || coalesce(' · ' || nullif(b.evidencia->>'fecha',''), ''), jsonb_build_object('conv', 'senal', 'senal_id', b.id), b.created_at);
    UPDATE marketing.conversacion SET evidencia = evidencia || jsonb_build_array(marketing.senal_evidencia(b)) WHERE id = c.id;
    UPDATE marketing.bandeja_senal SET conversacion_id = c.id WHERE id = b.id;
    IF b.sesion_id IS NOT NULL THEN
      INSERT INTO marketing.conv_sesion (sesion_id, conversacion_id, rol) VALUES (b.sesion_id, c.id, 'prospectador') ON CONFLICT (sesion_id) DO NOTHING;
    END IF;
    n_b := n_b + 1;
  END LOOP;

  -- 3 · Fichas (y la sesión del Prospectador que las creó).
  FOR f IN SELECT * FROM marketing.ficha WHERE conversacion_id IS NULL AND NOT demo ORDER BY created_at LOOP
    c := marketing.conv_buscar(f.empresa, f.ciudad, NULL, false);
    IF c.id IS NULL THEN
      c := marketing.conv_crear(f.empresa, f.ciudad, f.actor, NULL, CASE f.origen WHEN 'radar' THEN 'radar' WHEN 'lead' THEN 'nuevo_lead' ELSE 'manual' END,
                                1::smallint, false, false, 'mapeo_v3');
      UPDATE marketing.conv_evento SET tipo = 'mapeada', datos = datos || jsonb_build_object('desde', 'ficha') WHERE conversacion_id = c.id AND tipo = 'creada';
      n_nuevas := n_nuevas + 1;
    END IF;
    UPDATE marketing.ficha SET conversacion_id = c.id WHERE id = f.id;
    IF f.sesion_id <> c.sesion_id THEN
      INSERT INTO marketing.conv_sesion (sesion_id, conversacion_id, rol) VALUES (f.sesion_id, c.id, 'prospectador') ON CONFLICT (sesion_id) DO NOTHING;
    END IF;
    n_f := n_f + 1;
  END LOOP;

  -- 4 · Nivel inicial con la evidencia, sin mensajes (es el punto de partida, no un cambio).
  UPDATE marketing.conversacion SET nivel = marketing.conv_nivel_de(evidencia) WHERE NOT demo AND nivel <> marketing.conv_nivel_de(evidencia);
  -- 5 · Un renglón de sistema por conversación mapeada.
  INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos)
  SELECT x.sesion_id, 'sistema', 'sistema', 'Conversación de la empresa (Marketing v3): aquí queda todo — ficha, envío a CRM, toques, reasignaciones y cierre. Etapa ' || x.etapa || ' · N' || x.nivel || '.',
         jsonb_build_object('conv', 'mapeo')
    FROM marketing.conversacion x WHERE NOT x.demo AND NOT EXISTS (SELECT 1 FROM chat.mensaje m WHERE m.sesion_id = x.sesion_id AND m.datos->>'conv' = 'mapeo');

  RETURN jsonb_build_object('tarjetas', n_t, 'senales', n_b, 'fichas', n_f, 'conversaciones_nuevas', n_nuevas,
    'total', (SELECT count(*) FROM marketing.conversacion WHERE NOT demo),
    'n1', (SELECT count(*) FROM marketing.conversacion WHERE NOT demo AND nivel = 1),
    'n2', (SELECT count(*) FROM marketing.conversacion WHERE NOT demo AND nivel = 2),
    'n3', (SELECT count(*) FROM marketing.conversacion WHERE NOT demo AND nivel = 3),
    'etapa2', (SELECT count(*) FROM marketing.conversacion WHERE NOT demo AND etapa = 2));
END
$map$;
ALTER FUNCTION marketing.conv_mapear() OWNER TO marketing_app;
REVOKE ALL ON FUNCTION marketing.conv_mapear() FROM PUBLIC;

-- La corrida. El read-back de conteos va aparte (consulta de solo lectura) y se publica en el #421.
DO $corre$
DECLARE r jsonb;
BEGIN
  r := marketing.conv_mapear();
  RAISE NOTICE 'mapeo v3: %', r;
END
$corre$;
