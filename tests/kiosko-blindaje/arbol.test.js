// tests/kiosko-blindaje/arbol.test.js
//
// Árbol de falla del caso del empleado 124, medido con el simulador: se quita UNA pieza a la
// vez y se vuelve a correr la semana. Una pieza es "de corte" si, quitada sola,
// no hay traslape ni bloqueo.
//
// Run: node tests/kiosko-blindaje/arbol.test.js

'use strict';

const { Sistema, disenoActual, cst } = require('./sistema');
const { Monitor } = require('./monitor');
const { caso124Hoy, EMP } = require('./escenarios');

const T = (d, h, m, s) => cst(2026, 9, d, h, m, s || 0);
const base = caso124Hoy();
const pasosDesde = (i) => base.slice(i);
const cola = [   // de la salida del viernes en adelante, igual para todas las variantes
  { tipo: 'accion', emp: EMP, t: T(18, 17, 9, 14), boton: 'salida', alt: 'resolver', desc: 'Vie 17:09 salida' },
  { tipo: 'accion', emp: EMP, t: T(21, 6, 47, 40), boton: 'entrada', alt: 'resolver', desc: 'Lun 06:47 entrada' },
  { tipo: 'accion', emp: EMP, t: T(21, 17, 7), boton: 'salida', desc: 'Lun 17:07 salida' },
  { tipo: 'accion', emp: EMP, t: T(22, 7, 15), boton: 'entrada', alt: 'resolver', desc: 'Mar 07:15 entrada' },
  { tipo: 'bloqueo?', emp: EMP, t: T(22, 10, 22) }
];

const VARIANTES = [
  { id: 'P0', pieza: '(ninguna: lo que pasó)', diseno: {}, pasos: () => base },
  { id: 'P1', pieza: 'La salida del jueves 17:22 no llegó al servidor', diseno: {},
    pasos: () => [base[0], base[2], base[3],
      { tipo: 'accion', emp: EMP, t: T(18, 7, 30, 5), boton: 'entrada', alt: 'resolver', desc: 'Vie 07:30 entrada' }].concat(cola) },
  { id: 'P2', pieza: '"Buscar pendientes" falla abierto (ECONNRESET y continueRegularOutput)', diseno: {},
    pasos: () => [base[0], base[1], base[2], base[4]].concat(cola) },
  { id: 'P3', pieza: 'El kiosko pinta éxito cuando falla (el empleado 124 se fue creyendo que entró)', diseno: { B1: true },
    pasos: () => base.slice(0, 5).concat([
      { tipo: 'accion', emp: EMP, t: T(18, 7, 33), boton: 'resolver', desc: 'Vie 07:33 ve el error y reintenta' }]).concat(cola) },
  { id: 'P4', pieza: 'Para declarar la hora real hay que cerrar y reabrir (auto-rescate con hora del clic)', diseno: { B5: true },
    pasos: () => base.slice(0, 5).concat([
      { tipo: 'accion', emp: EMP, t: T(18, 10, 27, 49), boton: 'resolver', args: { hora_real: T(18, 7, 30) }, desc: 'Vie 10:27 Resolver con hora real 07:30' },
      { tipo: 'rh', op: 'resolver', inc: '@olvido_entrada', accion: 'ajustar', hhmm: '07:30', t: T(18, 11, 46), desc: 'RH ajusta 07:30' }]).concat(cola) },
  { id: 'P5', pieza: 'resolver mueve el check_in sin mirar registros vecinos', diseno: { B3: true },
    pasos: () => base.slice(0, 10).concat(cola) },
  { id: 'P6', pieza: 'Odoo no valida un registro abierto contra los posteriores', diseno: {}, odooAdelante: true,
    pasos: () => base.slice(0, 10).concat(cola) },
  { id: 'P7', pieza: 'Nadie en la suite tiene una salida (ni empleado, ni RH)', diseno: { B7: true, B8: true },
    pasos: () => base.slice(0, 10).concat(cola) }
];

console.log('\n=== Árbol de falla: quitar una pieza a la vez ===');
const filas = [];
for (const v of VARIANTES) {
  const sim = new Sistema(Object.assign(disenoActual(), v.diseno));
  if (v.odooAdelante) sim.odoo.validaAdelante = true;
  const m = new Monitor(sim, [EMP]).correr(v.pasos());
  const traslape = m.violaciones.some(x => x.inv === 'I1');
  const i4 = m.violaciones.filter(x => x.inv === 'I4');
  const fallidosDespues = m.pasos.filter(x => x.res && x.res.pantalla && !x.res.logrado && x.p.t >= T(18, 17, 0)).length;
  const bloqueado = fallidosDespues > 0 || i4.length > 0;
  filas.push({ v, traslape, bloqueado, fallidosDespues, i4 });
  console.log('  ' + v.id + '  ' + (traslape ? 'traslape SÍ' : 'traslape no') + ' · ' +
    (bloqueado ? 'bloqueado SÍ (' + fallidosDespues + ' intentos fallidos desde el vie 17:00' + (i4.length ? ', ' + i4.map(x => 'I4:' + x.quien).join(' ') : '') + ')' : 'bloqueado no') +
    '  ← ' + v.pieza);
}
const ok = filas[0].traslape && filas[0].bloqueado && filas.slice(1, 7).every(f => !f.traslape && !f.bloqueado);
console.log('\n  ' + (ok ? '✓' : '✗') + ' Cada pieza P1..P6, quitada sola, evita el bloqueo; P7 no evita el traslape pero da salida');
module.exports = { filas };
if (require.main === module) process.exit(ok ? 0 : 1);
