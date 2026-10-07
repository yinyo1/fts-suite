-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0009_piloto · Modo piloto, go-live con una sola bandera y destinatarios (#386)
--
-- 1) Cada caso tiene PISTA: 'sombra' o 'real'. La pista real de una persona cuenta
--    retardos y semanas de jornada SÓLO desde su activación; un caso de sombra nunca
--    se vuelve real. Así nadie recibe como primer correo real una carta compromiso
--    armada con retardos de la etapa de sombra.
-- 2) PILOTO: lista de empleados (piloto_employee_ids) que pasan a la pista real
--    cuando la base registra piloto_inicio. Lo registra retardos/enviar la primera
--    vez que ve en main el archivo retardos/config/piloto.json, o sea al mergear el
--    PR. Interruptor: piloto_habilitado.
-- 3) GO-LIVE: UNA bandera, modo = 'real'. Un trigger registra real_inicio y
--    real_desde en ese momento. Reversa: modo = 'sombra'.
-- 4) DESTINATARIOS de todo aviso a la persona: Para la persona; CC aviso_cc_rh y su
--    jefe directo según Odoo. Sin jefe: CC aviso_cc_rh y aviso_cc_sin_jefe, la
--    leyenda "Falta asignarle jefe en Odoo" arriba del correo y la marca en el panel.
--    Los correos viven en la base (retardos.config), no en el repo.
-- 5) PPA aparte del retardo: Retardos NO lo calcula (lo calcula Nómina · Incidencias);
--    ppa_minutos sólo alimenta el texto del aviso.
-- 6) retardos.simular_aviso(): vista previa con el código real, dentro de una
--    subtransacción que se revierte. No deja rastro.
--
-- Sin llaves dobles ni patrones de reemplazo de JS (retardos_0001 reglas 7 y 8).
-- Sin guiones largos. Sin datos personales: los ids del piloto no son correos ni nombres.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1. CONFIGURACIÓN ═════════════════════════════════════════════════════════
INSERT INTO retardos.config (clave, valor, descripcion, confirmado, actualizado_por) VALUES
 ('piloto_employee_ids', '[63, 101, 112, 75, 149]'::jsonb,
  'Empleados del piloto (ids de hr.employee). Reciben avisos reales desde piloto_inicio aunque modo siga en sombra. Pedido de Esteban del 7-oct-2026 (#386).',
  true, 'retardos_0009'),
 ('piloto_habilitado', 'true'::jsonb,
  'Interruptor del piloto. false: los casos de la pista real del piloto vuelven a salir como sombra al instante. No afecta al go-live (modo).',
  true, 'retardos_0009'),
 ('piloto_inicio', 'null'::jsonb,
  'Momento en que arrancó el piloto. Lo escribe retardos/enviar la primera vez que ve en main el archivo retardos/config/piloto.json (al mergear el PR). Desde aquí cuentan los retardos y las semanas de jornada del piloto.',
  true, 'retardos_0009'),
 ('real_inicio', 'null'::jsonb,
  'Momento del paso a real. Lo escribe solo el trigger de la tabla config al cambiar modo a real. Desde aquí cuentan los retardos y las semanas de jornada de todos.',
  true, 'retardos_0009'),
 ('aviso_cc_rh', '[]'::jsonb,
  'Copia fija de TODO aviso a la persona (retardo y jornada). El valor real se escribe en la base, no en el repo (#386).',
  false, 'retardos_0009'),
 ('aviso_cc_sin_jefe', '[]'::jsonb,
  'Copia adicional cuando la persona no tiene jefe directo en Odoo (o su jefe no tiene correo utilizable). El valor real se escribe en la base, no en el repo (#386).',
  false, 'retardos_0009'),
 ('leyenda_sin_jefe', '"Falta asignarle jefe en Odoo"'::jsonb,
  'Leyenda visible arriba del correo cuando la persona no tiene jefe directo en Odoo.',
  true, 'retardos_0009'),
 ('ppa_minutos', '5'::jsonb,
  'SÓLO TEXTO. Minutos del Premio de Puntualidad (PPA) que se citan en el aviso. Retardos no calcula el PPA: lo calcula Nómina · Incidencias. Si la regla cambia allá, cambiar aquí.',
  true, 'retardos_0009')
ON CONFLICT (clave) DO NOTHING;

-- ══ 2. ESQUEMA: pista y jefe en el caso ══════════════════════════════════════
ALTER TABLE retardos.caso ADD COLUMN IF NOT EXISTS pista text NOT NULL DEFAULT 'sombra';
ALTER TABLE retardos.caso ADD COLUMN IF NOT EXISTS jefe_estado text;
ALTER TABLE retardos.caso DROP CONSTRAINT IF EXISTS caso_pista_check;
ALTER TABLE retardos.caso ADD CONSTRAINT caso_pista_check CHECK (pista IN ('sombra','real'));
ALTER TABLE retardos.caso DROP CONSTRAINT IF EXISTS caso_jefe_estado_check;
ALTER TABLE retardos.caso ADD CONSTRAINT caso_jefe_estado_check
  CHECK (jefe_estado IS NULL OR jefe_estado IN ('ok','sin_jefe','jefe_sin_correo','direccion'));
COMMENT ON COLUMN retardos.caso.pista IS 'sombra: etapa de prueba, todo correo va a Dirección y RH. real: piloto o go-live. Un caso nunca cambia de pista.';
COMMENT ON COLUMN retardos.caso.jefe_estado IS 'Cómo estaba el jefe directo en Odoo al abrir: ok, sin_jefe, jefe_sin_correo o direccion (la persona es su propio jefe).';

