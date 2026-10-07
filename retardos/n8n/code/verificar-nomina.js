/* retardos/verificar · Code - Nomina a payload (#334)
 * Lee lo que Nómina · Incidencias ya tiene registrado (Data Table del módulo) y arma
 * nom: [{employee_id, desde, hasta, fuente}] para retardos.verificar().
 * Si la forma de la tabla no trae una suspensión reconocible, la lista sale vacía y
 * verificar() ALERTA ("no aparece en Nómina"): el error cae del lado ruidoso, nunca
 * del lado de dar por aplicada una suspensión que no se registró.
 */
var filas = $input.all(), nom = [];
function fecha(x) { return typeof x === 'string' && x.length >= 10 ? x.slice(0, 10) : null; }
for (var i = 0; i < filas.length; i++) {
  var r = filas[i].json || {};
  if (!/suspens/i.test(String(r.tipo || ''))) continue;
  if (r.vigente === false || r.vigente === 'false') continue;
  var v = r.valores;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
  v = v || {};
  var d = fecha(v.desde || v.fecha_inicio || v.inicio), h = fecha(v.hasta || v.fecha_fin || v.fin || d);
  var eid = Number(r.empleado_id);
  if (!eid || !d) continue;
  nom.push({ employee_id: eid, desde: d, hasta: h || d, fuente: 'nomina_incidencias:' + (r.clave || r.id) });
}
return [{ json: { nom: nom, filas_leidas: filas.length } }];
