-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0006 · RH recolecta las firmas, lectura de hojas, correos desde Odoo y
--                 arranque sin suspensiones con alerta documentada (#334, complemento S2)
--
-- 1) RH es la dueña de la recolección. Al abrir un caso que requiere firma, la hoja
--    lista para imprimir va a RH con copia al jefe; al trabajador le llega un aviso
--    informativo con su hoja, que NO le pide contestar. Plazos, recordatorios y
--    escalamientos corren contra RH.
-- 2) Hojas: cualquier archivo (panel, carpeta de OneDrive o correo) entra a
--    retardos.hoja con su sha256 (la misma hoja dos veces no se procesa dos veces).
--    El procesador (servicio retardos-hojas, sin base ni herramientas) devuelve JSON
--    por página; aquí se decide la SUGERENCIA y se liga al caso. RH confirma siempre:
--    ninguna lectura cierra un caso.
-- 3) Correos: resolución por persona desde los campos de Odoo (empresa primero, si no
--    personal, u opción "ambos"), descartando inválidos y compartidos. Cada envío
--    guarda qué correo se usó y de qué campo salió.
-- 4) modo_sanciones = 'sin_suspension': aviso, carta y acta funcionan; el nivel de
--    suspensión queda RETENIDO ("nivel de suspensión alcanzado, no aplicado"). Reemplaza
--    a nivel_maximo_habilitado y suspensiones_habilitadas (0005), que quedan obsoletas.
--    Reincidencia acumulada por persona y alertas "recomendación: activar modo
--    suspensión". La alerta NUNCA cambia el modo.
-- Todo valor nuevo nace confirmado = false. Sin datos personales.
-- Sin llaves dobles ni patrones de reemplazo de JS (retardos_0001 reglas 7 y 8).
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1. CONFIGURACIÓN ═════════════════════════════════════════════════════════
INSERT INTO retardos.config (clave, valor, descripcion) VALUES
 ('modo_sanciones', '"sin_suspension"'::jsonb,
  'sin_suspension: aviso, carta compromiso y acta funcionan; el nivel de suspensión no se notifica ni se emite hoja y el caso queda como "nivel de suspensión alcanzado, no aplicado". con_suspension: se emite el citatorio. El cambio lo deciden Esteban, RH y Legal con el checklist de docs/retardos/MODO_SUSPENSION.md; el sistema nunca lo cambia solo.'),
 ('dias_recoleccion_rh', '3'::jsonb,
  'Días hábiles que tiene RH para recolectar la firma (o la negativa con testigos) y subir la hoja, contados desde que se le manda la hoja.'),
 ('correo_modo', '"preferente"'::jsonb,
  'preferente: correo de empresa; si no hay, el personal. ambos: si la persona tiene los dos, se manda a los dos.'),
 ('correo_dominios_empresa', '["fts.mx"]'::jsonb,
  'Dominios que cuentan como correo de empresa.'),
 ('correos_genericos', '["ventas","info","admin","contacto","facturacion","compras","rh","recursoshumanos","nomina","soporte","sales","noreply","no-reply"]'::jsonb,
  'Parte local de buzones genéricos: nunca se usan como correo de una persona.'),
 ('firmas_requeridas', '{"carta_compromiso":["trabajador","rh"],"acta":["trabajador","rh","testigo1","testigo2"],"suspension":["trabajador","rh","testigo1","testigo2"],"negativa":["rh","testigo1","testigo2"]}'::jsonb,
  'Firmas que deben aparecer en la hoja para sugerir "lista para validar". La negativa sustituye la firma del trabajador por dos testigos.'),
 ('alerta_disparadores', '{"individual":{"ventana_dias":90,"meses_suspension":2,"actas_firmadas":2,"reincide_tras_acta":true},"global":{"semanas_real":8,"reduccion_min_pct":30,"pct_plantilla_acta":15}}'::jsonb,
  'Disparadores de la alerta "Recomendación: activar modo suspensión". Individual: nivel de suspensión alcanzado en N meses dentro de la ventana, N actas firmadas en la ventana, o reincidencia el mes siguiente a firmar un acta. Global (sólo después de N semanas en real): los retardos semanales no bajaron el porcentaje mínimo contra la línea base de sombra, o más del porcentaje de la plantilla activa está en acta o más.'),
 ('real_desde', 'null'::jsonb,
  'Fecha en que se pasó a modo real. La llena el paso a real (PASO_A_REAL.md). Mientras sea null no se evalúan los disparadores globales.'),
 ('hojas_carpeta', 'null'::jsonb,
  'Carpeta de OneDrive o SharePoint donde RH deja hojas escaneadas: {"drive_id":"…","folder_id":"…"}. null = no se barre ninguna carpeta. Lo procesado se mueve a la subcarpeta "procesados".'),
 ('hojas_horas_alerta', '6'::jsonb,
  'Horas que una hoja puede esperar sin procesarse antes de que el latido alerte.'),
 ('hojas_errores_alerta', '3'::jsonb,
  'Errores del procesador en 24 horas que disparan alerta.'),
 ('modo_suspension_desde', 'null'::jsonb,
  'Fecha en que se activó con_suspension. Regla de no retroactividad: ninguna suspensión se aplica por retardos anteriores a esta fecha. La llena el SQL de MODO_SUSPENSION.md.'),
 ('antecedentes_previos_cuentan', 'false'::jsonb,
  'Si las actas y cartas firmadas ANTES de activar con_suspension cuentan como antecedente para una suspensión por reincidencia. Lo define Legal (checklist de MODO_SUSPENSION.md).')
ON CONFLICT (clave) DO NOTHING;

UPDATE retardos.config
   SET descripcion = 'OBSOLETA desde retardos_0006: ya no se lee. La reemplaza modo_sanciones. Se conserva sin borrar por la regla de no borrar.'
 WHERE clave IN ('nivel_maximo_habilitado', 'suspensiones_habilitadas');

-- En sin_suspension sólo la suspensión queda retenida.
CREATE OR REPLACE FUNCTION retardos.nivel_habilitado(p_nivel smallint) RETURNS boolean
LANGUAGE sql STABLE AS $fn$
  SELECT coalesce((SELECT accion FROM retardos.escalera WHERE nivel = p_nivel), '') <> 'suspension'
      OR coalesce(retardos.cfg_txt('modo_sanciones'), 'sin_suspension') = 'con_suspension'
$fn$;

-- RH sin buzón configurado: la hoja nunca se pierde, cae a escalamiento_cc.
CREATE OR REPLACE FUNCTION retardos.rh_para() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN jsonb_array_length(coalesce(retardos.cfg('rh_destinatarios'), '[]'::jsonb)) > 0
              THEN retardos.cfg('rh_destinatarios')
              ELSE coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb) END
$fn$;

CREATE OR REPLACE FUNCTION retardos.unicos(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(jsonb_agg(x ORDER BY o), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (lower(x)) x, o FROM jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) WITH ORDINALITY AS t(x, o)
           ORDER BY lower(x), o) s
$fn$;

-- Regla de no retroactividad del modo suspensión. true = el caso de suspensión puede notificarse.
CREATE OR REPLACE FUNCTION retardos.suspension_aplicable(p_emp integer, p_periodo text, p_nivel smallint, p_motivo text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_desde date := nullif(retardos.cfg_txt('modo_suspension_desde'), '')::date; v_umbral integer; n integer;
BEGIN
  IF v_desde IS NULL THEN RETURN true; END IF;
  SELECT count(*) INTO n FROM retardos.retardo
   WHERE employee_id = p_emp AND periodo = p_periodo AND estado = 'contado' AND fecha >= v_desde;
  IF p_motivo = 'umbral' THEN
    SELECT umbral INTO v_umbral FROM retardos.escalera WHERE nivel = p_nivel;
    RETURN n >= v_umbral;
  END IF;
  -- reincidencia: el retardo nuevo tiene que ser posterior a la activación y, si Legal no lo
  -- autoriza, el antecedente firmado también.
  IF n = 0 THEN RETURN false; END IF;
  IF coalesce(retardos.cfg_txt('antecedentes_previos_cuentan'), 'false') = 'true' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM retardos.caso WHERE employee_id = p_emp AND nivel < p_nivel AND requiere_firma
                   AND validado_at >= v_desde::timestamp AT TIME ZONE 'America/Monterrey');
END
$fn$;

-- ══ 2. CORREOS DESDE ODOO ════════════════════════════════════════════════════
ALTER TABLE retardos.empleado ADD COLUMN IF NOT EXISTS correos jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN retardos.empleado.correos IS 'Correos de la persona tal como vienen de Odoo: [{campo, email}]. La resolución vive en retardos.correos_de() y retardos.destinatarios().';

ALTER TABLE retardos.envio ADD COLUMN IF NOT EXISTS destinatarios_origen jsonb;
COMMENT ON COLUMN retardos.envio.destinatarios_origen IS 'Qué correo de la persona se usó y de qué campo de Odoo salió: [{email, campo, tipo}].';

ALTER TABLE retardos.envio DROP CONSTRAINT IF EXISTS envio_tipo_check;
ALTER TABLE retardos.envio ADD CONSTRAINT envio_tipo_check CHECK (tipo IN (
  'notificacion','recordatorio','escalamiento','pide_hoja','aviso_rh','revision_rh','ruta_supervisor',
  'resumen','alerta','odoo_nota','aviso_trabajador','alerta_modo'));

-- Todos los correos conocidos de una persona, clasificados.
CREATE OR REPLACE FUNCTION retardos.correos_de(p_emp integer) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH m AS (
    SELECT e.employee_id, e.correos, e.email FROM retardos.empleado e WHERE e.employee_id = p_emp
  ), crudo AS (
    SELECT lower(trim(x->>'email')) AS email, x->>'campo' AS campo, o.ord
      FROM m, jsonb_array_elements(m.correos) WITH ORDINALITY AS o(x, ord)
     WHERE coalesce(trim(x->>'email'), '') <> ''
    UNION ALL
    SELECT lower(trim(m.email)), 'work_email', 0 FROM m
     WHERE coalesce(trim(m.email), '') <> '' AND jsonb_array_length(m.correos) = 0
  ), uno AS (
    SELECT DISTINCT ON (email) email, campo, ord FROM crudo ORDER BY email, ord
  ), uso AS (
    -- Cuántas personas activas usan el mismo correo. Quien todavía no trae la lista de correos
    -- (alta en esta misma corrida) cuenta por su correo de la ficha.
    SELECT email, count(DISTINCT employee_id) AS n FROM (
      SELECT e.employee_id, lower(trim(x->>'email')) AS email
        FROM retardos.empleado e, jsonb_array_elements(e.correos) x WHERE e.activo
      UNION ALL
      SELECT e.employee_id, lower(trim(e.email)) FROM retardos.empleado e
       WHERE e.activo AND jsonb_array_length(e.correos) = 0 AND coalesce(trim(e.email), '') <> '') z
     GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'email', u.email, 'campo', u.campo,
           'tipo', CASE WHEN split_part(u.email, '@', 2) IN (SELECT jsonb_array_elements_text(retardos.cfg('correo_dominios_empresa')))
                        THEN 'empresa' ELSE 'personal' END,
           'usable', retardos.email_valido(u.email)
                     AND split_part(u.email, '@', 1) NOT IN (SELECT jsonb_array_elements_text(retardos.cfg('correos_genericos')))
                     AND coalesce(s.n, 1) <= 1,
           'motivo', CASE WHEN NOT retardos.email_valido(u.email) THEN 'invalido'
                          WHEN split_part(u.email, '@', 1) IN (SELECT jsonb_array_elements_text(retardos.cfg('correos_genericos'))) THEN 'generico'
                          WHEN coalesce(s.n, 1) > 1 THEN 'compartido'
                          ELSE 'ok' END) ORDER BY u.ord), '[]'::jsonb)
    FROM uno u LEFT JOIN uso s USING (email)
$fn$;

