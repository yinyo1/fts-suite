// Puente de pruebas del hilo: arma la solicitud del lunes (raíz) y la del martes encadenada a ella.
const c = require('../../n8n/code/correo.js');
const h = require('../../n8n/code/hilo_solicitud.js');
let n = 7;
const rnd = () => (n = (n * 73 + 41) % 256);
const datos = x => ({ hoy: x.hoy, tipo: 'solicitud', total: 65, mas_antiguo_dias: 689, periodo_reciente: '2026-08',
  faltantes: [], rezago_omitido: 65, rechazos: [], para: 'gerardo@fts.mx', cc: 'estebandelacruz@fts.mx,erick@fts.mx', buzon: 'x/00 Buzon' });
const lunes = c.armar('solicitud', datos({ hoy: '2026-09-28' }), '', Date.UTC(2026, 8, 28, 16, 0, 0), rnd);
const lunesSolo = h.encadenar(lunes, null);
const martesRaw = c.armar('solicitud', datos({ hoy: '2026-09-29' }), '', Date.UTC(2026, 8, 29, 15, 0, 0), rnd);
const martes = h.encadenar(martesRaw, { message_id: lunes.message_id, thread_index: lunes.thread_index, asunto: lunes.asunto },
  Date.UTC(2026, 8, 29, 15, 0, 0), rnd);
const cab = m => m.mime.slice(0, m.mime.indexOf('\r\n\r\n')).split('\r\n');
const cuerpo = m => m.mime.slice(m.mime.indexOf('\r\n\r\n'));
process.stdout.write(JSON.stringify({
  lunes_igual: lunesSolo === lunes, lunes_cab: cab(lunes), martes_cab: cab(martes),
  martes_ti: martes.thread_index, lunes_ti: lunes.thread_index, lunes_mid: lunes.message_id,
  cuerpo_igual: cuerpo(martes) === cuerpo(martesRaw), b64_ok: Buffer.from(martes.mime_b64, 'base64').toString() === martes.mime,
  martes_irt: martes.in_reply_to }));
