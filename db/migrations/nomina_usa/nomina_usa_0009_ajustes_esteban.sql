-- ═══════════════════════════════════════════════════════════════════════════
-- nomina_usa_0009 · Ajustes de decisiones de Esteban (#448, sesión del 2-nov)
--
-- 1. Bandera de alertas POR PAÍS. Antes había una sola (alertas_modo) y «Pasar a real»
--    prendía los correos de TODO el padrón de Retardos, México incluido. Ahora son dos,
--    alertas_modo_usa y alertas_modo_mx, las dos nacen en 'sombra'. Cada alerta guarda su
--    país y el modo con que se creó:
--      · ficha USA                      → USA
--      · ficha HIBRIDO                  → el país del día (nomina_usa.dia); si no hay, el de
--                                         la zona de su última checada (la manda el workflow)
--      · ficha MX o sin ficha (padrón)  → MX
--    La vieja alertas_modo queda como dato (no se borra) pero ya no la lee nadie y
--    config_guardar la rechaza (CLAVE_OBSOLETA).
-- 2. La zona de evaluación la decide el workflow (última checada); aquí solo se usa para
--    el país de una ficha híbrida sin día clasificado.
-- 3. ficha.destinatarios_alerta: a quién van las alertas de checada de esa persona. Si
--    tiene valor, REEMPLAZA a RH y al jefe (y se quita al jefe de la copia). No toca el jefe
--    de Odoo ni ficha.jefe_employee_id.
-- 4. Fijo por asistencia TODO O NADA: una falta injustificada confirmada por RH en la
--    semana deja el fijo en 0 (antes era proporcional). La justificada no descuenta.
--    ficha.cuenta_analitica: la cuenta de su línea de fijo (Rissia: 'Sales FTS USA').
-- Reglas de db/README.md: idempotente, etiquetas de dólar con nombre, sin dólar seguido de
-- comilla o dígito (regla 8), nunca se edita aplicada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1 · Banderas por país ═════════════════════════════════════════════════
INSERT INTO nomina_usa.config (clave, valor, nota) VALUES
  ('alertas_modo_usa', '"sombra"'::jsonb, 'Alertas de quien tiene ficha USA, o HIBRIDO en día USA. sombra = registra y NO encola correos. Solo Esteban.'),
  ('alertas_modo_mx',  '"sombra"'::jsonb, 'Alertas del resto del padrón de Retardos (México). sombra = registra y NO encola correos. Solo Esteban.')
ON CONFLICT (clave) DO NOTHING;
UPDATE nomina_usa.config SET nota = 'OBSOLETA desde nomina_usa_0009: la sustituyen alertas_modo_usa y alertas_modo_mx. Nadie la lee.'
 WHERE clave = 'alertas_modo';

ALTER TABLE nomina_usa.alerta ADD COLUMN IF NOT EXISTS pais text;
DO $ck$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alerta_pais_ck') THEN
    ALTER TABLE nomina_usa.alerta ADD CONSTRAINT alerta_pais_ck CHECK (pais IS NULL OR pais IN ('USA', 'MX'));
  END IF;
END
$ck$;

-- ══ 3 y 4 · Ficha ═════════════════════════════════════════════════════════
ALTER TABLE nomina_usa.ficha ADD COLUMN IF NOT EXISTS destinatarios_alerta integer[];
ALTER TABLE nomina_usa.ficha ADD COLUMN IF NOT EXISTS cuenta_analitica text;
COMMENT ON COLUMN nomina_usa.ficha.destinatarios_alerta IS
  'hr.employee ids que reciben las alertas de checada de esta persona. NULL = RH y jefe, como siempre. Con valor, reemplaza a RH y al jefe.';
COMMENT ON COLUMN nomina_usa.ficha.cuenta_analitica IS
  'Cuenta analítica de su línea de fijo semanal. NULL = COMERCIAL-USA.';

CREATE OR REPLACE FUNCTION nomina_usa.es_zona_usa(p_zona text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(p_zona IN ('America/Los_Angeles','America/Denver','America/Phoenix','America/Chicago','America/New_York'), false)
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.pais_alerta(p_emp integer, p_fecha date, p_zona text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN f.pais_nomina = 'USA' THEN 'USA'
    WHEN f.pais_nomina = 'HIBRIDO' THEN coalesce(
           (SELECT d.pais FROM nomina_usa.dia d WHERE d.employee_id = p_emp AND d.fecha = p_fecha),
           CASE WHEN nomina_usa.es_zona_usa(p_zona) THEN 'USA' ELSE 'MX' END)
    ELSE 'MX' END
    FROM (SELECT p_emp AS e) x LEFT JOIN nomina_usa.ficha f ON f.employee_id = x.e AND f.activo
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.modo_alertas(p_pais text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN m IN ('sombra', 'real') THEN m ELSE 'sombra' END
    FROM (SELECT nomina_usa.cfg(CASE WHEN p_pais = 'USA' THEN 'alertas_modo_usa' ELSE 'alertas_modo_mx' END) #>> '{}' AS m) q
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.modos_alertas() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('usa', nomina_usa.modo_alertas('USA'), 'mx', nomina_usa.modo_alertas('MX'))
$fn$;

-- Correos de una lista de empleados (los de su ficha de Retardos), como texto, sin repetir.
CREATE OR REPLACE FUNCTION nomina_usa.correos_de_lista(p_ids integer[]) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT retardos.unicos(coalesce(jsonb_agg(e), '[]'::jsonb))
    FROM unnest(coalesce(p_ids, '{}')) AS i(id), jsonb_array_elements_text(retardos.solo_emails(retardos.destinatarios(i.id))) AS t(e)
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.sin_correos(p jsonb, p_quitar jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) x
   WHERE lower(x) NOT IN (SELECT lower(q) FROM jsonb_array_elements_text(coalesce(p_quitar, '[]'::jsonb)) q)
$fn$;

CREATE OR REPLACE FUNCTION nomina_usa.alertas_parametros() RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('modos', nomina_usa.modos_alertas(), 'tolerancia_min', nomina_usa.cfg('entrada_tolerancia_min'),
    'salida_horas', nomina_usa.cfg('salida_faltante_horas'), 'personas', nomina_usa.alertas_personas(),
    'festivos', coalesce((SELECT jsonb_agg(to_char(fecha, 'YYYY-MM-DD')) FROM retardos.festivo WHERE fecha >= current_date - 7), '[]'::jsonb))
$fn$;

-- Registra las alertas que calculó nomina-usa/alertas. Idempotente por clave.
-- p = { alertas: [{clave, tipo, employee_id, fecha, attendance_id, detalle:{zona,...}}] }
CREATE OR REPLACE FUNCTION nomina_usa.alertas_registrar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE a jsonb; v_id bigint; v_emp integer; v_pais text; v_modo text;
        v_nuevas integer := 0; v_enc integer := 0; v_real integer := 0; v_para jsonb; v_cc jsonb; v_asunto text; v_html text;
        v_jefe integer; v_dest integer[]; v_lista jsonb; v_quitar jsonb;
BEGIN
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p->'alertas', '[]'::jsonb)) LOOP
    v_emp := (a->>'employee_id')::integer;
    v_pais := nomina_usa.pais_alerta(v_emp, (a->>'fecha')::date, a->'detalle'->>'zona');
    v_modo := nomina_usa.modo_alertas(v_pais);
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

CREATE OR REPLACE FUNCTION nomina_usa.a_alertas(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $fn$
  SELECT jsonb_build_object('ok', true, 'modos', nomina_usa.modos_alertas(), 'alertas', coalesce(jsonb_agg(to_jsonb(a) ||
           jsonb_build_object('alias', coalesce(f.alias, 'empleado ' || a.employee_id)) ORDER BY a.fecha DESC, a.id DESC), '[]'::jsonb))
    FROM nomina_usa.alerta a LEFT JOIN nomina_usa.ficha f USING (employee_id)
   WHERE a.fecha BETWEEN coalesce((p->>'desde')::date, current_date - 14) AND coalesce((p->>'hasta')::date, current_date + 1)
     AND (NOT coalesce((p->>'solo_abiertas')::boolean, false) OR a.estado IN ('abierta', 'en_disputa'))
     AND (p->>'employee_id' IS NULL OR a.employee_id = (p->>'employee_id')::integer)
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
  IF v_clave IN ('alertas_modo_usa', 'alertas_modo_mx') AND NOT (p->'valor' IN ('"sombra"'::jsonb, '"real"'::jsonb)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MODO_INVALIDO');
  END IF;
  IF v_clave IN ('kiosko_activo', 'evidencia_activa') AND jsonb_typeof(p->'valor') <> 'boolean' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'VALOR_INVALIDO');
  END IF;
  IF coalesce(btrim(p->>'motivo'), '') = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTIVO_REQUERIDO'); END IF;
  UPDATE nomina_usa.config SET valor = p->'valor', updated_at = now(), updated_by = coalesce(p->>'actor', current_user)
   WHERE clave = v_clave;
  PERFORM nomina_usa.log(p->>'actor', 'config', v_clave, v_antes, p->'valor', p->>'motivo');
  RETURN jsonb_build_object('ok', true, 'clave', v_clave, 'antes', v_antes, 'despues', p->'valor');
END
$fn$;

-- Ficha: mismas reglas, más destinatarios_alerta y cuenta_analitica.
CREATE OR REPLACE FUNCTION nomina_usa.a_ficha_guardar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE f jsonb := p->'ficha'; v_id integer := (p->'ficha'->>'employee_id')::integer; v_antes jsonb; v_dest integer[];
BEGIN
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'EMPLEADO_REQUERIDO'); END IF;
  IF jsonb_typeof(f->'destinatarios_alerta') = 'array' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(f->'destinatarios_alerta') x WHERE x = '' OR x ~ '[^0-9]') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DESTINATARIO_INVALIDO');
    END IF;
    v_dest := ARRAY(SELECT DISTINCT x::integer FROM jsonb_array_elements_text(f->'destinatarios_alerta') x);
    IF cardinality(v_dest) = 0 THEN v_dest := NULL; END IF;
  END IF;
  SELECT to_jsonb(x) INTO v_antes FROM nomina_usa.ficha x WHERE employee_id = v_id;
  INSERT INTO nomina_usa.ficha AS t (employee_id, alias, pais_nomina, tipo_pago_usa, pide_so_entrada, kiosko_usa,
      jefe_employee_id, hora_entrada_ref, zona_horaria, fijo_semanal_usd, activo, destinatarios_alerta, cuenta_analitica, updated_at, updated_by)
  VALUES (v_id, coalesce(f->>'alias', 'empleado ' || v_id), coalesce(f->>'pais_nomina', 'MX'), nullif(f->>'tipo_pago_usa', ''),
      coalesce((f->>'pide_so_entrada')::boolean, false), coalesce((f->>'kiosko_usa')::boolean, false),
      nullif(f->>'jefe_employee_id', '')::integer, nullif(f->>'hora_entrada_ref', '')::time, nullif(f->>'zona_horaria', ''),
      nullif(f->>'fijo_semanal_usd', '')::numeric, coalesce((f->>'activo')::boolean, true), v_dest, nullif(btrim(f->>'cuenta_analitica'), ''),
      now(), coalesce(p->>'actor', current_user))
  ON CONFLICT (employee_id) DO UPDATE SET
      alias = excluded.alias, pais_nomina = excluded.pais_nomina, tipo_pago_usa = excluded.tipo_pago_usa,
      pide_so_entrada = excluded.pide_so_entrada, kiosko_usa = excluded.kiosko_usa, jefe_employee_id = excluded.jefe_employee_id,
      hora_entrada_ref = excluded.hora_entrada_ref, zona_horaria = excluded.zona_horaria, fijo_semanal_usd = excluded.fijo_semanal_usd,
      activo = excluded.activo, destinatarios_alerta = excluded.destinatarios_alerta, cuenta_analitica = excluded.cuenta_analitica,
      updated_at = now(), updated_by = excluded.updated_by;
  PERFORM nomina_usa.log(p->>'actor', 'ficha', v_id::text, v_antes,
                         (SELECT to_jsonb(x) FROM nomina_usa.ficha x WHERE employee_id = v_id), p->>'motivo');
  RETURN jsonb_build_object('ok', true, 'ficha', (SELECT to_jsonb(x) FROM nomina_usa.ficha x WHERE employee_id = v_id));
END
$fn$;


-- ══ 4 · Fijo TODO O NADA y cuenta de la ficha (copia de 0005 con dos cambios) ══
CREATE OR REPLACE FUNCTION nomina_usa.a_solicitud_enviar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE e jsonb := p->'envio'; v_sem date := (p->'envio'->>'semana')::date; so jsonb; r text; k text; v_ult integer; v_disp numeric; v_suma numeric;
        v_id bigint; v_err jsonb := '[]'::jsonb; v_pers integer[] := '{}'; v_bloq jsonb; c jsonb; f nomina_usa.ficha; v_tar numeric;
BEGIN
  IF v_sem IS NULL OR extract(isodow FROM v_sem) <> 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'SEMANA_INVALIDA'); END IF;
  IF EXISTS (SELECT 1 FROM nomina_usa.solicitud WHERE semana = v_sem AND estado <> 'devuelta') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'YA_ENVIADA', 'mensaje', 'La solicitud de esta semana ya se envió. Si hay que corregirla, que Magaly o Erick la devuelvan.');
  END IF;
  v_tar := coalesce((nomina_usa.cfg('tarifa_comercial_usd') #>> '{}')::numeric, 140);

  -- Personas de la solicitud (para disputas): las de los repartos, el comercial y los fijos.
  FOR so IN SELECT * FROM jsonb_array_elements(coalesce(e->'sos', '[]'::jsonb)) LOOP
    FOREACH r IN ARRAY ARRAY['supervisor', 'tecnicos'] LOOP
      FOR k IN SELECT jsonb_object_keys(coalesce(so->'reparto'->r, '{}'::jsonb)) LOOP
        IF coalesce((so->'reparto'->r->>k)::numeric, 0) > 0 THEN v_pers := v_pers || k::integer; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  v_pers := v_pers || ARRAY(SELECT (x->>'employee_id')::integer FROM jsonb_array_elements(coalesce(e->'comercial', '[]'::jsonb)) x WHERE coalesce((x->>'pct')::numeric, 0) > 0)
                   || ARRAY(SELECT (x->>'employee_id')::integer FROM jsonb_array_elements(coalesce(e->'fijos', '[]'::jsonb)) x);
  v_bloq := nomina_usa.bloqueos(v_sem, v_pers);
  IF jsonb_array_length(v_bloq->'disputas') > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EN_DISPUTA', 'mensaje', 'Hay una incidencia en disputa. Valídala con Magaly.', 'disputas', v_bloq->'disputas');
  END IF;

  -- Candados por SO y rol.
  FOR so IN SELECT * FROM jsonb_array_elements(coalesce(e->'sos', '[]'::jsonb)) LOOP
    v_ult := nomina_usa.avance_al((so->>'so_id')::integer, v_sem + 6);
    IF (so->>'est_mie')::integer < v_ult OR (so->>'est_jue')::integer < (so->>'est_mie')::integer OR (so->>'est_jue')::integer > 100 THEN
      v_err := v_err || jsonb_build_object('codigo', 'ESTIMADO_INVALIDO', 'so_id', so->'so_id', 'mensaje',
               coalesce(so->>'so_nombre', 'SO') || ': el jueves no puede ser menor al miércoles, ni el miércoles menor al último reportado (' || v_ult || '%).');
      CONTINUE;
    END IF;
    FOREACH r IN ARRAY ARRAY['supervisor', 'tecnicos'] LOOP
      SELECT coalesce(sum((value)::numeric), 0) INTO v_suma FROM jsonb_each_text(coalesce(so->'reparto'->r, '{}'::jsonb));
      IF v_suma <= 0 THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM nomina_usa.bolsa WHERE so_id = (so->>'so_id')::integer AND vigente) THEN
        v_err := v_err || jsonb_build_object('codigo', 'SIN_BOLSA', 'so_id', so->'so_id', 'mensaje', coalesce(so->>'so_nombre', 'SO') || ' no tiene bolsa. Pide a Esteban la provisional con folio.');
        EXIT;
      END IF;
      v_disp := nomina_usa.disponible((so->>'so_id')::integer, r, (so->>'est_jue')::integer);
      IF round(v_suma, 2) > v_disp THEN
        v_err := v_err || jsonb_build_object('codigo', 'EXCEDE_DISPONIBLE', 'so_id', so->'so_id', 'rol', r, 'disponible', v_disp, 'pedido', v_suma,
                 'mensaje', coalesce(so->>'so_nombre', 'SO') || ' · ' || r || ': pides ' || v_suma || ' y el disponible es ' || v_disp || '.');
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_each_text(coalesce(so->'reparto'->r, '{}'::jsonb)) WHERE value::numeric < 0) THEN
        v_err := v_err || jsonb_build_object('codigo', 'MONTO_NEGATIVO', 'so_id', so->'so_id');
      END IF;
    END LOOP;
  END LOOP;
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(e->'comercial', '[]'::jsonb)) LOOP
    IF coalesce((c->>'excepcion')::boolean, false) AND length(btrim(coalesce(c->>'explicacion', ''))) < 10 THEN
      v_err := v_err || jsonb_build_object('codigo', 'EXCEPCION_SIN_EXPLICACION', 'fecha', c->'fecha');
    END IF;
  END LOOP;
  IF jsonb_array_length(v_err) > 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'CANDADOS', 'errores', v_err); END IF;

  INSERT INTO nomina_usa.solicitud (semana, enviada_por, envio) VALUES (v_sem, coalesce(p->>'actor', 'desconocido'), e) RETURNING id INTO v_id;
  FOR so IN SELECT * FROM jsonb_array_elements(coalesce(e->'sos', '[]'::jsonb)) LOOP
    INSERT INTO nomina_usa.solicitud_so VALUES (v_id, (so->>'so_id')::integer, so->>'so_nombre', nomina_usa.avance_al((so->>'so_id')::integer, v_sem + 6),
                                                (so->>'est_mie')::integer, (so->>'est_jue')::integer);
    FOREACH r IN ARRAY ARRAY['supervisor', 'tecnicos'] LOOP
      FOR k IN SELECT jsonb_object_keys(coalesce(so->'reparto'->r, '{}'::jsonb)) LOOP
        IF coalesce((so->'reparto'->r->>k)::numeric, 0) > 0 THEN
          INSERT INTO nomina_usa.solicitud_linea (solicitud_id, tipo, employee_id, so_id, rol, monto, sugerido, cuenta, detalle)
          VALUES (v_id, 'so', k::integer, (so->>'so_id')::integer, r, round((so->'reparto'->r->>k)::numeric, 2),
                  nullif(so->'sugerido'->r->>k, '')::numeric, nomina_usa.cuenta_so(so->>'so_nombre', (so->>'so_id')::integer),
                  jsonb_build_object('est_jue', (so->>'est_jue')::integer));
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  -- Comercial: el servidor recalcula el monto (tarifa × %), no confía en el navegador.
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(e->'comercial', '[]'::jsonb)) LOOP
    IF coalesce((c->>'pct')::numeric, 0) <= 0 THEN CONTINUE; END IF;
    INSERT INTO nomina_usa.solicitud_linea (solicitud_id, tipo, employee_id, fecha, monto, sugerido, excepcion, explicacion, cuenta, detalle)
    VALUES (v_id, 'comercial', (c->>'employee_id')::integer, (c->>'fecha')::date, round(v_tar * (c->>'pct')::numeric / 100, 2),
            round(v_tar * coalesce((c->>'sugerido')::numeric, 0) / 100, 2), coalesce((c->>'excepcion')::boolean, false), c->>'explicacion', 'COMERCIAL-USA',
            jsonb_build_object('pct', (c->>'pct')::integer, 'sugerido_pct', (c->>'sugerido')::integer, 'estimado', coalesce((c->>'estimado')::boolean, false)));
  END LOOP;
  -- Fijos por asistencia: TODO O NADA (Esteban, 2-nov). Una falta injustificada confirmada por RH
  -- en la semana deja el fijo en 0; la justificada (permiso, vacaciones) no descuenta.
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(e->'fijos', '[]'::jsonb)) LOOP
    SELECT * INTO f FROM nomina_usa.ficha WHERE employee_id = (c->>'employee_id')::integer AND tipo_pago_usa = 'fijo_asistencia';
    IF NOT FOUND OR coalesce(f.fijo_semanal_usd, 0) <= 0 THEN
      v_err := v_err || jsonb_build_object('codigo', 'FIJO_SIN_MONTO', 'employee_id', c->'employee_id');
      CONTINUE;
    END IF;
    INSERT INTO nomina_usa.solicitud_linea (solicitud_id, tipo, employee_id, monto, cuenta, detalle)
    SELECT v_id, 'fijo', f.employee_id, CASE WHEN q.n > 0 THEN 0 ELSE round(f.fijo_semanal_usd, 2) END, coalesce(f.cuenta_analitica, 'COMERCIAL-USA'),
           jsonb_build_object('faltas', q.n, 'fijo', f.fijo_semanal_usd, 'regla', 'todo_o_nada')
      FROM (SELECT count(*) n FROM nomina_usa.alerta a WHERE a.employee_id = f.employee_id AND a.estado = 'falta_injustificada' AND a.fecha BETWEEN v_sem AND v_sem + 6) q;
  END LOOP;
  IF jsonb_array_length(v_err) > 0 THEN RAISE EXCEPTION 'CANDADOS %', v_err; END IF;
  PERFORM nomina_usa.log(p->>'actor', 'solicitud_enviada', 'semana:' || v_sem, NULL, jsonb_build_object('id', v_id), NULL);
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$fn$;

