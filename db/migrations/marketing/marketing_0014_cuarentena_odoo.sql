-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0014_cuarentena_odoo.sql · La cuarentena llega a Odoo por marketing/odoo-lead (#421)
--
-- Regla de Esteban (15-oct-2026): solo leads en «Prospecto Lead» (stage 17), por la credencial
-- «Odoo Marketing (servicio)», etiqueta «Cuarentena» (marketing.config odoo_tag_cuarentena = 3);
-- el lead SIGUE ABIERTO (no se mueve de etapa ni se archiva) y se crea la actividad de reactivación
-- en la fecha de reactivar_el de la conversación (hoy + cuarentena_dias = 90).
--
-- ADITIVA. La base solo ABRE y CIERRA la escritura; quien escribe en Odoo es el workflow:
--   · marketing.conv_odoo: estado 'en_proceso' permitido y columnas de traza (actor, error, escrito_at).
--   · marketing.api_crm_conv(req): modos abrir_cuarentena / cerrar_cuarentena.
--       abrir: exige marketing:crm, ventana de 5 min y nonce; la persona es la dueña de la conversación
--         o tiene marketing:equipo; toma la fila PENDIENTE más vieja de esa conversación (con lead) y la
--         pone en_proceso. Devuelve el lead, la etiqueta, la fecha y el usuario de Odoo de la DUEÑA.
--       cerrar: escrito o error, con el read-back; deja evento 'crm' y un renglón de sistema en el hilo.
--   · marketing.api_crm: despachador_0014 manda esos dos modos a api_crm_conv; lo demás, igual que antes.
-- No escribe en Odoo ni encola trabajos. Correrla dos veces no hace nada la segunda.
-- Reversa: renombrar api_crm_0013 de vuelta a api_crm.
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE marketing.conv_odoo ADD COLUMN IF NOT EXISTS actor      text;
ALTER TABLE marketing.conv_odoo ADD COLUMN IF NOT EXISTS error      text;
ALTER TABLE marketing.conv_odoo ADD COLUMN IF NOT EXISTS escrito_at timestamptz;

DO $chk$
DECLARE k text;
BEGIN
  SELECT conname INTO k FROM pg_constraint
   WHERE conrelid = 'marketing.conv_odoo'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%pendiente_config%';
  IF k IS NOT NULL AND k <> 'conv_odoo_estado_v14' THEN
    EXECUTE format('ALTER TABLE marketing.conv_odoo DROP CONSTRAINT %I', k);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conv_odoo_estado_v14') THEN
    ALTER TABLE marketing.conv_odoo ADD CONSTRAINT conv_odoo_estado_v14
      CHECK (estado IN ('pendiente','pendiente_config','sin_lead','en_proceso','escrito','error'));
  END IF;
END
$chk$;

CREATE OR REPLACE FUNCTION marketing.api_crm_conv(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $acv$
DECLARE c marketing.conversacion; o marketing.conv_odoo; scopes jsonb := coalesce(req->'scopes','[]'::jsonb); v_tag int; v_fecha date;
BEGIN
  IF NOT scopes ? 'marketing:crm' THEN RETURN chat.err('SCOPE_INSUFICIENTE'); END IF;
  IF req->>'modo' = 'abrir_cuarentena' THEN
    IF abs(extract(epoch FROM now()) * 1000 - (req->>'ts')::numeric) > 300000 THEN RETURN chat.err('FUERA_DE_VENTANA'); END IF;
    BEGIN INSERT INTO chat.nonce (nonce, actor, producto) VALUES (req->>'nonce', req->>'actor', 'marketing');
    EXCEPTION WHEN unique_violation THEN RETURN chat.err('REPETIDA'); END;
    BEGIN SELECT * INTO c FROM marketing.conversacion WHERE id = (req->>'conversacion_id')::uuid;
    EXCEPTION WHEN others THEN RETURN chat.err('CONVERSACION_INVALIDA'); END;
    IF c.id IS NULL THEN RETURN chat.err('CONVERSACION_NO_EXISTE'); END IF;
    IF c.dueno <> req->>'actor' AND NOT scopes ? 'marketing:equipo' THEN RETURN chat.err('NO_ES_TUYA'); END IF;
    IF c.estado <> 'cuarentena' THEN RETURN chat.err('NO_EN_CUARENTENA'); END IF;
    v_tag := marketing.cfg('odoo_tag_cuarentena');
    IF coalesce(v_tag, 0) = 0 THEN RETURN chat.err('FALTA_CONFIG_ODOO'); END IF;
    SELECT * INTO o FROM marketing.conv_odoo
     WHERE conversacion_id = c.id AND accion = 'cuarentena' AND estado = 'pendiente' AND lead_id IS NOT NULL
     ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF o.id IS NULL THEN RETURN chat.err('SIN_PENDIENTE', 'No hay nada pendiente de escribir en Odoo para esta conversación.'); END IF;
    UPDATE marketing.conv_odoo SET estado = 'en_proceso', actor = req->>'actor', updated_at = now() WHERE id = o.id RETURNING * INTO o;
    v_fecha := coalesce(c.reactivar_el, chat.hoy() + marketing.cfg('cuarentena_dias'));
    RETURN jsonb_build_object('ok', true, 'envio_id', o.id, 'cuarentena', true, 'odoo_lead_id', o.lead_id, 'tag_id', v_tag,
      'reactivar_el', to_char(v_fecha, 'YYYY-MM-DD'), 'empresa', c.empresa, 'dueno', c.dueno,
      'etapa_id', marketing.cfg('etapa_prospecto_lead'), 'odoo', marketing.odoo_cfg(c.dueno));
  ELSIF req->>'modo' = 'cerrar_cuarentena' THEN
    UPDATE marketing.conv_odoo SET estado = CASE WHEN req->>'resultado' = 'escrito' THEN 'escrito' ELSE 'error' END,
      readback = coalesce(req->'readback','{}'::jsonb), error = left(req->>'error', 500),
      escrito_at = CASE WHEN req->>'resultado' = 'escrito' THEN now() END, updated_at = now()
     WHERE id = (req->>'envio_id')::bigint AND estado = 'en_proceso' RETURNING * INTO o;
    IF o.id IS NULL THEN RETURN chat.err('ENVIO_NO_ABIERTO'); END IF;
    SELECT * INTO c FROM marketing.conversacion WHERE id = o.conversacion_id;
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES (c.id, 'crm', coalesce(o.actor, 'odoo-lead'),
      jsonb_build_object('accion', 'cuarentena', 'resultado', o.estado, 'lead_id', o.lead_id, 'error', o.error));
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      CASE WHEN o.estado = 'escrito'
        THEN 'Odoo: el lead #' || o.lead_id || ' quedó con la etiqueta «Cuarentena» y una actividad de reactivación el ' || coalesce(to_char(c.reactivar_el, 'YYYY-MM-DD'), '?') || '. El lead sigue abierto.'
        ELSE 'Odoo: no se escribió la cuarentena del lead #' || o.lead_id || ' (' || coalesce(o.error, 'error') || '). Nada cambió en Odoo.' END,
      jsonb_build_object('conv', 'crm'));
    RETURN jsonb_build_object('ok', true, 'estado', o.estado);
  END IF;
  RETURN chat.err('MODO_DESCONOCIDO');
EXCEPTION WHEN invalid_text_representation THEN RETURN chat.err('ID_INVALIDO');
END
$acv$;

-- api_crm: se le suman los dos modos de la cuarentena, sin tocar el resto (patrón de 0004).
DO $crm$
DECLARE src text;
BEGIN
  SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'marketing' AND p.proname = 'api_crm';
  IF src IS NOT NULL AND position('despachador_0014' IN src) = 0 THEN
    EXECUTE 'DROP FUNCTION IF EXISTS marketing.api_crm_0013(jsonb)';
    EXECUTE 'ALTER FUNCTION marketing.api_crm(jsonb) RENAME TO api_crm_0013';
  END IF;
END
$crm$;

CREATE OR REPLACE FUNCTION marketing.api_crm(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = marketing, chat, public AS $acd$
BEGIN
  -- despachador_0014
  IF req->>'modo' IN ('abrir_cuarentena','cerrar_cuarentena') THEN RETURN marketing.api_crm_conv(req); END IF;
  RETURN marketing.api_crm_0013(req);
END
$acd$;

ALTER FUNCTION marketing.api_crm_conv(jsonb) OWNER TO marketing_app;
ALTER FUNCTION marketing.api_crm(jsonb) OWNER TO marketing_app;
ALTER FUNCTION marketing.api_crm_0013(jsonb) OWNER TO marketing_app;
REVOKE ALL ON FUNCTION marketing.api_crm_conv(jsonb), marketing.api_crm(jsonb), marketing.api_crm_0013(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing.api_crm(jsonb) TO CURRENT_USER;