-- A quién se le escribe a la persona. [] = a nadie (la hoja va sólo a RH y al jefe).
CREATE OR REPLACE FUNCTION retardos.destinatarios(p_emp integer) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH c AS (SELECT x FROM jsonb_array_elements(retardos.correos_de(p_emp)) x WHERE (x->>'usable')::boolean),
       emp AS (SELECT x FROM c WHERE x->>'tipo' = 'empresa' LIMIT 1),
       per AS (SELECT x FROM c WHERE x->>'tipo' = 'personal' LIMIT 1)
  SELECT CASE
    WHEN coalesce(retardos.cfg_txt('correo_modo'), 'preferente') = 'ambos'
      THEN coalesce((SELECT jsonb_agg(x) FROM (SELECT x FROM emp UNION ALL SELECT x FROM per) z), '[]'::jsonb)
    WHEN EXISTS (SELECT 1 FROM emp) THEN (SELECT jsonb_build_array(x) FROM emp)
    WHEN EXISTS (SELECT 1 FROM per) THEN (SELECT jsonb_build_array(x) FROM per)
    ELSE '[]'::jsonb END
$fn$;

CREATE OR REPLACE FUNCTION retardos.solo_emails(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(jsonb_agg(x->>'email'), '[]'::jsonb) FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
$fn$;

-- La ingesta de 0002 queda como base; la nueva sincroniza los correos antes y después
-- (antes: para que los casos que se abran en la misma corrida ya los tengan; después:
-- para las personas que la base dio de alta en esta corrida).
DO $ren$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'retardos' AND p.proname = 'ingestar_base') THEN
    ALTER FUNCTION retardos.ingestar(jsonb) RENAME TO ingestar_base;
  END IF;
END
$ren$;

CREATE OR REPLACE FUNCTION retardos.sincronizar_correos(p jsonb) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
  UPDATE retardos.empleado t SET correos = x.correos
    FROM (SELECT (e->>'employee_id')::int AS emp, coalesce(e->'correos', '[]'::jsonb) AS correos
            FROM jsonb_array_elements(coalesce(p->'empleados', '[]'::jsonb)) e
           WHERE e ? 'correos') x
   WHERE t.employee_id = x.emp AND t.correos IS DISTINCT FROM x.correos;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.ingestar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE r jsonb; n integer;
BEGIN
  PERFORM retardos.sincronizar_correos(p);
  r := retardos.ingestar_base(p);
  n := retardos.sincronizar_correos(p);
  RETURN r || jsonb_build_object('correos_actualizados_al_final', n);
END
$fn$;

-- ══ 3. PLANTILLAS NUEVAS (sin guiones largos) ════════════════════════════════
INSERT INTO retardos.plantilla (clave, asunto, cuerpo_html) VALUES
('rh_recolectar', '[[[folio]]] Recolectar firma: [[nombre_nivel]] de [[nombre]]',
 '<p>Hola:</p><p>Se abrió el folio <b>[[folio]]</b>: <b>[[nombre_nivel]]</b> para <b>[[nombre]]</b> ([[puesto]], [[departamento]]), periodo [[periodo]], con [[retardos_n]] retardos:</p>[[detalle]]<p>Adjuntamos la hoja lista para imprimir. Por favor:</p><ol><li>Cita a la persona y explícale el documento.</li><li>Pídele que lo firme. Si quiere dejar comentarios, que los escriba en el recuadro.</li><li>Si se niega a firmar, marca la casilla "Se negó a firmar" y recaba la firma de dos testigos.</li><li>Sube la hoja al panel de Retardos o déjala escaneada en la carpeta de hojas.</li></ol><p>Plazo para subir la hoja: <b>[[vence_rh]]</b>. Correo a la persona: [[correo_trabajador]].</p><p>Con copia al jefe directo.</p>'),
('aviso_trabajador', '[[[folio]]] [[nombre_nivel]]: Recursos Humanos te va a citar',
 '<p>Hola [[nombre]]:</p><p>En el periodo [[periodo]] el control de asistencia registró [[retardos_n]] retardos:</p>[[detalle]]<p>Por esto se emitió una <b>[[nombre_nivel]]</b>, que te adjuntamos para que la conozcas. <b>No necesitas contestar este correo.</b> Recursos Humanos te va a citar para revisarla contigo y firmarla. En la hoja hay un espacio para que escribas tu versión: tienes derecho a ser escuchado.</p><p>Si alguno de estos días tenías permiso, estabas en campo o hubo un error en la checada, díselo a Recursos Humanos cuando te cite.</p><p>Recursos Humanos<br>SERVICIOS FTS SA DE CV</p>'),
('recordatorio_rh_recolectar', 'Recordatorio: [[[folio]]] firma pendiente de recolectar',
 '<p>Venció el plazo para subir la hoja firmada del folio <b>[[folio]]</b> ([[nombre_nivel]] de [[nombre]], periodo [[periodo]]).</p><p>Nuevo plazo: <b>[[vence_rh]]</b>. Si la persona se niega a firmar, registra la negativa con dos testigos en la hoja y súbela al panel.</p><p>Con copia al jefe directo.</p>'),
('escalamiento_rh', 'Escalamiento: [[[folio]]] sin hoja después del recordatorio',
 '<p>El folio <b>[[folio]]</b> ([[nombre_nivel]] de [[nombre]], periodo [[periodo]]) venció dos veces sin que se subiera la hoja firmada o la negativa con testigos.</p>[[detalle]]<p>Se escala a Dirección para que se defina con Recursos Humanos cómo se atiende.</p>'),
('hoja_por_confirmar', 'Hoja por confirmar: [[[folio]]] [[nombre]]',
 '<p>Llegó una hoja del folio <b>[[folio]]</b> ([[nombre_nivel]] de [[nombre]]).</p><p>Sugerencia del lector: <b>[[sugerencia]]</b>.</p><p>La sugerencia es sólo una ayuda. Revísala y confírmala en el panel de Retardos, en "Hojas por confirmar".</p>'),
('alerta_modo', 'Recomendación: activar modo suspensión ([[disparador]])',
 '<p>El sistema de retardos cumplió un disparador de la alerta <b>"Recomendación: activar modo suspensión"</b>.</p><p><b>Disparador:</b> [[disparador_texto]]</p>[[evidencia_html]]<p><b>Recomendación:</b> revisar con Recursos Humanos y Legal si se cambia a modo suspensión, siguiendo el checklist de docs/retardos/MODO_SUSPENSION.md. El sistema <b>no cambia el modo solo</b>: sigue en [[modo_sanciones]] hasta que Esteban lo decida.</p><p>Atiende la alerta en el panel de Retardos (sección Reincidencia acumulada): cambiar a modo suspensión, posponer o descartar con motivo. Mientras no se atienda, se repite en el resumen semanal.</p>')
ON CONFLICT (clave) DO UPDATE SET asunto = EXCLUDED.asunto, cuerpo_html = EXCLUDED.cuerpo_html,
  actualizado_por = 'retardos_0006', actualizado_at = now();

-- ══ 4. APERTURA DE CASO: RH recolecta ════════════════════════════════════════
CREATE OR REPLACE FUNCTION retardos.jefe_de(p_emp integer) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT retardos.solo_emails(retardos.destinatarios(m.parent_id))
    FROM retardos.empleado m WHERE m.employee_id = p_emp AND m.parent_id IS NOT NULL AND m.parent_id <> p_emp
$fn$;

CREATE OR REPLACE FUNCTION retardos.abrir_caso(p_emp integer, p_periodo text, p_nivel smallint, p_motivo text,
                                               p_corrida bigint)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE e retardos.escalera; v_id bigint; v_folio text; n integer;
        v_rh jsonb := retardos.rh_para(); v_jefe jsonb; v_dest jsonb; v_env bigint; v_pdf text;
BEGIN
  SELECT * INTO e FROM retardos.escalera WHERE nivel = p_nivel;
  SELECT count(*) INTO n FROM retardos.retardo WHERE employee_id = p_emp AND periodo = p_periodo AND estado = 'contado';
  v_folio := retardos.nuevo_folio(current_date);
  INSERT INTO retardos.caso (folio, employee_id, periodo, nivel, accion, motivo_apertura, estado, requiere_firma,
                             retardos_n, modo_al_abrir)
  VALUES (v_folio, p_emp, p_periodo, p_nivel, e.accion, p_motivo, 'DETECTADO', e.requiere_firma, n,
          retardos.cfg_txt('modo'))
  ON CONFLICT (employee_id, periodo, nivel) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO retardos.caso_retardo (caso_id, retardo_id)
  SELECT v_id, r.id FROM retardos.retardo r
   WHERE r.employee_id = p_emp AND r.periodo = p_periodo AND r.estado = 'contado'
  ON CONFLICT DO NOTHING;

  PERFORM retardos.log(v_id, 'apertura', 'sistema',
    'Nivel ' || p_nivel || ' (' || e.accion || ') por ' || p_motivo || ' con ' || n || ' retardos en ' || p_periodo,
    jsonb_build_object('corrida_id', p_corrida, 'retardos_n', n), NULL, 'DETECTADO');

  -- Modo sin suspensión: se registra como antecedente y no se escribe a nadie.
  IF NOT retardos.nivel_habilitado(p_nivel) THEN
    PERFORM retardos.transicionar(v_id, 'RETENIDO', 'sistema',
      'Nivel de suspensión alcanzado, no aplicado (modo sin suspensión). Cuenta como antecedente.',
      jsonb_build_object('modo_sanciones', retardos.cfg('modo_sanciones')));
    RETURN v_id;
  END IF;
  -- Modo con suspensión recién activado: nada retroactivo.
  IF e.accion = 'suspension' AND NOT retardos.suspension_aplicable(p_emp, p_periodo, p_nivel, p_motivo) THEN
    PERFORM retardos.transicionar(v_id, 'RETENIDO', 'sistema',
      'Nivel de suspensión alcanzado, no aplicado: los retardos o el antecedente son anteriores a la activación del modo suspensión (regla de no retroactividad).',
      jsonb_build_object('modo_suspension_desde', retardos.cfg('modo_suspension_desde')));
    RETURN v_id;
  END IF;

  v_jefe := coalesce(retardos.jefe_de(p_emp), '[]'::jsonb);
  v_dest := retardos.destinatarios(p_emp);
  v_pdf := CASE WHEN e.accion = 'aviso' THEN NULL ELSE e.accion END;
  IF jsonb_array_length(v_dest) = 0 THEN
    UPDATE retardos.caso SET ruta = 'supervisor' WHERE id = v_id;
    PERFORM retardos.log(v_id, 'sin_correo', 'sistema', 'La persona no tiene correo utilizable: la hoja va sólo a RH y al jefe',
                         jsonb_build_object('correos', retardos.correos_de(p_emp)));
  END IF;

  IF e.accion = 'aviso' THEN
    -- Aviso informativo: no requiere firma. Va a la persona (o, sin correo, a su jefe y RH).
    IF jsonb_array_length(v_dest) > 0 THEN
      v_env := retardos.encolar_plantilla(v_id, 'notificacion_aviso', 'notificacion', v_folio || ':notificacion',
                                          retardos.solo_emails(v_dest), v_rh || v_jefe, NULL);
      UPDATE retardos.envio SET destinatarios_origen = v_dest WHERE id = v_env;
    ELSE
      PERFORM retardos.encolar_plantilla(v_id, 'ruta_supervisor', 'ruta_supervisor', v_folio || ':ruta_supervisor',
        CASE WHEN jsonb_array_length(v_jefe) > 0 THEN v_jefe ELSE v_rh END, v_rh, NULL);
    END IF;
    RETURN v_id;
  END IF;

  -- Requiere firma: la hoja lista para imprimir va a RH con copia al jefe.
  PERFORM retardos.encolar_plantilla(v_id, 'rh_recolectar', 'notificacion', v_folio || ':notificacion',
    v_rh, v_jefe, v_pdf,
    jsonb_build_object('vence_rh', to_char(retardos.sumar_habiles(now(), coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3))
                                           AT TIME ZONE 'America/Monterrey', 'DD/MM/YYYY'),
                       'correo_trabajador', coalesce((SELECT string_agg(x->>'email', ', ') FROM jsonb_array_elements(v_dest) x),
                                                     'sin correo utilizable (entrega sólo en persona)')));
  -- Aviso informativo al trabajador con su hoja: no se le pide contestar.
  IF jsonb_array_length(v_dest) > 0 THEN
    v_env := retardos.encolar_plantilla(v_id, 'aviso_trabajador', 'aviso_trabajador', v_folio || ':aviso_trabajador',
                                        retardos.solo_emails(v_dest), '[]'::jsonb, v_pdf);
    UPDATE retardos.envio SET destinatarios_origen = v_dest WHERE id = v_env;
  END IF;
  RETURN v_id;
