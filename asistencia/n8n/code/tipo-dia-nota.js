/* asistencia/tipo-dia · Code - Nota chatter. Texto propio («Tipo de día»): NO usa las frases que
 * vigilan W3/W4 («Correccion de atribucion», «panel Confirmar Horas», «Horas confirmadas»). */
var r = $input.first().json.r || {};
var p = $('Code - Payload').first().json.payload;
var E = { mexico: 'México', proyecto_usa: 'Proyecto USA', viaje_usa: 'Viaje a USA', viaje_mexico: 'Viaje a México' };
var t = 'Tipo de día: ' + E[r.tipo_dia] + (r.propuesto ? ' (propuesto: ' + E[r.propuesto] + ')' : '') +
  (r.anterior ? '. Antes: ' + E[r.anterior] : '') + '. Lo fijó ' + p.actor + ' al confirmar.';
if (p.recobro_usa) t += ' Cargo a ADMIN DE OPERACIONES (3096) con recobro a FTS USA de la SO original id ' + p.so_original_id + '.';
return [{ json: { r: r, res_id: p.attendance_id, cuerpo: '<p>' + t.replace(/[<>&]/g, '') + '</p>' } }];
