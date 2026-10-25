// #396 fase a · evento de ENTRADA para Postgres (asistencia.evento). Rama lateral: está MÁS ABAJO en
// el lienzo que la rama principal, y con executionOrder v1 corre después de "Respond OK", así que
// nunca retrasa ni cambia la respuesta al kiosko. Lo que manda el kiosko desde #395 (geo_zona,
// tz_evento, utc_offset_min) se lee del body; lo validado, de Preparar parámetros.
try {
  var b = $('Webhook').first().json.body || {};
  var p = $('Code - Preparar parámetros').first().json || {};
  var odoo = $('Odoo - CREATE Entrada').first().json || {};
  var att = parseInt(odoo.id, 10);
  var off = parseInt(b.utc_offset_min, 10);
  return [{ json: { payload: att > 0 ? {
    momento: 'entrada', attendance_id: att, employee_id: p.empleado_id,
    check_in_utc: String(p.fechaOdoo || '').replace(' ', 'T') + 'Z',
    geo_zona: b.geo_zona || null, tz_evento: b.tz_evento || null, utc_offset_min: isNaN(off) ? null : off,
    geo_regla: b.geo_regla || null, geo_status: p.geo_status || null, geo_motivo: p.geo_motivo || null,
    plan_id: b.plan_id || null } : {} } }];
} catch (e) {
  return [{ json: { payload: {}, error_armado: String((e && e.message) || e).slice(0, 200) } }];
}