END
$fn$;

-- Al salir el correo a RH, el caso queda esperando que RH suba la hoja.
CREATE OR REPLACE FUNCTION retardos.marcar_envio(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE e retardos.envio; c retardos.caso; v_ok boolean := coalesce((p->>'ok')::boolean, false);
        v_plazo integer := coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3);
BEGIN
  SELECT * INTO e FROM retardos.envio WHERE id = (p->>'id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ENVIO_INEXISTENTE'); END IF;
  IF e.estado = 'enviado' THEN RETURN jsonb_build_object('ok', true, 'ya_enviado', true); END IF;
  IF NOT v_ok THEN
    UPDATE retardos.envio SET estado = 'fallido', intentos = intentos + 1, error = left(coalesce(p->>'error', 'desconocido'), 500)
     WHERE id = e.id;
    RETURN jsonb_build_object('ok', true, 'estado', 'fallido');
  END IF;
  UPDATE retardos.envio SET estado = 'enviado', intentos = intentos + 1, enviado_at = now(), error = NULL,
         modo_envio = p->>'modo', para_efectivo = p->'para_efectivo'
   WHERE id = e.id;
  IF e.caso_id IS NOT NULL AND e.tipo IN ('notificacion','ruta_supervisor') THEN
    SELECT * INTO c FROM retardos.caso WHERE id = e.caso_id;
    IF c.estado = 'DETECTADO' THEN
      PERFORM retardos.transicionar(c.id, 'NOTIFICADO', 'sistema', 'Correo enviado (' || coalesce(p->>'modo', '?') || ')',
                                    jsonb_build_object('envio_id', e.id));
      IF c.requiere_firma THEN
        PERFORM retardos.transicionar(c.id, 'ESPERANDO_FIRMA', 'sistema',
          'RH recolecta la firma: plazo de ' || v_plazo || ' días hábiles');
        UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), v_plazo) WHERE id = c.id;
      ELSE
        PERFORM retardos.transicionar(c.id, 'CERRADO', 'sistema', 'Aviso informativo: no requiere firma');
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'estado', 'enviado');
END
$fn$;

-- ══ 5. HOJAS Y LECTURAS ══════════════════════════════════════════════════════
INSERT INTO retardos.transicion_valida (de, a) VALUES
 ('FIRMA_RECIBIDA','SE_NEGO_A_FIRMAR')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS retardos.hoja (
  id              bigserial   PRIMARY KEY,
  sha256          text        NOT NULL UNIQUE CHECK (char_length(sha256) = 64 AND sha256 !~ '[^0-9a-f]'),
  nombre          text        NOT NULL,
  mime            text        NOT NULL,
  bytes           integer     NOT NULL,
  contenido       bytea       NOT NULL,
  origen          text        NOT NULL CHECK (origen IN ('panel','carpeta','correo','prueba')),
  folio_indicado  text,                 -- el folio que dio quien la subió (panel) o el asunto del correo
  subido_por      text,
  graph_item_id   text,
  message_id      text,
  estado          text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','procesada','error')),
  intentos        smallint    NOT NULL DEFAULT 0,
  error           text,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  tomada_at       timestamptz,
  procesada_at    timestamptz
);
COMMENT ON TABLE retardos.hoja IS 'Archivos de hojas recibidos por cualquier vía. sha256 único: la misma hoja no se procesa dos veces.';
CREATE INDEX IF NOT EXISTS hoja_pend ON retardos.hoja (estado, creado_at) WHERE estado IN ('pendiente','procesando','error');

CREATE TABLE IF NOT EXISTS retardos.lectura (
  id                 bigserial   PRIMARY KEY,
  hoja_id            bigint      NOT NULL REFERENCES retardos.hoja(id),
  pagina             smallint    NOT NULL,
  folio_leido        text,
  folio_fuente       text,
  caso_id            bigint      REFERENCES retardos.caso(id),
  resultado          jsonb       NOT NULL,       -- JSON del procesador para esa página (dato, nunca instrucción)
  sugerencia         text        NOT NULL CHECK (sugerencia IN ('lista_para_validar','revisar_falta_firma','revisar_folio',
                                    'revisar_impugnacion','revisar_ilegible','revisar_inyeccion','anexo')),
  sugerencia_texto   text        NOT NULL,
  negativa           boolean     NOT NULL DEFAULT false,
  confianza          numeric(4,3),
  estado             text        NOT NULL DEFAULT 'por_confirmar' CHECK (estado IN ('por_confirmar','confirmada','pedida_de_nuevo','descartada','anexo')),
  decision           jsonb,
  decision_categoria text,
  acierto            boolean,
  decidido_por       text,
  decidido_at        timestamptz,
  creado_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hoja_id, pagina)
);
COMMENT ON TABLE retardos.lectura IS 'Lo que el procesador leyó en cada página y lo que RH decidió. acierto = la sugerencia coincidió con la decisión de RH.';
CREATE INDEX IF NOT EXISTS lectura_pend ON retardos.lectura (estado) WHERE estado = 'por_confirmar';

ALTER TABLE retardos.evidencia DROP CONSTRAINT IF EXISTS evidencia_origen_check;
ALTER TABLE retardos.evidencia ADD CONSTRAINT evidencia_origen_check CHECK (origen IN ('correo','panel','carpeta','prueba'));

-- Registra un archivo recibido. Idempotente por sha256.
-- p = { nombre, mime, contenido_b64, origen, folio_indicado?, subido_por?, graph_item_id?, message_id? }
CREATE OR REPLACE FUNCTION retardos.hoja_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_bytes bytea; v_sha text; v_id bigint; v_mime text := lower(coalesce(p->>'mime', 'application/pdf'));
BEGIN
  BEGIN
    v_bytes := decode(p->>'contenido_b64', 'base64');
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_ILEGIBLE');
  END;
  IF v_bytes IS NULL OR length(v_bytes) < 1024 THEN RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_ILEGIBLE'); END IF;
  IF length(v_bytes) > 15000000 THEN RETURN jsonb_build_object('ok', false, 'error', 'ARCHIVO_DEMASIADO_GRANDE'); END IF;
  IF v_mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp','image/tiff','image/heic','image/heif') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TIPO_NO_ACEPTADO');
  END IF;
  v_sha := encode(sha256(v_bytes), 'hex');
  SELECT id INTO v_id FROM retardos.hoja WHERE sha256 = v_sha;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'hoja_id', v_id, 'duplicada', true, 'sha256', v_sha); END IF;
  INSERT INTO retardos.hoja (sha256, nombre, mime, bytes, contenido, origen, folio_indicado, subido_por, graph_item_id, message_id)
  VALUES (v_sha, left(coalesce(p->>'nombre', 'hoja'), 200), v_mime, length(v_bytes), v_bytes,
          coalesce(p->>'origen', 'panel'), substring(coalesce(p->>'folio_indicado', '') FROM 'RET-[0-9]{4}-[0-9]{4}'),
          p->>'subido_por', p->>'graph_item_id', p->>'message_id')
  ON CONFLICT (sha256) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM retardos.hoja WHERE sha256 = v_sha;
    RETURN jsonb_build_object('ok', true, 'hoja_id', v_id, 'duplicada', true, 'sha256', v_sha);
  END IF;
  PERFORM retardos.log(NULL, 'hoja_recibida', coalesce(p->>'subido_por', p->>'origen', 'sistema'), 'Hoja recibida por ' || coalesce(p->>'origen', 'panel'),
                       jsonb_build_object('hoja_id', v_id, 'sha256', v_sha, 'bytes', length(v_bytes)));
  RETURN jsonb_build_object('ok', true, 'hoja_id', v_id, 'duplicada', false, 'sha256', v_sha);
END
$fn$;

-- Toma hojas pendientes para mandarlas al procesador (workflow retardos/hojas).
-- Una hoja 'procesando' de hace más de 30 min se considera abandonada y se reintenta.
CREATE OR REPLACE FUNCTION retardos.hojas_pendientes(p_limite integer DEFAULT 5) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_out jsonb := '[]'::jsonb; h retardos.hoja;
BEGIN
  FOR h IN SELECT * FROM retardos.hoja
            WHERE (estado = 'pendiente' OR (estado = 'error' AND intentos < 3)
                   OR (estado = 'procesando' AND tomada_at < now() - interval '30 minutes'))
            ORDER BY id LIMIT p_limite FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE retardos.hoja SET estado = 'procesando', tomada_at = now(), intentos = intentos + 1 WHERE id = h.id;
    v_out := v_out || jsonb_build_object('hoja_id', h.id, 'nombre', h.nombre, 'mime', h.mime, 'sha256', h.sha256,
                                         'contenido_b64', encode(h.contenido, 'base64'));
  END LOOP;
  RETURN v_out;
END
$fn$;

