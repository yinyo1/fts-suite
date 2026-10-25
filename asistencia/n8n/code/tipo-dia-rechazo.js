/* asistencia/tipo-dia · Code - Rechazo: validación, regla de negocio (VIAJE_SIN_CARGO,
 * EMPRESA_INCOHERENTE, RECOBRO_INVALIDO) o Postgres caído. Todo con success:false y su código. */
var j = $input.first().json || {};
var r = j.r || {};
if (j._error) return [{ json: { success: false, regla: false, codigo: j.codigo, mensaje: j.mensaje } }];
if (j.error) return [{ json: { success: false, regla: false, codigo: 'POSTGRES_NO_RESPONDE', mensaje: 'No se pudo guardar el tipo de día.' } }];
return [{ json: { success: false, regla: true, codigo: r.codigo || 'RECHAZO', mensaje: r.mensaje || 'No se pudo guardar el tipo de día.' } }];
