-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0012_conteo_desde_cero · Decisiones de Dirección del 7-oct-2026 (#386)
--
-- A) CONTEO DESDE CERO CON FECHAS FIJAS. piloto_desde (2026-10-08) y real_desde
--    (2026-10-12) son claves fijas, a las 00:00 hora del centro. El merge del PR
--    (marca del piloto) y el UPDATE de modo SOLO HABILITAN: ya no mueven fechas.
--    Un retardo del mismo día, aunque sea anterior a la activación, cuenta.
--    Retardos del mes, escalera, reincidencia y jornada leen SOLO la pista real
--    con llegada >= la fecha de inicio de la persona.
-- B1) Acta administrativa (nivel 3) retenida hasta el go-live (modo = real), para
--    todos, piloto incluido (acta_solo_en_real).
-- B3) Casos de RH (casos_rh): sólo los resuelve quien está asignado
--    (casos_rh_usuarios, en la base) y toda resolución deja copia a Dirección
--    (casos_rh_cc; si está vacío, escalamiento_cc). Sin copia posible, no se resuelve.
--    Los avisos de esas personas llevan además CC a Dirección.
-- B5) jornada_desde = 2026-10-09: primera semana FTS (viernes) del piloto. La del
--    resto (viernes 16) sale sola de real_desde por pista_semana.
-- C) Ningún caso de sombra o histórico genera recordatorios, vencimientos,
--    escalamientos ni alertas de modo: verificar() y evaluar_alertas() sólo miran
--    la pista real. La vista de reincidencia también.
-- D) Panel: bloque "conteo" (desde cuándo cuenta cada pista) y marca de caso de RH.
--
-- NO cancela casos: eso es un paso aparte (B2), con su propio SQL, después del "va".
-- Sin guiones largos. Sin datos personales: los usuarios y correos viven en la base.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1. CONFIGURACIÓN ═════════════════════════════════════════════════════════
INSERT INTO retardos.config (clave, valor, descripcion, confirmado, actualizado_por) VALUES
 ('piloto_desde', '"2026-10-08"'::jsonb,
  'Fecha FIJA (00:00 hora del centro) desde la que cuenta la pista real del piloto. La marca del merge sólo habilita el piloto; no mueve esta fecha. Decisión de Dirección del 7-oct-2026 (#386).',
  true, 'retardos_0012'),
 ('acta_solo_en_real', 'true'::jsonb,
  'true: el acta administrativa (nivel 3) queda retenida mientras modo no sea real, piloto incluido. Decisión de Dirección del 7-oct-2026 (#386).',
  true, 'retardos_0012'),
 ('casos_rh', '{"101": {"atiende_empleado": 63}, "63": {"atiende_empleado": 63}}'::jsonb,
  'Casos de personas de RH: quién los atiende (employee_id). Toda resolución deja copia a Dirección. Decisión de Dirección del 7-oct-2026 (#386).',
  true, 'retardos_0012'),
 ('casos_rh_usuarios', '{}'::jsonb,
  'Usuario de la suite de quien atiende los casos de RH, por employee_id: {"63": "usuario"}. Vive en la base, no en el repo. Vacío: nadie puede resolver un caso de RH desde el panel.',
  false, 'retardos_0012'),
 ('casos_rh_cc', '[]'::jsonb,
  'Copia de toda resolución de un caso de RH y de sus avisos. Vacío: se usa escalamiento_cc. Si los dos están vacíos, el caso de RH no se puede resolver.',
  true, 'retardos_0012')
ON CONFLICT (clave) DO NOTHING;

UPDATE retardos.config SET valor = '"2026-10-12"'::jsonb, confirmado = true, actualizado_por = 'retardos_0012', actualizado_at = now(),
       descripcion = 'Fecha FIJA (00:00 hora del centro) desde la que cuenta la pista real de toda la plantilla. El UPDATE de modo a real sólo habilita; no mueve esta fecha. Desde aquí cuentan también los disparadores globales. Decisión de Dirección del 7-oct-2026 (#386).'
 WHERE clave = 'real_desde';
UPDATE retardos.config SET valor = '"2026-10-09"'::jsonb, confirmado = true, actualizado_por = 'retardos_0012', actualizado_at = now(),
       descripcion = 'Primera semana FTS (viernes) que puede abrir avisos de jornada: la del piloto (9-oct). Para el resto, pista_semana exige además que la semana empiece después de real_desde (16-oct). Decisión de Dirección del 7-oct-2026 (#386).'
 WHERE clave = 'jornada_desde';
UPDATE retardos.config SET descripcion = 'Instante en que se cambió modo a real (bitácora). NO define desde cuándo cuenta: eso es real_desde.'
 WHERE clave = 'real_inicio';
UPDATE retardos.config SET descripcion = 'Instante en que retardos/enviar vio la marca del merge y habilitó el piloto. NO define desde cuándo cuenta: eso es piloto_desde.'
 WHERE clave = 'piloto_inicio';

-- ══ 2. INICIO DE CONTEO: FECHAS FIJAS ════════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.cfg_fecha_local(p_clave text) RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN retardos.cfg_txt(p_clave) ~ ('^[0-9]{4}-[0-9]{2}-[0-9]{2}' || chr(36))
              THEN retardos.de_local(retardos.cfg_txt(p_clave)::date::timestamp) END
$fn$;

-- Desde cuándo cuenta la pista real de una persona. NULL = sigue en sombra.
-- Habilitar (piloto_inicio / modo) decide SI cuenta; la fecha fija decide DESDE CUÁNDO.
CREATE OR REPLACE FUNCTION retardos.inicio_real(p_emp integer) RETURNS timestamptz
LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN retardos.en_piloto(p_emp)
      THEN coalesce(retardos.cfg_fecha_local('piloto_desde'), retardos.cfg_instante('piloto_inicio'))
    WHEN coalesce(retardos.cfg_txt('modo'), 'sombra') = 'real'
      THEN coalesce(retardos.cfg_fecha_local('real_desde'), retardos.cfg_instante('real_inicio'))
  END
