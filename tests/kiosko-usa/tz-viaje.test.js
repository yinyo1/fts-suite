#!/usr/bin/env node
// Viaje con cambio de zona horaria: ¿las reglas de HOY dan retardo falso o auto-cierre
// indebido? Reproduce las fórmulas tal como están en producción, leídas el 2026-10-08:
//   · kiosk/checkin (a7mEjjdwIzzvomXs) "Code - Preparar parámetros": fechaOdoo = hora del
//     SERVIDOR en UTC (no la del teléfono) → lo guardado ya es UTC.
//   · "Code - Analizar candados": horas = (ahoraUTC - check_inUTC)/3600000; < 6 bloquea,
//     6–16 zona gris, ≥ 16 auto-rescate a 9.6 h.
//   · Retardos v2 (db/migrations/retardos 0007): primera checada del día en
//     America/Monterrey (UTC−6 todo el año), retardo si > hora_entrada + 15:00, al segundo.
//   · kiosk.js confirmarOlvideCheckout: la hora HH:MM tecleada se interpreta como CST.
// No es una prueba de producción: es la aritmética de las reglas, para ver dónde rompe.
//   node tests/kiosko-usa/tz-viaje.test.js
'use strict';

const H = 3600 * 1000;
// Hora local → instante UTC usando la base de zonas del runtime (ICU).
function local(iso, tz){
  const guess = new Date(iso + 'Z');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(guess);
  const g = k => +parts.find(p => p.type === k).value;
  const asLocal = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}
const enCST = d => new Date(d.getTime() - 6 * H).toISOString().slice(0, 16).replace('T', ' ');
// Regla de candados del kiosko (servidor)
function candado(abiertaDesde, ahora){
  const h = (ahora - abiertaDesde) / H;
  return { horas: +h.toFixed(2), accion: h < 6 ? 'YA_TIENES_ENTRADA' : h < 16 ? 'ZONA_GRIS' : 'AUTO_RESCATE' };
}
// Regla de Retardos v2: primera checada en America/Monterrey vs hora_entrada + 15 min, al segundo
function retardo(primeraChecada, horaEntradaHHMM){
  const fechaCST = enCST(primeraChecada).slice(0, 10);
  const limite = local(fechaCST + 'T' + horaEntradaHHMM + ':00', 'America/Monterrey').getTime() + 15 * 60 * 1000;
  return { fecha: fechaCST, hora_cst: enCST(primeraChecada).slice(11), es_retardo: primeraChecada.getTime() > limite };
}
// Olvidé checar salida: HH:MM interpretada como CST (kiosk.js)
function olvideSalidaCST(checkInUTC, hhmm){
  const [hh, mm] = hhmm.split(':').map(Number);
  const ci = new Date(checkInUTC.getTime() - 6 * H); const c = new Date(ci); c.setUTCHours(hh, mm, 0, 0);
  if(c < ci) c.setUTCDate(c.getUTCDate() + 1);
  return new Date(c.getTime() + 6 * H);
}

let ok = 0, mal = 0; const filas = [];
function caso(nombre, real, esperado, nota){
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  bien ? ok++ : mal++;
  filas.push((bien ? '✓ ' : '✗ ') + nombre + ' → ' + JSON.stringify(real) + (nota ? '   (' + nota + ')' : ''));
}

// Lunes 5-oct-2026: Monterrey (CST, UTC−6) y California en horario de verano (PDT, UTC−7).
const entradaMty = local('2026-10-05T07:30:00', 'America/Monterrey');     // 13:30Z
const salidaPA   = local('2026-10-05T17:00:00', 'America/Los_Angeles');   // 00:00Z del 6
caso('A1 entrada 07:30 CST se guarda en UTC', entradaMty.toISOString(), '2026-10-05T13:30:00.000Z');
caso('A2 salida 17:00 PDT se guarda en UTC', salidaPA.toISOString(), '2026-10-06T00:00:00.000Z');
caso('A3 duración entrada MX → salida PT = 10.5 h reales', +((salidaPA - entradaMty) / H).toFixed(2), 10.5);
caso('A4 sin retardo (07:30 CST, hora 07:30)', retardo(entradaMty, '07:30').es_retardo, false);
caso('A5 el día de nómina sigue siendo el 5 (en CST)', enCST(entradaMty).slice(0, 10), '2026-10-05');

// Al día siguiente, en California, a la hora de su cita local.
const entradaPA = local('2026-10-06T07:30:00', 'America/Los_Angeles');   // 14:30Z = 08:30 CST
const r = retardo(entradaPA, '07:30');
caso('B1 entrada 07:30 PDT = 08:30 CST', r.hora_cst, '08:30');
caso('B2 Retardos v2 HOY la cuenta como retardo (FALSO retardo por zona horaria)', r.es_retardo, true, 'solo lo evita la exclusión manual tipo usa de RH');
const entradaPA2 = local('2026-10-06T06:50:00', 'America/Los_Angeles');
caso('B3 aun llegando 06:50 PDT (= 07:50 CST) sería retardo', retardo(entradaPA2, '07:30').es_retardo, true);

// Hacia el este pasa lo contrario: Nueva York (EDT, UTC−4) a las 09:10 = 07:10 CST.
const entradaNY = local('2026-10-06T09:10:00', 'America/New_York');
caso('B4 entrada 09:10 EDT (tarde en su cita local) NO cuenta como retardo', retardo(entradaNY, '07:30').es_retardo, false, 'retardo omitido, también por zona horaria');

// Candados y auto-cierre: todo en UTC → la zona del teléfono no cambia nada.
const olvidoAbierta = entradaMty; // entró en MTY y olvidó salir; vuelve a checar en PA al día siguiente
caso('C2 entrada al día siguiente en PT con abierta de ayer = auto-rescate legítimo (25 h)', candado(olvidoAbierta, entradaPA), { horas: 25, accion: 'AUTO_RESCATE' });
const mismaTardePA = local('2026-10-05T15:00:00', 'America/Los_Angeles');   // 22:00Z = 8.5 h
caso('C3 otra entrada el mismo día en PT: zona gris por horas reales, no por reloj local', candado(entradaMty, mismaTardePA), { horas: 8.5, accion: 'ZONA_GRIS' });

// Olvidé checar salida desde California: la hora tecleada se toma como CST.
const declarada = olvideSalidaCST(entradaMty, '17:00');   // quiso decir 17:00 PDT
caso('D1 "17:00" tecleado en PT se guarda como 17:00 CST = 23:00Z', declarada.toISOString(), '2026-10-05T23:00:00.000Z');
caso('D2 → 1 h menos de lo trabajado (debió ser 00:00Z del 6)', +((salidaPA - declarada) / H).toFixed(2), 1, 'error de la regla de hoy para viajeros');

// Medianoche: salida 23:30 PDT del 5 = 06:30Z del 6 = 00:30 CST del 6.
const salidaNoche = local('2026-10-05T23:30:00', 'America/Los_Angeles');
caso('E1 la salida local del 5 cae el 6 en CST (no rompe: el día lo fija el check_in)', enCST(salidaNoche).slice(0, 10), '2026-10-06');

console.log(filas.join('\n'));
console.log('\n' + ok + ' ✓   ' + mal + ' ✗');
process.exit(mal ? 1 : 0);
