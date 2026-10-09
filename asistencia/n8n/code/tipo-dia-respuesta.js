/* asistencia/tipo-dia · Code - Respuesta. La nota del chatter es best-effort: si falla, el tipo YA
 * quedó en Postgres y se dice. */
var r = $('Postgres - Confirmar').first().json.r || {};
var nota = $input.first().json || {};
return [{ json: { success: true, attendance_id: r.attendance_id, tipo_dia: r.tipo_dia, propuesto: r.propuesto,
  anterior: r.anterior, cambio: r.cambio, cambiado_por_felipe: r.cambiado_por_felipe,
  nota_chatter: r.cambio ? (nota.id ? 'escrita' : 'fallo') : 'sin_cambio' } }];
