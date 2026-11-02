-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0014 · Candado por persona para las alertas USA en real (#448, activación 2-nov)
--
-- «Alertas USA» (alertas_modo_usa) es una bandera por PAÍS. Esteban pidió pasarla a real
-- SOLO para Mateo (75), José Luis (79) y Ricardo (98). Con la bandera sola también caería
-- Rissia (97, ficha USA). Esta migración agrega la lista alertas_real_solo:
--   · null (como nace): sin candado, igual que hoy.
--   · [ids]: una alerta de país USA solo sale en real si su employee_id está en la lista;
--     las demás quedan en SOMBRA (se registran y no se encolan).
-- México no cambia: la lista solo se mira cuando el país de la alerta es USA.
-- alertas_registrar es copia EXACTA de 0009 con una línea cambiada (modo_alerta_emp);
-- a_config_guardar es copia exacta de 0010 más la validación de la clave nueva. Las genera
-- un script que exige que cada reemplazo calce una sola vez.
-- Reglas de db/README.md: idempotente, etiquetas con nombre. Nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO nomina_usa.config (clave, valor, nota) VALUES
  ('alertas_real_solo', 'null'::jsonb,
   'Candado por persona de las alertas USA en real. null = sin candado. [ids] = solo esos employee_id salen en real cuando alertas_modo_usa = real; los demás de USA quedan en sombra. Solo Esteban.')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION nomina_usa.modo_alerta_emp(p_emp integer, p_pais text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN p_pais = 'USA' AND nomina_usa.modo_alertas('USA') = 'real'
         AND jsonb_typeof(nomina_usa.cfg('alertas_real_solo')) = 'array'
         AND NOT (nomina_usa.cfg('alertas_real_solo') @> to_jsonb(p_emp)) THEN 'sombra'
    ELSE nomina_usa.modo_alertas(p_pais) END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.alertas_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE a jsonb; v_id bigint; v_emp integer; v_pais text; v_modo text;
        v_nuevas integer := 0; v_enc integer := 0; v_real integer := 0; v_para jsonb; v_cc jsonb; v_asunto text; v_html text;
        v_jefe integer; v_dest integer[]; v_lista jsonb; v_quitar jsonb;
BEGIN
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p->'alertas', '[]'::jsonb)) LOOP
    v_emp := (a->>'employee_id')::integer;
    v_pais := nomina_usa.pais_alerta(v_emp, (a->>'fecha')::date, a->'detalle'->>'zona');
    v_modo := nomina_usa.modo_alerta_emp(v_emp, v_pais);
    v_id := NULL;
    INSERT INTO nomina_usa.alerta (clave, tipo, employee_id, fecha, attendance_id, detalle, modo_al_crear, pais)
    VALUES (a->>'clave', a->>'tipo', v_emp, (a->>'fecha')::date, nullif(a->>'attendance_id', '')::integer,
            coalesce(a->'detalle', '{}'::jsonb), v_modo, v_pais)
    ON CONFLICT (clave) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN CONTINUE; END IF;
    v_nuevas := v_nuevas + 1;
    IF v_modo <> 'real' THEN CONTINUE; END IF;
    v_real := v_real + 1;
    v_jefe := nomina_usa.jefe_de(v_emp);
    SELECT destinatarios_alerta INTO v_dest FROM nomina_usa.ficha WHERE employee_id = v_emp AND activo;
    IF coalesce(cardinality(v_dest), 0) > 0 THEN
      -- La ficha manda: van a sus destinatarios, y el jefe NO va en copia (salvo que esté en la lista).
      v_lista := nomina_usa.correos_de_lista(v_dest);
      v_quitar := CASE WHEN v_jefe = ANY (v_dest) THEN '[]'::jsonb ELSE nomina_usa.correos_de_lista(ARRAY[v_jefe]) END;
      IF a->>'tipo' IN ('entrada_faltante', 'salida_faltante') THEN
        v_para := retardos.solo_emails(retardos.destinatarios(v_emp));
        v_cc := nomina_usa.sin_correos(v_lista, v_quitar || v_para);
      ELSE
        v_para := nomina_usa.sin_correos(v_lista, v_quitar); v_cc := '[]'::jsonb;
      END IF;
    ELSIF a->>'tipo' = 'entrada_faltante' THEN
      v_para := retardos.destinatarios(v_emp);
      v_cc := retardos.unicos(retardos.rh_para() || coalesce(retardos.destinatarios(v_jefe), '[]'::jsonb));
    ELSIF a->>'tipo' = 'salida_faltante' THEN
      v_para := retardos.destinatarios(v_emp); v_cc := '[]'::jsonb;
    ELSE
      v_para := retardos.rh_para(); v_cc := '[]'::jsonb;
    END IF;
    IF a->>'tipo' = 'entrada_faltante' THEN
      v_asunto := 'No registramos tu entrada de hoy';
      v_html := '<p>Hola:</p><p>No registramos tu entrada de hoy ' || to_char((a->>'fecha')::date, 'DD/MM/YYYY') ||
                '. Si ya estás trabajando, checa en el kiosko o avisa a tu jefe y a Recursos Humanos.</p><p>Recursos Humanos</p>';
    ELSIF a->>'tipo' = 'salida_faltante' THEN
      v_asunto := 'Tienes una entrada sin salida';
      v_html := '<p>Hola:</p><p>Tu entrada del ' || to_char((a->>'fecha')::date, 'DD/MM/YYYY') ||
                ' sigue sin salida. Si ya terminaste, registra tu salida con «Olvidé checar salida» en el kiosko.</p><p>Recursos Humanos</p>';
    ELSE
      v_asunto := 'Salida sin registrar desde ayer: empleado ' || v_emp;
      v_html := '<p>La entrada del ' || to_char((a->>'fecha')::date, 'DD/MM/YYYY') || ' del empleado ' || v_emp ||
                ' sigue sin salida. Revísala en Nómina USA, pestaña Alertas.</p>';
    END IF;
    IF jsonb_array_length(coalesce(v_para, '[]'::jsonb)) > 0 THEN
      PERFORM retardos.encolar('nomina_usa:' || (a->>'clave'), NULL, 'alerta', v_para, v_cc, v_asunto, v_html);
      UPDATE nomina_usa.alerta SET encolada = true WHERE id = v_id;
      v_enc := v_enc + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'modos', nomina_usa.modos_alertas(), 'modo', nomina_usa.modos_alertas(),
                            'nuevas', v_nuevas, 'en_real', v_real, 'encoladas', v_enc);