$fn$;

CREATE OR REPLACE FUNCTION retardos.trg_modo() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.clave <> 'modo' OR (NEW.valor #>> '{}') IS NOT DISTINCT FROM (OLD.valor #>> '{}') THEN RETURN NEW; END IF;
  IF (NEW.valor #>> '{}') = 'real' THEN
    -- Sólo se anota CUÁNDO se habilitó. real_desde es fija y no se toca.
    UPDATE retardos.config SET valor = to_jsonb(now()::text), actualizado_por = NEW.actualizado_por, actualizado_at = now()
     WHERE clave = 'real_inicio';
    PERFORM retardos.log(NULL, 'paso_a_real', NEW.actualizado_por,
      'modo cambió a real: la pista real de todos cuenta desde ' || coalesce(retardos.cfg_txt('real_desde'), 'real_inicio') || ' (#386)',
      jsonb_build_object('real_inicio', now(), 'real_desde', retardos.cfg('real_desde')));
  ELSE
    PERFORM retardos.log(NULL, 'regreso_a_sombra', NEW.actualizado_por, 'modo cambió a ' || coalesce(NEW.valor #>> '{}', 'null')
                         || ': los correos de la pista real vuelven a salir como sombra (#386)', '{}'::jsonb);
  END IF;
  RETURN NEW;
END
$fn$;

-- ══ 3. B1: ACTA RETENIDA HASTA EL GO-LIVE ════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.nivel_habilitado(p_nivel smallint) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT CASE coalesce((SELECT accion FROM retardos.escalera WHERE nivel = p_nivel), '')
    WHEN 'suspension' THEN coalesce(retardos.cfg_txt('modo_sanciones'), 'sin_suspension') = 'con_suspension'
    WHEN 'acta' THEN NOT coalesce((retardos.cfg('acta_solo_en_real') #>> '{}')::boolean, false)
                     OR coalesce(retardos.cfg_txt('modo'), 'sombra') = 'real'
    ELSE true END
$fn$;

-- ══ 4. B3: CASOS DE RH ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.es_caso_rh(p_emp integer) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_typeof(retardos.cfg('casos_rh')) = 'object' AND retardos.cfg('casos_rh') ? p_emp::text
$fn$;

CREATE OR REPLACE FUNCTION retardos.copia_caso_rh() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN jsonb_array_length(retardos.lista_cfg('casos_rh_cc')) > 0 THEN retardos.lista_cfg('casos_rh_cc')
              ELSE retardos.lista_cfg('escalamiento_cc') END
$fn$;

-- Actores del sistema: no son una persona resolviendo, no se les exige ser el responsable.
CREATE OR REPLACE FUNCTION retardos.actor_sistema(p_actor text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(p_actor, '') IN ('sistema', 'lector') OR coalesce(p_actor, '') LIKE 'correo:%'
$fn$;

-- { atiende_empleado, atiende_usuario, atiende_nombre } o NULL si no es caso de RH.
CREATE OR REPLACE FUNCTION retardos.responsable_rh(p_emp integer) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN retardos.es_caso_rh(p_emp) THEN jsonb_build_object(
    'atiende_empleado', (retardos.cfg('casos_rh') -> p_emp::text ->> 'atiende_empleado')::int,
    'atiende_usuario', retardos.cfg('casos_rh_usuarios') ->> (retardos.cfg('casos_rh') -> p_emp::text ->> 'atiende_empleado'),
    'atiende_nombre', (SELECT nombre FROM retardos.empleado
                        WHERE employee_id = (retardos.cfg('casos_rh') -> p_emp::text ->> 'atiende_empleado')::int),
    'copia', 'Dirección') END
$fn$;

-- Lanza si una persona (no el sistema) quiere resolver un caso de RH sin ser quien lo atiende,
-- o si no hay a quién mandar la copia.
CREATE OR REPLACE FUNCTION retardos.exigir_responsable_rh(p_emp integer, p_actor text) RETURNS void
LANGUAGE plpgsql STABLE AS $fn$
DECLARE r jsonb := retardos.responsable_rh(p_emp);
BEGIN
  IF r IS NULL OR retardos.actor_sistema(p_actor) THEN RETURN; END IF;
  IF r->>'atiende_usuario' IS NULL THEN
    RAISE EXCEPTION 'CASO_RH_SIN_RESPONSABLE no hay usuario asignado en casos_rh_usuarios para este caso de RH';
  END IF;
  IF lower(coalesce(p_actor, '')) <> lower(r->>'atiende_usuario') THEN
    RAISE EXCEPTION 'CASO_RH_OTRO_RESPONSABLE este caso de RH sólo lo resuelve quien está asignado';
  END IF;
  IF jsonb_array_length(retardos.copia_caso_rh()) = 0 THEN
    RAISE EXCEPTION 'COPIA_RH_FALTANTE no hay correo de Dirección para la copia (casos_rh_cc o escalamiento_cc)';
  END IF;
END
$fn$;

-- transicionar: guardia de casos de RH (B3) y copia a Dirección en la misma transacción.
CREATE OR REPLACE FUNCTION retardos.transicionar(p_caso bigint, p_a text, p_actor text, p_motivo text, p_evid jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
AS $fn$
DECLARE c retardos.caso;
BEGIN
  SELECT * INTO c FROM retardos.caso WHERE id = p_caso FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASO_INEXISTENTE %', p_caso; END IF;
  -- B3 (#386): un caso de RH sólo lo resuelve quien está asignado, y siempre con copia a Dirección.
  PERFORM retardos.exigir_responsable_rh(c.employee_id, p_actor);
  IF c.estado = p_a THEN RETURN c.estado; END IF;           -- idempotente
  IF NOT EXISTS (SELECT 1 FROM retardos.transicion_valida WHERE de = c.estado AND a = p_a) THEN
    RAISE EXCEPTION 'TRANSICION_INVALIDA % -> % (caso %)', c.estado, p_a, c.folio;
  END IF;
  IF p_a = 'CANCELADO_POR_RH' AND char_length(coalesce(p_motivo, '')) < 5 THEN
    RAISE EXCEPTION 'MOTIVO_OBLIGATORIO: cancelar un caso exige motivo';
  END IF;
  UPDATE retardos.caso SET estado = p_a, actualizado_at = now(),
         cerrado_at = CASE WHEN p_a IN ('CERRADO','CANCELADO_POR_RH') THEN now() ELSE cerrado_at END,
         validado_at = CASE WHEN p_a = 'VALIDADO_RH' THEN now() ELSE validado_at END,
         validado_por = CASE WHEN p_a = 'VALIDADO_RH' THEN p_actor ELSE validado_por END
   WHERE id = p_caso;
  PERFORM retardos.log(p_caso, 'transicion', p_actor, p_motivo, p_evid, c.estado, p_a);
  IF retardos.es_caso_rh(c.employee_id) AND NOT retardos.actor_sistema(p_actor) THEN
    PERFORM retardos.encolar(c.folio || ':copia_rh:' || p_a || ':' || (SELECT max(id) FROM retardos.bitacora WHERE caso_id = p_caso),
      p_caso, 'aviso_rh', retardos.copia_caso_rh(), '[]'::jsonb,
      '[' || c.folio || '] Caso de RH: ' || c.estado || ' a ' || p_a,
      '<p>Copia a Dirección de un caso de una persona de Recursos Humanos.</p><p>Folio <b>' || c.folio || '</b>: '
        || c.estado || ' a <b>' || p_a || '</b>.</p><p>Lo resolvió: ' || coalesce(p_actor, '') || '. Motivo: '
        || coalesce(p_motivo, '') || '</p><p>Retardos v2 · SERVICIOS FTS SA DE CV</p>');
  END IF;
  RETURN p_a;
END
$fn$
;

-- destinos_aviso: las personas de RH llevan además CC a Dirección (B3).
CREATE OR REPLACE FUNCTION retardos.destinos_aviso(p_emp integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $fn$
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
  v_cc := v_rh || v_jefe || CASE WHEN v_est IN ('sin_jefe','jefe_sin_correo') THEN retardos.lista_cfg('aviso_cc_sin_jefe') ELSE '[]'::jsonb END
          || CASE WHEN retardos.es_caso_rh(p_emp) THEN retardos.copia_caso_rh() ELSE '[]'::jsonb END;   -- B3 (#386)
  SELECT coalesce(jsonb_agg(x ORDER BY o), '[]'::jsonb) INTO v_cc
    FROM jsonb_array_elements_text(retardos.unicos(v_cc)) WITH ORDINALITY AS t(x, o)
   WHERE lower(x) NOT IN (SELECT lower(y) FROM jsonb_array_elements_text(v_para) y);
  v_ley := CASE v_est WHEN 'sin_jefe' THEN coalesce(retardos.cfg_txt('leyenda_sin_jefe'), 'Falta asignarle jefe en Odoo')
                      WHEN 'jefe_sin_correo' THEN 'El jefe directo asignado en Odoo no tiene un correo utilizable' END;
  RETURN jsonb_build_object('para', v_para, 'cc', v_cc, 'jefe_estado', v_est, 'leyenda', v_ley,
                            'jefe', v_jefe, 'parent_id', m.parent_id);
END
$fn$
;

-- abrir_caso: el motivo de RETENIDO distingue acta (B1) de suspensión.
CREATE OR REPLACE FUNCTION retardos.abrir_caso(p_emp integer, p_periodo text, p_nivel smallint, p_motivo text, p_corrida bigint, p_pista text DEFAULT NULL::text, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
AS $fn$
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
      CASE WHEN e.accion = 'acta' THEN 'Acta alcanzada, retenida hasta el go-live (acta_solo_en_real). Cuenta como antecedente.'
           ELSE 'Nivel de suspensión alcanzado, no aplicado (modo sin suspensión). Cuenta como antecedente.' END,
      jsonb_build_object('modo_sanciones', retardos.cfg('modo_sanciones'), 'modo', retardos.cfg('modo'), 'accion', e.accion));
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
$fn$
;

-- verificar: los casos de sombra o históricos no vencen, no escalan ni generan recordatorios (#386).
CREATE OR REPLACE FUNCTION retardos.verificar(p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE c record; v_hoy date := retardos.hoy_local();
        v_plazo integer := coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3);
        v_rh jsonb := retardos.rh_para();
        v_esc jsonb := coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb);
        v_dval integer := coalesce(retardos.cfg_txt('dias_validacion_rh')::int, 2);
        v_tdesc text := coalesce(retardos.cfg_txt('jornada_tipo_nomina_descuento'), 'tiempo_no_laborado');
        n_venc integer := 0; n_esc integer := 0; n_rec_rh integer := 0; n_verif integer := 0; n_alert integer := 0;
        n_med_ok integer := 0; n_med_alert integer := 0;
        v_chec integer; v_nom boolean; v_corrida bigint; v_al jsonb; md record;
BEGIN
  INSERT INTO retardos.corrida (workflow) VALUES ('retardos/verificar') RETURNING id INTO v_corrida;

  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'ESPERANDO_FIRMA' AND k.pista = 'real' AND k.vence_at < now() LOOP
    PERFORM retardos.transicionar(c.id, 'VENCIDO', 'sistema', 'RH no subió la hoja al vencer el plazo');
    UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), greatest(v_plazo, 1)), recordatorios = recordatorios + 1 WHERE id = c.id;
    PERFORM retardos.encolar_plantilla(c.id, 'recordatorio_rh_recolectar', 'recordatorio', c.folio || ':recordatorio:1',
      v_rh, coalesce(retardos.jefe_de(c.employee_id), '[]'::jsonb), NULL,
      jsonb_build_object('vence_rh', to_char(retardos.a_local(retardos.sumar_habiles(now(), greatest(v_plazo, 1))), 'DD/MM/YYYY')));
    n_venc := n_venc + 1;
  END LOOP;

  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'VENCIDO' AND k.pista = 'real' AND k.vence_at < now() LOOP
    PERFORM retardos.transicionar(c.id, 'ESCALADO', 'sistema', 'Segundo vencimiento sin hoja: se escala a Dirección');
    PERFORM retardos.encolar_plantilla(c.id, 'escalamiento_rh', 'escalamiento', c.folio || ':escalamiento', v_esc,
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(v_rh) x WHERE NOT (to_jsonb(x) <@ v_esc)), NULL);
    n_esc := n_esc + 1;
  END LOOP;

  FOR c IN SELECT k.* FROM retardos.caso k
            WHERE k.estado = 'FIRMA_RECIBIDA' AND k.pista = 'real' AND retardos.sumar_habiles(k.actualizado_at, v_dval) < now()
  LOOP
    IF retardos.encolar_plantilla(c.id, 'recordatorio_rh', 'aviso_rh', c.folio || ':rh_pendiente:' || v_hoy,
                                  v_rh, '[]'::jsonb) IS NOT NULL THEN n_rec_rh := n_rec_rh + 1; END IF;
  END LOOP;

  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'ACCION_PROGRAMADA' AND k.pista = 'real' AND k.accion_desde IS NOT NULL LOOP
    v_nom := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'nom', '[]'::jsonb)) x
                      WHERE (x->>'employee_id')::int = c.employee_id
                        AND (x->>'desde')::date <= c.accion_hasta AND (x->>'hasta')::date >= c.accion_desde);
    IF c.accion_hasta < v_hoy THEN
      SELECT count(*) INTO v_chec FROM retardos.checada
       WHERE employee_id = c.employee_id AND fecha BETWEEN c.accion_desde AND c.accion_hasta;
      IF v_chec = 0 AND v_nom THEN
        PERFORM retardos.transicionar(c.id, 'ACCION_VERIFICADA', 'sistema',
          'Sin checadas en los días de suspensión y registrada en Nómina', jsonb_build_object('checadas', 0, 'nomina', true));
        PERFORM retardos.transicionar(c.id, 'CERRADO', 'sistema', 'Acción verificada');
        n_verif := n_verif + 1;
      ELSE
        IF retardos.encolar_plantilla(c.id, 'alerta_accion', 'alerta', c.folio || ':alerta_accion:' || v_hoy,
             v_rh || coalesce(retardos.cfg('alertas_destinatarios'), '[]'::jsonb), '[]'::jsonb, NULL,
             jsonb_build_object('hallazgo', CASE WHEN v_chec > 0 THEN 'Hay ' || v_chec || ' checadas en los días de suspensión.'
                                                 ELSE 'La suspensión no aparece en Nómina · Incidencias.' END)) IS NOT NULL
        THEN n_alert := n_alert + 1; END IF;
      END IF;
    ELSIF c.accion_desde <= v_hoy + 3 AND NOT v_nom THEN
      IF retardos.encolar_plantilla(c.id, 'alerta_accion', 'alerta', c.folio || ':pre_corte:' || v_hoy,
           v_rh, '[]'::jsonb, NULL,
           jsonb_build_object('hallazgo', 'La suspensión empieza pronto y todavía no está cargada en Nómina · Incidencias.')) IS NOT NULL
      THEN n_alert := n_alert + 1; END IF;
    END IF;
  END LOOP;

  -- Medidas de jornada registradas (sólo con modo_medidas_jornada = habilitadas): ¿llegaron a Nómina?
  -- p.nom_semana = [{employee_id, semana, declaraciones:[{tipo, valores}]}]
  FOR md IN SELECT m.*, k.folio FROM retardos.medida m JOIN retardos.caso k ON k.id = m.caso_id
             WHERE m.estado = 'por_aplicar' AND k.pista = 'real' AND m.decision->>'decision' = 'descuento' LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'nom_semana', '[]'::jsonb)) x,
                             jsonb_array_elements(CASE WHEN jsonb_typeof(x->'declaraciones') = 'array' THEN x->'declaraciones' ELSE '[]'::jsonb END) d
                WHERE (x->>'employee_id')::int = md.employee_id AND d->>'tipo' = v_tdesc
                  AND retardos.semana_de_id(x->>'semana') >= retardos.semana_desde(retardos.a_local(md.decidido_at)::date)) THEN
      UPDATE retardos.medida SET estado = 'verificada', verificada_at = now() WHERE id = md.id;
      PERFORM retardos.log(md.caso_id, 'medida_verificada', 'sistema', 'El descuento aparece en Nómina · Incidencias',
                           jsonb_build_object('medida_id', md.id, 'tipo', v_tdesc));
      n_med_ok := n_med_ok + 1;
    ELSE
      IF retardos.encolar_plantilla(md.caso_id, 'alerta_accion', 'alerta', md.folio || ':medida_nomina:' || v_hoy,
           v_rh, '[]'::jsonb, NULL,
           jsonb_build_object('hallazgo', 'RH registró un descuento de tiempo no laborado que todavía no aparece en Nómina · Incidencias (tipo '
                                          || v_tdesc || '). Cárgalo antes del corte.')) IS NOT NULL
      THEN n_med_alert := n_med_alert + 1; END IF;
    END IF;
  END LOOP;

  v_al := retardos.evaluar_alertas();

  UPDATE retardos.corrida SET terminada_at = now(), ok = true,
         resumen = jsonb_build_object('vencidos', n_venc, 'escalados', n_esc, 'recordatorios_rh', n_rec_rh,
                                      'acciones_verificadas', n_verif, 'alertas', n_alert,
                                      'medidas_verificadas', n_med_ok, 'medidas_alertadas', n_med_alert) || v_al
   WHERE id = v_corrida;
  RETURN (SELECT resumen || jsonb_build_object('corrida_id', id) FROM retardos.corrida WHERE id = v_corrida);
END
$fn$
;

-- evaluar_alertas: las alertas de modo sólo miran la pista real (#386).
CREATE OR REPLACE FUNCTION retardos.evaluar_alertas()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE d jsonb := coalesce(retardos.cfg('alerta_disparadores'), '{}'::jsonb); v_vent integer; v_nuevas integer := 0;
        v_reab integer := 0; r record; v_id bigint; v_real date := nullif(retardos.cfg_txt('real_desde'), '')::date;
        v_hoy date := (now() AT TIME ZONE 'America/Monterrey')::date; v_sem integer; v_base numeric; v_act numeric;
        v_pct numeric; v_activos integer; v_en_acta integer; v_para jsonb; al retardos.alerta_modo;
        v_nivel_acta smallint := (SELECT min(nivel) FROM retardos.escalera WHERE accion = 'acta');
BEGIN
  v_vent := coalesce((d->'individual'->>'ventana_dias')::int, 90);
  v_para := retardos.unicos(retardos.rh_para() || coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb));

  -- Individual 1: nivel de suspensión alcanzado en N meses (consecutivos o no) dentro de la ventana.
  FOR r IN SELECT employee_id, array_agg(DISTINCT periodo ORDER BY periodo) AS ps, max(periodo) AS ult
             FROM retardos.caso WHERE accion = 'suspension' AND pista = 'real' AND estado <> 'CANCELADO_POR_RH'
              AND abierto_at > now() - make_interval(days => v_vent)
            GROUP BY employee_id HAVING count(DISTINCT periodo) >= coalesce((d->'individual'->>'meses_suspension')::int, 2)
  LOOP
    INSERT INTO retardos.alerta_modo (clave, alcance, disparador, employee_id, evidencia)
    VALUES ('suspension_2_meses:' || r.employee_id || ':' || r.ult, 'individual', 'suspension_2_meses', r.employee_id,
            jsonb_build_object('meses', to_jsonb(r.ps)))
    ON CONFLICT (clave) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN v_nuevas := v_nuevas + 1; PERFORM retardos.alerta_notificar(v_id, v_para); END IF;
  END LOOP;

  -- Individual 2: N actas firmadas (validadas, incluida la negativa con testigos) dentro de la ventana.
  FOR r IN SELECT employee_id, max(folio) AS ult, jsonb_agg(folio ORDER BY validado_at) AS folios
             FROM retardos.caso WHERE accion = 'acta' AND pista = 'real' AND validado_at > now() - make_interval(days => v_vent)
            GROUP BY employee_id HAVING count(*) >= coalesce((d->'individual'->>'actas_firmadas')::int, 2)
  LOOP
    INSERT INTO retardos.alerta_modo (clave, alcance, disparador, employee_id, evidencia)
    VALUES ('actas_firmadas:' || r.employee_id || ':' || r.ult, 'individual', 'actas_firmadas', r.employee_id,
            jsonb_build_object('folios', r.folios))
    ON CONFLICT (clave) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN v_nuevas := v_nuevas + 1; PERFORM retardos.alerta_notificar(v_id, v_para); END IF;
  END LOOP;

  -- Individual 3: caso nuevo el mes siguiente al de firmar un acta.
  IF coalesce((d->'individual'->>'reincide_tras_acta')::boolean, true) THEN
    FOR r IN SELECT a.employee_id, a.folio AS acta, min(n.folio) AS nuevo
               FROM retardos.caso a
               JOIN retardos.caso n ON n.employee_id = a.employee_id AND n.pista = 'real' AND n.estado <> 'CANCELADO_POR_RH'
                AND n.periodo = to_char((a.validado_at AT TIME ZONE 'America/Monterrey') + interval '1 month', 'YYYY-MM')
              WHERE a.accion = 'acta' AND a.pista = 'real' AND a.validado_at IS NOT NULL AND a.validado_at > now() - make_interval(days => v_vent + 31)
              GROUP BY a.employee_id, a.folio
    LOOP
      INSERT INTO retardos.alerta_modo (clave, alcance, disparador, employee_id, evidencia)
      VALUES ('reincide_tras_acta:' || r.employee_id || ':' || r.acta, 'individual', 'reincide_tras_acta', r.employee_id,
              jsonb_build_object('acta', r.acta, 'caso_siguiente', r.nuevo))
      ON CONFLICT (clave) DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN v_nuevas := v_nuevas + 1; PERFORM retardos.alerta_notificar(v_id, v_para); END IF;
    END LOOP;
  END IF;

  -- Globales: sólo después de N semanas en modo real.
  v_sem := coalesce((d->'global'->>'semanas_real')::int, 8);
  IF v_real IS NOT NULL AND v_hoy >= v_real + v_sem * 7 THEN
    -- Línea base: retardos por semana en las N semanas previas al paso a real (sombra). Incluye los que no
    -- contaban por la fecha de arranque: en sombra todos eran "antes de contar_desde".
    SELECT count(*)::numeric / v_sem INTO v_base FROM retardos.retardo
     WHERE fecha >= v_real - v_sem * 7 AND fecha < v_real
       AND (estado = 'contado' OR motivo = 'antes_de_contar_desde');
    SELECT count(*)::numeric / v_sem INTO v_act FROM retardos.retardo
     WHERE fecha >= v_hoy - v_sem * 7 AND fecha < v_hoy AND estado = 'contado';
    IF v_base > 0 AND (v_base - v_act) / v_base * 100 < coalesce((d->'global'->>'reduccion_min_pct')::numeric, 30) THEN
      INSERT INTO retardos.alerta_modo (clave, alcance, disparador, evidencia)
      VALUES ('sin_reduccion:' || v_real, 'global', 'sin_reduccion',
              jsonb_build_object('linea_base_semanal', round(v_base, 1), 'actual_semanal', round(v_act, 1),
                                 'reduccion_pct', round((v_base - v_act) / v_base * 100, 1), 'semanas', v_sem))
      ON CONFLICT (clave) DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN v_nuevas := v_nuevas + 1; PERFORM retardos.alerta_notificar(v_id, v_para); END IF;
    END IF;
    SELECT count(*) INTO v_activos FROM retardos.empleado
     WHERE activo AND company_id IN (SELECT (jsonb_array_elements_text(coalesce(retardos.cfg('empresa_ids'), '[1]'::jsonb)))::int);
    SELECT count(DISTINCT employee_id) INTO v_en_acta FROM retardos.caso
     WHERE nivel >= v_nivel_acta AND pista = 'real' AND estado <> 'CANCELADO_POR_RH' AND periodo = to_char(v_hoy, 'YYYY-MM');
    v_pct := CASE WHEN v_activos > 0 THEN 100.0 * v_en_acta / v_activos ELSE 0 END;
    IF v_pct > coalesce((d->'global'->>'pct_plantilla_acta')::numeric, 15) THEN
      INSERT INTO retardos.alerta_modo (clave, alcance, disparador, evidencia)
      VALUES ('plantilla_en_acta:' || to_char(v_hoy, 'YYYY-MM'), 'global', 'plantilla_en_acta',
              jsonb_build_object('personas_en_acta_o_mas', v_en_acta, 'activos', v_activos, 'pct', round(v_pct, 1)))
      ON CONFLICT (clave) DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN v_nuevas := v_nuevas + 1; PERFORM retardos.alerta_notificar(v_id, v_para); END IF;
    END IF;
  END IF;

  -- Pospuestas cuyo plazo venció: vuelven a abrirse y se vuelve a avisar.
  FOR al IN SELECT * FROM retardos.alerta_modo WHERE estado = 'pospuesta' AND posponer_hasta <= v_hoy FOR UPDATE LOOP
    UPDATE retardos.alerta_modo SET estado = 'abierta' WHERE id = al.id;
    PERFORM retardos.log(NULL, 'alerta_modo_reabierta', 'sistema', 'Venció el plazo de la alerta pospuesta',
                         jsonb_build_object('alerta_id', al.id, 'disparador', al.disparador));
    PERFORM retardos.alerta_notificar(al.id, v_para, 'reabierta:' || v_hoy);
    v_reab := v_reab + 1;
  END LOOP;
  RETURN jsonb_build_object('alertas_nuevas', v_nuevas, 'alertas_reabiertas', v_reab);
END
$fn$
;

-- v_reincidencia: semáforo y tendencia sólo con la pista real y desde el inicio de cada persona (#386).
CREATE OR REPLACE VIEW retardos.v_reincidencia AS
 WITH par AS (
         SELECT retardos.hoy_local() AS hoy,
            COALESCE(((retardos.cfg('alerta_disparadores'::text) -> 'individual'::text) ->> 'ventana_dias'::text)::integer, 90) AS ventana
        ), emp AS (
         SELECT e.employee_id,
            e.nombre,
            e.departamento
           FROM retardos.empleado e
          WHERE e.activo AND (e.company_id IN ( SELECT jsonb_array_elements_text(COALESCE(retardos.cfg('empresa_ids'::text), '[1]'::jsonb))::integer AS jsonb_array_elements_text))
        ), cs AS (
         SELECT c.id,
            c.folio,
            c.employee_id,
            c.periodo,
            c.nivel,
            c.accion,
            c.motivo_apertura,
            c.estado,
            c.requiere_firma,
            c.ruta,
            c.vence_at,
            c.recordatorios,
            c.retardos_n,
            c.accion_desde,
            c.accion_hasta,
            c.modo_al_abrir,
            c.validado_at,
            c.validado_por,
            c.abierto_at,
            c.actualizado_at,
            c.cerrado_at,
            c.tipo
           FROM retardos.caso c
          WHERE c.estado <> 'CANCELADO_POR_RH'::text AND c.tipo = 'retardo'::text AND c.pista = 'real'::text
        ), meses AS (
         SELECT cs.employee_id,
            array_agg(DISTINCT cs.periodo ORDER BY cs.periodo DESC) AS ps
           FROM cs
          GROUP BY cs.employee_id
        ), racha AS (
         SELECT m.employee_id,
            ( SELECT count(*) AS count
                   FROM generate_subscripts(m.ps, 1) i(i)
                  WHERE to_date(m.ps[i.i], 'YYYY-MM'::text) = (to_date(m.ps[1], 'YYYY-MM'::text) - make_interval(months => i.i - 1)) AND NOT (EXISTS ( SELECT 1
                           FROM generate_subscripts(m.ps, 1) j(j)
                          WHERE j.j < i.i AND to_date(m.ps[j.j], 'YYYY-MM'::text) <> (to_date(m.ps[1], 'YYYY-MM'::text) - make_interval(months => j.j - 1))))) AS consecutivos,
            cardinality(m.ps) AS meses_con_casos,
            m.ps[1] AS ultimo_mes
           FROM meses m
        ), firm AS (
         SELECT cs.employee_id,
            count(*) FILTER (WHERE cs.accion = 'carta_compromiso'::text AND cs.validado_at > (now() - '90 days'::interval)) AS cartas_90,
            count(*) FILTER (WHERE cs.accion = 'carta_compromiso'::text AND cs.validado_at > (now() - '180 days'::interval)) AS cartas_180,
            count(*) FILTER (WHERE cs.accion = 'acta'::text AND cs.validado_at > (now() - '90 days'::interval)) AS actas_90,
            count(*) FILTER (WHERE cs.accion = 'acta'::text AND cs.validado_at > (now() - '180 days'::interval)) AS actas_180,
            count(*) FILTER (WHERE cs.accion = 'suspension'::text AND cs.estado = 'RETENIDO'::text) AS susp_no_aplicada,
            count(DISTINCT cs.periodo) FILTER (WHERE cs.accion = 'suspension'::text AND cs.abierto_at > (now() - make_interval(days => ( SELECT par.ventana
                   FROM par)))) AS meses_susp_ventana
           FROM cs
          GROUP BY cs.employee_id
        ), tend AS (
         SELECT r.employee_id,
            count(*) FILTER (WHERE r.fecha > ((( SELECT par.hoy
                   FROM par)) - 30)) AS ret_30,
            round(count(*) FILTER (WHERE r.fecha <= ((( SELECT par.hoy
                   FROM par)) - 30) AND r.fecha > ((( SELECT par.hoy
                   FROM par)) - 120))::numeric / 3.0, 1) AS prom_30_previo
           FROM retardos.retardo r
          WHERE r.estado = 'contado'::text AND retardos.inicio_real(r.employee_id) IS NOT NULL
            AND retardos.retardo_instante(r.fecha, r.seg_local, r.hora_local) >= retardos.inicio_real(r.employee_id)
          GROUP BY r.employee_id
        ), base AS (
         SELECT e.employee_id,
            e.nombre,
            e.departamento,
            COALESCE(k.meses_con_casos, 0) AS meses_con_casos,
            COALESCE(k.consecutivos, 0::bigint) AS meses_consecutivos,
            k.ultimo_mes,
            COALESCE(f.cartas_90, 0::bigint) AS cartas_90,
            COALESCE(f.cartas_180, 0::bigint) AS cartas_180,
            COALESCE(f.actas_90, 0::bigint) AS actas_90,
            COALESCE(f.actas_180, 0::bigint) AS actas_180,
            COALESCE(f.susp_no_aplicada, 0::bigint) AS suspension_no_aplicada,
            COALESCE(f.meses_susp_ventana, 0::bigint) AS meses_suspension_ventana,
            COALESCE(t.ret_30, 0::bigint) AS retardos_30d,
            COALESCE(t.prom_30_previo, 0::numeric) AS promedio_30d_previo
           FROM emp e
             LEFT JOIN racha k USING (employee_id)
             LEFT JOIN firm f USING (employee_id)
             LEFT JOIN tend t USING (employee_id)
        )
 SELECT employee_id,
    nombre,
    departamento,
    meses_con_casos,
    meses_consecutivos,
    ultimo_mes,
    cartas_90,
    cartas_180,
    actas_90,
    actas_180,
    suspension_no_aplicada,
    meses_suspension_ventana,
    retardos_30d,
    promedio_30d_previo,
        CASE
            WHEN retardos_30d::numeric > (promedio_30d_previo * 1.2) AND retardos_30d >= 2 THEN 'sube'::text
            WHEN retardos_30d::numeric < (promedio_30d_previo * 0.8) THEN 'baja'::text
            ELSE 'igual'::text
        END AS tendencia,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM retardos.alerta_modo a
              WHERE a.employee_id = b.employee_id AND (a.estado = ANY (ARRAY['abierta'::text, 'pospuesta'::text])))) OR meses_suspension_ventana >= 2 OR actas_90 >= 2 THEN 'rojo'::text
            WHEN actas_180 > 0 OR suspension_no_aplicada > 0 OR meses_consecutivos >= 2 THEN 'amarillo'::text
            ELSE 'verde'::text
        END AS semaforo
   FROM base b;