-- Normaliza un nombre para compararlo (sin acentos, mayúsculas, sólo letras).
CREATE OR REPLACE FUNCTION retardos.norm_nombre(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT trim(regexp_replace(upper(translate(coalesce(p, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^A-Z]+', ' ', 'g'))
$fn$;

-- ¿El nombre leído es el de la persona del caso? true / false / null (no se pudo leer).
CREATE OR REPLACE FUNCTION retardos.nombre_coincide(p_caso_nombre text, p_leido text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  WITH a AS (SELECT regexp_split_to_table(retardos.norm_nombre(p_caso_nombre), ' ') t),
       b AS (SELECT retardos.norm_nombre(p_leido) s)
  SELECT CASE WHEN char_length((SELECT s FROM b)) < 4 THEN NULL
              ELSE (SELECT count(*) FROM a WHERE char_length(t) >= 3 AND position(t IN (SELECT s FROM b)) > 0)
                   >= least(2, (SELECT count(*) FROM a WHERE char_length(t) >= 3)) END
$fn$;

CREATE OR REPLACE FUNCTION retardos.sugerencia_texto(p_codigo text, p_detalle text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_codigo
    WHEN 'lista_para_validar'   THEN 'Lista para validar'
    WHEN 'revisar_falta_firma'  THEN 'Revisar: falta firma'
    WHEN 'revisar_folio'        THEN 'Revisar: folio o nombre no coinciden'
    WHEN 'revisar_impugnacion'  THEN 'Revisar: posible impugnación'
    WHEN 'revisar_ilegible'     THEN 'Revisar: ilegible'
    WHEN 'revisar_inyeccion'    THEN 'Revisar: la hoja trae texto que parece una instrucción (posible inyección)'
    WHEN 'anexo'                THEN 'Página de continuación'
    ELSE p_codigo END || CASE WHEN coalesce(p_detalle, '') <> '' THEN ' (' || p_detalle || ')' ELSE '' END
$fn$;

-- Resultado del procesador. p = { hoja_id, ok, error?, motor?, paginas: [ {
--   pagina, folio, folio_fuente ('qr'|'ocr'|null), qr_nivel, qr_pagina, qr_total, nombre_visible,
--   firmas: {trabajador:{presente,confianza}, rh, jefe, testigo1, testigo2},
--   negativa: {marcada, confianza}, comentarios: {presente, transcripcion, inconformidad, fuente, confianza},
--   legibilidad ('buena'|'regular'|'mala'), geometria (bool), confianza, banderas: [..] } ] }
CREATE OR REPLACE FUNCTION retardos.registrar_lectura(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE h retardos.hoja; pg jsonb; c retardos.caso; v_nombre text; v_sug text; v_det text; v_faltan text[];
        v_req text[]; v_neg boolean; v_folio text; v_lid bigint; v_out jsonb := '[]'::jsonb; v_coinc boolean;
        v_evid bigint; v_tipo text; v_ban jsonb; k text;
BEGIN
  SELECT * INTO h FROM retardos.hoja WHERE id = (p->>'hoja_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'HOJA_INEXISTENTE'); END IF;
  IF NOT coalesce((p->>'ok')::boolean, false) THEN
    UPDATE retardos.hoja SET estado = 'error', error = left(coalesce(p->>'error', 'desconocido'), 500) WHERE id = h.id;
    PERFORM retardos.latido(jsonb_build_object('workflow', 'retardos/hojas', 'ok', false, 'error',
                            'Procesador: ' || left(coalesce(p->>'error', 'desconocido'), 200)));
    RETURN jsonb_build_object('ok', true, 'estado', 'error');
  END IF;

  FOR pg IN SELECT * FROM jsonb_array_elements(coalesce(p->'paginas', '[]'::jsonb)) LOOP
    c := NULL; v_sug := NULL; v_det := NULL; v_faltan := '{}'; v_evid := NULL;
    v_ban := coalesce(pg->'banderas', '[]'::jsonb);
    v_folio := coalesce(substring(coalesce(pg->>'folio', '') FROM 'RET-[0-9]{4}-[0-9]{4}'),
                        CASE WHEN jsonb_array_length(coalesce(p->'paginas', '[]'::jsonb)) = 1 THEN h.folio_indicado END);
    IF v_folio IS NOT NULL THEN SELECT * INTO c FROM retardos.caso WHERE folio = v_folio; END IF;
    v_neg := coalesce((pg->'negativa'->>'marcada')::boolean, false);

    IF coalesce((pg->>'qr_pagina')::int, 1) > 1 THEN
      v_sug := 'anexo';
    ELSIF v_ban ? 'posible_inyeccion' THEN
      v_sug := 'revisar_inyeccion';
    ELSIF c.id IS NULL THEN
      v_sug := 'revisar_folio'; v_det := CASE WHEN v_folio IS NULL THEN 'no se pudo leer el folio' ELSE 'el folio no existe' END;
    ELSIF c.estado IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA','RETENIDO') THEN
      v_sug := 'revisar_folio'; v_det := 'el caso ya no espera hoja (' || c.estado || ')';
    ELSIF coalesce(pg->>'legibilidad', 'mala') = 'mala' OR NOT coalesce((pg->>'geometria')::boolean, false) THEN
      v_sug := 'revisar_ilegible';
    ELSE
      SELECT m.nombre INTO v_nombre FROM retardos.empleado m WHERE m.employee_id = c.employee_id;
      v_coinc := retardos.nombre_coincide(v_nombre, pg->>'nombre_visible');
      IF v_coinc IS FALSE OR (pg->>'qr_nivel' IS NOT NULL AND (pg->>'qr_nivel')::int <> c.nivel) THEN
        v_sug := 'revisar_folio'; v_det := CASE WHEN v_coinc IS FALSE THEN 'el nombre impreso no es el del caso' ELSE 'el nivel no coincide' END;
      ELSIF coalesce((pg->'comentarios'->>'inconformidad')::boolean, false)
            OR (coalesce((pg->'comentarios'->>'presente')::boolean, false) AND pg->'comentarios'->>'inconformidad' IS NULL) THEN
        v_sug := 'revisar_impugnacion';
        v_det := CASE WHEN pg->'comentarios'->>'inconformidad' IS NULL THEN 'hay comentarios escritos que nadie ha leído' ELSE 'el comentario expresa inconformidad' END;
      ELSE
        v_req := ARRAY(SELECT jsonb_array_elements_text(retardos.cfg('firmas_requeridas')->(CASE WHEN v_neg THEN 'negativa' ELSE c.accion END)));
        FOREACH k IN ARRAY coalesce(v_req, '{}'::text[]) LOOP
          IF NOT coalesce((pg->'firmas'->k->>'presente')::boolean, false) THEN v_faltan := v_faltan || k; END IF;
        END LOOP;
        IF array_length(v_faltan, 1) > 0 THEN
          v_sug := 'revisar_falta_firma'; v_det := array_to_string(v_faltan, ', ');
        ELSE
          v_sug := 'lista_para_validar'; v_det := CASE WHEN v_neg THEN 'negativa a firmar con dos testigos' END;
        END IF;
      END IF;
    END IF;

    INSERT INTO retardos.lectura (hoja_id, pagina, folio_leido, folio_fuente, caso_id, resultado, sugerencia, sugerencia_texto,
                                  negativa, confianza, estado)
    VALUES (h.id, coalesce((pg->>'pagina')::int, 1), v_folio, pg->>'folio_fuente', c.id, pg, v_sug,
            retardos.sugerencia_texto(v_sug, v_det), v_neg, nullif(pg->>'confianza', '')::numeric,
            CASE WHEN v_sug = 'anexo' THEN 'anexo' ELSE 'por_confirmar' END)
    ON CONFLICT (hoja_id, pagina) DO NOTHING
    RETURNING id INTO v_lid;

    -- Ligar la hoja al caso como evidencia y dejar el caso esperando la confirmación de RH.
    IF v_lid IS NOT NULL AND c.id IS NOT NULL AND v_sug <> 'anexo'
       AND c.estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA','RETENIDO') THEN
      v_tipo := CASE WHEN v_neg THEN 'negativa_testigos' ELSE 'hoja_firmada' END;
      INSERT INTO retardos.evidencia (caso_id, sha256, nombre, mime, bytes, contenido, origen, tipo, subido_por, message_id)
      VALUES (c.id, h.sha256, h.nombre, h.mime, h.bytes, h.contenido,
              CASE WHEN h.origen IN ('correo','panel','carpeta','prueba') THEN h.origen ELSE 'panel' END,
              v_tipo, h.subido_por, h.message_id)
      ON CONFLICT (caso_id, sha256) DO NOTHING;
      IF c.estado IN ('ESPERANDO_FIRMA','VENCIDO','ESCALADO') THEN
        PERFORM retardos.transicionar(c.id, 'FIRMA_RECIBIDA', 'lector',
          'Hoja recibida (' || h.origen || '); pendiente de confirmar por RH. Sugerencia: ' || retardos.sugerencia_texto(v_sug, v_det),
          jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid, 'sugerencia', v_sug));
      ELSE
        PERFORM retardos.log(c.id, 'hoja_leida', 'lector', retardos.sugerencia_texto(v_sug, v_det),
                             jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid, 'sugerencia', v_sug));
      END IF;
      PERFORM retardos.encolar_plantilla(c.id, 'hoja_por_confirmar', 'aviso_rh', c.folio || ':hoja:' || h.id,
                                         retardos.rh_para(), '[]'::jsonb, NULL,
                                         jsonb_build_object('sugerencia', retardos.sugerencia_texto(v_sug, v_det)));
    ELSIF v_lid IS NOT NULL AND v_sug <> 'anexo' THEN
      PERFORM retardos.log(c.id, 'hoja_leida', 'lector', retardos.sugerencia_texto(v_sug, v_det),
                           jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid, 'sugerencia', v_sug));
    END IF;
    IF v_ban ? 'posible_inyeccion' THEN
      PERFORM retardos.log(c.id, 'posible_inyeccion', 'lector', 'La hoja trae texto que parece una instrucción. Se trató como dato y va a revisión de RH.',
                           jsonb_build_object('hoja_id', h.id, 'lectura_id', v_lid));
    END IF;
    v_out := v_out || jsonb_build_object('lectura_id', v_lid, 'pagina', pg->>'pagina', 'folio', v_folio, 'sugerencia', v_sug);
  END LOOP;

  UPDATE retardos.hoja SET estado = 'procesada', procesada_at = now(), error = NULL WHERE id = h.id;
  IF jsonb_array_length(v_out) = 0 THEN
    INSERT INTO retardos.lectura (hoja_id, pagina, resultado, sugerencia, sugerencia_texto, estado)
    VALUES (h.id, 1, jsonb_build_object('vacia', true), 'revisar_ilegible', retardos.sugerencia_texto('revisar_ilegible', 'no se encontró ninguna página legible'), 'por_confirmar')
    ON CONFLICT (hoja_id, pagina) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('ok', true, 'estado', 'procesada', 'lecturas', v_out);
END
$fn$;

-- RH decide sobre una lectura. Cada decisión queda en la bitácora con la sugerencia, para medir aciertos.
-- p = { accion: hoja_confirmar|hoja_corregir|hoja_pedir_de_nuevo|hoja_descartar, lectura_id, actor, rol,
--       resultado?: firmada|negativa|impugnacion, testigo1?, testigo2?, version?, folio?, motivo?, nota? }
CREATE OR REPLACE FUNCTION retardos.hoja_decidir(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE l retardos.lectura; c retardos.caso; v_actor text := coalesce(p->>'actor', 'desconocido'); v_cat text;
        v_res text := p->>'resultado'; v_acierto boolean; c2 retardos.caso; h retardos.hoja;
BEGIN
  IF coalesce(p->>'rol', 'lector') <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
  SELECT * INTO l FROM retardos.lectura WHERE id = (p->>'lectura_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'LECTURA_INEXISTENTE'); END IF;
  IF l.estado <> 'por_confirmar' THEN RETURN jsonb_build_object('ok', false, 'error', 'LECTURA_YA_DECIDIDA'); END IF;
  SELECT * INTO c FROM retardos.caso WHERE id = l.caso_id;

  IF p->>'accion' = 'hoja_corregir' THEN
    -- Liga la lectura a otro folio. No confirma nada: la hoja sigue esperando la decisión de RH.
    SELECT * INTO c2 FROM retardos.caso WHERE folio = p->>'folio';
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'FOLIO_INEXISTENTE'); END IF;
    SELECT * INTO h FROM retardos.hoja WHERE id = l.hoja_id;
    UPDATE retardos.lectura SET caso_id = c2.id, folio_leido = c2.folio,
           decision = coalesce(decision, '{}'::jsonb) || jsonb_build_object('folio_corregido', c2.folio, 'folio_anterior', l.folio_leido),
           decision_categoria = coalesce(decision_categoria, 'revisar_folio')
     WHERE id = l.id;
    INSERT INTO retardos.evidencia (caso_id, sha256, nombre, mime, bytes, contenido, origen, tipo, subido_por)
    VALUES (c2.id, h.sha256, h.nombre, h.mime, h.bytes, h.contenido,
            CASE WHEN h.origen IN ('correo','panel','carpeta','prueba') THEN h.origen ELSE 'panel' END,
            CASE WHEN l.negativa THEN 'negativa_testigos' ELSE 'hoja_firmada' END, v_actor)
    ON CONFLICT (caso_id, sha256) DO NOTHING;
    IF c2.estado IN ('ESPERANDO_FIRMA','VENCIDO','ESCALADO') THEN
      PERFORM retardos.transicionar(c2.id, 'FIRMA_RECIBIDA', v_actor, 'RH ligó una hoja a este folio; pendiente de confirmar',
                                    jsonb_build_object('lectura_id', l.id, 'folio_anterior', l.folio_leido));
    END IF;
    PERFORM retardos.log(c2.id, 'hoja_corregida', v_actor, coalesce(p->>'nota', 'Folio corregido por RH'),
                         jsonb_build_object('lectura_id', l.id, 'folio_anterior', l.folio_leido, 'sugerencia', l.sugerencia));
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF p->>'accion' = 'hoja_confirmar' THEN
    IF c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_CASO_LIGADO'); END IF;
    IF v_res NOT IN ('firmada','negativa','impugnacion') THEN RETURN jsonb_build_object('ok', false, 'error', 'RESULTADO_INVALIDO'); END IF;
    IF v_res = 'negativa' AND (char_length(coalesce(p->>'testigo1', '')) < 3 OR char_length(coalesce(p->>'testigo2', '')) < 3) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FALTAN_TESTIGOS');
    END IF;
    IF c.estado NOT IN ('FIRMA_RECIBIDA','ESPERANDO_FIRMA','VENCIDO','ESCALADO') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_ESPERA_HOJA', 'estado', c.estado);
    END IF;
    IF c.estado <> 'FIRMA_RECIBIDA' THEN
      PERFORM retardos.transicionar(c.id, 'FIRMA_RECIBIDA', v_actor, 'Hoja confirmada por RH', jsonb_build_object('lectura_id', l.id));
    END IF;
    v_cat := CASE v_res WHEN 'impugnacion' THEN 'revisar_impugnacion' ELSE 'lista_para_validar' END;
    IF v_res = 'firmada' THEN
      PERFORM retardos.transicionar(c.id, 'VALIDADO_RH', v_actor, coalesce(p->>'nota', 'Hoja firmada confirmada por RH'),
                                    jsonb_build_object('lectura_id', l.id, 'sugerencia', l.sugerencia));
    ELSIF v_res = 'negativa' THEN
      PERFORM retardos.transicionar(c.id, 'SE_NEGO_A_FIRMAR', v_actor, 'Se negó a firmar ante dos testigos',
        jsonb_build_object('testigo1', p->>'testigo1', 'testigo2', p->>'testigo2', 'lectura_id', l.id));
      PERFORM retardos.transicionar(c.id, 'VALIDADO_RH', v_actor, 'Negativa documentada con dos testigos, confirmada por RH');
    ELSE
      PERFORM retardos.transicionar(c.id, 'IMPUGNADO', v_actor, coalesce(p->>'nota', 'El trabajador impugna en la hoja'),
        jsonb_build_object('version_trabajador', coalesce(p->>'version', l.resultado->'comentarios'->>'transcripcion'), 'lectura_id', l.id));
    END IF;
    IF v_res IN ('firmada','negativa') AND c.accion IN ('carta_compromiso','acta') THEN
      PERFORM retardos.transicionar(c.id, 'CERRADO', v_actor, 'Documento firmado y validado; queda en seguimiento de reincidencia');
    END IF;
    v_acierto := (l.sugerencia = v_cat) AND (v_res <> 'negativa' OR l.negativa) AND (v_res <> 'firmada' OR NOT l.negativa);
    UPDATE retardos.lectura SET estado = 'confirmada', decision_categoria = coalesce(decision_categoria, v_cat),
           decision = coalesce(decision, '{}'::jsonb) || jsonb_build_object('resultado', v_res, 'nota', p->>'nota'),
           acierto = CASE WHEN decision_categoria = 'revisar_folio' THEN l.sugerencia = 'revisar_folio' ELSE v_acierto END,
           decidido_por = v_actor, decidido_at = now()
     WHERE id = l.id;
  ELSIF p->>'accion' = 'hoja_pedir_de_nuevo' THEN
    v_cat := CASE p->>'motivo' WHEN 'falta_firma' THEN 'revisar_falta_firma' WHEN 'ilegible' THEN 'revisar_ilegible'
                               WHEN 'folio' THEN 'revisar_folio' ELSE 'otro' END;
    IF c.id IS NOT NULL AND c.estado = 'FIRMA_RECIBIDA' THEN
      PERFORM retardos.transicionar(c.id, 'ESPERANDO_FIRMA', v_actor, 'RH pide la hoja de nuevo: ' || coalesce(p->>'motivo', 'otro'),
                                    jsonb_build_object('lectura_id', l.id));
      UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3)) WHERE id = c.id;
    END IF;
    UPDATE retardos.lectura SET estado = 'pedida_de_nuevo', decision_categoria = coalesce(decision_categoria, v_cat),
           decision = coalesce(decision, '{}'::jsonb) || jsonb_build_object('motivo', p->>'motivo', 'nota', p->>'nota'),
           acierto = (l.sugerencia = coalesce(decision_categoria, v_cat)), decidido_por = v_actor, decidido_at = now()
     WHERE id = l.id;
  ELSIF p->>'accion' = 'hoja_descartar' THEN
    IF char_length(coalesce(p->>'nota', '')) < 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_OBLIGATORIO'); END IF;
    v_cat := CASE WHEN p->>'motivo' = 'inyeccion' THEN 'revisar_inyeccion' ELSE 'descartada' END;
    UPDATE retardos.lectura SET estado = 'descartada', decision_categoria = coalesce(decision_categoria, v_cat),
           decision = coalesce(decision, '{}'::jsonb) || jsonb_build_object('motivo', p->>'motivo', 'nota', p->>'nota'),
           acierto = (l.sugerencia = v_cat), decidido_por = v_actor, decidido_at = now()
     WHERE id = l.id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'ACCION_DESCONOCIDA');
  END IF;

  PERFORM retardos.log(c.id, 'hoja_decidida', v_actor, coalesce(p->>'nota', p->>'accion'),
    jsonb_build_object('lectura_id', l.id, 'accion', p->>'accion', 'resultado', v_res, 'sugerencia', l.sugerencia,
                       'acierto', (SELECT acierto FROM retardos.lectura WHERE id = l.id)));
  RETURN jsonb_build_object('ok', true, 'caso', CASE WHEN c.id IS NULL THEN NULL ELSE retardos.caso_datos(c.id) END);
END
$fn$;

-- Métrica del procesador: cuánto acierta contra la decisión final de RH.
CREATE OR REPLACE FUNCTION retardos.metrica_lector(p_dias integer DEFAULT 7) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  WITH d AS (SELECT * FROM retardos.lectura WHERE acierto IS NOT NULL AND decidido_at > now() - make_interval(days => p_dias))
  SELECT jsonb_build_object('dias', p_dias, 'decididas', (SELECT count(*) FROM d),
    'aciertos', (SELECT count(*) FROM d WHERE acierto),
    'pct_acierto', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE round(100.0 * count(*) FILTER (WHERE acierto) / count(*), 1) END FROM d),
    'por_sugerencia', coalesce((SELECT jsonb_object_agg(sugerencia, jsonb_build_object('n', n, 'aciertos', a))
                                 FROM (SELECT sugerencia, count(*) n, count(*) FILTER (WHERE acierto) a FROM d GROUP BY 1) s), '{}'::jsonb),
    'por_confirmar', (SELECT count(*) FROM retardos.lectura WHERE estado = 'por_confirmar'))
$fn$;

-- ══ 6. RESPUESTAS POR CORREO: al mismo procesador ═══════════════════════════
CREATE OR REPLACE FUNCTION retardos.registrar_respuesta(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_folio text; c retardos.caso; v_rem text := lower(trim(p->>'remitente')); v_clas text; a jsonb;
        v_validos integer := 0; v_total integer; v_mid text := p->>'message_id'; r jsonb; v_hojas jsonb := '[]'::jsonb;
        v_rh jsonb := retardos.rh_para();
BEGIN
  IF v_mid IS NULL THEN RAISE EXCEPTION 'SIN_MESSAGE_ID'; END IF;
  IF EXISTS (SELECT 1 FROM retardos.correo_entrante WHERE message_id = v_mid) THEN
    RETURN jsonb_build_object('ok', true, 'clasificacion', 'duplicado');
  END IF;
  v_folio := substring(coalesce(p->>'asunto', '') FROM 'RET-[0-9]{4}-[0-9]{4}');
  v_total := jsonb_array_length(coalesce(p->'adjuntos', '[]'::jsonb));
  IF v_folio IS NOT NULL THEN SELECT * INTO c FROM retardos.caso WHERE folio = v_folio; END IF;

  -- Todo adjunto aceptable entra al procesador, venga de quien venga: RH decide.
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p->'adjuntos', '[]'::jsonb)) LOOP
    r := retardos.hoja_registrar(jsonb_build_object('nombre', a->>'nombre', 'mime', a->>'mime', 'contenido_b64', a->>'contenido_b64',
                                 'origen', 'correo', 'folio_indicado', v_folio, 'subido_por', 'correo:' || coalesce(v_rem, '?'),
                                 'message_id', v_mid));
    IF coalesce((r->>'ok')::boolean, false) THEN v_validos := v_validos + 1; v_hojas := v_hojas || (r->'hoja_id'); END IF;
  END LOOP;

  v_clas := CASE WHEN v_folio IS NULL THEN 'sin_folio'
                 WHEN c.id IS NULL THEN 'folio_inexistente'
                 WHEN c.estado IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA') THEN 'caso_cerrado'
                 WHEN v_total = 0 THEN 'sin_adjunto'
                 WHEN v_validos = 0 THEN 'adjunto_invalido'
                 WHEN NOT (v_rem IN (SELECT jsonb_array_elements_text(retardos.solo_emails(retardos.correos_de(c.employee_id))))
                           OR v_rem IN (SELECT jsonb_array_elements_text(coalesce(retardos.jefe_de(c.employee_id), '[]'::jsonb))))
                   THEN 'remitente_distinto'
                 ELSE 'ok' END;

  INSERT INTO retardos.correo_entrante (message_id, recibido_at, remitente, asunto, folio, caso_id, adjuntos, clasificacion)
  VALUES (v_mid, coalesce((p->>'recibido_at')::timestamptz, now()), coalesce(v_rem, ''), left(coalesce(p->>'asunto', ''), 300),
          v_folio, c.id, v_total, v_clas);

  IF c.id IS NOT NULL THEN
    PERFORM retardos.log(c.id, 'respuesta_' || v_clas, 'correo:' || coalesce(v_rem, '?'),
      CASE WHEN v_validos > 0 THEN 'Respuesta con hoja: entra al lector' ELSE 'Respuesta sin hoja válida' END,
      jsonb_build_object('message_id', v_mid, 'hojas', v_hojas));
  END IF;
  -- Sin hoja utilizable, o sin folio: lo ve RH (ya no se le pide nada al trabajador).
  IF v_validos = 0 OR v_clas IN ('sin_folio','folio_inexistente','caso_cerrado') THEN
    PERFORM retardos.encolar('revision:' || v_mid, c.id, 'revision_rh', v_rh, '[]'::jsonb,
      'Retardos: respuesta que requiere revisión (' || v_clas || ')',
      '<p>Llegó un correo al buzón de retardos que el sistema no pudo asociar a una hoja.</p><p>Clasificación: <b>'
      || v_clas || '</b><br>Folio en el asunto: ' || coalesce(v_folio, '(ninguno)') || '<br>Remitente: '
      || coalesce(v_rem, '') || '<br>Adjuntos: ' || v_total || ' (utilizables: ' || v_validos || ')</p>'
      || '<p>Si la persona escribió su versión, puede ser una impugnación: revísalo en el panel de Retardos.</p>');
  END IF;
  RETURN jsonb_build_object('ok', true, 'clasificacion', v_clas, 'folio', v_folio, 'adjuntos_validos', v_validos, 'hojas', v_hojas);
END
$fn$;

-- ══ 7. REINCIDENCIA ACUMULADA Y ALERTAS DE MODO ══════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.alerta_modo (
  id              bigserial   PRIMARY KEY,
  clave           text        NOT NULL UNIQUE,
  alcance         text        NOT NULL CHECK (alcance IN ('individual','global')),
  disparador      text        NOT NULL,
  employee_id     integer,
  evidencia       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  estado          text        NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','pospuesta','descartada','decidido_cambiar')),
  posponer_hasta  date,
  atendida_por    text,
  atendida_at     timestamptz,
  motivo          text,
  veces_mostrada  integer     NOT NULL DEFAULT 0,
  creado_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE retardos.alerta_modo IS 'Alertas "Recomendación: activar modo suspensión". Nunca cambian el modo: sólo recomiendan. Cada decisión queda en la bitácora.';

CREATE OR REPLACE VIEW retardos.v_reincidencia AS
WITH par AS (
  SELECT (now() AT TIME ZONE 'America/Monterrey')::date AS hoy,
         coalesce((retardos.cfg('alerta_disparadores')->'individual'->>'ventana_dias')::int, 90) AS ventana
), emp AS (
  SELECT e.employee_id, e.nombre, e.departamento FROM retardos.empleado e
   WHERE e.activo AND e.company_id IN (SELECT (jsonb_array_elements_text(coalesce(retardos.cfg('empresa_ids'), '[1]'::jsonb)))::int)
), cs AS (
  SELECT c.* FROM retardos.caso c WHERE c.estado <> 'CANCELADO_POR_RH'
), meses AS (
  SELECT employee_id, array_agg(DISTINCT periodo ORDER BY periodo DESC) AS ps FROM cs GROUP BY 1
), racha AS (
  -- meses consecutivos con caso, terminando en el mes más reciente con caso
  SELECT m.employee_id, (SELECT count(*) FROM generate_subscripts(m.ps, 1) i
                          WHERE to_date(m.ps[i], 'YYYY-MM') = to_date(m.ps[1], 'YYYY-MM') - make_interval(months => i - 1)
                            AND NOT EXISTS (SELECT 1 FROM generate_subscripts(m.ps, 1) j
                                             WHERE j < i AND to_date(m.ps[j], 'YYYY-MM') <> to_date(m.ps[1], 'YYYY-MM') - make_interval(months => j - 1))) AS consecutivos,
         cardinality(m.ps) AS meses_con_casos, m.ps[1] AS ultimo_mes
    FROM meses m
), firm AS (
  SELECT cs.employee_id,
         count(*) FILTER (WHERE cs.accion = 'carta_compromiso' AND cs.validado_at > now() - interval '90 days')  AS cartas_90,
         count(*) FILTER (WHERE cs.accion = 'carta_compromiso' AND cs.validado_at > now() - interval '180 days') AS cartas_180,
         count(*) FILTER (WHERE cs.accion = 'acta' AND cs.validado_at > now() - interval '90 days')  AS actas_90,
         count(*) FILTER (WHERE cs.accion = 'acta' AND cs.validado_at > now() - interval '180 days') AS actas_180,
         count(*) FILTER (WHERE cs.accion = 'suspension' AND cs.estado = 'RETENIDO') AS susp_no_aplicada,
         count(DISTINCT cs.periodo) FILTER (WHERE cs.accion = 'suspension'
                                             AND cs.abierto_at > now() - make_interval(days => (SELECT ventana FROM par))) AS meses_susp_ventana
    FROM cs GROUP BY 1
), tend AS (
  SELECT r.employee_id,
         count(*) FILTER (WHERE r.fecha > (SELECT hoy FROM par) - 30) AS ret_30,
         round(count(*) FILTER (WHERE r.fecha <= (SELECT hoy FROM par) - 30 AND r.fecha > (SELECT hoy FROM par) - 120) / 3.0, 1) AS prom_30_previo
    FROM retardos.retardo r WHERE r.estado = 'contado' GROUP BY 1
), base AS (
  SELECT e.employee_id, e.nombre, e.departamento,
         coalesce(k.meses_con_casos, 0) AS meses_con_casos, coalesce(k.consecutivos, 0) AS meses_consecutivos, k.ultimo_mes,
         coalesce(f.cartas_90, 0) AS cartas_90, coalesce(f.cartas_180, 0) AS cartas_180,
         coalesce(f.actas_90, 0) AS actas_90, coalesce(f.actas_180, 0) AS actas_180,
         coalesce(f.susp_no_aplicada, 0) AS suspension_no_aplicada, coalesce(f.meses_susp_ventana, 0) AS meses_suspension_ventana,
         coalesce(t.ret_30, 0) AS retardos_30d, coalesce(t.prom_30_previo, 0) AS promedio_30d_previo
    FROM emp e LEFT JOIN racha k USING (employee_id) LEFT JOIN firm f USING (employee_id) LEFT JOIN tend t USING (employee_id)
)
SELECT b.*,
       CASE WHEN b.retardos_30d > b.promedio_30d_previo * 1.2 AND b.retardos_30d >= 2 THEN 'sube'
            WHEN b.retardos_30d < b.promedio_30d_previo * 0.8 THEN 'baja' ELSE 'igual' END AS tendencia,
       CASE WHEN EXISTS (SELECT 1 FROM retardos.alerta_modo a WHERE a.employee_id = b.employee_id AND a.estado IN ('abierta','pospuesta'))
              OR b.meses_suspension_ventana >= 2 OR b.actas_90 >= 2 THEN 'rojo'
            WHEN b.actas_180 > 0 OR b.suspension_no_aplicada > 0 OR b.meses_consecutivos >= 2 THEN 'amarillo'
            ELSE 'verde' END AS semaforo
  FROM base b;



CREATE OR REPLACE FUNCTION retardos.disparador_texto(p_d text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_d
    WHEN 'suspension_2_meses' THEN 'Una persona alcanzó el nivel de suspensión en dos meses distintos dentro de la ventana.'
    WHEN 'actas_firmadas'     THEN 'Una persona acumula dos o más actas firmadas dentro de la ventana.'
    WHEN 'reincide_tras_acta' THEN 'Una persona volvió a tener caso el mes siguiente a firmar un acta.'
    WHEN 'sin_reduccion'      THEN 'Después de las semanas en real, los retardos por semana no bajaron lo mínimo esperado contra la línea base de sombra.'
    WHEN 'plantilla_en_acta'  THEN 'Una parte de la plantilla activa mayor al límite está en nivel de acta o superior.'
    ELSE p_d END
$fn$;

-- Evalúa los disparadores. Crea alertas nuevas (una por clave), reabre las pospuestas vencidas y
-- encola el correo a Esteban y RH. NUNCA cambia modo_sanciones.
CREATE OR REPLACE FUNCTION retardos.evaluar_alertas() RETURNS jsonb
LANGUAGE plpgsql AS $fn$
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
             FROM retardos.caso WHERE accion = 'suspension' AND estado <> 'CANCELADO_POR_RH'
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
             FROM retardos.caso WHERE accion = 'acta' AND validado_at > now() - make_interval(days => v_vent)
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
               JOIN retardos.caso n ON n.employee_id = a.employee_id AND n.estado <> 'CANCELADO_POR_RH'
                AND n.periodo = to_char((a.validado_at AT TIME ZONE 'America/Monterrey') + interval '1 month', 'YYYY-MM')
              WHERE a.accion = 'acta' AND a.validado_at IS NOT NULL AND a.validado_at > now() - make_interval(days => v_vent + 31)
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
     WHERE nivel >= v_nivel_acta AND estado <> 'CANCELADO_POR_RH' AND periodo = to_char(v_hoy, 'YYYY-MM');
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
$fn$;

-- Correo de una alerta con su evidencia. Personal: va sólo a Esteban y RH.
CREATE OR REPLACE FUNCTION retardos.alerta_notificar(p_id bigint, p_para jsonb, p_sufijo text DEFAULT 'nueva') RETURNS bigint
LANGUAGE plpgsql AS $fn$
DECLARE a retardos.alerta_modo; v_html text; v_nombre text; t retardos.plantilla; v jsonb;
BEGIN
  SELECT * INTO a FROM retardos.alerta_modo WHERE id = p_id;
  SELECT * INTO t FROM retardos.plantilla WHERE clave = 'alerta_modo';
  IF a.employee_id IS NOT NULL THEN
    SELECT nombre INTO v_nombre FROM retardos.empleado WHERE employee_id = a.employee_id;
    v_html := '<p><b>Persona:</b> ' || coalesce(v_nombre, 'Empleado ' || a.employee_id) || '</p>'
      || '<table style="border-collapse:collapse;font-size:13px"><tr>'
      || '<th style="border:1px solid #ccc;padding:3px 6px">Folio</th><th style="border:1px solid #ccc;padding:3px 6px">Periodo</th>'
      || '<th style="border:1px solid #ccc;padding:3px 6px">Nivel</th><th style="border:1px solid #ccc;padding:3px 6px">Estado</th>'
      || '<th style="border:1px solid #ccc;padding:3px 6px">Abierto</th><th style="border:1px solid #ccc;padding:3px 6px">Hojas ligadas</th></tr>'
      || coalesce((SELECT string_agg('<tr><td style="border:1px solid #ccc;padding:3px 6px">' || c.folio || '</td><td style="border:1px solid #ccc;padding:3px 6px">'
           || c.periodo || '</td><td style="border:1px solid #ccc;padding:3px 6px">' || c.nivel || ' ' || c.accion
           || '</td><td style="border:1px solid #ccc;padding:3px 6px">' || c.estado || '</td><td style="border:1px solid #ccc;padding:3px 6px">'
           || to_char(c.abierto_at AT TIME ZONE 'America/Monterrey', 'DD/MM/YYYY') || '</td><td style="border:1px solid #ccc;padding:3px 6px">'
           || (SELECT count(*) FROM retardos.evidencia e WHERE e.caso_id = c.id) || '</td></tr>', '' ORDER BY c.abierto_at)
         FROM retardos.caso c WHERE c.employee_id = a.employee_id AND c.abierto_at > now() - interval '180 days'), '')
      || '</table><p><b>Tendencia (retardos contados por mes):</b> '
      || coalesce((SELECT string_agg(periodo || ': ' || n, ' · ' ORDER BY periodo) FROM
           (SELECT periodo, count(*) n FROM retardos.retardo WHERE employee_id = a.employee_id AND estado = 'contado'
             GROUP BY periodo ORDER BY periodo DESC LIMIT 4) s), 'sin datos') || '</p>';
  ELSE
    v_html := '<p><b>Evidencia:</b> ' || (SELECT string_agg(key || ': ' || value, ' · ') FROM jsonb_each_text(a.evidencia)) || '</p>';
  END IF;
  v := jsonb_build_object('disparador', a.disparador, 'disparador_texto', retardos.disparador_texto(a.disparador),
                          'evidencia_html', v_html, 'modo_sanciones', coalesce(retardos.cfg_txt('modo_sanciones'), 'sin_suspension'));
  RETURN retardos.encolar('alerta_modo:' || a.id || ':' || p_sufijo, NULL, 'alerta_modo', p_para, '[]'::jsonb,
                          retardos.render(t.asunto, v), retardos.render(t.cuerpo_html, v));
END
$fn$;

-- Atender una alerta desde el panel. "cambiar" registra la decisión; el modo se cambia con el
-- SQL documentado en MODO_SUSPENSION.md, después del checklist. Nunca desde aquí.
-- p = { alerta_id, decision: cambiar|posponer|descartar, semanas?, motivo, actor, rol }
CREATE OR REPLACE FUNCTION retardos.alerta_atender(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE a retardos.alerta_modo; v_actor text := coalesce(p->>'actor', 'desconocido'); v_dec text := p->>'decision';
        v_sem integer := coalesce((p->>'semanas')::int, 0);
BEGIN
  IF coalesce(p->>'rol', 'lector') <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
  SELECT * INTO a FROM retardos.alerta_modo WHERE id = (p->>'alerta_id')::bigint FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ALERTA_INEXISTENTE'); END IF;
  IF char_length(coalesce(p->>'motivo', '')) < 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_OBLIGATORIO'); END IF;
  IF v_dec = 'posponer' THEN
    IF v_sem < 1 OR v_sem > 26 THEN RETURN jsonb_build_object('ok', false, 'error', 'SEMANAS_INVALIDAS'); END IF;
    UPDATE retardos.alerta_modo SET estado = 'pospuesta', posponer_hasta = (now() AT TIME ZONE 'America/Monterrey')::date + v_sem * 7,
           atendida_por = v_actor, atendida_at = now(), motivo = p->>'motivo' WHERE id = a.id;
  ELSIF v_dec = 'descartar' THEN
    UPDATE retardos.alerta_modo SET estado = 'descartada', atendida_por = v_actor, atendida_at = now(), motivo = p->>'motivo' WHERE id = a.id;
  ELSIF v_dec = 'cambiar' THEN
    UPDATE retardos.alerta_modo SET estado = 'decidido_cambiar', atendida_por = v_actor, atendida_at = now(), motivo = p->>'motivo' WHERE id = a.id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'DECISION_INVALIDA');
  END IF;
  PERFORM retardos.log(NULL, 'alerta_modo_' || v_dec, v_actor, p->>'motivo',
    jsonb_build_object('alerta_id', a.id, 'disparador', a.disparador, 'employee_id', a.employee_id, 'semanas', v_sem,
                       'nota', CASE WHEN v_dec = 'cambiar' THEN 'Decisión registrada. El modo NO cambió: se cambia con el checklist y el SQL de MODO_SUSPENSION.md.' END));
  RETURN jsonb_build_object('ok', true, 'modo_sanciones', retardos.cfg('modo_sanciones'));
END
$fn$;

-- ══ 8. VERIFICACIÓN DIARIA: plazos contra RH + alertas ═══════════════════════
CREATE OR REPLACE FUNCTION retardos.verificar(p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE c record; v_hoy date := (now() AT TIME ZONE 'America/Monterrey')::date;
        v_plazo integer := coalesce(retardos.cfg_txt('dias_recoleccion_rh')::int, 3);
        v_rh jsonb := retardos.rh_para();
        v_esc jsonb := coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb);
        v_dval integer := coalesce(retardos.cfg_txt('dias_validacion_rh')::int, 2);
        n_venc integer := 0; n_esc integer := 0; n_rec_rh integer := 0; n_verif integer := 0; n_alert integer := 0;
        v_chec integer; v_nom boolean; v_corrida bigint; v_al jsonb;
BEGIN
  INSERT INTO retardos.corrida (workflow) VALUES ('retardos/verificar') RETURNING id INTO v_corrida;

  -- 1) RH no subió la hoja a tiempo → VENCIDO + recordatorio a RH con copia al jefe.
  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'ESPERANDO_FIRMA' AND k.vence_at < now() LOOP
    PERFORM retardos.transicionar(c.id, 'VENCIDO', 'sistema', 'RH no subió la hoja al vencer el plazo');
    UPDATE retardos.caso SET vence_at = retardos.sumar_habiles(now(), greatest(v_plazo, 1)), recordatorios = recordatorios + 1 WHERE id = c.id;
    PERFORM retardos.encolar_plantilla(c.id, 'recordatorio_rh_recolectar', 'recordatorio', c.folio || ':recordatorio:1',
      v_rh, coalesce(retardos.jefe_de(c.employee_id), '[]'::jsonb), NULL,
      jsonb_build_object('vence_rh', to_char(retardos.sumar_habiles(now(), greatest(v_plazo, 1)) AT TIME ZONE 'America/Monterrey', 'DD/MM/YYYY')));
    n_venc := n_venc + 1;
  END LOOP;

  -- 2) Vencido otra vez → ESCALADO a Dirección con copia a RH.
  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'VENCIDO' AND k.vence_at < now() LOOP
    PERFORM retardos.transicionar(c.id, 'ESCALADO', 'sistema', 'Segundo vencimiento sin hoja: se escala a Dirección');
    PERFORM retardos.encolar_plantilla(c.id, 'escalamiento_rh', 'escalamiento', c.folio || ':escalamiento', v_esc,
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(v_rh) x WHERE NOT (to_jsonb(x) <@ v_esc)), NULL);
    n_esc := n_esc + 1;
  END LOOP;

  -- 3) Hoja recibida sin confirmar por RH en N días hábiles → recordatorio diario a RH.
  FOR c IN SELECT k.* FROM retardos.caso k
            WHERE k.estado = 'FIRMA_RECIBIDA' AND retardos.sumar_habiles(k.actualizado_at, v_dval) < now()
  LOOP
    IF retardos.encolar_plantilla(c.id, 'recordatorio_rh', 'aviso_rh', c.folio || ':rh_pendiente:' || v_hoy,
                                  v_rh, '[]'::jsonb) IS NOT NULL THEN n_rec_rh := n_rec_rh + 1; END IF;
  END LOOP;

  -- 4) Suspensión programada (sólo existe en con_suspension): ¿se aplicó?
  FOR c IN SELECT k.* FROM retardos.caso k WHERE k.estado = 'ACCION_PROGRAMADA' AND k.accion_desde IS NOT NULL LOOP
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

  -- 5) Reincidencia acumulada: alertas de "activar modo suspensión" (nunca cambian el modo).
  v_al := retardos.evaluar_alertas();

  UPDATE retardos.corrida SET terminada_at = now(), ok = true,
         resumen = jsonb_build_object('vencidos', n_venc, 'escalados', n_esc, 'recordatorios_rh', n_rec_rh,
                                      'acciones_verificadas', n_verif, 'alertas', n_alert) || v_al
   WHERE id = v_corrida;
  RETURN (SELECT resumen || jsonb_build_object('corrida_id', id) FROM retardos.corrida WHERE id = v_corrida);
