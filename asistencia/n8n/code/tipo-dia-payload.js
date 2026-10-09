/* asistencia/tipo-dia · Code - Payload para asistencia.confirmar_tipo, con el cargo LEÍDO de Odoo. */
function m2oId(v) { if (!v) return null; if (Array.isArray(v)) return v[0] || null; if (typeof v === 'object') return v.id || null; return Number(v) || null; }
var v = $('Code - Validar').first().json;
var a = ($('Odoo - READ asistencia').all().map(function (i) { return i.json; }).filter(function (x) { return x && x.id === v.attendance_id; }))[0] || null;
if (!a) return [{ json: { _error: true, codigo: 'ASISTENCIA_NO_EXISTE', mensaje: 'No existe la asistencia ' + v.attendance_id + ' en Odoo' } }];
var cia = {};
$('Odoo - proyectos').all().forEach(function (it) { var p = it.json || {}; if (p.id) cia[p.id] = m2oId(p.company_id); });
var so = m2oId(a.x_studio_project_id), cta = m2oId(a.x_studio_many2one_field_GUbBF);
var ci = a.check_in ? String(a.check_in).replace(' ', 'T') + 'Z' : null;
return [{ json: { payload: {
  attendance_id: a.id, employee_id: m2oId(a.employee_id), check_in_utc: ci,
  tipo_dia: v.tipo_dia, actor: v.actor, es_viaje: v.es_viaje,
  so_id: so, so_company_id: so ? (cia[so] || null) : null, cuenta_id: cta,
  recobro_usa: v.recobro_usa, so_original_id: v.so_original_id,
  so_original_company_id: v.so_original_id ? (cia[v.so_original_id] || null) : null,
  motivo: v.motivo || null } } }];
