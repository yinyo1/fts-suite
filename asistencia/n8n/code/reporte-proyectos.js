/* rh/dias-mx-usa · Code - Ids proyecto de las asistencias de la semana. */
function m2oId(v) { if (!v) return null; if (Array.isArray(v)) return v[0] || null; if (typeof v === 'object') return v.id || null; return Number(v) || null; }
var ids = [];
$('Odoo - asistencias').all().forEach(function (it) { var p = m2oId((it.json || {}).x_studio_project_id); if (p && ids.indexOf(p) < 0) ids.push(p); });
return [{ json: { proj_ids: ids.length ? ids : [0] } }];
