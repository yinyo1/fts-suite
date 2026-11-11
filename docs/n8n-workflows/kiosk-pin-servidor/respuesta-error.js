// Respuesta de error unificada
const data = $input.first().json;

const response = {
  success: false,
  accion_valida: false,
  codigo_error: data.codigo_error || 'ERROR_DESCONOCIDO',
  mensaje: data.mensaje || 'Error desconocido procesando la solicitud',
  error_msg: data.error_msg || data.mensaje || 'Error desconocido',
  empleado_id: data.empleado_id || null,
  attendance_id_abierto: data.attendance_id_abierto || null,
  horas_transcurridas: data.horas_transcurridas || null,
  // fts-suite#486: PIN verificado en el servidor (nunca trae el PIN)
  pin_verificado: data.pin_verificado === true,
  minutos_bloqueo: data.minutos_bloqueo || null,
  intentos_restantes: (data.intentos_restantes === 0 || data.intentos_restantes) ? data.intentos_restantes : null
};

return [{ json: response }];