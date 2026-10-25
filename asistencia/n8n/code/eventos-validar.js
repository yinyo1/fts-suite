/* asistencia/eventos · Code - Validar (#396 fase a)
 * Body: { filas:[{attendance_id, so_id}] } desde Confirmar Horas. Sólo lectura. */
var b = $input.first().json.body || {};
var filas = Array.isArray(b.filas) ? b.filas : [];
var limpias = [];
for (var i = 0; i < filas.length && limpias.length < 1000; i++) {
  var f = filas[i] || {};
  var id = parseInt(f.attendance_id, 10);
  if (!(id > 0)) continue;
  var so = parseInt(f.so_id, 10);
  limpias.push({ attendance_id: id, so_id: so > 0 ? so : null });
}
if (!limpias.length) return [{ json: { _error: true, codigo: 'SIN_FILAS', mensaje: 'Manda filas:[{attendance_id, so_id}]' } }];
var proj = [];
limpias.forEach(function (f) { if (f.so_id && proj.indexOf(f.so_id) < 0) proj.push(f.so_id); });
return [{ json: { filas: limpias, proj_ids: proj.length ? proj : [0] } }];