END
$fn$;

-- ══ 9. SALUD: también vigila al procesador de hojas ═════════════════════════
DO $ren2$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'retardos' AND p.proname = 'salud_base') THEN
    ALTER FUNCTION retardos.salud() RENAME TO salud_base;
  END IF;
END
$ren2$;

CREATE OR REPLACE FUNCTION retardos.salud() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE s jsonb := retardos.salud_base(); v_prob jsonb := coalesce(s->'problemas', '[]'::jsonb); v_n integer;
        v_h integer := coalesce(retardos.cfg_txt('hojas_horas_alerta')::int, 6);
        v_e integer := coalesce(retardos.cfg_txt('hojas_errores_alerta')::int, 3);
BEGIN
  SELECT count(*) INTO v_n FROM retardos.hoja WHERE estado IN ('pendiente','procesando') AND creado_at < now() - make_interval(hours => v_h);
  IF v_n > 0 THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'HOJAS_ATORADAS', 'detalle', v_n || ' hojas llevan más de ' || v_h || ' h sin procesarse. ¿Está arriba el servicio retardos-hojas?');
  END IF;
  SELECT count(*) INTO v_n FROM retardos.hoja WHERE estado = 'error' AND intentos >= 3;
  IF v_n > 0 THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'HOJAS_CON_ERROR', 'detalle', v_n || ' hojas fallaron 3 veces en el procesador.');
  END IF;
  SELECT count(*) INTO v_n FROM retardos.corrida WHERE workflow = 'retardos/hojas' AND ok = false AND iniciada_at > now() - interval '24 hours';
  IF v_n >= v_e THEN
    v_prob := v_prob || jsonb_build_object('codigo', 'PROCESADOR_CON_ERRORES', 'detalle', v_n || ' errores del procesador de hojas en 24 h.');
  END IF;
  RETURN s || jsonb_build_object('ok', jsonb_array_length(v_prob) = 0, 'problemas', v_prob,
    'hojas_pendientes', (SELECT count(*) FROM retardos.hoja WHERE estado IN ('pendiente','procesando','error')),
    'lecturas_por_confirmar', (SELECT count(*) FROM retardos.lectura WHERE estado = 'por_confirmar'));
