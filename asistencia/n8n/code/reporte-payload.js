/* rh/dias-mx-usa · Code - Payload: sólo empleados de FTS MX (empresa 1). El filtro es por
 * empresa, nunca por id (CLAUDE.md §9: hr.employee 81 no es de FTS). */
function m2oId(v) { if (!v) return null; if (Array.isArray(v)) return v[0] || null; if (typeof v === 'object') return v.id || null; return Number(v) || null; }
var emps = {};
$('Odoo - empleados').all().forEach(function (it) { var e = it.json || {}; if (e.id) emps[e.id] = e.name || ('Empleado ' + e.id); });
var cia = {};
$('Odoo - proyectos').all().forEach(function (it) { var p = it.json || {}; if (p.id) cia[p.id] = m2oId(p.company_id); });
var atts = $('Odoo - asistencias').all().map(function (i) { return i.json; })
  .filter(function (a) { return a && a.id && emps[m2oId(a.employee_id)]; });
var filas = atts.map(function (a) { var so = m2oId(a.x_studio_project_id); return { attendance_id: a.id, so_id: so, so_company_id: so ? (cia[so] || null) : null }; });
return [{ json: { payload: { filas: filas }, n: atts.length } }];
