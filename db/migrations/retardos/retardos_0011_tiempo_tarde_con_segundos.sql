-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0011_tiempo_tarde_con_segundos · La tabla del aviso muestra min:seg (#386)
--
-- La tolerancia es de 15 minutos AL SEGUNDO, pero la tabla del correo mostraba los
-- minutos enteros: quien checó a las 07:15:16 con entrada a las 07:00 veía
-- "15 minutos tarde" junto al texto "llegar a los 15 minutos exactos no es
-- retardo". Medido en la vista previa del piloto del 7-oct-2026. Ahora la columna
-- es "Tiempo tarde (min:seg)" y dice 15:16, calculado de las mismas horas que ya
-- muestra la tabla. Si la hora de llegada no trae segundos, sale :00. Si algo no se
-- puede leer, se queda el número de minutos de antes.
-- Sin guiones largos. Sin datos personales.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION retardos.seg_de_hora(p text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN p ~ ('^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?' || chr(36)) THEN
    split_part(p, ':', 1)::int * 3600 + split_part(p, ':', 2)::int * 60 + coalesce(nullif(split_part(p, ':', 3), '')::int, 0)
  END
$fn$;

CREATE OR REPLACE FUNCTION retardos.tiempo_tarde(p_llegada text, p_esperada text, p_minutos text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN d IS NOT NULL AND d > 0 THEN (d / 60)::text || ':' || lpad((d % 60)::text, 2, '0')
              ELSE coalesce(p_minutos, '') END
    FROM (SELECT retardos.seg_de_hora(p_llegada) - retardos.seg_de_hora(p_esperada) AS d) z
$fn$;

CREATE OR REPLACE FUNCTION retardos.tabla_retardos(p_datos jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT '<table style="border-collapse:collapse;font-size:14px"><tr>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Fecha</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Hora de llegada</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Hora de entrada</th>'
      || '<th style="border:1px solid #ccc;padding:4px 8px">Tiempo tarde (min:seg)</th></tr>'
      || coalesce(string_agg('<tr><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'fecha')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'llegada')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">' || (x->>'esperada')
        || '</td><td style="border:1px solid #ccc;padding:4px 8px">'
        || retardos.tiempo_tarde(x->>'llegada', x->>'esperada', x->>'minutos') || '</td></tr>', ''), '')
      || '</table>'
  FROM jsonb_array_elements(p_datos->'retardos') x
$fn$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;
