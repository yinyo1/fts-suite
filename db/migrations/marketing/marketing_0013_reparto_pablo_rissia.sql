-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0013_reparto_pablo_rissia.sql · Reparto v3: prospección Pablo, seguimiento Rissia (#421)
--
-- Decisión de Esteban (15-oct-2026): quien prospecta es Pablo (usuario de la suite pablo.bayly).
-- Las 47 conversaciones en Etapa 1 que hoy son de Rissia (27 de leads de Odoo sin contacto y 20 del
-- radar) pasan a Pablo. Las 20 de Etapa 2 se quedan con Rissia. La de dirección no se toca.
--
-- Si la base no encuentra exactamente 47, la migración ABORTA sin cambiar nada.
-- NO encola trabajos: cambia el dueño y deja la traza (evento de reasignación con motivo y un renglón
-- de sistema en el hilo, igual que «Reasignar» en la pantalla). La historia completa se queda.
-- Correrla dos veces no hace nada la segunda. Reversa: dueno = 'rissia.araujo' en las conversaciones
-- con evento de reasignación de este motivo.
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  de text := 'rissia.araujo'; a text := 'pablo.bayly';
  motivo text := 'reparto v3: prospección Pablo, seguimiento Rissia';
  c record; n int;
BEGIN
  SELECT count(*) INTO n FROM marketing.conversacion WHERE NOT demo AND etapa = 1 AND estado = 'curso' AND dueno = de;
  IF n = 0 THEN RETURN; END IF;
  IF n <> 47 THEN RAISE EXCEPTION 'Se esperaban 47 conversaciones de Etapa 1 y hay %', n; END IF;
  FOR c IN SELECT * FROM marketing.conversacion WHERE NOT demo AND etapa = 1 AND estado = 'curso' AND dueno = de ORDER BY created_at LOOP
    UPDATE marketing.conversacion SET dueno = a WHERE id = c.id;
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos)
      VALUES (c.id, 'reasignacion', 'migracion_v3', jsonb_build_object('de', de, 'a', a, 'motivo', motivo, 'etapa', c.etapa));
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      'Reasignada: ' || de || ' → ' || a || ' (' || motivo || '). La historia completa se queda.', jsonb_build_object('conv', 'reasignacion'));
  END LOOP;
END
$mig$;
