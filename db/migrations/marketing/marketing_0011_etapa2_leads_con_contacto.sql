-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0011_etapa2_leads_con_contacto.sql · Leads de Odoo con contacto pasan a Etapa 2 (Marketing v3, #421)
--
-- Decisión de Esteban (opción b con filtro): de las 47 conversaciones que vinieron de leads de Odoo
-- (origen manual, Etapa 1, sin toques), pasan a Etapa 2 · Seguimiento SOLO las que tienen al menos un
-- lead con correo o teléfono de cliente. Las demás se quedan en Etapa 1: ahí falta buscar.
--
-- La lista de leads con contacto sale de la lectura de solo lectura de crm.lead del 15-oct-2026 17:12 UTC
-- (comentario del #421). Se excluye el lead 1465: su único contacto es interno de FTS.
-- Son 20 conversaciones; si la base no encuentra exactamente 20, la migración ABORTA sin cambiar nada.
--
-- NO encola trabajos (ni etapa_cierre ni otro): solo cambia la etapa y deja la traza (evento de etapa,
-- evento de reasignación con motivo y un renglón de sistema en el hilo). El dueño no cambia.
-- Correrla dos veces no hace nada la segunda (solo toma las que siguen en Etapa 1).
-- Reversa: etapa = 1 en las conversaciones con evento 'etapa' de motivo «migración v3, lead previo sin toques».
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  con_contacto int[] := ARRAY[1452,1453,1456,1457,1461,1471,1525,1527,1724,1733,1919,1949,2065,2111,2145,2156,2158,2209,
                              2222,2226,2229,2243,2255,2279,2282,2285,2295,2300];
  motivo text := 'migración v3, lead previo sin toques';
  c record; n int;
BEGIN
  SELECT count(*) INTO n FROM marketing.conversacion
   WHERE NOT demo AND etapa = 1 AND estado = 'curso' AND origen = 'manual' AND leads && con_contacto;
  IF n = 0 THEN RETURN; END IF;
  IF n <> 20 THEN RAISE EXCEPTION 'Se esperaban 20 conversaciones con contacto y hay %', n; END IF;
  FOR c IN SELECT * FROM marketing.conversacion
            WHERE NOT demo AND etapa = 1 AND estado = 'curso' AND origen = 'manual' AND leads && con_contacto ORDER BY created_at LOOP
    UPDATE marketing.conversacion SET etapa = 2 WHERE id = c.id;
    INSERT INTO marketing.conv_evento (conversacion_id, tipo, actor, datos) VALUES
      (c.id, 'reasignacion', 'migracion_v3', jsonb_build_object('de', c.dueno, 'a', c.dueno, 'motivo', motivo, 'etapa', 1)),
      (c.id, 'etapa', 'migracion_v3', jsonb_build_object('de', 1, 'a', 2, 'motivo', motivo));
    INSERT INTO chat.mensaje (sesion_id, rol, autor, texto, datos) VALUES (c.sesion_id, 'sistema', 'sistema',
      'Pasa a Etapa 2 · Seguimiento (' || motivo || '). El lead de Odoo ya trae contacto: cada toque recibe su propuesta al instante.',
      jsonb_build_object('conv', 'etapa'));
  END LOOP;
END
$mig$;
