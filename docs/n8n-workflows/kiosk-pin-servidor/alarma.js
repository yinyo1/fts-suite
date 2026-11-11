// Alarma del kiosko para el correo diario (fts-suite#486).
// Función pura: se pega en un nodo Code del workflow que arma el correo diario.
// Entradas (las consigue ese workflow):
//   checadas: { 'AAAA-MM-DD': n }  hr.attendance creadas por día CST (create_date − 6 h),
//             al menos las últimas 5 semanas. Excluir empleados ZZ.
//   metricas: respuesta.pin_metricas de POST /webhook/kiosk/checkin {empleado_id:1, tipo:'metricas_pin'}
//   dia:      'AAAA-MM-DD' (CST) que se evalúa — normalmente AYER.
// Salida: { alarmas: [texto], resumen: {...} }. Si alarmas está vacío, no se dice nada.
'use strict';
function evaluarKiosko({ checadas, metricas, dia, modo }) {
  checadas = checadas || {}; metricas = metricas || {};
  const alarmas = [];
  const dow = d => new Date(d + 'T12:00:00Z').getUTCDay();          // 0 dom … 6 sáb
  const menos = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') - n * 86400000).toISOString().slice(0, 10);

  // 1 · Checadas del día contra el mismo día de la semana de las 4 semanas anteriores.
  const previos = [1, 2, 3, 4].map(k => checadas[menos(dia, 7 * k)]).filter(n => typeof n === 'number');
  const prom = previos.length ? previos.reduce((a, b) => a + b, 0) / previos.length : null;
  const hoyN = checadas[dia] || 0;
  const habil = dow(dia) >= 1 && dow(dia) <= 5;
  if (habil && prom !== null && prom >= 5 && hoyN < 0.6 * prom) {
    alarmas.push(`Checadas del ${dia}: ${hoyN}, contra un promedio de ${prom.toFixed(1)} los mismos días de las 4 semanas anteriores (${previos.join(', ')}). Cayeron más de 40 %: revisar el kiosko.`);
  }

  // 2 · Rechazos de PIN del día contra los 7 días anteriores.
  const m = metricas[dia] || {};
  const rech = (m.malo || 0) + (m.bloqueado || 0);
  const prev7 = [1, 2, 3, 4, 5, 6, 7].map(k => metricas[menos(dia, k)]).filter(Boolean).map(x => (x.malo || 0) + (x.bloqueado || 0));
  const prom7 = prev7.length ? prev7.reduce((a, b) => a + b, 0) / prev7.length : 0;
  if (rech >= Math.max(10, 3 * prom7)) {
    alarmas.push(`Rechazos de PIN del ${dia}: ${rech} (${m.malo || 0} incorrectos, ${m.bloqueado || 0} bloqueados), contra ${prom7.toFixed(1)} diarios la semana anterior. Puede ser alguien probando PINs.`);
  }
  if ((m.bloqueado || 0) >= 3 && rech < Math.max(10, 3 * prom7)) {
    alarmas.push(`${m.bloqueado} intentos bloqueados el ${dia}. Si fue un técnico, que RH le confirme su PIN.`);
  }
  if ((m.error || 0) > 0) alarmas.push(`El servidor no pudo verificar el PIN ${m.error} veces el ${dia} (PIN_ERROR_SERVIDOR): revisar kiosk/checkin.`);
  if ((m.sin_pin_odoo || 0) > 0) alarmas.push(`${m.sin_pin_odoo} intentos de empleados sin PIN en Odoo el ${dia}: RH tiene que darles PIN.`);
  // 3 · Kioskos viejos: en estricto, cualquier checada sin PIN es un kiosko que no se actualizó.
  if (modo === 'estricto' && (m.sin_pin || 0) > 0) {
    alarmas.push(`${m.sin_pin} checadas sin PIN el ${dia} con el servidor en estricto: hay un kiosko con la versión vieja (se rechazaron).`);
  }

  return { alarmas, resumen: { dia, checadas: hoyN, promedio_4sem: prom, pin: m } };
}
if (typeof module !== 'undefined') module.exports = { evaluarKiosko };
