-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0011 · la solicitud y el acuse piden y reportan Jeeves (issue #352)
--
-- ⚠️ SE APLICA DESPUÉS de que el servicio fts-bancos con el lector de Jeeves esté desplegado
-- (merge del PR de #352 a la rama de despliegue). Antes de eso, un PDF o CSV de Jeeves que Gerardo
-- subiera no se leería y quedaría como formato no soportado: se pediría algo que todavía no se
-- puede recibir bien (regla anti-trabón de CLAUDE.md §8: primero la mitad tolerante).
--
--   1. Jeeves PDF se pide desde enero 2025 (rezago: enero 2025 a agosto 2026). Está disponible el
--      primer día hábil DESPUÉS de la Statement Date (el día 1 del mes siguiente).
--   2. Fuente nueva 'jeeves_csv': el CSV de transacciones, uno por año. Un año cerrado se cierra con
--      cualquier CSV de ese año descargado después de su último ciclo; el año en curso se vuelve a
--      pedir cada mes, descargado después del ciclo que cerró.
--   3. f_faltantes: lo de arriba, y un PDF de Jeeves que no cuadra se reporta como 'no_cuadra'.
--   4. f_acuse: los validados de Jeeves dicen qué son (estado de cuenta o CSV, con sus conteos).
--   5. Instrucciones del correo: cómo bajar el PDF del ciclo y el CSV del año desde Jeeves.
-- Sin datos bancarios. Etiquetas de dólar con nombre (§20 #10).
-- ═══════════════════════════════════════════════════════════════════════════

-- primer día hábil DESPUÉS de la Statement Date (el día 1 del mes siguiente al ciclo)
CREATE OR REPLACE FUNCTION bancos.disponible_jeeves(p char(7)) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = bancos, pg_temp AS $fn$
  SELECT min(d)::date FROM generate_series(to_date(p || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '1 day',
                                           to_date(p || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '15 days', interval '1 day') g(d)
  WHERE bancos.es_dia_habil(d::date)
$fn$;
REVOKE EXECUTE ON FUNCTION bancos.disponible_jeeves(char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bancos.disponible_jeeves(char) TO bancos_app, bancos_lector;

UPDATE bancos.fuentes_solicitud SET periodo_inicio = '2025-01', etiqueta = 'Jeeves, estado de cuenta (PDF)' WHERE clave = 'jeeves';
INSERT INTO bancos.fuentes_solicitud (clave, etiqueta, tipo, journal_odoo, tipo_archivo, periodo_inicio, orden)
VALUES ('jeeves_csv', 'Jeeves, CSV de transacciones', 'jeeves', 61, 'jeeves_csv', '2025-01', 6)
ON CONFLICT (clave) DO NOTHING;

UPDATE bancos.plantillas_correo SET version = version + 1, actualizado_at = now(), cuerpo_html = replace(cuerpo_html,
$viejo$
<p style="margin:0 0 6px"><b>Jeeves</b></p>
<ol style="margin:0 0 10px">
<li>Descargar desde la plataforma el estado de cuenta mensual de la tarjeta en PDF.</li>
</ol>$viejo$,
$nuevo$
<p style="margin:0 0 6px"><b>Jeeves</b></p>
<ol style="margin:0 0 10px">
<li>Estado de cuenta: descargar el PDF de cada ciclo (Statement) completo, con todas sus páginas. Está disponible desde el primer día hábil después de la fecha del estado.</li>
<li>Transacciones: exportar el CSV del año completo (el portal deja un año a la vez), sin abrirlo ni editarlo. El del año en curso se vuelve a descargar cada mes; el sistema no duplica lo que ya tenía.</li>
</ol>$nuevo$)
WHERE clave = 'instrucciones' AND cuerpo_html LIKE '%Descargar desde la plataforma el estado de cuenta mensual de la tarjeta en PDF.%';

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
-- #352: Jeeves se puede pedir desde el primer día hábil DESPUÉS de la Statement Date (el día 1), así que su último mes exigible puede ir un mes atrás
ult AS (
  SELECT fu.clave, CASE WHEN fu.tipo = 'jeeves' AND p_hoy < bancos.disponible_jeeves(lim.ultimo)
                        THEN to_char(to_date(lim.ultimo || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM')::char(7) ELSE lim.ultimo END AS ultimo
  FROM fu, lim
),
per AS (
  SELECT fu.*, to_char(g, 'YYYY-MM')::char(7) AS periodo, u.ultimo
  FROM fu JOIN ult u ON u.clave = fu.clave,
       generate_series(to_date(fu.periodo_inicio || '-01', 'YYYY-MM-DD'), to_date(u.ultimo || '-01', 'YYYY-MM-DD'), interval '1 month') g
  WHERE coalesce(fu.tipo_archivo, '') <> 'jeeves_csv'
  UNION ALL
  -- el CSV de Jeeves es un archivo por año: un renglón por año (diciembre en los años cerrados, el último mes exigible en el año en curso)
  SELECT fu.*, CASE WHEN y < extract(year FROM to_date(u.ultimo || '-01', 'YYYY-MM-DD'))::int THEN (y::text || '-12')::char(7) ELSE u.ultimo END, u.ultimo
  FROM fu JOIN ult u ON u.clave = fu.clave,
       generate_series(substr(fu.periodo_inicio, 1, 4)::int, extract(year FROM to_date(u.ultimo || '-01', 'YYYY-MM-DD'))::int) y
  WHERE fu.tipo_archivo = 'jeeves_csv'
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
      WHEN p.tipo_archivo = 'jeeves_csv' THEN
        CASE WHEN EXISTS (SELECT 1 FROM bancos.jeeves_csv_cargas cg JOIN bancos.archivos a ON a.id = cg.archivo_id AND a.estado = 'validado'
                            WHERE cg.anio = substr(p.periodo, 1, 4)::int AND cg.fecha_descarga >= bancos.disponible_jeeves(p.periodo)) THEN NULL
             ELSE 'csv_anual' END
      WHEN p.tipo = 'jeeves' AND EXISTS (SELECT 1 FROM bancos.archivos a WHERE a.tipo_detectado = 'jeeves' AND a.periodo = p.periodo AND a.estado = 'validado') THEN NULL
      WHEN p.tipo = 'jeeves' AND EXISTS (SELECT 1 FROM bancos.archivos a WHERE a.tipo_detectado = 'jeeves' AND a.periodo = p.periodo AND a.estado = 'no_cuadra') THEN 'no_cuadra'
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
    WHEN 'csv_anual'         THEN 'falta el CSV de transacciones de ' || substr(s.periodo, 1, 4) ||
                                  CASE WHEN s.periodo = s.ultimo THEN ' descargado a partir del ' || to_char(bancos.disponible_jeeves(s.periodo), 'DD-MM-YYYY') || ' (el del año en curso se vuelve a pedir cada mes)'
                                       ELSE ' (el año completo)' END
    WHEN 'recibido_sin_lector' THEN 'ya llegó un archivo de este tipo, pero el sistema todavía no lee ese formato ni sabe de qué mes es; no hay que hacer nada'
  END,
  CASE WHEN s.tipo = 'jeeves' THEN bancos.disponible_jeeves(s.periodo) ELSE bancos.disponible_desde(s.periodo) END,
  greatest(bancos.dias_habiles(CASE WHEN s.tipo = 'jeeves' THEN bancos.disponible_jeeves(s.periodo) ELSE bancos.disponible_desde(s.periodo) END, p_hoy), 0),
  s.periodo = s.ultimo,
  coalesce(s.conflicto->>'archivo', s.no_cuadra->>'archivo', s.val->>'archivo'),
  coalesce(s.conflicto->>'sha', s.no_cuadra->>'sha', s.val->>'sha'),
  NULL::integer
FROM estado s
WHERE s.motivo IS NOT NULL
ORDER BY s.orden, s.periodo
$fn$;

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
       'cuenta', coalesce(n.banco || ' ' || n.alias || ' ' || n.numero_mask,
                          CASE n.tipo_detectado WHEN 'jeeves' THEN 'Jeeves, estado de cuenta'
                            WHEN 'jeeves_csv' THEN 'Jeeves, CSV de transacciones ' || (SELECT cg.anio FROM bancos.jeeves_csv_cargas cg WHERE cg.archivo_id = n.id) END),
       'tipo', n.tipo_detectado, 'moneda', coalesce(n.moneda, 'MXN'), 'periodo', n.periodo,
       'csv', (SELECT jsonb_build_object('anio', cg.anio, 'filas', cg.filas, 'nuevas', cg.nuevas, 'versiones_nuevas', cg.versiones_nuevas, 'repetidas', cg.repetidas)
               FROM bancos.jeeves_csv_cargas cg WHERE cg.archivo_id = n.id),
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
         'cuenta', CASE WHEN n.numero_mask IS NOT NULL THEN n.banco || ' ' || n.alias || ' ' || n.numero_mask
                        WHEN n.tipo_detectado IN ('jeeves','jeeves_csv') THEN 'Jeeves' WHEN n.tipo_detectado = 'payana' THEN 'Payana' END, 'periodo', n.periodo) AS x
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
