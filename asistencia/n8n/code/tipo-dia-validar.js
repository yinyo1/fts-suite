/* asistencia/tipo-dia · Code - Validar (#396 fase a)
 * Body: { attendance_id, tipo_dia, supervisor_nombre, es_viaje?, recobro_usa?, so_original_id?, motivo? }
 * El CARGO (SO o centro de costos) y su empresa NO se aceptan del cliente: se leen de Odoo. */
var b = $input.first().json.body || {};
var TIPOS = ['mexico', 'proyecto_usa', 'viaje_usa', 'viaje_mexico'];
var att = parseInt(b.attendance_id, 10);
var tipo = String(b.tipo_dia || '');
var actor = String(b.supervisor_nombre || '').trim().slice(0, 120);
function err(c, m) { return [{ json: { _error: true, codigo: c, mensaje: m } }]; }
if (!(att > 0)) return err('FALTA_ATTENDANCE', 'attendance_id es obligatorio');
if (TIPOS.indexOf(tipo) < 0) return err('TIPO_INVALIDO', 'tipo_dia debe ser mexico, proyecto_usa, viaje_usa o viaje_mexico');
if (!actor) return err('FALTA_ACTOR', 'Falta quién confirma (supervisor_nombre)');
var soo = parseInt(b.so_original_id, 10);
return [{ json: { attendance_id: att, tipo_dia: tipo, actor: actor, es_viaje: b.es_viaje === true,
  recobro_usa: b.recobro_usa === true, so_original_id: soo > 0 ? soo : null, motivo: String(b.motivo || '').slice(0, 500) } }];
