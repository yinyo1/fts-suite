/* asistencia/eventos · Code - Respuesta. Si Postgres no contestó se dice con su nombre:
 * Confirmar Horas sigue funcionando sin zona ni tipo (mitad tolerante). */
var r = $input.first().json || {};
if (r.error || !Array.isArray(r.filas)) {
  return [{ json: { success: false, codigo: 'POSTGRES_NO_RESPONDE', mensaje: 'No se pudo leer zona y tipo de día. Puedes confirmar como siempre; el tipo quedará pendiente.' } }];
}
var cia = $('Code - Payload').first().json.cia || {};
return [{ json: { success: true, filas: r.filas.map(function (f) { return f; }), empresas: cia } }];