-- «Pedir a Magaly que la revise»: notifica solo si las alertas de USA están en real.
CREATE OR REPLACE FUNCTION nomina_usa.a_pedir_revision(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v nomina_usa.alerta; v_enc boolean := false;
BEGIN
  SELECT * INTO v FROM nomina_usa.alerta WHERE id = (p->>'id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ALERTA_INEXISTENTE'); END IF;
  IF v.estado <> 'en_disputa' THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_ESTA_EN_DISPUTA'); END IF;
  UPDATE nomina_usa.alerta SET revision_pedida_por = p->>'actor', revision_pedida_at = now() WHERE id = v.id;
  IF nomina_usa.modo_alertas('USA') = 'real' THEN
    PERFORM retardos.encolar('nomina_usa:revision:' || v.id || ':' || extract(epoch FROM now())::bigint, NULL, 'alerta', retardos.rh_para(), '[]'::jsonb,
      'Nómina USA: revisa una incidencia en disputa', '<p>' || coalesce(p->>'actor', 'Ricardo') || ' pide que revises la incidencia en disputa del empleado ' ||
      v.employee_id || ' del ' || to_char(v.fecha, 'DD/MM/YYYY') || '. La solicitud de nómina está detenida hasta que la liberes.</p>');
    v_enc := true;
  END IF;
  PERFORM nomina_usa.log(p->>'actor', 'revision_pedida', 'alerta:' || v.id, NULL, NULL, NULL);
  RETURN jsonb_build_object('ok', true, 'notificada', v_enc, 'modo', nomina_usa.modo_alertas('USA'));
END
$fn$;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA nomina_usa TO nomina_usa_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA nomina_usa TO nomina_usa_app;
