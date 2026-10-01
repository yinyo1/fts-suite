/* retardos/jornada · Code - Nomina a payload (#334, reglas R3)
 * Lee nom_semana_persona (Nómina · Incidencias) y pasa a Postgres SOLO lo que prorratea:
 * por persona y semana, las declaraciones {tipo, valores}. Montos y notas se quedan aquí.
 * Si la tabla no trae nada, la lista sale vacía y la jornada no prorratea por Nómina:
 * cae del lado de mandar a revisión o aviso con plazo de corrección, nunca de inventar días.
 */
var filas = $input.all(), nomina = [];
for (var i = 0; i < filas.length; i++) {
  var r = filas[i].json || {};
  if (!r.semana || !r.empleado_id) continue;
  var d = r.declaraciones;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = []; } }
  if (!Array.isArray(d)) d = [];
  var limpias = [];
  for (var k = 0; k < d.length; k++) {
    var x = d[k] || {};
    var dias = x.valores && x.valores.dias != null ? Number(x.valores.dias) : null;
    limpias.push({ tipo: String(x.tipo || ''), valores: { dias: dias } });
  }
  nomina.push({ employee_id: Number(r.empleado_id), semana: String(r.semana), declaraciones: limpias });
}
return [{ json: { payload: { workflow: 'retardos/jornada', nomina: nomina }, filas_leidas: filas.length } }];