END
$fn$;

-- ══ 10. RESUMEN SEMANAL: aciertos del lector, alertas y reincidencia ══════════
CREATE OR REPLACE FUNCTION retardos.resumen_semanal() RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v jsonb; v_sem text := to_char(now() AT TIME ZONE 'America/Monterrey', 'IYYY-"S"IW'); v_html text; v_m jsonb;
        v_para jsonb := retardos.unicos(retardos.rh_para() || coalesce(retardos.cfg('escalamiento_cc'), '[]'::jsonb)); v_al text;
BEGIN
  v_m := retardos.metrica_lector(7);
  UPDATE retardos.alerta_modo SET veces_mostrada = veces_mostrada + 1 WHERE estado = 'abierta';
  v := jsonb_build_object(
    'semana', v_sem,
    'por_estado', coalesce((SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) n FROM retardos.caso GROUP BY estado) s), '{}'::jsonb),
    'retardos_7d', (SELECT count(*) FROM retardos.retardo WHERE estado = 'contado' AND fecha > current_date - 7),
    'casos_nuevos_7d', (SELECT count(*) FROM retardos.caso WHERE abierto_at > now() - interval '7 days'),
    'firmas_por_recolectar', (SELECT count(*) FROM retardos.caso WHERE estado IN ('ESPERANDO_FIRMA','VENCIDO','ESCALADO')),
    'vencidos', (SELECT count(*) FROM retardos.caso WHERE estado IN ('VENCIDO','ESCALADO')),
    'hojas_por_confirmar', (SELECT count(*) FROM retardos.lectura WHERE estado = 'por_confirmar'),
    'suspension_no_aplicada', (SELECT count(*) FROM retardos.caso WHERE estado = 'RETENIDO'),
    'reincidentes', (SELECT count(*) FROM retardos.caso WHERE motivo_apertura = 'reincidencia' AND estado NOT IN ('CERRADO','CANCELADO_POR_RH')),
    'semaforo', coalesce((SELECT jsonb_object_agg(semaforo, n) FROM (SELECT semaforo, count(*) n FROM retardos.v_reincidencia GROUP BY 1) s), '{}'::jsonb),
    'alertas_abiertas', (SELECT count(*) FROM retardos.alerta_modo WHERE estado = 'abierta'),
    'lector', v_m,
    'acciones_verificadas_7d', (SELECT count(*) FROM retardos.bitacora WHERE a = 'ACCION_VERIFICADA' AND creado_at > now() - interval '7 days'),
    'salud', retardos.salud());
  SELECT string_agg('<li>' || retardos.disparador_texto(a.disparador)
                    || coalesce(' Persona: ' || m.nombre, '') || ' (desde ' || to_char(a.creado_at AT TIME ZONE 'America/Monterrey', 'DD/MM/YYYY') || ')</li>', '')
    INTO v_al FROM retardos.alerta_modo a LEFT JOIN retardos.empleado m ON m.employee_id = a.employee_id WHERE a.estado = 'abierta';
  v_html := '<p>Resumen semanal de Retardos, semana ' || v_sem || '. Modo de sanciones: <b>'
    || coalesce(retardos.cfg_txt('modo_sanciones'), 'sin_suspension') || '</b>.</p>'
    || '<ul><li>Retardos contados en 7 días: <b>' || (v->>'retardos_7d') || '</b></li>'
    || '<li>Casos nuevos en 7 días: <b>' || (v->>'casos_nuevos_7d') || '</b></li>'
    || '<li>Firmas por recolectar (RH): <b>' || (v->>'firmas_por_recolectar') || '</b>, de ellas vencidas o escaladas: <b>' || (v->>'vencidos') || '</b></li>'
    || '<li>Hojas por confirmar: <b>' || (v->>'hojas_por_confirmar') || '</b></li>'
    || '<li>Nivel de suspensión alcanzado, no aplicado: <b>' || (v->>'suspension_no_aplicada') || '</b></li>'
    || '<li>Lector de hojas, últimos 7 días: <b>' || coalesce(v_m->>'aciertos', '0') || '</b> aciertos de <b>'
    || coalesce(v_m->>'decididas', '0') || '</b> hojas confirmadas por RH'
    || CASE WHEN v_m->>'pct_acierto' IS NOT NULL THEN ' (' || (v_m->>'pct_acierto') || '%)' ELSE '' END || '</li>'
    || '<li>Reincidencia acumulada: rojo ' || coalesce(v->'semaforo'->>'rojo', '0') || ', amarillo ' || coalesce(v->'semaforo'->>'amarillo', '0')
    || ', verde ' || coalesce(v->'semaforo'->>'verde', '0') || '</li></ul>'
    || CASE WHEN v_al IS NOT NULL THEN '<p><b>Alertas "Recomendación: activar modo suspensión" sin atender:</b></p><ul>' || v_al
            || '</ul><p>Atiéndelas en el panel (Reincidencia acumulada): cambiar a modo suspensión, posponer o descartar con motivo.</p>' ELSE '' END
    || '<p>Casos por estado: ' || coalesce((SELECT string_agg(key || ' ' || value, ', ') FROM jsonb_each_text(v->'por_estado')), 'ninguno') || '</p>'
    || '<p>Salud del sistema: ' || CASE WHEN (v->'salud'->>'ok')::boolean THEN 'sin problemas' ELSE 'con problemas, revisa el panel' END || '.</p>';
  PERFORM retardos.encolar('resumen:' || v_sem, NULL, 'resumen', v_para, '[]'::jsonb,
                           'Retardos: resumen semanal ' || v_sem, v_html);
  RETURN v;
