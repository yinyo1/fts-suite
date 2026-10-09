/* asistencia/eventos · Code - Payload: empresa de cada proyecto (leída de Odoo, no del cliente). */
function m2oId(v) { if (!v) return null; if (Array.isArray(v)) return v[0] || null; if (typeof v === 'object') return v.id || null; return Number(v) || null; }
var cia = {};
$('Odoo - proyectos').all().forEach(function (it) { var p = it.json || {}; if (p.id) cia[p.id] = m2oId(p.company_id); });
var filas = $('Code - Validar').first().json.filas.map(function (f) {
  return { attendance_id: f.attendance_id, so_id: f.so_id, so_company_id: f.so_id ? (cia[f.so_id] || null) : null };
});
return [{ json: { payload: { filas: filas }, cia: cia } }];
