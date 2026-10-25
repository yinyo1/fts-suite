/* rh/dias-mx-usa · Code - Reporte. La lógica vive en asistencia/lib/dias-mx-usa.js (probada en
 * tests/asistencia) y se inyecta aquí tal cual: el reporte de RH, la página y las pruebas usan
 * la MISMA función. */
var module = { exports: {} };
/*__DIAS__*/
var D = module.exports;
// Autoprueba de la librería copiada al nodo: si algo se corrompió al pegarla, se dice con nombre.
var prueba = D.armarReporte({ semana: 'S43/2026', asistencias: [{ attendance_id: 1, employee_id: 1, check_in: '2026-10-19 11:10:00', check_out: '2026-10-19 23:40:00', worked_hours: 12.5, confirmado: true, so_id: 9, so_company_id: 6, evento: { tipo_dia: 'viaje_usa' } }] });
if (D.tipoPorZonas('sitio:x', 'usa') !== 'viaje_usa' || prueba.personas[0].paga_usa !== 1 || prueba.desde !== '2026-10-16') {
  return [{ json: { success: false, codigo: 'AUTOPRUEBA_LIB', mensaje: 'La lógica del reporte no pasó su autoprueba en n8n.' } }];
}
function m2o(v) { if (!v) return { id: null, nombre: null }; if (Array.isArray(v)) return { id: v[0] || null, nombre: v[1] || null }; if (typeof v === 'object') return { id: v.id || null, nombre: v.name || null }; return { id: Number(v) || null, nombre: null }; }
var pg = $input.first().json || {};
if (pg.error || !Array.isArray(pg.filas)) {
  return [{ json: { success: false, codigo: 'POSTGRES_NO_RESPONDE', mensaje: 'No se pudo leer el tipo de día. El reporte no se arma a medias.' } }];
}
var p0 = $('Code - Puerta').first().json;
var emps = {};
$('Odoo - empleados').all().forEach(function (it) { var e = it.json || {}; if (e.id) emps[e.id] = e.name; });
var cia = {};
$('Odoo - proyectos').all().forEach(function (it) { var p = it.json || {}; if (p.id) cia[p.id] = m2o(p.company_id).id; });
var ev = {};
pg.filas.forEach(function (f) { ev[f.attendance_id] = f; });
var asis = $('Odoo - asistencias').all().map(function (i) { return i.json; })
  .filter(function (a) { return a && a.id && emps[m2o(a.employee_id).id]; })
  .map(function (a) {
    var so = m2o(a.x_studio_project_id), cta = m2o(a.x_studio_many2one_field_GUbBF), e = ev[a.id] || null;
    return { attendance_id: a.id, employee_id: m2o(a.employee_id).id, empleado_nombre: emps[m2o(a.employee_id).id],
      check_in: a.check_in, check_out: a.check_out || null, worked_hours: a.worked_hours || 0,
      confirmado: a.x_studio_manager_approval === true,
      so_id: so.id, so_nombre: so.nombre, so_company_id: so.id ? (cia[so.id] || null) : null,
      cuenta_id: cta.id, cuenta_nombre: cta.nombre, evento: e };
  });
var rep = D.armarReporte({ semana: p0.semana, asistencias: asis });
return [{ json: { success: true, reporte: rep, cuadre: pg.cuadre || {}, leido_por: p0.nombre || p0.actor || null, generado_at: new Date().toISOString() } }];
