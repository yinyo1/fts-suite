-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0012_archivar_prueba_2309.sql · La conversación del lead de prueba 2309 sale del tablero (#421)
--
-- El lead 2309 es de prueba (#413); Esteban lo archiva en Odoo. Aquí su conversación de dirección se
-- marca de prueba (demo) y archivada, igual que su hilo: el tablero, la lista y el mapeo dejan de contarla.
-- Si la base no encuentra exactamente 1, la migración ABORTA sin cambiar nada.
-- No escribe en Odoo ni encola trabajos. Correrla dos veces no hace nada la segunda.
-- Reversa: demo = false, archivada = false en esa conversación y en su sesión.
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE c marketing.conversacion; n int;
BEGIN
  SELECT count(*) INTO n FROM marketing.conversacion WHERE 2309 = ANY (leads) AND NOT demo;
  IF n = 0 THEN RETURN; END IF;
  IF n <> 1 THEN RAISE EXCEPTION 'Se esperaba 1 conversación del lead 2309 y hay %', n; END IF;
  SELECT * INTO c FROM marketing.conversacion WHERE 2309 = ANY (leads) AND NOT demo;
  UPDATE marketing.conversacion SET demo = true, archivada = true WHERE id = c.id;
  UPDATE chat.sesion SET demo = true WHERE id = c.sesion_id;
  INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos)
    VALUES (c.id, 'archivo', 'migracion_v3', jsonb_build_object('motivo', 'lead de prueba 2309 (#413)'));
END
$mig$;
