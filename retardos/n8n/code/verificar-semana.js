/* retardos/verificar · Code - Semana a payload (#334, reglas R3)
 * Junta lo de Nómina · Incidencias (suspensiones, nodo anterior) con nom_semana_persona:
 * por persona y semana, sólo el TIPO de cada declaración. verificar() lo usa para saber si
 * un descuento de jornada registrado por RH ya llegó a Nómina. Montos y notas se quedan aquí.
 * Si la tabla no trae nada, nom_semana sale vacía y verificar() ALERTA: el error cae del
 * lado ruidoso, nunca del lado de dar por cargado un descuento que no está.
 */
var base = $('Code - Nomina a payload').first().json || {};
var filas = $input.all(), sem = [];
for (var i = 0; i < filas.length; i++) {
  var r = filas[i].json || {};
  if (!r.semana || !r.empleado_id) continue;
  var d = r.declaraciones;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = []; } }
  if (!Array.isArray(d)) d = [];
  var tipos = [];
  for (var k = 0; k < d.length; k++) tipos.push({ tipo: String((d[k] || {}).tipo || '') });
  sem.push({ employee_id: Number(r.empleado_id), semana: String(r.semana), declaraciones: tipos });
}
return [{ json: { nom: base.nom || [], nom_semana: sem, filas_leidas: base.filas_leidas || 0, semanas_leidas: filas.length } }];
