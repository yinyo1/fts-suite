// node docs/n8n-workflows/kiosk-pin-servidor/prueba-alarma.js
'use strict';
const { evaluarKiosko } = require('./alarma');
let p = 0, f = 0; const ok = (n, c, i) => { if (c) { p++; console.log('  ✓', n); } else { f++; console.log('  ✗', n, i || ''); } };
// Días reales de hr.attendance por create_date UTC (medidos el 11-nov): hábiles 24–31.
const base = { '2026-10-14': 27, '2026-10-21': 26, '2026-10-28': 29, '2026-11-04': 26 };
let r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 25 }, base), metricas: {}, dia: '2026-11-11' });
ok('día normal (25 vs 27): sin alarma', r.alarmas.length === 0, r.alarmas);
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 9 }, base), metricas: {}, dia: '2026-11-11' });
ok('caída (9 vs 27): alarma de checadas', r.alarmas.length === 1 && /Cayeron/.test(r.alarmas[0]));
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 0 }, base), metricas: {}, dia: '2026-11-11' });
ok('cero checadas un miércoles: alarma', r.alarmas.length === 1);
r = evaluarKiosko({ checadas: { '2026-11-08': 0, '2026-11-01': 2, '2026-10-25': 1 }, metricas: {}, dia: '2026-11-08' });
ok('domingo con 0: sin alarma', r.alarmas.length === 0);
const met = { '2026-11-10': { malo: 2 }, '2026-11-09': { malo: 1 } };
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 26 }, base), metricas: Object.assign({ '2026-11-11': { malo: 3, ok: 40 } }, met), dia: '2026-11-11' });
ok('3 PIN malos: sin alarma', r.alarmas.length === 0, r.alarmas);
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 26 }, base), metricas: Object.assign({ '2026-11-11': { malo: 25, bloqueado: 6 } }, met), dia: '2026-11-11' });
ok('31 rechazos: alarma de rechazos', r.alarmas.some(a => /Rechazos de PIN/.test(a)));
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 26 }, base), metricas: { '2026-11-11': { malo: 4, bloqueado: 3 } }, dia: '2026-11-11' });
ok('3 bloqueados sin pico: aviso a RH', r.alarmas.length === 1 && /bloqueados/.test(r.alarmas[0]));
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 26 }, base), metricas: { '2026-11-11': { error: 2 } }, dia: '2026-11-11' });
ok('PIN_ERROR_SERVIDOR: alarma', r.alarmas.some(a => /no pudo verificar/.test(a)));
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 26 }, base), metricas: { '2026-11-11': { sin_pin: 4 } }, dia: '2026-11-11', modo: 'estricto' });
ok('estricto + sin_pin: kiosko viejo', r.alarmas.some(a => /versión vieja/.test(a)));
r = evaluarKiosko({ checadas: Object.assign({ '2026-11-11': 26 }, base), metricas: { '2026-11-11': { sin_pin: 4 } }, dia: '2026-11-11', modo: 'tolerante' });
ok('tolerante + sin_pin: sin alarma (es la transición)', r.alarmas.length === 0);
console.log(`\n${p} pasan, ${f} fallan`); process.exit(f ? 1 : 0);
