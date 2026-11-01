// Mini arnés de pruebas de Nómina USA (#448): check(nombre, condición, detalle) y fin().
'use strict';
let pass = 0; const fails = [];
function check(n, c, d) {
  if (c) { pass++; console.log('  ✓ ' + n); return true; }
  fails.push(n + (d !== undefined ? ' → ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''));
  console.log('  ✗ ' + n + (d !== undefined ? ' → ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''));
  return false;
}
function seccion(t) { console.log('\n▶ ' + t); }
function fin() {
  console.log('\n' + pass + ' pasan, ' + fails.length + ' fallan');
  if (fails.length) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
}
module.exports = { check, seccion, fin };