DO $uq$
DECLARE r record;
BEGIN
  -- La unicidad por persona, periodo y nivel pasa a ser por pista: la pista real abre su propio aviso.
  FOR r IN SELECT con.conname FROM pg_constraint con
            WHERE con.conrelid = 'retardos.caso'::regclass AND con.contype = 'u'
              AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
                    WHERE a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)) = ARRAY['employee_id','nivel','periodo']
  LOOP
    EXECUTE format('ALTER TABLE retardos.caso DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'retardos.caso'::regclass AND conname = 'caso_persona_periodo_nivel_pista_key') THEN
    ALTER TABLE retardos.caso ADD CONSTRAINT caso_persona_periodo_nivel_pista_key UNIQUE (employee_id, periodo, nivel, pista);
  END IF;
  -- modo_al_abrir admite 'piloto'.
  FOR r IN SELECT con.conname FROM pg_constraint con
            WHERE con.conrelid = 'retardos.caso'::regclass AND con.contype = 'c'
              AND pg_get_constraintdef(con.oid) LIKE '%modo_al_abrir%'
  LOOP
    EXECUTE format('ALTER TABLE retardos.caso DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE retardos.caso ADD CONSTRAINT caso_modo_al_abrir_check CHECK (modo_al_abrir IN ('sombra','piloto','real'));
END
$uq$;

-- ══ 3. QUIÉN ESTÁ EN LA PISTA REAL ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.cfg_instante(p_clave text) RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(retardos.cfg(p_clave)) = 'string' THEN (retardos.cfg(p_clave) #>> '{}')::timestamptz END
$fn$;

CREATE OR REPLACE FUNCTION retardos.en_piloto(p_emp integer) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce((retardos.cfg('piloto_habilitado') #>> '{}')::boolean, false)
     AND retardos.cfg_instante('piloto_inicio') IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(retardos.cfg('piloto_employee_ids')) = 'array'
                                                               THEN retardos.cfg('piloto_employee_ids') ELSE '[]'::jsonb END) x
                  WHERE x = p_emp::text)
$fn$;

-- Desde cuándo cuenta la pista real de una persona. NULL = sigue en sombra.
CREATE OR REPLACE FUNCTION retardos.inicio_real(p_emp integer) RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN retardos.en_piloto(p_emp) THEN retardos.cfg_instante('piloto_inicio')
    WHEN coalesce(retardos.cfg_txt('modo'), 'sombra') = 'real' THEN retardos.cfg_instante('real_inicio')
  END
$fn$;

CREATE OR REPLACE FUNCTION retardos.pista_de(p_emp integer) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN retardos.inicio_real(p_emp) IS NOT NULL THEN 'real' ELSE 'sombra' END
$fn$;

-- Instante de la checada que generó el retardo (hora del centro).
CREATE OR REPLACE FUNCTION retardos.retardo_instante(p_fecha date, p_seg integer, p_hora numeric) RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$
  SELECT retardos.de_local(p_fecha::timestamp + make_interval(secs => coalesce(p_seg, round(coalesce(p_hora, 0) * 3600)::int)))
$fn$;

-- ══ 4. GO-LIVE: una sola bandera (modo) ══════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.trg_modo() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.clave <> 'modo' OR (NEW.valor #>> '{}') IS NOT DISTINCT FROM (OLD.valor #>> '{}') THEN RETURN NEW; END IF;
  IF (NEW.valor #>> '{}') = 'real' THEN
    UPDATE retardos.config SET valor = to_jsonb(now()::text), actualizado_por = NEW.actualizado_por, actualizado_at = now()
     WHERE clave = 'real_inicio';
    UPDATE retardos.config SET valor = to_jsonb(retardos.hoy_local()::text), actualizado_por = NEW.actualizado_por, actualizado_at = now()
     WHERE clave = 'real_desde';
    PERFORM retardos.log(NULL, 'paso_a_real', NEW.actualizado_por, 'modo cambió a real: desde ahora cuenta la pista real de todos (#386)',
                         jsonb_build_object('real_inicio', now()));
  ELSE
    PERFORM retardos.log(NULL, 'regreso_a_sombra', NEW.actualizado_por, 'modo cambió a ' || coalesce(NEW.valor #>> '{}', 'null')
                         || ': los correos de la pista real vuelven a salir como sombra (#386)', '{}'::jsonb);
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS config_modo ON retardos.config;
CREATE TRIGGER config_modo AFTER UPDATE OF valor ON retardos.config
  FOR EACH ROW WHEN (NEW.clave = 'modo') EXECUTE FUNCTION retardos.trg_modo();

-- ══ 5. DESTINATARIOS DE UN AVISO A LA PERSONA ════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.lista_cfg(p_clave text) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(retardos.cfg(p_clave)) = 'array' THEN retardos.cfg(p_clave) ELSE '[]'::jsonb END
$fn$;

-- { para, cc, jefe_estado, leyenda }. cc sin repetidos y sin quien ya va en Para.
CREATE OR REPLACE FUNCTION retardos.destinos_aviso(p_emp integer) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE m retardos.empleado; v_para jsonb; v_jefe jsonb := '[]'::jsonb; v_est text; v_rh jsonb; v_cc jsonb; v_ley text;
BEGIN
  SELECT * INTO m FROM retardos.empleado WHERE employee_id = p_emp;
  v_para := retardos.solo_emails(retardos.destinatarios(p_emp));
  IF m.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM retardos.empleado j WHERE j.employee_id = m.parent_id AND j.activo) THEN
    v_est := 'sin_jefe';
  ELSIF m.parent_id = p_emp THEN
    v_est := 'direccion';
  ELSE
    v_jefe := retardos.solo_emails(retardos.destinatarios(m.parent_id));
    v_est := CASE WHEN jsonb_array_length(v_jefe) > 0 THEN 'ok' ELSE 'jefe_sin_correo' END;
  END IF;
  v_rh := retardos.lista_cfg('aviso_cc_rh');
  IF jsonb_array_length(v_rh) = 0 THEN v_rh := retardos.rh_para(); END IF;   -- respaldo: nunca sin copia a RH
  v_cc := v_rh || v_jefe || CASE WHEN v_est IN ('sin_jefe','jefe_sin_correo') THEN retardos.lista_cfg('aviso_cc_sin_jefe') ELSE '[]'::jsonb END;
  SELECT coalesce(jsonb_agg(x ORDER BY o), '[]'::jsonb) INTO v_cc
    FROM jsonb_array_elements_text(retardos.unicos(v_cc)) WITH ORDINALITY AS t(x, o)
   WHERE lower(x) NOT IN (SELECT lower(y) FROM jsonb_array_elements_text(v_para) y);
  v_ley := CASE v_est WHEN 'sin_jefe' THEN coalesce(retardos.cfg_txt('leyenda_sin_jefe'), 'Falta asignarle jefe en Odoo')
                      WHEN 'jefe_sin_correo' THEN 'El jefe directo asignado en Odoo no tiene un correo utilizable' END;
  RETURN jsonb_build_object('para', v_para, 'cc', v_cc, 'jefe_estado', v_est, 'leyenda', v_ley,
                            'jefe', v_jefe, 'parent_id', m.parent_id);
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.aplicar_leyenda(p_env bigint, p_leyenda text) RETURNS void
LANGUAGE sql AS $fn$
  UPDATE retardos.envio
     SET cuerpo_html = '<div style="background:#fef3c7;border:2px solid #b45309;border-radius:6px;padding:10px 12px;margin:0 0 14px 0;'
                    || 'font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#7c2d12">' || p_leyenda || '</div>' || cuerpo_html
   WHERE id = p_env AND p_leyenda IS NOT NULL AND position(p_leyenda IN cuerpo_html) = 0
$fn$;

-- ══ 6. ABRIR CASO DE RETARDO (con pista) ═════════════════════════════════════
DROP FUNCTION IF EXISTS retardos.abrir_caso(integer, text, smallint, text, bigint);
CREATE OR REPLACE FUNCTION retardos.abrir_caso(p_emp integer, p_periodo text, p_nivel smallint, p_motivo text,
                                               p_corrida bigint, p_pista text DEFAULT NULL, p_desde timestamptz DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE e retardos.escalera; v_id bigint; v_folio text; n integer; v_pista text; v_desde timestamptz; v_modo text;
        v_rh jsonb := retardos.rh_para(); d jsonb; v_env bigint; v_pdf text; v_jefe_cc jsonb;
BEGIN
  -- Quien llama sin pista es la escalera de sombra de ingestar_base: a la pista real la atiende ingestar().
  IF p_pista IS NULL AND retardos.pista_de(p_emp) = 'real' THEN RETURN NULL; END IF;
  v_pista := coalesce(p_pista, 'sombra');
  v_desde := CASE WHEN v_pista = 'real' THEN coalesce(p_desde, retardos.inicio_real(p_emp)) END;
  v_modo := CASE WHEN v_pista = 'sombra' THEN 'sombra'
                 WHEN coalesce(retardos.cfg_txt('modo'), 'sombra') = 'real' AND NOT retardos.en_piloto(p_emp) THEN 'real'
                 ELSE 'piloto' END;
  SELECT * INTO e FROM retardos.escalera WHERE nivel = p_nivel;
  SELECT count(*) INTO n FROM retardos.retardo r
   WHERE r.employee_id = p_emp AND r.periodo = p_periodo AND r.estado = 'contado'
     AND (v_desde IS NULL OR retardos.retardo_instante(r.fecha, r.seg_local, r.hora_local) >= v_desde);
  d := retardos.destinos_aviso(p_emp);
  v_folio := retardos.nuevo_folio(current_date);
  INSERT INTO retardos.caso (folio, employee_id, periodo, nivel, accion, motivo_apertura, estado, requiere_firma,
                             retardos_n, modo_al_abrir, pista, jefe_estado)
  VALUES (v_folio, p_emp, p_periodo, p_nivel, e.accion, p_motivo, 'DETECTADO', e.requiere_firma, n, v_modo, v_pista, d->>'jefe_estado')
  ON CONFLICT (employee_id, periodo, nivel, pista) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO retardos.caso_retardo (caso_id, retardo_id)
  SELECT v_id, r.id FROM retardos.retardo r
   WHERE r.employee_id = p_emp AND r.periodo = p_periodo AND r.estado = 'contado'
     AND (v_desde IS NULL OR retardos.retardo_instante(r.fecha, r.seg_local, r.hora_local) >= v_desde)
  ON CONFLICT DO NOTHING;

  PERFORM retardos.log(v_id, 'apertura', 'sistema',
    'Nivel ' || p_nivel || ' (' || e.accion || ') por ' || p_motivo || ' con ' || n || ' retardos en ' || p_periodo
      || CASE WHEN v_pista = 'real' THEN ' (pista real, ' || v_modo || ', desde ' || to_char(retardos.a_local(v_desde), 'DD/MM/YYYY HH24:MI') || ')' ELSE '' END,
    jsonb_build_object('corrida_id', p_corrida, 'retardos_n', n, 'pista', v_pista, 'jefe_estado', d->>'jefe_estado'), NULL, 'DETECTADO');
  IF d->>'jefe_estado' IN ('sin_jefe','jefe_sin_correo') THEN
    PERFORM retardos.log(v_id, 'sin_jefe', 'sistema', d->>'leyenda', jsonb_build_object('parent_id', d->'parent_id'));
  END IF;

  -- Modo sin suspensión: se registra como antecedente y no se escribe a nadie.
  IF NOT retardos.nivel_habilitado(p_nivel) THEN
    PERFORM retardos.transicionar(v_id, 'RETENIDO', 'sistema',
      'Nivel de suspensión alcanzado, no aplicado (modo sin suspensión). Cuenta como antecedente.',
      jsonb_build_object('modo_sanciones', retardos.cfg('modo_sanciones')));
    RETURN v_id;
  END IF;
  IF e.accion = 'suspension' AND NOT retardos.suspension_aplicable(p_emp, p_periodo, p_nivel, p_motivo) THEN
    PERFORM retardos.transicionar(v_id, 'RETENIDO', 'sistema',
      'Nivel de suspensión alcanzado, no aplicado: los retardos o el antecedente son anteriores a la activación del modo suspensión (regla de no retroactividad).',
      jsonb_build_object('modo_suspension_desde', retardos.cfg('modo_suspension_desde')));
    RETURN v_id;
  END IF;

  v_pdf := CASE WHEN e.accion = 'aviso' THEN NULL ELSE e.accion END;
  IF jsonb_array_length(d->'para') = 0 THEN
    UPDATE retardos.caso SET ruta = 'supervisor' WHERE id = v_id;
    PERFORM retardos.log(v_id, 'sin_correo', 'sistema', 'La persona no tiene correo utilizable: el aviso va a su jefe y a RH para entrega en persona',
                         jsonb_build_object('correos', retardos.correos_de(p_emp)));
  END IF;

  IF e.accion = 'aviso' THEN
    IF jsonb_array_length(d->'para') > 0 THEN
      v_env := retardos.encolar_plantilla(v_id, 'notificacion_aviso', 'notificacion', v_folio || ':notificacion', d->'para', d->'cc', NULL);
      UPDATE retardos.envio SET destinatarios_origen = retardos.destinatarios(p_emp) WHERE id = v_env;
    ELSE
      v_env := retardos.encolar_plantilla(v_id, 'ruta_supervisor', 'ruta_supervisor', v_folio || ':ruta_supervisor',
        CASE WHEN jsonb_array_length(d->'jefe') > 0 THEN d->'jefe' ELSE retardos.lista_cfg('aviso_cc_rh') || v_rh END,
        d->'cc', NULL);
    END IF;
    PERFORM retardos.aplicar_leyenda(v_env, d->>'leyenda');
    RETURN v_id;
  END IF;

  -- Requiere firma: la hoja lista para imprimir va a RH con copia al jefe (o, sin jefe, a quien cubre).
  v_jefe_cc := CASE WHEN jsonb_array_length(d->'jefe') > 0 THEN d->'jefe' ELSE retardos.lista_cfg('aviso_cc_sin_jefe') END;
  v_env := retardos.encolar_plantilla(v_id, 'rh_recolectar', 'notificacion', v_folio || ':notificacion',
    v_rh, v_jefe_cc, v_pdf,
    jsonb_build_object('vence_rh', to_char(retardos.a_local(retardos.sumar_habiles(now(), coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3))), 'DD/MM/YYYY'),
                       'correo_trabajador', coalesce((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(d->'para') x),
                                                     'sin correo utilizable (entrega sólo en persona)')));
  PERFORM retardos.aplicar_leyenda(v_env, d->>'leyenda');
  -- Aviso a la persona con su hoja: Para la persona, CC RH y jefe (regla de #386).
  IF jsonb_array_length(d->'para') > 0 THEN
    v_env := retardos.encolar_plantilla(v_id, 'aviso_trabajador', 'aviso_trabajador', v_folio || ':aviso_trabajador',
                                        d->'para', d->'cc', v_pdf);
    UPDATE retardos.envio SET destinatarios_origen = retardos.destinatarios(p_emp) WHERE id = v_env;
    PERFORM retardos.aplicar_leyenda(v_env, d->>'leyenda');
  END IF;
  RETURN v_id;
END
$fn$;

-- ══ 7. INGESTA: escalera de la pista real ════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.escalar_pista_real(p_corrida bigint) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE r record; L smallint; E smallint; v_id bigint; v_casos jsonb := '[]'::jsonb;
        v_reinc integer := coalesce(retardos.cfg_txt('reincidencia_dias')::int, 30);
BEGIN
  -- Umbral: retardos contados de la persona DESDE su activación, por periodo.
  FOR r IN
    SELECT x.employee_id, x.periodo, count(*) AS n, min(x.ini) AS ini
      FROM (SELECT t.employee_id, t.periodo, retardos.inicio_real(t.employee_id) AS ini,
                   retardos.retardo_instante(t.fecha, t.seg_local, t.hora_local) AS cuando
              FROM retardos.retardo t
             WHERE t.estado = 'contado' AND t.fecha >= retardos.hoy_local() - 70) x
     WHERE x.ini IS NOT NULL AND x.cuando >= x.ini
     GROUP BY x.employee_id, x.periodo
  LOOP
    SELECT max(nivel) INTO L FROM retardos.escalera WHERE activo AND umbral <= r.n;
    SELECT max(nivel) INTO E FROM retardos.caso
     WHERE employee_id = r.employee_id AND periodo = r.periodo AND tipo = 'retardo' AND pista = 'real';
    IF L IS NOT NULL AND (E IS NULL OR L > E) THEN
      v_id := retardos.abrir_caso(r.employee_id, r.periodo, L, 'umbral', p_corrida, 'real', r.ini);
      IF v_id IS NOT NULL THEN v_casos := v_casos || to_jsonb((SELECT folio FROM retardos.caso WHERE id = v_id)); END IF;
    END IF;
  END LOOP;

  -- Reincidencia: sólo contra documentos firmados y validados de la misma pista real.
  FOR r IN
    SELECT DISTINCT ON (c.employee_id) c.employee_id, c.nivel, c.validado_at, x.periodo
      FROM retardos.caso c
      JOIN retardos.retardo x ON x.employee_id = c.employee_id AND x.estado = 'contado'
       AND x.fecha > retardos.a_local(c.validado_at)::date
       AND x.fecha <= retardos.a_local(c.validado_at)::date + v_reinc
     WHERE c.tipo = 'retardo' AND c.pista = 'real' AND c.requiere_firma AND c.validado_at IS NOT NULL
       AND c.estado IN ('VALIDADO_RH','ACCION_PROGRAMADA','ACCION_VERIFICADA','CERRADO')
       AND retardos.pista_de(c.employee_id) = 'real'
     ORDER BY c.employee_id, c.nivel DESC, x.fecha
  LOOP
    SELECT min(nivel) INTO L FROM retardos.escalera WHERE activo AND nivel > r.nivel;
    IF L IS NOT NULL AND NOT EXISTS (SELECT 1 FROM retardos.caso WHERE employee_id = r.employee_id AND tipo = 'retardo' AND pista = 'real'
                                     AND nivel >= L AND abierto_at >= r.validado_at) THEN
      v_id := retardos.abrir_caso(r.employee_id, r.periodo, L, 'reincidencia', p_corrida, 'real', retardos.inicio_real(r.employee_id));
      IF v_id IS NOT NULL THEN v_casos := v_casos || to_jsonb((SELECT folio FROM retardos.caso WHERE id = v_id)); END IF;
    END IF;
  END LOOP;
  RETURN v_casos;
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.ingestar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE r jsonb; n integer; v_real jsonb;
BEGIN
  PERFORM retardos.sincronizar_correos(p);
  r := retardos.ingestar_base(p);
  v_real := retardos.escalar_pista_real(nullif(r->>'corrida_id', '')::bigint);
  n := retardos.sincronizar_correos(p);
  RETURN r || jsonb_build_object('correos_actualizados_al_final', n, 'casos_pista_real', v_real);
END
$fn$;

-- ══ 8. JORNADA CON PISTA ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.pista_semana(p_emp integer, p_desde date) RETURNS text
LANGUAGE sql STABLE AS $fn$
  -- Real sólo si la semana EMPIEZA después de la activación: nadie recibe un aviso real de una semana que
  -- arrancó antes de que el aviso existiera para él.
  SELECT CASE WHEN retardos.inicio_real(p_emp) IS NOT NULL AND retardos.de_local(p_desde::timestamp) >= retardos.inicio_real(p_emp)
              THEN 'real' ELSE 'sombra' END
$fn$;

CREATE OR REPLACE FUNCTION retardos.jornada_nivel_pista(p_emp integer, p_desde date, p_pista text) RETURNS smallint
LANGUAGE sql STABLE AS $fn$
  SELECT least(3, 1 + count(*))::smallint
    FROM retardos.caso c
   WHERE c.tipo = 'jornada' AND c.employee_id = p_emp AND c.estado <> 'CANCELADO_POR_RH' AND c.pista = p_pista
     AND retardos.semana_de_id(c.periodo) < p_desde
     AND retardos.semana_de_id(c.periodo) >= p_desde - coalesce(retardos.cfg_txt('jornada_ventana_dias')::int, 90)
$fn$;

DROP FUNCTION IF EXISTS retardos.abrir_caso_jornada(bigint, bigint);
CREATE OR REPLACE FUNCTION retardos.abrir_caso_jornada(p_js bigint, p_corrida bigint, p_pista text DEFAULT NULL) RETURNS bigint
LANGUAGE plpgsql AS $fn$
DECLARE s retardos.jornada_semana; e retardos.escalera_jornada; v_nivel smallint; v_id bigint; v_folio text;
        v_rh jsonb := retardos.rh_para(); d jsonb; v_env bigint; v_nad timestamptz := retardos.no_antes_de_jornada();
        v_extra jsonb; v_pista text; v_modo text; v_jefe_cc jsonb;
BEGIN
  SELECT * INTO s FROM retardos.jornada_semana WHERE id = p_js FOR UPDATE;
  IF s.caso_id IS NOT NULL THEN RETURN NULL; END IF;
  v_pista := coalesce(p_pista, retardos.pista_semana(s.employee_id, s.desde));
  v_modo := CASE WHEN v_pista = 'sombra' THEN 'sombra'
                 WHEN coalesce(retardos.cfg_txt('modo'), 'sombra') = 'real' AND NOT retardos.en_piloto(s.employee_id) THEN 'real'
                 ELSE 'piloto' END;
  v_nivel := retardos.jornada_nivel_pista(s.employee_id, s.desde, v_pista);
  SELECT * INTO e FROM retardos.escalera_jornada WHERE nivel = v_nivel;
  d := retardos.destinos_aviso(s.employee_id);
  v_folio := retardos.nuevo_folio_jornada(retardos.hoy_local());
  INSERT INTO retardos.caso (folio, tipo, employee_id, periodo, nivel, accion, motivo_apertura, estado, requiere_firma,
                             retardos_n, modo_al_abrir, pista, jefe_estado)
  VALUES (v_folio, 'jornada', s.employee_id, s.semana, v_nivel, e.accion, 'jornada', 'DETECTADO', e.requiere_firma, 0,
          v_modo, v_pista, d->>'jefe_estado')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  UPDATE retardos.jornada_semana SET caso_id = v_id WHERE id = s.id;
  PERFORM retardos.log(v_id, 'apertura', 'sistema',
    'Aviso ' || v_nivel || ' de jornada: ' || retardos.horas_txt(coalesce(s.horas_corregidas, s.horas_efectivas)) || ' h efectivas contra '
      || retardos.horas_txt(s.umbral) || ' h en la semana ' || s.semana || CASE WHEN v_pista = 'real' THEN ' (pista real, ' || v_modo || ')' ELSE '' END,
    jsonb_build_object('corrida_id', p_corrida, 'jornada_semana_id', s.id, 'faltante', s.faltante, 'pista', v_pista,
                       'jefe_estado', d->>'jefe_estado'), NULL, 'DETECTADO');
  IF d->>'jefe_estado' IN ('sin_jefe','jefe_sin_correo') THEN
    PERFORM retardos.log(v_id, 'sin_jefe', 'sistema', d->>'leyenda', jsonb_build_object('parent_id', d->'parent_id'));
  END IF;

  v_extra := jsonb_build_object('plazo_correccion',
    to_char(retardos.a_local(retardos.sumar_habiles(coalesce(v_nad, now()), coalesce(retardos.cfg_txt('jornada_plazo_correccion_dias')::int, 3))), 'DD/MM/YYYY'));
  IF jsonb_array_length(d->'para') = 0 THEN
    UPDATE retardos.caso SET ruta = 'supervisor' WHERE id = v_id;
    PERFORM retardos.log(v_id, 'sin_correo', 'sistema', 'La persona no tiene correo utilizable: el aviso va a su jefe y a RH',
                         jsonb_build_object('correos', retardos.correos_de(s.employee_id)));
  END IF;

  IF NOT e.requiere_firma THEN
    IF jsonb_array_length(d->'para') > 0 THEN
      v_env := retardos.encolar_plantilla(v_id, 'jornada_aviso', 'notificacion', v_folio || ':notificacion', d->'para', d->'cc', NULL, v_extra);
      UPDATE retardos.envio SET destinatarios_origen = retardos.destinatarios(s.employee_id), no_antes_de = v_nad WHERE id = v_env;
    ELSE
      v_env := retardos.encolar_plantilla(v_id, 'jornada_sin_correo', 'ruta_supervisor', v_folio || ':ruta_supervisor',
        CASE WHEN jsonb_array_length(d->'jefe') > 0 THEN d->'jefe' ELSE retardos.lista_cfg('aviso_cc_rh') || v_rh END,
        d->'cc', NULL, v_extra);
      UPDATE retardos.envio SET no_antes_de = v_nad WHERE id = v_env;
    END IF;
    PERFORM retardos.aplicar_leyenda(v_env, d->>'leyenda');
    RETURN v_id;
  END IF;

  -- 3er aviso: hoja con QR a RH (con copia al jefe), que la imprime y recolecta; aviso firme a la persona.
  v_jefe_cc := CASE WHEN jsonb_array_length(d->'jefe') > 0 THEN d->'jefe' ELSE retardos.lista_cfg('aviso_cc_sin_jefe') END;
  v_env := retardos.encolar_plantilla(v_id, 'jornada_rh_recolectar', 'notificacion', v_folio || ':notificacion',
    v_rh, v_jefe_cc, 'aviso_jornada_3',
    v_extra || jsonb_build_object('vence_rh', to_char(retardos.a_local(retardos.sumar_habiles(coalesce(v_nad, now()),
                                           coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3))), 'DD/MM/YYYY'),
                       'correo_trabajador', coalesce((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(d->'para') x),
                                                     'sin correo utilizable (entrega sólo en persona)')));
  UPDATE retardos.envio SET no_antes_de = v_nad WHERE id = v_env;
  PERFORM retardos.aplicar_leyenda(v_env, d->>'leyenda');
  IF jsonb_array_length(d->'para') > 0 THEN
    v_env := retardos.encolar_plantilla(v_id, 'jornada_aviso_3', 'aviso_trabajador', v_folio || ':aviso_trabajador',
                                        d->'para', d->'cc', 'aviso_jornada_3', v_extra);
    UPDATE retardos.envio SET destinatarios_origen = retardos.destinatarios(s.employee_id), no_antes_de = v_nad WHERE id = v_env;
    PERFORM retardos.aplicar_leyenda(v_env, d->>'leyenda');
  END IF;
  IF e.propone_medida THEN
    INSERT INTO retardos.medida (caso_id, employee_id, semana, horas_propuestas)
    VALUES (v_id, s.employee_id, s.semana, s.faltante)
    ON CONFLICT (caso_id) DO NOTHING;
    PERFORM retardos.log(v_id, 'medida_propuesta', 'sistema',
      'Propuesta para RH: descuento de ' || retardos.horas_txt(s.faltante) || ' h de tiempo no laborado u otra medida. '
      || 'Queda retenida hasta que Legal confirme (modo_medidas_jornada = ' || coalesce(retardos.cfg_txt('modo_medidas_jornada'), 'retenidas') || ').',
      jsonb_build_object('horas', s.faltante));
  END IF;
  RETURN v_id;
END
$fn$;

-- ══ 9. OUTBOX: real o sombra por envío ══════════════════════════════════════
-- Real si: el caso es de la pista real y su persona SIGUE en la pista real (piloto vigente o modo real),
-- o, sin caso (resumen, alertas, comunicado), si modo = real. Todo lo demás sale como sombra.
CREATE OR REPLACE FUNCTION retardos.envio_es_real(p_env bigint) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN e.caso_id IS NULL THEN coalesce(retardos.cfg_txt('modo'), 'sombra') = 'real'
              ELSE k.pista = 'real' AND retardos.pista_de(k.employee_id) = 'real' END
    FROM retardos.envio e LEFT JOIN retardos.caso k ON k.id = e.caso_id
   WHERE e.id = p_env
$fn$;

-- p = { piloto_marca: true|false }  (retardos/enviar lo lee de main: retardos/config/piloto.json)
CREATE OR REPLACE FUNCTION retardos.por_enviar(p_limite integer, p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_modo text := coalesce(retardos.cfg_txt('modo'), 'sombra'); v_out jsonb := '[]'::jsonb; e retardos.envio;
        v_para jsonb; v_cc jsonb; v_asunto text; v_html text; v_real text; v_es_real boolean;
BEGIN
  -- El piloto arranca la primera vez que la marca está en main (merge del PR) y queda fijado en la base.
  IF coalesce((p->>'piloto_marca')::boolean, false)
     AND coalesce((retardos.cfg('piloto_habilitado') #>> '{}')::boolean, false)
     AND retardos.cfg_instante('piloto_inicio') IS NULL THEN
    UPDATE retardos.config SET valor = to_jsonb(now()::text), actualizado_por = 'retardos/enviar', actualizado_at = now()
     WHERE clave = 'piloto_inicio';
    PERFORM retardos.log(NULL, 'piloto_activado', 'retardos/enviar',
      'Se encontró retardos/config/piloto.json en main: arranca el piloto (#386)',
      jsonb_build_object('piloto_inicio', now(), 'piloto_employee_ids', retardos.cfg('piloto_employee_ids')));
  END IF;

  UPDATE retardos.envio SET estado = 'omitido', modo_envio = 'sombra', error = 'sombra: sin escritura a Odoo'
   WHERE estado = 'pendiente' AND tipo = 'odoo_nota' AND v_modo = 'sombra';

  FOR e IN SELECT * FROM retardos.envio
            WHERE estado IN ('pendiente','fallido') AND intentos < 5 AND tipo <> 'odoo_nota'
              AND (no_antes_de IS NULL OR no_antes_de <= now())
            ORDER BY id LIMIT p_limite FOR UPDATE SKIP LOCKED
  LOOP
    v_es_real := coalesce(retardos.envio_es_real(e.id), false);
    v_real := 'Para: ' || coalesce((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(e.para) x), '(nadie)')
           || ' | CC: ' || coalesce((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(e.cc) x), '(nadie)');
    IF v_es_real THEN
      v_para := e.para; v_cc := e.cc; v_asunto := e.asunto; v_html := e.cuerpo_html;
    ELSE
      v_para := retardos.lista_cfg('sombra_destinatarios'); v_cc := '[]'::jsonb;
      v_asunto := '[SOMBRA] ' || e.asunto;
      v_html := '<div style="border:2px dashed #b45309;padding:8px;margin-bottom:12px;font-family:Arial;font-size:13px">'
             || '<b>MODO SOMBRA.</b> Este correo NO llegó a su destinatario real. Destinatario real: ' || v_real
             || '</div>' || e.cuerpo_html;
    END IF;
    IF jsonb_array_length(v_para) = 0 THEN
      UPDATE retardos.envio SET estado = 'fallido', intentos = intentos + 1, error = 'SIN_DESTINATARIO' WHERE id = e.id;
      CONTINUE;
    END IF;
    v_out := v_out || jsonb_build_object('id', e.id, 'tipo', e.tipo, 'modo', CASE WHEN v_es_real THEN 'real' ELSE 'sombra' END,
               'para', v_para, 'cc', v_cc, 'asunto', v_asunto, 'html', v_html, 'pdf', e.pdf,
               'responder_a', coalesce(retardos.cfg_txt('buzon_receptor'), retardos.cfg_txt('remitente')),
               'caso', CASE WHEN e.caso_id IS NULL THEN NULL ELSE retardos.caso_datos(e.caso_id) END);
  END LOOP;
  RETURN v_out;
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.por_enviar(p_limite integer DEFAULT 20) RETURNS jsonb
LANGUAGE sql AS $fn$
  SELECT retardos.por_enviar(p_limite, '{}'::jsonb)
$fn$;

-- ══ 10. DATOS DEL CASO Y LISTA DEL PANEL ═════════════════════════════════════
DO $ren$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'retardos' AND p.proname = 'caso_datos_base') THEN
    ALTER FUNCTION retardos.caso_datos(bigint) RENAME TO caso_datos_base;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'retardos' AND p.proname = 'panel_base') THEN
    ALTER FUNCTION retardos.panel(jsonb) RENAME TO panel_base;
  END IF;
END
$ren$;

CREATE OR REPLACE FUNCTION retardos.caso_datos(p_caso bigint) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT retardos.caso_datos_base(p_caso) || jsonb_build_object(
    'pista', k.pista, 'modo_al_abrir', k.modo_al_abrir, 'jefe_estado', k.jefe_estado,
    'leyenda_jefe', CASE k.jefe_estado WHEN 'sin_jefe' THEN coalesce(retardos.cfg_txt('leyenda_sin_jefe'), 'Falta asignarle jefe en Odoo')
                                       WHEN 'jefe_sin_correo' THEN 'El jefe directo asignado en Odoo no tiene un correo utilizable' END,
    'ppa_minutos', coalesce(retardos.cfg_txt('ppa_minutos')::int, 5))
    FROM retardos.caso k WHERE k.id = p_caso
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE r jsonb;
BEGIN
  r := retardos.panel_base(p);
  IF p->>'accion' = 'listar' AND jsonb_typeof(r->'casos') = 'array' THEN
    r := jsonb_set(r, '{casos}', coalesce((
      SELECT jsonb_agg(x || jsonb_build_object('tipo', k.tipo, 'pista', k.pista, 'jefe_estado', k.jefe_estado) ORDER BY o)
        FROM jsonb_array_elements(r->'casos') WITH ORDINALITY AS t(x, o)
        LEFT JOIN retardos.caso k ON k.folio = x->>'folio'), '[]'::jsonb));
    r := r || jsonb_build_object('piloto', jsonb_build_object(
      'empleados', retardos.cfg('piloto_employee_ids'), 'habilitado', retardos.cfg('piloto_habilitado'),
      'inicio', retardos.cfg('piloto_inicio'), 'modo', retardos.cfg_txt('modo'), 'real_inicio', retardos.cfg('real_inicio')));
  END IF;
  RETURN r;
END
$fn$;

-- ══ 11. TEXTOS: retardo y PPA separados ══════════════════════════════════════
UPDATE retardos.plantilla SET
  cuerpo_html = '<p>Hola [[nombre]]:</p><p>Llegar a tiempo es una forma de respetar el tiempo de tus compañeros: cuando alguien llega tarde, el equipo arranca incompleto. Por eso te compartimos este <b>aviso informativo</b>. No requiere respuesta.</p><p>En el periodo [[periodo]] el control de asistencia registró estos retardos (hora del centro, CST):</p>[[detalle]]'
    || '<p><b>Retardo.</b> Tu hora de entrada es la que aparece en la tabla. Cuenta de lunes a viernes, con <b>[[tolerancia_min]] minutos</b> de tolerancia: llegar a los [[tolerancia_min]] minutos exactos no es retardo; un segundo después, sí. Llevas <b>[[retardos_n]]</b> en el mes. A partir de <b>[[umbral_carta]] retardos</b> en el mes, Recursos Humanos te cita para firmar una carta compromiso.</p>'
    || '<p><b>Premio de puntualidad (PPA): es otra regla.</b> Si te corresponde, el PPA se gana checando a más tardar <b>[[ppa_minutos]] minutos</b> después de tu hora de entrada. No depende de este aviso ni lo cambia: lo revisa Nómina cada semana. Puedes no tener ningún retardo y aun así no ganar el PPA de una semana, si algún día llegaste más de [[ppa_minutos]] y hasta [[tolerancia_min]] minutos tarde.</p>'
    || '<p>Si alguno de estos días tenías permiso, estabas en campo o hubo un error en la checada, avisa a Recursos Humanos o a tu supervisor para corregirlo.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>',
  estado_texto = 'pendiente_validacion_rh', actualizado_por = 'retardos_0009', actualizado_at = now(),
  variables = 'nombre, periodo, detalle (tabla: fecha, hora de checada con segundos, hora de entrada, minutos tarde), tolerancia_min, retardos_n, umbral_carta, ppa_minutos, folio'
 WHERE clave = 'notificacion_aviso';

UPDATE retardos.plantilla SET
  cuerpo_html = '<p>Hola [[nombre]]:</p><p>En el periodo [[periodo]] el control de asistencia registró [[retardos_n]] retardos (hora del centro, CST; lunes a viernes, con [[tolerancia_min]] minutos de tolerancia):</p>[[detalle]]'
    || '<p>Por esto se emitió una <b>[[nombre_nivel]]</b>, que te adjuntamos para que la conozcas. <b>No necesitas contestar este correo.</b> Recursos Humanos te va a citar para revisarla contigo y firmarla. En la hoja hay un espacio para que escribas tu versión: tienes derecho a ser escuchado.</p>'
    || '<p><b>Premio de puntualidad (PPA): es otra regla.</b> Si te corresponde, el PPA se gana checando a más tardar <b>[[ppa_minutos]] minutos</b> después de tu hora de entrada, y lo revisa Nómina cada semana. Este documento no lo cambia.</p>'
    || '<p>Si alguno de estos días tenías permiso, estabas en campo o hubo un error en la checada, díselo a Recursos Humanos cuando te cite.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>',
  estado_texto = 'pendiente_validacion_rh', actualizado_por = 'retardos_0009', actualizado_at = now(),
  variables = 'nombre, periodo, retardos_n, tolerancia_min, detalle, nombre_nivel, ppa_minutos, folio'
 WHERE clave = 'aviso_trabajador';

-- ══ 12. VISTA PREVIA SIN RASTRO ══════════════════════════════════════════════
-- p = { employee_id, tipo: 'retardo'|'jornada', nivel?, periodo?, desde? (timestamptz), semana?, sin_jefe? }
-- Corre el código real (abrir_caso / abrir_caso_jornada / encolar) en la pista real dentro de una
-- subtransacción y la revierte: no queda caso, folio, envío ni bitácora. Sólo consume números de id.
CREATE OR REPLACE FUNCTION retardos.simular_aviso(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_emp integer := (p->>'employee_id')::int; v_tipo text := coalesce(p->>'tipo', 'retardo');
        v_periodo text := coalesce(p->>'periodo', to_char(retardos.hoy_local(), 'YYYY-MM'));
        v_desde timestamptz := coalesce(nullif(p->>'desde', '')::timestamptz, retardos.de_local((v_periodo || '-01')::date::timestamp));
        v_nivel smallint := coalesce((p->>'nivel')::smallint, 1); v_id bigint; v_js bigint; v_out jsonb;
BEGIN
  BEGIN
    IF coalesce((p->>'sin_jefe')::boolean, false) THEN
      UPDATE retardos.empleado SET parent_id = NULL WHERE employee_id = v_emp;
    END IF;
    IF v_tipo = 'jornada' THEN
      SELECT id INTO v_js FROM retardos.jornada_semana WHERE employee_id = v_emp AND semana = p->>'semana';
      IF v_js IS NULL THEN RAISE EXCEPTION 'SEMANA_SIN_CORTE %', p->>'semana' USING ERRCODE = 'P0001'; END IF;
      UPDATE retardos.jornada_semana SET caso_id = NULL WHERE id = v_js;
      v_id := retardos.abrir_caso_jornada(v_js, NULL, 'real');
    ELSE
      v_id := retardos.abrir_caso(v_emp, v_periodo, v_nivel, 'umbral', NULL, 'real', v_desde);
    END IF;
    v_out := jsonb_build_object('simulado', true, 'caso', retardos.caso_datos(v_id) - 'retardos',
      'retardos', (SELECT jsonb_agg(jsonb_build_object('fecha', r.fecha, 'llegada', CASE WHEN r.seg_local IS NOT NULL THEN retardos.hhmmss(r.seg_local) END,
                       'minutos', r.minutos_tarde) ORDER BY r.fecha)
                     FROM retardos.caso_retardo cr JOIN retardos.retardo r ON r.id = cr.retardo_id WHERE cr.caso_id = v_id),
      'envios', (SELECT jsonb_agg(jsonb_build_object('tipo', e.tipo, 'para', e.para, 'cc', e.cc, 'asunto', e.asunto,
                                   'html', e.cuerpo_html, 'pdf', e.pdf) ORDER BY e.id)
                   FROM retardos.envio e WHERE e.caso_id = v_id),
      'hoy_saldria_como', CASE WHEN retardos.pista_de(v_emp) = 'real' THEN 'real' ELSE 'sombra' END);
    RAISE EXCEPTION 'RETARDOS_SIMULACION' USING ERRCODE = 'RT999';
  EXCEPTION WHEN SQLSTATE 'RT999' THEN
    NULL;   -- todo lo de arriba se revierte; v_out sobrevive
  END;
  RETURN v_out;
END
$fn$;

-- ══ 13. PERMISOS ═════════════════════════════════════════════════════════════
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;