END
$fn$;

-- ══ 11. PANEL: bandejas, hojas, reincidencia y alertas ══════════════════════
CREATE OR REPLACE FUNCTION retardos.panel_hojas(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'lecturas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'lectura_id', l.id, 'hoja_id', l.hoja_id, 'pagina', l.pagina, 'folio', l.folio_leido, 'folio_fuente', l.folio_fuente,
        'sugerencia', l.sugerencia, 'sugerencia_texto', l.sugerencia_texto, 'negativa', l.negativa, 'confianza', l.confianza,
        'resultado', l.resultado, 'creado_at', l.creado_at,
        'hoja', jsonb_build_object('nombre', h.nombre, 'mime', h.mime, 'bytes', h.bytes, 'origen', h.origen, 'subido_por', h.subido_por),
        'caso', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('folio', c.folio, 'nivel', c.nivel, 'accion', c.accion,
                     'estado', c.estado, 'employee_id', c.employee_id, 'nombre', m.nombre, 'periodo', c.periodo) END)
        ORDER BY l.id) FROM retardos.lectura l JOIN retardos.hoja h ON h.id = l.hoja_id
        LEFT JOIN retardos.caso c ON c.id = l.caso_id LEFT JOIN retardos.empleado m ON m.employee_id = c.employee_id
       WHERE l.estado = 'por_confirmar'), '[]'::jsonb),
    'hojas_en_proceso', coalesce((SELECT jsonb_agg(jsonb_build_object('hoja_id', id, 'nombre', nombre, 'estado', estado,
                                   'intentos', intentos, 'error', error, 'creado_at', creado_at) ORDER BY id)
                                   FROM retardos.hoja WHERE estado IN ('pendiente','procesando','error')), '[]'::jsonb),
    'metrica', retardos.metrica_lector(30))
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_hoja_ver(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE h retardos.hoja;
BEGIN
  SELECT * INTO h FROM retardos.hoja WHERE id = (p->>'hoja_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'HOJA_INEXISTENTE'); END IF;
  PERFORM retardos.log((SELECT caso_id FROM retardos.lectura WHERE hoja_id = h.id AND caso_id IS NOT NULL LIMIT 1),
                       'hoja_vista', coalesce(p->>'actor', 'desconocido'), 'Consulta desde el panel',
                       jsonb_build_object('hoja_id', h.id, 'sha256', h.sha256));
  RETURN jsonb_build_object('ok', true, 'nombre', h.nombre, 'mime', h.mime, 'bytes', h.bytes, 'sha256', h.sha256,
                            'contenido_b64', encode(h.contenido, 'base64'));
END
$fn$;

-- p = { archivos: [{nombre, mime, contenido_b64, folio?}], actor, rol }
CREATE OR REPLACE FUNCTION retardos.panel_subir_hojas(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE a jsonb; v_out jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(p->>'rol', 'lector') <> 'editor' THEN RETURN jsonb_build_object('ok', false, 'error', 'SOLO_LECTURA'); END IF;
  IF jsonb_array_length(coalesce(p->'archivos', '[]'::jsonb)) = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'SIN_ARCHIVOS'); END IF;
  IF jsonb_array_length(p->'archivos') > 10 THEN RETURN jsonb_build_object('ok', false, 'error', 'MAXIMO_10_ARCHIVOS'); END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(p->'archivos') LOOP
    v_out := v_out || (retardos.hoja_registrar(jsonb_build_object('nombre', a->>'nombre', 'mime', a->>'mime',
                        'contenido_b64', a->>'contenido_b64', 'origen', 'panel', 'folio_indicado', coalesce(a->>'folio', p->>'folio'),
                        'subido_por', coalesce(p->>'actor', 'desconocido'))) || jsonb_build_object('nombre', a->>'nombre'));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'archivos', v_out);
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_reincidencia(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'modo_sanciones', retardos.cfg('modo_sanciones'),
    'personas', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY CASE v.semaforo WHEN 'rojo' THEN 0 WHEN 'amarillo' THEN 1 ELSE 2 END, v.nombre)
                           FROM retardos.v_reincidencia v WHERE v.meses_con_casos > 0 OR v.retardos_30d > 0), '[]'::jsonb),
    'alertas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'alcance', a.alcance, 'disparador', a.disparador,
                           'texto', retardos.disparador_texto(a.disparador), 'employee_id', a.employee_id, 'nombre', m.nombre,
                           'evidencia', a.evidencia, 'estado', a.estado, 'posponer_hasta', a.posponer_hasta, 'motivo', a.motivo,
                           'atendida_por', a.atendida_por, 'creado_at', a.creado_at) ORDER BY a.estado = 'abierta' DESC, a.id DESC)
                           FROM retardos.alerta_modo a LEFT JOIN retardos.empleado m ON m.employee_id = a.employee_id), '[]'::jsonb),
    'disparadores', retardos.cfg('alerta_disparadores'))
