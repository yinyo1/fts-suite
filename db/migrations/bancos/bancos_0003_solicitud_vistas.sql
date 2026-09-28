-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0003 · solicitud por días hábiles, acuses y vistas de lectura (issue #331)
--
-- Sesión paralela a la de ingesta: NO toca las tablas ni el cálculo de huecos de
-- bancos_0001/0002. Lee los estados por bancos.estados_vigentes (bancos_0002): un reproceso con otro
-- parser deja el estado viejo como historia y aquí sólo cuenta el vigente. Agrega:
--   1. dias_inhabiles       calendario bancario (CNBV) editable
--   2. parametros           rezago_frecuencia (diario | semanal) y otros
--   3. plantillas_correo    texto de "Cómo descargarlos y subirlos", editable
--   4. fuentes_solicitud    las 5 fuentes que se piden (3 BBVA + Payana + Jeeves)
--   5. revisiones_manuales  para cerrar a mano un conflicto de versión ya revisado
--   6. correos              bitácora de solicitudes y acuses, con Message-ID (hilo)
--   7. funciones de calendario, f_faltantes(hoy), f_rechazos(hoy),
--      f_solicitud(hoy), f_acuse(corrida, hoy)
--   8. vistas v_* de sólo lectura y el rol bancos_lector (acceso sólo a ellas)
--
-- Reglas: nada se borra (sin DELETE para los roles), etiquetas de dólar con
-- nombre, sin datos bancarios en el archivo (repo público).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. calendario bancario ──
CREATE TABLE IF NOT EXISTS bancos.dias_inhabiles (
  fecha        date        PRIMARY KEY,
  descripcion  text        NOT NULL,
  fuente       text        NOT NULL,
  confirmado   boolean     NOT NULL,            -- false = proyección, reemplazar al publicarse el DOF
  creado_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE bancos.dias_inhabiles IS
  'Días inhábiles bancarios en México (además de sábados y domingos). Fuente: disposiciones anuales de la CNBV en el DOF. confirmado=false es proyección (LFT + patrón CNBV) hasta que salga el DOF del año.';

INSERT INTO bancos.dias_inhabiles (fecha, descripcion, fuente, confirmado) VALUES
  ('2026-01-01', 'Año nuevo',                                   'CNBV, DOF 10-dic-2025', true),
  ('2026-02-02', 'Día de la Constitución (primer lunes de febrero)', 'CNBV, DOF 10-dic-2025', true),
  ('2026-03-16', 'Natalicio de Benito Juárez (tercer lunes de marzo)', 'CNBV, DOF 10-dic-2025', true),
  ('2026-04-02', 'Jueves Santo',                                'CNBV, DOF 10-dic-2025', true),
  ('2026-04-03', 'Viernes Santo',                               'CNBV, DOF 10-dic-2025', true),
  ('2026-05-01', 'Día del Trabajo',                             'CNBV, DOF 10-dic-2025', true),
  ('2026-05-05', 'Batalla de Puebla',                           'CNBV, DOF 10-dic-2025', true),
  ('2026-09-16', 'Día de la Independencia',                     'CNBV, DOF 10-dic-2025', true),
  ('2026-11-02', 'Día de Muertos',                              'CNBV, DOF 10-dic-2025', true),
  ('2026-11-16', 'Revolución Mexicana (tercer lunes de noviembre)', 'CNBV, DOF 10-dic-2025', true),
  ('2026-12-12', 'Día del Empleado Bancario (cae en sábado)',   'patrón CNBV años previos; no confirmado en DOF 2026', false),
  ('2026-12-25', 'Navidad',                                     'LFT art. 74 + patrón CNBV; no confirmado en DOF 2026', false),
  ('2027-01-01', 'Año nuevo',                                   'LFT art. 74 (proyección, DOF 2027 no publicado)', false),
  ('2027-02-01', 'Día de la Constitución (primer lunes de febrero)', 'LFT art. 74 (proyección)', false),
  ('2027-03-15', 'Natalicio de Benito Juárez (tercer lunes de marzo)', 'LFT art. 74 (proyección)', false),
  ('2027-03-25', 'Jueves Santo',                                'patrón CNBV (proyección)', false),
  ('2027-03-26', 'Viernes Santo',                               'patrón CNBV (proyección)', false),
  ('2027-05-01', 'Día del Trabajo (cae en sábado)',             'LFT art. 74 (proyección)', false),
  ('2027-09-16', 'Día de la Independencia',                     'LFT art. 74 (proyección)', false),
  ('2027-11-02', 'Día de Muertos',                              'patrón CNBV (proyección)', false),
  ('2027-11-15', 'Revolución Mexicana (tercer lunes de noviembre)', 'LFT art. 74 (proyección)', false),
  ('2027-12-12', 'Día del Empleado Bancario (cae en domingo)',  'patrón CNBV (proyección)', false),
  ('2027-12-25', 'Navidad (cae en sábado)',                     'LFT art. 74 (proyección)', false)
ON CONFLICT (fecha) DO NOTHING;

-- ── 2. parámetros ──
CREATE TABLE IF NOT EXISTS bancos.parametros (
  clave          text        PRIMARY KEY,
  valor          text        NOT NULL,
  descripcion    text        NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO bancos.parametros (clave, valor, descripcion) VALUES
  ('rezago_frecuencia', 'diario',
   'diario | semanal. En semanal, el rezago (meses anteriores al recién cerrado) sólo aparece en la solicitud del primer día hábil de la semana (lunes, o el siguiente hábil si el lunes es inhábil); el mes recién cerrado sigue diario.'),
  ('solicitud_desde', '2026-09-29',
   'Primer día en que la solicitud puede salir (gate del martes 29-sep-2026).'),
  ('rechazos_dias', '45',
   'Días naturales hacia atrás en que un archivo rechazado sin cuenta ni mes identificable sigue apareciendo en la solicitud.'),
  ('acuse_desde', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
   'Sólo se acusan corridas terminadas después de este instante (evita acusar corridas viejas al encender el acuse).'),
  ('correo_para', 'gerardo@fts.mx', 'Destinatario de solicitudes y acuses (separar con coma).'),
  ('correo_cc', 'estebandelacruz@fts.mx,erick@fts.mx', 'Copia de solicitudes y acuses (separar con coma).'),
  ('buzon_nombre', 'FTS Finanzas - Bancos/00 Buzon de carga - subir aqui', 'Ruta del buzón que se cita en los correos.')
ON CONFLICT (clave) DO NOTHING;

-- ── 3. plantillas de correo ──
CREATE TABLE IF NOT EXISTS bancos.plantillas_correo (
  clave          text        PRIMARY KEY,
  asunto         text,
  cuerpo_html    text        NOT NULL,
  descripcion    text        NOT NULL,
  version        integer     NOT NULL DEFAULT 1,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO bancos.plantillas_correo (clave, cuerpo_html, descripcion) VALUES
('instrucciones',
$tpl$<h3 style="margin:18px 0 6px">Cómo descargarlos y subirlos</h3>
<p style="margin:0 0 6px"><b>BBVA (General, Nómina y USD)</b></p>
<ol style="margin:0 0 10px">
<li>Entrar a BBVA Net Cash.</li>
<li>Ir a la consulta de estados de cuenta.</li>
<li>Elegir la cuenta y el mes.</li>
<li>Descargar el PDF oficial del estado de cuenta, el que trae el resumen en la página 1.</li>
</ol>
<p style="margin:0 0 10px">No sirven capturas de pantalla, reportes de movimientos exportados a Excel ni PDFs impresos desde el navegador: tiene que ser el estado de cuenta oficial.</p>
<p style="margin:0 0 6px"><b>Payana</b></p>
<ol style="margin:0 0 10px">
<li>Exportar desde el portal los movimientos del mes en CSV o XLSX, con fecha, concepto, monto y saldo.</li>
</ol>
<p style="margin:0 0 6px"><b>Jeeves</b></p>
<ol style="margin:0 0 10px">
<li>Descargar desde la plataforma el estado de cuenta mensual de la tarjeta en PDF.</li>
</ol>
<p style="margin:0 0 6px"><b>Subir</b></p>
<ol style="margin:0 0 10px">
<li>Arrastrar los archivos al buzón tal como se descargaron, sueltos o en ZIP, sin renombrar. El sistema los identifica, los renombra y los acomoda solo.</li>
</ol>
<p style="margin:0 0 6px"><b>Qué no hacer</b></p>
<ul style="margin:0 0 10px">
<li>No borrar nada del buzón.</li>
<li>No subir PDFs con contraseña.</li>
<li>No mezclar estados de otras empresas.</li>
</ul>
<p style="margin:0 0 10px;color:#555">Si algún paso no coincide con lo que ves en el portal, responde este correo con cómo se hace y lo actualizamos.</p>$tpl$,
 'Sección "Cómo descargarlos y subirlos" de cada solicitud. Los menús de Net Cash, Payana y Jeeves no están verificados: los pasos son genéricos a propósito. Se edita con una migración bancos_NNNN de UPDATE (sube version).'),
('pie',
$tpl$<p style="color:#555;font-size:12px;margin-top:16px">Este correo lo genera el sistema de bancos de FTS desde la base; nadie lo escribe a mano. Las cuentas se muestran sólo con sus últimos 4 dígitos.</p>$tpl$,
 'Pie común de solicitudes y acuses.')
ON CONFLICT (clave) DO NOTHING;

-- ── 4. fuentes que se piden ──
-- El vínculo con bancos.cuentas es el journal de Odoo (el número de cuenta no vive en git).
CREATE TABLE IF NOT EXISTS bancos.fuentes_solicitud (
  clave          text        PRIMARY KEY,
  etiqueta       text        NOT NULL,
  tipo           text        NOT NULL CHECK (tipo IN ('bbva','payana','jeeves')),
  journal_odoo   integer     NOT NULL,
  tipo_archivo   text,                       -- archivos.tipo_detectado para fuentes sin parser
  periodo_inicio char(7)     NOT NULL CHECK (periodo_inicio ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  orden          integer     NOT NULL,
  activa         boolean     NOT NULL DEFAULT true
);
INSERT INTO bancos.fuentes_solicitud (clave, etiqueta, tipo, journal_odoo, tipo_archivo, periodo_inicio, orden) VALUES
  ('general', 'BBVA General',  'bbva',   8,  NULL,     '2024-01', 1),
  ('nomina',  'BBVA Nómina',   'bbva',   96, NULL,     '2024-01', 2),
  ('usd',     'BBVA USD',      'bbva',   75, NULL,     '2024-01', 3),
  ('payana',  'Payana',        'payana', 74, 'payana', '2026-08', 4),
  ('jeeves',  'Jeeves',        'jeeves', 61, 'jeeves', '2026-08', 5)
ON CONFLICT (clave) DO NOTHING;

-- ── 5. revisiones manuales (conflictos de versión ya revisados por una persona) ──
CREATE TABLE IF NOT EXISTS bancos.revisiones_manuales (
  id          bigserial   PRIMARY KEY,
  fuente      text        NOT NULL REFERENCES bancos.fuentes_solicitud(clave),
  periodo     char(7)     NOT NULL,
  motivo      text        NOT NULL CHECK (motivo IN ('conflicto_version')),
  nota        text        NOT NULL,
  revisado_por text       NOT NULL,
  creado_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 6. bitácora de correos ──
CREATE TABLE IF NOT EXISTS bancos.correos (
  id            bigserial   PRIMARY KEY,
  tipo          text        NOT NULL CHECK (tipo IN ('solicitud','acuse','final')),
  modo          text        NOT NULL CHECK (modo IN ('real','prueba')),
  hoy           date        NOT NULL,
  message_id    text        NOT NULL UNIQUE,
  in_reply_to   text,
  thread_index  text,
  asunto        text        NOT NULL,
  para          text[]      NOT NULL,
  cc            text[]      NOT NULL DEFAULT '{}',
  total_abiertos integer    NOT NULL,
  corrida_id    bigint      REFERENCES bancos.corridas(id),
  graph_status  integer,
  detalle       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  enviado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS correos_un_acuse_por_corrida
  ON bancos.correos (corrida_id) WHERE modo = 'real' AND tipo IN ('acuse','final') AND corrida_id IS NOT NULL;
COMMENT ON TABLE bancos.correos IS
  'Solicitudes y acuses enviados (o ensayados, modo=prueba). message_id es el Message-ID del MIME: los acuses responden al último de la solicitud (In-Reply-To/References/Thread-Index) para ir en el mismo hilo.';

-- ── 7. calendario ──
CREATE OR REPLACE FUNCTION bancos.es_dia_habil(d date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT extract(isodow FROM d) < 6 AND NOT EXISTS (SELECT 1 FROM bancos.dias_inhabiles i WHERE i.fecha = d)
$fn$;

CREATE OR REPLACE FUNCTION bancos.hoy_mty() RETURNS date
LANGUAGE sql STABLE AS $fn$ SELECT (now() AT TIME ZONE 'America/Monterrey')::date $fn$;

-- primer día hábil de un mes 'AAAA-MM'
CREATE OR REPLACE FUNCTION bancos.primer_dia_habil(p char(7)) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT min(d)::date FROM generate_series(to_date(p || '-01', 'YYYY-MM-DD'),
                                           to_date(p || '-01', 'YYYY-MM-DD') + 14, interval '1 day') g(d)
  WHERE bancos.es_dia_habil(d::date)
$fn$;

-- el estado de un mes se considera disponible el primer día hábil del mes siguiente
CREATE OR REPLACE FUNCTION bancos.disponible_desde(p char(7)) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT bancos.primer_dia_habil(to_char(to_date(p || '-01', 'YYYY-MM-DD') + interval '1 month', 'YYYY-MM'))
$fn$;

-- último mes exigible a la fecha: el más reciente cuyo "disponible_desde" ya llegó
CREATE OR REPLACE FUNCTION bancos.periodo_exigible(hoy date) RETURNS char(7)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT CASE WHEN hoy >= bancos.disponible_desde(to_char(hoy - interval '1 month', 'YYYY-MM'))
              THEN to_char(hoy - interval '1 month', 'YYYY-MM')
              ELSE to_char(hoy - interval '2 month', 'YYYY-MM') END
$fn$;

-- días hábiles de "desde" a "hasta", contando ambos (el día en que el mes se vuelve exigible es el día 1)
CREATE OR REPLACE FUNCTION bancos.dias_habiles(desde date, hasta date) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT count(*)::int FROM generate_series(desde, hasta, interval '1 day') g(d) WHERE bancos.es_dia_habil(d::date)
$fn$;

-- primer día hábil de la semana ISO de "d" (lunes, o el siguiente hábil si el lunes es inhábil)
CREATE OR REPLACE FUNCTION bancos.primer_habil_semana(d date) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT min(x)::date FROM generate_series(d - (extract(isodow FROM d)::int - 1), d - (extract(isodow FROM d)::int - 1) + 4,
                                           interval '1 day') g(x)
  WHERE bancos.es_dia_habil(x::date)
$fn$;

-- ── 8. faltantes ──
-- Un (fuente, mes) está CERRADO sólo si: BBVA → hay estado con archivo 'validado', V1 y V2 en verde y la
-- última V3 es ok/primero (verde) o hueco/sin_anterior ("no aplica, hueco registrado"), sin conflicto de
-- versión abierto. Payana/Jeeves (sin parser) → hay archivo de su tipo con ese mes ya identificado.
-- Todo lo demás es ABIERTO, con su motivo.
CREATE OR REPLACE FUNCTION bancos.f_faltantes(p_hoy date)
RETURNS TABLE (fuente text, etiqueta text, tipo text, orden integer, cuenta_id integer, numero_mask text, moneda char(3),
               periodo char(7), motivo text, detalle text, disponible_desde date, dias_habiles integer,
               es_mes_reciente boolean, archivo text, sha256 text, pagina integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
WITH lim AS (SELECT bancos.periodo_exigible(p_hoy) AS ultimo),
fu AS (
  SELECT f.*, c.id AS cuenta_id, c.numero_mask, coalesce(c.moneda, CASE WHEN f.clave = 'usd' THEN 'USD' ELSE 'MXN' END)::char(3) AS moneda
  FROM bancos.fuentes_solicitud f
  LEFT JOIN LATERAL (SELECT * FROM bancos.cuentas c WHERE c.journal_odoo = f.journal_odoo AND c.activa ORDER BY c.id LIMIT 1) c ON true
  WHERE f.activa
),
per AS (
  SELECT fu.*, to_char(g, 'YYYY-MM')::char(7) AS periodo
  FROM fu, lim, generate_series(to_date(fu.periodo_inicio || '-01', 'YYYY-MM-DD'), to_date(lim.ultimo || '-01', 'YYYY-MM-DD'), interval '1 month') g
),
bbva AS (
  SELECT p.clave, p.periodo,
    (SELECT jsonb_build_object('estado_id', e.id, 'v3', v3.resultado, 'archivo', a.nombre_canonico, 'sha', a.sha256)
       FROM bancos.estados_vigentes e JOIN bancos.archivos a ON a.id = e.archivo_id
       LEFT JOIN LATERAL (SELECT resultado FROM bancos.validaciones_v3 v WHERE v.estado_id = e.id ORDER BY v.id DESC LIMIT 1) v3 ON true
      WHERE e.cuenta_id = p.cuenta_id AND e.periodo = p.periodo AND a.estado = 'validado' AND e.v1_ok AND e.v2_ok
      ORDER BY e.id LIMIT 1) AS val,
    (SELECT jsonb_build_object('archivo', a.nombre_original, 'sha', a.sha256, 'motivo', a.motivo)
       FROM bancos.archivos a JOIN bancos.estados_vigentes e ON e.archivo_id = a.id
       JOIN bancos.duplicados_logicos d ON d.estado_id = e.id AND NOT d.mismo_contenido
      WHERE a.cuenta_id = p.cuenta_id AND a.periodo = p.periodo
        AND NOT EXISTS (SELECT 1 FROM bancos.revisiones_manuales r WHERE r.fuente = p.clave AND r.periodo = p.periodo
                          AND r.motivo = 'conflicto_version' AND r.creado_at > a.recibido_at)
      ORDER BY a.id DESC LIMIT 1) AS conflicto,
    (SELECT jsonb_build_object('archivo', a.nombre_original, 'sha', a.sha256, 'motivo', a.motivo)
       FROM bancos.archivos a WHERE a.cuenta_id = p.cuenta_id AND a.periodo = p.periodo AND a.estado = 'no_cuadra'
      ORDER BY a.id DESC LIMIT 1) AS no_cuadra,
    (SELECT jsonb_build_object('diferencia', h.monto_diferencia) FROM bancos.huecos h
      WHERE h.cuenta_id = p.cuenta_id AND h.periodo = p.periodo AND h.motivo = 'continuidad' AND h.resuelto_en IS NULL LIMIT 1) AS continuidad
  FROM per p WHERE p.tipo = 'bbva'
),
estado AS (
  SELECT p.*,
    CASE
      WHEN p.tipo <> 'bbva' THEN
        CASE WHEN EXISTS (SELECT 1 FROM bancos.archivos a WHERE a.tipo_detectado = p.tipo_archivo AND a.periodo = p.periodo
                            AND a.estado IN ('validado','formato_no_soportado')) THEN NULL
             WHEN EXISTS (SELECT 1 FROM bancos.archivos a WHERE a.tipo_detectado = p.tipo_archivo AND a.periodo IS NULL
                            AND a.estado = 'formato_no_soportado'
                            AND (a.recibido_at AT TIME ZONE 'America/Monterrey')::date >= bancos.disponible_desde(p.periodo)) THEN 'recibido_sin_lector'
             ELSE 'faltante' END
      WHEN p.cuenta_id IS NULL THEN 'faltante'
      WHEN b.conflicto IS NOT NULL THEN 'conflicto_version'
      WHEN b.val IS NULL AND b.no_cuadra IS NOT NULL THEN 'no_cuadra'
      WHEN b.val IS NULL THEN 'faltante'
      WHEN (b.val->>'v3') = 'descuadre' OR b.continuidad IS NOT NULL THEN 'continuidad'
      WHEN (b.val->>'v3') IS NULL THEN 'en_validacion'
      WHEN (b.val->>'v3') IN ('ok','primero','hueco','sin_anterior') THEN NULL
      ELSE 'en_validacion'
    END AS motivo,
    b.val, b.conflicto, b.no_cuadra, b.continuidad
  FROM per p LEFT JOIN bbva b ON b.clave = p.clave AND b.periodo = p.periodo
)
SELECT s.clave, s.etiqueta, s.tipo, s.orden, s.cuenta_id, coalesce(s.numero_mask, ''), s.moneda, s.periodo, s.motivo,
  CASE s.motivo
    WHEN 'faltante'          THEN 'no ha llegado'
    WHEN 'no_cuadra'         THEN 'llegó pero no cuadra contra el resumen del banco: ' || coalesce(s.no_cuadra->>'motivo', '')
    WHEN 'conflicto_version' THEN 'llegaron dos versiones distintas del mismo mes; la primera no se reemplaza'
    WHEN 'continuidad'       THEN 'el saldo inicial no es el saldo final del mes anterior'
    WHEN 'en_validacion'     THEN 'recibido; falta la prueba de continuidad, se completa sola en la siguiente corrida'
    WHEN 'recibido_sin_lector' THEN 'ya llegó un archivo de este tipo, pero el sistema todavía no lee ese formato ni sabe de qué mes es; no hay que hacer nada'
  END,
  bancos.disponible_desde(s.periodo),
  greatest(bancos.dias_habiles(bancos.disponible_desde(s.periodo), p_hoy), 0),
  s.periodo = (SELECT ultimo FROM lim),
  coalesce(s.conflicto->>'archivo', s.no_cuadra->>'archivo', s.val->>'archivo'),
  coalesce(s.conflicto->>'sha', s.no_cuadra->>'sha', s.val->>'sha'),
  NULL::integer
FROM estado s
WHERE s.motivo IS NOT NULL
ORDER BY s.orden, s.periodo
$fn$;

-- Archivos recibidos y rechazados que siguen vigentes a la fecha: los de una cuenta y mes que todavía
-- está abierto, y los que no se pudieron identificar, sólo de los últimos 'rechazos_dias' días.
CREATE OR REPLACE FUNCTION bancos.f_rechazos(p_hoy date)
RETURNS TABLE (archivo_id bigint, archivo text, pieza_de text, estado text, codigo text, motivo text, fuente text,
               numero_mask text, periodo char(7), recibido_at timestamptz, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
WITH abiertos AS (SELECT fuente, periodo FROM bancos.f_faltantes(p_hoy)),
dias AS (SELECT coalesce((SELECT valor::int FROM bancos.parametros WHERE clave = 'rechazos_dias'), 45) AS n)
SELECT a.id, a.nombre_original, z.nombre_original, a.estado,
  (SELECT ev.codigo FROM bancos.corrida_eventos ev WHERE ev.archivo_sha = a.sha256 AND ev.nivel IN ('rechazo','aviso')
     AND ev.codigo NOT IN ('VALIDADO','INSTRUCCION','AVISO','NOMBRE_OTRO_PERIODO') ORDER BY ev.id DESC LIMIT 1),
  a.motivo, f.clave, c.numero_mask, a.periodo, a.recibido_at, a.sha256
FROM bancos.archivos a
LEFT JOIN bancos.archivos z ON z.id = a.zip_origen_id
LEFT JOIN bancos.cuentas c ON c.id = a.cuenta_id
LEFT JOIN bancos.fuentes_solicitud f ON f.journal_odoo = c.journal_odoo OR (a.cuenta_id IS NULL AND f.tipo_archivo = a.tipo_detectado)
WHERE (a.estado IN ('rechazado','no_cuadra','sospechoso') OR (a.estado = 'formato_no_soportado' AND a.cuenta_id IS NULL))
  AND a.recibido_at::date <= p_hoy
  AND (
    (a.cuenta_id IS NOT NULL AND a.periodo IS NOT NULL AND EXISTS (SELECT 1 FROM abiertos x WHERE x.fuente = f.clave AND x.periodo = a.periodo))
    OR ((a.cuenta_id IS NULL OR a.periodo IS NULL) AND a.recibido_at::date > p_hoy - (SELECT n FROM dias))
  )
ORDER BY a.recibido_at, a.id
$fn$;

-- Hilo vigente: la última solicitud real (sus acuses responden a ella).
CREATE OR REPLACE FUNCTION bancos.f_hilo(p_modo text DEFAULT 'real') RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT to_jsonb(x) FROM (
    SELECT id, message_id, asunto, thread_index, hoy, total_abiertos FROM bancos.correos
    WHERE modo = p_modo AND tipo = 'solicitud' ORDER BY id DESC LIMIT 1) x
$fn$;

-- ¿Toca solicitud hoy?, y con qué contenido. p_modo='prueba' ignora la bitácora de envíos reales del día.
CREATE OR REPLACE FUNCTION bancos.f_solicitud(p_hoy date, p_modo text DEFAULT 'real', p_frecuencia text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
DECLARE
  frec text := coalesce(p_frecuencia, (SELECT valor FROM bancos.parametros WHERE clave = 'rezago_frecuencia'), 'diario');
  desde date := coalesce((SELECT valor::date FROM bancos.parametros WHERE clave = 'solicitud_desde'), p_hoy);
  habil boolean := bancos.es_dia_habil(p_hoy);
  reciente char(7) := bancos.periodo_exigible(p_hoy);
  es_lunes boolean := bancos.primer_habil_semana(p_hoy) = p_hoy;
  todos jsonb; visibles jsonb; rech jsonb; total int; ult_final bigint; ult_otro bigint; ya_hoy boolean;
  tipo text; razon text; mas_antiguo int;
  leido boolean := EXISTS (SELECT 1 FROM bancos.corridas k WHERE k.graph_ok AND k.origen IN ('cron','inventario','manual')
                                AND k.terminada_at > now() - interval '26 hours');
BEGIN
  IF frec NOT IN ('diario','semanal') THEN frec := 'diario'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.orden, f.periodo), '[]'::jsonb), count(*), coalesce(max(f.dias_habiles), 0)
    INTO todos, total, mas_antiguo FROM bancos.f_faltantes(p_hoy) f;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO visibles FROM jsonb_array_elements(todos) x
   WHERE frec = 'diario' OR es_lunes OR (x->>'es_mes_reciente')::boolean;
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO rech FROM bancos.f_rechazos(p_hoy) r;
  SELECT max(c.id) FILTER (WHERE c.tipo = 'final'), max(c.id) FILTER (WHERE c.tipo IN ('solicitud','acuse')),
         bool_or(c.hoy = p_hoy AND c.tipo IN ('solicitud','final'))
    INTO ult_final, ult_otro, ya_hoy FROM bancos.correos c WHERE c.modo = 'real';
  IF p_modo = 'prueba' THEN ya_hoy := false; END IF;
  tipo := 'nada';
  IF p_hoy < desde THEN razon := 'antes de ' || desde;
  ELSIF NOT habil THEN razon := 'día inhábil';
  ELSIF coalesce(ya_hoy, false) THEN razon := 'ya salió un correo hoy';
  ELSIF NOT leido AND p_modo = 'real' THEN tipo := 'aviso_esteban'; razon := 'sin lectura completa del buzón en las últimas 26 h: la lista no es confiable';
  ELSIF total = 0 THEN
    IF ult_otro IS NOT NULL AND (ult_final IS NULL OR ult_final < ult_otro) THEN tipo := 'final'; razon := 'todo completo y validado';
    ELSE razon := 'nada abierto; silencio'; END IF;
  ELSIF jsonb_array_length(visibles) = 0 AND jsonb_array_length(rech) = 0 THEN
    razon := 'sólo rezago y la frecuencia es semanal: hoy no toca';
  ELSE tipo := 'solicitud'; razon := CASE WHEN bancos.primer_dia_habil(to_char(p_hoy, 'YYYY-MM')) = p_hoy
                                          THEN 'primer día hábil del mes' ELSE 'día hábil con faltantes abiertos' END;
  END IF;
  RETURN jsonb_build_object(
    'hoy', p_hoy, 'tipo', tipo, 'buzon_leido_26h', leido, 'razon', razon, 'modo', p_modo, 'frecuencia', frec, 'es_primer_habil_semana', es_lunes,
    'es_primer_habil_mes', bancos.primer_dia_habil(to_char(p_hoy, 'YYYY-MM')) = p_hoy,
    'periodo_reciente', reciente, 'siguiente_disponible', bancos.disponible_desde(to_char(to_date(reciente || '-01', 'YYYY-MM-DD') + interval '1 month', 'YYYY-MM')),
    'total', total, 'mas_antiguo_dias', mas_antiguo,
    'faltantes', visibles, 'rezago_omitido', total - jsonb_array_length(visibles),
    'rechazos', rech, 'hilo', bancos.f_hilo(p_modo),
    'para', (SELECT valor FROM bancos.parametros WHERE clave = 'correo_para'),
    'cc', (SELECT valor FROM bancos.parametros WHERE clave = 'correo_cc'),
    'buzon', (SELECT valor FROM bancos.parametros WHERE clave = 'buzon_nombre'),
    'instrucciones', (SELECT cuerpo_html FROM bancos.plantillas_correo WHERE clave = 'instrucciones'),
    'pie', (SELECT cuerpo_html FROM bancos.plantillas_correo WHERE clave = 'pie'));
END
$fn$;

-- Contenido del acuse de una corrida (tanda): validados, duplicados, rechazados y cuánto falta.
CREATE OR REPLACE FUNCTION bancos.f_acuse(p_corrida bigint, p_hoy date, p_modo text DEFAULT 'real')
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
WITH nuevos AS (
  SELECT a.*, z.nombre_original AS zip_nombre, c.numero_mask, c.banco, c.alias, c.moneda
  FROM bancos.archivos a LEFT JOIN bancos.archivos z ON z.id = a.zip_origen_id LEFT JOIN bancos.cuentas c ON c.id = a.cuenta_id
  WHERE a.corrida_id = p_corrida AND a.estado <> 'contenedor'
),
exactos AS (   -- mismo contenido (sha256) que algo ya recibido, en esta tanda o antes
  SELECT v.nombre, a.nombre_canonico, a.nombre_original, a.estado
  FROM bancos.avistamientos v JOIN bancos.archivos a ON a.id = v.archivo_id
  WHERE v.corrida_id = p_corrida AND a.estado <> 'contenedor'
    AND v.id > (SELECT min(v2.id) FROM bancos.avistamientos v2 WHERE v2.archivo_id = v.archivo_id)
),
piezas AS (    -- piezas de un ZIP apartadas sin abrirse (zip slip, contraseña, tamaño…)
  SELECT ev.datos->>'pieza' AS pieza, a.nombre_original AS zip, ev.codigo, ev.mensaje
  FROM bancos.corrida_eventos ev JOIN bancos.archivos a ON a.sha256 = ev.archivo_sha
  WHERE ev.corrida_id = p_corrida AND ev.nivel = 'rechazo' AND ev.datos ? 'pieza'
    AND (ev.codigo LIKE 'ZIP%' OR ev.codigo = 'ARCHIVO_DEMASIADO_GRANDE')
),
fal AS (SELECT * FROM bancos.f_faltantes(p_hoy))
SELECT jsonb_build_object(
  'corrida_id', p_corrida, 'hoy', p_hoy,
  'corrida', (SELECT to_jsonb(k) FROM (SELECT id, origen, iniciada_at, terminada_at, leidos, validados, rechazados, duplicados, graph_ok
                                        FROM bancos.corridas WHERE id = p_corrida) k),
  'validados', coalesce((SELECT jsonb_agg(jsonb_build_object('archivo', n.nombre_original, 'zip', n.zip_nombre,
       'cuenta', n.banco || ' ' || n.alias || ' ' || n.numero_mask, 'moneda', n.moneda, 'periodo', n.periodo,
       'aviso', (SELECT ev.mensaje FROM bancos.corrida_eventos ev WHERE ev.archivo_sha = n.sha256 AND ev.corrida_id = p_corrida
                  AND ev.codigo = 'NOMBRE_OTRO_PERIODO' ORDER BY ev.id DESC LIMIT 1),
       'v3', (SELECT v.resultado FROM bancos.estados_vigentes e JOIN bancos.validaciones_v3 v ON v.estado_id = e.id
               WHERE e.archivo_id = n.id ORDER BY v.id DESC LIMIT 1)) ORDER BY n.cuenta_id, n.periodo)
     FROM nuevos n WHERE n.estado = 'validado'), '[]'::jsonb),
  'duplicados', coalesce((SELECT jsonb_agg(x) FROM (
       SELECT jsonb_build_object('archivo', e.nombre, 'copia_de', coalesce(e.nombre_canonico, e.nombre_original), 'tipo', 'exacto') AS x FROM exactos e
       UNION ALL
       SELECT jsonb_build_object('archivo', n.nombre_original, 'zip', n.zip_nombre,
                                 'copia_de', substring(n.motivo FROM '''([^'']+)'''), 'tipo', 'mismo_mes_mismo_contenido')
       FROM nuevos n WHERE n.estado = 'duplicado') t), '[]'::jsonb),
  'rechazados', coalesce((SELECT jsonb_agg(x) FROM (
       SELECT jsonb_build_object('archivo', n.nombre_original, 'zip', n.zip_nombre, 'estado', n.estado, 'motivo', n.motivo,
         'codigo', (SELECT ev.codigo FROM bancos.corrida_eventos ev WHERE ev.archivo_sha = n.sha256 AND ev.corrida_id = p_corrida
                     AND ev.nivel IN ('rechazo','aviso') AND ev.codigo NOT IN ('VALIDADO','INSTRUCCION','AVISO','NOMBRE_OTRO_PERIODO') ORDER BY ev.id DESC LIMIT 1),
         'instruccion', (SELECT ev.mensaje FROM bancos.corrida_eventos ev WHERE ev.archivo_sha = n.sha256 AND ev.corrida_id = p_corrida
                     AND ev.codigo = 'INSTRUCCION' ORDER BY ev.id DESC LIMIT 1),
         'cuenta', CASE WHEN n.numero_mask IS NOT NULL THEN n.banco || ' ' || n.alias || ' ' || n.numero_mask END, 'periodo', n.periodo) AS x
       FROM nuevos n WHERE n.estado IN ('rechazado','no_cuadra','sospechoso','formato_no_soportado')
       UNION ALL
       SELECT jsonb_build_object('archivo', p.pieza, 'zip', p.zip, 'estado', 'rechazado', 'motivo', p.mensaje, 'codigo', p.codigo) FROM piezas p) t), '[]'::jsonb),
  'total', (SELECT count(*) FROM fal),
  'mas_antiguo_dias', (SELECT coalesce(max(dias_habiles), 0) FROM fal),
  'faltantes', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.orden, f.periodo) FROM fal f), '[]'::jsonb),
  'periodo_reciente', bancos.periodo_exigible(p_hoy),
  'siguiente_disponible', bancos.disponible_desde(to_char(to_date(bancos.periodo_exigible(p_hoy) || '-01', 'YYYY-MM-DD') + interval '1 month', 'YYYY-MM')),
  'hilo', bancos.f_hilo(p_modo), 'modo', p_modo,
  'para', (SELECT valor FROM bancos.parametros WHERE clave = 'correo_para'),
  'cc', (SELECT valor FROM bancos.parametros WHERE clave = 'correo_cc'),
  'buzon', (SELECT valor FROM bancos.parametros WHERE clave = 'buzon_nombre'),
  'pie', (SELECT cuerpo_html FROM bancos.plantillas_correo WHERE clave = 'pie'))
$fn$;

-- registrar un correo (el workflow manda el renglón en JSON codificado en base64: un solo parámetro,
-- sin comas ni comillas que partir)
CREATE OR REPLACE FUNCTION bancos.registrar_correo(p_b64 text) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
DECLARE j jsonb := convert_from(decode(p_b64, 'base64'), 'UTF8')::jsonb; nuevo bigint;
BEGIN
  INSERT INTO bancos.correos (tipo, modo, hoy, message_id, in_reply_to, thread_index, asunto, para, cc, total_abiertos,
                              corrida_id, graph_status, detalle)
  VALUES (j->>'tipo', j->>'modo', (j->>'hoy')::date, j->>'message_id', nullif(j->>'in_reply_to', ''), j->>'thread_index',
          j->>'asunto', ARRAY(SELECT jsonb_array_elements_text(j->'para')), ARRAY(SELECT jsonb_array_elements_text(coalesce(j->'cc', '[]'))),
          (j->>'total_abiertos')::int, nullif(j->>'corrida_id', '')::bigint, nullif(j->>'graph_status', '')::int,
          coalesce(j->'detalle', '{}'::jsonb))
  ON CONFLICT (message_id) DO NOTHING RETURNING id INTO nuevo;
  RETURN nuevo;
END
$fn$;

-- corridas del buzón terminadas que todavía no tienen acuse real
CREATE OR REPLACE FUNCTION bancos.f_corridas_sin_acuse() RETURNS TABLE (corrida_id bigint, terminada_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT k.id, k.terminada_at FROM bancos.corridas k
  WHERE k.origen = 'cron' AND k.terminada_at IS NOT NULL AND k.graph_ok
    AND k.terminada_at > coalesce((SELECT valor::timestamptz FROM bancos.parametros WHERE clave = 'acuse_desde'), now())
    AND (k.leidos > 0 OR EXISTS (SELECT 1 FROM bancos.avistamientos v WHERE v.corrida_id = k.id))
    AND NOT EXISTS (SELECT 1 FROM bancos.correos c WHERE c.corrida_id = k.id AND c.modo = 'real' AND c.tipo IN ('acuse','final'))
  ORDER BY k.id
$fn$;

-- ── 9. vistas de sólo lectura (contrato en docs/bancos/VISTAS.md) ──
CREATE OR REPLACE VIEW bancos.v_estados_validados AS
SELECT e.id AS estado_id, c.banco, c.alias, c.numero_mask, c.moneda, c.journal_odoo, e.periodo, e.periodo_inicio, e.periodo_fin,
       e.saldo_inicial, e.saldo_final, e.total_cargos, e.num_cargos, e.total_abonos, e.num_abonos, e.comisiones,
       e.num_movimientos, e.v1_ok, e.v2_ok, v3.resultado AS v3_resultado, v3.diferencia AS v3_diferencia,
       CASE WHEN v3.resultado IN ('ok','primero') THEN 'validado'
            WHEN v3.resultado IN ('hueco','sin_anterior') THEN 'validado_hueco_registrado'
            WHEN v3.resultado = 'descuadre' THEN 'descuadre_continuidad'
            ELSE 'v3_pendiente' END AS estado_validacion,
       a.nombre_canonico AS archivo, a.sha256, e.paginas, e.parser_version, e.huella, e.creado_at
FROM bancos.estados_vigentes e
JOIN bancos.archivos a ON a.id = e.archivo_id
JOIN bancos.cuentas c ON c.id = e.cuenta_id
LEFT JOIN LATERAL (SELECT resultado, diferencia FROM bancos.validaciones_v3 v WHERE v.estado_id = e.id ORDER BY v.id DESC LIMIT 1) v3 ON true
WHERE a.estado = 'validado' AND e.v1_ok AND e.v2_ok;

CREATE OR REPLACE VIEW bancos.v_movimientos_validados AS
SELECT m.id AS movimiento_id, ve.estado_id, ve.banco, ve.alias, ve.numero_mask, ve.moneda, ve.journal_odoo, ve.periodo,
       m.renglon, m.fecha_operacion, m.fecha_liquidacion, m.codigo, m.descripcion, m.referencia,
       m.cargo, m.abono, m.abono - m.cargo AS neto, m.saldo_calculado, m.saldo_operacion_impreso,
       coalesce(k.categoria, 'sin_clasificar') AS categoria, k.subcategoria, coalesce(k.contraparte, m.contraparte) AS contraparte,
       coalesce(k.es_traspaso_interno, false) AS es_traspaso_interno, k.par_traspaso_id, k.regla, k.confianza, k.version AS version_clasificacion,
       ve.estado_validacion, ve.archivo, m.pagina, ve.sha256, m.hash
FROM bancos.movimientos m
JOIN bancos.v_estados_validados ve ON ve.estado_id = m.estado_id
LEFT JOIN bancos.clasificacion_vigente k ON k.movimiento_id = m.id;

CREATE OR REPLACE VIEW bancos.v_saldos_mensuales AS
SELECT ve.banco, ve.alias, ve.numero_mask, ve.moneda, ve.journal_odoo, ve.periodo,
       ve.saldo_inicial, ve.saldo_final, ve.total_abonos, ve.total_cargos, ve.total_abonos - ve.total_cargos AS neto,
       coalesce(sum(m.abono) FILTER (WHERE mv.es_traspaso_interno), 0) AS abonos_traspaso_interno,
       coalesce(sum(m.cargo) FILTER (WHERE mv.es_traspaso_interno), 0) AS cargos_traspaso_interno,
       ve.total_abonos - coalesce(sum(m.abono) FILTER (WHERE mv.es_traspaso_interno), 0) AS abonos_externos,
       ve.total_cargos - coalesce(sum(m.cargo) FILTER (WHERE mv.es_traspaso_interno), 0) AS cargos_externos,
       ve.estado_validacion, ve.archivo, 1 AS pagina_resumen, ve.sha256
FROM bancos.v_estados_validados ve
LEFT JOIN bancos.movimientos m ON m.estado_id = ve.estado_id
LEFT JOIN bancos.clasificacion_vigente mv ON mv.movimiento_id = m.id
GROUP BY ve.estado_id, ve.banco, ve.alias, ve.numero_mask, ve.moneda, ve.journal_odoo, ve.periodo, ve.saldo_inicial, ve.saldo_final,
         ve.total_abonos, ve.total_cargos, ve.estado_validacion, ve.archivo, ve.sha256;

CREATE OR REPLACE VIEW bancos.v_faltantes AS
SELECT * FROM bancos.f_faltantes(bancos.hoy_mty());

CREATE OR REPLACE VIEW bancos.v_cotejo_odoo AS
SELECT k.id AS corrida_id, k.terminada_at AS corrido_at, co.journal_id,
       to_char(coalesce(m.fecha_operacion, co.odoo_fecha), 'YYYY-MM') AS periodo,
       count(*) FILTER (WHERE co.estado = 'exacto')         AS exactos,
       count(*) FILTER (WHERE co.estado = 'probable')       AS probables,
       count(*) FILTER (WHERE co.estado = 'sin_match')      AS banco_sin_odoo,
       count(*) FILTER (WHERE co.estado = 'odoo_sin_banco') AS odoo_sin_banco,
       count(*) FILTER (WHERE co.movimiento_id IS NOT NULL) AS movimientos_banco,
       CASE WHEN count(*) FILTER (WHERE co.movimiento_id IS NOT NULL) = 0 THEN NULL
            ELSE round(100.0 * count(*) FILTER (WHERE co.estado IN ('exacto','probable'))
                       / count(*) FILTER (WHERE co.movimiento_id IS NOT NULL), 1) END AS cobertura_odoo_pct,
       ve.archivo, ve.sha256
FROM bancos.cotejo_odoo co
JOIN bancos.corridas k ON k.id = co.corrida_id
LEFT JOIN bancos.movimientos m ON m.id = co.movimiento_id
LEFT JOIN bancos.v_estados_validados ve ON ve.journal_odoo = co.journal_id
      AND ve.periodo = to_char(coalesce(m.fecha_operacion, co.odoo_fecha), 'YYYY-MM')
GROUP BY k.id, k.terminada_at, co.journal_id, to_char(coalesce(m.fecha_operacion, co.odoo_fecha), 'YYYY-MM'), ve.archivo, ve.sha256;

COMMENT ON VIEW bancos.v_estados_validados IS 'Contrato: docs/bancos/VISTAS.md. Un renglón por estado de cuenta que pasó V1 y V2.';
COMMENT ON VIEW bancos.v_movimientos_validados IS 'Contrato: docs/bancos/VISTAS.md. Sólo movimientos de estados validados, con clasificación vigente y par de traspaso.';
COMMENT ON VIEW bancos.v_saldos_mensuales IS 'Contrato: docs/bancos/VISTAS.md. Por cuenta y mes, en moneda original.';
COMMENT ON VIEW bancos.v_faltantes IS 'Contrato: docs/bancos/VISTAS.md. Lo que alimenta la solicitud y los acuses, a la fecha de Monterrey.';
COMMENT ON VIEW bancos.v_cotejo_odoo IS 'Contrato: docs/bancos/VISTAS.md. Resultado del cotejo por corrida, journal y mes (historial: una fila por corrida).';

-- ── 10. rol de lectura ──
DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bancos_lector') THEN
    CREATE ROLE bancos_lector NOLOGIN;
  END IF;
END
$rol$;
GRANT USAGE ON SCHEMA bancos TO bancos_lector;
REVOKE ALL ON ALL TABLES IN SCHEMA bancos FROM bancos_lector;
GRANT SELECT ON bancos.v_estados_validados, bancos.v_movimientos_validados, bancos.v_saldos_mensuales,
                bancos.v_faltantes, bancos.v_cotejo_odoo TO bancos_lector;

-- Funciones: nada para PUBLIC. v_faltantes llama a f_faltantes/hoy_mty con los permisos de quien consulta,
-- por eso el lector sólo tiene EXECUTE sobre esas dos (definer, sólo lectura).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA bancos FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bancos.f_faltantes(date), bancos.hoy_mty() TO bancos_lector;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA bancos TO bancos_app;

-- bancos_app: lee las tablas nuevas, escribe la bitácora de correos; configuración sólo por migración.
GRANT SELECT ON bancos.dias_inhabiles, bancos.parametros, bancos.plantillas_correo, bancos.fuentes_solicitud,
                bancos.revisiones_manuales, bancos.correos TO bancos_app;
GRANT INSERT ON bancos.correos, bancos.revisiones_manuales TO bancos_app;
GRANT UPDATE (graph_status, detalle) ON bancos.correos TO bancos_app;
REVOKE INSERT ON bancos.dias_inhabiles, bancos.parametros, bancos.plantillas_correo, bancos.fuentes_solicitud FROM bancos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA bancos TO bancos_app;
GRANT SELECT ON ALL TABLES IN SCHEMA bancos TO bancos_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA bancos FROM bancos_app, bancos_lector;
