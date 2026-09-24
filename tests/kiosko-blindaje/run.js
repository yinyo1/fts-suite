// tests/kiosko-blindaje/run.js
//
// Corre todo el simulador de blindaje del kiosko.
//   node tests/kiosko-blindaje/run.js              diseño de HOY: reporte de fallas
//   node tests/kiosko-blindaje/run.js --diseno=nuevo  diseño completo: debe quedar en verde
//
// Código de salida 1 solo si: el caso del empleado 124 no se reproduce, un bloque construido
// regresiona, un escenario de bloque dejó de demostrar algo, o (con --diseno=nuevo)
// aparece cualquier violación.

'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const extra = process.argv.slice(2);
let fallo = false;
for (const f of ['caso-124.test.js', 'arbol.test.js', 'bloques.test.js', 'aleatorio.test.js', 'b1/n8nfetch.test.js']) {
  try {
    process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, f)].concat(extra), { encoding: 'utf8' }));
  } catch (e) { process.stdout.write(e.stdout || ''); fallo = true; }
}
process.exit(fallo ? 1 : 0);