$fn$;

-- Calidad de datos: además, qué correo se usa y por qué.
CREATE OR REPLACE FUNCTION retardos.panel_calidad(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true,
    'personas', coalesce((SELECT jsonb_agg(to_jsonb(v) || jsonb_build_object(
        'correos', retardos.correos_de(v.employee_id),
        'correo_usado', retardos.destinatarios(v.employee_id),
        'correo_motivo', CASE WHEN jsonb_array_length(retardos.destinatarios(v.employee_id)) = 0 THEN 'sin correo utilizable: la hoja va sólo a RH y al jefe'
                              WHEN coalesce(retardos.cfg_txt('correo_modo'), 'preferente') = 'ambos' THEN 'modo ambos'
                              WHEN retardos.destinatarios(v.employee_id)->0->>'tipo' = 'empresa' THEN 'correo de empresa'
                              ELSE 'no tiene correo de empresa utilizable: se usa el personal' END)
        ORDER BY v.revisado, v.departamento, v.nombre) FROM retardos.v_calidad v), '[]'::jsonb),
    'tolerancia_min', coalesce(retardos.cfg_txt('tolerancia_min')::numeric, 20),
    'correo_modo', retardos.cfg('correo_modo'),
    'regla_sugerida', 'Primer horario en punto o y media con el que habría llegado tarde en no más del 20% de sus días hábiles de los últimos 90. Sólo referencia: no se aplica sola.')
$fn$;

-- panel(): "subir_hoja" ahora entra al lector. Se envuelve sin reescribir el resto.
CREATE OR REPLACE FUNCTION retardos.panel_seguro(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_acc text := p->>'accion';
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
  IF v_acc IN ('subir_hojas','subir_hoja') THEN
    RETURN retardos.panel_subir_hojas(CASE WHEN v_acc = 'subir_hoja'
      THEN p || jsonb_build_object('archivos', jsonb_build_array(jsonb_build_object('nombre', p->>'nombre', 'mime', p->>'mime',
                                   'contenido_b64', p->>'contenido_b64', 'folio', p->>'folio')))
      ELSE p END);
  END IF;
  IF v_acc IN ('hoja_confirmar','hoja_corregir','hoja_pedir_de_nuevo','hoja_descartar') THEN RETURN retardos.hoja_decidir(p); END IF;
  IF v_acc = 'alerta_atender' THEN RETURN retardos.alerta_atender(p); END IF;
  RETURN retardos.panel(p);
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('ok', false, 'error', split_part(SQLERRM, ' ', 1), 'detalle', left(SQLERRM, 200));
END
$fn$;

-- ══ 12. CALIBRACIÓN DE DISPARADORES (sólo lectura) ═══════════════════════════
-- Simula, mes por mes y sobre las checadas guardadas, cuántas alertas habrían salido.
-- Supuestos: cada umbral cruzado abre su caso; la carta y el acta se firman el mismo mes
-- en que se alcanzan (cota alta); no hay suspensiones aplicadas (sin_suspension).
-- p = { desde, hasta, umbrales:[1,3,5,7], hora:'actual'|'sugerida', ventana_dias, meses_suspension,
--       actas_firmadas, pct_plantilla_acta }
CREATE OR REPLACE FUNCTION retardos.simular_alertas(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
WITH par AS (
  SELECT (p->>'desde')::date AS desde, (p->>'hasta')::date AS hasta, coalesce(p->>'hora', 'actual') AS hora,
         coalesce((p->>'ventana_dias')::int, 90) AS ventana, coalesce((p->>'meses_suspension')::int, 2) AS msusp,
         coalesce((p->>'actas_firmadas')::int, 2) AS nactas, coalesce((p->>'pct_plantilla_acta')::numeric, 15) AS pct,
         coalesce(retardos.cfg_txt('tolerancia_min')::numeric, 20) AS tol
), umb AS (
  SELECT (u.val)::int AS umbral, u.ord::int AS nivel FROM jsonb_array_elements_text(coalesce(p->'umbrales', '[1,3,5,7]'::jsonb)) WITH ORDINALITY AS u(val, ord)
), emp AS (
  SELECT e.employee_id, CASE WHEN par.hora = 'sugerida' THEN coalesce(v.hora_sugerida, e.hora_entrada) ELSE e.hora_entrada END AS hora
    FROM retardos.empleado e CROSS JOIN par LEFT JOIN retardos.v_calidad v USING (employee_id)
   WHERE e.activo AND e.company_id IN (SELECT (jsonb_array_elements_text(coalesce(retardos.cfg('empresa_ids'), '[1]'::jsonb)))::int)
), tarde AS (
  SELECT pc.employee_id, to_char(pc.fecha, 'YYYY-MM') AS mes
    FROM retardos.v_primera_checada pc JOIN emp USING (employee_id) CROSS JOIN par
   WHERE pc.fecha BETWEEN par.desde AND par.hasta AND retardos.es_habil(pc.fecha)
     AND NOT pc.disputa AND NOT pc.olvido_entrada AND emp.hora > 0
     AND NOT EXISTS (SELECT 1 FROM retardos.exclusion x WHERE x.activo AND x.employee_id = pc.employee_id AND pc.fecha BETWEEN x.desde AND x.hasta)
     AND pc.hora_local > emp.hora + par.tol / 60.0
), maxn AS (
  SELECT t.employee_id, t.mes, max(umb.nivel) AS nivel FROM (SELECT employee_id, mes, count(*) n FROM tarde GROUP BY 1, 2) t
    JOIN umb ON umb.umbral <= t.n GROUP BY 1, 2
), meses AS (
  SELECT DISTINCT to_char(d, 'YYYY-MM') AS mes FROM par, generate_series(par.desde, par.hasta, interval '1 month') d
), ind AS (
  SELECT m.mes,
    (SELECT count(DISTINCT a.employee_id) FROM maxn a, par
      WHERE a.nivel >= 4 AND a.mes = m.mes
        AND (SELECT count(*) FROM maxn b WHERE b.employee_id = a.employee_id AND b.nivel >= 4
               AND to_date(b.mes, 'YYYY-MM') > to_date(m.mes, 'YYYY-MM') - make_interval(days => par.ventana)
               AND b.mes <= m.mes) >= par.msusp) AS suspension_2_meses,
    (SELECT count(DISTINCT a.employee_id) FROM maxn a, par
      WHERE a.nivel >= 3 AND a.mes = m.mes
        AND (SELECT count(*) FROM maxn b WHERE b.employee_id = a.employee_id AND b.nivel >= 3
               AND to_date(b.mes, 'YYYY-MM') > to_date(m.mes, 'YYYY-MM') - make_interval(days => par.ventana)
               AND b.mes <= m.mes) >= par.nactas) AS actas_firmadas,
    (SELECT count(DISTINCT a.employee_id) FROM maxn a JOIN maxn b ON b.employee_id = a.employee_id
       AND b.mes = to_char(to_date(a.mes, 'YYYY-MM') + interval '1 month', 'YYYY-MM')
      WHERE a.nivel >= 3 AND b.mes = m.mes) AS reincide_tras_acta,
    (SELECT count(*) FROM maxn a WHERE a.mes = m.mes AND a.nivel >= 3) AS personas_en_acta_o_mas,
    (SELECT count(*) FROM emp) AS activos
  FROM meses m
)
SELECT jsonb_build_object('parametros', p, 'supuestos',
  'Cada umbral cruzado abre caso; carta y acta se firman el mes en que se alcanzan (cota alta); sin suspensiones aplicadas.',
  'por_mes', coalesce((SELECT jsonb_object_agg(i.mes, jsonb_build_object(
      'suspension_2_meses', i.suspension_2_meses, 'actas_firmadas', i.actas_firmadas, 'reincide_tras_acta', i.reincide_tras_acta,
      'personas_en_acta_o_mas', i.personas_en_acta_o_mas, 'activos', i.activos,
      'pct_plantilla_acta', CASE WHEN i.activos > 0 THEN round(100.0 * i.personas_en_acta_o_mas / i.activos, 1) END,
      'global_plantilla_en_acta', CASE WHEN i.activos > 0 THEN 100.0 * i.personas_en_acta_o_mas / i.activos > (SELECT pct FROM par) END))
    FROM ind i), '{}'::jsonb))
$fn$;

-- ══ 13. PERMISOS ═════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON retardos.hoja, retardos.lectura, retardos.alerta_modo TO retardos_app;
GRANT SELECT ON retardos.v_reincidencia TO retardos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA retardos TO retardos_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;