END
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.a_config_guardar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_clave text := p->>'clave'; v_antes jsonb;
BEGIN
  IF v_clave = 'alertas_modo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CLAVE_OBSOLETA', 'usa', jsonb_build_array('alertas_modo_usa', 'alertas_modo_mx'));
  END IF;
  SELECT valor INTO v_antes FROM nomina_usa.config WHERE clave = v_clave;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'CLAVE_DESCONOCIDA'); END IF;
  IF v_clave IN ('alertas_modo_usa', 'alertas_modo_mx', 'avisos_modo', 'vigilante_modo') AND NOT (p->'valor' IN ('"sombra"'::jsonb, '"real"'::jsonb)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MODO_INVALIDO');
  END IF;
  IF v_clave IN ('kiosko_activo', 'evidencia_activa', 'costo_odoo_activo', 'conciliacion_activa') AND jsonb_typeof(p->'valor') <> 'boolean' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;
  IF v_clave IN ('avisos_personas', 'costo_odoo_mapa', 'conciliacion_formato', 'conciliacion_cuentas') AND jsonb_typeof(p->'valor') <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;
  IF v_clave = 'alertas_real_solo' AND NOT (jsonb_typeof(p->'valor') = 'null' OR (jsonb_typeof(p->'valor') = 'array'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p->'valor') x WHERE jsonb_typeof(x) <> 'number' OR (x #>> '{}') ~ '[^0-9]'))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;
  IF coalesce(btrim(p->>'motivo'), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_REQUERIDO'); END IF;
  UPDATE nomina_usa.config SET valor = p->'valor', updated_at = now(), updated_by = coalesce(p->>'actor', current_user)
   WHERE clave = v_clave;
  PERFORM nomina_usa.log(p->>'actor', 'config', v_clave, v_antes, p->'valor', p->>'motivo');
  RETURN jsonb_build_object('ok', true, 'clave', v_clave, 'antes', v_antes, 'despues', p->'valor');
END
$fn$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
