-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0005_odoo_ids.sql · Encendido de marketing/odoo-lead (#413)
--
-- ADITIVA y sin estructura nueva: llena los 6 ids de catálogo de Odoo que marketing_0004 dejó
-- en 0 («sin configurar»), con lo que marketing/odoo-lead deja de contestar FALTA_CONFIG_ODOO.
-- Los leyó Esteban en Odoo (modo desarrollador) y están en el comentario del 14-oct del #413:
--
--   ir.model            crm.lead                    351
--   ir.model            res.partner                  74
--   mail.activity.type  Llamada                       2
--   mail.activity.type  Correo                        1
--   mail.activity.type  Visita (creada el 14-oct)    39
--   crm.tag             «Marketing · suite»          2
--
-- Solo escribe donde el valor sigue en '0': si alguien ya lo cambió a mano en marketing.config,
-- no se pisa. Correrla dos veces no hace nada la segunda.
-- Reversa (si hiciera falta apagar la escritura sin tocar n8n): volver a poner '0' en
-- odoo_modelo_crm_lead_id y odoo_modelo_res_partner_id → odoo-lead vuelve a negarse a escribir.
--
-- Sin datos personales: solo ids de catálogo. Reglas de db/README.md (sin llaves dobles ni dólar).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE marketing.config SET valor = v.valor, nota = v.nota
FROM (VALUES
  ('odoo_modelo_crm_lead_id',    '351', 'ir.model.id de crm.lead (leído por Esteban el 14-oct, #413)'),
  ('odoo_modelo_res_partner_id', '74',  'ir.model.id de res.partner (leído por Esteban el 14-oct, #413)'),
  ('odoo_actividad_llamada_id',  '2',   'mail.activity.type.id de Llamada (#413)'),
  ('odoo_actividad_correo_id',   '1',   'mail.activity.type.id de Correo (#413)'),
  ('odoo_actividad_visita_id',   '39',  'mail.activity.type.id de Visita, creado el 14-oct (#413)'),
  ('odoo_tag_origen_id',         '2',   'crm.tag.id de «Marketing · suite» (#413)')
) AS v(clave, valor, nota)
WHERE marketing.config.clave = v.clave AND marketing.config.valor = '0';
