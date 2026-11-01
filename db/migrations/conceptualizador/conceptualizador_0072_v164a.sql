-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0072 · V1.64a parte 12 (fts-conceptualizador#20 punto 1, Esteban 1-nov-2026) · MÉTRICAS POR CASO
--
-- Solo lectura. Cada número dice de dónde sale (tabla y campo), y va en `fuente` dentro del propio resultado:
--   primera_nota        min(mensaje.created_at) con rol 'usuario'
--   primer_borrador     min(accion.hecha_at) con tipo 'crear_borrador', estado 'hecha' y resultado.subtotal (la orden releída de Odoo)
--   minutos_a_borrador  la diferencia de los dos
--   toques              mensajes de la persona (texto / nota de voz o archivo, por adjunto.clase) + clics: evento con autor que no es
--                       el motor + rayito_clic.actor
--   decisiones          voz_rafaga.directos (aplicadas sin clic) · voz_rafaga.propuestos (quedaron en tarjeta) · accion 'voz_entendi'
--                       hecha_por la persona (aprobadas con clic) · «sí, aplícalo…» por texto, y si le siguió una versión del motor
--                       antes del siguiente mensaje de la persona (aplicada sin clic)
--   afirmaciones        renglones de mensajes del motor que EMPIEZAN con «✓» y nombran SO###/Odoo. Si traen montos, cada monto se
--                       busca en el resultado de la orden releída de esa vuelta (accion crear_borrador del mismo trabajo o la última
--                       antes del mensaje): está = sostenida; falta alguno = no sostenida; sin monto = no medible desde la base.
--                       Además, los renglones con «⚠» que nombran SO/Odoo (avisos honestos).
--   versiones           comercial.machote_version del machote del caso (persona / motor)
--   reintentos_odoo     falla_odoo del caso + renglones del motor con «2 intentos» / «2 attempts» (el reintento de D247)
-- metricas_resumen(desde, hasta): una fila por dueño y por día de la primera nota, con las mismas sumas.
-- hilo(): agrega la llave `metricas` SOLO si prendido_caso('metricas_caso_v164', caso). Apagado, hilo() devuelve lo mismo que antes.
-- ORDEN: 0071 → 0072. Aditiva e idempotente. Reversa: reversas/072_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.metricas_caso(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $mc72$
WITH k AS (SELECT * FROM conceptualizador.caso WHERE id = p_caso),
mu AS (SELECT m.*, EXISTS (SELECT 1 FROM conceptualizador.adjunto a WHERE a.mensaje_id = m.id AND a.clase = 'audio') AS voz,
              jsonb_array_length(coalesce(m.adjuntos, '[]'::jsonb)) > 0 AS con_adj
         FROM conceptualizador.mensaje m WHERE m.caso_id = p_caso AND m.rol = 'usuario'),
br AS (SELECT a.* FROM conceptualizador.accion a WHERE a.caso_id = p_caso AND a.tipo = 'crear_borrador' AND a.estado = 'hecha'
         AND a.resultado ? 'subtotal'),
ev AS (SELECT e.* FROM conceptualizador.evento e WHERE e.caso_id = p_caso AND coalesce(e.autor, '') !~ '^motor'),
ry AS (SELECT r.* FROM conceptualizador.rayito_clic r WHERE r.caso_id = p_caso AND coalesce(r.actor, '') !~ '^motor'),
vr AS (SELECT r.* FROM conceptualizador.voz_rafaga r WHERE r.caso_id = p_caso),
mv AS (SELECT v.* FROM comercial.machote_version v JOIN k ON v.machote_id = k.machote_id),
ap AS (SELECT u.id, u.created_at,
              EXISTS (SELECT 1 FROM mv WHERE mv.autor = 'motor' AND mv.creada_at > u.created_at
                        AND mv.creada_at < coalesce((SELECT min(u2.created_at) FROM mu u2 WHERE u2.created_at > u.created_at), 'infinity')) AS aplicada
         FROM mu u WHERE btrim(u.texto) ~* '^s[ií][,.]?\s+apl[ií]ca(lo|la)'),
ln AS (SELECT m.id AS msg, m.trabajo_id, m.created_at, btrim(l) AS l
         FROM conceptualizador.mensaje m, regexp_split_to_table(m.texto, E'\n') l
        WHERE m.caso_id = p_caso AND m.rol = 'motor' AND btrim(l) ~* '(SO[0-9]{3,}|odoo)'),
af AS (SELECT ln.*,
              ARRAY(SELECT x[1] FROM regexp_matches(ln.l, '([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]+\.[0-9]{2})', 'g') x) AS montos,
              coalesce((SELECT b.resultado FROM br b WHERE b.trabajo_id IS NOT NULL AND b.trabajo_id = ln.trabajo_id ORDER BY b.hecha_at DESC LIMIT 1),
                       (SELECT b.resultado FROM br b WHERE b.hecha_at <= ln.created_at + interval '5 seconds' ORDER BY b.hecha_at DESC LIMIT 1)) AS rb
         FROM ln WHERE left(ln.l, 1) = '✓'),
afv AS (SELECT af.*, cardinality(af.montos) = 0 AS sin_monto,
               af.rb IS NOT NULL AND cardinality(af.montos) > 0 AND NOT EXISTS (
                 SELECT 1 FROM unnest(af.montos) mo
                  WHERE position(mo IN af.rb::text) = 0
                    AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(af.rb, 'strict $.**') v
                                     WHERE jsonb_typeof(v) = 'number' AND round(v::text::numeric, 2) = round(replace(mo, ',', '')::numeric, 2))) AS sostenida
          FROM af)
SELECT jsonb_build_object(
  'caso', p_caso, 'dueno', (SELECT autor FROM k), 'version_metricas', 1,
  'primera_nota', (SELECT min(created_at) FROM mu),
  'primer_borrador', (SELECT min(hecha_at) FROM br),
  'primer_borrador_so', (SELECT b.resultado->>'orden_nombre' FROM br b ORDER BY b.hecha_at LIMIT 1),
  'minutos_a_borrador', round(extract(epoch FROM ((SELECT min(hecha_at) FROM br) - (SELECT min(created_at) FROM mu))) / 60.0, 1),
  'toques', jsonb_build_object(
     'total', (SELECT count(*) FROM mu) + (SELECT count(*) FROM ev) + (SELECT count(*) FROM ry),
     'mensajes_texto', (SELECT count(*) FROM mu WHERE NOT con_adj),
     'notas_voz', (SELECT count(*) FROM mu WHERE voz),
     'otros_adjuntos', (SELECT count(*) FROM mu WHERE con_adj AND NOT voz),
     'clics', (SELECT count(*) FROM ev) + (SELECT count(*) FROM ry),
     'clics_por_tipo', coalesce((SELECT jsonb_object_agg(t, n) FROM (SELECT coalesce(e.tipo || ':' || e.concepto, e.tipo) t, count(*) n FROM ev e GROUP BY 1) z), '{}'::jsonb),
     'rayito', (SELECT count(*) FROM ry)),
  'decisiones', jsonb_build_object(
     'sin_clic_voz', coalesce((SELECT sum(directos) FROM vr), 0),
     'en_tarjeta_voz', coalesce((SELECT sum(propuestos) FROM vr), 0),
     'aprobadas_con_clic', (SELECT count(*) FROM conceptualizador.accion a JOIN k ON a.caso_id = k.id
                             WHERE a.tipo = 'voz_entendi' AND a.estado = 'hecha' AND a.hecha_por IS NOT NULL AND a.hecha_por !~ '^(motor|agente)'),
     'texto_aplicalo', (SELECT count(*) FROM ap),
     'texto_aplicalo_aplicadas', (SELECT count(*) FROM ap WHERE aplicada),
     'rafagas', (SELECT count(*) FROM vr),
     'rafagas_odoo_ok', (SELECT count(*) FROM vr WHERE odoo_ok IS TRUE),
     'rafagas_odoo_no', (SELECT count(*) FROM vr WHERE odoo_ok IS FALSE)),
  'afirmaciones', jsonb_build_object(
     'total', (SELECT count(*) FROM afv),
     'sostenidas', (SELECT count(*) FROM afv WHERE sostenida),
     'no_sostenidas', (SELECT count(*) FROM afv WHERE NOT sin_monto AND NOT sostenida),
     'sin_monto', (SELECT count(*) FROM afv WHERE sin_monto),
     'avisos', (SELECT count(*) FROM ln WHERE left(ln.l, 1) = '⚠'),
     'no_sostenidas_detalle', coalesce((SELECT jsonb_agg(jsonb_build_object('msg', msg, 'montos', to_jsonb(montos), 'renglon', left(l, 160)) ORDER BY msg)
                                         FROM afv WHERE NOT sin_monto AND NOT sostenida), '[]'::jsonb)),
  'versiones', jsonb_build_object(
     'total', (SELECT count(*) FROM mv),
     'persona', (SELECT count(*) FROM mv WHERE autor <> 'motor'),
     'motor', (SELECT count(*) FROM mv WHERE autor = 'motor'),
     'ultima', (SELECT max(version) FROM mv)),
  'reintentos_odoo', jsonb_build_object(
     'fallas', (SELECT count(*) FROM conceptualizador.falla_odoo f WHERE f.caso_id = p_caso),
     'releida_2_intentos', (SELECT count(*) FROM ln WHERE ln.l ~* '(2 intentos|2 attempts)'),
     'total', (SELECT count(*) FROM conceptualizador.falla_odoo f WHERE f.caso_id = p_caso) + (SELECT count(*) FROM ln WHERE ln.l ~* '(2 intentos|2 attempts)')),
  'fuente', jsonb_build_object(
     'primera_nota', 'mensaje.created_at, rol usuario',
     'primer_borrador', 'accion.hecha_at, tipo crear_borrador, estado hecha, con resultado.subtotal',
     'toques', 'mensaje rol usuario (+ adjunto.clase audio) · evento.autor no motor · rayito_clic.actor',
     'decisiones', 'voz_rafaga.directos / propuestos · accion voz_entendi hecha_por persona · mensaje «sí, aplícalo» + comercial.machote_version autor motor',
     'afirmaciones', 'mensaje rol motor, renglón que empieza con ✓ y nombra SO/Odoo; montos contra accion.resultado (orden releída)',
     'versiones', 'comercial.machote_version por caso.machote_id',
     'reintentos_odoo', 'falla_odoo + renglón del motor «2 intentos»'))
FROM (SELECT 1) uno WHERE EXISTS (SELECT 1 FROM k)
$mc72$;
ALTER FUNCTION conceptualizador.metricas_caso(uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.metricas_caso(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.metricas_resumen(p_desde date, p_hasta date) RETURNS jsonb
LANGUAGE sql STABLE AS $mr72$
WITH c AS (SELECT k.id, k.autor, conceptualizador.metricas_caso(k.id) AS m FROM conceptualizador.caso k
            WHERE EXISTS (SELECT 1 FROM conceptualizador.mensaje u WHERE u.caso_id = k.id AND u.rol = 'usuario'
                            AND (u.created_at AT TIME ZONE 'America/Monterrey')::date BETWEEN p_desde AND p_hasta)),
d AS (SELECT c.autor, ((c.m->>'primera_nota')::timestamptz AT TIME ZONE 'America/Monterrey')::date AS dia, c.m FROM c)
SELECT coalesce(jsonb_agg(jsonb_build_object(
   'dueno', autor, 'dia', dia, 'casos', n, 'con_borrador', con_br, 'minutos_a_borrador_mediana', med,
   'toques', toq, 'clics', cl, 'sin_clic_voz', sc, 'en_tarjeta_voz', et, 'aprobadas_con_clic', acl,
   'texto_aplicalo', ta, 'texto_aplicalo_aplicadas', taa,
   'afirmaciones', af, 'sostenidas', so, 'no_sostenidas', ns, 'sin_monto', sm, 'versiones', ve, 'reintentos_odoo', ro) ORDER BY dia, autor), '[]'::jsonb)
FROM (SELECT autor, dia, count(*) n, count(m->'primer_borrador') FILTER (WHERE m->>'primer_borrador' IS NOT NULL) con_br,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY (m->>'minutos_a_borrador')::numeric) med,
             sum((m->'toques'->>'total')::int) toq, sum((m->'toques'->>'clics')::int) cl,
             sum((m->'decisiones'->>'sin_clic_voz')::int) sc, sum((m->'decisiones'->>'en_tarjeta_voz')::int) et,
             sum((m->'decisiones'->>'aprobadas_con_clic')::int) acl, sum((m->'decisiones'->>'texto_aplicalo')::int) ta,
             sum((m->'decisiones'->>'texto_aplicalo_aplicadas')::int) taa,
             sum((m->'afirmaciones'->>'total')::int) af, sum((m->'afirmaciones'->>'sostenidas')::int) so,
             sum((m->'afirmaciones'->>'no_sostenidas')::int) ns, sum((m->'afirmaciones'->>'sin_monto')::int) sm,
             sum((m->'versiones'->>'total')::int) ve, sum((m->'reintentos_odoo'->>'total')::int) ro
        FROM d GROUP BY autor, dia) t
$mr72$;
ALTER FUNCTION conceptualizador.metricas_resumen(date, date) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.metricas_resumen(date, date) FROM PUBLIC;

-- ── hilo(): la llave `metricas` solo con el interruptor del caso prendido; lo demás, igual ─────────────────
DO $ren72h$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'hilo_0072prev') THEN
    ALTER FUNCTION conceptualizador.hilo(uuid) RENAME TO hilo_0072prev;
  END IF;
END
$ren72h$;
CREATE OR REPLACE FUNCTION conceptualizador.hilo(p_caso uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $hilo72$
  SELECT CASE WHEN s.h IS NULL OR jsonb_typeof(s.h) <> 'object' OR NOT conceptualizador.prendido_caso('metricas_caso_v164', p_caso) THEN s.h
         ELSE s.h || jsonb_build_object('metricas', conceptualizador.metricas_caso(p_caso)) END
    FROM (SELECT conceptualizador.hilo_0072prev(p_caso) AS h) s
$hilo72$;
DO $gr72$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conceptualizador_app') THEN
    GRANT EXECUTE ON FUNCTION conceptualizador.hilo(uuid), conceptualizador.hilo_0072prev(uuid), conceptualizador.metricas_caso(uuid) TO conceptualizador_app;
  END IF;
END
$gr72$;
