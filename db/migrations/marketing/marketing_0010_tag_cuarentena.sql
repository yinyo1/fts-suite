-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0010_tag_cuarentena.sql · id de la etiqueta «Cuarentena» de Odoo (Marketing v3, #421)
--
-- crm.tag «Cuarentena» = id 3 (lo leyó Esteban en Odoo; es la única con ese nombre).
-- Misma regla que «Marketing · suite» (id 2): solo leads en Prospecto Lead (stage 17), por la
-- credencial «Odoo Marketing (servicio)»; el lead sigue abierto, con actividad de reactivación a 90 días.
--
-- Esta migración SOLO deja el id en la configuración y pasa a 'pendiente' lo que estuviera esperando
-- el id (estado 'pendiente_config'). NO escribe en Odoo: hoy ningún proceso lee marketing.conv_odoo
-- (el modo de cuarentena de odoo-lead está por construirse, con diff y OK de Esteban).
-- Correrla dos veces no hace nada la segunda. Reversa: valor '0'.
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE marketing.config SET valor = '3', nota = 'crm.tag.id de «Cuarentena» (#421, 15-oct-2026): solo leads en stage 17, por la credencial de servicio de Marketing'
 WHERE clave = 'odoo_tag_cuarentena';

UPDATE marketing.conv_odoo SET estado = 'pendiente', updated_at = now()
 WHERE estado = 'pendiente_config' AND lead_id IS NOT NULL;
