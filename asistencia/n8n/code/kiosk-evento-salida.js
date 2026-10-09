// #396 fase a · evento de SALIDA para Postgres. Misma regla que la entrada: rama lateral, abajo en
// el lienzo, corre después de "Respond OK". Al cerrar, Postgres calcula el tipo de día propuesto con
// la zona de la entrada y la de la salida (asistencia.registrar_evento).
try {
  var b = $('Webhook').first().json.body || {};
  var p = $('Code - Preparar parámetros').first().json || {};
  var c = $('Code - Analizar candados').first().json || {};
  var att = parseInt(c.attendance_id_pendiente, 10);
  var off = parseInt(b.utc_offset_min, 10);
  var soc = parseInt(b.so_company_id, 10);
  return [{ json: { payload: att > 0 ? {
    momento: 'salida', attendance_id: att, employee_id: p.empleado_id,
    check_out_utc: String(p.fechaOdoo || '').replace(' ', 'T') + 'Z',
    geo_zona: b.geo_zona || null, tz_evento: b.tz_evento || null, utc_offset_min: isNaN(off) ? null : off,
    geo_regla: b.geo_regla || null, geo_status: p.geo_status || null, geo_motivo: p.geo_motivo || null,
    plan_id: b.plan_id || null, so_id: p.so_id || null, so_company_id: soc > 0 ? soc : null,
    cuenta_id: p.cuenta_id || null } : {} } }];
} catch (e) {
  return [{ json: { payload: {}, error_armado: String((e && e.message) || e).slice(0, 200) } }];
}
