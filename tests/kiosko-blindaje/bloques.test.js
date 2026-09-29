// tests/kiosko-blindaje/bloques.test.js
//
// Una prueba de aceptación por bloque. Cada una corre su escenario (escenarios.js,
// POR_BLOQUE) y exige que la invariante del bloque no se viole.
//
//   - Bloque con construido:false (bloques.json): la prueba corre contra el diseño de
//     HOY y DEBE fallar. Se reporta como PENDIENTE; si pasara, es sospechoso (el
//     escenario ya no demuestra nada) y se reporta como tal.
//   - Bloque con construido:true: corre con el bloque (y lo que requiere) encendido y
//     DEBE pasar. Si falla, es REGRESIÓN y la corrida sale con código 1.
//   - Con --diseno=nuevo se encienden todos los bloques: todas deben pasar. Es la
//     prueba de que el diseño completo cumple.
//   - Con --bloque=B3 además se demuestra el bloque solo: falla sin él, pasa con él.
//
// Run: node tests/kiosko-blindaje/bloques.test.js [--diseno=nuevo] [--bloque=Bn]

'use strict';

const { Sistema, disenoActual, BLOQUES } = require('./sistema');
const { Monitor } = require('./monitor');
const { POR_BLOQUE } = require('./escenarios');
const cfg = require('./bloques.json');

function violaciones(b, diseno) {
  const esc = POR_BLOQUE[b];
  const m = new Monitor(new Sistema(diseno), [1, 2, 124]).correr(esc.pasos(diseno));
  return m.violaciones.filter(v => esc.inv.some(x => {
    const [inv, quien] = x.split(':');
    return v.inv === inv && (!quien || v.quien === quien);
  }));
}
function con(bloques) { const d = disenoActual(); bloques.forEach(b => { d[b] = true; (cfg[b].requiere || []).forEach(r => { d[r] = true; }); }); return d; }

const todoNuevo = process.argv.includes('--diseno=nuevo');
const soloArg = (process.argv.find(a => a.startsWith('--bloque=')) || '').split('=')[1];
const construidos = BLOQUES.filter(b => cfg[b].construido);
let pasan = 0, pendientes = 0, regresiones = 0, sospechosos = 0;

console.log('\n=== Aceptación por bloque (' + (todoNuevo ? 'diseño nuevo completo' : 'construidos: ' + (construidos.join(', ') || 'ninguno')) + ') ===');
for (const b of BLOQUES) {
  if (soloArg && b !== soloArg) continue;
  const esc = POR_BLOQUE[b];
  const activo = todoNuevo || cfg[b].construido;
  const diseno = todoNuevo ? con(BLOQUES) : con(construidos);
  const v = violaciones(b, diseno);
  const etiqueta = b + ' ' + esc.titulo + ' [' + esc.inv.join(', ') + ']';
  if (activo) {
    if (v.length === 0) { pasan++; console.log('  ✓ PASA       ' + etiqueta); }
    else { regresiones++; console.log('  ✗ REGRESIÓN  ' + etiqueta + '\n      ' + v.map(x => x.inv + ': ' + x.msg).join('\n      ')); }
  } else {
    if (v.length > 0) { pendientes++; console.log('  · PENDIENTE  ' + etiqueta + '  (falla hoy: ' + v[0].inv + ' ' + v[0].msg + ')'); }
    else { sospechosos++; console.log('  ? SOSPECHOSO ' + etiqueta + '  (no falla sin el bloque: el escenario no demuestra nada)'); }
  }
  if (soloArg) {
    const sin = violaciones(b, disenoActual()).length, conB = violaciones(b, con([b])).length;
    console.log('      solo ' + b + ': sin el bloque ' + sin + ' violaciones, con el bloque ' + conB);
  }
}
console.log('\n' + pasan + ' pasan · ' + pendientes + ' pendientes · ' + regresiones + ' regresiones · ' + sospechosos + ' sospechosos');
module.exports = { pasan, pendientes, regresiones, sospechosos };
if (require.main === module) process.exit(regresiones || sospechosos ? 1 : 0);
