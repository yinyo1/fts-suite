// tests/kiosko-blindaje/caso-124.test.js
//
// Reproduce paso a paso el bloqueo de hr.employee 124 (17 al 23-sep-2026).
//   1. Con el diseño de HOY: debe llegar al bloqueo, con los mismos mensajes de
//      Odoo que devolvió producción.
//   2. Con el diseño nuevo (B1..B10): las mismas intenciones no dejan ni una
//      violación.
//
// Run: node tests/kiosko-blindaje/caso-124.test.js [--narrar]

'use strict';

const { Sistema, disenoActual, disenoNuevo } = require('./sistema');
const { Monitor } = require('./monitor');
const { caso124Hoy, caso124Nuevo, EMP } = require('./escenarios');

const narrar = process.argv.includes('--narrar');
let ok = 0, mal = 0;
function check(cond, desc, extra) {
  if (cond) { ok++; console.log('  ✓ ' + desc); }
  else { mal++; console.log('  ✗ ' + desc + (extra ? '\n      ' + extra : '')); }
}

console.log('\n=== Caso empleado 124 con el diseño de HOY ===');
const simHoy = new Sistema(disenoActual());
simHoy.odoo.forzados = [15549, 15588, 15589];   // los ids reales de Odoo
const hoy = new Monitor(simHoy, [EMP]).correr(caso124Hoy());
if (narrar) console.log(hoy.narrar());
const s = hoy.sim;
const errores = s.odoo.log.filter(x => x.error).map(x => x.error);

// Texto completo de producción con el nombre reemplazado por [EMPLEADO 124]; se compara carácter por carácter.
const MSG_B = "Cannot create new attendance record for [EMPLEADO 124], the employee hasn't checked out since 09/17/2026 06:58:11 AM";
const MSG_C = 'Cannot create new attendance record for [EMPLEADO 124], the employee was already checked in on 09/18/2026 10:27:49 AM';
check(errores.includes(MSG_B),
  'Vie 07:30: Odoo rechaza el CREATE con "hasn\'t checked out since 09/17/2026 06:58:11 AM" (igual que exec 104284)');
check(errores.includes(MSG_C),
  'Vie 17:09 en adelante: Odoo rechaza el cierre con "already checked in on 09/18/2026 10:27:49 AM" (igual que exec 105451)');

const regs = s.odoo.del(EMP).sort((a, b) => a.check_in - b.check_in);
const micro = regs.find(r => r.check_out != null && r.check_out - r.check_in < 60 * 1000);
const envolvente = regs.find(r => r.check_out == null);
check(!!micro && !!envolvente && envolvente.check_in < micro.check_in && envolvente.id === 15589 && micro.id === 15588,
  'Queda 15589 abierto envolviendo al micro registro 15588 de 38 s');

const pasosFallidos = hoy.pasos.filter(x => x.res && x.res.pantalla && !x.res.logrado);
check(pasosFallidos.length >= 5 && pasosFallidos.every(x => x.res.pantalla === 'exito'),
  'Cada intento fallido se mostró como éxito (' + pasosFallidos.length + ' intentos)');

const r = hoy.resumen();
check(r.I1 >= 1, 'I1 violada: traslape (' + (r.I1 || 0) + ')');
check(r.I2 >= 1, 'I2 violada: pantalla de éxito sin escritura (' + (r.I2 || 0) + ')');
check(r.I3 >= 1, 'I3 violada: fallas invisibles, sin bitácora ni alerta (' + (r.I3 || 0) + ')');
check(r.I5 >= 1, 'I5 violada: CREATE después de una lectura fallida (' + (r.I5 || 0) + ')');
check(r.I6 >= 1, 'I6 violada: "aplicada" sin escritura del ajuste de las 17:01 (' + (r.I6 || 0) + ')');
const i4 = hoy.violaciones.filter(v => v.inv === 'I4');
check(i4.some(v => v.quien === 'empleado') && i4.some(v => v.quien === 'rh'),
  'I4 violada: sin salida para el empleado NI para supervisor o RH');
check(r.I9 >= 1, 'I9 violada: el watchdog lo reportaría como ausente');

console.log('\n=== Caso empleado 124 con el diseño nuevo (B1..B10) ===');
const nuevo = new Monitor(new Sistema(disenoNuevo()), [EMP]).correr(caso124Nuevo());
if (narrar) console.log(nuevo.narrar());
check(nuevo.violaciones.length === 0, 'Cero violaciones con el diseño nuevo',
  nuevo.violaciones.map(v => v.inv + ' ' + v.msg).join('\n      '));
const n = nuevo.sim.odoo.del(EMP).sort((a, b) => a.check_in - b.check_in);
check(n.every(x => x.check_out != null) || n.filter(x => x.check_out == null).length === 1,
  'Sin abiertos colgados');
check(!n.some(x => x.check_out != null && x.check_out - x.check_in < 5 * 60 * 1000), 'Sin micro registros');
const fallidosNuevo = nuevo.pasos.filter(x => x.res && x.res.pantalla && !x.res.logrado);
check(fallidosNuevo.every(x => x.res.pantalla === 'error'), 'Toda falla se ve como error (' + fallidosNuevo.length + ')');

console.log('\n' + ok + ' ✓   ' + mal + ' ✗');
module.exports = { ok, mal };
if (require.main === module) process.exit(mal ? 1 : 0);
