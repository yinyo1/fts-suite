/* asistencia/tipo-dia · Code - Ids proyecto: el de la asistencia y, si hay recobro, la SO original. */
function m2oId(v) { if (!v) return null; if (Array.isArray(v)) return v[0] || null; if (typeof v === 'object') return v.id || null; return Number(v) || null; }
var v = $('Code - Validar').first().json;
var a = ($('Odoo - READ asistencia').all().map(function (i) { return i.json; }).filter(function (x) { return x && x.id === v.attendance_id; }))[0] || null;
var ids = [];
if (a && m2oId(a.x_studio_project_id)) ids.push(m2oId(a.x_studio_project_id));
if (v.so_original_id && ids.indexOf(v.so_original_id) < 0) ids.push(v.so_original_id);
return [{ json: { proj_ids: ids.length ? ids : [0], encontrada: !!a } }];
