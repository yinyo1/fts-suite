/* asistencia/vigia-cuadre · Code - Payload: TODAS las asistencias de Odoo de la ventana, con su día CST. */
var v = $('Code - Ventana').first().json;
var odoo = $('Odoo - asistencias').all().map(function (i) { return i.json; }).filter(function (a) { return a && a.id; })
  .map(function (a) { var d = new Date(String(a.check_in).replace(' ', 'T') + 'Z'); return { id: a.id, fecha: new Date(d.getTime() - 6 * 3600e3).toISOString().slice(0, 10) }; });
return [{ json: { payload: { desde: v.desde, hasta: v.hasta, odoo: odoo } } }];