-- panel_seguro: la misma guardia de casos de RH para jornada_revisar y medida_decidir.
CREATE OR REPLACE FUNCTION retardos.panel_seguro(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $fn$
DECLARE v_acc text := p->>'accion'; r jsonb; v_caso bigint;
BEGIN
  BEGIN
    INSERT INTO retardos.nonce (nonce, actor, accion) VALUES (p->>'nonce', coalesce(p->>'actor', '?'), v_acc);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REPLAY');
  END;
  IF v_acc = 'evidencia' THEN RETURN retardos.panel_evidencia(p); END IF;
  IF v_acc = 'calidad' THEN RETURN retardos.panel_calidad(p); END IF;
  IF v_acc = 'calidad_revisar' THEN RETURN retardos.panel_calidad_revisar(p); END IF;
  IF v_acc = 'hojas' THEN RETURN retardos.panel_hojas(p); END IF;
  IF v_acc = 'hoja_ver' THEN RETURN retardos.panel_hoja_ver(p); END IF;
  IF v_acc = 'reincidencia' THEN RETURN retardos.panel_reincidencia(p); END IF;
  IF v_acc = 'config' THEN RETURN retardos.panel_config(p); END IF;
  IF v_acc = 'jornada' THEN RETURN retardos.panel_jornada(p); END IF;
  IF v_acc = 'medidas' THEN RETURN retardos.panel_medidas(p); END IF;
  IF v_acc = 'jornada_revisar' THEN
    PERFORM retardos.exigir_responsable_rh((p->>'employee_id')::int, p->>'actor');   -- B3 (#386)
    RETURN retardos.jornada_revisar(p);
  END IF;
  IF v_acc = 'medida_decidir' THEN
    PERFORM retardos.exigir_responsable_rh((SELECT employee_id FROM retardos.medida WHERE id = (p->>'medida_id')::bigint), p->>'actor');
    RETURN retardos.medida_decidir(p);
  END IF;
  IF v_acc IN ('festivo_agregar','festivo_quitar') THEN RETURN retardos.panel_festivo(p); END IF;
  IF v_acc IN ('subir_hojas','subir_hoja') THEN
    RETURN retardos.panel_subir_hojas(CASE WHEN v_acc = 'subir_hoja'
      THEN p || jsonb_build_object('archivos', jsonb_build_array(jsonb_build_object('nombre', p->>'nombre', 'mime', p->>'mime',
                                   'contenido_b64', p->>'contenido_b64', 'folio', p->>'folio')))
      ELSE p END);
  END IF;
  IF v_acc IN ('hoja_confirmar','hoja_corregir','hoja_pedir_de_nuevo','hoja_descartar') THEN
    r := retardos.hoja_decidir(p);
    IF v_acc = 'hoja_confirmar' AND coalesce((r->>'ok')::boolean, false) THEN
      SELECT caso_id INTO v_caso FROM retardos.lectura WHERE id = (p->>'lectura_id')::bigint;
      PERFORM retardos.cerrar_jornada_validada(v_caso, p->>'actor');
    END IF;
    RETURN r;
  END IF;
  IF v_acc = 'alerta_atender' THEN RETURN retardos.alerta_atender(p); END IF;
  r := retardos.panel(p);
  IF v_acc = 'validar_firma' AND coalesce((r->>'ok')::boolean, false) THEN
    SELECT id INTO v_caso FROM retardos.caso WHERE folio = p->>'folio';
    PERFORM retardos.cerrar_jornada_validada(v_caso, p->>'actor');
  END IF;
  RETURN r;
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('ok', false, 'error', split_part(SQLERRM, ' ', 1), 'detalle', left(SQLERRM, 200));
END
$fn$
;

-- ══ 5. PANEL: "Conteo desde ..." y marca de caso de RH ══════════════════════
CREATE OR REPLACE FUNCTION retardos.conteo_info() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object(
    'piloto_desde', retardos.cfg_txt('piloto_desde'), 'real_desde', retardos.cfg_txt('real_desde'),
    'jornada_desde', retardos.cfg_txt('jornada_desde'),
    'piloto_habilitado', retardos.cfg_instante('piloto_inicio') IS NOT NULL
                         AND coalesce((retardos.cfg('piloto_habilitado') #>> '{}')::boolean, false),
    'modo', retardos.cfg_txt('modo'), 'acta_retenida', NOT retardos.nivel_habilitado(3::smallint))
$fn$;

CREATE OR REPLACE FUNCTION retardos.caso_datos(p_caso bigint) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT retardos.caso_datos_base(p_caso) || jsonb_build_object(
    'pista', k.pista, 'modo_al_abrir', k.modo_al_abrir, 'jefe_estado', k.jefe_estado,
    'leyenda_jefe', CASE k.jefe_estado WHEN 'sin_jefe' THEN coalesce(retardos.cfg_txt('leyenda_sin_jefe'), 'Falta asignarle jefe en Odoo')
                                       WHEN 'jefe_sin_correo' THEN 'El jefe directo asignado en Odoo no tiene un correo utilizable' END,
    'ppa_minutos', coalesce(retardos.cfg_txt('ppa_minutos')::int, 5),
    'conteo_desde', to_char(retardos.a_local(retardos.inicio_real(k.employee_id)), 'DD/MM/YYYY'),
    'caso_rh', retardos.responsable_rh(k.employee_id) - 'atiende_usuario')
    FROM retardos.caso k WHERE k.id = p_caso
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE r jsonb;
BEGIN
  r := retardos.panel_base(p);
  IF p->>'accion' = 'listar' AND jsonb_typeof(r->'casos') = 'array' THEN
    r := jsonb_set(r, '{casos}', coalesce((
      SELECT jsonb_agg(x || jsonb_build_object('tipo', k.tipo, 'pista', k.pista, 'jefe_estado', k.jefe_estado,
                                               'caso_rh', retardos.responsable_rh(k.employee_id) - 'atiende_usuario') ORDER BY o)
        FROM jsonb_array_elements(r->'casos') WITH ORDINALITY AS t(x, o)
        LEFT JOIN retardos.caso k ON k.folio = x->>'folio'), '[]'::jsonb));
    r := r || jsonb_build_object('piloto', jsonb_build_object(
      'empleados', retardos.cfg('piloto_employee_ids'), 'habilitado', retardos.cfg('piloto_habilitado'),
      'inicio', retardos.cfg('piloto_inicio'), 'modo', retardos.cfg_txt('modo'), 'real_inicio', retardos.cfg('real_inicio')),
      'conteo', retardos.conteo_info());
  END IF;
  RETURN r;
END
$fn$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;
GRANT SELECT ON retardos.v_reincidencia TO retardos_app;
