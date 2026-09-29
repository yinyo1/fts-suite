// tests/kiosko-blindaje/aleatorio.test.js
//
// Prueba de secuencias aleatorias contra las invariantes (invariantes.js).
//   - Diseño de HOY (default): se esperan violaciones. Se reporta, por invariante,
//     cuántas semillas la rompen y el contraejemplo MÍNIMO (reducido evento a evento).
//     Sale con código 0: es un reporte, no una compuerta.
//   - --diseno=nuevo: todos los bloques encendidos. Cualquier violación es un hueco
//     del diseño y sale con código 1.
//
// Run: node tests/kiosko-blindaje/aleatorio.test.js [--diseno=nuevo] [--semillas=200] [--sin-reducir]

'use strict';

const { disenoActual, disenoNuevo, fmtCst } = require('./sistema');
const { INVARIANTES } = require('./invariantes');
const { generar, ejecutar, reducir, firma } = require('./aleatorio');

const nuevo = process.argv.includes('--diseno=nuevo');
const N = Number((process.argv.find(a => a.startsWith('--semillas=')) || '=200').split('=')[1]);
const sinReducir = process.argv.includes('--sin-reducir');
const diseno = nuevo ? disenoNuevo() : disenoActual();
const EMPS = [1];

const porFirma = {};
for (let s = 1; s <= N; s++) {
  const esc = generar(s, EMPS);
  const m = ejecutar(diseno, esc, EMPS);
  const vistas = new Set(m.violaciones.map(firma));
  for (const f of vistas) {
    if (!porFirma[f]) porFirma[f] = { semillas: [], ejemplo: null };
    porFirma[f].semillas.push(s);
    if (!porFirma[f].ejemplo) porFirma[f].ejemplo = { s, esc };
  }
}

console.log('\n=== Secuencias aleatorias · diseño ' + (nuevo ? 'NUEVO (B1..B10)' : 'de HOY') + ' · ' + N + ' semanas ===');
const firmas = Object.keys(porFirma).sort();
if (!firmas.length) console.log('  ✓ ninguna invariante violada');
for (const f of firmas) {
  const x = porFirma[f];
  console.log('\n  ✗ ' + f + ' · ' + INVARIANTES[f.split(':')[0]] + '\n    rota en ' + x.semillas.length + ' de ' + N + ' semanas (ej. semilla ' + x.ejemplo.s + ')');
  if (sinReducir) continue;
  const min = reducir(diseno, x.ejemplo.esc, EMPS, f);
  const m = ejecutar(diseno, min, EMPS);
  console.log('    contraejemplo mínimo (' + min.ev.length + ' eventos):');
  min.ev.forEach(e => console.log('      · ' + fmtCst(e.t) + ' ' + describir(e)));
  const v = m.violaciones.find(y => firma(y) === f);
  console.log('    → ' + v.inv + ': ' + v.msg);
}

function describir(e) {
  if (e.tipo === 'falla') return 'FALLA ' + JSON.stringify(e.fallas);
  if (e.tipo === 'entrar') return 'quiere ENTRAR (llegó ' + fmtCst(e.real).slice(11, 16) + (e.amPm ? ', confunde AM/PM' : '') + ')';
  if (e.tipo === 'salir') return 'quiere SALIR';
  if (e.tipo === 'rh') return 'RH resuelve pendientes con la hora real';
  if (e.tipo === 'watchdog') return 'corre el watchdog';
  if (e.tipo === 'bloqueo?') return '¿tiene salida desde la suite?';
  return e.tipo;
}

const huecos = nuevo ? firmas.length : 0;
module.exports = { porFirma };
if (require.main === module) process.exit(huecos ? 1 : 0);
